/**
 * bizHome.js — screens for the Shop / Manufacturing business types:
 *   • Business Home (bizHomeView): today / month sales, money to collect,
 *     low stock, quick actions, top dues, recent sales
 *   • Udhaar (credit) book (creditBookView): customer-wise dues with WhatsApp
 *     reminder, receive payment, statement
 *   • Settings → Business Type panel, and applyBusinessModeUI() which shows /
 *     hides sidebar groups, hub tiles and wording for the active type.
 * Numbers come from the pure, unit-tested bizCalc.js.
 */
import { state, saveAllData } from './state.js';
import { showToast, getCurrencySymbol } from './utils.js';
import {
  BUSINESS_MODES, activeMode, modeAllows, modeTerm,
  lowStockItems, stockValue, customerDues, salesBetween, whatsappReminderLink,
} from './businessMode.js';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
const money = (n) => getCurrencySymbol() + (Math.round((Number(n) || 0))).toLocaleString('en-IN');
const today = () => new Date().toISOString().slice(0, 10);
const bizName = () => (state.companyProfile && (state.companyProfile.CompanyName || state.companyProfile.name)) || '';

const CSS = `
.bz{--bz-ink:#0f172a;--bz-mut:#64748b;--bz-line:#e7e9f0;--bz-acc:#c2410c;--bz-tint:#fff4ec;font-family:inherit;color:var(--bz-ink);max-width:1180px;margin:0 auto}
.bz *{box-sizing:border-box}
.bz-head{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;margin-bottom:16px}
.bz-head h2{font-size:22px;font-weight:800;margin:0;letter-spacing:-.02em}
.bz-head p{font-size:12.5px;color:var(--bz-mut);margin:3px 0 0}
.bz-badge{font-size:11.5px;font-weight:800;color:var(--bz-acc);background:var(--bz-tint);border:1px solid #fbd5b5;border-radius:999px;padding:5px 11px;white-space:nowrap}
.bz-kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:12px;margin-bottom:16px}
.bz-kpi{background:#fff;border:1px solid var(--bz-line);border-radius:16px;padding:15px 16px;box-shadow:0 1px 3px rgba(15,23,42,.04);cursor:default}
.bz-kpi.click{cursor:pointer}.bz-kpi.click:hover{border-color:#fbd5b5;box-shadow:0 6px 18px -10px rgba(194,65,12,.35)}
.bz-kpi .l{font-size:10.5px;font-weight:800;letter-spacing:.07em;text-transform:uppercase;color:var(--bz-mut)}
.bz-kpi .v{font-size:23px;font-weight:800;margin-top:6px;font-variant-numeric:tabular-nums;letter-spacing:-.02em}
.bz-kpi .s{font-size:11.5px;color:var(--bz-mut);margin-top:3px}
.bz-kpi.hero{background:linear-gradient(135deg,#ef8420,#d6402c);border:0;color:#fff}.bz-kpi.hero .l,.bz-kpi.hero .s{color:rgba(255,255,255,.85)}
.bz-kpi.warn .v{color:#b91c1c}
.bz-actions{display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:10px;margin-bottom:18px}
.bz-act{display:flex;flex-direction:column;align-items:flex-start;gap:6px;background:#fff;border:1px solid var(--bz-line);border-radius:14px;padding:13px 14px;font:inherit;font-size:13.5px;font-weight:700;color:var(--bz-ink);cursor:pointer;text-align:left}
.bz-act:hover{border-color:#fbd5b5;background:#fffaf6}
.bz-act span{font-size:20px}
.bz-grid{display:grid;grid-template-columns:1fr;gap:14px}
@media(min-width:900px){.bz-grid{grid-template-columns:1fr 1fr}}
.bz-card{background:#fff;border:1px solid var(--bz-line);border-radius:18px;overflow:hidden;box-shadow:0 1px 3px rgba(15,23,42,.04)}
.bz-card-h{display:flex;justify-content:space-between;align-items:center;gap:8px;padding:14px 16px 10px}
.bz-card-h b{font-size:14.5px;font-weight:800}
.bz-link{border:0;background:none;color:var(--bz-acc);font:inherit;font-size:12.5px;font-weight:800;cursor:pointer;padding:4px}
.bz-row{display:flex;align-items:center;gap:10px;padding:11px 16px;border-top:1px solid #f1f2f6}
.bz-row .m{flex:1;min-width:0}
.bz-row .n{font-size:13.5px;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.bz-row .d{font-size:11.5px;color:var(--bz-mut);margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.bz-row .a{font-size:14px;font-weight:800;font-variant-numeric:tabular-nums;white-space:nowrap}
.bz-empty{padding:18px 16px 20px;font-size:13px;color:var(--bz-mut);text-align:center}
.bz-btn{border:1px solid var(--bz-line);background:#fff;border-radius:10px;padding:8px 11px;font:inherit;font-size:12.5px;font-weight:700;cursor:pointer;white-space:nowrap;color:var(--bz-ink)}
.bz-btn.wa{border-color:#bbf7d0;background:#f0fdf4;color:#15803d}
.bz-btn.pri{border-color:#ef8420;background:#ef8420;color:#fff}
.bz-btn:disabled{opacity:.45;cursor:not-allowed}
.bz-bar{height:6px;border-radius:99px;background:#fde2e2;overflow:hidden;margin-top:6px}
.bz-bar i{display:block;height:100%;background:#ef4444;border-radius:99px}
.bz-search{width:100%;font:inherit;font-size:14px;border:1.5px solid var(--bz-line);border-radius:12px;padding:11px 13px;margin-bottom:12px;background:#fff;outline:none}
.bz-search:focus{border-color:#ef8420}
.bz-row .acts{display:flex;gap:6px;flex-wrap:wrap;justify-content:flex-end}
@media(max-width:600px){
  .bz-kpi .v{font-size:20px}
  .bz-credit .bz-row{flex-wrap:wrap}
  .bz-credit .bz-row .acts{width:100%;justify-content:stretch}
  .bz-credit .bz-row .acts .bz-btn{flex:1}
}
.bz-modes{display:grid;grid-template-columns:1fr;gap:12px;max-width:900px}
@media(min-width:760px){.bz-modes{grid-template-columns:repeat(3,1fr)}}
.bz-mode{position:relative;text-align:left;border:2px solid var(--bz-line);border-radius:16px;padding:16px;background:#fff;cursor:pointer;font:inherit;color:var(--bz-ink)}
.bz-mode:hover{border-color:#fbd5b5}
.bz-mode.on{border-color:#ef8420;background:#fffaf6;box-shadow:0 8px 22px -14px rgba(194,65,12,.6)}
.bz-mode .ic{font-size:28px}
.bz-mode h4{font-size:15px;font-weight:800;margin:8px 0 4px}
.bz-mode p{font-size:12px;color:var(--bz-mut);margin:0;line-height:1.45}
.bz-mode .tick{position:absolute;top:12px;right:12px;width:22px;height:22px;border-radius:50%;background:#ef8420;color:#fff;font-size:13px;font-weight:800;display:none;align-items:center;justify-content:center}
.bz-mode.on .tick{display:flex}`;
function _css() {
  if (document.getElementById('bz-style')) return;
  const s = document.createElement('style'); s.id = 'bz-style'; s.textContent = CSS; document.head.appendChild(s);
}

