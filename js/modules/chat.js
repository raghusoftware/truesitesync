/**
 * ═══════════════════════════════════════════════════════════════════════════
 * True Site Sync — Chat module
 * ───────────────────────────────────────────────────────────────────────────
 * Construction-native team chat: project channels + sub-channels + DMs, rich
 * media (photo / video / file / voice / location), threaded replies, pins,
 * @mentions, priority & safety flags, search / filter / sort, read receipts,
 * per-channel notification prefs, one-click "convert to record", and an
 * offline-first outbox that flushes on reconnect.
 *
 * Backend: Supabase (tables in db/chat_schema.sql) with realtime. If those
 * tables are not present yet, the module transparently falls back to a local
 * demo store so the UI is fully reviewable, and shows a one-line setup hint.
 *
 * Inventory/equipment asset tagging is intentionally deferred (schema keeps the
 * `asset_tags` column for a later phase) — see docs/chat-module-spec.md.
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { getSupabase } from '../database/supabase.js';
import { getOrgId } from '../database/sync.js';
import { idbGet, idbSet } from '../database/idbCache.js';
import { state } from './state.js';
import { groupMessages, dayLabel, mediaGridClass, tileFor } from './chatLayout.js';

// ─────────────────────────────────────────────────────────────────────────────
// Module state
// ─────────────────────────────────────────────────────────────────────────────
const C = {
  ready: false,
  backend: 'local',          // 'cloud' | 'local'
  orgId: null,
  me: null,                  // { id, name, email }
  members: [],               // [{ id, name, email, role }]
  channels: [],              // [{ id, name, kind, project_id, topic, icon, access_level }]
  membership: {},            // channelId -> { last_read_at, notif_pref, is_muted }
  messages: {},              // channelId -> [msg,...] (ascending by created_at)
  reads: {},                 // messageId -> [{user_id, read_at}]
  activeChannelId: null,
  activeThreadId: null,      // parent message id when a thread panel is open
  rtChannel: null,
  filters: { media: '', priority: '', hasLocation: false, hasAttachment: false, mentions: false, query: '' },
  sort: 'latest',            // latest | unread | priority | mentions
  outbox: [],                // queued messages while offline
  staged: [],                // attachments staged in the composer
  composerPriority: 'normal',
  recorder: null,            // active MediaRecorder session
  bootDone: false,
  limit: {},                 // channelId -> how many recent messages are rendered
  seenIds: new Set(),        // ids already on screen (new ones get the entry animation)
  tickState: {},             // messageId -> last rendered receipt state (pop on change)
  replyTo: null,             // { channel, ref, who, text } quote-reply being composed
  typing: {},                // channelId -> { userId: { name, until } }
  rtTyping: null,            // Supabase broadcast channel for typing indicators
  audio: null,               // { key, el, p } the voice note currently loaded
  audioRate: 1,
};

const SAFETY_KEYWORDS = ['accident','injury','injured','fall','fell','danger','dangerous','hazard','unsafe',
  'fire','collapse','collapsed','electrocution','shock','gas leak','leak','emergency','fatal','fatality',
  'near miss','ppe','helmet','harness','scaffold','trench','confined space','crane','excavation','rescue'];

const SIGNED_URL_CACHE = new Map();  // path -> { url, exp }
const OUTBOX_KEY = 'tss_chat_outbox';
const LOCAL_STORE_KEY = 'tss_chat_local';   // local-fallback persistence
const CONVERT_KEY = 'tss_chat_converts';    // chat-owned convert records

// ─────────────────────────────────────────────────────────────────────────────
// Small helpers
// ─────────────────────────────────────────────────────────────────────────────
// Always a valid UUID v4 — chat_messages.id / channel ids are uuid columns in the
// cloud schema, so client-generated ids for optimistic sends must be uuids too.
const uid = () => {
  try { if (crypto?.randomUUID) return crypto.randomUUID(); } catch {}
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0; return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
  });
};
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
const toast = (m, t = 'success') => { try { window.showToast ? window.showToast(m, t) : console.log('[chat]', m); } catch { console.log('[chat]', m); } };
const nowISO = () => new Date().toISOString();
const isOnline = () => (typeof navigator === 'undefined' ? true : navigator.onLine);

function initials(name) {
  return String(name || 'U').trim().split(/\s+/).slice(0, 2).map(w => w[0]).join('').toUpperCase() || 'U';
}
function avatarColor(id) {
  const palette = ['#2563eb', '#0891b2', '#7c3aed', '#db2777', '#ea580c', '#c2401c', '#0d9488', '#d97706', '#4f46e5'];
  let h = 0; for (const ch of String(id || '')) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return palette[h % palette.length];
}
function fmtTime(iso) {
  const d = new Date(iso), n = new Date();
  const sameDay = d.toDateString() === n.toDateString();
  if (sameDay) return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const yst = new Date(n); yst.setDate(n.getDate() - 1);
  if (d.toDateString() === yst.toDateString()) return 'Yesterday ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  return d.toLocaleDateString([], { day: '2-digit', month: 'short' }) + ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}
function fmtDur(sec) {
  sec = Math.max(0, Math.round(sec || 0));
  const m = Math.floor(sec / 60), s = sec % 60;
  return m + ':' + String(s).padStart(2, '0');
}
function fmtBytes(b) {
  if (!b) return '';
  const u = ['B', 'KB', 'MB', 'GB']; let i = 0; b = Number(b);
  while (b >= 1024 && i < u.length - 1) { b /= 1024; i++; }
  return b.toFixed(b < 10 && i > 0 ? 1 : 0) + ' ' + u[i];
}
const KIND_META = {
  project: { icon: '🏗️', label: 'Project' }, zone: { icon: '📍', label: 'Site Zone' },
  trade: { icon: '🔧', label: 'Trade' }, crew: { icon: '👷', label: 'Crew' },
  safety: { icon: '🦺', label: 'Safety' }, logistics: { icon: '🚚', label: 'Logistics' },
  general: { icon: '💬', label: 'General' }, dm: { icon: '👤', label: 'Direct' }, group: { icon: '👥', label: 'Group' },
};

// ─────────────────────────────────────────────────────────────────────────────
// Identity / members
// ─────────────────────────────────────────────────────────────────────────────
async function resolveMe() {
  const sb = getSupabase();
  if (sb) {
    try {
      const { data } = await sb.auth.getUser();
      const u = data?.user;
      if (u) { C.me = { id: u.id, name: (u.user_metadata?.display_name || u.email?.split('@')[0] || 'Me'), email: u.email }; return C.me; }
    } catch {}
  }
  C.me = C.me || { id: 'local-me', name: 'Me', email: '' };
  return C.me;
}
async function loadMembers() {
  try {
    const mod = await import('./organization.js');
    const raw = (await mod.loadOrgMembers?.()) || [];
    C.members = raw.map(m => ({
      id: m.user_id || m.id,
      name: m.display_name || (m.email ? m.email.split('@')[0] : 'User'),
      email: m.email || '', role: m.role || 'member',
    })).filter(m => m.id);
  } catch { C.members = []; }
  if (C.me && !C.members.some(m => m.id === C.me.id)) C.members.unshift({ ...C.me, role: 'owner' });
  return C.members;
}
const memberName = (id) => (C.members.find(m => m.id === id)?.name) || (id === C.me?.id ? (C.me?.name || 'Me') : 'User');

// ─────────────────────────────────────────────────────────────────────────────
// Backend detection + data layer (cloud with local fallback)
// ─────────────────────────────────────────────────────────────────────────────
async function detectBackend() {
  const sb = getSupabase();
  C.orgId = getOrgId?.() || null;
  if (!sb || !C.orgId) { C.backend = 'local'; return; }
  try {
    const { error } = await sb.from('chat_channels').select('id').limit(1);
    C.backend = error ? 'local' : 'cloud';
  } catch { C.backend = 'local'; }
}

async function localLoad() {
  let saved = null;
  try { saved = await idbGet(LOCAL_STORE_KEY); } catch {}
  if (!saved) { try { saved = JSON.parse(localStorage.getItem(LOCAL_STORE_KEY) || 'null'); } catch {} }
  if (saved && saved.channels?.length) {
    C.channels = saved.channels; C.messages = saved.messages || {}; C.membership = saved.membership || {};
    return;
  }
  seedLocal();
}
function seedLocal() {
  const proj = (state.projects && state.projects[0]) || null;
  const pid = proj?.id || null;
  const pname = proj?.name || 'Site';
  const mk = (name, kind, topic) => ({ id: uid(), name, kind, project_id: kind === 'dm' ? null : pid, topic: topic || '', icon: KIND_META[kind]?.icon || '💬', access_level: 'internal' });
  C.channels = [
    mk(pname + ' — General', 'project', 'Everything about ' + pname),
    mk('Safety', 'safety', 'Toolbox talks, incidents, PPE'),
    mk('Civil', 'trade', 'Civil works coordination'),
    mk('Logistics', 'logistics', 'Deliveries, gate passes, transport'),
    mk('Zone A — Tower 1', 'zone', 'Tower 1 site zone'),
  ];
  C.messages = {};
  const c0 = C.channels[0].id;
  C.messages[c0] = [{
    id: uid(), channel_id: c0, user_id: 'local-me', kind: 'system', body: 'Channel created. This is the single source of truth for site communication — no more scattered WhatsApp groups.',
    priority: 'normal', attachments: [], mentions: [], created_at: nowISO(),
  }];
  localPersist();
}
function localPersist() {
  const snap = { channels: C.channels, messages: C.messages, membership: C.membership };
  try { idbSet(LOCAL_STORE_KEY, snap); } catch {}
  try { localStorage.setItem(LOCAL_STORE_KEY, JSON.stringify(snap)); } catch {}
}

async function cloudLoadChannels() {
  const sb = getSupabase();
  const { data: chans } = await sb.from('chat_channels').select('*')
    .eq('organization_id', C.orgId).eq('is_archived', false).order('created_at', { ascending: true });
  C.channels = chans || [];
  const { data: mem } = await sb.from('chat_channel_members').select('*').eq('user_id', C.me.id);
  C.membership = {};
  (mem || []).forEach(m => { C.membership[m.channel_id] = m; });
  // Auto-provision a project channel for the current project if none exists.
  const proj = state.projects?.find(p => p.id === state.currentProjectId) || state.projects?.[0];
  if (proj && !C.channels.some(c => c.project_id === proj.id && c.kind === 'project')) {
    await createChannel({ name: proj.name + ' — General', kind: 'project', project_id: proj.id, topic: 'Project channel for ' + proj.name });
  }
}
async function cloudLoadMessages(channelId) {
  const sb = getSupabase();
  const { data } = await sb.from('chat_messages').select('*')
    .eq('channel_id', channelId).is('parent_id', null)
    .order('created_at', { ascending: true }).limit(300);
  C.messages[channelId] = data || [];
  // receipts for my own messages (drives the grey → blue ticks)
  const mineIds = C.messages[channelId].filter(m => m.user_id === C.me?.id).slice(-120).map(m => m.id);
  if (mineIds.length) {
    try {
      const { data: rd } = await sb.from('chat_message_reads').select('*').in('message_id', mineIds);
      (rd || []).forEach(r => { const arr = (C.reads[r.message_id] = C.reads[r.message_id] || []); if (!arr.some(x => x.user_id === r.user_id)) arr.push(r); });
    } catch {}
  }
  return C.messages[channelId];
}

// ─────────────────────────────────────────────────────────────────────────────
// Realtime
// ─────────────────────────────────────────────────────────────────────────────
function startRealtime() {
  if (C.backend !== 'cloud') return;
  const sb = getSupabase();
  if (!sb || C.rtChannel) return;
  try {
    const ch = sb.channel('rt_chat_' + C.orgId)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'chat_messages', filter: `organization_id=eq.${C.orgId}` }, (p) => {
        const row = p.new || p.old; if (!row) return;
        const list = C.messages[row.channel_id];
        if (p.eventType === 'INSERT' && !row.parent_id) {
          if (!list) return;
          if (!list.some(m => m.id === row.id)) list.push(row);
          if (row.channel_id === C.activeChannelId) {
            const t = C.typing[row.channel_id]; if (t) delete t[row.user_id];
            renderMessages(); bumpNewBelow(); markChannelRead(row.channel_id);
          }
          maybeNotify(row);
        } else if (p.eventType === 'UPDATE' && list) {
          const i = list.findIndex(m => m.id === row.id); if (i >= 0) list[i] = row;
          if (row.channel_id === C.activeChannelId) renderMessages();
        }
        renderChannelList();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'chat_channels', filter: `organization_id=eq.${C.orgId}` }, () => { cloudLoadChannels().then(renderChannelList); })
      // read receipts: someone opened a message → its ticks turn blue (RLS scopes rows to the org)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'chat_message_reads' }, (p) => {
        const r = p.new; if (!r) return;
        const arr = (C.reads[r.message_id] = C.reads[r.message_id] || []);
        if (!arr.some(x => x.user_id === r.user_id)) arr.push(r);
        if (document.getElementById('m_' + r.message_id)) renderMessages();
      });
    ch.subscribe();
    C.rtChannel = ch;
    const ty = sb.channel('chat_typing_' + C.orgId, { config: { broadcast: { self: false } } })
      .on('broadcast', { event: 'typing' }, ({ payload }) => onTypingEvent(payload));
    ty.subscribe();
    C.rtTyping = ty;
  } catch (e) { console.warn('[chat] realtime failed', e); }
}
function maybeNotify(row) {
  if (row.user_id === C.me?.id) return;
  const mem = C.membership[row.channel_id];
  const pref = mem?.notif_pref || 'all';
  const mentioned = (row.mentions || []).includes(C.me?.id);
  const isPriority = row.priority && row.priority !== 'normal';
  if (pref === 'none' || mem?.is_muted) return;
  if (pref === 'mentions' && !mentioned) return;
  if (pref === 'priority' && !isPriority && !mentioned) return;
  const chan = C.channels.find(c => c.id === row.channel_id);
  const who = memberName(row.user_id);
  const label = row.priority === 'safety' ? '🦺 SAFETY ALERT' : (isPriority ? '⚠️ ' + row.priority.toUpperCase() : '');
  toast(`${label ? label + ' · ' : ''}${who} in ${chan?.name || 'chat'}`, row.priority === 'safety' ? 'error' : (isPriority ? 'warning' : 'info'));
}

// ─────────────────────────────────────────────────────────────────────────────
// Public entry — called by switchView('chatView')
// ─────────────────────────────────────────────────────────────────────────────
export async function renderChat() {
  const root = document.getElementById('chatView');
  if (!root) return;
  if (!C.bootDone) {
    root.innerHTML = `<div class="chat-boot"><div class="chat-spin"></div><p>Loading chat…</p></div>`;
    await boot();
    C.bootDone = true;
  }
  paintShell();
}

async function boot() {
  await resolveMe();
  await loadMembers();
  await detectBackend();
  try {
    if (C.backend === 'cloud') { await cloudLoadChannels(); }
    else { await localLoad(); }
  } catch (e) { console.warn('[chat] load failed, using local', e); C.backend = 'local'; await localLoad(); }
  await restoreOutbox();
  if (!C.activeChannelId && C.channels[0]) C.activeChannelId = C.channels[0].id;
  if (C.activeChannelId) await loadActive();
  startRealtime();
  window.addEventListener('online', flushOutbox);
  window.addEventListener('resize', () => { syncChatTop(); });
  window.addEventListener('orientationchange', () => setTimeout(syncChatTop, 150));
  // iOS keeps the layout viewport when the keyboard opens: lift the conversation
  // by the keyboard's height (--kb) so the composer stays right above it.
  const vv = window.visualViewport;
  if (vv) {
    const fitKb = () => {
      const view = document.getElementById('chatView'); if (!view || view.classList.contains('hide')) return;
      const kb = Math.max(0, Math.round(window.innerHeight - vv.height - vv.offsetTop));
      view.style.setProperty('--kb', kb + 'px');
      fitComposer();
    };
    vv.addEventListener('resize', fitKb); vv.addEventListener('scroll', fitKb);
  }
  C.ready = true;
}

async function loadActive() {
  if (!C.activeChannelId) return;
  if (C.backend === 'cloud' && !C.messages[C.activeChannelId]) {
    try { await cloudLoadMessages(C.activeChannelId); } catch { C.messages[C.activeChannelId] = []; }
  }
  markChannelRead(C.activeChannelId);
}

// ─────────────────────────────────────────────────────────────────────────────
// Rendering — shell
// ─────────────────────────────────────────────────────────────────────────────
function syncChatTop() {
  const root = document.getElementById('chatView');
  if (!root) return;
  const bc = document.getElementById('breadcrumbBar');
  const h = bc ? Math.round(bc.getBoundingClientRect().height) : 56;
  root.style.setProperty('--chat-top', h + 'px');
}
function paintShell() {
  const root = document.getElementById('chatView');
  if (!root) return;
  syncChatTop();
  const setupHint = C.backend === 'local'
    ? `<div class="chat-setup-hint">Demo mode — run <code>db/chat_schema.sql</code> in Supabase to enable real-time cloud chat for your team.</div>`
    : '';
  root.innerHTML = `
    <div class="chat-wrap" data-pane="${C.activeChannelId ? 'thread' : 'list'}">
      <div class="chat-side">
        <div class="chat-side-head">
          <div class="chat-side-title">Chat</div>
          <button class="chat-icon-btn" title="New channel" onclick="chatNewChannel()">＋</button>
        </div>
        <div class="chat-search"><input id="chatSearch" placeholder="Search messages, files, people…" value="${esc(C.filters.query)}" oninput="chatOnSearch(this.value)"></div>
        <div class="chat-controls">
          <select id="chatSort" class="chat-mini" onchange="chatSetSort(this.value)" title="Sort">
            <option value="latest">Latest</option><option value="unread">Unread</option>
            <option value="priority">Priority</option><option value="mentions">Mentions</option>
          </select>
          <button class="chat-mini chat-filter-btn ${anyFilter() ? 'on' : ''}" onclick="chatToggleFilters()">Filters${anyFilter() ? ' •' : ''}</button>
        </div>
        <div id="chatFilters" class="chat-filters hide">${filterPanelHTML()}</div>
        <div id="chatChannelList" class="chat-channels"></div>
      </div>
      <div class="chat-main">
        ${setupHint}
        <div id="chatThread" class="chat-thread"></div>
      </div>
      <div id="chatThreadPanel" class="chat-thread-panel hide"></div>
    </div>`;
  document.getElementById('chatSort').value = C.sort;
  renderChannelList();
  renderMessages();
}

function anyFilter() {
  const f = C.filters; return !!(f.media || f.priority || f.hasLocation || f.hasAttachment || f.mentions);
}
function filterPanelHTML() {
  const f = C.filters;
  const opt = (v, l, cur) => `<option value="${v}" ${cur === v ? 'selected' : ''}>${l}</option>`;
  return `
    <div class="chat-frow">
      <select class="chat-mini" onchange="chatSetFilter('media',this.value)">
        ${opt('', 'Any media', f.media)}${opt('image', 'Photos', f.media)}${opt('video', 'Video', f.media)}${opt('file', 'Files', f.media)}${opt('audio', 'Voice', f.media)}
      </select>
      <select class="chat-mini" onchange="chatSetFilter('priority',this.value)">
        ${opt('', 'Any priority', f.priority)}${opt('high', 'High', f.priority)}${opt('urgent', 'Urgent', f.priority)}${opt('safety', 'Safety', f.priority)}
      </select>
    </div>
    <div class="chat-frow chat-fchecks">
      <label><input type="checkbox" ${f.hasAttachment ? 'checked' : ''} onchange="chatSetFilter('hasAttachment',this.checked)"> Has attachment</label>
      <label><input type="checkbox" ${f.hasLocation ? 'checked' : ''} onchange="chatSetFilter('hasLocation',this.checked)"> Has location</label>
      <label><input type="checkbox" ${f.mentions ? 'checked' : ''} onchange="chatSetFilter('mentions',this.checked)"> Mentions me</label>
    </div>`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Rendering — channel list
// ─────────────────────────────────────────────────────────────────────────────
function unreadCount(channelId) {
  const mem = C.membership[channelId];
  const last = mem?.last_read_at ? new Date(mem.last_read_at).getTime() : 0;
  const list = C.messages[channelId] || [];
  return list.filter(m => new Date(m.created_at).getTime() > last && m.user_id !== C.me?.id && !m.deleted_at).length;
}
function lastMsgPreview(channelId) {
  const list = (C.messages[channelId] || []).filter(m => !m.deleted_at);
  const m = list[list.length - 1];
  if (!m) return { text: 'No messages yet', at: '' };
  let t = m.body || '';
  const atts = (m.attachments || []).filter(a => a.type !== 'reply');
  if (!t && atts.length) { const a = atts[0]; t = a.type === 'audio' ? '🎤 Voice message' : a.type === 'image' ? (atts.length > 1 ? `📷 ${atts.length} photos` : '📷 Photo') : a.type === 'video' ? '🎬 Video' : '📄 ' + (a.name || 'File'); }
  if (!t && m.location) t = '📍 Location';
  if (m.kind === 'system') t = m.body;
  else if (m.user_id === C.me?.id) t = 'You: ' + t;
  return { text: t.slice(0, 60), at: fmtTime(m.created_at), mine: m.user_id === C.me?.id };
}
function sortedChannels() {
  let list = [...C.channels];
  const score = (c) => {
    if (C.sort === 'unread') return unreadCount(c.id);
    if (C.sort === 'mentions') return (C.messages[c.id] || []).filter(m => (m.mentions || []).includes(C.me?.id)).length;
    if (C.sort === 'priority') return (C.messages[c.id] || []).filter(m => m.priority && m.priority !== 'normal').length;
    const l = (C.messages[c.id] || []); const m = l[l.length - 1];
    return m ? new Date(m.created_at).getTime() : 0;
  };
  return list.sort((a, b) => score(b) - score(a));
}
function renderChannelList() {
  const el = document.getElementById('chatChannelList');
  if (!el) return;
  const q = C.filters.query.trim().toLowerCase();
  const groups = { dm: [], project: [], sub: [] };
  sortedChannels().forEach(c => {
    if (q && !(c.name.toLowerCase().includes(q) || (c.topic || '').toLowerCase().includes(q))) return;
    if (c.kind === 'dm' || c.kind === 'group') groups.dm.push(c);
    else if (c.kind === 'project' || c.kind === 'general') groups.project.push(c);
    else groups.sub.push(c);
  });
  const row = (c) => {
    const un = unreadCount(c.id);
    const pv = lastMsgPreview(c.id);
    const active = c.id === C.activeChannelId ? 'active' : '';
    const meta = KIND_META[c.kind] || KIND_META.general;
    return `<button class="chat-ch ${active}${un ? ' has-unread' : ''}" onclick="chatOpenChannel('${c.id}')">
      <span class="chat-ch-ic" style="--av:${avatarColor(c.id)}">${c.icon || meta.icon}</span>
      <span class="chat-ch-body">
        <span class="chat-ch-top"><span class="chat-ch-name" data-keep-emoji>${esc(c.name)}</span><span class="chat-ch-time">${pv.at}</span></span>
        <span class="chat-ch-sub${un ? ' unread' : ''}" data-keep-emoji>${esc(pv.text)}</span>
      </span>
      ${un ? `<span class="chat-badge">${un}</span>` : ''}
    </button>`;
  };
  const section = (title, arr) => arr.length ? `<div class="chat-ch-group"><div class="chat-ch-glabel">${title}</div>${arr.map(row).join('')}</div>` : '';
  el.innerHTML = section('Project Channels', groups.project) + section('Sub-channels', groups.sub) + section('Direct Messages', groups.dm)
    || `<div class="chat-empty-side">No channels. Tap ＋ to create one.</div>`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Rendering — messages
// Bubbles are grouped by sender (chatLayout.js): a group's inner corners are
// flattened, the name shows on the first bubble and the avatar on the last.
// Only the most recent PAGE messages render; older ones load on scroll-up.
// ─────────────────────────────────────────────────────────────────────────────
const PAGE = 80;
const realAtts = (m) => (m.attachments || []).filter(a => a.type !== 'reply');
function passesFilter(m) {
  const f = C.filters;
  const atts = realAtts(m);
  if (f.media) { if (!atts.some(a => a.type === f.media)) return false; }
  if (f.priority) { if (m.priority !== f.priority) return false; }
  if (f.hasAttachment && !atts.length) return false;
  if (f.hasLocation && !m.location) return false;
  if (f.mentions && !(m.mentions || []).includes(C.me?.id)) return false;
  if (f.query) {
    const hay = (m.body || '') + ' ' + atts.map(a => a.name || '').join(' ') + ' ' + memberName(m.user_id);
    if (!hay.toLowerCase().includes(f.query.trim().toLowerCase())) return false;
  }
  return true;
}

const ICONS = {
  back: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg>',
  bell: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.7 21a2 2 0 0 1-3.4 0"/></svg>',
  search: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg>',
  plus: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>',
  send: '<svg class="cm-i-send" width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M3.4 20.4l17.45-7.48a1 1 0 0 0 0-1.84L3.4 3.6a.99.99 0 0 0-1.39.91L2 9.12c0 .5.37.93.87.99L17 12 2.87 13.88c-.5.07-.87.5-.87 1l.01 4.61c0 .71.73 1.2 1.39.91z"/></svg>',
  mic: '<svg class="cm-i-mic" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="2" width="6" height="12" rx="3"/><path d="M5 10a7 7 0 0 0 14 0M12 17v4"/></svg>',
  stop: '<svg class="cm-i-stop" width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><rect x="5" y="5" width="14" height="14" rx="3"/></svg>',
  reply: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 14L4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/></svg>',
  more: '<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><circle cx="5" cy="12" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="19" cy="12" r="2"/></svg>',
  play: '<svg class="cm-i-play" width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5.14v13.72a1 1 0 0 0 1.5.86l11-6.86a1 1 0 0 0 0-1.72l-11-6.86A1 1 0 0 0 8 5.14z"/></svg>',
  pause: '<svg class="cm-i-pause" width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="5" width="4" height="14" rx="1.2"/><rect x="14" y="5" width="4" height="14" rx="1.2"/></svg>',
  down: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6 6 6-6"/></svg>',
  dl: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 4v11M7 10l5 5 5-5M5 20h14"/></svg>',
  pin: '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M16 3l5 5-3 1-4 4 1 5-2 2-4-4-5 5-1-1 5-5-4-4 2-2 5 1 4-4z"/></svg>',
  x: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>',
};
/** Receipt glyphs: clock (queued) → one tick (stored on the server) → two ticks (seen). */
const TICKS = {
  pending: '<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><circle cx="8" cy="8" r="6"/><path d="M8 4.8V8l2.2 1.4"/></svg>',
  sent: '<svg viewBox="0 0 18 12" width="16" height="12" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M2.5 6.5l3.2 3.2L13 2.4"/></svg>',
  read: '<svg viewBox="0 0 18 12" width="18" height="12" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M1.2 6.5l3.2 3.2L11.7 2.4"/><path d="M7.4 9.1l.6.6 7.3-7.3"/></svg>',
};
function tickOf(m) {
  if (m._pending) return 'pending';
  return (C.reads[m.id] || []).some(r => r.user_id !== m.user_id) ? 'read' : 'sent';
}
/** The tick pops only when its state changes between renders. */
function tickHTML(m) {
  const s = tickOf(m);
  const prev = C.tickState[m.id];
  C.tickState[m.id] = s;
  return `<span class="cm-tick ${s}${prev && prev !== s ? ' pop' : ''}" aria-label="${s}">${TICKS[s]}</span>`;
}
function hhmm(iso) { return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }); }

