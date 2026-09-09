/**
 * ═══════════════════════════════════════════════════════════
 * True Site Sync — Notifications
 * ═══════════════════════════════════════════════════════════
 * In-app notification centre (bell + dropdown), org-synced through the
 * normal module_data channel (state.notifications), so a notification
 * created on one device reaches the recipient on theirs. On create we
 * also best-effort dispatch email + web-push via edge functions
 * (send-notification / send-push) — both degrade silently if not
 * configured, so the app never breaks when they're absent.
 * ═══════════════════════════════════════════════════════════
 */

import { state, saveAllData } from './state.js';
import { getCurrentUser } from './rbac.js';
import { getSupabase } from '../database/supabase.js';
import { getOrgId } from '../database/sync.js';

const _uid = () => 'ntf_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7);
const _esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
function _me() { try { return getCurrentUser() || {}; } catch { return {}; } }
function _ago(ts) {
  if (!ts) return '';
  const s = Math.max(0, Math.round((Date.now() - ts) / 1000));
  if (s < 60) return 'just now';
  const m = Math.floor(s / 60); if (m < 60) return m + 'm ago';
  const h = Math.floor(m / 60); if (h < 24) return h + 'h ago';
  const d = Math.floor(h / 24); if (d < 7) return d + 'd ago';
  return new Date(ts).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}

/** Is this notification addressed to the current user? Matches on rbac id, auth uid, or email. */
function _isMine(n) {
  const u = _me(); if (!u) return false;
  return (n.recipientId && n.recipientId === u.id)
    || (n.recipientSupaId && n.recipientSupaId === u.supabaseId)
    || (n.recipientEmail && u.email && n.recipientEmail.toLowerCase() === (u.email || '').toLowerCase());
}
function _mine() {
  return (state.notifications || []).filter(_isMine).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
}

/**
 * Create a notification for a recipient and deliver it.
 * @param {{userId?:string, supaId?:string, email?:string, name?:string}} recipient
 * @param {{type?:string, title:string, body?:string, data?:object}} payload
 */
export function notify(recipient, payload) {
  recipient = recipient || {};
  const u = _me();
  const n = {
    id: _uid(), type: payload.type || 'info', title: payload.title || '', body: payload.body || '',
    data: payload.data || {},
    recipientId: recipient.userId || null, recipientSupaId: recipient.supaId || null,
    recipientEmail: recipient.email || null, recipientName: recipient.name || '',
    actorId: u.id || '', actorName: u.name || u.email || 'Someone',
    read: false, createdAt: Date.now()
  };
  if (!Array.isArray(state.notifications)) state.notifications = [];
  state.notifications.push(n);
  if (state.notifications.length > 500) state.notifications = state.notifications.slice(-500); // keep it light
  saveAllData();
  try { renderNotifications(); } catch {}
  _dispatchExternal(n, recipient);
  return n;
}
window.notify = notify;

/** Best-effort email + push. Never throws into the caller. */
async function _dispatchExternal(n, recipient) {
  const sb = getSupabase(); if (!sb) return;
  const orgId = (() => { try { return getOrgId(); } catch { return null; } })();
  if (recipient.email) {
    try { await sb.functions.invoke('send-notification', { body: { to: recipient.email, subject: n.title, title: n.title, body: n.body, orgId } }); } catch {}
  }
  if (recipient.userId || recipient.supaId) {
    try { await sb.functions.invoke('send-push', { body: { recipientId: recipient.userId, recipientSupaId: recipient.supaId, title: n.title, body: n.body, data: n.data, orgId } }); } catch {}
  }
}

window._notifMarkRead = function (id) {
  const n = (state.notifications || []).find(x => x.id === id);
  if (n && !n.read) { n.read = true; saveAllData(); }
  renderNotifications();
};
window._notifMarkAllRead = function () {
  let changed = false;
  _mine().forEach(n => { if (!n.read) { n.read = true; changed = true; } });
  if (changed) saveAllData();
  renderNotifications();
};
window._notifOpen = function (id) {
  const n = (state.notifications || []).find(x => x.id === id);
  if (n && !n.read) { n.read = true; saveAllData(); }
  _panelOpen = false;
  renderNotifications();
  // Optional deep-link (e.g. open the petty cash section that raised it)
  if (n && n.data && n.data.view && typeof window.switchView === 'function') {
    try { window.switchView(n.data.view); } catch {}
    if (n.data.pcOpen && typeof window._pcOpen === 'function') { try { window._pcOpen(n.data.pcOpen); } catch {} }
  }
};
window._notifToggle = function () { _panelOpen = !_panelOpen; renderNotifications(); };

