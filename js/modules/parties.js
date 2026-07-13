/**
 * ═══════════════════════════════════════════════════════════
 * True Site Sync — Parties Ledger
 * ═══════════════════════════════════════════════════════════
 * Unified ledger for clients/vendors/labour: list, per-party
 * transactions, edit/delete, and receipt PDF. Extracted from ui.js.
 * Navigation (switchView) reached via window.
 * ═══════════════════════════════════════════════════════════
 */

import { state, saveAllData } from './state.js';
import { showToast, getCurrencySymbol, pdfMoney, getCompanyHeaderForPDF, mobileSavePDF, populateDropdowns } from './utils.js';

export function renderPartiesList() {
  const searchTerm = document.getElementById('partySearch').value.toLowerCase();
  const typeFilter = document.getElementById('partyTypeFilter')?.value || 'All';
  const container = document.getElementById('partiesListContainer');
  container.innerHTML = '';
  let allParties = [];
  state.clients.forEach(c => {
    let billed = state.abstracts.filter(a => a.clientId === c.id && a.status !== 'invoiced').reduce((s, a) => s + (parseFloat(a.totalAmount) || 0), 0)
      + state.invoices.filter(i => i.clientId === c.id && i.status !== 'Cancelled').reduce((s, i) => s + (parseFloat(i.taxAmount) || 0), 0)
      + (state.saleInvoices || []).filter(i => i.clientId === c.id && i.status !== 'Cancelled').reduce((s, i) => s + (parseFloat(i.total) || 0), 0);
    let paid = state.paymentsIn.filter(p => p.clientId === c.id).reduce((s, p) => s + (parseFloat(p.amount) || 0), 0);
    allParties.push({ id: c.id, name: c.name, type: 'Client', balance: billed - paid });
  });
  state.vendors.forEach(v => {
    let purchased = state.vendorMaterials.filter(m => m.vendorId === v.id).reduce((s, m) => s + (m.totalAmount || parseFloat(m.amount) || 0), 0);
    let paid = state.vendorPayments.filter(p => p.vendorId === v.id).reduce((s, p) => s + parseFloat(p.amount), 0);
    allParties.push({ id: v.id, name: v.name, type: 'Vendor', balance: purchased - paid });
  });
  state.labourMaster.forEach(l => {
    let totalSalary = state.labourSalaries.filter(s => s.labourId === l.id).reduce((sum, s) => sum + parseFloat(s.amount), 0);
    let totalPaid = state.labourPayments.filter(p => p.labourId === l.id).reduce((sum, p) => sum + parseFloat(p.amount), 0);
    allParties.push({ id: l.id, name: l.name + ' (Labour)', type: 'Labour', balance: totalSalary - totalPaid });
  });
  // Contractors / gang leaders (piece-rate). Owe = value of approved work; Paid = gang
  // payouts + advances already given. Balance = what's still owed to the gang.
  (state.labourContractors || []).forEach(g => {
    const earned = (state.workMeasurements || []).filter(m => m.gangId === g.id && m.approved).reduce((s, m) => {
      const rate = (state.workItemRates || []).find(r => r.id === m.rateId);
      return s + (rate?.rate || 0) * (m.quantity || 0);
    }, 0);
    const paid = (state.expenses || []).filter(e => e.gangId === g.id && e.category === 'Piece-Rate Gang Payout').reduce((s, e) => s + (parseFloat(e.amount) || 0), 0)
      + (state.labourAdvances || []).filter(a => a.labourId === g.id).reduce((s, a) => s + (parseFloat(a.amount) || 0), 0);
    if (earned === 0 && paid === 0) return; // skip gangs with no financial activity
    allParties.push({ id: g.id, name: g.name + ' (Gang)', type: 'Contractor', balance: earned - paid });
  });
  allParties.sort((a, b) => a.name.localeCompare(b.name));
  allParties.forEach(p => {
    if (searchTerm && !p.name.toLowerCase().includes(searchTerm)) return;
    if (typeFilter !== 'All' && p.type !== typeFilter) return;
    let colorClass = 'text-slate-500'; let formattedBal = '0.00';
    if (p.type === 'Client') {
      if (p.balance > 0) { colorClass = 'text-green-600'; formattedBal = p.balance.toLocaleString('en-IN', { minimumFractionDigits: 2 }); }
      else if (p.balance < 0) { colorClass = 'text-red-500'; formattedBal = Math.abs(p.balance).toLocaleString('en-IN', { minimumFractionDigits: 2 }); }
    } else if (p.type === 'Vendor' || p.type === 'Labour' || p.type === 'Contractor') {
      if (p.balance > 0) { colorClass = 'text-red-500'; formattedBal = p.balance.toLocaleString('en-IN', { minimumFractionDigits: 2 }); }
      else if (p.balance < 0) { colorClass = 'text-green-600'; formattedBal = Math.abs(p.balance).toLocaleString('en-IN', { minimumFractionDigits: 2 }); }
    }
    const isSelected = state.currentSelectedParty?.id === p.id ? 'bg-blue-100 border-l-4 border-blue-600' : 'hover:bg-slate-50 border-l-4 border-transparent';
    const typeIcon = p.type === 'Client' ? '🏢' : p.type === 'Vendor' ? '🏭' : p.type === 'Contractor' ? '🧑‍🔧' : '👷';
    container.innerHTML += `<div class="cursor-pointer p-3 flex justify-between items-center transition ${isSelected}" onclick="selectParty('${p.id}', '${p.type}')"><div class="flex items-center gap-2"><span style="font-size:14px;">${typeIcon}</span><div><p class="font-bold text-slate-800 text-xs truncate w-32" title="${p.name}">${p.name}</p><p class="text-[9px] text-slate-400 font-medium">${p.type}</p></div></div><span class="font-bold ${colorClass} text-sm">${formattedBal}</span></div>`;
  });
}

