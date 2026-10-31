/**
 * bankCash.js — Bank & Cash (accountsManagerView), mobile-first.
 *
 *   Balance header   sticky; Total available funds with the Cash in hand ⇄ Bank balance split,
 *                    credit lines (OD / CC / loans) shown apart; folds to one line while scrolling.
 *   Account tiles    horizontal row; tap = show only that account (with running balance).
 *   Quick chips      Last 7 days · This month · Cash · Bank · Money in · Money out — instant, client-side.
 *   Filter sheet     bottom sheet (phone) / side panel (desktop): period pills + a custom range calendar,
 *                    money in/out, cash/bank, accounts, types, amount range, search, hide own transfers.
 *                    Works on a draft; "Show N transactions" applies it. Respects safe area + keyboard.
 *   Ledger           day sections; each movement is a card: type icon · party + account · signed amount.
 * Maths: bankCashCalc.js.
 */
import { state, saveAllData, keepOnly } from './state.js';
import { showToast, getCurrencySymbol } from './utils.js';
import { movements, balances, applyFilter, groupByDay, filterCount, totals, PERIODS, TYPES } from './bankCashCalc.js?v=1.0.0';

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const money = (v, sign) => { const n = Number(v) || 0; const s = getCurrencySymbol() + Math.abs(n).toLocaleString('en-IN', { maximumFractionDigits: 2, minimumFractionDigits: Math.abs(n) % 1 ? 2 : 0 }); return sign ? (n < 0 ? '−' : '+') + s : (n < 0 ? '−' : '') + s; };
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const WD = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const dayTitle = iso => { const d = new Date(iso + 'T12:00:00'); return isNaN(d) ? iso : `${WD[d.getDay()]}, ${d.getDate()} ${MON[d.getMonth()]}${d.getFullYear() !== new Date().getFullYear() ? ' ' + d.getFullYear() : ''}`; };
const shortD = iso => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || ''); return m ? `${+m[3]} ${MON[+m[2] - 1]}` : ''; };

