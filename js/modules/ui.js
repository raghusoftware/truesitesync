import { state, saveAllData, saveLabourData, migrateToProjects } from './state.js';
import { showToast, getAllLocations, populateDropdowns, refreshPurchaseDropdowns, setDateFields, getCompanyHeaderForPDF, getCurrencySymbol, pdfMoney, mobileSavePDF, mobileSaveXLSX } from './utils.js';
import { lookupBoqItem } from './abstractCalc.js';
import { BBS_UNIT_WEIGHTS } from './constants.js';
import { computePurchaseTotal } from './purchaseCalc.js';
import { closeFullScreenForm, _openFullScreenForm, _populateVendorSelect, _populateAccountSelect, _populateClientSelect, _addGenericFormRow, _calcGenericFormTotal } from './formHelpers.js';
import { calcQty, calcEstimateRow, calcEstimateTotal, calculateLiveBill, buildClientLedger, renderAccounts, renderReports, renderVendorLedger, renderMasterClientList, renderMasterVendorList } from './finance.js';
import { renderAssetsView, renderEquipmentView } from './fleet.js';

// ══════════════════════════════════════════
// PROJECT MANAGEMENT
// ══════════════════════════════════════════

const MODULE_CARDS = [
  { id: 'planningView', icon: '&#128197;', label: 'Planning', desc: 'Tasks, scheduling & resources', color: '#0ea5e9', stateKey: 'planningTasks' },
  { id: 'microPlanView', icon: '&#128221;', label: 'Micro Planning', desc: 'Daily task decomposition & labor', color: '#6366f1', stateKey: 'microTasks' },
  { id: 'labourView', icon: '&#128119;', label: 'Labour', desc: 'Attendance, wages & muster', color: '#f59e0b', stateKey: 'labourMaster' },
  { id: 'equipmentView', icon: '&#128666;', label: 'Equipment', desc: 'Vehicles & machinery logs', color: '#8b5cf6', stateKey: 'equipmentList' },
  { id: 'inventoryView', icon: '&#128230;', label: 'Inventory', desc: 'Stock & materials', color: '#10b981', stateKey: 'rawMaterials' },
  { id: 'recipeView', icon: '&#129514;', label: 'Mix Design', desc: 'Material recipes & formulas', color: '#ea580c', stateKey: 'recipes' },
  { id: 'assetsView', icon: '&#128295;', label: 'Tools & Assets', desc: 'Transfers & maintenance', color: '#6366f1', stateKey: 'locations' },
  { id: 'measurementListView', icon: '&#128208;', label: 'Measurement', desc: 'Sheets & quantity entry', color: '#0ea5e9', stateKey: 'sheets' },
  { id: 'abstractsView', icon: '&#128209;', label: 'Abstracts', desc: 'Work abstracts & billing', color: '#14b8a6', stateKey: 'abstracts' },
];

/** Navigate to Projects Home */
export function goProjectsHome() {
  state.currentProjectId = null;
  document.getElementById('projectContextNav')?.classList.add('hidden');
  const badge = document.getElementById('headerProjBadge');
  if (badge) { badge.classList.add('hidden'); badge.textContent = ''; }
  switchView('projectsHome');
}

/** Render the projects landing page */
export function renderProjectsHome() {
  const grid = document.getElementById('projectsGrid');
  const empty = document.getElementById('projectsEmpty');
  if (!grid) return;
  const projects = state.projects || [];
  if (!projects.length) {
    grid.innerHTML = ''; if (empty) empty.classList.remove('hidden');
    return;
  }
  if (empty) empty.classList.add('hidden');
  grid.innerHTML = projects.map(p => {
    const color = p.color || '#3b82f6';
    const statusColors = { Planning: '#f59e0b', Active: '#10b981', 'On Hold': '#f97316', Completed: '#6366f1' };
    const stColor = statusColors[p.status] || '#94a3b8';
    return `<div onclick="openProject('${p.id}')" class="bg-white rounded-2xl border border-slate-200 overflow-hidden cursor-pointer transition-all hover:shadow-xl hover:-translate-y-1 hover:border-blue-200 group" style="box-shadow:0 1px 4px rgba(0,0,0,.04);">
      <div style="height:6px;background:${color};"></div>
      <div class="p-5">
        <div class="flex items-start justify-between mb-3">
          <div class="flex items-center gap-3">
            <div style="width:42px;height:42px;background:${color}15;border:2px solid ${color}30;border-radius:12px;display:flex;align-items:center;justify-content:center;font-size:20px;flex-shrink:0;">&#127959;</div>
            <div>
              <h3 class="font-extrabold text-slate-800 text-sm group-hover:text-blue-600 transition">${p.name}</h3>
              <p class="text-[10px] text-slate-400 font-medium">${p.code || ''} ${p.clientName ? '&middot; ' + p.clientName : ''}</p>
            </div>
          </div>
          <span class="text-[9px] font-bold px-2 py-0.5 rounded-full" style="background:${stColor}18;color:${stColor};border:1px solid ${stColor}30;">${p.status || 'Active'}</span>
        </div>
        ${(() => { const wos = (p.boqs || []).map(g => g.woNumber).filter(Boolean).join(', ') || p.woNumber || ''; return wos ? '<p class="text-[10px] text-amber-600 font-bold mb-1 truncate">&#128203; WO: ' + wos + '</p>' : ''; })()}
        ${p.location ? '<p class="text-[11px] text-slate-400 mb-3 truncate">&#128205; ' + p.location + '</p>' : ''}
        <div class="flex items-center justify-between pt-3 border-t border-slate-100">
          <div class="flex items-center gap-1">
            <button onclick="event.stopPropagation();openProjectForm('${p.id}')" class="text-[10px] font-bold text-blue-500 hover:bg-blue-50 px-2 py-1 rounded transition" title="Edit">&#9998; Edit</button>
            <button onclick="event.stopPropagation();deleteProject('${p.id}')" class="text-[10px] font-bold text-red-400 hover:bg-red-50 px-2 py-1 rounded transition" title="Delete">&#128465;</button>
          </div>
        </div>
      </div>
    </div>`;
  }).join('');
}

/** Open a project — show its dashboard */
export function openProject(projId) {
  const proj = (state.projects || []).find(p => p.id === projId);
  if (!proj) { showToast('Project not found', 'error'); return; }
  state.currentProjectId = projId;
  // Show sidebar context nav
  const ctxNav = document.getElementById('projectContextNav');
  if (ctxNav) ctxNav.classList.remove('hidden');
  const dot = document.getElementById('sidebarProjDot');
  if (dot) dot.style.background = proj.color || '#3b82f6';
  const nameEl = document.getElementById('sidebarProjName');
  if (nameEl) nameEl.textContent = proj.name;
  // Header badge
  const badge = document.getElementById('headerProjBadge');
  if (badge) { badge.classList.remove('hidden'); badge.textContent = proj.name; }
  switchView('projectDashboard');
}

/** Render project dashboard with module cards */
export function renderProjectDashboard() {
  const proj = (state.projects || []).find(p => p.id === state.currentProjectId);
  if (!proj) return;
  const titleEl = document.getElementById('projDashTitle');
  if (titleEl) titleEl.textContent = proj.name;
  const subEl = document.getElementById('projDashSub');
  if (subEl) {
    let sub = proj.clientName || '';
    const woNums = (proj.boqs || []).map(g => g.woNumber).filter(Boolean).join(', ') || proj.woNumber || '';
    if (woNums) sub += (sub ? ' — ' : '') + 'WO: ' + woNums;
    if (proj.location) sub += (sub ? ' | ' : '') + proj.location;
    subEl.textContent = sub || 'No details set';
  }
  const pid = proj.id;
  const kpiEl = document.getElementById('projDashKPIs');
  if (kpiEl) kpiEl.innerHTML = '';
  // Module cards
  const grid = document.getElementById('moduleCardsGrid');
  if (!grid) return;
  grid.innerHTML = MODULE_CARDS.map(m => {
    return `<div onclick="switchView('${m.id}')" class="bg-white rounded-2xl border border-slate-200 p-5 cursor-pointer transition-all hover:shadow-lg hover:-translate-y-0.5 hover:border-blue-200 group" style="box-shadow:0 1px 3px rgba(0,0,0,.04);">
      <div class="flex items-center gap-3">
        <div style="width:44px;height:44px;background:${m.color}12;border:2px solid ${m.color}25;border-radius:14px;display:flex;align-items:center;justify-content:center;font-size:22px;flex-shrink:0;transition:all .2s;" class="group-hover:scale-110">${m.icon}</div>
        <div class="flex-1">
          <h4 class="font-bold text-sm text-slate-800 group-hover:text-blue-600 transition">${m.label}</h4>
          <p class="text-[10px] text-slate-400">${m.desc}</p>
        </div>
        <span class="text-[10px] text-blue-500 font-bold opacity-0 group-hover:opacity-100 transition">&rarr;</span>
      </div>
    </div>`;
  }).join('');
}

// ── BOQ / PO Group Management ──

let _boqGroups = [];        // [{id, name, type, items}]
let _activeBoqGroupIdx = 0; // index of currently shown BOQ/PO tab

function _renderBoqTabs() {
  const container = document.getElementById('boqTabsContainer');
  if (!container) return;
  container.innerHTML = _boqGroups.map((g, i) => {
    const active = i === _activeBoqGroupIdx;
    const typeTag = g.type === 'PO' ? '<span class="text-[8px] bg-amber-100 text-amber-700 px-1 rounded ml-1">PO</span>' : '<span class="text-[8px] bg-blue-100 text-blue-700 px-1 rounded ml-1">BOQ</span>';
    return `<button onclick="switchBOQTab(${i})" class="px-3 py-1.5 rounded-lg text-xs font-bold transition ${active ? 'bg-blue-600 text-white shadow-sm' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}">${g.name || ('BOQ ' + (i + 1))} ${active ? '' : typeTag}</button>`;
  }).join('');
  if (!_boqGroups.length) container.innerHTML = '<p class="text-xs text-slate-400 py-2">No BOQ/PO added yet. Click "+ Add BOQ / PO" to start.</p>';
}

export function addNewBOQGroup() {
  const id = 'boq_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
  _boqGroups.push({ id, name: '', type: 'BOQ', items: [] });
  _activeBoqGroupIdx = _boqGroups.length - 1;
  _renderBoqTabs();
  _loadActiveBoqGroup();
}

export function switchBOQTab(idx) {
  // Save current tab data before switching
  _saveActiveBoqGroupData();
  _activeBoqGroupIdx = idx;
  _renderBoqTabs();
  _loadActiveBoqGroup();
}

export function deleteActiveBOQGroup() {
  if (!_boqGroups.length) return;
  const g = _boqGroups[_activeBoqGroupIdx];
  if (!confirm(`Delete "${g.name || 'this BOQ/PO'}" and all its items?`)) return;
  _boqGroups.splice(_activeBoqGroupIdx, 1);
  if (_activeBoqGroupIdx >= _boqGroups.length) _activeBoqGroupIdx = Math.max(0, _boqGroups.length - 1);
  _renderBoqTabs();
  _loadActiveBoqGroup();
}

function _saveActiveBoqGroupData() {
  if (!_boqGroups.length || _activeBoqGroupIdx >= _boqGroups.length) return;
  const g = _boqGroups[_activeBoqGroupIdx];
  g.name = document.getElementById('activeBoqName')?.value?.trim() || g.name;
  g.type = document.getElementById('activeBoqType')?.value || 'BOQ';
  g.items = _readBOQRows();
  // WO/PO details per group
  g.woNumber = document.getElementById('boqWONumber')?.value?.trim() || '';
  g.woDate = document.getElementById('boqWODate')?.value || '';
  g.poValue = parseFloat(document.getElementById('boqPOValue')?.value) || 0;
  g.poQty = parseFloat(document.getElementById('boqPOQty')?.value) || 0;
  g.gstRate = parseFloat(document.getElementById('boqGstRate')?.value) || 18;
  g.gstType = document.getElementById('boqGstType')?.value || 'CGST_SGST';
  g.sacCode = document.getElementById('boqSacCode')?.value?.trim() || '';
  g.woExpiry = document.getElementById('boqWOExpiry')?.value || '';
  g.retention = parseFloat(document.getElementById('boqRetention')?.value) || 0;
}

function _loadActiveBoqGroup() {
  const editorArea = document.getElementById('boqEditorArea');
  if (!_boqGroups.length) {
    if (editorArea) editorArea.style.display = 'none';
    return;
  }
  if (editorArea) editorArea.style.display = '';
  const g = _boqGroups[_activeBoqGroupIdx];
  const nameEl = document.getElementById('activeBoqName');
  if (nameEl) nameEl.value = g.name || '';
  const typeEl = document.getElementById('activeBoqType');
  if (typeEl) typeEl.value = g.type || 'BOQ';
  _loadBOQRows(g.items || []);
  // Load WO/PO details per group
  const setV = (id, v) => { const el = document.getElementById(id); if (el) el.value = v ?? ''; };
  setV('boqWONumber', g.woNumber);
  setV('boqWODate', g.woDate);
  setV('boqPOValue', g.poValue || '');
  setV('boqPOQty', g.poQty || '');
  setV('boqGstRate', g.gstRate ?? 18);
  setV('boqGstType', g.gstType || 'CGST_SGST');
  setV('boqSacCode', g.sacCode);
  setV('boqWOExpiry', g.woExpiry);
  setV('boqRetention', g.retention || '');
}

/** Get all BOQ items across all groups, flat array with boqGroupId + original index */
function _getAllBoqItemsFlat(boqs) {
  const all = [];
  (boqs || []).forEach(g => {
    (g.items || []).forEach((item, i) => {
      all.push({ ...item, _boqGroupId: g.id, _boqGroupName: g.name || g.type, _itemIdx: i });
    });
  });
  return all;
}

/** Resolve boqRef "boqGroupId:itemIdx" → { boqItem, boqGroup } */
function _resolveBoqRef(boqs, ref) {
  if (!ref || typeof ref !== 'string') {
    // Legacy: numeric index into flat boqItems
    const idx = parseInt(ref);
    const flat = _getAllBoqItemsFlat(boqs);
    if (!isNaN(idx) && flat[idx]) return { boqItem: flat[idx], boqGroup: (boqs || []).find(g => g.id === flat[idx]._boqGroupId) };
    return null;
  }
  if (ref.includes(':')) {
    const [gId, iStr] = ref.split(':');
    const group = (boqs || []).find(g => g.id === gId);
    const idx = parseInt(iStr);
    if (group && !isNaN(idx) && group.items[idx]) return { boqItem: group.items[idx], boqGroup: group };
  }
  // Legacy fallback: numeric index
  const idx = parseInt(ref);
  const flat = _getAllBoqItemsFlat(boqs);
  if (!isNaN(idx) && flat[idx]) return { boqItem: flat[idx], boqGroup: (boqs || []).find(g => g.id === flat[idx]._boqGroupId) };
  return null;
}

/** Lookup a BOQ item by boqIndex/boqRef — supports both flat index and "groupId:itemIdx" format */
const _lookupBoqItem = lookupBoqItem; // moved to abstractCalc.js (pure + tested)

// ── BOQ Row Helpers ──

let _boqRowCounter = 0;

function _createBOQRowHTML(sr, data = {}) {
  const id = ++_boqRowCounter;
  return `<tr data-boq-row="${id}" style="${sr % 2 === 0 ? 'background:#fafbfc;' : ''}">
    <td class="px-3 py-1.5 text-center text-xs text-slate-400 font-bold boq-sr">${sr}</td>
    <td class="px-2 py-1"><input type="text" class="w-full p-1.5 border rounded-lg text-xs outline-none focus:border-blue-400 font-mono boq-code" value="${data.code || ''}" placeholder="EXC-01"></td>
    <td class="px-2 py-1"><input type="text" class="w-full p-1.5 border rounded-lg text-xs outline-none focus:border-blue-400 boq-desc" value="${data.description || ''}" placeholder="Item description"></td>
    <td class="px-2 py-1"><select class="w-full p-1.5 border rounded-lg text-xs outline-none focus:border-blue-400 boq-uom">
      <option value="">--</option><option ${data.uom === 'Nos' ? 'selected' : ''}>Nos</option><option ${data.uom === 'M2' ? 'selected' : ''}>M2</option><option ${data.uom === 'M3' ? 'selected' : ''}>M3</option>
      <option ${data.uom === 'RMT' ? 'selected' : ''}>RMT</option><option ${data.uom === 'SQM' ? 'selected' : ''}>SQM</option><option ${data.uom === 'CUM' ? 'selected' : ''}>CUM</option>
      <option ${data.uom === 'KG' ? 'selected' : ''}>KG</option><option ${data.uom === 'MT' ? 'selected' : ''}>MT</option><option ${data.uom === 'Bag' ? 'selected' : ''}>Bag</option>
      <option ${data.uom === 'LTR' ? 'selected' : ''}>LTR</option><option ${data.uom === 'Lot' ? 'selected' : ''}>Lot</option><option ${data.uom === 'LS' ? 'selected' : ''}>LS</option>
      <option ${data.uom === 'Day' ? 'selected' : ''}>Day</option><option ${data.uom === 'Trip' ? 'selected' : ''}>Trip</option><option ${data.uom === 'Each' ? 'selected' : ''}>Each</option>
    </select></td>
    <td class="px-2 py-1"><input type="number" class="w-full p-1.5 border rounded-lg text-xs outline-none focus:border-blue-400 text-right boq-qty" value="${data.qty || ''}" placeholder="0" step="0.01" oninput="calcBOQRow(this)"></td>
    <td class="px-2 py-1"><input type="number" class="w-full p-1.5 border rounded-lg text-xs outline-none focus:border-blue-400 text-right boq-rate" value="${data.rate || ''}" placeholder="0" step="0.01" oninput="calcBOQRow(this)"></td>
    <td class="px-2 py-1"><input type="text" class="w-full p-1.5 bg-slate-50 border rounded-lg text-xs text-right font-bold text-slate-700 boq-amt" value="${data.amount ? getCurrencySymbol() + parseFloat(data.amount).toLocaleString('en-IN') : ''}" readonly tabindex="-1"></td>
    <td class="px-2 py-1"><input type="number" class="w-full p-1.5 border rounded-lg text-xs outline-none focus:border-blue-400 text-center boq-gst" value="${data.gst ?? 18}" step="0.5" oninput="calcBOQRow(this)"></td>
    <td class="px-1 py-1 text-center"><button onclick="removeBOQRow(this)" class="w-6 h-6 rounded-full text-slate-300 hover:bg-red-50 hover:text-red-500 text-sm font-bold transition">&#10005;</button></td>
  </tr>`;
}

export function addBOQRow(data = {}) {
  const tbody = document.getElementById('boqTableBody');
  if (!tbody) return;
  const sr = tbody.querySelectorAll('tr').length + 1;
  tbody.insertAdjacentHTML('beforeend', _createBOQRowHTML(sr, data));
}

export function removeBOQRow(btn) {
  const row = btn.closest('tr');
  if (row) row.remove();
  _renumberBOQRows();
  _calcBOQTotals();
}

function _renumberBOQRows() {
  const rows = document.querySelectorAll('#boqTableBody tr');
  rows.forEach((r, i) => { const sr = r.querySelector('.boq-sr'); if (sr) sr.textContent = i + 1; });
}

export function calcBOQRow(input) {
  const row = input.closest('tr');
  if (!row) return;
  const qty = parseFloat(row.querySelector('.boq-qty')?.value) || 0;
  const rate = parseFloat(row.querySelector('.boq-rate')?.value) || 0;
  const amt = qty * rate;
  const amtEl = row.querySelector('.boq-amt');
  if (amtEl) amtEl.value = amt ? getCurrencySymbol() + amt.toLocaleString('en-IN', { minimumFractionDigits: 2 }) : '';
  _calcBOQTotals();
}

function _calcBOQTotals() {
  const rows = document.querySelectorAll('#boqTableBody tr');
  let totalQty = 0, subtotal = 0, gstTotal = 0;
  rows.forEach(r => {
    const qty = parseFloat(r.querySelector('.boq-qty')?.value) || 0;
    const rate = parseFloat(r.querySelector('.boq-rate')?.value) || 0;
    const gstPct = parseFloat(r.querySelector('.boq-gst')?.value) || 0;
    const amt = qty * rate;
    totalQty += qty;
    subtotal += amt;
    gstTotal += amt * gstPct / 100;
  });
  const fmt = (v) => getCurrencySymbol() + v.toLocaleString('en-IN', { minimumFractionDigits: 2 });
  const el = (id, val) => { const e = document.getElementById(id); if (e) e.textContent = val; };
  el('boqTotalQty', totalQty ? totalQty.toLocaleString('en-IN') : '0');
  el('boqTotalAmt', fmt(subtotal));
  el('boqItemCount', rows.length);
  el('boqSubtotal', fmt(subtotal));
  el('boqGstTotal', fmt(gstTotal));
  el('boqGrandTotal', fmt(subtotal + gstTotal));
}

function _readBOQRows() {
  const rows = document.querySelectorAll('#boqTableBody tr');
  const items = [];
  rows.forEach(r => {
    const code = r.querySelector('.boq-code')?.value?.trim() || '';
    const description = r.querySelector('.boq-desc')?.value?.trim() || '';
    if (!description && !code) return; // skip empty
    items.push({
      code,
      description,
      uom: r.querySelector('.boq-uom')?.value || '',
      qty: parseFloat(r.querySelector('.boq-qty')?.value) || 0,
      rate: parseFloat(r.querySelector('.boq-rate')?.value) || 0,
      amount: (parseFloat(r.querySelector('.boq-qty')?.value) || 0) * (parseFloat(r.querySelector('.boq-rate')?.value) || 0),
      gst: parseFloat(r.querySelector('.boq-gst')?.value) || 0
    });
  });
  return items;
}

function _loadBOQRows(boqItems) {
  const tbody = document.getElementById('boqTableBody');
  if (!tbody) return;
  tbody.innerHTML = '';
  _boqRowCounter = 0;
  if (!boqItems || !boqItems.length) {
    // Add 3 empty rows by default
    for (let i = 0; i < 3; i++) addBOQRow();
    return;
  }
  boqItems.forEach(item => addBOQRow(item));
  _calcBOQTotals();
}

/** Upload Excel file and populate BOQ table */
export function handleBOQUpload(event) {
  const file = event.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const XLSX = window.XLSX;
      if (!XLSX) { showToast('Excel library not loaded', 'error'); return; }
      const wb = XLSX.read(e.target.result, { type: 'array' });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(ws, { defval: '' });
      if (!rows.length) { showToast('No data found in file', 'error'); return; }
      // Clear existing and populate
      const tbody = document.getElementById('boqTableBody');
      if (tbody) tbody.innerHTML = '';
      _boqRowCounter = 0;
      // Auto-detect columns by common names
      const colMap = (headers) => {
        const lc = (s) => String(s).toLowerCase().trim();
        const find = (arr) => headers.find(h => arr.some(a => lc(h).includes(a)));
        return {
          code: find(['code', 'item code', 'sr', 'sl', 'item no', 'item_code']) || headers[0],
          desc: find(['desc', 'description', 'item name', 'particular', 'item_name', 'name']) || headers[1],
          uom: find(['uom', 'unit', 'units']) || headers[2],
          qty: find(['qty', 'quantity', 'total qty']) || headers[3],
          rate: find(['rate', 'price', 'unit rate', 'unit_rate']) || headers[4],
          gst: find(['gst', 'tax', 'gst%', 'gst %']) || null
        };
      };
      const headers = Object.keys(rows[0]);
      const cm = colMap(headers);
      rows.forEach(row => {
        addBOQRow({
          code: String(row[cm.code] || '').trim(),
          description: String(row[cm.desc] || '').trim(),
          uom: String(row[cm.uom] || '').trim(),
          qty: parseFloat(row[cm.qty]) || 0,
          rate: parseFloat(row[cm.rate]) || 0,
          gst: cm.gst ? (parseFloat(row[cm.gst]) || 18) : 18
        });
      });
      _calcBOQTotals();
      showToast(`${rows.length} BOQ items imported!`);
    } catch (err) {
      showToast('Error reading file: ' + err.message, 'error');
    }
  };
  reader.readAsArrayBuffer(file);
  event.target.value = ''; // reset input
}

/** Download a blank BOQ Excel template */
export function downloadBOQTemplate() {
  const XLSX = window.XLSX;
  if (!XLSX) { showToast('Excel library not loaded', 'error'); return; }
  const data = [
    { 'Item Code': 'EXC-01', 'Description': 'Excavation in all types of soil', 'UOM': 'M3', 'Qty': 100, 'Rate': 250, 'GST %': 18 },
    { 'Item Code': 'RCC-01', 'Description': 'RCC M20 Grade', 'UOM': 'M3', 'Qty': 50, 'Rate': 5000, 'GST %': 18 },
    { 'Item Code': '', 'Description': '', 'UOM': '', 'Qty': '', 'Rate': '', 'GST %': '' }
  ];
  const ws = XLSX.utils.json_to_sheet(data);
  ws['!cols'] = [{ wch: 12 }, { wch: 40 }, { wch: 8 }, { wch: 10 }, { wch: 12 }, { wch: 8 }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'BOQ Template');
  mobileSaveXLSX(wb, 'BOQ_Template.xlsx');
  showToast('Template downloaded!');
}

// ── Project Form Open/Close/Save ──

/** Open project form (add or edit) */
export function openProjectForm(editId) {
  const panel = document.getElementById('projectFormPanel');
  if (!panel) return;
  const titleEl = document.getElementById('projFormTitle');

  // Helper to set value safely
  const setVal = (id, val) => { const el = document.getElementById(id); if (el) el.value = val ?? ''; };

  if (editId) {
    const p = (state.projects || []).find(x => x.id === editId);
    if (!p) return;
    if (titleEl) titleEl.textContent = 'Edit Project / Work Order';
    setVal('projFormId', p.id);
    setVal('projFormName', p.name);
    setVal('projFormCode', p.code);
    setVal('projFormManager', p.manager);
    setVal('projFormLocation', p.location);
    setVal('projFormStatus', p.status || 'Active');
    setVal('projFormStart', p.startDate);
    setVal('projFormEnd', p.endDate);
    setVal('projFormColor', p.color || '#3b82f6');
    setVal('projFormDesc', p.description);
    // Client details
    setVal('projFormClient', p.clientName);
    setVal('projFormClientContact', p.clientContact);
    setVal('projFormClientPhone', p.clientPhone);
    setVal('projFormClientEmail', p.clientEmail);
    setVal('projFormClientGst', p.clientGst);
    setVal('projFormClientPan', p.clientPan);
    setVal('projFormClientAddr', p.clientAddress);
    // BOQ — multiple groups (WO/PO details stored per group)
    if (p.boqs && p.boqs.length) {
      _boqGroups = JSON.parse(JSON.stringify(p.boqs));
      // Migrate: if first group has no woNumber but project does, copy project WO data into first group
      if (p.woNumber && !_boqGroups[0].woNumber) {
        _boqGroups[0].woNumber = p.woNumber || '';
        _boqGroups[0].woDate = p.woDate || '';
        _boqGroups[0].poValue = p.budget || 0;
        _boqGroups[0].poQty = p.poQty || 0;
        _boqGroups[0].gstRate = p.gstRate ?? 18;
        _boqGroups[0].gstType = p.gstType || 'CGST_SGST';
        _boqGroups[0].sacCode = p.sacCode || '';
        _boqGroups[0].woExpiry = p.woExpiry || '';
        _boqGroups[0].retention = p.retention || 0;
      }
    } else if (p.boqItems && p.boqItems.length) {
      // Migrate legacy single boqItems to boqs array with WO data
      _boqGroups = [{ id: 'boq_legacy_' + p.id, name: 'BOQ 1', type: 'BOQ', items: JSON.parse(JSON.stringify(p.boqItems)),
        woNumber: p.woNumber || '', woDate: p.woDate || '', poValue: p.budget || 0, poQty: p.poQty || 0,
        gstRate: p.gstRate ?? 18, gstType: p.gstType || 'CGST_SGST', sacCode: p.sacCode || '',
        woExpiry: p.woExpiry || '', retention: p.retention || 0
      }];
    } else {
      _boqGroups = [];
    }
    _activeBoqGroupIdx = 0;
    _renderBoqTabs();
    _loadActiveBoqGroup();
  } else {
    if (titleEl) titleEl.textContent = 'New Project / Work Order';
    setVal('projFormId', '');
    setVal('projFormName', '');
    setVal('projFormCode', 'PROJ-' + (Date.now() % 100000));
    setVal('projFormManager', '');
    setVal('projFormLocation', '');
    setVal('projFormStatus', 'Active');
    setVal('projFormStart', new Date().toISOString().split('T')[0]);
    setVal('projFormEnd', '');
    setVal('projFormColor', '#3b82f6');
    setVal('projFormDesc', '');
    // Client
    ['projFormClient','projFormClientContact','projFormClientPhone','projFormClientEmail','projFormClientGst','projFormClientPan','projFormClientAddr'].forEach(id => setVal(id, ''));
    // BOQ — empty (WO/PO details stored per group)
    _boqGroups = [];
    _activeBoqGroupIdx = 0;
    _renderBoqTabs();
    _loadActiveBoqGroup();
  }
  panel.style.display = 'flex';
  document.body.style.overflow = 'hidden';
}

export function closeProjectForm() {
  const panel = document.getElementById('projectFormPanel');
  if (panel) panel.style.display = 'none';
  document.body.style.overflow = '';
}

export function saveProject() {
  const name = document.getElementById('projFormName')?.value?.trim();
  if (!name) { showToast('Project name is required', 'error'); return; }
  const editId = document.getElementById('projFormId')?.value;
  const getVal = (id) => document.getElementById(id)?.value?.trim() || '';
  const data = {
    name,
    code: getVal('projFormCode'),
    manager: getVal('projFormManager'),
    location: getVal('projFormLocation'),
    status: getVal('projFormStatus') || 'Active',
    startDate: getVal('projFormStart'),
    endDate: getVal('projFormEnd'),
    color: getVal('projFormColor') || '#3b82f6',
    description: getVal('projFormDesc'),
    // Client
    clientName: getVal('projFormClient'),
    clientContact: getVal('projFormClientContact'),
    clientPhone: getVal('projFormClientPhone'),
    clientEmail: getVal('projFormClientEmail'),
    clientGst: getVal('projFormClientGst'),
    clientPan: getVal('projFormClientPan'),
    clientAddress: getVal('projFormClientAddr'),
    // BOQ items — save active tab first, then all groups (WO/PO details stored per BOQ group)
    boqItems: (() => { _saveActiveBoqGroupData(); return _getAllBoqItemsFlat(_boqGroups); })(),
    boqs: (() => { _saveActiveBoqGroupData(); return JSON.parse(JSON.stringify(_boqGroups)); })(),
    // Computed totals from BOQ groups for backward compatibility
    budget: (() => { _saveActiveBoqGroupData(); return _boqGroups.reduce((s, g) => s + (g.poValue || 0), 0); })(),
    woNumber: (() => { _saveActiveBoqGroupData(); return _boqGroups.map(g => g.woNumber).filter(Boolean).join(', '); })()
  };
  if (!state.projects) state.projects = [];
  if (editId) {
    const idx = state.projects.findIndex(p => p.id === editId);
    if (idx >= 0) Object.assign(state.projects[idx], data);
    showToast('Project updated!');
  } else {
    data.id = 'proj_' + Date.now();
    data.createdAt = new Date().toISOString();
    state.projects.push(data);
    showToast('Project created!');
  }
  saveAllData(); closeProjectForm();
  if (state.currentProjectId) renderProjectDashboard();
  else renderProjectsHome();
}

export function deleteProject(projId) {
  if (!confirm('Delete this project? All project data associations will remain but the project entry will be removed.')) return;
  state.projects = (state.projects || []).filter(p => p.id !== projId);
  saveAllData();
  if (state.currentProjectId === projId) goProjectsHome();
  else renderProjectsHome();
  showToast('Project deleted', 'error');
}

/** Update breadcrumb based on current context */
function _updateBreadcrumb(viewId) {
  const bc = document.getElementById('breadcrumbPath');
  if (!bc) return;
  const proj = state.currentProjectId ? (state.projects || []).find(p => p.id === state.currentProjectId) : null;
  let html = '<button onclick="goProjectsHome()" class="text-slate-400 hover:text-blue-600 font-semibold transition">Home</button>';
  if (proj && viewId !== 'projectsHome') {
    html += '<span class="text-slate-300 mx-1">/</span>';
    html += `<button onclick="openProject('${proj.id}')" class="text-slate-500 hover:text-blue-600 font-semibold transition">${proj.name}</button>`;
    // Find module label
    const mod = MODULE_CARDS.find(m => m.id === viewId);
    const viewLabels = { projectDashboard: 'Dashboard', measurementListView: 'Measurement', entrySheet: 'Measurement Entry', savedSheets: 'Saved Sheets', recipeView: 'Recipes',
      proformaInvoiceView: 'Proforma', paymentInView: 'Payment-In', saleOrderView: 'Sale Order',
      deliveryChallanView: 'Delivery Challan', saleReturnView: 'Sale Return', saleFixedAssetsView: 'Sale Assets',
      otherIncomeView: 'Other Income', paymentOutView: 'Payment-Out', purchaseOrderView: 'Purchase Order',
      purchaseReturnView: 'Purchase Return', purchaseAssetsView: 'Fixed Assets',
      masterFinancialView: 'Payables/Receivables', accountingView: 'P&L',
      microPlanView: 'Micro Plan' };
    const label = mod?.label || viewLabels[viewId] || viewId;
    if (viewId !== 'projectDashboard') {
      html += '<span class="text-slate-300 mx-1">/</span>';
      html += `<span class="text-slate-700 font-bold">${label}</span>`;
    }
  } else if (viewId === 'projectsHome') {
    // just Home
  } else {
    const sysLabels = { reportsView: 'Reports', masterData: 'Master Data', settingsView: 'Settings', companyProfileView: 'Company Profile', dashboard: 'Enterprise Dashboard' };
    if (sysLabels[viewId]) {
      html += '<span class="text-slate-300 mx-1">/</span>';
      html += `<span class="text-slate-700 font-bold">${sysLabels[viewId]}</span>`;
    }
  }
  bc.innerHTML = html;
  // Header date
  const dateEl = document.getElementById('headerDate');
  if (dateEl) dateEl.textContent = new Date().toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
}