export function renderPartyTransactions() {
  if (!state.currentSelectedParty) return;
  const { id, type } = state.currentSelectedParty;
  let txs = [];
  if (type === 'Client') {
    const c = state.clients.find(x => x.id === id);
    document.getElementById('selectedPartyName').textContent = c.name;
    document.getElementById('selectedPartyType').textContent = 'CLIENT';
    document.getElementById('partyActionButtons').innerHTML = `<button onclick="window.switchView('billingView')" class="bg-red-50 text-red-600 px-4 py-2 rounded-full font-bold text-xs border border-red-200 hover:bg-red-100 shadow-sm">+ Add Sale</button><button onclick="window.switchView('accountingView')" class="bg-green-50 text-green-600 px-4 py-2 rounded-full font-bold text-xs border border-green-200 hover:bg-green-100 shadow-sm">+ Add Receipt</button>`;
    state.abstracts.filter(a => a.clientId === id && a.status !== 'invoiced').forEach(a => txs.push({ date: a.date, number: a.abstractNum, type: 'Sale (Abstract)', total: a.totalAmount, isDebit: true, _src: 'abstracts', _id: a.id }));
    state.invoices.filter(i => i.clientId === id && i.status !== 'Cancelled').forEach(i => txs.push({ date: i.date, number: i.invoiceNum, type: 'Sale (GST Applied)', total: i.taxAmount, isDebit: true, _src: 'invoices', _id: i.id }));
    // Sales module invoices (saleInvoices) — the main Sales module. These now
    // flow straight into the client ledger as debits (what the client owes).
    (state.saleInvoices || []).filter(i => i.clientId === id && i.status !== 'Cancelled').forEach(i => txs.push({ date: i.date, number: i.invoiceNo || 'Invoice', type: 'Sale Invoice', total: parseFloat(i.total) || 0, isDebit: true, _src: 'saleInvoices', _id: i.id }));
    state.paymentsIn.filter(p => p.clientId === id).forEach(p => txs.push({ date: p.date, number: p.ref || 'Receipt', type: 'Receipt', total: parseFloat(p.amount), isDebit: false, _src: 'paymentsIn', _id: p.id, _editable: true }));
  } else if (type === 'Vendor') {
    const v = state.vendors.find(x => x.id === id);
    document.getElementById('selectedPartyName').textContent = v.name;
    document.getElementById('selectedPartyType').textContent = 'VENDOR';
    document.getElementById('partyActionButtons').innerHTML = `<button onclick="window.switchView('vendorView')" class="bg-blue-50 text-blue-600 px-4 py-2 rounded-full font-bold text-xs border border-blue-200 hover:bg-blue-100 shadow-sm">+ Add Purchase</button><button onclick="window.switchView('vendorView')" class="bg-red-50 text-red-600 px-4 py-2 rounded-full font-bold text-xs border border-red-200 hover:bg-red-100 shadow-sm">+ Add Payment</button>`;
    state.vendorMaterials.filter(m => m.vendorId === id).forEach(m => txs.push({ date: m.date, number: m.billNo || 'Purchase', type: 'Purchase', total: m.totalAmount || parseFloat(m.amount) || 0, isDebit: false, _src: 'vendorMaterials', _id: m.id }));
    state.vendorPayments.filter(p => p.vendorId === id).forEach(p => txs.push({ date: p.date, number: p.ref || 'Payment', type: 'Payment', total: parseFloat(p.amount), isDebit: true, _src: 'vendorPayments', _id: p.id, _editable: true }));
  } else if (type === 'Labour') {
    const l = state.labourMaster.find(x => x.id === id);
    document.getElementById('selectedPartyName').textContent = l.name;
    document.getElementById('selectedPartyType').textContent = 'LABOUR';
    document.getElementById('partyActionButtons').innerHTML = `<button onclick="openLabourPaymentModal('${l.id}')" class="bg-blue-600 text-white px-4 py-2 rounded-full font-bold text-xs hover:bg-blue-700 shadow-sm">+ Record Payment</button>`;
    state.labourSalaries.filter(s => s.labourId === id).forEach(s => txs.push({ date: s.date, number: 'Month: ' + s.month, type: 'Salary Generated', total: parseFloat(s.amount), isDebit: false, _src: 'labourSalaries', _id: s.id }));
    state.labourPayments.filter(p => p.labourId === id).forEach(p => txs.push({ date: p.date, number: p.ref || 'Cash/Bank', type: 'Payment Made', total: parseFloat(p.amount), isDebit: true, _src: 'labourPayments', _id: p.id, _editable: true }));
  } else if (type === 'Contractor') {
    const g = (state.labourContractors || []).find(x => x.id === id);
    if (!g) return;
    document.getElementById('selectedPartyName').textContent = g.name;
    document.getElementById('selectedPartyType').textContent = 'GANG / CONTRACTOR';
    document.getElementById('partyActionButtons').innerHTML = '';
    // Approved piece-rate work = what we owe the gang (credit)
    (state.workMeasurements || []).filter(m => m.gangId === id && m.approved).forEach(m => {
      const rate = (state.workItemRates || []).find(r => r.id === m.rateId);
      txs.push({ date: m.date, number: (rate?.workCategory || 'Work') + (m.paid ? ' ✓ paid' : ''), type: 'Piece-Rate Work', total: (rate?.rate || 0) * (m.quantity || 0), isDebit: false, _src: 'workMeasurements', _id: m.id });
    });
    // Payouts (debit)
    (state.expenses || []).filter(e => e.gangId === id && e.category === 'Piece-Rate Gang Payout').forEach(e => txs.push({ date: e.date, number: 'Gang Payout', type: 'Payment Made', total: parseFloat(e.amount) || 0, isDebit: true, _src: 'expenses', _id: e.id }));
    // Advances already given (debit)
    (state.labourAdvances || []).filter(a => a.labourId === id).forEach(a => txs.push({ date: a.date, number: 'Advance', type: 'Payment Made', total: parseFloat(a.amount) || 0, isDebit: true, _src: 'labourAdvances', _id: a.id }));
  }
  txs.sort((a, b) => new Date(a.date) - new Date(b.date));
  const tbody = document.getElementById('partyTransactionsBody');
  tbody.innerHTML = '';
  let runningBal = 0;
  txs.forEach((t, idx) => {
    // Guard against dirty/missing amounts so a single bad row can't throw and
    // abort the whole render (which made deletes/edits appear to do nothing).
    const tot = Number(t.total) || 0;
    if (type === 'Client') runningBal += t.isDebit ? tot : -tot;
    else if (type === 'Vendor' || type === 'Labour' || type === 'Contractor') runningBal += t.isDebit ? -tot : tot;
    const isPayment = (t.type || '').includes('Payment') || (t.type || '').includes('Receipt');
    let statusBadge = isPayment ? `<span class="text-green-600 font-bold text-xs">Done</span>` : `<span class="text-blue-600 font-bold text-xs">Billed</span>`;
    // Per-row actions
    const recBtn = `<button onclick="_partyReceipt('${t._src}','${t._id}')" title="Preview / Download receipt" class="text-slate-500 hover:bg-slate-100 px-1.5 py-1 rounded">🧾</button>`;
    // Edit button — each transaction opens in its native form/editor:
    //   sale invoice -> Sale Invoice form · purchase -> Purchase form ·
    //   abstract -> Abstract editor · GST invoice -> Invoice view ·
    //   receipts / vendor / labour payments -> their forms (via _editPartyTx) ·
    //   salaries -> quick amount/date edit (they're generated from attendance).
    const ob = (fn, label) => `<button onclick="window.${fn} && window.${fn}('${t._id}')" title="Open ${label}" class="text-blue-600 hover:bg-blue-50 px-2 py-1 rounded text-[11px] font-bold border border-blue-200">${label}</button>`;
    let editBtn = '';
    if (t._src === 'saleInvoices')        editBtn = ob('openSaleInvoiceForm', 'Open');
    else if (t._src === 'vendorMaterials') editBtn = ob('openPurchaseFormPanel', 'Open');
    else if (t._src === 'abstracts')       editBtn = ob('openAbstractEditor', 'Edit');
    else if (t._src === 'invoices')        editBtn = ob('openInvoiceInfo', 'View');
    else if (t._src === 'labourSalaries' || t._editable) {
      editBtn = `<button onclick="_editPartyTx('${t._src}','${t._id}')" title="Edit" class="text-blue-600 hover:bg-blue-50 px-2 py-1 rounded text-[11px] font-bold border border-blue-200">Edit</button>`;
    }
    const delBtn = (t._src && t._id) ? `<button onclick="_deletePartyTx('${t._src}','${t._id}')" title="Delete" class="text-red-400 hover:bg-red-50 px-1.5 py-1 rounded">🗑️</button>` : '';
    tbody.innerHTML += `<tr class="hover:bg-slate-50 transition border-b border-slate-100"><td class="px-4 py-3 text-slate-600 font-medium">${t.type} ${statusBadge}</td><td class="px-4 py-3 font-bold text-slate-800">${t.number}</td><td class="px-4 py-3 text-slate-500 whitespace-nowrap">${t.date}</td><td class="px-4 py-3 text-right font-bold text-slate-800">${getCurrencySymbol()}${tot.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td><td class="px-4 py-3 text-right font-extrabold ${runningBal > 0 ? (type === 'Client' ? 'text-green-600' : 'text-red-500') : 'text-slate-600'}">${getCurrencySymbol()}${Math.abs(runningBal).toLocaleString('en-IN', { minimumFractionDigits: 2 })} ${runningBal < 0 ? '(Adv)' : ''}</td><td class="px-4 py-3 text-center whitespace-nowrap">${recBtn}${editBtn}${delBtn}</td></tr>`;
  });
  if (txs.length === 0) tbody.innerHTML = `<tr><td colspan="6" class="p-8 text-center text-slate-400">No transactions found.</td></tr>`;
  const ft = document.getElementById('partyClosingBalance');
  ft.textContent = `${getCurrencySymbol()}${Math.abs(runningBal).toLocaleString('en-IN', { minimumFractionDigits: 2 })} ${runningBal < 0 ? '(Advance)' : ''}`;
  ft.className = `text-xl font-extrabold ${runningBal > 0 ? (type === 'Client' ? 'text-green-400' : 'text-red-400') : 'text-white'}`;
}

