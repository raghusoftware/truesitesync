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
import { showToast, getCurrencySymbol } from './utils.js';
import { getCurrentUser } from './rbac.js';

const PC_CATEGORIES = ['Site Materials', 'Travel / Transport', 'Food / Refreshments', 'Daily Wages', 'Tools / Hardware', 'Miscellaneous'];

// ── helpers ────────────────────────────────────────────────
function _pid() { return state.currentProjectId || null; }
function _fmt(n) { return getCurrencySymbol() + (n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
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
  return (state.pettyCashCustodians || []).filter(c => c.projectId === pid && _canSeeCustodian(c));
}
function _txns() {
  const pid = _pid();
  return (state.pettyCashTxns || []).filter(t => t.projectId === pid);
}
function _accountBalanceFor(accId) {
  if (typeof window._getAccountBalancePublic === 'function') return window._getAccountBalancePublic(accId);
  return null;
}
function _balance(custId) {
  return _txns().filter(t => t.custodianId === custId)
    .reduce((b, t) => b + (t.type === 'TRANSFER' ? (t.amount || 0) : -(t.amount || 0)), 0);
}
function _custName(id) { return (state.pettyCashCustodians || []).find(c => c.id === id)?.name || '—'; }

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
let _pcPendingPhoto = null;   // base64 of a captured receipt awaiting save
let _pcLedgerFilter = '';     // custodian id filter

// ══════════════════════════════════════════════════════════
//  ENTRY + ROUTER
// ══════════════════════════════════════════════════════════
export function renderPettyCash() {
  const root = document.getElementById('pettyCashRoot');
  if (!root) return;
  if (!_pid()) {
    root.innerHTML = `<div style="text-align:center;padding:60px 20px;color:#94a3b8;">
      <div style="font-size:42px;margin-bottom:10px;">💰</div>
      <p style="font-weight:700;color:#475569;">Open a project first</p>
      <p style="font-size:13px;">Petty cash wallets are managed per project.</p></div>`;
    return;
  }
  if (_pcSection === 'wallets') return _renderWallets(root);
  if (_pcSection === 'expense') return _renderExpenseForm(root);
  if (_pcSection === 'ledger') return _renderLedger(root);
  if (_pcSection && _pcSection.startsWith('cust:')) return _renderCustodian(root, _pcSection.slice(5));
  return _renderHome(root);
}

window._pcOpen = function (section) { _pcSection = section; renderPettyCash(); };

// ══════════════════════════════════════════════════════════
//  HOME — app-icon grid + total-in-field card
// ══════════════════════════════════════════════════════════
function _renderHome(root) {
  const custs = _custodians();
  const totalInField = custs.reduce((s, c) => s + _balance(c.id), 0);
  const card = (icon, color, title, sub, onclick) => `
    <div onclick="${onclick}" style="background:#fff;border:1px solid #e2e8f0;border-radius:16px;padding:22px 16px;cursor:pointer;text-align:center;transition:.15s;box-shadow:0 1px 3px rgba(0,0,0,.04);" onmouseover="this.style.transform='translateY(-2px)';this.style.boxShadow='0 8px 24px rgba(0,0,0,.08)'" onmouseout="this.style.transform='';this.style.boxShadow='0 1px 3px rgba(0,0,0,.04)'">
      <div style="width:50px;height:50px;background:${color}15;border:2px solid ${color}30;border-radius:14px;display:inline-flex;align-items:center;justify-content:center;font-size:24px;margin-bottom:10px;">${icon}</div>
      <div style="font-size:13px;font-weight:700;color:#0f172a;">${title}</div>
      <div style="font-size:10px;color:#94a3b8;margin-top:2px;">${sub}</div>
    </div>`;

  root.innerHTML = `
    <h2 class="text-3xl font-extrabold text-slate-800 mb-1">Petty Cash</h2>
    <p class="text-sm text-slate-400 mb-5">Imprest wallets — push funds to field custodians & track every rupee</p>

    <div style="background:linear-gradient(135deg,#0f766e,#10b981);border-radius:20px;padding:22px 26px;color:#fff;margin-bottom:22px;box-shadow:0 10px 30px rgba(16,185,129,.25);display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:12px;">
      <div>
        <div style="font-size:12px;text-transform:uppercase;letter-spacing:.08em;opacity:.85;">Total Cash in Field</div>
        <div style="font-size:34px;font-weight:800;margin-top:2px;">${_fmt(totalInField)}</div>
        <div style="font-size:12px;opacity:.85;margin-top:2px;">${custs.length} custodian${custs.length === 1 ? '' : 's'}</div>
      </div>
      <div style="font-size:46px;opacity:.35;">🪙</div>
    </div>

    <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(165px,1fr));gap:12px;">
      ${card('👛', '#10b981', 'Wallets', 'Custodians & balances', "_pcOpen('wallets')")}
      ${card('🧾', '#f59e0b', 'Log Expense', 'Deduct a field spend', "_pcOpen('expense')")}
      ${card('📜', '#2563eb', 'Ledger', 'All transfers & expenses', "_pcOpen('ledger')")}
    </div>`;
}

function _backBar(title) {
  return `<button onclick="_pcOpen(null)" style="margin-bottom:14px;padding:6px 14px;background:#f1f5f9;border:1px solid #e2e8f0;border-radius:8px;color:#64748b;font-size:12px;font-weight:600;cursor:pointer;">← Petty Cash</button>
    <h2 class="text-2xl font-extrabold text-slate-800 mb-4">${title}</h2>`;
}

// ══════════════════════════════════════════════════════════
//  WALLETS — custodian overview + transfer
// ══════════════════════════════════════════════════════════
function _renderWallets(root) {
  const custs = _custodians();
  const rows = custs.map(c => {
    const bal = _balance(c.id);
    return `<div onclick="_pcOpen('cust:${c.id}')" style="background:#fff;border:1px solid #e2e8f0;border-radius:14px;padding:16px;cursor:pointer;display:flex;justify-content:space-between;align-items:center;transition:.15s;" onmouseover="this.style.boxShadow='0 6px 20px rgba(0,0,0,.07)'" onmouseout="this.style.boxShadow=''">
      <div style="display:flex;align-items:center;gap:12px;">
        <div style="width:42px;height:42px;border-radius:50%;background:#10b98115;color:#0f766e;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:16px;">${_esc((c.name || '?').charAt(0).toUpperCase())}</div>
        <div>
          <div style="font-weight:700;color:#0f172a;">${_esc(c.name)}</div>
          <div style="font-size:11px;color:#94a3b8;">${_esc(c.role || 'Custodian')}${c.phone ? ' · ' + _esc(c.phone) : ''}</div>
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
      <button onclick="_pcTransferModal()" style="padding:9px 16px;background:#10b981;color:#fff;border:none;border-radius:10px;font-size:13px;font-weight:700;cursor:pointer;" ${custs.length ? '' : 'disabled'}>⇪ Transfer Funds</button>
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
function _renderCustodian(root, custId) {
  const c = (state.pettyCashCustodians || []).find(x => x.id === custId);
  if (!c || !_canSeeCustodian(c)) { _pcSection = 'wallets'; return renderPettyCash(); }
  const bal = _balance(custId);
  const isAdm = _isPettyAdmin();
  const hist = _txns().filter(t => t.custodianId === custId).sort((a, b) => (b.date || '').localeCompare(a.date || '') || (b.createdAt || 0) - (a.createdAt || 0));
  const histRows = hist.map(t => _txnRow(t)).join('');

  root.innerHTML = `
    <button onclick="_pcOpen('wallets')" style="margin-bottom:14px;padding:6px 14px;background:#f1f5f9;border:1px solid #e2e8f0;border-radius:8px;color:#64748b;font-size:12px;font-weight:600;cursor:pointer;">← Wallets</button>
    <div style="background:linear-gradient(135deg,#0f766e,#10b981);border-radius:20px;padding:24px;color:#fff;margin-bottom:18px;box-shadow:0 10px 30px rgba(16,185,129,.25);">
      <div style="font-size:13px;opacity:.85;">${_esc(c.name)} · ${_esc(c.role || 'Custodian')}</div>
      <div style="font-size:12px;text-transform:uppercase;letter-spacing:.08em;opacity:.8;margin-top:10px;">Live Balance</div>
      <div style="font-size:40px;font-weight:800;">${_fmt(bal)}</div>
    </div>
    <div style="display:flex;gap:10px;margin-bottom:16px;flex-wrap:wrap;">
      <button onclick="_pcExpenseModal('${custId}')" style="padding:9px 16px;background:#f59e0b;color:#fff;border:none;border-radius:10px;font-size:13px;font-weight:700;cursor:pointer;">🧾 Log Expense</button>
      ${isAdm ? `<button onclick="_pcTransferModal('${custId}')" style="padding:9px 16px;background:#10b981;color:#fff;border:none;border-radius:10px;font-size:13px;font-weight:700;cursor:pointer;">⇪ Add Funds</button>
      <button onclick="_pcCustodianModal('${custId}')" style="padding:9px 16px;background:#f1f5f9;color:#475569;border:1px solid #e2e8f0;border-radius:10px;font-size:13px;font-weight:700;cursor:pointer;">✎ Edit</button>` : ''}
    </div>
    <h3 style="font-weight:800;color:#334155;margin-bottom:10px;">History</h3>
    <div style="display:flex;flex-direction:column;gap:8px;">${histRows || `<div style="color:#94a3b8;padding:20px;text-align:center;">No transactions yet.</div>`}</div>`;
}

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

  root.innerHTML = `
    ${_backBar('Ledger')}
    <div style="display:flex;gap:10px;margin-bottom:14px;flex-wrap:wrap;align-items:center;">
      <select onchange="_pcSetLedgerFilter(this.value)" style="padding:8px 12px;border:1px solid #e2e8f0;border-radius:9px;font-size:13px;background:#fff;">${opts}</select>
      <span style="font-size:12px;color:#10b981;font-weight:700;">In: ${_fmt(totIn)}</span>
      <span style="font-size:12px;color:#f59e0b;font-weight:700;">Out: ${_fmt(totOut)}</span>
    </div>
    <div style="display:flex;flex-direction:column;gap:8px;">${list.map(t => _txnRow(t, true)).join('') || `<div style="color:#94a3b8;padding:24px;text-align:center;">No transactions.</div>`}</div>`;
}
window._pcSetLedgerFilter = function (v) { _pcLedgerFilter = v; renderPettyCash(); };

function _txnRow(t, showName) {
  const isIn = t.type === 'TRANSFER';
  const accent = isIn ? '#10b981' : '#f59e0b';
  const sign = isIn ? '+' : '−';
  const photo = t.photo ? `<button onclick="_pcLightbox('${t.id}')" title="View receipt" style="border:none;background:#f1f5f9;border-radius:8px;padding:4px 7px;cursor:pointer;font-size:14px;">🖼️</button>` : '';
  return `<div style="background:#fff;border:1px solid #e2e8f0;border-left:4px solid ${accent};border-radius:12px;padding:12px 14px;display:flex;justify-content:space-between;align-items:center;gap:10px;">
    <div style="min-width:0;">
      <div style="font-weight:700;color:#0f172a;font-size:13px;">${isIn ? 'Transfer In' : _esc(t.category || 'Expense')}${showName ? ' · ' + _esc(_custName(t.custodianId)) : ''}</div>
      <div style="font-size:11px;color:#94a3b8;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${_esc(t.description || t.note || '')}${t.date ? ' · ' + _esc(t.date) : ''}</div>
    </div>
    <div style="display:flex;align-items:center;gap:8px;flex-shrink:0;">
      ${photo}
      <div style="font-weight:800;color:${accent};font-size:15px;">${sign}${_fmt(t.amount)}</div>
      <button onclick="_pcDeleteTxn('${t.id}')" title="Delete" style="border:none;background:transparent;color:#cbd5e1;cursor:pointer;font-size:14px;">🗑️</button>
    </div>
  </div>`;
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
window._pcCloseModal = function () { const o = document.getElementById('pcModalOverlay'); if (o) o.style.display = 'none'; _pcPendingPhoto = null; };

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
    state.pettyCashCustodians.push({ id: 'pcc_' + Date.now(), name, role, phone, userId: userId || null, email: email || null, projectId: _pid(), createdAt: Date.now() });
  }
  saveAllData();
  _pcCloseModal();
  showToast('Custodian saved', 'success');
  renderPettyCash();
};
window._pcDeleteCustodian = function (id) {
  if (_txns().some(t => t.custodianId === id)) return showToast('Cannot delete — custodian has transactions', 'error');
  if (!confirm('Delete this custodian?')) return;
  state.pettyCashCustodians = state.pettyCashCustodians.filter(c => c.id !== id);
  saveAllData(); _pcCloseModal(); _pcSection = 'wallets'; renderPettyCash();
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
  _modal(`${_modalHead('Transfer Funds')}
    <div style="padding:20px;">
      <label style="font-size:12px;font-weight:700;color:#64748b;">From account (Bank / Cash)</label>
      ${accs.length
        ? `<select id="pcTrFromAcc" style="${_inp}margin-top:4px;">${accOpts}</select>`
        : `<div style="${_inp}margin-top:4px;color:#dc2626;background:#fef2f2;border-color:#fecaca;">No Bank/Cash accounts yet. Add one in Finance → Accounts first.</div>`}
      <label style="font-size:12px;font-weight:700;color:#64748b;">To custodian</label>
      <select id="pcTrCust" style="${_inp}margin-top:4px;">${opts}</select>
      <input id="pcTrAmount" type="number" inputmode="decimal" placeholder="Amount *" style="${_inp}font-size:20px;font-weight:700;">
      <input id="pcTrDate" type="date" value="${new Date().toISOString().split('T')[0]}" style="${_inp}">
      <input id="pcTrNote" placeholder="Note (e.g. Weekly site expenses)" style="${_inp}">
      <button onclick="_pcDoTransfer()" style="width:100%;padding:11px;background:#10b981;color:#fff;border:none;border-radius:10px;font-weight:700;cursor:pointer;" ${accs.length ? '' : 'disabled'}>⇪ Transfer</button>
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
  state.pettyCashTxns.push({
    id: 'pct_' + Date.now(), type: 'TRANSFER', custodianId, amount, fromAccountId, fromAccountName: accName,
    note: document.getElementById('pcTrNote').value.trim(),
    date: document.getElementById('pcTrDate').value || new Date().toISOString().split('T')[0],
    projectId: _pid(), createdAt: Date.now()
  });
  saveAllData(); _pcCloseModal();
  showToast(`Transferred ${_fmt(amount)} from ${accName} to ${_custName(custodianId)}`, 'success');
  renderPettyCash();
  if (typeof window.renderAccounts === 'function') window.renderAccounts();
};

// ── Log expense (with photo receipt) ──
window._pcExpenseModal = function (custId) {
  const c = (state.pettyCashCustodians || []).find(x => x.id === custId);
  if (!c) return;
  _pcPendingPhoto = null;
  const cats = PC_CATEGORIES.map(x => `<option>${x}</option>`).join('');
  _modal(`${_modalHead('Log Expense')}
    <div style="padding:20px;">
      <div style="background:#ecfdf5;border:1px solid #a7f3d0;border-radius:10px;padding:8px 12px;margin-bottom:12px;font-size:12px;color:#047857;">${_esc(c.name)} · Balance ${_fmt(_balance(custId))}</div>
      <input id="pcExAmount" type="number" inputmode="decimal" placeholder="Amount *" style="${_inp}font-size:20px;font-weight:700;">
      <select id="pcExCat" style="${_inp}">${cats}</select>
      <input id="pcExDesc" placeholder="Description (what was bought)" style="${_inp}">
      <input id="pcExDate" type="date" value="${new Date().toISOString().split('T')[0]}" style="${_inp}">
      <label style="display:block;font-size:12px;font-weight:700;color:#64748b;margin-bottom:6px;">Receipt photo (optional)</label>
      <input id="pcExPhoto" type="file" accept="image/*" capture="environment" onchange="_pcCapturePhoto(this)" style="font-size:12px;margin-bottom:6px;">
      <div id="pcExPhotoPreview" style="margin-bottom:12px;"></div>
      <button onclick="_pcDoExpense('${custId}')" style="width:100%;padding:11px;background:#f59e0b;color:#fff;border:none;border-radius:10px;font-weight:700;cursor:pointer;">Save Expense</button>
    </div>`);
};
window._pcCapturePhoto = async function (input) {
  const file = input.files && input.files[0];
  const prev = document.getElementById('pcExPhotoPreview');
  if (!file) return;
  try {
    if (prev) prev.innerHTML = '<span style="font-size:12px;color:#94a3b8;">Compressing…</span>';
    _pcPendingPhoto = await _compressImage(file);
    if (prev) prev.innerHTML = _pcPendingPhoto
      ? `<img src="${_pcPendingPhoto}" style="max-height:120px;border-radius:10px;border:1px solid #e2e8f0;">`
      : '<span style="font-size:12px;color:#dc2626;">Unsupported file</span>';
  } catch (e) {
    _pcPendingPhoto = null;
    if (prev) prev.innerHTML = '<span style="font-size:12px;color:#dc2626;">Could not read image</span>';
  }
};
window._pcDoExpense = function (custId) {
  const amount = parseFloat(document.getElementById('pcExAmount').value);
  if (!(amount > 0)) return showToast('Enter a valid amount', 'error');
  state.pettyCashTxns.push({
    id: 'pcx_' + Date.now(), type: 'EXPENSE', custodianId: custId, amount,
    category: document.getElementById('pcExCat').value,
    description: document.getElementById('pcExDesc').value.trim(),
    date: document.getElementById('pcExDate').value || new Date().toISOString().split('T')[0],
    photo: _pcPendingPhoto || null,
    projectId: _pid(), createdAt: Date.now()
  });
  _pcPendingPhoto = null;
  saveAllData(); _pcCloseModal();
  showToast(`Expense ${_fmt(amount)} logged`, 'success');
  renderPettyCash();
};

window._pcDeleteTxn = function (id) {
  if (!confirm('Delete this transaction?')) return;
  state.pettyCashTxns = state.pettyCashTxns.filter(t => t.id !== id);
  saveAllData(); renderPettyCash();
};

// ── Cinematic receipt lightbox ──
window._pcLightbox = function (txnId) {
  const t = (state.pettyCashTxns || []).find(x => x.id === txnId);
  if (!t || !t.photo) return;
  let lb = document.getElementById('pcLightbox');
  if (!lb) {
    lb = document.createElement('div');
    lb.id = 'pcLightbox';
    lb.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.88);z-index:200001;display:flex;align-items:center;justify-content:center;padding:24px;opacity:0;transition:opacity .2s;cursor:zoom-out;';
    lb.addEventListener('click', () => { lb.style.opacity = '0'; setTimeout(() => lb.remove(), 200); });
    document.body.appendChild(lb);
  }
  lb.innerHTML = `<img src="${t.photo}" style="max-width:96%;max-height:92%;border-radius:12px;box-shadow:0 30px 80px rgba(0,0,0,.6);transform:scale(.96);transition:transform .25s;">
    <div style="position:absolute;bottom:18px;left:0;right:0;text-align:center;color:#fff;font-size:13px;opacity:.85;">${_esc(t.category || 'Receipt')} · ${_fmt(t.amount)} · ${_esc(t.date || '')}</div>`;
  requestAnimationFrame(() => { lb.style.opacity = '1'; const img = lb.querySelector('img'); if (img) img.style.transform = 'scale(1)'; });
};
