/**
 * pieceRateCalc.js — Piece-Rate Labour Billing rules (no DOM, unit-tested).
 *
 * Records (all project-scoped):
 *   workItemRates     Labour Work Order lines — { id, woNo, gangId, boqCode, workCategory, uom, rate,
 *                     scopeQty?, status:'active'|'closed' }. A line without gangId is a generic rate
 *                     any gang can use (the old rate card).
 *   workMeasurements  Daily labour logs — { id, date, gangId, rateId, boqCode, quantity, location,
 *                     src:'dpr'|'manual', dprId?, billId?, approved, paid? (legacy payout) }
 *   labourBills       { id, billNo, gangId, from, to, date, dueDate, status:'draft'|'approved'|'cancelled',
 *                     lines:[{ rateId, boqCode, description, uom, qty, rate, amount, logIds }], gross }
 *   payments to a gang: expenses with category 'Piece-Rate Gang Payout' + gangId (Payments / Petty
 *                     Cash / old payout screen) and gang advances (labourAdvances with labourId = gangId).
 *
 *   rateFor(rates, gangId, boqCode)       the gang's work-order line for a BOQ item (else a generic rate)
 *   priceLogs(logs, rates)                logs saved before a rate existed pick it up now
 *   unbilledLogs(logs, gangId, from, to)  logs not yet on a bill (and not paid by the old payout)
 *   draftBillLines(logs, rates)           logs → one line per work-order line (qty × rate)
 *   billSettlement(bills, S)              approved bills with paid / open / status, gang payments oldest-first
 *   boqLabourReport(o)                    per BOQ item: scope & budget, done, gangs, cost, paid, variance
 */

import { settledAmount } from './deductions.js';

const N = (v) => { const x = parseFloat(v); return Number.isFinite(x) ? x : 0; };
const r2 = (v) => Math.round(N(v) * 100) / 100;
export const GANG_PAYOUT = 'Piece-Rate Gang Payout';

/** The work-order line that prices `boqCode` for `gangId`: the gang's own active line, else a generic one. */
export function rateFor(rates, gangId, boqCode) {
  const live = (rates || []).filter(r => r.status !== 'closed' && (r.boqCode || r.itemCode) === boqCode);
  return live.find(r => r.gangId === gangId) || live.find(r => !r.gangId) || null;
}

/** Fill in the work-order line for logs saved before the gang had a rate for that item. */
export function priceLogs(logs, rates) {
  const ids = new Set((rates || []).map(r => r.id));
  return (logs || []).map(m => (m.rateId && ids.has(m.rateId) ? m : { ...m, rateId: rateFor(rates, m.gangId, m.boqCode)?.id || '' }));
}

/** Logs a gang can still be billed for in a period. */
export function unbilledLogs(logs, gangId, from, to) {
  return (logs || []).filter(m => m.gangId === gangId && !m.billId && !m.paid && N(m.quantity) > 0
    && (!from || m.date >= from) && (!to || m.date <= to));
}

/** Group logs into bill lines (one per work-order line), oldest work first. */
export function draftBillLines(logs, rates) {
  const by = {};
  (logs || []).forEach(m => {
    const r = (rates || []).find(x => x.id === m.rateId);
    if (!r) return;
    const k = r.id;
    if (!by[k]) by[k] = { rateId: r.id, boqCode: r.boqCode || r.itemCode || '', description: r.workCategory || r.boqCode || 'Work', uom: r.uom || '', rate: N(r.rate), qty: 0, logIds: [] };
    by[k].qty += N(m.quantity); by[k].logIds.push(m.id);
  });
  return Object.values(by).map(l => ({ ...l, qty: r2(l.qty), amount: r2(l.qty * l.rate) }));
}

/** Money paid to a gang: payout expenses (not tied to the legacy measurement payout) + open advances. */
export function gangPayments(S, gangId) {
  const exp = (S.expenses || []).filter(e => e.gangId === gangId && e.category === GANG_PAYOUT && !e.payoutId)
    .map(e => ({ amount: settledAmount(e), ref: e.ref || '', date: e.date }));
  const adv = (S.labourAdvances || []).filter(a => a.labourId === gangId && !a.settled).map(a => ({ amount: N(a.amount), ref: '', date: a.date }));
  return [...exp, ...adv];
}

/**
 * Approved bills with what's been paid. A payment whose reference is a bill number clears that
 * bill first; the rest pays the gang's oldest bills first.
 * @returns {Array<bill & { paid, open, state:'unpaid'|'part'|'paid' }>}
 */
export function billSettlement(bills, S) {
  const out = [];
  const byGang = {};
  (bills || []).filter(b => b.status === 'approved').forEach(b => { (byGang[b.gangId] = byGang[b.gangId] || []).push(b); });
  Object.entries(byGang).forEach(([gid, list]) => {
    const left = {}; list.forEach(b => { left[b.id] = N(b.gross); });
    let pool = 0;
    gangPayments(S, gid).forEach(p => {
      let a = p.amount;
      const hit = p.ref && list.find(b => b.billNo && p.ref.includes(b.billNo));
      if (hit && left[hit.id] > 0) { const t = Math.min(a, left[hit.id]); left[hit.id] -= t; a -= t; }
      pool += a;
    });
    list.slice().sort((a, b) => String(a.date).localeCompare(String(b.date)) || String(a.billNo).localeCompare(String(b.billNo))).forEach(b => {
      const t = Math.min(pool, left[b.id]); pool -= t; left[b.id] -= t;
      const open = r2(left[b.id]), paid = r2(N(b.gross) - open);
      out.push({ ...b, paid, open, state: open <= 0.004 ? 'paid' : paid > 0 ? 'part' : 'unpaid' });
    });
  });
  return out;
}

