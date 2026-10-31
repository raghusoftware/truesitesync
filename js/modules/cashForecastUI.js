/**
 * cashForecastUI.js — the Cash Flow hero: "Will I have enough cash next week and next month?"
 *
 *   Toggle    This Week · Next 4 Weeks · Next 3 Months
 *   Banner    cash shortfall (first bucket that ends below zero) — or all clear
 *   Timeline  one card per bucket, exactly three numbers:
 *               Starting cash → Expected inflow (green) vs Expected outflow (red) → Projected ending cash
 *             a bucket ending below zero is tinted and flagged
 *   Drill     tap the green or red bar → side panel (desktop) / bottom sheet (phone) listing the
 *             invoices, bills, certificates and payroll behind the number; bills can be delayed a week
 *
 * The forecast is a pure function of the books (cashForecast.js), recomputed on every render.
 * Any save anywhere ('tss:data-saved') re-renders it, so a receipt or payment shows at once:
 * the document's open amount drops and the bank balance (starting cash) moves.
 */
import { state, saveAllData } from './state.js';
import { settledAmount } from './deductions.js';
import { getCurrencySymbol } from './utils.js';
import { lockedRetention } from './billingRules.js?v=1.0.0';
import { forecastItems, bucketize, forecastSummary, wageRunRate, addDays, shortDate, VIEWS } from './cashForecast.js?v=2.0.2';

const N = v => parseFloat(v) || 0;
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const money = v => (N(v) < 0 ? '−' : '') + getCurrencySymbol() + Math.round(Math.abs(N(v))).toLocaleString('en-IN');
const WD = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const SRC = { sale: 'Sale invoice', ra: 'RA bill', retention: 'Retention release', bill: 'Purchase bill', subcon: 'Subcontractor', labour: 'Labour bill', payroll: 'Payroll' };
let _drill = null;     // { key: bucket start, dir: 'in'|'out' } — the open sheet
let _last = null;      // last computed buckets (the sheet reads from them)

function cfg() {
  const s = state.cashFlowSettings || (state.cashFlowSettings = {});
  if (!s.hero) s.hero = { view: '4w' };
  if (!s.payOn) s.payOn = {};
  return s;
}

/** Today's balance across Bank / Cash accounts, or null when there are none to read. */
function _bankCash() {
  const accs = (state.accounts || []).filter(a => /bank|cash/i.test(a.type || ''));
  if (!accs.length || typeof window._getAccountBalancePublic !== 'function') return null;
  return accs.reduce((s, a) => s + N(window._getAccountBalancePublic(a.id)), 0);
}

function _compute(ctx) {
  const s = cfg(), h = s.hero, v = VIEWS[h.view] || VIEWS['4w'];
  const today = new Date().toISOString().slice(0, 10);
  const bank = _bankCash();
  const override = h.cashOverride != null && h.cashOverride !== '';
  const opening = override ? N(h.cashOverride) : (bank ?? N(ctx.cashDerived));
  const payDay = s.labourPayDay != null ? N(s.labourPayDay) : 6;
  const items = forecastItems(state, {
    today, payDay, defaultTermsDays: N(s.creditDays) || 30, weeklyPayroll: h.weeklyPayroll,
    payOn: s.payOn, settled: settledAmount, horizonDays: v.size * v.count + 7,
  });
  const buckets = bucketize(items, { today, size: v.size, count: v.count, openingCash: opening });
  return { s, h, v, today, opening, source: override ? 'entered by you' : bank != null ? 'bank + cash accounts' : 'received − paid', payDay, buckets, sum: forecastSummary(buckets) };
}

