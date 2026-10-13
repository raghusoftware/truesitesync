/**
 * caExport.js — "Share with CA" Excel workbook.
 *
 * buildCAPack(state, { from, to }) is pure (unit-tested) and returns the sheets
 * as arrays of rows; exportCAPack() turns them into an .xlsx via SheetJS.
 *
 * Sheets: Summary · Receipts · Payments · Deductions · TDS Receivable ·
 * TDS Payable · Retention & Deposits · Penalties · Party Balances.
 * Every money row shows Bill settled = Cash + Deductions so the CA can post
 * Bank / TDS Receivable / Party entries directly.
 */
import {
  settledAmount, deductionTotal, deductionRegister, deductionBalances, fyQuarter, tdsDueDate, findType,
} from './deductions.js';

const _num = (v) => { const n = parseFloat(v); return Number.isFinite(n) ? n : 0; };
const _r2 = (n) => Math.round(n * 100) / 100;
const _nm = (list, id) => ((list || []).find(x => x.id === id) || {}).name || '';
const _inR = (d, from, to) => (!from || (d || '') >= from) && (!to || (d || '') <= to);
const _dedText = (p) => (p.deductions || []).map(d => `${d.label} ${_r2(_num(d.amount))}${d.remark ? ' (' + d.remark + ')' : ''}`).join('; ');

/** Indian FY (Apr–Mar) range containing `date` — { from, to, label }. */
export function fyRange(date = new Date().toISOString().slice(0, 10), offset = 0) {
  const y = parseInt(date.slice(0, 4), 10), m = parseInt(date.slice(5, 7), 10);
  const start = (m >= 4 ? y : y - 1) + offset;
  return { from: `${start}-04-01`, to: `${start + 1}-03-31`, label: `FY ${start}-${String((start + 1) % 100).padStart(2, '0')}` };
}

