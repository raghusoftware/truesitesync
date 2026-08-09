/**
 * ═══════════════════════════════════════════════════════════
 * True Site Sync — Items (Vyapar-style, category-wise master)
 * ───────────────────────────────────────────────────────────
 * ONE screen over the TWO item stores the app has always had:
 *
 *   • state.rawMaterials — stock-tracked things. Inventory transactions,
 *     recipes, GRNs and purchases all reference these by id, so these records
 *     must stay in this array. Their `type` field ('Raw Material' | 'Tools' |
 *     'Miscellaneous') drives inventory behaviour, and is what we surface as
 *     the item's Category.
 *   • state.itemsMaster — non-stock things (services, sale lines). Sale
 *     invoices auto-capture into this array and read it back for autocomplete.
 *
 * Merging the arrays would orphan every inventoryTx.rawMaterialId, so instead
 * we present a unified list and route each save/delete back to the store the
 * record belongs to. STOCK_CATEGORY_TYPE is the bridge: picking one of those
 * categories puts the item in rawMaterials (and it shows in Inventory);
 * anything else puts it in itemsMaster.
 *
 * Both stores support `altUnits` (second unit + conversion) via units.js.
 * ═══════════════════════════════════════════════════════════
 */
import { state, saveAllData } from './state.js';
import { showToast, getCurrencySymbol } from './utils.js';
import { unitMasterOptions, addAltUnitRowTo, syncAltBaseLabels, readAltUnitRows } from './units.js';

/** Categories that live in rawMaterials → the rawMaterial.type they map to. */
export const STOCK_CATEGORY_TYPE = {
  'Raw Material': 'Raw Material',
  'Tools & Equipment': 'Tools',
  'Miscellaneous': 'Miscellaneous',
};
const TYPE_TO_CATEGORY = Object.fromEntries(Object.entries(STOCK_CATEGORY_TYPE).map(([c, t]) => [t, c]));

export const DEFAULT_ITEM_CATEGORIES = [
  'Raw Material', 'Purchase Materials', 'Sales Items', 'Production Items', 'Tools & Equipment', 'Services', 'Miscellaneous',
];
/** A manufactured/assembled sale product (e.g. an electrical panel) with a Bill of
 *  Materials — selling it consumes its component raw materials from inventory. */
export const PRODUCTION_CATEGORY = 'Production Items';
export function isProductionCategory(cat) { return cat === PRODUCTION_CATEGORY; }
/** Finished-goods stock on hand for a production item (IN from Builds − OUT from sales). */
export function finishedStock(itemId) {
  return (state.inventoryTx || []).reduce((s, tx) => tx.rawMaterialId === itemId ? s + (tx.type === 'OUT' ? -1 : 1) * (parseFloat(tx.qty) || 0) : s, 0);
}

export function isStockCategory(cat) { return Object.prototype.hasOwnProperty.call(STOCK_CATEGORY_TYPE, cat); }

/** The category master. Standard categories are always present (self-healing). */
export function getItemCategories() {
  if (!Array.isArray(state.itemCategories)) state.itemCategories = [];
  // Defensive: collapse duplicates first (a past sync bug ballooned this list).
  if (state.itemCategories.length > new Set(state.itemCategories).size) state.itemCategories = [...new Set(state.itemCategories)];
  // Existing workspaces were seeded before Raw Material/Miscellaneous existed.
  DEFAULT_ITEM_CATEGORIES.forEach(c => { if (!state.itemCategories.includes(c)) state.itemCategories.push(c); });
  // Keep the standard categories in their canonical order, customs after.
  state.itemCategories.sort((a, b) => {
    const ia = DEFAULT_ITEM_CATEGORIES.indexOf(a), ib = DEFAULT_ITEM_CATEGORIES.indexOf(b);
    if (ia < 0 && ib < 0) return 0;
    if (ia < 0) return 1;
    if (ib < 0) return -1;
    return ia - ib;
  });
  return state.itemCategories;
}

export function addItemCategory(name) {
  name = String(name == null ? '' : name).trim();
  if (!name) return false;
  getItemCategories();
  if (state.itemCategories.some(c => c.toLowerCase() === name.toLowerCase())) return false;
  state.itemCategories.push(name);
  saveAllData();
  return true;
}

/** Remove a custom category. Its items survive as Uncategorized. */
export function deleteItemCategory(name) {
  if (DEFAULT_ITEM_CATEGORIES.includes(name)) return showToast('Standard categories cannot be removed', 'error');
  const inUse = (state.itemsMaster || []).filter(i => i.category === name).length;
  if (inUse && !confirm(`${inUse} item(s) use "${name}".\n\nDeleting the category will move them to Uncategorized. The items themselves are kept. Continue?`)) return;
  (state.itemsMaster || []).forEach(i => { if (i.category === name) i.category = ''; });
  state.itemCategories = getItemCategories().filter(c => c !== name);
  if (_activeCat === name) _activeCat = '__all';
  saveAllData();
  renderItemsMasterView();
  showToast('Category removed', 'success');
}