/** Edit an editable transaction. Routes each src to its native form prefilled,
 *  matching the new-entry experience. Falls back to a prompt-based edit only
 *  if the corresponding form isn't loaded yet. */
window._editPartyTx = function(src, id) {
  const rec = (state[src] || []).find(x => x.id === id);
  if (!rec) return;
  // Route to native forms by source.
  if (src === 'paymentsIn' && typeof window.openPaymentInForm === 'function') {
    try { window.openPaymentInForm(id); return; } catch (e) { console.warn('[ledger edit pin]', e); }
  }
  if (src === 'vendorPayments' && typeof window.openPaymentOutForm === 'function') {
    try { window.openPaymentOutForm(id); return; } catch (e) { console.warn('[ledger edit po]', e); }
  }
  if (src === 'labourPayments' && typeof window.openLabourPaymentModal === 'function') {
    try { window.openLabourPaymentModal(null, id); return; } catch (e) { console.warn('[ledger edit lp]', e); }
  }
  if (src === 'saleInvoices' && typeof window.openSaleInvoiceForm === 'function') {
    try { window.openSaleInvoiceForm(id); return; } catch (e) { console.warn('[ledger edit si]', e); }
  }
  // Fallback: legacy prompt-based edit (preserves existing behaviour for unknown sources).
  const amount = prompt('Amount (₹):', rec.amount);
  if (amount === null) return;
  if (isNaN(amount) || parseFloat(amount) <= 0) { showToast('Invalid amount', 'error'); return; }
  rec.amount = parseFloat(amount);
  const date = prompt('Date (YYYY-MM-DD):', rec.date);
  if (date) rec.date = date;
  const ref = prompt('Reference / Note:', rec.ref || '');
  if (ref !== null) rec.ref = ref;
  saveAllData();
  renderPartyTransactions(); renderPartiesList();
  showToast('Transaction updated', 'success');
};

