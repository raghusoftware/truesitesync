/**
 * ═══════════════════════════════════════════════════════════
 * True Site Sync — Petty Cash (Imprest-to-User wallet model)
 * ═══════════════════════════════════════════════════════════
 * Main Head pushes funds directly to a custodian (Site Engineer /
 * Plant Manager). Each custodian holds a live balance and logs
 * field expenses (with a compressed photo receipt) that deduct
 * from it instantly. Project-scoped, offline-first.
 * ═══════════════════════════════════════════════════════════
 */

import { state, saveAllData } from './state.js';
import { keepOnly } from './state.js';
import { showToast, getCurrencySymbol } from './utils.js';
import { getCurrentUser } from './rbac.js';
import { uploadExecMedia, signedExecUrl, removeExecMedia } from './execMedia.js';
import { isAccepted, walletStats, ownerSummary, runningBalances, afterSpend } from './pettyCashCalc.js';

// ── helpers ────────────────────────────────────────────────
function _pid() { return state.currentProjectId || null; }
/** Shop / Manufacturing have no projects — petty cash runs at business level (projectId null). */
function _bizLevel() { return typeof window.activeBusinessMode === 'function' && window.activeBusinessMode() !== 'construction'; }
function _fmt(n) { return (n < 0 ? '−' : '') + getCurrencySymbol() + Math.abs(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
/** Whole-rupee amounts for the small stat tiles (paise would wrap on a phone). */
function _fmt0(n) { return (n < 0 ? '−' : '') + getCurrencySymbol() + Math.round(Math.abs(n || 0)).toLocaleString('en-IN'); }
function _esc(s) { return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }

// ── role / wallet visibility ───────────────────────────────
function _me() { return getCurrentUser(); }
/** Admin (or no logged-in RBAC user) → sees & funds every wallet. */
function _isPettyAdmin() { const u = _me(); return !u || u.role === 'Admin'; }
/** True if the current user is allowed to see this custodian's wallet. */
function _canSeeCustodian(c) {
  if (_isPettyAdmin()) return true;
  const u = _me();
  if (!u) return false;
  return c.userId === u.id || (c.email && u.email && c.email.toLowerCase() === u.email.toLowerCase());
}

function _custodians() {
  const pid = _pid();
  return (state.pettyCashCustodians || []).filter(c => (c.projectId || null) === pid && _canSeeCustodian(c));
}
function _txns() {
  const pid = _pid();
  return (state.pettyCashTxns || []).filter(t => (t.projectId || null) === pid);
}
function _accountBalanceFor(accId) {
  if (typeof window._getAccountBalancePublic === 'function') return window._getAccountBalancePublic(accId);
  return null;
}
const _accepted = isAccepted;
/** Usable wallet balance (accepted transfers − expenses − returns). */
function _balance(custId) { return walletStats(_txns(), custId).balance; }
/** Amount transferred to this custodian but not yet confirmed as received. */
function _pendingIn(custId) { return walletStats(_txns(), custId).pending; }
function _custName(id) { return (state.pettyCashCustodians || []).find(c => c.id === id)?.name || '—'; }
// Resolve a notification recipient (userId / auth uid / email / name) from a custodian.
function _custRecipient(c) {
  if (!c) return {};
  const ru = (state.rbacUsers || []).find(u => u.id === c.userId);
  return { userId: c.userId || null, supaId: ru?.supabaseId || null, email: c.email || ru?.email || null, name: c.name || '' };
}
// Resolve a recipient from an rbac user id (used to notify the admin who issued a transfer).
function _userRecipient(rbacId) {
  const ru = (state.rbacUsers || []).find(u => u.id === rbacId);
  return ru ? { userId: ru.id, supaId: ru.supabaseId || null, email: ru.email || null, name: ru.name || ru.username || '' } : {};
}

/** Compress an image File to a small JPEG base64 (max 800px wide, q0.6). */
function _compressImage(file) {
  return new Promise((resolve, reject) => {
    if (!file || !file.type.startsWith('image/')) { resolve(null); return; }
    const reader = new FileReader();
    reader.onload = e => {
      const img = new Image();
      img.onload = () => {
        const maxW = 800;
        const scale = Math.min(1, maxW / img.width);
        const w = Math.round(img.width * scale), h = Math.round(img.height * scale);
        const canvas = document.createElement('canvas');
        canvas.width = w; canvas.height = h;
        canvas.getContext('2d').drawImage(img, 0, 0, w, h);
        try { resolve(canvas.toDataURL('image/jpeg', 0.6)); }
        catch (err) { reject(err); }
      };
      img.onerror = reject;
      img.src = e.target.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// ── view state ─────────────────────────────────────────────
let _pcSection = null;        // null | 'wallets' | 'expense' | 'ledger' | custodianId
let _pcPendingPhoto = null;       // legacy base64 (kept for back-compat display)
let _pcPendingPhotoPath = null;   // Storage path of a newly-captured receipt
let _pcLedgerFilter = '';     // custodian id filter

// ══════════════════════════════════════════════════════════
//  ENTRY + ROUTER
// ══════════════════════════════════════════════════════════
export function renderPettyCash() {
  const root = document.getElementById('pettyCashRoot');
  if (!root) return;
  if (!_pid() && !_bizLevel()) {
    root.innerHTML = `<div style="text-align:center;padding:60px 20px;color:#94a3b8;">
      <div style="font-size:42px;margin-bottom:10px;">💰</div>
      <p style="font-weight:700;color:#475569;">Open a project first</p>
      <p style="font-size:13px;">Petty cash wallets are managed per project.</p></div>`;
    return;
  }
  if (_pcSection === 'wallets') return _renderWallets(root);
  if (_pcSection === 'expense') return _renderExpenseForm(root);
  if (_pcSection === 'ledger') return _renderLedger(root);
  if (_pcSection === 'recon') return _renderRecon(root);
  if (_pcSection && _pcSection.startsWith('cust:')) return _renderCustodian(root, _pcSection.slice(5));
  return _renderHome(root);
}

window._pcOpen = function (section) { _pcSection = section; renderPettyCash(); try { window.shellSectionChanged?.(); } catch {} };

// ══════════════════════════════════════════════════════════
//  HOME — app-icon grid + total-in-field card
// ══════════════════════════════════════════════════════════
function _renderHome(root) {
  const custs = _custodians();
  // A site engineer with one wallet lands straight in it — balance + Log Expense, nothing to pick.
  if (!_isPettyAdmin() && custs.length === 1) return _renderCustodian(root, custs[0].id, true);
  const txns = _txns();
  const sum = ownerSummary(txns, custs.map(c => c.id));
  const q = _pcQuery.trim().toLowerCase();
  const shown = custs.filter(c => !q || [c.name, c.role, c.phone].some(v => String(v || '').toLowerCase().includes(q)));
  const cards = shown.map(c => {
    const s = walletStats(txns, c.id);
    const pct = s.confirmed > 0 ? Math.max(0, Math.min(100, Math.round(s.reconciled / s.confirmed * 100))) : 0;
    return `<div class="pcw-sup" role="button" tabindex="0" onclick="_pcOpen('cust:${c.id}')" onkeydown="if(event.key==='Enter')this.click()">
      <div class="pcw-sup-top">
        <span class="pcw-av">${_esc((c.name || '?').charAt(0).toUpperCase())}</span>
        <div class="pcw-sup-id"><b>${_esc(c.name)}</b><small>${_esc(c.role || 'Custodian')}</small></div>
        <div class="pcw-sup-bal ${s.balance < 0 ? 'neg' : ''}"><small>In hand</small><b>${_fmt(s.balance)}</b></div>
      </div>
      <div class="pcw-bar" title="${pct}% reconciled"><i style="width:${pct}%"></i></div>
      <div class="pcw-sup-foot"><span>Given <b>${_fmt0(s.issued)}</b></span><span>Reconciled <b>${_fmt0(s.reconciled)}</b></span></div>
      ${s.pending > 0 ? `<div class="pcw-chip amber">⏳ ${_fmt(s.pending)} awaiting confirmation</div>` : ''}
      ${s.disputed > 0 ? `<div class="pcw-chip red">⚠ ${_fmt(s.disputed)} disputed</div>` : ''}
    </div>`;
  }).join('');
  const isAdm = _isPettyAdmin();
  const keepFocus = document.activeElement && document.activeElement.id === 'pcSearch';
  root.innerHTML = `<div class="ts-page pcw">
    <section class="pcw-hero">
      <div class="pcw-hero-l">Cash in the field</div>
      <div class="pcw-hero-v">${_fmt(sum.inField)}</div>
      <div class="pcw-bar light"><i style="width:${sum.pct}%"></i></div>
      <div class="pcw-split">
        <div><span>Funds given</span><b>${_fmt0(sum.given)}</b></div>
        <div><span>Funds reconciled</span><b>${_fmt0(sum.reconciled)}</b></div>
      </div>
      ${sum.pending > 0 ? `<div class="pcw-hero-note">⏳ ${_fmt(sum.pending)} sent, waiting for the supervisor to confirm</div>` : ''}
    </section>
    ${isAdm ? `<div class="pcw-acts">
      <button type="button" class="pcw-btn green" onclick="_pcTransferModal()" ${custs.length ? '' : 'disabled'}>＋ Send funds</button>
      <button type="button" class="pcw-btn dark" onclick="_pcOpen('expense')" ${custs.length ? '' : 'disabled'}>🧾 Log expense</button>
    </div>` : ''}
    ${custs.length > 3 ? `<div class="ts-search">${'<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg>'}
      <input id="pcSearch" type="search" placeholder="Search supervisor" value="${_esc(_pcQuery)}" oninput="window._pcSearch(this.value)" autocomplete="off"></div>` : ''}
    <div class="pcw-h">Supervisors <span>${custs.length}</span></div>
    <div class="pcw-list">
      ${cards || (custs.length
        ? '<div class="ts-empty"><div class="ts-emo" data-keep-emoji>🔍</div><h3>No supervisor found</h3></div>'
        : `<div class="ts-empty"><div class="ts-emo" data-keep-emoji>👛</div><h3>No petty cash wallets yet</h3><p style="margin-bottom:18px">${isAdm ? 'Add the site person who holds cash, then send them funds.' : 'Ask your admin to set up your wallet.'}</p>
           ${isAdm ? '<button type="button" class="ts-btn" onclick="_pcCustodianModal()">+ Add supervisor</button>' : ''}</div>`)}
    </div>
  </div>`;
  if (keepFocus) { const i = document.getElementById('pcSearch'); if (i) { i.focus(); i.setSelectionRange(i.value.length, i.value.length); } }
}

let _pcQuery = '';
window._pcSearch = function (q) { _pcQuery = q; renderPettyCash(); };
window._pcIsOpen = function () { return !!_pcSection; };
/** + on the Petty Cash home (appShell's floating button). */
window.pettyOptionsSheet = function () {
  const custs = _custodians();
  // Supervisor with one wallet: the + is simply "Log expense".
  if (!_isPettyAdmin() && custs.length === 1) return window._pcExpenseModal(custs[0].id);
  const adm = _isPettyAdmin();
  window.shellSheet?.('Petty Cash Options', [
    { icon: '🧾', title: 'Log expense', desc: 'Record where field cash went', run: () => _pcOpen('expense') },
    adm && { icon: '💸', title: 'Send funds', desc: 'Give cash to a supervisor', run: () => window._pcTransferModal?.() },
    adm && { icon: '👤', title: 'Add supervisor', desc: 'A site person who holds petty cash', run: () => window._pcCustodianModal?.() },
    { icon: '👛', title: 'Wallets', desc: 'All supervisors, pending confirmations', run: () => _pcOpen('wallets') },
    { icon: '📜', title: 'Petty cash report', desc: 'Every transfer and voucher', run: () => _pcOpen('ledger') },
    { icon: '📊', title: 'Reconciliation', desc: 'Given vs spent vs returned', run: () => _pcOpen('recon') },
  ].filter(Boolean));
};

function _backBar(title) {
  return `<button class="pc-backbtn" onclick="_pcOpen(null)" style="margin-bottom:14px;padding:6px 14px;background:#f1f5f9;border:1px solid #e2e8f0;border-radius:8px;color:#64748b;font-size:12px;font-weight:600;cursor:pointer;">← Petty Cash</button>
    <h2 class="text-2xl font-extrabold text-slate-800 mb-4">${title}</h2>`;
}

// ══════════════════════════════════════════════════════════
//  WALLETS — custodian overview + transfer
// ══════════════════════════════════════════════════════════
function _renderWallets(root) {
  const custs = _custodians();
  const rows = custs.map(c => {
    const bal = _balance(c.id);
    const pending = _pendingIn(c.id);
    return `<div onclick="_pcOpen('cust:${c.id}')" style="background:#fff;border:1px solid #e2e8f0;border-radius:14px;padding:16px;cursor:pointer;display:flex;justify-content:space-between;align-items:center;transition:.15s;" onmouseover="this.style.boxShadow='0 6px 20px rgba(0,0,0,.07)'" onmouseout="this.style.boxShadow=''">
      <div style="display:flex;align-items:center;gap:12px;">
        <div style="width:42px;height:42px;border-radius:50%;background:#ef842015;color:#0f766e;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:16px;">${_esc((c.name || '?').charAt(0).toUpperCase())}</div>
        <div>
          <div style="font-weight:700;color:#0f172a;">${_esc(c.name)}</div>
          <div style="font-size:11px;color:#94a3b8;">${_esc(c.role || 'Custodian')}${c.phone ? ' · ' + _esc(c.phone) : ''}</div>
          ${pending > 0 ? `<div style="font-size:10px;font-weight:800;color:#b45309;background:#fffbeb;border:1px solid #fde68a;border-radius:8px;padding:1px 7px;display:inline-block;margin-top:4px;">⏳ ${_fmt(pending)} to confirm</div>` : ''}
        </div>
      </div>
      <div style="text-align:right;">
        <div style="font-weight:800;font-size:18px;color:${bal < 0 ? '#dc2626' : '#0f766e'};">${_fmt(bal)}</div>
        <div style="font-size:10px;color:#cbd5e1;">live balance →</div>
      </div>
    </div>`;
  }).join('');

  const adminBar = _isPettyAdmin() ? `
    <div style="display:flex;gap:10px;margin-bottom:16px;flex-wrap:wrap;">
      <button onclick="_pcCustodianModal()" style="padding:9px 16px;background:#0f172a;color:#fff;border:none;border-radius:10px;font-size:13px;font-weight:700;cursor:pointer;">+ Add Custodian</button>
      <button onclick="_pcTransferModal()" style="padding:9px 16px;background:#ef8420;color:#fff;border:none;border-radius:10px;font-size:13px;font-weight:700;cursor:pointer;" ${custs.length ? '' : 'disabled'}>⇪ Transfer Funds</button>
    </div>` : `<div style="margin-bottom:16px;font-size:12px;color:#94a3b8;">You can view your wallet and log expenses. Funds are issued by the admin.</div>`;
  root.innerHTML = `
    ${_backBar('Wallets')}
    ${adminBar}
    <div style="display:flex;flex-direction:column;gap:10px;">
      ${rows || `<div style="text-align:center;padding:40px;color:#94a3b8;">${_isPettyAdmin() ? 'No custodians yet. Add a Site Engineer or Plant Manager to start.' : 'No wallet assigned to you yet. Ask your admin to set one up.'}</div>`}
    </div>`;
}

// ══════════════════════════════════════════════════════════
//  CUSTODIAN (FIELD VIEW) — big balance + history + quick expense
// ══════════════════════════════════════════════════════════
function _renderCustodian(root, custId, self) {
  const c = (state.pettyCashCustodians || []).find(x => x.id === custId);
  if (!c || !_canSeeCustodian(c)) { _pcSection = 'wallets'; return renderPettyCash(); }
  const all = _txns();
  const s = walletStats(all, custId);
  const run = runningBalances(all);
  const isAdm = _isPettyAdmin();
  const hist = all.filter(t => t.custodianId === custId).sort((a, b) => (b.date || '').localeCompare(a.date || '') || (b.createdAt || 0) - (a.createdAt || 0));
  const pendingList = hist.filter(t => t.type === 'TRANSFER' && t.status === 'pending');
  const settled = hist.filter(t => !(t.type === 'TRANSFER' && t.status === 'pending'));
  root.innerHTML = `<div class="ts-page pcw">
    ${self ? '' : `<button type="button" class="pcw-back" onclick="_pcOpen(null)">← All wallets</button>`}
    <section class="pcw-hero pcw-sticky">
      <div class="pcw-hero-l">${_esc(c.name)} · ${_esc(c.role || 'Custodian')}</div>
      <div class="pcw-hero-cap">Current wallet balance</div>
      <div class="pcw-hero-v ${s.balance < 0 ? 'neg' : ''}" id="pcwBal">${_fmt(s.balance)}</div>
    </section>
    <div class="pcw-stats">
      <div class="in"><span>Received</span><b>${_fmt0(s.confirmed)}</b></div>
      <div class="out"><span>Spent</span><b>${_fmt0(s.spent)}</b></div>
      <div class="ret"><span>Returned</span><b>${_fmt0(s.returned)}</b></div>
    </div>
    <button type="button" class="pcw-log" onclick="_pcExpenseModal('${custId}')"><span data-keep-emoji>🧾</span> Log Expense</button>
    <div class="pcw-acts sm">
      <button type="button" class="pcw-btn ghost" onclick="_pcReturnModal('${custId}')">↩ Return cash</button>
      ${isAdm ? `<button type="button" class="pcw-btn green" onclick="_pcTransferModal('${custId}')">＋ Send funds</button>
      <button type="button" class="pcw-btn ghost" onclick="_pcCustodianModal('${custId}')">✎ Edit</button>` : ''}
    </div>
    ${pendingList.length ? `<div class="pcw-pend">
      <b>⏳ ${_fmt(s.pending)} waiting for confirmation</b>
      <small>${isAdm && !self ? 'It counts in the wallet once the supervisor confirms receipt.' : "Confirm each amount once you've actually received it — only then does it count in your wallet."}</small>
      <div class="pcw-list">${pendingList.map(t => _txnRow(t, false, run)).join('')}</div>
    </div>` : ''}
    <div class="pcw-h">Transactions <span>${settled.length}</span></div>
    <div class="pcw-list">${settled.map(t => _txnRow(t, false, run)).join('') || `<div class="pcw-empty">No transactions yet.</div>`}</div>
  </div>`;
  if (_pcFlashId) { const el = document.getElementById('pctx_' + _pcFlashId); _pcFlashId = null; if (el) el.classList.add('flash'); }
}
let _pcFlashId = null;   // the txn just logged — its card pulses once

// ══════════════════════════════════════════════════════════
//  LEDGER — global feed (within project), filter by custodian
// ══════════════════════════════════════════════════════════
function _renderLedger(root) {
  const custs = _custodians();
  const visibleIds = new Set(custs.map(c => c.id));
  let list = _txns().filter(t => visibleIds.has(t.custodianId));
  if (_pcLedgerFilter) list = list.filter(t => t.custodianId === _pcLedgerFilter);
  list = list.sort((a, b) => (b.date || '').localeCompare(a.date || '') || (b.createdAt || 0) - (a.createdAt || 0));
  const opts = ['<option value="">All custodians</option>', ...custs.map(c => `<option value="${c.id}" ${_pcLedgerFilter === c.id ? 'selected' : ''}>${_esc(c.name)}</option>`)].join('');
  const totIn = list.filter(t => t.type === 'TRANSFER').reduce((s, t) => s + (t.amount || 0), 0);
  const totOut = list.filter(t => t.type === 'EXPENSE').reduce((s, t) => s + (t.amount || 0), 0);
  const totReturned = list.filter(t => t.type === 'RETURN').reduce((s, t) => s + (t.amount || 0), 0);

  root.innerHTML = `
    ${_backBar('Ledger')}
    <div style="display:flex;gap:10px;margin-bottom:14px;flex-wrap:wrap;align-items:center;">
      <select onchange="_pcSetLedgerFilter(this.value)" style="padding:8px 12px;border:1px solid #e2e8f0;border-radius:9px;font-size:13px;background:#fff;">${opts}</select>
      <span style="font-size:12px;color:#ef8420;font-weight:700;">In: ${_fmt(totIn)}</span>
      <span style="font-size:12px;color:#f59e0b;font-weight:700;">Out: ${_fmt(totOut)}</span>
      ${totReturned > 0 ? `<span style="font-size:12px;color:#2563eb;font-weight:700;">Returned: ${_fmt(totReturned)}</span>` : ''}
    </div>
    <div style="display:flex;flex-direction:column;gap:8px;">${list.map(t => _txnRow(t, true, runningBalances(_txns()))).join('') || `<div style="color:#94a3b8;padding:24px;text-align:center;">No transactions.</div>`}</div>`;
}
window._pcSetLedgerFilter = function (v) { _pcLedgerFilter = v; renderPettyCash(); };

// ══════════════════════════════════════════════════════════
//  RECONCILIATION — issued vs confirmed vs spent vs returned
// ══════════════════════════════════════════════════════════
function _custStats(custId) {
  const s = walletStats(_txns(), custId);
  return { ...s, inHand: s.balance };
}
function _renderRecon(root) {
  const custs = _custodians();
  const tot = { issued: 0, confirmed: 0, pending: 0, spent: 0, returned: 0, inHand: 0 };
  const rows = custs.map(c => {
    const s = _custStats(c.id);
    ['issued', 'confirmed', 'pending', 'spent', 'returned', 'inHand'].forEach(k => tot[k] += s[k]);
    const flags = [];
    if (s.pending > 0) flags.push(`<span style="font-size:9px;font-weight:800;color:#b45309;background:#fffbeb;border:1px solid #fde68a;border-radius:6px;padding:1px 6px;">⏳ ${_fmt(s.pending)}</span>`);
    if (s.disputed > 0) flags.push(`<span style="font-size:9px;font-weight:800;color:#b91c1c;background:#fef2f2;border:1px solid #fecaca;border-radius:6px;padding:1px 6px;">⚠ ${_fmt(s.disputed)}</span>`);
    return `<tr style="border-bottom:1px solid #f1f5f9;">
      <td style="padding:10px 8px;font-weight:700;color:#0f172a;">${_esc(c.name)}<div style="font-size:10px;color:#94a3b8;font-weight:500;">${_esc(c.role || 'Custodian')}</div>${flags.length ? `<div style="margin-top:4px;display:flex;gap:4px;flex-wrap:wrap;">${flags.join('')}</div>` : ''}</td>
      <td style="padding:10px 8px;text-align:right;color:#0f766e;">${_fmt(s.confirmed)}</td>
      <td style="padding:10px 8px;text-align:right;color:#f59e0b;">${_fmt(s.spent)}</td>
      <td style="padding:10px 8px;text-align:right;color:#2563eb;">${_fmt(s.returned)}</td>
      <td style="padding:10px 8px;text-align:right;font-weight:800;color:${s.inHand < 0 ? '#dc2626' : '#0f172a'};">${_fmt(s.inHand)}</td>
      <td style="padding:10px 8px;text-align:center;">${s.inHand > 0 ? `<button onclick="_pcReturnModal('${c.id}')" style="font-size:11px;font-weight:700;color:#2563eb;background:#eff6ff;border:1px solid #bfdbfe;border-radius:8px;padding:4px 10px;cursor:pointer;">Settle ↩</button>` : '<span style="color:#cbd5e1;font-size:12px;">✓</span>'}</td>
    </tr>`;
  }).join('');

  root.innerHTML = `
    ${_backBar('Reconciliation')}
    <p style="font-size:13px;color:#64748b;margin-bottom:14px;">Confirmed = amounts the custodian accepted · In hand = confirmed − spent − returned (what they still hold and must settle).</p>
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:10px;margin-bottom:16px;">
      ${[['Confirmed', tot.confirmed, '#0f766e'], ['Spent', tot.spent, '#f59e0b'], ['Returned', tot.returned, '#2563eb'], ['In hand', tot.inHand, '#0f172a']].map(([l, v, col]) => `<div style="background:#fff;border:1px solid #e2e8f0;border-radius:12px;padding:12px 14px;"><div style="font-size:10px;text-transform:uppercase;letter-spacing:.06em;color:#94a3b8;font-weight:700;">${l}</div><div style="font-size:18px;font-weight:800;color:${col};margin-top:2px;">${_fmt(v)}</div></div>`).join('')}
    </div>
    <div style="background:#fff;border:1px solid #e2e8f0;border-radius:14px;overflow:auto;">
      <table style="width:100%;border-collapse:collapse;font-size:13px;min-width:560px;">
        <thead><tr style="background:#f8fafc;text-align:left;font-size:10px;text-transform:uppercase;letter-spacing:.05em;color:#64748b;">
          <th style="padding:10px 8px;">Custodian</th><th style="padding:10px 8px;text-align:right;">Confirmed</th><th style="padding:10px 8px;text-align:right;">Spent</th><th style="padding:10px 8px;text-align:right;">Returned</th><th style="padding:10px 8px;text-align:right;">In hand</th><th style="padding:10px 8px;text-align:center;">Settle</th>
        </tr></thead>
        <tbody>${rows || '<tr><td colspan="6" style="padding:24px;text-align:center;color:#94a3b8;">No custodians yet.</td></tr>'}</tbody>
      </table>
    </div>`;
}

const _CAT_ICON = { 'Daily Wages': '👷', 'Labour Payment': '👷', Contractor: '👷', 'Site Materials': '🧱', 'Material / Vendor': '🧱',
  'Travel / Transport': '🚚', 'Food / Refreshments': '🍱', 'Tools / Hardware': '🔧', Miscellaneous: '📌' };
/** One ledger card: incoming green, expenses dark with a red edge, returns blue, unconfirmed amber. */
function _txnRow(t, showName, run) {
  const isIn = t.type === 'TRANSFER';
  const isReturn = t.type === 'RETURN';
  const st = isIn ? (t.status || 'accepted') : '';
  const kind = isIn ? (st === 'pending' ? 'pend' : st === 'disputed' ? 'disp' : 'in') : isReturn ? 'ret' : 'out';
  const sign = isIn ? '+' : '−';
  const icon = isIn ? '💵' : isReturn ? '↩️' : (_CAT_ICON[t.category] || '🧾');
  const title = isIn ? 'Funds received' : isReturn ? 'Returned to ' + _esc(t.toAccountName || 'account') : (t.payeeName ? _esc(t.payeeName) : _esc(t.category || 'Expense'));
  const c = (state.pettyCashCustodians || []).find(x => x.id === t.custodianId);
  const canAct = !!(c && _canSeeCustodian(c));
  const photo = (t.photo || t.photoPath) ? `<button type="button" class="pcw-mini" onclick="_pcLightbox('${t.id}')">🖼 Receipt</button>` : '';

  let chip = '', subLine = '', actions = '';
  if (isIn) {
    if (st === 'pending') {
      chip = '<span class="pcw-chip amber">⏳ Awaiting confirmation</span>';
      if (canAct) actions = `<div class="pcw-tx-acts">
        <button type="button" class="pcw-btn green" onclick="_pcAcceptTransfer('${t.id}')">✓ Yes, I received this</button>
        <button type="button" class="pcw-btn ghost red" onclick="_pcDisputeTransfer('${t.id}')">Dispute</button></div>`;
      else subLine = `Waiting for ${_esc(_custName(t.custodianId))} to confirm`;
    } else if (st === 'disputed') {
      chip = '<span class="pcw-chip red">⚠ Disputed</span>';
      subLine = (t.disputeNote ? '“' + _esc(t.disputeNote) + '” — ' : '') + 'raised by ' + _esc(t.acceptedBy || 'recipient');
      if (canAct) actions = `<div class="pcw-tx-acts"><button type="button" class="pcw-btn green" onclick="_pcAcceptTransfer('${t.id}')">✓ Resolve &amp; confirm receipt</button></div>`;
    } else if (t.acceptedBy) subLine = 'Confirmed by ' + _esc(t.acceptedBy);
  }
  const what = !isIn && !isReturn && t.payeeName ? _esc(t.category || '') : (isIn ? _esc(t.fromAccountName ? 'From ' + t.fromAccountName : '') : '');
  const meta = [showName ? _esc(_custName(t.custodianId)) : '', what, _esc(t.description || t.note || ''), _esc(t.date || '')].filter(Boolean).join(' · ');
  const bal = run && run[t.id] != null && kind !== 'pend' && kind !== 'disp' ? `<small>Bal ${_fmt(run[t.id])}</small>` : (kind === 'pend' ? '<small>Not counted yet</small>' : '');
  return `<article class="pcw-tx ${kind}" id="pctx_${t.id}">
    <div class="pcw-tx-row">
      <span class="pcw-tx-ic" data-keep-emoji>${icon}</span>
      <div class="pcw-tx-main"><b>${title}</b><small>${meta}</small>${subLine ? `<small>${subLine}</small>` : ''}${chip}
        ${photo ? `<div class="pcw-tx-foot">${photo}</div>` : ''}</div>
      <div class="pcw-tx-amt"><b>${sign}${_fmt(t.amount)}</b>${bal}${canAct ? `<button type="button" class="pcw-mini del" onclick="_pcDeleteTxn('${t.id}')" aria-label="Delete" title="Delete">🗑</button>` : ''}</div>
    </div>
    ${actions}
  </article>`;
}

// ══════════════════════════════════════════════════════════
//  EXPENSE (standalone section) — pick custodian then log
// ══════════════════════════════════════════════════════════
function _renderExpenseForm(root) {
  const custs = _custodians();
  if (!custs.length) {
    root.innerHTML = `${_backBar('Log Expense')}<div style="color:#94a3b8;padding:24px;text-align:center;">Add a custodian first (Wallets → Add Custodian).</div>`;
    return;
  }
  root.innerHTML = `${_backBar('Log Expense')}
    <div style="max-width:480px;">
      <p style="font-size:13px;color:#64748b;margin-bottom:12px;">Pick the custodian whose balance this expense comes out of.</p>
      <div style="display:flex;flex-direction:column;gap:10px;">
        ${custs.map(c => `<button onclick="_pcExpenseModal('${c.id}')" style="text-align:left;background:#fff;border:1px solid #e2e8f0;border-radius:12px;padding:14px;cursor:pointer;display:flex;justify-content:space-between;align-items:center;">
          <span style="font-weight:700;color:#0f172a;">${_esc(c.name)} <span style="font-weight:400;color:#94a3b8;font-size:12px;">${_esc(c.role || '')}</span></span>
          <span style="font-weight:800;color:#0f766e;">${_fmt(_balance(c.id))}</span></button>`).join('')}
      </div>
    </div>`;
}

// ══════════════════════════════════════════════════════════
//  MODALS (built dynamically)
// ══════════════════════════════════════════════════════════
function _modal(html) {
  let o = document.getElementById('pcModalOverlay');
  if (!o) {
    o = document.createElement('div');
    o.id = 'pcModalOverlay';
    o.style.cssText = 'position:fixed;inset:0;background:rgba(15,23,42,.55);backdrop-filter:blur(3px);z-index:200000;display:flex;align-items:center;justify-content:center;padding:16px;';
    o.addEventListener('click', e => { if (e.target === o) _pcCloseModal(); });
    document.body.appendChild(o);
  }
  o.innerHTML = `<div style="background:#fff;border-radius:18px;max-width:440px;width:100%;max-height:90vh;overflow:auto;box-shadow:0 24px 60px rgba(0,0,0,.3);">${html}</div>`;
  o.style.display = 'flex';
}
window._pcCloseModal = function () { const o = document.getElementById('pcModalOverlay'); if (o) o.style.display = 'none'; _pcPendingPhoto = null; _pcPendingPhotoPath = null; };

const _modalHead = (title) => `<div style="padding:18px 20px;border-bottom:1px solid #f1f5f9;display:flex;justify-content:space-between;align-items:center;"><h3 style="font-weight:800;color:#0f172a;font-size:17px;">${title}</h3><button onclick="_pcCloseModal()" style="border:none;background:#f1f5f9;border-radius:8px;width:28px;height:28px;cursor:pointer;color:#64748b;font-size:16px;">×</button></div>`;
const _inp = 'width:100%;padding:10px 12px;border:1px solid #e2e8f0;border-radius:10px;font-size:14px;margin-bottom:12px;box-sizing:border-box;';

// ── Add / edit custodian ──
window._pcCustodianModal = function (editId) {
  const c = editId ? (state.pettyCashCustodians || []).find(x => x.id === editId) : null;
  const users = (state.rbacUsers || []).filter(u => u.active !== false);
  const userOpts = ['<option value="">— Not linked (admin-only) —</option>',
    ...users.map(u => `<option value="${_esc(u.id)}" data-email="${_esc(u.email || '')}" ${c && c.userId === u.id ? 'selected' : ''}>${_esc(u.name || u.username || u.email)} · ${_esc(u.role || '')}</option>`)].join('');
  _modal(`${_modalHead(c ? 'Edit Custodian' : 'Add Custodian')}
    <div style="padding:20px;">
      <input id="pcCustName" placeholder="Full name *" value="${c ? _esc(c.name) : ''}" style="${_inp}">
      <input id="pcCustRole" placeholder="Role (e.g. Site Engineer)" value="${c ? _esc(c.role || '') : ''}" style="${_inp}">
      <input id="pcCustPhone" placeholder="Phone (optional)" value="${c ? _esc(c.phone || '') : ''}" style="${_inp}">
      <label style="font-size:12px;font-weight:700;color:#64748b;">Link to app user (this person sees only their own wallet)</label>
      <select id="pcCustUser" style="${_inp}margin-top:4px;">${userOpts}</select>
      <div style="display:flex;gap:10px;margin-top:6px;">
        <button onclick="_pcSaveCustodian('${editId || ''}')" style="flex:1;padding:11px;background:#0f172a;color:#fff;border:none;border-radius:10px;font-weight:700;cursor:pointer;">Save</button>
        ${c ? `<button onclick="_pcDeleteCustodian('${editId}')" style="padding:11px 16px;background:#fef2f2;color:#dc2626;border:1px solid #fecaca;border-radius:10px;font-weight:700;cursor:pointer;">Delete</button>` : ''}
      </div>
    </div>`);
};
window._pcSaveCustodian = function (editId) {
  const name = document.getElementById('pcCustName').value.trim();
  if (!name) return showToast('Name is required', 'error');
  const role = document.getElementById('pcCustRole').value.trim();
  const phone = document.getElementById('pcCustPhone').value.trim();
  const userSel = document.getElementById('pcCustUser');
  const userId = userSel ? userSel.value : '';
  const email = userSel && userSel.selectedOptions[0] ? (userSel.selectedOptions[0].dataset.email || '') : '';
  if (editId) {
    const c = state.pettyCashCustodians.find(x => x.id === editId);
    if (c) { c.name = name; c.role = role; c.phone = phone; c.userId = userId || null; c.email = email || null; }
  } else {
    state.pettyCashCustodians.push(window.stampCreate({ id: 'pcc_' + Date.now(), name, role, phone, userId: userId || null, email: email || null, projectId: _pid() }));
  }
  saveAllData();
  _pcCloseModal();
  showToast('Custodian saved', 'success');
  renderPettyCash();
};
window._pcDeleteCustodian = function (id) {
  if (_txns().some(t => t.custodianId === id)) return showToast('Cannot delete — custodian has transactions', 'error');
  if (!confirm('Delete this custodian?')) return;
  const _c = (state.pettyCashCustodians || []).find(c => c.id === id);
  // Tombstone via recycle bin so a stale re-push can't resurrect it (ghost-deletion guard).
  if (window.recycleDelete) window.recycleDelete('pettyCashCustodians', id, 'Petty Cash Custodian', _c?.name || id);
  else { keepOnly('pettyCashCustodians', c => c.id !== id); saveAllData(); }
  _pcCloseModal(); _pcSection = 'wallets'; renderPettyCash();
};

// ── Transfer funds ──
window._pcTransferModal = function (presetCust) {
  if (!_isPettyAdmin()) return showToast('Only an admin can issue funds', 'error');
  const custs = _custodians();
  if (!custs.length) return showToast('Add a custodian first', 'error');
  const opts = custs.map(c => `<option value="${c.id}" ${presetCust === c.id ? 'selected' : ''}>${_esc(c.name)} — ${_fmt(_balance(c.id))}</option>`).join('');
  const accs = state.accounts || [];
  const accOpts = accs.length
    ? accs.map(a => { const b = _accountBalanceFor(a.id); return `<option value="${_esc(a.id)}">${_esc(a.name)} (${_esc(a.type || 'Account')})${b == null ? '' : ' — ' + _fmt(b)}</option>`; }).join('')
    : '';
  _modal(`${_modalHead('Send Funds')}
    <div style="padding:20px;">
      <label style="font-size:12px;font-weight:700;color:#64748b;">From account (Bank / Cash)</label>
      ${accs.length
        ? `<select id="pcTrFromAcc" style="${_inp}margin-top:4px;">${accOpts}</select>`
        : `<div style="${_inp}margin-top:4px;color:#dc2626;background:#fef2f2;border-color:#fecaca;">No Bank/Cash accounts yet. Add one in Finance → Accounts first.</div>`}
      <label style="font-size:12px;font-weight:700;color:#64748b;">To supervisor</label>
      <select id="pcTrCust" style="${_inp}margin-top:4px;">${opts}</select>
      <input id="pcTrAmount" type="number" inputmode="decimal" placeholder="Amount *" style="${_inp}font-size:20px;font-weight:700;">
      <input id="pcTrDate" type="date" value="${new Date().toISOString().split('T')[0]}" style="${_inp}">
      <input id="pcTrNote" placeholder="Note (e.g. Weekly site expenses)" style="${_inp}">
      <button onclick="_pcDoTransfer()" style="width:100%;padding:11px;background:#16a34a;color:#fff;border:none;border-radius:10px;font-weight:700;cursor:pointer;" ${accs.length ? '' : 'disabled'}>＋ Send funds</button>
    </div>`);
};
window._pcDoTransfer = function () {
  if (!_isPettyAdmin()) return showToast('Only an admin can issue funds', 'error');
  const fromAccEl = document.getElementById('pcTrFromAcc');
  const fromAccountId = fromAccEl ? fromAccEl.value : '';
  const custodianId = document.getElementById('pcTrCust').value;
  const amount = parseFloat(document.getElementById('pcTrAmount').value);
  if (!fromAccountId) return showToast('Select the Bank/Cash account the money comes from', 'error');
  if (!custodianId || !(amount > 0)) return showToast('Select custodian and enter a valid amount', 'error');
  const bal = _accountBalanceFor(fromAccountId);
  if (bal != null && amount > bal && !confirm(`This account only has ${_fmt(bal)}. Transfer ${_fmt(amount)} anyway?`)) return;
  const accName = (state.accounts || []).find(a => a.id === fromAccountId)?.name || 'Account';
  const noteTxt = document.getElementById('pcTrNote')?.value?.trim() || '';
  state.pettyCashTxns.push(window.stampCreate({
    id: 'pct_' + Date.now(), type: 'TRANSFER', custodianId, amount, fromAccountId, fromAccountName: accName,
    note: noteTxt,
    date: document.getElementById('pcTrDate').value || new Date().toISOString().split('T')[0],
    status: 'pending',   // custodian must confirm receipt before it counts in their wallet
    projectId: _pid()
  }));
  saveAllData(); _pcCloseModal();
  showToast(`${_fmt(amount)} sent to ${_custName(custodianId)} — awaiting their confirmation`, 'success');
  renderPettyCash();
  if (typeof window.renderAccounts === 'function') window.renderAccounts();
  // Notify the recipient to confirm receipt (in-app + email + push, best-effort).
  try {
    const cust = (state.pettyCashCustodians || []).find(c => c.id === custodianId);
    window.notify && window.notify(_custRecipient(cust), {
      type: 'petty_transfer',
      title: `You received ${_fmt(amount)} in petty cash`,
      body: `From ${accName}${noteTxt ? ' — ' + noteTxt : ''}. Please confirm you've received it.`,
      data: { view: 'pettyCashView', pcOpen: 'cust:' + custodianId }
    });
  } catch {}
};

// ── Accept / dispute a received transfer (recipient confirmation) ──
window._pcAcceptTransfer = function (txnId) {
  const t = (state.pettyCashTxns || []).find(x => x.id === txnId);
  if (!t || t.type !== 'TRANSFER') return;
  const c = (state.pettyCashCustodians || []).find(x => x.id === t.custodianId);
  if (!c || !_canSeeCustodian(c)) return showToast('Only the recipient can confirm this amount', 'error');
  const u = _me();
  t.status = 'accepted';
  t.acceptedAt = Date.now();
  t.acceptedBy = u?.name || u?.email || 'Recipient';
  t.acceptedById = u?.id || '';
  delete t.disputeNote;
  saveAllData();
  showToast(`Confirmed — ${_fmt(t.amount)} added to your wallet`, 'success');
  renderPettyCash();
  try {
    if (t.createdById) window.notify && window.notify(_userRecipient(t.createdById), {
      type: 'petty_accepted', title: `${t.acceptedBy} confirmed ${_fmt(t.amount)}`,
      body: `${_custName(t.custodianId)} confirmed receipt of the petty-cash transfer.`,
      data: { view: 'pettyCashView', pcOpen: 'ledger' }
    });
  } catch {}
};
window._pcDisputeTransfer = function (txnId) {
  const t = (state.pettyCashTxns || []).find(x => x.id === txnId);
  if (!t || t.type !== 'TRANSFER') return;
  const c = (state.pettyCashCustodians || []).find(x => x.id === t.custodianId);
  if (!c || !_canSeeCustodian(c)) return showToast('Only the recipient can dispute this amount', 'error');
  const note = prompt('What is wrong with this amount? (e.g. not received, wrong amount)');
  if (note === null) return;
  const u = _me();
  t.status = 'disputed';
  t.disputeNote = note.trim();
  t.acceptedBy = u?.name || u?.email || 'Recipient';
  t.acceptedById = u?.id || '';
  t.acceptedAt = Date.now();
  saveAllData();
  showToast('Marked as disputed — the admin has been flagged', 'warning');
  renderPettyCash();
  try {
    if (t.createdById) window.notify && window.notify(_userRecipient(t.createdById), {
      type: 'petty_disputed', title: `${_custName(t.custodianId)} disputed ${_fmt(t.amount)}`,
      body: note.trim() ? '“' + note.trim() + '”' : 'A petty-cash transfer was disputed.',
      data: { view: 'pettyCashView', pcOpen: 'cust:' + t.custodianId }
    });
  } catch {}
};

// ── Return unspent funds (custodian → account) ──
window._pcReturnModal = function (presetCust) {
  const custs = _custodians();
  if (!custs.length) return showToast('Add a custodian first', 'error');
  const opts = custs.map(c => `<option value="${c.id}" ${presetCust === c.id ? 'selected' : ''}>${_esc(c.name)} — ${_fmt(_balance(c.id))}</option>`).join('');
  const accs = state.accounts || [];
  const accOpts = accs.map(a => { const b = _accountBalanceFor(a.id); return `<option value="${_esc(a.id)}">${_esc(a.name)} (${_esc(a.type || 'Account')})${b == null ? '' : ' — ' + _fmt(b)}</option>`; }).join('');
  _modal(`${_modalHead('Return Unspent Funds')}
    <div style="padding:20px;">
      <p style="font-size:12px;color:#64748b;margin-bottom:12px;">Send leftover cash from a custodian's wallet back to a Bank/Cash account. This credits the account in the ledger.</p>
      <label style="font-size:12px;font-weight:700;color:#64748b;">From custodian</label>
      <select id="pcRtCust" style="${_inp}margin-top:4px;">${opts}</select>
      <label style="font-size:12px;font-weight:700;color:#64748b;">To account (Bank / Cash)</label>
      ${accs.length
        ? `<select id="pcRtAcc" style="${_inp}margin-top:4px;">${accOpts}</select>`
        : `<div style="${_inp}margin-top:4px;color:#dc2626;background:#fef2f2;border-color:#fecaca;">No Bank/Cash accounts yet. Add one in Finance → Accounts first.</div>`}
      <input id="pcRtAmount" type="number" inputmode="decimal" placeholder="Amount *" style="${_inp}font-size:20px;font-weight:700;">
      <input id="pcRtDate" type="date" value="${new Date().toISOString().split('T')[0]}" style="${_inp}">
      <input id="pcRtNote" placeholder="Note (e.g. Project closed — returning balance)" style="${_inp}">
      <button onclick="_pcDoReturn()" style="width:100%;padding:11px;background:#2563eb;color:#fff;border:none;border-radius:10px;font-weight:700;cursor:pointer;" ${accs.length ? '' : 'disabled'}>↩ Return to account</button>
    </div>`);
};
window._pcDoReturn = function () {
  const custodianId = document.getElementById('pcRtCust').value;
  const toAccEl = document.getElementById('pcRtAcc');
  const toAccountId = toAccEl ? toAccEl.value : '';
  const amount = parseFloat(document.getElementById('pcRtAmount').value);
  if (!toAccountId) return showToast('Select the account to return the money to', 'error');
  if (!custodianId || !(amount > 0)) return showToast('Select custodian and enter a valid amount', 'error');
  const bal = _balance(custodianId);
  if (amount > bal && !confirm(`Wallet holds only ${_fmt(bal)}. Return ${_fmt(amount)} anyway (wallet will go negative)?`)) return;
  const accName = (state.accounts || []).find(a => a.id === toAccountId)?.name || 'Account';
  state.pettyCashTxns.push(window.stampCreate({
    id: 'pcr_' + Date.now(), type: 'RETURN', custodianId, amount, toAccountId, toAccountName: accName,
    note: document.getElementById('pcRtNote').value.trim(),
    date: document.getElementById('pcRtDate').value || new Date().toISOString().split('T')[0],
    projectId: _pid()
  }));
  saveAllData(); _pcCloseModal();
  showToast(`Returned ${_fmt(amount)} to ${accName}`, 'success');
  renderPettyCash();
  if (typeof window.renderAccounts === 'function') window.renderAccounts();
};

// ── Log expense (with photo receipt) ──
// Quick-pick chips → stored category (older vouchers keep their category names).
const PC_CHIPS = [
  { k: 'labour', label: 'Labour Payment', icon: '👷', cat: 'Daily Wages' },
  { k: 'materials', label: 'Materials', icon: '🧱', cat: 'Site Materials' },
  { k: 'transport', label: 'Transport', icon: '🚚', cat: 'Travel / Transport' },
  { k: 'food', label: 'Food / Tea', icon: '🍱', cat: 'Food / Refreshments' },
  { k: 'tools', label: 'Tools', icon: '🔧', cat: 'Tools / Hardware' },
  { k: 'misc', label: 'Other', icon: '📌', cat: 'Miscellaneous' },
];
let _pcxChip = 'labour';
let _pcxCust = null;
window._pcExpenseModal = function (custId) {
  const c = (state.pettyCashCustodians || []).find(x => x.id === custId);
  if (!c) return;
  _pcPendingPhoto = null; _pcPendingPhotoPath = null; _pcxCust = custId; _pcxChip = 'labour';
  const bal = _balance(custId);
  _modal(`${_modalHead('Log Expense')}
    <div class="pcx">
      <div class="pcx-wallet">
        <div><span>${_esc(c.name)} · wallet</span><b>${_fmt(bal)}</b></div>
        <div class="pcx-arrow">→</div>
        <div class="pcx-after" id="pcxAfterBox"><span>After this expense</span><b id="pcxAfter">${_fmt(bal)}</b></div>
      </div>
      <div class="pcx-l">What was it for?</div>
      <div class="pcx-chips" role="radiogroup">${PC_CHIPS.map(ch => `<button type="button" role="radio" class="pcx-chip${ch.k === _pcxChip ? ' on' : ''}" data-k="${ch.k}" aria-checked="${ch.k === _pcxChip}" onclick="_pcxPick('${ch.k}')"><span data-keep-emoji>${ch.icon}</span>${ch.label}</button>`).join('')}</div>
      <div id="pcxPayeeWrap"></div>
      <div class="pcx-l">Amount</div>
      <div class="pcx-amt"><span>${_esc(getCurrencySymbol())}</span><input id="pcExAmount" type="number" inputmode="decimal" min="0" step="any" placeholder="0" oninput="_pcxPreview()" autocomplete="off"></div>
      <input id="pcExDesc" class="pcx-in" placeholder="Quick note (e.g. 4 helpers, slab day)" autocomplete="off">
      <div class="pcx-row">
        <label class="pcx-photo"><span data-keep-emoji>📷</span> Receipt photo<input id="pcExPhoto" type="file" accept="image/*" capture="environment" onchange="_pcCapturePhoto(this)" hidden></label>
        <input id="pcExDate" class="pcx-in" type="date" value="${new Date().toISOString().split('T')[0]}">
      </div>
      <div id="pcExPhotoPreview"></div>
      <button type="button" class="pcw-log" id="pcxSave" onclick="_pcDoExpense('${custId}')">Save &amp; deduct</button>
    </div>`);
  _pcxPick(_pcxChip);
  setTimeout(() => document.getElementById('pcExAmount')?.focus(), 60);
};
/** Choose a chip; Labour / Materials offer an optional "paid to" party so it lands on that party's ledger. */
window._pcxPick = function (k) {
  _pcxChip = k;
  document.querySelectorAll('.pcx-chip').forEach(b => { const on = b.dataset.k === k; b.classList.toggle('on', on); b.setAttribute('aria-checked', String(on)); });
  const wrap = document.getElementById('pcxPayeeWrap'); if (!wrap) return;
  const opt = (type, x) => `<option value="${type}:${_esc(x.id)}">${_esc(x.name)}${x.trade ? ' (' + _esc(x.trade) + ')' : ''}</option>`;
  if (k === 'labour') {
    const w = _pcPartyList('labour'), g = _pcPartyList('contractor');
    wrap.innerHTML = `<div class="pcx-l">Paid to <i>optional</i></div><select id="pcExPayee" class="pcx-in">
      <option value="">General labour (no worker ledger)</option>
      ${w.length ? `<optgroup label="Workers">${w.map(x => opt('labour', x)).join('')}</optgroup>` : ''}
      ${g.length ? `<optgroup label="Gangs / contractors">${g.map(x => opt('contractor', x)).join('')}</optgroup>` : ''}</select>`;
  } else if (k === 'materials') {
    const v = _pcPartyList('vendor');
    wrap.innerHTML = v.length ? `<div class="pcx-l">Supplier <i>optional</i></div><select id="pcExPayee" class="pcx-in">
      <option value="">Local purchase (no supplier ledger)</option>${v.map(x => opt('vendor', x)).join('')}</select>` : '';
  } else wrap.innerHTML = '';
};
/** Live deduction preview: wallet → balance after this expense (red when it overdraws). */
window._pcxPreview = function () {
  if (!_pcxCust) return;
  const p = afterSpend(_balance(_pcxCust), document.getElementById('pcExAmount')?.value);
  const b = document.getElementById('pcxAfter'), box = document.getElementById('pcxAfterBox');
  if (b) b.textContent = _fmt(p.after);
  if (box) box.classList.toggle('neg', p.after < 0);
};
window._pcCapturePhoto = async function (input) {
  const file = input.files && input.files[0];
  const prev = document.getElementById('pcExPhotoPreview');
  if (!file) return;
  let objUrl = ''; try { objUrl = URL.createObjectURL(file); } catch {}
  if (prev) prev.innerHTML = `<img src="${objUrl}" style="max-height:120px;border-radius:10px;border:1px solid #e2e8f0;opacity:.6;"><div style="font-size:11px;color:#94a3b8;">Uploading…</div>`;
  const ref = await uploadExecMedia(file, 'receipt', 'pettycash');
  if (ref) {
    _pcPendingPhotoPath = ref.path; _pcPendingPhoto = null;
    if (prev) prev.innerHTML = `<img src="${objUrl}" style="max-height:120px;border-radius:10px;border:1px solid #e2e8f0;">`;
  } else {
    if (prev) prev.innerHTML = '<span style="font-size:12px;color:#dc2626;">Upload failed — connect and retry</span>';
    try { input.value = ''; } catch {}
  }
};
// Project-scoped party lists for the petty-cash "Paid to" picker.
function _pcPartyList(type) {
  const pid = _pid();
  if (type === 'labour') return (state.labourMaster || []).filter(l => !pid || l.projectId === pid);
  if (type === 'vendor') return (state.vendors || []);
  if (type === 'contractor') return (state.labourContractors || []).filter(c => !c.projectId || c.projectId === pid);
  return [];
}
window._pcPayeeTypeChange = function () {
  const t = document.getElementById('pcExPayeeType')?.value || '';
  const sel = document.getElementById('pcExPayee');
  if (!sel) return;
  if (!t) { sel.style.display = 'none'; sel.innerHTML = ''; return; }
  const list = _pcPartyList(t);
  sel.style.display = '';
  sel.innerHTML = list.length
    ? list.map(x => `<option value="${_esc(x.id)}">${_esc(x.name)}${x.trade ? ' (' + _esc(x.trade) + ')' : ''}</option>`).join('')
    : '<option value="" disabled>None in this project</option>';
};

window._pcDoExpense = function (custId) {
  const amount = parseFloat(document.getElementById('pcExAmount').value);
  if (!(amount > 0)) return showToast('Enter a valid amount', 'error');
  const date = document.getElementById('pcExDate').value || new Date().toISOString().split('T')[0];
  const pick = document.getElementById('pcExPayee')?.value || '';
  const [payeeType, payeeId] = pick ? pick.split(':') : ['', ''];
  const payee = (payeeType && payeeId) ? _pcPartyList(payeeType).find(x => x.id === payeeId) : null;
  const chip = PC_CHIPS.find(x => x.k === _pcxChip) || PC_CHIPS[PC_CHIPS.length - 1];
  const paymentId = 'pmt_' + Date.now();
  const catFor = { labour: 'Daily Wages', vendor: 'Material / Vendor', contractor: 'Contractor' };
  const before = _balance(custId);
  if (amount > before && !confirm(`Wallet holds only ${_fmt(before)}. Log ${_fmt(amount)} anyway (wallet goes negative)?`)) return;

  // Cash-out leg: reduce the custodian wallet (attributed to this custodian).
  const txnId = 'pcx_' + Date.now();
  state.pettyCashTxns.push(window.stampCreate({
    id: txnId, type: 'EXPENSE', custodianId: custId, amount,
    category: payee ? (catFor[payeeType] || chip.cat) : chip.cat,
    description: document.getElementById('pcExDesc').value.trim(),
    payeeType: payee ? payeeType : undefined,
    payeeId: payee ? payeeId : undefined,
    payeeName: payee ? payee.name : undefined,
    paymentId,
    date,
    photoPath: _pcPendingPhotoPath || null,   // Storage ref (bytes not in synced JSON)
    photo: null,
    projectId: _pid()
  }));

  // Ledger leg for a party payment: hits that party's ledger with NO accountId,
  // so the main account is never debited (the money left main at top-up time).
  if (payee) {
    const leg = { date, amount, source: 'petty', custodianId: custId, ref: `Petty cash · ${_custName(custId)}`, paymentId, projectId: _pid() };
    if (payeeType === 'labour') { if (!state.labourPayments) state.labourPayments = []; state.labourPayments.push(window.stampCreate({ id: 'lpay_' + Date.now(), labourId: payeeId, ...leg })); }
    else if (payeeType === 'vendor') { if (!state.vendorPayments) state.vendorPayments = []; state.vendorPayments.push(window.stampCreate({ id: 'vp_' + Date.now(), vendorId: payeeId, ...leg })); }
    else if (payeeType === 'contractor') { if (!state.expenses) state.expenses = []; state.expenses.push(window.stampCreate({ id: 'exp_' + Date.now(), category: 'Piece-Rate Gang Payout', gangId: payeeId, ...leg })); }
  }
  _pcFlashId = txnId;
  // Open the wallet the money came out of so the new card + balance are right there.
  if (_pcSection !== 'cust:' + custId && (_isPettyAdmin() || _custodians().length > 1)) _pcSection = 'cust:' + custId;
  _pcPendingPhoto = null; _pcPendingPhotoPath = null;
  saveAllData(); _pcCloseModal();
  showToast(`${payee ? 'Paid ' + payee.name + ' · ' : ''}${_fmt(amount)} deducted — balance ${_fmt(_balance(custId))}`, 'success');
  renderPettyCash();
};

window._pcDeleteTxn = function (id) {
  if (!confirm('Delete this transaction?')) return;
  const _t = (state.pettyCashTxns || []).find(x => x.id === id);
  if (_t && _t.photoPath) removeExecMedia({ path: _t.photoPath });   // clean up the Storage file
  // Tombstone via recycle bin so a stale re-push can't resurrect it (ghost-deletion guard).
  if (window.recycleDelete) window.recycleDelete('pettyCashTxns', id, 'Petty Cash Txn');
  else { keepOnly('pettyCashTxns', t => t.id !== id); saveAllData(); }
  renderPettyCash();
  // Transfers & returns move money in/out of accounts — refresh the accounting view.
  if ((_t?.type === 'TRANSFER' || _t?.type === 'RETURN') && typeof window.renderAccounts === 'function') window.renderAccounts();
};

// ── Cinematic receipt lightbox ──
window._pcLightbox = async function (txnId) {
  const t = (state.pettyCashTxns || []).find(x => x.id === txnId);
  if (!t || (!t.photo && !t.photoPath)) return;
  let lb = document.getElementById('pcLightbox');
  if (!lb) {
    lb = document.createElement('div');
    lb.id = 'pcLightbox';
    lb.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.88);z-index:200001;display:flex;align-items:center;justify-content:center;padding:24px;opacity:0;transition:opacity .2s;cursor:zoom-out;';
    lb.addEventListener('click', () => { lb.style.opacity = '0'; setTimeout(() => lb.remove(), 200); });
    document.body.appendChild(lb);
  }
  const caption = `<div style="position:absolute;bottom:18px;left:0;right:0;text-align:center;color:#fff;font-size:13px;opacity:.85;">${_esc(t.category || 'Receipt')} · ${_fmt(t.amount)} · ${_esc(t.date || '')}</div>`;
  // Legacy base64 shows instantly; Storage-backed loads via a signed URL.
  let src = t.photo || null;
  if (!src && t.photoPath) { lb.innerHTML = `<div style="color:#fff;font-size:13px;opacity:.7;">Loading receipt…</div>`; lb.style.opacity = '1'; src = await signedExecUrl(t.photoPath); if (!document.getElementById('pcLightbox')) return; }
  lb.innerHTML = (src ? `<img src="${src}" style="max-width:96%;max-height:92%;border-radius:12px;box-shadow:0 30px 80px rgba(0,0,0,.6);transform:scale(.96);transition:transform .25s;">` : `<div style="color:#fff;">Could not load receipt</div>`) + caption;
  requestAnimationFrame(() => { lb.style.opacity = '1'; const img = lb.querySelector('img'); if (img) img.style.transform = 'scale(1)'; });
};
