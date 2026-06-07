/**
 * ═══════════════════════════════════════════════════════════
 * True Site Sync — Finance composite reports
 * ═══════════════════════════════════════════════════════════
 * Bank / Cash Statement (per account, running balance),
 * Parties Statement (client/vendor ledger, running balance),
 * Cash Flow Forecast (current cash + expected in/out + monthly).
 * PDF + Excel. Routed from the Reports module.
 * ═══════════════════════════════════════════════════════════
 */

import { state } from './state.js';
import { showToast, getPdfCurrency, mobileSavePDF, mobileSaveXLSX } from './utils.js';
import { formatNumber2 } from './format.js';

const _n2 = formatNumber2;
const _num = v => parseFloat(v) || 0;
const _hdr = (doc, o) => (typeof window !== 'undefined' && window.getSimpleHeaderForPDF) ? window.getSimpleHeaderForPDF(doc, o) : 16;
const _accName = id => (state.accounts || []).find(a => a.id === id)?.name || '—';
const _clientName = id => (state.clients || []).find(c => c.id === id)?.name || '';
const _vendorName = id => (state.vendors || []).find(v => v.id === id)?.name || '';
const _custName = id => (state.pettyCashCustodians || []).find(c => c.id === id)?.name || 'custodian';

function _doc() { const d = new window.jspdf.jsPDF('p', 'mm', 'a4'); return d; }
function _titleBar(doc, title, accent) {
  const pw = doc.internal.pageSize.getWidth(); const ml = 12, mr = 12;
  let y = _hdr(doc, { ml, mr });
  doc.setFillColor(accent[0], accent[1], accent[2]); doc.rect(ml, y, pw - ml - mr, 9, 'F');
  doc.setTextColor(255, 255, 255); doc.setFont('helvetica', 'bold'); doc.setFontSize(13);
  doc.text(title, pw / 2, y + 6.2, { align: 'center' });
  doc.setTextColor(0, 0, 0);
  return y + 13;
}

// ── Account transaction ledger (mirrors finance.js account balance) ──
function _accountTxs(accId) {
  const t = [];
  (state.paymentsIn || []).filter(p => p.accountId === accId).forEach(p => t.push({ date: p.date, desc: 'Receipt: ' + (p.ref || _clientName(p.clientId) || 'Client Payment'), credit: _num(p.amount), debit: 0 }));
  (state.otherIncome || []).filter(o => o.accountId === accId).forEach(o => t.push({ date: o.date, desc: 'Other Income: ' + (o.source || o.ref || ''), credit: _num(o.amount), debit: 0 }));
  (state.expenses || []).filter(e => e.accountId === accId).forEach(e => t.push({ date: e.date, desc: 'Expense: ' + (e.category || e.ref || 'Misc'), credit: 0, debit: _num(e.amount) }));
  (state.vendorPayments || []).filter(v => v.accountId === accId).forEach(v => t.push({ date: v.date, desc: 'Vendor: ' + (_vendorName(v.vendorId) || v.ref || 'Payment'), credit: 0, debit: _num(v.amount) }));
  (state.labourPayments || []).filter(l => l.accountId === accId).forEach(l => t.push({ date: l.date, desc: 'Labour: ' + (l.ref || 'Wage'), credit: 0, debit: _num(l.amount) }));
  (state.equipmentLogs || []).filter(e => e.accountId === accId).forEach(e => t.push({ date: e.date, desc: 'Equipment', credit: 0, debit: _num(e.amount) }));
  (state.accountTransfers || []).filter(x => x.fromAccountId === accId).forEach(x => t.push({ date: x.date, desc: 'Transfer to ' + _accName(x.toAccountId), credit: 0, debit: _num(x.amount) }));
  (state.accountTransfers || []).filter(x => x.toAccountId === accId).forEach(x => t.push({ date: x.date, desc: 'Transfer from ' + _accName(x.fromAccountId), credit: _num(x.amount), debit: 0 }));
  (state.pettyCashTxns || []).filter(x => x.type === 'TRANSFER' && x.fromAccountId === accId).forEach(x => t.push({ date: x.date, desc: 'Petty Cash → ' + _custName(x.custodianId), credit: 0, debit: _num(x.amount) }));
  t.sort((a, b) => new Date(a.date || 0) - new Date(b.date || 0));
  return t;
}
function _accountBalance(accId) { return _accountTxs(accId).reduce((b, x) => b + x.credit - x.debit, 0); }

