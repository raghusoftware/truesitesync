/**
 * ═══════════════════════════════════════════════════════════
 * True Site Sync — Client Hub & client master
 * ═══════════════════════════════════════════════════════════
 * Client financial hub (ledger + KPIs) and client CRUD.
 * Extracted from ui.js. Ledger build + master list live in finance.js.
 * ═══════════════════════════════════════════════════════════
 */

import { state, saveAllData } from './state.js';
import { showToast, getCurrencySymbol, populateDropdowns } from './utils.js';
import { buildClientLedger, renderMasterClientList } from './finance.js';

export function renderClientHub() {
  const cId = document.getElementById('hubClientSelect').value;
  const content = document.getElementById('hubContent');
  if (!cId) { content.classList.add('hide'); return; }
  content.classList.remove('hide');
  const work = state.abstracts.filter(a => a.clientId === cId).reduce((s, a) => s + a.totalAmount, 0);
  const taxes = state.invoices.filter(i => i.clientId === cId && i.status !== 'Cancelled').reduce((s, i) => s + i.taxAmount, 0);
  const paid = state.paymentsIn.filter(p => p.clientId === cId).reduce((s, p) => s + parseFloat(p.amount), 0);
  document.getElementById('hubWork').textContent = getCurrencySymbol() + work.toLocaleString('en-IN');
  document.getElementById('hubTax').textContent = getCurrencySymbol() + taxes.toLocaleString('en-IN');
  document.getElementById('hubPay').textContent = getCurrencySymbol() + paid.toLocaleString('en-IN');
  document.getElementById('hubBal').textContent = getCurrencySymbol() + ((work + taxes) - paid).toLocaleString('en-IN');
  const stmt = buildClientLedger(cId);
  const tbody = document.getElementById('hubStatementBody');
  tbody.innerHTML = '';
  let bal = 0;
  stmt.forEach(s => {
    bal += (s.debit - s.credit);
    tbody.innerHTML += `<tr><td class="p-3 border-b">${s.date}</td><td class="p-3 border-b font-medium">${s.desc}</td><td class="p-3 border-b text-right text-blue-700 font-bold">${s.debit ? s.debit.toFixed(2) : '-'}</td><td class="p-3 border-b text-right text-green-700 font-bold">${s.credit ? s.credit.toFixed(2) : '-'}</td><td class="p-3 border-b text-right font-extrabold text-slate-800">${getCurrencySymbol()}${bal.toFixed(2)}</td></tr>`;
  });
  document.getElementById('hubFinalBal').textContent = getCurrencySymbol() + bal.toLocaleString('en-IN', { minimumFractionDigits: 2 });
}

// ==========================================
// MASTER DATA
// ==========================================
export function openClientModal() {
  document.getElementById('clientModal').classList.remove('hidden');
  document.getElementById('modalClientName').value = '';
  document.getElementById('modalClientProject').value = '';
}

export function saveClient() {
  const name = document.getElementById('modalClientName').value;
  if (name) {
    state.clients.push({ id: 'c_' + Date.now(), name, projectName: document.getElementById('modalClientProject').value });
    saveAllData(); document.getElementById('clientModal').classList.add('hidden');
    populateDropdowns(); renderClientTable();
  }
}

export function renderClientTable() {
  const tbody = document.getElementById('clientTableBody');
  tbody.innerHTML = '';
  state.clients.forEach(c => {
    tbody.innerHTML += `<tr><td class="px-4 py-3 font-bold">${c.name}</td><td class="px-4 py-3">${c.projectName}</td><td class="px-4 py-3 text-right"><button onclick="editClient('${c.id}')" class="text-blue-600 hover:text-blue-800 font-bold text-xs bg-blue-50 px-2 py-1 rounded mr-1">Edit</button><button onclick="deleteClient('${c.id}')" class="text-red-500 hover:text-red-700 font-bold text-xs bg-red-50 px-2 py-1 rounded">Del</button></td></tr>`;
  });
}

export function editClient(id) {
  const c = state.clients.find(x => x.id === id);
  if (!c) return;
  const newName = prompt("Edit Client Name:", c.name);
  if (newName === null || newName.trim() === "") return;
  const newProj = prompt("Edit Project Name:", c.projectName);
  if (newProj === null) return;
  c.name = newName.trim(); c.projectName = newProj.trim();
  saveAllData(); populateDropdowns(); renderClientTable(); renderMasterClientList();
  showToast("Client details updated successfully");
}

export function deleteClient(id) {
  if (confirm("Delete this client?")) {
    state.clients = state.clients.filter(c => c.id !== id);
    saveAllData(); renderClientTable(); showToast("Client deleted");
  }
}
