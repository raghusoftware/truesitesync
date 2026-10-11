/**
 * ═══════════════════════════════════════════════════════════
 * True Site Sync — Guarantees & Bonds register (GCC / FIDIC)
 * ═══════════════════════════════════════════════════════════
 * Gulf construction runs on bank guarantees: advance-payment guarantee,
 * performance bond (~10% of contract), retention bond, bid/tender bond. The
 * real money-loss risk is an expiry slipping past un-renewed — the bank can
 * be called, or the contractor pays to extend late. This register tracks
 * each instrument's amount and expiry, warns before it lapses, and notifies
 * the owners once when a guarantee enters its 30-day expiry window.
 * ═══════════════════════════════════════════════════════════
 */
import { state, saveAllData } from './state.js';
import { showToast, getCurrencySymbol } from './utils.js';
import { openFormModal, closeFormModal, fsField, FS_INPUT } from './formHelpers.js';

const _esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const _num = n => (Number(n) || 0);
const _uid = () => 'gte_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);

const TYPES = [
  'Advance Payment Guarantee',
  'Performance Bond',
  'Retention Bond',
  'Bid / Tender Bond',
  'Labour Guarantee',
  'Other',
];

/** Days until expiry (negative = already expired). */
function _daysLeft(expiry) {
  if (!expiry) return null;
  const d = Math.ceil((new Date(expiry + 'T00:00:00') - new Date(new Date().toDateString())) / 86400000);
  return isNaN(d) ? null : d;
}
function _statusOf(g) {
  if (g.status === 'Released') return { label: 'Released', color: '#059669', bg: '#ecfdf5' };
  const dl = _daysLeft(g.expiry);
  if (dl == null) return { label: 'Active', color: '#2563eb', bg: '#eff6ff' };
  if (dl < 0) return { label: 'Expired', color: '#dc2626', bg: '#fef2f2' };
  if (dl <= 30) return { label: `Expiring · ${dl}d`, color: '#d97706', bg: '#fffbeb' };
  return { label: 'Active', color: '#2563eb', bg: '#eff6ff' };
}

