/**
 * ═══════════════════════════════════════════════════════════
 * True Site Sync — Measurement Sheet core
 * ═══════════════════════════════════════════════════════════
 * The measurement-entry subsystem: project/BOQ context + smart
 * autocomplete, sheet create/save/load, custom columns, BBS (bar
 * bending schedule), and attachments — plus their shared private
 * state. Extracted from ui.js as one cohesive unit (this is the
 * keystone module). Navigation (switchView) reached via window.
 * ═══════════════════════════════════════════════════════════
 */

import { state, saveAllData } from './state.js';
import { showToast, getCurrencySymbol } from './utils.js';
import { BBS_UNIT_WEIGHTS } from './constants.js';

let _allSheetBoqItems = [];     // all BOQ items across all groups (unfiltered)
let _currentSheetBoqItems = []; // filtered BOQ items for current selection

/** Load project context into measurement form — auto-detect from currentProjectId */
function _loadSheetProjectContext(projId) {
  const proj = (state.projects || []).find(p => p.id === projId);
  console.log('[BOQ] Loading project context:', projId, 'found:', !!proj, 'boqs:', proj?.boqs?.length || 0, 'boqItems:', proj?.boqItems?.length || 0);
  // Build flat BOQ items with boqRef for multiple BOQ/PO support
  _allSheetBoqItems = [];
  if (proj?.boqs?.length) {
    proj.boqs.forEach(g => {
      console.log('[BOQ] Group:', g.name, 'items:', (g.items || []).length);
      (g.items || []).forEach((item, i) => {
        _allSheetBoqItems.push({ ...item, _boqRef: g.id + ':' + i, _boqGroupName: g.name || g.type, _boqGroupId: g.id });
      });
    });
  } else if (proj?.boqItems?.length) {
    _allSheetBoqItems = (proj.boqItems || []).map((item, i) => ({ ...item, _idx: i }));
  }
  console.log('[BOQ] Total items loaded:', _allSheetBoqItems.length);

  // Populate BOQ group selector dropdown
  const grpSel = document.getElementById('sheetBoqGroupSelect');
  if (grpSel) {
    grpSel.innerHTML = '<option value="all">All BOQ / PO Items</option>';
    if (proj?.boqs?.length) {
      proj.boqs.forEach(g => {
        const count = (g.items || []).length;
        grpSel.innerHTML += `<option value="${g.id}">${g.name || g.type} (${g.type}) — ${count} items</option>`;
      });
    }
  }

  // Apply filter (default: show all)
  _applyBoqGroupFilter();

  // Set hidden selects for backward compat
  const projSel = document.getElementById('sheetProjectSelect');
  if (projSel) projSel.value = projId || '';
  const clientSel = document.getElementById('sheetClientSelect');
  if (clientSel) {
    const client = (state.clients || []).find(c => c.projectId === projId);
    clientSel.value = client?.id || '';
  }

  // Update project info banner
  const nameEl = document.getElementById('sheetProjName');
  if (nameEl) nameEl.textContent = proj?.name || '—';
  const clientEl = document.getElementById('sheetProjClient');
  if (clientEl) clientEl.textContent = proj?.clientName || '—';
  const dotEl = document.getElementById('sheetProjDot');
  if (dotEl && proj?.color) dotEl.style.background = `linear-gradient(135deg,${proj.color},${proj.color}cc)`;

  // WO info — show from BOQ groups or fallback to project level
  const woNums = (proj?.boqs || []).map(g => g.woNumber).filter(Boolean).join(', ') || proj?.woNumber || '';
  const woNumEl = document.getElementById('sheetWONumber');
  if (woNumEl) woNumEl.textContent = woNums || 'No WO';
  const firstWO = (proj?.boqs || []).find(g => g.woDate) || proj;
  const woDateEl = document.getElementById('sheetWODate');
  if (woDateEl) woDateEl.textContent = firstWO?.woDate ? 'Date: ' + firstWO.woDate : '—';

  // Populate BBS linked item dropdown
  _populateBBSLinkedDropdown();
}

function _populateBBSLinkedDropdown() {
  const sel = document.getElementById('bbsLinkedItem');
  if (!sel) return;
  const prev = sel.value; // preserve selection
  sel.innerHTML = '<option value="">— Select BOQ Item —</option>';
  _allSheetBoqItems.forEach((item, i) => {
    const ref = item._boqRef || String(i);
    sel.innerHTML += `<option value="${ref}">${item.code || ''} — ${(item.description || '').substring(0, 50)} [${item.uom || ''}]</option>`;
  });
  if (prev) sel.value = prev;
}

function _applyBoqGroupFilter() {
  const grpSel = document.getElementById('sheetBoqGroupSelect');
  const selectedGroup = grpSel?.value || 'all';
  if (selectedGroup === 'all') {
    _currentSheetBoqItems = [..._allSheetBoqItems];
  } else {
    _currentSheetBoqItems = _allSheetBoqItems.filter(item => item._boqGroupId === selectedGroup);
  }
  // Update count
  const countEl = document.getElementById('sheetBoqCount');
  if (countEl) countEl.textContent = _currentSheetBoqItems.length || '0';
}

export function onSheetBoqGroupChange() {
  _applyBoqGroupFilter();
  showToast(`Showing ${_currentSheetBoqItems.length} BOQ items`, 'info');
}

/** When project changes — legacy handler */
export function handleSheetProjectChange() {
  const projId = document.getElementById('sheetProjectSelect')?.value || state.currentProjectId;
  _loadSheetProjectContext(projId);
  const tableBody = document.getElementById('entryTableBody');
  if (tableBody && tableBody.rows.length === 0) addMoreEntries(5);
}

/** Close all open BOQ dropdowns */
export function closeBoqDropdowns() {
  document.querySelectorAll('.boq-dropdown').forEach(d => d.remove());
}

/** Show BOQ quick reference modal */
export function showBOQQuickRef() {
  const projId = document.getElementById('sheetProjectSelect')?.value || state.currentProjectId;
  const proj = (state.projects || []).find(p => p.id === projId);
  const allItems = _currentSheetBoqItems;
  if (!allItems.length) { showToast('No BOQ/PO items in this project', 'error'); return; }

  const usedQty = _calcUsedQtyPerBOQ(projId);

  let html = `<div style="position:fixed;top:0;left:0;right:0;bottom:0;z-index:100000;background:rgba(15,23,42,.5);display:flex;align-items:center;justify-content:center;" onclick="if(event.target===this)this.remove()">
    <div style="background:#fff;border-radius:16px;width:90%;max-width:900px;max-height:85vh;overflow-y:auto;box-shadow:0 25px 60px rgba(0,0,0,.2);">
      <div class="px-5 py-3 border-b flex items-center justify-between" style="background:linear-gradient(135deg,#eff6ff,#dbeafe);border-radius:16px 16px 0 0;">
        <h4 class="text-sm font-extrabold text-slate-700">BOQ/PO — ${proj.name}</h4>
        <button onclick="this.closest('[style]').remove()" class="w-7 h-7 rounded-full bg-white text-slate-400 hover:text-red-500 flex items-center justify-center font-bold text-sm">✕</button>
      </div>
      <table class="w-full text-xs">
        <thead><tr style="background:#f8fafc;"><th class="px-3 py-2 text-left font-bold text-slate-500 border-b">Sr</th><th class="px-3 py-2 text-left font-bold text-slate-500 border-b">Source</th><th class="px-3 py-2 text-left font-bold text-slate-500 border-b">Code</th><th class="px-3 py-2 text-left font-bold text-slate-500 border-b">Description</th><th class="px-3 py-2 text-center font-bold text-slate-500 border-b">UOM</th><th class="px-3 py-2 text-right font-bold text-slate-500 border-b">Qty</th><th class="px-3 py-2 text-right font-bold text-slate-500 border-b">Used</th><th class="px-3 py-2 text-right font-bold text-slate-500 border-b">Balance</th><th class="px-3 py-2 text-right font-bold text-slate-500 border-b">Rate</th></tr></thead>
        <tbody>`;
  allItems.forEach((item, i) => {
    const refKey = item._boqRef || String(i);
    const used = usedQty[refKey] || usedQty[i] || 0;
    const bal = (item.qty || 0) - used;
    const balColor = bal <= 0 ? 'color:#ef4444;' : bal < (item.qty || 0) * 0.2 ? 'color:#f59e0b;' : 'color:#10b981;';
    html += `<tr style="${i % 2 ? 'background:#fafbfc;' : ''}">
      <td class="px-3 py-2 text-center text-slate-400 font-bold border-b">${i + 1}</td>
      <td class="px-3 py-2 text-[9px] font-bold border-b" style="color:#6366f1">${item._boqGroupName || 'BOQ'}</td>
      <td class="px-3 py-2 font-mono font-bold text-blue-700 border-b">${item.code || ''}</td>
      <td class="px-3 py-2 font-semibold text-slate-700 border-b">${item.description || ''}</td>
      <td class="px-3 py-2 text-center text-slate-500 font-bold border-b">${item.uom || ''}</td>
      <td class="px-3 py-2 text-right font-bold text-slate-700 border-b">${(item.qty || 0).toLocaleString('en-IN')}</td>
      <td class="px-3 py-2 text-right font-bold text-slate-500 border-b">${used ? used.toLocaleString('en-IN', {maximumFractionDigits:2}) : '0'}</td>
      <td class="px-3 py-2 text-right font-extrabold border-b" style="${balColor}">${bal.toLocaleString('en-IN', {maximumFractionDigits:2})}</td>
      <td class="px-3 py-2 text-right font-bold text-slate-600 border-b">${getCurrencySymbol()}${(item.rate || 0).toLocaleString('en-IN')}</td>
    </tr>`;
  });
  html += `</tbody></table></div></div>`;
  document.body.insertAdjacentHTML('beforeend', html);
}

