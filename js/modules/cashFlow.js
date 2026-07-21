/* ============================================================================
 * True Site Sync — CASH FLOW
 * Phase 1: Command Center (Net cash, AR/AP days, profit, 30-day forecast)
 * Phase 2: Client A/B/C Scorecard + 3-Leak Detector
 * Intelligence layer — reads live from every money module, no new storage.
 * ==========================================================================*/
import { state, saveAllData } from './state.js';
import { getCurrencySymbol, showToast } from './utils.js';

const N = (v) => parseFloat(v) || 0;
const _days = (n) => { const d = new Date(); d.setDate(d.getDate() - n); return d.toISOString().split('T')[0]; };
const _inLast = (dateStr, n) => dateStr && dateStr >= _days(n);
const _age = (d) => d ? Math.max(0, Math.round((Date.now() - new Date(d).getTime()) / 86400000)) : 0;
const fmt = (v) => getCurrencySymbol() + Math.round(N(v)).toLocaleString('en-IN');
const _esc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const fmt1 = (v) => Math.round(N(v) * 10) / 10;

let _cfTab = 'cashflow';

// ── AGGREGATIONS ────────────────────────────────────────────────────────────
function _billed(period) {
  const inP = (d) => period == null ? true : _inLast(d, period);
  let v = 0;
  (state.saleInvoices || []).filter(i => i.status !== 'Cancelled' && inP(i.date)).forEach(i => v += N(i.total));
  (state.invoices || []).filter(i => i.status !== 'Cancelled' && inP(i.date)).forEach(i => v += N(i.taxAmount));
  (state.abstracts || []).filter(a => a.status !== 'invoiced' && inP(a.date)).forEach(a => v += N(a.totalAmount));
  return v;
}
function _received(period) {
  const inP = (d) => period == null ? true : _inLast(d, period);
  return (state.paymentsIn || []).filter(p => p.clientId && inP(p.date)).reduce((s, p) => s + N(p.amount), 0);
}
function _purchased(period) { const inP = (d) => period == null ? true : _inLast(d, period); return (state.vendorMaterials || []).filter(m => inP(m.date)).reduce((s, m) => s + (N(m.totalAmount) || N(m.amount)), 0); }
function _vendorPaid(period) { const inP = (d) => period == null ? true : _inLast(d, period); return (state.vendorPayments || []).filter(p => inP(p.date)).reduce((s, p) => s + N(p.amount), 0); }
function _expenses(period) { const inP = (d) => period == null ? true : _inLast(d, period); return (state.expenses || []).filter(e => inP(e.date)).reduce((s, e) => s + N(e.amount), 0); }
function _labourBilled(period) { const inP = (d) => period == null ? true : _inLast(d, period); return (state.labourSalaries || []).filter(l => inP(l.date)).reduce((s, l) => s + N(l.amount), 0); }
function _labourPaid(period) { const inP = (d) => period == null ? true : _inLast(d, period); return (state.labourPayments || []).filter(l => inP(l.date)).reduce((s, l) => s + N(l.amount), 0); }

function cashPosition() {
  const inAll = (state.paymentsIn || []).reduce((s, p) => s + N(p.amount), 0);
  return inAll - (_vendorPaid(null) + _expenses(null) + _labourPaid(null));
}
function arOutstanding() { return Math.max(0, _billed(null) - _received(null)); }
function apOutstanding() { return Math.max(0, _purchased(null) - _vendorPaid(null)); }
function labourDue() { return Math.max(0, _labourBilled(null) - _labourPaid(null)); }
function arDays() { const rev = _billed(90); return rev > 0 ? Math.round(arOutstanding() / (rev / 90)) : 0; }
function apDays() { const pur = _purchased(90); return pur > 0 ? Math.round(apOutstanding() / (pur / 90)) : 0; }

/** Live stock by material (derived from inventoryTx: IN adds, OUT subtracts). */
function _stockByMaterial() {
  const map = {};
  (state.inventoryTx || []).forEach(tx => {
    const id = tx.rawMaterialId || tx.itemId; if (!id) return;
    if (!map[id]) map[id] = { qty: 0, rate: 0, lastDate: '' };
    const q = N(tx.qty);
    if (tx.type === 'OUT') map[id].qty -= q; else { map[id].qty += q; if (N(tx.rate)) map[id].rate = N(tx.rate); }
    if (tx.date && tx.date > map[id].lastDate) map[id].lastDate = tx.date;
  });
  return map;
}
function inventoryValue() { return Object.values(_stockByMaterial()).reduce((s, x) => s + Math.max(0, x.qty) * x.rate, 0); }
function inventoryDays() { const c = _purchased(90) + _labourBilled(90); return c > 0 ? Math.round(inventoryValue() / (c / 90)) : 0; }

function profitScorecard(period) {
  const revenue = _billed(period), cogs = _purchased(period) + _labourBilled(period), opex = _expenses(period);
  const gross = revenue - cogs, net = gross - opex;
  return { revenue, cogs, gross, opex, net, margin: revenue > 0 ? (net / revenue) * 100 : 0 };
}
function forecast30() {
  const inflow = arOutstanding(), runRate = _expenses(90) / 3;
  const outflow = apOutstanding() + labourDue() + runRate, opening = cashPosition();
  return { opening, inflow, outflow, net: inflow - outflow, projected: opening + inflow - outflow };
}

// ── CLIENT SCORECARD (Phase 2) ──────────────────────────────────────────────
function clientScores() {
  const invForClient = (id) => {
    const rows = [];
    (state.saleInvoices || []).filter(i => i.clientId === id && i.status !== 'Cancelled').forEach(i => rows.push({ date: i.date, amount: N(i.total) }));
    (state.invoices || []).filter(i => i.clientId === id && i.status !== 'Cancelled').forEach(i => rows.push({ date: i.date, amount: N(i.taxAmount) }));
    (state.abstracts || []).filter(a => a.clientId === id && a.status !== 'invoiced').forEach(a => rows.push({ date: a.date, amount: N(a.totalAmount) }));
    return rows.sort((a, b) => (a.date || '').localeCompare(b.date || ''));
  };
  const out = (state.clients || []).map(c => {
    const invs = invForClient(c.id);
    const billed = invs.reduce((s, i) => s + i.amount, 0);
    const received = (state.paymentsIn || []).filter(p => p.clientId === c.id).reduce((s, p) => s + N(p.amount), 0);
    // FIFO: apply receipts to the oldest invoices first → remaining are the real unpaid.
    let pool = received; const unpaid = [];
    invs.forEach(iv => { if (pool >= iv.amount) { pool -= iv.amount; } else { unpaid.push({ date: iv.date, amount: iv.amount - pool }); pool = 0; } });
    const totUnpaid = unpaid.reduce((s, u) => s + u.amount, 0);
    const avgDays = totUnpaid > 0 ? Math.round(unpaid.reduce((s, u) => s + u.amount * _age(u.date), 0) / totUnpaid) : 0;
    return { id: c.id, name: c.name, billed, received, outstanding: Math.max(0, billed - received), orders: invs.length, avgDays };
  }).filter(c => c.billed > 0 || c.received > 0);
  const maxBilled = Math.max(1, ...out.map(c => c.billed));
  out.forEach(c => {
    const paymentSpeed = c.outstanding <= 1 ? 100 : Math.max(0, Math.min(100, 100 - c.avgDays));  // pays fast → high
    const value = Math.round(c.billed / maxBilled * 100);                                          // revenue contribution
    const freq = Math.min(100, c.orders * 25);                                                     // repeat business
    const score = Math.round(0.45 * paymentSpeed + 0.30 * value + 0.25 * freq);
    Object.assign(c, { paymentSpeed: Math.round(paymentSpeed), value, freq: Math.round(freq), score, grade: score >= 70 ? 'A' : score >= 45 ? 'B' : 'C' });
  });
  return out.sort((a, b) => b.score - a.score);
}

// ── 3-LEAK DETECTOR (Phase 2) ───────────────────────────────────────────────
function detectLeaks() {
  const scores = clientScores();
  const late = scores.filter(c => c.outstanding > 1 && c.avgDays > 45);
  const m = _stockByMaterial(), cutoff = _days(60);
  let slowVal = 0, slowCount = 0;
  Object.values(m).forEach(x => { const v = Math.max(0, x.qty) * x.rate; if (v > 0 && (!x.lastDate || x.lastDate < cutoff)) { slowVal += v; slowCount++; } });
  const redCats = ['bulk', 'misc', 'repair', 'maintenance', 'penalty', 'fine', 'unplanned', 'withdrawal'];
  const waste = (state.expenses || []).filter(e => _inLast(e.date, 90) && redCats.some(r => (e.category || '').toLowerCase().includes(r)));
  return {
    late: { amount: late.reduce((s, c) => s + c.outstanding, 0), count: late.length, items: late },
    slowInv: { amount: slowVal, count: slowCount },
    waste: { amount: waste.reduce((s, e) => s + N(e.amount), 0), count: waste.length, items: waste },
  };
}

// ── FORECAST / PLANNER / CALENDAR (Phase 3) ─────────────────────────────────
const _FIXED_CATS = ['rent', 'salary', 'salaries', 'utility', 'utilities', 'emi', 'insurance', 'loan', 'electricity'];

/** 30-day forecast with inflows tiered by client grade and outflows by type. */
function tieredForecast() {
  const scores = clientScores();
  let confirmed = scores.filter(c => c.grade === 'A').reduce((s, c) => s + c.outstanding, 0);
  let likely = scores.filter(c => c.grade === 'B').reduce((s, c) => s + c.outstanding, 0);
  let possible = scores.filter(c => c.grade === 'C').reduce((s, c) => s + c.outstanding, 0);
  const exp90 = (state.expenses || []).filter(e => _inLast(e.date, 90));
  const fixed = exp90.filter(e => _FIXED_CATS.some(f => (e.category || '').toLowerCase().includes(f))).reduce((s, e) => s + N(e.amount), 0) / 3;
  const variable = exp90.filter(e => !_FIXED_CATS.some(f => (e.category || '').toLowerCase().includes(f))).reduce((s, e) => s + N(e.amount), 0) / 3;
  const vendor = apOutstanding();
  const labour = labourDue() || (_labourPaid(90) / 3);
  // Add the owner's known commitments (next 30 days) — pipeline the data can't see.
  const com = _commitments().filter(c => _futureWindow(c.date, 30));
  const cIn = com.filter(c => c.type === 'in');
  confirmed += cIn.filter(c => (c.confidence || 'confirmed') === 'confirmed').reduce((s, c) => s + N(c.amount), 0);
  likely += cIn.filter(c => c.confidence === 'likely').reduce((s, c) => s + N(c.amount), 0);
  possible += cIn.filter(c => c.confidence === 'possible').reduce((s, c) => s + N(c.amount), 0);
  const commitOut = com.filter(c => c.type === 'out').reduce((s, c) => s + N(c.amount), 0);
  const inflow = confirmed + likely + possible, outflow = fixed + variable + vendor + labour + commitOut, opening = cashPosition();
  return { confirmed, likely, possible, inflow, fixed, variable, vendor, labour, commitOut, outflow, opening, gap: inflow - outflow, projected: opening + inflow - outflow };
}

/** 4-week rolling cash planner. */
function weeklyPlanner() {
  const tf = tieredForecast();
  const scores = clientScores().filter(c => c.outstanding > 1);
  const inW = [0, 0, 0, 0];
  scores.forEach(c => { const w = c.grade === 'A' ? 0 : c.grade === 'B' ? 1 : (c.avgDays > 60 ? 3 : 2); inW[w] += c.outstanding; });
  const monthlyOut = tf.fixed + tf.variable + tf.labour;
  const outW = [tf.vendor + monthlyOut / 4, monthlyOut / 4, monthlyOut / 4, monthlyOut / 4];
  // Drop each known commitment into its actual week.
  _commitments().filter(c => _futureWindow(c.date, 28)).forEach(c => {
    const dd = Math.max(0, Math.round((new Date(c.date).getTime() - Date.now()) / 86400000));
    const w = Math.min(3, Math.floor(dd / 7));
    if (c.type === 'in') inW[w] += N(c.amount); else outW[w] += N(c.amount);
  });
  let running = tf.opening;
  return inW.map((inflow, i) => {
    const outflow = outW[i]; running += inflow - outflow;
    const gap = inflow - outflow;
    let strat;
    if (running < 0) strat = '🚨 Cash gap — pull collections forward / arrange short funds';
    else if (gap < 0) strat = 'Collect from A-clients early; delay non-critical vendor';
    else strat = 'Surplus — pre-pay A-vendor or set aside profit';
    return { week: i + 1, inflow, outflow, gap, running, strat };
  });
}

/** This month's compliance & payment calendar (amounts auto-filled where derivable). */
function financeCalendar() {
  const now = new Date(), y = now.getFullYear(), mo = now.getMonth(), todayD = now.getDate();
  const day = (d) => new Date(y, mo, d).toISOString().split('T')[0];
  const gstOut = (state.saleInvoices || []).filter(i => _inLast(i.date, 30) && i.status !== 'Cancelled').reduce((s, i) => s + N(i.gstAmount), 0);
  const items = [
    { d: 1, label: 'Founder profit transfer', amount: null, type: 'Discipline', icon: '💰' },
    { d: 7, label: 'TDS deposit', amount: null, type: 'Statutory', icon: '🏛️' },
    { d: 11, label: 'GSTR-1 filing', amount: null, type: 'Statutory', icon: '📄' },
    { d: 15, label: 'PF / ESI payment', amount: null, type: 'Statutory', icon: '👷' },
    { d: 20, label: 'GST payment (est. output)', amount: gstOut || null, type: 'Statutory', icon: '🧾' },
  ];
  return items.map(it => ({ ...it, date: day(it.d), status: it.d < todayD ? 'past' : it.d === todayD ? 'today' : 'upcoming' }));
}

// ── CASH HEALTH SCORE + VENDORS + SIMULATOR (Phase 4) ───────────────────────
/** Cash Flow = Profitability × Speed × Consistency − Leakages → 0–100. */
function cashHealth() {
  const ps = profitScorecard(90);
  const ccc = arDays() + inventoryDays() - apDays();
  const scores = clientScores();
  const repeatRatio = scores.length ? scores.filter(c => c.orders > 1).length / scores.length : 0;
  const L = detectLeaks(); const leakTotal = L.late.amount + L.slowInv.amount + L.waste.amount;
  const rev90 = ps.revenue || 1;
  const profit01 = Math.max(0, Math.min(1, ps.margin / 20));     // 20%+ margin = full marks
  const speed01 = Math.max(0, Math.min(1, 1 - ccc / 90));        // CCC 0 = fast, 90+ = slow
  const cons01 = Math.max(0, Math.min(1, repeatRatio));          // repeat business
  const leakPenalty = Math.max(0, Math.min(0.5, leakTotal / rev90));
  const base = 0.35 * profit01 + 0.35 * speed01 + 0.30 * cons01;
  const score = Math.round(Math.max(0, Math.min(1, base - leakPenalty)) * 100);
  return { score, grade: score >= 75 ? 'A' : score >= 50 ? 'B' : 'C', profit01, speed01, cons01, leakPenalty, margin: ps.margin, ccc, leakTotal };
}