// ── Party (client/vendor) ledger ──
function _partyLedger(type, id) {
  const t = [];
  if (type === 'client') {
    (state.abstracts || []).filter(a => a.clientId === id).forEach(a => t.push({ date: a.date, desc: 'Work Bill / Abstract ' + (a.abstractNum || ''), debit: _num(a.totalAmount), credit: 0 }));
    (state.saleInvoices || []).filter(i => i.clientId === id && i.status !== 'Cancelled').forEach(i => t.push({ date: i.date, desc: 'Tax Invoice ' + (i.invoiceNo || ''), debit: _num(i.total), credit: 0 }));
    (state.paymentsIn || []).filter(p => p.clientId === id).forEach(p => t.push({ date: p.date, desc: 'Payment Received ' + (p.ref || ''), debit: 0, credit: _num(p.amount) }));
  } else {
    (state.vendorMaterials || []).filter(b => b.vendorId === id).forEach(b => t.push({ date: b.date, desc: 'Purchase Bill ' + (b.billNo || ''), debit: 0, credit: _num(b.totalAmount ?? b.amount) }));
    (state.vendorPayments || []).filter(p => p.vendorId === id).forEach(p => t.push({ date: p.date, desc: 'Payment Made ' + (p.ref || ''), debit: _num(p.amount), credit: 0 }));
  }
  t.sort((a, b) => new Date(a.date || 0) - new Date(b.date || 0));
  return t;
}

// ══════════════════════════════════════════════════════════
//  BANK / CASH STATEMENT
// ══════════════════════════════════════════════════════════
export function exportBankStatementPDF(accId) {
  try {
    const acc = (state.accounts || []).find(a => a.id === accId);
    if (!acc) return showToast('Select an account', 'error');
    if (!window.jspdf?.jsPDF) return showToast('PDF library not loaded — refresh', 'error');
    const cur = (getPdfCurrency() || 'Rs.').trim();
    const doc = _doc(); const ml = 12, mr = 12; const pw = doc.internal.pageSize.getWidth();
    let y = _titleBar(doc, 'BANK / CASH STATEMENT', [14, 116, 144]);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9.5);
    doc.text(`Account: ${acc.name} (${acc.type || 'Account'})    |    As on: ${new Date().toLocaleDateString('en-IN')}`, ml, y); y += 3;

    const txs = _accountTxs(accId);
    let bal = 0;
    const body = txs.map(x => { bal += x.credit - x.debit; return [x.date || '—', x.desc, x.credit ? _n2(x.credit) : '', x.debit ? _n2(x.debit) : '', _n2(bal)]; });
    doc.autoTable({
      startY: y + 2, head: [['Date', 'Particulars', 'Credit (' + cur + ')', 'Debit (' + cur + ')', 'Balance (' + cur + ')']],
      body: body.length ? body : [['—', 'No transactions', '', '', '0.00']],
      foot: [[{ content: 'Closing Balance', colSpan: 4, styles: { halign: 'right', fontStyle: 'bold' } }, { content: cur + ' ' + _n2(bal), styles: { fontStyle: 'bold' } }]],
      theme: 'grid', headStyles: { fillColor: [14, 116, 144], textColor: 255, fontSize: 8 }, footStyles: { fillColor: [236, 254, 255], textColor: 0, fontStyle: 'bold' },
      styles: { fontSize: 8, cellPadding: 1.8 }, columnStyles: { 0: { cellWidth: 24 }, 1: { cellWidth: 'auto' }, 2: { halign: 'right', cellWidth: 30 }, 3: { halign: 'right', cellWidth: 30 }, 4: { halign: 'right', cellWidth: 32 } },
      margin: { left: ml, right: mr },
    });
    mobileSavePDF(doc, `BankStatement_${acc.name.replace(/[\\/]/g, '-')}.pdf`);
    showToast('Bank statement downloaded');
  } catch (e) { console.error(e); showToast('PDF error: ' + e.message, 'error'); }
}
export function exportBankStatementExcel(accId) {
  try {
    const acc = (state.accounts || []).find(a => a.id === accId);
    if (!acc || !window.XLSX) return showToast('Select an account', 'error');
    const txs = _accountTxs(accId); let bal = 0;
    const aoa = [['Bank / Cash Statement — ' + acc.name], ['Date', 'Particulars', 'Credit', 'Debit', 'Balance']];
    txs.forEach(x => { bal += x.credit - x.debit; aoa.push([x.date, x.desc, x.credit || '', x.debit || '', bal]); });
    aoa.push(['', 'Closing Balance', '', '', bal]);
    const wb = window.XLSX.utils.book_new();
    window.XLSX.utils.book_append_sheet(wb, window.XLSX.utils.aoa_to_sheet(aoa), 'Statement');
    mobileSaveXLSX(wb, `BankStatement_${acc.name.replace(/[\\/]/g, '-')}.xlsx`);
    showToast('Bank statement Excel downloaded');
  } catch (e) { console.error(e); showToast('Excel error: ' + e.message, 'error'); }
}

