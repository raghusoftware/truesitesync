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

/** Attendance day → wage, same rule as the muster: half day = ½, OT at 1.5× of rate/8. */
export function dayWage(rate, status, ot) {
  const r = N(rate), f = status === 'P' ? 1 : status === 'H' ? 0.5 : 0;
  return r2(f * r + N(ot) * (r / 8) * 1.5);
}
/** The pay day on or after a date (weekday 0–6). */
export function nextPayDay(iso, payDay) { const gap = (N(payDay) - weekday(iso) + 7) % 7; return addDays(iso, gap); }
const _OFF_HIRE = /returned|released|off.?hire|inactive|sold/i;

/** Average weekly wage bill from the last 14 days of attendance (the run-rate for weeks not yet worked). */
export function wageRunRate(S, today) {
  const from = addDays(today, -14), rate = {};
  (S.labourMaster || []).forEach(l => { rate[l.id] = N(l.dayRate); });
  const tot = (S.attendanceLogs || []).filter(a => a.date > from && a.date <= today).reduce((s, a) => s + dayWage(rate[a.labourId], a.status, a.ot), 0);
  return r2(tot / 2);
}

/** Rent a hired machine has earned per month from its runbook (same rules as the rent statement). */
export function rentByMonth(eq, logs) {
  const runs = (logs || []).filter(l => l.assetId === eq.id && l.type === 'Runbook' && l.date);
  const by = {};
  runs.forEach(l => { const m = l.date.slice(0, 7); (by[m] = by[m] || { hours: 0, days: 0 }); by[m].hours += N(l.hours); by[m].days += 1; });
  return Object.entries(by).map(([m, u]) => ({ month: m, amount: r2(eq.rentBasis === 'hourly' ? u.hours * N(eq.rentRate) : eq.rentBasis === 'daily' ? u.days * N(eq.rentRate) : N(eq.rentRate)) }));
}

/**
 * @param {object} S  data: vendors, clients, vendorMaterials, vendorPayments, grnRecords, saleInvoices,
 *                    invoices, paymentsIn, abstracts, projects, labourMaster, attendanceLogs, labourSalaries,
 *                    labourPayments, labourAdvances, labourDeductions, labourContractors, equipmentList,
 *                    equipmentLogs, fuelTxns, expenses, accounts, recurring, commitments
 * @param {object} o  today, horizonDays, bufferDays, defaultTermsDays, includeExpected, labourPayDay (0–6),
 *                    weeklyWages (override of the attendance run-rate), fuelTermsDays, settled(rec)→amount
 */
