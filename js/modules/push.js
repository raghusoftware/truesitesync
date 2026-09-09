/**
 * ═══════════════════════════════════════════════════════════
 * True Site Sync — Web Push (client)
 * ═══════════════════════════════════════════════════════════
 * Registers the push-only service worker and lets a user opt in to browser
 * push notifications. Subscriptions are stored in state.pushSubscriptions
 * (org-synced via module_data) so the send-push edge function can read them.
 *
 * Web push works in browsers (desktop + Android Chrome). The packaged Android
 * (Capacitor) app needs FCM instead — registration is skipped there.
 * ═══════════════════════════════════════════════════════════
 */

import { state, saveAllData } from './state.js';
import { getCurrentUser } from './rbac.js';

// VAPID public key (safe to embed). The matching private key lives only in the
// send-push edge function's env (VAPID_PRIVATE_KEY).
const VAPID_PUBLIC_KEY = 'BMoj9QhBSXNbtnmakiYW7ve-LVxeoSb3yy4lMNChUqnMcI74X9bVuXALq4smU75pIMTSme8F_Oa-EihO1LjffvI';

const _supported = () => typeof navigator !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && !window.Capacitor;
function _me() { try { return getCurrentUser() || {}; } catch { return {}; } }

function _urlB64ToUint8(base64) {
  const padding = '='.repeat((4 - base64.length % 4) % 4);
  const b64 = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(b64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

let _reg = null;
export async function initPush() {
  if (!_supported()) return;
  try {
    _reg = await navigator.serviceWorker.register('/sw.js');
    // If the user already granted permission before, make sure a live subscription
    // is stored (endpoints can rotate).
    if (Notification.permission === 'granted') { try { await _subscribe(); } catch {} }
  } catch (e) { /* SW registration failed — push simply stays off */ }
  _refreshToggle();
}
window.initPush = initPush;

async function _subscribe() {
  if (!_reg) _reg = await navigator.serviceWorker.ready;
  let sub = await _reg.pushManager.getSubscription();
  if (!sub) {
    sub = await _reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: _urlB64ToUint8(VAPID_PUBLIC_KEY) });
  }
  _storeSubscription(sub);
  return sub;
}

function _storeSubscription(sub) {
  if (!sub) return;
  const j = sub.toJSON();
  const u = _me();
  if (!Array.isArray(state.pushSubscriptions)) state.pushSubscriptions = [];
  const existing = state.pushSubscriptions.find(s => s.endpoint === j.endpoint);
  const rec = {
    id: existing?.id || ('sub_' + Date.now()),
    userId: u.id || null, supaId: u.supabaseId || null, email: u.email || null,
    endpoint: j.endpoint, keys: j.keys || {}, ua: (navigator.userAgent || '').slice(0, 160),
    createdAt: existing?.createdAt || Date.now()
  };
  if (existing) Object.assign(existing, rec); else state.pushSubscriptions.push(rec);
  // cap
  if (state.pushSubscriptions.length > 300) state.pushSubscriptions = state.pushSubscriptions.slice(-300);
  saveAllData();
}

/** Called from a UI toggle — asks permission then subscribes. */
window.enablePush = async function () {
  if (!_supported()) { window.showToast && window.showToast('Push is not supported in this app — use email/in-app instead', 'warning'); return; }
  try {
    const perm = await Notification.requestPermission();
    if (perm !== 'granted') { window.showToast && window.showToast('Notifications blocked — allow them in your browser settings', 'warning'); _refreshToggle(); return; }
    await _subscribe();
    window.showToast && window.showToast('Push notifications enabled on this device', 'success');
  } catch (e) { window.showToast && window.showToast('Could not enable push notifications', 'error'); }
  _refreshToggle();
};

window.disablePush = async function () {
  try {
    if (!_reg) _reg = await navigator.serviceWorker.ready;
    const sub = await _reg.pushManager.getSubscription();
    if (sub) {
      const ep = sub.endpoint;
      await sub.unsubscribe();
      state.pushSubscriptions = (state.pushSubscriptions || []).filter(s => s.endpoint !== ep);
      saveAllData();
    }
    window.showToast && window.showToast('Push disabled on this device', 'success');
  } catch {}
  _refreshToggle();
};

/** Reflect current push state on an optional toggle button (#pushToggleBtn). */
function _refreshToggle() {
  const btn = document.getElementById('pushToggleBtn');
  if (!btn) return;
  if (!_supported()) { btn.style.display = 'none'; return; }
  const on = Notification.permission === 'granted';
  btn.textContent = on ? '🔔 Push on' : '🔕 Enable push';
  btn.onclick = on ? window.disablePush : window.enablePush;
}
window._refreshPushToggle = _refreshToggle;