// ══════════════════════════════════════════════════════════
//  PARTIES STATEMENT
// ══════════════════════════════════════════════════════════
function _parsePartyKey(key) { const [type, id] = String(key || '').split(':'); return { type, id }; }
export function exportPartiesStatementPDF(key) {
  try {
    const { type, id } = _parsePartyKey(key);
    const name = type === 'client' ? _clientName(id) : _vendorName(id);
    if (!name) return showToast('Select a party', 'error');
    if (!window.jspdf?.jsPDF) return showToast('PDF library not loaded — refresh', 'error');
    const cur = (getPdfCurrency() || 'Rs.').trim();
    const doc = _doc(); const ml = 12, mr = 12;
    let y = _titleBar(doc, 'STATEMENT OF ACCOUNT', [37, 99, 235]);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9.5);
    doc.text(`${type === 'client' ? 'Client' : 'Vendor'}: ${name}    |    As on: ${new Date().toLocaleDateString('en-IN')}`, ml, y); y += 3;

    const led = _partyLedger(type, id);
    let bal = 0;
    const body = led.map(x => { bal += x.debit - x.credit; return [x.date || '—', x.desc, x.debit ? _n2(x.debit) : '', x.credit ? _n2(x.credit) : '', _n2(Math.abs(bal)) + (bal < 0 ? ' Cr' : ' Dr')]; });
    const closingLabel = type === 'client' ? (bal >= 0 ? 'Receivable' : 'Advance') : (bal >= 0 ? 'Advance' : 'Payable');
    doc.autoTable({
      startY: y + 2, head: [['Date', 'Particulars', 'Debit (' + cur + ')', 'Credit (' + cur + ')', 'Balance']],
      body: body.length ? body : [['—', 'No transactions', '', '', '0.00']],
      foot: [[{ content: 'Closing — ' + closingLabel, colSpan: 4, styles: { halign: 'right', fontStyle: 'bold' } }, { content: cur + ' ' + _n2(Math.abs(bal)), styles: { fontStyle: 'bold' } }]],
      theme: 'grid', headStyles: { fillColor: [37, 99, 235], textColor: 255, fontSize: 8 }, footStyles: { fillColor: [239, 246, 255], textColor: 0, fontStyle: 'bold' },
      styles: { fontSize: 8, cellPadding: 1.8 }, columnStyles: { 0: { cellWidth: 24 }, 1: { cellWidth: 'auto' }, 2: { halign: 'right', cellWidth: 30 }, 3: { halign: 'right', cellWidth: 30 }, 4: { halign: 'right', cellWidth: 32 } },
      margin: { left: ml, right: mr },
    });
    mobileSavePDF(doc, `Statement_${name.replace(/[\\/]/g, '-')}.pdf`);
    showToast('Parties statement downloaded');
  } catch (e) { console.error(e); showToast('PDF error: ' + e.message, 'error'); }
}
export function exportPartiesStatementExcel(key) {
  try {
    const { type, id } = _parsePartyKey(key);
    const name = type === 'client' ? _clientName(id) : _vendorName(id);
    if (!name || !window.XLSX) return showToast('Select a party', 'error');
    const led = _partyLedger(type, id); let bal = 0;
    const aoa = [['Statement of Account — ' + name], ['Date', 'Particulars', 'Debit', 'Credit', 'Balance']];
    led.forEach(x => { bal += x.debit - x.credit; aoa.push([x.date, x.desc, x.debit || '', x.credit || '', bal]); });
    aoa.push(['', 'Closing Balance', '', '', bal]);
    const wb = window.XLSX.utils.book_new();
    window.XLSX.utils.book_append_sheet(wb, window.XLSX.utils.aoa_to_sheet(aoa), 'Statement');
    mobileSaveXLSX(wb, `Statement_${name.replace(/[\\/]/g, '-')}.xlsx`);
    showToast('Parties statement Excel downloaded');
  } catch (e) { console.error(e); showToast('Excel error: ' + e.message, 'error'); }
}