// ─── Unified read: normalize both stores into one row shape ───

function fromRawMaterial(rm) {
  return {
    id: rm.id, source: 'rm', stock: true,
    name: rm.name || '', description: rm.description || '',
    unit: rm.unit || '', altUnits: rm.altUnits || [],
    category: TYPE_TO_CATEGORY[rm.type] || 'Raw Material',
    hsn: rm.hsn || '', rate: parseFloat(rm.rate) || 0,
    status: rm.status || 'Active', minStock: rm.minStock || 0,
  };
}

function fromMasterItem(i) {
  return {
    id: i.id, source: 'im', stock: false,
    name: i.name || '', description: i.description || '',
    unit: i.unit || 'Nos', altUnits: i.altUnits || [],
    category: i.category || '',
    hsn: i.hsn || '', rate: parseFloat(i.defaultRate) || 0,
    status: i.status || 'Active', usageCount: i.usageCount || 0,
    bom: Array.isArray(i.bom) ? i.bom : [],
  };
}

/** Every item from both stores, as one list. */
export function getAllItems() {
  return [
    ...(state.rawMaterials || []).map(fromRawMaterial),
    ...(state.itemsMaster || []).map(fromMasterItem),
  ];
}

/** Locate a record in whichever store holds it. */
function findRecord(id) {
  const rm = (state.rawMaterials || []).find(x => x.id === id);
  if (rm) return { rec: rm, source: 'rm' };
  const im = (state.itemsMaster || []).find(x => x.id === id);
  if (im) return { rec: im, source: 'im' };
  return null;
}

// ─── View state ───
let _activeCat = '__all';
let _search = '';

export function setItemCategoryFilter(cat) { _activeCat = cat; renderItemsMasterView(); }
export function setItemSearch(v) { _search = String(v || '').toLowerCase().trim(); renderItemsMasterTable(); }

