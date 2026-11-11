/**
 * ═══════════════════════════════════════════════════════════
 * True Site Sync — Client Hub & client master
 * ═══════════════════════════════════════════════════════════
 * Client financial hub (ledger + KPIs) and client CRUD.
 * Extracted from ui.js. Ledger build + master list live in finance.js.
 * ═══════════════════════════════════════════════════════════
 */

import { state, saveAllData } from './state.js';
import { settledAmount } from './deductions.js';
import { showToast, getCurrencySymbol, populateDropdowns } from './utils.js';
import { buildClientLedger, renderMasterClientList } from './finance.js';
import { rulesBlockHTML, readRules } from './billingRulesUI.js?v=1.0.1';

export function renderClientHub() {
  const cId = document.getElementById('hubClientSelect').value;
  const content = document.getElementById('hubContent');
  if (!cId) { content.classList.add('hide'); return; }
  content.classList.remove('hide');
  const work = state.abstracts.filter(a => a.clientId === cId).reduce((s, a) => s + a.totalAmount, 0);
  const taxes = state.invoices.filter(i => i.clientId === cId && i.status !== 'Cancelled').reduce((s, i) => s + i.taxAmount, 0);
  const paid = state.paymentsIn.filter(p => p.clientId === cId).reduce((s, p) => s + settledAmount(p), 0);
  document.getElementById('hubWork').textContent = getCurrencySymbol() + work.toLocaleString('en-IN');
  document.getElementById('hubTax').textContent = getCurrencySymbol() + taxes.toLocaleString('en-IN');
  document.getElementById('hubPay').textContent = getCurrencySymbol() + paid.toLocaleString('en-IN');
  document.getElementById('hubBal').textContent = getCurrencySymbol() + ((work + taxes) - paid).toLocaleString('en-IN');
  const stmt = buildClientLedger(cId);
  const tbody = document.getElementById('hubStatementBody');
  tbody.innerHTML = '';
  let bal = 0;
  stmt.forEach(s => {
    bal += (s.debit - s.credit);
    tbody.innerHTML += `<tr><td class="p-3 border-b">${s.date}</td><td class="p-3 border-b font-medium">${s.desc}</td><td class="p-3 border-b text-right text-blue-700 font-bold">${s.debit ? s.debit.toFixed(2) : '-'}</td><td class="p-3 border-b text-right text-green-700 font-bold">${s.credit ? s.credit.toFixed(2) : '-'}</td><td class="p-3 border-b text-right font-extrabold text-slate-800">${getCurrencySymbol()}${bal.toFixed(2)}</td></tr>`;
  });
  document.getElementById('hubFinalBal').textContent = getCurrencySymbol() + bal.toLocaleString('en-IN', { minimumFractionDigits: 2 });
}

// ==========================================
// MASTER DATA
// ==========================================
const _cf = (id) => (document.getElementById(id)?.value || '').trim();
const _setCf = (id, v) => { const el = document.getElementById(id); if (el) el.value = v ?? ''; };