function renderMessages(opts = {}) {
  const el = document.getElementById('chatThread');
  if (!el) return;
  const chan = C.channels.find(c => c.id === C.activeChannelId);
  if (!chan) { el.innerHTML = `<div class="chat-empty">Select a channel to start.</div>`; return; }
  const prevBox = document.getElementById('chatMsgs');
  const prevFromBottom = prevBox ? prevBox.scrollHeight - prevBox.scrollTop - prevBox.clientHeight : 0;
  const prevTop = prevBox ? prevBox.scrollTop : 0;
  const stick = opts.stick || C._stick || !prevBox || prevFromBottom < 140;
  C._stick = false;
  const draft = document.getElementById('chatInput')?.value || '';

  const all = (C.messages[chan.id] || []).filter(m => !m.deleted_at && !m.parent_id).filter(passesFilter);
  const limit = C.limit[chan.id] || PAGE;
  const shown = all.slice(-limit);
  const pins = (C.messages[chan.id] || []).filter(m => m.is_pinned && !m.deleted_at);
  const meta = KIND_META[chan.kind] || KIND_META.general;
  const isDM = chan.kind === 'dm';
  // Each day is its own section, so its date pill sticks only while that day is on screen.
  let rows = '', open = false;
  groupMessages(shown).forEach(g => {
    if (g.dayBreak) { rows += (open ? '</section>' : '') + `<section class="cm-dayblock"><div class="cm-day"><span>${dayLabel(g.m.created_at)}</span></div>`; open = true; }
    rows += messageHTML(g.m, chan, g, isDM);
  });
  if (open) rows += '</section>';
  el.innerHTML = `
    <div class="cm-top" id="chatHead"><div class="cm-head">
      <button class="cm-back" onclick="chatBackToList()" aria-label="Back">${ICONS.back}</button>
      <div class="cm-hav" style="--av:${avatarColor(chan.id)}">${chan.icon || meta.icon}</div>
      <div class="cm-hinfo">
        <div class="cm-hname" data-keep-emoji>${esc(chan.name)}</div>
        <div class="cm-hsub" id="chatHeadSub" data-base="${esc(meta.label + (chan.topic ? ' · ' + chan.topic : ''))}">${esc(meta.label + (chan.topic ? ' · ' + chan.topic : ''))}</div>
      </div>
      <button class="cm-hbtn ${C.filters.query ? 'on' : ''}" onclick="chatToggleFind()" aria-label="Search">${ICONS.search}</button>
      <button class="cm-hbtn" onclick="chatNotifMenu()" aria-label="Notifications">${ICONS.bell}</button>
    </div>
    <div class="cm-find ${C._findOpen || C.filters.query ? '' : 'hide'}" id="chatFind"><input id="chatFindInput" type="search" placeholder="Search in this chat…" value="${esc(C.filters.query)}" oninput="chatOnSearch(this.value)"></div>
    ${pins.length ? `<button class="cm-pins" onclick="chatJump('${pins[pins.length - 1].id}')">${ICONS.pin}<span><b>Pinned${pins.length > 1 ? ` · ${pins.length}` : ''}</b>${esc((pins[pins.length - 1].body || 'Attachment').slice(0, 80))}</span></button>` : ''}</div>
    <div id="chatMsgs" class="cm-msgs">
      ${all.length > limit ? `<button class="cm-older" id="chatOlder" onclick="chatLoadOlder()">Load earlier messages</button>` : ''}
      ${shown.length ? rows : `<div class="chat-empty">${C.filters.query || anyFilter() ? 'No messages match.' : 'No messages yet. Say hello 👋'}</div>`}
      <div class="cm-row theirs cm-typing hide" id="chatTypingRow"><div class="cm-av-sp"></div><div class="cm-col"><div class="cm-bubble"><i></i><i></i><i></i></div></div></div>
    </div>
    <button class="cm-fab hide" id="chatToBottom" onclick="chatScrollBottom()" aria-label="Latest messages">${ICONS.down}<b class="hide"></b></button>
    ${composerHTML(chan)}`;
  const box = document.getElementById('chatMsgs');
  const inp = document.getElementById('chatInput');
  if (inp && draft) { inp.value = draft; window.chatInputResize(inp, true); }
  fitComposer();
  if (box) {
    if (opts.keepHeight != null) box.scrollTop = box.scrollHeight - opts.keepHeight;
    else if (stick) box.scrollTop = box.scrollHeight;
    else box.scrollTop = prevTop;
    // Rows and photos settle their real height after the first frame; while the
    // reader is at the latest message, keep them pinned there.
    C._pin = opts.keepHeight == null && stick;
    const repin = () => { if (C._pin) box.scrollTop = box.scrollHeight; };
    requestAnimationFrame(repin); setTimeout(repin, 80); setTimeout(repin, 300);
    box.addEventListener('load', repin, true);
    const touched = () => { C._userScrollAt = Date.now(); };
    ['wheel', 'touchstart', 'pointerdown', 'keydown'].forEach(ev => box.addEventListener(ev, touched, { passive: true }));
    attachGestures(box);
    box.addEventListener('scroll', onMsgsScroll, { passive: true });
    const older = document.getElementById('chatOlder');
    if (older && 'IntersectionObserver' in window) {
      const io = new IntersectionObserver((ents) => { if (ents.some(e => e.isIntersecting)) { io.disconnect(); window.chatLoadOlder(); } }, { root: box, rootMargin: '200px 0px 0px 0px' });
      setTimeout(() => io.observe(older), 300);
    }
  }
  shown.forEach(m => C.seenIds.add(m.id));
  renderStaged(); renderReplyBar(); updateTyping(); updateSendMode();
}