/** Vendor ABC (Pareto on spend) + payables. */
function vendorScores() {
  const rows = (state.vendors || []).map(v => {
    const purchased = (state.vendorMaterials || []).filter(m => m.vendorId === v.id).reduce((s, m) => s + (N(m.totalAmount) || N(m.amount)), 0);
    const paid = (state.vendorPayments || []).filter(p => p.vendorId === v.id).reduce((s, p) => s + N(p.amount), 0);
    const bills = (state.vendorMaterials || []).filter(m => m.vendorId === v.id).length;
    return { id: v.id, name: v.name, purchased, paid, outstanding: Math.max(0, purchased - paid), bills };
  }).filter(v => v.purchased > 0).sort((a, b) => b.purchased - a.purchased);
  const total = rows.reduce((s, v) => s + v.purchased, 0) || 1;
  let cum = 0;
  rows.forEach(v => { cum += v.purchased; const pct = cum / total; v.cls = pct <= 0.7 ? 'A' : pct <= 0.9 ? 'B' : 'C'; });
  return rows;
}

// Live 1% Impact Simulator — recomputes as the founder moves the levers.
window._cfSimulate = function () {
  const b = window._cfSimBase; if (!b) return;
  const g = (id) => parseFloat(document.getElementById(id)?.value) || 0;
  const cur = getCurrencySymbol();
  const money = (v) => cur + Math.round(v).toLocaleString('en-IN');
  const profitGain = b.revAnnual * g('simPrice') / 100 + b.cogsAnnual * g('simCost') / 100 + b.opexAnnual * g('simOverhead') / 100;
  const cashFreed = (b.revAnnual / 365) * g('simArDays') + b.inv * g('simInv') / 100;
  const set = (id, v) => { const e = document.getElementById(id); if (e) e.textContent = v; };
  set('simProfitOut', '+' + money(profitGain));
  set('simCashOut', '+' + money(cashFreed));
  set('simTotalOut', money(profitGain + cashFreed));
};

// ── SURVIVAL COCKPIT + SAVED SETTINGS (Runway / Reserve / Break-even) ───────
const _DEFAULT_POLICY = { maxDays: 30, maxLimitMult: 1, docs: 'PO + signed Work Order + GST', consequence: '1.5%/mo interest + hold new work' };
function _settings() {
  const s = state.cashFlowSettings || (state.cashFlowSettings = {});
  if (s.reserveMonths == null) s.reserveMonths = 3;
  if (!s.creditPolicy) s.creditPolicy = { ..._DEFAULT_POLICY };
  if (!s.targets) s.targets = { revenue: 0, margin: 15, arDays: 30, netProfit: 0 };
  if (!s.profitFirst) s.profitFirst = { profit: 5, ownerPay: 50, tax: 15, opex: 30 };
  if (!s.commitments) s.commitments = [];
  return s;
}

// ── CASH COMMITMENTS — the owner's pipeline knowledge (not yet invoiced) ─────
function _commitments() { return _settings().commitments || []; }
function _futureWindow(dateStr, days) {
  const today = new Date().toISOString().split('T')[0];
  const end = (() => { const x = new Date(); x.setDate(x.getDate() + days); return x.toISOString().split('T')[0]; })();
  return dateStr && dateStr >= today && dateStr <= end;
}
window._cfAddCommitment = function () {
  const type = document.getElementById('comType')?.value || 'in';
  const label = (document.getElementById('comLabel')?.value || '').trim();
  const amount = parseFloat(document.getElementById('comAmount')?.value) || 0;
  const date = document.getElementById('comDate')?.value || '';
  const confidence = document.getElementById('comConf')?.value || 'confirmed';
  if (!label) { showToast('Enter a description', 'error'); return; }
  if (amount <= 0) { showToast('Enter an amount', 'error'); return; }
  if (!date) { showToast('Pick an expected date', 'error'); return; }
  _settings().commitments.push({ id: 'com_' + Date.now(), type, label, amount, date, confidence });
  saveAllData();
  showToast('Commitment added to forecast', 'success');
  renderCashFlow();
};
window._cfDelCommitment = function (id) {
  _settings().commitments = _commitments().filter(c => c.id !== id);
  saveAllData(); showToast('Removed', 'info'); renderCashFlow();
};

/** Profit-First: split real revenue (collections) into Profit/Owner-Pay/Tax/OpEx. */
function profitFirst() {
  const pf = _settings().profitFirst;
  const income = _received(90) / 3;                                   // avg monthly collections (real revenue)
  const alloc = (k) => income * N(pf[k]) / 100;
  const actualMonthlyCost = (_purchased(90) + _labourBilled(90) + _expenses(90)) / 3;
  const targetOpex = alloc('opex');
  return {
    income,
    profit: alloc('profit'), ownerPay: alloc('ownerPay'), tax: alloc('tax'), opex: targetOpex,
    pct: { profit: N(pf.profit), ownerPay: N(pf.ownerPay), tax: N(pf.tax), opex: N(pf.opex) },
    sum: N(pf.profit) + N(pf.ownerPay) + N(pf.tax) + N(pf.opex),
    actualMonthlyCost, overspend: actualMonthlyCost - targetOpex,
  };
}

window._cfSaveProfitFirst = function () {
  const pf = _settings().profitFirst;
  pf.profit = parseFloat(document.getElementById('pfProfit')?.value) || 0;
  pf.ownerPay = parseFloat(document.getElementById('pfOwnerPay')?.value) || 0;
  pf.tax = parseFloat(document.getElementById('pfTax')?.value) || 0;
  pf.opex = parseFloat(document.getElementById('pfOpex')?.value) || 0;
  const sum = pf.profit + pf.ownerPay + pf.tax + pf.opex;
  saveAllData();
  showToast(sum === 100 ? 'Allocation saved' : `Saved — but your % adds to ${sum}%, not 100%`, sum === 100 ? 'success' : 'warning');
  renderCashFlow();
};

/** Plan vs actual — the monthly board snapshot. Actuals = 90-day monthly average. */
function targetsScorecard() {
  const t = _settings().targets;
  const ps = profitScorecard(90);
  const mRev = ps.revenue / 3, mNet = ps.net / 3;
  const rag = (ok, warn) => ok ? 'green' : warn ? 'amber' : 'red';
  return [
    { metric: 'Monthly Revenue', target: N(t.revenue), actual: mRev, fmt: 'money', pct: N(t.revenue) > 0 ? mRev / N(t.revenue) * 100 : null, status: rag(mRev >= N(t.revenue) && N(t.revenue) > 0, mRev >= N(t.revenue) * 0.8) },
    { metric: 'Net Margin', target: N(t.margin), actual: ps.margin, fmt: 'pct', status: rag(ps.margin >= N(t.margin), ps.margin >= N(t.margin) - 5) },
    { metric: 'Monthly Net Profit', target: N(t.netProfit), actual: mNet, fmt: 'money', pct: N(t.netProfit) > 0 ? mNet / N(t.netProfit) * 100 : null, status: rag(mNet >= N(t.netProfit) && N(t.netProfit) > 0, mNet >= N(t.netProfit) * 0.8) },
    { metric: 'AR Days (collection)', target: N(t.arDays), actual: arDays(), fmt: 'days', lowerBetter: true, status: rag(arDays() <= N(t.arDays), arDays() <= N(t.arDays) + 10) },
  ];
}

window._cfSaveTargets = function () {
  const t = _settings().targets;
  t.revenue = parseFloat(document.getElementById('tgtRevenue')?.value) || 0;
  t.margin = parseFloat(document.getElementById('tgtMargin')?.value) || 0;
  t.netProfit = parseFloat(document.getElementById('tgtNetProfit')?.value) || 0;
  t.arDays = parseFloat(document.getElementById('tgtArDays')?.value) || 0;
  saveAllData();
  showToast('Monthly targets saved', 'success');
  renderCashFlow();
};

/** Monthly fixed burn = the costs you MUST pay even if income stops. */
function monthlyFixedBurn() {
  const fixedExp = (state.expenses || []).filter(e => _inLast(e.date, 90) && _FIXED_CATS.some(f => (e.category || '').toLowerCase().includes(f))).reduce((s, e) => s + N(e.amount), 0) / 3;
  const labour = _labourPaid(90) / 3;
  return fixedExp + labour;
}
function survival() {
  const cash = cashPosition();
  const burn = monthlyFixedBurn();
  const runwayMonths = burn > 0 ? cash / burn : (cash > 0 ? 99 : 0);
  const reserveMonths = N(_settings().reserveMonths);
  const targetReserve = burn * reserveMonths;
  const ps = profitScorecard(90);
  const marginRatio = ps.revenue > 0 ? ps.gross / ps.revenue : 0;          // gross margin %
  const monthlyFixedTotal = burn + ((state.expenses || []).filter(e => _inLast(e.date, 90) && !_FIXED_CATS.some(f => (e.category || '').toLowerCase().includes(f))).reduce((s, e) => s + N(e.amount), 0) / 3) * 0; // fixed only
  const breakEvenRev = marginRatio > 0 ? burn / marginRatio : 0;           // revenue needed to cover fixed costs
  const monthlyRev = ps.revenue / 3;
  return { cash, burn, runwayMonths, reserveMonths, targetReserve, reserveGap: targetReserve - cash, marginRatio, breakEvenRev, monthlyRev, beAchieved: breakEvenRev > 0 ? monthlyRev / breakEvenRev * 100 : 0 };
}

window._cfSaveReserve = function () {
  const v = parseFloat(document.getElementById('cfReserveMonths')?.value);
  if (!(v >= 0)) { showToast('Enter a valid number of months', 'error'); return; }
  _settings().reserveMonths = v;
  saveAllData();
  showToast('Reserve target saved (' + v + ' months)', 'success');
  renderCashFlow();
};
window._cfSaveCreditPolicy = function () {
  const p = _settings().creditPolicy;
  p.maxDays = parseFloat(document.getElementById('cpMaxDays')?.value) || 0;
  p.maxLimitMult = parseFloat(document.getElementById('cpMaxLimit')?.value) || 0;
  p.docs = (document.getElementById('cpDocs')?.value || '').trim();
  p.consequence = (document.getElementById('cpConseq')?.value || '').trim();
  saveAllData();
  showToast('Credit policy saved', 'success');
};

// ── UI HELPERS ──────────────────────────────────────────────────────────────
const _tile = (label, value, sub, color, icon, kind) => `
  <div ${kind ? `onclick="window._cfTileDetail('${kind}')" onmouseover="this.style.boxShadow='0 8px 24px rgba(0,0,0,.10)';this.style.transform='translateY(-2px)'" onmouseout="this.style.boxShadow='0 1px 3px rgba(0,0,0,.04)';this.style.transform=''"` : ''} style="background:#fff;border:1px solid #e2e8f0;border-radius:16px;padding:18px;box-shadow:0 1px 3px rgba(0,0,0,.04);transition:.15s;${kind ? 'cursor:pointer;' : ''}">
    <div style="display:flex;justify-content:space-between;align-items:flex-start;">
      <div style="min-width:0;">
        <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:#94a3b8;">${label}</div>
        <div style="font-size:24px;font-weight:800;color:${color};margin-top:4px;line-height:1.1;">${value}</div>
        ${sub ? `<div style="font-size:11px;color:#64748b;margin-top:3px;">${sub}</div>` : ''}
      </div>
      <div style="font-size:22px;opacity:.3;flex-shrink:0;">${icon}</div>
    </div>
    ${kind ? '<div style="font-size:9px;color:#cbd5e1;margin-top:8px;font-weight:700;letter-spacing:.03em;">CLICK FOR DETAILS →</div>' : ''}
  </div>`;

// ── Per-vendor payables (purchases − payments) for the AP drill-down ──
function _apByVendor() {
  const byV = {};
  const key = o => o.vendorId || o.vendor || '__none';
  (state.vendorMaterials || []).forEach(m => { const v = key(m); (byV[v] = byV[v] || { purchased: 0, paid: 0, oldest: '', due: '' }); byV[v].purchased += (N(m.totalAmount) || N(m.amount)); if (m.date && (!byV[v].oldest || m.date < byV[v].oldest)) byV[v].oldest = m.date; if (m.dueDate && (!byV[v].due || m.dueDate < byV[v].due)) byV[v].due = m.dueDate; });
  (state.vendorPayments || []).forEach(p => { const v = key(p); (byV[v] = byV[v] || { purchased: 0, paid: 0, oldest: '', due: '' }); byV[v].paid += N(p.amount); });
  return Object.entries(byV).map(([vid, x]) => ({ name: (state.vendors || []).find(v => v.id === vid)?.name || (vid === '__none' ? 'Unassigned' : vid), ...x, outstanding: Math.max(0, x.purchased - x.paid) })).filter(r => r.outstanding > 0.5).sort((a, b) => b.outstanding - a.outstanding);
}

