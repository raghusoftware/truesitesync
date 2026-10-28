/**
 * cashForecast.js — Predictive working cash flow (no DOM, unit-tested).
 *
 *   buildForecast(S, opt)  → every expected money movement, dated:
 *       OUT  unpaid purchase bills ........ due date, else vendor terms from bill / GRN date
 *            received-but-unbilled GRNs ... vendor terms from the GRN date
 *            labour ....................... wages due now + weekly wage bill + gang advances, on pay day
 *            loan EMIs, recurring costs (rent, equipment hire, utilities), owner commitments
 *       IN   unpaid sale / RA tax invoices . due date, else client terms; + a late-payment buffer
 *            RA bills not yet invoiced .... "expected" (client terms + buffer from today)
 *            owner commitments
 *     Bills and invoices are settled oldest-first against the party's payments (FIFO),
 *     so only the still-open part of each one is forecast. Anything already overdue
 *     lands on today.
 *   bucketize(events, opt) → weekly (7-day) or monthly buckets with start cash,
 *     in, out, end cash and a crunch flag (end < 0, or < reserve).
 *   dueDate(base, days) / termsLabel(days)
 */

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

/** Open (unpaid) part of each doc, paying the oldest first. */
export function fifoOpen(docs, paid) {
  let pool = N(paid);
  return [...docs].sort((a, b) => String(a.date || '').localeCompare(String(b.date || '')))
    .map(d => { const take = Math.min(pool, d.total); pool -= take; return { ...d, open: r2(d.total - take) }; })
    .filter(d => d.open > 0.004);
}

/**
 * @param {object} S  data: vendors, clients, vendorMaterials, vendorPayments, grnRecords,
 *                    saleInvoices, invoices, paymentsIn, abstracts, labourContractors,
 *                    accounts, recurring, commitments
 * @param {object} o  today, horizonDays, bufferDays, defaultTermsDays, includeExpected,
 *                    labourPayDay (0–6), weeklyWages, labourDueNow, settled(rec)→amount
 */
export function buildForecast(S, o = {}) {
  const today = o.today;
  const end = addDays(today, o.horizonDays ?? 91);
  const buffer = Math.max(0, N(o.bufferDays));
  const defDays = o.defaultTermsDays ?? 30;
  const paidOf = o.settled || (p => N(p.amount));
  const ev = [];
  const push = (date, dir, amount, kind, label, sure = true) => {
    const a = r2(amount); if (!(a > 0) || !date) return;
    const overdue = date < today;
    const d = overdue ? today : date;
    if (d > end) return;
    ev.push({ date: d, dir, amount: a, kind, label, sure, overdue });
  };
  const vendor = id => (S.vendors || []).find(v => v.id === id) || {};
  const client = id => (S.clients || []).find(c => c.id === id) || {};
  const vDays = v => (v.paymentTermsDays != null && v.paymentTermsDays !== '' ? N(v.paymentTermsDays) : defDays);
  const cDays = c => (c.paymentTermsDays != null && c.paymentTermsDays !== '' ? N(c.paymentTermsDays) : defDays);

  // ── OUT: purchase bills (FIFO against vendor payments) ──
  const bills = {};
  (S.vendorMaterials || []).forEach(b => { const t = N(b.totalAmount) || N(b.amount); if (t > 0) (bills[b.vendorId] = bills[b.vendorId] || []).push({ ...b, total: t }); });
  Object.entries(bills).forEach(([vid, list]) => {
    const v = vendor(vid);
    const paid = (S.vendorPayments || []).filter(p => p.vendorId === vid).reduce((s, p) => s + paidOf(p), 0);
    fifoOpen(list, paid).forEach(b => {
      const basis = v.termsBasis === 'delivery' && b.grnDate ? b.grnDate : b.date;
      push(b.dueDate || dueDate(basis, vDays(v)), 'out', b.open, 'bill', `${v.name || 'Vendor'} · bill ${b.billNo || ''}`.trim());
    });
  });
  // ── OUT: material received but not yet billed (the bill will follow) ──
  (S.grnRecords || []).forEach(g => {
    if (g.billed || g.billedByBillId || g.refBillId || g.source === 'purchase') return;
    if (g.sourceType && g.sourceType !== 'Supplier') return;
    const v = vendor(g.supplierId);
    push(dueDate(g.date, vDays(v)), 'out', N(g.amount) || N(g.qty) * N(g.rate), 'grn', `${v.name || 'Supplier'} · ${g.grnNo || 'GRN'} (unbilled)`, true);
  });
  // ── OUT: labour on pay day ──
  const payDay = o.labourPayDay ?? 6;
  let first = true;
  for (let i = 0; i <= (o.horizonDays ?? 91); i++) {
    const d = addDays(today, i);
    const wd = weekday(d);
    if (wd === payDay) {
      if (first && N(o.labourDueNow) > 0) push(d, 'out', o.labourDueNow, 'labour', 'Labour wages due');
      if (N(o.weeklyWages) > 0) push(d, 'out', o.weeklyWages, 'labour', 'Weekly wage bill', true);
      first = false;
    }
    (S.labourContractors || []).forEach(c => {
      if (N(c.weeklyAdvance) > 0 && wd === (c.weeklyAdvanceDay != null ? N(c.weeklyAdvanceDay) : payDay)) push(d, 'out', c.weeklyAdvance, 'labour', `${c.name || 'Gang'} — weekly advance`);
    });
    // ── recurring costs + loan EMIs ──
    (S.recurring || []).forEach(r => {
      const hit = r.freq === 'weekly' ? wd === N(r.day) : _monthDayHit(d, N(r.day) || 1);
      if (hit) push(d, r.dir === 'in' ? 'in' : 'out', r.amount, 'recurring', r.name || 'Recurring');
    });
    (S.accounts || []).filter(a => a.type === 'Loan' && N(a.emi) > 0).forEach(a => {
      if (_monthDayHit(d, N(a.emiDay) || 1)) push(d, 'out', a.emi, 'emi', `EMI · ${a.name || 'Loan'}`);
    });
  }
  // ── IN: invoices (FIFO against client receipts), + late-payment buffer ──
  const invs = {};
  (S.saleInvoices || []).forEach(i => { if (i.status !== 'Cancelled') (invs[i.clientId] = invs[i.clientId] || []).push({ ...i, total: N(i.total) }); });
  (S.invoices || []).forEach(i => { if (i.status !== 'Cancelled') (invs[i.clientId] = invs[i.clientId] || []).push({ ...i, total: N(i.totalAmount || i.total) }); });
  Object.entries(invs).forEach(([cid, list]) => {
    const c = client(cid);
    const paid = (S.paymentsIn || []).filter(p => p.clientId === cid).reduce((s, p) => s + paidOf(p), 0);
    fifoOpen(list.filter(x => x.total > 0), paid).forEach(i => {
      const due = i.dueDate || dueDate(i.date, cDays(c));
      push(due < today ? due : addDays(due, buffer), 'in', i.open, 'invoice', `${c.name || 'Client'} · ${i.invoiceNo || i.invNo || i.number || 'invoice'}`);
    });
  });
  // ── IN (expected): RA bills / abstracts not yet invoiced ──
  if (o.includeExpected !== false) {
    (S.abstracts || []).forEach(a => {
      if (a.isInvoiced || a.status === 'invoiced') return;
      const amt = N(a.totalAmount) || (a.items || []).reduce((s, it) => s + (N(it.amount) || N(it.totalQty || it.qty) * N(it.rate)), 0);
      const c = client(a.clientId);
      const billOn = a.date && a.date > today ? a.date : today;
      push(addDays(billOn, cDays(c) + buffer), 'in', amt, 'ra', `${c.name || 'Client'} · ${a.abstractNum || 'RA bill'} (to invoice)`, false);
    });
  }
  // ── owner commitments (pipeline the books don't know yet) ──
  (S.commitments || []).forEach(c => {
    if (c.date && c.date < today) return;
    if (c.type !== 'out' && c.confidence !== 'confirmed' && o.includeExpected === false) return;
    push(c.date, c.type === 'out' ? 'out' : 'in', c.amount, 'commitment', c.label || 'Commitment', c.confidence === 'confirmed' || c.type === 'out');
  });
  return ev.sort((a, b) => a.date.localeCompare(b.date) || (a.dir === b.dir ? 0 : a.dir === 'in' ? -1 : 1));
}
/** Day N of the month — or the month's last day when it's shorter (31st → 30 Nov, 28/29 Feb). */
function _monthDayHit(iso, day) {
  const last = +new Date(Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7), 0)).toISOString().slice(8, 10);
  return +iso.slice(8, 10) === Math.min(Math.max(1, day), last);
}

