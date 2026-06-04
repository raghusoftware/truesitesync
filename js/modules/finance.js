import { state, saveAllData, saveLabourData, saveEquipmentData } from './state.js';
import { showToast, getAllLocations, populateDropdowns, refreshPurchaseDropdowns, formatINR, formatINR2, getCompanyHeaderForPDF, getCurrencySymbol, mobileSavePDF } from './utils.js';

export function calcPurchaseTotal() {
  let subtotal = 0;
  document.querySelectorAll('#purTableBody tr').forEach(tr => {
    const qty = parseFloat(tr.querySelector('.pur-qty').value) || 0;
    const rate = parseFloat(tr.querySelector('.pur-rate').value) || 0;
    const amt = qty * rate;
    tr.querySelector('.pur-amt').value = amt > 0 ? amt.toFixed(2) : '';
    subtotal += amt;
  });
  const transport = parseFloat(document.getElementById('purTransport').value) || 0;
  const loading = parseFloat(document.getElementById('purLoading').value) || 0;
  const gst = parseFloat(document.getElementById('purGst').value) || 0;
  const extras = transport + loading + gst;
  const grandTotal = subtotal + extras;
  document.getElementById('purSubtotal').textContent = getCurrencySymbol() + subtotal.toFixed(2);
  document.getElementById('purExtras').textContent = getCurrencySymbol() + extras.toFixed(2);
  document.getElementById('purGrandTotal').textContent = getCurrencySymbol() + grandTotal.toFixed(2);
}

export function calcQty(input) {
  if (!input) return;
  const tr = input.closest('tr');
  const n = parseFloat(tr.querySelector('.nos-input').value) || (tr.querySelector('.nos-input').value === '0' ? 0 : 1);
  const l = parseFloat(tr.querySelector('.l-input').value) || (tr.querySelector('.l-input').value === '0' ? 0 : 1);
  const b = parseFloat(tr.querySelector('.b-input').value) || (tr.querySelector('.b-input').value === '0' ? 0 : 1);
  const h = parseFloat(tr.querySelector('.h-input').value) || (tr.querySelector('.h-input').value === '0' ? 0 : 1);
  const coef = parseFloat(tr.querySelector('.coef-input').value) || 1;
  let customDimProduct = 1;
  tr.querySelectorAll('.custom-dim-input').forEach(inp => {
    const v = parseFloat(inp.value);
    if (v || inp.value === '0') customDimProduct *= v;
  });
  const hasVal = tr.querySelector('.nos-input').value || tr.querySelector('.l-input').value || tr.querySelector('.b-input').value || tr.querySelector('.h-input').value;
  const hasCustomDim = tr.querySelector('.custom-dim-input')?.value;
  tr.querySelector('.qty-input').value = (hasVal || hasCustomDim) ? (n * l * b * h * coef * customDimProduct).toFixed(3) : '';
}

export function calcEstimateRow(input) {
  const tr = input.closest('tr');
  const q = parseFloat(tr.querySelector('.est-qty').value) || 0;
  const r = parseFloat(tr.querySelector('.est-rate').value) || 0;
  tr.querySelector('.est-amount').value = (q * r).toFixed(2);
  calcEstimateTotal();
}

export function calcEstimateTotal() {
  let t = 0;
  document.querySelectorAll('.est-amount').forEach(inp => t += parseFloat(inp.value) || 0);
  document.getElementById('estTotalVal').textContent = getCurrencySymbol() + t.toLocaleString('en-IN', { minimumFractionDigits: 2 });
}

export function calculateLiveBill() {
  let subtotal = 0;
  document.querySelectorAll('.billing-checkbox:checked').forEach(chk => {
    const a = state.abstracts.find(x => x.id === chk.value);
    if (a) subtotal += a.totalAmount;
  });
  const type = document.querySelector('input[name="gstType"]:checked').value;
  let tax = 0;
  if (type === 'intra') {
    const c = parseFloat(document.getElementById('billCgst').value) || 0;
    const s = parseFloat(document.getElementById('billSgst').value) || 0;
    tax = subtotal * ((c + s) / 100);
  } else {
    const i = parseFloat(document.getElementById('billIgst').value) || 0;
    tax = subtotal * (i / 100);
  }
  document.getElementById('billPreviewSub').textContent = getCurrencySymbol() + subtotal.toLocaleString('en-IN', { minimumFractionDigits: 2 });
  document.getElementById('billPreviewTax').textContent = getCurrencySymbol() + tax.toLocaleString('en-IN', { minimumFractionDigits: 2 });
  document.getElementById('billPreviewTotal').textContent = getCurrencySymbol() + (subtotal + tax).toLocaleString('en-IN', { minimumFractionDigits: 2 });
  return { subtotal, tax, total: subtotal + tax, type };
}

export function buildClientLedger(cId) {
  let stmt = [];
  state.abstracts.filter(a => a.clientId === cId).forEach(a => stmt.push({
    date: a.date,
    desc: `Work Done / RA Bill <span class="text-blue-600 cursor-pointer underline">(${a.abstractNum})</span>`,
    debit: a.totalAmount, credit: 0
  }));
  state.invoices.filter(i => i.clientId === cId).forEach(i => {
    if (i.status === 'Cancelled') stmt.push({
      date: i.date,
      desc: `<span class="line-through text-red-500">GST Applied (Cancelled Invoice ${i.invoiceNum})</span>`,
      debit: 0, credit: 0
    });
    else stmt.push({
      date: i.date,
      desc: `GST Tax Applied <span class="text-blue-600 cursor-pointer underline" onclick="openInvoiceInfo('${i.id}')">(${i.invoiceNum})</span>`,
      debit: i.taxAmount, credit: 0
    });
  });
  state.paymentsIn.filter(p => p.clientId === cId).forEach(p => {
    const acc = state.accounts.find(x => x.id === p.accountId);
    stmt.push({
      date: p.date,
      desc: `Payment Received (${p.ref || 'No Ref'}) via ${acc ? acc.name : 'Unknown'}`,
      debit: 0, credit: parseFloat(p.amount)
    });
  });
  stmt.sort((a, b) => new Date(a.date) - new Date(b.date));
  return stmt;
}