export function renderGuarantees() {
  const c = document.getElementById('guaranteesContent');
  if (!c) return;
  const cur = getCurrencySymbol();
  const money = n => cur + Math.round(_num(n)).toLocaleString('en-IN');
  const fmtDate = d => { if (!d) return '—'; const dt = new Date(d + 'T00:00:00'); return isNaN(dt) ? d : dt.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }); };
  const list = (state.guarantees || []).slice().sort((a, b) => (a.expiry || '').localeCompare(b.expiry || ''));
  const projById = id => (state.projects || []).find(p => p.id === id);

  const live = list.filter(g => g.status !== 'Released');
  const activeVal = live.reduce((s, g) => s + _num(g.amount), 0);
  const soon = live.filter(g => (_daysLeft(g.expiry) ?? 999) >= 0 && (_daysLeft(g.expiry) ?? 999) <= 30);
  const gone = live.filter(g => (_daysLeft(g.expiry) ?? 1) < 0);
  const expiringSoon = soon.length, expired = gone.length;
  const expVal = soon.reduce((s, g) => s + _num(g.amount), 0);
  const expiredVal = gone.reduce((s, g) => s + _num(g.amount), 0);

  const rows = list.map(g => {
    const proj = projById(g.projectId);
    const dl = _daysLeft(g.expiry);
    const released = g.status === 'Released';
    let chipCls = 'ok', chipLabel = 'Active', leftTxt = '', leftStyle = 'color:var(--dm-ink-3);';
    if (released) { chipCls = 'mut'; chipLabel = 'Released'; leftTxt = 'released'; }
    else if (dl == null) { chipLabel = 'Active'; }
    else if (dl < 0) { chipCls = 'crit'; chipLabel = 'Expired'; leftTxt = `expired ${Math.abs(dl)}d ago`; leftStyle = 'color:var(--dm-crit);font-weight:700;'; }
    else if (dl <= 30) { chipCls = 'warn'; chipLabel = `Expiring · ${dl}d`; leftTxt = `in ${dl} days`; leftStyle = 'color:var(--dm-warn);font-weight:700;'; }
    else { leftTxt = `in ${dl} days`; }
    const search = `${g.type || ''} ${g.ref || ''} ${g.bank || ''} ${g.beneficiary || ''} ${proj?.name || ''}`.toLowerCase();
    return `<tr data-search="${_esc(search)}"${released ? ' style="opacity:.6"' : ''}>
      <td><div class="dm-name">${_esc(g.type || '—')}</div><div class="dm-ref">${_esc(g.ref || '')}</div></td>
      <td>${_esc(g.bank || '—')}<div class="dm-ref">${_esc(g.beneficiary || '')}</div></td>
      <td style="font-size:12px;">${_esc(proj?.name || '—')}</td>
      <td class="num dm-amt tnum">${money(g.amount)}</td>
      <td><div class="dm-two"><span class="tnum" style="color:var(--dm-ink);font-weight:600;">${fmtDate(g.expiry)}</span>${leftTxt ? `<span style="font-size:11px;${leftStyle}">${leftTxt}</span>` : ''}</div></td>
      <td><span class="dm-chip ${chipCls}"><span class="dot"></span>${chipLabel}</span></td>
      <td class="num"><span class="dm-rowact">
        <button class="dm-iact" title="Edit" onclick="window._gteOpenForm('${g.id}')">✎</button>
        ${released ? '' : `<button class="dm-iact" title="Record release" onclick="window._gteRelease('${g.id}')">↩</button>`}
        <button class="dm-iact" title="Delete" onclick="window._gteDelete('${g.id}')">🗑</button>
      </span></td>
    </tr>`;
  }).join('');

  c.innerHTML = `
    <div class="dm">
      <div class="dm-bar">
        <div class="dm-lead"><h1>Guarantees &amp; Bonds</h1><span class="dm-sub">Advance-payment, performance, retention &amp; tender bonds — tracked to expiry</span></div>
        <button class="dm-btn dm-btn-primary" onclick="window._gteOpenForm()">+ New guarantee</button>
      </div>
      <div class="dm-kpis">
        <div class="dm-kpi"><span class="dm-rail"></span><div class="dm-cap">Active value</div><div class="dm-val tnum">${money(activeVal)}</div><div class="dm-meta">${live.length} live guarantee${live.length === 1 ? '' : 's'}</div></div>
        <div class="dm-kpi ${expiringSoon ? 'attn' : ''}"><span class="dm-rail"></span><div class="dm-cap">⚠ Expiring ≤ 30 days</div><div class="dm-val tnum">${expiringSoon}</div><div class="dm-meta">${expiringSoon ? money(expVal) + ' — renew or release' : 'nothing due soon'}</div></div>
        <div class="dm-kpi ${expired ? 'danger' : ''}"><span class="dm-rail"></span><div class="dm-cap">Expired</div><div class="dm-val tnum">${expired}</div><div class="dm-meta">${expired ? money(expiredVal) + ' — action overdue' : 'none expired'}</div></div>
      </div>
      <div class="dm-panel">
        <div class="dm-panel-head">
          <h2>🏦 All guarantees <span style="color:var(--dm-ink-3);font-weight:700;">· ${list.length}</span></h2>
          ${list.length ? `<div class="dm-tools"><span class="dm-search">🔎<input placeholder="Search bank, ref…" oninput="window._gteFilter(this.value)"></span></div>` : ''}
        </div>
        ${list.length ? `<div class="dm-tscroll"><table class="dm-table">
          <thead><tr><th>Guarantee</th><th>Bank / Beneficiary</th><th>Project</th><th class="num">Amount</th><th>Expiry</th><th>Status</th><th class="num"></th></tr></thead>
          <tbody id="gteRows">${rows}</tbody></table></div>`
        : `<div class="dm-empty"><div class="ico">🏦</div><h3>No guarantees yet</h3><p>Track every bank guarantee and bond here — and get a reminder 30 days before each one expires, so none ever lapses un-renewed.</p><button class="dm-btn dm-btn-primary" onclick="window._gteOpenForm()">+ Add your first guarantee</button></div>`}
      </div>
    </div>`;
}

/** Filter the table rows in place (keeps input focus). */
window._gteFilter = function (term) {
  const q = (term || '').trim().toLowerCase();
  document.querySelectorAll('#gteRows tr[data-search]').forEach(tr => {
    tr.style.display = !q || (tr.dataset.search || '').includes(q) ? '' : 'none';
  });
};
window.renderGuarantees = renderGuarantees;

/** Open the add/edit guarantee modal. */
window._gteOpenForm = function (id) {
  const g = (state.guarantees || []).find(x => x.id === id) || {};
  const cur = getCurrencySymbol().trim();
  const projOpts = ['<option value="">— No project —</option>']
    .concat((state.projects || []).map(p => `<option value="${p.id}" ${g.projectId === p.id ? 'selected' : ''}>${_esc(p.name)}</option>`)).join('');
  const typeOpts = TYPES.map(t => `<option value="${t}" ${g.type === t ? 'selected' : ''}>${t}</option>`).join('');
  const body =
    `<div class="dm-grp"><span class="dm-glabel">Guarantee</span>` +
      fsField('Type', `<select id="gteType" style="${FS_INPUT}">${typeOpts}</select>`, { req: true }) +
      fsField('Reference no.', `<input id="gteRef" style="${FS_INPUT}" value="${_esc(g.ref || '')}" placeholder="e.g. APG-7731">`) +
      fsField('Project', `<select id="gteProject" style="${FS_INPUT}">${projOpts}</select>`) +
    `</div>` +
    `<div class="dm-grp"><span class="dm-glabel">Banking</span>` +
      fsField('Issuing bank', `<input id="gteBank" style="${FS_INPUT}" value="${_esc(g.bank || '')}" placeholder="e.g. Emirates NBD">`) +
      fsField('Beneficiary', `<input id="gteBen" style="${FS_INPUT}" value="${_esc(g.beneficiary || '')}" placeholder="Employer / client">`) +
    `</div>` +
    `<div class="dm-grp"><span class="dm-glabel">Amount &amp; validity</span>` +
      fsField(`Amount (${cur})`, `<input id="gteAmount" type="number" step="any" style="${FS_INPUT}" value="${g.amount != null ? g.amount : ''}" placeholder="0">`, { req: true }) +
      `<div style="display:grid;grid-template-columns:1fr 1fr;gap:11px;">` +
        fsField('Issue date', `<input id="gteIssue" type="date" style="${FS_INPUT}" value="${g.issue || ''}">`) +
        fsField('Expiry date', `<input id="gteExpiry" type="date" style="${FS_INPUT}" value="${g.expiry || ''}">`, { req: true }) +
      `</div>` +
    `</div>`;
  openFormModal(id ? 'Edit guarantee' : 'New guarantee', body, { onSave: `window._gteSaveForm('${id || ''}')`, saveLabel: id ? 'Save changes' : 'Add guarantee', grid: 1 });
};