function _esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
function _q(s) { return String(s == null ? '' : s).replace(/\\/g, '\\\\').replace(/'/g, "\\'"); }

function _filtered() {
  return getAllItems().filter(i => {
    if (_activeCat === '__uncat' ? i.category : (_activeCat !== '__all' && i.category !== _activeCat)) return false;
    if (!_search) return true;
    return (i.name + ' ' + i.description + ' ' + i.hsn).toLowerCase().includes(_search);
  });
}

export function renderItemsMasterView() {
  const box = document.getElementById('itemsMasterContent');
  if (!box) return;
  const cats = getItemCategories();
  const all = getAllItems();
  const count = c => c === '__all' ? all.length : (c === '__uncat' ? all.filter(i => !i.category).length : all.filter(i => i.category === c).length);
  const uncat = count('__uncat');

  const catRow = (id, label, removable) => `
    <div onclick="setItemCategoryFilter('${_q(id)}')" class="group flex items-center justify-between px-3 py-2 rounded-lg cursor-pointer transition ${_activeCat === id ? 'bg-blue-50 border border-blue-200' : 'hover:bg-slate-50 border border-transparent'}">
      <span class="text-sm font-medium ${_activeCat === id ? 'text-blue-700' : 'text-slate-700'}">${_esc(label)}${isStockCategory(id) ? ' <span class="text-[9px] text-slate-400">stock</span>' : ''}</span>
      <span class="flex items-center gap-1">
        <span class="text-[10px] font-bold px-2 py-0.5 rounded-full ${_activeCat === id ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-500'}">${count(id)}</span>
        ${removable ? `<button onclick="event.stopPropagation();window._deleteItemCategory('${_q(id)}')" class="opacity-0 group-hover:opacity-100 text-red-400 hover:text-red-600 font-bold text-xs px-1" title="Remove category">✕</button>` : ''}
      </span>
    </div>`;

  box.innerHTML = `
    <div class="grid grid-cols-1 lg:grid-cols-4 gap-5">
      <div class="lg:col-span-1">
        <div class="bg-white rounded-xl border shadow-sm p-4">
          <h3 class="text-xs font-bold text-slate-500 uppercase tracking-wide mb-3">Categories</h3>
          <div class="space-y-1">
            ${catRow('__all', 'All Items', false)}
            ${cats.map(c => catRow(c, c, !DEFAULT_ITEM_CATEGORIES.includes(c))).join('')}
            ${uncat ? catRow('__uncat', 'Uncategorized', false) : ''}
          </div>
          <div class="flex gap-2 mt-4 pt-3 border-t">
            <input type="text" id="newItemCatName" placeholder="New category" class="flex-1 p-2 border rounded text-sm min-w-0" onkeydown="if(event.key==='Enter')window._addItemCategory()">
            <button onclick="window._addItemCategory()" class="px-3 py-2 bg-slate-800 text-white rounded text-xs font-bold hover:bg-slate-700 shrink-0">Add</button>
          </div>
          <p class="text-[10px] text-slate-400 mt-3 leading-relaxed">Items in a <b>stock</b> category are tracked in Inventory. Everything else (services, sale lines) is billing-only.</p>
        </div>
      </div>
      <div class="lg:col-span-3">
        <div class="bg-white rounded-xl border shadow-sm overflow-hidden">
          <div class="p-4 border-b flex flex-wrap items-center justify-between gap-3">
            <input type="text" id="itemMasterSearch" value="${_esc(_search)}" placeholder="Search name, description or HSN..." class="flex-1 min-w-[200px] p-2.5 bg-slate-50 border rounded text-sm" oninput="setItemSearch(this.value)">
            <div class="flex items-center gap-2 shrink-0">
              <button onclick="window._imDownloadTemplate()" class="bg-white text-slate-600 border px-3 py-2.5 rounded-lg text-sm font-bold hover:bg-slate-50" title="Download the Excel template">⬇ Template</button>
              <label class="bg-emerald-600 text-white px-3 py-2.5 rounded-lg text-sm font-bold hover:bg-emerald-700 shadow-sm cursor-pointer" title="Bulk-add items from an Excel file">📥 Import Excel<input type="file" accept=".xlsx,.xls,.csv" class="hidden" onchange="window._imImportExcel(event)"></label>
              <button onclick="openItemMasterModal()" class="bg-blue-600 text-white px-4 py-2.5 rounded-lg text-sm font-bold hover:bg-blue-700 shadow-sm">➕ Add Item</button>
            </div>
          </div>
          <div class="overflow-x-auto">
            <table class="min-w-full text-sm">
              <thead class="bg-slate-50 border-b">
                <tr>
                  <th class="px-4 py-2.5 text-left font-bold text-slate-600 uppercase text-[10px]">Item Name</th>
                  <th class="px-4 py-2.5 text-left font-bold text-slate-600 uppercase text-[10px]">Description</th>
                  <th class="px-4 py-2.5 text-left font-bold text-slate-600 uppercase text-[10px]">Category</th>
                  <th class="px-4 py-2.5 text-left font-bold text-slate-600 uppercase text-[10px]">Unit</th>
                  <th class="px-4 py-2.5 text-left font-bold text-slate-600 uppercase text-[10px]">HSN</th>
                  <th class="px-4 py-2.5 text-right font-bold text-slate-600 uppercase text-[10px]">Rate</th>
                  <th class="px-4 py-2.5 text-center font-bold text-slate-600 uppercase text-[10px]">Status</th>
                  <th class="px-4 py-2.5 text-right font-bold text-slate-600 uppercase text-[10px]">Actions</th>
                </tr>
              </thead>
              <tbody id="itemsMasterTableBody" class="divide-y"></tbody>
            </table>
          </div>
        </div>
      </div>
    </div>`;
  renderItemsMasterTable();
}

export function renderItemsMasterTable() {
  const tbody = document.getElementById('itemsMasterTableBody');
  if (!tbody) return;
  const rows = _filtered();
  const cur = getCurrencySymbol();
  if (!rows.length) {
    tbody.innerHTML = `<tr><td colspan="8" class="px-4 py-12 text-center text-slate-400 text-sm">${_search ? 'No items match your search.' : 'No items yet. Click <b>Add Item</b> to create your first one.'}</td></tr>`;
    return;
  }
  const catColor = c => c === 'Raw Material' ? 'bg-emerald-100 text-emerald-800' : c === 'Sales Items' ? 'bg-green-100 text-green-800'
    : c === 'Purchase Materials' ? 'bg-blue-100 text-blue-800' : c === 'Tools & Equipment' ? 'bg-purple-100 text-purple-800'
    : c === 'Services' ? 'bg-amber-100 text-amber-800' : 'bg-slate-100 text-slate-600';
  tbody.innerHTML = rows.map(i => {
    // Second units, one compact line each: "1 Tonne = 1000 Kg"
    const alts = (i.altUnits || []).filter(a => a && a.unit)
      .map(a => `<div>1 ${_esc(a.unit)} = ${a.factor} ${_esc(i.unit)}</div>`).join('');
    const isProd = i.category === PRODUCTION_CATEGORY && Array.isArray(i.bom) && i.bom.length > 0;
    const fStock = isProd ? finishedStock(i.id) : 0;
    return `
    <tr class="hover:bg-slate-50 ${i.status === 'Inactive' ? 'opacity-60' : ''}">
      <td class="px-4 py-3 font-bold text-slate-800 whitespace-nowrap">${_esc(i.name)}${i.stock ? ' <span class="text-[9px] text-emerald-600 font-bold" title="Tracked in Inventory">◆</span>' : ''}${isProd ? ` <span class="text-[10px] font-bold px-1.5 py-0.5 rounded ${fStock > 0 ? 'bg-violet-100 text-violet-700' : 'bg-slate-100 text-slate-400'}" title="Finished panels in stock">🧩 ${fStock} built</span>` : ''}</td>
      <td class="px-4 py-3 text-slate-500 max-w-[200px] truncate" title="${_esc(i.description)}">${_esc(i.description) || '—'}</td>
      <td class="px-4 py-3"><span class="${catColor(i.category)} text-[10px] px-2 py-0.5 rounded font-bold uppercase">${_esc(i.category || 'Uncategorized')}</span></td>
      <td class="px-4 py-3 whitespace-nowrap"><span class="font-medium">${_esc(i.unit)}</span>${alts ? `<div class="text-[10px] text-slate-400 leading-tight mt-0.5">${alts}</div>` : ''}</td>
      <td class="px-4 py-3 font-mono text-xs text-slate-500">${_esc(i.hsn) || '—'}</td>
      <td class="px-4 py-3 text-right font-bold text-orange-600">${cur}${i.rate.toFixed(2)}</td>
      <td class="px-4 py-3 text-center">
        <button onclick="window._toggleItemStatus('${_q(i.id)}')" title="Click to toggle" class="text-[10px] px-2 py-0.5 rounded-full font-bold ${i.status === 'Active' ? 'bg-green-100 text-green-700 hover:bg-green-200' : 'bg-slate-200 text-slate-500 hover:bg-slate-300'}">${i.status}</button>
      </td>
      <td class="px-4 py-3 text-right whitespace-nowrap">
        ${isProd ? `<button onclick="window._imBuild('${_q(i.id)}')" class="text-violet-700 hover:text-violet-900 font-bold text-xs bg-violet-50 px-3 py-1.5 rounded mr-1" title="Consume components & add finished units to stock">🔧 Build</button>` : ''}
        <button onclick="openItemMasterModal('${_q(i.id)}')" class="text-blue-600 hover:text-blue-800 font-bold text-xs bg-blue-50 px-3 py-1.5 rounded mr-1">Edit</button>
        <button onclick="window._deleteMasterItem('${_q(i.id)}')" class="text-red-500 hover:text-red-700 font-bold text-xs bg-red-50 px-3 py-1.5 rounded">Delete</button>
      </td>
    </tr>`;
  }).join('');
}

// ─── Add / Edit modal ───

/** Show/hide the Min-Stock field — only stock categories use it. */
export function onItemCategoryChange() {
  const cat = document.getElementById('imCategory').value;
  const stock = isStockCategory(cat);
  document.getElementById('imMinStockWrap').style.display = stock ? '' : 'none';
  document.getElementById('imStockHint').style.display = stock ? '' : 'none';
  const bomWrap = document.getElementById('imBomWrap');
  if (bomWrap) bomWrap.style.display = isProductionCategory(cat) ? '' : 'none';
}

/** One BOM component row: raw-material dropdown + qty-per-unit + remove. */
function _bomRowHtml(rawMatId, qty) {
  const opts = (state.rawMaterials || []).map(rm => `<option value="${rm.id}" ${rawMatId === rm.id ? 'selected' : ''}>${_esc(rm.name)}${rm.unit ? ' (' + _esc(rm.unit) + ')' : ''}</option>`).join('');
  return `<div class="im-bom-row flex items-center gap-2 mb-1.5">
    <select class="im-bom-mat flex-1 p-2 border rounded text-xs">${opts || '<option value="">— add stock items first —</option>'}</select>
    <input type="number" step="any" min="0" class="im-bom-qty w-20 p-2 border rounded text-xs text-center font-bold text-violet-700" value="${qty != null ? qty : ''}" placeholder="Qty">
    <button type="button" onclick="this.closest('.im-bom-row').remove()" class="text-red-400 hover:text-red-600 font-bold text-sm px-1">✕</button>
  </div>`;
}
window._imAddBomRow = function (rawMatId, qty) {
  const box = document.getElementById('imBomRows'); if (!box) return;
  box.insertAdjacentHTML('beforeend', _bomRowHtml(rawMatId, qty));
  const empty = document.getElementById('imBomEmpty'); if (empty) empty.style.display = 'none';
};

// ── Build / Assemble: consume components → add finished units to stock ──
const _rmOnHand = (rid) => (state.inventoryTx || []).reduce((s, tx) => tx.rawMaterialId === rid ? s + (tx.type === 'OUT' ? -1 : 1) * (parseFloat(tx.qty) || 0) : s, 0);
window._imBuild = function (id) {
  const prod = (state.itemsMaster || []).find(m => m.id === id);
  if (!prod || !Array.isArray(prod.bom) || !prod.bom.length) return showToast('This item has no Bill of Materials', 'error');
  const rm = rid => (state.rawMaterials || []).find(r => r.id === rid) || {};
  const rowsHtml = () => prod.bom.map(c => {
    const r = rm(c.rawMatId), qtyEl = document.getElementById('imBuildQty');
    const n = (parseFloat(qtyEl?.value) || 0) * (parseFloat(c.qty) || 0);
    const have = _rmOnHand(c.rawMatId);
    const shortC = n > have ? 'color:#dc2626;font-weight:700;' : 'color:#16a34a;';
    return `<tr><td style="padding:5px 8px;">${_esc(r.name || c.rawMatId)}</td><td style="padding:5px 8px;text-align:right;color:#64748b;">${c.qty} ${_esc(r.unit || '')}/unit</td><td style="padding:5px 8px;text-align:right;">${n || '—'}</td><td style="padding:5px 8px;text-align:right;${shortC}">${have}</td></tr>`;
  }).join('');
  const wrap = document.createElement('div');
  wrap.id = 'imBuildModal';
  wrap.style.cssText = 'position:fixed;inset:0;background:rgba(15,23,42,.55);z-index:200000;display:flex;align-items:center;justify-content:center;padding:16px;';
  wrap.onclick = e => { if (e.target === wrap) wrap.remove(); };
  wrap.innerHTML = `<div style="background:#fff;border-radius:16px;width:100%;max-width:520px;max-height:88vh;overflow:auto;box-shadow:0 24px 60px rgba(0,0,0,.3);">
      <div style="padding:16px 20px;border-bottom:1px solid #f1f5f9;display:flex;justify-content:space-between;align-items:center;">
        <h3 style="font-weight:800;color:#6d28d9;font-size:16px;">🔧 Build / Assemble — ${_esc(prod.name)}</h3>
        <button onclick="document.getElementById('imBuildModal').remove()" style="border:none;background:#f1f5f9;border-radius:8px;width:28px;height:28px;cursor:pointer;">×</button>
      </div>
      <div style="padding:20px;">
        <label style="display:block;font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;margin-bottom:4px;">Quantity to build</label>
        <input id="imBuildQty" type="number" min="1" value="1" oninput="window._imBuildRefresh()" style="width:120px;padding:9px 11px;border:1px solid #cbd5e1;border-radius:10px;font-size:16px;font-weight:700;margin-bottom:14px;">
        <table style="width:100%;font-size:12px;border-collapse:collapse;">
          <thead><tr style="background:#f8fafc;color:#64748b;text-transform:uppercase;font-size:10px;"><th style="padding:6px 8px;text-align:left;">Component</th><th style="padding:6px 8px;text-align:right;">Per unit</th><th style="padding:6px 8px;text-align:right;">Needed</th><th style="padding:6px 8px;text-align:right;">In stock</th></tr></thead>
          <tbody id="imBuildRows">${rowsHtml()}</tbody>
        </table>
        <p style="font-size:11px;color:#94a3b8;margin-top:10px;">Building consumes these components and adds the finished units to stock. Selling then deducts finished units first.</p>
        <div style="display:flex;justify-content:flex-end;gap:8px;margin-top:16px;">
          <button onclick="document.getElementById('imBuildModal').remove()" style="padding:9px 16px;border:1px solid #e2e8f0;background:#fff;border-radius:10px;font-weight:700;cursor:pointer;color:#475569;">Cancel</button>
          <button onclick="window._imDoBuild('${_q(id)}')" style="padding:9px 18px;border:none;background:#7c3aed;color:#fff;border-radius:10px;font-weight:700;cursor:pointer;">Build</button>
        </div>
      </div>
    </div>`;
  document.body.appendChild(wrap);
  window._imBuildRefresh = () => { const b = document.getElementById('imBuildRows'); if (b) b.innerHTML = rowsHtml(); };
};
window._imDoBuild = function (id) {
  const prod = (state.itemsMaster || []).find(m => m.id === id);
  if (!prod || !Array.isArray(prod.bom)) return;
  const qty = parseFloat(document.getElementById('imBuildQty')?.value) || 0;
  if (qty <= 0) return showToast('Enter a quantity to build', 'error');
  const rm = rid => (state.rawMaterials || []).find(r => r.id === rid) || {};
  const short = [];
  prod.bom.forEach(c => { const need = (parseFloat(c.qty) || 0) * qty, have = _rmOnHand(c.rawMatId); if (need > have + 1e-9) short.push(`• ${rm(c.rawMatId).name || c.rawMatId}: need ${need}, have ${have}`); });
  if (short.length && !confirm('⚠ Not enough components in stock:\n\n' + short.join('\n') + '\n\nBuild anyway? Component stock will go negative.')) return;
  if (!state.inventoryTx) state.inventoryTx = [];
  const buildId = 'bld_' + Date.now();
  const today = new Date().toISOString().slice(0, 10);
  let unitCost = 0;
  prod.bom.forEach(c => {
    const r = rm(c.rawMatId), out = (parseFloat(c.qty) || 0) * qty;
    unitCost += (parseFloat(c.qty) || 0) * (parseFloat(r.rate) || 0);
    state.inventoryTx.push({ id: 'tx_bld_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6), date: today, type: 'OUT', rawMaterialId: c.rawMatId, qty: out, rate: r.rate || 0, ref: `Build ${prod.name} ×${qty}`, buildId });
  });
  // Produce the finished units into stock (tracked under the production item's own id).
  state.inventoryTx.push({ id: 'tx_bldfin_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6), date: today, type: 'IN', rawMaterialId: id, qty, rate: unitCost, ref: `Built ${prod.name} ×${qty}`, buildId });
  saveAllData();
  document.getElementById('imBuildModal')?.remove();
  renderItemsMasterView();
  window.populateDropdowns?.();
  showToast(`Built ${qty} × ${prod.name} → added to finished stock`, 'success');
};

export function openItemMasterModal(id) {
  const found = id ? findRecord(id) : null;
  const it = found ? (found.source === 'rm' ? fromRawMaterial(found.rec) : fromMasterItem(found.rec)) : null;
  document.getElementById('itemMasterModal').classList.remove('hidden');
  document.getElementById('imId').value = it ? it.id : '';
  document.getElementById('imModalTitle').textContent = it ? 'Edit Item' : 'Add Item';
  document.getElementById('imName').value = it ? it.name : '';
  document.getElementById('imDesc').value = it ? it.description : '';
  document.getElementById('imHsn').value = it ? it.hsn : '';
  document.getElementById('imRate').value = it ? (it.rate || '') : '';
  document.getElementById('imMinStock').value = it ? (it.minStock || '') : '';
  document.getElementById('imStatus').value = it ? it.status : 'Active';

  const unitSel = document.getElementById('imUnit');
  unitSel.innerHTML = unitMasterOptions(it ? it.unit : 'Nos');
  unitSel.onchange = () => syncAltBaseLabels('imAltUnitRows', 'imUnit');

  const preset = it ? it.category : (['__all', '__uncat'].includes(_activeCat) ? '' : _activeCat);
  document.getElementById('imCategory').innerHTML = `<option value="">Uncategorized</option>` +
    getItemCategories().map(c => `<option value="${_esc(c)}" ${preset === c ? 'selected' : ''}>${_esc(c)}${isStockCategory(c) ? ' (stock)' : ''}</option>`).join('');

  document.getElementById('imAltUnitRows').innerHTML = '';
  (it ? it.altUnits : []).forEach(a => addAltUnitRowTo('imAltUnitRows', 'imUnit', a.unit, a.factor));
  // Bill of Materials rows (production items)
  const bomBox = document.getElementById('imBomRows');
  if (bomBox) {
    bomBox.innerHTML = '';
    const bom = (it && Array.isArray(it.bom)) ? it.bom : [];
    bom.forEach(c => window._imAddBomRow(c.rawMatId, c.qty));
    const empty = document.getElementById('imBomEmpty'); if (empty) empty.style.display = bom.length ? 'none' : '';
  }
  onItemCategoryChange();
}

export function saveItemMasterItem() {
  const id = document.getElementById('imId').value;
  const name = document.getElementById('imName').value.trim();
  if (!name) return showToast('Item Name is required', 'error');
  const category = document.getElementById('imCategory').value;
  const unit = document.getElementById('imUnit').value;
  if (!unit) return showToast('Unit is required', 'error');

  if (!state.itemsMaster) state.itemsMaster = [];
  if (!state.rawMaterials) state.rawMaterials = [];

  // Name is the identity the invoice autocomplete matches on — keep it unique
  // across BOTH stores.
  const dupe = getAllItems().some(i => i.id !== id && i.name.toLowerCase().trim() === name.toLowerCase());
  if (dupe) return showToast('An item with this name already exists', 'error');

  const toStock = isStockCategory(category);
  const found = id ? findRecord(id) : null;

  // Changing an item across the stock boundary means physically moving it
  // between stores. Block it when inventory history would be orphaned.
  if (found && ((found.source === 'rm') !== toStock)) {
    if (found.source === 'rm' && _rawMaterialInUse(id)) {
      return showToast('This item has inventory history — it must stay in a stock category', 'error');
    }
    window.recycleDelete && window.recycleDelete(found.source === 'rm' ? 'rawMaterials' : 'itemsMaster', id, 'Item', name);
  }

  const common = {
    name,
    description: document.getElementById('imDesc').value.trim(),
    unit,
    altUnits: readAltUnitRows('imAltUnitRows', unit),
    hsn: document.getElementById('imHsn').value.trim(),
    status: document.getElementById('imStatus').value,
  };
  const rate = parseFloat(document.getElementById('imRate').value) || 0;
  const minStock = parseFloat(document.getElementById('imMinStock').value) || 0;

  const sameStore = found && ((found.source === 'rm') === toStock);
  if (toStock) {
    const rec = sameStore ? found.rec : { id: 'rm_' + Date.now(), projectId: state.rawMaterials[0]?.projectId };
    Object.assign(rec, common, { type: STOCK_CATEGORY_TYPE[category], rate, minStock });
    if (!sameStore) state.rawMaterials.push(rec);
  } else {
    // Production items carry a Bill of Materials (component raw materials per unit).
    const bom = isProductionCategory(category)
      ? Array.from(document.querySelectorAll('#imBomRows .im-bom-row')).map(r => ({
          rawMatId: r.querySelector('.im-bom-mat')?.value || '',
          qty: parseFloat(r.querySelector('.im-bom-qty')?.value) || 0,
        })).filter(c => c.rawMatId && c.qty > 0)
      : [];
    const rec = sameStore ? found.rec : { id: 'im_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6), usageCount: 0, createdAt: new Date().toISOString() };
    Object.assign(rec, common, { category, defaultRate: rate, bom });
    if (!sameStore) state.itemsMaster.push(rec);
  }

  saveAllData();
  document.getElementById('itemMasterModal').classList.add('hidden');
  renderItemsMasterView();
  // Stock items surface in Inventory + purchase dropdowns.
  window.populateDropdowns?.();
  window.refreshPurchaseDropdowns?.();
  window.renderLiveInventory?.();
  showToast(found ? 'Item Updated' : 'Item Saved', 'success');
}

/** True if a raw material is referenced by inventory/purchase/recipe history. */
function _rawMaterialInUse(id) {
  if ((state.inventoryTx || []).some(tx => tx.rawMaterialId === id)) return true;
  if ((state.vendorMaterials || []).some(m => m?.items?.some(i => i.rawMatId === id))) return true;
  for (const c in (state.recipes || {})) {
    for (const i in state.recipes[c]) {
      if (state.recipes[c][i]?.ingredients?.some(ing => ing.rawMatId === id)) return true;
    }
  }
  return false;
}

if (typeof window !== 'undefined') {
  window.renderItemsMasterView = renderItemsMasterView;
  window.renderItemsMasterTable = renderItemsMasterTable;
  window.openItemMasterModal = openItemMasterModal;
  window.saveItemMasterItem = saveItemMasterItem;
  window.onItemCategoryChange = onItemCategoryChange;
  window.setItemCategoryFilter = setItemCategoryFilter;
  window.setItemSearch = setItemSearch;
  window.getItemCategories = getItemCategories;
  window.getAllItems = getAllItems;

  window._addItemCategory = function () {
    const el = document.getElementById('newItemCatName');
    const name = el ? el.value : '';
    if (addItemCategory(name)) {
      _activeCat = name.trim();
      renderItemsMasterView();
      showToast('Category added', 'success');
    } else if (name && name.trim()) {
      showToast('That category already exists', 'info');
    }
  };
  window._deleteItemCategory = deleteItemCategory;

  // ── Bulk import items from Excel ──
  window._imDownloadTemplate = function () {
    const XLSX = window.XLSX;
    if (!XLSX) return showToast('Excel library not loaded', 'error');
    const ws = XLSX.utils.aoa_to_sheet([
      ['Name', 'Description', 'Category', 'Unit', 'HSN', 'Rate', 'Min Stock', 'Status'],
      ['OPC 53 Cement', '53-grade cement', 'Raw Material', 'Bag', '2523', 380, 100, 'Active'],
      ['River Sand', 'Fine aggregate', 'Raw Material', 'Cft', '2505', 55, '', 'Active'],
      ['TMT Steel Fe500', '', 'Purchase Materials', 'Kg', '7214', 62, '', 'Active'],
      ['Site Supervision', 'Monthly supervision', 'Services', 'Nos', '9954', 25000, '', 'Active'],
    ]);
    ws['!cols'] = [{ wch: 22 }, { wch: 26 }, { wch: 18 }, { wch: 8 }, { wch: 10 }, { wch: 10 }, { wch: 10 }, { wch: 9 }];
    const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, 'Items');
    try { XLSX.writeFile(wb, 'Items-Template.xlsx'); } catch (e) { showToast('Download failed', 'error'); }
  };

  window._imImportExcel = function (event) {
    const file = event.target.files && event.target.files[0];
    if (!file) return;
    const XLSX = window.XLSX;
    if (!XLSX) { showToast('Excel library not loaded', 'error'); return; }
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const wb = XLSX.read(e.target.result, { type: 'array' });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json(ws, { defval: '' });
        if (!rows.length) { showToast('No rows found in the file', 'error'); return; }
        const headers = Object.keys(rows[0]);
        const lc = s => String(s).toLowerCase().trim();
        const find = arr => headers.find(h => arr.some(a => lc(h).includes(a)));
        const cm = {
          name: find(['name', 'item', 'particular', 'material', 'product']) || headers[0],
          desc: find(['desc', 'description', 'details']),
          cat: find(['category', 'group', 'type']),
          unit: find(['unit', 'uom']),
          hsn: find(['hsn', 'sac']),
          rate: find(['rate', 'price']),
          min: find(['min stock', 'minimum', 'reorder', 'min ']),
          status: find(['status']),
        };
        if (!Array.isArray(state.itemsMaster)) state.itemsMaster = [];
        if (!Array.isArray(state.rawMaterials)) state.rawMaterials = [];
        if (!Array.isArray(state.units)) state.units = [];
        if (!Array.isArray(state.itemCategories)) state.itemCategories = [];
        const existing = new Set(getAllItems().map(i => (i.name || '').toLowerCase().trim()));
        let added = 0, skipped = 0, blank = 0;
        const val = (row, col) => col ? String(row[col] ?? '').trim() : '';
        rows.forEach(row => {
          const name = val(row, cm.name);
          if (!name) { blank++; return; }
          if (existing.has(name.toLowerCase())) { skipped++; return; }
          // Category: match an existing one (case-insensitive), else create it; default = Sales Items.
          let category = val(row, cm.cat);
          if (category) {
            const m = state.itemCategories.find(c => c.toLowerCase() === category.toLowerCase());
            if (m) category = m; else state.itemCategories.push(category);
          } else category = 'Sales Items';
          // Unit: match/add to the unit master; default = Nos.
          let unit = val(row, cm.unit) || 'Nos';
          const um = state.units.find(u => u.toLowerCase() === unit.toLowerCase());
          if (um) unit = um; else state.units.push(unit);
          const common = { name, description: val(row, cm.desc), unit, altUnits: [], hsn: val(row, cm.hsn), status: (val(row, cm.status) || 'Active') };
          const rate = parseFloat(row[cm.rate]) || 0;
          if (isStockCategory(category)) {
            state.rawMaterials.push({ id: 'rm_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7), projectId: (state.rawMaterials[0] || {}).projectId, ...common, type: STOCK_CATEGORY_TYPE[category], rate, minStock: (cm.min ? parseFloat(row[cm.min]) : 0) || 0 });
          } else {
            state.itemsMaster.push({ id: 'im_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7), usageCount: 0, createdAt: new Date().toISOString(), ...common, category, defaultRate: rate });
          }
          existing.add(name.toLowerCase()); added++;
        });
        if (added) saveAllData();
        renderItemsMasterView();
        window.populateDropdowns?.();
        const bits = [];
        if (added) bits.push(`${added} item(s) imported`);
        if (skipped) bits.push(`${skipped} duplicate(s) skipped`);
        if (!added && blank && !skipped) bits.push('no item names found — check the Name column');
        showToast(bits.join(' · ') || 'Nothing to import', added ? 'success' : 'warning');
      } catch (err) { showToast('Could not read file: ' + (err.message || err), 'error'); }
      event.target.value = '';
    };
    reader.readAsArrayBuffer(file);
  };

  window._toggleItemStatus = function (id) {
    const found = findRecord(id);
    if (!found) return;
    found.rec.status = (found.rec.status || 'Active') === 'Active' ? 'Inactive' : 'Active';
    saveAllData();
    renderItemsMasterTable();
  };

  window._deleteMasterItem = function (id) {
    const found = findRecord(id);
    if (!found) return;
    // Stock items go through the raw-material delete, which has the full
    // in-use integrity checks (inventory, purchases, recipes, transfers).
    if (found.source === 'rm') {
      window.deleteRawMaterial?.(id);
      renderItemsMasterView();
      return;
    }
    const it = found.rec;
    const msg = it.usageCount > 0
      ? `⚠️ "${it.name}" has been used on ${it.usageCount} document(s).\n\nDeleting it only removes it from the master list — past invoices keep their own copy of the item and are unaffected.\n\nDelete anyway?`
      : `Delete "${it.name}" from Items?`;
    if (!confirm(msg)) return;
    // Tombstoned delete so the removal syncs to other devices (never raw filter).
    window.recycleDelete && window.recycleDelete('itemsMaster', id, 'Item');
    saveAllData();
    renderItemsMasterView();
    showToast('Item Deleted', 'success');
  };
}
