/**
 * cashForecast.js — the executive cash-flow engine (no DOM, unit-tested).
 *
 * One question: will there be enough cash next week and next month?
 * Only formal, approved documents move the forecast:
 *
 *   MONEY IN   sale invoices + RA tax invoices (net of retention / TDS — those stay with the client)
 *              retention release bills once raised; retention still held is "locked future cash",
 *              summarised separately and never in the 30-day buckets (billingRules.lockedRetention)
 *              due = invoice due date, else invoice date + client terms
 *   MONEY OUT  purchase bills ........ due date, else vendor terms (bill or GRN date, or weekly)
 *              subcontractor certificates (unpaid SPCs) .. certificate date + default terms
 *              labour bills (piece-rate, approved) ....... due date (the pay day after approval)
 *              payroll ............... one total per pay day: wages earned and still unpaid
 *                                      (attendance, cleared by wage payments) + the weekly
 *                                      run-rate for days not yet worked
 *
 * Drafts, cancelled, void and rejected documents are ignored. Receipts and payments
 * clear the document they name (billId / invoiceId) first, then the party's oldest
 * documents (FIFO) — so recording a payment removes it from the projection at once.
 * Anything already overdue lands on today. A bill the owner chose to delay moves to
 * its `payOn` date.
 *
 *   forecastItems(S, o)            → dated in / out items
 *   bucketize(items, o)            → 7-day or 30-day buckets: start · in · out · end
 *   forecastSummary(buckets)       → lowest point + first shortfall
 */

import { billSettlement } from './pieceRateCalc.js?v=1.0.0';
import { cashShare } from './billingRules.js?v=1.0.0';

const N = (v) => { const x = parseFloat(v); return Number.isFinite(x) ? x : 0; };
const r2 = (v) => Math.round(N(v) * 100) / 100;

export function addDays(iso, n) {
  const d = new Date(String(iso).slice(0, 10) + 'T00:00:00Z');
  if (isNaN(d)) return '';
  d.setUTCDate(d.getUTCDate() + Math.round(N(n)));
  return d.toISOString().slice(0, 10);
}
export const dueDate = (base, days) => (base ? addDays(base, days) : '');
const weekday = (iso) => new Date(iso + 'T00:00:00Z').getUTCDay();

/** Common credit terms offered when a party is created. */
export const TERM_PRESETS = [0, 7, 15, 30, 45, 60];
export const termsLabel = (days) => (days == null || days === '' ? '—' : +days === 0 ? 'Immediate' : `Net ${+days}`);

/** Draft / cancelled / void / rejected documents never reach the forecast. */
export const isLive = (d) => !!d && !d.isDraft && !d.deleted && !/draft|cancel|void|reject/i.test(String(d.status || ''));

/**
 * Open (unpaid) part of each doc. A payment naming a doc clears that doc first;
 * the rest pays the oldest docs first.
 * @param {Array<{id,date,total}>} docs
 * @param {Array<{amount, ref?:string}>|number} paid  payments ({amount, ref}) or a plain total
 */
export function openAmounts(docs, paid) {
  const left = {}; docs.forEach(d => { left[d.id] = N(d.total); });
  let pool = 0;
  (Array.isArray(paid) ? paid : [{ amount: paid }]).forEach(p => {
    let a = N(p.amount);
    if (p.ref && left[p.ref] > 0) { const t = Math.min(a, left[p.ref]); left[p.ref] -= t; a -= t; }
    pool += a;
  });
  return [...docs].sort((a, b) => String(a.date || '').localeCompare(String(b.date || '')))
    .map(d => { const t = Math.min(pool, left[d.id]); pool -= t; return { ...d, open: r2(left[d.id] - t) }; })
    .filter(d => d.open > 0.004);
}

/** Attendance day → wage, same rule as the muster: half day = ½, OT at 1.5× of rate/8. */
export function dayWage(rate, status, ot) {
  const r = N(rate), f = status === 'P' ? 1 : status === 'H' ? 0.5 : 0;
  return r2(f * r + N(ot) * (r / 8) * 1.5);
}
/** The pay day on or after a date (weekday 0–6). */
export function nextPayDay(iso, payDay) { const gap = (N(payDay) - weekday(iso) + 7) % 7; return addDays(iso, gap); }

/** Average weekly wage bill from the last 14 days of attendance (the run-rate for weeks not yet worked). */
export function wageRunRate(S, today) {
  const from = addDays(today, -14), rate = {};
  (S.labourMaster || []).forEach(l => { rate[l.id] = N(l.dayRate); });
  const tot = (S.attendanceLogs || []).filter(a => a.date > from && a.date <= today).reduce((s, a) => s + dayWage(rate[a.labourId], a.status, a.ot), 0);
  return r2(tot / 2);
}

/**
 * Every pending formal movement, dated.
 * @param {object} S  app state
 * @param {{ today:string, defaultTermsDays?:number, payDay?:number, weeklyPayroll?:number|'',
 *           payOn?:Object<string,string>, settled?:(p)=>number }} o
 * @returns {Array<{ key, dir:'in'|'out', src:'sale'|'ra'|'bill'|'subcon'|'labour'|'payroll', party, ref,
 *                   docDate, due, date, amount, overdue, moved, detail? }>}
 */
