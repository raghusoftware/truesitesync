/**
 * ═══════════════════════════════════════════════════════════
 * True Site Sync — Offline-First Sync Engine
 * ═══════════════════════════════════════════════════════════
 * localStorage stays the source of truth for instant reads.
 * Supabase is the durable cloud backend.
 *
 * Flow:
 *   LOAD  → try Supabase first, merge with localStorage, write both
 *   SAVE  → write localStorage immediately, async push to Supabase
 *   PULL  → fetch latest from Supabase and overwrite local
 * ═══════════════════════════════════════════════════════════
 */

import { getSupabase, SUPABASE_URL, SUPABASE_ANON_KEY } from './supabase.js';

// ── Debounce map to avoid flooding Supabase on rapid saves ──
const _pendingSaves = {};          // dataKey -> timer id
const _pendingValues = {};         // dataKey -> latest value not yet pushed
const DEBOUNCE_MS = 1500;

// ── Online status ──
let _online = navigator.onLine;
const _dirtyKeys = new Set();

// ── Push gating: never push to cloud until the initial pull has completed,
//    so a freshly-opened (stale) tab can't overwrite newer cloud data. ──
let _syncReady = false;
const _queuedKeys = new Set();
const _localTs = {};               // dataKey -> last local-change time (ms)
const _lastJson = {};              // dataKey -> JSON of last value seen (dirty check)

/** Record a key's current value as the synced baseline WITHOUT pushing it.
 *  Called after adopting the cloud copy so an unchanged key isn't re-pushed
 *  (which would clobber a newer cloud copy from another device). */
export function seedSyncBaseline(key, value) {
  try { _lastJson[key] = JSON.stringify(value); } catch {}
}

function _getLocalTs(key) {
  if (_localTs[key]) return _localTs[key];
  try { const s = localStorage.getItem('mes_ts_' + key); return s ? parseInt(s) : 0; } catch { return 0; }
}
function _setLocalTs(key, ms) {
  _localTs[key] = ms;
  try { localStorage.setItem('mes_ts_' + key, String(ms)); } catch {}
}
export function getLocalKeyTs(key) { return _getLocalTs(key); }
export function setLocalKeyTs(key, ms) { _setLocalTs(key, ms); }

/** Called once the initial cloud pull is done — releases queued pushes. */
export function markSyncReady() {
  if (_syncReady) return;
  _syncReady = true;
  const keys = [..._queuedKeys]; _queuedKeys.clear();
  keys.forEach(k => {
    const v = _pendingValues[k];
    if (v === undefined) return;
    delete _pendingValues[k];
    _pushKey(k, v);
  });
}
// Safety: never block local-only / offline users forever.
setTimeout(() => markSyncReady(), 15000);

window.addEventListener('online', () => {
  _online = true;
  _flushDirty();
});
window.addEventListener('offline', () => { _online = false; });

/**
 * Get the current authenticated user ID, or null
 */
function _uid() {
  const sb = getSupabase();
  if (!sb) return null;
  // Supabase stores session in localStorage — read synchronously
  try {
    const storageKey = Object.keys(localStorage).find(k => k.startsWith('sb-') && k.endsWith('-auth-token'));
    if (storageKey) {
      const session = JSON.parse(localStorage.getItem(storageKey));
      return session?.user?.id || session?.currentSession?.user?.id || null;
    }
  } catch {}
  return null;
}

/**
 * Get user ID asynchronously (more reliable)
 */
async function _uidAsync() {
  const sb = getSupabase();
  if (!sb) return null;
  try {
    const { data } = await sb.auth.getUser();
    return data?.user?.id || null;
  } catch { return null; }
}

// ════════════════════════════════════════════════
//  PUSH — Save one key to Supabase (upsert)
// ════════════════════════════════════════════════