/**
 * BOQ Labour Cost Analysis — one row per BOQ item that has scope, a work order or labour logs.
 * @param {{ boq:Array<{code,description,uom,qty,rate}>, rates, logs, bills, S,
 *           budget?:Object<string,number>, measured?:Object<string,number>, gangName?:(id)=>string }} o
 *   budget    labour budget rate per unit, by BOQ code (the estimator's allowance)
 *   measured  total measured quantity per BOQ code (all measurement sheets, tagged or not)
 */
export function boqLabourReport(o) {
  const settled = {}; billSettlement(o.bills, o.S).forEach(b => { settled[b.id] = b; });
  const rateById = {}; (o.rates || []).forEach(r => { rateById[r.id] = r; });
  const rows = {};
  const row = (code, it = {}) => (rows[code] = rows[code] || {
    code, description: it.description || code, uom: it.uom || '', boqQty: N(it.qty), boqRate: N(it.rate),
    boqValue: r2(N(it.qty) * N(it.rate)), budgetRate: N(o.budget?.[code]), measured: N(o.measured?.[code]),
    done: 0, cost: 0, billed: 0, paid: 0, gangs: {},
  });
  (o.boq || []).forEach(it => row(it.code, it));
  (o.rates || []).forEach(r => { const c = r.boqCode || r.itemCode; if (c) { const x = row(c, { description: r.workCategory, uom: r.uom }); if (r.gangId) x.gangs[r.gangId] = x.gangs[r.gangId] || { qty: 0, cost: 0, rate: N(r.rate) }; } });
  (o.logs || []).forEach(m => {
    const r = rateById[m.rateId]; const c = m.boqCode || r?.boqCode || r?.itemCode; if (!c) return;
    const x = row(c, { description: r?.workCategory, uom: r?.uom });
    const cost = N(m.quantity) * N(r?.rate);
    x.done += N(m.quantity); x.cost += cost;
    const g = x.gangs[m.gangId] = x.gangs[m.gangId] || { qty: 0, cost: 0, rate: N(r?.rate) };
    g.qty += N(m.quantity); g.cost += cost;
  });
  // billed + paid: an approved bill's payments spread over its lines by amount
  (o.bills || []).filter(b => b.status === 'approved').forEach(b => {
    const s = settled[b.id], share = N(b.gross) > 0 ? N(s?.paid) / N(b.gross) : 0;
    (b.lines || []).forEach(l => { const x = row(l.boqCode, { description: l.description, uom: l.uom }); x.billed += N(l.amount); x.paid += N(l.amount) * share; });
  });
  return Object.values(rows).filter(x => x.boqQty > 0 || x.done > 0 || Object.keys(x.gangs).length).map(x => {
    const budgetDone = x.budgetRate > 0 ? x.budgetRate * x.done : null;
    return {
      ...x, done: r2(x.done), cost: r2(x.cost), billed: r2(x.billed), paid: r2(x.paid),
      budget: x.budgetRate > 0 ? r2(x.budgetRate * x.boqQty) : null,
      budgetDone: budgetDone == null ? null : r2(budgetDone),
      variance: budgetDone == null ? null : r2(budgetDone - x.cost),            // + = labour came in under budget
      avgRate: x.done > 0 ? r2(x.cost / x.done) : 0,
      pctDone: x.boqQty > 0 ? Math.min(999, Math.round(x.done / x.boqQty * 100)) : null,
      untagged: x.measured > x.done ? r2(x.measured - x.done) : 0,           // measured but no gang tagged
      gangs: Object.entries(x.gangs).map(([id, g]) => ({ id, name: o.gangName ? o.gangName(id) : id, qty: r2(g.qty), cost: r2(g.cost), rate: g.rate })),
    };
  }).sort((a, b) => String(a.code).localeCompare(String(b.code), undefined, { numeric: true }));
}

/** Report totals. Variance only sums items that have a labour budget. */
export function reportTotals(rows) {
  const t = { boqValue: 0, budget: 0, cost: 0, billed: 0, paid: 0, variance: 0, budgetDone: 0, unbudgeted: 0 };
  rows.forEach(r => {
    t.boqValue += r.boqValue; t.cost += r.cost; t.billed += r.billed; t.paid += r.paid;
    if (r.budget != null) { t.budget += r.budget; t.budgetDone += r.budgetDone; t.variance += r.variance; } else if (r.cost > 0) t.unbudgeted++;
  });
  Object.keys(t).forEach(k => { if (k !== 'unbudgeted') t[k] = r2(t[k]); });
  return t;
}