/** Open a drill-down showing the source transactions behind a cash-flow tile. */
window._cfCloseDetail = function () { const o = document.getElementById('cfDetailOverlay'); if (o) o.remove(); };
window._cfTileDetail = function (kind) {
  const cur = getCurrencySymbol();
  const M = n => cur + Math.round(n).toLocaleString('en-IN');
  const daysAgo = d => { if (!d) return '—'; const n = _age(d); return n + 'd ago'; };
  let title = '', subtitle = '', cols = [], rows = [], foot = '', total = 0, totalColor = '#0f172a';

  if (kind === 'ar' || kind === 'inflow') {
    const list = clientScores().filter(c => c.outstanding > 0.5).sort((a, b) => b.outstanding - a.outstanding);
    total = list.reduce((s, c) => s + c.outstanding, 0); totalColor = '#2563eb';
    title = (kind === 'inflow' ? '📥 Expected Inflow' : '⏳ Receivables (AR)') + ' — whom to receive from';
    subtitle = `${list.length} customer${list.length !== 1 ? 's' : ''} owe you money`;
    cols = ['Customer', 'Billed', 'Received', 'Outstanding', 'Avg age'];
    rows = list.map(c => [c.name, M(c.billed), M(c.received), { v: M(c.outstanding), strong: 1, color: '#dc2626' }, { v: c.avgDays + ' d', color: c.avgDays > 60 ? '#dc2626' : '#64748b' }]);
    foot = 'Outstanding = Billed − Received per customer (receipts applied to the oldest invoice first). Chase the oldest ageing first.';
  } else if (kind === 'ap') {
    const vlist = _apByVendor();
    total = vlist.reduce((s, v) => s + v.outstanding, 0); totalColor = '#ea580c';
    title = '🧾 Payables (AP) — whom to pay';
    subtitle = `${vlist.length} vendor${vlist.length !== 1 ? 's' : ''} to pay`;
    cols = ['Vendor', 'Purchased', 'Paid', 'Outstanding', 'Due / oldest'];
    rows = vlist.map(v => [v.name, M(v.purchased), M(v.paid), { v: M(v.outstanding), strong: 1, color: '#dc2626' }, { v: v.due ? v.due : daysAgo(v.oldest), color: '#64748b' }]);
    foot = 'Outstanding = Purchases billed − Payments made, per vendor. Pay the ones due / oldest first.';
  } else if (kind === 'outflow') {
    const vlist = _apByVendor(); const ld = labourDue(); const opex = _expenses(90) / 3;
    rows = vlist.map(v => [v.name + ' (vendor)', '', '', { v: M(v.outstanding), strong: 1, color: '#dc2626' }, daysAgo(v.oldest)]);
    if (ld > 0.5) rows.push([{ v: 'Labour wages due', color: '#7c3aed' }, '', '', { v: M(ld), strong: 1, color: '#dc2626' }, 'payroll']);
    if (opex > 0.5) rows.push([{ v: 'Operating expenses (30d run-rate)', color: '#0891b2' }, '', '', { v: M(opex), strong: 1, color: '#dc2626' }, 'recurring']);
    total = vlist.reduce((s, v) => s + v.outstanding, 0) + Math.max(0, ld) + Math.max(0, opex); totalColor = '#dc2626';
    title = '📤 Expected Outflow · 30d';
    subtitle = 'Vendors + labour + operating expenses';
    cols = ['Item', '', '', 'Amount', 'Note'];
    foot = 'Outflow = vendor payables + labour wages due + operating-expense run-rate (last-90-day average ÷ 3).';
  } else if (kind === 'netcash') {
    const inAll = (state.paymentsIn || []).reduce((s, p) => s + N(p.amount), 0);
    const vp = _vendorPaid(null), ex = _expenses(null), lp = _labourPaid(null);
    total = inAll - (vp + ex + lp); totalColor = total >= 0 ? '#059669' : '#dc2626';
    title = '🏦 Net Cash Position';
    subtitle = 'Everything received in, minus everything paid out (to date)';
    cols = ['Flow', '', '', 'Amount', 'Count'];
    rows = [
      [{ v: 'Payments received (in)', color: '#059669' }, '', '', { v: '+ ' + M(inAll), strong: 1, color: '#059669' }, (state.paymentsIn || []).length + ''],
      [{ v: 'Vendor payments (out)', color: '#dc2626' }, '', '', { v: '− ' + M(vp), color: '#dc2626' }, (state.vendorPayments || []).length + ''],
      [{ v: 'Expenses (out)', color: '#dc2626' }, '', '', { v: '− ' + M(ex), color: '#dc2626' }, (state.expenses || []).length + ''],
      [{ v: 'Labour payments (out)', color: '#dc2626' }, '', '', { v: '− ' + M(lp), color: '#dc2626' }, (state.labourPayments || []).length + ''],
    ];
    foot = 'Net cash = total received − (vendor payments + expenses + labour payments), across all dates.';
  } else if (kind === 'projected') {
    const f = forecast30();
    total = f.projected; totalColor = f.projected >= 0 ? '#059669' : '#dc2626';
    title = f.projected >= 0 ? '✅ Projected Cash · 30d' : '⚠️ Projected Cash · 30d';
    subtitle = 'Where your cash lands after the next 30 days';
    cols = ['Component', '', '', 'Amount', ''];
    rows = [
      [{ v: 'Opening cash (today)', color: '#0f172a' }, '', '', { v: M(f.opening), strong: 1 }, ''],
      [{ v: 'Expected inflow (receivables)', color: '#059669' }, '', '', { v: '+ ' + M(f.inflow), color: '#059669' }, ''],
      [{ v: 'Expected outflow', color: '#dc2626' }, '', '', { v: '− ' + M(f.outflow), color: '#dc2626' }, ''],
    ];
    foot = 'Projected = Opening cash + Expected inflow − Expected outflow. Click the Inflow / Outflow tiles to see their sources.';
  } else if (kind === 'inventory') {
    const mats = Object.entries(_stockByMaterial()).map(([id, x]) => ({ name: (state.rawMaterials || []).find(r => r.id === id)?.name || 'Material', qty: x.qty, rate: x.rate, val: Math.max(0, x.qty) * x.rate })).filter(m => m.val > 0.5).sort((a, b) => b.val - a.val);
    total = mats.reduce((s, m) => s + m.val, 0); totalColor = '#7c3aed';
    title = '📦 Inventory Locked';
    subtitle = `${mats.length} material${mats.length !== 1 ? 's' : ''} in stock`;
    cols = ['Material', 'Qty', 'Rate', 'Value', ''];
    rows = mats.map(m => [m.name, m.qty.toLocaleString('en-IN', { maximumFractionDigits: 2 }), M(m.rate), { v: M(m.val), strong: 1, color: '#7c3aed' }, '']);
    foot = 'Value = current stock qty × last purchase rate, per material (from inventory transactions).';
  } else if (kind === 'ccc') {
    const dso = arDays(), dpo = apDays(), invd = inventoryDays(); total = dso + invd - dpo;
    title = '🔄 Cash Conversion Cycle';
    subtitle = 'How many days your cash is tied up (lower = better)';
    cols = ['Component', '', '', 'Days', ''];
    rows = [
      [{ v: 'AR days (time to collect, DSO)', color: '#2563eb' }, '', '', { v: '+ ' + dso, strong: 1 }, ''],
      [{ v: 'Inventory days (stock held)', color: '#7c3aed' }, '', '', { v: '+ ' + invd, strong: 1 }, ''],
      [{ v: 'AP days (time you take to pay, DPO)', color: '#ea580c' }, '', '', { v: '− ' + dpo, strong: 1 }, ''],
    ];
    foot = 'CCC = AR days + Inventory days − AP days. Collect faster and pay later to shrink it.';
    _openCfDetailModal(title, subtitle, cols, rows, foot, total + ' days', totalColor); return;
  } else if (kind === 'cc_recv') {
    // Command Center Receivables — aged, reconciles to the tile total (agg.total).
    const list = (state.clients || []).map(c => ({ name: c.name, ...(_clientAging(c.id)) })).filter(r => r.total > 0.5).sort((a, b) => b.total - a.total);
    total = list.reduce((s, r) => s + r.total, 0); totalColor = '#2563eb';
    title = '💰 Receivables — whom to receive from (aged)';
    subtitle = `${list.length} customer${list.length !== 1 ? 's' : ''} · overdue (31+ days) chase first`;
    cols = ['Client', '0–30', '31–60', '61–90', '90+', 'Total'];
    rows = list.map(r => [r.name, M(r.cur), { v: M(r.d30), color: '#d97706' }, { v: M(r.d60), color: '#ea580c' }, { v: M(r.d90), color: '#dc2626' }, { v: M(r.total), strong: 1 }]);
    foot = 'Each client\'s unpaid invoices bucketed by age (receipts applied oldest-first). 31+ day columns are overdue — chase those first.';
  } else if (kind === 'cc_pay') {
    // Command Center Payables = material (per vendor) + labour due + last-30-day expenses.
    const vlist = _apByVendor(); const ld = labourDue(); const ex30 = _expenses(30);
    rows = vlist.map(v => [v.name + ' (material)', M(v.purchased), M(v.paid), { v: M(v.outstanding), strong: 1, color: '#dc2626' }, { v: v.due || daysAgo(v.oldest), color: '#64748b' }]);
    if (ld > 0.5) rows.push([{ v: 'Labour wages due', color: '#7c3aed' }, '', '', { v: M(ld), strong: 1, color: '#dc2626' }, 'payroll']);
    if (ex30 > 0.5) rows.push([{ v: 'Expenses (last 30 days)', color: '#64748b' }, '', '', { v: M(ex30), strong: 1, color: '#dc2626' }, '30d run-rate']);
    total = vlist.reduce((s, v) => s + v.outstanding, 0) + Math.max(0, ld) + Math.max(0, ex30); totalColor = '#ea580c';
    title = '🧾 Payables — whom to pay';
    subtitle = `${vlist.length} vendor${vlist.length !== 1 ? 's' : ''} + labour + expenses`;
    cols = ['Item', 'Purchased', 'Paid', 'Outstanding', 'Due / oldest'];
    foot = 'Material = vendor bills − payments (per vendor), plus labour wages due and the last-30-day expense run-rate. Pay the oldest/due vendors first.';
  } else if (kind === 'cc_net4') {
    const s = _ccSnap || {}; total = s.net4 || 0; totalColor = (s.net4 || 0) >= 0 ? '#16a34a' : '#dc2626';
    title = (s.net4 || 0) >= 0 ? '📈 Net (4-week)' : '📉 Shortfall (4-week)';
    subtitle = 'Cash you\'ll have after 4 weeks of collections and dues';
    cols = ['Component', '', '', 'Amount', ''];
    rows = [
      [{ v: 'Cash position (today)', color: '#0d9488' }, '', '', { v: M(s.cash || 0), strong: 1 }, ''],
      [{ v: 'Expected collections (4 weeks)', color: '#059669' }, '', '', { v: '+ ' + M(s.expect4 || 0), color: '#059669' }, ''],
      [{ v: 'Dues (material + labour + expenses)', color: '#dc2626' }, '', '', { v: '− ' + M(s.committed4 || 0), color: '#dc2626' }, ''],
    ];
    foot = 'Net (4-week) = Cash + expected 4-week collections − upcoming dues. Click Receivables / Payables to see the underlying transactions.';
  } else return;

  _openCfDetailModal(title, subtitle, cols, rows, foot, M(total), totalColor);
};

function _openCfDetailModal(title, subtitle, cols, rows, foot, totalStr, totalColor) {
  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const cell = (c, i) => {
    const o = (c && typeof c === 'object') ? c : { v: c };
    const align = i === 0 ? 'left' : 'right';
    return `<td style="padding:9px 12px;text-align:${align};font-size:13px;${o.strong ? 'font-weight:800;' : ''}color:${o.color || '#334155'};border-bottom:1px solid #f1f5f9;white-space:nowrap;">${esc(o.v)}</td>`;
  };
  const body = rows.length
    ? rows.map(r => `<tr>${r.map(cell).join('')}</tr>`).join('')
    : `<tr><td colspan="${cols.length}" style="padding:24px;text-align:center;color:#94a3b8;font-size:13px;">Nothing outstanding here — clean book! 🎉</td></tr>`;
  document.getElementById('cfDetailOverlay')?.remove();
  const html = `<div id="cfDetailOverlay" onclick="if(event.target===this)window._cfCloseDetail()" style="position:fixed;inset:0;background:rgba(15,23,42,.55);backdrop-filter:blur(3px);z-index:300000;display:flex;align-items:center;justify-content:center;padding:16px;">
    <div style="background:#fff;border-radius:18px;max-width:640px;width:100%;max-height:88vh;overflow:auto;box-shadow:0 24px 60px rgba(0,0,0,.3);">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;padding:18px 20px;border-bottom:1px solid #eef2f7;position:sticky;top:0;background:#fff;">
        <div><h3 style="font-size:16px;font-weight:800;color:#0f172a;">${title}</h3><p style="font-size:12px;color:#64748b;margin-top:2px;">${subtitle}</p></div>
        <div style="text-align:right;"><div style="font-size:9px;font-weight:700;text-transform:uppercase;color:#94a3b8;">Total</div><div style="font-size:20px;font-weight:800;color:${totalColor};">${totalStr}</div></div>
      </div>
      <div style="overflow-x:auto;"><table style="width:100%;border-collapse:collapse;"><thead><tr>${cols.map((c, i) => `<th style="padding:8px 12px;text-align:${i === 0 ? 'left' : 'right'};font-size:10px;font-weight:700;text-transform:uppercase;color:#94a3b8;border-bottom:1px solid #e2e8f0;background:#f8fafc;">${c}</th>`).join('')}</tr></thead><tbody>${body}</tbody></table></div>
      <div style="padding:12px 20px;background:#f8fafc;border-top:1px solid #eef2f7;"><p style="font-size:11px;color:#64748b;line-height:1.5;">💡 ${foot}</p>
        <button onclick="window._cfCloseDetail()" style="margin-top:10px;width:100%;padding:10px;background:#0f172a;color:#fff;border:none;border-radius:10px;font-weight:700;font-size:13px;cursor:pointer;">Close</button></div>
    </div></div>`;
  document.body.insertAdjacentHTML('beforeend', html);
}
const _scoreRow = (label, value, bold, color) => `
  <div style="display:flex;justify-content:space-between;align-items:center;padding:9px 0;border-bottom:1px solid #f1f5f9;">
    <span style="font-size:13px;${bold ? 'font-weight:800;color:#0f172a;' : 'color:#475569;'}">${label}</span>
    <span style="font-size:14px;font-weight:${bold ? '800' : '700'};color:${color || '#0f172a'};">${value}</span>
  </div>`;
const _gradeBadge = (g) => { const c = g === 'A' ? '#059669' : g === 'B' ? '#d97706' : '#dc2626'; const bg = g === 'A' ? '#ecfdf5' : g === 'B' ? '#fffbeb' : '#fef2f2'; return `<span style="display:inline-flex;width:26px;height:26px;border-radius:8px;background:${bg};color:${c};font-weight:800;font-size:13px;align-items:center;justify-content:center;border:1px solid ${c}33;">${g}</span>`; };