function messageHTML(m, chan, g = { pos: 'single', showName: true, showAvatar: true }, isDM = false) {
  if (m.kind === 'system') return `<div class="cm-sys" data-keep-emoji id="m_${m.id}">${esc(m.body)}</div>`;
  const mine = m.user_id === C.me?.id;
  const name = memberName(m.user_id);
  const prio = m.priority && m.priority !== 'normal' ? m.priority : '';
  const flag = prio === 'safety' ? '🦺 Safety alert' : prio === 'urgent' ? '⚠️ Urgent' : prio === 'high' ? '▲ High priority' : '';
  const replies = (C.messages[chan.id] || []).filter(x => x.parent_id === m.id && !x.deleted_at);
  const reply = (m.attachments || []).find(a => a.type === 'reply');
  // While a send is in flight, show the staged files from their local blobs.
  const atts = [...realAtts(m), ...((m._pending && m._rawAttachments) ? m._rawAttachments.map(previewAtt) : [])];
  const imgs = atts.filter(a => a.type === 'image' && a.url);
  const others = atts.filter(a => !(a.type === 'image' && a.url));
  const mediaOnly = !m.body && imgs.length && !others.length && !m.location && !reply;
  const metaIn = `<span class="cm-meta${mediaOnly ? ' on-media' : ''}">${m.edited_at ? 'edited · ' : ''}${hhmm(m.created_at)}${mine ? tickHTML(m) : ''}</span>`;
  const fresh = C.seenIds.size && !C.seenIds.has(m.id) ? ' enter' : '';
  const nameColor = avatarColor(m.user_id);
  return `
  <div class="cm-row ${mine ? 'mine' : 'theirs'} p-${g.pos}${prio ? ' prio-' + prio : ''}${fresh}" id="m_${m.id}" data-id="${m.id}">
    ${mine ? '' : (g.showAvatar && !isDM ? `<div class="cm-av" style="--av:${nameColor}">${initials(name)}</div>` : '<div class="cm-av-sp"></div>')}
    <div class="cm-col">
      ${flag && g.showName ? `<div class="cm-flag ${prio}">${flag}</div>` : ''}
      <div class="cm-bubble${mediaOnly ? ' media-only' : ''}${imgs.length ? ' has-media' : ''}">
        ${!mine && g.showName && !isDM ? `<div class="cm-name" style="color:${nameColor}">${esc(name)}</div>` : ''}
        ${reply ? `<button class="cm-quote" onclick="chatJump('${esc(reply.ref)}')" style="--q:${avatarColor(reply.who)}"><b>${esc(reply.who === C.me?.id ? 'You' : memberName(reply.who))}</b><span data-keep-emoji>${esc(reply.text || '')}</span></button>` : ''}
        ${imgs.length ? mediaGridHTML(imgs, m) : ''}
        ${others.map((a, i) => attachmentHTML(a, m, i)).join('')}
        ${m.location ? locationHTML(m.location) : ''}
        ${m.linked_record ? `<div class="cm-linked">🔗 ${esc(m.linked_record.module)} · ${esc(m.linked_record.title || '')}</div>` : ''}
        ${m.body ? `<div class="cm-text" data-keep-emoji>${highlightBody(m.body, m.mentions)}<span class="cm-meta-sp${mine ? ' mine' : ''}"></span></div>` : ''}
        ${metaIn}
      </div>
      ${replies.length ? `<button class="cm-thread-chip" onclick="chatOpenThread('${m.id}')">💬 ${replies.length} repl${replies.length > 1 ? 'ies' : 'y'}</button>` : ''}
    </div>
    <button class="cm-more" onclick="chatMsgActions('${m.id}')" aria-label="Message actions">${ICONS.more}</button>
    <span class="cm-swipe-ic">${ICONS.reply}</span>
  </div>`;
}
function previewAtt(a) {
  if (a._blob && !a._preview) { try { a._preview = URL.createObjectURL(a._blob); } catch {} }
  return { ...a, url: a._preview || '' };
}