// ── icons (stroke SVG, currentColor) ──
const P = d => `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
const IC = {
  bank: P('<path d="M3 10h18L12 4 3 10z"/><path d="M5 10v8M9.5 10v8M14.5 10v8M19 10v8M3 20h18"/>'),
  cash: P('<rect x="2.5" y="6" width="19" height="12" rx="2"/><circle cx="12" cy="12" r="2.6"/><path d="M6 9.5v5M18 9.5v5"/>'),
  credit: P('<rect x="2.5" y="5.5" width="19" height="13" rx="2"/><path d="M2.5 10h19M6.5 15h4"/>'),
  receipt: P('<path d="M17 7 7 17M7 9v8h8"/>'),
  income: P('<path d="M12 4v16M5 11l7-7 7 7"/>'),
  supplier: P('<path d="M3 7h11v9H3zM14 10h4l3 3v3h-7"/><circle cx="7" cy="17.5" r="1.8"/><circle cx="17" cy="17.5" r="1.8"/>'),
  labour: P('<path d="M4 15a8 8 0 0 1 16 0"/><path d="M3 15h18v2H3zM10 7V5h4v2"/>'),
  expense: P('<path d="M6 3h12v18l-3-2-3 2-3-2-3 2z"/><path d="M9 8h6M9 12h6"/>'),
  equipment: P('<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1"/>'),
  transfer: P('<path d="M4 8h14l-4-4M20 16H6l4 4"/>'),
  petty: P('<path d="M3 7h15a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><path d="M3 7l12-3v3M16 13h.01"/>'),
  filter: P('<path d="M4 6h16M7 12h10M10 18h4"/>'),
  plus: P('<path d="M12 5v14M5 12h14"/>'), minus: P('<path d="M5 12h14"/>'),
  close: P('<path d="M6 6l12 12M18 6 6 18"/>'), pen: P('<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/>'),
  search: P('<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>'), cal: P('<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 10h18"/>'),
};

// ── filter state: applied (_f) and the sheet's draft (_d) ──
let _f = {};
let _d = null;
let _cal = null;   // { y, m, pick:0|1 } calendar popover state
const CHIPS = [
  ['7d', 'Last 7 days', f => f.period === '7d', f => ({ ...f, period: f.period === '7d' ? '' : '7d', from: '', to: '' })],
  ['month', 'This month', f => f.period === 'month', f => ({ ...f, period: f.period === 'month' ? '' : 'month', from: '', to: '' })],
  ['cash', 'Cash only', f => f.kind === 'cash', f => ({ ...f, kind: f.kind === 'cash' ? '' : 'cash' })],
  ['bank', 'Bank only', f => f.kind === 'bank', f => ({ ...f, kind: f.kind === 'bank' ? '' : 'bank' })],
  ['in', 'Money in', f => f.dir === 'in', f => ({ ...f, dir: f.dir === 'in' ? '' : 'in' })],
  ['out', 'Money out', f => f.dir === 'out', f => ({ ...f, dir: f.dir === 'out' ? '' : 'out' })],
];

export function renderBankCash() {
  const root = document.getElementById('bankCashRoot'); if (!root) return;
  const all = movements(state), b = balances(state, all);
  const cashPct = b.available > 0 ? Math.max(0, Math.min(100, b.cash / b.available * 100)) : 50;
  const tiles = b.accounts.map(a => {
    const on = (_f.accounts || []).includes(a.id);
    return `<div class="bk-acct${on ? ' on' : ''} ${a.kind}" role="button" tabindex="0" aria-pressed="${on}" onclick="window._bkAcct('${a.id}')" onkeydown="if(event.key==='Enter')window._bkAcct('${a.id}')">
      <span class="bk-acct-ic" aria-hidden="true">${IC[a.kind]}</span>
      <span class="bk-acct-t"><small>${esc(a.name)}</small><b class="${a.balance < 0 ? 'neg' : ''}">${money(a.balance)}</b>${a.kind === 'credit' && a.limit ? `<em>${money(Math.max(0, a.limit + Math.min(0, a.balance)))} available</em>` : ''}</span>
      <button type="button" class="bk-acct-ed" aria-label="Edit ${esc(a.name)}" onclick="event.stopPropagation();openAccountModal('${a.id}')">${IC.pen}</button>
    </div>`;
  }).join('');
  root.innerHTML = `<div class="bk">
    <div class="bk-sticky" id="bkSticky">
      <section class="bk-hero" aria-label="Available funds">
        <div class="bk-hero-l">
          <span class="bk-hero-k">Total available funds</span>
          <b class="bk-total ${b.available < 0 ? 'neg' : ''}">${money(b.available)}</b>
          <div class="bk-mini"><span>Cash <b>${money(b.cash)}</b></span><span>Bank <b>${money(b.bank)}</b></span></div>
        </div>
        <div class="bk-split" role="img" aria-label="Cash in hand ${money(b.cash)}, bank balance ${money(b.bank)}"><i class="c" style="width:${cashPct.toFixed(1)}%"></i><i class="b" style="width:${(100 - cashPct).toFixed(1)}%"></i></div>
        <div class="bk-split-l">
          <div><span><i class="c"></i>Cash in hand</span><b>${money(b.cash)}</b></div>
          <div><span><i class="b"></i>Bank balance</span><b>${money(b.bank)}</b></div>
        </div>
        ${b.credit < 0 ? `<p class="bk-credit">${IC.credit}<span>Borrowed on OD / CC / loans <b>${money(-b.credit)}</b> — not counted as available</span></p>` : ''}
        <div class="bk-acts">
          <button type="button" class="in" onclick="window._pmtStart&&window._pmtStart('in')">${IC.plus}<span>Money in</span></button>
          <button type="button" class="out" onclick="window._pmtStart&&window._pmtStart('out')">${IC.minus}<span>Money out</span></button>
          <button type="button" onclick="window._bkTransfer()">${IC.transfer}<span>Transfer</span></button>
          <button type="button" onclick="openAccountModal()">${IC.bank}<span>Account</span></button>
        </div>
      </section>
      <div class="bk-chips" role="toolbar" aria-label="Quick filters" id="bkChips"></div>
    </div>
    <i class="bk-sentinel" aria-hidden="true"></i>
    ${b.accounts.length ? `<div class="bk-accts" aria-label="Accounts">${tiles}</div>` : `<div class="bk-empty"><b>No bank or cash account yet</b><span>Add your bank account and site cash to see balances here.</span><button type="button" class="bk-btn" onclick="openAccountModal()">+ Add account</button></div>`}
    <div id="bkList"></div>
  </div>`;
  _paintList(all);
  _wireCompact(root);
}

/** Chips + result line + ledger — the fast path every chip tap takes. */
function _paintList(all = movements(state)) {
  const chips = document.getElementById('bkChips'), box = document.getElementById('bkList'); if (!box || !chips) return;
  const n = filterCount(_f);
  chips.innerHTML = `<button type="button" class="bk-fbtn${n ? ' on' : ''}" onclick="window._bkSheet()" aria-label="All filters${n ? ', ' + n + ' on' : ''}">${IC.filter}<span>Filters</span>${n ? `<em>${n}</em>` : ''}</button>`
    + CHIPS.map(([k, l, on]) => `<button type="button" class="bk-chip${on(_f) ? ' on' : ''}" aria-pressed="${on(_f)}" onclick="window._bkChip('${k}')">${l}</button>`).join('');
  const list = applyFilter(all, _f, today());
  const t = totals(list);
  // Running balance when one account is in view.
  const one = (_f.accounts || []).length === 1 ? _f.accounts[0] : '';
  const after = {};
  if (one) {
    let bal = balances(state, all).accounts.find(a => a.id === one)?.balance || 0;
    all.filter(m => m.accountId === one).forEach(m => { after[m.id + m.leg] = bal; bal -= m.amount; });
  }
  const sections = groupByDay(list, today()).map(d => `<section class="bk-day">
      <header><b>${d.label ? d.label + ' · ' : ''}${esc(dayTitle(d.date))}</b><span class="${d.net < 0 ? 'neg' : 'pos'}">${money(d.net, true)}</span></header>
      ${d.items.map(m => `<button type="button" class="bk-tx ${m.dir}" onclick="window._bkTx('${m.src}','${esc(m.id)}','${m.leg}')">
        <span class="bk-tx-ic ${m.type}" aria-hidden="true">${IC[m.type] || IC[m.kind]}</span>
        <span class="bk-tx-m"><b>${esc(m.party)}</b><small><span class="bk-k ${m.kind}">${m.kind === 'cash' ? 'Cash' : m.kind === 'credit' ? 'Credit' : 'Bank'}</span>${esc(m.accountName)} · ${esc(TYPES[m.type])}${m.note ? ' · ' + esc(m.note) : ''}</small></span>
        <span class="bk-tx-a"><b>${money(m.amount, true)}</b>${one ? `<small>Bal ${money(after[m.id + m.leg])}</small>` : ''}</span>
      </button>`).join('')}
    </section>`).join('');
  box.innerHTML = `<div class="bk-res"><span><b>${t.count}</b> transaction${t.count === 1 ? '' : 's'}${n ? ` · <button type="button" class="bk-link" onclick="window._bkClear()">Clear filters</button>` : ''}</span>
      <span><em class="pos">${money(t.in, true)}</em><em>${money(-t.out, true)}</em></span></div>
    ${sections || `<div class="bk-empty"><b>${all.length ? 'Nothing matches these filters' : 'No transactions yet'}</b><span>${all.length ? 'Try a wider period or clear the filters.' : 'Money in and out recorded against an account shows up here.'}</span></div>`}`;
}

// Fold the header to one line once the page scrolls past it.
function _wireCompact(root) {
  const sentinel = root.querySelector('.bk-sentinel'), sticky = root.querySelector('#bkSticky'); if (!sentinel || !sticky || !('IntersectionObserver' in window)) return;
  let sc = root.parentElement; while (sc && sc !== document.body) { const o = getComputedStyle(sc).overflowY; if (o === 'auto' || o === 'scroll') break; sc = sc.parentElement; }
  window.__bkIO?.disconnect();
  // The marker sits just below the header: once it has scrolled up past the top, fold the header.
  window.__bkIO = new IntersectionObserver(([e]) => {
    const top = e.rootBounds ? e.rootBounds.top : 0;
    sticky.classList.toggle('compact', !e.isIntersecting && e.boundingClientRect.top < top);
  }, { root: sc && sc !== document.body ? sc : null });
  window.__bkIO.observe(sentinel);
}

window._bkChip = k => { const c = CHIPS.find(x => x[0] === k); if (!c) return; _f = c[3](_f); _paintList(); };
window._bkAcct = id => { const on = (_f.accounts || []).includes(id); _f = { ..._f, accounts: on ? [] : [id] }; document.querySelectorAll('.bk-acct').forEach(el => { const me = el.getAttribute('onclick').includes(`'${id}'`); el.classList.toggle('on', me && !on); el.setAttribute('aria-pressed', me && !on); }); _paintList(); };
window._bkClear = () => { _f = {}; renderBankCash(); };
window._bkTransfer = () => {
  if ((state.accounts || []).length < 2) { showToast('Add a second account to transfer between them', 'info'); return; }
  window._transferFromAccount?.((_f.accounts || [])[0] || state.accounts[0].id);
};

/** Tap a movement → its actions. */
window._bkTx = function (src, id, leg) {
  const m = movements(state).find(x => x.src === src && String(x.id) === String(id) && x.leg === leg); if (!m) return;
  const editable = ['paymentsIn', 'vendorPayments', 'labourPayments', 'saleInvoices'].includes(src);
  window.shellSheet?.(`${m.party} · ${money(m.amount, true)}`, [
    ...(editable ? [{ icon: '✏️', title: 'Open / edit', desc: `${TYPES[m.type]} · ${shortD(m.date)}`, run: () => window._editPartyTx?.(src, id) }] : []),
    { icon: '🔎', title: `Only ${m.accountName}`, desc: 'Show this account with its running balance', run: () => { _f = { ..._f, accounts: [m.accountId] }; renderBankCash(); } },
    { icon: '🗑', title: 'Delete', desc: src === 'accountTransfers' ? 'Removes both sides of the transfer' : 'Removes it from the books', danger: true, run: () => {
      if (!confirm(`Delete this ${TYPES[m.type].toLowerCase()} entry of ${money(m.amount)}?`)) return;
      keepOnly(src, x => String(x.id) !== String(id)); saveAllData(); renderBankCash(); showToast('Entry deleted', 'warning');
    } },
  ]);
};

// ── Advanced filter sheet ─────────────────────────────────────────────────────
window._bkSheet = function () {
  _d = JSON.parse(JSON.stringify(_f)); _cal = null;
  document.getElementById('bkSheetBg')?.remove();
  document.body.insertAdjacentHTML('beforeend', `<div id="bkSheetBg" class="bk-sheet-bg" onclick="if(event.target===this)window._bkSheetClose()">
    <section class="bk-sheet" role="dialog" aria-modal="true" aria-labelledby="bkSheetT">
      <span class="bk-grab" aria-hidden="true"></span>
      <header><h3 id="bkSheetT">Filters</h3><button type="button" class="bk-x" aria-label="Close" onclick="window._bkSheetClose()">${IC.close}</button></header>
      <div class="bk-sheet-body" id="bkSheetBody"></div>
      <footer><button type="button" class="bk-btn ghost" onclick="window._bkDraftReset()">Reset</button><button type="button" class="bk-btn" id="bkApply" onclick="window._bkApply()">Show</button></footer>
    </section></div>`);
  document.body.classList.add('bk-lock');
  _paintSheet();
  requestAnimationFrame(() => document.getElementById('bkSheetBg')?.classList.add('open'));
  _kbWatch(true);
};
window._bkSheetClose = function () {
  const bg = document.getElementById('bkSheetBg'); if (!bg) return;
  bg.classList.remove('open'); document.body.classList.remove('bk-lock'); _kbWatch(false);
  setTimeout(() => bg.remove(), 220);
};
window._bkApply = function () { _f = _d || {}; window._bkSheetClose(); renderBankCash(); };
window._bkDraftReset = function () { _d = {}; _cal = null; _paintSheet(); };
const _set = (k, v) => { _d[k] = v; _paintSheet(); };
window._bkD = (k, v) => _set(k, _d[k] === v ? '' : v);
window._bkPeriod = p => { _d.from = ''; _d.to = ''; _cal = null; _set('period', _d.period === p ? '' : p); };
window._bkToggle = (k, v) => { const s = new Set(_d[k] || []); s.has(v) ? s.delete(v) : s.add(v); _set(k, [...s]); };
window._bkInput = (k, v) => { _d[k] = v; _updateCount(); };
window._bkSwitch = () => _set('hideTransfers', !_d.hideTransfers);

function _paintSheet() {
  const body = document.getElementById('bkSheetBody'); if (!body) return;
  const pill = (on, label, fn, extra = '') => `<button type="button" class="bk-pill${on ? ' on' : ''}" aria-pressed="${!!on}" onclick="${fn}">${extra}${label}</button>`;
  const seg = (k, opts) => `<div class="bk-seg" role="group">${opts.map(([v, l]) => `<button type="button" class="${(_d[k] || '') === v ? 'on' : ''}" aria-pressed="${(_d[k] || '') === v}" onclick="window._bkSegSet('${k}','${v}')">${l}</button>`).join('')}</div>`;
  const custom = !!(_d.from || _d.to || _cal);
  const accts = balances(state).accounts;
  body.innerHTML = `
    <section><h4>Period</h4>
      <div class="bk-pills">${Object.entries(PERIODS).map(([k, p]) => pill(_d.period === k, p.label, `window._bkPeriod('${k}')`)).join('')}
        ${pill(custom && !_d.period, _d.from || _d.to ? `${shortD(_d.from) || '…'} – ${shortD(_d.to) || '…'}` : 'Custom range', 'window._bkCalOpen()', IC.cal)}</div>
      ${_cal ? _calHTML() : ''}
    </section>
    <section><h4>Money</h4>${seg('dir', [['', 'All'], ['in', 'Money in'], ['out', 'Money out']])}</section>
    <section><h4>Where</h4>${seg('kind', [['', 'All'], ['cash', 'Cash'], ['bank', 'Bank'], ['credit', 'OD / loans']])}</section>
    ${accts.length ? `<section><h4>Accounts</h4><div class="bk-pills">${accts.map(a => pill((_d.accounts || []).includes(a.id), esc(a.name), `window._bkToggle('accounts','${a.id}')`)).join('')}</div></section>` : ''}
    <section><h4>Type</h4><div class="bk-pills">${Object.entries(TYPES).map(([k, l]) => pill((_d.types || []).includes(k), l, `window._bkToggle('types','${k}')`, `<span class="bk-pill-ic ${k}">${IC[k]}</span>`)).join('')}</div></section>
    <section><h4>Amount</h4><div class="bk-range">
      <label><span>Min</span><input type="number" inputmode="decimal" min="0" placeholder="0" value="${esc(_d.min || '')}" oninput="window._bkInput('min', this.value)"></label>
      <i aria-hidden="true">–</i>
      <label><span>Max</span><input type="number" inputmode="decimal" min="0" placeholder="Any" value="${esc(_d.max || '')}" oninput="window._bkInput('max', this.value)"></label></div></section>
    <section><h4>Search</h4><label class="bk-search">${IC.search}<input type="search" placeholder="Party, note, account or amount" value="${esc(_d.q || '')}" oninput="window._bkInput('q', this.value)" enterkeyhint="search"></label></section>
    <section class="bk-sw-row"><div><b>Hide transfers between my accounts</b><small>Moving money from bank to site cash is not spending</small></div>
      <button type="button" role="switch" aria-checked="${!!_d.hideTransfers}" class="bk-switch${_d.hideTransfers ? ' on' : ''}" onclick="window._bkSwitch()"><i></i></button></section>`;
  _updateCount();
}
window._bkSegSet = (k, v) => _set(k, v);
function _updateCount() {
  const btn = document.getElementById('bkApply'); if (!btn) return;
  const n = applyFilter(movements(state), _d, today()).length;
  btn.textContent = `Show ${n} transaction${n === 1 ? '' : 's'}`;
}

// ── custom range calendar ──
window._bkCalOpen = () => { const t = _d.from || today(); _cal = { y: +t.slice(0, 4), m: +t.slice(5, 7) - 1 }; _d.period = ''; _paintSheet(); };
window._bkCalNav = n => { if (!_cal) return; _cal.m += n; if (_cal.m < 0) { _cal.m = 11; _cal.y--; } if (_cal.m > 11) { _cal.m = 0; _cal.y++; } _paintSheet(); };
window._bkCalPick = iso => {
  if (!_d.from || (_d.from && _d.to) || iso < _d.from) { _d.from = iso; _d.to = ''; }
  else _d.to = iso;
  _d.period = ''; _paintSheet();
};
function _calHTML() {
  const { y, m } = _cal, first = new Date(y, m, 1).getDay(), days = new Date(y, m + 1, 0).getDate(), t = today();
  const iso = d => `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  let cells = '';
  for (let i = 0; i < first; i++) cells += '<span></span>';
  for (let d = 1; d <= days; d++) {
    const k = iso(d), s = k === _d.from || k === _d.to, inR = _d.from && _d.to && k > _d.from && k < _d.to;
    cells += `<button type="button" class="${s ? 'sel' : ''}${inR ? ' in' : ''}${k === t ? ' today' : ''}${k > t ? ' future' : ''}" onclick="window._bkCalPick('${k}')" aria-label="${d} ${MON[m]} ${y}">${d}</button>`;
  }
  return `<div class="bk-cal" role="group" aria-label="Pick a date range">
    <div class="bk-cal-h"><button type="button" onclick="window._bkCalNav(-1)" aria-label="Previous month">‹</button><b>${MON[m]} ${y}</b><button type="button" onclick="window._bkCalNav(1)" aria-label="Next month">›</button></div>
    <div class="bk-cal-g">${WD.map(w => `<i>${w[0]}</i>`).join('')}${cells}</div>
    <p>${_d.from && !_d.to ? 'Now tap the end date' : _d.from && _d.to ? `${shortD(_d.from)} – ${shortD(_d.to)}` : 'Tap the start date'}</p>
  </div>`;
}

// Keep the sheet above the on-screen keyboard (visualViewport inset → --kb).
function _kbWatch(on) {
  const vv = window.visualViewport; if (!vv) return;
  const fn = window.__bkKb || (window.__bkKb = () => {
    const kb = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
    document.getElementById('bkSheetBg')?.style.setProperty('--kb', kb + 'px');
  });
  if (on) { vv.addEventListener('resize', fn); vv.addEventListener('scroll', fn); fn(); } else { vv.removeEventListener('resize', fn); vv.removeEventListener('scroll', fn); }
}
document.addEventListener('keydown', e => { if (e.key === 'Escape' && document.getElementById('bkSheetBg')) window._bkSheetClose(); });
// Any save anywhere (a payment, a transfer) refreshes the screen when it is open.
window.addEventListener('tss:data-saved', () => { if (document.getElementById('bankCashRoot')?.offsetParent && !document.getElementById('bkSheetBg')) renderBankCash(); });

window.renderBankCash = renderBankCash;