export function savePaymentIn() {
  const clientId = document.getElementById('accInClient').value;
  const amount = document.getElementById('accInAmount').value;
  const accountId = document.getElementById('accInAccount').value;
  if (!clientId || !amount || !accountId) return showToast('Client, Account and Amount required', 'error');
  state.paymentsIn.push({
    id: 'in_' + Date.now(), clientId, accountId,
    date: document.getElementById('accInDate').value,
    amount, ref: document.getElementById('accInRef').value
  });
  saveAllData();
  showToast('Payment Saved');
  document.getElementById('accInAmount').value = '';
  updateDashboard();
  renderMasterClientList();
}

export function saveExpense() {
  const amount = document.getElementById('accExpAmount').value;
  const accountId = document.getElementById('accExpAccount').value;
  if (!amount || !accountId) return showToast('Account and Amount required', 'error');
  state.expenses.push({
    id: 'exp_' + Date.now(),
    clientId: document.getElementById('accExpClient').value,
    accountId,
    date: document.getElementById('accExpDate').value,
    category: document.getElementById('accExpCat').value,
    amount,
    remarks: document.getElementById('accExpRemarks').value
  });
  saveAllData();
  showToast('Expense Saved');
  document.getElementById('accExpAmount').value = '';
  updateDashboard();
}

export function saveVendorPayment() {
  const vId = document.getElementById('venPayVendor').value;
  const amt = document.getElementById('venPayAmount').value;
  const accountId = document.getElementById('venPayAccount').value;
  if (!vId || !amt || !accountId) return showToast('Required fields missing', 'error');
  state.vendorPayments.push({
    id: 'vp_' + Date.now(), vendorId: vId, accountId,
    date: document.getElementById('venPayDate').value,
    amount: amt, ref: document.getElementById('venPayRef').value
  });
  saveAllData();
  showToast('Payment Saved');
  renderVendorLedger();
  document.getElementById('venPayAmount').value = '';
  document.getElementById('venPayRef').value = '';
  updateDashboard();
}

export function savePurchaseBill() {
  const vendorId = document.getElementById('purVendor').value;
  const siteId = document.getElementById('purSite').value;
  const billNo = document.getElementById('purBillNo').value;
  const date = document.getElementById('purDate').value;
  if (!vendorId || !siteId || !billNo) return showToast('Vendor, Bill No, and Site/Location are required!', 'error');
  const purItems = [];
  let subtotal = 0;
  document.querySelectorAll('#purTableBody tr').forEach(tr => {
    const rmId = tr.querySelector('.pur-mat').value;
    const qty = parseFloat(tr.querySelector('.pur-qty').value) || 0;
    const rate = parseFloat(tr.querySelector('.pur-rate').value) || 0;
    if (rmId && qty > 0) {
      const amt = qty * rate;
      purItems.push({ rawMatId: rmId, qty, rate, amount: amt });
      subtotal += amt;
    }
  });
  if (purItems.length === 0) return showToast('Add at least one item!', 'error');
  const transport = parseFloat(document.getElementById('purTransport').value) || 0;
  const loading = parseFloat(document.getElementById('purLoading').value) || 0;
  const gst = parseFloat(document.getElementById('purGst').value) || 0;
  const totalAmount = subtotal + transport + loading + gst;
  const billId = 'pb_' + Date.now();
  state.vendorMaterials.push({ id: billId, vendorId, siteId, billNo, date, items: purItems, extras: { transport, loading, gst }, totalAmount });
  purItems.forEach(it => {
    state.inventoryTx.push({
      id: 'tx_in_' + Date.now() + Math.random().toString(36).substr(2, 5),
      date, siteId, type: 'IN', rawMaterialId: it.rawMatId,
      qty: it.qty, rate: it.rate, ref: `Purchase Bill: ${billNo}`, refBillId: billId
    });
  });
  saveAllData();
  showToast('Purchase Bill Saved & Inventory Updated!', 'success');
  document.getElementById('purBillNo').value = '';
  document.getElementById('purTableBody').innerHTML = '';
  window.addPurchaseRow(3);
  document.getElementById('purTransport').value = '0';
  document.getElementById('purLoading').value = '0';
  document.getElementById('purGst').value = '0';
  calcPurchaseTotal();
  renderVendorLedger();
  updateDashboard();
}

export function renderVendorLedger() {
  const vId = document.getElementById('purVendor').value || document.getElementById('venPayVendor').value;
  if (!vId) return;
  document.getElementById('purVendor').value = vId;
  document.getElementById('venPayVendor').value = vId;
  const v = state.vendors.find(x => x.id === vId);
  document.getElementById('venLedgerTitle').textContent = `Ledger Statement: ${v.name}`;
  let ledger = [];
  state.vendorMaterials.filter(m => m.vendorId === vId).forEach(m => {
    if (m.items) ledger.push({ id: m.id, type: 'bill', date: m.date, desc: `Purchase Bill: <span class="font-bold text-blue-700">${m.billNo}</span> (${m.items.length} items. Extras: ${getCurrencySymbol()}${(m.extras.transport + m.extras.loading + m.extras.gst).toFixed(2)})`, debit: m.totalAmount, credit: 0 });
    else ledger.push({ id: m.id, type: 'mat', date: m.date, desc: `Legacy Material: ${m.name}`, debit: m.amount, credit: 0 });
  });
  state.vendorPayments.filter(p => p.vendorId === vId).forEach(p => ledger.push({ id: p.id, type: 'pay', date: p.date, desc: `Payment Out: Ref - ${p.ref || 'N/A'}`, debit: 0, credit: parseFloat(p.amount) }));
  ledger.sort((a, b) => new Date(a.date) - new Date(b.date));
  const tbody = document.getElementById('vendorLedgerBody');
  tbody.innerHTML = '';
  let bal = 0;
  ledger.forEach(l => {
    bal += (l.debit - l.credit);
    const actionBtns = `<button onclick="deleteVendorRecord('${l.id}', '${l.type}')" class="text-red-500 hover:underline text-[10px] font-bold uppercase ml-2">Delete</button>`;
    tbody.innerHTML += `<tr><td class="p-2 border align-top font-medium">${l.date}</td><td class="p-2 border align-top">${l.desc} ${actionBtns}</td><td class="p-2 border text-right text-blue-800 font-bold align-top">${l.debit ? l.debit.toFixed(2) : '-'}</td><td class="p-2 border text-right text-green-700 font-bold align-top">${l.credit ? l.credit.toFixed(2) : '-'}</td><td class="p-2 border text-right font-extrabold ${bal > 0 ? 'text-orange-600' : 'text-slate-800'} align-top">${getCurrencySymbol()}${bal.toFixed(2)}</td></tr>`;
  });
  document.getElementById('venLedgerBal').textContent = getCurrencySymbol() + bal.toFixed(2);
}