function highlightBody(text, mentions) {
  let html = esc(text || '');
  (mentions || []).forEach(id => {
    const n = memberName(id);
    html = html.replace(new RegExp('@' + n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'), `<span class="chat-mention">@${esc(n)}</span>`);
  });
  const low = html.toLowerCase();
  if (SAFETY_KEYWORDS.some(k => low.includes(k))) {
    SAFETY_KEYWORDS.forEach(k => {
      html = html.replace(new RegExp('\\b(' + k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ')\\b', 'gi'), '<span class="chat-safety-word">$1</span>');
    });
  }
  // bare links become tappable
  html = html.replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" target="_blank" rel="noopener">$1</a>');
  return html.replace(/\n/g, '<br>');
}

/** Site photos: 1 → natural aspect, 2 → pair, 3 → one tall + two, 4+ → 2×2 with "+N". */
function mediaGridHTML(imgs, m) {
  const n = imgs.length, cls = mediaGridClass(n);
  const first = imgs[0];
  const ar = (first.w && first.h) ? Math.min(1.6, Math.max(0.62, first.w / first.h)) : 1.33;
  return `<div class="cm-grid ${cls}"${n === 1 ? ` style="aspect-ratio:${ar.toFixed(3)}"` : ''}>${imgs.slice(0, 4).map((a, i) =>
    `<button class="cm-tile" onclick="chatLightbox('${m.id}',${i})"><img loading="lazy" decoding="async" src="${esc(a.url)}" alt="${esc(a.name || 'photo')}">${a.geotag && i === 0 ? '<span class="cm-geo">📍 Geo-tagged</span>' : ''}${i === 3 && n > 4 ? `<span class="cm-more-n">+${n - 4}</span>` : ''}</button>`).join('')}</div>`;
}

/** File type → tile label, tone and description. Drawings get the blueprint treatment. */
function docMeta(name) {
  const ext = (String(name || '').split('.').pop() || '').toLowerCase();
  const drawing = /drawing|dwg|layout|plan|blueprint|gfc|elevation|section|detail/i.test(name || '');
  if (['dwg', 'dxf'].includes(ext)) return { label: ext.toUpperCase(), tone: '#1d4ed8', kind: 'CAD drawing', blueprint: true };
  if (ext === 'pdf') return drawing ? { label: 'PDF', tone: '#1d4ed8', kind: 'Drawing · PDF', blueprint: true } : { label: 'PDF', tone: '#e5484d', kind: 'PDF document' };
  if (['xls', 'xlsx', 'csv'].includes(ext)) return { label: ext === 'csv' ? 'CSV' : 'XLS', tone: '#16a34a', kind: 'Spreadsheet' };
  if (['doc', 'docx'].includes(ext)) return { label: 'DOC', tone: '#2b6cb0', kind: 'Document' };
  if (['ppt', 'pptx'].includes(ext)) return { label: 'PPT', tone: '#ea580c', kind: 'Presentation' };
  if (['zip', 'rar', '7z'].includes(ext)) return { label: 'ZIP', tone: '#64748b', kind: 'Archive' };
  if (['jpg', 'jpeg', 'png', 'webp', 'heic'].includes(ext)) return { label: 'IMG', tone: '#7c3aed', kind: 'Image' };
  return { label: (ext || 'file').slice(0, 4).toUpperCase(), tone: '#475569', kind: 'File' };
}
function attachmentHTML(a, m, i = 0) {
  const src = a.url || '';
  if (a.type === 'image') return '';   // images render in the grid
  if (a.type === 'video') return `<div class="cm-video"><video src="${esc(src)}" controls preload="metadata" playsinline></video></div>`;
  if (a.type === 'audio') return audioHTML(a, m.id + '_' + i, m.user_id === C.me?.id);
  const d = docMeta(a.name);
  return `<a class="cm-doc${d.blueprint ? ' blueprint' : ''}" href="${esc(src)}" target="_blank" rel="noopener" download="${esc(a.name || '')}">
    <span class="cm-doc-tile" style="--tone:${d.tone}"><i></i>${d.label}</span>
    <span class="cm-doc-txt"><b>${esc(a.name || 'File')}</b><small>${[fmtBytes(a.size), d.kind].filter(Boolean).join(' · ')}</small></span>
    <span class="cm-doc-dl">${ICONS.dl}</span></a>`;
}
function fileIcon(name) {
  const ext = (name || '').split('.').pop().toLowerCase();
  if (['pdf'].includes(ext)) return '📕'; if (['xls', 'xlsx', 'csv'].includes(ext)) return '📊';
  if (['doc', 'docx'].includes(ext)) return '📘'; if (['dwg', 'dxf'].includes(ext)) return '📐';
  if (['zip', 'rar'].includes(ext)) return '🗜️'; return '📄';
}
/** Voice note: played part of the waveform fills in as it plays (see chatPlayAudio). */
function audioHTML(a, key, mine) {
  const bars = (a.waveform && a.waveform.length ? a.waveform : Array.from({ length: 32 }, (_, i) => 0.35 + 0.5 * Math.abs(Math.sin(i * 1.7))));
  const wf = bars.slice(0, 40).map(v => `<span style="height:${Math.max(14, Math.round(v * 100))}%"></span>`).join('');
  const playing = C.audio && C.audio.key === key && !C.audio.el.paused;
  const p = C.audio && C.audio.key === key ? C.audio.p || 0 : 0;
  return `<div class="cm-voice${playing ? ' playing' : ''}" data-key="${esc(key)}" data-src="${esc(a.url || '')}" style="--p:${(p * 100).toFixed(1)}%">
    <button class="cm-vplay" onclick="chatPlayAudio(this)" aria-label="Play voice note">${ICONS.play}${ICONS.pause}</button>
    <div class="cm-vbody">
      <div class="cm-vwave" onclick="chatSeekAudio(event,this)"><div class="cm-vbars">${wf}</div><div class="cm-vbars fill">${wf}</div></div>
      <div class="cm-vmeta"><span class="cm-vdur">${fmtDur(a.dur)}</span><button class="cm-vspeed" onclick="chatVoiceSpeed(this)">${C.audioRate || 1}×</button></div>
    </div>
    <span class="cm-vmic${mine ? ' mine' : ''}">${ICONS.mic}</span>
  </div>`;
}
/** Location pin: a live OpenStreetMap preview (3×3 tiles centred on the point). */
function locationHTML(loc) {
  const q = `${loc.lat},${loc.lng}`;
  const t = tileFor(Number(loc.lat), Number(loc.lng), 16);
  const n = 2 ** t.z;
  let tiles = '';
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
    const x = ((t.x + dx) % n + n) % n, y = t.y + dy;
    tiles += `<img loading="lazy" alt="" src="https://tile.openstreetmap.org/${t.z}/${x}/${y}.png" style="left:${(dx + 1) * 256}px;top:${(dy + 1) * 256}px" onerror="this.remove()">`;
  }
  const live = loc.live && loc.expires_at && new Date(loc.expires_at) > new Date();
  return `<a class="cm-loc" href="https://www.google.com/maps?q=${q}" target="_blank" rel="noopener">
    <span class="cm-map"><span class="cm-map-tiles" style="left:calc(50% - ${256 + t.px}px);top:calc(50% - ${256 + t.py}px)">${tiles}</span>
      <span class="cm-map-pin${live ? ' live' : ''}"><i></i></span><small class="cm-map-attr">© OpenStreetMap</small></span>
    <span class="cm-loc-foot"><span class="cm-loc-txt"><b>${live ? 'Live location' : loc.live ? 'Live location (ended)' : 'Location pin'}</b>
      <small>${loc.label ? esc(loc.label) + ' · ' : ''}${Number(loc.lat).toFixed(5)}, ${Number(loc.lng).toFixed(5)}${loc.accuracy ? ' · ±' + Math.round(loc.accuracy) + ' m' : ''}${live ? ' · until ' + hhmm(loc.expires_at) : ''}</small></span>
      <span class="cm-loc-go">Directions</span></span></a>`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Composer — grows with the text up to 6 lines, then scrolls inside. The round
// button is a mic when empty and morphs into Send once there is something to send.
// ─────────────────────────────────────────────────────────────────────────────
const svg = (d, w = 24) => `<svg width="${w}" height="${w}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`;
const GLYPH = {
  camera: svg('<path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/>'),
  photos: svg('<rect x="3" y="4" width="18" height="16" rx="3"/><circle cx="9" cy="10" r="2"/><path d="M21 16l-5-5-9 9"/>'),
  doc: svg('<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5M9 13h6M9 17h6"/>'),
  video: svg('<rect x="3" y="6" width="13" height="12" rx="3"/><path d="M16 10l5-3v10l-5-3"/>'),
  mic: svg('<rect x="9" y="2" width="6" height="12" rx="3"/><path d="M5 10a7 7 0 0 0 14 0M12 17v4"/>'),
  pin: svg('<path d="M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.5"/>'),
  live: svg('<circle cx="12" cy="12" r="2"/><path d="M16.2 7.8a6 6 0 0 1 0 8.4M7.8 16.2a6 6 0 0 1 0-8.4M19 5a10 10 0 0 1 0 14M5 19A10 10 0 0 1 5 5"/>'),
  reply: svg('<path d="M9 14L4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/>', 20),
  thread: svg('<path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z"/>', 20),
  copy: svg('<rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h10"/>', 20),
  pinmsg: svg('<path d="M12 17v5M8 3h8l-1 6 3 4H6l3-4z"/>', 20),
  task: svg('<rect x="3" y="3" width="18" height="18" rx="4"/><path d="M8 12l3 3 5-6"/>', 20),
  rfi: svg('<circle cx="12" cy="12" r="9"/><path d="M9.5 9a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .8-1 1.5V14M12 17.5v.5"/>', 20),
  punch: svg('<path d="M9 5h10M9 12h10M9 19h10M4 5l1 1 2-2M4 12l1 1 2-2M4 19l1 1 2-2"/>', 20),
  safety: svg('<path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/><path d="M9 12l2 2 4-4"/>', 20),
  daily: svg('<rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 8h8M8 12h8M8 16h5"/>', 20),
  seen: svg('<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>', 20),
  trash: svg('<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>', 20),
  bell: svg('<path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.7 21a2 2 0 0 1-3.4 0"/>', 20),
  at: svg('<circle cx="12" cy="12" r="4"/><path d="M16 8v5a3 3 0 0 0 6 0v-1a10 10 0 1 0-4 8"/>', 20),
  alert: svg('<path d="M12 3l10 18H2z"/><path d="M12 10v5M12 18v.5"/>', 20),
  mute: svg('<path d="M18 8a6 6 0 0 0-9.3-5M6 8c0 7-3 9-3 9h14M13.7 21a2 2 0 0 1-3.4 0M3 3l18 18"/>', 20),
};
const PRIORITIES = [['normal', 'Normal'], ['high', '▲ High'], ['urgent', '⚠️ Urgent'], ['safety', '🦺 Safety']];
function composerHTML(chan) {
  const pr = C.composerPriority;
  const tile = (fn, ic, label, tone) => `<button onclick="${fn}"><span style="--tone:${tone}">${GLYPH[ic]}</span>${label}</button>`;
  return `
  <div class="cm-composer" id="chatComposer">
    <div id="chatReplyBar" class="cm-replybar hide"></div>
    <div id="chatStaged" class="cm-staged hide"></div>
    <div class="cm-crow">
      <button class="cm-plus" id="chatPlusBtn" onclick="chatToggleAttachMenu(event)" aria-label="Attach">${ICONS.plus}</button>
      <div class="cm-inwrap">
        ${pr !== 'normal' ? `<button class="cm-prio-chip ${pr}" onclick="chatSetPriority('normal')">${PRIORITIES.find(p => p[0] === pr)[1]} ✕</button>` : ''}
        <textarea id="chatInput" class="cm-input" rows="1" placeholder="Message" oninput="chatInputResize(this)" onkeydown="chatInputKey(event)"></textarea>
        <div id="chatMentionPop" class="chat-mention-pop hide"></div>
      </div>
      <button class="cm-sendbtn" id="chatSendBtn" data-mode="mic" onclick="chatSendOrMic()" aria-label="Send">${ICONS.mic}${ICONS.send}${ICONS.stop}</button>
    </div>
    <div id="chatAttachMenu" class="cm-attach hide">
      <div class="cm-attach-grid">
        ${tile("chatPick('camera')", 'camera', 'Camera', '#e11d48')}${tile("chatPick('image')", 'photos', 'Photos', '#7c3aed')}
        ${tile("chatPick('file')", 'doc', 'Document', '#2563eb')}${tile("chatPick('video')", 'video', 'Video', '#db2777')}
        ${tile('chatRecordVoice()', 'mic', 'Voice', '#ea580c')}${tile('chatShareLocation(false)', 'pin', 'Location', '#16a34a')}
        ${tile('chatShareLocation(true)', 'live', 'Live 15 min', '#0d9488')}
      </div>
      <div class="cm-attach-prio"><span>Mark as</span>${PRIORITIES.map(([v, l]) => `<button class="${pr === v ? 'on ' + v : v}" onclick="chatSetPriority('${v}')">${l}</button>`).join('')}</div>
    </div>
    <input type="file" id="chatFileInput" class="hide" onchange="chatFilesChosen(event)">
  </div>`;
}
function renderStaged() {
  const el = document.getElementById('chatStaged');
  if (!el) return;
  if (!C.staged.length) { el.classList.add('hide'); el.innerHTML = ''; fitComposer(); updateSendMode(); return; }
  el.classList.remove('hide');
  el.innerHTML = C.staged.map((a, i) => {
    const thumb = a.type === 'image' ? previewAtt(a).url : '';
    const ic = a.type === 'video' ? '🎬' : a.type === 'audio' ? '🎤' : a.type === 'location' ? '📍' : '📄';
    return `<div class="cm-stage${thumb ? ' img' : ''}">${thumb ? `<img src="${esc(thumb)}" alt="">` : `<span>${ic}</span><small>${esc((a.name || a.type).slice(0, 18))}</small>`}<button onclick="chatUnstage(${i})" aria-label="Remove">${ICONS.x}</button></div>`;
  }).join('');
  fitComposer(); updateSendMode();
}
function renderReplyBar() {
  const el = document.getElementById('chatReplyBar'); if (!el) return;
  const r = C.replyTo;
  if (!r || r.channel !== C.activeChannelId) { el.classList.add('hide'); el.innerHTML = ''; fitComposer(); return; }
  el.classList.remove('hide');
  el.innerHTML = `<div class="cm-quote" style="--q:${avatarColor(r.who)}"><b>Replying to ${esc(r.who === C.me?.id ? 'yourself' : memberName(r.who))}</b><span data-keep-emoji>${esc(r.text)}</span></div><button onclick="chatCancelReply()" aria-label="Cancel reply">${ICONS.x}</button>`;
  fitComposer();
}
/** The messages scroller pads itself by the composer's live height. */
function fitComposer() {
  const comp = document.getElementById('chatComposer'), box = document.getElementById('chatMsgs'), th = document.getElementById('chatThread');
  if (!comp || !th) return;
  const atBottom = box ? box.scrollHeight - box.scrollTop - box.clientHeight < 40 : true;
  th.style.setProperty('--cmp-h', comp.offsetHeight + 'px');
  const head = document.getElementById('chatHead');
  if (head) th.style.setProperty('--head-h', head.offsetHeight + 'px');
  if (box && atBottom) box.scrollTop = box.scrollHeight;
}
function updateSendMode() {
  const b = document.getElementById('chatSendBtn'); if (!b) return;
  const has = !!(document.getElementById('chatInput')?.value.trim() || C.staged.length);
  b.dataset.mode = C.recorder ? 'stop' : has ? 'send' : 'mic';
}

// ─────────────────────────────────────────────────────────────────────────────
// Composer actions (window-bound)
// ─────────────────────────────────────────────────────────────────────────────
/** Light haptic tick: Capacitor Haptics in the app, vibrate() in the browser. */
function haptic(ms = 10) {
  try {
    const H = window.Capacitor?.Plugins?.Haptics;
    if (H?.impact) { H.impact({ style: ms > 14 ? 'MEDIUM' : 'LIGHT' }); return; }
  } catch {}
  try { navigator.vibrate?.(ms); } catch {}
}
function pendingPickType(t) { C._pickType = t; }
window.chatToggleAttachMenu = (e) => {
  e?.stopPropagation();
  const menu = document.getElementById('chatAttachMenu'); if (!menu) return;
  const open = menu.classList.toggle('hide') === false;
  document.getElementById('chatPlusBtn')?.classList.toggle('open', open);
  fitComposer();
};
function closeAttachMenu() {
  document.getElementById('chatAttachMenu')?.classList.add('hide');
  document.getElementById('chatPlusBtn')?.classList.remove('open');
  fitComposer();
}
window.chatPick = (type) => {
  closeAttachMenu();
  const inp = document.getElementById('chatFileInput');
  const camera = type === 'camera';
  pendingPickType(camera ? 'image' : type);
  inp.accept = (type === 'image' || camera) ? 'image/*' : type === 'video' ? 'video/*' : '*/*';
  if (camera) inp.setAttribute('capture', 'environment'); else inp.removeAttribute('capture');
  if (type === 'image' || type === 'file') inp.setAttribute('multiple', ''); else inp.removeAttribute('multiple');
  inp.value = ''; inp.click();
};
window.chatFilesChosen = async (e) => {
  const files = [...(e.target.files || [])]; if (!files.length) return;
  const pos = files.some(f => f.type.startsWith('image')) ? await currentPositionQuick().catch(() => null) : null;
  for (const file of files.slice(0, 12)) {
    const type = file.type.startsWith('image') ? 'image' : file.type.startsWith('video') ? 'video' : (C._pickType === 'video' ? 'video' : 'file');
    let blob = file, w, h;
    if (type === 'image') { try { const r = await compressImage(file); blob = r.blob; w = r.w; h = r.h; } catch {} }
    C.staged.push({ type, name: file.name, size: blob.size, mime: file.type, _blob: blob, w, h, geotag: type === 'image' && !!pos });
  }
  renderStaged();
  document.getElementById('chatInput')?.focus();
};
window.chatUnstage = (i) => { const a = C.staged.splice(i, 1)[0]; if (a?._preview) try { URL.revokeObjectURL(a._preview); } catch {} renderStaged(); };
window.chatSetPriority = (v) => {
  C.composerPriority = v; closeAttachMenu();
  const wrap = document.querySelector('.cm-inwrap'); if (!wrap) return;
  wrap.querySelector('.cm-prio-chip')?.remove();
  if (v !== 'normal') wrap.insertAdjacentHTML('afterbegin', `<button class="cm-prio-chip ${v}" onclick="chatSetPriority('normal')">${PRIORITIES.find(p => p[0] === v)[1]} ✕</button>`);
  document.querySelectorAll('.cm-attach-prio button').forEach(b => b.classList.toggle('on', b.getAttribute('onclick').includes(`'${v}'`)));
  fitComposer();
};
const INPUT_MAX = 132;   // ≈ 6 lines, then the field scrolls inside
window.chatInputResize = (ta, silent) => {
  ta.style.height = 'auto';
  ta.style.height = Math.min(INPUT_MAX, ta.scrollHeight) + 'px';
  ta.style.overflowY = ta.scrollHeight > INPUT_MAX ? 'auto' : 'hidden';
  fitComposer(); updateSendMode();
  if (!silent) { onMentionType(ta); broadcastTyping(); }
};
window.chatInputKey = (e) => {
  // Enter sends on a keyboard; on phones Enter is a new line (the Send button sends).
  const touch = matchMedia('(pointer: coarse)').matches;
  if (e.key === 'Enter' && !e.shiftKey && !touch && !mentionPopOpen()) { e.preventDefault(); window.chatSend(); }
};
window.chatSendOrMic = () => {
  const b = document.getElementById('chatSendBtn');
  const mode = b?.dataset.mode;
  if (mode === 'send') { b.classList.remove('fire'); void b.offsetWidth; b.classList.add('fire'); haptic(8); window.chatSend(); }
  else window.chatRecordVoice();
};

// image compression via canvas
function compressImage(file, max = 1600, quality = 0.72) {
  return new Promise((resolve, reject) => {
    const img = new Image(); const url = URL.createObjectURL(file);
    img.onload = () => {
      let { width: w, height: h } = img;
      if (w > max || h > max) { const s = max / Math.max(w, h); w = Math.round(w * s); h = Math.round(h * s); }
      const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
      cv.getContext('2d').drawImage(img, 0, 0, w, h);
      cv.toBlob(b => { URL.revokeObjectURL(url); b ? resolve({ blob: b, w, h }) : reject(new Error('compress failed')); }, 'image/jpeg', quality);
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('image load failed')); };
    img.src = url;
  });
}
function currentPositionQuick() {
  return new Promise((res) => {
    if (!navigator.geolocation) return res(null);
    navigator.geolocation.getCurrentPosition(p => res(p), () => res(null), { timeout: 4000, maximumAge: 60000 });
  });
}

// ── Location ──
window.chatShareLocation = async (live) => {
  closeAttachMenu();
  toast('Getting location…', 'info');
  const p = await new Promise((res) => navigator.geolocation
    ? navigator.geolocation.getCurrentPosition(x => res(x), () => res(null), { enableHighAccuracy: true, timeout: 8000 })
    : res(null));
  if (!p) return toast('Location unavailable', 'error');
  const loc = { lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy, live: !!live, label: '', expires_at: live ? new Date(Date.now() + 15 * 60000).toISOString() : null };
  C.staged = C.staged.filter(s => s.type !== 'location');
  C.staged.push({ type: 'location', name: live ? 'Live location' : 'Location', _location: loc });
  renderStaged();
};

// ── Voice recording: tap the mic to record, tap ■ to send, ✕ to discard ──
window.chatRecordVoice = async () => {
  closeAttachMenu();
  if (C.recorder) { return stopRecording(false); }
  let stream;
  try { stream = await navigator.mediaDevices.getUserMedia({ audio: true }); }
  catch { return toast('Microphone blocked', 'error'); }
  const rec = new MediaRecorder(stream);
  const chunks = []; const wf = []; const t0 = Date.now();
  let ac, analyser, raf;
  try {
    ac = new (window.AudioContext || window.webkitAudioContext)();
    const src = ac.createMediaStreamSource(stream); analyser = ac.createAnalyser(); analyser.fftSize = 256; src.connect(analyser);
    const buf = new Uint8Array(analyser.frequencyBinCount);
    const sample = () => {
      analyser.getByteTimeDomainData(buf); let sum = 0; for (const v of buf) { const d = (v - 128) / 128; sum += d * d; }
      const lvl = Math.min(1, Math.sqrt(sum / buf.length) * 2.2); wf.push(lvl);
      const live = document.getElementById('chatRecWave');
      if (live) { live.insertAdjacentHTML('beforeend', `<span style="height:${Math.max(12, Math.round(lvl * 100))}%"></span>`); if (live.children.length > 48) live.firstElementChild.remove(); }
      if (C.recorder) raf = requestAnimationFrame(() => setTimeout(sample, 80));
    };
    sample();
  } catch {}
  rec.ondataavailable = e => { if (e.data.size) chunks.push(e.data); };
  rec.onstop = () => {
    cancelAnimationFrame(raf); try { ac?.close(); } catch {}
    stream.getTracks().forEach(t => t.stop());
    const discard = C._recDiscard; C._recDiscard = false;
    C.recorder = null;
    document.getElementById('chatRecBar')?.remove();
    updateSendMode();
    if (discard) return;
    const blob = new Blob(chunks, { type: 'audio/webm' });
    const dur = (Date.now() - t0) / 1000;
    if (dur < 0.6) return toast('Hold on a little longer to record', 'info');
    const step = Math.max(1, Math.floor(wf.length / 32));
    const bars = []; for (let i = 0; i < wf.length; i += step) bars.push(Number(wf[i].toFixed(2)));
    C.staged.push({ type: 'audio', name: 'Voice ' + fmtDur(dur), size: blob.size, mime: 'audio/webm', dur, waveform: bars.slice(0, 40), _blob: blob });
    window.chatSend();
  };
  rec.start();
  C.recorder = rec;
  haptic(14);
  showRecBar(t0);
  updateSendMode();
};
function stopRecording(discard) { C._recDiscard = !!discard; try { C.recorder?.stop(); } catch {} }
window.chatDiscardVoice = () => stopRecording(true);
function showRecBar(t0) {
  const wrap = document.querySelector('.cm-inwrap'); if (!wrap) return;
  const bar = document.createElement('div'); bar.id = 'chatRecBar'; bar.className = 'cm-recbar';
  bar.innerHTML = `<button onclick="chatDiscardVoice()" aria-label="Discard">${ICONS.x}</button><span class="cm-rec-dot"></span><span id="chatRecTime">0:00</span><div class="cm-rec-wave" id="chatRecWave"></div>`;
  wrap.appendChild(bar);
  const iv = setInterval(() => { const t = document.getElementById('chatRecTime'); if (!t) return clearInterval(iv); t.textContent = fmtDur((Date.now() - t0) / 1000); }, 250);
}

// ── Voice playback: one shared <audio>, so it keeps playing across re-renders ──
function voiceEl(key) { return document.querySelector(`.cm-voice[data-key="${CSS.escape(key)}"]`); }
window.chatPlayAudio = (btn) => {
  const box = btn.closest('.cm-voice'); if (!box) return;
  const key = box.dataset.key, src = box.dataset.src;
  if (!src) return toast('Voice note is still uploading', 'info');
  if (C.audio && C.audio.key === key) {
    if (C.audio.el.paused) C.audio.el.play(); else C.audio.el.pause();
    return;
  }
  if (C.audio) { C.audio.el.pause(); voiceEl(C.audio.key)?.classList.remove('playing'); }
  const el = new Audio(src);
  el.playbackRate = C.audioRate || 1;
  C.audio = { key, el, p: 0 };
  const paint = () => { const v = voiceEl(key); if (!v) return; v.classList.toggle('playing', !el.paused); v.style.setProperty('--p', (C.audio.p * 100).toFixed(1) + '%');
    const d = v.querySelector('.cm-vdur'); if (d && el.duration && isFinite(el.duration)) d.textContent = fmtDur(el.paused && !C.audio.p ? el.duration : el.currentTime); };
  el.ontimeupdate = () => { if (el.duration && isFinite(el.duration)) C.audio.p = el.currentTime / el.duration; paint(); };
  el.onplay = el.onpause = paint;
  el.onended = () => { C.audio.p = 0; paint(); };
  el.play().catch(() => toast('Could not play this voice note', 'error'));
};
window.chatSeekAudio = (ev, wave) => {
  const box = wave.closest('.cm-voice');
  if (!C.audio || C.audio.key !== box.dataset.key || !C.audio.el.duration) return;
  const r = wave.getBoundingClientRect();
  C.audio.el.currentTime = Math.max(0, Math.min(1, (ev.clientX - r.left) / r.width)) * C.audio.el.duration;
};
window.chatVoiceSpeed = (btn) => {
  const rates = [1, 1.5, 2];
  C.audioRate = rates[(rates.indexOf(C.audioRate || 1) + 1) % rates.length];
  if (C.audio) C.audio.el.playbackRate = C.audioRate;
  document.querySelectorAll('.cm-vspeed').forEach(b => b.textContent = C.audioRate + '×');
};

// ── Photo viewer: swipe between a message's photos; Back closes it ──
window.chatLightbox = (msgId, idx) => {
  const m = findMsg(msgId); if (!m) return;
  const imgs = [...realAtts(m), ...((m._pending && m._rawAttachments) ? m._rawAttachments.map(previewAtt) : [])].filter(a => a.type === 'image' && a.url);
  if (!imgs.length) return;
  let i = Math.max(0, Math.min(idx, imgs.length - 1));
  const ov = document.createElement('div'); ov.id = 'chatLightboxOverlay'; ov.className = 'cm-lightbox';
  const close = () => { ov.classList.add('out'); setTimeout(() => ov.remove(), 180); };
  ov.__onBack = close;
  const paint = () => {
    ov.innerHTML = `<div class="cm-lb-top"><button data-a="x" aria-label="Close">${ICONS.x}</button><span>${esc(memberName(m.user_id))} · ${hhmm(m.created_at)}${imgs.length > 1 ? ` · ${i + 1}/${imgs.length}` : ''}</span><a href="${esc(imgs[i].url)}" download="${esc(imgs[i].name || 'photo.jpg')}" aria-label="Download">${ICONS.dl}</a></div>
      <img class="cm-lb-img" src="${esc(imgs[i].url)}" alt="">
      ${imgs.length > 1 ? `<button class="cm-lb-nav prev" data-a="p" aria-label="Previous">‹</button><button class="cm-lb-nav next" data-a="n" aria-label="Next">›</button>` : ''}`;
  };
  paint();
  ov.addEventListener('click', (e) => {
    const a = e.target.closest('[data-a]')?.dataset.a;
    if (a === 'x') close(); else if (a === 'p') { i = (i - 1 + imgs.length) % imgs.length; paint(); } else if (a === 'n') { i = (i + 1) % imgs.length; paint(); }
  });
  let sx = null;
  ov.addEventListener('pointerdown', e => { sx = e.clientX; }, { passive: true });
  ov.addEventListener('pointerup', e => { if (sx == null) return; const dx = e.clientX - sx; sx = null; if (Math.abs(dx) > 60 && imgs.length > 1) { i = (i + (dx < 0 ? 1 : -1) + imgs.length) % imgs.length; paint(); } }, { passive: true });
  document.body.appendChild(ov);
};

// ── Bottom sheet (message actions, notification settings) ──
function openSheet({ title = '', preview = '', items = [] }) {
  document.getElementById('chatSheetOverlay')?.remove();
  const ov = document.createElement('div'); ov.id = 'chatSheetOverlay'; ov.className = 'cm-sheet-ov';
  const close = () => { ov.classList.add('out'); setTimeout(() => ov.remove(), 200); };
  ov.__onBack = close;
  ov.innerHTML = `<div class="cm-sheet" role="dialog">${title ? `<div class="cm-sheet-t">${esc(title)}</div>` : ''}${preview}
    <div class="cm-sheet-list">${items.map((it, i) => it.sep ? '<hr>' : `<button data-i="${i}" class="${it.danger ? 'danger' : ''}${it.on ? ' on' : ''}"><span>${it.icon || ''}</span>${esc(it.label)}${it.on ? '<em>✓</em>' : ''}</button>`).join('')}</div></div>`;
  ov.addEventListener('click', (e) => {
    if (e.target === ov) return close();
    const b = e.target.closest('button[data-i]'); if (!b) return;
    const it = items[Number(b.dataset.i)]; close(); setTimeout(() => it.act && it.act(), 0);
  });
  document.body.appendChild(ov);
}
window.chatMsgActions = (id) => {
  const m = findMsg(id); if (!m) return;
  haptic(12);
  const mine = m.user_id === C.me?.id;
  const reads = (C.reads[m.id] || []).filter(r => r.user_id !== m.user_id);
  const items = [
    { icon: GLYPH.reply, label: 'Reply', act: () => setReply(m) },
    { icon: GLYPH.thread, label: 'Reply in thread', act: () => window.chatOpenThread(m.id) },
    m.body ? { icon: GLYPH.copy, label: 'Copy text', act: () => { navigator.clipboard?.writeText(m.body).then(() => toast('Copied', 'success')).catch(() => {}); } } : null,
    { icon: GLYPH.pinmsg, label: m.is_pinned ? 'Unpin' : 'Pin message', act: () => window.chatTogglePin(m.id) },
    { sep: true },
    ...CONVERT_TYPES.map(t => ({ icon: GLYPH[t.key], label: 'Make ' + t.short, act: () => window.chatConvert(m.id, t.key) })),
    mine ? { sep: true } : null,
    mine ? { icon: GLYPH.seen, label: reads.length ? `Seen by ${reads.map(r => memberName(r.user_id)).join(', ')}` : (m._pending ? 'Waiting to send' : 'Sent · not seen yet'), act: null } : null,
    mine ? { icon: GLYPH.trash, label: 'Delete', danger: true, act: () => window.chatDeleteMsg(m.id) } : null,
  ].filter(Boolean);
  const preview = `<div class="cm-sheet-prev" data-keep-emoji><b>${esc(mine ? 'You' : memberName(m.user_id))}</b><span>${esc((m.body || (realAtts(m)[0] ? attLabel(realAtts(m)[0]) : m.location ? '📍 Location' : '')).slice(0, 140))}</span></div>`;
  openSheet({ preview, items });
};
function attLabel(a) { return a.type === 'audio' ? '🎤 Voice message' : a.type === 'image' ? '📷 Photo' : a.type === 'video' ? '🎬 Video' : '📄 ' + (a.name || 'File'); }
window.chatNotifMenu = () => {
  const chan = C.channels.find(c => c.id === C.activeChannelId); if (!chan) return;
  const cur = (C.membership[chan.id] || {}).notif_pref || 'all';
  const opt = (v, icon, label) => ({ icon, label, on: cur === v, act: () => window.chatSetNotif(chan.id, v) });
  openSheet({ title: 'Notifications · ' + chan.name, items: [opt('all', GLYPH.bell, 'All messages'), opt('mentions', GLYPH.at, 'Only @mentions'), opt('priority', GLYPH.alert, 'Priority & safety only'), opt('none', GLYPH.mute, 'Mute')] });
};
window.chatToggleFind = () => {
  C._findOpen = !(C._findOpen || C.filters.query);
  if (!C._findOpen && C.filters.query) { C.filters.query = ''; renderChannelList(); renderMessages(); return; }
  document.getElementById('chatFind')?.classList.toggle('hide', !C._findOpen);
  fitComposer();
  if (C._findOpen) document.getElementById('chatFindInput')?.focus();
};

// ── Reply (quote) ──
function setReply(m) {
  const a = realAtts(m)[0];
  C.replyTo = { channel: m.channel_id, ref: m.id, who: m.user_id, text: (m.body || (a ? attLabel(a) : m.location ? '📍 Location' : '')).slice(0, 120) };
  renderReplyBar();
  document.getElementById('chatInput')?.focus();
}
window.chatCancelReply = () => { C.replyTo = null; renderReplyBar(); };

// ── Gestures: swipe right to reply (rubber-band + haptic), long-press for actions ──
const SWIPE_TH = 64, SWIPE_MAX = 96;
const rubber = (dx) => dx <= 0 ? 0 : dx < SWIPE_TH ? dx : Math.min(SWIPE_MAX, SWIPE_TH + (dx - SWIPE_TH) * 0.35);
/** After a long-press opens the sheet, the finger's release must not "click" the backdrop and close it. */
function swallowReleaseClick() {
  const eat = (e) => { e.stopPropagation(); e.preventDefault(); };
  document.addEventListener('click', eat, true);
  const done = () => setTimeout(() => document.removeEventListener('click', eat, true), 80);
  document.addEventListener('pointerup', done, { once: true, capture: true });
  document.addEventListener('pointercancel', done, { once: true, capture: true });
}
function attachGestures(box) {
  let g = null;
  const reset = () => { if (g?.timer) clearTimeout(g.timer); g = null; };
  box.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    const row = e.target.closest('.cm-row:not(.cm-typing)');
    if (!row || e.target.closest('a, button, video, audio, .cm-vwave')) return;
    // Their messages swipe right, mine swipe left (towards the middle), like WhatsApp.
    g = { row, col: row.querySelector('.cm-col'), ic: row.querySelector('.cm-swipe-ic'), dir: row.classList.contains('mine') ? -1 : 1, x: e.clientX, y: e.clientY, dx: 0, lock: null, armed: false, id: e.pointerId };
    if (e.pointerType !== 'mouse') g.timer = setTimeout(() => { if (g && !g.lock) { const id = g.row.dataset.id; reset(); swallowReleaseClick(); window.chatMsgActions(id); } }, 480);
  }, { passive: true });
  box.addEventListener('pointermove', (e) => {
    if (!g || e.pointerId !== g.id) return;
    const dx = (e.clientX - g.x) * g.dir, dy = e.clientY - g.y;
    if (!g.lock) {
      if (Math.hypot(dx, dy) < 8) return;
      clearTimeout(g.timer);
      if (e.pointerType === 'mouse' || dx <= 0 || Math.abs(dx) < Math.abs(dy) * 1.3) { reset(); return; }   // a scroll
      g.lock = 'x'; g.col.style.transition = 'none'; g.row.classList.add('swiping');
    }
    g.dx = rubber(dx);
    g.col.style.transform = `translate3d(${g.dx * g.dir}px,0,0)`;
    const p = Math.min(1, g.dx / SWIPE_TH);
    g.ic.style.opacity = p; g.ic.style.transform = `translateY(-50%) scale(${0.5 + p * 0.5})`;
    if (!g.armed && g.dx >= SWIPE_TH) { g.armed = true; g.ic.classList.add('armed'); haptic(10); }
    else if (g.armed && g.dx < SWIPE_TH) { g.armed = false; g.ic.classList.remove('armed'); }
  }, { passive: true });
  const end = () => {
    if (!g) return;
    clearTimeout(g.timer);
    if (g.lock) {
      const { col, ic, row, armed } = g;
      col.style.transition = 'transform .42s cubic-bezier(.2,1.5,.4,1)';   // spring back with a little overshoot
      col.style.transform = '';
      ic.style.transition = 'opacity .2s, transform .2s'; ic.style.opacity = 0; ic.classList.remove('armed');
      setTimeout(() => { row.classList.remove('swiping'); col.style.transition = ''; ic.style.transition = ''; }, 440);
      if (armed) { const m = findMsg(row.dataset.id); if (m) setReply(m); }
    }
    g = null;
  };
  box.addEventListener('pointerup', end, { passive: true });
  box.addEventListener('pointercancel', end, { passive: true });
  box.addEventListener('contextmenu', (e) => {
    const row = e.target.closest('.cm-row:not(.cm-typing)');
    if (!row || e.target.closest('a, video, audio')) return;
    e.preventDefault(); window.chatMsgActions(row.dataset.id);
  });
}