// ==========================================
// DROPDOWN MENU HELPER
// ==========================================
function _showDropdown(btn, menuId, items) {
  const existing = document.getElementById(menuId);
  if (existing) { existing.remove(); return; }
  document.querySelectorAll('[data-abs-dropdown]').forEach(el => el.remove());
  const rect = btn.getBoundingClientRect();
  const dd = document.createElement('div');
  dd.id = menuId;
  dd.setAttribute('data-abs-dropdown', '1');
  dd.className = 'fixed bg-white border border-slate-200 rounded-lg shadow-2xl py-1 w-44';
  dd.style.cssText = `z-index:9999;top:${rect.bottom + 4}px;left:${Math.max(4, rect.right - 176)}px`;
  dd.innerHTML = items;
  document.body.appendChild(dd);
  setTimeout(() => {
    const handler = (e) => {
      if (!dd.contains(e.target) && e.target !== btn) { dd.remove(); document.removeEventListener('click', handler, true); }
    };
    document.addEventListener('click', handler, true);
  }, 10);
}
window._showAbsDropdown = _showDropdown;

// ==========================================
// ICON GRID BUILDER
// ==========================================
function _buildIconGrid(containerId, items) {
  const el = document.getElementById(containerId);
  if (!el) return;
  el.innerHTML = `<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(140px,1fr));gap:12px;">
    ${items.map(m => `
      <div onclick="${m.action}" style="background:#fff;border:1px solid #e2e8f0;border-radius:14px;padding:20px 16px;cursor:pointer;text-align:center;transition:all .15s;box-shadow:0 1px 3px rgba(0,0,0,.04);" onmouseover="this.style.transform='translateY(-2px)';this.style.boxShadow='0 6px 20px rgba(0,0,0,.08)';this.style.borderColor='#bfdbfe'" onmouseout="this.style.transform='';this.style.boxShadow='0 1px 3px rgba(0,0,0,.04)';this.style.borderColor='#e2e8f0'">
        <div style="width:48px;height:48px;background:${m.color}12;border:2px solid ${m.color}25;border-radius:14px;display:inline-flex;align-items:center;justify-content:center;font-size:24px;margin-bottom:10px;">${m.icon}</div>
        <div style="font-size:13px;font-weight:700;color:#0f172a;margin-bottom:3px;">${m.label}</div>
        <div style="font-size:10px;color:#94a3b8;line-height:1.3;">${m.desc}</div>
      </div>`).join('')}
  </div>`;
}

// ══════════════════════════════════════════
// PAYMENTS HUB — all money in/out across modules
// ══════════════════════════════════════════
/** Does a record belong to the current project? (matches projectId, or party's project) */
function _payInProject(rec, partyType) {
  const pid = state.currentProjectId;
  if (!pid) return true;
  if (rec.projectId) return rec.projectId === pid;
  // resolve via linked party
  if (partyType === 'client' && rec.clientId) return (state.clients.find(c => c.id === rec.clientId)?.projectId) === pid;
  if (partyType === 'vendor' && rec.vendorId) return (state.vendors.find(v => v.id === rec.vendorId)?.projectId) === pid;
  if (partyType === 'labour' && rec.labourId) return (state.labourMaster.find(l => l.id === rec.labourId)?.projectId) === pid;
  return true; // untagged — show under any project
}

function _collectPaymentsIn() {
  const rows = [];
  (state.paymentsIn || []).filter(p => _payInProject(p, 'client')).forEach(p => { const c = state.clients.find(x => x.id === p.clientId); rows.push({ date: p.date, party: c?.name || 'Client', source: 'Client Receipt', amount: parseFloat(p.amount) || 0, ref: p.ref || '', _src: 'paymentsIn', _id: p.id }); });
  (state.otherIncome || []).filter(o => _payInProject(o)).forEach(o => rows.push({ date: o.date, party: o.source || o.party || '—', source: 'Other Income', amount: parseFloat(o.amount) || 0, ref: o.remarks || '', _src: 'otherIncome', _id: o.id }));
  return rows.sort((a, b) => new Date(b.date) - new Date(a.date));
}
function _collectPaymentsOut() {
  const rows = [];
  (state.expenses || []).filter(e => _payInProject(e, 'client')).forEach(e => rows.push({ date: e.date, party: e.category || 'Expense', source: 'Expense', amount: parseFloat(e.amount) || 0, ref: e.remarks || '', _src: 'expenses', _id: e.id }));
  (state.vendorPayments || []).filter(v => _payInProject(v, 'vendor')).forEach(v => { const vn = state.vendors.find(x => x.id === v.vendorId); rows.push({ date: v.date, party: vn?.name || 'Vendor', source: 'Vendor Payment', amount: parseFloat(v.amount) || 0, ref: v.ref || '', _src: 'vendorPayments', _id: v.id }); });
  (state.labourPayments || []).filter(l => _payInProject(l, 'labour')).forEach(l => { const ln = state.labourMaster.find(x => x.id === l.labourId); rows.push({ date: l.date, party: ln?.name || 'Labour', source: 'Labour Payment', amount: parseFloat(l.amount) || 0, ref: l.ref || '', _src: 'labourPayments', _id: l.id }); });
  (state.labourAdvances || []).filter(a => _payInProject(a, 'labour')).forEach(a => { const ln = state.labourMaster.find(x => x.id === a.labourId); rows.push({ date: a.date, party: ln?.name || 'Labour', source: 'Advance', amount: parseFloat(a.amount) || 0, ref: a.note || '', _src: 'labourAdvances', _id: a.id }); });
  return rows.sort((a, b) => new Date(b.date) - new Date(a.date));
}

window._openPaymentsSection = function(dir) {
  const grid = document.getElementById('paymentsGrid');
  const back = document.getElementById('paymentsBackBtn');
  const content = document.getElementById('paymentsContent');
  const cur = getCurrencySymbol();

  if (!dir) { if (grid) grid.style.display = 'grid'; if (back) back.style.display = 'none'; if (content) content.innerHTML = ''; return; }
  if (grid) grid.style.display = 'none'; if (back) back.style.display = 'inline-block';

  const rows = dir === 'in' ? _collectPaymentsIn() : _collectPaymentsOut();
  const color = dir === 'in' ? '#059669' : '#dc2626';
  let html = `<div class="bg-white border rounded-xl overflow-hidden">
    <div class="p-3 border-b flex justify-between items-center" style="background:${color}10;">
      <h3 class="font-bold text-sm" style="color:${color};">${dir === 'in' ? '📥 Payment In' : '📤 Payment Out'}</h3>
      <button onclick="_addPaymentTxn('${dir}')" style="background:${color};color:#fff;border:none;padding:6px 14px;border-radius:8px;font-size:12px;font-weight:700;cursor:pointer;">+ Add ${dir === 'in' ? 'Payment In' : 'Payment Out'}</button>
    </div>
    <div class="overflow-x-auto" style="max-height:65vh;">
      <table class="w-full text-xs"><thead class="bg-slate-50 sticky top-0"><tr>
        <th class="px-3 py-2 text-left font-bold uppercase text-slate-500">Date</th>
        <th class="px-3 py-2 text-left font-bold uppercase text-slate-500">Party</th>
        <th class="px-3 py-2 text-left font-bold uppercase text-slate-500">Source</th>
        <th class="px-3 py-2 text-left font-bold uppercase text-slate-500">Ref</th>
        <th class="px-3 py-2 text-right font-bold uppercase text-slate-500">Amount</th>
        <th class="px-3 py-2"></th>
      </tr></thead><tbody>
      ${rows.map(r => `<tr style="border-bottom:1px solid #f1f5f9;">
        <td class="px-3 py-2 whitespace-nowrap text-slate-500">${r.date || '—'}</td>
        <td class="px-3 py-2 font-bold text-slate-800">${r.party}</td>
        <td class="px-3 py-2"><span style="font-size:10px;font-weight:600;background:${color}12;color:${color};padding:2px 8px;border-radius:6px;">${r.source}</span></td>
        <td class="px-3 py-2 text-slate-400">${r.ref || '—'}</td>
        <td class="px-3 py-2 text-right font-bold" style="color:${color};">${cur}${r.amount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
        <td class="px-3 py-2 text-center"><button onclick="_deletePartyTx('${r._src}','${r._id}');_openPaymentsSection('${dir}')" style="font-size:10px;color:#dc2626;background:#fef2f2;border:1px solid #fecaca;border-radius:4px;padding:2px 6px;cursor:pointer;">✕</button></td>
      </tr>`).join('') || '<tr><td colspan="6" class="p-6 text-center text-slate-400">No transactions.</td></tr>'}
      </tbody></table>
    </div></div>`;
  if (content) content.innerHTML = html;
};

/** Quick-add a payment in/out, scoped to current project */
window._addPaymentTxn = function(dir) {
  const cur = getCurrencySymbol();
  const accOpts = (state.accounts || []).map(a => `<option value="${a.id}">${a.name}</option>`).join('');
  let partyField, catField = '';
  if (dir === 'in') {
    const clientOpts = (state.clients || []).filter(c => !c.projectId || c.projectId === state.currentProjectId).map(c => `<option value="${c.id}">${c.name}</option>`).join('');
    partyField = `<label class="fm-l">From Client</label><select id="ptxParty" class="fm-i"><option value="">— General Income —</option>${clientOpts}</select>`;
  } else {
    const vOpts = (state.vendors || []).filter(v => !v.projectId || v.projectId === state.currentProjectId).map(v => `<option value="vendor:${v.id}">Vendor: ${v.name}</option>`).join('');
    const lOpts = (state.labourMaster || []).filter(l => l.projectId === state.currentProjectId).map(l => `<option value="labour:${l.id}">Labour: ${l.name}</option>`).join('');
    partyField = `<label class="fm-l">Pay To</label><select id="ptxParty" class="fm-i"><option value="">— General Expense —</option>${vOpts}${lOpts}</select>`;
    catField = `<label class="fm-l">Category</label><input id="ptxCat" class="fm-i" placeholder="e.g. Site, Transport" value="General">`;
  }
  _fuelModalLike('Add ' + (dir === 'in' ? 'Payment In' : 'Payment Out'), `
    ${partyField}
    ${catField}
    <label class="fm-l">Amount (₹)</label><input id="ptxAmount" type="number" class="fm-i" placeholder="0">
    <label class="fm-l">Date</label><input id="ptxDate" type="date" class="fm-i" value="${new Date().toISOString().split('T')[0]}">
    <label class="fm-l">Account</label><select id="ptxAccount" class="fm-i">${accOpts}</select>
    <label class="fm-l">Reference / Note</label><input id="ptxRef" class="fm-i" placeholder="UTR / cheque / note">
  `, () => {
    const amount = parseFloat(document.getElementById('ptxAmount').value) || 0;
    if (amount <= 0) { showToast('Enter amount', 'error'); return false; }
    const date = document.getElementById('ptxDate').value;
    const accountId = document.getElementById('ptxAccount').value;
    const ref = document.getElementById('ptxRef').value;
    const party = document.getElementById('ptxParty').value;
    const pid = state.currentProjectId;
    if (dir === 'in') {
      state.paymentsIn.push({ id: 'in_' + Date.now(), clientId: party, accountId, date, amount, ref, projectId: pid });
    } else {
      if (party.startsWith('vendor:')) state.vendorPayments.push({ id: 'vp_' + Date.now(), vendorId: party.split(':')[1], accountId, date, amount, ref, projectId: pid });
      else if (party.startsWith('labour:')) state.labourPayments.push({ id: 'lpay_' + Date.now(), labourId: party.split(':')[1], accountId, date, amount, ref, projectId: pid });
      else state.expenses.push({ id: 'exp_' + Date.now(), accountId, date, amount, category: document.getElementById('ptxCat')?.value || 'General', remarks: ref, projectId: pid });
    }
    saveAllData();
    _openPaymentsSection(dir);
    showToast('Payment recorded', 'success');
    return true;
  });
};

/** lightweight modal (reuses fuel modal styling) */
function _fuelModalLike(title, body, onSave) {
  const ex = document.getElementById('fuelModal'); if (ex) ex.remove();
  const html = `<div id="fuelModal" style="position:fixed;inset:0;z-index:100001;background:rgba(0,0,0,.45);display:flex;align-items:center;justify-content:center;" onclick="if(event.target===this)this.remove()">
    <div style="background:#fff;border-radius:16px;width:92%;max-width:400px;padding:22px;box-shadow:0 20px 50px rgba(0,0,0,.25);max-height:88vh;overflow-y:auto;">
      <h3 style="font-size:16px;font-weight:800;color:#0f172a;margin-bottom:12px;">${title}</h3>${body}
      <div style="display:flex;gap:8px;margin-top:16px;"><button id="fmCancel" style="flex:1;padding:10px;background:#f1f5f9;border:none;border-radius:8px;font-weight:700;color:#64748b;cursor:pointer;">Cancel</button><button id="fmSave" style="flex:2;padding:10px;background:#2563eb;color:#fff;border:none;border-radius:8px;font-weight:700;cursor:pointer;">Save</button></div>
    </div></div>`;
  document.body.insertAdjacentHTML('beforeend', html);
  if (!document.getElementById('fmStyles')) { const s = document.createElement('style'); s.id = 'fmStyles'; s.textContent = '.fm-l{display:block;font-size:11px;font-weight:600;color:#64748b;text-transform:uppercase;margin:10px 0 4px;}.fm-i{width:100%;padding:9px;border:1px solid #e2e8f0;border-radius:8px;font-size:13px;outline:none;}'; document.head.appendChild(s); }
  document.getElementById('fmCancel').onclick = () => document.getElementById('fuelModal').remove();
  document.getElementById('fmSave').onclick = () => { if (onSave() !== false) document.getElementById('fuelModal').remove(); };
}

export function renderPaymentsHub() { window._openPaymentsSection(null); }

// ==========================================
// ANALYTICS / EXECUTIVE MIS DASHBOARD
// ==========================================
export function renderAnalyticsDashboard() {
  const c = document.getElementById('analyticsContent');
  if (!c) return;
  const cur = getCurrencySymbol();
  const fmt = (n) => cur + (n || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 });

  // ── Compute company-wide metrics ──
  const projects = state.projects || [];
  const activeProjects = projects.filter(p => (p.status || 'Active') === 'Active').length;

  // Revenue: abstracts + sale invoices + invoices tax
  let totalBilled = 0, totalReceived = 0;
  (state.abstracts || []).forEach(a => totalBilled += (a.totalAmount || 0));
  (state.saleInvoices || []).forEach(i => { if (i.status !== 'Cancelled') totalBilled += (i.grandTotal || i.total || 0); });
  (state.paymentsIn || []).forEach(p => totalReceived += (parseFloat(p.amount) || 0));
  const outstanding = totalBilled - totalReceived;

  // Expenses
  let totalExpenses = 0, totalPurchases = 0, totalLabour = 0;
  (state.expenses || []).forEach(e => totalExpenses += (parseFloat(e.amount) || 0));
  (state.vendorMaterials || []).forEach(m => totalPurchases += (m.totalAmount || parseFloat(m.amount) || 0));
  (state.labourPayments || []).forEach(l => totalLabour += (parseFloat(l.amount) || 0));
  const netProfit = totalReceived - totalExpenses - totalPurchases - totalLabour;

  // Counts
  const clientCount = (state.clients || []).length;
  const vendorCount = (state.vendors || []).length;
  const labourCount = (state.labourMaster || []).length;
  const sheetCount = (state.sheets || []).length;
  const equipCount = (state.equipmentList || []).length;
  const poCount = (state.purchaseOrders || []).length;

  // Bank balances
  let totalCash = 0;
  (state.accounts || []).forEach(acc => {
    let bal = 0;
    (state.paymentsIn || []).filter(p => p.accountId === acc.id).forEach(p => bal += (parseFloat(p.amount) || 0));
    (state.expenses || []).filter(e => e.accountId === acc.id).forEach(e => bal -= (parseFloat(e.amount) || 0));
    (state.vendorPayments || []).filter(v => v.accountId === acc.id).forEach(v => bal -= (parseFloat(v.amount) || 0));
    (state.labourPayments || []).filter(l => l.accountId === acc.id).forEach(l => bal -= (parseFloat(l.amount) || 0));
    totalCash += bal;
  });

  const hero = (label, value, color, sub) => `
    <div style="background:linear-gradient(135deg,${color},${color}dd);border-radius:16px;padding:20px;color:#fff;box-shadow:0 4px 16px ${color}40;">
      <p style="font-size:11px;font-weight:600;opacity:.85;text-transform:uppercase;letter-spacing:.5px;">${label}</p>
      <p style="font-size:26px;font-weight:800;margin-top:6px;font-family:'JetBrains Mono',monospace;">${value}</p>
      ${sub ? `<p style="font-size:11px;opacity:.8;margin-top:4px;">${sub}</p>` : ''}
    </div>`;

  const stat = (icon, label, value, color) => `
    <div style="background:#fff;border:1px solid #e2e8f0;border-radius:12px;padding:16px;border-left:3px solid ${color};">
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;"><span style="font-size:16px;">${icon}</span><span style="font-size:10px;font-weight:600;color:#94a3b8;text-transform:uppercase;">${label}</span></div>
      <p style="font-size:22px;font-weight:800;color:#0f172a;font-family:'JetBrains Mono',monospace;">${value}</p>
    </div>`;

  c.innerHTML = `
    <!-- Financial Hero Cards -->
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:14px;margin-bottom:20px;">
      ${hero('Total Billed', fmt(totalBilled), '#2563eb', 'Revenue across all projects')}
      ${hero('Received', fmt(totalReceived), '#059669', 'Payments collected')}
      ${hero('Outstanding', fmt(outstanding), '#ea580c', 'Pending collection')}
      ${hero('Net Profit', fmt(netProfit), netProfit >= 0 ? '#10b981' : '#dc2626', 'Received − all costs')}
    </div>

    <!-- Cost Breakdown -->
    <h3 style="font-size:13px;font-weight:700;color:#475569;margin:8px 0 12px;text-transform:uppercase;letter-spacing:.3px;">💸 Cost Breakdown</h3>
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px;margin-bottom:24px;">
      ${stat('🛒', 'Purchases', fmt(totalPurchases), '#f59e0b')}
      ${stat('👷', 'Labour Paid', fmt(totalLabour), '#8b5cf6')}
      ${stat('🧾', 'Expenses', fmt(totalExpenses), '#ef4444')}
      ${stat('🏦', 'Cash & Bank', fmt(totalCash), '#10b981')}
    </div>

    <!-- Operational Stats -->
    <h3 style="font-size:13px;font-weight:700;color:#475569;margin:8px 0 12px;text-transform:uppercase;letter-spacing:.3px;">📊 Operations</h3>
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:12px;margin-bottom:24px;">
      ${stat('🏗️', 'Projects', activeProjects + ' / ' + projects.length, '#2563eb')}
      ${stat('📐', 'Measurements', sheetCount, '#0ea5e9')}
      ${stat('🏢', 'Clients', clientCount, '#7c3aed')}
      ${stat('🏭', 'Vendors', vendorCount, '#f59e0b')}
      ${stat('👷', 'Labourers', labourCount, '#8b5cf6')}
      ${stat('🚜', 'Equipment', equipCount, '#6366f1')}
      ${stat('📋', 'Purchase Orders', poCount, '#ea580c')}
    </div>

    <!-- Project-wise breakdown -->
    <h3 style="font-size:13px;font-weight:700;color:#475569;margin:8px 0 12px;text-transform:uppercase;letter-spacing:.3px;">🏗️ Project Performance</h3>
    <div style="background:#fff;border:1px solid #e2e8f0;border-radius:12px;overflow:hidden;">
      <div style="overflow-x:auto;">
        <table style="width:100%;border-collapse:collapse;font-size:12px;">
          <thead><tr style="background:#f8fafc;">
            <th style="text-align:left;padding:10px 14px;font-size:10px;font-weight:600;color:#64748b;text-transform:uppercase;border-bottom:1px solid #e2e8f0;">Project</th>
            <th style="text-align:right;padding:10px 14px;font-size:10px;font-weight:600;color:#64748b;text-transform:uppercase;border-bottom:1px solid #e2e8f0;">Billed</th>
            <th style="text-align:right;padding:10px 14px;font-size:10px;font-weight:600;color:#64748b;text-transform:uppercase;border-bottom:1px solid #e2e8f0;">Received</th>
            <th style="text-align:right;padding:10px 14px;font-size:10px;font-weight:600;color:#64748b;text-transform:uppercase;border-bottom:1px solid #e2e8f0;">Outstanding</th>
            <th style="text-align:center;padding:10px 14px;font-size:10px;font-weight:600;color:#64748b;text-transform:uppercase;border-bottom:1px solid #e2e8f0;">Status</th>
          </tr></thead><tbody>
          ${projects.map(p => {
            const clientIds = (state.clients || []).filter(cl => cl.projectId === p.id).map(cl => cl.id);
            let pBilled = 0, pRecv = 0;
            (state.abstracts || []).filter(a => a.projectId === p.id || clientIds.includes(a.clientId)).forEach(a => pBilled += (a.totalAmount || 0));
            (state.paymentsIn || []).filter(pm => clientIds.includes(pm.clientId)).forEach(pm => pRecv += (parseFloat(pm.amount) || 0));
            const pOut = pBilled - pRecv;
            const stColor = (p.status || 'Active') === 'Active' ? '#059669' : '#94a3b8';
            return `<tr style="border-bottom:1px solid #f1f5f9;">
              <td style="padding:10px 14px;font-weight:600;color:#0f172a;">${p.name}</td>
              <td style="padding:10px 14px;text-align:right;font-weight:600;color:#2563eb;">${fmt(pBilled)}</td>
              <td style="padding:10px 14px;text-align:right;font-weight:600;color:#059669;">${fmt(pRecv)}</td>
              <td style="padding:10px 14px;text-align:right;font-weight:600;color:${pOut > 0 ? '#ea580c' : '#94a3b8'};">${fmt(pOut)}</td>
              <td style="padding:10px 14px;text-align:center;"><span style="font-size:10px;font-weight:700;color:${stColor};background:${stColor}15;padding:3px 8px;border-radius:6px;">${p.status || 'Active'}</span></td>
            </tr>`;
          }).join('') || '<tr><td colspan="5" style="padding:30px;text-align:center;color:#94a3b8;">No projects yet</td></tr>'}
        </tbody></table>
      </div>
    </div>
    <p style="text-align:center;margin-top:16px;font-size:11px;color:#94a3b8;">
      Need detailed reports? <a onclick="switchView('reportsView')" style="color:#2563eb;font-weight:600;cursor:pointer;">Open Report Engine →</a>
    </p>`;
}

// ==========================================
// LABOUR — app-icon section navigation
// ==========================================
window._openLabourSection = function(section) {
  const grid = document.getElementById('labourGrid');
  const backBtn = document.getElementById('labourBackBtn');
  document.querySelectorAll('.labour-section').forEach(s => s.classList.add('hide'));

  if (!section) {
    // Back to grid
    if (grid) grid.style.display = 'grid';
    if (backBtn) backBtn.style.display = 'none';
    return;
  }

  if (grid) grid.style.display = 'none';
  if (backBtn) backBtn.style.display = 'inline-block';

  const map = { markAtt: 'labourSecMarkAtt', sheet: 'labourSecSheet', master: 'labourSecMaster', contractors: 'labourSecContractors', piecerate: 'labourSecPiecerate' };
  const el = document.getElementById(map[section]);
  if (el) el.classList.remove('hide');

  // Render the section content
  if (section === 'sheet') { if (typeof window.renderMonthlyMuster === 'function') window.renderMonthlyMuster(); }
  if (section === 'master') { if (typeof window.renderLabourMasterList === 'function') window.renderLabourMasterList(); }
  if (section === 'contractors') { if (typeof window.renderContractorsList === 'function') window.renderContractorsList(); }
  if (section === 'piecerate') { if (typeof window._prTab === 'function') window._prTab('rates'); }
  if (section === 'markAtt') {
    const d = document.getElementById('attDate');
    if (d && !d.value) d.value = new Date().toISOString().split('T')[0];
    // Auto-load if a WO/site is already selected
    if (typeof window.loadAttendanceSheet === 'function') setTimeout(() => window.loadAttendanceSheet(), 50);
  }
};

function _renderMasterDataGrid() {
  _buildIconGrid('masterDataGrid', [
    { icon: '🏢', label: 'Clients', desc: 'Manage client list', color: '#2563eb', action: "document.getElementById('masterDataGrid').innerHTML='';renderClientTable();document.getElementById('masterDataTables').style.display=''" },
    { icon: '📋', label: 'Items Master', desc: 'Execution items', color: '#f97316', action: "document.getElementById('masterDataGrid').innerHTML='';renderItemMasterTable();document.getElementById('masterDataTables').style.display=''" },
    { icon: '📦', label: 'Materials', desc: 'Raw materials & tools', color: '#10b981', action: "document.getElementById('masterDataGrid').innerHTML='';renderRawMaterialTable();document.getElementById('masterDataTables').style.display=''" },
    { icon: '👥', label: 'Users & Roles', desc: 'Team permissions', color: '#7c3aed', action: "document.getElementById('masterDataGrid').innerHTML='';if(typeof renderUsersRolesPanel==='function')renderUsersRolesPanel();document.getElementById('masterDataTables').style.display=''" },
  ]);
  const tables = document.getElementById('masterDataTables');
  if (tables) tables.style.display = 'none';
}

// ==========================================
// VIEW SWITCHING
// ==========================================
export function switchView(viewId) {
  // RBAC access check
  if (typeof window.enforceAccess === 'function') {
    const allowed = window.enforceAccess(viewId);
    if (allowed === false) return;
  }
  // Close mobile sidebar on navigation
  const sidebar = document.getElementById('appSidebar');
  const overlay = document.getElementById('mobileOverlay');
  if (sidebar) sidebar.classList.remove('mobile-open');
  if (overlay) overlay.classList.remove('active');
  // Remove fullscreen from any previous sheet
  document.querySelectorAll('.fullscreen-sheet').forEach(el => el.classList.remove('fullscreen-sheet'));
  document.querySelectorAll('.view-section').forEach(el => el.classList.add('hide'));
  const viewEl = document.getElementById(viewId);
  if (!viewEl) { console.warn('View not found:', viewId); return; }
  viewEl.classList.remove('hide');
  // Measurement entry opens as full-screen overlay — hide sidebar
  if (viewId === 'entrySheet') {
    viewEl.classList.add('fullscreen-sheet');
    if (sidebar) sidebar.style.display = 'none';
  } else {
    if (sidebar) sidebar.style.display = '';
  }
  document.querySelectorAll('.nav-btn').forEach(btn => btn.classList.toggle('active', btn.dataset.target === viewId));
  _updateBreadcrumb(viewId);

  if (viewId === 'projectsHome') renderProjectsHome();
  if (viewId === 'projectDashboard') renderProjectDashboard();
  if (viewId === 'accountsManagerView') renderAccounts();
  if (viewId === 'estimatesView') window.renderEstimatesList?.();
  if (viewId === 'savedSheets') renderSavedSheets();
  if (viewId === 'abstractsView') renderAbstractsList();
  if (viewId === 'billingView') {
    document.getElementById('billingClientSelect').value = '';
    document.getElementById('billingAbstractsContainer').classList.add('hide');
    renderInvoiceHistory();
  }
  if (viewId === 'masterData') { if (typeof window.renderUsersRolesPanel === 'function') window.renderUsersRolesPanel(); }
  if (viewId === 'clientDashboardView') window.renderClientHub?.();
  if (viewId === 'partiesLedgerView') window.renderPartiesList?.();
  if (viewId === 'equipmentView') {
    const today = new Date().toISOString().split('T')[0];
    if (document.getElementById('eqLogDate')) document.getElementById('eqLogDate').value = today;
    renderEquipmentView();
    if (typeof window._openEquipSection === 'function') window._openEquipSection(null);
  }
  if (viewId === 'masterFinancialView') { renderMasterClientList(); renderMasterVendorList(); }
  if (viewId === 'measurementListView') renderMeasurementList();
  if (viewId === 'inventoryView') { renderLiveInventory(); if (typeof window._openInvSection === 'function') window._openInvSection(null); }
  if (viewId === 'pettyCashView') { if (typeof window.renderPettyCash === 'function') window.renderPettyCash(); }
  if (viewId === 'assetsView') renderAssetsView();
  if (viewId === 'recipeView') { if (typeof window.renderRecipeView === 'function') window.renderRecipeView(); }
  if (viewId === 'vendorView') {
    if (document.getElementById('purTableBody').rows.length === 0) addPurchaseRow(3);
    renderVendorLedger();
  }
  if (viewId === 'planningView') { if (typeof window.renderPlanningView === 'function') window.renderPlanningView(); }
  if (viewId === 'microPlanView') { if (typeof window.renderMicroPlanningView === 'function') window.renderMicroPlanningView(); }
  if (viewId === 'reportsView') { if (typeof window.renderReportsDashboard === 'function') window.renderReportsDashboard(); }
  if (viewId === 'analyticsView') renderAnalyticsDashboard();
  if (viewId === 'paymentsHubView') renderPaymentsHub();
  if (viewId === 'salesLedgerView') { window.renderSalesLedger?.(); renderSaleInvoices(); }
  if (viewId === 'proformaInvoiceView') window.renderProformaInvoices?.();
  if (viewId === 'paymentInView') window.renderPaymentInList?.();
  if (viewId === 'saleOrderView') window.renderSaleOrders?.();
  if (viewId === 'deliveryChallanView') window.renderDeliveryChallans?.();
  if (viewId === 'saleReturnView') window.renderSaleReturns?.();
  if (viewId === 'saleFixedAssetsView') window.renderSaleFixedAssets?.();
  if (viewId === 'otherIncomeView') window.renderOtherIncome?.();
  if (viewId === 'purchaseLedgerView') window.renderPurchaseLedger?.();
  if (viewId === 'purchaseBillsView') window.renderPurchaseLedger?.();
  if (viewId === 'paymentOutView') window.renderPaymentOut?.();
  if (viewId === 'expensesView') window.renderExpenseCategories?.();
  if (viewId === 'purchaseOrderView') window.renderPurchaseOrders?.();
  if (viewId === 'purchaseReturnView') window.renderPurchaseReturns?.();
  if (viewId === 'purchaseAssetsView') window.renderFixedAssets?.();
  if (viewId === 'settingsView') {
    if (typeof window.renderSettingsView === 'function') window.renderSettingsView();
    // Move the company profile form into the merged Company tab (once)
    const cpTab = document.getElementById('settCompanyContent');
    const cpForm = document.getElementById('companyProfileFormWrap');
    if (cpTab && cpForm && cpForm.parentElement !== cpTab) cpTab.appendChild(cpForm);
    if (typeof window.loadCompanyProfile === 'function') window.loadCompanyProfile();
    if (typeof window.renderOrgSettings === 'function') window.renderOrgSettings();
  }
  if (viewId === 'companyProfileView') { switchView('settingsView'); return; }
  if (viewId === 'orgSettingsView') { switchView('settingsView'); return; }
  if (viewId === 'superAdminView') { if (typeof window.renderSuperAdminDashboard === 'function') window.renderSuperAdminDashboard(); }

  // Auto-open sidebar dropdown if navigating to a submenu view
  const peViews = ['purchaseBillsView','paymentOutView','expensesView','purchaseOrderView','purchaseReturnView','purchaseAssetsView'];
  const ddMenu = document.getElementById('peDropdownMenu');
  const ddToggle = document.querySelector('#peDropdownMenu')?.previousElementSibling;
  if (ddMenu && ddToggle) {
    if (peViews.includes(viewId)) { ddMenu.classList.remove('hidden'); ddToggle.classList.add('open'); }
  }
  const saleViews = ['salesLedgerView','estimatesView','proformaInvoiceView','paymentInView','saleOrderView','deliveryChallanView','saleReturnView','saleFixedAssetsView','otherIncomeView'];
  const saleMenu = document.getElementById('saleDropdownMenu');
  const saleToggle = saleMenu?.previousElementSibling;
  if (saleMenu && saleToggle) {
    if (saleViews.includes(viewId)) { saleMenu.classList.remove('hidden'); saleToggle.classList.add('open'); }
  }
  // Auto-expand Projects dropdown
  const projectViews = ['labourView','equipmentView','inventoryView','assetsView','recipeView','entrySheet','savedSheets','abstractsView'];
  const projMenu = document.getElementById('projectsDropdownMenu');
  const projToggle = projMenu?.previousElementSibling;
  if (projMenu && projToggle) {
    if (projectViews.includes(viewId)) { projMenu.classList.remove('hidden'); projToggle.classList.add('open'); }
  }
  // Auto-expand Finance dropdown
  const financeViews = ['partiesLedgerView','accountsManagerView','accountingView','masterFinancialView'];
  const finMenu = document.getElementById('financeDropdownMenu');
  const finToggle = finMenu?.previousElementSibling;
  if (finMenu && finToggle) {
    if (financeViews.includes(viewId)) { finMenu.classList.remove('hidden'); finToggle.classList.add('open'); }
  }
  if (viewId === 'labourView') {
    // Build WO/PO options from current project's BOQ groups (fallback to locations)
    const proj = (state.projects || []).find(p => p.id === state.currentProjectId);
    const woOptions = [];
    if (proj?.boqs?.length) {
      proj.boqs.forEach(g => {
        const label = (g.woNumber ? g.woNumber + ' — ' : '') + (g.name || g.type || 'BOQ');
        woOptions.push({ id: g.id, name: label });
      });
    }
    if (!woOptions.length) getAllLocations().forEach(l => woOptions.push({ id: l.id, name: l.name }));

    const attSite = document.getElementById('attSite');
    const attSiteFilter = document.getElementById('attSiteFilter');
    [attSite, attSiteFilter].forEach(el => {
      if (!el) return;
      const val = el.value;
      el.innerHTML = el.id === 'attSiteFilter' ? '<option value="">All WO / Sites</option>' : '<option value="">-- Select WO / Site --</option>';
      woOptions.forEach(l => el.innerHTML += `<option value="${l.id}">${l.name}</option>`);
      if (val) el.value = val;
    });
    const today = new Date().toISOString().split('T')[0];
    if (document.getElementById('attDate')) document.getElementById('attDate').value = today;
    renderLabourMasterList();
    renderMonthlyMuster();
    // Reset to the icon grid each time the module opens
    if (typeof window._openLabourSection === 'function') window._openLabourSection(null);
  }
}