/** @param {{ cashDerived:number }} ctx  cashDerived = received − paid, used when there are no bank accounts */
export function renderWorkingCF(ctx) {
  const m = _compute(ctx), { h, v, buckets, sum } = m;
  _last = buckets;
  const seg = Object.entries(VIEWS).map(([k, x]) => `<button type="button" role="tab" aria-selected="${h.view === k}" class="xcf-seg-b${h.view === k ? ' on' : ''}" onclick="window._xcfView('${k}')">${x.label}</button>`).join('');
  const sf = sum.shortfall;
  const banner = sf
    ? `<div class="xcf-alert neg" role="alert"><span class="xcf-alert-ic" aria-hidden="true">!</span><div>
        <b>Cash shortfall projected for ${esc(sf.name)}</b>
        <span>${esc(sf.range)} · cash falls to <b>${money(sf.endCash)}</b>. Open the red bar to see which payments you could delay.</span></div></div>`
    : `<div class="xcf-alert ok" role="status"><span class="xcf-alert-ic" aria-hidden="true">✓</span><div>
        <b>No shortfall ${v.count === 1 ? 'this week' : 'in the ' + v.label.toLowerCase()}</b>
        <span>Lowest point ${money(sum.lowest)}${sum.lowestAt ? ' · ' + esc(sum.lowestAt.name) : ''}.</span></div></div>`;
  const scale = Math.max(1, ...buckets.map(b => Math.max(b.in, b.out)));
  const pct = x => Math.max(x > 0 ? 3 : 0, x / scale * 100).toFixed(1);
  const cards = buckets.map(b => `
    <article class="xcf-card${b.short ? ' short' : ''}" aria-label="${esc(b.name)}, ${esc(b.range)}">
      <header><div><b>${esc(b.name)}</b><small>${esc(b.range)}</small></div>${b.short ? '<em class="xcf-flag">Shortfall</em>' : ''}</header>
      <div class="xcf-n"><span>Starting cash</span><b class="${b.startCash < 0 ? 'neg' : ''}">${money(b.startCash)}</b></div>
      <button type="button" class="xcf-flow in" onclick="window._xcfDrill('${b.key}','in')" ${b.in > 0 ? '' : 'disabled'} aria-label="Expected inflow ${money(b.in)} — show invoices">
        <span class="xcf-flow-h"><span>Expected inflow</span><b>+${money(b.in)}</b></span>
        <span class="xcf-track"><i style="width:${pct(b.in)}%"></i></span>
      </button>
      <button type="button" class="xcf-flow out" onclick="window._xcfDrill('${b.key}','out')" ${b.out > 0 ? '' : 'disabled'} aria-label="Expected outflow ${money(b.out)} — show bills and payroll">
        <span class="xcf-flow-h"><span>Expected outflow</span><b>−${money(b.out)}</b></span>
        <span class="xcf-track"><i style="width:${pct(b.out)}%"></i></span>
      </button>
      <div class="xcf-n end"><span>Projected ending cash</span><b class="${b.endCash < 0 ? 'neg' : ''}">${money(b.endCash)}</b></div>
    </article>`).join('');
  const autoPayroll = wageRunRate(state, m.today);
  const delayed = Object.keys(m.s.payOn).length;
  return `<div class="xcf">
    <div class="xcf-top">
      <div class="xcf-seg" role="tablist" aria-label="Forecast period">${seg}</div>
      <div class="xcf-cash"><span>Cash in bank today</span><b class="${m.opening < 0 ? 'neg' : ''}">${money(m.opening)}</b><small>${esc(m.source)}</small></div>
    </div>
    ${banner}
    <div class="xcf-timeline n${buckets.length}">${cards}</div>
    ${_lockedHTML()}
    <details class="xcf-set">
      <summary>How this is worked out <small>approved invoices, bills, subcontractor certificates, labour bills and payroll — nothing else</small></summary>
      <ul class="xcf-how">
        <li><b class="in">Inflow</b> — unpaid sale invoices and RA bills (net of retention &amp; TDS), due on the client's payment terms.</li>
        <li><b class="out">Outflow</b> — unpaid purchase bills on the supplier's terms, unpaid subcontractor certificates, approved piece-rate labour bills, and payroll on pay day (wages earned + the weekly run-rate).</li>
        <li>Drafts and cancelled documents are ignored. Every receipt or payment you record clears the oldest open document of that party at once. Anything overdue counts today.</li>
      </ul>
      <div class="xcf-form">
        <label>Pay day<select onchange="window._xcfSet('labourPayDay', this.value, true)">${WD.map((d, i) => `<option value="${i}" ${m.payDay === i ? 'selected' : ''}>${d}</option>`).join('')}</select></label>
        <label>Weekly payroll<input type="number" inputmode="decimal" placeholder="${Math.round(autoPayroll)} (last 2 weeks)" value="${esc(h.weeklyPayroll ?? '')}" onchange="window._xcfSet('weeklyPayroll', this.value)"></label>
        <label>Cash in bank today<input type="number" inputmode="decimal" placeholder="${Math.round(_bankCash() ?? N(ctx.cashDerived))} (from books)" value="${esc(h.cashOverride ?? '')}" onchange="window._xcfSet('cashOverride', this.value)"></label>
      </div>
      ${delayed ? `<p class="xcf-hint">${delayed} payment${delayed === 1 ? '' : 's'} delayed by you. <button type="button" class="xcf-link" onclick="window._xcfClearDelays()">Restore due dates</button></p>` : ''}
    </details>
  </div>`;
}