// ── Scrolling: "jump to latest" button with a count of messages that arrived below ──
function onMsgsScroll() {
  const box = document.getElementById('chatMsgs'), fab = document.getElementById('chatToBottom');
  if (!box || !fab) return;
  const gap = box.scrollHeight - box.scrollTop - box.clientHeight;
  // Only a reader's own scroll unpins from the latest message — not content growing under us.
  if (gap < 40) C._pin = true;
  else if (Date.now() - (C._userScrollAt || 0) < 1000) C._pin = false;
  const far = gap > 260;
  fab.classList.toggle('hide', !far);
  if (!far) { C.newBelow = 0; fab.querySelector('b')?.classList.add('hide'); }
}
window.chatScrollBottom = () => {
  const box = document.getElementById('chatMsgs'); if (!box) return;
  box.scrollTo({ top: box.scrollHeight, behavior: 'smooth' });
  C.newBelow = 0;
};
function bumpNewBelow() {
  const box = document.getElementById('chatMsgs'), fab = document.getElementById('chatToBottom');
  if (!box || !fab || fab.classList.contains('hide')) return;
  C.newBelow = (C.newBelow || 0) + 1;
  const b = fab.querySelector('b'); if (b) { b.textContent = C.newBelow; b.classList.remove('hide'); }
}
window.chatLoadOlder = () => {
  const box = document.getElementById('chatMsgs'); if (!box) return;
  const keep = box.scrollHeight - box.scrollTop;
  C.limit[C.activeChannelId] = (C.limit[C.activeChannelId] || PAGE) + PAGE;
  renderMessages({ keepHeight: keep });
};