export function forecastItems(S, o) {
  const today = o.today, defDays = o.defaultTermsDays ?? 30, payDay = o.payDay ?? 6;
  const paidOf = o.settled || (p => N(p.amount));
  const payOn = o.payOn || {};
  const out = [];
  const add = (it) => {
    if (!(it.amount > 0.004) || !it.due) return;
    const moved = payOn[it.key] && payOn[it.key] > it.due ? payOn[it.key] : '';
    const date = moved || it.due;
    out.push({ ...it, amount: r2(it.amount), moved, overdue: date < today, date: date < today ? today : date });
  };
  const byId = (list, id) => (list || []).find(x => x.id === id) || {};
  const has = v => v != null && v !== '';
  const cDays = c => (has(c.paymentTermsDays) ? N(c.paymentTermsDays) : defDays);
  const vDue = (v, basis) => (v.termsType === 'weekly' ? nextPayDay(basis, v.payWeekday ?? 6) : dueDate(basis, has(v.paymentTermsDays) ? N(v.paymentTermsDays) : defDays));
  const group = (list, key) => list.reduce((m, x) => { (m[x[key] || ''] = m[x[key] || ''] || []).push(x); return m; }, {});

  // ── MONEY IN: sale invoices + RA tax invoices, against the client's receipts ──
  const invs = [
    // Sale invoices: the client keeps TDS + retention, so only the cash share of what is open comes in.
    ...(S.saleInvoices || []).filter(isLive).map(i => ({ id: i.id, src: 'sale', clientId: i.clientId, date: i.date, dueDate: i.dueDate, total: N(i.total) || N(i.totalAmount), ref: i.invoiceNo || i.invNo || i.number || 'Invoice', share: cashShare(i).cash })),
    // Retention release bills: retention comes back only once you raise the release bill.
    ...(S.retentionBills || []).filter(isLive).map(b => ({ id: b.id, src: 'retention', clientId: b.clientId, date: b.date, dueDate: b.dueDate, total: N(b.amount), ref: b.billNo || 'Retention release' })),
    ...(S.invoices || []).filter(isLive).map(i => ({ id: i.id, src: 'ra', clientId: i.clientId, date: i.date, dueDate: i.dueDate, total: N(i.netPayable) || N(i.totalAmount), ref: i.invoiceNum || i.invoiceNo || 'RA invoice' })),
  ].filter(i => i.total > 0);
  const receipts = group((S.paymentsIn || []).map(p => ({ clientId: p.clientId, amount: paidOf(p), ref: p.againstBillId || p.invoiceId || p.billId })), 'clientId');
  Object.entries(group(invs, 'clientId')).forEach(([cid, list]) => {
    const c = byId(S.clients, cid);
    openAmounts(list, receipts[cid] || []).forEach(i => add({
      key: 'inv:' + i.id, dir: 'in', src: i.src, party: c.name || 'Client', ref: i.ref,
      docDate: i.date, due: i.dueDate || dueDate(i.date, cDays(c)), amount: i.share != null ? i.open * i.share : i.open,
    }));
  });

  // ── MONEY OUT: purchase bills, against the vendor's payments ──
  const grnDate = id => (S.grnRecords || []).find(g => g.id === id)?.date;
  const bills = (S.vendorMaterials || []).filter(isLive).map(b => ({
    id: b.id, vendorId: b.vendorId, date: b.date, dueDate: b.dueDate, total: N(b.totalAmount) || N(b.amount),
    ref: b.billNo ? 'Bill ' + b.billNo : 'Purchase bill',
    grn: (b.items || []).map(it => it.grnId && grnDate(it.grnId)).filter(Boolean).sort()[0] || b.grnDate,
  })).filter(b => b.total > 0);
  const vpay = group((S.vendorPayments || []).map(p => ({ vendorId: p.vendorId, amount: paidOf(p), ref: p.billId })), 'vendorId');
  Object.entries(group(bills, 'vendorId')).forEach(([vid, list]) => {
    const v = byId(S.vendors, vid);
    openAmounts(list, vpay[vid] || []).forEach(b => add({
      key: 'bill:' + b.id, dir: 'out', src: 'bill', party: v.name || 'Supplier', ref: b.ref, docDate: b.date,
      due: b.dueDate || vDue(v, v.termsBasis === 'delivery' && b.grn ? b.grn : b.date), amount: b.open,
    }));
  });

  // ── MONEY OUT: subcontractor certificates not yet paid ──
  (S.subPayments || []).filter(p => isLive(p) && !p.paid && N(p.net) > 0).forEach(p => {
    const sc = byId(S.subcontracts, p.subcontractId);
    add({ key: 'sub:' + p.id, dir: 'out', src: 'subcon', party: sc.name || 'Subcontractor', ref: p.no || 'Certificate',
      docDate: p.date, due: dueDate(p.date, defDays), amount: N(p.net) });
  });

  // ── MONEY OUT: approved piece-rate labour bills, less what the gang has been paid ──
  billSettlement(S.labourBills || [], S).forEach(b => add({
    key: 'lbill:' + b.id, dir: 'out', src: 'labour', party: byId(S.labourContractors, b.gangId).name || 'Labour group',
    ref: b.billNo || 'Labour bill', docDate: b.date, due: b.dueDate || nextPayDay(b.date, payDay), amount: b.open,
  }));

  // ── MONEY OUT: payroll, one total per pay day ──
  const rate = {}; (S.labourMaster || []).forEach(l => { rate[l.id] = N(l.dayRate); });
  const owed = {};
  (S.attendanceLogs || []).forEach(a => {
    const w = dayWage(rate[a.labourId], a.status, a.ot);
    if (w > 0 && a.date <= today) (owed[a.labourId] = owed[a.labourId] || []).push({ id: a.id || a.date + a.labourId, date: a.date, total: w });
  });
  (S.labourSalaries || []).forEach((s, i) => { if (N(s.amount) > 0) (owed[s.labourId] = owed[s.labourId] || []).push({ id: s.id || 'sal' + i, date: s.date || today, total: N(s.amount), salary: true }); });
  const cleared = {};
  ['labourPayments', 'labourAdvances', 'labourDeductions'].forEach(k => (S[k] || []).forEach(p => {
    cleared[p.labourId] = (cleared[p.labourId] || 0) + (k === 'labourPayments' ? paidOf(p) : N(p.amount));
  }));
  const run = {};   // pay day → { earned, projected, overdue, workers }; missed pay days roll into today
  const slot = d => (run[d < today ? today : d] = run[d < today ? today : d] || { earned: 0, projected: 0, overdue: 0, workers: new Set() });
  Object.entries(owed).forEach(([lid, list]) => openAmounts(list, cleared[lid] || 0).forEach(d => {
    const pd = d.salary ? d.date : nextPayDay(d.date, payDay), r = slot(pd);
    r.earned += d.open; if (pd < today) r.overdue += d.open; r.workers.add(lid);
  }));
  const weekly = has(o.weeklyPayroll) ? N(o.weeklyPayroll) : wageRunRate(S, today);
  if (weekly > 0) for (let i = 1; i <= (o.horizonDays ?? 120); i++) slot(nextPayDay(addDays(today, i), payDay)).projected += weekly / 7;
  Object.entries(run).forEach(([d, r]) => add({
    key: 'payroll:' + d, dir: 'out', src: 'payroll', party: 'Payroll', due: d, docDate: d,
    ref: r.workers.size ? `${r.workers.size} worker${r.workers.size === 1 ? '' : 's'}` : 'Projected',
    amount: r.earned + r.projected, detail: { earned: r2(r.earned), projected: r2(r.projected), overdue: r2(r.overdue) },
  }));

  return out.sort((a, b) => a.date.localeCompare(b.date) || (a.dir === b.dir ? b.amount - a.amount : a.dir === 'in' ? -1 : 1));
}

