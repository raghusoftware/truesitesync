/**
 * partyCalc.js — party balances and ledger entries (clients, suppliers,
 * labour, contractors). Pure; unit-tested in tests/partyCalc.test.js.
 * Used by the Party screens (parties.js).
 *
 * Balance sign follows the old ledger: for a client, + means they owe us
 * (receivable); for a supplier / labour / contractor, + means we owe them
 * (payable). A negative balance is an advance the other way round.
 */
import { settledAmount } from './deductions.js';

const _n = (v) => { const n = parseFloat(v); return Number.isFinite(n) ? n : 0; };

export const PARTY_TYPES = ['Client', 'Vendor', 'Labour', 'Contractor'];
export const TYPE_LABEL = { Client: 'Client', Vendor: 'Supplier', Labour: 'Labour', Contractor: 'Contractor' };

function _contractorFigures(S, g) {
  const earned = (S.workMeasurements || []).filter(m => m.gangId === g.id && m.approved).reduce((s, m) => {
    const rate = (S.workItemRates || []).find(r => r.id === m.rateId);
    return s + _n(rate && rate.rate) * _n(m.quantity);
  }, 0);
  const wIds = new Set((S.labourMaster || []).filter(w => w.contractorId === g.id).map(w => w.id));
  const wages = (S.labourSalaries || []).filter(s => wIds.has(s.labourId)).reduce((s, x) => s + _n(x.amount), 0);
  const wagesPaid = (S.labourPayments || []).filter(p => wIds.has(p.labourId)).reduce((s, x) => s + settledAmount(x), 0);
  const paid = (S.expenses || []).filter(e => e.gangId === g.id && e.category === 'Piece-Rate Gang Payout').reduce((s, e) => s + settledAmount(e), 0)
    + (S.labourAdvances || []).filter(a => a.labourId === g.id).reduce((s, a) => s + _n(a.amount), 0);
  return { dues: earned + wages, settled: paid + wagesPaid };
}

/** Every party with its balance: [{ id, name, type, balance, phone }] sorted by name. */
export function partyRows(S) {
  const rows = [];
  (S.clients || []).forEach(c => {
    const billed = (S.abstracts || []).filter(a => a.clientId === c.id && a.status !== 'invoiced').reduce((s, a) => s + _n(a.totalAmount), 0)
      + (S.invoices || []).filter(i => i.clientId === c.id && i.status !== 'Cancelled').reduce((s, i) => s + _n(i.taxAmount), 0)
      + (S.saleInvoices || []).filter(i => i.clientId === c.id && i.status !== 'Cancelled').reduce((s, i) => s + _n(i.total), 0);
    const paid = (S.paymentsIn || []).filter(p => p.clientId === c.id).reduce((s, p) => s + settledAmount(p), 0);
    rows.push({ id: c.id, name: c.name || '', type: 'Client', balance: billed - paid, phone: c.contact || c.phone || '' });
  });
  (S.vendors || []).forEach(v => {
    const bought = (S.vendorMaterials || []).filter(m => m.vendorId === v.id).reduce((s, m) => s + (_n(m.totalAmount) || _n(m.amount)), 0);
    const paid = (S.vendorPayments || []).filter(p => p.vendorId === v.id).reduce((s, p) => s + settledAmount(p), 0);
    rows.push({ id: v.id, name: v.name || '', type: 'Vendor', balance: bought - paid, phone: v.contact || v.phone || '' });
  });
  (S.labourMaster || []).forEach(l => {
    // Workers under a contractor settle through the contractor.
    if (l.contractorId) return;
    const sal = (S.labourSalaries || []).filter(s => s.labourId === l.id).reduce((s, x) => s + _n(x.amount), 0);
    const paid = (S.labourPayments || []).filter(p => p.labourId === l.id).reduce((s, p) => s + settledAmount(p), 0);
    rows.push({ id: l.id, name: l.name || '', type: 'Labour', balance: sal - paid, phone: l.phone || '', trade: l.trade || '' });
  });
  (S.labourContractors || []).forEach(g => {
    const { dues, settled } = _contractorFigures(S, g);
    if (dues === 0 && settled === 0) return;
    rows.push({ id: g.id, name: g.name || '', type: 'Contractor', balance: dues - settled, phone: g.phone || '' });
  });
  return rows.sort((a, b) => a.name.localeCompare(b.name));
}

/** 'receivable' | 'payable' | 'settled' for a row. */
export function balanceSide(row) {
  const b = Math.round(_n(row.balance) * 100) / 100;
  if (!b) return 'settled';
  const owesUs = row.type === 'Client' ? b > 0 : b < 0;
  return owesUs ? 'receivable' : 'payable';
}

/** Totals for the summary strip. */
export function partyTotals(rows) {
  let receivable = 0, payable = 0;
  (rows || []).forEach(r => {
    const side = balanceSide(r);
    if (side === 'receivable') receivable += Math.abs(r.balance);
    else if (side === 'payable') payable += Math.abs(r.balance);
  });
  return { receivable, payable };
}

/** Rows matching search text and the type chip ('All' or a type). */
export function filterParties(rows, { q = '', type = 'All' } = {}) {
  const needle = String(q || '').trim().toLowerCase();
  return (rows || []).filter(r => (type === 'All' || r.type === type)
    && (!needle || [r.name, r.phone, r.trade].some(v => String(v || '').toLowerCase().includes(needle))));
}

