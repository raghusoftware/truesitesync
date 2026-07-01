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
const _cf = (id) => (document.getElementById(id)?.value || '').trim();
const _setCf = (id, v) => { const el = document.getElementById(id); if (el) el.value = v ?? ''; };

export function openClientModal(editId) {
  const c = editId ? state.clients.find(x => x.id === editId) : null;
  _setCf('modalClientId', c ? c.id : '');
  _setCf('modalClientName', c ? c.name : '');
  _setCf('modalClientContact', c ? c.contact : '');
  _setCf('modalClientPhone', c ? c.phone : '');
  _setCf('modalClientEmail', c ? c.email : '');
  _setCf('modalClientGst', c ? c.gst : '');
  _setCf('modalClientPan', c ? c.pan : '');
  _setCf('modalClientTerms', c && c.paymentTermsDays != null ? c.paymentTermsDays : '');
  _setCf('modalClientCreditLimit', c && c.creditLimit ? c.creditLimit : '');
  _setCf('modalClientAddr', c ? c.address : '');
  const t = document.getElementById('clientModalTitle'); if (t) t.textContent = c ? 'Edit Client' : 'Add Client';
  document.getElementById('clientModal').classList.remove('hidden');
}

export function saveClient() {
  const name = _cf('modalClientName');
  if (!name) { showToast('Client name is required', 'error'); return; }
  const editId = _cf('modalClientId');
  const termsRaw = (_cf('modalClientTerms') || '').toString().trim();
  const paymentTermsDays = termsRaw === '' ? null : Math.max(0, parseInt(termsRaw) || 0);
  const creditLimit = parseFloat(_cf('modalClientCreditLimit')) || 0;
  const data = {
    name,
    contact: _cf('modalClientContact'), phone: _cf('modalClientPhone'), email: _cf('modalClientEmail'),
    gst: _cf('modalClientGst').toUpperCase(), pan: _cf('modalClientPan').toUpperCase(), address: _cf('modalClientAddr'),
    paymentTermsDays, creditLimit,
  };
  let createdRec = null;
  if (editId) {
    const c = state.clients.find(x => x.id === editId);
    if (c) {
      // Record a change-of-terms entry if the credit days actually changed.
      const prev = c.paymentTermsDays;
      if (paymentTermsDays != null && prev != null && paymentTermsDays !== prev) {
        const reason = (typeof window !== 'undefined' && window.prompt)
          ? (window.prompt(`Payment terms changing from ${prev} to ${paymentTermsDays} days. Reason? (optional)`, '') || '')
          : '';
        if (!Array.isArray(c.termsHistory)) c.termsHistory = [];
        c.termsHistory.push({ date: new Date().toISOString(), from: prev, to: paymentTermsDays, reason });
        data.termsHistory = c.termsHistory;
      }
      Object.assign(c, data);
    }
  } else {
    createdRec = { id: 'c_' + Date.now(), ...data, createdAt: new Date().toISOString() };
    if (paymentTermsDays != null) createdRec.termsHistory = [{ date: createdRec.createdAt, from: null, to: paymentTermsDays, reason: 'Initial terms at registration' }];
    state.clients.push(createdRec);
  }
  saveAllData();
  document.getElementById('clientModal').classList.add('hidden');
  populateDropdowns();
  if (typeof window.renderProjectsHome === 'function') window.renderProjectsHome();
  renderClientTable();
  showToast(editId ? 'Client updated' : 'Client added', 'success');
  if (createdRec && typeof window._applyPendingPartySelect === 'function') window._applyPendingPartySelect(createdRec);
  if (typeof window.renderPartiesList === 'function' && document.getElementById('partySearch')) window.renderPartiesList();
}

export function renderClientTable() {
  const tbody = document.getElementById('clientTableBody');
  if (!tbody) return;
  tbody.innerHTML = '';
  state.clients.forEach(c => {
    const projCount = (state.projects || []).filter(p => p.clientId === c.id).length;
    tbody.innerHTML += `<tr><td class="px-4 py-3 font-bold">${c.name}</td><td class="px-4 py-3">${projCount} project${projCount === 1 ? '' : 's'}</td><td class="px-4 py-3 text-right"><button onclick="editClient('${c.id}')" class="text-blue-600 hover:text-blue-800 font-bold text-xs bg-blue-50 px-2 py-1 rounded mr-1">Edit</button><button onclick="deleteClient('${c.id}')" class="text-red-500 hover:text-red-700 font-bold text-xs bg-red-50 px-2 py-1 rounded">Del</button></td></tr>`;
  });
}

export function editClient(id) {
  openClientModal(id);
}

export function deleteClient(id) {
  const projCount = (state.projects || []).filter(p => p.clientId === id).length;
  if (projCount) { showToast(`Cannot delete — this client has ${projCount} project${projCount === 1 ? '' : 's'}. Remove or reassign them first.`, 'error'); return; }
  if (confirm('Move this client to the Recycle Bin?')) {
    const _c = (state.clients || []).find(c => c.id === id);
    window.recycleDelete?.('clients', id, 'Client', _c?.name || id);
    populateDropdowns(); renderClientTable();
    if (typeof window.renderProjectsHome === 'function') window.renderProjectsHome();
    showToast('Client moved to Recycle Bin');
  }
}
