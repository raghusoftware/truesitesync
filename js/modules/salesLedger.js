/**
 * ═══════════════════════════════════════════════════════════
 * True Site Sync — Sales Ledger view
 * ═══════════════════════════════════════════════════════════
 * Sales-ledger list/filters + per-invoice cancel/delete/view.
 * Extracted from ui.js. Navigation (switchView) reached via window.
 * ═══════════════════════════════════════════════════════════
 */

import { state, saveAllData } from './state.js';
import { showToast, getCurrencySymbol } from './utils.js';

export function renderSalesLedger() {
  const clientFilter = document.getElementById('slFilterClient');
  if (clientFilter && clientFilter.options.length <= 1) {
    state.clients.forEach(c => clientFilter.innerHTML += `<option value="${c.id}">${c.name}</option>`);
  }
  const search = (document.getElementById('slSearch')?.value || '').toLowerCase();
  const cFilter = document.getElementById('slFilterClient')?.value || '';
  const sFilter = document.getElementById('slFilterStatus')?.value || '';
  const fromD = document.getElementById('slFromDate')?.value || '';
  const toD = document.getElementById('slToDate')?.value || '';

  let filtered = state.invoices.filter(inv => {
    const c = state.clients.find(x => x.id === inv.clientId);
    const matchSearch = !search || inv.invoiceNum?.toLowerCase().includes(search) || c?.name?.toLowerCase().includes(search) || String(inv.taxAmount).includes(search);
    const matchClient = !cFilter || inv.clientId === cFilter;
    const matchStatus = !sFilter || inv.status === sFilter || (!inv.status && sFilter === 'Active');
    const matchFrom = !fromD || inv.date >= fromD;
    const matchTo = !toD || inv.date <= toD;
    return matchSearch && matchClient && matchStatus && matchFrom && matchTo;
  });
  filtered.sort((a, b) => new Date(b.date) - new Date(a.date));

  const tbody = document.getElementById('slTableBody');
  tbody.innerHTML = '';
  let kpiTotal = 0, kpiReceived = 0;

  filtered.forEach(inv => {
    const c = state.clients.find(x => x.id === inv.clientId);
    const received = state.paymentsIn.filter(p => p.invoiceId === inv.id).reduce((s, p) => s + parseFloat(p.amount), 0);
    const clientReceived = received || state.paymentsIn.filter(p => p.clientId === inv.clientId).reduce((s, p) => s + parseFloat(p.amount), 0);
    const outstanding = Math.max(0, (inv.taxAmount || 0) - clientReceived);
    const isCancelled = inv.status === 'Cancelled';
    kpiTotal += isCancelled ? 0 : (inv.taxAmount || 0);
    kpiReceived += isCancelled ? 0 : clientReceived;
    const statusBadge = isCancelled ? `<span class="bg-red-100 text-red-700 text-[10px] px-2 py-1 rounded font-bold">Cancelled</span>` : outstanding <= 0 ? `<span class="bg-green-100 text-green-700 text-[10px] px-2 py-1 rounded font-bold">✓ Paid</span>` : `<span class="bg-orange-100 text-orange-700 text-[10px] px-2 py-1 rounded font-bold">Pending</span>`;
    tbody.innerHTML += `<tr class="${isCancelled ? 'opacity-50 line-through text-slate-400' : 'hover:bg-slate-50'} transition"><td class="px-4 py-3 font-mono font-bold text-blue-700">${inv.invoiceNum}</td><td class="px-4 py-3 text-slate-500">${inv.date || '-'}</td><td class="px-4 py-3 font-bold text-slate-700">${c ? c.name : 'Unknown'}</td><td class="px-4 py-3 text-right">${getCurrencySymbol()}${(inv.subtotal || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}</td><td class="px-4 py-3 text-right text-slate-500">${getCurrencySymbol()}${(inv.taxAmount - (inv.subtotal || 0)).toLocaleString('en-IN', { maximumFractionDigits: 0 })}</td><td class="px-4 py-3 text-right font-bold text-slate-800">${getCurrencySymbol()}${(inv.taxAmount || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}</td><td class="px-4 py-3 text-right text-green-700 font-bold">${getCurrencySymbol()}${clientReceived.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</td><td class="px-4 py-3 text-right ${outstanding > 0 ? 'text-red-600 font-extrabold' : 'text-slate-400'}">${getCurrencySymbol()}${outstanding.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</td><td class="px-4 py-3 text-center">${statusBadge}</td><td class="px-4 py-3 text-center"><div class="flex gap-1 justify-center"><button onclick="viewInvoiceFromLedger('${inv.id}')" class="text-blue-600 bg-blue-50 hover:bg-blue-100 text-[10px] px-2 py-1 rounded font-bold">View</button>${!isCancelled ? `<button onclick="cancelInvoiceFromLedger('${inv.id}')" class="text-orange-600 bg-orange-50 hover:bg-orange-100 text-[10px] px-2 py-1 rounded font-bold">Cancel</button>` : ''}<button onclick="deleteInvoiceFromLedger('${inv.id}')" class="text-red-500 bg-red-50 hover:bg-red-100 text-[10px] px-2 py-1 rounded font-bold">Del</button></div></td></tr>`;
  });
  if (filtered.length === 0) tbody.innerHTML = `<tr><td colspan="10" class="p-8 text-center text-slate-400 font-medium">No invoices match your filters.</td></tr>`;

  const outstandingTotal = Math.max(0, kpiTotal - kpiReceived);
  document.getElementById('slKpiTotal').textContent = getCurrencySymbol() + kpiTotal.toLocaleString('en-IN', { maximumFractionDigits: 0 });
  document.getElementById('slKpiReceived').textContent = getCurrencySymbol() + kpiReceived.toLocaleString('en-IN', { maximumFractionDigits: 0 });
  document.getElementById('slKpiOutstanding').textContent = getCurrencySymbol() + outstandingTotal.toLocaleString('en-IN', { maximumFractionDigits: 0 });
  document.getElementById('slKpiCount').textContent = filtered.length;
  const foot = document.getElementById('slTableFoot');
  if (foot) foot.innerHTML = `<td class="px-4 py-3" colspan="5">Showing ${filtered.length} of ${state.invoices.length} invoices</td><td class="px-4 py-3 text-right">${getCurrencySymbol()}${kpiTotal.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</td><td class="px-4 py-3 text-right text-green-700">${getCurrencySymbol()}${kpiReceived.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</td><td class="px-4 py-3 text-right text-red-600">${getCurrencySymbol()}${outstandingTotal.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</td><td colspan="2"></td>`;
}