/** Calculate used quantities per BOQ index from all sheets in this project */
function _calcUsedQtyPerBOQ(projId) {
  const used = {};
  (state.sheets || []).filter(s => s.projectId === projId).forEach(sheet => {
    (sheet.entries || []).forEach(e => {
      if (e.boqIndex !== undefined && e.boqIndex !== null && e.boqIndex !== '') {
        const idx = parseInt(e.boqIndex);
        used[idx] = (used[idx] || 0) + (parseFloat(e.qty) || 0);
      }
    });
  });
  return used;
}

/** Searchable BOQ dropdown on measurement row item input */
export function onMeasureItemInput(input) {
  closeBoqDropdowns();
  const val = input.value.trim().toLowerCase();
  if (!_currentSheetBoqItems.length) {
    // Try loading context if not loaded yet
    if (state.currentProjectId) {
      _loadSheetProjectContext(state.currentProjectId);
    }
    if (!_currentSheetBoqItems.length) {
      if (val) {
        const dd = document.createElement('div');
        dd.className = 'boq-dropdown';
        dd.innerHTML = '<div class="boq-dd-empty" style="padding:12px;font-size:11px;color:#94a3b8;">No BOQ items in this project.<br>Add BOQ items in Project Settings first.</div>';
        _positionDropdown(dd, input);
      }
      return;
    }
  }
  if (!val) return;

  // Always read the CURRENT array (not a stale reference)
  const items = _currentSheetBoqItems;

  // Get used quantities
  const projId = document.getElementById('sheetProjectSelect')?.value || state.currentProjectId;
  const usedQty = _calcUsedQtyPerBOQ(projId);

  // Filter by typed text
  const matches = items.map((item, idx) => ({ ...item, _idx: idx }))
    .filter(item => {
      return (item.code || '').toLowerCase().includes(val) ||
             (item.description || '').toLowerCase().includes(val);
    });

  if (!matches.length) {
    const dd = document.createElement('div');
    dd.className = 'boq-dropdown';
    dd.innerHTML = '<div class="boq-dd-empty">No matching BOQ items</div>';
    _positionDropdown(dd, input);
    return;
  }

  const dd = document.createElement('div');
  dd.className = 'boq-dropdown';
  dd.innerHTML = `<div class="boq-dd-header">BOQ Items — ${matches.length} match${matches.length > 1 ? 'es' : ''}</div>`;
  matches.forEach(item => {
    const refKey = item._boqRef || String(item._idx);
    const used = usedQty[refKey] || usedQty[item._idx] || 0;
    const bal = (item.qty || 0) - used;
    const balColor = bal <= 0 ? '#ef4444' : bal < (item.qty || 0) * 0.2 ? '#f59e0b' : '#10b981';
    const div = document.createElement('div');
    div.className = 'boq-dd-item';
    const groupLabel = item._boqGroupName ? `<span class="dd-group" style="color:#6366f1;font-size:9px;font-weight:700;">[${item._boqGroupName}]</span> ` : '';
    div.innerHTML = `
      ${groupLabel}<span class="dd-code">${item.code || '—'}</span>
      <span class="dd-desc">${item.description || ''}</span>
      <span class="dd-uom">${item.uom || ''}</span>
      <span class="dd-bal" style="color:${balColor}">Bal: ${bal.toLocaleString('en-IN', {maximumFractionDigits:2})}</span>`;
    div.onclick = () => _selectBOQItemFromRow(input.closest('tr'), item);
    dd.appendChild(div);
  });
  _positionDropdown(dd, input);
}

function _positionDropdown(dd, input) {
  // Append to the fullscreen sheet if active, otherwise body
  const sheet = document.querySelector('.fullscreen-sheet');
  const container = sheet || document.body;
  container.appendChild(dd);

  const rect = input.getBoundingClientRect();
  if (sheet) {
    // Inside fullscreen sheet — use viewport-relative positioning with fixed
    dd.style.position = 'fixed';
    dd.style.top = (rect.bottom + 2) + 'px';
    dd.style.left = rect.left + 'px';
    dd.style.zIndex = '100000';
  } else {
    dd.style.position = 'absolute';
    dd.style.top = (rect.bottom + window.scrollY + 2) + 'px';
    dd.style.left = (rect.left + window.scrollX) + 'px';
  }
}

/** Searchable BOQ dropdown on measurement row description input */
export function onMeasureDescInput(input) {
  closeBoqDropdowns();
  const val = input.value.trim().toLowerCase();
  if (!_currentSheetBoqItems.length) {
    if (state.currentProjectId) {
      _loadSheetProjectContext(state.currentProjectId);
    }
    if (!_currentSheetBoqItems.length) {
      if (val) {
        const dd = document.createElement('div');
        dd.className = 'boq-dropdown';
        dd.innerHTML = '<div class="boq-dd-empty" style="padding:12px;font-size:11px;color:#94a3b8;">No BOQ items in this project.<br>Add BOQ items in Project Settings first.</div>';
        _positionDropdown(dd, input);
      }
      return;
    }
  }
  if (!val) return;

  const items = _currentSheetBoqItems;
  const projId = document.getElementById('sheetProjectSelect')?.value || state.currentProjectId;
  const usedQty = _calcUsedQtyPerBOQ(projId);

  const matches = items.map((item, idx) => ({ ...item, _idx: idx }))
    .filter(item => {
      return (item.description || '').toLowerCase().includes(val) ||
             (item.code || '').toLowerCase().includes(val);
    });

  if (!matches.length) {
    const dd = document.createElement('div');
    dd.className = 'boq-dropdown';
    dd.innerHTML = '<div class="boq-dd-empty">No matching BOQ items</div>';
    _positionDropdown(dd, input);
    return;
  }

  const dd = document.createElement('div');
  dd.className = 'boq-dropdown';
  dd.innerHTML = `<div class="boq-dd-header">BOQ Items — ${matches.length} match${matches.length > 1 ? 'es' : ''}</div>`;
  matches.forEach(item => {
    const refKey = item._boqRef || String(item._idx);
    const used = usedQty[refKey] || usedQty[item._idx] || 0;
    const bal = (item.qty || 0) - used;
    const balColor = bal <= 0 ? '#ef4444' : bal < (item.qty || 0) * 0.2 ? '#f59e0b' : '#10b981';
    const div = document.createElement('div');
    div.className = 'boq-dd-item';
    const groupLabel = item._boqGroupName ? `<span class="dd-group" style="color:#6366f1;font-size:9px;font-weight:700;">[${item._boqGroupName}]</span> ` : '';
    div.innerHTML = `
      ${groupLabel}<span class="dd-code">${item.code || '—'}</span>
      <span class="dd-desc">${item.description || ''}</span>
      <span class="dd-uom">${item.uom || ''}</span>
      <span class="dd-bal" style="color:${balColor}">Bal: ${bal.toLocaleString('en-IN', {maximumFractionDigits:2})}</span>`;
    div.onclick = () => _selectBOQItemFromRow(input.closest('tr'), item);
    dd.appendChild(div);
  });
  _positionDropdown(dd, input);
}

/** Fill measurement row when a BOQ item is selected (works from any input in the row) */
function _selectBOQItemFromRow(tr, item) {
  closeBoqDropdowns();
  if (!tr) return;

  // Set code field
  const codeInput = tr.querySelector('.code-input');
  if (codeInput) codeInput.value = item.code || '';

  // Set description
  const descInput = tr.querySelector('.desc-input');
  if (descInput) descInput.value = item.description || '';

  // Set UOM
  const uomInput = tr.querySelector('.uom-input');
  if (uomInput) uomInput.value = item.uom || '';
  const uomDisplay = tr.querySelector('.uom-display');
  if (uomDisplay) uomDisplay.textContent = item.uom || '—';

  // Set BOQ ref for tracking (use boqRef for multi-BOQ, fallback to flat index)
  const boqIdxInput = tr.querySelector('.boq-index-input');
  if (boqIdxInput) boqIdxInput.value = item._boqRef || item._idx;
}

/** Auto-load current project context into measurement form */
function _ensureSheetProjectContext() {
  const projId = state.currentProjectId;
  console.log('[BOQ] _ensureSheetProjectContext, projId:', projId);
  if (projId) {
    _loadSheetProjectContext(projId);
  } else {
    console.warn('[BOQ] No currentProjectId — BOQ auto-suggestion will not work');
  }
}

export function hideAutocomplete() {
  document.getElementById('autocomplete-list').classList.add('hide');
}

export function createNewSheet() {
  // Check if current sheet has unsaved data
  const tbody = document.getElementById('entryTableBody');
  const hasData = tbody && Array.from(tbody.rows).some(r => {
    const code = r.querySelector('.code-input')?.value || '';
    const desc = r.querySelector('.desc-input')?.value || '';
    return code || desc;
  });

  if (hasData) {
    const statusText = document.getElementById('sheetStatusText')?.textContent || '';
    const isUnsaved = statusText.toLowerCase().includes('unsaved') || !state.currentSheetId;
    const choice = confirm(
      isUnsaved
        ? 'You have unsaved entries in the current sheet.\n\nClick OK to save first, or Cancel to discard and create a new sheet.'
        : 'Create a new measurement sheet?\n\nClick OK to proceed.'
    );
    if (isUnsaved && choice) {
      saveEntries();
      showToast('Sheet saved before creating new one', 'success');
    }
    if (isUnsaved && !choice) {
      // User chose to discard — proceed to new sheet
    }
    if (!isUnsaved && !choice) {
      return; // User cancelled on a saved sheet
    }
  }

  state.currentSheetId = null;
  document.getElementById('sheetClientSelect').value = '';
  document.getElementById('sheetNum').value = '';
  document.getElementById('sheetArea').value = '';
  document.getElementById('sheetStatusText').textContent = 'New Unsaved Sheet';
  document.getElementById('entryTableBody').innerHTML = '';
  document.getElementById('btnGenerateAbstract')?.classList.add('hide');
  document.getElementById('exportControls')?.classList.add('hide');
  document.getElementById('bbsSection')?.classList.remove('hide');
  document.getElementById('bbsTableBody').innerHTML = '';
  addBBSRow(3);
  document.getElementById('attachmentsSection')?.classList.remove('hide');
  _customColumns = [];
  _rebuildTableColumns();
  _allSheetBoqItems = [];
  _currentSheetBoqItems = [];
  _ensureSheetProjectContext();
  addMoreEntries(5);
  renderGroupedEntry([]);   // start with one empty item card
  setEntryMode('grouped');  // grouped (Measurement-Book) view by default
  window.switchView('entrySheet');
}