// ── SECTION RENDERERS ─────────────────────────────────────────────────────────
function _renderOverview() {
  const cash = cashPosition(), ar = arOutstanding(), ap = apOutstanding();
  const dso = arDays(), dpo = apDays(), invD = inventoryDays(), ccc = dso + invD - dpo;
  const f = forecast30(), ps = profitScorecard(90);
  const projColor = f.projected >= 0 ? '#059669' : '#dc2626';
  const cccColor = ccc <= 30 ? '#059669' : ccc <= 60 ? '#d97706' : '#dc2626';
  const recv = clientScores().filter(c => c.outstanding > 1).slice(0, 5);
  const h = cashHealth();
  const hColor = h.grade === 'A' ? '#10b981' : h.grade === 'B' ? '#f59e0b' : '#ef4444';
  const meter = (label, v) => `<div style="flex:1;min-width:90px;"><div style="font-size:10px;color:#cbd5e1;font-weight:700;text-transform:uppercase;">${label}</div><div style="height:6px;background:rgba(255,255,255,.15);border-radius:4px;margin-top:4px;overflow:hidden;"><div style="width:${Math.round(v * 100)}%;height:100%;background:${hColor};"></div></div></div>`;
  return `
    <div style="background:linear-gradient(135deg,#0a0f1a,#0f1f35);border-radius:18px;padding:20px;margin-bottom:14px;color:#fff;display:flex;align-items:center;gap:22px;flex-wrap:wrap;">
      <div style="text-align:center;flex-shrink:0;">
        <div style="width:96px;height:96px;border-radius:50%;background:conic-gradient(${hColor} ${h.score * 3.6}deg, rgba(255,255,255,.12) 0deg);display:flex;align-items:center;justify-content:center;">
          <div style="width:74px;height:74px;border-radius:50%;background:#0a0f1a;display:flex;flex-direction:column;align-items:center;justify-content:center;"><span style="font-size:26px;font-weight:800;color:${hColor};line-height:1;">${h.score}</span><span style="font-size:9px;color:#94a3b8;">/ 100</span></div>
        </div>
        <div style="margin-top:6px;font-size:12px;font-weight:800;color:${hColor};">Grade ${h.grade}</div>
      </div>
      <div style="flex:1;min-width:240px;">
        <div style="font-size:15px;font-weight:800;margin-bottom:2px;">Cash Health Score</div>
        <div style="font-size:11px;color:#94a3b8;margin-bottom:12px;">Profitability × Speed × Consistency − Leakages</div>
        <div style="display:flex;gap:14px;flex-wrap:wrap;">
          ${meter('Profitability', h.profit01)}${meter('Speed', h.speed01)}${meter('Consistency', h.cons01)}
        </div>
      </div>
    </div>
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));gap:12px;margin-bottom:14px;">
      ${_tile('Net Cash Position', fmt(cash), 'Money in − money out', cash >= 0 ? '#0f172a' : '#dc2626', '🏦', 'netcash')}
      ${_tile('Expected Inflow · 30d', fmt(f.inflow), 'Outstanding receivables', '#059669', '📥', 'inflow')}
      ${_tile('Expected Outflow · 30d', fmt(f.outflow), 'Vendors + labour + OpEx', '#dc2626', '📤', 'outflow')}
      ${_tile('Projected Cash · 30d', fmt(f.projected), f.net >= 0 ? 'Surplus expected' : 'Gap — act now', projColor, f.projected >= 0 ? '✅' : '⚠️', 'projected')}
    </div>
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));gap:12px;margin-bottom:14px;">
      ${_tile('Receivables (AR)', fmt(ar), dso + ' AR days (DSO)', '#2563eb', '⏳', 'ar')}
      ${_tile('Payables (AP)', fmt(ap), dpo + ' AP days (DPO)', '#ea580c', '🧾', 'ap')}
      ${_tile('Inventory Locked', fmt(inventoryValue()), invD + ' inventory days', '#7c3aed', '📦', 'inventory')}
      ${_tile('Cash Conversion Cycle', ccc + ' days', ccc <= 30 ? 'Healthy' : ccc <= 60 ? 'Watch' : 'Too slow', cccColor, '🔄', 'ccc')}
    </div>
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:14px;">
      <div style="background:#fff;border:1px solid #e2e8f0;border-radius:16px;padding:18px;">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;"><h3 style="font-size:14px;font-weight:800;color:#0f172a;">📊 Profit Scorecard</h3><span style="font-size:10px;font-weight:700;color:#94a3b8;text-transform:uppercase;">Last 90 days</span></div>
        ${_scoreRow('Revenue', fmt(ps.revenue))}
        ${_scoreRow('− Direct cost (materials + labour)', fmt(ps.cogs), false, '#64748b')}
        ${_scoreRow('= Gross Profit', fmt(ps.gross), true, ps.gross >= 0 ? '#059669' : '#dc2626')}
        ${_scoreRow('− Operating expenses', fmt(ps.opex), false, '#64748b')}
        ${_scoreRow('= Net Profit', fmt(ps.net), true, ps.net >= 0 ? '#059669' : '#dc2626')}
        <div style="margin-top:10px;padding:10px;border-radius:10px;background:${ps.margin >= 10 ? '#ecfdf5' : ps.margin >= 0 ? '#fffbeb' : '#fef2f2'};display:flex;justify-content:space-between;align-items:center;"><span style="font-size:12px;font-weight:700;color:#334155;">Net Margin</span><span style="font-size:18px;font-weight:800;color:${ps.margin >= 10 ? '#059669' : ps.margin >= 0 ? '#d97706' : '#dc2626'};">${fmt1(ps.margin)}%</span></div>
      </div>
      <div style="background:#fff;border:1px solid #e2e8f0;border-radius:16px;padding:18px;">
        <h3 style="font-size:14px;font-weight:800;color:#0f172a;margin-bottom:10px;">💧 Where your cash is stuck</h3>
        ${recv.length ? recv.map(r => `<div style="display:flex;justify-content:space-between;align-items:center;padding:9px 0;border-bottom:1px solid #f1f5f9;"><span style="font-size:13px;color:#334155;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:55%;">${r.name} <span style="font-size:10px;color:#94a3b8;">· ${r.avgDays}d</span></span><span style="font-size:14px;font-weight:800;color:#dc2626;">${fmt(r.outstanding)}</span></div>`).join('') : '<p style="font-size:12px;color:#94a3b8;padding:8px 0;">No outstanding receivables — clean book! 🎉</p>'}
        ${recv.length ? `<p style="font-size:11px;color:#64748b;margin-top:10px;">👉 Chase your top 1–2 first. <b>Speed beats size.</b></p>` : ''}
      </div>
    </div>`;
}

function _renderClients() {
  const rows = clientScores();
  const cur = getCurrencySymbol();
  const aCount = rows.filter(r => r.grade === 'A').length;
  if (!rows.length) return '<div style="background:#fff;border:1px solid #e2e8f0;border-radius:16px;padding:28px;text-align:center;color:#94a3b8;font-size:13px;">No client billing yet — create sales invoices to score your clients.</div>';
  return `
    <div style="background:#fff;border:1px solid #e2e8f0;border-radius:16px;overflow:hidden;">
      <div style="padding:14px 18px;border-bottom:1px solid #f1f5f9;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;">
        <div><h3 style="font-size:14px;font-weight:800;color:#0f172a;">⭐ Client Scorecard (A / B / C)</h3><p style="font-size:11px;color:#94a3b8;">Payment speed (45%) · revenue value (30%) · order frequency (25%)</p></div>
        <span style="font-size:11px;font-weight:700;color:#059669;background:#ecfdf5;border:1px solid #a7f3d0;border-radius:999px;padding:4px 10px;">${aCount} A-grade client${aCount === 1 ? '' : 's'}</span>
      </div>
      <div style="overflow-x:auto;">
        <table style="width:100%;border-collapse:collapse;font-size:12px;min-width:640px;">
          <thead><tr style="background:#f8fafc;color:#64748b;text-transform:uppercase;font-size:10px;font-weight:800;">
            <th style="padding:9px 12px;text-align:left;">Client</th><th style="padding:9px 12px;text-align:center;">Orders</th><th style="padding:9px 12px;text-align:right;">Billed</th><th style="padding:9px 12px;text-align:right;">Outstanding</th><th style="padding:9px 12px;text-align:center;">Pays in</th><th style="padding:9px 12px;text-align:center;">Speed</th><th style="padding:9px 12px;text-align:center;">Value</th><th style="padding:9px 12px;text-align:center;">Score</th><th style="padding:9px 12px;text-align:center;">Grade</th>
          </tr></thead>
          <tbody>
          ${rows.map(c => `<tr style="border-top:1px solid #f1f5f9;">
            <td style="padding:9px 12px;font-weight:700;color:#0f172a;">${c.name}</td>
            <td style="padding:9px 12px;text-align:center;color:#475569;">${c.orders}</td>
            <td style="padding:9px 12px;text-align:right;color:#334155;">${cur}${Math.round(c.billed).toLocaleString('en-IN')}</td>
            <td style="padding:9px 12px;text-align:right;font-weight:700;color:${c.outstanding > 1 ? '#dc2626' : '#94a3b8'};">${cur}${Math.round(c.outstanding).toLocaleString('en-IN')}</td>
            <td style="padding:9px 12px;text-align:center;color:${c.avgDays > 45 ? '#dc2626' : c.avgDays > 0 ? '#d97706' : '#059669'};font-weight:700;">${c.outstanding <= 1 ? '✓ paid' : c.avgDays + 'd'}</td>
            <td style="padding:9px 12px;text-align:center;">${_bar(c.paymentSpeed)}</td>
            <td style="padding:9px 12px;text-align:center;">${_bar(c.value)}</td>
            <td style="padding:9px 12px;text-align:center;font-weight:800;color:#0f172a;">${c.score}</td>
            <td style="padding:9px 12px;text-align:center;">${_gradeBadge(c.grade)}</td>
          </tr>`).join('')}
          </tbody>
        </table>
      </div>
      <div style="padding:14px 18px;background:#f0fdf4;border-top:1px solid #dcfce7;font-size:12px;color:#166534;"><b>Grow your A-clients:</b> give them priority service & flexible terms — they pay fast and order often. Put <b>C-clients</b> on advance/partial payment.</div>
    </div>`;
}
const _bar = (pct) => `<div style="display:inline-block;width:54px;height:7px;border-radius:4px;background:#e2e8f0;overflow:hidden;vertical-align:middle;"><div style="width:${Math.max(3, pct)}%;height:100%;background:${pct >= 70 ? '#059669' : pct >= 45 ? '#d97706' : '#dc2626'};"></div></div>`;

function _renderLeaks() {
  const L = detectLeaks();
  const card = (icon, title, amount, count, desc, action, color) => `
    <div style="background:#fff;border:1px solid #e2e8f0;border-left:4px solid ${color};border-radius:16px;padding:18px;">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:6px;">
        <div><div style="font-size:22px;">${icon}</div><h3 style="font-size:14px;font-weight:800;color:#0f172a;margin-top:6px;">${title}</h3></div>
        <div style="text-align:right;"><div style="font-size:22px;font-weight:800;color:${color};">${fmt(amount)}</div><div style="font-size:10px;color:#94a3b8;font-weight:700;">${count} item${count === 1 ? '' : 's'}</div></div>
      </div>
      <p style="font-size:12px;color:#64748b;margin:6px 0;">${desc}</p>
      <p style="font-size:12px;font-weight:700;color:${color};">👉 ${action}</p>
    </div>`;
  const total = L.late.amount + L.slowInv.amount + L.waste.amount;
  return `
    <div style="background:linear-gradient(135deg,#0f172a,#1e293b);border-radius:16px;padding:18px;margin-bottom:14px;color:#fff;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;">
      <div><div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:#94a3b8;">Total cash leaking</div><div style="font-size:28px;font-weight:800;color:#fca5a5;">${fmt(total)}</div></div>
      <div style="font-size:12px;color:#cbd5e1;max-width:300px;">Plug these 3 leaks and the cash returns to your bank — no new sales needed.</div>
    </div>
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:14px;">
      ${card('⏳', 'Late-paying customers', L.late.amount, L.late.count, 'Receivables aged over 45 days — the slowest cash in your business.', 'Run the 3-strike follow-up: friendly reminder → confirm release date → escalate.', '#dc2626')}
      ${card('📦', 'Slow-moving inventory', L.slowInv.amount, L.slowInv.count, 'Stock with no movement in 60+ days — cash frozen on the shelf.', 'Use it on the next project, return to vendor, or stop re-ordering it.', '#7c3aed')}
      ${card('🔥', 'Wasteful expenses', L.waste.amount, L.waste.count, 'Red-flag spends (bulk/unplanned/repair/penalty) in the last 90 days.', 'Review each — convert unplanned buys into planned, budgeted purchases.', '#ea580c')}
    </div>`;
}