export function buildForecast(S, o = {}) {
  const today = o.today;
  const horizon = o.horizonDays ?? 91;
  const end = addDays(today, horizon);
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
  /** Vendor terms: 'weekly' → their next pay weekday; otherwise Net days from the basis date. */
  const vDue = (v, basis) => (v.termsType === 'weekly' ? nextPayDay(basis, v.payWeekday ?? 6) : dueDate(basis, vDays(v)));
  const payDay = o.labourPayDay ?? 6;

  // ── OUT: vendor obligations = purchase bills + machine hire rent, paid oldest-first ──
  const docs = {};
  const addDoc = (vid, d) => { (docs[vid] = docs[vid] || []).push(d); };
  (S.vendorMaterials || []).forEach(b => { const t = N(b.totalAmount) || N(b.amount); if (t > 0) addDoc(b.vendorId, { ...b, total: t, kind: 'bill' }); });
  (S.equipmentList || []).forEach(eq => {
    if (eq.ownership !== 'RENTED' || !eq.vendorId || !(N(eq.rentRate) > 0)) return;
    rentByMonth(eq, S.equipmentLogs).forEach(r => {
      const monthEnd = new Date(Date.UTC(+r.month.slice(0, 4), +r.month.slice(5, 7), 0)).toISOString().slice(0, 10);
      // The hire bill comes at month end (this month's rent so far is billed at this month's end).
      addDoc(eq.vendorId, { kind: 'rent', date: monthEnd, total: r.amount, billNo: `${eq.name || 'Machine'} hire ${r.month}` });
    });
  });
  Object.entries(docs).forEach(([vid, list]) => {
    const v = vendor(vid);
    const paid = (S.vendorPayments || []).filter(p => p.vendorId === vid).reduce((s, p) => s + paidOf(p), 0);
    fifoOpen(list, paid).forEach(b => {
      const basis = v.termsBasis === 'delivery' && b.grnDate ? b.grnDate : b.date;
      push(b.dueDate || vDue(v, basis), 'out', b.open, b.kind === 'rent' ? 'equipment' : 'bill',
        b.kind === 'rent' ? `${v.name || 'Hire vendor'} · ${b.billNo}` : `${v.name || 'Vendor'} · bill ${b.billNo || ''}`.trim());
    });
  });
  // ── OUT: hire for the months ahead at each active machine's last-30-day rate ──
  (S.equipmentList || []).forEach(eq => {
    if (eq.ownership !== 'RENTED' || !eq.vendorId || !(N(eq.rentRate) > 0) || _OFF_HIRE.test(eq.status || '')) return;
    const v = vendor(eq.vendorId);
    const from = addDays(today, -30);
    const recent = (S.equipmentLogs || []).filter(l => l.assetId === eq.id && l.type === 'Runbook' && l.date > from && l.date <= today);
    const monthly = eq.rentBasis === 'hourly' ? recent.reduce((s, l) => s + N(l.hours), 0) * N(eq.rentRate)
      : eq.rentBasis === 'daily' ? recent.length * N(eq.rentRate) : N(eq.rentRate);
    if (!(monthly > 0)) return;
    for (let m = 0; m <= Math.ceil(horizon / 30) + 1; m++) {
      const y = +today.slice(0, 4), mo = +today.slice(5, 7) - 1 + m;
      const monthEnd = new Date(Date.UTC(y, mo + 1, 0)).toISOString().slice(0, 10);
      // this month: only the days still to run (days so far are in the accrued rent above)
      const share = m === 0 ? (eq.rentBasis === 'monthly' ? 0 : (+monthEnd.slice(8, 10) - +today.slice(8, 10)) / +monthEnd.slice(8, 10)) : 1;
      push(vDue(v, monthEnd), 'out', monthly * share, 'equipment', `${eq.name || 'Machine'} hire (projected)`);
    }
  });
  // ── OUT: material received but not yet billed (the bill will follow) ──
  (S.grnRecords || []).forEach(g => {
    if (g.billed || g.billedByBillId || g.refBillId || g.source === 'purchase') return;
    if (g.sourceType && g.sourceType !== 'Supplier') return;
    const v = vendor(g.supplierId);
    push(vDue(v, g.date), 'out', N(g.amount) || N(g.qty) * N(g.rate), 'grn', `${v.name || 'Supplier'} · ${g.grnNo || 'GRN'} (unbilled)`, true);
  });
  // ── OUT: fuel bought on credit at pumps (khata), settled by Fuel expenses naming the pump ──
  const pumps = {};
  (S.fuelTxns || []).forEach(t => { if (t.type === 'PUMP' && t.onCredit && N(t.amount) > 0) { const k = String(t.pumpName || 'Pump').trim().toLowerCase(); (pumps[k] = pumps[k] || { name: t.pumpName || 'Pump', docs: [] }).docs.push({ date: t.date, total: N(t.amount) }); } });
  Object.entries(pumps).forEach(([k, pmp]) => {
    const paid = (S.expenses || []).filter(e => /fuel|diesel|petrol|khata/i.test(e.category || '') && String(e.party || e.payee || e.remarks || '').toLowerCase().includes(k)).reduce((s, e) => s + N(e.amount), 0);
    const v = (S.vendors || []).find(x => String(x.name || '').trim().toLowerCase() === k);
    fifoOpen(pmp.docs, paid).forEach(d => push(v ? vDue(v, d.date) : dueDate(d.date, o.fuelTermsDays ?? 15), 'out', d.open, 'fuel', `Fuel khata · ${pmp.name}`));
  });
  // ── OUT: wages — every attendance day owed on the next pay day; payments, advances and
  //    deductions clear the oldest days first (per worker). Thousands of logs → one line per pay day. ──
  const rateOf = {}; (S.labourMaster || []).forEach(l => { rateOf[l.id] = N(l.dayRate); });
  const owed = {};
  (S.attendanceLogs || []).forEach(a => { const w = dayWage(rateOf[a.labourId], a.status, a.ot); if (w > 0 && a.date <= today) (owed[a.labourId] = owed[a.labourId] || []).push({ date: a.date, total: w, due: nextPayDay(a.date, payDay) }); });
  (S.labourSalaries || []).forEach(sl => { if (N(sl.amount) > 0) (owed[sl.labourId] = owed[sl.labourId] || []).push({ date: sl.date || today, total: N(sl.amount), due: sl.date || today }); });
  const clear = {};
  ['labourPayments', 'labourAdvances', 'labourDeductions'].forEach(k => (S[k] || []).forEach(p => { clear[p.labourId] = (clear[p.labourId] || 0) + (k === 'labourPayments' ? paidOf(p) : N(p.amount)); }));
  const wagesBy = {};
  Object.entries(owed).forEach(([lid, list]) => fifoOpen(list, clear[lid]).forEach(d => {
    const k = d.due < today ? today : d.due;
    (wagesBy[k] = wagesBy[k] || { amt: 0, workers: new Set() }); wagesBy[k].amt += d.open; wagesBy[k].workers.add(lid);
  }));
  Object.entries(wagesBy).forEach(([d, w]) => push(d, 'out', w.amt, 'labour', `Wages earned — ${w.workers.size} worker${w.workers.size === 1 ? '' : 's'}`));
  // days not yet worked: the attendance run-rate (or the owner's weekly figure), accrued to its pay day
  const weekly = o.weeklyWages != null && o.weeklyWages !== '' ? N(o.weeklyWages) : wageRunRate(S, today);
  if (weekly > 0) {
    const ahead = {};
    for (let i = 1; i <= horizon; i++) { const d = addDays(today, i); const pd = nextPayDay(d, payDay); ahead[pd] = (ahead[pd] || 0) + weekly / 7; }
    Object.entries(ahead).forEach(([d, a]) => push(d, 'out', a, 'labour', 'Wages — days ahead (run-rate)'));
  }
  // ── OUT: gang advances, recurring costs, loan EMIs ──
  for (let i = 0; i <= horizon; i++) {
    const d = addDays(today, i);
    const wd = weekday(d);
    (S.labourContractors || []).forEach(c => {
      if (N(c.weeklyAdvance) > 0 && wd === (c.weeklyAdvanceDay != null ? N(c.weeklyAdvanceDay) : payDay)) push(d, 'out', c.weeklyAdvance, 'labour', `${c.name || 'Gang'} — weekly advance`);
    });
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
  (S.invoices || []).forEach(i => { if (i.status !== 'Cancelled') (invs[i.clientId] = invs[i.clientId] || []).push({ ...i, total: N(i.netPayable) || N(i.totalAmount || i.total) }); });
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
      const proj = (S.projects || []).find(p => p.id === a.projectId);
      const ret = N((proj?.boqs || []).find(g => N(g.retention) > 0)?.retention);    // % held back by the client
      const billOn = a.date && a.date > today ? a.date : today;
      push(addDays(billOn, cDays(c) + buffer), 'in', amt * (1 - ret / 100), 'ra', `${c.name || 'Client'} · ${a.abstractNum || 'RA bill'} (to invoice${ret ? `, less ${ret}% retention` : ''})`, false);
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

/** Outflow kind → dashboard category (stacked bars). */
export const OUT_CATS = ['materials', 'labour', 'equipment', 'fuel', 'other'];
export const outCategory = (kind) => (kind === 'bill' || kind === 'grn' ? 'materials'
  : kind === 'labour' || kind === 'equipment' || kind === 'fuel' ? kind : 'other');

const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const short = (iso) => `${+iso.slice(8, 10)} ${MON[+iso.slice(5, 7) - 1]}`;

/**
 * What fed the forecast, and what could make it wrong (records with no rate / vendor / terms).
 */
export function forecastAudit(S, o = {}) {
  const has = v => v != null && v !== '';
  const rented = (S.equipmentList || []).filter(e => e.ownership === 'RENTED');
  const workersUsed = new Set((S.attendanceLogs || []).map(a => a.labourId));
  const gaps = [];
  const gap = (n, text) => { if (n) gaps.push({ count: n, text }); };
  gap((S.labourMaster || []).filter(l => workersUsed.has(l.id) && !(N(l.dayRate) > 0)).length, 'workers have attendance but no day rate — their wages are missing');
  gap(rented.filter(e => !e.vendorId).length, 'hired machines have no hire vendor — their rent is missing');
  gap(rented.filter(e => e.vendorId && !(N(e.rentRate) > 0)).length, 'hired machines have no rent rate — their rent is missing');
  gap((S.vendors || []).filter(v => !has(v.paymentTermsDays) && v.termsType !== 'weekly').length, `suppliers have no payment terms — using ${o.defaultTermsDays ?? 30} days`);
  gap((S.clients || []).filter(c => !has(c.paymentTermsDays)).length, `clients have no payment terms — using ${o.defaultTermsDays ?? 30} days`);
  gap((S.fuelTxns || []).filter(t => t.type === 'PUMP' && t.onCredit && !(N(t.amount) > 0)).length, 'credit fuel fills have no amount');
  return {
    counts: {
      attendance: (S.attendanceLogs || []).length, workers: workersUsed.size,
      grns: (S.grnRecords || []).filter(g => !(g.billed || g.billedByBillId || g.refBillId || g.source === 'purchase')).length,
      bills: (S.vendorMaterials || []).length, machines: rented.length,
      runbook: (S.equipmentLogs || []).filter(l => l.type === 'Runbook' && rented.some(e => e.id === l.assetId)).length,
      fuelCredit: (S.fuelTxns || []).filter(t => t.type === 'PUMP' && t.onCredit).length,
      invoices: (S.saleInvoices || []).length + (S.invoices || []).length,
      raBills: (S.abstracts || []).filter(a => !(a.isInvoiced || a.status === 'invoiced')).length,
    },
    gaps,
  };
}

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
    const outBy = Object.fromEntries(OUT_CATS.map(c => [c, 0]));
    items.forEach(e => { if (e.dir === 'out') outBy[outCategory(e.kind)] += e.amount; });
    OUT_CATS.forEach(c => { outBy[c] = r2(outBy[c]); });
    const startCash = cash;
    cash = r2(cash + inSure + inExp - outA);
    out.push({ key: start, label, start, end: endD, startCash, in: r2(inSure + inExp), inSure, inExpected: inExp, out: outA, outBy, endCash: cash,
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