export function confirmCloseSheet() {
  closeBoqDropdowns();
  document.querySelectorAll('[style*="z-index:100000"]').forEach(el => el.remove());

  const tbody = document.getElementById('entryTableBody');
  const hasEntries = tbody && Array.from(tbody.rows).some(r => {
    const code = r.querySelector('.code-input')?.value || '';
    const desc = r.querySelector('.desc-input')?.value || '';
    return code || desc;
  });
  const hasBBS = document.querySelectorAll('#bbsTableBody tr').length > 0 &&
    Array.from(document.querySelectorAll('#bbsTableBody tr')).some(tr => {
      return (tr.querySelector('.bbs-mark')?.value || '') || (tr.querySelector('.bbs-dia')?.value || '');
    });

  if (!hasEntries && !hasBBS) {
    window.switchView('measurementListView');
    return;
  }

  const choice = confirm('You have unsaved data in this sheet.\n\nClick OK to Save & Close, or Cancel to discard and close.');
  if (choice) {
    saveEntries();
    showToast('Sheet saved', 'success');
  }
  window.switchView('measurementListView');
}

export function handleSheetClientChange() {
  // Legacy compat — now handled by handleSheetProjectChange
  const tableBody = document.getElementById('entryTableBody');
  if (tableBody.rows.length === 0) addMoreEntries(5);
}

// ═══════ CUSTOM COLUMNS ═══════
let _customColumns = []; // [{id, name, type, position}]

// Position order map — columns before Qty are dimensions (multiply into Qty)
const _COL_ORDER = { 'after-nos': 3.5, 'after-l': 4.5, 'after-b': 5.5, 'after-h': 6.5, 'after-coef': 7.5, 'after-qty': 8.5, 'after-remarks': 9.5 };
const _COL_LABELS = { 'after-nos': 'After Nos', 'after-l': 'After L', 'after-b': 'After B', 'after-h': 'After H', 'after-coef': 'After Coef', 'after-qty': 'After Qty', 'after-remarks': 'After Remarks' };
function _isDimensionCol(col) { return (_COL_ORDER[col.position] || 9.5) < 8; }

// Reference cell class for each position
const _POS_REF_CLASS = { 'after-nos': '.nos-input', 'after-l': '.l-input', 'after-b': '.b-input', 'after-h': '.h-input', 'after-coef': '.coef-input', 'after-qty': '.qty-input', 'after-remarks': '.remarks-input' };
const _POS_REF_HEADER = { 'after-nos': 'Nos', 'after-l': 'L', 'after-b': 'B', 'after-h': 'H', 'after-coef': 'Coef', 'after-qty': 'Qty', 'after-remarks': 'Remarks' };

export function getCustomColumns() { return _customColumns; }

export function openCustomColumnsModal() {
  document.getElementById('customColumnsModal').classList.remove('hidden');
  _renderCustomColList();
}

export function closeCustomColumnsModal() {
  document.getElementById('customColumnsModal').classList.add('hidden');
}

function _renderCustomColList() {
  const container = document.getElementById('customColList');
  if (!_customColumns.length) {
    container.innerHTML = '<p class="text-xs text-slate-400 text-center py-3">No custom columns added yet.</p>';
    return;
  }
  container.innerHTML = _customColumns.map((col, i) => {
    const isDim = _isDimensionCol(col);
    const badge = isDim
      ? '<span class="text-[10px] bg-green-100 text-green-700 px-1.5 py-0.5 rounded font-bold">CALC</span>'
      : '<span class="text-[10px] bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded font-bold">DATA</span>';
    return `<div class="flex items-center gap-2 p-2 bg-slate-50 rounded border">
      <span class="flex-1 font-bold text-sm text-slate-700">${col.name}</span>
      ${badge}
      <span class="text-[10px] text-slate-400">${_COL_LABELS[col.position] || col.position}</span>
      <span class="text-xs text-slate-400 uppercase">${col.type}</span>
      <button onclick="removeCustomColumn(${i})" class="text-red-400 hover:text-red-600 font-bold text-sm px-2">✕</button>
    </div>`;
  }).join('');
}

export function addCustomColumn() {
  const nameInput = document.getElementById('newCustomColName');
  const typeSelect = document.getElementById('newCustomColType');
  const posSelect = document.getElementById('newCustomColPosition');
  const name = nameInput.value.trim();
  if (!name) return showToast('Enter a column name', 'error');
  if (_customColumns.some(c => c.name.toLowerCase() === name.toLowerCase())) return showToast('Column already exists', 'error');
  const col = { id: 'cc_' + Date.now(), name, type: typeSelect.value, position: posSelect.value };
  _customColumns.push(col);
  _customColumns.sort((a, b) => (_COL_ORDER[a.position] || 9.5) - (_COL_ORDER[b.position] || 9.5));
  nameInput.value = '';
  _renderCustomColList();
  _rebuildTableColumns();
}

export function removeCustomColumn(index) {
  _customColumns.splice(index, 1);
  _renderCustomColList();
  _rebuildTableColumns();
}

function _findRefCell(row, position, isHeader) {
  if (isHeader) {
    const label = _POS_REF_HEADER[position];
    const ths = row.querySelectorAll('th');
    for (const th of ths) {
      if (th.textContent.trim() === label) return th;
    }
    // Also check previous custom columns at same or earlier position
    return row.lastElementChild.previousElementSibling || row.lastElementChild;
  }
  const cls = _POS_REF_CLASS[position];
  const input = row.querySelector(cls);
  return input ? input.closest('td') : null;
}

function _rebuildTableColumns() {
  const thead = document.getElementById('entryTableHead');
  const headerRow = thead.querySelector('tr');
  headerRow.querySelectorAll('[data-custom]').forEach(th => th.remove());

  const tbody = document.getElementById('entryTableBody');
  Array.from(tbody.rows).forEach(tr => {
    tr.querySelectorAll('[data-custom]').forEach(td => td.remove());
  });

  // Insert sorted custom columns at correct positions
  _customColumns.forEach(col => {
    const isDim = _isDimensionCol(col);
    const inputClass = isDim ? 'custom-dim-input' : 'custom-col-input';

    // Header
    const refTh = _findRefCell(headerRow, col.position, true);
    const th = document.createElement('th');
    th.className = isDim
      ? 'p-2 text-center text-xs font-bold text-green-700 uppercase border bg-green-50'
      : 'p-2 text-center text-xs font-bold text-yellow-700 uppercase border bg-yellow-50';
    th.setAttribute('data-custom', col.id);
    th.textContent = col.name;
    if (refTh && refTh.nextSibling) headerRow.insertBefore(th, refTh.nextSibling);
    else headerRow.appendChild(th);

    // Body rows
    Array.from(tbody.rows).forEach(tr => {
      const refTd = _findRefCell(tr, col.position, false);
      const td = document.createElement('td');
      td.className = 'p-1 border';
      td.setAttribute('data-custom', col.id);
      const oninput = isDim ? ' oninput="calcQty(this)"' : '';
      td.innerHTML = `<input type="${col.type}" class="table-input ${inputClass}" data-col-id="${col.id}"${oninput}>`;
      if (refTd && refTd.nextSibling) tr.insertBefore(td, refTd.nextSibling);
      else tr.insertBefore(td, tr.lastElementChild);
    });
  });
}

function _buildCustomCellsForPosition(position, entryData) {
  return _customColumns.filter(col => col.position === position).map(col => {
    const isDim = _isDimensionCol(col);
    const inputClass = isDim ? 'custom-dim-input' : 'custom-col-input';
    const val = entryData?.customData?.[col.id] || '';
    const oninput = isDim ? ' oninput="calcQty(this)"' : '';
    return `<td class="p-1 border" data-custom="${col.id}"><input type="${col.type}" class="table-input ${inputClass}" data-col-id="${col.id}" value="${val}"${oninput}></td>`;
  }).join('');
}

function _buildRowHTML(hasBOQ, e) {
  const v = e || {};
  return `<td class="p-1 border relative" data-label="Code">
      <input type="text" class="table-input code-input font-mono uppercase font-bold text-blue-700" autocomplete="off" placeholder="${hasBOQ ? 'Type code...' : 'Code'}" value="${v.code || ''}" oninput="onMeasureItemInput(this)">
      <input type="hidden" class="boq-index-input" value="${v.boqIndex ?? ''}">
    </td>
    <td class="p-1 border" data-label="Description">
      <input type="text" class="table-input desc-input font-semibold text-slate-700" placeholder="${hasBOQ ? 'Type description...' : 'Item description'}" value="${v.description || ''}" autocomplete="off" oninput="onMeasureDescInput(this)">
      <input type="hidden" class="uom-input" value="${v.uom || ''}">
    </td>
    <td class="p-1 border text-center" data-label="Unit"><span class="text-xs font-bold text-slate-500 uom-display">${v.uom || '—'}</span></td>
    <td class="p-1 border" data-label="Nos"><input type="number" class="table-input nos-input" value="${v.nos || ''}" oninput="calcQty(this)"></td>
    ${_buildCustomCellsForPosition('after-nos', v)}
    <td class="p-1 border" data-label="Length"><input type="number" class="table-input l-input" value="${v.l || ''}" oninput="calcQty(this)"></td>
    ${_buildCustomCellsForPosition('after-l', v)}
    <td class="p-1 border" data-label="Breadth"><input type="number" class="table-input b-input" value="${v.b || ''}" oninput="calcQty(this)"></td>
    ${_buildCustomCellsForPosition('after-b', v)}
    <td class="p-1 border" data-label="Height"><input type="number" class="table-input h-input" value="${v.h || ''}" oninput="calcQty(this)"></td>
    ${_buildCustomCellsForPosition('after-h', v)}
    <td class="p-1 border" data-label="Coef"><input type="number" class="table-input coef-input font-bold" value="${v.coef || ''}" oninput="calcQty(this)"></td>
    ${_buildCustomCellsForPosition('after-coef', v)}
    <td class="p-1 border bg-slate-50" data-label="Quantity"><input type="text" class="table-input qty-input font-bold text-blue-700 text-lg" value="${v.qty || ''}" readonly></td>
    ${_buildCustomCellsForPosition('after-qty', v)}
    <td class="p-1 border" data-label="Remarks"><input type="text" class="table-input remarks-input text-slate-500" value="${v.remarks || ''}"></td>
    ${_buildCustomCellsForPosition('after-remarks', v)}
    <td class="p-1 border text-center" data-label=""><button onclick="this.closest('tr').remove()" class="text-red-400 hover:bg-red-50 p-1 rounded font-bold">✕ Remove Row</button></td>`;
}