function _renderForecast() {
  const tf = tieredForecast(), wk = weeklyPlanner(), cal = financeCalendar();
  const cur = getCurrencySymbol();
  const inTier = (label, amt, color, note) => `
    <div style="flex:1;min-width:150px;background:#fff;border:1px solid #e2e8f0;border-top:4px solid ${color};border-radius:14px;padding:14px;">
      <div style="font-size:11px;font-weight:700;color:#64748b;">${label}</div>
      <div style="font-size:20px;font-weight:800;color:${color};margin-top:4px;">${fmt(amt)}</div>
      <div style="font-size:10px;color:#94a3b8;margin-top:2px;">${note}</div>
    </div>`;
  const projColor = tf.projected >= 0 ? '#059669' : '#dc2626';
  return `
    <!-- Tiered 30-day forecast -->
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-bottom:16px;">
      <div style="background:#fff;border:1px solid #e2e8f0;border-radius:16px;padding:16px;">
        <h3 style="font-size:13px;font-weight:800;color:#059669;margin-bottom:10px;">📥 Expected Inflows · 30 days</h3>
        <div style="display:flex;gap:10px;flex-wrap:wrap;">
          ${inTier('Confirmed (A)', tf.confirmed, '#059669', 'Reliable payers')}
          ${inTier('Likely (B)', tf.likely, '#d97706', 'Usually pay')}
          ${inTier('Possible (C)', tf.possible, '#dc2626', 'Chase hard')}
        </div>
      </div>
      <div style="background:#fff;border:1px solid #e2e8f0;border-radius:16px;padding:16px;">
        <h3 style="font-size:13px;font-weight:800;color:#dc2626;margin-bottom:10px;">📤 Committed Outflows · 30 days</h3>
        <div style="display:flex;gap:10px;flex-wrap:wrap;">
          ${inTier('Fixed', tf.fixed, '#1e3a8a', 'Rent, salary, EMI')}
          ${inTier('Vendors', tf.vendor, '#ea580c', 'Payables due')}
          ${inTier('Labour', tf.labour, '#7c3aed', 'Wages due')}
          ${inTier('Variable', tf.variable, '#0891b2', 'Fuel, transport…')}
          ${tf.commitOut > 0 ? inTier('Committed', tf.commitOut, '#be123c', 'Your planned spends') : ''}
        </div>
      </div>
    </div>
    <div style="background:${tf.gap >= 0 ? 'linear-gradient(135deg,#065f46,#059669)' : 'linear-gradient(135deg,#7f1d1d,#dc2626)'};border-radius:16px;padding:16px 18px;margin-bottom:18px;color:#fff;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;">
      <div><div style="font-size:11px;text-transform:uppercase;letter-spacing:.05em;opacity:.85;">30-day projected cash (opening ${fmt(tf.opening)})</div><div style="font-size:26px;font-weight:800;">${fmt(tf.projected)}</div></div>
      <div style="font-size:13px;opacity:.95;max-width:300px;">${tf.gap >= 0 ? '✅ Surplus — deploy it: pre-pay A-vendors or set aside profit.' : '⚠️ Gap — accelerate A/B collections before committing new spend.'}</div>
    </div>

    <!-- Weekly cash planner -->
    <div style="background:#fff;border:1px solid #e2e8f0;border-radius:16px;overflow:hidden;margin-bottom:16px;">
      <div style="padding:14px 18px;border-bottom:1px solid #f1f5f9;"><h3 style="font-size:14px;font-weight:800;color:#0f172a;">📅 Weekly Cash Planner (next 4 weeks)</h3></div>
      <div style="overflow-x:auto;"><table style="width:100%;border-collapse:collapse;font-size:12px;min-width:620px;">
        <thead><tr style="background:#f8fafc;color:#64748b;text-transform:uppercase;font-size:10px;font-weight:800;">
          <th style="padding:9px 14px;text-align:left;">Week</th><th style="padding:9px 14px;text-align:right;">Expected In</th><th style="padding:9px 14px;text-align:right;">Committed Out</th><th style="padding:9px 14px;text-align:right;">Gap</th><th style="padding:9px 14px;text-align:right;">Running Cash</th><th style="padding:9px 14px;text-align:left;">Strategy</th>
        </tr></thead>
        <tbody>${wk.map(r => `<tr style="border-top:1px solid #f1f5f9;">
          <td style="padding:9px 14px;font-weight:700;">Week ${r.week}</td>
          <td style="padding:9px 14px;text-align:right;color:#059669;font-weight:700;">${cur}${Math.round(r.inflow).toLocaleString('en-IN')}</td>
          <td style="padding:9px 14px;text-align:right;color:#dc2626;font-weight:700;">${cur}${Math.round(r.outflow).toLocaleString('en-IN')}</td>
          <td style="padding:9px 14px;text-align:right;font-weight:700;color:${r.gap >= 0 ? '#059669' : '#dc2626'};">${cur}${Math.round(r.gap).toLocaleString('en-IN')}</td>
          <td style="padding:9px 14px;text-align:right;font-weight:800;color:${r.running >= 0 ? '#0f172a' : '#dc2626'};">${cur}${Math.round(r.running).toLocaleString('en-IN')}</td>
          <td style="padding:9px 14px;color:#475569;font-size:11px;">${r.strat}</td>
        </tr>`).join('')}</tbody>
      </table></div>
    </div>

    <!-- Finance calendar -->
    <div style="background:#fff;border:1px solid #e2e8f0;border-radius:16px;padding:18px;">
      <h3 style="font-size:14px;font-weight:800;color:#0f172a;margin-bottom:4px;">🗓️ Finance Calendar — this month</h3>
      <p style="font-size:11px;color:#94a3b8;margin-bottom:12px;">"Planned expense creates power." Fixed obligations never miss a date.</p>
      ${cal.map(it => { const c = it.status === 'past' ? '#94a3b8' : it.status === 'today' ? '#dc2626' : '#0f172a'; const tag = it.status === 'past' ? 'done/passed' : it.status === 'today' ? 'TODAY' : 'upcoming';
        return `<div style="display:flex;align-items:center;gap:12px;padding:9px 0;border-bottom:1px solid #f1f5f9;">
          <div style="width:42px;text-align:center;"><div style="font-size:16px;font-weight:800;color:${c};">${it.d}</div></div>
          <div style="flex:1;"><div style="font-size:13px;font-weight:700;color:${c};">${it.icon} ${it.label}</div><div style="font-size:10px;color:#94a3b8;text-transform:uppercase;">${it.type} · ${tag}</div></div>
          <div style="font-size:13px;font-weight:800;color:${c};">${it.amount != null ? fmt(it.amount) : '—'}</div>
        </div>`; }).join('')}
    </div>`;
}

function _renderTools() {
  const cur = getCurrencySymbol();
  const vrows = vendorScores();
  const dso = arDays();
  const p = _settings().creditPolicy;
  // simulator base figures (annualised)
  const revAnnual = _billed(365) || _billed(90) * 4;
  const cogsAnnual = (_purchased(365) + _labourBilled(365)) || (_purchased(90) + _labourBilled(90)) * 4;
  const opexAnnual = _expenses(365) || _expenses(90) * 4;
  window._cfSimBase = { revAnnual, cogsAnnual, opexAnnual, ar: arOutstanding(), inv: inventoryValue() };
  const clsBadge = (c) => { const col = c === 'A' ? '#dc2626' : c === 'B' ? '#d97706' : '#64748b'; return `<span style="font-size:10px;font-weight:800;color:${col};background:${col}15;border:1px solid ${col}30;border-radius:6px;padding:2px 7px;">${c}</span>`; };
  const sl = (id, label, unit, def) => `<div style="display:flex;align-items:center;gap:10px;padding:7px 0;"><span style="flex:1;font-size:12px;color:#334155;font-weight:600;">${label}</span><input id="${id}" type="number" min="0" step="0.5" value="${def}" oninput="window._cfSimulate()" style="width:60px;padding:5px;border:1px solid #e2e8f0;border-radius:7px;text-align:center;font-size:13px;font-weight:700;"><span style="font-size:11px;color:#94a3b8;width:34px;">${unit}</span></div>`;

  return `
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(320px,1fr));gap:14px;">
      <!-- Vendor ABC -->
      <div style="background:#fff;border:1px solid #e2e8f0;border-radius:16px;overflow:hidden;">
        <div style="padding:14px 18px;border-bottom:1px solid #f1f5f9;"><h3 style="font-size:14px;font-weight:800;color:#0f172a;">🏭 Vendor Management (A / B / C)</h3><p style="font-size:11px;color:#94a3b8;">A = critical (pay on time) · C = replaceable (negotiate terms)</p></div>
        <div style="overflow-x:auto;"><table style="width:100%;border-collapse:collapse;font-size:12px;min-width:420px;">
          <thead><tr style="background:#f8fafc;color:#64748b;text-transform:uppercase;font-size:10px;font-weight:800;"><th style="padding:8px 12px;text-align:left;">Vendor</th><th style="padding:8px 12px;text-align:center;">Bills</th><th style="padding:8px 12px;text-align:right;">Purchased</th><th style="padding:8px 12px;text-align:right;">Outstanding</th><th style="padding:8px 12px;text-align:center;">Class</th></tr></thead>
          <tbody>${vrows.length ? vrows.map(v => `<tr style="border-top:1px solid #f1f5f9;"><td style="padding:8px 12px;font-weight:700;color:#0f172a;">${v.name}</td><td style="padding:8px 12px;text-align:center;color:#475569;">${v.bills}</td><td style="padding:8px 12px;text-align:right;">${cur}${Math.round(v.purchased).toLocaleString('en-IN')}</td><td style="padding:8px 12px;text-align:right;font-weight:700;color:${v.outstanding > 1 ? '#ea580c' : '#94a3b8'};">${cur}${Math.round(v.outstanding).toLocaleString('en-IN')}</td><td style="padding:8px 12px;text-align:center;">${clsBadge(v.cls)}</td></tr>`).join('') : '<tr><td colspan="5" style="padding:18px;text-align:center;color:#94a3b8;">No vendor purchases yet.</td></tr>'}</tbody>
        </table></div>
        <div style="padding:12px 18px;background:#fff7ed;border-top:1px solid #fed7aa;font-size:12px;color:#9a3412;"><b>A-vendors:</b> set a fixed weekly payment day & keep them happy. <b>C-vendors:</b> push for 30–45 day terms or partial payments.</div>
      </div>

      <!-- Credit Policy (editable) -->
      <div style="background:#fff;border:1px solid #e2e8f0;border-radius:16px;padding:18px;">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;">
          <h3 style="font-size:14px;font-weight:800;color:#0f172a;">📋 Credit Policy</h3>
          <button onclick="window._cfSaveCreditPolicy()" style="padding:6px 14px;background:linear-gradient(135deg,#2563eb,#1d4ed8);color:#fff;border:none;border-radius:8px;font-size:12px;font-weight:700;cursor:pointer;">Save</button>
        </div>
        <p style="font-size:11px;color:#94a3b8;margin-bottom:12px;">Clients currently take <b>${dso} days</b> on average — set your rules and enforce them.</p>
        <div style="display:flex;align-items:center;gap:8px;padding:7px 0;border-bottom:1px solid #f1f5f9;"><span style="flex:1;font-size:12px;color:#334155;font-weight:600;">Max credit days</span><input id="cpMaxDays" type="number" min="0" value="${N(p.maxDays)}" style="width:70px;padding:6px;border:1px solid #e2e8f0;border-radius:7px;text-align:center;font-size:13px;font-weight:700;"><span style="font-size:11px;color:#94a3b8;">days</span></div>
        <div style="display:flex;align-items:center;gap:8px;padding:7px 0;border-bottom:1px solid #f1f5f9;"><span style="flex:1;font-size:12px;color:#334155;font-weight:600;">Max limit (× monthly order)</span><input id="cpMaxLimit" type="number" min="0" step="0.5" value="${N(p.maxLimitMult)}" style="width:70px;padding:6px;border:1px solid #e2e8f0;border-radius:7px;text-align:center;font-size:13px;font-weight:700;"><span style="font-size:11px;color:#94a3b8;">×</span></div>
        <div style="padding:7px 0;border-bottom:1px solid #f1f5f9;"><div style="font-size:12px;color:#334155;font-weight:600;margin-bottom:4px;">Required documents</div><input id="cpDocs" type="text" value="${(p.docs || '').replace(/"/g, '&quot;')}" style="width:100%;padding:7px;border:1px solid #e2e8f0;border-radius:7px;font-size:12px;"></div>
        <div style="padding:7px 0;"><div style="font-size:12px;color:#334155;font-weight:600;margin-bottom:4px;">Consequence of delay</div><input id="cpConseq" type="text" value="${(p.consequence || '').replace(/"/g, '&quot;')}" style="width:100%;padding:7px;border:1px solid #e2e8f0;border-radius:7px;font-size:12px;"></div>
        <div style="margin-top:10px;padding:10px;border-radius:10px;background:#eff6ff;font-size:11px;color:#1e40af;">Then apply the <b>3-strike rule</b>: friendly reminder → confirm release date → escalate & pause supply.</div>
      </div>
    </div>

    <!-- 1% Impact Simulator -->
    <div style="background:#fff;border:1px solid #e2e8f0;border-radius:16px;padding:18px;margin-top:14px;">
      <h3 style="font-size:14px;font-weight:800;color:#0f172a;margin-bottom:2px;">🧪 The 1% Impact Simulator</h3>
      <p style="font-size:11px;color:#94a3b8;margin-bottom:12px;">Tiny moves, huge cash. Adjust the levers and watch the annual impact.</p>
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:18px;">
        <div>
          ${sl('simPrice', 'Increase price', '%', 1)}
          ${sl('simCost', 'Reduce direct cost', '%', 1)}
          ${sl('simOverhead', 'Reduce overhead', '%', 1)}
          ${sl('simArDays', 'Collect faster', 'days', 1)}
          ${sl('simInv', 'Reduce inventory', '%', 1)}
        </div>
        <div style="display:flex;flex-direction:column;justify-content:center;gap:10px;background:#f0fdf4;border:1px solid #bbf7d0;border-radius:14px;padding:16px;">
          <div style="display:flex;justify-content:space-between;"><span style="font-size:12px;color:#166534;font-weight:600;">Extra annual profit</span><span id="simProfitOut" style="font-size:15px;font-weight:800;color:#059669;">+₹0</span></div>
          <div style="display:flex;justify-content:space-between;"><span style="font-size:12px;color:#166534;font-weight:600;">Cash freed up</span><span id="simCashOut" style="font-size:15px;font-weight:800;color:#059669;">+₹0</span></div>
          <div style="border-top:1px dashed #86efac;padding-top:10px;display:flex;justify-content:space-between;align-items:center;"><span style="font-size:13px;color:#14532d;font-weight:800;">Total cash impact</span><span id="simTotalOut" style="font-size:20px;font-weight:800;color:#047857;">₹0</span></div>
        </div>
      </div>
    </div>`;
}

