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

/**
 * Kind of stock item, from the material's type in the item master:
 * 'Tools' → tool · 'Raw Material' → raw · anything else (Miscellaneous…) → consumable.
 */
export function materialKind(type) {
  const t = String(type || '').toLowerCase();
  if (t.startsWith('tool')) return 'tool';
  if (t === 'raw material' || t === 'raw') return 'raw';
  return 'consumable';
}
export const KIND_LABEL = { raw: 'Raw material', consumable: 'Consumable', tool: 'Tool' };

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
 * Does this transfer record move stock by itself? Material Transfer records
 * (they carry a status: IN_TRANSIT / RECEIVED) already wrote their own OUT and
 * IN inventory entries, so counting them again would double the movement.
 * Older tool moves (no status) only exist as the transfer record.
 */
export function transferMovesStock(t) {
  return !!t && !t.status;
}

/**
 * One row per material that has moved at this site, or has a minimum level set
 * (so an item that ran out still shows as Out of stock).
 * Transfers count only for a specific site (they cancel out across all sites),
 * and only those that did not write their own inventory entries.
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
    if (!r || !transferMovesStock(t)) return;
    if (t.toLocId === siteId) { r.in += _n(t.qty); r.moved = true; }
    if (t.fromLocId === siteId) { r.out += _n(t.qty); r.moved = true; }
  });
  const rows = [];
  map.forEach(({ m, in: inQ, out, moved }) => {
    const min = _n(m.minStock);
    if (!moved && min <= 0) return;
    const stock = Math.round((inQ - out) * 1000) / 1000;
    rows.push({
      id: m.id, name: m.name || 'Material', unit: m.unit || '', type: m.type || m.category || '', kind: materialKind(m.type),
      in: inQ, out, stock, min, status: stockStatus(stock, min), meter: stockMeter(stock, min),
      location: materialLocation(m, siteId),
    });
  });
  return rows;
}

/** Status chip counts for the filter bar. */
export function statusCounts(rows) {
  const c = { all: rows.length, ok: 0, low: 0, out: 0, noloc: 0, raw: 0, consumable: 0, tool: 0 };
  rows.forEach(r => { c[r.status]++; if (!r.location) c.noloc++; c[r.kind]++; });
  return c;
}

/**
 * Search (name, type, unit, location), filter by status / location / type / kind, sort.
 * sort: 'name' | 'low' (most urgent first) | 'location' | 'stock' (largest first)
 */
export function filterRows(rows, { q = '', status = 'all', location = '', type = '', kind = '', sort = 'low' } = {}) {
  const needle = q.trim().toLowerCase();
  const rank = { out: 0, low: 1, ok: 2 };
  const out = rows.filter(r => {
    if (status === 'noloc' ? r.location : (status !== 'all' && r.status !== status)) return false;
    if (location && r.location !== location) return false;
    if (type && r.type !== type) return false;
    if (kind && r.kind !== kind) return false;
    return !needle || [r.name, r.type, r.unit, r.location, KIND_LABEL[r.kind]].some(v => String(v || '').toLowerCase().includes(needle));
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

/* ── Material picker (Material Received) ── */

const ICON_RULES = [
  [/cement|mortar|plaster|putty/, '🧱'],
  [/brick|block|aac/, '🟫'],
  [/steel|tmt|rebar|\bbar\b|rod|binding wire|angle|channel|beam|girder|sheet/, '🏗️'],
  [/sand|aggregate|kapchi|gravel|grit|stone|metal|murrum|rubble|dust/, '🪨'],
  [/tile|marble|granite|kota/, '🔲'],
  [/paint|primer|emulsion|enamel/, '🎨'],
  [/pipe|fitting|valve|elbow|tee|pvc|cpvc|gi /, '🚰'],
  [/wire|cable|switch|mcb|conduit|light/, '🔌'],
  [/wood|plywood|ply|timber|shutter|door|frame/, '🪵'],
  [/chemical|admix|waterproof|epoxy|sealant|curing/, '🧪'],
  [/diesel|petrol|fuel|oil|lubricant|grease/, '⛽'],
  [/glass|window/, '🪟'],
];

/** Category icon for a material, from its name (tools always 🔧). */
export function materialIcon(m) {
  if (materialKind(m && m.type) === 'tool') return '🔧';
  const n = ' ' + String((m && m.name) || '').toLowerCase() + ' ';
  for (const [re, ic] of ICON_RULES) if (re.test(n)) return ic;
  return '📦';
}

/**
 * Quantity still to arrive per material: open purchase-order lines minus what
 * has been received against those POs. POs marked Delivered / Cancelled are closed.
 * @returns {Object<string, number>} materialId -> pending qty (only > 0)
 */
export function pendingOrders(purchaseOrders = [], grnRecords = []) {
  const closed = /deliver|cancel|closed/i;
  const received = {};
  grnRecords.forEach(g => { if (g.poId && g.matId) { const k = g.poId + '|' + g.matId; received[k] = (received[k] || 0) + _n(g.qty); } });
  const out = {};
  purchaseOrders.forEach(po => {
    if (closed.test(String(po.deliveryStatus || ''))) return;
    (po.items || []).forEach(it => {
      if (!it.rawMatId) return;
      const left = _n(it.qty) - (received[po.id + '|' + it.rawMatId] || 0);
      if (left > 0) out[it.rawMatId] = (out[it.rawMatId] || 0) + left;
    });
  });
  return out;
}