// ==========================================
// AUTOCOMPLETE
// ==========================================
export function handleDescInput(input) {
  // For estimate forms — use old client-based autocomplete
  const clientId = document.getElementById('estClient')?.value;
  if (!clientId) return;
  const val = input.value.trim().toLowerCase();
  const listContainer = document.getElementById('autocomplete-list');
  listContainer.innerHTML = '';
  if (!val) { listContainer.classList.add('hide'); return; }
  const matches = Object.values(state.items[clientId] || {}).filter(item => item.description.toLowerCase().includes(val));
  if (matches.length === 0) { listContainer.classList.add('hide'); return; }
  matches.forEach(match => {
    const div = document.createElement('div');
    div.className = 'autocomplete-item';
    div.innerHTML = `<strong>${match.code}</strong> - ${match.description}`;
    div.onclick = function () {
      input.value = match.description;
      const tr = input.closest('tr');
      if (tr.querySelector('.code-input')) tr.querySelector('.code-input').value = match.code;
      if (tr.querySelector('.uom-span')) { tr.querySelector('.uom-span').textContent = match.uom; tr.querySelector('.uom-input').value = match.uom; }
      if (tr.querySelector('.est-unit')) { tr.querySelector('.est-unit').value = match.uom; tr.querySelector('.est-rate').value = match.rate; calcEstimateRow(tr.querySelector('.est-rate')); }
      calcQty(input);
      listContainer.classList.add('hide');
    };
    listContainer.appendChild(div);
  });
  const rect = input.getBoundingClientRect();
  listContainer.style.top = (rect.bottom + window.scrollY) + 'px';
  listContainer.style.left = (rect.left + window.scrollX) + 'px';
  listContainer.style.width = rect.width + 'px';
  listContainer.classList.remove('hide');
  state.activeAutocompleteInput = input;
}

// ══════════════════════════════════════════
// BOQ-LINKED MEASUREMENT ENTRY
// ══════════════════════════════════════════

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

// ==========================================
// DASHBOARD
// ==========================================
export function renderGlobalDashboard() {
  const fromD = document.getElementById('dashFromDate')?.value || '';
  const toD = document.getElementById('dashToDate')?.value || '';
  function inRange(dStr) {
    if (!fromD && !toD) return true;
    if (!dStr) return false;
    if (fromD && dStr < fromD) return false;
    if (toD && dStr > toD) return false;
    return true;
  }
  const dateEl = document.getElementById('dashDate');
  const cpNameEl = document.getElementById('dashCompName');
  if (dateEl) {
    if (fromD || toD) dateEl.textContent = `${fromD || 'Start'} to ${toD || 'Now'}`;
    else dateEl.textContent = new Date().toLocaleDateString('en-IN', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
  }
  if (cpNameEl) cpNameEl.textContent = state.companyProfile?.CompanyName || 'True Site Sync';

  let tWork = state.abstracts.filter(a => inRange(a.date)).reduce((s, a) => s + a.totalAmount, 0) +
    state.invoices.filter(i => i.status !== 'Cancelled' && inRange(i.date)).reduce((s, i) => s + i.taxAmount, 0);
  let tClientPay = state.paymentsIn.filter(p => inRange(p.date)).reduce((s, p) => s + parseFloat(p.amount), 0);
  let tVendorPay = state.vendorPayments.filter(p => inRange(p.date)).reduce((s, p) => s + parseFloat(p.amount), 0);
  let tExp = state.expenses.filter(e => inRange(e.date)).reduce((s, e) => s + parseFloat(e.amount), 0);
  let overallInvoiced = state.invoices.filter(i => i.status !== 'Cancelled').reduce((s, i) => s + (i.taxAmount || 0), 0);
  let overallPaid = state.paymentsIn.reduce((s, p) => s + parseFloat(p.amount), 0);
  let tOutstanding = Math.max(0, overallInvoiced - overallPaid);
  let labourCost = 0;
  state.labourMaster.forEach(l => {
    const myLogs = state.attendanceLogs.filter(a => a.labourId === l.id && inRange(a.date));
    const p = myLogs.filter(a => a.status === 'P').length;
    const h = myLogs.filter(a => a.status === 'H').length;
    labourCost += (p + h * 0.5) * l.dayRate;
  });
  const fmt = n => getCurrencySymbol() + n.toLocaleString('en-IN', { maximumFractionDigits: 0 });
  document.getElementById('dashTotalWork').textContent = fmt(tWork);
  document.getElementById('dashClientPay').textContent = fmt(tClientPay);
  document.getElementById('dashVendorPay').textContent = fmt(tVendorPay);
  document.getElementById('dashExpenses').textContent = fmt(tExp);
  document.getElementById('dashProfit').textContent = fmt(tClientPay - (tVendorPay + tExp));
  document.getElementById('dashOutstanding').textContent = fmt(tOutstanding);
  document.getElementById('dashLabourCost').textContent = fmt(labourCost);
  document.getElementById('dashActiveProjects').textContent = state.clients.length;
  document.getElementById('dashPendingInv').textContent = state.invoices.filter(i => i.status !== 'Cancelled' && inRange(i.date)).length;
  document.getElementById('dashTotalVendors').textContent = state.vendors.length;
  document.getElementById('dashTotalLabour').textContent = state.labourMaster.length;

  const recentEl = document.getElementById('dashRecentInvoices');
  if (recentEl) {
    const recent = [...state.invoices].filter(i => i.status !== 'Cancelled' && inRange(i.date)).sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, 5);
    if (recent.length === 0) { recentEl.innerHTML = '<p class="p-4 text-slate-400 text-xs text-center">No invoices in this period.</p>'; return; }
    recentEl.innerHTML = recent.map(inv => {
      const c = state.clients.find(x => x.id === inv.clientId);
      return `<div class="p-3 flex justify-between items-center hover:bg-slate-50 transition"><div><p class="font-bold text-slate-800 text-sm">${inv.invoiceNum}</p><p class="text-xs text-slate-400">${c?.name || 'Unknown'} · ${inv.date || ''}</p></div><p class="font-extrabold text-blue-700 text-sm">${getCurrencySymbol()}${(inv.taxAmount || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}</p></div>`;
    }).join('');
  }
}

export function clearDashboardFilters() {
  if (document.getElementById('dashFromDate')) document.getElementById('dashFromDate').value = '';
  if (document.getElementById('dashToDate')) document.getElementById('dashToDate').value = '';
  renderGlobalDashboard();
}

// ==========================================
// VENDOR MODULE
// ==========================================
export function openVendorModal() {
  document.getElementById('vendorModal').classList.remove('hidden');
  document.getElementById('modalVenName').value = '';
  document.getElementById('modalVenContact').value = '';
  document.getElementById('modalVenGST').value = '';
  document.getElementById('modalVenAddress').value = '';
}

export function saveVendor() {
  const name = document.getElementById('modalVenName').value;
  if (!name) return showToast('Name Required', 'error');
  state.vendors.push({
    id: 'v_' + Date.now(), name,
    contact: document.getElementById('modalVenContact').value,
    gst: document.getElementById('modalVenGST').value.toUpperCase(),
    address: document.getElementById('modalVenAddress').value
  });
  saveAllData();
  document.getElementById('vendorModal').classList.add('hidden');
  populateDropdowns();
  showToast('Vendor Saved');
  renderMasterVendorList();
}

export function addPurchaseRow(count = 1) {
  const tbody = document.getElementById('purTableBody');
  let rmOptions = '<option value="">-- Select Material / Asset --</option>';
  state.rawMaterials.forEach(rm => rmOptions += `<option value="${rm.id}">${rm.name} (${rm.unit}) [${rm.type}]</option>`);
  for (let i = 0; i < count; i++) {
    const tr = document.createElement('tr');
    tr.innerHTML = `<td class="p-1 border text-center text-xs font-bold text-slate-400 row-num"></td><td class="p-1 border"><select class="table-input pur-mat font-bold">${rmOptions}</select></td><td class="p-1 border"><input type="number" class="table-input pur-qty" oninput="calcPurchaseTotal()"></td><td class="p-1 border"><input type="number" class="table-input pur-rate" oninput="calcPurchaseTotal()"></td><td class="p-1 border bg-slate-50"><input type="text" class="table-input pur-amt font-bold text-blue-800 text-right" readonly></td><td class="p-1 border text-center"><button onclick="this.closest('tr').remove(); updatePurRowNums(); calcPurchaseTotal();" class="text-red-400 hover:bg-red-50 p-1 rounded font-bold">✕</button></td>`;
    tbody.appendChild(tr);
  }
  updatePurRowNums();
}

export function updatePurRowNums() {
  document.querySelectorAll('#purTableBody tr').forEach((tr, idx) => tr.querySelector('.row-num').textContent = idx + 1);
}

// ==========================================
// INVENTORY
// ==========================================
export function openRawMaterialModal() {
  document.getElementById('rawMatModal').classList.remove('hidden');
  document.getElementById('modalRawName').value = '';
  document.getElementById('modalRawUnit').value = '';
  document.getElementById('modalRawMinStock').value = '';
}

export function saveRawMaterial() {
  const name = document.getElementById('modalRawName').value;
  const unit = document.getElementById('modalRawUnit').value;
  const type = document.getElementById('modalRawType').value;
  if (!name || !unit) return showToast('Name and Unit required', 'error');
  const conflict = isNameTaken(name);
  if (conflict) return showToast(`Cannot add! ${conflict}`, 'error');
  state.rawMaterials.push({ id: 'rm_' + Date.now(), name: name.trim(), unit: unit.trim(), type, minStock: parseFloat(document.getElementById('modalRawMinStock').value) || 0 });
  saveAllData();
  populateDropdowns();
  refreshPurchaseDropdowns();
  document.getElementById('rawMatModal').classList.add('hidden');
  renderLiveInventory();
  window.renderRawMaterialTable?.();
  showToast('Saved Successfully');
}

import { isNameTaken } from './utils.js';

export function saveItem() {
  const c = document.getElementById('itemMasterClientSelect').value;
  const code = document.getElementById('modalItemCode').value.toUpperCase().trim();
  const desc = document.getElementById('modalItemDesc').value.trim();
  if (c && code && desc) {
    const conflict = isNameTaken(code) || isNameTaken(desc);
    if (conflict) return showToast(`Cannot add! ${conflict}`, 'error');
    if (!state.items[c]) state.items[c] = {};
    if (state.items[c][code]) return showToast('Item Code already exists for this client', 'error');
    state.items[c][code] = { code, description: desc, uom: document.getElementById('modalItemUnit').value, rate: parseFloat(document.getElementById('modalItemRate').value) };
    saveAllData();
    document.getElementById('itemModal').classList.add('hidden');
    window.renderItemMasterTable?.();
    showToast('Execution Item Saved');
  }
}

export function saveInventoryTx() {
  const siteId = document.getElementById('invSiteSelect').value;
  const rmId = document.getElementById('invMaterial').value;
  const qty = parseFloat(document.getElementById('invQty').value) || 0;
  if (!siteId || !rmId || qty <= 0) return showToast('Location, Material, and Quantity required', 'error');
  state.inventoryTx.push({
    id: 'tx_' + Date.now(),
    date: document.getElementById('invDate').value,
    siteId, type: document.getElementById('invType').value,
    rawMaterialId: rmId, qty,
    rate: parseFloat(document.getElementById('invRate').value) || 0,
    ref: 'Manual Adjustment: ' + document.getElementById('invRef').value
  });
  saveAllData();
  document.getElementById('invQty').value = '';
  document.getElementById('invRef').value = '';
  showToast('Manual Stock Adjustment Saved');
  renderLiveInventory();
}

export function renderLiveInventory() {
  const siteId = document.getElementById('invSiteSelect').value;
  const tbody = document.getElementById('liveStockBody');
  tbody.innerHTML = '';
  const ledgerBody = document.getElementById('inventoryLedgerBody');
  ledgerBody.innerHTML = '';
  if (!siteId) { tbody.innerHTML = '<tr><td colspan="6" class="p-4 text-center text-slate-500">Select a location/site to view live inventory.</td></tr>'; return; }
  let stockMap = {};
  state.rawMaterials.forEach(rm => { stockMap[rm.id] = { rm, in: 0, out: 0, consume: 0 }; });
  let siteTx = state.inventoryTx.filter(tx => tx.siteId === siteId);
  siteTx.forEach(tx => {
    if (!stockMap[tx.rawMaterialId]) return;
    if (tx.type === 'IN') stockMap[tx.rawMaterialId].in += tx.qty;
    if (tx.type === 'OUT') stockMap[tx.rawMaterialId].out += tx.qty;
    if (tx.type === 'CONSUME') stockMap[tx.rawMaterialId].consume += tx.qty;
  });
  let locTxIn = state.itemTransfers.filter(t => t.toLocId === siteId);
  let locTxOut = state.itemTransfers.filter(t => t.fromLocId === siteId);
  locTxIn.forEach(t => { if (stockMap[t.assetId]) stockMap[t.assetId].in += t.qty; });
  locTxOut.forEach(t => { if (stockMap[t.assetId]) stockMap[t.assetId].out += t.qty; });
  for (const key in stockMap) {
    const s = stockMap[key];
    const current = s.in - s.out - s.consume;
    const outTotal = s.out + s.consume;
    if (s.in > 0 || outTotal > 0) {
      let status = `<span class="text-xs bg-green-100 text-green-800 px-2 py-1 rounded font-bold">OK</span>`;
      if (current < s.rm.minStock) status = `<span class="text-xs bg-red-100 text-red-800 px-2 py-1 rounded font-bold">LOW STOCK</span>`;
      tbody.innerHTML += `<tr><td class="p-2 border font-bold text-slate-700">${s.rm.name}</td><td class="p-2 border text-center font-medium">${s.rm.unit}</td><td class="p-2 border text-right font-bold text-green-700">${s.in.toFixed(2)}</td><td class="p-2 border text-right font-bold text-red-600">${outTotal.toFixed(2)}</td><td class="p-2 border text-right font-extrabold text-blue-700 text-lg">${current.toFixed(2)}</td><td class="p-2 border text-center">${status}</td></tr>`;
    }
  }
  const allLocs = getAllLocations();
  siteTx.sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, 50).forEach(tx => {
    const rm = state.rawMaterials.find(r => r.id === tx.rawMaterialId);
    const loc = allLocs.find(c => c.id === tx.siteId);
    let badge = '';
    if (tx.type === 'IN') badge = `<span class="text-green-600 font-bold">IN (+)</span>`;
    if (tx.type === 'OUT') badge = `<span class="text-orange-600 font-bold">MANUAL OUT (-)</span>`;
    if (tx.type === 'CONSUME') badge = `<span class="text-red-600 font-bold">AUTO-CONSUME (-)</span>`;
    ledgerBody.innerHTML += `<tr><td class="px-3 py-2 border-b whitespace-nowrap">${tx.date}</td><td class="px-3 py-2 border-b truncate">${loc ? loc.name : '-'}</td><td class="px-3 py-2 border-b">${badge}</td><td class="px-3 py-2 border-b font-bold">${rm ? rm.name : '-'}</td><td class="px-3 py-2 border-b text-right font-bold">${tx.qty.toFixed(2)}</td><td class="px-3 py-2 border-b text-slate-500 text-xs">${tx.ref || (tx.refSheetId ? 'Sheet: ' + tx.refSheetId : '-')}</td></tr>`;
  });
}

// ══════════════════════════════════════════
// INVENTORY — app-icon sections
// ══════════════════════════════════════════
/** Stock-on-hand for a material at a site */
function _materialSOH(matId, siteId) {
  let bal = 0;
  (state.inventoryTx || []).filter(tx => tx.rawMaterialId === matId && (!siteId || tx.siteId === siteId)).forEach(tx => {
    if (tx.type === 'IN') bal += (tx.qty || 0);
    else bal -= (tx.qty || 0); // OUT, CONSUME, ISSUE
  });
  (state.itemTransfers || []).forEach(t => {
    if (t.assetId === matId) {
      if (t.toLocId === siteId) bal += (t.qty || 0);
      if (t.fromLocId === siteId) bal -= (t.qty || 0);
    }
  });
  return bal;
}

function _invSiteOptions(selId) {
  const proj = (state.projects || []).find(p => p.id === state.currentProjectId);
  let opts = '';
  if (proj?.boqs?.length) proj.boqs.forEach(g => { opts += `<option value="${g.id}" ${selId===g.id?'selected':''}>${(g.woNumber?g.woNumber+' — ':'')+(g.name||g.type)}</option>`; });
  getAllLocations().forEach(l => { opts += `<option value="${l.id}" ${selId===l.id?'selected':''}>${l.name}</option>`; });
  return opts || '<option value="main">Main Site</option>';
}
function _invSiteName(id) {
  const proj = (state.projects || []).find(p => p.id === state.currentProjectId);
  const g = proj?.boqs?.find(b => b.id === id);
  if (g) return (g.woNumber?g.woNumber+' — ':'')+(g.name||g.type);
  return getAllLocations().find(l => l.id === id)?.name || id || '';
}
function _matOptions() {
  return (state.rawMaterials || []).map(m => `<option value="${m.id}">${m.name} (${m.unit})</option>`).join('');
}

window._openInvSection = function(section) {
  const grid = document.getElementById('invGrid');
  const back = document.getElementById('invBackBtn');
  document.querySelectorAll('.inv-section').forEach(s => s.classList.add('hide'));
  if (!section) { if (grid) grid.style.display='grid'; if (back) back.style.display='none'; return; }
  if (grid) grid.style.display='none'; if (back) back.style.display='inline-block';
  const map = { stock:'invSecStock', grn:'invSecGrn', gang:'invSecGang', tools:'invSecTools', transfer:'invSecTransfer', audit:'invSecAudit' };
  const el = document.getElementById(map[section]); if (el) el.classList.remove('hide');
  if (section === 'stock') renderLiveInventory();
  else if (section === 'grn') _renderGRN();
  else if (section === 'gang') _renderGangMaterial();
  else if (section === 'tools') _renderTools();
  else if (section === 'transfer') _renderInvTransfer();
  else if (section === 'audit') _renderInvAudit();
};

// ─── 1. Goods Receipt Note (GRN) ───
function _renderGRN() {
  const c = document.getElementById('grnContent'); if (!c) return;
  const supplierOpts = (state.vendors||[]).map(v=>`<option value="${v.id}">${v.name}</option>`).join('');
  const recent = (state.grnRecords||[]).filter(g=>g.projectId===state.currentProjectId).slice(-15).reverse();
  c.innerHTML = `
    <div class="bg-white border rounded-xl p-4 mb-4">
      <h4 class="font-bold text-slate-700 text-sm mb-3">🚚 Goods Receipt Note</h4>
      <div class="grid grid-cols-2 md:grid-cols-4 gap-2 mb-2">
        <select id="grnSite" class="p-2 border rounded-lg text-sm bg-white">${_invSiteOptions()}</select>
        <select id="grnSupplier" class="p-2 border rounded-lg text-sm bg-white"><option value="">-- Supplier --</option>${supplierOpts}</select>
        <input id="grnChallan" placeholder="Challan / DC No" class="p-2 border rounded-lg text-sm outline-none">
        <input id="grnVehicle" placeholder="Vehicle No" class="p-2 border rounded-lg text-sm outline-none">
      </div>
      <div class="grid grid-cols-2 md:grid-cols-4 gap-2 mb-2">
        <select id="grnMat" class="p-2 border rounded-lg text-sm bg-white">${_matOptions()}</select>
        <input id="grnQty" type="number" placeholder="Qty received" class="p-2 border rounded-lg text-sm outline-none">
        <input id="grnRate" type="number" placeholder="Rate ₹ (opt)" class="p-2 border rounded-lg text-sm outline-none">
        <button onclick="_saveGRN()" class="bg-blue-600 text-white rounded-lg font-bold text-sm hover:bg-blue-700">Receive Stock</button>
      </div>
    </div>
    <div class="bg-white border rounded-xl overflow-hidden"><div class="p-3 border-b font-bold text-slate-700 text-sm">Recent GRNs</div>
      <table class="w-full text-xs"><thead class="bg-slate-50"><tr><th class="px-3 py-2 text-left font-bold uppercase text-slate-500">Date</th><th class="px-3 py-2 text-left font-bold uppercase text-slate-500">Challan</th><th class="px-3 py-2 text-left font-bold uppercase text-slate-500">Material</th><th class="px-3 py-2 text-right font-bold uppercase text-slate-500">Qty</th><th class="px-3 py-2 text-left font-bold uppercase text-slate-500">Vehicle</th></tr></thead><tbody>
      ${recent.map(g=>{const m=state.rawMaterials.find(r=>r.id===g.matId);return `<tr style="border-bottom:1px solid #f1f5f9;"><td class="px-3 py-2">${g.date}</td><td class="px-3 py-2 font-mono">${g.challanNo||'—'}</td><td class="px-3 py-2 font-bold">${m?.name||'—'}</td><td class="px-3 py-2 text-right font-bold">${g.qty} ${m?.unit||''}</td><td class="px-3 py-2">${g.vehicleNo||'—'}</td></tr>`;}).join('')||'<tr><td colspan="5" class="p-5 text-center text-slate-400">No GRNs yet.</td></tr>'}
      </tbody></table></div>`;
}
window._saveGRN = function() {
  const siteId=document.getElementById('grnSite').value, matId=document.getElementById('grnMat').value;
  const qty=parseFloat(document.getElementById('grnQty').value)||0;
  const rate=parseFloat(document.getElementById('grnRate').value)||0;
  if(!matId||qty<=0){showToast('Select material and quantity','error');return;}
  const date=new Date().toISOString().split('T')[0];
  const challanNo=document.getElementById('grnChallan').value.trim();
  const supplierId=document.getElementById('grnSupplier').value;
  const vehicleNo=document.getElementById('grnVehicle').value.trim();
  state.grnRecords.push({id:'grn_'+Date.now(),date,siteId,matId,qty,rate,challanNo,supplierId,vehicleNo,projectId:state.currentProjectId});
  state.inventoryTx.push({id:'tx_grn_'+Date.now(),date,siteId,rawMaterialId:matId,type:'IN',qty,rate,ref:`GRN ${challanNo||''}`.trim()});
  saveAllData(); _renderGRN();
  showToast(`Stock received: ${qty} units`,'success');
};

// ─── 2. Gang Material Issue / Return / Wastage ───
function _renderGangMaterial() {
  const c = document.getElementById('gangMatContent'); if (!c) return;
  const gangs=_projectContractors();
  const gangOpts=gangs.map(g=>`<option value="${g.id}">${g.name}</option>`).join('')||'<option value="">No gangs</option>';
  const issues=(state.materialIssues||[]).filter(i=>i.projectId===state.currentProjectId).slice(-15).reverse();
  c.innerHTML=`
    <div class="bg-white border rounded-xl p-4 mb-4">
      <h4 class="font-bold text-slate-700 text-sm mb-3">🧱 Issue / Return Material to Gang</h4>
      <div class="grid grid-cols-2 md:grid-cols-5 gap-2">
        <select id="gmGang" class="p-2 border rounded-lg text-sm bg-white">${gangOpts}</select>
        <select id="gmMat" class="p-2 border rounded-lg text-sm bg-white">${_matOptions()}</select>
        <select id="gmType" class="p-2 border rounded-lg text-sm bg-white"><option value="ISSUE">Issue (−stock)</option><option value="RETURN">Return (+stock)</option></select>
        <input id="gmQty" type="number" placeholder="Qty" class="p-2 border rounded-lg text-sm outline-none">
        <button onclick="_saveGangMat()" class="bg-amber-500 text-white rounded-lg font-bold text-sm hover:bg-amber-600">Save</button>
      </div>
      <input id="gmPurpose" placeholder="Purpose (e.g. blockwork 2nd floor)" class="w-full mt-2 p-2 border rounded-lg text-sm outline-none">
    </div>
    <div class="bg-white border rounded-xl p-4 mb-4">
      <h4 class="font-bold text-slate-700 text-sm mb-2">📉 Wastage Check</h4>
      <p class="text-[11px] text-slate-400 mb-2">Compares material issued to a gang vs. approved work done. Flags excess wastage for deduction.</p>
      <div class="flex gap-2 flex-wrap">
        <select id="gmwGang" class="p-2 border rounded-lg text-sm bg-white">${gangOpts}</select>
        <button onclick="_calcWastage()" class="bg-rose-500 text-white px-4 rounded-lg font-bold text-sm hover:bg-rose-600">Calculate Wastage</button>
      </div>
      <div id="wastageResult" class="mt-3"></div>
    </div>
    <div class="bg-white border rounded-xl overflow-hidden"><div class="p-3 border-b font-bold text-slate-700 text-sm">Recent Issues / Returns</div>
      <table class="w-full text-xs"><thead class="bg-slate-50"><tr><th class="px-3 py-2 text-left font-bold uppercase text-slate-500">Date</th><th class="px-3 py-2 text-left font-bold uppercase text-slate-500">Gang</th><th class="px-3 py-2 text-left font-bold uppercase text-slate-500">Material</th><th class="px-3 py-2 text-center font-bold uppercase text-slate-500">Type</th><th class="px-3 py-2 text-right font-bold uppercase text-slate-500">Qty</th></tr></thead><tbody>
      ${issues.map(i=>{const m=state.rawMaterials.find(r=>r.id===i.matId);const g=(state.labourContractors||[]).find(x=>x.id===i.gangId);return `<tr style="border-bottom:1px solid #f1f5f9;"><td class="px-3 py-2">${i.date}</td><td class="px-3 py-2 font-bold">${g?.name||'—'}</td><td class="px-3 py-2">${m?.name||'—'}</td><td class="px-3 py-2 text-center"><span style="font-size:10px;font-weight:700;color:${i.type==='ISSUE'?'#ea580c':'#059669'};">${i.type}</span></td><td class="px-3 py-2 text-right font-bold">${i.qty} ${m?.unit||''}</td></tr>`;}).join('')||'<tr><td colspan="5" class="p-5 text-center text-slate-400">No records.</td></tr>'}
      </tbody></table></div>`;
}
window._saveGangMat=function(){
  const gangId=document.getElementById('gmGang').value, matId=document.getElementById('gmMat').value;
  const type=document.getElementById('gmType').value, qty=parseFloat(document.getElementById('gmQty').value)||0;
  const purpose=document.getElementById('gmPurpose').value.trim();
  if(!gangId){showToast('Select gang','error');return;}
  if(!matId||qty<=0){showToast('Select material and qty','error');return;}
  const date=new Date().toISOString().split('T')[0];
  state.materialIssues.push({id:'mi_'+Date.now(),date,gangId,matId,type,qty,purpose,projectId:state.currentProjectId});
  // Stock movement
  state.inventoryTx.push({id:'tx_mi_'+Date.now(),date,siteId:'',rawMaterialId:matId,type:type==='ISSUE'?'OUT':'IN',qty,ref:`Gang ${type}`});
  saveAllData(); _renderGangMaterial();
  showToast(`Material ${type.toLowerCase()}d`,'success');
};
window._calcWastage=function(){
  const gangId=document.getElementById('gmwGang').value;
  const box=document.getElementById('wastageResult');
  if(!gangId){showToast('Select gang','error');return;}
  const cur=getCurrencySymbol();
  // Net issued per material
  const issued={};
  (state.materialIssues||[]).filter(i=>i.gangId===gangId).forEach(i=>{issued[i.matId]=(issued[i.matId]||0)+(i.type==='ISSUE'?i.qty:-i.qty);});
  // Theoretical from approved measurements × recipe (if any). Simple: show issued + a wastage % threshold note.
  const rows=Object.entries(issued).filter(([,q])=>q>0).map(([matId,q])=>{
    const m=state.rawMaterials.find(r=>r.id===matId);
    return `<tr style="border-bottom:1px solid #f1f5f9;"><td class="px-3 py-2 font-bold">${m?.name||'—'}</td><td class="px-3 py-2 text-right">${q.toFixed(1)} ${m?.unit||''}</td></tr>`;
  }).join('');
  // Approved work value for context
  const approvedVal=(state.workMeasurements||[]).filter(mm=>mm.gangId===gangId&&mm.approved).reduce((s,mm)=>{const r=(state.workItemRates||[]).find(x=>x.id===mm.rateId);return s+((r?.rate||0)*mm.quantity);},0);
  box.innerHTML=`<div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:12px;">
    <p style="font-size:12px;font-weight:700;color:#475569;margin-bottom:8px;">Net Material Consumed by Gang</p>
    <table class="w-full text-xs"><tbody>${rows||'<tr><td class="p-2 text-slate-400">No material issued.</td></tr>'}</tbody></table>
    <p style="font-size:11px;color:#64748b;margin-top:8px;">Approved work value: <strong>${cur}${approvedVal.toLocaleString('en-IN')}</strong>. Review consumed material against this — issue a Deduction (Labour module) if wastage exceeds your EPC norm (e.g. >5%).</p>
  </div>`;
};

// ─── 3. Returnable Tools ───
function _renderTools() {
  const c=document.getElementById('toolsContent'); if(!c) return;
  const labOpts=_projectLabour().map(l=>`<option value="${l.id}">${l.name}</option>`).join('')||'<option value="">No workers</option>';
  const outstanding=(state.toolIssues||[]).filter(t=>t.projectId===state.currentProjectId&&!t.returned);
  const all=(state.toolIssues||[]).filter(t=>t.projectId===state.currentProjectId).slice(-15).reverse();
  c.innerHTML=`
    <div class="bg-white border rounded-xl p-4 mb-4">
      <h4 class="font-bold text-slate-700 text-sm mb-3">🔧 Issue Tool / Scaffolding to Worker</h4>
      <div class="grid grid-cols-2 md:grid-cols-4 gap-2">
        <select id="tiLabour" class="p-2 border rounded-lg text-sm bg-white">${labOpts}</select>
        <input id="tiTool" placeholder="Tool (e.g. Drill, 50 scaffold tubes)" class="p-2 border rounded-lg text-sm outline-none">
        <input id="tiValue" type="number" placeholder="Value ₹ (for penalty)" class="p-2 border rounded-lg text-sm outline-none">
        <button onclick="_saveToolIssue()" class="bg-violet-600 text-white rounded-lg font-bold text-sm hover:bg-violet-700">Issue Tool</button>
      </div>
    </div>
    <div class="bg-white border rounded-xl overflow-hidden">
      <div class="p-3 border-b font-bold text-slate-700 text-sm">${outstanding.length} tools currently held</div>
      <table class="w-full text-xs"><thead class="bg-slate-50"><tr><th class="px-3 py-2 text-left font-bold uppercase text-slate-500">Date</th><th class="px-3 py-2 text-left font-bold uppercase text-slate-500">Worker</th><th class="px-3 py-2 text-left font-bold uppercase text-slate-500">Tool</th><th class="px-3 py-2 text-right font-bold uppercase text-slate-500">Value</th><th class="px-3 py-2 text-center font-bold uppercase text-slate-500">Status</th></tr></thead><tbody>
      ${all.map(t=>{const l=(state.labourMaster||[]).find(x=>x.id===t.labourId);return `<tr style="border-bottom:1px solid #f1f5f9;"><td class="px-3 py-2">${t.date}</td><td class="px-3 py-2 font-bold">${l?.name||'—'}</td><td class="px-3 py-2">${t.tool}</td><td class="px-3 py-2 text-right">${getCurrencySymbol()}${(t.value||0).toLocaleString('en-IN')}</td><td class="px-3 py-2 text-center">${t.returned?`<span style="font-size:10px;color:#059669;font-weight:700;">✓ Returned</span>`:`<button onclick="_returnTool('${t.id}')" style="font-size:10px;background:#eff6ff;color:#2563eb;border:1px solid #bfdbfe;border-radius:5px;padding:2px 8px;font-weight:700;cursor:pointer;">Return</button>`}</td></tr>`;}).join('')||'<tr><td colspan="5" class="p-5 text-center text-slate-400">No tools issued.</td></tr>'}
      </tbody></table></div>`;
}
window._saveToolIssue=function(){
  const labourId=document.getElementById('tiLabour').value, tool=document.getElementById('tiTool').value.trim();
  const value=parseFloat(document.getElementById('tiValue').value)||0;
  if(!labourId||!tool){showToast('Select worker and tool','error');return;}
  state.toolIssues.push({id:'tool_'+Date.now(),date:new Date().toISOString().split('T')[0],labourId,tool,value,returned:false,projectId:state.currentProjectId});
  saveAllData(); _renderTools();
  showToast('Tool issued — tracked to worker','success');
};
window._returnTool=function(id){
  const t=(state.toolIssues||[]).find(x=>x.id===id); if(!t) return;
  const dmg=confirm('Returned in good condition? OK = good, Cancel = damaged/penalty');
  if(!dmg){const pen=parseFloat(prompt('Penalty amount to deduct from wages (₹):','0'))||0;
    if(pen>0){state.labourDeductions.push({id:'ded_'+Date.now(),labourId:t.labourId,deductionType:'Damaged Tool',amount:pen,date:new Date().toISOString().split('T')[0],note:t.tool,settled:false});showToast(`Penalty ${getCurrencySymbol()}${pen} added to worker deductions`,'warning');}}
  t.returned=true; t.returnedDate=new Date().toISOString().split('T')[0];
  saveAllData(); _renderTools();
  showToast('Tool returned','success');
};