/** Save the add/edit guarantee modal. */
window._gteSaveForm = function (id) {
  const existing = (state.guarantees || []).find(x => x.id === id);
  const g = existing || { id: _uid(), status: 'Active', createdAt: Date.now() };
  g.type = document.getElementById('gteType')?.value || 'Other';
  g.ref = (document.getElementById('gteRef')?.value || '').trim();
  g.bank = (document.getElementById('gteBank')?.value || '').trim();
  g.beneficiary = (document.getElementById('gteBen')?.value || '').trim();
  g.projectId = document.getElementById('gteProject')?.value || '';
  g.amount = _num(document.getElementById('gteAmount')?.value);
  g.issue = document.getElementById('gteIssue')?.value || '';
  g.expiry = document.getElementById('gteExpiry')?.value || '';
  if (!g.amount) { showToast('Enter the guarantee amount', 'warning'); return; }
  if (!g.expiry) { showToast('Enter the expiry date', 'warning'); return; }
  if (!Array.isArray(state.guarantees)) state.guarantees = [];
  if (!existing) { g._notified30 = false; state.guarantees.push(g); }
  saveAllData();
  closeFormModal();
  renderGuarantees();
  showToast(existing ? 'Guarantee updated' : 'Guarantee added', 'success');
};

/** @deprecated kept for safety; superseded by the modal flow. */
window._gteAdd = function () {
  const g = {
    id: _uid(),
    type: document.getElementById('gteType')?.value || 'Other',
    ref: (document.getElementById('gteRef')?.value || '').trim(),
    bank: (document.getElementById('gteBank')?.value || '').trim(),
    beneficiary: (document.getElementById('gteBen')?.value || '').trim(),
    projectId: document.getElementById('gteProject')?.value || '',
    amount: _num(document.getElementById('gteAmount')?.value),
    issue: document.getElementById('gteIssue')?.value || '',
    expiry: document.getElementById('gteExpiry')?.value || '',
    status: 'Active', createdAt: Date.now(),
  };
  if (!g.amount) { showToast('Enter the guarantee amount', 'warning'); return; }
  if (!g.expiry) { showToast('Enter the expiry date', 'warning'); return; }
  if (!Array.isArray(state.guarantees)) state.guarantees = [];
  state.guarantees.push(g);
  saveAllData();
  renderGuarantees();
  showToast('Guarantee added', 'success');
};

window._gteRelease = function (id) {
  const g = (state.guarantees || []).find(x => x.id === id);
  if (!g) return;
  if (!confirm(`Mark ${g.type} (${g.ref || '—'}) as released?`)) return;
  g.status = 'Released'; g.releasedAt = Date.now();
  saveAllData(); renderGuarantees();
  showToast('Guarantee released', 'info');
};

window._gteDelete = function (id) {
  const g = (state.guarantees || []).find(x => x.id === id);
  if (!g) return;
  if (!confirm('Delete this guarantee record?')) return;
  if (window.recycleDelete) window.recycleDelete('guarantees', id, 'Guarantee');
  else state.guarantees = (state.guarantees || []).filter(x => x.id !== id);
  saveAllData(); renderGuarantees();
  showToast('Guarantee deleted', 'info');
};

/** Notify owners once when a guarantee enters its 30-day expiry window. */
export function checkGuaranteeExpiry() {
  try {
    let changed = false;
    (state.guarantees || []).forEach(g => {
      if (g.status === 'Released' || g._notified30) return;
      const dl = _daysLeft(g.expiry);
      if (dl != null && dl >= 0 && dl <= 30) {
        g._notified30 = true; changed = true;
        try {
          window.notifyOwners && window.notifyOwners({
            type: 'guarantee', title: `Guarantee expiring in ${dl} day${dl === 1 ? '' : 's'}`,
            body: `${g.type} ${g.ref ? '(' + g.ref + ')' : ''} — ${getCurrencySymbol()}${Math.round(_num(g.amount)).toLocaleString('en-IN')} expires ${g.expiry}. Renew or release it.`,
            data: { view: 'guaranteesView' },
          });
        } catch {}
      }
    });
    if (changed) saveAllData();
  } catch (e) { console.warn('[guarantees] expiry check skipped:', e && e.message); }
}
window.checkGuaranteeExpiry = checkGuaranteeExpiry;
