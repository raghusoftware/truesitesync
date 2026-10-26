/**
 * ═══════════════════════════════════════════════════════════
 * True Site Sync — Recipe (BOQ item → raw-material consumption)
 * ═══════════════════════════════════════════════════════════
 */

import { state, saveAllData } from './state.js';
import { showToast } from './utils.js';

function _recipeKey(pid) {
  const client = (state.clients || []).find(c => c.projectId === pid);
  return client?.id || pid;
}

/** BOQ items for a project as a map keyed by code (merges all BOQ groups + legacy item master) */
function _recipeItemsMap(pid) {
  const map = {};
  const proj = (state.projects || []).find(p => p.id === pid);
  
  (proj?.boqs || []).forEach(g => (g.items || []).forEach(it => {
    const code = it.code || it.itemNo;
    if (code) {
      map[code] = { 
        code, 
        description: it.description || it.name || code, 
        uom: it.uom || it.unit || '', 
        rate: it.rate || 0 
      };
    }
  }));

  // include legacy item master too
  const cId = (state.clients || []).find(c => c.projectId === pid)?.id;
  if (cId && state.items[cId]) {
    Object.values(state.items[cId]).forEach(it => { 
      if (it.code && !map[it.code]) map[it.code] = it; 
    });
  }
  return map;
}

export function renderRecipeView() {
  const container = document.getElementById('recipeViewContent');
  if (!container) return;
  
  const pid = state.currentProjectId || state.projects?.[0]?.id;
  const cId = _recipeKey(pid);
  const items = _recipeItemsMap(pid);
  const itemList = Object.values(items);
  
  container.innerHTML = `
    ${!itemList.length ? `
      <div class="bg-white rounded-xl border border-slate-200 shadow-sm p-12 text-center">
        <p class="text-4xl mb-3">&#129516;</p>
        <p class="font-bold text-slate-600">No BOQ Items Found</p>
        <p class="text-xs text-slate-400 mt-1">Add BOQ items in your project to define recipes for them.</p>
      </div>
    ` : `
      <div class="flex items-center gap-3 mb-4">
        <input type="text" id="recipeSearchInput" placeholder="Search BOQ items..." class="p-2 text-xs border border-slate-300 rounded-lg bg-white w-64 font-medium" oninput="window._recipeFilterList()">
        <select id="recipeFilterStatus" class="p-2 text-xs border border-slate-300 rounded-lg bg-white font-medium" onchange="window._recipeFilterList()">
          <option value="">All Items</option>
          <option value="configured">With Recipe</option>
          <option value="pending">Without Recipe</option>
        </select>
      </div>

      <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3" id="recipeItemsGrid">
        ${_renderRecipeItemCards(itemList, cId)}
      </div>
    `}

    <div id="recipeEditorPanel" class="hidden"></div>
  `;
}