/** Retention held by clients: real money, but not due for months — shown apart from the buckets. */
function _lockedHTML() {
  const L = lockedRetention(state);
  if (!(L.total > 0) && !(L.claimed > 0)) return '';
  const top = L.byClient.slice(0, 3).map(c => `<li><button type="button" onclick="window.openPartyDetail&&(switchView('partiesLedgerView'),window.openPartyDetail('${esc(c.clientId)}','Client'))"><span>${esc(c.name)}</span><b>${money(c.held + c.due)}</b></button></li>`).join('');
  return `<section class="xcf-lock" aria-label="Locked future cash">
    <div class="xcf-lock-h"><span class="xcf-lock-ic" aria-hidden="true">🔒</span>
      <div><b>Locked future cash · retention</b><small>Held by clients until handover / defect liability. Not counted in the forecast above until you raise a retention release bill.</small></div>
      <b class="xcf-lock-amt">${money(L.total)}</b></div>
    <div class="xcf-lock-split"><span><i class="h"></i>Withheld so far <b>${money(L.held)}</b></span>${L.due > 0 ? `<span><i class="d"></i>Will be withheld on unpaid bills <b>${money(L.due)}</b></span>` : ''}${L.claimed > 0 ? `<span><i class="c"></i>Release bills raised (in forecast) <b>${money(L.claimed)}</b></span>` : ''}</div>
    ${top ? `<ul class="xcf-lock-list">${top}</ul>` : ''}
  </section>`;
}

