/**
 * cashForecastUI.js — "Working Cash Flow": the forward-looking tab of Cash Flow.
 *
 *   Top     cash today → lowest point ahead → first cash crunch (week / month)
 *   Middle  one bar pair per bucket: money in (up, emerald) vs money out (down, stacked by
 *           materials / labour / equipment / fuel / other), projected ending cash as a line
 *           on the same ₹ axis; a dashed reserve line
 *   Sources what fed the forecast (attendance, GRNs, runbook, credit fuel, RA bills) and the
 *           records that would make it wrong (no day rate, no hire vendor, no terms)
 *   Bottom  bucket rows: start · +in · −out · end, crunch rows flagged; tap a row for
 *           every dated item in it
 *   Toggle  "Cost vs Profit" — work done vs cost to date, per project
 *   Inputs  late-payment buffer, include RA bills not yet invoiced, weekly wage bill,
 *           pay day, cash-in-hand override, recurring costs (rent, hire, utilities)
 *
 * All the date maths lives in cashForecast.js (pure, tested).
 */
import { state, saveAllData } from './state.js';
import { settledAmount } from './deductions.js';
import { getCurrencySymbol, showToast } from './utils.js';
import { buildForecast, bucketize, forecastSummary, wageRunRate, forecastAudit, OUT_CATS } from './cashForecast.js?v=1.0.1';
import { ownerSummary } from './pettyCashCalc.js';

const N = v => parseFloat(v) || 0;
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const money = v => (N(v) < 0 ? '−' : '') + getCurrencySymbol() + Math.round(Math.abs(N(v))).toLocaleString('en-IN');
const short = v => {           // ₹12.4L / ₹3.2Cr / ₹85k — axis + bar labels
  const a = Math.abs(N(v)), s = N(v) < 0 ? '−' : '', c = getCurrencySymbol();
  if (a >= 1e7) return `${s}${c}${(a / 1e7).toFixed(a >= 1e8 ? 0 : 1)}Cr`;
  if (a >= 1e5) return `${s}${c}${(a / 1e5).toFixed(a >= 1e6 ? 0 : 1)}L`;
  if (a >= 1e3) return `${s}${c}${Math.round(a / 1e3)}k`;
  return `${s}${c}${Math.round(a)}`;
};
const IN = '#059669', OUT = '#dc2626', INK = '#0f172a';   // validated pair (CVD ΔE 8.6) + neutral line
// Outflow stack, fixed order (validated with IN: adjacent CVD ΔE ≥ 8.6, normal ≥ 24; "Other" is a neutral fold).
// Amber / slate sit under 3:1 → every segment is also named in the legend, tooltip and the row breakdown.
const CAT = {
  materials: { c: '#dc2626', l: 'Materials' }, labour: { c: '#f59e0b', l: 'Labour' },
  equipment: { c: '#6250d6', l: 'Equipment' }, fuel: { c: '#9a3412', l: 'Fuel' }, other: { c: '#94a3b8', l: 'Other' },
};
const WD = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
let _open = null;      // expanded bucket key

function cfg() {
  const s = state.cashFlowSettings || (state.cashFlowSettings = {});
  if (!s.working) s.working = { mode: 'week', buffer: 5, includeExpected: true, view: 'cash' };
  if (!s.recurring) s.recurring = [];
  return s;
}

/**
 * @param {{ cashDerived:number, weeklyWagesAuto:number, reserve:number, pnl?:()=>object }} ctx
 *   weeklyWagesAuto is the fallback when there is no recent attendance to take a run-rate from.
 */