export function deleteVendorRecord(id, type) {
  if (!confirm("Are you sure you want to delete this record?")) return;
  if (type === 'bill' || type === 'mat') {
    state.vendorMaterials = state.vendorMaterials.filter(m => m.id !== id);
    state.inventoryTx = state.inventoryTx.filter(tx => tx.refBillId !== id);
  } else {
    state.vendorPayments = state.vendorPayments.filter(p => p.id !== id);
  }
  saveAllData();
  renderVendorLedger();
  updateDashboard();
  renderMasterVendorList();
  showToast("Record deleted successfully");
}

let _selectedAccountId = null;

export function renderAccounts() {
  const container = document.getElementById('accountsCardsContainer');
  if (!container) return;
  const term = (document.getElementById('acctSearch')?.value || '').toLowerCase();
  container.innerHTML = '';
  if (state.accounts.length === 0) {
    container.innerHTML = '<p class="text-slate-500 text-sm p-4 text-center">No accounts yet. Click "+ Add Account".</p>';
    return;
  }
  state.accounts.filter(a => !term || a.name.toLowerCase().includes(term)).forEach(acc => {
    const bal = _getAccountBalance(acc.id);
    const icon = acc.type === 'Bank' ? '🏦' : acc.type === 'Loan' ? '🏷️' : '💵';
    const sel = _selectedAccountId === acc.id ? 'background:#eff6ff;border-left:3px solid #2563eb;' : 'border-left:3px solid transparent;';
    container.innerHTML += `<div onclick="_selectAccount('${acc.id}')" style="${sel}cursor:pointer;padding:12px 16px;display:flex;justify-content:space-between;align-items:center;" onmouseover="if('${_selectedAccountId}'!=='${acc.id}')this.style.background='#f8fafc'" onmouseout="if('${_selectedAccountId}'!=='${acc.id}')this.style.background=''">
      <div><div style="font-weight:600;color:#1e293b;font-size:13px;">${icon} ${acc.name}</div><div style="font-size:10px;color:#94a3b8;">${acc.type || 'Cash'}</div></div>
      <div style="font-weight:700;font-size:14px;color:${bal < 0 ? '#dc2626' : '#059669'};">${getCurrencySymbol()}${Math.abs(bal).toLocaleString('en-IN', { maximumFractionDigits: 0 })}${bal < 0 ? ' Dr' : ''}</div>
    </div>`;
  });
  if (_selectedAccountId) _renderAccountTxns();
}

window._selectAccount = function(id) {
  _selectedAccountId = id;
  window._selAcct = id;
  renderAccounts();
  _renderAccountTxns();
};