/** Delete a transaction */
window._deletePartyTx = function(src, id) {
  const labels = { paymentsIn: 'receipt', vendorPayments: 'vendor payment', labourPayments: 'labour payment', vendorMaterials: 'purchase bill', abstracts: 'abstract', invoices: 'invoice', labourSalaries: 'salary entry' };
  if (!confirm(`Delete this ${labels[src] || 'transaction'}? This cannot be undone.`)) return;
  state[src] = (state[src] || []).filter(x => x.id !== id);
  saveAllData();
  renderPartyTransactions(); renderPartiesList();
  showToast('Transaction deleted', 'error');
};

/** Preview + download a payment receipt PDF */
window._partyReceipt = function(src, id) {
  const rec = (state[src] || []).find(x => x.id === id);
  if (!rec) { showToast('Record not found', 'error'); return; }
  const { type } = state.currentSelectedParty || {};
  const partyId = state.currentSelectedParty?.id;
  let partyName = '';
  if (type === 'Client') partyName = state.clients.find(c => c.id === partyId)?.name || '';
  else if (type === 'Vendor') partyName = state.vendors.find(v => v.id === partyId)?.name || '';
  else if (type === 'Labour') partyName = state.labourMaster.find(l => l.id === partyId)?.name || '';

  const amount = (parseFloat(rec.amount) || rec.totalAmount || rec.taxAmount || 0);
  const isReceipt = src === 'paymentsIn';
  const docTitle = isReceipt ? 'RECEIPT' : (src === 'vendorPayments' || src === 'labourPayments') ? 'PAYMENT VOUCHER' : 'TRANSACTION';
  const acc = state.accounts.find(a => a.id === rec.accountId);

  const doc = new window.jspdf.jsPDF('p', 'mm', 'a5');
  let y = getCompanyHeaderForPDF(doc);
  doc.setFontSize(16); doc.setFont('helvetica', 'bold'); doc.setTextColor(30, 58, 138);
  doc.text(docTitle, 74, y, null, null, 'center'); y += 10;
  doc.setDrawColor(220); doc.line(12, y, 136, y); y += 8;

  doc.setFontSize(10); doc.setFont('helvetica', 'normal'); doc.setTextColor(60);
  const row = (label, val) => { doc.setFont('helvetica','bold'); doc.text(label, 14, y); doc.setFont('helvetica','normal'); doc.text(String(val), 60, y); y += 8; };
  row(type === 'Client' ? 'Received From:' : 'Paid To:', partyName);
  row('Date:', rec.date || '—');
  row('Reference:', rec.ref || rec.billNo || rec.invoiceNum || '—');
  if (acc) row('Via Account:', acc.name);
  y += 4;
  doc.setFillColor(240, 249, 255); doc.rect(12, y - 4, 124, 14, 'F');
  doc.setFontSize(13); doc.setFont('helvetica', 'bold'); doc.setTextColor(5, 150, 105);
  doc.text('Amount:', 16, y + 4);
  doc.text(pdfMoney(amount), 132, y + 4, null, null, 'right');
  y += 20;
  doc.setFontSize(8); doc.setTextColor(120); doc.setFont('helvetica', 'normal');
  doc.text('This is a computer-generated receipt.', 74, y, null, null, 'center');
  y += 18;
  doc.setDrawColor(180); doc.line(90, y, 134, y); y += 5;
  doc.setFontSize(9); doc.text('Authorised Signatory', 112, y, null, null, 'center');

  mobileSavePDF(doc, `${docTitle}_${partyName.replace(/\s+/g, '_')}_${rec.date || ''}.pdf`);
  showToast('Receipt generated', 'success');
};

