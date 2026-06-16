/**
 * ═══════════════════════════════════════════════════════════
 * True Site Sync — Recipe (BOQ item → raw-material consumption)
 * ═══════════════════════════════════════════════════════════
 * Defines the raw materials consumed per unit of a BOQ item.
 * Extracted from ui.js. Reads BOQ items from the project; stores
 * recipes per project-client key. Self-contained render group.
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
    if (code) map[code] = { code, description: it.description || it.name || code, uom: it.uom || it.unit || '', rate: it.rate || 0 };
  }));
  // include legacy item master too
  const cId = (state.clients || []).find(c => c.projectId === pid)?.id;
  if (cId && state.items[cId]) Object.values(state.items[cId]).forEach(it => { if (it.code && !map[it.code]) map[it.code] = it; });
  return map;
}

export function renderRecipeView() {
  const container = document.getElementById('recipeViewContent');
  if (!container) return;
  const pid = state.currentProjectId || state.projects?.[0]?.id;
  const cId = _recipeKey(pid);
  const items = _recipeItemsMap(pid);
  const itemList = Object.values(items);
  const recipeCount = state.recipes[cId] ? Object.keys(state.recipes[cId]).length : 0;
  // Match the editor's logic — every non-Tools raw material, regardless of
  // projectId/type, since purchased materials often lack a projectId and types
  // legitimately vary (Cement / Steel / Aggregate / Material).
  const projectMaterials = (state.rawMaterials || []).filter(r => r.type !== 'Tools');

  container.innerHTML = `
    ${!itemList.length ? `
      <div class="bg-white rounded-xl border border-slate-200 shadow-sm p-12 text-center">
        <p class="text-4xl mb-3">&#129516;</p>
        <p class="font-bold text-slate-600">No BOQ Items Found</p>
        <p class="text-xs text-slate-400 mt-1">Add BOQ items in your project to define recipes for them.</p>
      </div>` : `
    <!-- Search -->
    <div class="flex items-center gap-3 mb-4">
      <input type="text" id="recipeSearchInput" placeholder="Search BOQ items..." class="p-2 text-xs border border-slate-300 rounded-lg bg-white w-64 font-medium" oninput="window._recipeFilterList()">
      <select id="recipeFilterStatus" class="p-2 text-xs border border-slate-300 rounded-lg bg-white font-medium" onchange="window._recipeFilterList()">
        <option value="">All Items</option>
        <option value="configured">With Recipe</option>
        <option value="pending">Without Recipe</option>
      </select>
    </div>

    <!-- BOQ Items Grid -->
    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3" id="recipeItemsGrid">
      ${_renderRecipeItemCards(itemList, cId)}
    </div>`}

    <!-- Recipe Editor Overlay (hidden by default) -->
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
        <div style="width:4px;background:${hasRecipe ? '#10b981' : '#e2e8f0'};flex-shrink:0;"></div>
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
  const pid = state.currentProjectId || state.projects?.[0]?.id;
  const client = (state.clients || []).find(c => c.projectId === pid);
  const cId = client?.id;
  const items = cId ? Object.values(state.items[cId] || {}) : [];
  const grid = document.getElementById('recipeItemsGrid');
  if (grid) grid.innerHTML = _renderRecipeItemCards(items, cId);
}

export function recipeOpenEditor(itemCode) {
  const pid = state.currentProjectId || state.projects?.[0]?.id;
  const cId = _recipeKey(pid);
  const item = _recipeItemsMap(pid)[itemCode];
  if (!item) { showToast('Item not found', 'error'); return; }

  const recipe = state.recipes[cId]?.[itemCode] || { ingredients: [] };
  // Show every non-Tools raw material — project-scoping was too strict (materials
  // added via Purchase/Master often have no projectId) and 'Raw Material' was
  // narrower than what users actually create (Cement, Steel, Aggregate, etc.).
  const projectMaterials = (state.rawMaterials || []).filter(r => r.type !== 'Tools');

  // Build ingredient rows
  let ingredientRows = '';
  if (recipe.ingredients.length) {
    recipe.ingredients.forEach((ing, idx) => {
      ingredientRows += _buildIngredientRow(ing, projectMaterials, idx);
    });
  } else {
    ingredientRows = _buildIngredientRow(null, projectMaterials, 0);
  }

  const html = `
    <div id="recipeEditorModal" class="ef-overlay" onclick="if(event.target===this)window._recipeCloseEditor()">
      <div class="ef-modal" style="max-width:640px;">
        <div class="ef-header">
          <div>
            <h3 class="ef-title flex items-center gap-2">
              <span class="text-xs font-bold px-2 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-100">${item.code}</span>
              ${item.description}
            </h3>
            <p class="text-xs text-blue-500 font-bold mt-1">Recipe per 1 ${item.uom} &middot; Rate: &#8377;${(item.rate || 0).toLocaleString('en-IN')}</p>
          </div>
          <button onclick="window._recipeCloseEditor()" class="ef-close">&times;</button>
        </div>
        <div class="ef-body">
          <p class="text-xs text-slate-500 mb-4 bg-slate-50 p-2 rounded border">Define the raw materials consumed to execute <span class="font-bold">1 ${item.uom}</span> of <span class="font-bold">${item.description}</span>.</p>
          <div class="overflow-x-auto border rounded-lg mb-3">
            <table class="min-w-full text-sm">
              <thead class="bg-slate-50">
                <tr class="text-left text-slate-500 uppercase font-bold text-[10px]">
                  <th class="p-2.5 w-[45%]">Raw Material</th>
                  <th class="p-2.5 w-[22%]">Qty Per Unit</th>
                  <th class="p-2.5 w-[18%]">Wastage %</th>
                  <th class="p-2.5 w-[15%] text-center">Del</th>
                </tr>
              </thead>
              <tbody id="recipeTableBody" class="bg-white">${ingredientRows}</tbody>
            </table>
          </div>
          <button onclick="window._recipeAddRow()" class="text-xs bg-blue-50 text-blue-700 border border-blue-200 px-3 py-1.5 rounded-lg font-bold hover:bg-blue-100 transition">+ Add Material</button>
        </div>
        <div class="ef-footer">
          <div class="flex items-center gap-3">
            ${recipe.ingredients.length ? '<button onclick="window._recipeDelete()" class="text-red-500 font-bold text-xs hover:underline">Delete Recipe</button>' : '<span></span>'}
          </div>
          <div class="flex items-center gap-2">
            <button onclick="window._recipeCloseEditor()" class="ef-btn-cancel">Cancel</button>
            <button onclick="window._recipeSave()" class="ef-btn-save">Save Recipe</button>
          </div>
        </div>
      </div>
    </div>`;

  document.getElementById('recipeEditorModal')?.remove();
  document.body.insertAdjacentHTML('beforeend', html);

  // Store current context
  window._recipeCtx = { cId, itemCode };
}

function _buildIngredientRow(data, materials, idx) {
  let rmOptions = '<option value="">-- Select Material --</option>';
  materials.forEach(rm => {
    rmOptions += `<option value="${rm.id}" ${data && data.rawMatId === rm.id ? 'selected' : ''}>${rm.name} (${rm.unit})</option>`;
  });
  return `<tr class="border-t border-slate-100 hover:bg-slate-50">
    <td class="p-2"><select class="w-full p-1.5 text-xs border border-slate-300 rounded-lg bg-white font-medium rm-select">${rmOptions}</select></td>
    <td class="p-2"><input type="number" class="w-full p-1.5 text-xs border border-slate-300 rounded-lg font-bold text-blue-700 ing-qty" value="${data ? data.qty : ''}" placeholder="0" step="0.01" min="0"></td>
    <td class="p-2"><input type="number" class="w-full p-1.5 text-xs border border-slate-300 rounded-lg ing-wastage" value="${data && data.wastage ? data.wastage : '0'}" placeholder="0" min="0" max="100"></td>
    <td class="p-2 text-center"><button onclick="this.closest('tr').remove()" class="text-red-400 hover:bg-red-50 p-1 rounded-lg font-bold text-xs transition">&times;</button></td>
  </tr>`;
}

export function recipeAddRow() {
  // Same logic as recipeOpenEditor — every non-Tools raw material, so the
  // "+ Add Material" button actually offers usable ingredients.
  const projectMaterials = (state.rawMaterials || []).filter(r => r.type !== 'Tools');
  const tbody = document.getElementById('recipeTableBody');
  if (tbody) tbody.insertAdjacentHTML('beforeend', _buildIngredientRow(null, projectMaterials, tbody.rows.length));
}

export function recipeSave() {
  const ctx = window._recipeCtx;
  if (!ctx) return;
  const { cId, itemCode } = ctx;

  const ingredients = [];
  document.querySelectorAll('#recipeTableBody tr').forEach(tr => {
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
  document.getElementById('recipeEditorModal')?.remove();
  window._recipeCtx = null;
}

// Legacy compat stubs
export function loadRecipeItemsDropdown() { renderRecipeView(); }
export function renderExistingRecipesList() {}
export function loadRecipeEditor() {}
export function addRecipeIngredientRow(data) { recipeAddRow(); }
export function saveRecipe() { recipeSave(); }
export function deleteRecipe() { recipeDelete(); }