function _renderSurvival() {
  const s = survival();
  const cur = getCurrencySymbol();
  const rw = s.runwayMonths;
  const rwColor = rw >= 6 ? '#059669' : rw >= 3 ? '#d97706' : '#dc2626';
  const rwLabel = rw >= 99 ? '∞' : fmt1(rw);
  const resPct = s.targetReserve > 0 ? Math.min(100, Math.max(0, s.cash / s.targetReserve * 100)) : 0;
  const beColor = s.beAchieved >= 100 ? '#059669' : s.beAchieved >= 70 ? '#d97706' : '#dc2626';
  return `
    <!-- RUNWAY hero -->
    <div style="background:linear-gradient(135deg,#0a0f1a,#0f1f35);border-radius:18px;padding:22px;margin-bottom:14px;color:#fff;display:flex;align-items:center;gap:24px;flex-wrap:wrap;">
      <div style="text-align:center;flex-shrink:0;">
        <div style="font-size:48px;font-weight:800;color:${rwColor};line-height:1;">${rwLabel}</div>
        <div style="font-size:12px;color:#94a3b8;font-weight:700;margin-top:2px;">MONTHS RUNWAY</div>
      </div>
      <div style="flex:1;min-width:240px;">
        <div style="font-size:16px;font-weight:800;margin-bottom:4px;">If income stopped today, you survive ${rwLabel === '∞' ? 'indefinitely' : rwLabel + ' months'}.</div>
        <div style="font-size:12px;color:#cbd5e1;">Net cash ${fmt(s.cash)} ÷ fixed monthly burn ${fmt(s.burn)} (rent, salaries, EMI, wages). ${rw < 3 ? '🚨 Below 3 months — build reserves before growth.' : rw < 6 ? '🟡 Okay — aim for 6 months.' : '🟢 Strong buffer.'}</div>
      </div>
    </div>

    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:14px;">
      <!-- Reserve target (editable) -->
      <div style="background:#fff;border:1px solid #e2e8f0;border-radius:16px;padding:18px;">
        <h3 style="font-size:14px;font-weight:800;color:#0f172a;margin-bottom:4px;">🛡️ Cash Reserve Target</h3>
        <p style="font-size:11px;color:#94a3b8;margin-bottom:12px;">Decide how many months of fixed costs you want safely in the bank (Pt 29).</p>
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:12px;">
          <span style="font-size:13px;color:#334155;font-weight:600;">Target reserve:</span>
          <input id="cfReserveMonths" type="number" min="0" step="0.5" value="${s.reserveMonths}" style="width:64px;padding:7px;border:1px solid #e2e8f0;border-radius:8px;text-align:center;font-size:14px;font-weight:700;">
          <span style="font-size:13px;color:#64748b;">months</span>
          <button onclick="window._cfSaveReserve()" style="margin-left:auto;padding:7px 14px;background:linear-gradient(135deg,#059669,#10b981);color:#fff;border:none;border-radius:8px;font-size:12px;font-weight:700;cursor:pointer;">Save</button>
        </div>
        ${_scoreRow('Target reserve amount', fmt(s.targetReserve), true)}
        ${_scoreRow('Currently in bank', fmt(s.cash), false, s.cash >= s.targetReserve ? '#059669' : '#334155')}
        ${_scoreRow(s.reserveGap > 0 ? 'Still to set aside' : 'Reserve fully funded', s.reserveGap > 0 ? fmt(s.reserveGap) : '✓', true, s.reserveGap > 0 ? '#dc2626' : '#059669')}
        <div style="height:8px;background:#e2e8f0;border-radius:5px;margin-top:10px;overflow:hidden;"><div style="width:${resPct}%;height:100%;background:${resPct >= 100 ? '#059669' : '#f59e0b'};"></div></div>
        <div style="font-size:10px;color:#94a3b8;margin-top:4px;text-align:right;">${fmt1(resPct)}% funded</div>
      </div>

      <!-- Break-even -->
      <div style="background:#fff;border:1px solid #e2e8f0;border-radius:16px;padding:18px;">
        <h3 style="font-size:14px;font-weight:800;color:#0f172a;margin-bottom:4px;">⚖️ Break-even Point</h3>
        <p style="font-size:11px;color:#94a3b8;margin-bottom:12px;">The revenue you need each month just to cover fixed costs.</p>
        <div style="text-align:center;padding:8px 0;">
          <div style="font-size:30px;font-weight:800;color:#0f172a;">${fmt(s.breakEvenRev)}<span style="font-size:13px;color:#94a3b8;font-weight:600;"> / month</span></div>
          <div style="font-size:11px;color:#64748b;margin-top:2px;">at your ${fmt1(s.marginRatio * 100)}% gross margin</div>
        </div>
        ${_scoreRow('Your current monthly revenue', fmt(s.monthlyRev))}
        <div style="margin-top:8px;padding:10px;border-radius:10px;background:${s.beAchieved >= 100 ? '#ecfdf5' : '#fffbeb'};display:flex;justify-content:space-between;align-items:center;">
          <span style="font-size:12px;font-weight:700;color:#334155;">Break-even achieved</span>
          <span style="font-size:18px;font-weight:800;color:${beColor};">${fmt1(s.beAchieved)}%</span>
        </div>
        <div style="height:8px;background:#e2e8f0;border-radius:5px;margin-top:8px;overflow:hidden;"><div style="width:${Math.min(100, s.beAchieved)}%;height:100%;background:${beColor};"></div></div>
        <p style="font-size:11px;color:#64748b;margin-top:8px;">${s.beAchieved >= 100 ? '🟢 Every rupee above this is profit.' : '🟡 You are below break-even — raise prices, cut fixed cost, or sell more.'}</p>
      </div>
    </div>`;
}

function _renderTargets() {
  const t = _settings().targets;
  const rows = targetsScorecard();
  const cur = getCurrencySymbol();
  const dot = { green: '#10b981', amber: '#f59e0b', red: '#ef4444' };
  const dotLabel = { green: 'On track', amber: 'Watch', red: 'Off track' };
  const onTrack = rows.filter(r => r.status === 'green').length;
  const fmtV = (r, v) => r.fmt === 'money' ? fmt(v) : r.fmt === 'pct' ? fmt1(v) + '%' : Math.round(v) + 'd';
  const now = new Date().toLocaleString('en-IN', { month: 'long', year: 'numeric' });
  return `
    <div style="background:linear-gradient(135deg,#0a0f1a,#0f1f35);border-radius:16px;padding:18px;margin-bottom:16px;color:#fff;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px;">
      <div><div style="font-size:11px;text-transform:uppercase;letter-spacing:.05em;color:#94a3b8;">Board snapshot · ${now}</div><div style="font-size:20px;font-weight:800;">Plan vs Actual</div></div>
      <div style="text-align:right;"><div style="font-size:26px;font-weight:800;color:${onTrack >= 3 ? '#10b981' : onTrack >= 2 ? '#f59e0b' : '#ef4444'};">${onTrack}/4</div><div style="font-size:11px;color:#94a3b8;">targets on track</div></div>
    </div>

    <!-- Variance table -->
    <div style="background:#fff;border:1px solid #e2e8f0;border-radius:16px;overflow:hidden;margin-bottom:16px;">
      <div style="overflow-x:auto;"><table style="width:100%;border-collapse:collapse;font-size:13px;min-width:520px;">
        <thead><tr style="background:#f8fafc;color:#64748b;text-transform:uppercase;font-size:10px;font-weight:800;"><th style="padding:11px 16px;text-align:left;">Metric</th><th style="padding:11px 16px;text-align:right;">Target</th><th style="padding:11px 16px;text-align:right;">Actual (monthly)</th><th style="padding:11px 16px;text-align:right;">Variance</th><th style="padding:11px 16px;text-align:center;">Status</th></tr></thead>
        <tbody>${rows.map(r => {
          const variance = r.lowerBetter ? r.target - r.actual : r.actual - r.target;
          const vColor = (r.lowerBetter ? variance >= 0 : variance >= 0) ? '#059669' : '#dc2626';
          return `<tr style="border-top:1px solid #f1f5f9;">
            <td style="padding:11px 16px;font-weight:700;color:#0f172a;">${r.metric}</td>
            <td style="padding:11px 16px;text-align:right;color:#64748b;">${r.target ? fmtV(r, r.target) : '—'}</td>
            <td style="padding:11px 16px;text-align:right;font-weight:800;color:#0f172a;">${fmtV(r, r.actual)}</td>
            <td style="padding:11px 16px;text-align:right;font-weight:700;color:${r.target ? vColor : '#cbd5e1'};">${r.target ? (variance >= 0 ? '+' : '') + fmtV(r, Math.abs(variance)).replace(/^/, variance < 0 ? '-' : '') : '—'}</td>
            <td style="padding:11px 16px;text-align:center;"><span style="display:inline-flex;align-items:center;gap:6px;font-size:11px;font-weight:700;color:${dot[r.status]};"><span style="width:9px;height:9px;border-radius:50%;background:${dot[r.status]};"></span>${dotLabel[r.status]}</span></td>
          </tr>`; }).join('')}</tbody>
      </table></div>
    </div>

    <!-- Set targets -->
    <div style="background:#fff;border:1px solid #e2e8f0;border-radius:16px;padding:18px;">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;">
        <h3 style="font-size:14px;font-weight:800;color:#0f172a;">🎯 Set Your Monthly Targets</h3>
        <button onclick="window._cfSaveTargets()" style="padding:7px 16px;background:linear-gradient(135deg,#059669,#10b981);color:#fff;border:none;border-radius:8px;font-size:12px;font-weight:700;cursor:pointer;">Save Targets</button>
      </div>
      <p style="font-size:11px;color:#94a3b8;margin-bottom:14px;">Decide what "winning" looks like — the system tracks you against it every day.</p>
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:14px;">
        <div><label style="font-size:11px;font-weight:700;color:#64748b;display:block;margin-bottom:5px;">Monthly Revenue (${cur})</label><input id="tgtRevenue" type="number" min="0" value="${N(t.revenue)}" style="width:100%;padding:9px;border:1px solid #e2e8f0;border-radius:8px;font-size:14px;font-weight:700;"></div>
        <div><label style="font-size:11px;font-weight:700;color:#64748b;display:block;margin-bottom:5px;">Net Margin (%)</label><input id="tgtMargin" type="number" min="0" step="0.5" value="${N(t.margin)}" style="width:100%;padding:9px;border:1px solid #e2e8f0;border-radius:8px;font-size:14px;font-weight:700;"></div>
        <div><label style="font-size:11px;font-weight:700;color:#64748b;display:block;margin-bottom:5px;">Monthly Net Profit (${cur})</label><input id="tgtNetProfit" type="number" min="0" value="${N(t.netProfit)}" style="width:100%;padding:9px;border:1px solid #e2e8f0;border-radius:8px;font-size:14px;font-weight:700;"></div>
        <div><label style="font-size:11px;font-weight:700;color:#64748b;display:block;margin-bottom:5px;">Max AR Days</label><input id="tgtArDays" type="number" min="0" value="${N(t.arDays)}" style="width:100%;padding:9px;border:1px solid #e2e8f0;border-radius:8px;font-size:14px;font-weight:700;"></div>
      </div>
    </div>`;
}

