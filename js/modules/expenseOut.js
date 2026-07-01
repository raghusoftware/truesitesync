/**
 * ═══════════════════════════════════════════════════════════
 * True Site Sync — Payment-Out & Expense forms
 * ═══════════════════════════════════════════════════════════
 * "Money out" entry: vendor/other payments and categorised expenses.
 * Extracted from ui.js. Shared form chrome from formHelpers.js.
 * ═══════════════════════════════════════════════════════════
 */

import { state, saveAllData } from './state.js';
import { showToast, getCurrencySymbol } from './utils.js';
import { _openFullScreenForm, _populateVendorSelect, _populateAccountSelect, closeFullScreenForm } from './formHelpers.js';

export function openPaymentOutForm(editId) {
  _populateVendorSelect('poFormVendor');
  _populateAccountSelect('poFormAccount');
  const panelEl = document.getElementById('paymentOutFormPanel');
  if (panelEl) panelEl.dataset.editId = editId || '';
  const existing = editId ? (state.vendorPayments || []).find(p => p.id === editId) : null;
  const setEl = (id, v) => { const el = document.getElementById(id); if (el) el.value = (v == null ? '' : v); };
  if (existing) {
    setEl('poFormDate', existing.date);
    setEl('poFormAmount', existing.amount);
    setEl('poFormRef', existing.ref);
    setEl('poFormVendor', existing.vendorId);
    setEl('poFormAccount', existing.accountId);
  } else {
    setEl('poFormDate', new Date().toISOString().split('T')[0]);
    setEl('poFormAmount', '');
    setEl('poFormRef', '');
  }
  _openFullScreenForm('paymentOutFormPanel');
}

export function savePaymentOutForm() {
  const vendorId = document.getElementById('poFormVendor').value;
  const date = document.getElementById('poFormDate').value;
  const accountId = document.getElementById('poFormAccount').value;
  const amount = parseFloat(document.getElementById('poFormAmount').value) || 0;
  const ref = document.getElementById('poFormRef').value.trim();
  if (!vendorId || !accountId || amount <= 0) return showToast('Vendor, Account, and valid Amount required!', 'error');
  const panelEl = document.getElementById('paymentOutFormPanel');
  const editId = panelEl?.dataset?.editId || '';
  const existing = editId ? (state.vendorPayments || []).find(p => p.id === editId) : null;
  const rec = { id: existing ? existing.id : ('vp_' + Date.now()), vendorId, date, accountId, amount, ref };
  if (!state.vendorPayments) state.vendorPayments = [];
  if (existing) {
    const idx = state.vendorPayments.findIndex(p => p.id === existing.id);
    if (idx >= 0) state.vendorPayments[idx] = rec;
  } else {
    state.vendorPayments.push(rec);
  }
  if (panelEl) panelEl.dataset.editId = '';
  saveAllData();
  closeFullScreenForm('paymentOutFormPanel');
  showToast(existing ? 'Payment-Out updated!' : 'Payment-Out Recorded!', 'success');
  renderPaymentOut();
  if (!document.getElementById('vendorView').classList.contains('hide')) renderVendorLedger();
  if (typeof window.renderPartyTransactions === 'function') { try { window.renderPartyTransactions(); } catch {} }
  if (typeof window.renderPartiesList === 'function') { try { window.renderPartiesList(); } catch {} }
}