async function _pushKey(dataKey, value) {
  const sb = getSupabase();
  if (!sb || !_online) {
    _dirtyKeys.add(dataKey);
    return false;
  }
  const userId = await _uidAsync();
  if (!userId) { _dirtyKeys.add(dataKey); return false; }

  try {
    const { error } = await sb
      .from('user_data')
      .upsert({
        user_id: userId,
        data_key: dataKey,
        data: value,
        updated_at: new Date().toISOString()
      }, { onConflict: 'user_id,data_key' });

    if (error) {
      console.warn(`[sync] push ${dataKey} failed:`, error.message);
      _dirtyKeys.add(dataKey);
      return false;
    }
    _dirtyKeys.delete(dataKey);
    return true;
  } catch (e) {
    console.warn(`[sync] push ${dataKey} error:`, e);
    _dirtyKeys.add(dataKey);
    return false;
  }
}

/**
 * Debounced save — call this from saveAllData / individual saves.
 * Writes localStorage immediately, queues Supabase push.
 */
export function syncPush(dataKey, value) {
  // Dirty check: skip keys that haven't actually changed since the last
  // push/load. saveAllData() pushes every key on every save, so without this a
  // stale tab would keep re-pushing (and clobbering) data it never touched.
  let json;
  try { json = JSON.stringify(value); } catch { json = null; }
  if (json !== null && _lastJson[dataKey] === json) return;
  if (json !== null) _lastJson[dataKey] = json;
  _pendingValues[dataKey] = value;
  _setLocalTs(dataKey, Date.now());
  // Hold all cloud pushes until the first pull finishes — prevents a stale tab
  // from overwriting newer cloud data before it has loaded it.
  if (!_syncReady) { _queuedKeys.add(dataKey); return; }
  if (_pendingSaves[dataKey]) clearTimeout(_pendingSaves[dataKey]);
  _pendingSaves[dataKey] = setTimeout(() => {
    delete _pendingSaves[dataKey];
    const v = _pendingValues[dataKey];
    delete _pendingValues[dataKey];
    _pushKey(dataKey, v);
  }, DEBOUNCE_MS);
}

/**
 * Immediate push (no debounce) — for critical saves like auth data
 */
export async function syncPushImmediate(dataKey, value) {
  return _pushKey(dataKey, value);
}

// ════════════════════════════════════════════════
//  FLUSH ON EXIT — never lose the last edit
// ════════════════════════════════════════════════

/** Read the current access token synchronously from the stored session. */
function _accessToken() {
  try {
    const k = Object.keys(localStorage).find(x => x.startsWith('sb-') && x.endsWith('-auth-token'));
    if (!k) return null;
    const s = JSON.parse(localStorage.getItem(k));
    return s?.access_token || s?.currentSession?.access_token || null;
  } catch { return null; }
}

/**
 * Flush every pending/dirty change immediately. Used when the app is being
 * hidden or closed so the last edit is never stuck in the debounce window.
 * Uses fetch keepalive so the request survives page unload.
 */
export function flushPendingSaves() {
  const userId = _uid();
  const token = _accessToken();
  if (!userId || !token) return;

  // Gather everything not yet persisted: debounced values + offline dirty keys.
  const rows = [];
  const seen = new Set();
  const add = (key, value) => {
    if (value === undefined || seen.has(key)) return;
    seen.add(key);
    rows.push({ user_id: userId, data_key: key, data: value, updated_at: new Date().toISOString() });
  };

  for (const key of Object.keys(_pendingValues)) {
    if (_pendingSaves[key]) { clearTimeout(_pendingSaves[key]); delete _pendingSaves[key]; }
    add(key, _pendingValues[key]);
    delete _pendingValues[key];
  }
  for (const key of [..._dirtyKeys]) {
    try {
      const raw = localStorage.getItem(_localStorageKey(key));
      if (raw !== null) add(key, JSON.parse(raw));
    } catch {}
  }

  if (!rows.length) return;

  try {
    fetch(`${SUPABASE_URL}/rest/v1/user_data?on_conflict=user_id,data_key`, {
      method: 'POST',
      keepalive: true, // survives the page being closed
      headers: {
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        'Prefer': 'resolution=merge-duplicates'
      },
      body: JSON.stringify(rows)
    }).then(() => { _dirtyKeys.clear(); }).catch(() => {});
  } catch {}
}