export function addMoreEntries(count = 1) {
  const tbody = document.getElementById('entryTableBody');
  const hasBOQ = _currentSheetBoqItems.length > 0;
  for (let i = 0; i < count; i++) {
    const tr = document.createElement('tr');
    tr.innerHTML = _buildRowHTML(hasBOQ);
    tbody.appendChild(tr);
  }
}

export function saveEntries() {
  const projId = document.getElementById('sheetProjectSelect')?.value || state.currentProjectId || '';
  const cId = document.getElementById('sheetClientSelect')?.value || '';
  if (!projId && !cId) return showToast('Please open a project first', 'error');
  const sNum = document.getElementById('sheetNum').value || `S-${Date.now().toString().slice(-5)}`;
  const entries = _collectEntries();
  if (entries.length === 0) return showToast('Sheet is empty', 'error');

  let isBilled = false; let linkedAbstract = null;
  if (state.currentSheetId) {
    const existing = state.sheets.find(s => s.id === state.currentSheetId);
    if (existing && existing.isBilled) { isBilled = existing.isBilled; linkedAbstract = existing.linkedAbstract; }
  }

  const data = {
    id: state.currentSheetId || 's_' + Date.now(), clientId: cId, projectId: projId || '',
    date: document.getElementById('sheetDate').value, sheetNum: sNum,
    area: document.getElementById('sheetArea').value, entries,
    customColumns: _customColumns.length ? [..._customColumns] : undefined,
    updatedAt: new Date().toISOString(), isBilled, linkedAbstract
  };
  if (!state.currentSheetId) { state.sheets.push(data); state.currentSheetId = data.id; }
  else { state.sheets[state.sheets.findIndex(s => s.id === state.currentSheetId)] = data; }

  state.inventoryTx = state.inventoryTx.filter(tx => tx.refSheetId !== state.currentSheetId);
  let autoConsumptionCount = 0;
  const grouped = {};
  entries.forEach(e => { if (e.code && e.qty > 0) { if (grouped[e.code]) grouped[e.code] += e.qty; else grouped[e.code] = e.qty; } });

  for (const itemCode in grouped) {
    const totalQty = grouped[itemCode];
    if (state.recipes[cId] && state.recipes[cId][itemCode]) {
      state.recipes[cId][itemCode].ingredients.forEach(ing => {
        const consumedQty = totalQty * ing.qty * (1 + (ing.wastage / 100));
        const pTx = state.inventoryTx.filter(t => t.rawMaterialId === ing.rawMatId && t.type === 'IN' && t.rate > 0).sort((a, b) => new Date(b.date) - new Date(a.date))[0];
        const consumeSiteId = pTx ? pTx.siteId : cId;
        state.inventoryTx.push({
          id: 'tx_c_' + Date.now() + Math.random().toString(36).substr(2, 5),
          date: document.getElementById('sheetDate').value, siteId: consumeSiteId, type: 'CONSUME',
          rawMaterialId: ing.rawMatId, qty: consumedQty, rate: pTx ? pTx.rate : 0,
          ref: `Auto-Consumed for ${itemCode} (Sheet: ${sNum})`, refSheetId: state.currentSheetId
        });
        autoConsumptionCount++;
      });
    }
  }
  // Save BBS data if present
  const bbsRows = _readBBSData();
  if (bbsRows.length) state.bbsData[data.id] = bbsRows;
  else delete state.bbsData[data.id];

  // Save BBS linked item reference on the sheet
  data.bbsLinkedItem = document.getElementById('bbsLinkedItem')?.value || '';

  // Warn if BBS has data but no linked item
  if (bbsRows.length && !data.bbsLinkedItem) {
    showToast('⚠ BBS has steel data but no BOQ item is linked! Link an item and Post to sheet.', 'warning');
  }

  document.getElementById('sheetNum').value = sNum;
  document.getElementById('exportControls').classList.remove('hide');
  saveAllData();
  let toastMsg = 'Draft Saved';
  if (autoConsumptionCount > 0) toastMsg += ` & ${autoConsumptionCount} Material Stocks Deducted`;
  showToast(toastMsg, 'success');
  if (isBilled) {
    document.getElementById('btnGenerateAbstract').classList.add('hide');
    document.getElementById('sheetStatusText').textContent = `Billed -> Abstract: ${linkedAbstract}`;
  } else {
    document.getElementById('btnGenerateAbstract').classList.remove('hide');
    document.getElementById('sheetStatusText').textContent = 'Saved Draft: ' + sNum;
  }
}

export function loadSheet(id) {
  const s = state.sheets.find(x => x.id === id);
  if (!s) return;
  state.currentSheetId = s.id;

  // Load project context
  if (s.projectId) {
    _loadSheetProjectContext(s.projectId);
  }
  document.getElementById('sheetClientSelect').value = s.clientId || '';
  document.getElementById('sheetDate').value = s.date;
  document.getElementById('sheetNum').value = s.sheetNum;
  document.getElementById('sheetArea').value = s.area || '';

  // Restore custom columns and rebuild headers
  _customColumns = s.customColumns ? [...s.customColumns] : [];
  _rebuildTableColumns();

  const tbody = document.getElementById('entryTableBody');
  tbody.innerHTML = '';
  const hasBOQ = _currentSheetBoqItems.length > 0;
  s.entries.forEach(e => {
    const tr = document.createElement('tr');
    tr.innerHTML = _buildRowHTML(hasBOQ, e);
    tbody.appendChild(tr);
  });
  while (tbody.rows.length < 5) addMoreEntries(1);
  // Build grouped view from the same entries and show it by default
  renderGroupedEntry(s.entries || []);
  setEntryMode('grouped');
  // Load BBS and attachments
  _loadBBSData(s.id);
  // Restore BBS linked item
  const bbsLinkSel = document.getElementById('bbsLinkedItem');
  if (bbsLinkSel && s.bbsLinkedItem) bbsLinkSel.value = s.bbsLinkedItem;
  _renderAttachmentsList(s.id);
  if (state.sheetAttachments[s.id]?.length) document.getElementById('attachmentsSection')?.classList.remove('hide');
  else document.getElementById('attachmentsSection')?.classList.add('hide');

  document.getElementById('exportControls')?.classList.remove('hide');
  if (s.isBilled) {
    document.getElementById('btnGenerateAbstract')?.classList.add('hide');
    document.getElementById('sheetStatusText').textContent = `Loaded (Billed): ${s.sheetNum} -> Abstract: ${s.linkedAbstract}`;
  } else {
    document.getElementById('btnGenerateAbstract')?.classList.remove('hide');
    document.getElementById('sheetStatusText').textContent = 'Loaded Draft: ' + s.sheetNum;
  }
  window.switchView('entrySheet');
}

