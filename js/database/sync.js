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

import { getSupabase } from './supabase.js';

// ── Debounce map to avoid flooding Supabase on rapid saves ──
const _pendingSaves = {};
const DEBOUNCE_MS = 1500;

// ── Online status ──
let _online = navigator.onLine;
const _dirtyKeys = new Set();

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
  if (_pendingSaves[dataKey]) clearTimeout(_pendingSaves[dataKey]);
  _pendingSaves[dataKey] = setTimeout(() => {
    delete _pendingSaves[dataKey];
    _pushKey(dataKey, value);
  }, DEBOUNCE_MS);
}

/**
 * Immediate push (no debounce) — for critical saves like auth data
 */
export async function syncPushImmediate(dataKey, value) {
  return _pushKey(dataKey, value);
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
    data.forEach(row => { result[row.data_key] = row.data; });
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