// Flush whenever the page is hidden (tab switch, app backgrounded, or closing).
// visibilitychange:hidden is the most reliable lifecycle hook across browsers/mobile.
if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flushPendingSaves();
  });
  window.addEventListener('pagehide', flushPendingSaves);
}

// ════════════════════════════════════════════════
//  PULL — Load one key from Supabase
// ════════════════════════════════════════════════

export async function syncPull(dataKey) {
  const sb = getSupabase();
  if (!sb || !_online) return null;
  const userId = await _uidAsync();
  if (!userId) return null;

  try {
    const { data, error } = await sb
      .from('user_data')
      .select('data, updated_at')
      .eq('user_id', userId)
      .eq('data_key', dataKey)
      .maybeSingle();

    if (error) { console.warn(`[sync] pull ${dataKey}:`, error.message); return null; }
    return data ? data.data : null;
  } catch { return null; }
}

// ════════════════════════════════════════════════
//  FULL SYNC — Pull all keys, merge with local
// ════════════════════════════════════════════════

/**
 * Pull all user data from Supabase.
 * Returns { [dataKey]: value } or null on failure.
 */
export async function syncPullAll() {
  const sb = getSupabase();
  if (!sb || !_online) return null;
  const userId = await _uidAsync();
  if (!userId) return null;

  try {
    const { data, error } = await sb
      .from('user_data')
      .select('data_key, data, updated_at')
      .eq('user_id', userId);

    if (error) { console.warn('[sync] pullAll:', error.message); return null; }
    if (!data || !data.length) return {};

    const result = {};
    data.forEach(row => { result[row.data_key] = { data: row.data, updatedAt: row.updated_at }; });
    return result;
  } catch { return null; }
}

/**
 * Push ALL state keys to Supabase (bulk).
 * Used after initial migration or backup restore.
 */
export async function syncPushAll(stateObj, storageKeys) {
  const sb = getSupabase();
  if (!sb || !_online) return false;
  const userId = await _uidAsync();
  if (!userId) return false;

  const rows = [];
  for (const [key, storageKey] of Object.entries(storageKeys)) {
    if (stateObj[key] !== undefined) {
      rows.push({
        user_id: userId,
        data_key: key,
        data: stateObj[key],
        updated_at: new Date().toISOString()
      });
    }
  }

  // Upsert in batches of 20 to avoid payload limits
  const BATCH = 20;
  for (let i = 0; i < rows.length; i += BATCH) {
    const batch = rows.slice(i, i + BATCH);
    try {
      const { error } = await sb
        .from('user_data')
        .upsert(batch, { onConflict: 'user_id,data_key' });
      if (error) console.warn('[sync] pushAll batch error:', error.message);
    } catch (e) {
      console.warn('[sync] pushAll batch exception:', e);
    }
  }
  _dirtyKeys.clear();
  return true;
}

// ════════════════════════════════════════════════
//  FLUSH DIRTY — Push offline changes when back online
// ════════════════════════════════════════════════

async function _flushDirty() {
  if (!_dirtyKeys.size) return;
  const keys = [..._dirtyKeys];
  for (const key of keys) {
    try {
      const raw = localStorage.getItem(_localStorageKey(key));
      if (raw !== null) {
        const val = JSON.parse(raw);
        await _pushKey(key, val);
      }
    } catch {}
  }
}

// Map state keys to their localStorage keys (inverse of STORAGE_KEYS)
const _lsKeyMap = {};
function _localStorageKey(stateKey) {
  // Lazy-build from STORAGE_KEYS passed during init
  return _lsKeyMap[stateKey] || `mes_${stateKey}`;
}

/**
 * Register localStorage key mapping so flush can find the right keys
 */
export function registerStorageKeys(storageKeys) {
  for (const [stateKey, lsKey] of Object.entries(storageKeys)) {
    _lsKeyMap[stateKey] = lsKey;
  }
}

// ════════════════════════════════════════════════
//  SYNC STATUS — For UI indicators
// ════════════════════════════════════════════════

export function getSyncStatus() {
  return {
    online: _online,
    dirtyCount: _dirtyKeys.size,
    dirtyKeys: [..._dirtyKeys]
  };
}

export function isOnline() { return _online; }