/** Render measurement sheets list for current project */
export function renderMeasurementList() {
  const projId = state.currentProjectId;
  const container = document.getElementById('measurementListContainer');
  const emptyEl = document.getElementById('measurementListEmpty');
  const countEl = document.getElementById('measurementListCount');
  const searchEl = document.getElementById('measurementListSearch');
  if (!container) return;

  const term = (searchEl?.value || '').toLowerCase().trim();
  const projectSheets = state.sheets
    .filter(s => s.projectId === projId)
    .filter(s => {
      if (!term) return true;
      return (s.sheetNum || '').toLowerCase().includes(term) ||
             (s.area || '').toLowerCase().includes(term) ||
             (s.entries || []).some(e => (e.code || '').toLowerCase().includes(term) || (e.description || '').toLowerCase().includes(term));
    })
    .sort((a, b) => new Date(b.updatedAt || b.date) - new Date(a.updatedAt || a.date));

  if (countEl) countEl.textContent = projectSheets.length;

  if (!projectSheets.length) {
    container.innerHTML = '';
    if (emptyEl) emptyEl.classList.remove('hidden');
    return;
  }
  if (emptyEl) emptyEl.classList.add('hidden');

  const proj = state.projects.find(p => p.id === projId);

  container.innerHTML = projectSheets.map(s => {
    const totalQty = s.entries.reduce((sum, e) => sum + (e.qty || 0), 0);
    const itemCount = s.entries.filter(e => e.code || e.description).length;
    const uniqueItems = [...new Set(s.entries.filter(e => e.code).map(e => e.code))];
    const dateStr = s.date ? new Date(s.date + 'T00:00:00').toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';
    const updatedStr = s.updatedAt ? new Date(s.updatedAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '';
    const billedClass = s.isBilled ? 'border-l-green-500' : 'border-l-blue-400';
    const statusBadge = s.isBilled
      ? `<span class="text-[10px] font-bold bg-green-100 text-green-700 px-2 py-0.5 rounded-full">Billed</span>`
      : `<span class="text-[10px] font-bold bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full">Pending</span>`;

    return `<div class="bg-white rounded-xl border border-slate-200 shadow-sm hover:shadow-md transition-shadow border-l-4 ${billedClass}">
      <div class="p-4 flex flex-col md:flex-row justify-between items-start md:items-center gap-3">
        <div class="flex-1 min-w-0">
          <div class="flex items-center gap-2 mb-1.5">
            <h4 class="font-extrabold text-slate-800 text-base">${s.sheetNum}</h4>
            ${statusBadge}
            ${s.isBilled ? `<span class="text-[10px] font-semibold text-slate-400">${s.linkedAbstract || ''}</span>` : ''}
          </div>
          <div class="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
            <span title="Date"><span class="font-bold text-slate-600">Date:</span> ${dateStr}</span>
            ${s.area ? `<span title="Area"><span class="font-bold text-slate-600">Area:</span> ${s.area}</span>` : ''}
            <span title="Items"><span class="font-bold text-slate-600">Items:</span> ${itemCount} entries (${uniqueItems.length} unique)</span>
            <span title="Total Qty"><span class="font-bold text-slate-600">Total Qty:</span> ${totalQty.toLocaleString('en-IN', {maximumFractionDigits:2})}</span>
            ${updatedStr ? `<span class="text-slate-400" title="Last updated">Updated: ${updatedStr}</span>` : ''}
          </div>
          ${uniqueItems.length ? `<div class="flex flex-wrap gap-1 mt-2">${uniqueItems.slice(0, 5).map(c => `<span class="text-[10px] font-bold bg-blue-50 text-blue-700 px-1.5 py-0.5 rounded">${c}</span>`).join('')}${uniqueItems.length > 5 ? `<span class="text-[10px] text-slate-400 font-semibold">+${uniqueItems.length - 5} more</span>` : ''}</div>` : ''}
        </div>
        <div class="flex items-center gap-2 flex-shrink-0">
          <button onclick="loadSheet('${s.id}')" class="px-4 py-2 bg-blue-50 text-blue-700 rounded-lg font-bold text-sm hover:bg-blue-100 transition flex items-center gap-1.5" title="Open & Edit">
            <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/></svg>
            Open
          </button>
          <button onclick="deleteMeasurementSheet('${s.id}')" class="px-3 py-2 text-red-500 bg-red-50 rounded-lg font-bold text-sm hover:bg-red-100 transition" title="Delete Sheet">
            <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
          </button>
        </div>
      </div>
    </div>`;
  }).join('');
}

/** Delete measurement sheet from list view */
export function deleteMeasurementSheet(id) {
  const s = state.sheets.find(x => x.id === id);
  if (!s) return;
  if (s.isBilled) {
    showToast('Cannot delete a billed sheet. Remove the linked abstract first.', 'error');
    return;
  }
  if (!confirm(`Delete sheet ${s.sheetNum}? This cannot be undone.`)) return;
  state.sheets = state.sheets.filter(x => x.id !== id);
  state.inventoryTx = state.inventoryTx.filter(tx => tx.refSheetId !== id);
  saveAllData();
  renderMeasurementList();
  showToast('Sheet deleted');
}

export function renderSavedSheets() {
  const term = document.getElementById('searchSheets').value.toLowerCase();
  const container = document.getElementById('clientGroupedSheetsContainer');
  container.innerHTML = '';
  const filtered = state.sheets.filter(s => (s.sheetNum || '').toLowerCase().includes(term) || (s.area || '').toLowerCase().includes(term)).sort((a, b) => new Date(b.updatedAt || b.date) - new Date(a.updatedAt || a.date));
  filtered.forEach(s => {
    const client = state.clients.find(c => c.id === s.clientId) || { name: 'Unknown' };
    let sQty = 0; s.entries.forEach(e => sQty += e.qty);
    const billedBadge = s.isBilled ? `<span class="text-xs font-bold bg-green-100 text-green-800 px-2 py-1 rounded ml-2">Billed: ${s.linkedAbstract}</span>` : `<span class="text-xs font-bold bg-orange-100 text-orange-800 px-2 py-1 rounded ml-2">Pending Abstract</span>`;
    container.innerHTML += `<div class="border rounded-xl p-5 bg-white flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-l-4 ${s.isBilled ? 'border-l-green-500' : 'border-l-orange-400'}"><div><h4 class="font-bold text-lg text-slate-800">${s.sheetNum} ${billedBadge}</h4><p class="text-sm text-slate-500 mt-1"><span class="font-bold text-slate-700">${client.name}</span> | Date: ${s.date} | Area: ${s.area || 'N/A'}</p></div><div class="flex gap-2"><button onclick="loadSheet('${s.id}')" class="px-5 py-2 bg-blue-50 text-blue-700 font-bold rounded">Load</button><button onclick="deleteSheet('${s.id}')" class="px-5 py-2 text-red-600 bg-red-50 rounded font-bold">Delete</button></div></div>`;
  });
}

export function deleteSheet(id) {
  if (confirm('Delete sheet? Associated material consumption will also be reversed.')) {
    state.sheets = state.sheets.filter(s => s.id !== id);
    state.inventoryTx = state.inventoryTx.filter(tx => tx.refSheetId !== id);
    saveAllData();
    renderSavedSheets();
    showToast('Deleted');
  }
}

// ==========================================
// BBS (Bar Bending Schedule)
// ==========================================
// BBS_UNIT_WEIGHTS imported from ./constants.js

export function toggleBBSSection() {
  const sec = document.getElementById('bbsSection');
  if (!sec) return;
  const isHidden = sec.classList.contains('hide');
  sec.classList.toggle('hide');
  if (isHidden && !document.getElementById('bbsTableBody').rows.length) addBBSRow(3);
}

export function addBBSRow(count = 1) {
  const tbody = document.getElementById('bbsTableBody');
  const sn = tbody.rows.length;
  for (let i = 0; i < count; i++) {
    const tr = document.createElement('tr');
    const n = sn + i + 1;
    tr.innerHTML = `<td class="p-1 border text-center text-xs text-slate-400 font-bold bbs-sn">${n}</td>
      <td class="p-1 border"><input type="text" class="table-input bbs-mark" placeholder="e.g. Main Bar"></td>
      <td class="p-1 border"><select class="table-input bbs-dia" onchange="calcBBSRow(this)" style="padding:0.35rem;min-width:50px;text-align:center;font-weight:700;">
        <option value="">--</option><option value="8">8</option><option value="10">10</option><option value="12">12</option><option value="16">16</option><option value="20">20</option><option value="25">25</option><option value="28">28</option><option value="32">32</option></select></td>
      <td class="p-1 border"><input type="number" class="table-input bbs-nobar text-center" oninput="calcBBSRow(this)"></td>
      <td class="p-1 border"><input type="number" class="table-input bbs-no text-center" oninput="calcBBSRow(this)"></td>
      <td class="p-1 border bg-slate-50"><input type="text" class="table-input bbs-totbar text-center font-bold" readonly></td>
      <td class="p-1 border"><input type="number" class="table-input bbs-a text-center" step="0.01" oninput="calcBBSRow(this)"></td>
      <td class="p-1 border"><input type="number" class="table-input bbs-b text-center" step="0.01" oninput="calcBBSRow(this)"></td>
      <td class="p-1 border"><input type="number" class="table-input bbs-c text-center" step="0.01" oninput="calcBBSRow(this)"></td>
      <td class="p-1 border"><input type="number" class="table-input bbs-d text-center" step="0.01" oninput="calcBBSRow(this)"></td>
      <td class="p-1 border"><input type="number" class="table-input bbs-hook text-center" step="0.01" oninput="calcBBSRow(this)"></td>
      <td class="p-1 border bg-purple-50"><input type="text" class="table-input bbs-cutlen text-center font-bold text-purple-700" readonly></td>
      <td class="p-1 border bg-purple-50"><input type="text" class="table-input bbs-totlen text-center font-bold text-purple-700" readonly></td>
      <td class="p-1 border bg-yellow-50"><input type="text" class="table-input bbs-d8 text-center text-xs" readonly></td>
      <td class="p-1 border bg-yellow-50"><input type="text" class="table-input bbs-d10 text-center text-xs" readonly></td>
      <td class="p-1 border bg-yellow-50"><input type="text" class="table-input bbs-d12 text-center text-xs" readonly></td>
      <td class="p-1 border bg-yellow-50"><input type="text" class="table-input bbs-d16 text-center text-xs" readonly></td>
      <td class="p-1 border bg-yellow-50"><input type="text" class="table-input bbs-d20 text-center text-xs" readonly></td>
      <td class="p-1 border text-center"><button onclick="this.closest('tr').remove(); _renumberBBS(); _calcBBSTotals();" class="text-red-400 hover:bg-red-50 p-1 rounded font-bold">✕</button></td>`;
    tbody.appendChild(tr);
  }
}

function _renumberBBS() {
  document.querySelectorAll('#bbsTableBody tr').forEach((tr, i) => {
    const sn = tr.querySelector('.bbs-sn');
    if (sn) sn.textContent = i + 1;
  });
}

const BBS_DIA_COLS = [8, 10, 12, 16, 20];

export function calcBBSRow(el) {
  const tr = el.closest('tr');
  const dia = parseInt(tr.querySelector('.bbs-dia')?.value) || 0;
  const noBar = parseInt(tr.querySelector('.bbs-nobar')?.value) || 0;
  const no = parseInt(tr.querySelector('.bbs-no')?.value) || 0;
  const totalBars = noBar * no;
  const a = parseFloat(tr.querySelector('.bbs-a')?.value) || 0;
  const b = parseFloat(tr.querySelector('.bbs-b')?.value) || 0;
  const c = parseFloat(tr.querySelector('.bbs-c')?.value) || 0;
  const d = parseFloat(tr.querySelector('.bbs-d')?.value) || 0;
  const hook = parseFloat(tr.querySelector('.bbs-hook')?.value) || 0;
  const cutLen = a + b + c + d + hook;
  const totalLen = totalBars * cutLen;

  tr.querySelector('.bbs-totbar').value = totalBars || '';
  tr.querySelector('.bbs-cutlen').value = cutLen ? cutLen.toFixed(2) : '';
  tr.querySelector('.bbs-totlen').value = totalLen ? totalLen.toFixed(2) : '';

  // Clear all dia columns then fill matching one
  BBS_DIA_COLS.forEach(dd => { tr.querySelector('.bbs-d' + dd).value = ''; });
  if (dia && totalLen && BBS_DIA_COLS.includes(dia)) {
    tr.querySelector('.bbs-d' + dia).value = totalLen.toFixed(2);
  }
  _calcBBSTotals();
}

function _calcBBSTotals() {
  const diaTotals = {}; BBS_DIA_COLS.forEach(d => diaTotals[d] = 0);
  document.querySelectorAll('#bbsTableBody tr').forEach(tr => {
    BBS_DIA_COLS.forEach(d => { diaTotals[d] += parseFloat(tr.querySelector('.bbs-d' + d)?.value) || 0; });
  });
  // Total RM per dia
  BBS_DIA_COLS.forEach(d => {
    const el = document.getElementById('bbsRM' + d);
    if (el) el.textContent = diaTotals[d] ? diaTotals[d].toFixed(2) : '-';
  });
  // KG/RM per dia
  BBS_DIA_COLS.forEach(d => {
    const el = document.getElementById('bbsKG' + d);
    if (el) el.textContent = BBS_UNIT_WEIGHTS[d] ? BBS_UNIT_WEIGHTS[d].toFixed(3) : '-';
  });
  // Total KG per dia
  let grandKG = 0;
  BBS_DIA_COLS.forEach(d => {
    const wt = diaTotals[d] * (BBS_UNIT_WEIGHTS[d] || 0);
    grandKG += wt;
    const el = document.getElementById('bbsWt' + d);
    if (el) el.textContent = wt ? wt.toFixed(2) : '-';
  });
  const kgEl = document.getElementById('bbsTotalWeightKG');
  if (kgEl) kgEl.textContent = grandKG ? grandKG.toFixed(2) : '0.00';
  const mtEl = document.getElementById('bbsTotalWeightMT');
  if (mtEl) mtEl.textContent = grandKG ? (grandKG / 1000).toFixed(2) : '0.00';
}

/** Post BBS total weight to measurement sheet as a row */
export function postBBSToSheet(unit) {
  const sel = document.getElementById('bbsLinkedItem');
  const ref = sel?.value;
  if (!ref) { showToast('Please select a BOQ item to link BBS', 'error'); return; }

  const item = _allSheetBoqItems.find(i => (i._boqRef || '') === ref);
  if (!item) { showToast('Linked BOQ item not found', 'error'); return; }

  const kgEl = document.getElementById('bbsTotalWeightKG');
  const mtEl = document.getElementById('bbsTotalWeightMT');
  const totalKG = parseFloat(kgEl?.textContent) || 0;
  const totalMT = parseFloat(mtEl?.textContent) || 0;
  if (!totalKG) { showToast('BBS has no weight data to post', 'error'); return; }

  const qty = unit === 'MT' ? totalMT : totalKG;
  const uom = unit === 'MT' ? 'MT' : 'KG';

  // Check if a row with this item code already exists (from a previous BBS post)
  const tbody = document.getElementById('entryTableBody');
  let existingRow = null;
  Array.from(tbody.rows).forEach(r => {
    const codeInp = r.querySelector('.code-input');
    const remarksInp = r.querySelector('.remarks-input');
    if (codeInp?.value === item.code && remarksInp?.value?.includes('[BBS]')) {
      existingRow = r;
    }
  });

  if (existingRow) {
    // Update existing BBS-posted row
    existingRow.querySelector('.nos-input').value = 1;
    existingRow.querySelector('.l-input').value = qty.toFixed(3);
    existingRow.querySelector('.b-input').value = '';
    existingRow.querySelector('.h-input').value = '';
    existingRow.querySelector('.coef-input').value = '';
    existingRow.querySelector('.qty-input').value = qty.toFixed(3);
    existingRow.querySelector('.uom-input').value = uom;
    const uomDisp = existingRow.querySelector('.uom-display');
    if (uomDisp) uomDisp.textContent = uom;
    existingRow.querySelector('.remarks-input').value = `[BBS] Steel ${unit} — ${totalKG.toFixed(2)} KG / ${totalMT.toFixed(3)} MT`;
    showToast(`Updated BBS entry: ${item.code} = ${qty.toFixed(3)} ${uom}`, 'success');
  } else {
    // Add new row at the end of the table
    const hasBOQ = _currentSheetBoqItems.length > 0;
    const tr = document.createElement('tr');
    tr.innerHTML = _buildRowHTML(hasBOQ);
    tbody.appendChild(tr);
    tr.querySelector('.code-input').value = item.code || '';
    tr.querySelector('.desc-input').value = item.description || '';
    tr.querySelector('.uom-input').value = uom;
    const uomDisp = tr.querySelector('.uom-display');
    if (uomDisp) uomDisp.textContent = uom;
    tr.querySelector('.nos-input').value = 1;
    tr.querySelector('.l-input').value = qty.toFixed(3);
    tr.querySelector('.qty-input').value = qty.toFixed(3);
    tr.querySelector('.remarks-input').value = `[BBS] Steel ${unit} — ${totalKG.toFixed(2)} KG / ${totalMT.toFixed(3)} MT`;
    const boqIdxInp = tr.querySelector('.boq-index-input');
    if (boqIdxInp) boqIdxInp.value = ref;
    showToast(`Posted BBS to sheet: ${item.code} = ${qty.toFixed(3)} ${uom}`, 'success');
  }

  // Scroll to bottom of measurement table to show the posted row
  const container = document.getElementById('tableContainer');
  if (container) container.scrollTo({ top: container.scrollHeight, behavior: 'smooth' });
}

function _readBBSData() {
  const rows = [];
  document.querySelectorAll('#bbsTableBody tr').forEach(tr => {
    const mark = tr.querySelector('.bbs-mark')?.value || '';
    const dia = tr.querySelector('.bbs-dia')?.value || '';
    if (mark || dia) rows.push({
      mark, dia,
      noBar: parseInt(tr.querySelector('.bbs-nobar')?.value) || 0,
      no: parseInt(tr.querySelector('.bbs-no')?.value) || 0,
      totalBars: parseInt(tr.querySelector('.bbs-totbar')?.value) || 0,
      a: parseFloat(tr.querySelector('.bbs-a')?.value) || 0,
      b: parseFloat(tr.querySelector('.bbs-b')?.value) || 0,
      c: parseFloat(tr.querySelector('.bbs-c')?.value) || 0,
      d: parseFloat(tr.querySelector('.bbs-d')?.value) || 0,
      hook: parseFloat(tr.querySelector('.bbs-hook')?.value) || 0,
      cutLen: parseFloat(tr.querySelector('.bbs-cutlen')?.value) || 0,
      totalLen: parseFloat(tr.querySelector('.bbs-totlen')?.value) || 0
    });
  });
  return rows;
}

function _loadBBSData(sheetId) {
  const tbody = document.getElementById('bbsTableBody');
  const sec = document.getElementById('bbsSection');
  tbody.innerHTML = '';
  const data = state.bbsData[sheetId];
  if (data && data.length) {
    sec?.classList.remove('hide');
    data.forEach((b, i) => {
      const tr = document.createElement('tr');
      const dia = b.dia || '';
      const totalBars = b.totalBars || ((b.noBar || 0) * (b.no || 0));
      const cutLen = b.cutLen || ((b.a||0)+(b.b||0)+(b.c||0)+(b.d||0)+(b.hook||0));
      const totalLen = b.totalLen || (totalBars * cutLen);
      tr.innerHTML = `<td class="p-1 border text-center text-xs text-slate-400 font-bold bbs-sn">${i + 1}</td>
        <td class="p-1 border"><input type="text" class="table-input bbs-mark" value="${b.mark || ''}"></td>
        <td class="p-1 border"><select class="table-input bbs-dia" onchange="calcBBSRow(this)" style="padding:0.35rem;min-width:50px;text-align:center;font-weight:700;">
          <option value="">--</option>${[8,10,12,16,20,25,28,32].map(d => `<option value="${d}" ${d == dia ? 'selected' : ''}>${d}</option>`).join('')}</select></td>
        <td class="p-1 border"><input type="number" class="table-input bbs-nobar text-center" value="${b.noBar || b.nos || ''}" oninput="calcBBSRow(this)"></td>
        <td class="p-1 border"><input type="number" class="table-input bbs-no text-center" value="${b.no || b.sets || ''}" oninput="calcBBSRow(this)"></td>
        <td class="p-1 border bg-slate-50"><input type="text" class="table-input bbs-totbar text-center font-bold" value="${totalBars || ''}" readonly></td>
        <td class="p-1 border"><input type="number" class="table-input bbs-a text-center" step="0.01" value="${b.a || ''}" oninput="calcBBSRow(this)"></td>
        <td class="p-1 border"><input type="number" class="table-input bbs-b text-center" step="0.01" value="${b.b || ''}" oninput="calcBBSRow(this)"></td>
        <td class="p-1 border"><input type="number" class="table-input bbs-c text-center" step="0.01" value="${b.c || ''}" oninput="calcBBSRow(this)"></td>
        <td class="p-1 border"><input type="number" class="table-input bbs-d text-center" step="0.01" value="${b.d || ''}" oninput="calcBBSRow(this)"></td>
        <td class="p-1 border"><input type="number" class="table-input bbs-hook text-center" step="0.01" value="${b.hook || ''}" oninput="calcBBSRow(this)"></td>
        <td class="p-1 border bg-purple-50"><input type="text" class="table-input bbs-cutlen text-center font-bold text-purple-700" value="${cutLen ? cutLen.toFixed(2) : ''}" readonly></td>
        <td class="p-1 border bg-purple-50"><input type="text" class="table-input bbs-totlen text-center font-bold text-purple-700" value="${totalLen ? totalLen.toFixed(2) : ''}" readonly></td>
        <td class="p-1 border bg-yellow-50"><input type="text" class="table-input bbs-d8 text-center text-xs" value="${dia == 8 && totalLen ? totalLen.toFixed(2) : ''}" readonly></td>
        <td class="p-1 border bg-yellow-50"><input type="text" class="table-input bbs-d10 text-center text-xs" value="${dia == 10 && totalLen ? totalLen.toFixed(2) : ''}" readonly></td>
        <td class="p-1 border bg-yellow-50"><input type="text" class="table-input bbs-d12 text-center text-xs" value="${dia == 12 && totalLen ? totalLen.toFixed(2) : ''}" readonly></td>
        <td class="p-1 border bg-yellow-50"><input type="text" class="table-input bbs-d16 text-center text-xs" value="${dia == 16 && totalLen ? totalLen.toFixed(2) : ''}" readonly></td>
        <td class="p-1 border bg-yellow-50"><input type="text" class="table-input bbs-d20 text-center text-xs" value="${dia == 20 && totalLen ? totalLen.toFixed(2) : ''}" readonly></td>
        <td class="p-1 border text-center"><button onclick="this.closest('tr').remove(); _renumberBBS(); _calcBBSTotals();" class="text-red-400 hover:bg-red-50 p-1 rounded font-bold">✕</button></td>`;
      tbody.appendChild(tr);
    });
    _calcBBSTotals();
  } else {
    sec?.classList.add('hide');
  }
}

// ==========================================
// ATTACHMENTS
// ==========================================
export function toggleAttachmentsSection() {
  document.getElementById('attachmentsSection')?.classList.toggle('hide');
}

export function addSheetAttachments(files) {
  if (!state.currentSheetId) { showToast('Save the sheet first', 'error'); return; }
  const sheetId = state.currentSheetId;
  if (!state.sheetAttachments[sheetId]) state.sheetAttachments[sheetId] = [];

  Array.from(files).forEach(file => {
    const reader = new FileReader();
    reader.onload = () => {
      const isImage = file.type.startsWith('image/');
      state.sheetAttachments[sheetId].push({
        id: 'att_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
        name: file.name, size: file.size, type: file.type,
        data: isImage ? reader.result : null,
        addedAt: new Date().toISOString(),
        category: _guessAttachmentCategory(file.name)
      });
      saveAllData();
      _renderAttachmentsList(sheetId);
      showToast(`Attached: ${file.name}`);
    };
    if (file.type.startsWith('image/')) reader.readAsDataURL(file);
    else reader.readAsArrayBuffer(file);
  });
}

function _guessAttachmentCategory(name) {
  const n = name.toLowerCase();
  if (n.includes('steel') || n.includes('bbs')) return 'Steel Report';
  if (n.includes('cement')) return 'Cement Report';
  if (n.includes('cube')) return 'Cube Test';
  if (n.includes('inspect')) return 'Inspection';
  if (n.includes('drawing') || n.includes('dwg')) return 'Drawing';
  if (n.includes('qaqc') || n.includes('qa') || n.includes('qc')) return 'QA/QC';
  if (/\.(jpg|jpeg|png|gif|webp)$/i.test(n)) return 'Photo';
  if (/\.(pdf)$/i.test(n)) return 'Document';
  return 'Other';
}

export function removeSheetAttachment(sheetId, attId) {
  if (!confirm('Remove this attachment?')) return;
  const arr = state.sheetAttachments[sheetId];
  if (arr) {
    state.sheetAttachments[sheetId] = arr.filter(a => a.id !== attId);
    saveAllData();
    _renderAttachmentsList(sheetId);
    showToast('Attachment removed');
  }
}

function _renderAttachmentsList(sheetId) {
  const container = document.getElementById('attachmentsList');
  if (!container) return;
  const atts = state.sheetAttachments[sheetId] || [];
  if (!atts.length) {
    container.innerHTML = '<p class="text-xs text-slate-400 text-center py-4">No attachments yet. Add files like cube test reports, steel consumption, site photos, etc.</p>';
    return;
  }
  const catIcons = { 'Steel Report': '&#9881;', 'Cement Report': '&#127959;', 'Cube Test': '&#129482;', 'Inspection': '&#128269;', 'Drawing': '&#128207;', 'QA/QC': '&#9989;', 'Photo': '&#128247;', 'Document': '&#128196;', 'Other': '&#128206;' };
  container.innerHTML = `<div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
    ${atts.map(a => {
      const sizeKB = (a.size / 1024).toFixed(1);
      const icon = catIcons[a.category] || '&#128206;';
      return `<div class="flex items-center gap-3 p-3 bg-slate-50 rounded-lg border border-slate-200">
        <span class="text-xl flex-shrink-0">${icon}</span>
        <div class="flex-1 min-w-0">
          <p class="text-xs font-bold text-slate-700 truncate" title="${a.name}">${a.name}</p>
          <p class="text-[10px] text-slate-400">${a.category} | ${sizeKB} KB</p>
        </div>
        <button onclick="removeSheetAttachment('${sheetId}','${a.id}')" class="text-red-400 hover:text-red-600 text-xs flex-shrink-0" title="Remove">&#10005;</button>
      </div>`;
    }).join('')}</div>`;
}

// ══════════════════════════════════════════════════════════════════
//  GROUPED (Measurement-Book) ENTRY — item once, many lines, auto total
//  Coexists with the classic table; both read/write the same flat
//  `entries` model so all PDFs / abstracts keep working.
// ══════════════════════════════════════════════════════════════════
let _entryMode = 'classic'; // 'classic' | 'grouped'

export function getEntryMode() { return _entryMode; }

export function setEntryMode(mode) {
  _entryMode = mode === 'grouped' ? 'grouped' : 'classic';
  const tableC = document.getElementById('tableContainer');
  const groupedC = document.getElementById('groupedEntryContainer');
  const classicBtns = document.getElementById('classicEntryBtns');
  const groupedBtn = document.getElementById('groupedAddBtn');
  const modeBtn = document.getElementById('entryModeBtn');
  const grouped = _entryMode === 'grouped';
  if (tableC) tableC.classList.toggle('hide', grouped);
  if (groupedC) groupedC.classList.toggle('hide', !grouped);
  if (classicBtns) classicBtns.classList.toggle('hide', grouped);
  if (groupedBtn) groupedBtn.classList.toggle('hide', !grouped);
  if (modeBtn) modeBtn.textContent = grouped ? '▤ Classic View' : '⊞ Grouped View';
}

export function toggleEntryMode() {
  const entries = _collectEntries();           // read whatever mode is active now
  const target = _entryMode === 'grouped' ? 'classic' : 'grouped';
  setEntryMode(target);
  if (target === 'grouped') renderGroupedEntry(entries);
  else _renderClassicEntries(entries);
}

/** Read entries from whichever entry mode is currently active */
function _collectEntries() {
  return _entryMode === 'grouped' ? _groupedCollectEntries() : _classicCollectEntries();
}

/** Classic flat-table reader (was inline in saveEntries) */
function _classicCollectEntries() {
  const out = [];
  Array.from(document.getElementById('entryTableBody').rows).forEach(r => {
    const code = r.querySelector('.code-input')?.value || '';
    const desc = r.querySelector('.desc-input')?.value || '';
    if (code || desc) {
      const entry = {
        code, description: desc, uom: r.querySelector('.uom-input')?.value || '',
        boqIndex: r.querySelector('.boq-index-input')?.value ?? '',
        nos: r.querySelector('.nos-input')?.value || '', l: r.querySelector('.l-input')?.value || '',
        b: r.querySelector('.b-input')?.value || '', h: r.querySelector('.h-input')?.value || '',
        coef: r.querySelector('.coef-input')?.value || '',
        qty: parseFloat(r.querySelector('.qty-input')?.value) || 0,
        remarks: r.querySelector('.remarks-input')?.value || ''
      };
      const customData = {};
      r.querySelectorAll('.custom-col-input, .custom-dim-input').forEach(inp => { customData[inp.dataset.colId] = inp.value || ''; });
      if (Object.keys(customData).length) entry.customData = customData;
      out.push(entry);
    }
  });
  return out;
}

/** Rebuild the classic table rows from a flat entries[] */
function _renderClassicEntries(entries) {
  const tbody = document.getElementById('entryTableBody');
  if (!tbody) return;
  tbody.innerHTML = '';
  const hasBOQ = _currentSheetBoqItems.length > 0;
  (entries || []).forEach(e => { const tr = document.createElement('tr'); tr.innerHTML = _buildRowHTML(hasBOQ, e); tbody.appendChild(tr); });
  while (tbody.rows.length < 5) addMoreEntries(1);
}

function _gLineQty(tr) {
  const read = sel => { const raw = tr.querySelector(sel)?.value ?? ''; if (raw === '') return { v: 1, has: false }; const n = parseFloat(raw); return { v: isNaN(n) ? 1 : n, has: true }; };
  const nos = read('.g-nos'), l = read('.g-l'), b = read('.g-b'), h = read('.g-h'), c = read('.g-coef');
  const any = nos.has || l.has || b.has || h.has || c.has;
  return any ? (nos.v * l.v * b.v * h.v * c.v) : 0;
}

export function calcGroupedLine(input) {
  const tr = input.closest('tr');
  if (!tr) return;
  const q = _gLineQty(tr);
  const qEl = tr.querySelector('.g-qty');
  if (qEl) qEl.value = q ? q.toFixed(3) : '';
  _groupedItemTotal(input.closest('.g-item'));
}

function _groupedItemTotal(card) {
  if (!card) return;
  let total = 0;
  card.querySelectorAll('.g-line').forEach(tr => { total += _gLineQty(tr); });
  const uom = card.querySelector('.g-uom')?.value || '';
  const tEl = card.querySelector('.g-total');
  if (tEl) tEl.innerHTML = `Item Total: <span style="color:#2563eb;font-size:15px;">${total.toFixed(3)}</span> ${uom}`;
}

function _gLineHTML(d) {
  d = d || {};
  return `<tr class="g-line border-t border-slate-100">
    <td class="p-1"><input type="text" class="g-label w-full p-1.5 border rounded text-xs" placeholder="e.g. Footing F-1" value="${(d.remarks || '').replace(/"/g,'&quot;')}"></td>
    <td class="p-1"><input type="number" class="g-nos w-full p-1.5 border rounded text-xs text-center" value="${d.nos || ''}" oninput="calcGroupedLine(this)"></td>
    <td class="p-1"><input type="number" class="g-l w-full p-1.5 border rounded text-xs text-center" value="${d.l || ''}" oninput="calcGroupedLine(this)"></td>
    <td class="p-1"><input type="number" class="g-b w-full p-1.5 border rounded text-xs text-center" value="${d.b || ''}" oninput="calcGroupedLine(this)"></td>
    <td class="p-1"><input type="number" class="g-h w-full p-1.5 border rounded text-xs text-center" value="${d.h || ''}" oninput="calcGroupedLine(this)"></td>
    <td class="p-1"><input type="number" class="g-coef w-full p-1.5 border rounded text-xs text-center" value="${d.coef || ''}" oninput="calcGroupedLine(this)"></td>
    <td class="p-1"><input type="text" class="g-qty w-full p-1.5 border rounded text-xs text-center font-bold text-blue-700 bg-slate-50" value="${d.qty ? Number(d.qty).toFixed(3) : ''}" readonly></td>
    <td class="p-1 text-center"><button onclick="removeGroupedLine(this)" class="text-red-400 hover:text-red-600 font-bold text-xs">✕</button></td>
  </tr>`;
}

function _gBoqOptions(selectedRef) {
  let opts = '<option value="">— Pick BOQ item —</option>';
  (_allSheetBoqItems || []).forEach(it => {
    const ref = it._boqRef ?? '';
    const label = ((it.code || '') + ' · ' + (it.description || it.name || '')).slice(0, 60);
    opts += `<option value="${ref}" ${String(ref) === String(selectedRef) ? 'selected' : ''}>${label}</option>`;
  });
  return opts;
}

export function addGroupedItem(data) {
  const container = document.getElementById('groupedEntryContainer');
  if (!container) return;
  let list = container.querySelector('.g-items');
  if (!list) { container.innerHTML = '<div class="g-items"></div>'; list = container.querySelector('.g-items'); }
  data = data || {};
  const hasBOQ = (_allSheetBoqItems || []).length > 0;
  const card = document.createElement('div');
  card.className = 'g-item bg-white rounded-lg border border-slate-200 mb-3 shadow-sm';
  card.innerHTML = `
    <div class="flex flex-wrap gap-2 items-end p-3 border-b border-slate-100 bg-slate-50 rounded-t-lg">
      <div class="g-num font-extrabold text-slate-300 text-xl" style="width:28px;text-align:center;">#</div>
      ${hasBOQ ? `<div style="min-width:200px;"><label class="block text-[9px] font-bold text-slate-400 uppercase">Select BOQ Item</label><select class="g-boqpick w-full p-1.5 border rounded text-xs" onchange="window._gBoqPick(this)">${_gBoqOptions(data.boqIndex)}</select></div>` : ''}
      <div style="width:110px;"><label class="block text-[9px] font-bold text-slate-400 uppercase">Item Code</label><input type="text" class="g-code w-full p-1.5 border rounded text-xs font-mono font-bold text-blue-700 uppercase" value="${(data.code || '').replace(/"/g,'&quot;')}" placeholder="Code"></div>
      <div class="flex-1" style="min-width:200px;"><label class="block text-[9px] font-bold text-slate-400 uppercase">Description (entered once)</label><input type="text" class="g-desc w-full p-1.5 border rounded text-xs font-semibold" value="${(data.description || '').replace(/"/g,'&quot;')}" placeholder="e.g. Excavation up to 1.5 m depth"></div>
      <div style="width:70px;"><label class="block text-[9px] font-bold text-slate-400 uppercase">Unit</label><input type="text" class="g-uom w-full p-1.5 border rounded text-xs text-center" value="${(data.uom || '').replace(/"/g,'&quot;')}" placeholder="CuM" oninput="window._gItemUomChanged(this)"></div>
      <input type="hidden" class="g-boq" value="${data.boqIndex ?? ''}">
      <button onclick="removeGroupedItem(this)" class="text-red-400 hover:text-red-600 font-bold text-xs ml-auto self-center" title="Remove item">✕ Item</button>
    </div>
    <div class="overflow-x-auto"><table class="min-w-full text-xs"><thead class="bg-slate-50 text-slate-500 uppercase text-[9px] font-bold"><tr>
      <th class="p-1 text-left" style="min-width:140px;">Particulars</th><th class="p-1" style="width:60px;">Nos</th><th class="p-1" style="width:70px;">L</th><th class="p-1" style="width:70px;">B</th><th class="p-1" style="width:70px;">H</th><th class="p-1" style="width:60px;">Coef</th><th class="p-1" style="width:80px;">Qty</th><th class="p-1" style="width:30px;"></th>
    </tr></thead><tbody class="g-lines bg-white"></tbody></table></div>
    <div class="flex justify-between items-center p-2 border-t border-slate-100 bg-slate-50 rounded-b-lg">
      <button onclick="addGroupedLine(this)" class="text-xs bg-blue-50 text-blue-700 border border-blue-200 px-3 py-1 rounded font-bold hover:bg-blue-100">+ Add Line</button>
      <div class="g-total text-sm font-bold text-slate-600">Item Total: <span style="color:#2563eb;font-size:15px;">0.000</span> </div>
    </div>`;
  list.appendChild(card);
  const linesTb = card.querySelector('.g-lines');
  const lines = data.lines && data.lines.length ? data.lines : [{}];
  lines.forEach(ln => linesTb.insertAdjacentHTML('beforeend', _gLineHTML(ln)));
  _groupedItemTotal(card);
  _renumberGroupedItems();
}

export function addGroupedLine(btn) {
  const card = btn.closest('.g-item');
  const tb = card?.querySelector('.g-lines');
  if (tb) { tb.insertAdjacentHTML('beforeend', _gLineHTML({})); }
}

export function removeGroupedLine(btn) {
  const card = btn.closest('.g-item');
  btn.closest('tr')?.remove();
  _groupedItemTotal(card);
}

export function removeGroupedItem(btn) {
  if (!confirm('Remove this item and all its measurement lines?')) return;
  btn.closest('.g-item')?.remove();
  _renumberGroupedItems();
}

function _renumberGroupedItems() {
  document.querySelectorAll('#groupedEntryContainer .g-item .g-num').forEach((el, i) => { el.textContent = i + 1; });
}

window._gBoqPick = function (sel) {
  const card = sel.closest('.g-item');
  const ref = sel.value;
  const it = (_allSheetBoqItems || []).find(x => String(x._boqRef ?? '') === String(ref));
  if (!it) return;
  card.querySelector('.g-code').value = it.code || '';
  card.querySelector('.g-desc').value = it.description || it.name || '';
  card.querySelector('.g-uom').value = it.uom || it.unit || '';
  card.querySelector('.g-boq').value = ref;
  _groupedItemTotal(card);
};
window._gItemUomChanged = function (inp) { _groupedItemTotal(inp.closest('.g-item')); };

/** Render grouped cards from a flat entries[] */
export function renderGroupedEntry(entries) {
  const container = document.getElementById('groupedEntryContainer');
  if (!container) return;
  container.innerHTML = '<div class="g-items"></div>';
  const groups = [];
  const byKey = {};
  (entries || []).forEach(e => {
    const key = (e.boqIndex !== '' && e.boqIndex != null ? 'b:' + e.boqIndex : '') || ('c:' + (e.code || '') + '|' + (e.description || ''));
    if (!byKey[key]) { byKey[key] = { code: e.code, description: e.description, uom: e.uom, boqIndex: e.boqIndex, lines: [] }; groups.push(byKey[key]); }
    byKey[key].lines.push({ remarks: e.remarks, nos: e.nos, l: e.l, b: e.b, h: e.h, coef: e.coef, qty: e.qty });
  });
  if (!groups.length) { addGroupedItem(); return; }
  groups.forEach(g => addGroupedItem(g));
}

/** Read grouped cards → flat entries[] */
function _groupedCollectEntries() {
  const out = [];
  document.querySelectorAll('#groupedEntryContainer .g-item').forEach(card => {
    const code = card.querySelector('.g-code')?.value || '';
    const desc = card.querySelector('.g-desc')?.value || '';
    const uom = card.querySelector('.g-uom')?.value || '';
    const boqIndex = card.querySelector('.g-boq')?.value ?? '';
    if (!code && !desc) return;
    card.querySelectorAll('.g-line').forEach(tr => {
      const nos = tr.querySelector('.g-nos')?.value || '';
      const l = tr.querySelector('.g-l')?.value || '';
      const b = tr.querySelector('.g-b')?.value || '';
      const h = tr.querySelector('.g-h')?.value || '';
      const coef = tr.querySelector('.g-coef')?.value || '';
      const label = tr.querySelector('.g-label')?.value || '';
      const qty = _gLineQty(tr);
      if (nos || l || b || h || coef || label) {
        out.push({ code, description: desc, uom, boqIndex, nos, l, b, h, coef, qty: qty || 0, remarks: label });
      }
    });
  });
  return out;
}

// Self-register grouped handlers on window (for inline onclick in app.html)
if (typeof window !== 'undefined') {
  Object.assign(window, { setEntryMode, toggleEntryMode, addGroupedItem, addGroupedLine, removeGroupedLine, removeGroupedItem, calcGroupedLine, renderGroupedEntry });
}