// ─── 4. Inter-Site Transfer ───
function _renderInvTransfer() {
  const c=document.getElementById('invTransferContent'); if(!c) return;
  const transfers=(state.itemTransfers||[]).slice(-15).reverse();
  c.innerHTML=`
    <div class="bg-white border rounded-xl p-4 mb-4">
      <h4 class="font-bold text-slate-700 text-sm mb-3">🔄 Inter-Site Material Transfer</h4>
      <div class="grid grid-cols-2 md:grid-cols-3 gap-2 mb-2">
        <select id="itFrom" class="p-2 border rounded-lg text-sm bg-white">${_invSiteOptions()}</select>
        <select id="itTo" class="p-2 border rounded-lg text-sm bg-white">${_invSiteOptions()}</select>
        <input id="itVehicle" placeholder="Vehicle No" class="p-2 border rounded-lg text-sm outline-none">
      </div>
      <div class="grid grid-cols-2 md:grid-cols-3 gap-2">
        <select id="itMat" class="p-2 border rounded-lg text-sm bg-white">${_matOptions()}</select>
        <input id="itQty" type="number" placeholder="Qty to dispatch" class="p-2 border rounded-lg text-sm outline-none">
        <button onclick="_initTransfer()" class="bg-cyan-600 text-white rounded-lg font-bold text-sm hover:bg-cyan-700">Dispatch (In-Transit)</button>
      </div>
    </div>
    <div class="bg-white border rounded-xl overflow-hidden"><div class="p-3 border-b font-bold text-slate-700 text-sm">Transfers</div>
      <table class="w-full text-xs"><thead class="bg-slate-50"><tr><th class="px-3 py-2 text-left font-bold uppercase text-slate-500">Date</th><th class="px-3 py-2 text-left font-bold uppercase text-slate-500">Material</th><th class="px-3 py-2 text-left font-bold uppercase text-slate-500">From → To</th><th class="px-3 py-2 text-right font-bold uppercase text-slate-500">Qty</th><th class="px-3 py-2 text-center font-bold uppercase text-slate-500">Status</th></tr></thead><tbody>
      ${transfers.map(t=>{const m=state.rawMaterials.find(r=>r.id===t.assetId);return `<tr style="border-bottom:1px solid #f1f5f9;"><td class="px-3 py-2">${t.date}</td><td class="px-3 py-2 font-bold">${m?.name||'—'}</td><td class="px-3 py-2">${_invSiteName(t.fromLocId)} → ${_invSiteName(t.toLocId)}</td><td class="px-3 py-2 text-right font-bold">${t.qty}${t.receivedQty!=null&&t.receivedQty!==t.qty?` (rcv ${t.receivedQty})`:''}</td><td class="px-3 py-2 text-center">${t.status==='IN_TRANSIT'?`<button onclick="_receiveTransfer('${t.id}')" style="font-size:10px;background:#fffbeb;color:#d97706;border:1px solid #fde68a;border-radius:5px;padding:2px 8px;font-weight:700;cursor:pointer;">Receive</button>`:`<span style="font-size:10px;color:#059669;font-weight:700;">✓ Received</span>`}</td></tr>`;}).join('')||'<tr><td colspan="5" class="p-5 text-center text-slate-400">No transfers.</td></tr>'}
      </tbody></table></div>`;
}
window._initTransfer=function(){
  const fromLocId=document.getElementById('itFrom').value, toLocId=document.getElementById('itTo').value;
  const assetId=document.getElementById('itMat').value, qty=parseFloat(document.getElementById('itQty').value)||0;
  const vehicleNo=document.getElementById('itVehicle').value.trim();
  if(fromLocId===toLocId){showToast('Source and destination must differ','error');return;}
  if(!assetId||qty<=0){showToast('Select material and qty','error');return;}
  state.itemTransfers.push({id:'itf_'+Date.now(),date:new Date().toISOString().split('T')[0],fromLocId,toLocId,assetId,qty,vehicleNo,status:'IN_TRANSIT',receivedQty:null});
  state.inventoryTx.push({id:'tx_itf_'+Date.now(),date:new Date().toISOString().split('T')[0],siteId:fromLocId,rawMaterialId:assetId,type:'OUT',qty,ref:'Transfer out'});
  saveAllData(); _renderInvTransfer();
  showToast('Dispatched — In Transit','success');
};
window._receiveTransfer=function(id){
  const t=(state.itemTransfers||[]).find(x=>x.id===id); if(!t) return;
  const rcv=parseFloat(prompt(`Dispatched: ${t.qty}. Enter quantity received:`,t.qty));
  if(isNaN(rcv)) return;
  t.receivedQty=rcv; t.status='RECEIVED';
  state.inventoryTx.push({id:'tx_itr_'+Date.now(),date:new Date().toISOString().split('T')[0],siteId:t.toLocId,rawMaterialId:t.assetId,type:'IN',qty:rcv,ref:'Transfer in'});
  saveAllData(); _renderInvTransfer();
  if(rcv!==t.qty) showToast(`⚠ Variance: ${t.qty-rcv} units short!`,'error');
  else showToast('Transfer received','success');
};

// ─── 5. Physical Audit ───
function _renderInvAudit() {
  const c=document.getElementById('invAuditContent'); if(!c) return;
  const audits=(state.stockAudits||[]).filter(a=>a.projectId===state.currentProjectId).slice(-15).reverse();
  c.innerHTML=`
    <div class="bg-white border rounded-xl p-4 mb-4">
      <h4 class="font-bold text-slate-700 text-sm mb-3">📋 Physical Stock Audit</h4>
      <div class="grid grid-cols-2 md:grid-cols-4 gap-2">
        <select id="auSite" class="p-2 border rounded-lg text-sm bg-white">${_invSiteOptions()}</select>
        <select id="auMat" class="p-2 border rounded-lg text-sm bg-white" onchange="_auShowBook()">${_matOptions()}</select>
        <input id="auActual" type="number" placeholder="Physical count" class="p-2 border rounded-lg text-sm outline-none">
        <button onclick="_saveAudit()" class="bg-red-600 text-white rounded-lg font-bold text-sm hover:bg-red-700">Reconcile</button>
      </div>
      <p id="auBook" class="text-xs text-slate-500 mt-2"></p>
    </div>
    <div class="bg-white border rounded-xl overflow-hidden"><div class="p-3 border-b font-bold text-slate-700 text-sm">Audit History</div>
      <table class="w-full text-xs"><thead class="bg-slate-50"><tr><th class="px-3 py-2 text-left font-bold uppercase text-slate-500">Date</th><th class="px-3 py-2 text-left font-bold uppercase text-slate-500">Material</th><th class="px-3 py-2 text-right font-bold uppercase text-slate-500">Book</th><th class="px-3 py-2 text-right font-bold uppercase text-slate-500">Physical</th><th class="px-3 py-2 text-right font-bold uppercase text-slate-500">Variance</th></tr></thead><tbody>
      ${audits.map(a=>{const m=state.rawMaterials.find(r=>r.id===a.matId);return `<tr style="border-bottom:1px solid #f1f5f9;"><td class="px-3 py-2">${a.date}</td><td class="px-3 py-2 font-bold">${m?.name||'—'}</td><td class="px-3 py-2 text-right">${a.book.toFixed(1)}</td><td class="px-3 py-2 text-right">${a.actual.toFixed(1)}</td><td class="px-3 py-2 text-right font-bold" style="color:${Math.abs(a.variance)>0?(a.variance<0?'#dc2626':'#059669'):'#64748b'};">${a.variance>0?'+':''}${a.variance.toFixed(1)}</td></tr>`;}).join('')||'<tr><td colspan="5" class="p-5 text-center text-slate-400">No audits yet.</td></tr>'}
      </tbody></table></div>`;
}
window._auShowBook=function(){
  const siteId=document.getElementById('auSite').value, matId=document.getElementById('auMat').value;
  const book=_materialSOH(matId,siteId);
  const m=state.rawMaterials.find(r=>r.id===matId);
  document.getElementById('auBook').textContent=`Book stock: ${book.toFixed(1)} ${m?.unit||''}`;
};
window._saveAudit=function(){
  const siteId=document.getElementById('auSite').value, matId=document.getElementById('auMat').value;
  const actual=parseFloat(document.getElementById('auActual').value);
  if(isNaN(actual)){showToast('Enter physical count','error');return;}
  const book=_materialSOH(matId,siteId);
  const variance=actual-book;
  const date=new Date().toISOString().split('T')[0];
  state.stockAudits.push({id:'aud_'+Date.now(),date,siteId,matId,book,actual,variance,projectId:state.currentProjectId});
  // Adjust stock to physical reality
  state.inventoryTx.push({id:'tx_aud_'+Date.now(),date,siteId,rawMaterialId:matId,type:variance>=0?'IN':'OUT',qty:Math.abs(variance),ref:'Audit adjustment'});
  saveAllData(); _renderInvAudit();
  if(variance<-2) showToast(`⚠ ${Math.abs(variance).toFixed(0)} units missing — possible theft! Flagged.`,'error');
  else showToast('Stock reconciled to physical count','success');
};

// ==========================================
// RECIPES
// ==========================================
// ═══════════════════════════════════════════════════
//  RECIPE VIEW — Project-aware, linked to BOQ items
// ═══════════════════════════════════════════════════

/** Recipe storage key — client id if exists, else project id */
// Recipe module moved to ./recipe.js


// ==========================================
// MEASUREMENTS
// ==========================================
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
  switchView('entrySheet');
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
    switchView('measurementListView');
    return;
  }

  const choice = confirm('You have unsaved data in this sheet.\n\nClick OK to Save & Close, or Cancel to discard and close.');
  if (choice) {
    saveEntries();
    showToast('Sheet saved', 'success');
  }
  switchView('measurementListView');
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
  const entries = [];
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
      r.querySelectorAll('.custom-col-input, .custom-dim-input').forEach(inp => {
        customData[inp.dataset.colId] = inp.value || '';
      });
      if (Object.keys(customData).length) entry.customData = customData;
      entries.push(entry);
    }
  });
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
  switchView('entrySheet');
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

// ==========================================
// PDF EXPORTS
// ==========================================

/** Preferred PDF orientation for measurement/abstract docs (default portrait) */
// Measurement-sheet exporters (+ _measOrientation/_pageCenterX) moved to ./measurementExports.js

export function convertSheetToEstimate() {
  if (!state.currentSheetId) return showToast('Save the sheet first to convert!', 'error');
  const s = state.sheets.find(x => x.id === state.currentSheetId);
  const cItems = state.items[s.clientId] || {};
  const grouped = {};
  s.entries.forEach(e => {
    const key = e.code || e.description;
    if (key && e.qty > 0) {
      if (grouped[key]) grouped[key].qty += e.qty;
      else grouped[key] = { desc: e.description, qty: e.qty, unit: e.uom, rate: cItems[e.code] ? parseFloat(cItems[e.code].rate) : 0 };
    }
  });
  window.createNewEstimate();
  document.getElementById('estClient').value = s.clientId;
  const tbody = document.getElementById('estTableBody');
  tbody.innerHTML = '';
  let iCount = 1;
  for (let k in grouped) {
    const i = grouped[k];
    const tr = document.createElement('tr');
    tr.innerHTML = `<td class="p-2 border text-center text-xs font-bold text-slate-400">${iCount++}</td><td class="p-2 border"><input type="text" class="table-input desc-input" value="${i.desc}" oninput="handleDescInput(this)"><div class="autocomplete-list hide"></div></td><td class="p-2 border"><input type="number" class="table-input est-qty font-bold" value="${i.qty}" oninput="calcEstimateRow(this)"></td><td class="p-2 border"><input type="text" class="table-input est-unit" value="${i.unit || ''}"></td><td class="p-2 border"><input type="number" class="table-input est-rate" value="${i.rate}" oninput="calcEstimateRow(this)"></td><td class="p-2 border"><input type="text" class="table-input est-amount font-bold text-emerald-700" value="${(i.qty * i.rate).toFixed(2)}" readonly></td><td class="p-2 border text-center"><button onclick="this.closest('tr').remove(); calcEstimateTotal();" class="text-red-400 hover:bg-red-50 p-1 rounded font-bold">✕</button></td>`;
    tbody.appendChild(tr);
  }
  calcEstimateTotal();
  switchView('estimatesView');
  showToast('Estimate drafted from Measurement Sheet!', 'success');
}

export function directInvoiceFromSheet() {
  if (!state.currentSheetId) return showToast('Save the sheet first!', 'error');
  const s = state.sheets.find(x => x.id === state.currentSheetId);
  if (s.isBilled) return showToast('This sheet is already linked to an Abstract/Invoice!', 'error');
  if (!confirm("This will auto-generate the Abstract and take you directly to the Billing screen. Proceed?")) return;
  const cId = s.clientId;
  const cItems = state.items[cId] || {};
  const grouped = {};
  s.entries.forEach(e => {
    const key = e.code || e.description;
    if (key && e.qty > 0) {
      if (grouped[key]) grouped[key].qty += e.qty;
      else grouped[key] = { code: e.code, desc: e.description, uom: e.uom, qty: e.qty, rate: cItems[e.code] ? parseFloat(cItems[e.code].rate) : 0, ref: s.sheetNum };
    }
  });
  let totalAmt = 0; let totalQty = 0; const finalItems = [];
  for (const k in grouped) { const d = grouped[k]; const amt = d.qty * d.rate; totalAmt += amt; totalQty += d.qty; finalItems.push({ ...d, amount: amt }); }
  const absData = { id: 'A_' + Date.now(), abstractNum: `ABS-${Date.now().toString().slice(-4)}`, clientId: cId, sheetId: s.id, sheetNum: s.sheetNum, date: document.getElementById('sheetDate').value, area: s.area || 'N/A', totalAmount: totalAmt, items: finalItems, isInvoiced: false, linkedInvoice: null };
  state.abstracts.push(absData);
  s.isBilled = true; s.linkedAbstract = absData.abstractNum;
  saveAllData();
  switchView('billingView');
  document.getElementById('billingClientSelect').value = s.clientId;
  loadPendingAbstractsForBilling();
  setTimeout(() => {
    const cb = document.querySelector(`.billing-checkbox[value="${absData.id}"]`);
    if (cb) { cb.checked = true; calculateLiveBill(); }
    showToast('Abstract auto-generated. Ready to apply GST and Generate Final Invoice!', 'success');
  }, 300);
}

// ==========================================
// ABSTRACTS
// ==========================================
export function generateAbstractFromSheet() {
  const sId = state.currentSheetId;
  if (!sId) return showToast('Please save first', 'error');
  const sheet = state.sheets.find(s => s.id === sId);
  if (sheet.isBilled) return showToast('Abstract already generated', 'error');
  const cId = sheet.clientId;
  const proj = state.projects.find(p => p.id === sheet.projectId);
  const boqItems = proj?.boqItems || [];
  const cItems = state.items[cId] || {};
  const grouped = {};
  sheet.entries.forEach(e => {
    const key = e.code || e.description;
    if (key && e.qty > 0) {
      let rate = 0;
      const boqItem = _lookupBoqItem(proj, e.boqIndex);
      if (boqItem) {
        rate = parseFloat(boqItem.rate) || 0;
      } else if (cItems[e.code]) {
        rate = parseFloat(cItems[e.code].rate) || 0;
      }
      if (grouped[key]) grouped[key].qty += e.qty;
      else grouped[key] = { code: e.code, desc: e.description, uom: e.uom, qty: e.qty, rate, ref: sheet.sheetNum, boqIndex: e.boqIndex };
    }
  });
  if (!Object.keys(grouped).length) return showToast('No billable items found. Add item codes/quantities first.', 'error');
  const client = state.clients.find(c => c.id === cId);
  const clientName = client?.name || proj?.clientName || proj?.name || 'Client';
  document.getElementById('absModalClient').textContent = clientName;
  document.getElementById('absModalRef').textContent = sheet.sheetNum;
  const tbody = document.getElementById('absModalBody');
  tbody.innerHTML = '';
  let totalAmt = 0; let totalQty = 0; const finalItems = [];
  for (const k in grouped) {
    const d = grouped[k]; const amt = d.qty * d.rate; totalAmt += amt; totalQty += d.qty;
    finalItems.push({ ...d, amount: amt });
    tbody.innerHTML += `<tr><td class="p-2 border font-mono">${d.code || '-'}</td><td class="p-2 border">${d.desc}</td><td class="p-2 border text-slate-400 text-xs">${d.ref}</td><td class="p-2 border text-right">${d.qty.toFixed(3)} ${d.uom}</td><td class="p-2 border text-right">${getCurrencySymbol()}${d.rate.toFixed(2)}</td><td class="p-2 border text-right font-bold">${getCurrencySymbol()}${amt.toFixed(2)}</td></tr>`;
  }
  document.getElementById('absModalTotal').textContent = getCurrencySymbol() + totalAmt.toLocaleString('en-IN', { minimumFractionDigits: 2 });
  state.pendingAbstractData = { id: 'A_' + Date.now(), abstractNum: `ABS-${Date.now().toString().slice(-4)}`, clientId: cId, projectId: sheet.projectId, sheetId: sId, sheetNum: sheet.sheetNum, date: document.getElementById('sheetDate').value, area: sheet.area || 'N/A', totalAmount: totalAmt, items: finalItems, isInvoiced: false, linkedInvoice: null };
  document.getElementById('abstractModal').classList.remove('hidden');
}

export function confirmAndSaveAbstract() {
  if (!state.pendingAbstractData) return;
  state.abstracts.push(state.pendingAbstractData);
  const sheetIdx = state.sheets.findIndex(s => s.id === state.pendingAbstractData.sheetId);
  if (sheetIdx > -1) { state.sheets[sheetIdx].isBilled = true; state.sheets[sheetIdx].linkedAbstract = state.pendingAbstractData.abstractNum; }
  saveAllData();
  document.getElementById('abstractModal').classList.add('hidden');
  showToast('Abstract Created');
  document.getElementById('btnGenerateAbstract').classList.add('hide');
  document.getElementById('sheetStatusText').textContent = `Billed -> Abstract: ${state.pendingAbstractData.abstractNum}`;
  state.pendingAbstractData = null;
  setTimeout(() => { if (confirm("Start new sheet?")) createNewSheet(); }, 300);
}

export function renderAbstractsList() {
  const container = document.getElementById('abstractsCardsContainer');
  const emptyState = document.getElementById('abstractsEmptyState');
  container.innerHTML = '';
  // Project-context module → only this project's abstracts
  let filtered = (state.abstracts || []).filter(a => !state.currentProjectId || a.projectId === state.currentProjectId || (state.clients.find(c => c.id === a.clientId)?.projectId === state.currentProjectId));
  if (!filtered.length) { if (emptyState) emptyState.classList.remove('hidden'); return; }
  if (emptyState) emptyState.classList.add('hidden');
  filtered.sort((a, b) => new Date(b.date) - new Date(a.date)).forEach(a => {
    const client = state.clients.find(c => c.id === a.clientId);
    const statusBadge = a.isInvoiced
      ? `<span class="inline-flex items-center gap-1.5 bg-green-50 text-green-700 text-xs px-3 py-1 rounded-full font-bold border border-green-200">&#10003; Invoiced: ${a.linkedInvoice}</span>`
      : `<span class="inline-flex items-center gap-1.5 bg-amber-50 text-amber-700 text-xs px-3 py-1 rounded-full font-bold border border-amber-200">&#9679; Pending Invoice</span>`;
    container.innerHTML += `
      <div class="bg-white rounded-xl border border-slate-200 shadow-sm hover:shadow-md transition p-4">
        <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <!-- Left: Info -->
          <div class="flex items-start gap-4 flex-1 min-w-0">
            <div class="flex-shrink-0 w-10 h-10 rounded-lg bg-blue-50 border border-blue-200 flex items-center justify-center">
              <span class="text-blue-700 font-extrabold text-sm">#</span>
            </div>
            <div class="flex-1 min-w-0">
              <div class="flex items-center gap-3 flex-wrap mb-1">
                <span class="font-extrabold text-blue-800 text-base">${a.abstractNum}</span>
                ${statusBadge}
              </div>
              <div class="flex items-center gap-2 text-sm text-slate-500 flex-wrap">
                <span class="font-semibold text-slate-700">${client ? client.name : 'Unknown'}</span>
                <span class="text-slate-300">|</span>
                <span>Sheet: <span class="font-mono font-semibold text-slate-600">${a.sheetNum}</span></span>
                <span class="text-slate-300">|</span>
                <span>${a.area || '—'}</span>
                <span class="text-slate-300">|</span>
                <span>${a.date || '—'}</span>
              </div>
            </div>
          </div>
          <!-- Right: Amount + Actions -->
          <div class="flex items-center gap-4 flex-shrink-0">
            <div class="text-right">
              <p class="text-[10px] uppercase font-bold text-slate-400 tracking-wide">Amount</p>
              <p class="text-lg font-extrabold text-slate-800 whitespace-nowrap">${getCurrencySymbol()}${a.totalAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</p>
            </div>
            <div class="flex items-center gap-2 pl-4 border-l border-slate-200">
              <button onclick="_showAbsDropdown(this,'absDD_${a.id}',document.getElementById('absTpl_${a.id}').innerHTML)" class="px-3 py-2 bg-blue-600 text-white rounded-lg text-xs font-bold hover:bg-blue-500 inline-flex items-center gap-1.5 shadow-sm">
                Export <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M19 9l-7 7-7-7"/></svg>
              </button>
              <template id="absTpl_${a.id}">
                <button onclick="exportAbstractPDF('${a.id}');this.parentElement.remove()" class="w-full text-left px-3 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 flex items-center gap-2.5"><span class="w-2 h-2 rounded-full bg-slate-500 inline-block flex-shrink-0"></span> Simple PDF</button>
                <button onclick="exportDetailedAbstractPDF('${a.id}');this.parentElement.remove()" class="w-full text-left px-3 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 flex items-center gap-2.5"><span class="w-2 h-2 rounded-full bg-indigo-500 inline-block flex-shrink-0"></span> Detailed PDF</button>
                <button onclick="exportDetailedAbstractExcel('${a.id}');this.parentElement.remove()" class="w-full text-left px-3 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 flex items-center gap-2.5"><span class="w-2 h-2 rounded-full bg-green-500 inline-block flex-shrink-0"></span> Abstract Excel</button>
                <div class="border-t border-slate-100 my-1"></div>
                <button onclick="exportRABillExcel('${a.id}');this.parentElement.remove()" class="w-full text-left px-3 py-2.5 text-sm font-bold text-amber-700 hover:bg-amber-50 flex items-center gap-2.5"><span class="w-2 h-2 rounded-full bg-amber-500 inline-block flex-shrink-0"></span> RA Bill Excel</button>
              </template>
              <button onclick="deleteAbstract('${a.id}')" class="p-2 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition" title="Delete Abstract">
                <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
              </button>
            </div>
          </div>
        </div>
      </div>`;
  });
}

// Abstract / RA-bill exporters moved to ./abstractExports.js


export function deleteAbstract(id) {
  const abs = state.abstracts.find(a => a.id === id);
  if (!abs) return;
  if (abs.isInvoiced) return showToast('Cannot delete! This abstract is locked inside an Invoice.', 'error');
  if (confirm(`Are you sure you want to delete Abstract ${abs.abstractNum}?`)) {
    const sheetIdx = state.sheets.findIndex(s => s.id === abs.sheetId);
    if (sheetIdx > -1) { state.sheets[sheetIdx].isBilled = false; state.sheets[sheetIdx].linkedAbstract = null; }
    state.abstracts = state.abstracts.filter(a => a.id !== id);
    saveAllData(); renderAbstractsList(); renderSavedSheets();
    showToast('Abstract deleted & Measurement Sheet restored', 'success');
  }
}

// ==========================================
// BILLING & INVOICES
// ==========================================
export function loadPendingAbstractsForBilling() {
  const cId = document.getElementById('billingClientSelect').value;
  const cont = document.getElementById('billingAbstractsContainer');
  const list = document.getElementById('billingCheckboxesList');
  if (!cId) { cont.classList.add('hide'); return; }
  cont.classList.remove('hide');
  list.innerHTML = '';
  const pending = state.abstracts.filter(a => a.clientId === cId && !a.isInvoiced);
  pending.forEach(a => {
    list.innerHTML += `<label class="flex items-center gap-3 p-3 border-b hover:bg-slate-100 cursor-pointer"><input type="checkbox" class="billing-checkbox w-5 h-5 accent-blue-600" value="${a.id}" onchange="calculateLiveBill()"><div><p class="font-bold text-slate-800">${a.abstractNum} - Area: ${a.area}</p><p class="text-sm font-extrabold text-blue-700">${getCurrencySymbol()}${a.totalAmount.toLocaleString('en-IN')}</p></div></label>`;
  });
  calculateLiveBill();
}

export function toggleGstInputs() {
  const type = document.querySelector('input[name="gstType"]:checked').value;
  if (type === 'intra') {
    document.getElementById('billCgst').parentElement.classList.remove('hide');
    document.getElementById('billSgst').parentElement.classList.remove('hide');
    document.getElementById('igstWrapper').classList.add('hide');
  } else {
    document.getElementById('billCgst').parentElement.classList.add('hide');
    document.getElementById('billSgst').parentElement.classList.add('hide');
    document.getElementById('igstWrapper').classList.remove('hide');
  }
  calculateLiveBill();
}

export function generateFinalInvoice() {
  const cId = document.getElementById('billingClientSelect').value;
  const checkedBoxes = Array.from(document.querySelectorAll('.billing-checkbox:checked')).map(cb => cb.value);
  if (checkedBoxes.length === 0) return showToast('Select abstract to bill', 'error');
  const math = calculateLiveBill();
  const invNum = `INV-${Date.now().toString().slice(-4)}`;
  const invData = { id: 'INV_' + Date.now(), invoiceNum: invNum, status: 'Final', clientId: cId, date: new Date().toISOString().split('T')[0], abstractIds: checkedBoxes, subtotal: math.subtotal, gstType: math.type, taxAmount: math.tax, totalAmount: math.total };
  state.invoices.push(invData);
  checkedBoxes.forEach(id => {
    const idx = state.abstracts.findIndex(a => a.id === id);
    if (idx > -1) { state.abstracts[idx].isInvoiced = true; state.abstracts[idx].linkedInvoice = invNum; }
  });
  saveAllData(); showToast('Invoice Generated!');
  loadPendingAbstractsForBilling(); renderInvoiceHistory();
}

export function renderInvoiceHistory() {
  const container = document.getElementById('invoiceHistoryContainer');
  container.innerHTML = '';
  state.invoices.sort((a, b) => new Date(b.date) - new Date(a.date)).forEach(inv => {
    const c = state.clients.find(x => x.id === inv.clientId);
    const isCancelled = inv.status === 'Cancelled';
    container.innerHTML += `<div class="bg-white border rounded-xl shadow-sm p-5 border-l-4 ${isCancelled ? 'border-l-red-500 opacity-70' : 'border-l-green-500'}"><div class="flex justify-between items-center mb-2"><h3 class="font-extrabold ${isCancelled ? 'text-red-600 line-through' : 'text-slate-800'} text-lg cursor-pointer hover:underline" onclick="openInvoiceInfo('${inv.id}')">${inv.invoiceNum}</h3><span class="text-xs font-bold text-slate-500">${inv.date}</span></div><p class="font-bold text-slate-700 mb-2">${c ? c.name : 'Unknown'}</p><div class="space-y-1 mb-4 text-sm"><div class="flex justify-between border-t pt-1 mt-1 text-slate-800 font-extrabold"><span>Total:</span><span class="${isCancelled ? 'text-red-500' : 'text-green-700'}">${getCurrencySymbol()}${inv.totalAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span></div></div><div class="flex gap-2 mt-3"><button onclick="exportInvoicePDF('${inv.id}')" class="flex-1 bg-slate-800 text-white py-1.5 rounded font-bold text-xs hover:bg-slate-700 transition">🖨️ Print</button>${!isCancelled ? `<button onclick="cancelInvoice('${inv.id}')" class="flex-1 bg-red-50 text-red-600 py-1.5 rounded font-bold hover:bg-red-100 text-xs">Cancel</button>` : `<span class="flex-1 text-center font-bold text-red-500 text-xs py-1.5">CANCELLED</span>`}<button onclick="deleteInvoice('${inv.id}')" class="px-3 bg-slate-100 text-slate-600 py-1.5 rounded font-bold hover:bg-slate-200 text-xs">Del</button></div></div>`;
  });
}

// exportInvoicePDF moved to ./invoiceExports.js

export function cancelInvoice(id) {
  if (!confirm("Cancel this invoice? It will remain in ledger as 0 value.")) return;
  const idx = state.invoices.findIndex(i => i.id === id);
  if (idx === -1) return;
  state.invoices[idx].status = 'Cancelled';
  state.invoices[idx].abstractIds.forEach(aId => {
    const a = state.abstracts.find(x => x.id === aId);
    if (a) { a.isInvoiced = false; a.linkedInvoice = null; }
  });
  saveAllData(); renderInvoiceHistory(); showToast('Invoice Cancelled', 'warning');
}

export function deleteInvoice(id) {
  if (!confirm("PERMANENTLY delete this invoice? Ledger entry will be removed.")) return;
  const inv = state.invoices.find(i => i.id === id);
  if (inv.status !== 'Cancelled') inv.abstractIds.forEach(aId => {
    const a = state.abstracts.find(x => x.id === aId);
    if (a) { a.isInvoiced = false; a.linkedInvoice = null; }
  });
  state.invoices = state.invoices.filter(i => i.id !== id);
  saveAllData(); renderInvoiceHistory(); showToast('Invoice Deleted');
}

export function openInvoiceInfo(id) {
  const inv = state.invoices.find(i => i.id === id);
  if (!inv) return;
  document.getElementById('invInfoTitle').textContent = `Invoice: ${inv.invoiceNum} ${inv.status === 'Cancelled' ? '(CANCELLED)' : ''}`;
  document.getElementById('invInfoContent').innerHTML = `<p><b>Date:</b> ${inv.date}</p><p><b>Subtotal:</b> ${getCurrencySymbol()}${inv.subtotal}</p><p><b>Tax:</b> ${getCurrencySymbol()}${inv.taxAmount}</p><p><b>Total:</b> ${getCurrencySymbol()}${inv.totalAmount}</p><hr><p><b>Linked Abstracts:</b> ${inv.abstractIds.length}</p>`;
  document.getElementById('invoiceInfoModal').classList.remove('hidden');
}

// ==========================================
// ESTIMATES
// ==========================================
// Estimates module moved to ./estimate.js


// exportEstimatePDF moved to ./invoiceExports.js

// ==========================================
// CLIENT HUB
// ==========================================
// Client Hub & client master moved to ./clientHub.js


// Master data tables (item/raw-material) moved to ./masterData.js


// ==========================================
// BACKUP & RESTORE
// ==========================================
// Backup & Restore moved to ./backupRestore.js


// ==========================================
// COMPANY PROFILE
// ==========================================
// Company Profile moved to ./companyProfile.js


// ==========================================
// SALES LEDGER
// ==========================================
// Sales Ledger view moved to ./salesLedger.js


// ==========================================
// PURCHASE LEDGER
// ==========================================
// Purchase ledger moved to ./purchase.js

export function openLabourModal(editId) {
  document.getElementById('labourModal').classList.remove('hidden');
  _labPhotoData = ''; _labIdDocData = '';
  const setV = (id, v) => { const el = document.getElementById(id); if (el) el.value = v || ''; };
  const ids = ['labName','labPhone','labTrade','labDayRate','labAadhar','labPan','labEmergName','labEmergPhone','labAddress'];
  ids.forEach(id => setV(id, ''));
  document.getElementById('labEditId').value = editId || '';
  _populateContractorDropdown(editId ? state.labourMaster.find(x => x.id === editId)?.contractorId : '');
  document.getElementById('labPhotoPreview').style.display = 'none';
  document.getElementById('labPhotoPlaceholder').style.display = '';
  document.getElementById('labIdDocName').textContent = 'No file';
  document.getElementById('labIdDisplay').textContent = '';

  if (editId) {
    const l = state.labourMaster.find(x => x.id === editId);
    if (l) {
      document.getElementById('labModalTitle').textContent = '✏️ Edit Worker';
      setV('labName', l.name); setV('labPhone', l.phone); setV('labTrade', l.trade);
      setV('labDayRate', l.dayRate); setV('labAadhar', l.aadhar); setV('labPan', l.pan);
      setV('labEmergName', l.emergName); setV('labEmergPhone', l.emergPhone); setV('labAddress', l.address);
      setV('labCompType', l.compType || 'DAILY_WAGE');
      document.getElementById('labIdDisplay').textContent = 'ID: ' + l.id;
      if (l.photo) { _labPhotoData = l.photo; const p = document.getElementById('labPhotoPreview'); p.src = l.photo; p.style.display = ''; document.getElementById('labPhotoPlaceholder').style.display = 'none'; }
      if (l.idDoc) { _labIdDocData = l.idDoc; document.getElementById('labIdDocName').textContent = 'ID attached'; }
    }
  } else {
    document.getElementById('labModalTitle').textContent = '👤 Worker Onboarding';
  }
}

window._labPhotoUpload = function(e) {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    _labPhotoData = reader.result;
    const p = document.getElementById('labPhotoPreview');
    p.src = reader.result; p.style.display = '';
    document.getElementById('labPhotoPlaceholder').style.display = 'none';
  };
  reader.readAsDataURL(file);
};

window._labIdDocUpload = function(e) {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    _labIdDocData = reader.result;
    document.getElementById('labIdDocName').textContent = file.name.slice(0, 20);
  };
  reader.readAsDataURL(file);
};

export function saveLabour() {
  const name = document.getElementById('labName').value.trim();
  if (!name) return showToast('Name is required', 'error');
  const trade = document.getElementById('labTrade').value || 'Unskilled Helper';
  const dayRate = parseFloat(document.getElementById('labDayRate').value) || 0;
  if (!dayRate) return showToast('Daily rate is required', 'error');

  const editId = document.getElementById('labEditId').value;
  const profile = {
    name, trade, dayRate,
    phone: document.getElementById('labPhone').value.trim(),
    aadhar: document.getElementById('labAadhar').value.trim(),
    pan: document.getElementById('labPan').value.trim().toUpperCase(),
    emergName: document.getElementById('labEmergName').value.trim(),
    emergPhone: document.getElementById('labEmergPhone').value.trim(),
    address: document.getElementById('labAddress').value.trim(),
    contractorId: document.getElementById('labContractor')?.value || '',
    compType: document.getElementById('labCompType')?.value || 'DAILY_WAGE',
    photo: _labPhotoData || '',
    idDoc: _labIdDocData || '',
  };

  if (editId) {
    const l = state.labourMaster.find(x => x.id === editId);
    if (l) Object.assign(l, profile);
    showToast('Worker updated', 'success');
  } else {
    // Unique Labour ID: LAB-<projcode>-<seq>
    const seq = String((state.labourMaster || []).length + 1).padStart(3, '0');
    profile.id = 'LAB' + seq + '_' + Date.now().toString(36).slice(-4);
    profile.labourCode = 'LAB-' + seq;
    profile.projectId = state.currentProjectId || null;
    profile.status = 'Active';
    profile.joinedAt = new Date().toISOString().split('T')[0];
    state.labourMaster.push(profile);
    showToast(`Worker onboarded (${profile.labourCode})`, 'success');
  }
  saveLabourData();
  document.getElementById('labourModal').classList.add('hidden');
  renderLabourMasterList(); renderMonthlyMuster();
}