/** Timeline views: This Week · Next 4 Weeks · Next 3 Months (rolling 7- and 30-day buckets). */
export const VIEWS = {
  week: { size: 7, count: 1, label: 'This Week' },
  '4w': { size: 7, count: 4, label: 'Next 4 Weeks' },
  '3m': { size: 30, count: 3, label: 'Next 3 Months' },
};

const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const shortDate = (iso) => `${+iso.slice(8, 10)} ${MON[+iso.slice(5, 7) - 1]}`;

/**
 * Chronological buckets from today. Cash rolls forward: each bucket starts where the last ended.
 * @param {Array} items from forecastItems
 * @param {{ today, size:7|30, count, openingCash }} o
 */
export function bucketize(items, o) {
  const out = [];
  let cash = r2(o.openingCash);
  for (let i = 0; i < o.count; i++) {
    const start = addDays(o.today, i * o.size), end = addDays(start, o.size - 1);
    const mine = items.filter(e => e.date >= start && e.date <= end);
    const inn = mine.filter(e => e.dir === 'in'), outs = mine.filter(e => e.dir === 'out');
    const inA = r2(inn.reduce((s, e) => s + e.amount, 0)), outA = r2(outs.reduce((s, e) => s + e.amount, 0));
    const startCash = cash;
    cash = r2(cash + inA - outA);
    out.push({
      key: start, n: i + 1, start, end,
      name: o.size === 7 ? `Week ${i + 1}` : i === 0 ? 'Next 30 days' : `Days ${i * 30 + 1}–${(i + 1) * 30}`,
      range: `${shortDate(start)} – ${shortDate(end)}`,
      startCash, in: inA, out: outA, endCash: cash, short: cash < 0, inItems: inn, outItems: outs,
    });
  }
  return out;
}

/** Lowest projected cash and the first bucket that ends below zero. */
export function forecastSummary(buckets) {
  if (!buckets.length) return { lowest: 0, lowestAt: null, shortfall: null };
  const low = buckets.reduce((m, b) => (b.endCash < m.endCash ? b : m), buckets[0]);
  return { lowest: low.endCash, lowestAt: low, shortfall: buckets.find(b => b.short) || null };
}
