/**
 * ═══════════════════════════════════════════════════════════
 * True Site Sync — Estimates / Quotations
 * ═══════════════════════════════════════════════════════════
 * Create/edit/list commercial estimates. Extracted from ui.js.
 * PDF export lives in invoiceExports.js; row/total calc in finance.js
 * (both reached via window from inline handlers).
 * ═══════════════════════════════════════════════════════════
 */

import { state, saveAllData } from './state.js';
import { showToast, getCurrencySymbol } from './utils.js';

export function createNewEstimate() {
  state.currentEstimateId = null;
  document.getElementById('estClient').value = '';
  document.getElementById('estDate').value = new Date().toISOString().split('T')[0];
  document.getElementById('estNum').value = `EST-${Date.now().toString().slice(-4)}`;
  document.getElementById('estTerms').value = '';
  document.getElementById('estNotes').value = '';
  document.getElementById('estTableBody').innerHTML = '';
  const t = document.getElementById('estEditorTitle'); if (t) t.textContent = 'Draft Estimate';
  addEstimateRow();
  document.getElementById('estimateEditor').classList.remove('hide');
}

/** Reopen a saved estimate for editing: load it into the editor and mark it current
 *  so saveEstimate() updates in place (instead of creating a new one). */
export function openEstimate(id) {
  const e = state.estimates.find(x => x.id === id);
  if (!e) return showToast('Estimate not found', 'error');
  state.currentEstimateId = e.id;
  const esc = s => String(s == null ? '' : s).replace(/"/g, '&quot;');
  document.getElementById('estClient').value = e.clientId || '';
  document.getElementById('estDate').value = e.date || new Date().toISOString().split('T')[0];
  document.getElementById('estNum').value = e.estNum || '';
  document.getElementById('estTerms').value = e.terms || '';
  document.getElementById('estNotes').value = e.notes || '';
  const tbody = document.getElementById('estTableBody');
  tbody.innerHTML = '';
  (e.items || []).forEach((it, idx) => {
    const amt = (it.qty || 0) * (it.rate || 0);
    const tr = document.createElement('tr');
    tr.innerHTML = `<td class="p-2 border text-center text-xs font-bold text-slate-400">${idx + 1}</td><td class="p-2 border"><input type="text" class="table-input desc-input" value="${esc(it.desc)}" placeholder="Item Description" oninput="handleDescInput(this)"><input type="hidden" class="est-code" value="${esc(it.code)}"><div class="autocomplete-list hide"></div></td><td class="p-2 border"><input type="number" class="table-input est-qty font-bold" value="${it.qty || 0}" oninput="calcEstimateRow(this)"></td><td class="p-2 border"><input type="text" class="table-input est-unit" value="${esc(it.unit)}" placeholder="Unit"></td><td class="p-2 border"><input type="number" class="table-input est-rate" value="${it.rate || 0}" oninput="calcEstimateRow(this)"></td><td class="p-2 border"><input type="text" class="table-input est-amount font-bold text-emerald-700" value="${amt.toFixed(2)}" readonly></td><td class="p-2 border text-center"><button onclick="this.closest('tr').remove(); calcEstimateTotal();" class="text-red-400 hover:bg-red-50 p-1 rounded font-bold">✕</button></td>`;
    tbody.appendChild(tr);
  });
  if (!(e.items || []).length) addEstimateRow();
  const t = document.getElementById('estEditorTitle'); if (t) t.textContent = 'Edit Estimate — ' + (e.estNum || '');
  document.getElementById('estimateEditor').classList.remove('hide');
  if (window.calcEstimateTotal) window.calcEstimateTotal();
  document.getElementById('estimateEditor').scrollIntoView({ behavior: 'smooth', block: 'start' });
}
window.openEstimate = openEstimate;

export function closeEstimateEditor() { document.getElementById('estimateEditor').classList.add('hide'); }

export function addEstimateRow() {
  const tbody = document.getElementById('estTableBody');
  const tr = document.createElement('tr');
  const idx = tbody.rows.length + 1;
  tr.innerHTML = `<td class="p-2 border text-center text-xs font-bold text-slate-400">${idx}</td><td class="p-2 border"><input type="text" class="table-input desc-input" placeholder="Item Description" oninput="handleDescInput(this)"><input type="hidden" class="est-code"><div class="autocomplete-list hide"></div></td><td class="p-2 border"><input type="number" class="table-input est-qty font-bold" value="1" oninput="calcEstimateRow(this)"></td><td class="p-2 border"><input type="text" class="table-input est-unit" placeholder="Unit"></td><td class="p-2 border"><input type="number" class="table-input est-rate" placeholder="Rate" oninput="calcEstimateRow(this)"></td><td class="p-2 border"><input type="text" class="table-input est-amount font-bold text-emerald-700" readonly></td><td class="p-2 border text-center"><button onclick="this.closest('tr').remove(); calcEstimateTotal();" class="text-red-400 hover:bg-red-50 p-1 rounded font-bold">✕</button></td>`;
  tbody.appendChild(tr);
}

export function saveEstimate() {
  const cId = document.getElementById('estClient').value;
  if (!cId) return showToast('Client required', 'error');
  const estItems = [];
  document.querySelectorAll('#estTableBody tr').forEach(tr => {
    const desc = tr.querySelector('.desc-input').value;
    const qty = parseFloat(tr.querySelector('.est-qty').value) || 0;
    const rate = parseFloat(tr.querySelector('.est-rate').value) || 0;
    const code = tr.querySelector('.est-code')?.value || '';   // BOQ code — links line to its recipe
    if (desc && qty > 0) estItems.push({ code, desc, qty, unit: tr.querySelector('.est-unit').value, rate, amount: qty * rate });
  });
  if (estItems.length === 0) return showToast('Add items', 'error');
  let total = 0; estItems.forEach(i => total += i.amount);
  // Preserve downstream links (Sale Order / Project / already-ordered materials) across edits.
  const prev = state.currentEstimateId ? state.estimates.find(e => e.id === state.currentEstimateId) : null;
  const data = { id: state.currentEstimateId || 'est_' + Date.now(), estNum: document.getElementById('estNum').value, clientId: cId, date: document.getElementById('estDate').value, items: estItems, total, terms: document.getElementById('estTerms').value, notes: document.getElementById('estNotes').value,
    saleOrderId: prev?.saleOrderId || null, projectId: prev?.projectId || null, orderedMaterials: prev?.orderedMaterials || [] };
  if (state.currentEstimateId) state.estimates[state.estimates.findIndex(e => e.id === state.currentEstimateId)] = data;
  else state.estimates.push(data);
  saveAllData(); showToast('Estimate Saved'); closeEstimateEditor(); renderEstimatesList();
}

export function renderEstimatesList() {
  const container = document.getElementById('estimatesListContainer');
  container.innerHTML = '';
  state.estimates.sort((a, b) => new Date(b.date) - new Date(a.date)).forEach(e => {
    const c = state.clients.find(x => x.id === e.clientId);
    const soBadge = e.saleOrderId ? '<span class="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-100">SO + Project ✓</span>' : '';
    const ordered = (e.orderedMaterials || []).length;
    const matBadge = ordered ? `<span class="text-[10px] font-bold px-2 py-0.5 rounded-full bg-purple-50 text-purple-700 border border-purple-100">${ordered} material(s) ordered</span>` : '';
    const soBtn = e.saleOrderId
      ? `<button onclick="window.estimateToSaleOrder('${e.id}')" class="flex-1 bg-blue-50 text-blue-700 border border-blue-200 py-1.5 rounded font-bold text-xs" title="Already created — click to create another">SO ✓</button>`
      : `<button onclick="window.estimateToSaleOrder('${e.id}')" class="flex-1 bg-blue-600 text-white py-1.5 rounded font-bold text-xs">→ Sale Order + Project</button>`;
    container.innerHTML += `<div class="bg-white border rounded-xl shadow-sm p-5 border-l-4 border-l-emerald-500"><div class="flex justify-between mb-2"><h3 class="font-extrabold text-slate-800">${e.estNum}</h3><span class="text-xs font-bold text-slate-500">${e.date}</span></div><p class="font-bold text-slate-700 mb-1">${c ? c.name : 'Unknown'}</p><div class="flex flex-wrap gap-1 mb-2">${soBadge}${matBadge}</div><p class="text-xl font-extrabold text-emerald-600 mb-3">${getCurrencySymbol()}${e.total.toLocaleString()}</p><div class="flex flex-col gap-2"><div class="flex gap-2">${soBtn}<button onclick="window.openEstimateMaterials('${e.id}')" class="flex-1 bg-purple-600 text-white py-1.5 rounded font-bold text-xs">⚙ Materials / PO</button></div><div class="flex gap-2"><button onclick="window.openEstimate('${e.id}')" class="flex-1 bg-emerald-50 text-emerald-700 border border-emerald-200 py-1.5 rounded font-bold text-xs hover:bg-emerald-100">✏ Edit</button><button onclick="exportEstimatePDF('${e.id}')" class="flex-1 bg-slate-800 text-white py-1.5 rounded font-bold text-xs">Print PDF</button><button onclick="window.recycleDelete&&window.recycleDelete('estimates','${e.id}','Estimate','${(e.estNum||'').replace(/'/g,"")}');renderEstimatesList();" class="px-3 bg-red-50 text-red-600 rounded font-bold text-xs">Del</button></div></div></div>`;
  });
}