const go = (v) => { try { window.switchView?.(v); } catch {} };

/* ───────────────────────── Business Home ───────────────────────── */
export function renderBizHome() {
  const el = document.getElementById('bizHomeView'); if (!el) return;
  _css();
  const mode = activeMode();
  const t = today(), m0 = t.slice(0, 8) + '01';
  const todaySales = salesBetween(state, t, t);
  const monthSales = salesBetween(state, m0, t);
  const dues = customerDues(state);
  const toCollect = dues.reduce((s, d) => s + d.due, 0);
  const low = lowStockItems(state);
  const sv = stockValue(state);
  const recent = [...(state.saleInvoices || [])].filter(i => i.status !== 'Cancelled')
    .sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')) || (b.createdAt || 0) - (a.createdAt || 0)).slice(0, 6);
  const cName = (id) => (state.clients || []).find(c => c.id === id)?.name || 'Walk-in';
  const actions = [
    ['🧾', 'New sale', 'window.openSaleInvoiceForm && window.openSaleInvoiceForm()'],
    ['💰', 'Receive payment', 'window._bzReceive()'],
    ['🛒', 'New purchase', "window.openPurchaseFormPanel ? window.openPurchaseFormPanel() : window.switchView('purchaseBillsView')"],
    ['📦', 'Items & stock', "window.switchView('itemsMasterView')"],
    ['📒', 'Udhaar book', "window.switchView('creditBookView')"],
    ['💸', 'Expense', "window.switchView('expensesView')"],
  ];
  el.innerHTML = `<div class="bz">
    <div class="bz-head">
      <div><h2>${esc(bizName() || 'Your business')}</h2><p>${esc(new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }))}</p></div>
      <span class="bz-badge">${BUSINESS_MODES[mode].icon} ${esc(BUSINESS_MODES[mode].label)}</span>
    </div>
    <div class="bz-kpis">
      <div class="bz-kpi hero"><div class="l">Today's sales</div><div class="v">${money(todaySales)}</div><div class="s">This month ${money(monthSales)}</div></div>
      <div class="bz-kpi click" onclick="window.switchView('creditBookView')"><div class="l">To collect (udhaar)</div><div class="v">${money(toCollect)}</div><div class="s">${dues.length} customer${dues.length === 1 ? '' : 's'}</div></div>
      <div class="bz-kpi click ${low.length ? 'warn' : ''}" onclick="document.getElementById('bzLow')?.scrollIntoView({behavior:'smooth'})"><div class="l">Low stock</div><div class="v">${low.length}</div><div class="s">${low.length ? 'items to reorder' : 'all items above minimum'}</div></div>
      <div class="bz-kpi click" onclick="window.switchView('inventoryView')"><div class="l">Stock value</div><div class="v">${money(sv)}</div><div class="s">at last purchase rate</div></div>
    </div>
    <div class="bz-actions">${actions.map(([i, l, fn]) => `<button class="bz-act" onclick="${fn}"><span>${i}</span>${esc(l)}</button>`).join('')}</div>
    <div class="bz-grid">
      <div class="bz-card" id="bzLow">
        <div class="bz-card-h"><b>⚠️ Low stock</b><button class="bz-link" onclick="window.switchView('itemsMasterView')">Set minimums →</button></div>
        ${low.length ? low.slice(0, 8).map(r => `<div class="bz-row"><div class="m"><div class="n">${esc(r.name)}</div>
            <div class="d">In stock ${r.stock} ${esc(r.unit)} · minimum ${r.minStock}</div>
            <div class="bz-bar"><i style="width:${Math.max(4, Math.min(100, (r.stock / r.minStock) * 100))}%"></i></div></div>
            <button class="bz-btn" onclick="window.openPurchaseFormPanel ? window.openPurchaseFormPanel() : window.switchView('purchaseBillsView')">Buy</button></div>`).join('')
          : `<div class="bz-empty">No item is below its minimum stock. Set a <b>Min stock</b> on items to get alerts here.</div>`}
      </div>
      <div class="bz-card">
        <div class="bz-card-h"><b>📒 Top udhaar</b><button class="bz-link" onclick="window.switchView('creditBookView')">Open book →</button></div>
        ${dues.length ? dues.slice(0, 6).map(d => `<div class="bz-row"><div class="m"><div class="n">${esc(d.name)}</div>
            <div class="d">${d.lastPay ? 'Last paid ' + esc(d.lastPay) : 'No payment yet'}</div></div>
            <div class="a" style="color:#b91c1c">${money(d.due)}</div>
            ${_waBtn(d)}</div>`).join('')
          : `<div class="bz-empty">Nobody owes you money right now. 🎉</div>`}
      </div>
      <div class="bz-card" style="grid-column:1/-1">
        <div class="bz-card-h"><b>🧾 Recent sales</b><button class="bz-link" onclick="window.switchView('salesLedgerView')">All sales →</button></div>
        ${recent.length ? recent.map(i => `<div class="bz-row"><div class="m"><div class="n">${esc(cName(i.clientId))}</div>
            <div class="d">${esc(i.invoiceNo || 'Invoice')} · ${esc(i.date || '')}</div></div>
            <div class="a">${money(i.grandTotal || i.total)}</div></div>`).join('')
          : `<div class="bz-empty">No sales yet — tap <b>New sale</b> to make your first bill.</div>`}
      </div>
    </div>
  </div>`;
}