export function renderWorkingCF(ctx) {
  const s = cfg(), w = s.working;
  const today = new Date().toISOString().slice(0, 10);
  const bankCash = _bankCash();
  const opening = w.openingOverride != null && w.openingOverride !== '' ? N(w.openingOverride) : (bankCash ?? ctx.cashDerived);
  const runRate = wageRunRate(state, today);
  const autoWages = runRate > 0 ? runRate : N(ctx.weeklyWagesAuto);
  const weeklyWages = w.weeklyWages != null && w.weeklyWages !== '' ? N(w.weeklyWages) : autoWages;
  const fuelDays = s.fuelTermsDays != null && s.fuelTermsDays !== '' ? N(s.fuelTermsDays) : 15;
  const field = ownerSummary(state.pettyCashTxns || [], (state.pettyCashCustodians || []).map(c => c.id));
  const mode = w.mode === 'month' ? 'month' : 'week', count = mode === 'month' ? 6 : 13;
  const events = buildForecast({ ...state, recurring: s.recurring, commitments: s.commitments || [] }, {
    today, horizonDays: mode === 'month' ? 186 : 91, bufferDays: w.buffer, includeExpected: w.includeExpected !== false,
    defaultTermsDays: N(s.creditDays) || 30, labourPayDay: s.labourPayDay != null ? N(s.labourPayDay) : 6,
    weeklyWages, fuelTermsDays: fuelDays, settled: settledAmount,
  });
  const audit = forecastAudit(state, { defaultTermsDays: N(s.creditDays) || 30 });
  const buckets = bucketize(events, { today, mode, count, openingCash: opening, reserve: ctx.reserve });
  const sum = forecastSummary(buckets);
  const seg = (k, v, l) => `<button type="button" class="wcf-seg-b${w[k] === v ? ' on' : ''}" onclick="window._wcfSet('${k}','${v}')">${l}</button>`;

  const head = `<div class="wcf-bar">
      <div class="wcf-seg">${seg('view', 'cash', 'Cash flow')}${seg('view', 'profit', 'Cost vs Profit')}</div>
      ${w.view !== 'profit' ? `<div class="wcf-seg">${seg('mode', 'week', 'Weekly · 13 wk')}${seg('mode', 'month', 'Monthly · 6 mo')}</div>` : ''}
    </div>`;
  if (w.view === 'profit') return head + _profitView(ctx);

  const crunch = sum.firstCrunch, low = sum.firstLow;
  const alert = crunch
    ? `<div class="wcf-alert neg" role="alert"><b>⚠ Cash crunch ${esc(crunch.label === 'This week' ? 'this week' : 'in ' + crunch.label)}</b><span>Projected cash falls to <b>${money(crunch.endCash)}</b>. Out: ${money(crunch.out)} vs in: ${money(crunch.in)}. Chase receivables or reschedule payments before then.</span></div>`
    : low ? `<div class="wcf-alert low" role="status"><b>Below your reserve ${esc(low.label === 'This week' ? 'this week' : 'in ' + low.label)}</b><span>Cash dips to ${money(low.endCash)} against a ${money(ctx.reserve)} reserve.</span></div>`
    : `<div class="wcf-alert ok" role="status"><b>✓ No cash crunch ahead</b><span>Cash stays positive for the next ${count} ${mode === 'month' ? 'months' : 'weeks'} on current terms.</span></div>`;

  const kpis = `<div class="wcf-kpis">
      <div><span>Cash today</span><b>${money(opening)}</b><small>${w.openingOverride != null && w.openingOverride !== '' ? 'entered by you' : bankCash != null ? 'bank + cash accounts' : 'received − paid'}</small></div>
      <div><span>Lowest point</span><b class="${sum.lowest < 0 ? 'neg' : ''}">${money(sum.lowest)}</b><small>${esc(sum.lowestAt || '')}</small></div>
      <div><span>Money in</span><b class="pos">${money(sum.totalIn)}</b><small>next ${count} ${mode === 'month' ? 'months' : 'weeks'}</small></div>
      <div><span>Money out</span><b>${money(sum.totalOut)}</b><small>next ${count} ${mode === 'month' ? 'months' : 'weeks'}</small></div>
      ${field.inField !== 0 || field.pending > 0 ? `<div><span>Cash in the field</span><b>${money(field.inField)}</b><small title="Petty cash with supervisors, not yet spent. Already out of the bank, so not part of cash today.">with supervisors · not in cash today${field.pending > 0 ? ` · ${money(field.pending)} unaccepted` : ''}</small></div>` : ''}
    </div>`;

  const rows = buckets.map(b => {
    const isOpen = _open === b.key;
    const items = b.items.slice().sort((x, y) => x.date.localeCompare(y.date));
    return `<div class="wcf-row${b.crunch ? ' ' + b.crunch : ''}${isOpen ? ' open' : ''}">
      <button type="button" class="wcf-row-h" aria-expanded="${isOpen}" onclick="window._wcfToggle('${b.key}')">
        <span class="wcf-when"><b>${esc(b.label)}</b>${b.crunch === 'negative' ? '<em class="neg">⚠ Crunch</em>' : b.crunch === 'low' ? '<em class="low">Below reserve</em>' : ''}</span>
        <span class="wcf-num in">+${short(b.in)}</span>
        <span class="wcf-num out">−${short(b.out)}</span>
        <span class="wcf-num end${b.endCash < 0 ? ' neg' : ''}">${short(b.endCash)}</span>
      </button>
      ${isOpen ? `<div class="wcf-items">
        <div class="wcf-line muted"><span>Starting cash</span><b>${money(b.startCash)}</b></div>
        ${b.out > 0 ? `<div class="wcf-cats">${OUT_CATS.filter(c => b.outBy[c] > 0).map(c => `<span><i style="background:${CAT[c].c}"></i>${CAT[c].l} ${money(b.outBy[c])}</span>`).join('')}</div>` : ''}
        ${items.map(e => `<div class="wcf-line"><span><i>${e.date.slice(8, 10)}/${e.date.slice(5, 7)}</i>${esc(e.label)}${e.overdue ? ' <em class="neg">overdue</em>' : ''}${!e.sure ? ' <em class="exp">expected</em>' : ''}</span><b class="${e.dir}">${e.dir === 'in' ? '+' : '−'}${money(e.amount)}</b></div>`).join('') || '<div class="wcf-line muted"><span>No dated movements</span></div>'}
        <div class="wcf-line total"><span>Ending cash</span><b class="${b.endCash < 0 ? 'neg' : ''}">${money(b.endCash)}</b></div>
      </div>` : ''}
    </div>`;
  }).join('');

  const recurring = s.recurring.map(r => `<div class="wcf-rec"><span><b>${esc(r.name)}</b> ${money(r.amount)} · ${r.freq === 'weekly' ? 'every ' + WD[N(r.day)] : 'monthly on day ' + (N(r.day) || 1)}</span><button type="button" onclick="window._wcfDelRec('${r.id}')" aria-label="Remove">✕</button></div>`).join('');

  return head + alert + kpis + `
    <section class="wcf-card">
      <header><b>${mode === 'month' ? 'Monthly' : 'Weekly'} cash forecast</b>
        <span class="wcf-legend"><i style="background:${IN}"></i>Money in ${OUT_CATS.map(c => `<i style="background:${CAT[c].c}"></i>${CAT[c].l} `).join('')}<i class="line"></i>Ending cash${ctx.reserve > 0 ? ' <i class="dash"></i>Reserve' : ''}</span></header>
      ${_chart(buckets, ctx.reserve, mode)}
    </section>
    <section class="wcf-card flush">
      <div class="wcf-thead"><span>${mode === 'month' ? 'Month' : 'Week'}</span><span>In</span><span>Out</span><span>Ending cash</span></div>
      ${rows}
    </section>
    ${_sourcesPanel(audit)}
    <details class="wcf-card wcf-set">
      <summary><b>Forecast assumptions</b><small>buffer ${N(w.buffer)} days · wages ${money(weeklyWages)}/week · ${s.recurring.length} recurring cost${s.recurring.length === 1 ? '' : 's'}</small></summary>
      <div class="wcf-form">
        <label>Clients pay late by<select onchange="window._wcfSet('buffer', this.value)">${[0, 3, 5, 7, 10, 15, 30].map(d => `<option value="${d}" ${N(w.buffer) === d ? 'selected' : ''}>${d ? d + ' days' : 'on time'}</option>`).join('')}</select></label>
        <label>RA bills not yet invoiced<select onchange="window._wcfSet('includeExpected', this.value === '1')"><option value="1" ${w.includeExpected !== false ? 'selected' : ''}>Count as expected money in</option><option value="0" ${w.includeExpected === false ? 'selected' : ''}>Leave out (cautious)</option></select></label>
        <label>Weekly wage bill<input type="number" inputmode="decimal" placeholder="${Math.round(autoWages)} (${runRate > 0 ? 'attendance, last 2 weeks' : 'last 4 weeks'})" value="${w.weeklyWages ?? ''}" onchange="window._wcfSet('weeklyWages', this.value)"></label>
        <label>Labour pay day<select onchange="window._cfSetPayDay(this.value)">${WD.map((d, i) => `<option value="${i}" ${(s.labourPayDay != null ? N(s.labourPayDay) : 6) === i ? 'selected' : ''}>${d}</option>`).join('')}</select></label>
        <label>Credit fuel paid after<select onchange="window._wcfSetTop('fuelTermsDays', this.value)">${[0, 7, 15, 30, 45].map(d => `<option value="${d}" ${fuelDays === d ? 'selected' : ''}>${d ? d + ' days' : 'same day'}</option>`).join('')}</select></label>
        <label>Cash in hand today<input type="number" inputmode="decimal" placeholder="${Math.round(bankCash ?? ctx.cashDerived)} (from books)" value="${w.openingOverride ?? ''}" onchange="window._wcfSet('openingOverride', this.value)"></label>
      </div>
      <div class="wcf-sub">Recurring costs <small>rent, equipment hire, utilities, salaries</small></div>
      ${recurring || '<p class="wcf-hint">None yet.</p>'}
      <div class="wcf-form rec">
        <input id="wcfRecName" placeholder="e.g. JCB hire">
        <input id="wcfRecAmt" type="number" inputmode="decimal" placeholder="Amount">
        <select id="wcfRecFreq" onchange="document.getElementById('wcfRecDay').innerHTML=this.value==='weekly'?window._wcfWdOpts():window._wcfMdOpts()"><option value="monthly">Monthly</option><option value="weekly">Weekly</option></select>
        <select id="wcfRecDay">${_mdOpts()}</select>
        <button type="button" onclick="window._wcfAddRec()">+ Add</button>
      </div>
      <p class="wcf-hint">Payment terms come from each party (Net days or weekly, and for suppliers whether they start from the bill or the GRN). Bills and invoices with their own due date use it. A fuel pump set up as a supplier uses its own terms.</p>
    </details>`;
}