function _renderAccountTxns() {
  const acc = state.accounts.find(a => a.id === _selectedAccountId);
  if (!acc) return;
  const empty = document.getElementById('acctEmptyState');
  if (empty) empty.style.display = 'none';
  const cur = getCurrencySymbol();
  document.getElementById('acctSelName').textContent = acc.name;
  document.getElementById('acctSelType').textContent = acc.type || 'Cash';

  // Gather all transactions touching this account
  let txns = [];
  state.paymentsIn.filter(p => p.accountId === acc.id).forEach(p => txns.push({ date: p.date, desc: 'Receipt: ' + (p.ref || 'Client payment'), credit: parseFloat(p.amount) || 0, debit: 0, type: 'paymentsIn', id: p.id }));
  state.expenses.filter(e => e.accountId === acc.id).forEach(e => txns.push({ date: e.date, desc: (e.category || 'Expense') + (e.remarks ? ' — ' + e.remarks : ''), credit: 0, debit: parseFloat(e.amount) || 0, type: 'expenses', id: e.id }));
  state.vendorPayments.filter(v => v.accountId === acc.id).forEach(v => txns.push({ date: v.date, desc: 'Vendor: ' + (v.ref || 'Payment'), credit: 0, debit: parseFloat(v.amount) || 0, type: 'vendorPayments', id: v.id }));
  state.labourPayments.filter(l => l.accountId === acc.id).forEach(l => txns.push({ date: l.date, desc: 'Labour: ' + (l.ref || 'Wage'), credit: 0, debit: parseFloat(l.amount) || 0, type: 'labourPayments', id: l.id }));
  (state.accountTransfers || []).forEach(t => {
    if (t.fromAccountId === acc.id) txns.push({ date: t.date, desc: 'Transfer to ' + (state.accounts.find(a => a.id === t.toAccountId)?.name || '?'), credit: 0, debit: parseFloat(t.amount) || 0, type: 'accountTransfers', id: t.id });
    if (t.toAccountId === acc.id) txns.push({ date: t.date, desc: 'Transfer from ' + (state.accounts.find(a => a.id === t.fromAccountId)?.name || '?'), credit: parseFloat(t.amount) || 0, debit: 0, type: 'accountTransfers', id: t.id });
  });
  txns.sort((a, b) => new Date(a.date) - new Date(b.date));

  let bal = 0;
  let html = `<table style="width:100%;border-collapse:collapse;font-size:13px;"><thead style="position:sticky;top:0;background:#f8fafc;"><tr>
    <th style="text-align:left;padding:10px 14px;font-size:10px;font-weight:600;color:#64748b;text-transform:uppercase;border-bottom:1px solid #e2e8f0;">Date</th>
    <th style="text-align:left;padding:10px 14px;font-size:10px;font-weight:600;color:#64748b;text-transform:uppercase;border-bottom:1px solid #e2e8f0;">Description</th>
    <th style="text-align:right;padding:10px 14px;font-size:10px;font-weight:600;color:#059669;text-transform:uppercase;border-bottom:1px solid #e2e8f0;">Deposit</th>
    <th style="text-align:right;padding:10px 14px;font-size:10px;font-weight:600;color:#dc2626;text-transform:uppercase;border-bottom:1px solid #e2e8f0;">Withdraw</th>
    <th style="text-align:right;padding:10px 14px;font-size:10px;font-weight:600;color:#64748b;text-transform:uppercase;border-bottom:1px solid #e2e8f0;">Balance</th>
    <th style="border-bottom:1px solid #e2e8f0;"></th></tr></thead><tbody>`;
  txns.forEach(t => {
    bal += t.credit - t.debit;
    html += `<tr style="border-bottom:1px solid #f1f5f9;">
      <td style="padding:9px 14px;color:#64748b;white-space:nowrap;">${t.date || '—'}</td>
      <td style="padding:9px 14px;font-weight:500;color:#1e293b;">${t.desc}</td>
      <td style="padding:9px 14px;text-align:right;color:#059669;font-weight:600;">${t.credit ? cur + t.credit.toLocaleString('en-IN') : ''}</td>
      <td style="padding:9px 14px;text-align:right;color:#dc2626;font-weight:600;">${t.debit ? cur + t.debit.toLocaleString('en-IN') : ''}</td>
      <td style="padding:9px 14px;text-align:right;font-weight:700;color:${bal < 0 ? '#dc2626' : '#1e293b'};">${cur}${Math.abs(bal).toLocaleString('en-IN')}</td>
      <td style="padding:9px 8px;text-align:center;"><button onclick="_deleteAccountTx('${t.type}','${t.id}')" style="font-size:10px;color:#dc2626;background:#fef2f2;border:1px solid #fecaca;border-radius:4px;padding:2px 6px;cursor:pointer;">✕</button></td>
    </tr>`;
  });
  if (!txns.length) html += '<tr><td colspan="6" style="padding:40px;text-align:center;color:#94a3b8;">No transactions yet</td></tr>';
  html += '</tbody></table>';
  document.getElementById('acctTxnsContainer').innerHTML = html;
  const cb = document.getElementById('acctClosingBal');
  cb.textContent = `${cur}${Math.abs(bal).toLocaleString('en-IN', { minimumFractionDigits: 2 })}${bal < 0 ? ' (Dr)' : ''}`;
  cb.className = `text-xl font-extrabold ${bal < 0 ? 'text-red-400' : 'text-green-400'}`;
}

// Deposit / Withdraw quick entries
window._acctDeposit = function() {
  const acc = state.accounts.find(a => a.id === _selectedAccountId);
  if (!acc) { showToast('Select an account first', 'error'); return; }
  const amt = parseFloat(prompt(`Deposit to ${acc.name} (₹):`)); if (!amt || amt <= 0) return;
  const ref = prompt('Note:', 'Manual deposit') || 'Deposit';
  state.paymentsIn.push({ id: 'in_' + Date.now(), clientId: '', accountId: acc.id, date: new Date().toISOString().split('T')[0], amount: amt, ref });
  saveAllData(); renderAccounts();
  showToast('Deposit recorded', 'success');
};
window._acctWithdraw = function() {
  const acc = state.accounts.find(a => a.id === _selectedAccountId);
  if (!acc) { showToast('Select an account first', 'error'); return; }
  const amt = parseFloat(prompt(`Withdraw from ${acc.name} (₹):`)); if (!amt || amt <= 0) return;
  const ref = prompt('Note:', 'Manual withdrawal') || 'Withdrawal';
  state.expenses.push({ id: 'exp_' + Date.now(), accountId: acc.id, date: new Date().toISOString().split('T')[0], category: 'Withdrawal', amount: amt, remarks: ref });
  saveAllData(); renderAccounts();
  showToast('Withdrawal recorded', 'success');
};
// Transfer between accounts (toolbar)
window._acctTransfer = function() {
  if (state.accounts.length < 2) { showToast('Need at least 2 accounts', 'error'); return; }
  const id = _selectedAccountId || state.accounts[0].id;
  if (typeof window._transferFromAccount === 'function') window._transferFromAccount(id);
};

function _getAccountBalance(accId) {
  let bal = 0;
  state.paymentsIn.filter(p => p.accountId === accId).forEach(p => bal += (parseFloat(p.amount) || 0));
  state.expenses.filter(e => e.accountId === accId).forEach(e => bal -= (parseFloat(e.amount) || 0));
  state.vendorPayments.filter(v => v.accountId === accId).forEach(v => bal -= (parseFloat(v.amount) || 0));
  state.labourPayments.filter(l => l.accountId === accId).forEach(l => bal -= (parseFloat(l.amount) || 0));
  state.equipmentLogs.filter(e => e.accountId === accId).forEach(e => bal -= (parseFloat(e.amount) || 0));
  // Inter-account transfers
  (state.accountTransfers || []).forEach(t => {
    if (t.fromAccountId === accId) bal -= (parseFloat(t.amount) || 0);
    if (t.toAccountId === accId) bal += (parseFloat(t.amount) || 0);
  });
  return bal;
}