export function renderPaymentOut() {
  const search = (document.getElementById('poSearch')?.value || '').toLowerCase();
  const vFilter = document.getElementById('poFilterVendor')?.value || '';
  const fromD = document.getElementById('poFromDate')?.value || '';
  const toD = document.getElementById('poToDate')?.value || '';

  // Populate vendor filter
  const vSel = document.getElementById('poFilterVendor');
  if (vSel && vSel.options.length <= 1) {
    state.vendors.forEach(v => vSel.innerHTML += `<option value="${v.id}">${v.name}</option>`);
  }

  let payments = (state.vendorPayments || []).map(p => {
    const v = state.vendors.find(x => x.id === p.vendorId);
    return { ...p, vendorName: v?.name || 'Unknown' };
  });
  payments = payments.filter(p => {
    if (search && !p.vendorName.toLowerCase().includes(search) && !(p.ref || '').toLowerCase().includes(search)) return false;
    if (vFilter && p.vendorId !== vFilter) return false;
    if (fromD && p.date < fromD) return false;
    if (toD && p.date > toD) return false;
    return true;
  });
  payments.sort((a, b) => new Date(b.date) - new Date(a.date));

  let total = 0, thisMonth = 0, lastMonth = 0;
  const now = new Date();
  const thisM = now.toISOString().slice(0, 7);
  const lastMDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const lastM = lastMDate.toISOString().slice(0, 7);

  (state.vendorPayments || []).forEach(p => {
    total += p.amount || 0;
    if (p.date?.startsWith(thisM)) thisMonth += p.amount || 0;
    if (p.date?.startsWith(lastM)) lastMonth += p.amount || 0;
  });

  const change = lastMonth > 0 ? Math.round(((thisMonth - lastMonth) / lastMonth) * 100) : 0;
  if (document.getElementById('poKpiTotal')) document.getElementById('poKpiTotal').textContent = getCurrencySymbol() + ' ' + total.toLocaleString('en-IN');
  if (document.getElementById('poKpiPaid')) document.getElementById('poKpiPaid').textContent = getCurrencySymbol() + ' ' + total.toLocaleString('en-IN');
  if (document.getElementById('poKpiMonth')) document.getElementById('poKpiMonth').textContent = getCurrencySymbol() + ' ' + thisMonth.toLocaleString('en-IN');
  if (document.getElementById('poKpiChange')) document.getElementById('poKpiChange').textContent = `${change >= 0 ? '+' : ''}${change}% vs last month`;

  const tbody = document.getElementById('poTableBody');
  if (!tbody) return;
  tbody.innerHTML = '';
  if (payments.length === 0) {
    tbody.innerHTML = '<tr><td colspan="8" class="px-4 py-12 text-center text-slate-400"><div class="flex flex-col items-center gap-2"><span class="text-3xl">⚠️</span><p class="font-medium">No Transaction Found</p><p class="text-xs">We could not find any transactions.</p></div></td></tr>';
    return;
  }
  payments.forEach(p => {
    const acct = (state.accounts || []).find(a => a.id === p.accountId);
    tbody.innerHTML += `<tr class="hover:bg-slate-50 transition">
      <td class="px-4 py-3 text-slate-500">${p.date}</td>
      <td class="px-4 py-3 font-mono font-bold text-blue-700">${p.ref || '-'}</td>
      <td class="px-4 py-3 font-bold text-slate-700">${p.vendorName}</td>
      <td class="px-4 py-3 text-right font-bold text-slate-800">${getCurrencySymbol()}${(p.amount || 0).toLocaleString('en-IN')}</td>
      <td class="px-4 py-3 text-right text-green-700 font-bold">${getCurrencySymbol()}${(p.amount || 0).toLocaleString('en-IN')}</td>
      <td class="px-4 py-3 text-slate-500 text-xs">${acct?.name || '-'}</td>
      <td class="px-4 py-3 text-center"><span class="bg-green-100 text-green-700 text-[10px] px-2 py-1 rounded font-bold">Paid</span></td>
      <td class="px-4 py-3 text-center"><button onclick="deletePaymentOutRecord('${p.id}')" class="text-red-500 bg-red-50 hover:bg-red-100 text-[10px] px-2 py-1 rounded font-bold">Del</button></td>
    </tr>`;
  });
}

export function clearPaymentOutFilters() {
  ['poSearch', 'poFilterVendor', 'poFromDate', 'poToDate'].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
  renderPaymentOut();
}

export function deletePaymentOutRecord(id) {
  if (!confirm('Delete this payment record?')) return;
  window.recycleDelete && window.recycleDelete('vendorPayments', id, 'Payment Out');
  saveAllData(); renderPaymentOut(); showToast('Payment Deleted', 'error');
}

// ==========================================
// EXPENSES MODULE
// ==========================================
export function openExpenseForm() {
  document.getElementById('expFormDate').value = new Date().toISOString().split('T')[0];
  ['expFormCategory','expFormParty','expFormAmount','expFormRemarks','expFormDueDate'].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
  document.getElementById('expFormPayType').value = 'Cash';
  // Populate category suggestions
  const cats = [...new Set((state.expenses || []).map(e => e.category))].filter(Boolean);
  const dl = document.getElementById('expCatSuggestions');
  if (dl) dl.innerHTML = cats.map(c => `<option value="${c}">`).join('');
  _openFullScreenForm('expenseFormPanel');
}

export function saveExpenseForm() {
  const category = document.getElementById('expFormCategory').value.trim();
  const party = document.getElementById('expFormParty').value.trim();
  const date = document.getElementById('expFormDate').value;
  const payType = document.getElementById('expFormPayType').value;
  const amount = parseFloat(document.getElementById('expFormAmount').value) || 0;
  const dueDate = document.getElementById('expFormDueDate').value;
  const remarks = document.getElementById('expFormRemarks').value.trim();
  if (!category || amount <= 0) return showToast('Category and valid Amount required!', 'error');
  if (!state.expenses) state.expenses = [];
  const paid = payType !== 'Credit' ? amount : 0;
  state.expenses.push({
    id: 'exp_' + Date.now(), category, party, date, payType, amount, paid, balance: amount - paid, dueDate, remarks,
    expNo: 'EXP-' + (state.expenses.length + 1).toString().padStart(3, '0'),
    status: paid >= amount ? 'Paid' : 'Unpaid'
  });
  saveAllData();
  closeFullScreenForm('expenseFormPanel');
  showToast('Expense Recorded!', 'success');
  renderExpenseCategories();
}