export function selectParty(id, type) {
  state.currentSelectedParty = { id, type };
  document.getElementById('partyEmptyState').style.display = 'none';
  renderPartiesList();
  renderPartyTransactions();
  _renderPartyInfoCard(id, type);
}

function _renderPartyInfoCard(id, type) {
  let infoEl = document.getElementById('partyInfoCard');
  if (!infoEl) return;
  let party = null;
  if (type === 'Client') party = state.clients.find(c => c.id === id);
  else if (type === 'Vendor') party = state.vendors.find(v => v.id === id);
  else if (type === 'Labour') party = state.labourMaster.find(l => l.id === id);
  if (!party) { infoEl.innerHTML = ''; return; }

  const phone = party.contact || party.phone || '';
  const gst = party.gst || party.gstNumber || '';
  const addr = party.address || '';
  const email = party.email || '';

  infoEl.innerHTML = `
    <div style="display:flex;flex-wrap:wrap;gap:16px;padding:10px 16px;background:#f8fafc;border-bottom:1px solid #e2e8f0;font-size:11px;align-items:center;">
      ${phone ? `<span style="color:#475569;"><strong style="color:#94a3b8;">Phone:</strong> ${phone}</span>` : ''}
      ${gst ? `<span style="color:#475569;"><strong style="color:#94a3b8;">GST:</strong> ${gst}</span>` : ''}
      ${email ? `<span style="color:#475569;"><strong style="color:#94a3b8;">Email:</strong> ${email}</span>` : ''}
      ${addr ? `<span style="color:#475569;"><strong style="color:#94a3b8;">Address:</strong> ${addr}</span>` : ''}
      <div style="margin-left:auto;display:flex;gap:6px;">
        <button onclick="_editParty('${id}','${type}')" style="padding:3px 10px;font-size:10px;font-weight:600;background:#eff6ff;color:#2563eb;border:1px solid #bfdbfe;border-radius:5px;cursor:pointer;">Edit</button>
        <button onclick="_deleteParty('${id}','${type}')" style="padding:3px 10px;font-size:10px;font-weight:600;background:#fef2f2;color:#dc2626;border:1px solid #fecaca;border-radius:5px;cursor:pointer;">Delete</button>
      </div>
    </div>`;
}