export function clearSalesLedgerFilters() {
  ['slSearch', 'slFilterClient', 'slFilterStatus', 'slFromDate', 'slToDate'].forEach(id => {
    const el = document.getElementById(id); if (el) el.value = '';
  });
  renderSalesLedger();
}

export function cancelInvoiceFromLedger(id) {
  const inv = state.invoices.find(x => x.id === id);
  if (!inv) return;
  if (!confirm(`Cancel Invoice ${inv.invoiceNum}? This is reversible.`)) return;
  inv.status = 'Cancelled';
  saveAllData(); renderSalesLedger();
  showToast(`Invoice ${inv.invoiceNum} Cancelled`, 'warning');
}

export function deleteInvoiceFromLedger(id) {
  const inv = state.invoices.find(x => x.id === id);
  if (!inv) return;
  if (!confirm(`Permanently DELETE Invoice ${inv.invoiceNum}? This CANNOT be undone.`)) return;
  if (inv.abstractIds) {
    inv.abstractIds.forEach(aId => {
      const abs = state.abstracts.find(a => a.id === aId);
      if (abs) { abs.isInvoiced = false; abs.linkedInvoice = null; }
    });
  }
  state.invoices = state.invoices.filter(x => x.id !== id);
  saveAllData(); renderSalesLedger();
  showToast('Invoice Deleted', 'error');
}

export function viewInvoiceFromLedger(id) {
  // Open the full Sale Invoice form prefilled — matches the new ledger Open flow.
  if (typeof window.openSaleInvoiceForm === 'function') {
    try { window.openSaleInvoiceForm(id); return; } catch (e) { console.warn('[ledger view]', e); }
  }
  // Fallback to the old behaviour if the form isn't loaded.
  window.switchView('billingView');
  showToast('Switched to Billing view. See Invoice History below.', 'success');
}