function _waBtn(d) {
  if (!d.phone) return `<button class="bz-btn" title="Add a phone number to this customer to send reminders" onclick="window._bzEditCustomer('${esc(d.id)}')">＋ Phone</button>`;
  const link = whatsappReminderLink({ phone: d.phone, name: d.name, due: d.due, business: bizName(), fmt: money });
  return `<a class="bz-btn wa" href="${esc(link)}" target="_blank" rel="noopener">💬 Remind</a>`;
}

/* ───────────────────────── Udhaar (credit) book ───────────────────────── */
let _creditQuery = '';
export function renderCreditBook() {
  const el = document.getElementById('creditBookView'); if (!el) return;
  _css();
  const all = customerDues(state);
  const q = _creditQuery.trim().toLowerCase();
  const rows = q ? all.filter(d => d.name.toLowerCase().includes(q) || String(d.phone).includes(q)) : all;
  const total = all.reduce((s, d) => s + d.due, 0);
  const old = all.filter(d => !d.lastPay || d.lastPay < new Date(Date.now() - 30 * 864e5).toISOString().slice(0, 10)).length;
  el.innerHTML = `<div class="bz bz-credit">
    <div class="bz-head"><div><h2>📒 Udhaar book</h2><p>Money your ${esc(modeTerm('clients').toLowerCase())} owe you — remind on WhatsApp and record payments.</p></div>
      <button class="bz-btn pri" onclick="window.openClientModal ? window.openClientModal() : window.switchView('partiesLedgerView')">＋ Add ${esc(modeTerm('client').toLowerCase())}</button></div>
    <div class="bz-kpis">
      <div class="bz-kpi hero"><div class="l">Total to collect</div><div class="v">${money(total)}</div><div class="s">${all.length} ${esc(modeTerm('clients').toLowerCase())}</div></div>
      <div class="bz-kpi ${old ? 'warn' : ''}"><div class="l">No payment in 30 days</div><div class="v">${old}</div><div class="s">follow up first</div></div>
    </div>
    <input class="bz-search" id="bzCreditSearch" placeholder="🔍 Search name or phone" value="${esc(_creditQuery)}" oninput="window._bzCreditSearch(this.value)">
    <div class="bz-card">
      ${rows.length ? rows.map(d => `<div class="bz-row">
          <div class="m"><div class="n">${esc(d.name)}</div>
            <div class="d">${d.phone ? '📞 ' + esc(d.phone) + ' · ' : ''}${d.lastBill ? 'Last bill ' + esc(d.lastBill) : ''}${d.lastPay ? ' · last paid ' + esc(d.lastPay) : ' · no payment yet'}</div></div>
          <div class="a" style="color:#b91c1c">${money(d.due)}</div>
          <div class="acts">${_waBtn(d)}
            <button class="bz-btn pri" onclick="window._bzReceive('${esc(d.id)}')">✅ Receive</button>
            <button class="bz-btn" onclick="window._bzStatement('${esc(d.id)}')">📄 Statement</button></div>
        </div>`).join('')
        : `<div class="bz-empty">${q ? 'No match.' : 'Nobody owes you money right now. 🎉'}</div>`}
    </div>
  </div>`;
  const s = document.getElementById('bzCreditSearch');
  if (s && q) { s.focus(); s.setSelectionRange(s.value.length, s.value.length); }
}

