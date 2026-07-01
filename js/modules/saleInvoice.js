/**
 * ═══════════════════════════════════════════════════════════
 * True Site Sync — Sale Invoice (tax invoice entry)
 * ═══════════════════════════════════════════════════════════
 * Premium sale-invoice form: smart item autocomplete, WO/PO combo-box,
 * pending-item loader, list + info view. Extracted from ui.js with all
 * its private SI helpers. Shared form chrome from formHelpers.js.
 * ═══════════════════════════════════════════════════════════
 */

import { state, saveAllData } from './state.js';
import { showToast, getCurrencySymbol } from './utils.js';
import { _openFullScreenForm, _populateClientSelect, closeFullScreenForm } from './formHelpers.js';

let _siItemDebounce = null;  // (was undeclared in ui.js — fixed here)

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
  if (woDate) {
    document.getElementById('siFormPODate').value = woDate;
    // Default the invoice/document date from the selected WO/PO date (still editable)
    const dEl = document.getElementById('siFormDate');
    if (dEl) dEl.value = woDate;
  }
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

export function openSaleInvoiceForm(editId) {
  _populateSIProjectSelect();
  _populateClientSelect('siFormClient');
  const woSel = document.getElementById('siFormWO');
  if (woSel) woSel.innerHTML = '<option value="">-- Select WO/PO --</option>';
  const today = new Date().toISOString().split('T')[0];

  // Stash the editing id on the panel so saveSaleInvoiceForm can detect edit mode.
  const panelEl = document.getElementById('saleInvoiceFormPanel');
  if (panelEl) panelEl.dataset.editId = editId || '';

  // If editing, prefill EVERY field from the existing invoice. Otherwise defaults.
  const existing = editId ? (state.saleInvoices || []).find(i => i.id === editId) : null;

  if (existing) {
    document.getElementById('siFormDate').value = existing.date || today;
    document.getElementById('siFormNo').value = existing.invoiceNo || ('SI-' + (Date.now() % 100000));
    const dueEl = document.getElementById('siFormDueDate'); if (dueEl) dueEl.value = existing.dueDate || '';
    const setEl = (id, v) => { const el = document.getElementById(id); if (el) el.value = (v == null ? '' : v); };
    setEl('siFormPO', existing.poNo);
    setEl('siFormPODate', existing.poDate);
    setEl('siFormDelivery', existing.delivery);
    setEl('siFormNotes', existing.notes);
    setEl('siFormProject', existing.projectId);
    setEl('siFormPOId', '');
    setEl('siFormTerms', existing.terms);
    setEl('siFormState', existing.stateOfSupply);
    setEl('siFormTCS', existing.tcsPct || 0);
    const roundEl = document.getElementById('siFormRoundOff'); if (roundEl) roundEl.checked = existing.roundOff !== false;
    const gstPctEl = document.getElementById('siFormGstPct'); if (gstPctEl) gstPctEl.value = existing.gstPct != null ? existing.gstPct : '18';
    // Client + WO need the project to repopulate dependent dropdowns first.
    const clEl = document.getElementById('siFormClient'); if (clEl) clEl.value = existing.clientId || '';
    try { if (existing.projectId && typeof onSIProjectChange === 'function') onSIProjectChange(); } catch {}
    const woEl = document.getElementById('siFormWO'); if (woEl && existing.boqGroupId) woEl.value = existing.boqGroupId;
    setSIPayMode(existing.payType || 'Credit');
  } else {
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
    setSIPayMode('Credit');
  }

  const pendingPanel = document.getElementById('siPendingItemsPanel'); if (pendingPanel) pendingPanel.classList.add('hidden');

  // Build the line items table.
  const tbody = document.getElementById('siFormTableBody');
  tbody.innerHTML = '';
  if (existing && Array.isArray(existing.items) && existing.items.length) {
    addSIFormRow(existing.items.length);
    Array.from(tbody.rows).forEach((r, i) => {
      const it = existing.items[i]; if (!it) return;
      const setF = (sel, v) => { const el = r.querySelector(sel); if (el) el.value = (v == null ? '' : v); };
      setF('.si-item-name', it.desc);
      setF('.si-item-hsn', it.hsn);
      setF('.si-item-qty', it.qty);
      setF('.si-item-unit', it.unit);
      setF('.si-item-rate', it.rate);
      setF('.si-item-disc', it.discPct);
      setF('.si-item-tax', it.taxPct);
      setF('.si-item-taxtype', it.taxType || 'CGST_SGST');
    });
  } else {
    addSIFormRow(3);
  }
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
  // Edit mode if the panel carries an editId (set by openSaleInvoiceForm(editId)).
  const panelEl = document.getElementById('saleInvoiceFormPanel');
  const editId = panelEl?.dataset?.editId || '';
  const existing = editId ? (state.saleInvoices || []).find(i => i.id === editId) : null;
  const invoiceId = existing ? existing.id : ('si_' + Date.now());
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
    subtotal: taxableAmount, total: grand, status: existing ? (existing.status || 'Active') : 'Active',
    linkedAbstractIds: existing ? (existing.linkedAbstractIds || [...linkedAbstracts]) : [...linkedAbstracts]
  };
  // Save invoice — edit mode replaces the record in place; new mode pushes.
  if (!state.saleInvoices) state.saleInvoices = [];
  if (existing) {
    const idx = state.saleInvoices.findIndex(i => i.id === existing.id);
    if (idx >= 0) state.saleInvoices[idx] = rec;
  } else {
    state.saleInvoices.push(rec);
  }
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
  // ── Mark linked abstracts as invoiced (only on first save, not on edit) ──
  // Set BOTH conventions: status/linkedInvoiceId (Sales module) AND
  // isInvoiced/linkedInvoice (what the Abstracts list badge reads) — otherwise
  // the abstract stays "Pending Invoice" even after the invoice is created.
  if (!existing) {
    linkedAbstracts.forEach(aId => {
      const abs = (state.abstracts || []).find(a => a.id === aId);
      if (abs) {
        abs.status = 'invoiced'; abs.linkedInvoiceId = invoiceId;
        abs.isInvoiced = true; abs.linkedInvoice = rec.invoiceNo;
      }
    });
  }
  // Clear edit-mode flag so the next "+ New" opens cleanly.
  if (panelEl) panelEl.dataset.editId = '';
  saveAllData(); closeFullScreenForm('saleInvoiceFormPanel');
  showToast(existing ? 'Sale Invoice updated!' : 'Sale Invoice saved!');
  renderSaleInvoices();
  // Refresh the parties ledger if it's currently showing this client.
  if (typeof window.renderPartyTransactions === 'function') { try { window.renderPartyTransactions(); } catch {} }
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
    tbody.innerHTML += `<tr class="hover:bg-slate-50"><td class="px-4 py-3 font-mono font-bold text-blue-700 cursor-pointer hover:underline" onclick="viewSaleInvoiceInfo('${inv.id}')">${inv.invoiceNo}</td><td class="px-4 py-3 text-slate-500">${inv.date}</td><td class="px-4 py-3 font-bold">${clientDisplay}</td><td class="px-4 py-3 text-right">${getCurrencySymbol()}${inv.subtotal?.toLocaleString('en-IN') || 0}</td><td class="px-4 py-3 text-right">${getCurrencySymbol()}${inv.gstAmount?.toLocaleString('en-IN') || 0}</td><td class="px-4 py-3 text-right font-bold">${getCurrencySymbol()}${inv.total?.toLocaleString('en-IN') || 0}</td><td class="px-4 py-3 text-right text-green-600 font-bold">${getCurrencySymbol()}${Math.min(received, inv.total).toLocaleString('en-IN')}</td><td class="px-4 py-3 text-right ${outstanding > 0 ? 'text-red-600 font-extrabold' : 'text-slate-400'}">${getCurrencySymbol()}${outstanding.toLocaleString('en-IN')}</td><td class="px-4 py-3 text-center">${statusBadge}</td><td class="px-4 py-3 text-center">${linksHtml}</td><td class="px-4 py-3 text-center"><div class="flex gap-1 justify-center"><button onclick="viewSaleInvoiceInfo('${inv.id}')" class="text-blue-600 bg-blue-50 hover:bg-blue-100 text-[10px] px-2 py-1 rounded font-bold" title="View Details">👁</button><button onclick="openSaleInvoiceForm('${inv.id}')" class="text-emerald-700 bg-emerald-50 hover:bg-emerald-100 text-[10px] px-2 py-1 rounded font-bold" title="Edit / Reopen invoice">✏️</button><button onclick="exportSaleInvoicePDF('${inv.id}')" class="text-slate-600 bg-slate-50 hover:bg-slate-100 text-[10px] px-2 py-1 rounded font-bold" title="Download PDF">📄</button><button onclick="deleteSaleInvoice('${inv.id}')" class="text-red-500 bg-red-50 hover:bg-red-100 text-[10px] px-2 py-1 rounded font-bold" title="Delete">🗑</button></div></td></tr>`;
  });
  if (!invoices.length) tbody.innerHTML = '<tr><td colspan="11" class="p-8 text-center text-slate-400 font-medium">No sale invoices found.</td></tr>';
  const setEl = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
  setEl('slKpiTotal', getCurrencySymbol() + kTotal.toLocaleString('en-IN', { maximumFractionDigits: 0 }));
  setEl('slKpiReceived', getCurrencySymbol() + kReceived.toLocaleString('en-IN', { maximumFractionDigits: 0 }));
  setEl('slKpiOutstanding', getCurrencySymbol() + (kTotal - kReceived).toLocaleString('en-IN', { maximumFractionDigits: 0 }));
  setEl('slKpiCount', invoices.length);
}
export function deleteSaleInvoice(id) {
  if (!confirm('Move this Sale Invoice to the Recycle Bin?')) return;
  const inv = (state.saleInvoices || []).find(i => i.id === id);
  // Un-invoice any abstracts this invoice billed, so they're no longer stuck
  // "Invoiced" and can be re-billed or deleted. Match both the saved link list
  // and any abstract that points back at this invoice.
  if (inv) {
    const ids = new Set(inv.linkedAbstractIds || []);
    (state.abstracts || []).forEach(a => {
      if (ids.has(a.id) || a.linkedInvoiceId === inv.id || a.linkedInvoice === inv.invoiceNo) {
        a.isInvoiced = false; a.status = 'pending';
        delete a.linkedInvoiceId; delete a.linkedInvoice;
      }
    });
  }
  window.recycleDelete?.('saleInvoices', id, 'Sale Invoice', inv?.invoiceNo || id);
  renderSaleInvoices();
  if (typeof window.renderAbstractsList === 'function') { try { window.renderAbstractsList(); } catch {} }
  if (typeof window.renderPartiesList === 'function') { try { window.renderPartiesList(); } catch {} }
  showToast('Sale Invoice moved to Recycle Bin — linked abstracts returned to pending', 'warning');
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
    <button onclick="document.getElementById('saleInvoiceDetailModal').classList.add('hide');openSaleInvoiceForm('${inv.id}')" class="flex-1 bg-emerald-700 text-white py-2.5 rounded-lg font-bold text-sm hover:bg-emerald-600">✏️ Edit / Reopen</button>
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
  const reveal = () => {
    window.switchView('abstractsView');
    renderAbstractsList();
    let tries = 0;
    const focusCard = () => {
      const el = document.getElementById('abscard_' + absId);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        el.style.transition = 'box-shadow .3s, background-color .3s';
        el.style.boxShadow = '0 0 0 3px #f59e0b';
        el.style.backgroundColor = '#fffbeb';
        setTimeout(() => { el.style.boxShadow = ''; el.style.backgroundColor = ''; }, 2400);
      } else if (tries++ < 12) { setTimeout(focusCard, 120); }
    };
    setTimeout(focusCard, 150);
  };
  // Open the project that contains this abstract, then reveal the exact card
  if (abs.projectId && state.currentProjectId !== abs.projectId) {
    openProject(abs.projectId);
    setTimeout(reveal, 260);
  } else {
    reveal();
  }
}

// ── Navigate to Measurement Sheet ──
export function _navigateToSheet(sheetId) {
  const sheet = state.sheets.find(s => s.id === sheetId);
  if (!sheet) { showToast('Sheet not found', 'error'); return; }
  if (sheet.projectId) {
    openProject(sheet.projectId);
    setTimeout(() => { window.switchView('measurementView'); loadSheet(sheetId); }, 200);
  } else {
    window.switchView('measurementView');
    loadSheet(sheetId);
  }
}

// ── Export Sale Invoice as PDF ──
// Sale invoice & sales-ledger exporters moved to ./saleExports.js


// ══════════════════════════════════
// PROFORMA INVOICE
// ══════════════════════════════════