/** Prompt to edit a party's payment terms (credit days) and log any change. */
function _editPartyTerms(party, kind) {
  const cur = party.paymentTermsDays != null ? party.paymentTermsDays : '';
  const label = kind === 'vendor' ? 'Payment terms — days they give YOU to pay:' : 'Payment terms — days you give this client to pay:';
  const s = prompt(label, cur);
  if (s === null) return; // cancelled — leave unchanged
  const nd = s.trim() === '' ? null : Math.max(0, parseInt(s) || 0);
  const prev = party.paymentTermsDays != null ? party.paymentTermsDays : null;
  if (nd === prev) return;
  if (!Array.isArray(party.termsHistory)) party.termsHistory = [];
  let reason = '';
  if (prev != null && nd != null) reason = prompt(`Terms changing ${prev} → ${nd} days. Reason? (optional)`, '') || '';
  party.termsHistory.push({ date: new Date().toISOString(), from: prev, to: nd, reason: reason || (prev == null ? 'Terms set' : 'Terms changed') });
  party.paymentTermsDays = nd;
}

function _findParty(id, type) {
  if (type === 'Client') return (state.clients || []).find(x => x.id === id);
  if (type === 'Vendor') return (state.vendors || []).find(x => x.id === id);
  if (type === 'Labour') return (state.labourMaster || []).find(x => x.id === id);
  return null;
}