export function renderLabourMasterList() {
  const container = document.getElementById('labourMasterList');
  if (!container) return;
  const labours = _projectLabour();
  if (labours.length === 0) {
    container.innerHTML = '<p class="text-xs text-slate-400 text-center py-4">No labour added for this project yet.</p>';
    return;
  }
  container.innerHTML = labours.map(l => {
    const avatar = l.photo
      ? `<img src="${l.photo}" style="width:38px;height:38px;border-radius:9px;object-fit:cover;flex-shrink:0;">`
      : `<div style="width:38px;height:38px;border-radius:9px;background:#e0e7ff;display:flex;align-items:center;justify-content:center;font-weight:700;color:#4f46e5;flex-shrink:0;">${(l.name||'?').charAt(0).toUpperCase()}</div>`;
    return `<div class="flex justify-between items-center p-2.5 bg-slate-50 rounded-lg border gap-2">
      <div class="flex items-center gap-2.5 min-w-0">
        ${avatar}
        <div class="min-w-0">
          <p class="font-bold text-slate-800 text-sm truncate">${l.name} ${l.labourCode ? `<span class="text-[9px] text-indigo-500 font-mono">${l.labourCode}</span>` : ''}</p>
          <p class="text-[10px] text-slate-500">${l.trade} · ${getCurrencySymbol()}${l.dayRate}/day${l.phone ? ' · 📞 ' + l.phone : ''}${(() => { const c = (state.labourContractors||[]).find(x => x.id === l.contractorId); return c ? ' · 🧑‍🔧 ' + c.name : ''; })()}</p>
        </div>
      </div>
      <div class="flex gap-1 flex-shrink-0">
        <button onclick="openLabourModal('${l.id}')" class="text-blue-500 hover:bg-blue-50 px-2 py-1 rounded text-xs font-bold">Edit</button>
        <button onclick="deleteLabour('${l.id}')" class="text-red-400 hover:text-red-600 px-2 py-1 rounded text-xs font-bold">Del</button>
      </div>
    </div>${_ppeChipsForWorker(l.id)}`;
  }).join('');
}

export function deleteLabour(id) {
  if (!confirm('Remove this labourer?')) return;
  state.labourMaster = state.labourMaster.filter(l => l.id !== id);
  saveLabourData(); renderLabourMasterList(); renderMonthlyMuster();
}

/** Labour belonging to the current project (untagged legacy ones excluded once project scoping is active) */
function _projectLabour() {
  return (state.labourMaster || []).filter(l => l.projectId === state.currentProjectId);
}

// ══════════════════════════════════════════
// CONTRACTOR / GANG MANAGEMENT
// ══════════════════════════════════════════
function _projectContractors() {
  return (state.labourContractors || []).filter(c => !c.projectId || c.projectId === state.currentProjectId);
}

/** Populate the contractor dropdown in the labour onboarding modal */
function _populateContractorDropdown(selected) {
  const sel = document.getElementById('labContractor');
  if (!sel) return;
  sel.innerHTML = '<option value="">— Direct (No Contractor) —</option>';
  _projectContractors().forEach(c => {
    sel.innerHTML += `<option value="${c.id}" ${selected === c.id ? 'selected' : ''}>${c.name}${c.phone ? ' (' + c.phone + ')' : ''}</option>`;
  });
}

/** Quick-add a contractor / gang leader */
window._addContractorQuick = function() {
  const name = prompt('Contractor / Gang Leader (Mukadam) name:');
  if (!name || !name.trim()) return;
  const phone = prompt('Phone number (optional):') || '';
  const c = { id: 'ctr_' + Date.now(), name: name.trim(), phone: phone.trim(), projectId: state.currentProjectId || null };
  if (!state.labourContractors) state.labourContractors = [];
  state.labourContractors.push(c);
  saveAllData();
  _populateContractorDropdown(c.id);
  if (document.getElementById('labContractor')) document.getElementById('labContractor').value = c.id;
  renderContractorsList();
  showToast(`Contractor "${c.name}" added`, 'success');
};

/** linkLabourToContractor — render gangs with aggregate attendance + payout */
window.renderContractorsList = function() {
  const container = document.getElementById('contractorsList');
  if (!container) return;
  const contractors = _projectContractors();
  if (!contractors.length) {
    container.innerHTML = '<div style="text-align:center;padding:40px;color:#94a3b8;"><div style="font-size:32px;margin-bottom:8px;">🧑‍🔧</div>No contractors yet. Add a Gang Leader (Mukadam) to group workers.</div>';
    return;
  }
  const cur = getCurrencySymbol();
  const selMonth = document.getElementById('attMonthFilter')?.value || new Date().toISOString().substring(0, 7);

  container.innerHTML = contractors.map(c => {
    const gang = _projectLabour().filter(l => l.contractorId === c.id);
    // Aggregate this month's attendance-derived wages for the gang
    let gangWages = 0, gangPresent = 0;
    gang.forEach(l => {
      const logs = (state.attendanceLogs || []).filter(a => a.labourId === l.id && a.date.startsWith(selMonth));
      const p = logs.filter(a => a.status === 'P').length;
      const h = logs.filter(a => a.status === 'H').length;
      const ot = logs.reduce((s, a) => s + (a.ot || 0), 0);
      gangWages += (p + h * 0.5) * (l.dayRate || 0) + ot * ((l.dayRate || 0) / 8) * 1.5;
      gangPresent += p + h;
    });
    const gangList = gang.map(l => `<span style="display:inline-block;background:#f1f5f9;color:#475569;font-size:10px;font-weight:600;padding:2px 8px;border-radius:12px;margin:2px;">${l.name} · ${l.trade}</span>`).join('') || '<span style="font-size:11px;color:#94a3b8;">No workers assigned yet — set this contractor in a worker\'s profile.</span>';

    return `<div style="background:#fff;border:1px solid #e2e8f0;border-radius:12px;padding:16px;">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:10px;flex-wrap:wrap;">
        <div>
          <div style="font-size:15px;font-weight:800;color:#0f172a;">${c.name} ${c.phone ? `<span style="font-size:11px;color:#94a3b8;font-weight:500;">📞 ${c.phone}</span>` : ''}</div>
          <div style="font-size:11px;color:#64748b;margin-top:2px;">${gang.length} workers · ${gangPresent} man-days (${selMonth})</div>
        </div>
        <div style="text-align:right;">
          <div style="font-size:18px;font-weight:800;color:#059669;font-family:'JetBrains Mono',monospace;">${cur}${Math.round(gangWages).toLocaleString('en-IN')}</div>
          <div style="font-size:9px;color:#94a3b8;text-transform:uppercase;">Gang Wages (${selMonth})</div>
        </div>
      </div>
      <div style="margin:10px 0;">${gangList}</div>
      <div style="display:flex;gap:8px;">
        <button onclick="_payContractor('${c.id}')" style="background:#059669;color:#fff;border:none;padding:8px 16px;border-radius:8px;font-size:12px;font-weight:700;cursor:pointer;">💰 Pay Gang (${cur}${Math.round(gangWages).toLocaleString('en-IN')})</button>
        <button onclick="_deleteContractor('${c.id}')" style="background:#fef2f2;color:#dc2626;border:1px solid #fecaca;padding:8px 12px;border-radius:8px;font-size:12px;font-weight:700;cursor:pointer;">Delete</button>
      </div>
    </div>`;
  }).join('');
};

window._deleteContractor = function(id) {
  const c = (state.labourContractors || []).find(x => x.id === id);
  if (!c) return;
  if (!confirm(`Delete contractor "${c.name}"? Workers stay but become direct (no contractor).`)) return;
  state.labourContractors = state.labourContractors.filter(x => x.id !== id);
  (state.labourMaster || []).forEach(l => { if (l.contractorId === id) l.contractorId = ''; });
  saveAllData();
  renderContractorsList();
  showToast('Contractor deleted', 'error');
};

// ══════════════════════════════════════════
// PPE / SAFETY GEAR ISSUANCE
// ══════════════════════════════════════════
const PPE_ITEMS = [
  { name: 'Safety Helmet', value: 150 },
  { name: 'Safety Jacket', value: 250 },
  { name: 'Safety Boots', value: 600 },
  { name: 'Safety Gloves', value: 80 },
  { name: 'Safety Goggles', value: 120 },
  { name: 'Safety Harness', value: 1200 },
  { name: 'Ear Plugs', value: 30 },
  { name: 'Dust Mask', value: 40 },
];

/** issuePPE — track safety gear given to a worker */
window._issuePPE = function() {
  const labours = _projectLabour();
  if (!labours.length) { showToast('Add labour first', 'error'); return; }
  const cur = getCurrencySymbol();
  const workerOpts = labours.map(l => `<option value="${l.id}">${l.name} (${l.trade || '—'})</option>`).join('');
  const itemRows = PPE_ITEMS.map((it, i) => `
    <label style="display:flex;align-items:center;gap:8px;padding:6px 8px;border-bottom:1px solid #f1f5f9;font-size:13px;">
      <input type="checkbox" class="ppe-chk" data-name="${it.name}" data-value="${it.value}" style="width:16px;height:16px;">
      <span style="flex:1;">${it.name}</span>
      <span style="color:#94a3b8;font-size:11px;">${cur}${it.value}</span>
      <input type="number" class="ppe-qty" value="1" min="1" style="width:48px;padding:3px;border:1px solid #e2e8f0;border-radius:6px;font-size:12px;text-align:center;">
    </label>`).join('');

  _payrollModal('Issue PPE / Safety Gear', `
    <label class="pm-l">Worker</label><select id="ppeWorker" class="pm-i">${workerOpts}</select>
    <label class="pm-l">Date</label><input type="date" id="ppeDate" class="pm-i" value="${new Date().toISOString().split('T')[0]}">
    <label class="pm-l">Select items issued</label>
    <div style="border:1px solid #e2e8f0;border-radius:8px;max-height:240px;overflow-y:auto;">${itemRows}</div>
    <p style="font-size:10px;color:#94a3b8;margin-top:8px;">⚠ Unreturned items are auto-deducted at Final Settlement.</p>
  `, () => {
    const labourId = document.getElementById('ppeWorker').value;
    const date = document.getElementById('ppeDate').value;
    const items = [];
    document.querySelectorAll('.ppe-chk:checked').forEach(chk => {
      const qty = parseInt(chk.closest('label').querySelector('.ppe-qty').value) || 1;
      items.push({ name: chk.dataset.name, value: parseFloat(chk.dataset.value) * qty, qty });
    });
    if (!items.length) { showToast('Select at least one item', 'error'); return false; }
    const totalValue = items.reduce((s, x) => s + x.value, 0);
    state.labourPPE.push({ id: 'ppe_' + Date.now(), labourId, date, items, totalValue, returned: false, projectId: state.currentProjectId });
    saveAllData(); renderLabourMasterList();
    showToast(`Issued ${items.length} PPE items (${cur}${totalValue}) — tracked`, 'success');
    return true;
  }, 'Issue Gear', 420);
};

/** Toggle a PPE issuance as returned */
window._togglePPEReturn = function(ppeId) {
  const rec = (state.labourPPE || []).find(p => p.id === ppeId);
  if (!rec) return;
  rec.returned = !rec.returned;
  rec.returnedDate = rec.returned ? new Date().toISOString().split('T')[0] : null;
  saveAllData(); renderLabourMasterList();
  showToast(rec.returned ? 'Marked returned' : 'Marked NOT returned', 'info');
};

// ══════════════════════════════════════════
// PIECE-RATE WORK — rate card, measurement, approval, payout
// ══════════════════════════════════════════
window._prTab = function(tab, btn) {
  if (btn) {
    document.querySelectorAll('.pr-tab').forEach(b => { b.classList.remove('bg-white','text-slate-800','shadow-sm'); b.classList.add('text-slate-500'); });
    btn.classList.add('bg-white','text-slate-800','shadow-sm'); btn.classList.remove('text-slate-500');
  }
  if (tab === 'rates') _prRenderRates();
  else if (tab === 'measure') _prRenderMeasure();
  else if (tab === 'approve') _prRenderApprovals();
  else if (tab === 'payout') _prRenderPayout();
};

function _prSiteOptions() {
  const proj = (state.projects || []).find(p => p.id === state.currentProjectId);
  let opts = '';
  if (proj?.boqs?.length) proj.boqs.forEach(g => { opts += `<option value="${g.id}">${(g.woNumber ? g.woNumber + ' — ' : '') + (g.name || g.type)}</option>`; });
  getAllLocations().forEach(l => { opts += `<option value="${l.id}">${l.name}</option>`; });
  return opts || '<option value="main">Main Site</option>';
}

/** defineWorkItemRates — rate card */
function _prRenderRates() {
  const c = document.getElementById('prContent');
  if (!c) return;
  const cur = getCurrencySymbol();
  const rates = (state.workItemRates || []).filter(r => r.projectId === state.currentProjectId);
  const rows = rates.map(r => `<tr style="border-bottom:1px solid #f1f5f9;">
    <td style="padding:8px 10px;font-family:monospace;font-weight:700;color:#2563eb;">${r.itemCode || '—'}</td>
    <td style="padding:8px 10px;">${r.workCategory}</td>
    <td style="padding:8px 10px;text-align:center;">${r.uom}</td>
    <td style="padding:8px 10px;text-align:right;font-weight:700;">${cur}${r.rate.toLocaleString('en-IN')}</td>
    <td style="padding:8px 10px;text-align:center;"><button onclick="_prDeleteRate('${r.id}')" style="font-size:10px;color:#dc2626;background:#fef2f2;border:1px solid #fecaca;border-radius:4px;padding:2px 8px;cursor:pointer;">Del</button></td>
  </tr>`).join('');
  c.innerHTML = `
    <div class="bg-white border rounded-xl p-4 mb-4">
      <h4 class="font-bold text-slate-700 text-sm mb-3">➕ Add Work Item Rate</h4>
      <div class="grid grid-cols-2 md:grid-cols-5 gap-2">
        <input id="prItemCode" placeholder="Item Code" class="p-2 border rounded-lg text-sm outline-none">
        <input id="prCategory" placeholder="Work (e.g. RCC M20)" class="p-2 border rounded-lg text-sm outline-none">
        <select id="prUom" class="p-2 border rounded-lg text-sm outline-none bg-white"><option>M3</option><option>M2</option><option>RMT</option><option>MT</option><option>Nos</option><option>Kg</option><option>Sqft</option><option>Cft</option><option>Bag</option><option>Lot</option></select>
        <input id="prRate" type="number" placeholder="Rate ₹" class="p-2 border rounded-lg text-sm outline-none">
        <button onclick="_prAddRate()" class="bg-blue-600 text-white rounded-lg font-bold text-sm hover:bg-blue-700">Add</button>
      </div>
    </div>
    <div class="bg-white border rounded-xl overflow-hidden">
      <table class="w-full text-sm"><thead class="bg-slate-50"><tr>
        <th class="px-3 py-2 text-left text-[10px] font-bold uppercase text-slate-500">Code</th>
        <th class="px-3 py-2 text-left text-[10px] font-bold uppercase text-slate-500">Work Category</th>
        <th class="px-3 py-2 text-center text-[10px] font-bold uppercase text-slate-500">UOM</th>
        <th class="px-3 py-2 text-right text-[10px] font-bold uppercase text-slate-500">Rate</th>
        <th class="px-3 py-2"></th>
      </tr></thead><tbody>${rows || '<tr><td colspan="5" class="p-6 text-center text-slate-400">No rates defined yet.</td></tr>'}</tbody></table>
    </div>`;
}
window._prAddRate = function() {
  const itemCode = document.getElementById('prItemCode').value.trim();
  const workCategory = document.getElementById('prCategory').value.trim();
  const uom = document.getElementById('prUom').value;
  const rate = parseFloat(document.getElementById('prRate').value) || 0;
  if (!workCategory || rate <= 0) { showToast('Enter work category and rate', 'error'); return; }
  state.workItemRates.push({ id: 'rate_' + Date.now(), itemCode, workCategory, uom, rate, projectId: state.currentProjectId });
  saveAllData(); _prRenderRates();
  showToast('Rate added', 'success');
};
window._prDeleteRate = function(id) {
  state.workItemRates = state.workItemRates.filter(r => r.id !== id);
  saveAllData(); _prRenderRates();
};

/** logDailyWorkMeasurement */
function _prRenderMeasure() {
  const c = document.getElementById('prContent');
  if (!c) return;
  const rates = (state.workItemRates || []).filter(r => r.projectId === state.currentProjectId);
  if (!rates.length) { c.innerHTML = '<div class="bg-white border rounded-xl p-8 text-center text-slate-400">Define work item rates first (Rate Card tab).</div>'; return; }
  const gangs = _projectContractors();
  const rateOpts = rates.map(r => `<option value="${r.id}">${r.workCategory} (${getCurrencySymbol()}${r.rate}/${r.uom})</option>`).join('');
  const gangOpts = gangs.map(g => `<option value="${g.id}">${g.name}</option>`).join('') || '<option value="">No gangs — add a contractor</option>';
  c.innerHTML = `
    <div class="bg-white border rounded-xl p-4 mb-4">
      <h4 class="font-bold text-slate-700 text-sm mb-3">📏 Log Daily Work Measurement</h4>
      <div class="grid grid-cols-2 md:grid-cols-5 gap-2">
        <input id="prmDate" type="date" value="${new Date().toISOString().split('T')[0]}" class="p-2 border rounded-lg text-sm outline-none">
        <select id="prmSite" class="p-2 border rounded-lg text-sm outline-none bg-white">${_prSiteOptions()}</select>
        <select id="prmGang" class="p-2 border rounded-lg text-sm outline-none bg-white">${gangOpts}</select>
        <select id="prmRate" class="p-2 border rounded-lg text-sm outline-none bg-white">${rateOpts}</select>
        <input id="prmQty" type="number" placeholder="Quantity" class="p-2 border rounded-lg text-sm outline-none">
      </div>
      <input id="prmLoc" placeholder="Location detail (e.g. 2nd floor slab, Grid A-B)" class="w-full mt-2 p-2 border rounded-lg text-sm outline-none">
      <button onclick="_prLogMeasure()" class="mt-3 w-full bg-amber-500 text-white p-2.5 rounded-lg font-bold text-sm hover:bg-amber-600">Submit Measurement (Pending Approval)</button>
    </div>
    <div id="prMeasureList"></div>`;
  _prRenderMeasureList();
}
function _prRenderMeasureList() {
  const box = document.getElementById('prMeasureList');
  if (!box) return;
  const cur = getCurrencySymbol();
  const list = (state.workMeasurements || []).filter(m => m.projectId === state.currentProjectId).slice(-20).reverse();
  box.innerHTML = `<div class="bg-white border rounded-xl overflow-hidden"><table class="w-full text-xs"><thead class="bg-slate-50"><tr>
    <th class="px-3 py-2 text-left font-bold uppercase text-slate-500">Date</th><th class="px-3 py-2 text-left font-bold uppercase text-slate-500">Gang</th><th class="px-3 py-2 text-left font-bold uppercase text-slate-500">Work</th><th class="px-3 py-2 text-right font-bold uppercase text-slate-500">Qty</th><th class="px-3 py-2 text-right font-bold uppercase text-slate-500">Value</th><th class="px-3 py-2 text-center font-bold uppercase text-slate-500">Status</th></tr></thead><tbody>
    ${list.map(m => {
      const rate = (state.workItemRates || []).find(r => r.id === m.rateId);
      const gang = (state.labourContractors || []).find(g => g.id === m.gangId);
      const val = (rate?.rate || 0) * m.quantity;
      return `<tr style="border-bottom:1px solid #f1f5f9;"><td class="px-3 py-2">${m.date}</td><td class="px-3 py-2">${gang?.name || '—'}</td><td class="px-3 py-2">${rate?.workCategory || '—'}</td><td class="px-3 py-2 text-right font-bold">${m.quantity} ${rate?.uom || ''}</td><td class="px-3 py-2 text-right font-bold">${cur}${val.toLocaleString('en-IN')}</td><td class="px-3 py-2 text-center">${m.approved ? '<span style="color:#059669;font-weight:700;font-size:10px;">✓ Approved</span>' : '<span style="color:#d97706;font-weight:700;font-size:10px;">Pending</span>'}</td></tr>`;
    }).join('') || '<tr><td colspan="6" class="p-6 text-center text-slate-400">No measurements logged.</td></tr>'}
  </tbody></table></div>`;
}
window._prLogMeasure = function() {
  const date = document.getElementById('prmDate').value;
  const siteId = document.getElementById('prmSite').value;
  const gangId = document.getElementById('prmGang').value;
  const rateId = document.getElementById('prmRate').value;
  const quantity = parseFloat(document.getElementById('prmQty').value) || 0;
  const location = document.getElementById('prmLoc').value.trim();
  if (!gangId) { showToast('Select a gang', 'error'); return; }
  if (quantity <= 0) { showToast('Enter valid quantity', 'error'); return; }
  state.workMeasurements.push({ id: 'meas_' + Date.now(), date, siteId, gangId, rateId, quantity, location, approved: false, projectId: state.currentProjectId });
  saveAllData(); _prRenderMeasureList();
  document.getElementById('prmQty').value = ''; document.getElementById('prmLoc').value = '';
  showToast('Measurement logged — pending approval', 'success');
};

/** approveMeasurement */
function _prRenderApprovals() {
  const c = document.getElementById('prContent');
  if (!c) return;
  const cur = getCurrencySymbol();
  const pending = (state.workMeasurements || []).filter(m => m.projectId === state.currentProjectId && !m.approved);
  c.innerHTML = `<div class="bg-white border rounded-xl overflow-hidden">
    <div class="p-3 bg-amber-50 border-b text-sm font-bold text-amber-700">⏳ ${pending.length} measurement(s) awaiting engineer approval</div>
    <table class="w-full text-xs"><thead class="bg-slate-50"><tr>
      <th class="px-3 py-2 text-left font-bold uppercase text-slate-500">Date</th><th class="px-3 py-2 text-left font-bold uppercase text-slate-500">Gang</th><th class="px-3 py-2 text-left font-bold uppercase text-slate-500">Work / Location</th><th class="px-3 py-2 text-right font-bold uppercase text-slate-500">Qty</th><th class="px-3 py-2 text-right font-bold uppercase text-slate-500">Value</th><th class="px-3 py-2 text-center font-bold uppercase text-slate-500">Action</th></tr></thead><tbody>
    ${pending.map(m => {
      const rate = (state.workItemRates || []).find(r => r.id === m.rateId);
      const gang = (state.labourContractors || []).find(g => g.id === m.gangId);
      const val = (rate?.rate || 0) * m.quantity;
      return `<tr style="border-bottom:1px solid #f1f5f9;"><td class="px-3 py-2">${m.date}</td><td class="px-3 py-2 font-bold">${gang?.name || '—'}</td><td class="px-3 py-2">${rate?.workCategory || '—'}<div style="font-size:10px;color:#94a3b8;">${m.location || ''}</div></td><td class="px-3 py-2 text-right font-bold">${m.quantity} ${rate?.uom || ''}</td><td class="px-3 py-2 text-right font-bold">${cur}${val.toLocaleString('en-IN')}</td><td class="px-3 py-2 text-center"><button onclick="_prApprove('${m.id}')" style="background:#059669;color:#fff;border:none;border-radius:5px;padding:3px 10px;font-size:10px;font-weight:700;cursor:pointer;margin-right:3px;">Approve</button><button onclick="_prRejectMeasure('${m.id}')" style="background:#fef2f2;color:#dc2626;border:1px solid #fecaca;border-radius:5px;padding:3px 8px;font-size:10px;font-weight:700;cursor:pointer;">✕</button></td></tr>`;
    }).join('') || '<tr><td colspan="6" class="p-6 text-center text-slate-400">No pending approvals. ✓</td></tr>'}
  </tbody></table></div>`;
}
window._prApprove = function(id) {
  const m = (state.workMeasurements || []).find(x => x.id === id);
  if (!m) return;
  const user = (typeof getCurrentUser === 'function' && getCurrentUser()) ? getCurrentUser() : null;
  m.approved = true; m.approvedBy = user?.name || user?.email || 'Engineer'; m.approvedAt = new Date().toISOString();
  saveAllData(); _prRenderApprovals();
  showToast('Measurement approved', 'success');
};
window._prRejectMeasure = function(id) {
  if (!confirm('Reject and delete this measurement?')) return;
  state.workMeasurements = state.workMeasurements.filter(x => x.id !== id);
  saveAllData(); _prRenderApprovals();
};

/** calculateGangPayout + processGangAdvancesAndDeductions */
function _prRenderPayout() {
  const c = document.getElementById('prContent');
  if (!c) return;
  const gangs = _projectContractors();
  const gangOpts = gangs.map(g => `<option value="${g.id}">${g.name}</option>`).join('') || '<option value="">No gangs</option>';
  const m = new Date().toISOString().substring(0, 7);
  c.innerHTML = `
    <div class="bg-white border rounded-xl p-4">
      <h4 class="font-bold text-slate-700 text-sm mb-3">💰 Calculate Gang Payout (Piece-Rate)</h4>
      <div class="grid grid-cols-2 md:grid-cols-4 gap-2 mb-3">
        <select id="prpGang" class="p-2 border rounded-lg text-sm bg-white">${gangOpts}</select>
        <input id="prpStart" type="date" value="${m}-01" class="p-2 border rounded-lg text-sm">
        <input id="prpEnd" type="date" value="${new Date().toISOString().split('T')[0]}" class="p-2 border rounded-lg text-sm">
        <button onclick="_prCalcPayout()" class="bg-blue-600 text-white rounded-lg font-bold text-sm hover:bg-blue-700">Calculate</button>
      </div>
      <div id="prPayoutResult"></div>
    </div>`;
}
window._prCalcPayout = function() {
  const gangId = document.getElementById('prpGang').value;
  const start = document.getElementById('prpStart').value;
  const end = document.getElementById('prpEnd').value;
  const cur = getCurrencySymbol();
  if (!gangId) { showToast('Select a gang', 'error'); return; }
  // Sum APPROVED measurements only
  const meas = (state.workMeasurements || []).filter(m => m.gangId === gangId && m.approved && m.date >= start && m.date <= end);
  if (!meas.length) { document.getElementById('prPayoutResult').innerHTML = '<p class="text-center text-slate-400 py-6">No approved measurements in this period.</p>'; return; }
  let gross = 0;
  const rows = meas.map(m => {
    const rate = (state.workItemRates || []).find(r => r.id === m.rateId);
    const val = (rate?.rate || 0) * m.quantity;
    gross += val;
    return `<tr style="border-bottom:1px solid #f1f5f9;"><td class="px-3 py-2">${m.date}</td><td class="px-3 py-2">${rate?.workCategory || '—'}</td><td class="px-3 py-2 text-right">${m.quantity} ${rate?.uom || ''}</td><td class="px-3 py-2 text-right">${cur}${(rate?.rate||0)}</td><td class="px-3 py-2 text-right font-bold">${cur}${val.toLocaleString('en-IN')}</td></tr>`;
  }).join('');
  // Gang's unsettled advances (advances recorded against the contractor's workers? Use contractor-level: advances on gang leader stored as labourAdvances with labourId = gangId)
  const advances = (state.labourAdvances || []).filter(a => a.labourId === gangId && !a.settled).reduce((s, x) => s + (parseFloat(x.amount) || 0), 0);
  const net = gross - advances;
  const accOpts = state.accounts.map(a => `<option value="${a.id}">${a.name} (${a.type})</option>`).join('');
  document.getElementById('prPayoutResult').innerHTML = `
    <div class="border rounded-lg overflow-hidden mb-3"><table class="w-full text-xs"><thead class="bg-slate-50"><tr><th class="px-3 py-2 text-left font-bold uppercase text-slate-500">Date</th><th class="px-3 py-2 text-left font-bold uppercase text-slate-500">Work</th><th class="px-3 py-2 text-right font-bold uppercase text-slate-500">Qty</th><th class="px-3 py-2 text-right font-bold uppercase text-slate-500">Rate</th><th class="px-3 py-2 text-right font-bold uppercase text-slate-500">Value</th></tr></thead><tbody>${rows}</tbody></table></div>
    <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:12px;font-size:13px;">
      <div style="display:flex;justify-content:space-between;padding:3px 0;"><span style="color:#64748b;">Gross (approved work)</span><span style="font-weight:700;color:#2563eb;">${cur}${gross.toLocaleString('en-IN')}</span></div>
      <div style="display:flex;justify-content:space-between;padding:3px 0;"><span style="color:#64748b;">Less: Gang Advances</span><span style="font-weight:700;color:#ea580c;">−${cur}${advances.toLocaleString('en-IN')}</span></div>
      <div style="display:flex;justify-content:space-between;padding:8px 0 0;border-top:1px solid #e2e8f0;margin-top:6px;"><span style="font-weight:800;">Net Payable</span><span style="font-weight:800;font-size:16px;color:#059669;">${cur}${net.toLocaleString('en-IN')}</span></div>
    </div>
    <div class="flex gap-2 mt-3">
      <select id="prpAccount" class="flex-1 p-2 border rounded-lg text-sm bg-white">${accOpts}</select>
      <button onclick="_prPayGang('${gangId}',${net})" class="bg-emerald-600 text-white px-5 rounded-lg font-bold text-sm hover:bg-emerald-700">Pay ${cur}${net.toLocaleString('en-IN')}</button>
    </div>`;
};
window._prPayGang = function(gangId, net) {
  if (net <= 0) { showToast('Nothing to pay', 'warning'); return; }
  const accountId = document.getElementById('prpAccount').value;
  const gang = (state.labourContractors || []).find(g => g.id === gangId);
  const date = new Date().toISOString().split('T')[0];
  state.expenses.push({ id: 'exp_' + Date.now(), accountId, date, category: 'Piece-Rate Gang Payout', amount: net, remarks: `Piece-rate payout to ${gang?.name || 'gang'}`, projectId: state.currentProjectId });
  // settle gang advances
  (state.labourAdvances || []).filter(a => a.labourId === gangId && !a.settled).forEach(a => a.settled = true);
  saveAllData();
  showToast(`Paid ${getCurrencySymbol()}${net.toLocaleString('en-IN')} to ${gang?.name || 'gang'}`, 'success');
  _prRenderPayout();
};

/** Total value of unreturned PPE for a worker (used in final settlement) */
function _unreturnedPPEValue(labourId) {
  return (state.labourPPE || []).filter(p => p.labourId === labourId && !p.returned).reduce((s, p) => s + (p.totalValue || 0), 0);
}

/** PPE chips shown under a worker in the master list */
function _ppeChipsForWorker(labourId) {
  const recs = (state.labourPPE || []).filter(p => p.labourId === labourId);
  if (!recs.length) return '';
  const cur = getCurrencySymbol();
  const chips = recs.map(p => {
    const names = (p.items || []).map(i => i.name).join(', ');
    return `<span onclick="_togglePPEReturn('${p.id}')" title="Click to toggle returned" style="cursor:pointer;display:inline-block;font-size:9px;font-weight:600;padding:2px 8px;border-radius:10px;margin:2px;${p.returned ? 'background:#ecfdf5;color:#059669;border:1px solid #a7f3d0;' : 'background:#fffbeb;color:#d97706;border:1px solid #fde68a;'}">${p.returned ? '✓' : '🦺'} ${names} (${cur}${p.totalValue})${p.returned ? ' returned' : ''}</span>`;
  }).join('');
  return `<div style="padding:4px 8px 8px 50px;margin-top:-6px;">${chips}</div>`;
}

/** Pay the whole gang's aggregate wages to the contractor */
window._payContractor = function(id) {
  const c = (state.labourContractors || []).find(x => x.id === id);
  if (!c) return;
  if (!state.accounts.length) { showToast('Create a payment account first', 'error'); return; }
  const cur = getCurrencySymbol();
  const selMonth = document.getElementById('attMonthFilter')?.value || new Date().toISOString().substring(0, 7);
  const gang = _projectLabour().filter(l => l.contractorId === id);
  if (!gang.length) { showToast('No workers in this gang', 'warning'); return; }

  let gangWages = 0;
  const breakdown = gang.map(l => {
    const logs = (state.attendanceLogs || []).filter(a => a.labourId === l.id && a.date.startsWith(selMonth));
    const p = logs.filter(a => a.status === 'P').length;
    const h = logs.filter(a => a.status === 'H').length;
    const ot = logs.reduce((s, a) => s + (a.ot || 0), 0);
    const w = (p + h * 0.5) * (l.dayRate || 0) + ot * ((l.dayRate || 0) / 8) * 1.5;
    gangWages += w;
    return { name: l.name, days: p + h * 0.5, wage: Math.round(w) };
  });
  gangWages = Math.round(gangWages);
  if (gangWages <= 0) { showToast('No wages to pay — mark attendance first', 'warning'); return; }

  const accOpts = state.accounts.map(a => `<option value="${a.id}">${a.name} (${a.type})</option>`).join('');
  const rows = breakdown.map(b => `<tr style="border-bottom:1px solid #f1f5f9;"><td style="padding:5px 10px;">${b.name}</td><td style="padding:5px 10px;text-align:right;color:#64748b;">${b.days} days</td><td style="padding:5px 10px;text-align:right;font-weight:700;">${cur}${b.wage.toLocaleString('en-IN')}</td></tr>`).join('');

  _payrollModal(`Pay Gang — ${c.name}`, `
    <p style="font-size:12px;color:#94a3b8;margin-bottom:10px;">Aggregate wages for ${gang.length} workers (${selMonth})</p>
    <div style="max-height:220px;overflow-y:auto;border:1px solid #e2e8f0;border-radius:8px;margin-bottom:12px;">
      <table style="width:100%;border-collapse:collapse;font-size:12px;"><tbody>${rows}</tbody></table>
    </div>
    <div style="display:flex;justify-content:space-between;padding:10px 14px;background:#0f172a;color:#fff;border-radius:8px;margin-bottom:12px;"><span style="font-weight:600;">Total to ${c.name}</span><span style="font-size:18px;font-weight:800;color:#10b981;">${cur}${gangWages.toLocaleString('en-IN')}</span></div>
    <label class="pm-l">Pay from account</label><select id="pmAccount" class="pm-i">${accOpts}</select>
    <label class="pm-l">Amount (editable)</label><input type="number" id="pmAmount" class="pm-i" value="${gangWages}">
  `, () => {
    const accountId = document.getElementById('pmAccount').value;
    const amount = parseFloat(document.getElementById('pmAmount').value) || gangWages;
    const date = new Date().toISOString().split('T')[0];
    // Record one expense to the contractor (gang payout)
    state.expenses.push({ id: 'exp_' + Date.now(), accountId, date, category: 'Contractor Payout', amount, remarks: `Gang payout to ${c.name} (${gang.length} workers, ${selMonth})`, projectId: state.currentProjectId });
    saveAllData(); renderContractorsList();
    showToast(`Paid ${cur}${amount.toLocaleString('en-IN')} to ${c.name}`, 'success');
    return true;
  }, 'Pay Contractor', 440);
};