function _bzReceive(clientId) {
  if (typeof window.openPaymentInForm === 'function') {
    window.openPaymentInForm();
    if (clientId) setTimeout(() => {
      const sel = document.getElementById('pinFormClient');
      if (sel) { sel.value = clientId; sel.dispatchEvent(new Event('change')); }
    }, 50);
  } else go('paymentsHubView');
}
function _bzStatement(clientId) {
  go('partiesLedgerView');
  setTimeout(() => { try { window.selectParty?.(clientId, 'Client'); } catch {} }, 120);
}
function _bzEditCustomer(clientId) {
  const c = (state.clients || []).find(x => x.id === clientId); if (!c) return;
  const ph = prompt(`WhatsApp / mobile number for ${c.name}:`, c.phone || '');
  if (ph == null) return;
  c.phone = ph.trim();
  try { window.stampUpdate?.(c); } catch {}
  saveAllData();
  showToast('Phone saved', 'success');
  if (window.__currentViewId === 'creditBookView') renderCreditBook(); else renderBizHome();
}

/* ───────────────────────── Settings → Business Type ───────────────────────── */
export function renderBusinessTypeSettings() {
  const el = document.getElementById('settBusinessContent'); if (!el) return;
  _css();
  const cur = activeMode();
  el.innerHTML = `<div class="bz" style="margin:0">
    <p style="font-size:12.5px;color:#64748b;margin:0 0 14px;max-width:760px">Choose what kind of business uses this account. It only changes which modules and reports are shown — <b>no data is deleted</b>, and you can switch back any time. Applies to everyone in your organisation.</p>
    <div class="bz-modes">${Object.entries(BUSINESS_MODES).map(([k, m]) => `
      <button type="button" class="bz-mode ${k === cur ? 'on' : ''}" onclick="window._bzPickMode('${k}')">
        <span class="tick">✓</span><div class="ic">${m.icon}</div><h4>${esc(m.label)}</h4><p>${esc(m.desc)}</p></button>`).join('')}
    </div>
  </div>`;
}
function _bzPickMode(mode) {
  if (!BUSINESS_MODES[mode]) return;
  if (mode === activeMode()) return;
  state.currencySettings = { ...(state.currencySettings || {}), businessMode: mode };
  saveAllData();
  try { window.hideRestrictedSidebar?.(); } catch {}
  applyBusinessModeUI();
  renderBusinessTypeSettings();
  showToast(`Business type: ${BUSINESS_MODES[mode].label}`, 'success');
}