// ── Drill-down sheet ──────────────────────────────────────────────────────────
function _sheetHTML() {
  const b = (_last || []).find(x => x.key === _drill?.key);
  if (!b) return '';
  const isIn = _drill.dir === 'in', list = isIn ? b.inItems : b.outItems, total = isIn ? b.in : b.out;
  const s = cfg();
  const row = e => {
    const canDelay = !isIn && (e.src === 'bill' || e.src === 'subcon' || e.src === 'labour');
    const late = e.overdue || (e.src === 'payroll' && e.detail.overdue > 0);
    const tag = late ? '<em class="od">Overdue</em>' : e.moved ? '<em class="mv">Delayed</em>' : '';
    const pay = e.src === 'payroll' && e.detail;
    const sub = pay
      ? (pay.overdue > 0 && pay.overdue === e.amount ? 'Wages from past pay days, still unpaid · due now'
        : `Pay day ${shortDate(e.date)} · ${pay.earned ? money(pay.earned) + ' earned' : ''}${pay.earned && pay.projected ? ' + ' : ''}${pay.projected ? money(pay.projected) + ' projected' : ''}`)
      : `${SRC[e.src]} · ${esc(e.ref)} · due ${shortDate(e.date)}`;
    return `<li class="xcf-item">
      <div><b>${esc(e.party)}${e.src === 'payroll' ? ' · ' + esc(e.ref) : ''}</b> ${tag}<small>${sub}</small></div>
      <div class="xcf-item-r"><b class="${isIn ? 'in' : 'out'}">${money(e.amount)}</b>
        ${canDelay ? (s.payOn[e.key] ? `<button type="button" onclick="window._xcfDelay('${e.key}', null)">Undo delay</button>` : `<button type="button" onclick="window._xcfDelay('${e.key}', '${addDays(e.date, 7)}')">Delay 1 week</button>`) : ''}</div>
    </li>`;
  };
  const pay = list.filter(e => e.src === 'payroll'), docs = list.filter(e => e.src !== 'payroll').sort((a, c) => c.amount - a.amount);
  return `<div id="xcfDrillOverlay" class="xcf-sheet-bg" onclick="if(event.target===this)window._xcfClose()">
    <section class="xcf-sheet" role="dialog" aria-modal="true" aria-labelledby="xcfSheetT">
      <header><div><small>${esc(b.name)} · ${esc(b.range)}</small><h3 id="xcfSheetT">Expected ${isIn ? 'inflow' : 'outflow'} <b class="${isIn ? 'in' : 'out'}">${money(total)}</b></h3></div>
        <button type="button" class="xcf-x" onclick="window._xcfClose()" aria-label="Close">✕</button></header>
      ${!isIn && b.short ? `<p class="xcf-sheet-note">${esc(b.name)} ends at <b>${money(b.endCash)}</b>. Delaying ${money(-b.endCash)} of bills keeps you above zero.</p>` : ''}
      ${pay.length ? `<div class="xcf-grp">Payroll</div><ul>${pay.map(row).join('')}</ul>` : ''}
      ${docs.length ? `<div class="xcf-grp">${isIn ? 'Invoices &amp; RA bills' : 'Bills &amp; certificates'} · largest first</div><ul>${docs.map(row).join('')}</ul>` : ''}
    </section></div>`;
}
function _paintSheet() {
  document.getElementById('xcfDrillOverlay')?.remove();
  if (!_drill) return;
  const html = _sheetHTML(); if (!html) { _drill = null; return; }
  document.body.insertAdjacentHTML('beforeend', html);
  const el = document.getElementById('xcfDrillOverlay');
  el.__onBack = () => window._xcfClose();           // phone Back closes the sheet
}

window._xcfDrill = (key, dir) => { _drill = { key, dir }; _paintSheet(); document.querySelector('#xcfDrillOverlay .xcf-x')?.focus(); };
window._xcfClose = () => { _drill = null; document.getElementById('xcfDrillOverlay')?.remove(); };
document.addEventListener('keydown', e => { if (e.key === 'Escape' && _drill) window._xcfClose(); });
window._xcfView = (k) => { cfg().hero.view = k; _drill = null; saveAllData(); };
window._xcfSet = (k, v, top) => { const s = cfg(); if (top) s[k] = N(v); else s.hero[k] = v === '' ? '' : N(v); saveAllData(); };
window._xcfDelay = (key, date) => { const s = cfg(); if (date) s.payOn[key] = date; else delete s.payOn[key]; saveAllData(); };
window._xcfClearDelays = () => { cfg().payOn = {}; saveAllData(); };

// Live: any save (a receipt, a payment, a bill, an attendance day) re-renders the open
// dashboard and the open sheet. Coalesced to one paint per frame.
let _queued = false;
window.addEventListener('tss:data-saved', () => {
  if (_queued) return; _queued = true;
  requestAnimationFrame(() => {
    _queued = false;
    const root = document.getElementById('cashFlowRoot');
    if (!root || !root.offsetParent || !root.querySelector('.xcf')) { if (_drill) window._xcfClose(); return; }
    window.renderCashFlow?.();
    if (_drill) _paintSheet();
  });
});