function _renderProfitFirst() {
  const f = profitFirst();
  const cur = getCurrencySymbol();
  const buckets = [
    { k: 'profit', id: 'pfProfit', label: 'Profit', icon: '🏆', color: '#059669', note: 'Set aside — never touch. Your reward.', amt: f.profit },
    { k: 'ownerPay', id: 'pfOwnerPay', label: 'Owner Pay', icon: '👤', color: '#2563eb', note: 'Pay yourself a real salary, first.', amt: f.ownerPay },
    { k: 'tax', id: 'pfTax', label: 'Tax Reserve', icon: '🏛️', color: '#d97706', note: 'GST + income tax — kept ready, no shocks.', amt: f.tax },
    { k: 'opex', id: 'pfOpex', label: 'Operating Expenses', icon: '⚙️', color: '#64748b', note: 'Runs the business — what is left.', amt: f.opex },
  ];
  const sumOk = f.sum === 100;
  return `
    <div style="background:linear-gradient(135deg,#064e3b,#059669);border-radius:16px;padding:20px;margin-bottom:16px;color:#fff;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px;">
      <div><div style="font-size:11px;text-transform:uppercase;letter-spacing:.05em;opacity:.85;">Allocate first, spend what's left</div><div style="font-size:20px;font-weight:800;">Profit-First on ${fmt(f.income)}/mo income</div><div style="font-size:11px;opacity:.85;margin-top:2px;">Based on your average monthly collections.</div></div>
      <div style="font-size:12px;opacity:.95;max-width:280px;">Transfer each bucket to a <b>separate bank account</b> on a fixed day. Profit you can't see, you won't spend.</div>
    </div>

    <!-- Allocation cards -->
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:14px;margin-bottom:16px;">
      ${buckets.map(b => `
        <div style="background:#fff;border:1px solid #e2e8f0;border-top:4px solid ${b.color};border-radius:16px;padding:16px;">
          <div style="display:flex;justify-content:space-between;align-items:center;"><span style="font-size:20px;">${b.icon}</span><div style="display:flex;align-items:center;gap:6px;"><input id="${b.id}" type="number" min="0" max="100" value="${f.pct[b.k]}" oninput="window._cfPfPreview&&window._cfPfPreview()" style="width:56px;padding:5px;border:1px solid #e2e8f0;border-radius:7px;text-align:center;font-size:14px;font-weight:800;color:${b.color};"><span style="font-size:13px;color:#94a3b8;font-weight:700;">%</span></div></div>
          <div style="font-size:13px;font-weight:800;color:#0f172a;margin-top:8px;">${b.label}</div>
          <div style="font-size:22px;font-weight:800;color:${b.color};margin-top:2px;" data-pf-amt="${b.k}">${fmt(b.amt)}<span style="font-size:11px;color:#94a3b8;font-weight:600;">/mo</span></div>
          <div style="font-size:10px;color:#94a3b8;margin-top:4px;">${b.note}</div>
        </div>`).join('')}
    </div>

    <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px;margin-bottom:16px;">
      <div style="font-size:12px;font-weight:700;color:${sumOk ? '#059669' : '#dc2626'};">Total allocation: <span data-pf-sum>${f.sum}</span>% ${sumOk ? '✓' : '— must equal 100%'}</div>
      <button onclick="window._cfSaveProfitFirst()" style="padding:9px 18px;background:linear-gradient(135deg,#059669,#10b981);color:#fff;border:none;border-radius:9px;font-size:13px;font-weight:700;cursor:pointer;">Save Allocation</button>
    </div>

    <!-- Reality check -->
    <div style="background:#fff;border:1px solid #e2e8f0;border-radius:16px;padding:18px;">
      <h3 style="font-size:14px;font-weight:800;color:#0f172a;margin-bottom:10px;">🔍 Reality Check — are you living within OpEx?</h3>
      ${_scoreRow('Your target OpEx budget', fmt(f.opex) + '/mo', true)}
      ${_scoreRow('Your actual operating spend', fmt(f.actualMonthlyCost) + '/mo', false, f.overspend > 0 ? '#dc2626' : '#059669')}
      <div style="margin-top:10px;padding:12px;border-radius:10px;background:${f.overspend > 0 ? '#fef2f2' : '#ecfdf5'};font-size:12px;color:${f.overspend > 0 ? '#991b1b' : '#166534'};font-weight:600;">
        ${f.overspend > 0
          ? `⚠️ You're overspending by <b>${fmt(f.overspend)}/mo</b>. Trim this to fund Profit + Owner Pay + Tax. Small, steady cuts beat one big purge.`
          : `🟢 You're within budget — your Profit, Owner Pay and Tax buckets are fully fundable. Keep the discipline.`}
      </div>
    </div>`;
}

// Live preview of allocation amounts as the owner edits the % (no save needed).
window._cfPfPreview = function () {
  const f = profitFirst();
  const g = (id) => parseFloat(document.getElementById(id)?.value) || 0;
  const pct = { profit: g('pfProfit'), ownerPay: g('pfOwnerPay'), tax: g('pfTax'), opex: g('pfOpex') };
  const sum = pct.profit + pct.ownerPay + pct.tax + pct.opex;
  ['profit', 'ownerPay', 'tax', 'opex'].forEach(k => { const el = document.querySelector(`[data-pf-amt="${k}"]`); if (el) el.innerHTML = fmt(f.income * pct[k] / 100) + '<span style="font-size:11px;color:#94a3b8;font-weight:600;">/mo</span>'; });
  const sEl = document.querySelector('[data-pf-sum]'); if (sEl) { sEl.textContent = sum; sEl.parentElement.style.color = sum === 100 ? '#059669' : '#dc2626'; }
};

function _renderCommitments() {
  const cur = getCurrencySymbol();
  const list = [..._commitments()].sort((a, b) => (a.date || '').localeCompare(b.date || ''));
  const today = new Date().toISOString().split('T')[0];
  const inNext30 = list.filter(c => _futureWindow(c.date, 30));
  const totIn = inNext30.filter(c => c.type === 'in').reduce((s, c) => s + N(c.amount), 0);
  const totOut = inNext30.filter(c => c.type === 'out').reduce((s, c) => s + N(c.amount), 0);
  const inp = 'padding:9px;border:1px solid #e2e8f0;border-radius:8px;font-size:13px;';
  const confColor = { confirmed: '#059669', likely: '#d97706', possible: '#dc2626' };
  return `
    <div style="background:linear-gradient(135deg,#0a0f1a,#0f1f35);border-radius:16px;padding:18px;margin-bottom:16px;color:#fff;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px;">
      <div><div style="font-size:11px;text-transform:uppercase;letter-spacing:.05em;color:#94a3b8;">What only you know · next 30 days</div><div style="font-size:18px;font-weight:800;">Add the cash events that aren't invoiced yet</div></div>
      <div style="display:flex;gap:18px;"><div><div style="font-size:10px;color:#94a3b8;">Committed in</div><div style="font-size:18px;font-weight:800;color:#10b981;">${fmt(totIn)}</div></div><div><div style="font-size:10px;color:#94a3b8;">Committed out</div><div style="font-size:18px;font-weight:800;color:#f87171;">${fmt(totOut)}</div></div></div>
    </div>

    <!-- Add form -->
    <div style="background:#fff;border:1px solid #e2e8f0;border-radius:16px;padding:18px;margin-bottom:16px;">
      <h3 style="font-size:14px;font-weight:800;color:#0f172a;margin-bottom:12px;">➕ Add a known cash event</h3>
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:10px;align-items:end;">
        <div><label style="font-size:11px;font-weight:700;color:#64748b;display:block;margin-bottom:4px;">Type</label><select id="comType" onchange="document.getElementById('comConfWrap').style.display=this.value==='in'?'':'none'" style="${inp}width:100%;"><option value="in">💰 Money In</option><option value="out">📤 Money Out</option></select></div>
        <div style="grid-column:span 2;"><label style="font-size:11px;font-weight:700;color:#64748b;display:block;margin-bottom:4px;">Description</label><input id="comLabel" type="text" placeholder="" style="${inp}width:100%;"></div>
        <div><label style="font-size:11px;font-weight:700;color:#64748b;display:block;margin-bottom:4px;">Amount (${cur})</label><input id="comAmount" type="number" min="0" style="${inp}width:100%;"></div>
        <div><label style="font-size:11px;font-weight:700;color:#64748b;display:block;margin-bottom:4px;">Expected date</label><input id="comDate" type="date" value="${today}" style="${inp}width:100%;"></div>
        <div id="comConfWrap"><label style="font-size:11px;font-weight:700;color:#64748b;display:block;margin-bottom:4px;">Confidence</label><select id="comConf" style="${inp}width:100%;"><option value="confirmed">Confirmed</option><option value="likely">Likely</option><option value="possible">Possible</option></select></div>
        <button onclick="window._cfAddCommitment()" style="padding:9px 16px;background:linear-gradient(135deg,#059669,#10b981);color:#fff;border:none;border-radius:8px;font-size:13px;font-weight:700;cursor:pointer;height:38px;">Add</button>
      </div>
    </div>

    <!-- List -->
    <div style="background:#fff;border:1px solid #e2e8f0;border-radius:16px;overflow:hidden;">
      <div style="padding:14px 18px;border-bottom:1px solid #f1f5f9;"><h3 style="font-size:14px;font-weight:800;color:#0f172a;">📌 Upcoming Commitments</h3></div>
      ${list.length ? list.map(c => {
        const past = c.date < today;
        return `<div style="display:flex;align-items:center;gap:12px;padding:11px 18px;border-bottom:1px solid #f1f5f9;${past ? 'opacity:.5;' : ''}">
          <div style="font-size:18px;">${c.type === 'in' ? '💰' : '📤'}</div>
          <div style="flex:1;min-width:0;"><div style="font-size:13px;font-weight:700;color:#0f172a;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${c.label}</div><div style="font-size:10px;color:#94a3b8;">${c.date}${c.type === 'in' ? ` · <span style="color:${confColor[c.confidence] || '#64748b'};font-weight:700;text-transform:capitalize;">${c.confidence || 'confirmed'}</span>` : ''}${past ? ' · past' : ''}</div></div>
          <div style="font-size:14px;font-weight:800;color:${c.type === 'in' ? '#059669' : '#dc2626'};">${c.type === 'in' ? '+' : '−'}${fmt(c.amount)}</div>
          <button onclick="window._cfDelCommitment('${c.id}')" style="border:none;background:transparent;color:#cbd5e1;cursor:pointer;font-size:14px;" title="Delete">🗑️</button>
        </div>`; }).join('') : '<p style="padding:22px;text-align:center;color:#94a3b8;font-size:13px;">No commitments yet. Add a confirmed order, an EMI, a tax bill, or a planned purchase — your forecast becomes real.</p>'}
    </div>
    <p style="font-size:11px;color:#94a3b8;margin-top:12px;text-align:center;">These flow straight into your 🔮 Forecast & Weekly Planner — "never decide on bank balance; confidence comes from preparation."</p>`;
}

/* ============================================================================
 *  CONSTRUCTION CASH FLOW — receivables (aged + retention) vs payables
 *  (material / labour / expenses), a 4 & 8-week projection, and a payroll /
 *  next-material-order signal. Built on the shared aggregation helpers.
 * ==========================================================================*/
/** FIFO-aged unpaid balance for a client (payments applied oldest-invoice first). */
function _clientAging(cid) {
  const invs = (state.saleInvoices || []).filter(i => i.clientId === cid && i.status !== 'Cancelled')
    .map(i => ({ date: i.date, bal: N(i.total) })).sort((a, b) => (a.date || '').localeCompare(b.date || ''));
  let recv = (state.paymentsIn || []).filter(p => p.clientId === cid).reduce((s, p) => s + N(p.amount), 0);
  const b = { cur: 0, d30: 0, d60: 0, d90: 0, total: 0 };
  invs.forEach(inv => {
    let bal = inv.bal;
    if (recv > 0) { const use = Math.min(recv, bal); bal -= use; recv -= use; }
    if (bal <= 0.5) return;
    const age = _age(inv.date);
    if (age <= 30) b.cur += bal; else if (age <= 60) b.d30 += bal; else if (age <= 90) b.d60 += bal; else b.d90 += bal;
    b.total += bal;
  });
  return b;
}
let _ccSnap = null; // snapshot of Command Center figures for the tile drill-downs
function _renderConstructionCF() {
  const s = state.cashFlowSettings || (state.cashFlowSettings = {});
  const retPct = N(s.retentionPct) || 5;      // % retention held by client
  const creditDays = N(s.creditDays) || 30;   // client credit terms

  // ── Receivables (money in), aged + retention ──
  const clients = state.clients || [];
  const agingRows = [];
  const agg = { cur: 0, d30: 0, d60: 0, d90: 0, total: 0 };
  clients.forEach(c => {
    const a = _clientAging(c.id);
    if (a.total <= 0.5) return;
    agingRows.push({ name: c.name, ...a });
    ['cur', 'd30', 'd60', 'd90', 'total'].forEach(k => agg[k] += a[k]);
  });
  agingRows.sort((x, y) => y.total - x.total);
  const retentionHeld = Math.round(agg.total * retPct / 100);
  const netCollectible = Math.max(0, agg.total - retentionHeld);
  const overdue = agg.d30 + agg.d60 + agg.d90;  // past the first 30-day bucket

  // ── Payables (money out) ──
  const materialAP = apOutstanding();           // purchases − vendor payments
  const labourAP = labourDue();                 // wages billed − paid
  const expenseRun = _expenses(30);             // last-30-day expense run-rate
  const totalAP = materialAP + labourAP + expenseRun;

  // ── Position + projection ──
  const cash = cashPosition();
  // 4-week expected collections: everything overdue + half of the current bucket
  // (net of retention), capped at what's actually outstanding.
  const expect4 = Math.max(0, Math.min(netCollectible, overdue + agg.cur * 0.5));
  const expect8 = netCollectible;               // most current dues collected within 8 weeks
  const committed4 = materialAP + labourAP + expenseRun;      // due soon
  const net4 = cash + expect4 - committed4;
  const net8 = cash + expect8 - (committed4 + expenseRun);    // + another month of expenses

  // ── Signal: can you cover payroll + a typical material order? ──
  const available = cash + expect4;
  const payroll = labourAP;
  const nextOrder = materialAP;                 // outstanding vendor bills as the near-term order proxy
  const coversPayroll = available >= payroll;
  const coversBoth = available >= (payroll + nextOrder);
  const sig = coversBoth ? { c: '#16a34a', bg: '#f0fdf4', t: 'Healthy', m: 'You can cover payroll and clear vendor dues from expected cash.' }
    : coversPayroll ? { c: '#d97706', bg: '#fffbeb', t: 'Tight', m: 'Payroll is covered, but vendor dues may need collections to come in first.' }
      : { c: '#dc2626', bg: '#fef2f2', t: 'At risk', m: 'Expected cash may not cover payroll — chase overdue receivables now.' };

  // Snapshot the computed figures so the tile drill-downs reconcile exactly.
  _ccSnap = { agingRows, agg, materialAP, labourAP, expenseRun, totalAP, cash, expect4, expect8, committed4, net4, retentionHeld, netCollectible, overdue, creditDays, retPct };

  const card = (label, val, sub, color, kind) => `<div ${kind ? `onclick="window._cfTileDetail('${kind}')" onmouseover="this.style.boxShadow='0 8px 24px rgba(0,0,0,.10)';this.style.transform='translateY(-2px)'" onmouseout="this.style.boxShadow='';this.style.transform=''"` : ''} style="background:#fff;border:1px solid #e2e8f0;border-radius:14px;padding:16px;transition:.15s;${kind ? 'cursor:pointer;' : ''}">
    <p style="font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:.04em;color:${color};">${label}</p>
    <p style="font-size:22px;font-weight:900;color:#0f172a;margin-top:2px;">${fmt(val)}</p>${sub ? `<p style="font-size:11px;color:#94a3b8;margin-top:2px;">${sub}</p>` : ''}${kind ? '<p style="font-size:9px;color:#cbd5e1;margin-top:8px;font-weight:700;">CLICK FOR DETAILS →</p>' : ''}</div>`;

  return `
    <div style="background:${sig.bg};border:1px solid ${sig.c}33;border-left:5px solid ${sig.c};border-radius:14px;padding:16px 18px;margin-bottom:16px;">
      <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;">
        <div><span style="font-size:13px;font-weight:900;color:${sig.c};text-transform:uppercase;">● ${sig.t}</span>
          <p style="font-size:13px;color:#475569;margin-top:2px;">${sig.m}</p></div>
        <div style="text-align:right;"><p style="font-size:10px;font-weight:700;color:#94a3b8;text-transform:uppercase;">Available (cash + 4-wk collections)</p>
          <p style="font-size:20px;font-weight:900;color:${sig.c};">${fmt(available)}</p></div>
      </div>
      <div style="display:flex;gap:16px;margin-top:10px;font-size:12px;">
        <span>Payroll due: <b style="color:${coversPayroll ? '#16a34a' : '#dc2626'};">${fmt(payroll)}</b></span>
        <span>Vendor dues: <b style="color:${coversBoth ? '#16a34a' : '#d97706'};">${fmt(nextOrder)}</b></span>
      </div>
    </div>

    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:12px;margin-bottom:16px;">
      ${card('Cash position', cash, 'received − paid out', '#0d9488', 'netcash')}
      ${card('Receivables (money in)', agg.total, `${fmt(netCollectible)} collectible · ${fmt(retentionHeld)} retention`, '#2563eb', 'cc_recv')}
      ${card('Payables (money out)', totalAP, 'material + labour + expenses', '#ea580c', 'cc_pay')}
      ${card(net4 >= 0 ? 'Net (4-week)' : 'Shortfall (4-week)', net4, 'cash + collections − dues', net4 >= 0 ? '#16a34a' : '#dc2626', 'cc_net4')}
    </div>

    <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;">
      <div style="background:#fff;border:1px solid #e2e8f0;border-radius:14px;overflow:hidden;">
        <div style="padding:12px 14px;border-bottom:1px solid #f1f5f9;font-weight:800;font-size:14px;color:#0f172a;">💰 Receivables — aged (money in)</div>
        <div style="overflow-x:auto;"><table style="width:100%;font-size:12px;border-collapse:collapse;"><thead><tr style="background:#f8fafc;font-size:10px;text-transform:uppercase;color:#94a3b8;text-align:right;">
          <th style="padding:8px;text-align:left;">Client</th><th style="padding:8px;">0–30</th><th style="padding:8px;">31–60</th><th style="padding:8px;">61–90</th><th style="padding:8px;">90+</th><th style="padding:8px;">Total</th></tr></thead>
          <tbody>${agingRows.map(r => `<tr style="border-top:1px solid #f1f5f9;text-align:right;">
            <td style="padding:8px;text-align:left;font-weight:700;color:#334155;">${_esc(r.name)}</td>
            <td style="padding:8px;color:#64748b;">${fmt(r.cur)}</td>
            <td style="padding:8px;color:#d97706;">${fmt(r.d30)}</td>
            <td style="padding:8px;color:#ea580c;">${fmt(r.d60)}</td>
            <td style="padding:8px;color:#dc2626;font-weight:700;">${fmt(r.d90)}</td>
            <td style="padding:8px;font-weight:800;color:#0f172a;">${fmt(r.total)}</td></tr>`).join('') || '<tr><td colspan="6" style="padding:16px;text-align:center;color:#94a3b8;">No outstanding receivables.</td></tr>'}</tbody>
          ${agingRows.length ? `<tfoot><tr style="border-top:2px solid #e2e8f0;text-align:right;font-weight:800;background:#f8fafc;">
            <td style="padding:8px;text-align:left;">Total</td><td style="padding:8px;">${fmt(agg.cur)}</td><td style="padding:8px;">${fmt(agg.d30)}</td><td style="padding:8px;">${fmt(agg.d60)}</td><td style="padding:8px;color:#dc2626;">${fmt(agg.d90)}</td><td style="padding:8px;">${fmt(agg.total)}</td></tr></tfoot>` : ''}
        </table></div>
        <p style="font-size:10px;color:#94a3b8;padding:8px 12px;border-top:1px solid #f1f5f9;">Credit terms ${creditDays} days · retention ${retPct}% held (${fmt(retentionHeld)}). Overdue (31+ days): <b style="color:#dc2626;">${fmt(overdue)}</b> — chase these first.</p>
      </div>

      <div style="display:flex;flex-direction:column;gap:16px;">
        <div style="background:#fff;border:1px solid #e2e8f0;border-radius:14px;overflow:hidden;">
          <div style="padding:12px 14px;border-bottom:1px solid #f1f5f9;font-weight:800;font-size:14px;color:#0f172a;">🧾 Payables — money out</div>
          <div style="padding:6px 14px;">
            ${[['Material (vendor bills)', materialAP, '#ea580c'], ['Labour wages due', labourAP, '#7c3aed'], ['Expenses (last 30 days)', expenseRun, '#64748b']].map(([l, v, col]) => `<div style="display:flex;justify-content:space-between;padding:7px 0;border-bottom:1px solid #f8fafc;font-size:13px;"><span style="color:#64748b;">${l}</span><span style="font-weight:700;color:${col};">${fmt(v)}</span></div>`).join('')}
            <div style="display:flex;justify-content:space-between;padding:9px 0 2px;font-size:14px;"><span style="font-weight:800;color:#0f172a;">Total due</span><span style="font-weight:900;color:#ea580c;">${fmt(totalAP)}</span></div>
          </div>
        </div>
        <div style="background:#fff;border:1px solid #e2e8f0;border-radius:14px;overflow:hidden;">
          <div style="padding:12px 14px;border-bottom:1px solid #f1f5f9;font-weight:800;font-size:14px;color:#0f172a;">🔮 Projected runway</div>
          <div style="padding:6px 14px;">
            ${[['Next 4 weeks', expect4, committed4, net4], ['Next 8 weeks', expect8, committed4 + expenseRun, net8]].map(([l, ei, out, net]) => `<div style="padding:8px 0;border-bottom:1px solid #f8fafc;">
              <div style="display:flex;justify-content:space-between;font-size:13px;font-weight:800;color:#0f172a;"><span>${l}</span><span style="color:${net >= 0 ? '#16a34a' : '#dc2626'};">${net >= 0 ? '+' : ''}${fmt(net)}</span></div>
              <div style="display:flex;gap:14px;font-size:11px;color:#94a3b8;margin-top:2px;"><span>In ${fmt(ei)}</span><span>Out ${fmt(out)}</span></div></div>`).join('')}
            <p style="font-size:10px;color:#94a3b8;margin-top:6px;">Money-in = expected collections (overdue + part of current, net of retention). Money-out = vendor + labour dues + expense run-rate.</p>
          </div>
        </div>
      </div>
    </div>`;
}

// ── ENTRY ──────────────────────────────────────────────────────────────────
window._cfSwitchTab = function (t) { _cfTab = t; renderCashFlow(); };

export function renderCashFlow() {
  const root = document.getElementById('cashFlowRoot');
  if (!root) return;
  const tab = (id, label, icon) => `<button onclick="window._cfSwitchTab('${id}')" style="padding:8px 16px;border-radius:10px;font-size:13px;font-weight:700;cursor:pointer;border:1px solid ${_cfTab === id ? 'transparent' : '#e2e8f0'};background:${_cfTab === id ? 'linear-gradient(135deg,#059669,#10b981)' : '#fff'};color:${_cfTab === id ? '#fff' : '#475569'};">${icon} ${label}</button>`;
  const body = _cfTab === 'cashflow' ? _renderConstructionCF() : _cfTab === 'cockpit' ? _renderCockpit() : _cfTab === 'survival' ? _renderSurvival() : _cfTab === 'targets' ? _renderTargets() : _cfTab === 'profitfirst' ? _renderProfitFirst() : _cfTab === 'commitments' ? _renderCommitments() : _cfTab === 'clients' ? _renderClients() : _cfTab === 'leaks' ? _renderLeaks() : _cfTab === 'forecast' ? _renderForecast() : _cfTab === 'tools' ? _renderTools() : _renderOverview();
  root.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:flex-end;flex-wrap:wrap;gap:10px;margin-bottom:14px;">
      <div>
        <h2 class="text-2xl font-extrabold text-slate-800">Cash Flow Command Center</h2>
        <p class="text-slate-500 text-sm font-medium mt-0.5">Live across Sales, Purchase, Expenses, Payroll & Bank — speed of money is everything.</p>
      </div>
      <button onclick="window.renderCashFlow()" class="text-xs font-bold text-emerald-700 border border-emerald-200 bg-emerald-50 px-3 py-2 rounded-lg hover:bg-emerald-100 transition">↻ Refresh</button>
    </div>
    <div style="display:flex;gap:8px;margin-bottom:16px;flex-wrap:wrap;">
      ${tab('cashflow', 'Cash Flow', '💵')}${tab('cockpit', 'Owner Cockpit', '👑')}${tab('overview', 'Overview', '🎯')}${tab('survival', 'Survival', '🛡️')}${tab('targets', 'Targets', '🏆')}${tab('profitfirst', 'Profit-First', '💰')}${tab('commitments', 'Commitments', '📌')}${tab('clients', 'Client Scorecard', '⭐')}${tab('leaks', 'Leak Detector', '💧')}${tab('forecast', 'Forecast & Planner', '🔮')}${tab('tools', 'Vendors & Tools', '🛠️')}
    </div>
    ${body}
    <p style="font-size:11px;color:#94a3b8;margin-top:14px;text-align:center;">A complete cash-flow operating system — Health Score · Clients · Leaks · Forecast · Vendors &amp; Simulator.</p>`;
  if (_cfTab === 'tools' && typeof window._cfSimulate === 'function') window._cfSimulate();
}