let _panelOpen = false;

export function renderNotifications() {
  const mount = document.getElementById('notifBellMount');
  if (!mount) return;
  const mine = _mine();
  const unread = mine.filter(n => !n.read).length;
  const badge = unread > 0
    ? `<span style="position:absolute;top:-4px;right:-4px;min-width:16px;height:16px;padding:0 4px;background:#dc2626;color:#fff;border-radius:9px;font-size:9px;font-weight:800;display:flex;align-items:center;justify-content:center;box-shadow:0 0 0 2px #fff;">${unread > 99 ? '99+' : unread}</span>`
    : '';
  const rows = mine.slice(0, 40).map(n => `
    <div onclick="_notifOpen('${n.id}')" style="padding:11px 14px;border-bottom:1px solid #f1f5f9;cursor:pointer;display:flex;gap:10px;background:${n.read ? '#fff' : '#f0fdf4'};">
      <div style="width:8px;flex-shrink:0;display:flex;justify-content:center;padding-top:5px;">${n.read ? '' : '<span style="width:7px;height:7px;border-radius:50%;background:#10b981;display:block;"></span>'}</div>
      <div style="min-width:0;flex:1;">
        <div style="font-weight:700;color:#0f172a;font-size:13px;">${_esc(n.title)}</div>
        ${n.body ? `<div style="font-size:12px;color:#64748b;margin-top:1px;">${_esc(n.body)}</div>` : ''}
        <div style="font-size:10px;color:#94a3b8;margin-top:3px;">${_esc(n.actorName)} · ${_ago(n.createdAt)}</div>
      </div>
    </div>`).join('') || '<div style="padding:28px 14px;text-align:center;color:#94a3b8;font-size:13px;">No notifications yet.</div>';

  const panel = _panelOpen ? `
    <div style="position:absolute;top:34px;right:0;width:340px;max-width:90vw;max-height:70vh;overflow:auto;background:#fff;border:1px solid #e2e8f0;border-radius:14px;box-shadow:0 24px 60px rgba(0,0,0,.22);z-index:200000;">
      <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;padding:12px 14px;border-bottom:1px solid #f1f5f9;position:sticky;top:0;background:#fff;">
        <span style="font-weight:800;color:#0f172a;font-size:14px;">Notifications</span>
        <span style="display:flex;gap:6px;align-items:center;">
          <button id="pushToggleBtn" onclick="event.stopPropagation();" style="border:1px solid #e2e8f0;background:#f8fafc;color:#475569;border-radius:8px;padding:4px 10px;font-size:11px;font-weight:700;cursor:pointer;">🔕 Enable push</button>
          ${unread > 0 ? `<button onclick="event.stopPropagation();_notifMarkAllRead()" style="border:none;background:#ecfdf5;color:#047857;border-radius:8px;padding:4px 10px;font-size:11px;font-weight:700;cursor:pointer;">Mark all read</button>` : ''}
        </span>
      </div>
      ${rows}
    </div>` : '';

  mount.innerHTML = `
    <button onclick="event.stopPropagation();_notifToggle()" title="Notifications" style="position:relative;border:1px solid #e2e8f0;background:#fff;border-radius:9999px;width:30px;height:30px;display:inline-flex;align-items:center;justify-content:center;cursor:pointer;font-size:15px;">🔔${badge}</button>
    ${panel}`;
  if (_panelOpen) { try { window._refreshPushToggle && window._refreshPushToggle(); } catch {} }
}
window.renderNotifications = renderNotifications;

// Close the panel when clicking outside it.
if (typeof document !== 'undefined') {
  document.addEventListener('click', (e) => {
    if (!_panelOpen) return;
    const mount = document.getElementById('notifBellMount');
    if (mount && !mount.contains(e.target)) { _panelOpen = false; renderNotifications(); }
  });
  // Render once the DOM is ready, then refresh periodically so notifications that
  // sync in from another device (via module_data) surface without a reload.
  const _boot = () => { try { renderNotifications(); } catch {} };
  if (document.readyState !== 'loading') _boot(); else document.addEventListener('DOMContentLoaded', _boot);
  setInterval(() => { if (!_panelOpen) { try { renderNotifications(); } catch {} } }, 25000);
}