/**
 * Ledger entries for one party, oldest first, each with the running balance:
 * [{ date, number, type, total, isDebit, src, id, rec, running }]
 * isDebit: for a client a debit raises what they owe; for the others a debit
 * (a payment) lowers what we owe.
 */
export function partyEntries(S, id, type) {
  const t = [];
  if (type === 'Client') {
    (S.abstracts || []).filter(a => a.clientId === id && a.status !== 'invoiced').forEach(a => t.push({ date: a.date, number: a.abstractNum || 'Abstract', type: 'Sale (Abstract)', total: _n(a.totalAmount), isDebit: true, src: 'abstracts', id: a.id }));
    (S.invoices || []).filter(i => i.clientId === id && i.status !== 'Cancelled').forEach(i => t.push({ date: i.date, number: i.invoiceNum || 'Invoice', type: 'Sale (GST)', total: _n(i.taxAmount), isDebit: true, src: 'invoices', id: i.id }));
    (S.saleInvoices || []).filter(i => i.clientId === id && i.status !== 'Cancelled').forEach(i => t.push({ date: i.date, number: i.invoiceNo || 'Invoice', type: 'Sale Invoice', total: _n(i.total), isDebit: true, src: 'saleInvoices', id: i.id }));
    (S.paymentsIn || []).filter(p => p.clientId === id).forEach(p => t.push({ date: p.date, number: p.ref || p.receiptNo || 'Receipt', type: 'Payment In', total: settledAmount(p), isDebit: false, src: 'paymentsIn', id: p.id, rec: p }));
  } else if (type === 'Vendor') {
    (S.vendorMaterials || []).filter(m => m.vendorId === id).forEach(m => t.push({ date: m.date, number: m.billNo || 'Purchase', type: 'Purchase', total: _n(m.totalAmount) || _n(m.amount), isDebit: false, src: 'vendorMaterials', id: m.id }));
    (S.vendorPayments || []).filter(p => p.vendorId === id).forEach(p => t.push({ date: p.date, number: p.ref || 'Payment', type: 'Payment Out', total: settledAmount(p), isDebit: true, src: 'vendorPayments', id: p.id, rec: p }));
  } else if (type === 'Labour') {
    (S.labourSalaries || []).filter(s => s.labourId === id).forEach(s => t.push({ date: s.date, number: 'Month: ' + (s.month || ''), type: 'Wages', total: _n(s.amount), isDebit: false, src: 'labourSalaries', id: s.id }));
    (S.labourPayments || []).filter(p => p.labourId === id).forEach(p => t.push({ date: p.date, number: p.ref || 'Cash / Bank', type: 'Payment Out', total: settledAmount(p), isDebit: true, src: 'labourPayments', id: p.id, rec: p }));
  } else if (type === 'Contractor') {
    (S.workMeasurements || []).filter(m => m.gangId === id && m.approved).forEach(m => {
      const rate = (S.workItemRates || []).find(r => r.id === m.rateId);
      t.push({ date: m.date, number: (rate && rate.workCategory) || 'Work', type: 'Piece-Rate Work', total: _n(rate && rate.rate) * _n(m.quantity), isDebit: false, src: 'workMeasurements', id: m.id });
    });
    (S.expenses || []).filter(e => e.gangId === id && e.category === 'Piece-Rate Gang Payout').forEach(e => t.push({ date: e.date, number: 'Gang payout', type: 'Payment Out', total: settledAmount(e), isDebit: true, src: 'expenses', id: e.id, rec: e }));
    (S.labourAdvances || []).filter(a => a.labourId === id).forEach(a => t.push({ date: a.date, number: 'Advance', type: 'Payment Out', total: _n(a.amount), isDebit: true, src: 'labourAdvances', id: a.id }));
    const wIds = new Set((S.labourMaster || []).filter(w => w.contractorId === id).map(w => w.id));
    const sals = (S.labourSalaries || []).filter(s => wIds.has(s.labourId));
    const wageTot = sals.reduce((s, x) => s + _n(x.amount), 0);
    if (wageTot > 0) t.push({ date: sals.map(s => s.date).filter(Boolean).sort()[0] || '', number: wIds.size + ' worker(s)', type: 'Labour Wages', total: wageTot, isDebit: false, src: '', id: '' });
    (S.labourPayments || []).filter(p => wIds.has(p.labourId)).forEach(p => t.push({ date: p.date, number: p.ref || 'Settlement', type: 'Payment Out', total: settledAmount(p), isDebit: true, src: 'labourPayments', id: p.id, rec: p }));
  }
  t.sort((a, b) => String(a.date || '').localeCompare(String(b.date || '')));
  let run = 0;
  t.forEach(e => {
    run += type === 'Client' ? (e.isDebit ? e.total : -e.total) : (e.isDebit ? -e.total : e.total);
    e.running = run;
  });
  return t;
}

/**
 * Drill-down for the summary cards: the parties on one side ('receivable' or
 * 'payable') with the amount as a positive number, biggest first, optionally
 * narrowed by search text. Returns { rows: [{...row, amount}], total }.
 */
export function balanceList(rows, side, q = '') {
  const list = filterParties((rows || []).filter(r => balanceSide(r) === side), { q })
    .map(r => ({ ...r, amount: Math.round(Math.abs(_n(r.balance)) * 100) / 100 }))
    .sort((a, b) => b.amount - a.amount || String(a.name).localeCompare(String(b.name)));
  return { rows: list, total: Math.round(list.reduce((s, r) => s + r.amount, 0) * 100) / 100 };
}
