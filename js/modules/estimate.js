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
  addEstimateRow();
  document.getElementById('estimateEditor').classList.remove('hide');
}

export function closeEstimateEditor() { document.getElementById('estimateEditor').classList.add('hide'); }

export function addEstimateRow() {
  const tbody = document.getElementById('estTableBody');
  const tr = document.createElement('tr');
  const idx = tbody.rows.length + 1;
  tr.innerHTML = `<td class="p-2 border text-center text-xs font-bold text-slate-400">${idx}</td><td class="p-2 border"><input type="text" class="table-input desc-input" placeholder="Item Description" oninput="handleDescInput(this)"><div class="autocomplete-list hide"></div></td><td class="p-2 border"><input type="number" class="table-input est-qty font-bold" value="1" oninput="calcEstimateRow(this)"></td><td class="p-2 border"><input type="text" class="table-input est-unit" placeholder="Unit"></td><td class="p-2 border"><input type="number" class="table-input est-rate" placeholder="Rate" oninput="calcEstimateRow(this)"></td><td class="p-2 border"><input type="text" class="table-input est-amount font-bold text-emerald-700" readonly></td><td class="p-2 border text-center"><button onclick="this.closest('tr').remove(); calcEstimateTotal();" class="text-red-400 hover:bg-red-50 p-1 rounded font-bold">✕</button></td>`;
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
    if (desc && qty > 0) estItems.push({ desc, qty, unit: tr.querySelector('.est-unit').value, rate, amount: qty * rate });
  });
  if (estItems.length === 0) return showToast('Add items', 'error');
  let total = 0; estItems.forEach(i => total += i.amount);
  const data = { id: state.currentEstimateId || 'est_' + Date.now(), estNum: document.getElementById('estNum').value, clientId: cId, date: document.getElementById('estDate').value, items: estItems, total, terms: document.getElementById('estTerms').value, notes: document.getElementById('estNotes').value };
  if (state.currentEstimateId) state.estimates[state.estimates.findIndex(e => e.id === state.currentEstimateId)] = data;
  else state.estimates.push(data);
  saveAllData(); showToast('Estimate Saved'); closeEstimateEditor(); renderEstimatesList();
}

export function renderEstimatesList() {
  const container = document.getElementById('estimatesListContainer');
  container.innerHTML = '';
  state.estimates.sort((a, b) => new Date(b.date) - new Date(a.date)).forEach(e => {
    const c = state.clients.find(x => x.id === e.clientId);
    container.innerHTML += `<div class="bg-white border rounded-xl shadow-sm p-5 border-l-4 border-l-emerald-500"><div class="flex justify-between mb-2"><h3 class="font-extrabold text-slate-800">${e.estNum}</h3><span class="text-xs font-bold text-slate-500">${e.date}</span></div><p class="font-bold text-slate-700 mb-2">${c ? c.name : 'Unknown'}</p><p class="text-xl font-extrabold text-emerald-600 mb-4">${getCurrencySymbol()}${e.total.toLocaleString()}</p><div class="flex gap-2"><button onclick="exportEstimatePDF('${e.id}')" class="flex-1 bg-slate-800 text-white py-1.5 rounded font-bold text-xs">Print PDF</button><button onclick="state.estimates=state.estimates.filter(x=>x.id!=='${e.id}');saveAllData();renderEstimatesList();" class="px-3 bg-red-50 text-red-600 rounded font-bold text-xs">Del</button></div></div>`;
  });
}