export function loadAttendanceSheet() {
  const date = document.getElementById('attDate').value;
  const siteId = document.getElementById('attSite').value;
  // Auto-load: stay quiet until both date and WO/site are chosen
  if (!date || !siteId) return;
  const labours = _projectLabour();
  if (labours.length === 0) {
    const ct = document.getElementById('attSheetContainer');
    if (ct) ct.innerHTML = '<p class="text-slate-400 text-center py-8 font-medium">No labour for this project yet — add workers via 👤 Add.</p>';
    return;
  }
  const site = _siteLabel(siteId);
  const existing = {};
  state.attendanceLogs.filter(a => a.date === date && a.siteId === siteId).forEach(a => existing[a.labourId] = a);

  const container = document.getElementById('attSheetContainer');
  if (!container) return;
  container.innerHTML = `
    <div style="background:#fff;border:1px solid #e2e8f0;border-radius:12px;overflow:hidden;">
      <div style="display:flex;justify-content:space-between;align-items:center;padding:12px 16px;background:#1e293b;color:#fff;flex-wrap:wrap;gap:8px;">
        <h3 style="font-size:14px;font-weight:700;">${date} • ${site}</h3>
        <div style="display:flex;gap:6px;flex-wrap:wrap;">
          <button onclick="_attMarkAll('P')" style="background:rgba(16,185,129,.2);color:#a7f3d0;border:1px solid rgba(16,185,129,.4);padding:6px 12px;border-radius:7px;font-size:11px;font-weight:700;cursor:pointer;">✓ All Present</button>
          <button onclick="_attMarkAll('A')" style="background:rgba(239,68,68,.2);color:#fecaca;border:1px solid rgba(239,68,68,.4);padding:6px 12px;border-radius:7px;font-size:11px;font-weight:700;cursor:pointer;">✕ All Absent</button>
          <button onclick="_attMarkAll('H')" style="background:rgba(245,158,11,.2);color:#fde68a;border:1px solid rgba(245,158,11,.4);padding:6px 12px;border-radius:7px;font-size:11px;font-weight:700;cursor:pointer;">◐ Half</button>
          <button onclick="saveAttendance()" style="background:#f97316;color:#fff;border:none;padding:6px 16px;border-radius:7px;font-size:12px;font-weight:700;cursor:pointer;">💾 Save</button>
        </div>
      </div>
      <div class="overflow-x-auto"><table class="min-w-full text-sm"><thead class="bg-slate-100"><tr>
        <th class="px-3 py-2 text-left font-bold text-slate-600 uppercase text-xs">Labour Name</th>
        <th class="px-3 py-2 text-left font-bold text-slate-600 uppercase text-xs">Trade</th>
        <th class="px-3 py-2 text-center font-bold text-slate-600 uppercase text-xs">P</th>
        <th class="px-3 py-2 text-center font-bold text-slate-600 uppercase text-xs">Half</th>
        <th class="px-3 py-2 text-center font-bold text-slate-600 uppercase text-xs">Absent</th>
        <th class="px-3 py-2 text-center font-bold text-slate-600 uppercase text-xs">OT Hrs</th>
        <th class="px-3 py-2 text-center font-bold text-slate-600 uppercase text-xs">Shift</th>
      </tr></thead><tbody class="divide-y">${labours.map(l => {
    const rec = existing[l.id] || {};
    const s = rec.status || 'A';
    const ot = rec.ot || 0;
    const shift = rec.shift || 'Day';
    return `<tr class="hover:bg-slate-50">
      <td class="px-3 py-2.5 font-bold text-slate-800">${l.name}</td>
      <td class="px-3 py-2.5 text-slate-500 text-xs">${l.trade || '—'}</td>
      <td class="px-3 py-2.5 text-center"><input type="radio" name="att_${l.id}" value="P" ${s === 'P' ? 'checked' : ''} class="w-4 h-4 accent-green-500"></td>
      <td class="px-3 py-2.5 text-center"><input type="radio" name="att_${l.id}" value="H" ${s === 'H' ? 'checked' : ''} class="w-4 h-4 accent-orange-500"></td>
      <td class="px-3 py-2.5 text-center"><input type="radio" name="att_${l.id}" value="A" ${s === 'A' ? 'checked' : ''} class="w-4 h-4 accent-red-400"></td>
      <td class="px-3 py-2.5 text-center"><input type="number" id="ot_${l.id}" value="${ot}" min="0" max="12" class="w-14 p-1 border rounded text-xs text-center outline-none"></td>
      <td class="px-3 py-2.5 text-center"><select id="shift_${l.id}" class="p-1 border rounded text-xs outline-none"><option ${shift === 'Day' ? 'selected' : ''}>Day</option><option ${shift === 'Night' ? 'selected' : ''}>Night</option></select></td>
    </tr>`;
  }).join('')}</tbody></table></div>
    </div>`;
}

/** (legacy no-op) close handler kept for safety */
window._closeAttendanceSheet = function() {
  const sidebar = document.getElementById('appSidebar');
  if (sidebar) sidebar.style.display = '';
};

/** Bulk mark all workers in the sheet */
window._attMarkAll = function(status) {
  _projectLabour().forEach(l => {
    const radio = document.querySelector(`input[name="att_${l.id}"][value="${status}"]`);
    if (radio) radio.checked = true;
  });
  showToast(`Marked all as ${status === 'P' ? 'Present' : status === 'A' ? 'Absent' : 'Half-Day'}`, 'info');
};

/** Resolve a site/WO id to a readable label */
function _siteLabel(siteId) {
  const proj = (state.projects || []).find(p => p.id === state.currentProjectId);
  const g = proj?.boqs?.find(b => b.id === siteId);
  if (g) return (g.woNumber ? g.woNumber + ' — ' : '') + (g.name || g.type || 'BOQ');
  const loc = getAllLocations().find(l => l.id === siteId);
  return loc?.name || siteId || '';
}

export function saveAttendance() {
  const date = document.getElementById('attDate').value;
  const siteId = document.getElementById('attSite').value;
  if (!date || !siteId) return showToast('Load attendance sheet first', 'error');
  state.attendanceLogs = state.attendanceLogs.filter(a => !(a.date === date && a.siteId === siteId));
  _projectLabour().forEach(l => {
    const radios = document.querySelectorAll(`input[name="att_${l.id}"]`);
    let status = 'A';
    radios.forEach(r => { if (r.checked) status = r.value; });
    const ot = parseFloat(document.getElementById('ot_' + l.id)?.value) || 0;
    const shift = document.getElementById('shift_' + l.id)?.value || 'Day';
    state.attendanceLogs.push({ id: 'att_' + Date.now() + '_' + l.id, date, siteId, labourId: l.id, status, ot, shift });
  });
  saveLabourData(); renderMonthlyMuster();
  showToast('Attendance Saved!', 'success');
  if (typeof window._closeAttendanceSheet === 'function') window._closeAttendanceSheet();
}

// ──────────────────────────────────────────
// DAILY MUSTER ROLL — headcount for a site/day
// ──────────────────────────────────────────
window._dailyMusterRoll = function() {
  const date = document.getElementById('attDate')?.value || new Date().toISOString().split('T')[0];
  const siteId = document.getElementById('attSite')?.value || '';
  const logs = state.attendanceLogs.filter(a => a.date === date && (!siteId || a.siteId === siteId) && a.status !== 'A');
  if (!logs.length) { showToast('No attendance marked for this date/site', 'warning'); return; }

  // Group by trade
  const byTrade = {};
  logs.forEach(log => {
    const l = state.labourMaster.find(x => x.id === log.labourId);
    if (!l) return;
    const trade = l.trade || 'Other';
    if (!byTrade[trade]) byTrade[trade] = [];
    byTrade[trade].push({ name: l.name, status: log.status, ot: log.ot || 0, shift: log.shift || 'Day' });
  });

  const totalHead = logs.length;
  const dayShift = logs.filter(x => (x.shift || 'Day') === 'Day').length;
  const nightShift = logs.filter(x => x.shift === 'Night').length;
  const totalOT = logs.reduce((s, x) => s + (x.ot || 0), 0);

  let html = `<div style="position:fixed;inset:0;z-index:100000;background:rgba(0,0,0,.45);display:flex;align-items:center;justify-content:center;" onclick="if(event.target===this)this.remove()">
    <div style="background:#fff;border-radius:16px;width:92%;max-width:560px;max-height:85vh;overflow:hidden;display:flex;flex-direction:column;box-shadow:0 20px 50px rgba(0,0,0,.25);">
      <div style="padding:16px 20px;border-bottom:1px solid #e2e8f0;display:flex;justify-content:space-between;align-items:center;background:linear-gradient(135deg,#1e3a8a,#2563eb);color:#fff;">
        <div><h3 style="font-size:15px;font-weight:800;">Daily Muster Roll</h3><p style="font-size:11px;opacity:.85;">${date} • ${_siteLabel(siteId) || 'All Sites'}</p></div>
        <button onclick="this.closest('[style*=fixed]').remove()" style="width:28px;height:28px;border-radius:8px;background:rgba(255,255,255,.2);border:none;color:#fff;font-size:16px;cursor:pointer;">×</button>
      </div>
      <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px;padding:14px;background:#f8fafc;border-bottom:1px solid #e2e8f0;">
        <div style="text-align:center;"><div style="font-size:22px;font-weight:800;color:#1e3a8a;">${totalHead}</div><div style="font-size:9px;color:#94a3b8;text-transform:uppercase;font-weight:600;">Headcount</div></div>
        <div style="text-align:center;"><div style="font-size:22px;font-weight:800;color:#f59e0b;">${dayShift}</div><div style="font-size:9px;color:#94a3b8;text-transform:uppercase;font-weight:600;">Day Shift</div></div>
        <div style="text-align:center;"><div style="font-size:22px;font-weight:800;color:#6366f1;">${nightShift}</div><div style="font-size:9px;color:#94a3b8;text-transform:uppercase;font-weight:600;">Night Shift</div></div>
        <div style="text-align:center;"><div style="font-size:22px;font-weight:800;color:#10b981;">${totalOT}</div><div style="font-size:9px;color:#94a3b8;text-transform:uppercase;font-weight:600;">OT Hours</div></div>
      </div>
      <div style="overflow-y:auto;flex:1;padding:14px;">`;
  Object.keys(byTrade).sort().forEach(trade => {
    html += `<div style="margin-bottom:14px;">
      <div style="font-size:11px;font-weight:700;color:#475569;text-transform:uppercase;letter-spacing:.3px;margin-bottom:6px;border-bottom:1px solid #e2e8f0;padding-bottom:4px;">${trade} (${byTrade[trade].length})</div>
      ${byTrade[trade].map(w => `<div style="display:flex;justify-content:space-between;align-items:center;padding:5px 0;font-size:12px;">
        <span style="font-weight:600;color:#1e293b;">${w.name}</span>
        <span style="display:flex;gap:6px;align-items:center;">
          <span style="font-size:9px;font-weight:700;padding:2px 6px;border-radius:4px;${w.status === 'P' ? 'background:#ecfdf5;color:#059669;' : 'background:#fffbeb;color:#d97706;'}">${w.status === 'P' ? 'Present' : 'Half'}</span>
          <span style="font-size:9px;color:#64748b;">${w.shift}</span>
          ${w.ot ? `<span style="font-size:9px;color:#10b981;font-weight:700;">+${w.ot}h OT</span>` : ''}
        </span>
      </div>`).join('')}
    </div>`;
  });
  html += `</div></div></div>`;
  document.body.insertAdjacentHTML('beforeend', html);
};

export function renderMonthlyMuster() {
  const monthFilter = document.getElementById('attMonthFilter');
  if (monthFilter && monthFilter.options.length <= 1) {
    const months = [...new Set(state.attendanceLogs.map(a => a.date.substring(0, 7)))].sort().reverse();
    monthFilter.innerHTML = '';
    const thisMonth = new Date().toISOString().substring(0, 7);
    if (!months.includes(thisMonth)) months.unshift(thisMonth);
    months.forEach(m => monthFilter.innerHTML += `<option value="${m}">${m}</option>`);
  }
  const selMonth = monthFilter?.value || new Date().toISOString().substring(0, 7);
  const selSite = document.getElementById('attSiteFilter')?.value || '';
  const monthly = state.attendanceLogs.filter(a => a.date.startsWith(selMonth) && (!selSite || a.siteId === selSite));
  const tbody = document.getElementById('musterBody');
  if (!tbody) return;
  tbody.innerHTML = '';
  _projectLabour().forEach(l => {
    const myLogs = monthly.filter(a => a.labourId === l.id);
    const present = myLogs.filter(a => a.status === 'P').length;
    const half = myLogs.filter(a => a.status === 'H').length;
    const otHours = myLogs.reduce((s, a) => s + (a.ot || 0), 0);
    const wages = (present + half * 0.5) * l.dayRate + otHours * ((l.dayRate || 0) / 8) * 1.5;
    if (myLogs.length === 0) return;
    const existingSal = state.labourSalaries.find(s => s.labourId === l.id && s.month === selMonth);
    const actionBtn = existingSal ? `<span class="text-green-600 font-bold text-[10px] bg-green-50 px-2 py-1 rounded border border-green-200">✓ Posted</span>` : `<button onclick="generateLabourSalary('${l.id}', '${selMonth}', ${Math.round(wages)})" class="bg-blue-600 text-white hover:bg-blue-700 px-3 py-1 rounded shadow-sm text-[10px] font-bold uppercase transition">Post Salary</button>`;
    const [yr, mo] = selMonth.split('-').map(Number);
    const mEnd = `${selMonth}-${String(new Date(yr, mo, 0).getDate()).padStart(2, '0')}`;
    const musterBtn = `<button onclick="downloadMusterCard('${l.id}','${selMonth}-01','${mEnd}')" title="Download this worker's timesheet" class="bg-purple-50 text-purple-600 hover:bg-purple-100 px-2 py-1 rounded border border-purple-200 text-[10px] font-bold transition ml-1">📋</button>`;
    const otBadge = otHours ? ` <span class="text-[9px] text-emerald-600 font-bold">+${otHours}h OT</span>` : '';
    tbody.innerHTML += `<tr><td class="px-3 py-2 font-bold text-slate-800">${l.name}</td><td class="px-3 py-2 text-slate-500">${l.trade}${otBadge}</td><td class="px-3 py-2 text-center font-bold text-green-700">${present}</td><td class="px-3 py-2 text-center font-bold text-orange-600">${half}</td><td class="px-3 py-2 text-right font-bold text-slate-800">${getCurrencySymbol()}${wages.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</td><td class="px-3 py-2 text-center">${actionBtn}${musterBtn}</td></tr>`;
  });
  if (!tbody.innerHTML) tbody.innerHTML = '<tr><td colspan="6" class="p-4 text-center text-slate-400">No attendance records for selected month.</td></tr>';
}

export function generateLabourSalary(labourId, month, amount) {
  if (amount <= 0) return showToast('No wages generated to post!', 'warning');
  const existing = state.labourSalaries.find(s => s.labourId === labourId && s.month === month);
  if (existing) return showToast(`Salary for ${month} is already posted!`, 'error');
  state.labourSalaries.push({ id: 'lsal_' + Date.now(), labourId, month, amount, date: new Date().toISOString().split('T')[0] });
  saveLabourData(); renderMonthlyMuster();
  showToast('Salary Posted to Party Ledger as Payable!', 'success');
  window.renderPartiesList?.();
}

/** Chooser: All labour vs individual muster card */
window._musterCardChooser = function() {
  const labours = _projectLabour();
  if (!labours.length) { showToast('No labour records found', 'error'); return; }
  const monthFilter = document.getElementById('attMonthFilter');
  const selMonth = monthFilter?.value || new Date().toISOString().substring(0, 7);

  const [yr, mo] = selMonth.split('-').map(Number);
  const lastDay = new Date(yr, mo, 0).getDate();
  const mStart = `${selMonth}-01`;
  const mEnd = `${selMonth}-${String(lastDay).padStart(2, '0')}`;

  const opts = labours.map(l => `<option value="${l.id}">${l.name} (${l.trade || '—'})</option>`).join('');
  const html = `<div id="musterChooser" style="position:fixed;inset:0;z-index:100000;background:rgba(0,0,0,.45);display:flex;align-items:center;justify-content:center;" onclick="if(event.target===this)this.remove()">
    <div style="background:#fff;border-radius:16px;width:90%;max-width:400px;padding:24px;box-shadow:0 20px 50px rgba(0,0,0,.25);">
      <h3 style="font-size:16px;font-weight:800;color:#0f172a;margin-bottom:4px;">Generate Muster Card</h3>
      <p style="font-size:12px;color:#94a3b8;margin-bottom:16px;">Tracks present, half-days & OT hours</p>
      <button onclick="document.getElementById('musterChooser').remove();downloadMusterCard(null,'${mStart}','${mEnd}')" style="width:100%;padding:12px;background:#1e3a8a;color:#fff;border:none;border-radius:10px;font-size:14px;font-weight:700;cursor:pointer;margin-bottom:14px;">📋 All Labour Muster Roll (${selMonth})</button>
      <div style="border-top:1px solid #e2e8f0;padding-top:14px;">
        <label style="font-size:11px;font-weight:600;color:#64748b;text-transform:uppercase;display:block;margin-bottom:6px;">Individual worker timesheet</label>
        <select id="musterIndivSelect" style="width:100%;padding:10px;border:1px solid #e2e8f0;border-radius:8px;font-size:13px;margin-bottom:10px;">${opts}</select>
        <div style="display:flex;gap:8px;margin-bottom:10px;">
          <div style="flex:1;"><label style="font-size:10px;color:#94a3b8;font-weight:600;">From</label><input type="date" id="musterStart" value="${mStart}" style="width:100%;padding:8px;border:1px solid #e2e8f0;border-radius:8px;font-size:12px;"></div>
          <div style="flex:1;"><label style="font-size:10px;color:#94a3b8;font-weight:600;">To</label><input type="date" id="musterEnd" value="${mEnd}" style="width:100%;padding:8px;border:1px solid #e2e8f0;border-radius:8px;font-size:12px;"></div>
        </div>
        <button onclick="const id=document.getElementById('musterIndivSelect').value;const s=document.getElementById('musterStart').value;const e=document.getElementById('musterEnd').value;document.getElementById('musterChooser').remove();downloadMusterCard(id,s,e)" style="width:100%;padding:12px;background:#8b5cf6;color:#fff;border:none;border-radius:10px;font-size:14px;font-weight:700;cursor:pointer;">👤 Individual Timesheet</button>
      </div>
      <button onclick="document.getElementById('musterChooser').remove()" style="width:100%;padding:10px;background:#f1f5f9;color:#64748b;border:none;border-radius:8px;font-size:12px;font-weight:600;cursor:pointer;margin-top:10px;">Cancel</button>
    </div>
  </div>`;
  document.body.insertAdjacentHTML('beforeend', html);
};

export function downloadMusterCard(labourId, startDate, endDate) {
  // Default to current/selected month if no range given
  if (!startDate || !endDate) {
    const selMonth = document.getElementById('attMonthFilter')?.value || new Date().toISOString().substring(0, 7);
    const [yr, mo] = selMonth.split('-').map(Number);
    startDate = `${selMonth}-01`;
    endDate = `${selMonth}-${String(new Date(yr, mo, 0).getDate()).padStart(2, '0')}`;
  }

  // Build list of date strings in range
  const dateList = [];
  let d = new Date(startDate + 'T00:00:00');
  const end = new Date(endDate + 'T00:00:00');
  while (d <= end) { dateList.push(d.toISOString().split('T')[0]); d.setDate(d.getDate() + 1); }
  if (!dateList.length) { showToast('Invalid date range', 'error'); return; }

  const labourList = labourId ? state.labourMaster.filter(l => l.id === labourId) : state.labourMaster;
  if (!labourList.length) { showToast('Labour not found', 'error'); return; }

  const doc = new window.jspdf.jsPDF('l', 'mm', 'a4');
  let nextY = getCompanyHeaderForPDF(doc);
  doc.setFontSize(13); doc.setFont('helvetica', 'bold'); doc.setTextColor(30, 58, 138);
  const title = labourId
    ? `MUSTER CARD — ${labourList[0].name}`
    : `LABOUR MUSTER ROLL`;
  doc.text(title, 148, nextY, null, null, 'center');
  doc.setFontSize(9); doc.setFont('helvetica', 'normal'); doc.setTextColor(100, 116, 139);
  doc.text(`Period: ${startDate} to ${endDate}`, 148, nextY + 5, null, null, 'center');
  nextY += 11;

  const dayLabels = dateList.map(ds => String(parseInt(ds.split('-')[2])));
  const headRow = ['Name', 'Trade', ...dayLabels, 'P', 'H', 'A', 'OT', `Wages(${getCurrencySymbol()})`];
  const bodyRows = labourList.map(l => {
    const row = [l.name, l.trade || '—'];
    let p = 0, h = 0, a = 0, ot = 0;
    dateList.forEach(ds => {
      const log = state.attendanceLogs.find(att => att.labourId === l.id && att.date === ds);
      let cell = '-';
      if (log) {
        cell = log.status;
        if (log.status === 'P') p++; else if (log.status === 'H') h++; else if (log.status === 'A') a++;
        ot += (log.ot || 0);
        if (log.shift === 'Night' && log.status !== 'A') cell += '*';
      }
      row.push(cell);
    });
    const wages = Math.round((p + h * 0.5) * (l.dayRate || 0) + ot * ((l.dayRate || 0) / 8) * 1.5);
    row.push(p, h, a, ot, wages);
    return row;
  });
  doc.autoTable({ startY: nextY, head: [headRow], body: bodyRows, theme: 'grid', styles: { fontSize: 5.5, cellPadding: 1, overflow: 'linebreak' }, headStyles: { fillColor: [30, 58, 138], fontSize: 5.5 }, columnStyles: { 0: { cellWidth: 24, overflow: 'linebreak' }, 1: { cellWidth: 13 } } });

  let fy = doc.lastAutoTable.finalY + 6;
  doc.setFontSize(7); doc.setTextColor(100, 116, 139);
  doc.text('Legend: P=Present  H=Half-day  A=Absent  *=Night shift  OT=Overtime hours (paid at 1.5x)', 14, fy);

  const fname = labourId ? `Muster_${labourList[0].name.replace(/\s+/g, '_')}_${startDate}_${endDate}.pdf` : `Muster_Roll_${startDate}_${endDate}.pdf`;
  mobileSavePDF(doc, fname);
  showToast('Muster Card Downloaded!', 'success');
}

// ==========================================
// PARTIES LEDGER
// ==========================================
// Parties Ledger moved to ./parties.js

export function openLabourPaymentModal(labourId) {
  document.getElementById('lpLabourId').value = labourId;
  document.getElementById('lpDate').value = new Date().toISOString().split('T')[0];
  document.getElementById('lpAmount').value = '';
  document.getElementById('lpRef').value = '';
  const accSelect = document.getElementById('lpAccount');
  accSelect.innerHTML = '<option value="">-- Select Payment Account --</option>';
  state.accounts.forEach(a => accSelect.innerHTML += `<option value="${a.id}">${a.name}</option>`);
  document.getElementById('labourPaymentModal').classList.remove('hidden');
}

export function saveLabourPayment() {
  const labourId = document.getElementById('lpLabourId').value;
  const date = document.getElementById('lpDate').value;
  const accountId = document.getElementById('lpAccount').value;
  const amount = parseFloat(document.getElementById('lpAmount').value) || 0;
  const ref = document.getElementById('lpRef').value;
  if (amount <= 0 || !accountId) return showToast('Account and Valid Amount are required', 'error');
  state.labourPayments.push({ id: 'lpay_' + Date.now(), labourId, date, accountId, amount, ref });
  saveLabourData();
  document.getElementById('labourPaymentModal').classList.add('hidden');
  window.renderPartyTransactions?.(); window.renderPartiesList?.(); renderAccounts();
  showToast('Labour Payment Recorded!', 'success');
}

// ── Bulk Labour Payment ──
// ══════════════════════════════════════════
// PAYROLL — advances, deductions, settlement
// ══════════════════════════════════════════

/** Earned wages from attendance logs (all-time) for a worker, incl. OT at 1.5x */
function _labourEarnedFromAttendance(labourId) {
  const l = state.labourMaster.find(x => x.id === labourId);
  if (!l) return 0;
  const logs = (state.attendanceLogs || []).filter(a => a.labourId === labourId);
  const present = logs.filter(a => a.status === 'P').length;
  const half = logs.filter(a => a.status === 'H').length;
  const ot = logs.reduce((s, a) => s + (a.ot || 0), 0);
  const rate = l.dayRate || 0;
  return Math.round((present + half * 0.5) * rate + ot * (rate / 8) * 1.5);
}

/** Net outstanding for a worker. Uses posted salary if any, else earned-from-attendance. */
function _labourNetPayable(labourId) {
  const postedSalary = (state.labourSalaries || []).filter(s => s.labourId === labourId).reduce((s, x) => s + (parseFloat(x.amount) || 0), 0);
  const earned = _labourEarnedFromAttendance(labourId);
  // Use the larger of posted salary vs earned-from-attendance so workers always show
  const salary = Math.max(postedSalary, earned);
  const paid = (state.labourPayments || []).filter(p => p.labourId === labourId).reduce((s, x) => s + (parseFloat(x.amount) || 0), 0);
  const advances = (state.labourAdvances || []).filter(a => a.labourId === labourId && !a.settled).reduce((s, x) => s + (parseFloat(x.amount) || 0), 0);
  const deductions = (state.labourDeductions || []).filter(d => d.labourId === labourId && !d.settled).reduce((s, x) => s + (parseFloat(x.amount) || 0), 0);
  return { salary, paid, advances, deductions, net: salary - paid - advances - deductions };
}

/** recordAdvancePayment — log kharchi (mid-week cash advance) */
window._recordAdvance = function() {
  const labours = _projectLabour();
  if (!labours.length) { showToast('No labour records', 'error'); return; }
  const opts = labours.map(l => `<option value="${l.id}">${l.name} (${l.trade || '—'})</option>`).join('');
  const accOpts = (state.accounts || []).map(a => `<option value="${a.id}">${a.name} (${a.type})</option>`).join('');
  _payrollModal('Record Advance (Kharchi)', `
    <label class="pm-l">Worker</label><select id="pmWorker" class="pm-i">${opts}</select>
    <label class="pm-l">Amount (₹)</label><input type="number" id="pmAmount" class="pm-i" placeholder="0">
    <label class="pm-l">Date</label><input type="date" id="pmDate" class="pm-i" value="${new Date().toISOString().split('T')[0]}">
    <label class="pm-l">Pay from account</label><select id="pmAccount" class="pm-i">${accOpts}</select>
    <label class="pm-l">Note</label><input type="text" id="pmNote" class="pm-i" placeholder="Advance / Kharchi">
  `, () => {
    const labourId = document.getElementById('pmWorker').value;
    const amount = parseFloat(document.getElementById('pmAmount').value) || 0;
    const date = document.getElementById('pmDate').value;
    const accountId = document.getElementById('pmAccount').value;
    const note = document.getElementById('pmNote').value || 'Advance';
    if (amount <= 0) { showToast('Enter valid amount', 'error'); return false; }
    state.labourAdvances.push({ id: 'adv_' + Date.now(), labourId, amount, date, accountId, note, settled: false });
    saveAllData(); renderMonthlyMuster(); window.renderPartiesList?.();
    showToast(`Advance ₹${amount.toLocaleString('en-IN')} recorded`, 'success');
    return true;
  });
};

/** recordDeduction — lost tools, PPE, penalties */
window._recordDeduction = function() {
  const labours = _projectLabour();
  if (!labours.length) { showToast('No labour records', 'error'); return; }
  const opts = labours.map(l => `<option value="${l.id}">${l.name} (${l.trade || '—'})</option>`).join('');
  _payrollModal('Record Deduction', `
    <label class="pm-l">Worker</label><select id="pmWorker" class="pm-i">${opts}</select>
    <label class="pm-l">Type</label><select id="pmType" class="pm-i"><option>Lost Tool</option><option>Damaged PPE</option><option>Penalty</option><option>Damage</option><option>Other</option></select>
    <label class="pm-l">Amount (₹)</label><input type="number" id="pmAmount" class="pm-i" placeholder="0">
    <label class="pm-l">Date</label><input type="date" id="pmDate" class="pm-i" value="${new Date().toISOString().split('T')[0]}">
    <label class="pm-l">Note</label><input type="text" id="pmNote" class="pm-i" placeholder="Details">
  `, () => {
    const labourId = document.getElementById('pmWorker').value;
    const deductionType = document.getElementById('pmType').value;
    const amount = parseFloat(document.getElementById('pmAmount').value) || 0;
    const date = document.getElementById('pmDate').value;
    const note = document.getElementById('pmNote').value || '';
    if (amount <= 0) { showToast('Enter valid amount', 'error'); return false; }
    state.labourDeductions.push({ id: 'ded_' + Date.now(), labourId, deductionType, amount, date, note, settled: false });
    saveAllData(); renderMonthlyMuster(); window.renderPartiesList?.();
    showToast(`Deduction ₹${amount.toLocaleString('en-IN')} (${deductionType}) recorded`, 'success');
    return true;
  });
};