/* ============================================================================
 *  OWNER COCKPIT — cross-project P&L (Phase 5)
 *  Rolls up computeProjectPnL(projectId) across every project. Single source of
 *  margin math shared with the Micro-Planning Cost & Profit ledger.
 * ==========================================================================*/
function _renderCockpit() {
  if (typeof window.computeProjectPnL !== 'function') {
    return `<div style="background:#fffbeb;border:1px solid #fde68a;border-radius:14px;padding:24px;text-align:center;color:#92400e;">Cockpit needs the Micro-Planning engine — open <b>Micro Planning</b> once, then come back.</div>`;
  }
  const projects = state.projects || [];
  const pnls = projects.map(p => window.computeProjectPnL(p.id)).filter(Boolean);

  // Portfolio totals
  let earned = 0, material = 0, labour = 0, other = 0, profit = 0, wip = 0, billed = 0;
  pnls.forEach(p => { earned += p.earned; material += p.material; labour += p.labour; other += p.other; profit += p.profit; wip += p.wip; billed += p.billed; });
  const totalCost = material + labour + other;
  const marginPct = earned > 0 ? (profit / earned) * 100 : 0;

  // Receivables at client level: billed (RA bills) − received (paymentsIn).
  const clientBilled = {};
  pnls.forEach(p => { const proj = projects.find(x => x.id === p.projectId); const cid = proj?.clientId; if (cid) clientBilled[cid] = (clientBilled[cid] || 0) + p.billed; });
  let receivables = 0;
  Object.entries(clientBilled).forEach(([cid, b]) => {
    const paid = (state.paymentsIn || []).filter(x => x.clientId === cid).reduce((s, x) => s + N(x.amount), 0);
    receivables += Math.max(0, b - paid);
  });

  // Leakage aggregate
  const leak = {};
  pnls.forEach(p => Object.entries(p.leakage || {}).forEach(([k, n]) => { leak[k] = (leak[k] || 0) + n; }));
  const leakTotal = Object.values(leak).reduce((a, b) => a + b, 0);

  const league = pnls.filter(p => p.earned > 0).sort((a, b) => b.marginPct - a.marginPct);

  const kpi = (label, val, sub, color) => `<div style="background:#fff;border:1px solid #e2e8f0;border-radius:14px;padding:14px;text-align:center;">
      <p style="font-size:10px;font-weight:800;text-transform:uppercase;color:${color};letter-spacing:.04em;">${label}</p>
      <p style="font-size:20px;font-weight:900;color:#0f172a;margin-top:2px;">${val}</p>${sub ? `<p style="font-size:10px;color:#94a3b8;margin-top:2px;">${sub}</p>` : ''}</div>`;

  const marginColor = m => m >= 25 ? '#16a34a' : m >= 10 ? '#ca8a04' : m >= 0 ? '#ea580c' : '#dc2626';
  const leagueRows = league.map(p => `<tr style="border-bottom:1px solid #f1f5f9;">
      <td style="padding:8px 10px;font-weight:700;color:#0f172a;">${_esc(p.projectName)}</td>
      <td style="padding:8px 10px;text-align:right;color:#0d9488;font-weight:700;">${fmt(p.earned)}</td>
      <td style="padding:8px 10px;text-align:right;color:#64748b;">${fmt(p.totalCost)}</td>
      <td style="padding:8px 10px;text-align:right;font-weight:800;color:${p.profit >= 0 ? '#16a34a' : '#dc2626'};">${fmt(p.profit)}</td>
      <td style="padding:8px 10px;text-align:right;font-weight:800;color:${marginColor(p.marginPct)};">${p.marginPct.toFixed(1)}%</td>
      <td style="padding:8px 10px;text-align:right;color:#7c3aed;font-weight:700;">${fmt(p.wip)}</td>
    </tr>`).join('');

  return `
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px;margin-bottom:16px;">
      ${kpi('Work done (earned)', fmt(earned), 'measured value, all projects', '#0d9488')}
      ${kpi('Total cost', fmt(totalCost), 'material + labour + other', '#ea580c')}
      ${kpi(profit >= 0 ? 'Gross profit' : 'Gross loss', fmt(profit), marginPct.toFixed(1) + '% portfolio margin', profit >= 0 ? '#16a34a' : '#dc2626')}
      ${kpi('WIP (unbilled)', fmt(wip), 'earned, not yet RA-billed', '#7c3aed')}
      ${kpi('Receivables', fmt(receivables), 'billed, not yet collected', '#2563eb')}
    </div>

    <div style="background:#fff;border:1px solid #e2e8f0;border-radius:14px;overflow:hidden;margin-bottom:16px;">
      <div style="padding:11px 14px;border-bottom:1px solid #f1f5f9;font-weight:800;color:#334155;font-size:13px;">🏆 Project league table <span style="font-weight:500;color:#94a3b8;font-size:11px;">— ranked by margin</span></div>
      <div style="overflow-x:auto;"><table style="width:100%;border-collapse:collapse;font-size:12px;min-width:560px;">
        <thead><tr style="background:#f8fafc;text-align:left;color:#64748b;font-size:10px;text-transform:uppercase;">
          <th style="padding:8px 10px;">Project</th><th style="padding:8px 10px;text-align:right;">Earned</th><th style="padding:8px 10px;text-align:right;">Cost</th>
          <th style="padding:8px 10px;text-align:right;">Profit</th><th style="padding:8px 10px;text-align:right;">Margin</th><th style="padding:8px 10px;text-align:right;">WIP</th></tr></thead>
        <tbody>${leagueRows || '<tr><td colspan="6" style="padding:20px;text-align:center;color:#94a3b8;">No measured work yet. Record work on the Micro-Planning daily sheet to populate the cockpit.</td></tr>'}</tbody>
      </table></div>
    </div>

    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:14px;">
      <div style="background:#fff;border:1px solid #e2e8f0;border-radius:14px;padding:14px;">
        <h4 style="font-weight:800;color:#334155;font-size:13px;margin-bottom:8px;">Cash pipeline</h4>
        <div style="font-size:13px;color:#475569;display:flex;flex-direction:column;gap:6px;">
          <div style="display:flex;justify-content:space-between;"><span>Earned (work done)</span><b style="color:#0d9488;">${fmt(earned)}</b></div>
          <div style="display:flex;justify-content:space-between;"><span>• WIP — not yet billed</span><b style="color:#7c3aed;">${fmt(wip)}</b></div>
          <div style="display:flex;justify-content:space-between;"><span>• Billed (RA bills)</span><b>${fmt(billed)}</b></div>
          <div style="display:flex;justify-content:space-between;border-top:1px solid #f1f5f9;padding-top:6px;"><span>Receivables — billed, uncollected</span><b style="color:#2563eb;">${fmt(receivables)}</b></div>
        </div>
        <p style="font-size:10px;color:#94a3b8;margin-top:8px;">WIP → bill it (RA Billing) to turn work into receivables; collect receivables to turn them into cash.</p>
      </div>
      <div style="background:#fff;border:1px solid #e2e8f0;border-radius:14px;padding:14px;">
        <h4 style="font-weight:800;color:#334155;font-size:13px;margin-bottom:8px;">💧 Leakage — non-BOQ work <span style="font-weight:500;color:#94a3b8;font-size:11px;">across all projects</span></h4>
        ${leakTotal ? `<div style="font-size:12px;color:#475569;display:flex;flex-direction:column;gap:4px;">${Object.entries(leak).sort((a, b) => b[1] - a[1]).map(([cat, n]) => `<div style="display:flex;justify-content:space-between;"><span>${_esc(cat)}</span><b>${n} log${n > 1 ? 's' : ''}</b></div>`).join('')}</div>
          <p style="font-size:10px;color:#94a3b8;margin-top:8px;">${leakTotal} non-BOQ activities logged — labour you can't bill. Keep this small to protect margin.</p>`
          : '<p style="font-size:12px;color:#94a3b8;">No non-BOQ activities logged yet.</p>'}
      </div>
    </div>
    <p style="font-size:11px;color:#94a3b8;margin-top:12px;text-align:center;">Owner Cockpit reads the same profitability engine as Micro-Planning → Cost &amp; Profit. Earned = measured value · WIP = unbilled · Receivables = billed but uncollected.</p>`;
}

if (typeof window !== 'undefined') window.renderCashFlow = renderCashFlow;