export function renderExpenseCategories() {
  if (!state.expenses) state.expenses = [];
  const catMap = {};
  state.expenses.forEach(e => {
    if (!catMap[e.category]) catMap[e.category] = 0;
    catMap[e.category] += e.amount || 0;
  });
  const catList = document.getElementById('expCategoryList');
  if (!catList) return;
  const cats = Object.entries(catMap).sort((a, b) => a[0].localeCompare(b[0]));
  if (cats.length === 0) {
    catList.innerHTML = '<p class="text-center text-slate-400 py-8 text-sm">No expenses recorded yet.</p>';
    return;
  }
  catList.innerHTML = '';
  cats.forEach(([cat, amt]) => {
    catList.innerHTML += `<div class="flex justify-between items-center px-4 py-3 cursor-pointer hover:bg-slate-50 transition text-sm" onclick="selectExpenseCategory('${cat.replace(/'/g, "\\'")}')">
      <span class="font-bold text-slate-700 uppercase text-xs">${cat}</span>
      <div class="flex items-center gap-2"><span class="font-extrabold text-slate-800">${amt.toLocaleString('en-IN')}</span><span class="text-slate-300">⋮</span></div>
    </div>`;
  });
}

export function selectExpenseCategory(cat) {
  if (document.getElementById('expCatTitle')) document.getElementById('expCatTitle').textContent = cat;
  const catExpenses = (state.expenses || []).filter(e => e.category === cat);
  const total = catExpenses.reduce((s, e) => s + (e.amount || 0), 0);
  const balance = catExpenses.reduce((s, e) => s + (e.balance || 0), 0);
  if (document.getElementById('expCatTotal')) document.getElementById('expCatTotal').textContent = getCurrencySymbol() + ' ' + total.toLocaleString('en-IN');
  if (document.getElementById('expCatBalance')) document.getElementById('expCatBalance').textContent = getCurrencySymbol() + ' ' + balance.toLocaleString('en-IN');
  window._selectedExpCat = cat;
  renderExpenseTransactions();
}

export function renderExpenseTransactions() {
  const cat = window._selectedExpCat;
  const tbody = document.getElementById('expTableBody');
  if (!tbody) return;
  const search = (document.getElementById('expTxSearch')?.value || '').toLowerCase();
  let items = (state.expenses || []).filter(e => e.category === cat);
  if (search) items = items.filter(e => (e.expNo || '').toLowerCase().includes(search) || (e.party || '').toLowerCase().includes(search));
  items.sort((a, b) => new Date(b.date) - new Date(a.date));
  if (items.length === 0) {
    tbody.innerHTML = '<tr><td colspan="8" class="px-4 py-12 text-center text-slate-400 font-medium">No transactions found.</td></tr>';
    return;
  }
  tbody.innerHTML = '';
  items.forEach(e => {
    const statusBadge = e.status === 'Paid'
      ? '<span class="bg-green-100 text-green-700 text-[10px] px-2 py-1 rounded font-bold">Paid</span>'
      : '<span class="bg-orange-100 text-orange-700 text-[10px] px-2 py-1 rounded font-bold">Unpaid</span>';
    tbody.innerHTML += `<tr class="hover:bg-slate-50 transition">
      <td class="px-4 py-3 text-slate-500">${e.date || '-'}</td>
      <td class="px-4 py-3 font-mono font-bold text-blue-700">${e.expNo || '-'}</td>
      <td class="px-4 py-3 font-bold text-slate-700">${e.party || '-'}</td>
      <td class="px-4 py-3 text-slate-500 text-xs">${e.payType || '-'}</td>
      <td class="px-4 py-3 text-right font-bold text-slate-800">${getCurrencySymbol()}${(e.amount || 0).toLocaleString('en-IN')}</td>
      <td class="px-4 py-3 text-right ${e.balance > 0 ? 'text-red-600 font-extrabold' : 'text-slate-400'}">${getCurrencySymbol()}${(e.balance || 0).toLocaleString('en-IN')}</td>
      <td class="px-4 py-3 text-slate-500">${e.dueDate || '-'}</td>
      <td class="px-4 py-3 text-center">${statusBadge}</td>
    </tr>`;
  });
}

// ==========================================
// PURCHASE ORDER MODULE
// ==========================================
