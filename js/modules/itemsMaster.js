/**
 * ═══════════════════════════════════════════════════════════
 * True Site Sync — Items Master (Vyapar-style, category-wise)
 * ───────────────────────────────────────────────────────────
 * One master database for every item the business buys, sells, owns or bills:
 *   • state.itemsMaster    = the items themselves. This array ALREADY existed —
 *     sale invoices auto-capture items into it and read it back for the item
 *     autocomplete. We extend the same records (rather than start a parallel
 *     list) so an item typed on an invoice and an item added here are the same
 *     row. Legacy records only have {name, hsn, defaultRate, unit, usageCount},
 *     so every read goes through normalizeItem() for the newer fields.
 *   • state.itemCategories = the category master (seeded with the standard four,
 *     users add their own). Categories are stored on the item by NAME.
 *
 * Rate lives in `defaultRate` because saleInvoice.js reads that field.
 * Units come from the shared unit master (units.js) so the two stay in sync.
 * ═══════════════════════════════════════════════════════════
 */
import { state, saveAllData } from './state.js';
import { showToast, getCurrencySymbol } from './utils.js';
import { unitMasterOptions } from './units.js';

export const DEFAULT_ITEM_CATEGORIES = ['Purchase Materials', 'Sales Items', 'Tools & Equipment', 'Services'];