function _renderRecipeItemCards(items, cId) {
  const search = (document.getElementById('recipeSearchInput')?.value || '').toLowerCase();
  const statusFilter = document.getElementById('recipeFilterStatus')?.value || '';

  let filtered = items;
  if (search) filtered = filtered.filter(i => (i.code || '').toLowerCase().includes(search) || (i.description || '').toLowerCase().includes(search));
  if (statusFilter === 'configured') filtered = filtered.filter(i => state.recipes[cId]?.[i.code]?.ingredients?.length > 0);
  if (statusFilter === 'pending') filtered = filtered.filter(i => !state.recipes[cId]?.[i.code]?.ingredients?.length);

  if (!filtered.length) {
    return `<div class="col-span-full text-center py-8 text-slate-400"><p class="font-bold">No matching items</p></div>`;
  }

  return filtered.map(item => {
    const recipe = state.recipes[cId]?.[item.code];
    const hasRecipe = recipe?.ingredients?.length > 0;
    const ingredientCount = recipe?.ingredients?.length || 0;
    const ingredientNames = hasRecipe ? recipe.ingredients.map(ing => {
      const rm = (state.rawMaterials || []).find(r => r.id === ing.rawMatId);
      return rm ? rm.name : 'Unknown';
    }).join(', ') : '';

    return `<div class="bg-white rounded-xl border ${hasRecipe ? 'border-green-200' : 'border-slate-200'} shadow-sm hover:shadow-md transition cursor-pointer overflow-hidden" onclick="window._recipeOpenEditor('${item.code}')">
      <div class="flex items-stretch">
        <div style="width:4px;background:${hasRecipe ? '#ef8420' : '#e2e8f0'};flex-shrink:0;"></div>
        <div class="flex-1 p-4">
          <div class="flex items-start justify-between gap-2 mb-2">
            <div class="flex-1 min-w-0">
              <div class="flex items-center gap-2 mb-1">
                <span class="text-[10px] font-bold px-1.5 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-100">${item.code}</span>
                ${hasRecipe
                  ? '<span class="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-green-50 text-green-700 border border-green-200">&#10003; Recipe</span>'
                  : '<span class="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-400 border border-slate-200">No Recipe</span>'}
              </div>
              <h4 class="text-sm font-bold text-slate-800 truncate">${item.description}</h4>
            </div>
          </div>
          <div class="flex items-center gap-3 text-[10px] text-slate-400">
            <span class="font-medium">Unit: <span class="font-bold text-slate-600">${item.uom}</span></span>
            <span class="font-medium">Rate: <span class="font-bold text-slate-600">&#8377;${(item.rate || 0).toLocaleString('en-IN')}</span></span>
            ${hasRecipe ? `<span class="font-bold text-green-600">${ingredientCount} material${ingredientCount !== 1 ? 's' : ''}</span>` : ''}
          </div>
          ${hasRecipe ? `<p class="text-[10px] text-slate-400 mt-1 truncate">&#128230; ${ingredientNames}</p>` : ''}
        </div>
      </div>
    </div>`;
  }).join('');
}

export function recipeFilterList() {
  // Same item source as the list itself (BOQ groups + legacy item master).
  const pid = state.currentProjectId || state.projects?.[0]?.id;
  const grid = document.getElementById('recipeItemsGrid');
  if (grid) grid.innerHTML = _renderRecipeItemCards(Object.values(_recipeItemsMap(pid)), _recipeKey(pid));
}

/* ═══════════════════════════════════════════════════════════
 *  RECIPE EDITOR — a centred modal (not a bottom sheet), so nothing sits near
 *  the phone's own Back / navigation bar:
 *    • overlay = flex centre + safe-area padding; the card is capped at 70% of
 *      the screen height, so ≥15% stays clear above and below;
 *    • header (title + 44×44 close) and footer (actions) stay put, the body scrolls;
 *    • tap the dimmed backdrop, the ✕, Esc or Android Back to close — with a
 *      "discard changes?" check once something was edited.
 *  Styles: css/shell.css "Recipe editor".
 * ═══════════════════════════════════════════════════════════ */
const _rEsc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const _X = '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>';
const _TRASH = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/></svg>';
let _recipeMats = [];

export function recipeOpenEditor(itemCode) {
  const pid = state.currentProjectId || state.projects?.[0]?.id;
  const cId = _recipeKey(pid);
  const item = _recipeItemsMap(pid)[itemCode];
  if (!item) { showToast('Item not found', 'error'); return; }

  const recipe = state.recipes[cId]?.[itemCode] || { ingredients: [] };
  // Tools are not consumed — leave them out, unless that would empty the list.
  _recipeMats = (state.rawMaterials || []).filter(r => r.type !== 'Tools');
  if (!_recipeMats.length) _recipeMats = state.rawMaterials || [];

  const rows = (recipe.ingredients.length ? recipe.ingredients : [null]).map(_buildIngredientRow).join('');
  const html = `
    <div id="recipeEditorModal" class="rcp-ov" role="presentation">
      <div class="rcp-modal" role="dialog" aria-modal="true" aria-labelledby="rcpTitle">
        <header class="rcp-head">
          <div class="rcp-head-txt">
            <span class="rcp-code">${_rEsc(item.code)}</span>
            <h3 id="rcpTitle">${_rEsc(item.description)}</h3>
            <p>Materials for <b>1 ${_rEsc(item.uom || 'unit')}</b> · Rate ₹${(item.rate || 0).toLocaleString('en-IN')}</p>
          </div>
          <button class="rcp-x" onclick="window._recipeRequestClose()" aria-label="Close">${_X}</button>
        </header>
        <div class="rcp-body" id="rcpBody">
          <div class="rcp-list" id="recipeTableBody">${rows}</div>
          <button class="rcp-add" onclick="window._recipeAddRow()">+ Add material</button>
        </div>
        <footer class="rcp-foot">
          ${recipe.ingredients.length ? `<button class="rcp-del" onclick="window._recipeDelete()" aria-label="Delete recipe" title="Delete recipe">${_TRASH}</button>` : ''}
          <button class="rcp-btn ghost" onclick="window._recipeRequestClose()">Cancel</button>
          <button class="rcp-btn primary" onclick="window._recipeSave()">Save recipe</button>
        </footer>
      </div>
    </div>`;

  document.getElementById('recipeEditorModal')?.remove();
  document.body.insertAdjacentHTML('beforeend', html);
  const ov = document.getElementById('recipeEditorModal');
  // Backdrop tap closes; a press that STARTS inside the card (e.g. selecting text
  // and releasing outside) does not.
  let downOnBackdrop = false;
  ov.addEventListener('pointerdown', (e) => { downOnBackdrop = e.target === ov; });
  ov.addEventListener('click', (e) => { if (e.target === ov && downOnBackdrop) window._recipeRequestClose(); });
  ov.addEventListener('input', () => { ov.dataset.dirty = '1'; });
  ov.addEventListener('change', () => { ov.dataset.dirty = '1'; });
  ov.addEventListener('input', _recipeUpdateTotals);
  ov.addEventListener('change', _recipeUpdateTotals);
  // Keep a focused field in view when the phone keyboard shrinks the screen.
  ov.addEventListener('focusin', (e) => { if (e.target.matches('input, select')) setTimeout(() => e.target.scrollIntoView({ block: 'center', behavior: 'smooth' }), 250); });
  // Android Back (mobileShell → topVisibleModal → __onBack) asks before discarding.
  ov.__onBack = () => window._recipeRequestClose();
  document.addEventListener('keydown', _recipeEsc);
  _recipeUpdateTotals();

  window._recipeCtx = { cId, itemCode };
}

function _recipeEsc(e) { if (e.key === 'Escape' && document.getElementById('recipeEditorModal')) window._recipeRequestClose(); }

/** One material: picker on top, qty + wastage below, live "needs X incl. wastage". */
function _buildIngredientRow(data) {
  const opts = '<option value="">Select material…</option>' + _recipeMats.map(rm =>
    `<option value="${rm.id}" data-unit="${_rEsc(rm.unit || '')}" ${data && data.rawMatId === rm.id ? 'selected' : ''}>${_rEsc(rm.name)}${rm.unit ? ` (${_rEsc(rm.unit)})` : ''}</option>`).join('');
  return `<div class="rcp-row">
    <div class="rcp-row-top">
      <select class="rcp-in rm-select" aria-label="Material">${opts}</select>
      <button class="rcp-row-x" onclick="this.closest('.rcp-row').remove();window._recipeMarkDirty()" aria-label="Remove material">${_X}</button>
    </div>
    <div class="rcp-row-nums">
      <label><span>Qty per unit</span><input type="number" inputmode="decimal" class="rcp-in ing-qty" value="${data ? data.qty : ''}" placeholder="0" step="0.01" min="0"></label>
      <label><span>Wastage %</span><input type="number" inputmode="decimal" class="rcp-in ing-wastage" value="${data && data.wastage ? data.wastage : '0'}" placeholder="0" min="0" max="100"></label>
    </div>
    <div class="rcp-need"></div>
  </div>`;
}

function _recipeUpdateTotals() {
  document.querySelectorAll('#recipeTableBody .rcp-row').forEach(row => {
    const sel = row.querySelector('.rm-select');
    const qty = parseFloat(row.querySelector('.ing-qty')?.value) || 0;
    const w = parseFloat(row.querySelector('.ing-wastage')?.value) || 0;
    const unit = sel?.selectedOptions[0]?.dataset.unit || '';
    const out = row.querySelector('.rcp-need');
    if (out) out.textContent = sel?.value && qty > 0 ? `Issue ${+(qty * (1 + w / 100)).toFixed(3)} ${unit} per unit incl. wastage` : '';
  });
}
window._recipeMarkDirty = () => { const ov = document.getElementById('recipeEditorModal'); if (ov) ov.dataset.dirty = '1'; };

export function recipeAddRow() {
  const list = document.getElementById('recipeTableBody');
  if (!list) return;
  list.insertAdjacentHTML('beforeend', _buildIngredientRow(null));
  window._recipeMarkDirty();
  const row = list.lastElementChild;
  row?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  setTimeout(() => row?.querySelector('select')?.focus({ preventScroll: true }), 200);
}

export function recipeSave() {
  const ctx = window._recipeCtx;
  if (!ctx) return;
  const { cId, itemCode } = ctx;

  const ingredients = [];
  document.querySelectorAll('#recipeTableBody .rcp-row').forEach(tr => {
    const rawMatId = tr.querySelector('.rm-select')?.value;
    const qty = parseFloat(tr.querySelector('.ing-qty')?.value) || 0;
    const wastage = parseFloat(tr.querySelector('.ing-wastage')?.value) || 0;
    if (rawMatId && qty > 0) ingredients.push({ rawMatId, qty, wastage });
  });

  if (ingredients.length === 0) return showToast('Add at least one material with quantity > 0', 'error');

  if (!state.recipes[cId]) state.recipes[cId] = {};
  state.recipes[cId][itemCode] = { ingredients };
  saveAllData();
  showToast('Recipe saved', 'success');
  recipeCloseEditor();
  renderRecipeView();
}

export function recipeDelete() {
  const ctx = window._recipeCtx;
  if (!ctx) return;
  if (!confirm('Delete this recipe?')) return;
  const { cId, itemCode } = ctx;
  
  if (state.recipes[cId]?.[itemCode]) {
    delete state.recipes[cId][itemCode];
    saveAllData();
    showToast('Recipe deleted', 'warning');
  }
  recipeCloseEditor();
  renderRecipeView();
}

export function recipeCloseEditor() {
  const ov = document.getElementById('recipeEditorModal');
  document.removeEventListener('keydown', _recipeEsc);
  window._recipeCtx = null;
  if (!ov) return;
  ov.classList.add('out');
  setTimeout(() => ov.remove(), 180);
}
/** Close from ✕ / backdrop / Back / Esc — confirm first if something was edited. */
window._recipeRequestClose = () => {
  const ov = document.getElementById('recipeEditorModal');
  if (ov?.dataset.dirty && !confirm('Discard your changes to this recipe?')) return;
  recipeCloseEditor();
};

// Legacy compat stubs
export function loadRecipeItemsDropdown() { renderRecipeView(); }
export function renderExistingRecipesList() {}
export function loadRecipeEditor() {}
export function addRecipeIngredientRow(data) { recipeAddRow(); }
export function saveRecipe() { recipeSave(); }
export function deleteRecipe() { recipeDelete(); }

// ============================================================================
// GLOBAL BINDINGS
// Bind exported functions to the window object so inline HTML onclick handlers 
// trigger the correct updated module functions.
// ============================================================================
window._recipeAddRow = recipeAddRow;
window._recipeCloseEditor = recipeCloseEditor;
window._recipeSave = recipeSave;
window._recipeDelete = recipeDelete;
window._recipeFilterList = recipeFilterList;
window._recipeOpenEditor = recipeOpenEditor;