const _peEsc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function _peField(label, id, val, opts = {}) {
  const span = opts.full ? 'sm:col-span-2' : '';
  const mono = opts.mono ? 'font-mono uppercase' : '';
  return `<div class="${span}">
    <label class="block text-[10px] font-bold text-slate-500 mb-1 uppercase tracking-wide">${label}</label>
    <input id="${id}" type="${opts.type || 'text'}" value="${_peEsc(val)}" placeholder="${opts.ph || ''}" ${opts.min != null ? `min="${opts.min}"` : ''}
      class="w-full p-2.5 border border-slate-200 rounded-lg text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 ${mono}">
  </div>`;
}

/** Nice modal to edit a party (Client / Vendor / Labour). Replaces the old prompt() chain. */
export function _editParty(id, type) {
  const rec = _findParty(id, type);
  if (!rec) return showToast(type + ' not found', 'error');
  window._partyEditCtx = { id, type };
  document.getElementById('partyEditOverlay')?.remove();

  const accent = type === 'Client' ? '#2563eb' : type === 'Vendor' ? '#ea580c' : '#d97706';
  const icon = type === 'Client' ? '🏢' : type === 'Vendor' ? '🚚' : '👷';

  let fields;
  if (type === 'Labour') {
    fields = [
      _peField('Labour Name *', 'pe_name', rec.name, { full: true, ph: 'Full name' }),
      _peField('Phone', 'pe_phone', rec.phone, { ph: 'Mobile number' }),
      _peField('Daily Rate', 'pe_rate', rec.dailyRate, { type: 'number', min: 0, ph: '0' }),
      _peField('Skill / Trade', 'pe_skill', rec.skill, { full: true, ph: 'e.g. Mason, Carpenter, Helper' })
    ].join('');
  } else {
    const isClient = type === 'Client';
    fields = [
      _peField((isClient ? 'Client' : 'Vendor') + ' / Company Name *', 'pe_name', rec.name, { full: true, ph: 'e.g. L&T Construction' }),
      _peField('Contact Person', 'pe_contact', rec.contact, { ph: 'Contact person' }),
      _peField('Phone', 'pe_phone', rec.phone, { ph: 'Mobile / Phone' }),
      _peField('Email', 'pe_email', rec.email, { type: 'email', ph: 'name@email.com' }),
      _peField('GSTIN', 'pe_gst', rec.gst, { mono: true, ph: '22AAAAA0000A1Z5' }),
      _peField('PAN', 'pe_pan', rec.pan, { mono: true, ph: 'ABCDE1234F' }),
      _peField('Payment Terms — Credit Days', 'pe_terms', rec.paymentTermsDays, { type: 'number', min: 0, ph: 'e.g. 30' }),
      isClient ? _peField('Credit Limit', 'pe_credit', rec.creditLimit, { type: 'number', min: 0, ph: 'Max outstanding' }) : '',
      _peField('Address', 'pe_addr', rec.address, { full: true, ph: 'Full address' })
    ].join('');
  }

  const html = `
  <div id="partyEditOverlay" style="position:fixed;inset:0;background:rgba(15,23,42,.55);z-index:199999;display:flex;align-items:center;justify-content:center;padding:16px;" onclick="if(event.target===this)window._closePartyEdit()">
    <div style="background:#fff;border-radius:16px;max-width:560px;width:100%;max-height:92vh;overflow:auto;box-shadow:0 24px 70px rgba(0,0,0,.35);">
      <div style="padding:18px 22px;border-bottom:1px solid #e2e8f0;border-top:4px solid ${accent};border-radius:16px 16px 0 0;display:flex;justify-content:space-between;align-items:center;">
        <div class="flex items-center gap-2.5">
          <span style="font-size:22px;">${icon}</span>
          <div>
            <h3 class="font-extrabold text-slate-800 text-lg leading-tight">Edit ${type}</h3>
            <p class="text-xs text-slate-400 font-medium">${_peEsc(rec.name || '')}</p>
          </div>
        </div>
        <button onclick="window._closePartyEdit()" class="text-slate-400 hover:text-red-500 font-bold text-2xl leading-none">&times;</button>
      </div>
      <div style="padding:20px 22px;">
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3.5">${fields}</div>
      </div>
      <div style="padding:14px 22px;border-top:1px solid #e2e8f0;display:flex;gap:10px;justify-content:flex-end;">
        <button onclick="window._closePartyEdit()" class="px-4 py-2 rounded-lg font-bold text-sm text-slate-600 bg-slate-100 hover:bg-slate-200">Cancel</button>
        <button onclick="window._savePartyEdit()" class="px-6 py-2 rounded-lg font-bold text-sm text-white" style="background:${accent};">💾 Save ${type}</button>
      </div>
    </div>
  </div>`;
  document.body.insertAdjacentHTML('beforeend', html);
  setTimeout(() => document.getElementById('pe_name')?.focus(), 30);
}

