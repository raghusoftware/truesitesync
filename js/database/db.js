/**
 * ═══════════════════════════════════════════════════════════
 * True Site Sync — IndexedDB Database Layer
 * ═══════════════════════════════════════════════════════════
 * Provides IndexedDB caching for report data snapshots,
 * saved report configurations, and dashboard preferences.
 * Falls back gracefully to localStorage if IDB unavailable.
 * ═══════════════════════════════════════════════════════════
 */

const DB_NAME = 'TRUESITEOS_REPORTS';
const DB_VERSION = 1;

const STORES = {
  reportCache: 'reportCache',
  savedReports: 'savedReports',
  dashPrefs: 'dashPrefs',
  reportHistory: 'reportHistory',
};

let _db = null;

function openDB() {
  return new Promise((resolve, reject) => {
    if (_db) return resolve(_db);
    if (!window.indexedDB) return reject(new Error('IndexedDB not supported'));
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(STORES.reportCache)) {
        const rc = db.createObjectStore(STORES.reportCache, { keyPath: 'id' });
        rc.createIndex('reportId', 'reportId', { unique: false });
        rc.createIndex('timestamp', 'timestamp', { unique: false });
      }
      if (!db.objectStoreNames.contains(STORES.savedReports)) {
        const sr = db.createObjectStore(STORES.savedReports, { keyPath: 'id' });
        sr.createIndex('reportId', 'reportId', { unique: false });
      }
      if (!db.objectStoreNames.contains(STORES.dashPrefs)) {
        db.createObjectStore(STORES.dashPrefs, { keyPath: 'key' });
      }
      if (!db.objectStoreNames.contains(STORES.reportHistory)) {
        const rh = db.createObjectStore(STORES.reportHistory, { keyPath: 'id', autoIncrement: true });
        rh.createIndex('reportId', 'reportId', { unique: false });
        rh.createIndex('timestamp', 'timestamp', { unique: false });
      }
    };
    req.onsuccess = () => { _db = req.result; resolve(_db); };
    req.onerror = () => reject(req.error);
  });
}

async function _tx(storeName, mode, fn) {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, mode);
      const store = tx.objectStore(storeName);
      const result = fn(store);
      if (result && result.onsuccess !== undefined) {
        result.onsuccess = () => resolve(result.result);
        result.onerror = () => reject(result.error);
      } else {
        tx.oncomplete = () => resolve(result);
        tx.onerror = () => reject(tx.error);
      }
    });
  } catch {
    return null;
  }
}

// ── Report Cache ──
export async function cacheReport(reportId, data) {
  const rec = { id: reportId + '_' + Date.now(), reportId, data, timestamp: Date.now() };
  return _tx(STORES.reportCache, 'readwrite', s => s.put(rec));
}

export async function getCachedReport(reportId, maxAgeMs = 300000) {
  try {
    const db = await openDB();
    return new Promise((resolve) => {
      const tx = db.transaction(STORES.reportCache, 'readonly');
      const idx = tx.objectStore(STORES.reportCache).index('reportId');
      const req = idx.openCursor(IDBKeyRange.only(reportId), 'prev');
      req.onsuccess = () => {
        const cursor = req.result;
        if (cursor && (Date.now() - cursor.value.timestamp) < maxAgeMs) {
          resolve(cursor.value.data);
        } else {
          resolve(null);
        }
      };
      req.onerror = () => resolve(null);
    });
  } catch { return null; }
}

// ── Saved Report Configurations ──
export async function saveReportConfig(config) {
  const rec = { ...config, id: config.id || 'cfg_' + Date.now() };
  return _tx(STORES.savedReports, 'readwrite', s => s.put(rec));
}

export async function getSavedReports() {
  try {
    const db = await openDB();
    return new Promise((resolve) => {
      const tx = db.transaction(STORES.savedReports, 'readonly');
      const req = tx.objectStore(STORES.savedReports).getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => resolve([]);
    });
  } catch { return []; }
}

export async function deleteSavedReport(id) {
  return _tx(STORES.savedReports, 'readwrite', s => s.delete(id));
}

// ── Dashboard Preferences ──
export async function setDashPref(key, value) {
  return _tx(STORES.dashPrefs, 'readwrite', s => s.put({ key, value }));
}

export async function getDashPref(key, fallback = null) {
  try {
    const db = await openDB();
    return new Promise((resolve) => {
      const tx = db.transaction(STORES.dashPrefs, 'readonly');
      const req = tx.objectStore(STORES.dashPrefs).get(key);
      req.onsuccess = () => resolve(req.result?.value ?? fallback);
      req.onerror = () => resolve(fallback);
    });
  } catch { return fallback; }
}

// ── Report History (recent reports) ──
export async function addReportHistory(reportId, reportName) {
  const rec = { reportId, reportName, timestamp: Date.now() };
  return _tx(STORES.reportHistory, 'readwrite', s => s.add(rec));
}

export async function getReportHistory(limit = 10) {
  try {
    const db = await openDB();
    return new Promise((resolve) => {
      const tx = db.transaction(STORES.reportHistory, 'readonly');
      const idx = tx.objectStore(STORES.reportHistory).index('timestamp');
      const req = idx.openCursor(null, 'prev');
      const results = [];
      req.onsuccess = () => {
        const cursor = req.result;
        if (cursor && results.length < limit) {
          results.push(cursor.value);
          cursor.continue();
        } else {
          resolve(results);
        }
      };
      req.onerror = () => resolve([]);
    });
  } catch { return []; }
}

// ── Cleanup old cache entries ──
export async function cleanupCache(maxEntries = 50) {
  try {
    const db = await openDB();
    return new Promise((resolve) => {
      const tx = db.transaction(STORES.reportCache, 'readwrite');
      const store = tx.objectStore(STORES.reportCache);
      const idx = store.index('timestamp');
      const req = idx.openCursor(null, 'next');
      let count = 0;
      const countReq = store.count();
      countReq.onsuccess = () => {
        const total = countReq.result;
        const toDelete = total - maxEntries;
        if (toDelete <= 0) return resolve();
        req.onsuccess = () => {
          const cursor = req.result;
          if (cursor && count < toDelete) {
            cursor.delete();
            count++;
            cursor.continue();
          } else { resolve(); }
        };
      };
    });
  } catch { /* silent */ }
}

export { STORES, openDB };