// ── Typing indicator (Supabase broadcast; cloud mode only) ──
let _typingSentAt = 0;
function broadcastTyping() {
  if (!C.rtTyping || !C.activeChannelId) return;
  const now = Date.now(); if (now - _typingSentAt < 2500) return;
  _typingSentAt = now;
  try { C.rtTyping.send({ type: 'broadcast', event: 'typing', payload: { channel_id: C.activeChannelId, user_id: C.me?.id, name: C.me?.name } }); } catch {}
}
function onTypingEvent(p) {
  if (!p || p.user_id === C.me?.id) return;
  const t = (C.typing[p.channel_id] = C.typing[p.channel_id] || {});
  t[p.user_id] = { name: p.name || memberName(p.user_id), until: Date.now() + 4500 };
  updateTyping();
  clearTimeout(C._typingIv); C._typingIv = setTimeout(updateTyping, 4600);
}
function updateTyping() {
  const t = C.typing[C.activeChannelId] || {};
  const now = Date.now();
  const who = Object.values(t).filter(x => x.until > now).map(x => x.name);
  const sub = document.getElementById('chatHeadSub');
  if (sub) {
    sub.classList.toggle('typing', !!who.length);
    sub.textContent = who.length ? (who.length === 1 ? `${who[0]} is typing…` : `${who.length} people are typing…`) : (sub.dataset.base || '');
  }
  const row = document.getElementById('chatTypingRow');
  if (row) {
    const was = !row.classList.contains('hide');
    row.classList.toggle('hide', !who.length);
    const box = document.getElementById('chatMsgs');
    if (who.length && !was && box && box.scrollHeight - box.scrollTop - box.clientHeight < 160) box.scrollTop = box.scrollHeight;
  }
}