window._viewAccountLedger = function(accId) {
  const acc = state.accounts.find(a => a.id === accId);
  if (!acc) return;
  let txs = [];
  state.paymentsIn.filter(p => p.accountId === accId).forEach(p => txs.push({ date: p.date, desc: 'Receipt: ' + (p.ref || 'Client Payment'), credit: parseFloat(p.amount) || 0, debit: 0, id: p.id, type: 'paymentsIn' }));
  state.expenses.filter(e => e.accountId === accId).forEach(e => txs.push({ date: e.date, desc: 'Expense: ' + (e.category || e.ref || 'Misc'), credit: 0, debit: parseFloat(e.amount) || 0, id: e.id, type: 'expenses' }));
  state.vendorPayments.filter(v => v.accountId === accId).forEach(v => txs.push({ date: v.date, desc: 'Vendor: ' + (v.ref || 'Payment'), credit: 0, debit: parseFloat(v.amount) || 0, id: v.id, type: 'vendorPayments' }));
  state.labourPayments.filter(l => l.accountId === accId).forEach(l => txs.push({ date: l.date, desc: 'Labour: ' + (l.ref || 'Wage'), credit: 0, debit: parseFloat(l.amount) || 0, id: l.id, type: 'labourPayments' }));
  (state.accountTransfers || []).filter(t => t.fromAccountId === accId).forEach(t => txs.push({ date: t.date, desc: 'Transfer to ' + (state.accounts.find(a => a.id === t.toAccountId)?.name || '?'), credit: 0, debit: parseFloat(t.amount) || 0, id: t.id, type: 'accountTransfers' }));
  (state.accountTransfers || []).filter(t => t.toAccountId === accId).forEach(t => txs.push({ date: t.date, desc: 'Transfer from ' + (state.accounts.find(a => a.id === t.fromAccountId)?.name || '?'), credit: parseFloat(t.amount) || 0, debit: 0, id: t.id, type: 'accountTransfers' }));
  txs.sort((a, b) => new Date(a.date) - new Date(b.date));

  let bal = 0;
  let html = `<div style="position:fixed;inset:0;z-index:99999;background:rgba(0,0,0,.4);display:flex;align-items:center;justify-content:center;" onclick="if(event.target===this)this.remove()">
    <div style="background:#fff;border-radius:16px;width:90%;max-width:800px;max-height:85vh;overflow:hidden;box-shadow:0 25px 60px rgba(0,0,0,.2);display:flex;flex-direction:column;">
      <div style="padding:16px 20px;border-bottom:1px solid #e5e7eb;display:flex;justify-content:space-between;align-items:center;">
        <div><h3 style="font-size:16px;font-weight:800;color:#0f172a;">${acc.name} — Ledger</h3><p style="font-size:11px;color:#94a3b8;">All transactions for this account</p></div>
        <button onclick="this.closest('[style]').remove()" style="width:28px;height:28px;border-radius:8px;background:#f1f5f9;border:none;font-size:16px;cursor:pointer;color:#64748b;">×</button>
      </div>
      <div style="overflow-y:auto;flex:1;">
        <table style="width:100%;border-collapse:collapse;font-size:12px;">
          <thead><tr style="background:#f8fafc;position:sticky;top:0;">
            <th style="text-align:left;padding:10px 14px;font-size:10px;font-weight:600;color:#64748b;text-transform:uppercase;border-bottom:1px solid #e5e7eb;">Date</th>
            <th style="text-align:left;padding:10px 14px;font-size:10px;font-weight:600;color:#64748b;text-transform:uppercase;border-bottom:1px solid #e5e7eb;">Description</th>
            <th style="text-align:right;padding:10px 14px;font-size:10px;font-weight:600;color:#059669;text-transform:uppercase;border-bottom:1px solid #e5e7eb;">Credit</th>
            <th style="text-align:right;padding:10px 14px;font-size:10px;font-weight:600;color:#dc2626;text-transform:uppercase;border-bottom:1px solid #e5e7eb;">Debit</th>
            <th style="text-align:right;padding:10px 14px;font-size:10px;font-weight:600;color:#64748b;text-transform:uppercase;border-bottom:1px solid #e5e7eb;">Balance</th>
            <th style="text-align:center;padding:10px;border-bottom:1px solid #e5e7eb;"></th>
          </tr></thead><tbody>`;
  txs.forEach(t => {
    bal += t.credit - t.debit;
    html += `<tr style="border-bottom:1px solid #f3f4f6;">
      <td style="padding:8px 14px;color:#64748b;white-space:nowrap;">${t.date || '—'}</td>
      <td style="padding:8px 14px;font-weight:500;color:#1e293b;">${t.desc}</td>
      <td style="padding:8px 14px;text-align:right;color:#059669;font-weight:600;">${t.credit ? getCurrencySymbol() + t.credit.toLocaleString('en-IN', {minimumFractionDigits:2}) : ''}</td>
      <td style="padding:8px 14px;text-align:right;color:#dc2626;font-weight:600;">${t.debit ? getCurrencySymbol() + t.debit.toLocaleString('en-IN', {minimumFractionDigits:2}) : ''}</td>
      <td style="padding:8px 14px;text-align:right;font-weight:700;color:${bal >= 0 ? '#059669' : '#dc2626'};">${getCurrencySymbol()}${Math.abs(bal).toLocaleString('en-IN', {minimumFractionDigits:2})}</td>
      <td style="padding:8px 10px;text-align:center;"><button onclick="_deleteAccountTx('${t.type}','${t.id}');this.closest('[style*=fixed]').remove()" style="font-size:10px;color:#dc2626;background:#fef2f2;border:1px solid #fecaca;border-radius:4px;padding:2px 6px;cursor:pointer;">Del</button></td>
    </tr>`;
  });
  if (!txs.length) html += '<tr><td colspan="6" style="padding:30px;text-align:center;color:#94a3b8;">No transactions</td></tr>';
  html += `</tbody></table></div>
    <div style="padding:12px 20px;background:#0f172a;color:#fff;display:flex;justify-content:space-between;align-items:center;font-size:13px;font-weight:700;border-radius:0 0 16px 16px;">
      <span>Closing Balance</span>
      <span style="font-size:18px;color:${bal >= 0 ? '#10b981' : '#f87171'};">${getCurrencySymbol()}${Math.abs(bal).toLocaleString('en-IN', {minimumFractionDigits:2})}${bal < 0 ? ' (Dr)' : ''}</span>
    </div></div></div>`;
  document.body.insertAdjacentHTML('beforeend', html);
};

window._editAccount = function(accId) {
  const acc = state.accounts.find(a => a.id === accId);
  if (!acc) return;
  const name = prompt('Account Name:', acc.name);
  if (!name) return;
  acc.name = name;
  const type = prompt('Type (Cash or Bank):', acc.type);
  if (type && (type === 'Cash' || type === 'Bank')) acc.type = type;
  saveAllData(); populateDropdowns(); renderAccounts();
  showToast('Account updated', 'success');
};

