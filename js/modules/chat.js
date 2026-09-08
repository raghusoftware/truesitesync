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
  const palette = ['#2563eb', '#0891b2', '#7c3aed', '#db2777', '#ea580c', '#16a34a', '#0d9488', '#d97706', '#4f46e5'];
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
  // pull thread replies + reads lazily on demand; here load reads for these msgs
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
          if (row.channel_id === C.activeChannelId) { renderMessages(); markChannelRead(row.channel_id); }
          maybeNotify(row);
        } else if (p.eventType === 'UPDATE' && list) {
          const i = list.findIndex(m => m.id === row.id); if (i >= 0) list[i] = row;
          if (row.channel_id === C.activeChannelId) renderMessages();
        }
        renderChannelList();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'chat_channels', filter: `organization_id=eq.${C.orgId}` }, () => { cloudLoadChannels().then(renderChannelList); });
    ch.subscribe();
    C.rtChannel = ch;
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
      <aside class="chat-side">
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
      </aside>
      <section class="chat-main">
        ${setupHint}
        <div id="chatThread" class="chat-thread"></div>
      </section>
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
  if (!t && m.attachments?.length) { const a = m.attachments[0]; t = a.type === 'audio' ? '🎤 Voice message' : a.type === 'image' ? '📷 Photo' : a.type === 'video' ? '🎬 Video' : '📎 ' + (a.name || 'File'); }
  if (!t && m.location) t = '📍 Location';
  if (m.kind === 'system') t = m.body;
  return { text: t.slice(0, 60), at: fmtTime(m.created_at) };
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
    return `<button class="chat-ch ${active}" onclick="chatOpenChannel('${c.id}')">
      <span class="chat-ch-ic">${c.icon || meta.icon}</span>
      <span class="chat-ch-body">
        <span class="chat-ch-top"><span class="chat-ch-name">${esc(c.name)}</span><span class="chat-ch-time">${pv.at}</span></span>
        <span class="chat-ch-sub">${esc(pv.text)}</span>
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
// ─────────────────────────────────────────────────────────────────────────────
function passesFilter(m) {
  const f = C.filters;
  if (f.media) { if (!(m.attachments || []).some(a => a.type === f.media)) return false; }
  if (f.priority) { if (m.priority !== f.priority) return false; }
  if (f.hasAttachment && !(m.attachments || []).length) return false;
  if (f.hasLocation && !m.location) return false;
  if (f.mentions && !(m.mentions || []).includes(C.me?.id)) return false;
  if (f.query) {
    const hay = (m.body || '') + ' ' + (m.attachments || []).map(a => a.name || '').join(' ') + ' ' + memberName(m.user_id);
    if (!hay.toLowerCase().includes(f.query.trim().toLowerCase())) return false;
  }
  return true;
}
function renderMessages() {
  const el = document.getElementById('chatThread');
  if (!el) return;
  const chan = C.channels.find(c => c.id === C.activeChannelId);
  if (!chan) { el.innerHTML = `<div class="chat-empty">Select a channel to start.</div>`; return; }
  const all = (C.messages[chan.id] || []).filter(m => !m.deleted_at).filter(passesFilter);
  const pins = (C.messages[chan.id] || []).filter(m => m.is_pinned && !m.deleted_at);
  const meta = KIND_META[chan.kind] || KIND_META.general;
  const mem = C.membership[chan.id] || {};
  el.innerHTML = `
    <div class="chat-head">
      <button class="chat-back" onclick="chatBackToList()" title="Back">‹</button>
      <div class="chat-head-ic">${chan.icon || meta.icon}</div>
      <div class="chat-head-info">
        <div class="chat-head-name">${esc(chan.name)}</div>
        <div class="chat-head-sub">${meta.label}${chan.topic ? ' · ' + esc(chan.topic) : ''}</div>
      </div>
      <select class="chat-mini" title="Notifications" onchange="chatSetNotif('${chan.id}',this.value)">
        ${['all', 'mentions', 'priority', 'none'].map(v => `<option value="${v}" ${(mem.notif_pref || 'all') === v ? 'selected' : ''}>${({ all: '🔔 All', mentions: '@ Mentions', priority: '⚠️ Priority', none: '🔕 Muted' })[v]}</option>`).join('')}
      </select>
    </div>
    ${pins.length ? `<div class="chat-pins">📌 ${pins.length} pinned${pins.slice(0, 1).map(p => ` · <span class="chat-pin-prev" onclick="chatJump('${p.id}')">${esc((p.body || 'attachment').slice(0, 60))}</span>`).join('')}</div>` : ''}
    <div id="chatMsgs" class="chat-msgs">${all.length ? all.map(m => messageHTML(m, chan)).join('') : `<div class="chat-empty">No messages match. Say something 👋</div>`}</div>
    ${composerHTML(chan)}`;
  const box = document.getElementById('chatMsgs');
  if (box) box.scrollTop = box.scrollHeight;
  renderStaged();
}

function highlightBody(text, mentions) {
  let html = esc(text || '');
  // @mentions
  (mentions || []).forEach(id => {
    const n = memberName(id);
    html = html.replace(new RegExp('@' + n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'), `<span class="chat-mention">@${esc(n)}</span>`);
  });
  // safety keywords
  const low = html.toLowerCase();
  if (SAFETY_KEYWORDS.some(k => low.includes(k))) {
    SAFETY_KEYWORDS.forEach(k => {
      html = html.replace(new RegExp('\\b(' + k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ')\\b', 'gi'), '<span class="chat-safety-word">$1</span>');
    });
  }
  return html.replace(/\n/g, '<br>');
}

function messageHTML(m, chan) {
  if (m.kind === 'system') return `<div class="chat-sys" id="m_${m.id}">${esc(m.body)}</div>`;
  const mine = m.user_id === C.me?.id;
  const name = memberName(m.user_id);
  const prio = m.priority && m.priority !== 'normal' ? `chat-prio-${m.priority}` : '';
  const flag = m.priority === 'safety' ? `<span class="chat-flag safety">🦺 SAFETY ALERT</span>` :
    m.priority === 'urgent' ? `<span class="chat-flag urgent">⚠️ URGENT</span>` :
      m.priority === 'high' ? `<span class="chat-flag high">▲ HIGH</span>` : '';
  const replies = (C.messages[chan.id] || []).filter(x => x.parent_id === m.id && !x.deleted_at);
  const reads = (C.reads[m.id] || []).filter(r => r.user_id !== m.user_id);
  const status = m._pending ? '<span class="chat-tick pending">🕒</span>' : (mine ? `<span class="chat-tick" title="${reads.length} read">✓✓ ${reads.length || ''}</span>` : '');
  const conv = m.linked_record ? `<div class="chat-linked">🔗 ${esc(m.linked_record.module)}: ${esc(m.linked_record.title || '')}</div>` : '';
  return `
  <div class="chat-msg ${mine ? 'mine' : ''} ${prio}" id="m_${m.id}">
    ${mine ? '' : `<div class="chat-av" style="background:${avatarColor(m.user_id)}">${initials(name)}</div>`}
    <div class="chat-bubble-wrap">
      <div class="chat-meta">${mine ? '' : `<span class="chat-name">${esc(name)}</span>`}${flag}<span class="chat-when">${fmtTime(m.created_at)}${m.edited_at ? ' · edited' : ''}</span></div>
      <div class="chat-bubble">
        ${m.body ? `<div class="chat-text">${highlightBody(m.body, m.mentions)}</div>` : ''}
        ${(m.attachments || []).map(a => attachmentHTML(a, m)).join('')}
        ${m.location ? locationHTML(m.location) : ''}
        ${conv}
      </div>
      <div class="chat-msg-foot">
        <button class="chat-link-btn" onclick="chatOpenThread('${m.id}')">${replies.length ? '💬 ' + replies.length + ' repl' + (replies.length > 1 ? 'ies' : 'y') : 'Reply'}</button>
        <button class="chat-link-btn" onclick="chatTogglePin('${m.id}')">${m.is_pinned ? '📌 Unpin' : 'Pin'}</button>
        <button class="chat-link-btn" onclick="chatConvertMenu('${m.id}')">Convert ▾</button>
        ${mine ? `<button class="chat-link-btn danger" onclick="chatDeleteMsg('${m.id}')">Delete</button>` : ''}
        ${status}
      </div>
    </div>
  </div>`;
}

function attachmentHTML(a, m) {
  const src = a.url || '';
  if (a.type === 'image') return `<a class="chat-att-img" href="${esc(src)}" target="_blank" rel="noopener"><img loading="lazy" src="${esc(src)}" alt="${esc(a.name || 'photo')}">${a.geotag ? '<span class="chat-geo">📍</span>' : ''}</a>`;
  if (a.type === 'video') return `<video class="chat-att-vid" src="${esc(src)}" controls preload="metadata"></video>`;
  if (a.type === 'audio') return audioHTML(a);
  return `<a class="chat-att-file" href="${esc(src)}" target="_blank" rel="noopener" download="${esc(a.name || '')}"><span class="chat-file-ic">${fileIcon(a.name)}</span><span class="chat-file-meta"><span class="chat-file-name">${esc(a.name || 'File')}</span><span class="chat-file-size">${fmtBytes(a.size)}</span></span><span class="chat-file-dl">⬇</span></a>`;
}
function fileIcon(name) {
  const ext = (name || '').split('.').pop().toLowerCase();
  if (['pdf'].includes(ext)) return '📕'; if (['xls', 'xlsx', 'csv'].includes(ext)) return '📊';
  if (['doc', 'docx'].includes(ext)) return '📘'; if (['dwg', 'dxf'].includes(ext)) return '📐';
  if (['zip', 'rar'].includes(ext)) return '🗜️'; return '📄';
}
function audioHTML(a) {
  const bars = (a.waveform && a.waveform.length ? a.waveform : Array.from({ length: 32 }, () => 0.3 + Math.random() * 0.7));
  const wf = bars.map(v => `<span style="height:${Math.max(10, Math.round(v * 100))}%"></span>`).join('');
  return `<div class="chat-audio"><button class="chat-audio-play" onclick="chatPlayAudio(this,'${esc(a.url)}')">▶</button><div class="chat-wave">${wf}</div><span class="chat-audio-dur">${fmtDur(a.dur)}</span></div>`;
}
function locationHTML(loc) {
  const q = `${loc.lat},${loc.lng}`;
  return `<a class="chat-loc" href="https://www.google.com/maps?q=${q}" target="_blank" rel="noopener">
    <span class="chat-loc-pin">📍</span>
    <span class="chat-loc-body"><b>${loc.live ? 'Live location' : 'Location pin'}</b><small>${loc.label ? esc(loc.label) + ' · ' : ''}${loc.lat.toFixed(5)}, ${loc.lng.toFixed(5)}${loc.accuracy ? ' · ±' + Math.round(loc.accuracy) + 'm' : ''}</small></span>
    <span class="chat-loc-open">Open map ›</span></a>`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Composer
// ─────────────────────────────────────────────────────────────────────────────
function composerHTML(chan) {
  const pr = C.composerPriority;
  return `
  <div class="chat-composer">
    <div id="chatStaged" class="chat-staged hide"></div>
    <div class="chat-composer-row">
      <div class="chat-attach">
        <button class="chat-fab-btn" title="Attach" onclick="chatToggleAttachMenu(event)">＋</button>
        <div id="chatAttachMenu" class="chat-attach-menu hide">
          <button onclick="chatPick('image')">📷 Photo</button>
          <button onclick="chatPick('video')">🎬 Video</button>
          <button onclick="chatPick('file')">📎 File</button>
          <button onclick="chatRecordVoice()">🎤 Voice</button>
          <button onclick="chatShareLocation(false)">📍 Location pin</button>
          <button onclick="chatShareLocation(true)">🛰️ Live location</button>
        </div>
      </div>
      <select class="chat-prio-sel chat-prio-${pr}" title="Priority" onchange="chatSetPriority(this.value)">
        <option value="normal" ${pr === 'normal' ? 'selected' : ''}>Normal</option>
        <option value="high" ${pr === 'high' ? 'selected' : ''}>▲ High</option>
        <option value="urgent" ${pr === 'urgent' ? 'selected' : ''}>⚠️ Urgent</option>
        <option value="safety" ${pr === 'safety' ? 'selected' : ''}>🦺 Safety</option>
      </select>
      <div class="chat-input-wrap">
        <textarea id="chatInput" class="chat-input" rows="1" placeholder="Message ${esc(chan.name)}…  (@ to mention)" oninput="chatInputResize(this)" onkeydown="chatInputKey(event)"></textarea>
        <div id="chatMentionPop" class="chat-mention-pop hide"></div>
      </div>
      <button class="chat-send" onclick="chatSend()" title="Send">➤</button>
    </div>
    <input type="file" id="chatFileInput" class="hide" onchange="chatFilesChosen(event)">
  </div>`;
}
function renderStaged() {
  const el = document.getElementById('chatStaged');
  if (!el) return;
  if (!C.staged.length) { el.classList.add('hide'); el.innerHTML = ''; return; }
  el.classList.remove('hide');
  el.innerHTML = C.staged.map((a, i) => `<div class="chat-stage-chip">${a.type === 'image' ? '📷' : a.type === 'video' ? '🎬' : a.type === 'audio' ? '🎤' : a.type === 'location' ? '📍' : '📎'} ${esc((a.name || a.type).slice(0, 20))}<button onclick="chatUnstage(${i})">✕</button></div>`).join('');
}

// ─────────────────────────────────────────────────────────────────────────────
// Composer actions (window-bound)
// ─────────────────────────────────────────────────────────────────────────────
function pendingPickType(t) { C._pickType = t; }
window.chatToggleAttachMenu = (e) => { e?.stopPropagation(); document.getElementById('chatAttachMenu')?.classList.toggle('hide'); };
window.chatPick = (type) => {
  document.getElementById('chatAttachMenu')?.classList.add('hide');
  const inp = document.getElementById('chatFileInput');
  pendingPickType(type);
  inp.accept = type === 'image' ? 'image/*' : type === 'video' ? 'video/*' : '*/*';
  if (type === 'image') inp.setAttribute('capture', 'environment'); else inp.removeAttribute('capture');
  inp.value = ''; inp.click();
};
window.chatFilesChosen = async (e) => {
  const file = e.target.files?.[0]; if (!file) return;
  const type = C._pickType || (file.type.startsWith('image') ? 'image' : file.type.startsWith('video') ? 'video' : 'file');
  toast('Preparing ' + type + '…', 'info');
  let blob = file, w, h;
  if (type === 'image') {
    try { const r = await compressImage(file); blob = r.blob; w = r.w; h = r.h; } catch {}
  }
  const att = { type, name: file.name, size: blob.size, mime: file.type, _blob: blob, w, h };
  if (type === 'image') { try { att.geotag = !!(await currentPositionQuick()); } catch {} }
  C.staged.push(att); renderStaged();
};
window.chatUnstage = (i) => { C.staged.splice(i, 1); renderStaged(); };
window.chatSetPriority = (v) => { C.composerPriority = v; document.querySelector('.chat-prio-sel')?.setAttribute('class', 'chat-prio-sel chat-prio-' + v); };
window.chatInputResize = (ta) => { ta.style.height = 'auto'; ta.style.height = Math.min(140, ta.scrollHeight) + 'px'; onMentionType(ta); };
window.chatInputKey = (e) => {
  if (e.key === 'Enter' && !e.shiftKey && !mentionPopOpen()) { e.preventDefault(); window.chatSend(); }
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
  document.getElementById('chatAttachMenu')?.classList.add('hide');
  toast('Getting location…', 'info');
  const p = await new Promise((res) => navigator.geolocation
    ? navigator.geolocation.getCurrentPosition(x => res(x), () => res(null), { enableHighAccuracy: true, timeout: 8000 })
    : res(null));
  if (!p) return toast('Location unavailable', 'error');
  const loc = { lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy, live: !!live, label: '', expires_at: live ? new Date(Date.now() + 15 * 60000).toISOString() : null };
  C.staged.push({ type: 'location', name: live ? 'Live location' : 'Location', _location: loc });
  renderStaged();
  toast(live ? 'Live location staged (15 min)' : 'Location pin staged', 'success');
};

// ── Voice recording ──
window.chatRecordVoice = async () => {
  document.getElementById('chatAttachMenu')?.classList.add('hide');
  if (C.recorder) { return stopRecording(); }
  let stream;
  try { stream = await navigator.mediaDevices.getUserMedia({ audio: true }); }
  catch { return toast('Microphone blocked', 'error'); }
  const rec = new MediaRecorder(stream);
  const chunks = []; const wf = []; const t0 = Date.now();
  // waveform sampling
  let ac, analyser, raf;
  try {
    ac = new (window.AudioContext || window.webkitAudioContext)();
    const src = ac.createMediaStreamSource(stream); analyser = ac.createAnalyser(); analyser.fftSize = 256; src.connect(analyser);
    const buf = new Uint8Array(analyser.frequencyBinCount);
    const sample = () => { analyser.getByteTimeDomainData(buf); let sum = 0; for (const v of buf) { const d = (v - 128) / 128; sum += d * d; } wf.push(Math.min(1, Math.sqrt(sum / buf.length) * 2.2)); if (C.recorder) raf = requestAnimationFrame(() => setTimeout(sample, 80)); };
    sample();
  } catch {}
  rec.ondataavailable = e => { if (e.data.size) chunks.push(e.data); };
  rec.onstop = () => {
    cancelAnimationFrame(raf); try { ac?.close(); } catch {}
    stream.getTracks().forEach(t => t.stop());
    const blob = new Blob(chunks, { type: 'audio/webm' });
    const dur = (Date.now() - t0) / 1000;
    const step = Math.max(1, Math.floor(wf.length / 32));
    const bars = []; for (let i = 0; i < wf.length; i += step) bars.push(Number(wf[i].toFixed(2)));
    C.staged.push({ type: 'audio', name: 'Voice ' + fmtDur(dur), size: blob.size, mime: 'audio/webm', dur, waveform: bars.slice(0, 40), _blob: blob });
    C.recorder = null; renderStaged();
    document.getElementById('chatRecBar')?.remove();
    toast('Voice message ready — press send', 'success');
  };
  rec.start();
  C.recorder = rec;
  showRecBar(t0);
};
function stopRecording() { try { C.recorder?.stop(); } catch {} }
function showRecBar(t0) {
  const comp = document.querySelector('.chat-composer'); if (!comp) return;
  const bar = document.createElement('div'); bar.id = 'chatRecBar'; bar.className = 'chat-rec-bar';
  bar.innerHTML = `<span class="chat-rec-dot"></span> Recording <span id="chatRecTime">0:00</span> <button onclick="chatRecordVoice()">Stop</button>`;
  comp.prepend(bar);
  const iv = setInterval(() => { const t = document.getElementById('chatRecTime'); if (!t) return clearInterval(iv); t.textContent = fmtDur((Date.now() - t0) / 1000); }, 300);
}
window.chatPlayAudio = (btn, url) => {
  document.querySelectorAll('audio[data-chat]').forEach(a => { a.pause(); });
  let a = btn._audio;
  if (!a) { a = new Audio(url); a.dataset.chat = '1'; btn._audio = a; a.onended = () => btn.textContent = '▶'; }
  if (a.paused) { a.play(); btn.textContent = '⏸'; } else { a.pause(); btn.textContent = '▶'; }
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
window.chatOnSearch = (v) => { C.filters.query = v; renderChannelList(); renderMessages(); };
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
  renderStaged();

  const attachments = staged.filter(s => s.type !== 'location');
  const locStage = staged.find(s => s.type === 'location');
  const msg = {
    id: uid(), channel_id: chan.id, organization_id: C.orgId, user_id: C.me.id,
    parent_id: C.activeThreadId || null, kind: 'text', body,
    priority: C.composerPriority, attachments: [], mentions: detectMentions(body),
    location: locStage ? locStage._location : null, is_pinned: false, created_at: nowISO(), _pending: true,
    _rawAttachments: attachments,
  };
  (C.messages[chan.id] = C.messages[chan.id] || []).push(msg);
  C.composerPriority = 'normal';
  renderMessages(); renderChannelList();

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
  const uploaded = [];
  for (const a of (msg._rawAttachments || [])) {
    uploaded.push(await uploadAttachment(msg.channel_id, a));
  }
  msg.attachments = uploaded;
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
  C.activeChannelId = id; C.activeThreadId = null;
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
    <div class="chat-thread-head"><b>Thread</b><button class="chat-icon-btn" onclick="chatCloseThread()">✕</button></div>
    <div class="chat-thread-body">
      ${messageHTML(parent, chan)}
      <div class="chat-thread-sep">${replies.length} repl${replies.length === 1 ? 'y' : 'ies'}</div>
      ${replies.map(r => messageHTML(r, chan)).join('')}
    </div>
    <div class="chat-thread-composer">
      <textarea id="chatThreadInput" class="chat-input" rows="1" placeholder="Reply in thread…" onkeydown="if(event.key==='Enter'&&!event.shiftKey){event.preventDefault();chatSendThread()}"></textarea>
      <button class="chat-send" onclick="chatSendThread()">➤</button>
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