/** The category master (seed the standard set if empty). */
export function getItemCategories() {
  if (!Array.isArray(state.itemCategories) || !state.itemCategories.length) {
    state.itemCategories = [...DEFAULT_ITEM_CATEGORIES];
  }
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

/** Remove a category. Items in it fall back to Uncategorized (never deleted). */
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

/** Fill in fields legacy (invoice-captured) records never had. */
function normalizeItem(i) {
  return {
    id: i.id,
    name: i.name || '',
    description: i.description || '',
    unit: i.unit || 'Nos',
    category: i.category || '',
    hsn: i.hsn || '',
    rate: parseFloat(i.defaultRate) || 0,
    status: i.status || 'Active',
    usageCount: i.usageCount || 0,
  };
}

export function getMasterItems() {
  return (state.itemsMaster || []).map(normalizeItem);
}

// ─── View state (category filter + search) ───
let _activeCat = '__all';
let _search = '';

export function setItemCategoryFilter(cat) { _activeCat = cat; renderItemsMasterView(); }
export function setItemSearch(v) { _search = String(v || '').toLowerCase().trim(); renderItemsMasterTable(); }

function _esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
function _q(s) { return String(s == null ? '' : s).replace(/\\/g, '\\\\').replace(/'/g, "\\'"); }

/** Items after the active category + search filters. */
function _filtered() {
  return getMasterItems().filter(i => {
    if (_activeCat === '__uncat' ? i.category : (_activeCat !== '__all' && i.category !== _activeCat)) return false;
    if (!_search) return true;
    return (i.name + ' ' + i.description + ' ' + i.hsn).toLowerCase().includes(_search);
  });
}

export function renderItemsMasterView() {
  const box = document.getElementById('itemsMasterContent');
  if (!box) return;
  const cats = getItemCategories();
  const all = getMasterItems();
  const count = c => c === '__all' ? all.length : (c === '__uncat' ? all.filter(i => !i.category).length : all.filter(i => i.category === c).length);
  const uncat = count('__uncat');

  const catRow = (id, label, removable) => `
    <div onclick="setItemCategoryFilter('${_q(id)}')" class="group flex items-center justify-between px-3 py-2 rounded-lg cursor-pointer transition ${_activeCat === id ? 'bg-blue-50 border border-blue-200' : 'hover:bg-slate-50 border border-transparent'}">
      <span class="text-sm font-medium ${_activeCat === id ? 'text-blue-700' : 'text-slate-700'}">${_esc(label)}</span>
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
                  <th class="px-4 py-2.5 text-center font-bold text-slate-600 uppercase text-[10px]">Unit</th>
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
  const catColor = c => c === 'Sales Items' ? 'bg-green-100 text-green-800' : c === 'Purchase Materials' ? 'bg-blue-100 text-blue-800'
    : c === 'Tools & Equipment' ? 'bg-purple-100 text-purple-800' : c === 'Services' ? 'bg-amber-100 text-amber-800' : 'bg-slate-100 text-slate-600';
  tbody.innerHTML = rows.map(i => `
    <tr class="hover:bg-slate-50 ${i.status === 'Inactive' ? 'opacity-60' : ''}">
      <td class="px-4 py-3 font-bold text-slate-800">${_esc(i.name)}</td>
      <td class="px-4 py-3 text-slate-500 max-w-[220px] truncate" title="${_esc(i.description)}">${_esc(i.description) || '—'}</td>
      <td class="px-4 py-3"><span class="${catColor(i.category)} text-[10px] px-2 py-0.5 rounded font-bold uppercase">${_esc(i.category || 'Uncategorized')}</span></td>
      <td class="px-4 py-3 text-center font-medium">${_esc(i.unit)}</td>
      <td class="px-4 py-3 font-mono text-xs text-slate-500">${_esc(i.hsn) || '—'}</td>
      <td class="px-4 py-3 text-right font-bold text-orange-600">${cur}${i.rate.toFixed(2)}</td>
      <td class="px-4 py-3 text-center">
        <button onclick="window._toggleItemStatus('${_q(i.id)}')" title="Click to toggle" class="text-[10px] px-2 py-0.5 rounded-full font-bold ${i.status === 'Active' ? 'bg-green-100 text-green-700 hover:bg-green-200' : 'bg-slate-200 text-slate-500 hover:bg-slate-300'}">${i.status}</button>
      </td>
      <td class="px-4 py-3 text-right whitespace-nowrap">
        <button onclick="openItemMasterModal('${_q(i.id)}')" class="text-blue-600 hover:text-blue-800 font-bold text-xs bg-blue-50 px-3 py-1.5 rounded mr-1">Edit</button>
        <button onclick="window._deleteMasterItem('${_q(i.id)}')" class="text-red-500 hover:text-red-700 font-bold text-xs bg-red-50 px-3 py-1.5 rounded">Delete</button>
      </td>
    </tr>`).join('');
}

// ─── Add / Edit modal ───
export function openItemMasterModal(id) {
  const raw = id ? (state.itemsMaster || []).find(x => x.id === id) : null;
  const it = raw ? normalizeItem(raw) : null;
  document.getElementById('itemMasterModal').classList.remove('hidden');
  document.getElementById('imId').value = it ? it.id : '';
  document.getElementById('imModalTitle').textContent = it ? 'Edit Item' : 'Add Item';
  document.getElementById('imName').value = it ? it.name : '';
  document.getElementById('imDesc').value = it ? it.description : '';
  document.getElementById('imHsn').value = it ? it.hsn : '';
  document.getElementById('imRate').value = it ? (it.rate || '') : '';
  document.getElementById('imUnit').innerHTML = unitMasterOptions(it ? it.unit : 'Nos');
  // Default a brand-new item to the category currently being browsed.
  const preset = it ? it.category : (['__all', '__uncat'].includes(_activeCat) ? '' : _activeCat);
  document.getElementById('imCategory').innerHTML = `<option value="">Uncategorized</option>` +
    getItemCategories().map(c => `<option value="${_esc(c)}" ${preset === c ? 'selected' : ''}>${_esc(c)}</option>`).join('');
  document.getElementById('imStatus').value = it ? it.status : 'Active';
}

export function saveItemMasterItem() {
  const id = document.getElementById('imId').value;
  const name = document.getElementById('imName').value.trim();
  if (!name) return showToast('Item Name is required', 'error');
  if (!state.itemsMaster) state.itemsMaster = [];
  // Name is the identity used by the invoice autocomplete — keep it unique.
  const dupe = state.itemsMaster.some(m => m.id !== id && (m.name || '').toLowerCase().trim() === name.toLowerCase());
  if (dupe) return showToast('An item with this name already exists', 'error');
  const fields = {
    name,
    description: document.getElementById('imDesc').value.trim(),
    unit: document.getElementById('imUnit').value,
    category: document.getElementById('imCategory').value,
    hsn: document.getElementById('imHsn').value.trim(),
    defaultRate: parseFloat(document.getElementById('imRate').value) || 0,
    status: document.getElementById('imStatus').value,
  };
  const existing = id ? state.itemsMaster.find(x => x.id === id) : null;
  if (existing) {
    Object.assign(existing, fields);
  } else {
    state.itemsMaster.push({
      id: 'im_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
      ...fields, usageCount: 0, createdAt: new Date().toISOString(),
    });
  }
  saveAllData();
  document.getElementById('itemMasterModal').classList.add('hidden');
  renderItemsMasterView();
  showToast(existing ? 'Item Updated' : 'Item Saved', 'success');
}

if (typeof window !== 'undefined') {
  window.renderItemsMasterView = renderItemsMasterView;
  window.renderItemsMasterTable = renderItemsMasterTable;
  window.openItemMasterModal = openItemMasterModal;
  window.saveItemMasterItem = saveItemMasterItem;
  window.setItemCategoryFilter = setItemCategoryFilter;
  window.setItemSearch = setItemSearch;
  window.getItemCategories = getItemCategories;

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
    const it = (state.itemsMaster || []).find(x => x.id === id);
    if (!it) return;
    it.status = (it.status || 'Active') === 'Active' ? 'Inactive' : 'Active';
    saveAllData();
    renderItemsMasterTable();
  };

  window._deleteMasterItem = function (id) {
    const it = (state.itemsMaster || []).find(x => x.id === id);
    if (!it) return;
    const used = it.usageCount > 0;
    const msg = used
      ? `⚠️ "${it.name}" has been used on ${it.usageCount} document(s).\n\nDeleting it only removes it from the master list — past invoices keep their own copy of the item and are unaffected.\n\nDelete anyway?`
      : `Delete "${it.name}" from the items master?`;
    if (!confirm(msg)) return;
    // Tombstoned delete so the removal syncs to other devices (never raw filter).
    window.recycleDelete && window.recycleDelete('itemsMaster', id, 'Item');
    saveAllData();
    renderItemsMasterView();
    showToast('Item Deleted', 'success');
  };
}