window._deleteAccount = function(accId) {
  const acc = state.accounts.find(a => a.id === accId);
  if (!acc) return;
  if (!confirm(`Delete account "${acc.name}"? Transactions linked to it will remain but the account will be removed.`)) return;
  state.accounts = state.accounts.filter(a => a.id !== accId);
  saveAllData(); populateDropdowns(); renderAccounts();
  showToast('Account deleted', 'error');
};

window._transferFromAccount = function(fromId) {
  const fromAcc = state.accounts.find(a => a.id === fromId);
  if (!fromAcc) return;
  const others = state.accounts.filter(a => a.id !== fromId);
  if (!others.length) { showToast('Need at least 2 accounts for transfer', 'error'); return; }
  const toName = prompt('Transfer to account:\n' + others.map((a, i) => `${i + 1}. ${a.name} (${a.type})`).join('\n') + '\n\nEnter number:');
  const toIdx = parseInt(toName) - 1;
  if (isNaN(toIdx) || !others[toIdx]) { showToast('Invalid selection', 'error'); return; }
  const amount = prompt('Transfer amount:');
  if (!amount || isNaN(amount) || parseFloat(amount) <= 0) return;
  if (!state.accountTransfers) state.accountTransfers = [];
  state.accountTransfers.push({
    id: 'txf_' + Date.now(),
    fromAccountId: fromId,
    toAccountId: others[toIdx].id,
    amount: parseFloat(amount),
    date: new Date().toISOString().split('T')[0],
    ref: `Transfer: ${fromAcc.name} → ${others[toIdx].name}`
  });
  saveAllData(); renderAccounts();
  showToast(`Transferred ${getCurrencySymbol()}${parseFloat(amount).toLocaleString('en-IN')} to ${others[toIdx].name}`, 'success');
};

window._deleteAccountTx = function(type, id) {
  if (!confirm('Delete this transaction?')) return;
  if (Array.isArray(state[type])) {
    state[type] = state[type].filter(t => t.id !== id);
    saveAllData(); renderAccounts();
    showToast('Transaction deleted', 'error');
  }
};

export function openAccountModal() {
  document.getElementById('accountModal').classList.remove('hidden');
  document.getElementById('modalAccName').value = '';
}

export function saveAccount() {
  const name = document.getElementById('modalAccName').value;
  const type = document.getElementById('modalAccType').value;
  if (!name) return showToast('Account Name Required', 'error');
  state.accounts.push({ id: 'acc_' + Date.now(), name, type });
  saveAllData();
  populateDropdowns();
  document.getElementById('accountModal').classList.add('hidden');
  renderAccounts();
  showToast('Account Created Successfully');
}

export function renderReports() {
  const profBody = document.getElementById('reportProfitBody');
  profBody.innerHTML = '';
  state.clients.forEach(c => {
    const billed = state.abstracts.filter(a => a.clientId === c.id).reduce((s, a) => s + a.totalAmount, 0) + state.invoices.filter(i => i.clientId === c.id && i.status !== 'Cancelled').reduce((s, i) => s + i.taxAmount, 0);
    let matCost = 0;
    state.inventoryTx.filter(tx => tx.siteId === c.id && tx.type === 'CONSUME').forEach(tx => {
      if (tx.rate > 0) { matCost += (tx.qty * tx.rate); }
      else {
        const pTx = state.inventoryTx.filter(t => t.rawMaterialId === tx.rawMaterialId && t.type === 'IN' && t.rate > 0).sort((a, b) => new Date(b.date) - new Date(a.date))[0];
        matCost += (tx.qty * (pTx ? pTx.rate : 0));
      }
    });
    if (billed > 0 || matCost > 0) profBody.innerHTML += `<tr><td class="px-3 py-2 font-bold">${c.name}</td><td class="px-3 py-2 text-right font-bold text-blue-700">${getCurrencySymbol()}${billed.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td><td class="px-3 py-2 text-right font-bold text-red-600">${getCurrencySymbol()}${matCost.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td><td class="px-3 py-2 text-right font-extrabold text-green-700">${getCurrencySymbol()}${(billed - matCost).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td></tr>`;
  });
  const cSiteId = document.getElementById('repConsSite').value;
  const consBody = document.getElementById('reportConsBody');
  consBody.innerHTML = '';
  let consMap = {};
  state.inventoryTx.filter(tx => tx.type === 'CONSUME' && (!cSiteId || tx.siteId === cSiteId)).forEach(tx => {
    if (!consMap[tx.rawMaterialId]) consMap[tx.rawMaterialId] = { qty: 0, val: 0 };
    consMap[tx.rawMaterialId].qty += tx.qty;
    const r = tx.rate > 0 ? tx.rate : (state.inventoryTx.filter(t => t.rawMaterialId === tx.rawMaterialId && t.type === 'IN' && t.rate > 0).sort((a, b) => new Date(b.date) - new Date(a.date))[0]?.rate || 0);
    consMap[tx.rawMaterialId].val += (tx.qty * r);
  });
  for (const k in consMap) {
    const rm = state.rawMaterials.find(x => x.id === k);
    if (rm) consBody.innerHTML += `<tr><td class="px-3 py-2 font-bold">${rm.name}</td><td class="px-3 py-2 text-center">${rm.unit}</td><td class="px-3 py-2 text-right font-bold text-slate-700">${consMap[k].qty.toFixed(2)}</td><td class="px-3 py-2 text-right font-bold text-orange-700">${getCurrencySymbol()}${consMap[k].val.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td></tr>`;
  }
  const purBody = document.getElementById('reportPurBody');
  purBody.innerHTML = '';
  const allBills = state.vendorMaterials.filter(m => m.items).sort((a, b) => new Date(b.date) - new Date(a.date));
  const allLocs = getAllLocations();
  allBills.forEach(b => {
    const v = state.vendors.find(x => x.id === b.vendorId);
    const c = allLocs.find(x => x.id === b.siteId);
    purBody.innerHTML += `<tr><td class="px-3 py-2">${b.date}</td><td class="px-3 py-2 font-bold text-blue-700">${b.billNo}</td><td class="px-3 py-2 font-bold">${v ? v.name : '-'}</td><td class="px-3 py-2">${c ? c.name : '-'}</td><td class="px-3 py-2 text-right font-extrabold text-slate-800">${getCurrencySymbol()}${b.totalAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td></tr>`;
  });
}