function _mdOpts() { return Array.from({ length: 31 }, (_, i) => `<option value="${i + 1}">Day ${i + 1}</option>`).join(''); }
window._wcfMdOpts = _mdOpts;
window._wcfWdOpts = () => WD.map((d, i) => `<option value="${i}">${d}</option>`).join('');

/** Today's balance across Bank / Cash accounts, or null when there are none to read. */
function _bankCash() {
  const accs = (state.accounts || []).filter(a => /bank|cash/i.test(a.type || ''));
  if (!accs.length || typeof window._getAccountBalancePublic !== 'function') return null;
  return accs.reduce((s, a) => s + N(window._getAccountBalancePublic(a.id)), 0);
}

/** Bars: in above zero, out below; line: ending cash; dashed: reserve. One ₹ axis. */
function _chart(buckets, reserve, mode) {
  // Drawn at the container's real width (1 unit = 1px), so text never stretches or shrinks.
  const host = document.getElementById('cashFlowRoot');
  const W = Math.max(300, Math.min(1200, (host?.clientWidth || 720) - 30)), H = W < 520 ? 210 : 260;
  const padL = 50, padR = 8, padT = 12, padB = 26;
  const vals = buckets.flatMap(b => [b.in, -b.out, b.endCash, 0, reserve || 0]);
  let max = Math.max(...vals), min = Math.min(...vals);
  if (max === min) { max += 1; min -= 1; }
  const span = max - min; max += span * 0.06; min -= span * 0.06;
  const y = v => padT + (max - v) / (max - min) * (H - padT - padB);
  const n = buckets.length, slot = (W - padL - padR) / n, bw = Math.max(6, Math.min(28, slot * 0.42));
  const x = i => padL + slot * i + slot / 2;
  const ticks = 4, grid = Array.from({ length: ticks + 1 }, (_, i) => min + (max - min) * i / ticks);
  const r = 4;
  const bar = (cx, v, color, i, kind) => {
    if (!(Math.abs(v) > 0)) return '';
    const y0 = y(0), y1 = y(v), top = Math.min(y0, y1), h = Math.max(1, Math.abs(y1 - y0));
    const xL = cx - bw / 2;
    // rounded data end only (away from the baseline)
    const path = v > 0
      ? `M${xL},${y0} V${top + r} Q${xL},${top} ${xL + r},${top} H${xL + bw - r} Q${xL + bw},${top} ${xL + bw},${top + r} V${y0} Z`
      : `M${xL},${y0} V${top + h - r} Q${xL},${top + h} ${xL + r},${top + h} H${xL + bw - r} Q${xL + bw},${top + h} ${xL + bw},${top + h - r} V${y0} Z`;
    return `<path d="${path}" fill="${color}" data-i="${i}" data-k="${kind}"><title>${esc(buckets[i].label)} · ${kind === 'in' ? 'Money in ' + money(v) : 'Money out ' + money(-v)}</title></path>`;
  };
  const _stack = (b, cx, w, yy) => {
    // Down from zero in fixed category order; 2px surface gap between segments; last one gets the rounded end.
    const segs = OUT_CATS.filter(c => b.outBy[c] > 0);
    let acc = 0;
    return segs.map((c, k) => {
      const v = b.outBy[c], y0 = yy(-acc) + (k ? 1 : 0), y1 = yy(-(acc + v)) - (k < segs.length - 1 ? 1 : 0);
      acc += v;
      const h = Math.max(1, y1 - y0), xL = cx - w / 2, last = k === segs.length - 1 && h > r;
      const d = last
        ? `M${xL},${y0} V${y0 + h - r} Q${xL},${y0 + h} ${xL + r},${y0 + h} H${xL + w - r} Q${xL + w},${y0 + h} ${xL + w},${y0 + h - r} V${y0} Z`
        : `M${xL},${y0} h${w} v${h} h${-w} Z`;
      return `<path d="${d}" fill="${CAT[c].c}"><title>${esc(b.label)} · ${CAT[c].l} ${money(v)} (of ${money(b.out)} out)</title></path>`;
    }).join('');
  };
  const line = buckets.map((b, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(b.endCash).toFixed(1)}`).join(' ');
  const every = n > 8 ? (W < 520 ? 3 : 2) : 1;
  return `<div class="wcf-chart"><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Projected money in, money out and ending cash per ${mode === 'month' ? 'month' : 'week'}" >
    ${grid.map(g => `<line x1="${padL}" x2="${W - padR}" y1="${y(g).toFixed(1)}" y2="${y(g).toFixed(1)}" stroke="#e5e7eb" stroke-width="1"/><text x="${padL - 6}" y="${(y(g) + 3.5).toFixed(1)}" text-anchor="end" class="wcf-ax">${short(g)}</text>`).join('')}
    <line x1="${padL}" x2="${W - padR}" y1="${y(0)}" y2="${y(0)}" stroke="#94a3b8" stroke-width="1.2"/>
    ${buckets.map((b, i) => b.endCash < 0 ? `<rect x="${(x(i) - slot / 2).toFixed(1)}" y="${padT}" width="${slot.toFixed(1)}" height="${H - padT - padB}" fill="#fee2e2" opacity=".35"/>` : '').join('')}
    ${reserve > 0 ? `<line x1="${padL}" x2="${W - padR}" y1="${y(reserve).toFixed(1)}" y2="${y(reserve).toFixed(1)}" stroke="#d97706" stroke-width="1.5" stroke-dasharray="5 4"/>` : ''}
    ${buckets.map((b, i) => bar(x(i), b.in, IN, i, 'in') + _stack(b, x(i), bw, y, i)).join('')}
    <path d="${line}" fill="none" stroke="${INK}" stroke-width="2" stroke-linejoin="round"/>
    ${buckets.map((b, i) => `<circle cx="${x(i).toFixed(1)}" cy="${y(b.endCash).toFixed(1)}" r="4" fill="${b.endCash < 0 ? OUT : INK}" stroke="#fff" stroke-width="2"><title>${esc(b.label)} · ending cash ${money(b.endCash)}</title></circle>`).join('')}
    ${buckets.map((b, i) => i % every ? '' : `<text x="${x(i).toFixed(1)}" y="${H - 10}" text-anchor="middle" class="wcf-ax">${esc(i === 0 ? 'Now' : mode === 'month' ? b.label.slice(0, 3) : new Date(b.start + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }))}</text>`).join('')}
  </svg></div>`;
}

/** What fed the forecast, and the records that would make it wrong. */
function _sourcesPanel(a) {
  const c = a.counts, n = v => Number(v || 0).toLocaleString('en-IN');
  const src = [
    [c.attendance, 'attendance entries', `${n(c.workers)} workers → wages on pay day`],
    [c.grns, 'GRNs not billed', 'qty × rate → supplier terms'],
    [c.bills, 'purchase bills', 'open balance → due date'],
    [c.machines, 'hired machines', `${n(c.runbook)} runbook entries → hire rent`],
    [c.fuelCredit, 'credit fuel fills', 'pump khata → fuel terms'],
    [c.invoices, 'invoices', 'net of retention &amp; TDS → client terms'],
    [c.raBills, 'RA bills not invoiced', 'expected, less retention'],
  ];
  return `<details class="wcf-card wcf-set wcf-src"${a.gaps.length ? ' open' : ''}>
    <summary><b>What feeds this forecast</b><small>${a.gaps.length ? `<em class="neg">${a.gaps.length} gap${a.gaps.length === 1 ? '' : 's'} to fix</em>` : 'no gaps found'}</small></summary>
    ${a.gaps.length ? `<ul class="wcf-gaps">${a.gaps.map(g => `<li><b>${n(g.count)}</b> ${esc(g.text)}</li>`).join('')}</ul>` : ''}
    <div class="wcf-srcs">${src.map(([k, l, how]) => `<div><b>${n(k)}</b><span>${l}</span><small>${how}</small></div>`).join('')}</div>
    <p class="wcf-hint">Every figure is worked out from these records each time you open this page — log attendance, a GRN, a runbook entry or a payment and the forecast moves with it. Payments clear the oldest dues first.</p>
  </details>`;
}

/** Cost vs Profit — work done vs money spent, to date, per project (Micro-Planning engine). */
function _profitView(ctx) {
  const rows = (ctx.pnl ? ctx.pnl() : []).filter(p => p && (p.earned > 0 || p.totalCost > 0));
  if (!rows.length) return `<div class="wcf-card wcf-empty"><b>No measured work yet</b><span>Record work on Micro-Planning's daily sheet; earned value vs cost appears here per project.</span></div>`;
  const t = rows.reduce((a, p) => ({ earned: a.earned + p.earned, cost: a.cost + p.totalCost, profit: a.profit + p.profit, wip: a.wip + (p.wip || 0) }), { earned: 0, cost: 0, profit: 0, wip: 0 });
  const max = Math.max(...rows.map(p => Math.max(p.earned, p.totalCost)), 1);
  return `<div class="wcf-kpis">
      <div><span>Work done</span><b class="pos">${money(t.earned)}</b><small>earned value to date</small></div>
      <div><span>Cost</span><b>${money(t.cost)}</b><small>material + labour + other</small></div>
      <div><span>${t.profit >= 0 ? 'Profit' : 'Loss'}</span><b class="${t.profit < 0 ? 'neg' : 'pos'}">${money(t.profit)}</b><small>${t.earned > 0 ? (t.profit / t.earned * 100).toFixed(1) + '% margin' : ''}</small></div>
      <div><span>Not yet billed</span><b>${money(t.wip)}</b><small>work done, no RA bill</small></div>
    </div>
    <section class="wcf-card flush">${rows.sort((a, b) => b.earned - a.earned).map(p => `<div class="wcf-pp">
      <div class="wcf-pp-h"><b>${esc(p.projectName)}</b><span class="${p.profit < 0 ? 'neg' : 'pos'}">${money(p.profit)} · ${N(p.marginPct).toFixed(1)}%</span></div>
      <div class="wcf-pp-bar" title="Work done ${money(p.earned)}"><i style="width:${(p.earned / max * 100).toFixed(1)}%;background:${IN}"></i></div>
      <div class="wcf-pp-bar" title="Cost ${money(p.totalCost)}"><i style="width:${(p.totalCost / max * 100).toFixed(1)}%;background:${OUT}"></i></div>
      <div class="wcf-pp-f"><span>Work done ${money(p.earned)}</span><span>Cost ${money(p.totalCost)}</span></div>
    </div>`).join('')}</section>
    <p class="wcf-hint">To date, from the same engine as Micro-Planning → Cost &amp; Profit. Green = work done, red = cost.</p>`;
}

window._wcfSet = (k, v) => { cfg().working[k] = (k === 'buffer') ? N(v) : v; saveAllData(); window.renderCashFlow?.(); };
window._wcfSetTop = (k, v) => { cfg()[k] = N(v); saveAllData(); window.renderCashFlow?.(); };
window._wcfToggle = (key) => { _open = _open === key ? null : key; window.renderCashFlow?.(); };
window._wcfAddRec = () => {
  const name = document.getElementById('wcfRecName')?.value.trim();
  const amount = N(document.getElementById('wcfRecAmt')?.value);
  const freq = document.getElementById('wcfRecFreq')?.value || 'monthly';
  const day = N(document.getElementById('wcfRecDay')?.value);
  if (!name || !(amount > 0)) { showToast('Enter a name and an amount', 'error'); return; }
  cfg().recurring.push({ id: 'rc_' + Date.now(), name, amount, freq, day, dir: 'out' });
  saveAllData(); showToast(`${name} added to the forecast`, 'success'); window.renderCashFlow?.();
};
window._wcfDelRec = (id) => { const s = cfg(); s.recurring = s.recurring.filter(r => r.id !== id); saveAllData(); window.renderCashFlow?.(); };