// ── Android Back: thread panel → conversation → channel list ──
window.chatHandleBack = () => {
  const view = document.getElementById('chatView');
  if (!view || view.classList.contains('hide')) return false;
  const panel = document.getElementById('chatThreadPanel');
  if (panel && !panel.classList.contains('hide')) { window.chatCloseThread(); return true; }
  const wrap = view.querySelector('.chat-wrap');
  if (wrap && wrap.dataset.pane === 'thread' && matchMedia('(max-width: 860px)').matches) { window.chatBackToList(); return true; }
  return false;
};

// ── @mentions ──
function mentionPopOpen() { return !document.getElementById('chatMentionPop')?.classList.contains('hide'); }
function onMentionType(ta) {
  const pop = document.getElementById('chatMentionPop'); if (!pop) return;
  const v = ta.value.slice(0, ta.selectionStart);
  const m = v.match(/@(\w*)$/);
  if (!m) { pop.classList.add('hide'); return; }
  const q = m[1].toLowerCase();
  const hits = C.members.filter(u => u.id !== C.me?.id && u.name.toLowerCase().includes(q)).slice(0, 6);
  if (!hits.length) { pop.classList.add('hide'); return; }
  pop.innerHTML = hits.map(u => `<button onclick="chatPickMention('${u.id}')"><span class="chat-av sm" style="background:${avatarColor(u.id)}">${initials(u.name)}</span>${esc(u.name)}</button>`).join('');
  pop.classList.remove('hide');
}
window.chatPickMention = (id) => {
  const ta = document.getElementById('chatInput'); if (!ta) return;
  const name = memberName(id);
  ta.value = ta.value.replace(/@(\w*)$/, '@' + name + ' ');
  document.getElementById('chatMentionPop')?.classList.add('hide');
  ta.focus();
};
window.chatOnSearch = (v) => {
  C.filters.query = v; renderChannelList();
  const focusFind = document.activeElement?.id === 'chatFindInput';
  renderMessages({ stick: true });
  if (focusFind) { const f = document.getElementById('chatFindInput'); if (f) { f.focus(); f.setSelectionRange(v.length, v.length); } }
};
window.chatSetSort = (v) => { C.sort = v; renderChannelList(); };
window.chatToggleFilters = () => { document.getElementById('chatFilters')?.classList.toggle('hide'); };
window.chatSetFilter = (k, v) => { C.filters[k] = v; paintShell(); document.getElementById('chatFilters')?.classList.remove('hide'); };