export function buildCAPack(state, { from = '', to = '', company = '' } = {}) {
  const S = state || {};
  const acc = (id) => _nm(S.accounts, id);
  const period = from || to ? `${from || 'start'} to ${to || 'today'}` : 'All dates';

  // ── Receipts (money in from clients) ──
  const receipts = [['Date', 'Receipt No', 'Client', 'Against Bill', 'Cash Received', 'Deductions', 'Bill Settled', 'Deposited To', 'Deductions Detail', 'Remark']];
  (S.paymentsIn || []).filter(p => _inR(p.date, from, to)).sort((a, b) => String(a.date).localeCompare(String(b.date))).forEach(p => {
    receipts.push([p.date || '', p.receiptNo || '', _nm(S.clients, p.clientId), p.againstBillRef || p.invoiceRef || '',
      _r2(_num(p.amount)), deductionTotal(p), settledAmount(p), acc(p.accountId), _dedText(p), p.deductionRemark || p.ref || '']);
  });

  // ── Payments (money out to parties & expense heads) ──
  const payments = [['Date', 'Party Type', 'Party / Head', 'Against Bill', 'Cash Paid', 'Deductions', 'Bill Settled', 'Paid From', 'Deductions Detail', 'Remark']];
  const outRows = [];
  const via = (p) => p.source === 'petty' ? 'Petty cash · ' + _nm(S.pettyCashCustodians, p.custodianId) : acc(p.accountId);
  (S.vendorPayments || []).forEach(p => outRows.push(['Vendor', _nm(S.vendors, p.vendorId), p]));
  (S.labourPayments || []).forEach(p => outRows.push(['Labour', _nm(S.labourMaster, p.labourId), p]));
  (S.expenses || []).forEach(p => outRows.push([p.gangId ? 'Contractor' : (p.settlesDeduction ? 'Tax deposit' : 'Expense'),
    p.gangId ? _nm(S.labourContractors, p.gangId) : [p.head || p.category, p.subHead].filter(Boolean).join(' · ') + (p.challanNo ? ' · Challan ' + p.challanNo : ''), p]));
  outRows.filter(r => _inR(r[2].date, from, to)).sort((a, b) => String(a[2].date).localeCompare(String(b[2].date))).forEach(([t, n, p]) => {
    payments.push([p.date || '', t, n, p.againstBillRef || '', _r2(_num(p.amount)), deductionTotal(p), settledAmount(p), via(p), _dedText(p), p.deductionRemark || p.ref || p.remarks || '']);
  });

  // ── Deductions register ──
  const reg = deductionRegister(S, { from, to }).slice().reverse();
  const deductions = [['Date', 'Payment', 'Party Type', 'Party', 'Against Bill', 'Deduction', 'Nature', 'Section', 'Rate %', 'Amount', 'Booked To', 'Remark']];
  reg.forEach(r => deductions.push([r.date, r.direction === 'in' ? 'In' : 'Out', r.partyType, r.partyName, r.billRef, r.label, r.nature, r.section, r.rate || '', r.amount, r.register, r.remark]));

  const panOf = (r) => {
    const p = (S[r.src] || []).find(x => x.id === r.paymentId) || {};
    const party = p.clientId ? (S.clients || []).find(c => c.id === p.clientId) : p.vendorId ? (S.vendors || []).find(v => v.id === p.vendorId)
      : p.labourId ? (S.labourMaster || []).find(l => l.id === p.labourId) : p.gangId ? (S.labourContractors || []).find(g => g.id === p.gangId) : null;
    return party?.pan || '';
  };
  const tdsIn = [['Date', 'Quarter', 'Client (Deductor)', 'Client PAN', 'Tax', 'Section', 'Bill', 'Bill Amount', 'Rate %', 'Tax Deducted', 'Cash Received', '26AS / AIS']];
  reg.filter(r => r.direction === 'in' && r.nature === 'tax').forEach(r => tdsIn.push([r.date, fyQuarter(r.date), r.partyName, panOf(r), r.label, r.section, r.billRef, r.settled, r.rate || '', r.amount, r.cash, r.matched26AS ? 'Matched' : 'Not checked']));
  const tdsOut = [['Date', 'Quarter', 'Deductee', 'PAN', 'Tax', 'Section', 'Bill Amount', 'Rate %', 'Tax Deducted', 'Cash Paid', 'Deposit Due', 'Deposited', 'Challan No']];
  reg.filter(r => r.direction === 'out' && r.nature === 'tax').forEach(r => {
    const d = ((S[r.src] || []).find(x => x.id === r.paymentId)?.deductions || []).find(x => x.type === r.type) || {};
    tdsOut.push([r.date, fyQuarter(r.date), r.partyName, panOf(r), r.label, r.section, r.settled, r.rate || '', r.amount, r.cash, tdsDueDate(r.date), d.deposited ? 'Yes' : 'No', d.challanNo || '']);
  });

  const held = [['Date', 'Movement', 'Party', 'Against Bill', 'Type', 'Amount', 'Remark']];
  reg.filter(r => r.nature === 'held').forEach(r => held.push([r.date, r.direction === 'in' ? 'Held by client' : 'Held by us', r.partyName, r.billRef, r.label, r.amount, r.remark]));
  (S.otherIncome || []).filter(o => o.settlesDeduction && _inR(o.date, from, to)).forEach(o => held.push([o.date, 'Released by client', _nm(S.clients, o.clientId) || o.source || '', '', findType(S, o.settlesDeduction).label, -_r2(_num(o.amount)), o.ref || '']));

  const penalties = [['Date', 'Type', 'Party', 'Against Bill', 'Penalty', 'Amount', 'Reason']];
  reg.filter(r => r.nature === 'penalty').forEach(r => penalties.push([r.date, r.direction === 'in' ? 'Suffered (client deducted)' : 'Levied (we deducted)', r.partyName, r.billRef, r.label, r.amount, r.remark]));

  // ── Party balances (all-time, cleared by settled amount) ──
  const parties = [['Party Type', 'Party', 'Billed / Purchased', 'Settled (cash + deductions)', 'Of which deductions', 'Balance']];
  (S.clients || []).forEach(c => {
    const billed = (S.abstracts || []).filter(a => a.clientId === c.id && a.status !== 'invoiced').reduce((s, a) => s + _num(a.totalAmount), 0)
      + (S.invoices || []).filter(i => i.clientId === c.id && i.status !== 'Cancelled').reduce((s, i) => s + _num(i.taxAmount), 0)
      + (S.saleInvoices || []).filter(i => i.clientId === c.id && i.status !== 'Cancelled').reduce((s, i) => s + _num(i.total), 0);
    const pays = (S.paymentsIn || []).filter(p => p.clientId === c.id);
    const settled = pays.reduce((s, p) => s + settledAmount(p), 0), ded = pays.reduce((s, p) => s + deductionTotal(p), 0);
    if (billed || settled) parties.push(['Client', c.name || '', _r2(billed), _r2(settled), _r2(ded), _r2(billed - settled)]);
  });
  (S.vendors || []).forEach(v => {
    const billed = (S.vendorMaterials || []).filter(m => m.vendorId === v.id).reduce((s, m) => s + _num(m.totalAmount ?? m.amount), 0);
    const pays = (S.vendorPayments || []).filter(p => p.vendorId === v.id);
    const settled = pays.reduce((s, p) => s + settledAmount(p), 0), ded = pays.reduce((s, p) => s + deductionTotal(p), 0);
    if (billed || settled) parties.push(['Vendor', v.name || '', _r2(billed), _r2(settled), _r2(ded), _r2(billed - settled)]);
  });

  // ── Summary ──
  const sum = (rows, col) => _r2(rows.slice(1).reduce((s, r) => s + _num(r[col]), 0));
  const bal = deductionBalances(S, { from, to });
  const summary = [
    [company ? company + ' — Accounts pack for CA' : 'Accounts pack for CA'],
    ['Period', period],
    ['Generated', new Date().toISOString().slice(0, 10)],
    [],
    ['Receipts', 'Cash received', sum(receipts, 4), 'Deductions by clients', sum(receipts, 5), 'Bills settled', sum(receipts, 6)],
    ['Payments', 'Cash paid', sum(payments, 4), 'Deductions by us', sum(payments, 5), 'Bills settled', sum(payments, 6)],
    [],
    ['Register', 'Direction', 'Deducted', 'Settled / deposited / released', 'Balance'],
    ...bal.map(b => [b.register, b.direction === 'in' ? 'Payment In' : 'Payment Out', b.deducted, b.settled, b.balance]),
    [],
    ['How to read: Bill settled = Cash + Deductions. Client/vendor ledgers are cleared by the bill settled; each deduction is booked to its own register (TDS Receivable / Payable, Retention, Penalties…).'],
  ];

  return {
    period,
    sheets: [
      ['Summary', summary], ['Receipts', receipts], ['Payments', payments], ['Deductions', deductions],
      ['TDS Receivable', tdsIn], ['TDS Payable', tdsOut], ['Retention & Deposits', held], ['Penalties', penalties], ['Party Balances', parties],
    ],
  };
}

/** Build and download the workbook (browser / APK). */
export function exportCAPack(state, opts = {}, save) {
  const X = typeof window !== 'undefined' ? window.XLSX : null;
  if (!X) throw new Error('Excel library not loaded');
  const pack = buildCAPack(state, opts);
  const wb = X.utils.book_new();
  pack.sheets.forEach(([name, rows]) => {
    const ws = X.utils.aoa_to_sheet(rows);
    const widths = (rows[0] || []).map((_, i) => ({ wch: Math.min(48, Math.max(10, ...rows.map(r => String(r[i] ?? '').length + 2))) }));
    ws['!cols'] = widths;
    X.utils.book_append_sheet(wb, ws, name);
  });
  const fname = `CA-pack_${(opts.from || 'all')}_${(opts.to || 'today')}.xlsx`;
  if (typeof save === 'function') save(wb, fname); else X.writeFile(wb, fname);
  return fname;
}