export function openClientModal(editId) {
  const c = editId ? state.clients.find(x => x.id === editId) : null;
  _setCf('modalClientId', c ? c.id : '');
  _setCf('modalClientName', c ? c.name : '');
  _setCf('modalClientContact', c ? c.contact : '');
  _setCf('modalClientPhone', c ? c.phone : '');
  _setCf('modalClientEmail', c ? c.email : '');
  _setCf('modalClientGst', c ? c.gst : '');
  _setCf('modalClientPan', c ? c.pan : '');
  _setCf('modalClientAddr', c ? c.address : '');
  const slot = document.getElementById('clientRulesSlot');
  if (slot) slot.innerHTML = rulesBlockHTML('modalClient', {
    terms: c ? c.paymentTermsDays : '', tds: c ? c.defaultTdsRate : '', ret: c ? c.defaultRetentionRate : '',
    credit: c ? c.creditLimit : '', showCredit: true, required: !c,
  });
  const t = document.getElementById('clientModalTitle'); if (t) t.textContent = c ? 'Edit client' : 'Add client';
  const sub = document.getElementById('clientModalSub'); if (sub) sub.textContent = c ? (c.name || '') : 'Who you bill, and the rules every bill follows';
  const sv = document.getElementById('clientModalSave'); if (sv) sv.textContent = c ? 'Save changes' : 'Save client';
  document.getElementById('clientModal').classList.remove('hidden');
  document.body.classList.add('clf-open');
  setTimeout(() => { if (!c) document.getElementById('modalClientName')?.focus(); }, 60);
}
export function closeClientModal() {
  document.getElementById('clientModal')?.classList.add('hidden');
  document.body.classList.remove('clf-open');
}
window.closeClientModal = closeClientModal;
/** A GSTIN carries the PAN (characters 3–12) — fill PAN when it is still empty. */
window._cmGstPan = () => {
  const g = (document.getElementById('modalClientGst')?.value || '').trim().toUpperCase(), pan = document.getElementById('modalClientPan');
  if (pan && !pan.value.trim() && /^\d{2}[A-Z]{5}\d{4}[A-Z]/.test(g)) pan.value = g.slice(2, 12);
};
document.addEventListener('keydown', e => { if (e.key === 'Escape' && !document.getElementById('clientModal')?.classList.contains('hidden')) closeClientModal(); });

export function saveClient() {
  const name = _cf('modalClientName');
  if (!name) { showToast('Client name is required', 'error'); return; }
  const editId = _cf('modalClientId');
  const termsRaw = (_cf('modalClientTerms') || '').toString().trim();
  // New clients need terms — they date every RA bill / invoice receipt in the cash-flow forecast.
  if (termsRaw === '' && !editId) { document.getElementById('modalClientTerms')?.focus(); showToast('Set payment terms — pick Immediate, Net 15, Net 30 …', 'error'); return; }
  const paymentTermsDays = termsRaw === '' ? null : Math.max(0, parseInt(termsRaw) || 0);
  const creditLimit = parseFloat(_cf('modalClientCreditLimit')) || 0;
  const rules = readRules('modalClient');
  if ((rules.defaultTdsRate || 0) > 20 || (rules.defaultRetentionRate || 0) > 50) { showToast('TDS or retention % looks too high — check the rules', 'error'); return; }
  const data = {
    name,
    contact: _cf('modalClientContact'), phone: _cf('modalClientPhone'), email: _cf('modalClientEmail'),
    gst: _cf('modalClientGst').toUpperCase(), pan: _cf('modalClientPan').toUpperCase(), address: _cf('modalClientAddr'),
    paymentTermsDays, creditLimit,
    defaultTdsRate: rules.defaultTdsRate, defaultRetentionRate: rules.defaultRetentionRate,
  };
  let createdRec = null;
  if (editId) {
    const c = state.clients.find(x => x.id === editId);
    if (c) {
      // Record a change-of-terms entry if the credit days actually changed.
      const prev = c.paymentTermsDays;
      if (paymentTermsDays != null && prev != null && paymentTermsDays !== prev) {
        const reason = (typeof window !== 'undefined' && window.prompt)
          ? (window.prompt(`Payment terms changing from ${prev} to ${paymentTermsDays} days. Reason? (optional)`, '') || '')
          : '';
        if (!Array.isArray(c.termsHistory)) c.termsHistory = [];
        c.termsHistory.push({ date: new Date().toISOString(), from: prev, to: paymentTermsDays, reason });
        data.termsHistory = c.termsHistory;
      }
      Object.assign(c, data);
      window.stampUpdate(c);
      // Propagate the (possibly renamed) client name to their sale invoices'
      // denormalized clientName, and re-attach any project-orphaned invoices.
      if (typeof window.relinkOrphanedSaleClients === 'function') {
        try { window.relinkOrphanedSaleClients(); } catch {}
      }
    }
  } else {
    createdRec = { id: 'c_' + Date.now(), ...data, createdAt: new Date().toISOString() };
    if (paymentTermsDays != null) createdRec.termsHistory = [{ date: createdRec.createdAt, from: null, to: paymentTermsDays, reason: 'Initial terms at registration' }];
    window.stampCreate(createdRec);
    state.clients.push(createdRec);
  }
  saveAllData();
  closeClientModal();
  populateDropdowns();
  if (typeof window.renderProjectsHome === 'function') window.renderProjectsHome();
  renderClientTable();
  showToast(editId ? 'Client updated' : 'Client added', 'success');
  if (createdRec && typeof window._applyPendingPartySelect === 'function') window._applyPendingPartySelect(createdRec);
  if (typeof window.renderPartiesList === 'function' && document.getElementById('partyRoot')) window.renderPartiesList();
}

