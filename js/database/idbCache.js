/**
 * ═══════════════════════════════════════════════════════════
 * True Site Sync — IndexedDB overflow cache
 * ───────────────────────────────────────────────────────────
 * localStorage is capped at ~5 MB per origin. When a dataset (e.g. a sheet with
 * embedded photos) is too big to fit, we store THAT key here instead — IndexedDB
 * holds hundreds of MB. This is a fallback only: small keys still use localStorage
 * for speed, and the cloud remains the source of truth. All calls are best-effort
 * and never throw (private mode / disabled IDB simply no-ops).
 * ═══════════════════════════════════════════════════════════
 */
const DB_NAME = 'mes_cache';
const STORE = 'kv';
let _dbPromise = null;

function _open() {
  if (_dbPromise) return _dbPromise;
  _dbPromise = new Promise((resolve, reject) => {
    try {
      if (typeof indexedDB === 'undefined') return reject(new Error('no-idb'));
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => { try { req.result.createObjectStore(STORE); } catch {} };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error || new Error('idb-open-failed'));
    } catch (e) { reject(e); }
  }).catch(e => { _dbPromise = null; throw e; });
  return _dbPromise;
}

/** Store a string value under `key`. Resolves true on success, false otherwise. */
export async function idbSet(key, value) {
  try {
    const db = await _open();
    return await new Promise((resolve) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put(value, key);
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => resolve(false);
      tx.onabort = () => resolve(false);
    });
  } catch { return false; }
}

/** Read the string value for `key`, or undefined if absent/unavailable. */
export async function idbGet(key) {
  try {
    const db = await _open();
    return await new Promise((resolve) => {
      const tx = db.transaction(STORE, 'readonly');
      const rq = tx.objectStore(STORE).get(key);
      rq.onsuccess = () => resolve(rq.result);
      rq.onerror = () => resolve(undefined);
    });
  } catch { return undefined; }
}

/** Remove a key (best-effort). */
export async function idbRemove(key) {
  try {
    const db = await _open();
    return await new Promise((resolve) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).delete(key);
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => resolve(false);
    });
  } catch { return false; }
}