// ─────────────────────────────────────────────────────────────────────────────
// Sending
// ─────────────────────────────────────────────────────────────────────────────
function detectMentions(text) {
  const ids = [];
  C.members.forEach(u => { if (new RegExp('@' + u.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i').test(text)) ids.push(u.id); });
  return ids;
}
window.chatSend = async () => {
  const ta = document.getElementById('chatInput');
  const body = (ta?.value || '').trim();
  if (!body && !C.staged.length) return;
  const chan = C.channels.find(c => c.id === C.activeChannelId); if (!chan) return;
  const staged = C.staged; C.staged = [];
  if (ta) { ta.value = ''; ta.style.height = 'auto'; }
  const reply = C.replyTo && C.replyTo.channel === chan.id ? { type: 'reply', ref: C.replyTo.ref, who: C.replyTo.who, text: C.replyTo.text } : null;
  C.replyTo = null;

  const attachments = staged.filter(s => s.type !== 'location');
  const locStage = staged.find(s => s.type === 'location');
  const msg = {
    id: uid(), channel_id: chan.id, organization_id: C.orgId, user_id: C.me.id,
    parent_id: null, kind: 'text', body,
    priority: C.composerPriority, attachments: reply ? [reply] : [], mentions: detectMentions(body),
    location: locStage ? locStage._location : null, is_pinned: false, created_at: nowISO(), _pending: true,
    _rawAttachments: attachments,
  };
  (C.messages[chan.id] = C.messages[chan.id] || []).push(msg);
  C.composerPriority = 'normal';
  C._stick = true;
  renderMessages(); renderChannelList();
  document.getElementById('chatInput')?.focus({ preventScroll: true });

  try {
    await deliver(msg);
    msg._pending = false;
  } catch (e) {
    console.warn('[chat] send failed, queued', e);
    queueOutbox(msg);
    toast('Offline — message queued', 'warning');
  }
  delete msg._rawAttachments;
  renderMessages(); renderChannelList();
};

async function deliver(msg) {
  // upload attachments
  if ((msg._rawAttachments || []).length) {
    const uploaded = [];
    for (const a of msg._rawAttachments) uploaded.push(await uploadAttachment(msg.channel_id, a));
    // keep the quote-reply entry; add the uploaded files after it
    msg.attachments = [...(msg.attachments || []).filter(a => a.type === 'reply'), ...uploaded];
  }
  if (C.backend === 'cloud') {
    const sb = getSupabase();
    const payload = {
      id: msg.id, organization_id: C.orgId, channel_id: msg.channel_id, parent_id: msg.parent_id,
      user_id: msg.user_id, kind: msg.kind, body: msg.body, priority: msg.priority,
      attachments: msg.attachments, mentions: msg.mentions, location: msg.location,
      linked_record: msg.linked_record || null, is_pinned: msg.is_pinned, created_at: msg.created_at,
    };
    const { error } = await sb.from('chat_messages').insert(payload);
    if (error) throw error;
  } else {
    localPersist();
  }
}

async function uploadAttachment(channelId, a) {
  const meta = { type: a.type, name: a.name, size: a.size, mime: a.mime, dur: a.dur, waveform: a.waveform, w: a.w, h: a.h, geotag: a.geotag };
  if (!a._blob) return meta;
  if (C.backend === 'cloud') {
    const sb = getSupabase();
    const ext = (a.name?.split('.').pop() || (a.type === 'audio' ? 'webm' : a.type === 'image' ? 'jpg' : 'bin'));
    const path = `${C.orgId}/${channelId}/${uid()}.${ext}`;
    const { error } = await sb.storage.from('chat-media').upload(path, a._blob, { contentType: a.mime || 'application/octet-stream', upsert: false });
    if (error) throw error;
    meta.path = path;
    meta.url = await signedUrl(path);
  } else {
    meta.url = await blobToDataURL(a._blob);
  }
  return meta;
}
function blobToDataURL(blob) { return new Promise((res) => { const r = new FileReader(); r.onload = () => res(r.result); r.readAsDataURL(blob); }); }
async function signedUrl(path) {
  const c = SIGNED_URL_CACHE.get(path);
  if (c && c.exp > Date.now()) return c.url;
  try {
    const sb = getSupabase();
    const { data } = await sb.storage.from('chat-media').createSignedUrl(path, 3600);
    if (data?.signedUrl) { SIGNED_URL_CACHE.set(path, { url: data.signedUrl, exp: Date.now() + 3300000 }); return data.signedUrl; }
  } catch {}
  return '';
}

// ─────────────────────────────────────────────────────────────────────────────
// Offline outbox
// ─────────────────────────────────────────────────────────────────────────────
async function restoreOutbox() {
  try { C.outbox = (await idbGet(OUTBOX_KEY)) || JSON.parse(localStorage.getItem(OUTBOX_KEY) || '[]'); } catch { C.outbox = []; }
  if (C.outbox.length && isOnline()) flushOutbox();
}
function queueOutbox(msg) {
  // strip un-serializable blobs (already uploaded or kept as dataURL in fallback)
  const clean = { ...msg }; delete clean._rawAttachments;
  C.outbox.push(clean); persistOutbox();
}
function persistOutbox() {
  try { idbSet(OUTBOX_KEY, C.outbox); } catch {}
  try { localStorage.setItem(OUTBOX_KEY, JSON.stringify(C.outbox)); } catch {}
}
async function flushOutbox() {
  if (!C.outbox.length || C.backend !== 'cloud') return;
  const pending = [...C.outbox]; C.outbox = []; persistOutbox();
  for (const msg of pending) {
    try { msg._rawAttachments = []; await deliver(msg); }
    catch { C.outbox.push(msg); }
  }
  persistOutbox();
  renderMessages();
}

// ─────────────────────────────────────────────────────────────────────────────
// Channel actions
// ─────────────────────────────────────────────────────────────────────────────
window.chatOpenChannel = async (id) => {
  if (C.activeChannelId !== id) C.seenIds = new Set();
  C.activeChannelId = id; C.activeThreadId = null; C._stick = true;
  document.querySelector('.chat-wrap')?.setAttribute('data-pane', 'thread');
  await loadActive(); renderChannelList(); renderMessages();
};
window.chatBackToList = () => { document.querySelector('.chat-wrap')?.setAttribute('data-pane', 'list'); };
window.chatSetNotif = async (id, v) => {
  C.membership[id] = { ...(C.membership[id] || {}), notif_pref: v, channel_id: id };
  if (C.backend === 'cloud') {
    const sb = getSupabase();
    try { await sb.from('chat_channel_members').upsert({ channel_id: id, user_id: C.me.id, notif_pref: v, is_muted: v === 'none' }, { onConflict: 'channel_id,user_id' }); } catch {}
  } else localPersist();
  toast('Notifications: ' + v, 'info');
};
async function markChannelRead(id) {
  const at = nowISO();
  C.membership[id] = { ...(C.membership[id] || {}), last_read_at: at, channel_id: id };
  renderChannelList();
  if (C.backend === 'cloud') {
    const sb = getSupabase();
    try { await sb.from('chat_channel_members').upsert({ channel_id: id, user_id: C.me.id, last_read_at: at }, { onConflict: 'channel_id,user_id' }); } catch {}
    // mark visible messages read (receipts)
    const list = (C.messages[id] || []).filter(m => m.user_id !== C.me?.id).slice(-40);
    if (list.length) { try { await sb.from('chat_message_reads').upsert(list.map(m => ({ message_id: m.id, user_id: C.me.id, read_at: at })), { onConflict: 'message_id,user_id' }); } catch {} }
  } else localPersist();
}

window.chatNewChannel = async () => {
  const name = prompt('Channel name (e.g. "Electrical", "Zone B", "Gate Logistics"):');
  if (!name) return;
  const kinds = 'project, zone, trade, crew, safety, logistics, group';
  let kind = prompt('Type — one of: ' + kinds, 'trade') || 'trade';
  kind = kind.trim().toLowerCase(); if (!KIND_META[kind]) kind = 'general';
  const proj = state.projects?.find(p => p.id === state.currentProjectId) || state.projects?.[0];
  await createChannel({ name, kind, project_id: kind === 'group' ? null : (proj?.id || null), topic: '' });
  renderChannelList();
  toast('Channel created', 'success');
};
async function createChannel({ name, kind, project_id, topic }) {
  const ch = { id: uid(), organization_id: C.orgId, name, kind, project_id: project_id || null, topic: topic || '', icon: KIND_META[kind]?.icon || '💬', access_level: 'internal', is_archived: false, created_by: C.me?.id, created_at: nowISO() };
  if (C.backend === 'cloud') {
    const sb = getSupabase();
    try {
      const { data, error } = await sb.from('chat_channels').insert({ organization_id: C.orgId, name, kind, project_id: ch.project_id, topic: ch.topic, icon: ch.icon, created_by: C.me?.id }).select().single();
      if (!error && data) { C.channels.push(data); await sb.from('chat_channel_members').insert({ channel_id: data.id, user_id: C.me.id, role: 'owner' }); C.messages[data.id] = []; return data; }
    } catch (e) { console.warn('[chat] channel create failed', e); }
  }
  C.channels.push(ch); C.messages[ch.id] = []; localPersist(); return ch;
}

// ─────────────────────────────────────────────────────────────────────────────
// Message actions: pin / delete / thread / jump
// ─────────────────────────────────────────────────────────────────────────────
function findMsg(id) { for (const k in C.messages) { const m = (C.messages[k] || []).find(x => x.id === id); if (m) return m; } return null; }
window.chatTogglePin = async (id) => {
  const m = findMsg(id); if (!m) return; m.is_pinned = !m.is_pinned;
  if (C.backend === 'cloud') { try { await getSupabase().from('chat_messages').update({ is_pinned: m.is_pinned }).eq('id', id); } catch {} } else localPersist();
  renderMessages();
};
window.chatDeleteMsg = async (id) => {
  const m = findMsg(id); if (!m || m.user_id !== C.me?.id) return;
  if (!confirm('Delete this message? (An audit record is retained.)')) return;
  m.deleted_at = nowISO();
  if (C.backend === 'cloud') { try { await getSupabase().from('chat_messages').update({ deleted_at: m.deleted_at, body: '' }).eq('id', id); } catch {} } else localPersist();
  renderMessages(); renderChannelList();
};
window.chatJump = (id) => { const el = document.getElementById('m_' + id); if (el) { el.scrollIntoView({ behavior: 'smooth', block: 'center' }); el.classList.add('chat-flash'); setTimeout(() => el.classList.remove('chat-flash'), 1200); } };

window.chatOpenThread = async (parentId) => {
  const parent = findMsg(parentId); if (!parent) return;
  C.activeThreadId = parentId;
  const chan = C.channels.find(c => c.id === parent.channel_id);
  if (C.backend === 'cloud') {
    try { const { data } = await getSupabase().from('chat_messages').select('*').eq('parent_id', parentId).order('created_at', { ascending: true });
      (data || []).forEach(r => { if (!(C.messages[chan.id] || []).some(m => m.id === r.id)) C.messages[chan.id].push(r); }); } catch {}
  }
  const panel = document.getElementById('chatThreadPanel');
  const replies = (C.messages[chan.id] || []).filter(m => m.parent_id === parentId && !m.deleted_at);
  panel.classList.remove('hide');
  panel.innerHTML = `
    <div class="chat-thread-head"><b>Thread</b><button class="cm-hbtn" onclick="chatCloseThread()" aria-label="Close">${ICONS.x}</button></div>
    <div class="chat-thread-body">
      ${messageHTML(parent, chan)}
      <div class="chat-thread-sep">${replies.length} repl${replies.length === 1 ? 'y' : 'ies'}</div>
      ${replies.map(r => messageHTML(r, chan)).join('')}
    </div>
    <div class="chat-thread-composer">
      <textarea id="chatThreadInput" class="cm-input" rows="1" placeholder="Reply in thread…" oninput="this.style.height='auto';this.style.height=Math.min(132,this.scrollHeight)+'px'" onkeydown="if(event.key==='Enter'&&!event.shiftKey&&!matchMedia('(pointer: coarse)').matches){event.preventDefault();chatSendThread()}"></textarea>
      <button class="cm-sendbtn" data-mode="send" onclick="chatSendThread()" aria-label="Send">${ICONS.send}</button>
    </div>`;
};
window.chatCloseThread = () => { C.activeThreadId = null; document.getElementById('chatThreadPanel')?.classList.add('hide'); };
window.chatSendThread = async () => {
  const ta = document.getElementById('chatThreadInput'); const body = (ta?.value || '').trim(); if (!body) return;
  const parentId = C.activeThreadId; const parent = findMsg(parentId); if (!parent) return;
  ta.value = '';
  const msg = { id: uid(), channel_id: parent.channel_id, organization_id: C.orgId, user_id: C.me.id, parent_id: parentId, kind: 'text', body, priority: 'normal', attachments: [], mentions: detectMentions(body), is_pinned: false, created_at: nowISO(), _pending: true, _rawAttachments: [] };
  C.messages[parent.channel_id].push(msg);
  window.chatOpenThread(parentId);
  try { await deliver(msg); msg._pending = false; } catch { queueOutbox(msg); }
  window.chatOpenThread(parentId); renderMessages();
};

// ─────────────────────────────────────────────────────────────────────────────
// Convert to record (Task / RFI / Punch / Safety Observation / Daily Report)
// Chat-owned records (localStorage) + a system message with a back-link. Deep
// wiring into the Tasks/RFI modules is Phase 2 (see spec).
// ─────────────────────────────────────────────────────────────────────────────
const CONVERT_TYPES = [
  { key: 'task', label: '✅ Task', short: 'Task' }, { key: 'rfi', label: '❓ RFI', short: 'RFI' },
  { key: 'punch', label: '📋 Punch List', short: 'Punch List' }, { key: 'safety', label: '🦺 Safety Observation', short: 'Safety Observation' },
  { key: 'daily', label: '📄 Daily Report', short: 'Daily Report' },
];
window.chatConvertMenu = (id) => {
  const m = findMsg(id); if (!m) return;
  const menu = document.createElement('div'); menu.className = 'chat-convert-pop';
  menu.innerHTML = CONVERT_TYPES.map(t => `<button onclick="chatConvert('${id}','${t.key}')">${t.label}</button>`).join('') + `<button onclick="this.parentElement.remove()">Cancel</button>`;
  document.body.appendChild(menu);
  const el = document.getElementById('m_' + id); const r = el.getBoundingClientRect();
  menu.style.top = Math.min(window.innerHeight - 220, r.top + 20) + 'px'; menu.style.left = Math.min(window.innerWidth - 200, r.left + 40) + 'px';
  const close = (ev) => { if (!menu.contains(ev.target)) { menu.remove(); document.removeEventListener('click', close); } };
  setTimeout(() => document.addEventListener('click', close), 50);
};
window.chatConvert = async (id, type) => {
  document.querySelector('.chat-convert-pop')?.remove();
  const m = findMsg(id); if (!m) return;
  const meta = CONVERT_TYPES.find(t => t.key === type);
  const title = prompt(`${meta.short} title:`, (m.body || 'From chat').slice(0, 80));
  if (title === null) return;
  const chan = C.channels.find(c => c.id === m.channel_id);
  const rec = {
    id: uid(), type, title, source_message: id, channel_id: m.channel_id, project_id: chan?.project_id || null,
    body: m.body, attachments: m.attachments, location: m.location, priority: m.priority,
    created_by: C.me?.id, created_at: nowISO(),
  };
  let store = [];
  try { store = JSON.parse(localStorage.getItem(CONVERT_KEY) || '[]'); } catch {}
  store.push(rec);
  try { localStorage.setItem(CONVERT_KEY, JSON.stringify(store)); } catch {}
  m.linked_record = { module: meta.short, recordId: rec.id, title };
  // system confirmation message
  const sys = { id: uid(), channel_id: m.channel_id, organization_id: C.orgId, user_id: C.me.id, kind: 'system', body: `${memberName(C.me?.id)} converted a message into ${meta.short}: "${title}"`, priority: 'normal', attachments: [], mentions: [], created_at: nowISO(), _rawAttachments: [] };
  C.messages[m.channel_id].push(sys);
  if (C.backend === 'cloud') { try { await getSupabase().from('chat_messages').update({ linked_record: m.linked_record }).eq('id', id); await deliver(sys); } catch {} } else localPersist();
  renderMessages();
  toast(meta.short + ' created', 'success');
};

// expose entry
window.renderChat = renderChat;