/** Initials for a client avatar (first letters of up to two words). */
function _ciInitials(name) {
  const p = String(name || '').trim().split(/\s+/);
  return (((p[0] || '')[0] || '') + ((p[1] || '')[0] || (p[0] || '')[1] || '')).toUpperCase() || '?';
}
function _ciEsc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }

export function renderClientTable() {
  const tbody = document.getElementById('clientTableBody');
  if (!tbody) return;
  const fmt = v => (v != null && v !== '' && !isNaN(v)) ? v : null;
  tbody.innerHTML = (state.clients || []).map(c => {
    const projCount = (state.projects || []).filter(p => p.clientId === c.id).length;
    const terms = c.paymentTermsDays != null ? `${c.paymentTermsDays}d` : '—';
    const tds = fmt(c.defaultTdsRate) != null ? `${c.defaultTdsRate}%` : '—';
    const ret = fmt(c.defaultRetentionRate) != null ? `${c.defaultRetentionRate}%` : '—';
    return `<tr><td colspan="3" style="padding:6px 0;border:none;">
      <div class="tsd-ccard">
        <div class="tsd-avatar">${_ciInitials(c.name)}</div>
        <div style="flex:1;min-width:0;">
          <div style="font-weight:800;color:#1f2937;font-size:14.5px;line-height:1.2;">${_ciEsc(c.name)}</div>
          <div style="font-size:12px;color:#94a3b8;margin-top:2px;">${c.contact ? _ciEsc(c.contact) : 'No primary contact'}${projCount ? ` &middot; ${projCount} project${projCount === 1 ? '' : 's'}` : ''}</div>
          <div class="tsd-cmeta">
            <span class="tsd-stat"><span class="lbl">Terms</span><b>${terms}</b></span>
            <span class="tsd-stat"><span class="lbl">TDS</span><b>${tds}</b></span>
            <span class="tsd-stat"><span class="lbl">Retention</span><b>${ret}</b></span>
          </div>
        </div>
        <div style="position:relative;align-self:flex-start;">
          <button class="tsd-kebab" onclick="_tsKebab(this)" aria-label="Actions">&#8942;</button>
          <div class="tsd-menu">
            <button class="tsd-menu-item" onclick="_tsKebabClose();editClient('${c.id}')">&#9998; Edit</button>
            <button class="tsd-menu-item danger" onclick="_tsKebabClose();deleteClient('${c.id}')">&#128465; Delete</button>
          </div>
        </div>
      </div></td></tr>`;
  }).join('') || `<tr><td colspan="3" class="p-8 text-center text-slate-400 text-sm">No clients yet. Click “+ Add Client” to start.</td></tr>`;
}

export function editClient(id) {
  openClientModal(id);
}

export function deleteClient(id) {
  const projCount = (state.projects || []).filter(p => p.clientId === id).length;
  if (projCount) { showToast(`Cannot delete — this client has ${projCount} project${projCount === 1 ? '' : 's'}. Remove or reassign them first.`, 'error'); return; }
  if (confirm('Move this client to the Recycle Bin?')) {
    const _c = (state.clients || []).find(c => c.id === id);
    window.recycleDelete?.('clients', id, 'Client', _c?.name || id);
    populateDropdowns(); renderClientTable();
    if (typeof window.renderProjectsHome === 'function') window.renderProjectsHome();
    showToast('Client moved to Recycle Bin');
  }
}
