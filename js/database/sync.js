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

/** True if this key has local changes that haven't been confirmed pushed yet
 *  (queued, debounced, or dirty). Used by the pull/merge logic so we only keep
 *  the local copy when there's a genuine un-synced edit — otherwise the cloud
 *  copy always wins, guaranteeing every device converges. */
export function hasPendingPush(key) {
  return _dirtyKeys.has(key) || _queuedKeys.has(key) || (_pendingValues[key] !== undefined);
}

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

// ── Realtime: apply changes made by other devices/tabs the instant they land ──
let _rtChannel = null;
export async function startRealtime(applyFn) {
  try {
    const sb = getSupabase();
    if (!sb || _rtChannel) return;
    const orgId = await _resolveOrg();
    if (!orgId) return;
    // Org-wide channel: every teammate's change on any module lands instantly.
    _rtChannel = sb.channel('rt_module_data_' + orgId)
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'module_data', filter: `organization_id=eq.${orgId}` },
        (payload) => {
          try {
            const row = payload.new && payload.new.module_name ? payload.new : null;
            if (!row) return;
            const key = row.module_name;
            let incomingJson;
            try { incomingJson = JSON.stringify(row.payload); } catch { return; }
            if (_lastJson[key] === incomingJson) return;           // our own echo
            const incomingTs = Date.parse(row.updated_at) || Date.now();
            if (incomingTs <= _getLocalTs(key)) return;            // not newer than local
            _lastJson[key] = incomingJson;
            _setLocalTs(key, incomingTs);
            if (typeof applyFn === 'function') applyFn(key, row.payload);
          } catch (e) { console.warn('[rt] apply error:', e); }
        })
      .subscribe((status) => { if (status === 'SUBSCRIBED') console.log('[rt] org realtime sync active'); });
  } catch (e) { console.warn('[rt] start failed:', e); }
}
export function stopRealtime() {
  try { if (_rtChannel) { getSupabase()?.removeChannel(_rtChannel); _rtChannel = null; } } catch {}
}
if (typeof window !== 'undefined') { window.startRealtime = startRealtime; window.stopRealtime = stopRealtime; window.flushPendingSaves = flushPendingSaves; }

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
//  ORGANIZATION RESOLUTION — org-shared sync via module_data
//  Every member of the same company shares one live dataset.
// ════════════════════════════════════════════════
let _orgId = null;
let _orgResolving = null;
/** Resolve (and cache) the current user's organization id; create one on first use. */
async function _resolveOrg() {
  if (_orgId) return _orgId;
  if (_orgResolving) return _orgResolving;       // de-dupe concurrent callers
  _orgResolving = (async () => {
    const sb = getSupabase();
    if (!sb) return null;
    const userId = await _uidAsync();
    if (!userId) return null;
    try {
      const { data } = await sb.from('org_members')
        .select('org_id').eq('user_id', userId).eq('is_active', true).limit(1).maybeSingle();
      if (data && data.org_id) {
        _orgId = data.org_id;
      } else {
        // No membership yet. First, accept any pending invite → join that company's
        // shared org. Only if there's no invite do we create a brand-new org.
        try {
          const { data: joinedOrg } = await sb.rpc('accept_pending_invites');
          if (joinedOrg) _orgId = joinedOrg;
        } catch (e) { console.warn('[sync] accept invite failed:', e); }

        if (!_orgId) {
          let email = null; try { const { data: u } = await sb.auth.getUser(); email = u?.user?.email || null; } catch {}
          const nm = (email || 'My Company').split('@')[0];
          const { data: newOrg, error } = await sb.rpc('create_org_with_owner', { p_name: nm, p_email: email });
          if (!error && newOrg) _orgId = newOrg;
          else console.warn('[sync] org create failed:', error && error.message);
        }
      }
    } catch (e) { console.warn('[sync] org resolve failed:', e); }
    if (_orgId) { try { localStorage.setItem('mes_org_id', _orgId); } catch {} }
    return _orgId;
  })();
  const r = await _orgResolving; _orgResolving = null; return r;
}
/** Best-effort synchronous org id (for unload flush) from the in-memory/local cache. */
function _orgIdSync() {
  if (_orgId) return _orgId;
  try { return localStorage.getItem('mes_org_id'); } catch { return null; }
}
export function getOrgId() { return _orgIdSync(); }
if (typeof window !== 'undefined') window.getSyncOrgId = getOrgId;

