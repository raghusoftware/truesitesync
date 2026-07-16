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
  'Raw Material', 'Purchase Materials', 'Sales Items', 'Tools & Equipment', 'Services', 'Miscellaneous',
];

export function isStockCategory(cat) { return Object.prototype.hasOwnProperty.call(STOCK_CATEGORY_TYPE, cat); }

/** The category master. Standard categories are always present (self-healing). */
export function getItemCategories() {
  if (!Array.isArray(state.itemCategories)) state.itemCategories = [];
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
            <button onclick="openItemMasterModal()" class="bg-blue-600 text-white px-4 py-2.5 rounded-lg text-sm font-bold hover:bg-blue-700 shadow-sm">➕ Add Item</button>
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
    return `
    <tr class="hover:bg-slate-50 ${i.status === 'Inactive' ? 'opacity-60' : ''}">
      <td class="px-4 py-3 font-bold text-slate-800 whitespace-nowrap">${_esc(i.name)}${i.stock ? ' <span class="text-[9px] text-emerald-600 font-bold" title="Tracked in Inventory">◆</span>' : ''}</td>
      <td class="px-4 py-3 text-slate-500 max-w-[200px] truncate" title="${_esc(i.description)}">${_esc(i.description) || '—'}</td>
      <td class="px-4 py-3"><span class="${catColor(i.category)} text-[10px] px-2 py-0.5 rounded font-bold uppercase">${_esc(i.category || 'Uncategorized')}</span></td>
      <td class="px-4 py-3 whitespace-nowrap"><span class="font-medium">${_esc(i.unit)}</span>${alts ? `<div class="text-[10px] text-slate-400 leading-tight mt-0.5">${alts}</div>` : ''}</td>
      <td class="px-4 py-3 font-mono text-xs text-slate-500">${_esc(i.hsn) || '—'}</td>
      <td class="px-4 py-3 text-right font-bold text-orange-600">${cur}${i.rate.toFixed(2)}</td>
      <td class="px-4 py-3 text-center">
        <button onclick="window._toggleItemStatus('${_q(i.id)}')" title="Click to toggle" class="text-[10px] px-2 py-0.5 rounded-full font-bold ${i.status === 'Active' ? 'bg-green-100 text-green-700 hover:bg-green-200' : 'bg-slate-200 text-slate-500 hover:bg-slate-300'}">${i.status}</button>
      </td>
      <td class="px-4 py-3 text-right whitespace-nowrap">
        <button onclick="openItemMasterModal('${_q(i.id)}')" class="text-blue-600 hover:text-blue-800 font-bold text-xs bg-blue-50 px-3 py-1.5 rounded mr-1">Edit</button>
        <button onclick="window._deleteMasterItem('${_q(i.id)}')" class="text-red-500 hover:text-red-700 font-bold text-xs bg-red-50 px-3 py-1.5 rounded">Delete</button>
      </td>
    </tr>`;
  }).join('');
}

// ─── Add / Edit modal ───

/** Show/hide the Min-Stock field — only stock categories use it. */
export function onItemCategoryChange() {
  const stock = isStockCategory(document.getElementById('imCategory').value);
  document.getElementById('imMinStockWrap').style.display = stock ? '' : 'none';
  document.getElementById('imStockHint').style.display = stock ? '' : 'none';
}

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
    const rec = sameStore ? found.rec : { id: 'im_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6), usageCount: 0, createdAt: new Date().toISOString() };
    Object.assign(rec, common, { category, defaultRate: rate });
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