// ══════════════════════════════════════════════════════════
//  CASH FLOW FORECAST
// ══════════════════════════════════════════════════════════
function _cashFlowData(months = 6) {
  const cash = (state.accounts || []).reduce((s, a) => s + _accountBalance(a.id), 0);
  // Receivables: billed (invoices + abstracts) not yet received
  const billed = (state.saleInvoices || []).filter(i => i.status !== 'Cancelled').reduce((s, i) => s + _num(i.total), 0)
    + (state.abstracts || []).reduce((s, a) => s + _num(a.totalAmount), 0);
  const received = (state.paymentsIn || []).reduce((s, p) => s + _num(p.amount), 0);
  const receivable = Math.max(0, billed - received);
  // Payables: purchases not yet paid
  const purchased = (state.vendorMaterials || []).reduce((s, b) => s + _num(b.totalAmount ?? b.amount), 0);
  const vendorPaid = (state.vendorPayments || []).reduce((s, p) => s + _num(p.amount), 0);
  const payable = Math.max(0, purchased - vendorPaid);

  // Monthly buckets from due dates (invoices.dueDate; bills fall in current month if no due)
  const buckets = {};
  const key = d => { const dt = d ? new Date(d) : new Date(); return dt.getFullYear() + '-' + String(dt.getMonth() + 1).padStart(2, '0'); };
  const now = new Date(); const labels = [];
  for (let i = 0; i < months; i++) { const dt = new Date(now.getFullYear(), now.getMonth() + i, 1); const k = dt.getFullYear() + '-' + String(dt.getMonth() + 1).padStart(2, '0'); labels.push(k); buckets[k] = { in: 0, out: 0 }; }
  // distribute receivables by invoice dueDate (unpaid portion approximated per-invoice)
  (state.saleInvoices || []).filter(i => i.status !== 'Cancelled').forEach(i => {
    const k = key(i.dueDate || i.date); if (buckets[k]) buckets[k].in += _num(i.total) * 0.0; // base on outstanding below
  });
  // Simpler: put total receivable in first month, payable in first month (no per-due data reliable)
  if (labels[0]) { buckets[labels[0]].in += receivable; buckets[labels[0]].out += payable; }

  let run = cash;
  const rows = labels.map(k => { const b = buckets[k]; const open = run; run = open + b.in - b.out; return { month: k, open, in: b.in, out: b.out, close: run }; });
  return { cash, receivable, payable, projectedNet: cash + receivable - payable, rows };
}
export function exportCashFlowForecastPDF() {
  try {
    if (!window.jspdf?.jsPDF) return showToast('PDF library not loaded — refresh', 'error');
    const cur = (getPdfCurrency() || 'Rs.').trim(); const M = v => cur + ' ' + _n2(v);
    const d = _cashFlowData(6);
    const doc = _doc(); const ml = 12, mr = 12;
    let y = _titleBar(doc, 'CASH FLOW FORECAST', [5, 150, 105]);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9.5);
    doc.text('As on: ' + new Date().toLocaleDateString('en-IN'), ml, y); y += 3;

    doc.autoTable({
      startY: y + 2, theme: 'grid', styles: { fontSize: 9, cellPadding: 2.4 },
      columnStyles: { 0: { fontStyle: 'bold', fillColor: [236, 253, 245], cellWidth: 70 }, 1: { halign: 'right' } },
      body: [
        ['Current Cash & Bank', M(d.cash)],
        ['Expected Inflows (Receivables)', M(d.receivable)],
        ['Expected Outflows (Payables)', M(d.payable)],
        [{ content: 'Projected Net Position', styles: { fontStyle: 'bold' } }, { content: M(d.projectedNet), styles: { fontStyle: 'bold', textColor: d.projectedNet >= 0 ? [5, 150, 105] : [220, 38, 38] } }],
      ], margin: { left: ml, right: mr },
    });
    y = doc.lastAutoTable.finalY + 6;
    doc.setFont('helvetica', 'bold'); doc.setFontSize(10); doc.setTextColor(5, 150, 105); doc.text('6-Month Projection', ml, y); doc.setTextColor(0);
    doc.autoTable({
      startY: y + 2, head: [['Month', 'Opening', 'Inflow', 'Outflow', 'Closing']],
      body: d.rows.map(r => [r.month, _n2(r.open), _n2(r.in), _n2(r.out), _n2(r.close)]),
      theme: 'grid', headStyles: { fillColor: [5, 150, 105], textColor: 255, fontSize: 8 },
      styles: { fontSize: 8.5, cellPadding: 1.8 }, columnStyles: { 1: { halign: 'right' }, 2: { halign: 'right' }, 3: { halign: 'right' }, 4: { halign: 'right' } },
      margin: { left: ml, right: mr },
    });
    doc.setFontSize(7.5); doc.setTextColor(150);
    doc.text('Forecast: receivables = billed − received; payables = purchased − paid. Indicative.', ml, doc.lastAutoTable.finalY + 6);
    mobileSavePDF(doc, 'CashFlowForecast.pdf');
    showToast('Cash flow forecast downloaded');
  } catch (e) { console.error(e); showToast('PDF error: ' + e.message, 'error'); }
}
export function exportCashFlowForecastExcel() {
  try {
    if (!window.XLSX) return showToast('Excel library not loaded — refresh', 'error');
    const d = _cashFlowData(6);
    const aoa = [['Cash Flow Forecast'], ['Current Cash & Bank', d.cash], ['Expected Inflows', d.receivable], ['Expected Outflows', d.payable], ['Projected Net', d.projectedNet], [], ['Month', 'Opening', 'Inflow', 'Outflow', 'Closing'], ...d.rows.map(r => [r.month, r.open, r.in, r.out, r.close])];
    const wb = window.XLSX.utils.book_new();
    window.XLSX.utils.book_append_sheet(wb, window.XLSX.utils.aoa_to_sheet(aoa), 'Forecast');
    mobileSaveXLSX(wb, 'CashFlowForecast.xlsx');
    showToast('Cash flow Excel downloaded');
  } catch (e) { console.error(e); showToast('Excel error: ' + e.message, 'error'); }
}

if (typeof window !== 'undefined') {
  Object.assign(window, {
    exportBankStatementPDF, exportBankStatementExcel,
    exportPartiesStatementPDF, exportPartiesStatementExcel,
    exportCashFlowForecastPDF, exportCashFlowForecastExcel,
  });
}