export function renderMasterClientList() {
  const tbody = document.getElementById('masterClientListBody');
  tbody.innerHTML = '';
  let totalBilled = 0, totalReceived = 0, totalBal = 0;
  state.clients.forEach(c => {
    const billed = state.abstracts.filter(a => a.clientId === c.id).reduce((s, a) => s + a.totalAmount, 0) + state.invoices.filter(i => i.clientId === c.id && i.status !== 'Cancelled').reduce((s, i) => s + i.taxAmount, 0);
    const paid = state.paymentsIn.filter(p => p.clientId === c.id).reduce((s, p) => s + parseFloat(p.amount), 0);
    totalBilled += billed; totalReceived += paid; totalBal += (billed - paid);
    tbody.innerHTML += `<tr><td class="px-3 py-2 font-bold">${c.name}</td><td class="px-3 py-2 text-right">${getCurrencySymbol()}${billed.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td><td class="px-3 py-2 text-right text-green-600">${getCurrencySymbol()}${paid.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td><td class="px-3 py-2 text-right font-bold text-blue-700">${getCurrencySymbol()}${(billed - paid).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td></tr>`;
  });
  tbody.innerHTML += `<tr class="bg-slate-100 border-t-2 border-slate-300"><td class="px-3 py-3 font-extrabold text-right">GRAND TOTAL:</td><td class="px-3 py-3 text-right font-extrabold">${getCurrencySymbol()}${totalBilled.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td><td class="px-3 py-3 text-right font-extrabold text-green-700">${getCurrencySymbol()}${totalReceived.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td><td class="px-3 py-3 text-right font-extrabold text-blue-800">${getCurrencySymbol()}${totalBal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td></tr>`;
}

export function renderMasterVendorList() {
  const tbody = document.getElementById('masterVendorListBody');
  tbody.innerHTML = '';
  let totalSup = 0, totalPaid = 0, totalBal = 0;
  state.vendors.forEach(v => {
    let sup = 0;
    state.vendorMaterials.filter(m => m.vendorId === v.id).forEach(m => { sup += (m.totalAmount || parseFloat(m.amount) || 0); });
    const paid = state.vendorPayments.filter(p => p.vendorId === v.id).reduce((s, p) => s + parseFloat(p.amount), 0);
    totalSup += sup; totalPaid += paid; totalBal += (sup - paid);
    tbody.innerHTML += `<tr><td class="px-3 py-2 font-bold">${v.name}</td><td class="px-3 py-2 text-right text-red-600">${getCurrencySymbol()}${sup.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td><td class="px-3 py-2 text-right text-green-600">${getCurrencySymbol()}${paid.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td><td class="px-3 py-2 text-right font-bold text-orange-700">${getCurrencySymbol()}${(sup - paid).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td></tr>`;
  });
  tbody.innerHTML += `<tr class="bg-slate-100 border-t-2 border-slate-300"><td class="px-3 py-3 font-extrabold text-right">GRAND TOTAL:</td><td class="px-3 py-3 text-right font-extrabold text-red-700">${getCurrencySymbol()}${totalSup.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td><td class="px-3 py-3 text-right font-extrabold text-green-700">${getCurrencySymbol()}${totalPaid.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td><td class="px-3 py-3 text-right font-extrabold text-orange-800">${getCurrencySymbol()}${totalBal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td></tr>`;
}

export function exportMasterList(type) {
  const doc = new window.jspdf.jsPDF();
  let y = getCompanyHeaderForPDF(doc);
  doc.setFontSize(14); doc.setTextColor(0);
  let rows = [];
  if (type === 'client') {
    doc.text("CLIENT FINANCIAL SUMMARY", 105, y + 5, null, null, "center");
    state.clients.forEach(c => {
      const billed = state.abstracts.filter(a => a.clientId === c.id).reduce((s, a) => s + a.totalAmount, 0) + state.invoices.filter(i => i.clientId === c.id && i.status !== 'Cancelled').reduce((s, i) => s + i.taxAmount, 0);
      const paid = state.paymentsIn.filter(p => p.clientId === c.id).reduce((s, p) => s + parseFloat(p.amount), 0);
      rows.push([c.name, getCurrencySymbol() + billed.toLocaleString('en-IN', {minimumFractionDigits: 2}), getCurrencySymbol() + paid.toLocaleString('en-IN', {minimumFractionDigits: 2}), getCurrencySymbol() + (billed - paid).toLocaleString('en-IN', {minimumFractionDigits: 2})]);
    });
    doc.autoTable({ startY: y + 15, head: [['Client Name', 'Total Billed ('+getCurrencySymbol()+')', 'Total Received ('+getCurrencySymbol()+')', 'Balance Receivable ('+getCurrencySymbol()+')']], body: rows, theme: 'grid', headStyles: { fillColor: [30, 58, 138], fontSize: 9 }, styles: { fontSize: 9, cellPadding: 2.5, overflow: 'linebreak' }, columnStyles: { 0: { cellWidth: 55 }, 1: { halign: 'right', cellWidth: 40 }, 2: { halign: 'right', cellWidth: 40 }, 3: { halign: 'right', cellWidth: 45 } } });
  } else {
    doc.text("VENDOR FINANCIAL SUMMARY", 105, y + 5, null, null, "center");
    state.vendors.forEach(v => {
      let sup = 0;
      state.vendorMaterials.filter(m => m.vendorId === v.id).forEach(m => { sup += (m.totalAmount || parseFloat(m.amount) || 0); });
      const paid = state.vendorPayments.filter(p => p.vendorId === v.id).reduce((s, p) => s + parseFloat(p.amount), 0);
      rows.push([v.name, getCurrencySymbol() + sup.toLocaleString('en-IN', {minimumFractionDigits: 2}), getCurrencySymbol() + paid.toLocaleString('en-IN', {minimumFractionDigits: 2}), getCurrencySymbol() + (sup - paid).toLocaleString('en-IN', {minimumFractionDigits: 2})]);
    });
    doc.autoTable({ startY: y + 15, head: [['Vendor Name', 'Total Supplied ('+getCurrencySymbol()+')', 'Total Paid ('+getCurrencySymbol()+')', 'Balance Payable ('+getCurrencySymbol()+')']], body: rows, theme: 'grid', headStyles: { fillColor: [249, 115, 22], fontSize: 9 }, styles: { fontSize: 9, cellPadding: 2.5, overflow: 'linebreak' }, columnStyles: { 0: { cellWidth: 55 }, 1: { halign: 'right', cellWidth: 40 }, 2: { halign: 'right', cellWidth: 40 }, 3: { halign: 'right', cellWidth: 45 } } });
  }
  mobileSavePDF(doc, `${type}_MasterList.pdf`);
}

