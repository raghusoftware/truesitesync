/**
 * inventoryCalc.js — pure helpers for the Current Inventory card list.
 * Stock per material for one site (or all sites), its status against the
 * minimum level, the storage location inside the site, plus search / filter /
 * sort. No DOM; unit-tested in tests/inventoryCalc.test.js.
 *
 * Inputs are the app's own records:
 *   rawMaterials  { id, name, unit, type, minStock, locations: { [siteId]: 'Yard A' } }
 *   inventoryTx   { rawMaterialId, siteId, type: 'IN'|'OUT'|'CONSUME'|…, qty, date }
 *   itemTransfers { assetId, fromLocId, toLocId, qty }
 */

const _n = (v) => parseFloat(v) || 0;

/** Where a material is kept at a site ('' when not set). All sites → every location. */
export function materialLocation(m, siteId) {
  const locs = (m && m.locations) || {};
  if (siteId) return String(locs[siteId] || '').trim();
  return [...new Set(Object.values(locs).map(v => String(v || '').trim()).filter(Boolean))].join(' · ');
}

/** 'out' (nothing left) · 'low' (below minimum) · 'ok'. */
export function stockStatus(stock, min) {
  if (stock <= 0.0001) return 'out';
  if (_n(min) > 0 && stock < _n(min)) return 'low';
  return 'ok';
}

/**
 * Fill level for the stock meter, 0–100. Full bar = twice the minimum, so the
 * minimum line sits in the middle; with no minimum set the bar is simply full
 * when there is stock.
 */
export function stockMeter(stock, min) {
  if (stock <= 0) return 0;
  const m = _n(min);
  if (m <= 0) return 100;
  return Math.max(2, Math.min(100, Math.round((stock / (m * 2)) * 100)));
}

/**
 * One row per material that has moved at this site, or has a minimum level set
 * (so an item that ran out still shows as Out of stock).
 * Transfers count only for a specific site (they cancel out across all sites).
 */
export function stockRows({ materials = [], tx = [], transfers = [], siteId = '' }) {
  const map = new Map();
  materials.forEach(m => map.set(m.id, { m, in: 0, out: 0, moved: false }));
  tx.forEach(t => {
    const r = map.get(t.rawMaterialId);
    if (!r || (siteId && t.siteId !== siteId)) return;
    r.moved = true;
    if (t.type === 'IN') r.in += _n(t.qty); else r.out += _n(t.qty);
  });
  if (siteId) transfers.forEach(t => {
    const r = map.get(t.assetId);
    if (!r) return;
    if (t.toLocId === siteId) { r.in += _n(t.qty); r.moved = true; }
    if (t.fromLocId === siteId) { r.out += _n(t.qty); r.moved = true; }
  });
  const rows = [];
  map.forEach(({ m, in: inQ, out, moved }) => {
    const min = _n(m.minStock);
    if (!moved && min <= 0) return;
    const stock = Math.round((inQ - out) * 1000) / 1000;
    rows.push({
      id: m.id, name: m.name || 'Material', unit: m.unit || '', type: m.type || m.category || '',
      in: inQ, out, stock, min, status: stockStatus(stock, min), meter: stockMeter(stock, min),
      location: materialLocation(m, siteId),
    });
  });
  return rows;
}

/** Status chip counts for the filter bar. */
export function statusCounts(rows) {
  const c = { all: rows.length, ok: 0, low: 0, out: 0, noloc: 0 };
  rows.forEach(r => { c[r.status]++; if (!r.location) c.noloc++; });
  return c;
}

/**
 * Search (name, type, unit, location), filter by status / location / type, sort.
 * sort: 'name' | 'low' (most urgent first) | 'location' | 'stock' (largest first)
 */
export function filterRows(rows, { q = '', status = 'all', location = '', type = '', sort = 'low' } = {}) {
  const needle = q.trim().toLowerCase();
  const rank = { out: 0, low: 1, ok: 2 };
  const out = rows.filter(r => {
    if (status === 'noloc' ? r.location : (status !== 'all' && r.status !== status)) return false;
    if (location && r.location !== location) return false;
    if (type && r.type !== type) return false;
    return !needle || [r.name, r.type, r.unit, r.location].some(v => String(v || '').toLowerCase().includes(needle));
  });
  const byName = (a, b) => a.name.localeCompare(b.name);
  const sorters = {
    name: byName,
    low: (a, b) => rank[a.status] - rank[b.status] || a.meter - b.meter || byName(a, b),
    location: (a, b) => (a.location || '￿').localeCompare(b.location || '￿') || byName(a, b),
    stock: (a, b) => b.stock - a.stock || byName(a, b),
  };
  return out.sort(sorters[sort] || sorters.low);
}
