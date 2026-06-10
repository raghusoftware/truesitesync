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
const fmt1 = (v) => Math.round(N(v) * 10) / 10;

let _cfTab = 'overview';

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
  const confirmed = scores.filter(c => c.grade === 'A').reduce((s, c) => s + c.outstanding, 0);
  const likely = scores.filter(c => c.grade === 'B').reduce((s, c) => s + c.outstanding, 0);
  const possible = scores.filter(c => c.grade === 'C').reduce((s, c) => s + c.outstanding, 0);
  const exp90 = (state.expenses || []).filter(e => _inLast(e.date, 90));
  const fixed = exp90.filter(e => _FIXED_CATS.some(f => (e.category || '').toLowerCase().includes(f))).reduce((s, e) => s + N(e.amount), 0) / 3;
  const variable = exp90.filter(e => !_FIXED_CATS.some(f => (e.category || '').toLowerCase().includes(f))).reduce((s, e) => s + N(e.amount), 0) / 3;
  const vendor = apOutstanding();
  const labour = labourDue() || (_labourPaid(90) / 3);
  const inflow = confirmed + likely + possible, outflow = fixed + variable + vendor + labour, opening = cashPosition();
  return { confirmed, likely, possible, inflow, fixed, variable, vendor, labour, outflow, opening, gap: inflow - outflow, projected: opening + inflow - outflow };
}

/** 4-week rolling cash planner. */
function weeklyPlanner() {
  const tf = tieredForecast();
  const scores = clientScores().filter(c => c.outstanding > 1);
  const inW = [0, 0, 0, 0];
  scores.forEach(c => { const w = c.grade === 'A' ? 0 : c.grade === 'B' ? 1 : (c.avgDays > 60 ? 3 : 2); inW[w] += c.outstanding; });
  const monthlyOut = tf.fixed + tf.variable + tf.labour;
  const outW = [tf.vendor + monthlyOut / 4, monthlyOut / 4, monthlyOut / 4, monthlyOut / 4];
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
  return s;
}

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
const _tile = (label, value, sub, color, icon) => `
  <div style="background:#fff;border:1px solid #e2e8f0;border-radius:16px;padding:18px;box-shadow:0 1px 3px rgba(0,0,0,.04);">
    <div style="display:flex;justify-content:space-between;align-items:flex-start;">
      <div style="min-width:0;">
        <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:#94a3b8;">${label}</div>
        <div style="font-size:24px;font-weight:800;color:${color};margin-top:4px;line-height:1.1;">${value}</div>
        ${sub ? `<div style="font-size:11px;color:#64748b;margin-top:3px;">${sub}</div>` : ''}
      </div>
      <div style="font-size:22px;opacity:.3;flex-shrink:0;">${icon}</div>
    </div>
  </div>`;
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
      ${_tile('Net Cash Position', fmt(cash), 'Money in − money out', cash >= 0 ? '#0f172a' : '#dc2626', '🏦')}
      ${_tile('Expected Inflow · 30d', fmt(f.inflow), 'Outstanding receivables', '#059669', '📥')}
      ${_tile('Expected Outflow · 30d', fmt(f.outflow), 'Vendors + labour + OpEx', '#dc2626', '📤')}
      ${_tile('Projected Cash · 30d', fmt(f.projected), f.net >= 0 ? 'Surplus expected' : 'Gap — act now', projColor, f.projected >= 0 ? '✅' : '⚠️')}
    </div>
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));gap:12px;margin-bottom:14px;">
      ${_tile('Receivables (AR)', fmt(ar), dso + ' AR days (DSO)', '#2563eb', '⏳')}
      ${_tile('Payables (AP)', fmt(ap), dpo + ' AP days (DPO)', '#ea580c', '🧾')}
      ${_tile('Inventory Locked', fmt(inventoryValue()), invD + ' inventory days', '#7c3aed', '📦')}
      ${_tile('Cash Conversion Cycle', ccc + ' days', ccc <= 30 ? 'Healthy' : ccc <= 60 ? 'Watch' : 'Too slow', cccColor, '🔄')}
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
          ${inTier('Variable', tf.variable, '#0891b2'.slice(0, 7), 'Fuel, transport…')}
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

// ── ENTRY ──────────────────────────────────────────────────────────────────
window._cfSwitchTab = function (t) { _cfTab = t; renderCashFlow(); };

export function renderCashFlow() {
  const root = document.getElementById('cashFlowRoot');
  if (!root) return;
  const tab = (id, label, icon) => `<button onclick="window._cfSwitchTab('${id}')" style="padding:8px 16px;border-radius:10px;font-size:13px;font-weight:700;cursor:pointer;border:1px solid ${_cfTab === id ? 'transparent' : '#e2e8f0'};background:${_cfTab === id ? 'linear-gradient(135deg,#059669,#10b981)' : '#fff'};color:${_cfTab === id ? '#fff' : '#475569'};">${icon} ${label}</button>`;
  const body = _cfTab === 'survival' ? _renderSurvival() : _cfTab === 'targets' ? _renderTargets() : _cfTab === 'profitfirst' ? _renderProfitFirst() : _cfTab === 'clients' ? _renderClients() : _cfTab === 'leaks' ? _renderLeaks() : _cfTab === 'forecast' ? _renderForecast() : _cfTab === 'tools' ? _renderTools() : _renderOverview();
  root.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:flex-end;flex-wrap:wrap;gap:10px;margin-bottom:14px;">
      <div>
        <h2 class="text-2xl font-extrabold text-slate-800">Cash Flow Command Center</h2>
        <p class="text-slate-500 text-sm font-medium mt-0.5">Live across Sales, Purchase, Expenses, Payroll & Bank — speed of money is everything.</p>
      </div>
      <button onclick="window.renderCashFlow()" class="text-xs font-bold text-emerald-700 border border-emerald-200 bg-emerald-50 px-3 py-2 rounded-lg hover:bg-emerald-100 transition">↻ Refresh</button>
    </div>
    <div style="display:flex;gap:8px;margin-bottom:16px;flex-wrap:wrap;">
      ${tab('overview', 'Overview', '🎯')}${tab('survival', 'Survival', '🛡️')}${tab('targets', 'Targets', '🏆')}${tab('profitfirst', 'Profit-First', '💰')}${tab('clients', 'Client Scorecard', '⭐')}${tab('leaks', 'Leak Detector', '💧')}${tab('forecast', 'Forecast & Planner', '🔮')}${tab('tools', 'Vendors & Tools', '🛠️')}
    </div>
    ${body}
    <p style="font-size:11px;color:#94a3b8;margin-top:14px;text-align:center;">A complete cash-flow operating system — Health Score · Clients · Leaks · Forecast · Vendors &amp; Simulator.</p>`;
  if (_cfTab === 'tools' && typeof window._cfSimulate === 'function') window._cfSimulate();
}

if (typeof window !== 'undefined') window.renderCashFlow = renderCashFlow;