/** processBulkPayment — enter ONE amount, apply to selected workers, deduct each one's advances */
window._bulkLabourPayment = function() {
  // Daily-wage workers only — piece-rate workers are paid via Gang Payout
  const labours = _projectLabour().filter(l => (l.compType || 'DAILY_WAGE') !== 'PIECE_RATE');
  if (!labours.length) { showToast('No daily-wage labour found (piece-rate workers use Gang Payout).', 'error'); return; }
  if (!state.accounts.length) { showToast('Create a payment account first (Bank & Cash)', 'error'); return; }

  const cur = getCurrencySymbol();
  const accOpts = state.accounts.map(a => `<option value="${a.id}">${a.name} (${a.type})</option>`).join('');

  // Build worker checklist rows with their pending advance shown
  const rowsHtml = labours.map(l => {
    const adv = (state.labourAdvances || []).filter(a => a.labourId === l.id && !a.settled).reduce((s, x) => s + (parseFloat(x.amount) || 0), 0);
    return `<tr data-lid="${l.id}" data-adv="${adv}" style="border-bottom:1px solid #f1f5f9;">
      <td style="padding:7px 10px;"><input type="checkbox" class="bp-chk" value="${l.id}" checked style="width:16px;height:16px;" onchange="window._bpRecalc()"></td>
      <td style="padding:7px 10px;font-weight:600;">${l.name}<div style="font-size:10px;color:#94a3b8;">${l.trade || '—'}</div></td>
      <td style="padding:7px 10px;text-align:right;color:#ea580c;font-size:11px;">${adv ? '−' + cur + adv.toLocaleString('en-IN') : '—'}</td>
      <td class="bp-net" style="padding:7px 10px;text-align:right;font-weight:700;color:#059669;">—</td>
    </tr>`;
  }).join('');

  _payrollModal('Bulk Payment', `
    <label class="pm-l">Amount per worker (₹)</label>
    <input type="number" id="bpAmount" class="pm-i" placeholder="e.g. 500" oninput="window._bpRecalc()">
    <label class="pm-l">Pay from account</label>
    <select id="pmAccount" class="pm-i">${accOpts}</select>
    <div style="display:flex;justify-content:space-between;align-items:center;margin:12px 0 6px;">
      <label style="display:flex;align-items:center;gap:6px;font-size:12px;font-weight:600;color:#475569;cursor:pointer;"><input type="checkbox" id="bpSelectAll" checked onchange="document.querySelectorAll('.bp-chk').forEach(c=>c.checked=this.checked);window._bpRecalc()" style="width:16px;height:16px;"> Select All</label>
      <span style="font-size:11px;color:#94a3b8;"><span id="bpCount">${labours.length}</span> selected</span>
    </div>
    <div style="max-height:260px;overflow-y:auto;border:1px solid #e2e8f0;border-radius:8px;">
      <table style="width:100%;border-collapse:collapse;font-size:12px;">
        <thead><tr style="background:#f8fafc;position:sticky;top:0;">
          <th style="padding:7px 10px;width:30px;"></th>
          <th style="padding:7px 10px;text-align:left;font-size:9px;color:#64748b;text-transform:uppercase;">Worker</th>
          <th style="padding:7px 10px;text-align:right;font-size:9px;color:#64748b;text-transform:uppercase;">Advance</th>
          <th style="padding:7px 10px;text-align:right;font-size:9px;color:#64748b;text-transform:uppercase;">Net Pay</th>
        </tr></thead><tbody id="bpBody">${rowsHtml}</tbody>
      </table>
    </div>
    <div style="display:flex;justify-content:space-between;align-items:center;padding:10px 14px;background:#0f172a;color:#fff;border-radius:8px;margin-top:12px;">
      <span style="font-size:12px;font-weight:600;">Total Payout</span>
      <span id="bpTotal" style="font-size:18px;font-weight:800;color:#10b981;">${cur}0</span>
    </div>
  `, () => {
    const amt = parseFloat(document.getElementById('bpAmount').value) || 0;
    const accountId = document.getElementById('pmAccount').value;
    if (amt <= 0) { showToast('Enter amount per worker', 'error'); return false; }
    const checked = [...document.querySelectorAll('.bp-chk:checked')];
    if (!checked.length) { showToast('Select at least one worker', 'error'); return false; }
    const date = new Date().toISOString().split('T')[0];
    let totalPaid = 0;
    checked.forEach(c => {
      const lid = c.value;
      const adv = (state.labourAdvances || []).filter(a => a.labourId === lid && !a.settled).reduce((s, x) => s + (parseFloat(x.amount) || 0), 0);
      const net = Math.max(0, amt - adv);
      // Record payment (net of advance)
      state.labourPayments.push({ id: 'lpay_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6), labourId: lid, date, accountId, amount: net, ref: adv ? `Bulk Pay (₹${amt} − ₹${adv} advance)` : 'Bulk Payment' });
      // Settle that worker's advances
      (state.labourAdvances || []).filter(a => a.labourId === lid && !a.settled).forEach(a => a.settled = true);
      totalPaid += net;
    });
    saveAllData(); renderMonthlyMuster(); window.renderPartiesList?.();
    showToast(`Paid ${cur}${totalPaid.toLocaleString('en-IN')} to ${checked.length} workers (advances deducted)`, 'success');
    return true;
  }, 'Pay Selected', 480);

  setTimeout(() => window._bpRecalc(), 30);
};

/** Recalculate net pay per worker = amount − their advance */
window._bpRecalc = function() {
  const amt = parseFloat(document.getElementById('bpAmount')?.value) || 0;
  const cur = getCurrencySymbol();
  let total = 0, count = 0;
  document.querySelectorAll('#bpBody tr').forEach(tr => {
    const chk = tr.querySelector('.bp-chk');
    const adv = parseFloat(tr.dataset.adv) || 0;
    const netCell = tr.querySelector('.bp-net');
    if (chk && chk.checked) {
      const net = Math.max(0, amt - adv);
      netCell.textContent = cur + net.toLocaleString('en-IN');
      netCell.style.color = '#059669';
      total += net; count++;
    } else {
      netCell.textContent = '—';
      netCell.style.color = '#cbd5e1';
    }
  });
  const totalEl = document.getElementById('bpTotal');
  if (totalEl) totalEl.textContent = cur + total.toLocaleString('en-IN');
  const countEl = document.getElementById('bpCount');
  if (countEl) countEl.textContent = count;
};

/** calculateFinalSettlement — worker leaving the site */
window._finalSettlement = function() {
  const labours = _projectLabour();
  if (!labours.length) { showToast('No labour records', 'error'); return; }
  const opts = labours.map(l => `<option value="${l.id}">${l.name} (${l.trade || '—'})</option>`).join('');
  const accOpts = (state.accounts || []).map(a => `<option value="${a.id}">${a.name} (${a.type})</option>`).join('');
  _payrollModal('Final Settlement', `
    <label class="pm-l">Worker leaving</label><select id="pmWorker" class="pm-i" onchange="window._fsPreview()">${opts}</select>
    <div id="fsBreakdown" style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:12px;margin:10px 0;font-size:12px;"></div>
    <label class="pm-l">Settle via account</label><select id="pmAccount" class="pm-i">${accOpts}</select>
  `, () => {
    const labourId = document.getElementById('pmWorker').value;
    const accountId = document.getElementById('pmAccount').value;
    const calc = _labourNetPayable(labourId);
    const ppeDue = _unreturnedPPEValue(labourId);
    const finalNet = calc.net - ppeDue; // deduct unreturned PPE
    const date = new Date().toISOString().split('T')[0];
    if (finalNet > 0) {
      state.labourPayments.push({ id: 'lpay_' + Date.now(), labourId, date, accountId, amount: finalNet, ref: ppeDue ? `Final Settlement (− ${getCurrencySymbol()}${ppeDue} unreturned PPE)` : 'Final Settlement' });
    } else if (finalNet < 0) {
      showToast(`Worker owes ${getCurrencySymbol()}${Math.abs(finalNet).toLocaleString('en-IN')} — recover before exit`, 'warning');
    }
    (state.labourAdvances || []).filter(a => a.labourId === labourId).forEach(a => a.settled = true);
    (state.labourDeductions || []).filter(d => d.labourId === labourId).forEach(d => d.settled = true);
    // Mark unreturned PPE as written-off (deducted)
    (state.labourPPE || []).filter(p => p.labourId === labourId && !p.returned).forEach(p => { p.returned = true; p.writtenOff = true; });
    const l = state.labourMaster.find(x => x.id === labourId);
    if (l) l.status = 'Settled';
    saveAllData(); renderMonthlyMuster(); window.renderPartiesList?.(); renderLabourMasterList();
    showToast(`Final settlement done for ${l?.name || 'worker'}`, 'success');
    return true;
  }, 'Settle & Close', 460);
  setTimeout(() => window._fsPreview(), 50);
};

window._fsPreview = function() {
  const sel = document.getElementById('pmWorker');
  const box = document.getElementById('fsBreakdown');
  if (!sel || !box) return;
  const c = _labourNetPayable(sel.value);
  const ppeDue = _unreturnedPPEValue(sel.value);
  const finalNet = c.net - ppeDue;
  const cur = getCurrencySymbol();
  box.innerHTML = `
    <div style="display:flex;justify-content:space-between;padding:3px 0;"><span style="color:#64748b;">Total Salary Earned</span><span style="font-weight:700;color:#2563eb;">${cur}${c.salary.toLocaleString('en-IN')}</span></div>
    <div style="display:flex;justify-content:space-between;padding:3px 0;"><span style="color:#64748b;">Already Paid</span><span style="font-weight:700;">−${cur}${c.paid.toLocaleString('en-IN')}</span></div>
    <div style="display:flex;justify-content:space-between;padding:3px 0;"><span style="color:#64748b;">Pending Advances</span><span style="font-weight:700;color:#ea580c;">−${cur}${c.advances.toLocaleString('en-IN')}</span></div>
    <div style="display:flex;justify-content:space-between;padding:3px 0;"><span style="color:#64748b;">Deductions</span><span style="font-weight:700;color:#dc2626;">−${cur}${c.deductions.toLocaleString('en-IN')}</span></div>
    <div style="display:flex;justify-content:space-between;padding:3px 0;"><span style="color:#64748b;">Unreturned PPE</span><span style="font-weight:700;color:#d97706;">−${cur}${ppeDue.toLocaleString('en-IN')}</span></div>
    <div style="display:flex;justify-content:space-between;padding:8px 0 0;border-top:1px solid #e2e8f0;margin-top:6px;"><span style="font-weight:800;">Final ${finalNet >= 0 ? 'Payable' : 'Recoverable'}</span><span style="font-weight:800;font-size:15px;color:${finalNet >= 0 ? '#059669' : '#dc2626'};">${cur}${Math.abs(finalNet).toLocaleString('en-IN')}</span></div>`;
};

/** Reusable payroll modal */
function _payrollModal(title, bodyHtml, onSave, saveLabel = 'Save', maxW = 380) {
  const existing = document.getElementById('payrollModal');
  if (existing) existing.remove();
  const html = `<div id="payrollModal" style="position:fixed;inset:0;z-index:100001;background:rgba(0,0,0,.45);display:flex;align-items:center;justify-content:center;" onclick="if(event.target===this)this.remove()">
    <div style="background:#fff;border-radius:16px;width:92%;max-width:${maxW}px;max-height:88vh;overflow-y:auto;padding:22px;box-shadow:0 20px 50px rgba(0,0,0,.25);">
      <h3 style="font-size:16px;font-weight:800;color:#0f172a;margin-bottom:14px;">${title}</h3>
      <div>${bodyHtml}</div>
      <div style="display:flex;gap:8px;margin-top:16px;">
        <button id="pmCancel" style="flex:1;padding:11px;background:#f1f5f9;color:#64748b;border:none;border-radius:9px;font-size:13px;font-weight:700;cursor:pointer;">Cancel</button>
        <button id="pmSave" style="flex:2;padding:11px;background:#2563eb;color:#fff;border:none;border-radius:9px;font-size:13px;font-weight:700;cursor:pointer;">${saveLabel}</button>
      </div>
    </div>
  </div>`;
  document.body.insertAdjacentHTML('beforeend', html);
  // Inject small styles for labels/inputs once
  if (!document.getElementById('pmStyles')) {
    const st = document.createElement('style');
    st.id = 'pmStyles';
    st.textContent = '.pm-l{display:block;font-size:11px;font-weight:600;color:#64748b;text-transform:uppercase;margin:10px 0 4px;}.pm-i{width:100%;padding:10px;border:1px solid #e2e8f0;border-radius:8px;font-size:13px;outline:none;}';
    document.head.appendChild(st);
  }
  document.getElementById('pmCancel').onclick = () => document.getElementById('payrollModal').remove();
  document.getElementById('pmSave').onclick = () => { if (onSave() !== false) document.getElementById('payrollModal').remove(); };
}

// ==========================================
// PURCHASE FORM PANEL (Full-page overlay)
// ==========================================
// Purchase entry panel moved to ./purchase.js


// ==========================================
// SIDEBAR DROPDOWN
// ==========================================
export function toggleSidebarDropdown(btn) {
  const menu = btn.nextElementSibling;
  if (!menu) return;
  btn.classList.toggle('open');
  if (menu.classList.contains('hidden')) {
    menu.classList.remove('hidden');
    menu.style.maxHeight = '0'; menu.style.overflow = 'hidden'; menu.style.transition = 'max-height 0.28s ease-out';
    requestAnimationFrame(() => { menu.style.maxHeight = menu.scrollHeight + 'px'; });
    setTimeout(() => { menu.style.maxHeight = ''; menu.style.overflow = ''; menu.style.transition = ''; }, 300);
  } else {
    menu.style.maxHeight = menu.scrollHeight + 'px'; menu.style.overflow = 'hidden'; menu.style.transition = 'max-height 0.22s ease-in';
    requestAnimationFrame(() => { menu.style.maxHeight = '0'; });
    setTimeout(() => { menu.classList.add('hidden'); menu.style.maxHeight = ''; menu.style.overflow = ''; menu.style.transition = ''; }, 240);
  }
}

// ==========================================
// GENERIC FULL-SCREEN FORM HELPERS
// ==========================================
// Shared form helpers moved to ./formHelpers.js

// ==========================================
// PAYMENT-OUT MODULE
// ==========================================
// Payment-Out & Expense forms moved to ./expenseOut.js

// Purchase Order / Return / Fixed Asset forms moved to ./purchaseDocs.js

export function setSIPayMode(mode) {
  const creditBtn = document.getElementById('siToggleCredit');
  const cashBtn = document.getElementById('siToggleCash');
  const hidden = document.getElementById('siFormPayType');
  if (hidden) hidden.value = mode;
  if (mode === 'Credit') {
    if (creditBtn) creditBtn.className = 'px-4 py-1.5 rounded-full text-xs font-bold transition-all bg-blue-500 text-white shadow-sm';
    if (cashBtn) cashBtn.className = 'px-4 py-1.5 rounded-full text-xs font-bold transition-all text-slate-500 hover:text-slate-700';
  } else {
    if (cashBtn) cashBtn.className = 'px-4 py-1.5 rounded-full text-xs font-bold transition-all bg-green-500 text-white shadow-sm';
    if (creditBtn) creditBtn.className = 'px-4 py-1.5 rounded-full text-xs font-bold transition-all text-slate-500 hover:text-slate-700';
  }
}

// ── Project dropdown populate ──
function _populateSIProjectSelect() {
  const sel = document.getElementById('siFormProject');
  if (!sel) return;
  sel.innerHTML = '<option value="">-- Select Project --</option>';
  (state.projects || []).forEach(p => {
    sel.innerHTML += `<option value="${p.id}">${p.name}${p.clientName ? ' — ' + p.clientName : ''}</option>`;
  });
}

// ── Project change handler ──
export function onSIProjectChange() {
  const projId = document.getElementById('siFormProject')?.value;
  const clientSel = document.getElementById('siFormClient');
  const woSel = document.getElementById('siFormWO');
  // Clear WO dropdown
  if (woSel) woSel.innerHTML = '<option value="">-- Select WO/PO --</option>';
  document.getElementById('siFormPO').value = '';
  document.getElementById('siFormPODate').value = '';
  if (!projId) { loadSIPendingItems(); return; }
  const proj = (state.projects || []).find(p => p.id === projId);
  if (!proj) return;
  // Auto-select client matching this project
  if (clientSel && proj.clientName) {
    const matchClient = state.clients.find(c =>
      c.name.toLowerCase().trim() === proj.clientName.toLowerCase().trim() ||
      (c.projectName || '').toLowerCase().trim() === proj.name.toLowerCase().trim()
    );
    if (matchClient) {
      clientSel.value = matchClient.id;
    } else {
      // Client not in master list — add as temporary option from project data
      const tempId = 'proj_client_' + projId;
      // Remove any previous temp option
      const oldTemp = clientSel.querySelector(`option[value="${tempId}"]`);
      if (oldTemp) oldTemp.remove();
      const opt = document.createElement('option');
      opt.value = tempId;
      opt.textContent = proj.clientName + ' (from Project)';
      opt.dataset.projClient = '1';
      opt.dataset.clientName = proj.clientName;
      opt.dataset.clientPhone = proj.clientPhone || '';
      opt.dataset.clientEmail = proj.clientEmail || '';
      opt.dataset.clientGst = proj.clientGst || '';
      opt.dataset.clientAddress = proj.clientAddress || '';
      clientSel.appendChild(opt);
      clientSel.value = tempId;
    }
  }
  // Populate WO dropdown from ALL project BOQ groups
  const boqs = proj.boqs || [];
  boqs.forEach(g => {
    const label = g.woNumber
      ? `${g.woNumber} (${g.name || 'BOQ'})`
      : `${g.name || 'BOQ'} — No WO`;
    woSel.innerHTML += `<option value="${g.id}" data-wo="${g.woNumber || ''}" data-date="${g.woDate || ''}" data-gst="${g.gstRate || 18}" data-gsttype="${g.gstType || 'CGST_SGST'}" data-povalue="${g.poValue || ''}" data-sac="${g.sacCode || ''}" data-retention="${g.retention || ''}">${label}</option>`;
  });
  // Also add project-level woNumber if it exists and no boqs have it
  if (proj.woNumber && !boqs.some(g => g.woNumber)) {
    woSel.innerHTML += `<option value="proj_wo" data-wo="${proj.woNumber}" data-date="${proj.woDate || ''}">${proj.woNumber} (Project)</option>`;
  }
  loadSIPendingItems();
}

// ── WO/PO selection handler ──
export function onSIWOChange() {
  const woSel = document.getElementById('siFormWO');
  if (!woSel) return;
  const opt = woSel.selectedOptions[0];
  if (!opt || !opt.value) return;
  const wo = opt.dataset.wo || '';
  const woDate = opt.dataset.date || '';
  const gstRate = opt.dataset.gst || '';
  // Fill PO fields
  document.getElementById('siFormPO').value = wo;
  if (woDate) document.getElementById('siFormPODate').value = woDate;
  // Fill GST if available
  if (gstRate) {
    const gstEl = document.getElementById('siFormGstPct');
    if (gstEl) { gstEl.value = gstRate; calcSIFormTotal(); }
  }
}

// ── Build master item index for autocomplete ──
function _buildItemIndex(clientId) {
  const idx = [];
  const seen = new Set();
  // 1. Pending abstracts for this client
  (state.abstracts || []).filter(a => a.clientId === clientId && a.status !== 'invoiced').forEach(a => {
    (a.items || []).forEach(item => {
      const name = (item.description || item.code || '').trim();
      if (!name) return;
      idx.push({ name, hsn: item.hsn || '', unit: item.uom || item.unit || 'Nos', rate: item.rate || 0, qty: item.totalQty || item.qty || 0, source: 'abstract', sourceLabel: a.name || a.id, abstractId: a.id, group: 'pending' });
    });
  });
  // 2. Previously used items from itemsMaster (sorted by usage)
  const master = [...(state.itemsMaster || [])].sort((a, b) => (b.usageCount || 0) - (a.usageCount || 0) || new Date(b.lastUsed || 0) - new Date(a.lastUsed || 0));
  master.forEach(m => {
    const key = m.name.toLowerCase().trim();
    if (seen.has(key)) return;
    seen.add(key);
    idx.push({ name: m.name, hsn: m.hsn || '', unit: m.unit || 'Nos', rate: m.defaultRate || 0, source: 'master', usageCount: m.usageCount || 0, group: 'used' });
  });
  // 3. Client-specific items
  const clientItems = state.items?.[clientId] || {};
  Object.values(clientItems).forEach(item => {
    const key = (item.description || item.code || '').toLowerCase().trim();
    if (seen.has(key) || !key) return;
    seen.add(key);
    idx.push({ name: item.description || item.code, hsn: item.hsn || '', unit: item.uom || 'Nos', rate: item.rate || 0, source: 'client', group: 'used' });
  });
  return idx;
}

// ── Smart Item Autocomplete ──
export function onSIItemInput(inputEl) {
  clearTimeout(_siItemDebounce);
  _siItemDebounce = setTimeout(() => _showItemDropdown(inputEl), 300);
}

function _showItemDropdown(inputEl) {
  const q = (inputEl.value || '').toLowerCase().trim();
  const row = inputEl.closest('tr');
  let dd = row.querySelector('.si-ac-dropdown');
  if (!dd) {
    const wrap = inputEl.parentElement;
    wrap.style.position = 'relative';
    dd = document.createElement('div');
    dd.className = 'si-ac-dropdown';
    wrap.appendChild(dd);
  }
  if (!q) { dd.classList.remove('active'); return; }
  const clientId = document.getElementById('siFormClient')?.value || '';
  const items = _buildItemIndex(clientId);
  const filtered = items.filter(i => i.name.toLowerCase().includes(q));
  if (!filtered.length) {
    dd.innerHTML = `<div class="si-ac-group"><div class="si-ac-option"><span class="ac-name" style="color:#d97706;font-style:italic;">&#10010; Create "${inputEl.value.trim()}"</span><span class="ac-badge new">NEW</span></div></div>`;
    dd.classList.add('active');
    dd.querySelector('.si-ac-option').onclick = () => { dd.classList.remove('active'); };
    return;
  }
  const pending = filtered.filter(i => i.group === 'pending');
  const used = filtered.filter(i => i.group === 'used');
  let html = '';
  if (pending.length) {
    html += `<div class="si-ac-group"><div class="si-ac-group-label">Pending Abstracts</div>`;
    pending.forEach((item, i) => {
      html += `<div class="si-ac-option" data-type="pending" data-idx="${i}"><div><span class="ac-name">${_hl(item.name, q)}</span><div class="ac-meta">${item.sourceLabel} &middot; Qty: ${item.qty} &middot; ${getCurrencySymbol()}${parseFloat(item.rate).toLocaleString('en-IN')}</div></div><span class="ac-badge pending">PENDING</span></div>`;
    });
    html += '</div>';
  }
  if (used.length) {
    html += `<div class="si-ac-group"><div class="si-ac-group-label">Previously Used</div>`;
    used.slice(0, 10).forEach((item, i) => {
      const meta = item.usageCount ? `Used ${item.usageCount}x` : 'Client item';
      html += `<div class="si-ac-option" data-type="used" data-idx="${i}"><div><span class="ac-name">${_hl(item.name, q)}</span><div class="ac-meta">${meta} &middot; ${getCurrencySymbol()}${parseFloat(item.rate).toLocaleString('en-IN')} / ${item.unit}</div></div><span class="ac-badge used">SAVED</span></div>`;
    });
    html += '</div>';
  }
  dd.innerHTML = html;
  dd.classList.add('active');
  // Bind clicks
  dd.querySelectorAll('.si-ac-option[data-type="pending"]').forEach(opt => {
    opt.onclick = () => {
      const pi = pending[parseInt(opt.dataset.idx)];
      _fillSIRowFromItem(row, pi);
      dd.classList.remove('active');
    };
  });
  dd.querySelectorAll('.si-ac-option[data-type="used"]').forEach(opt => {
    opt.onclick = () => {
      const ui = used[parseInt(opt.dataset.idx)];
      _fillSIRowFromItem(row, ui);
      dd.classList.remove('active');
    };
  });
}

function _hl(text, q) {
  if (!q) return text;
  const re = new RegExp('(' + q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ')', 'gi');
  return text.replace(re, '<strong style="color:#2563eb">$1</strong>');
}

function _fillSIRowFromItem(row, item) {
  const nameInput = row.querySelector('.si-item-name');
  if (nameInput) nameInput.value = item.name;
  const hsnInput = row.querySelector('.si-item-hsn');
  if (hsnInput) hsnInput.value = item.hsn || '';
  const unitSel = row.querySelector('.si-item-unit');
  if (unitSel) unitSel.value = item.unit || 'Nos';
  const rateInput = row.querySelector('.si-item-rate');
  if (rateInput) rateInput.value = item.rate || '';
  if (item.qty) {
    const qtyInput = row.querySelector('.si-item-qty');
    if (qtyInput) qtyInput.value = item.qty;
  }
  // Store abstract ref
  if (item.abstractId) row.dataset.abstractId = item.abstractId;
  calcSIFormTotal();
}

export function closeSIDropdowns() {
  document.querySelectorAll('#siFormTableBody .si-ac-dropdown.active').forEach(d => d.classList.remove('active'));
  const po = document.getElementById('siPODropdown');
  if (po) po.classList.remove('active');
}

// ── PO Combo-box ──
export function searchSIPO() {
  const input = document.getElementById('siFormPO');
  const dd = document.getElementById('siPODropdown');
  if (!input || !dd) return;
  const q = (input.value || '').toLowerCase().trim();
  const allPOs = [...(state.savedPOs || [])];
  // Also gather from purchase orders
  (state.purchaseOrders || []).forEach(po => {
    if (!allPOs.find(p => p.poNumber === po.poNo)) {
      allPOs.push({ id: po.id, poNumber: po.poNo || po.id, date: po.date || '', vendor: po.vendorName || '', amount: po.total || 0 });
    }
  });
  // Also gather WO numbers from project BOQ groups
  const selProjId = document.getElementById('siFormProject')?.value;
  const projList = selProjId ? (state.projects || []).filter(p => p.id === selProjId) : (state.projects || []);
  projList.forEach(proj => {
    (proj.boqs || []).forEach(g => {
      if (g.woNumber && !allPOs.find(p => p.poNumber === g.woNumber)) {
        allPOs.push({ id: g.id, poNumber: g.woNumber, date: g.woDate || '', vendor: proj.clientName || '', amount: g.poValue || 0, isProjectWO: true, projName: proj.name });
      }
    });
  });
  const filtered = q ? allPOs.filter(p => (p.poNumber || '').toLowerCase().includes(q)) : allPOs;
  if (!filtered.length) { dd.classList.remove('active'); return; }
  dd.innerHTML = filtered.map(p => `<div class="si-po-option" data-id="${p.id}" data-po="${p.poNumber}"><div class="po-num">${p.poNumber}</div><div class="po-detail">${p.date || 'No date'} ${p.vendor ? '&middot; ' + p.vendor : ''} ${p.amount ? '&middot; ' + getCurrencySymbol() + parseFloat(p.amount).toLocaleString('en-IN') : ''}</div></div>`).join('');
  dd.classList.add('active');
  dd.querySelectorAll('.si-po-option').forEach(opt => {
    opt.onclick = () => {
      input.value = opt.dataset.po;
      const idEl = document.getElementById('siFormPOId');
      if (idEl) idEl.value = opt.dataset.id;
      // Try to fill PO date
      const match = filtered.find(p => p.id === opt.dataset.id);
      if (match?.date) { const dateEl = document.getElementById('siFormPODate'); if (dateEl) dateEl.value = match.date; }
      dd.classList.remove('active');
    };
  });
}

// ── Client change handler ──
export function onSIClientChange() {
  const clientId = document.getElementById('siFormClient')?.value;
  const client = state.clients.find(c => c.id === clientId);
  // Auto-select project if client matches a project's clientName
  if (client && !document.getElementById('siFormProject')?.value) {
    const matchProj = (state.projects || []).find(p =>
      p.clientName && p.clientName.toLowerCase().trim() === client.name.toLowerCase().trim()
    );
    if (matchProj) {
      const projSel = document.getElementById('siFormProject');
      if (projSel) { projSel.value = matchProj.id; onSIProjectChange(); }
    }
  }
  loadSIPendingItems();
  // Clear existing autocomplete caches
  window._siPendingRows = null;
}

// ── Pending items loader ──
export function loadSIPendingItems() {
  const clientId = document.getElementById('siFormClient')?.value;
  const projId = document.getElementById('siFormProject')?.value;
  const panel = document.getElementById('siPendingItemsPanel');
  const tbody = document.getElementById('siPendingItemsBody');
  if (!panel || !tbody) return;
  if (!clientId && !projId) { panel.classList.add('hidden'); tbody.innerHTML = ''; return; }
  let rows = [];
  // One row per pending abstract with total amount
  (state.abstracts || []).filter(a => {
    if (a.status === 'invoiced') return false;
    if (projId && a.projectId === projId) return true;
    if (clientId && a.clientId === clientId) return true;
    return false;
  }).forEach(a => {
    const totalAmt = (a.items || []).reduce((s, item) => s + ((item.totalQty || item.qty || 0) * (item.rate || 0)), 0);
    rows.push({ source: a.name || a.id, desc: 'Civil Work as per Annexure', hsn: '', qty: 1, rate: totalAmt, unit: 'LS', abstractId: a.id });
  });
  if (!rows.length) { panel.classList.add('hidden'); tbody.innerHTML = ''; return; }
  // Check which abstracts are already added to the invoice
  const addedAbstracts = new Set();
  const siTbody = document.getElementById('siFormTableBody');
  if (siTbody) Array.from(siTbody.rows).forEach(r => { if (r.dataset.abstractId) addedAbstracts.add(r.dataset.abstractId); });
  panel.classList.remove('hidden');
  tbody.innerHTML = rows.map((r, i) => {
    const alreadyAdded = addedAbstracts.has(r.abstractId);
    return `<tr class="hover:bg-blue-50/60 text-xs ${alreadyAdded ? 'opacity-50' : ''}">
    <td class="px-3 py-2 text-blue-600 font-bold whitespace-nowrap">${r.source}</td>
    <td class="px-3 py-2 font-medium text-slate-700">${r.desc}</td>
    <td class="px-3 py-2 text-slate-400 font-mono text-[10px]">${r.hsn}</td>
    <td class="px-3 py-2 text-right font-bold">${r.qty}</td>
    <td class="px-3 py-2 text-right">${getCurrencySymbol()}${parseFloat(r.rate).toLocaleString('en-IN')}</td>
    <td class="px-3 py-2 text-right font-bold text-slate-800">${getCurrencySymbol()}${(r.qty * r.rate).toLocaleString('en-IN')}</td>
    <td class="px-3 py-2 text-center">${alreadyAdded
      ? '<span class="text-green-600 font-bold text-[10px]">✓ Added</span>'
      : `<button onclick="addSIPendingItem(${i})" class="bg-blue-500 text-white px-2.5 py-1 rounded text-[10px] font-bold hover:bg-blue-600 transition">+ Add</button>`
    }</td>
  </tr>`;
  }).join('');
  window._siPendingRows = rows;
}

export function addSIPendingItem(idx) {
  const rows = window._siPendingRows || [];
  if (!rows[idx]) return;
  const r = rows[idx];
  // Check if this abstract is already added
  const siTbody = document.getElementById('siFormTableBody');
  if (siTbody && r.abstractId) {
    const alreadyAdded = Array.from(siTbody.rows).some(row => row.dataset.abstractId === r.abstractId);
    if (alreadyAdded) { showToast('This abstract is already added to the invoice', 'warning'); return; }
  }
  // Find first empty row to fill, or insert at top
  if (siTbody) {
    let filled = false;
    for (const row of Array.from(siTbody.rows)) {
      const nameInput = row.querySelector('.si-item-name');
      const qtyInput = row.querySelector('.si-item-qty');
      if (nameInput && !nameInput.value.trim() && (!qtyInput || !parseFloat(qtyInput.value))) {
        // Fill this empty row
        nameInput.value = r.desc;
        const hsnInput = row.querySelector('.si-item-hsn'); if (hsnInput) hsnInput.value = r.hsn || '';
        if (qtyInput) qtyInput.value = r.qty;
        const unitSel = row.querySelector('.si-item-unit'); if (unitSel) unitSel.value = r.unit || 'LS';
        const rateInput = row.querySelector('.si-item-rate'); if (rateInput) rateInput.value = r.rate;
        if (r.abstractId) row.dataset.abstractId = r.abstractId;
        filled = true;
        break;
      }
    }
    if (!filled) {
      // Insert at top of table
      _addSIRowAt(0, { desc: r.desc, hsn: r.hsn || '', qty: r.qty, unit: r.unit || 'LS', rate: r.rate, discPct: 0, taxPct: 0, abstractId: r.abstractId || '' });
    }
  }
  _renumberSIRows();
  calcSIFormTotal();
  loadSIPendingItems();
  showToast('Abstract added to invoice');
}

// ── Row HTML builder ──
function _siRowHTML(num, data = {}) {
  const units = ['Nos','M3','M2','RMT','SqFt','CuFt','Bag','KG','Ton','Ltr','Set','Lot','LS','Box','Pair','Trip','Day','Hour'];
  const unitOpts = units.map(u => `<option value="${u}" ${u === (data.unit || 'Nos') ? 'selected' : ''}>${u}</option>`).join('');
  const taxType = data.taxType || 'CGST_SGST';
  const taxTypeOpts = [
    { v: 'CGST_SGST', l: 'CGST+SGST' },
    { v: 'IGST', l: 'IGST' },
    { v: 'NONE', l: 'None' }
  ].map(o => `<option value="${o.v}" ${o.v === taxType ? 'selected' : ''}>${o.l}</option>`).join('');
  const s = 'border:1px solid #e2e8f0;border-radius:4px;outline:none;';
  const taxRates = [0, 0.25, 3, 5, 12, 18, 28];
  const taxRateOpts = taxRates.map(v => `<option value="${v}" ${data.taxPct == v ? 'selected' : ''}>${v}%</option>`).join('');
  return `
    <td style="padding:5px 3px;text-align:center;font-size:10px;color:#94a3b8;font-weight:700;" class="si-row-num">${num}</td>
    <td style="padding:5px 4px;position:relative;">
      <div class="si-autocomplete-wrap">
        <input type="text" value="${data.desc || ''}" class="si-item-name" style="width:100%;padding:6px 8px;${s}font-size:12px;font-weight:500;" placeholder="Item name..." oninput="onSIItemInput(this)" onfocus="onSIItemInput(this)" autocomplete="off">
      </div>
    </td>
    <td style="padding:5px 3px;"><input type="text" value="${data.hsn || ''}" class="si-item-hsn" style="width:100%;padding:6px 4px;${s}font-size:11px;text-align:center;font-family:monospace;" placeholder="HSN/SAC"></td>
    <td style="padding:5px 3px;"><input type="number" value="${data.qty || ''}" min="0" step="any" class="si-item-qty" style="width:100%;padding:6px 4px;${s}font-size:12px;text-align:center;font-weight:600;" oninput="calcSIFormTotal()" placeholder="0"></td>
    <td style="padding:5px 3px;"><select class="si-item-unit" style="width:100%;padding:6px 2px;${s}font-size:11px;font-weight:600;">${unitOpts}</select></td>
    <td style="padding:5px 3px;"><input type="number" value="${data.rate || ''}" min="0" step="any" class="si-item-rate" style="width:100%;padding:6px 6px;${s}font-size:12px;text-align:right;font-weight:600;" oninput="calcSIFormTotal()" placeholder="0.00"></td>
    <td style="padding:5px 2px;"><input type="number" value="${data.discPct || ''}" min="0" max="100" step="any" class="si-item-disc" style="width:100%;padding:6px 3px;${s}font-size:11px;text-align:center;" oninput="calcSIFormTotal()" placeholder="0"></td>
    <td style="padding:5px 3px;">
      <div style="display:flex;gap:2px;align-items:center;">
        <select class="si-item-taxtype" style="padding:5px 2px;${s}font-size:9px;font-weight:600;flex:1;" onchange="calcSIFormTotal()">${taxTypeOpts}</select>
        <select class="si-item-tax" style="padding:5px 2px;${s}font-size:10px;font-weight:700;width:48px;" onchange="calcSIFormTotal()">${taxRateOpts}</select>
      </div>
    </td>
    <td style="padding:5px 4px;text-align:right;font-weight:700;color:#1e293b;font-size:12px;white-space:nowrap;" class="si-row-amt">${getCurrencySymbol()}0</td>
    <td style="padding:5px 2px;text-align:center;"><button onclick="this.closest('tr').remove();_renumberSIRows();calcSIFormTotal()" style="width:20px;height:20px;border-radius:50%;background:#fef2f2;color:#f87171;border:none;cursor:pointer;font-size:10px;font-weight:700;display:inline-flex;align-items:center;justify-content:center;" title="Delete">&#10005;</button></td>`;
}

// ── Row creation ──
function _addSIRow(data = {}) {
  const tbody = document.getElementById('siFormTableBody');
  if (!tbody) return;
  const row = tbody.insertRow();
  const num = tbody.rows.length;
  if (data.abstractId) row.dataset.abstractId = data.abstractId;
  row.innerHTML = _siRowHTML(num, data);
}

function _addSIRowAt(position, data = {}) {
  const tbody = document.getElementById('siFormTableBody');
  if (!tbody) return;
  const row = tbody.insertRow(position);
  if (data.abstractId) row.dataset.abstractId = data.abstractId;
  row.innerHTML = _siRowHTML(position + 1, data);
}

function _renumberSIRows() {
  const tbody = document.getElementById('siFormTableBody');
  if (!tbody) return;
  Array.from(tbody.rows).forEach((r, i) => { const c = r.querySelector('.si-row-num'); if (c) c.textContent = i + 1; });
}
// Expose to window for inline onclick
window._renumberSIRows = _renumberSIRows;

export function openSaleInvoiceForm() {
  _populateSIProjectSelect();
  _populateClientSelect('siFormClient');
  const woSel = document.getElementById('siFormWO');
  if (woSel) woSel.innerHTML = '<option value="">-- Select WO/PO --</option>';
  const today = new Date().toISOString().split('T')[0];
  document.getElementById('siFormDate').value = today;
  document.getElementById('siFormNo').value = 'SI-' + (Date.now() % 100000);
  const dueEl = document.getElementById('siFormDueDate');
  if (dueEl) { const d = new Date(); d.setDate(d.getDate() + 30); dueEl.value = d.toISOString().split('T')[0]; }
  ['siFormPO','siFormPODate','siFormDelivery','siFormNotes'].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
  const projSel = document.getElementById('siFormProject'); if (projSel) projSel.value = '';
  const idEl = document.getElementById('siFormPOId'); if (idEl) idEl.value = '';
  const termsEl = document.getElementById('siFormTerms'); if (termsEl) termsEl.value = '';
  const stateEl = document.getElementById('siFormState'); if (stateEl) stateEl.value = '';
  const tcsEl = document.getElementById('siFormTCS'); if (tcsEl) tcsEl.value = '0';
  const roundEl = document.getElementById('siFormRoundOff'); if (roundEl) roundEl.checked = true;
  const gstPctEl = document.getElementById('siFormGstPct'); if (gstPctEl) gstPctEl.value = '18';
  const pendingPanel = document.getElementById('siPendingItemsPanel'); if (pendingPanel) pendingPanel.classList.add('hidden');
  setSIPayMode('Credit');
  document.getElementById('siFormTableBody').innerHTML = '';
  addSIFormRow(3);
  calcSIFormTotal();
  _openFullScreenForm('saleInvoiceFormPanel');
  // Close dropdowns on click outside
  setTimeout(() => {
    const scrollArea = document.getElementById('siFormScrollArea');
    if (scrollArea) scrollArea.addEventListener('click', (e) => {
      if (!e.target.closest('.si-autocomplete-wrap') && !e.target.closest('.si-po-wrap')) closeSIDropdowns();
    }, { once: false });
  }, 100);
}

export function addSIFormRow(count = 1) {
  for (let i = 0; i < count; i++) _addSIRow();
  _renumberSIRows();
}

export function calcSIFormTotal() {
  const tbody = document.getElementById('siFormTableBody');
  if (!tbody) return;
  let grossTotal = 0, totalQty = 0, totalDiscount = 0, totalLineTax = 0, rowCount = 0;
  let totalCGST = 0, totalSGST = 0, totalIGST = 0;
  Array.from(tbody.rows).forEach(r => {
    const qty = parseFloat(r.querySelector('.si-item-qty')?.value) || 0;
    const rate = parseFloat(r.querySelector('.si-item-rate')?.value) || 0;
    const discPct = parseFloat(r.querySelector('.si-item-disc')?.value) || 0;
    const taxPct = parseFloat(r.querySelector('.si-item-tax')?.value) || 0;
    const taxType = r.querySelector('.si-item-taxtype')?.value || 'CGST_SGST';
    const lineGross = qty * rate;
    const lineDisc = lineGross * discPct / 100;
    const taxable = lineGross - lineDisc;
    let lineTax = 0;
    if (taxType !== 'NONE' && taxPct > 0) {
      lineTax = taxable * taxPct / 100;
      if (taxType === 'CGST_SGST') { totalCGST += lineTax / 2; totalSGST += lineTax / 2; }
      else if (taxType === 'IGST') { totalIGST += lineTax; }
    }
    const lineTotal = taxable + lineTax;
    grossTotal += lineGross;
    totalQty += qty;
    totalDiscount += lineDisc;
    totalLineTax += lineTax;
    if (qty > 0 || rate > 0) rowCount++;
    const amtCell = r.querySelector('.si-row-amt');
    if (amtCell) amtCell.textContent = lineTotal > 0 ? getCurrencySymbol() + lineTotal.toLocaleString('en-IN', { maximumFractionDigits: 2 }) : getCurrencySymbol() + '0';
  });
  const taxableAmount = grossTotal - totalDiscount;
  const setT = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
  const fmt = (v) => getCurrencySymbol() + v.toLocaleString('en-IN', { maximumFractionDigits: 2 });
  setT('siTotalRows', rowCount);
  setT('siTotalQty', totalQty);
  setT('siFormSubtotal', fmt(taxableAmount + totalLineTax));
  // Summary panel
  setT('siSummarySubtotal', fmt(grossTotal));
  setT('siSummaryDiscount', totalDiscount > 0 ? '-' + fmt(totalDiscount) : '-' + getCurrencySymbol() + '0');
  setT('siSummaryTaxable', fmt(taxableAmount));
  // Tax breakdown
  const cgstRow = document.getElementById('siSummaryCGSTRow');
  const sgstRow = document.getElementById('siSummarySGSTRow');
  const igstRow = document.getElementById('siSummaryIGSTRow');
  if (cgstRow) { cgstRow.style.display = totalCGST > 0 ? 'flex' : 'none'; setT('siSummaryCGST', fmt(totalCGST)); }
  if (sgstRow) { sgstRow.style.display = totalSGST > 0 ? 'flex' : 'none'; setT('siSummarySGST', fmt(totalSGST)); }
  if (igstRow) { igstRow.style.display = totalIGST > 0 ? 'flex' : 'none'; setT('siSummaryIGST', fmt(totalIGST)); }
  const gstAmt = totalLineTax;
  setT('siFormGstAmt', fmt(gstAmt));
  // TCS
  const tcsPct = parseFloat(document.getElementById('siFormTCS')?.value) || 0;
  const tcsAmt = (taxableAmount + totalLineTax) * tcsPct / 100;
  setT('siFormTCSAmt', tcsAmt > 0 ? getCurrencySymbol() + tcsAmt.toLocaleString('en-IN', { maximumFractionDigits: 2 }) : getCurrencySymbol() + '0');
  // Grand total (no separate GST — tax is inline)
  let grand = taxableAmount + totalLineTax + tcsAmt;
  const roundEl = document.getElementById('siFormRoundOff');
  let roundAmt = 0;
  if (roundEl?.checked) { roundAmt = Math.round(grand) - grand; grand = Math.round(grand); }
  setT('siFormRoundAmt', roundAmt !== 0 ? (roundAmt > 0 ? '+' : '') + roundAmt.toFixed(2) : '0.00');
  setT('siFormTotal', getCurrencySymbol() + grand.toLocaleString('en-IN', { maximumFractionDigits: 2 }));
}

export function saveSaleInvoiceForm() {
  const clientId = document.getElementById('siFormClient').value;
  if (!clientId) { showToast('Select a client', 'error'); return; }
  const tbody = document.getElementById('siFormTableBody');
  let items = [], grossTotal = 0, totalDiscount = 0, totalLineTax = 0;
  const linkedAbstracts = new Set();
  Array.from(tbody.rows).forEach(r => {
    const desc = r.querySelector('.si-item-name')?.value?.trim() || '';
    const hsn = r.querySelector('.si-item-hsn')?.value?.trim() || '';
    const qty = parseFloat(r.querySelector('.si-item-qty')?.value) || 0;
    const unit = r.querySelector('.si-item-unit')?.value || 'Nos';
    const rate = parseFloat(r.querySelector('.si-item-rate')?.value) || 0;
    const discPct = parseFloat(r.querySelector('.si-item-disc')?.value) || 0;
    const taxPct = parseFloat(r.querySelector('.si-item-tax')?.value) || 0;
    const taxType = r.querySelector('.si-item-taxtype')?.value || 'CGST_SGST';
    if (!desc || qty <= 0) return;
    const lineGross = qty * rate;
    const lineDisc = lineGross * discPct / 100;
    const taxable = lineGross - lineDisc;
    const lineTax = (taxType !== 'NONE' && taxPct > 0) ? taxable * taxPct / 100 : 0;
    items.push({ desc, hsn, qty, unit, rate, discPct, discount: lineDisc, taxPct, taxType, taxAmount: lineTax, amount: taxable + lineTax });
    grossTotal += lineGross; totalDiscount += lineDisc; totalLineTax += lineTax;
    if (r.dataset.abstractId) linkedAbstracts.add(r.dataset.abstractId);
  });
  if (!items.length) { showToast('Add at least one line item', 'error'); return; }
  const taxableAmount = grossTotal - totalDiscount;
  const gstPct = 0;
  const gstAmount = totalLineTax;
  const tcsPct = parseFloat(document.getElementById('siFormTCS')?.value) || 0;
  const tcsAmount = (taxableAmount + totalLineTax) * tcsPct / 100;
  let grand = taxableAmount + totalLineTax + tcsAmount;
  const roundOff = document.getElementById('siFormRoundOff')?.checked;
  let roundAmt = 0;
  if (roundOff) { roundAmt = Math.round(grand) - grand; grand = Math.round(grand); }
  // Resolve client name — handle project-based temp clients
  let resolvedClientId = clientId;
  let clientName = '';
  const clientOpt = document.getElementById('siFormClient')?.selectedOptions?.[0];
  if (clientId.startsWith('proj_client_')) {
    clientName = clientOpt?.dataset?.clientName || '';
    resolvedClientId = '';
  } else {
    const cl = state.clients.find(c => c.id === clientId);
    clientName = cl ? cl.name : '';
  }
  const invoiceId = 'si_' + Date.now();
  const rec = {
    id: invoiceId, invoiceNo: document.getElementById('siFormNo').value,
    date: document.getElementById('siFormDate').value, clientId: resolvedClientId || clientId,
    clientName,
    projectId: document.getElementById('siFormProject')?.value || '',
    boqGroupId: document.getElementById('siFormWO')?.value || '',
    items,
    dueDate: document.getElementById('siFormDueDate')?.value || '',
    payType: document.getElementById('siFormPayType')?.value || 'Credit',
    poNo: document.getElementById('siFormPO')?.value || '',
    poDate: document.getElementById('siFormPODate')?.value || '',
    terms: document.getElementById('siFormTerms')?.value || '',
    stateOfSupply: document.getElementById('siFormState')?.value || '',
    delivery: document.getElementById('siFormDelivery')?.value || '',
    notes: document.getElementById('siFormNotes')?.value || '',
    grossTotal, totalDiscount, taxableAmount, itemTax: totalLineTax,
    gstPct, gstAmount, tcsPct, tcsAmount, roundOff, roundAmt,
    subtotal: taxableAmount, total: grand, status: 'Active',
    linkedAbstractIds: [...linkedAbstracts]
  };
  // Save invoice
  if (!state.saleInvoices) state.saleInvoices = [];
  state.saleInvoices.push(rec);
  // ── Business logic: upsert items master & track usage ──
  if (!state.itemsMaster) state.itemsMaster = [];
  items.forEach(item => {
    const normName = item.desc.toLowerCase().trim();
    let found = state.itemsMaster.find(m => m.name.toLowerCase().trim() === normName);
    if (found) {
      found.usageCount = (found.usageCount || 0) + 1;
      found.lastUsed = new Date().toISOString();
      if (item.hsn && !found.hsn) found.hsn = item.hsn;
      found.defaultRate = item.rate;
    } else {
      state.itemsMaster.push({ id: 'im_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6), name: item.desc, hsn: item.hsn, defaultRate: item.rate, unit: item.unit, usageCount: 1, lastUsed: new Date().toISOString(), createdAt: new Date().toISOString() });
    }
  });
  // ── Save PO if new ──
  const poNo = rec.poNo?.trim();
  if (poNo) {
    if (!state.savedPOs) state.savedPOs = [];
    const existingPO = state.savedPOs.find(p => p.poNumber.toLowerCase() === poNo.toLowerCase());
    if (!existingPO) {
      state.savedPOs.push({ id: 'po_' + Date.now(), poNumber: poNo, date: rec.poDate || '', clientId, amount: grand, createdAt: new Date().toISOString() });
    }
  }
  // ── Mark linked abstracts as invoiced ──
  linkedAbstracts.forEach(aId => {
    const abs = (state.abstracts || []).find(a => a.id === aId);
    if (abs) { abs.status = 'invoiced'; abs.linkedInvoiceId = invoiceId; }
  });
  saveAllData(); closeFullScreenForm('saleInvoiceFormPanel');
  showToast('Sale Invoice saved!'); renderSaleInvoices();
}
export function renderSaleInvoices() {
  // Populate filters
  const cfEl = document.getElementById('slFilterClient');
  if (cfEl && cfEl.options.length <= 1) state.clients.forEach(c => cfEl.innerHTML += `<option value="${c.id}">${c.name}</option>`);
  const search = (document.getElementById('slSearch')?.value || '').toLowerCase();
  const cFilter = document.getElementById('slFilterClient')?.value || '';
  const sFilter = document.getElementById('slFilterStatus')?.value || '';
  const fromD = document.getElementById('slFromDate')?.value || '';
  const toD = document.getElementById('slToDate')?.value || '';
  let invoices = [...(state.saleInvoices || [])];
  invoices = invoices.filter(inv => {
    const c = state.clients.find(x => x.id === inv.clientId);
    const matchS = !search || inv.invoiceNo?.toLowerCase().includes(search) || c?.name?.toLowerCase().includes(search) || inv.clientName?.toLowerCase().includes(search);
    const matchC = !cFilter || inv.clientId === cFilter;
    const matchSt = !sFilter || inv.status === sFilter;
    const matchF = !fromD || inv.date >= fromD;
    const matchT = !toD || inv.date <= toD;
    return matchS && matchC && matchSt && matchF && matchT;
  });
  invoices.sort((a, b) => new Date(b.date) - new Date(a.date));
  const tbody = document.getElementById('slTableBody');
  if (!tbody) return;
  tbody.innerHTML = '';
  let kTotal = 0, kReceived = 0;
  invoices.forEach(inv => {
    const c = state.clients.find(x => x.id === inv.clientId);
    const received = (state.paymentsIn || []).filter(p => p.clientId === inv.clientId).reduce((s, p) => s + parseFloat(p.amount || 0), 0);
    const outstanding = inv.total - Math.min(received, inv.total);
    kTotal += inv.total; kReceived += Math.min(received, inv.total);
    const statusBadge = inv.status === 'Cancelled' ? '<span class="bg-red-100 text-red-700 text-[10px] px-2 py-1 rounded font-bold">Cancelled</span>' : '<span class="bg-green-100 text-green-700 text-[10px] px-2 py-1 rounded font-bold">Active</span>';
    const proj = inv.projectId ? (state.projects || []).find(p => p.id === inv.projectId) : null;
    const clientDisplay = (c?.name || inv.clientName || 'Unknown') + (proj ? '<br><span class="text-[10px] text-purple-500 font-medium">' + proj.name + '</span>' : '') + (inv.poNo ? '<br><span class="text-[10px] text-slate-400">WO: ' + inv.poNo + '</span>' : '');
    // Build links column
    const hasAbstracts = (inv.linkedAbstractIds || []).length > 0;
    const hasProject = !!inv.projectId;
    let linksHtml = '<div class="flex gap-1 justify-center flex-wrap">';
    if (hasProject) linksHtml += '<span class="bg-purple-100 text-purple-700 text-[9px] px-1.5 py-0.5 rounded font-bold cursor-pointer" onclick="viewSaleInvoiceInfo(\'' + inv.id + '\')" title="Project linked">📁 Proj</span>';
    if (hasAbstracts) linksHtml += '<span class="bg-orange-100 text-orange-700 text-[9px] px-1.5 py-0.5 rounded font-bold cursor-pointer" onclick="viewSaleInvoiceInfo(\'' + inv.id + '\')" title="Abstracts linked">📋 Abs</span>';
    if (!hasProject && !hasAbstracts) linksHtml += '<span class="text-slate-300 text-[9px]">—</span>';
    linksHtml += '</div>';
    tbody.innerHTML += `<tr class="hover:bg-slate-50"><td class="px-4 py-3 font-mono font-bold text-blue-700 cursor-pointer hover:underline" onclick="viewSaleInvoiceInfo('${inv.id}')">${inv.invoiceNo}</td><td class="px-4 py-3 text-slate-500">${inv.date}</td><td class="px-4 py-3 font-bold">${clientDisplay}</td><td class="px-4 py-3 text-right">${getCurrencySymbol()}${inv.subtotal?.toLocaleString('en-IN') || 0}</td><td class="px-4 py-3 text-right">${getCurrencySymbol()}${inv.gstAmount?.toLocaleString('en-IN') || 0}</td><td class="px-4 py-3 text-right font-bold">${getCurrencySymbol()}${inv.total?.toLocaleString('en-IN') || 0}</td><td class="px-4 py-3 text-right text-green-600 font-bold">${getCurrencySymbol()}${Math.min(received, inv.total).toLocaleString('en-IN')}</td><td class="px-4 py-3 text-right ${outstanding > 0 ? 'text-red-600 font-extrabold' : 'text-slate-400'}">${getCurrencySymbol()}${outstanding.toLocaleString('en-IN')}</td><td class="px-4 py-3 text-center">${statusBadge}</td><td class="px-4 py-3 text-center">${linksHtml}</td><td class="px-4 py-3 text-center"><div class="flex gap-1 justify-center"><button onclick="viewSaleInvoiceInfo('${inv.id}')" class="text-blue-600 bg-blue-50 hover:bg-blue-100 text-[10px] px-2 py-1 rounded font-bold" title="View Details">👁</button><button onclick="exportSaleInvoicePDF('${inv.id}')" class="text-slate-600 bg-slate-50 hover:bg-slate-100 text-[10px] px-2 py-1 rounded font-bold" title="Download PDF">📄</button><button onclick="deleteSaleInvoice('${inv.id}')" class="text-red-500 bg-red-50 hover:bg-red-100 text-[10px] px-2 py-1 rounded font-bold" title="Delete">🗑</button></div></td></tr>`;
  });
  if (!invoices.length) tbody.innerHTML = '<tr><td colspan="11" class="p-8 text-center text-slate-400 font-medium">No sale invoices found.</td></tr>';
  const setEl = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
  setEl('slKpiTotal', getCurrencySymbol() + kTotal.toLocaleString('en-IN', { maximumFractionDigits: 0 }));
  setEl('slKpiReceived', getCurrencySymbol() + kReceived.toLocaleString('en-IN', { maximumFractionDigits: 0 }));
  setEl('slKpiOutstanding', getCurrencySymbol() + (kTotal - kReceived).toLocaleString('en-IN', { maximumFractionDigits: 0 }));
  setEl('slKpiCount', invoices.length);
}
export function deleteSaleInvoice(id) {
  if (!confirm('Delete this Sale Invoice?')) return;
  state.saleInvoices = (state.saleInvoices || []).filter(i => i.id !== id);
  saveAllData(); renderSaleInvoices(); showToast('Sale Invoice Deleted', 'error');
}

// ── View Sale Invoice Details with Links ──
export function viewSaleInvoiceInfo(id) {
  const inv = (state.saleInvoices || []).find(i => i.id === id);
  if (!inv) { showToast('Invoice not found', 'error'); return; }
  const c = state.clients.find(x => x.id === inv.clientId);
  const proj = inv.projectId ? (state.projects || []).find(p => p.id === inv.projectId) : null;
  const fmt = v => getCurrencySymbol() + (v || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 });
  const modal = document.getElementById('saleInvoiceDetailModal');
  document.getElementById('siDetailTitle').textContent = inv.invoiceNo || 'Invoice';
  document.getElementById('siDetailSubtitle').textContent = inv.date + (inv.status === 'Cancelled' ? ' • CANCELLED' : ' • Active');
  // Build content
  let html = '';
  // ─── Invoice Summary Card ───
  html += `<div class="bg-slate-50 rounded-xl border p-4">
    <div class="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
      <div><span class="text-[10px] font-bold uppercase text-slate-400 block">Client</span><span class="font-bold text-slate-800">${c?.name || inv.clientName || '—'}</span></div>
      <div><span class="text-[10px] font-bold uppercase text-slate-400 block">Date</span><span class="font-bold">${inv.date}</span></div>
      <div><span class="text-[10px] font-bold uppercase text-slate-400 block">Pay Type</span><span class="font-bold">${inv.payType || '—'}</span></div>
      <div><span class="text-[10px] font-bold uppercase text-slate-400 block">Due Date</span><span class="font-bold">${inv.dueDate || '—'}</span></div>
      <div><span class="text-[10px] font-bold uppercase text-slate-400 block">WO/PO No</span><span class="font-bold">${inv.poNo || '—'}</span></div>
      <div><span class="text-[10px] font-bold uppercase text-slate-400 block">State of Supply</span><span class="font-bold">${inv.stateOfSupply || '—'}</span></div>
      <div><span class="text-[10px] font-bold uppercase text-slate-400 block">Subtotal</span><span class="font-bold">${fmt(inv.subtotal)}</span></div>
      <div><span class="text-[10px] font-bold uppercase text-slate-400 block">Grand Total</span><span class="font-extrabold text-lg text-green-700">${fmt(inv.total)}</span></div>
    </div>
  </div>`;
  // ─── Line Items ───
  html += `<div class="bg-white rounded-xl border overflow-hidden">
    <div class="bg-slate-800 text-white px-4 py-2.5 font-bold text-sm">Line Items</div>
    <table class="w-full text-sm"><thead class="bg-slate-50"><tr class="text-[10px] font-bold uppercase text-slate-500">
      <th class="px-3 py-2 text-left">#</th><th class="px-3 py-2 text-left">Item</th><th class="px-3 py-2">HSN</th><th class="px-3 py-2 text-right">Qty</th><th class="px-3 py-2">Unit</th><th class="px-3 py-2 text-right">Rate</th><th class="px-3 py-2 text-right">Tax</th><th class="px-3 py-2 text-right">Amount</th>
    </tr></thead><tbody class="divide-y">`;
  (inv.items || []).forEach((item, i) => {
    const taxLabel = item.taxType === 'IGST' ? 'IGST' : item.taxType === 'NONE' ? '—' : 'GST';
    html += `<tr><td class="px-3 py-2 text-slate-400">${i + 1}</td><td class="px-3 py-2 font-medium">${item.desc}</td><td class="px-3 py-2 text-center text-slate-500">${item.hsn || '—'}</td><td class="px-3 py-2 text-right">${item.qty}</td><td class="px-3 py-2 text-center">${item.unit}</td><td class="px-3 py-2 text-right">${fmt(item.rate)}</td><td class="px-3 py-2 text-right text-slate-500">${item.taxPct || 0}% ${taxLabel}</td><td class="px-3 py-2 text-right font-bold">${fmt(item.amount)}</td></tr>`;
  });
  html += `</tbody></table></div>`;
  // ─── Financial Summary ───
  html += `<div class="bg-blue-50 rounded-xl border border-blue-200 p-4">
    <h4 class="font-bold text-sm text-blue-900 mb-2">Financial Summary</h4>
    <div class="grid grid-cols-2 md:grid-cols-4 gap-2 text-sm">
      <div class="flex justify-between"><span class="text-slate-500">Gross Total</span><span class="font-bold">${fmt(inv.grossTotal)}</span></div>
      <div class="flex justify-between"><span class="text-slate-500">Discount</span><span class="font-bold text-red-500">-${fmt(inv.totalDiscount)}</span></div>
      <div class="flex justify-between"><span class="text-slate-500">Taxable</span><span class="font-bold">${fmt(inv.taxableAmount)}</span></div>
      <div class="flex justify-between"><span class="text-slate-500">Tax</span><span class="font-bold">${fmt(inv.gstAmount)}</span></div>
      ${inv.tcsAmount ? `<div class="flex justify-between"><span class="text-slate-500">TCS</span><span class="font-bold">${fmt(inv.tcsAmount)}</span></div>` : ''}
      ${inv.roundAmt ? `<div class="flex justify-between"><span class="text-slate-500">Round Off</span><span class="font-bold">${inv.roundAmt > 0 ? '+' : ''}${inv.roundAmt.toFixed(2)}</span></div>` : ''}
    </div>
  </div>`;
  // ─── Linked Project ───
  if (proj) {
    const boqGroup = inv.boqGroupId ? (proj.boqs || []).find(g => g.id === inv.boqGroupId) : null;
    html += `<div class="bg-purple-50 rounded-xl border border-purple-200 p-4">
      <h4 class="font-bold text-sm text-purple-900 mb-2">📁 Linked Project</h4>
      <div class="flex items-center gap-3">
        <div class="w-10 h-10 rounded-lg flex items-center justify-center text-white font-bold text-lg" style="background:${proj.color || '#7c3aed'}">${proj.name.charAt(0)}</div>
        <div>
          <p class="font-bold text-purple-900 cursor-pointer hover:underline" onclick="document.getElementById('saleInvoiceDetailModal').classList.add('hide');openProject('${proj.id}')">${proj.name}</p>
          <p class="text-xs text-purple-500">${proj.clientName || ''} ${proj.code ? '• ' + proj.code : ''}</p>
        </div>
        <button onclick="document.getElementById('saleInvoiceDetailModal').classList.add('hide');openProject('${proj.id}')" class="ml-auto bg-purple-600 text-white px-3 py-1.5 rounded-lg text-xs font-bold hover:bg-purple-700">Open Project →</button>
      </div>
      ${boqGroup ? `<div class="mt-3 bg-white rounded-lg border p-3">
        <p class="text-xs font-bold text-slate-500 uppercase mb-1">Work Order / BOQ Group</p>
        <p class="font-bold">${boqGroup.name || 'BOQ'} ${boqGroup.woNumber ? '• WO: ' + boqGroup.woNumber : ''}</p>
        <p class="text-xs text-slate-500">${boqGroup.woDate ? 'Date: ' + boqGroup.woDate : ''} ${boqGroup.poValue ? '• PO Value: ' + fmt(boqGroup.poValue) : ''}</p>
      </div>` : ''}
    </div>`;
  }
  // ─── Linked Abstracts & Measurement Sheets ───
  // Collect from multiple sources: saved linkedAbstractIds, abstracts that reference this invoice, and old invoice system
  const linkedAbsSet = new Set(inv.linkedAbstractIds || []);
  // Also find abstracts that have linkedInvoiceId pointing to this invoice
  (state.abstracts || []).forEach(a => {
    if (a.linkedInvoiceId === inv.id) linkedAbsSet.add(a.id);
  });
  // Also check old invoice system (abstractIds field)
  if (inv.abstractIds) inv.abstractIds.forEach(aId => linkedAbsSet.add(aId));
  // Also find sheets linked to this project that are billed
  const linkedAbsIds = [...linkedAbsSet];
  // If no abstracts found but project exists, try to find all invoiced abstracts for this project
  if (!linkedAbsIds.length && inv.projectId) {
    (state.abstracts || []).forEach(a => {
      if (a.projectId === inv.projectId && a.status === 'invoiced') linkedAbsSet.add(a.id);
    });
    linkedAbsIds.length = 0;
    linkedAbsSet.forEach(id => linkedAbsIds.push(id));
  }
  if (linkedAbsIds.length > 0) {
    html += `<div class="bg-orange-50 rounded-xl border border-orange-200 p-4">
      <h4 class="font-bold text-sm text-orange-900 mb-3">📋 Linked Abstracts & Measurement Sheets</h4>
      <div class="space-y-2">`;
    linkedAbsIds.forEach(aId => {
      const abs = (state.abstracts || []).find(a => a.id === aId);
      if (!abs) { html += `<div class="bg-white rounded-lg border p-3 text-slate-400 text-sm">Abstract ${aId} — not found</div>`; return; }
      const sheet = abs.sheetId ? state.sheets.find(s => s.id === abs.sheetId) : null;
      html += `<div class="bg-white rounded-lg border p-3">
        <div class="flex items-center gap-3 justify-between">
          <div>
            <p class="font-bold text-orange-800">${abs.abstractNum || abs.id}</p>
            <p class="text-xs text-slate-500">Items: ${(abs.items || []).length} • Total: ${fmt(abs.totalAmount)}</p>
          </div>
          <div class="flex gap-1.5 flex-wrap">
            <button onclick="exportAbstractPDF('${abs.id}')" class="bg-slate-700 text-white px-2.5 py-1.5 rounded-lg text-[10px] font-bold hover:bg-slate-600" title="Download Abstract PDF">📄 PDF</button>
            <button onclick="exportDetailedAbstractPDF('${abs.id}')" class="bg-slate-600 text-white px-2.5 py-1.5 rounded-lg text-[10px] font-bold hover:bg-slate-500" title="Detailed Abstract PDF">📋 Detailed</button>
            <button onclick="document.getElementById('saleInvoiceDetailModal').classList.add('hide');_navigateToAbstract('${abs.id}')" class="bg-orange-600 text-white px-2.5 py-1.5 rounded-lg text-[10px] font-bold hover:bg-orange-700">Open →</button>
          </div>
        </div>`;
      if (sheet) {
        html += `<div class="mt-2 bg-slate-50 rounded-lg border p-2.5">
          <div class="flex items-center justify-between">
            <div>
              <p class="text-xs font-bold text-slate-500 uppercase">Source Measurement Sheet</p>
              <p class="font-bold text-sm text-blue-800">${sheet.sheetNum || sheet.id}</p>
              <p class="text-[10px] text-slate-400">${sheet.area || '—'} • ${sheet.date || '—'}</p>
            </div>
            <div class="flex gap-1.5 flex-wrap">
              <button onclick="exportSimpleMeasurementPdf('${sheet.id}')" class="bg-slate-700 text-white px-2.5 py-1.5 rounded-lg text-[10px] font-bold hover:bg-slate-600" title="Download Sheet PDF">📄 PDF</button>
              <button onclick="exportDetailedMeasurementPdf('${sheet.id}')" class="bg-slate-600 text-white px-2.5 py-1.5 rounded-lg text-[10px] font-bold hover:bg-slate-500" title="Detailed Sheet PDF">📋 Detailed</button>
              <button onclick="exportToExcel('${sheet.id}')" class="bg-green-700 text-white px-2.5 py-1.5 rounded-lg text-[10px] font-bold hover:bg-green-600" title="Download Sheet Excel">📊 Excel</button>
              <button onclick="document.getElementById('saleInvoiceDetailModal').classList.add('hide');_navigateToSheet('${sheet.id}')" class="bg-blue-600 text-white px-2.5 py-1.5 rounded-lg text-[10px] font-bold hover:bg-blue-700">Open →</button>
            </div>
          </div>
        </div>`;
      }
      html += `</div>`;
    });
    html += `</div></div>`;
  }
  // ─── Standalone Measurement Sheets (from project, not linked via abstracts) ───
  if (inv.projectId && linkedAbsIds.length === 0) {
    const projSheets = (state.sheets || []).filter(s => s.projectId === inv.projectId);
    if (projSheets.length > 0) {
      html += `<div class="bg-blue-50 rounded-xl border border-blue-200 p-4">
        <h4 class="font-bold text-sm text-blue-900 mb-3">📐 Project Measurement Sheets</h4>
        <div class="space-y-2">`;
      projSheets.forEach(sheet => {
        html += `<div class="bg-white rounded-lg border p-3 flex items-center justify-between">
          <div>
            <p class="font-bold text-blue-800">${sheet.sheetNum || sheet.id}</p>
            <p class="text-[10px] text-slate-400">${sheet.area || '—'} • ${sheet.date || '—'}</p>
          </div>
          <div class="flex gap-1.5 flex-wrap">
            <button onclick="exportSimpleMeasurementPdf('${sheet.id}')" class="bg-slate-700 text-white px-2.5 py-1.5 rounded-lg text-[10px] font-bold hover:bg-slate-600">📄 PDF</button>
            <button onclick="exportDetailedMeasurementPdf('${sheet.id}')" class="bg-slate-600 text-white px-2.5 py-1.5 rounded-lg text-[10px] font-bold hover:bg-slate-500">📋 Detailed</button>
            <button onclick="exportToExcel('${sheet.id}')" class="bg-green-700 text-white px-2.5 py-1.5 rounded-lg text-[10px] font-bold hover:bg-green-600">📊 Excel</button>
            <button onclick="document.getElementById('saleInvoiceDetailModal').classList.add('hide');_navigateToSheet('${sheet.id}')" class="bg-blue-600 text-white px-2.5 py-1.5 rounded-lg text-[10px] font-bold hover:bg-blue-700">Open →</button>
          </div>
        </div>`;
      });
      html += `</div></div>`;
    }
  }
  // ─── Notes & Delivery ───
  if (inv.notes || inv.delivery || inv.terms) {
    html += `<div class="bg-slate-50 rounded-xl border p-4">
      <h4 class="font-bold text-sm text-slate-700 mb-2">Notes</h4>
      ${inv.terms ? `<p class="text-sm text-slate-600 mb-1"><b>Terms:</b> ${inv.terms}</p>` : ''}
      ${inv.delivery ? `<p class="text-sm text-slate-600 mb-1"><b>Delivery:</b> ${inv.delivery}</p>` : ''}
      ${inv.notes ? `<p class="text-sm text-slate-600">${inv.notes}</p>` : ''}
    </div>`;
  }
  // ─── Action Buttons ───
  html += `<div class="flex gap-3 pt-2 pb-2">
    <button onclick="exportSaleInvoicePDF('${inv.id}')" class="flex-1 bg-slate-800 text-white py-2.5 rounded-lg font-bold text-sm hover:bg-slate-700">📄 Download PDF</button>
    <button onclick="printSaleInvoice('${inv.id}')" class="flex-1 bg-blue-700 text-white py-2.5 rounded-lg font-bold text-sm hover:bg-blue-600">🖨️ Print</button>
    <button onclick="shareSaleInvoice('${inv.id}')" class="flex-1 bg-purple-700 text-white py-2.5 rounded-lg font-bold text-sm hover:bg-purple-600">📤 Share</button>
  </div>`;

  document.getElementById('siDetailContent').innerHTML = html;
  // Move modal to body to escape any parent transforms
  if (modal.parentElement !== document.body) document.body.appendChild(modal);
  modal.classList.remove('hide');
}

// ── Navigate to Abstract ──
export function _navigateToAbstract(absId) {
  const abs = (state.abstracts || []).find(a => a.id === absId);
  if (!abs) { showToast('Abstract not found', 'error'); return; }
  // Open the project that contains this abstract
  if (abs.projectId) {
    openProject(abs.projectId);
    setTimeout(() => switchView('abstractsView'), 200);
    setTimeout(() => renderAbstractsList(), 300);
  } else {
    switchView('abstractsView');
    renderAbstractsList();
  }
}

// ── Navigate to Measurement Sheet ──
export function _navigateToSheet(sheetId) {
  const sheet = state.sheets.find(s => s.id === sheetId);
  if (!sheet) { showToast('Sheet not found', 'error'); return; }
  if (sheet.projectId) {
    openProject(sheet.projectId);
    setTimeout(() => { switchView('measurementView'); loadSheet(sheetId); }, 200);
  } else {
    switchView('measurementView');
    loadSheet(sheetId);
  }
}

// ── Export Sale Invoice as PDF ──
// Sale invoice & sales-ledger exporters moved to ./saleExports.js


// ══════════════════════════════════
// PROFORMA INVOICE
// ══════════════════════════════════
// Sale documents (proforma/payment-in/SO/DC/return/asset/other-income) moved to ./saleDocs.js