window._closePartyEdit = function () { document.getElementById('partyEditOverlay')?.remove(); window._partyEditCtx = null; };

window._savePartyEdit = function () {
  const ctx = window._partyEditCtx;
  if (!ctx) return;
  const { id, type } = ctx;
  const rec = _findParty(id, type);
  if (!rec) return window._closePartyEdit();
  const V = fid => (document.getElementById(fid)?.value ?? '').trim();
  const name = V('pe_name');
  if (!name) return showToast('Name is required', 'error');
  rec.name = name;

  if (type === 'Labour') {
    rec.phone = V('pe_phone');
    rec.dailyRate = parseFloat(V('pe_rate')) || 0;
    rec.skill = V('pe_skill');
  } else {
    rec.contact = V('pe_contact');
    rec.phone = V('pe_phone');
    rec.email = V('pe_email');
    rec.gst = V('pe_gst');
    rec.pan = V('pe_pan');
    rec.address = V('pe_addr');
    if (type === 'Client') rec.creditLimit = parseFloat(V('pe_credit')) || 0;
    // Payment terms — record a history entry only when the value actually changes.
    const raw = V('pe_terms');
    const nd = raw === '' ? null : Math.max(0, parseInt(raw) || 0);
    const prev = rec.paymentTermsDays != null ? rec.paymentTermsDays : null;
    if (nd !== prev) {
      if (!Array.isArray(rec.termsHistory)) rec.termsHistory = [];
      rec.termsHistory.push({ date: new Date().toISOString(), from: prev, to: nd, reason: prev == null ? 'Terms set' : 'Terms changed' });
      rec.paymentTermsDays = nd;
    }
  }

  saveAllData();
  window._closePartyEdit();
  showToast(type + ' updated', 'success');
  renderPartiesList();
  renderPartyTransactions();
  _renderPartyInfoCard(id, type);
  populateDropdowns();
};

export function _deleteParty(id, type) {
  let name = '';
  if (type === 'Client') name = state.clients.find(x => x.id === id)?.name;
  else if (type === 'Vendor') name = state.vendors.find(x => x.id === id)?.name;
  else if (type === 'Labour') name = state.labourMaster.find(x => x.id === id)?.name;

  if (!confirm(`Delete "${name}" (${type})?\n\nThis will NOT delete their transactions (invoices, payments, etc). Only the party record will be removed.`)) return;

  // Route through the recycle bin so a tombstone is recorded. Without it, a stale
  // device (or an anti-clobber pull) that re-pushes the clients/vendors/labour array
  // would resurrect the deleted party — the "ghost deletion" bug. recycleDelete()
  // removes it from the source array, adds a bin entry, and persists+syncs both, so
  // reconcileRecycleBin() re-strips it after every load/pull/realtime.
  const stateKey = type === 'Client' ? 'clients' : type === 'Vendor' ? 'vendors' : type === 'Labour' ? 'labourMaster' : null;
  if (!stateKey) return;
  const moved = window.recycleDelete
    ? window.recycleDelete(stateKey, id, type, name)
    : (state[stateKey] = state[stateKey].filter(x => x.id !== id), saveAllData(), true); // fallback if bin unavailable
  if (!moved) { showToast(`Could not delete ${type}`, 'error'); return; }

  state.currentSelectedParty = null;
  showToast(`${type} "${name}" moved to Recycle Bin`, 'error');
  document.getElementById('partyEmptyState').style.display = '';
  document.getElementById('partyInfoCard').innerHTML = '';
  renderPartiesList();
  populateDropdowns();
}