export function exportVendorLedgerPDF() {
  const vId = document.getElementById('purVendor').value;
  if (!vId) return showToast("Select vendor first", "error");
  const v = state.vendors.find(x => x.id === vId);
  const doc = new window.jspdf.jsPDF();
  let y = getCompanyHeaderForPDF(doc);
  doc.setFontSize(14); doc.setTextColor(0);
  doc.text("VENDOR ACCOUNT STATEMENT", 105, y + 5, null, null, "center");
  doc.setFontSize(10); doc.setFont("helvetica", "normal");
  doc.text(`Vendor: ${v.name} | As of: ${new Date().toISOString().split('T')[0]}`, 14, y + 15);
  let ledger = [];
  state.vendorMaterials.filter(m => m.vendorId === vId).forEach(m => {
    if (m.items) ledger.push({ date: m.date, desc: `Purchase Bill: ${m.billNo}`, debit: m.totalAmount, credit: 0 });
    else ledger.push({ date: m.date, desc: `Material: ${m.name}`, debit: m.amount, credit: 0 });
  });
  state.vendorPayments.filter(p => p.vendorId === vId).forEach(p => ledger.push({ date: p.date, desc: `Payment Out: ${p.ref || 'No ref'}`, debit: 0, credit: parseFloat(p.amount) }));
  ledger.sort((a, b) => new Date(a.date) - new Date(b.date));
  let rows = []; let bal = 0;
  ledger.forEach(l => {
    bal += (l.debit - l.credit);
    rows.push([l.date, l.desc, l.debit ? getCurrencySymbol() + l.debit.toLocaleString('en-IN', {minimumFractionDigits: 2}) : '', l.credit ? getCurrencySymbol() + l.credit.toLocaleString('en-IN', {minimumFractionDigits: 2}) : '', getCurrencySymbol() + bal.toLocaleString('en-IN', {minimumFractionDigits: 2})]);
  });
  doc.autoTable({ startY: y + 21, head: [['Date', 'Particulars', 'Debit ('+getCurrencySymbol()+')', 'Credit ('+getCurrencySymbol()+')', 'Balance ('+getCurrencySymbol()+')']], body: rows, theme: 'grid', headStyles: { fillColor: [249, 115, 22], fontSize: 9 }, styles: { fontSize: 9, cellPadding: 2.5, overflow: 'linebreak' }, columnStyles: { 0: { cellWidth: 22 }, 1: { cellWidth: 60, overflow: 'linebreak' }, 2: { halign: 'right', cellWidth: 30 }, 3: { halign: 'right', cellWidth: 30 }, 4: { halign: 'right', cellWidth: 30 } } });
  mobileSavePDF(doc, `VendorLedger_${v.name}.pdf`);
}

export function exportClientStatementPDF() {
  const cId = document.getElementById('hubClientSelect').value;
  if (!cId) return;
  const c = state.clients.find(x => x.id === cId);
  const stmt = buildClientLedger(cId);
  const doc = new window.jspdf.jsPDF();
  let y = getCompanyHeaderForPDF(doc);
  doc.setFontSize(14); doc.setTextColor(0);
  doc.text("CLIENT ACCOUNT STATEMENT (LEDGER)", 105, y + 5, null, null, "center");
  doc.setFontSize(10); doc.setFont("helvetica", "normal");
  doc.text(`Client: ${c.name} | Project: ${c.projectName} | As of: ${new Date().toISOString().split('T')[0]}`, 14, y + 15);
  let rows = []; let bal = 0;
  stmt.forEach(s => {
    bal += (s.debit - s.credit);
    let cleanDesc = s.desc.replace(/<[^>]*>?/gm, '');
    rows.push([s.date, cleanDesc, s.debit ? getCurrencySymbol() + s.debit.toLocaleString('en-IN', {minimumFractionDigits: 2}) : '', s.credit ? getCurrencySymbol() + s.credit.toLocaleString('en-IN', {minimumFractionDigits: 2}) : '', getCurrencySymbol() + bal.toLocaleString('en-IN', {minimumFractionDigits: 2})]);
  });
  doc.autoTable({ startY: y + 21, head: [['Date', 'Particulars', 'Debit ('+getCurrencySymbol()+')', 'Credit ('+getCurrencySymbol()+')', 'Balance ('+getCurrencySymbol()+')']], body: rows, theme: 'grid', headStyles: { fillColor: [30, 58, 138], fontSize: 9 }, styles: { fontSize: 9, cellPadding: 2.5, overflow: 'linebreak' }, columnStyles: { 0: { cellWidth: 22 }, 1: { cellWidth: 60, overflow: 'linebreak' }, 2: { halign: 'right', cellWidth: 30 }, 3: { halign: 'right', cellWidth: 30 }, 4: { halign: 'right', cellWidth: 30 } } });
  mobileSavePDF(doc, `Ledger_${c.name}.pdf`);
}

function updateDashboard() {
  if (!document.getElementById('dashboard').classList.contains('hide')) window.renderGlobalDashboard();
}