const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const short = (iso) => `${+iso.slice(8, 10)} ${MON[+iso.slice(5, 7) - 1]}`;

/**
 * @param {Array} events from buildForecast
 * @param {{ today, mode:'week'|'month', count, openingCash, reserve }} o
 */
export function bucketize(events, o) {
  const out = [];
  let cash = r2(o.openingCash);
  for (let i = 0; i < (o.count || 13); i++) {
    let start, endD, label;
    if (o.mode === 'month') {
      const y = +o.today.slice(0, 4), m = +o.today.slice(5, 7) - 1 + i;
      const first = new Date(Date.UTC(y, m, 1)).toISOString().slice(0, 10);
      start = i === 0 ? o.today : first;
      endD = new Date(Date.UTC(y, m + 1, 0)).toISOString().slice(0, 10);
      label = `${MON[+first.slice(5, 7) - 1]} ${first.slice(0, 4)}`;
    } else {
      start = addDays(o.today, i * 7); endD = addDays(start, 6);
      label = i === 0 ? 'This week' : start.slice(5, 7) === endD.slice(5, 7) ? `${+start.slice(8, 10)}–${short(endD)}` : `${short(start)} – ${short(endD)}`;
    }
    const items = events.filter(e => e.date >= start && e.date <= endD);
    const inSure = r2(items.filter(e => e.dir === 'in' && e.sure).reduce((s, e) => s + e.amount, 0));
    const inExp = r2(items.filter(e => e.dir === 'in' && !e.sure).reduce((s, e) => s + e.amount, 0));
    const outA = r2(items.filter(e => e.dir === 'out').reduce((s, e) => s + e.amount, 0));
    const startCash = cash;
    cash = r2(cash + inSure + inExp - outA);
    out.push({ key: start, label, start, end: endD, startCash, in: r2(inSure + inExp), inSure, inExpected: inExp, out: outA, endCash: cash,
      crunch: cash < 0 ? 'negative' : (N(o.reserve) > 0 && cash < N(o.reserve) ? 'low' : ''), items });
  }
  return out;
}

/** Headline numbers for the dashboard. */
export function forecastSummary(buckets) {
  if (!buckets.length) return { lowest: 0, lowestAt: null, firstCrunch: null, totalIn: 0, totalOut: 0 };
  let low = buckets[0];
  buckets.forEach(b => { if (b.endCash < low.endCash) low = b; });
  return {
    lowest: low.endCash, lowestAt: low.label,
    firstCrunch: buckets.find(b => b.crunch === 'negative') || null,
    firstLow: buckets.find(b => b.crunch) || null,
    totalIn: r2(buckets.reduce((s, b) => s + b.in, 0)), totalOut: r2(buckets.reduce((s, b) => s + b.out, 0)),
  };
}