// ════════════════════════════════════════════════
//  PUSH — Save one key to Supabase (upsert)
// ════════════════════════════════════════════════

// ── Batched save→sync feedback ────────────────────────────────────────────
// Every save pushes to Supabase. We collect the results of a burst of pushes
// and, ~900ms after the last one settles, tell the UI once: "synced" or "error".
let _batchOk = 0, _batchErr = 0, _batchTimer = null;
function _reportPush(ok) {
  if (ok) _batchOk++; else _batchErr++;
  if (_batchTimer) clearTimeout(_batchTimer);
  _batchTimer = setTimeout(() => {
    const ok = _batchOk, err = _batchErr;
    _batchOk = 0; _batchErr = 0; _batchTimer = null;
    if (typeof window !== 'undefined' && typeof window._onSyncBatch === 'function') {
      try { window._onSyncBatch({ ok: err === 0, okCount: ok, errCount: err }); } catch {}
    }
  }, 900);
}

async function _pushKey(dataKey, value) {
  const sb = getSupabase();
  if (!sb || !_online) {
    _dirtyKeys.add(dataKey);
    _reportPush(false);
    return false;
  }
  const orgId = await _resolveOrg();
  const userId = await _uidAsync();
  if (!orgId || !userId) { _dirtyKeys.add(dataKey); _reportPush(false); return false; }

  try {
    // Org-shared store: one row per (org, module key). Everyone in the company
    // reads/writes the same row, so data syncs across all their devices.
    const { error } = await sb
      .from('module_data')
      .upsert({
        organization_id: orgId,
        module_name: dataKey,
        record_id: dataKey,
        payload: value,
        updated_by: userId
      }, { onConflict: 'organization_id,module_name,record_id' });

    if (error) {
      console.warn(`[sync] push ${dataKey} failed:`, error.message);
      _dirtyKeys.add(dataKey);
      _reportPush(false);
      return false;
    }
    _dirtyKeys.delete(dataKey);
    _reportPush(true);
    return true;
  } catch (e) {
    console.warn(`[sync] push ${dataKey} error:`, e);
    _dirtyKeys.add(dataKey);
    _reportPush(false);
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
  const orgId = _orgIdSync();
  if (!userId || !token || !orgId) return;

  // Gather everything not yet persisted: debounced values + offline dirty keys.
  const rows = [];
  const seen = new Set();
  const add = (key, value) => {
    if (value === undefined || seen.has(key)) return;
    seen.add(key);
    rows.push({ organization_id: orgId, module_name: key, record_id: key, payload: value, updated_by: userId, updated_at: new Date().toISOString() });
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
    fetch(`${SUPABASE_URL}/rest/v1/module_data?on_conflict=organization_id,module_name,record_id`, {
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
  const orgId = await _resolveOrg();
  if (!orgId) return null;

  try {
    const { data, error } = await sb
      .from('module_data')
      .select('payload, updated_at')
      .eq('organization_id', orgId)
      .eq('module_name', dataKey)
      .eq('record_id', dataKey)
      .maybeSingle();

    if (error) { console.warn(`[sync] pull ${dataKey}:`, error.message); return null; }
    return data ? data.payload : null;
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
  const orgId = await _resolveOrg();
  if (!orgId) return null;

  try {
    const { data, error } = await sb
      .from('module_data')
      .select('module_name, payload, updated_at')
      .eq('organization_id', orgId);

    if (error) { console.warn('[sync] pullAll:', error.message); return null; }
    if (!data || !data.length) return {};

    const result = {};
    data.forEach(row => { result[row.module_name] = { data: row.payload, updatedAt: row.updated_at }; });
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
  const orgId = await _resolveOrg();
  const userId = await _uidAsync();
  if (!orgId || !userId) return false;

  const rows = [];
  for (const [key, storageKey] of Object.entries(storageKeys)) {
    if (stateObj[key] !== undefined) {
      rows.push({
        organization_id: orgId,
        module_name: key,
        record_id: key,
        payload: stateObj[key],
        updated_by: userId,
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
        .from('module_data')
        .upsert(batch, { onConflict: 'organization_id,module_name,record_id' });
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