/* ───────────────────────── Apply the active type to the shell ───────────────────────── */
export function applyBusinessModeUI() {
  const mode = activeMode();
  const shopLike = mode !== 'construction';
  document.body.dataset.bizMode = mode;
  // Sidebar: "All Projects" + project modules (construction) vs Business group (shop / manufacturing)
  document.querySelectorAll('#sidebarNav [data-target="projectsHome"]').forEach(b => { b.style.display = shopLike ? 'none' : ''; });
  const biz = document.getElementById('bizNav'); if (biz) biz.style.display = shopLike ? '' : 'none';
  // Hide what this type doesn't use (role permissions may hide more — never un-hide here).
  document.querySelectorAll('#sidebarNav [data-target]').forEach(b => { if (!modeAllows(b.dataset.target)) b.style.display = 'none'; });
  if (shopLike) document.getElementById('projectContextNav')?.classList.add('hidden');
  const tag = document.getElementById('sidebarTagline'); if (tag) tag.textContent = BUSINESS_MODES[mode].tagline;
  const staff = document.querySelector('#bizNav [data-target="labourView"] .lbl'); if (staff) staff.textContent = modeTerm('labour');
  document.querySelectorAll('#bizNav .biz-mfg-only').forEach(b => { b.style.display = mode === 'manufacturing' ? '' : 'none'; });
  // Staff wording on the labour screen (Shop / Manufacturing)
  const lh = document.querySelector('#labourView h2');
  if (lh) { if (!lh.dataset.orig) lh.dataset.orig = lh.textContent; lh.textContent = shopLike ? 'Staff' : lh.dataset.orig; }
  const lp = lh && lh.nextElementSibling;
  if (lp) { if (!lp.dataset.orig) lp.dataset.orig = lp.textContent; lp.textContent = shopLike ? 'Attendance, salary & payments' : lp.dataset.orig; }
  // Hub tiles for hidden modules
  document.querySelectorAll('.shub-card').forEach(card => {
    const m = (card.getAttribute('onclick') || '').match(/switchView\('([A-Za-z]+)'\)/);
    if (m) card.style.display = modeAllows(m[1]) ? '' : 'none';
  });
  // Leave a hidden module if we're on one (e.g. after switching type in Settings)
  const v = window.__currentViewId;
  if (v && !modeAllows(v)) go(shopLike ? 'bizHomeView' : 'projectsHome');
}

if (typeof window !== 'undefined') {
  Object.assign(window, {
    renderBizHome, renderCreditBook, renderBusinessTypeSettings, applyBusinessModeUI,
    _bzReceive, _bzStatement, _bzEditCustomer, _bzPickMode,
    _bzCreditSearch: (v) => { _creditQuery = v || ''; renderCreditBook(); },
  });
}
