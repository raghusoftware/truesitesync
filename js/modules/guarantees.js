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
  const list = (state.guarantees || []).slice().sort((a, b) => (a.expiry || '').localeCompare(b.expiry || ''));
  const projById = id => (state.projects || []).find(p => p.id === id);

  const activeVal = list.filter(g => g.status !== 'Released').reduce((s, g) => s + _num(g.amount), 0);
  const expiringSoon = list.filter(g => g.status !== 'Released' && (_daysLeft(g.expiry) ?? 999) >= 0 && (_daysLeft(g.expiry) ?? 999) <= 30).length;
  const expired = list.filter(g => g.status !== 'Released' && (_daysLeft(g.expiry) ?? 1) < 0).length;

  const rows = list.map(g => {
    const st = _statusOf(g);
    const proj = projById(g.projectId);
    return `<tr style="border-bottom:1px solid #f1f5f9;">
      <td style="padding:8px 10px;font-weight:700;color:#0f172a;">${_esc(g.type || '—')}<div style="font-size:10px;color:#94a3b8;font-weight:500;">${_esc(g.ref || '')}</div></td>
      <td style="padding:8px 10px;color:#475569;">${_esc(g.bank || '—')}<div style="font-size:10px;color:#94a3b8;">${_esc(g.beneficiary || '')}</div></td>
      <td style="padding:8px 10px;color:#64748b;font-size:11px;">${_esc(proj?.name || '—')}</td>
      <td style="padding:8px 10px;text-align:right;font-weight:800;color:#0f172a;white-space:nowrap;">${cur}${Math.round(_num(g.amount)).toLocaleString('en-IN')}</td>
      <td style="padding:8px 10px;text-align:center;color:#64748b;font-size:11px;white-space:nowrap;">${g.expiry || '—'}</td>
      <td style="padding:8px 10px;text-align:center;"><span style="font-size:10px;font-weight:800;color:${st.color};background:${st.bg};padding:3px 8px;border-radius:9999px;white-space:nowrap;">${st.label}</span></td>
      <td style="padding:8px 10px;text-align:center;white-space:nowrap;">
        ${g.status !== 'Released' ? `<button onclick="window._gteRelease('${g.id}')" class="text-[11px] font-bold text-emerald-700 hover:bg-emerald-50 border border-emerald-200 rounded px-2 py-1 mr-1">Release</button>` : ''}
        <button onclick="window._gteDelete('${g.id}')" class="text-[11px] font-bold text-red-500 hover:bg-red-50 rounded px-2 py-1">Delete</button>
      </td>
    </tr>`;
  }).join('') || '<tr><td colspan="7" style="padding:26px;text-align:center;color:#94a3b8;">No guarantees yet. Add your first bond below.</td></tr>';

  const projOpts = (state.projects || []).map(p => `<option value="${p.id}">${_esc(p.name)}</option>`).join('');
  const typeOpts = TYPES.map(t => `<option value="${t}">${t}</option>`).join('');

  c.innerHTML = `
    <div style="max-width:1120px;margin:0 auto;">
      <div style="display:flex;gap:12px;flex-wrap:wrap;margin-bottom:16px;">
        <div style="flex:1;min-width:160px;background:#fff;border:1px solid #e2e8f0;border-radius:12px;padding:14px 16px;">
          <div style="font-size:11px;font-weight:700;color:#94a3b8;text-transform:uppercase;">Active value</div>
          <div style="font-size:20px;font-weight:900;color:#0f172a;">${cur}${Math.round(activeVal).toLocaleString('en-IN')}</div></div>
        <div style="flex:1;min-width:160px;background:#fffbeb;border:1px solid #fde68a;border-radius:12px;padding:14px 16px;">
          <div style="font-size:11px;font-weight:700;color:#b45309;text-transform:uppercase;">Expiring ≤30 days</div>
          <div style="font-size:20px;font-weight:900;color:#d97706;">${expiringSoon}</div></div>
        <div style="flex:1;min-width:160px;background:${expired ? '#fef2f2' : '#fff'};border:1px solid ${expired ? '#fecaca' : '#e2e8f0'};border-radius:12px;padding:14px 16px;">
          <div style="font-size:11px;font-weight:700;color:${expired ? '#b91c1c' : '#94a3b8'};text-transform:uppercase;">Expired</div>
          <div style="font-size:20px;font-weight:900;color:${expired ? '#dc2626' : '#0f172a'};">${expired}</div></div>
      </div>

      <div style="background:#fff;border:1px solid #e2e8f0;border-radius:14px;overflow:hidden;margin-bottom:16px;">
        <div style="padding:12px 16px;border-bottom:1px solid #f1f5f9;font-weight:800;color:#0f172a;font-size:13px;">🏦 Guarantees &amp; Bonds</div>
        <div style="overflow-x:auto;"><table style="width:100%;border-collapse:collapse;font-size:12px;">
          <thead style="background:#f8fafc;"><tr style="text-align:left;color:#64748b;font-size:10px;text-transform:uppercase;font-weight:800;">
            <th style="padding:8px 10px;">Type / Ref</th><th style="padding:8px 10px;">Bank / Beneficiary</th><th style="padding:8px 10px;">Project</th>
            <th style="padding:8px 10px;text-align:right;">Amount</th><th style="padding:8px 10px;text-align:center;">Expiry</th><th style="padding:8px 10px;text-align:center;">Status</th><th style="padding:8px 10px;text-align:center;">Action</th>
          </tr></thead><tbody>${rows}</tbody></table></div>
      </div>

      <div style="background:#fff;border:1px solid #e2e8f0;border-radius:14px;padding:16px;">
        <div style="font-weight:800;color:#0f172a;font-size:13px;margin-bottom:12px;">Add a guarantee / bond</div>
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px;align-items:end;">
          <div><label class="gte-l">Type</label><select id="gteType" class="gte-i">${typeOpts}</select></div>
          <div><label class="gte-l">Reference No.</label><input id="gteRef" class="gte-i" placeholder="LG/APG no."></div>
          <div><label class="gte-l">Issuing bank</label><input id="gteBank" class="gte-i" placeholder="e.g. Emirates NBD"></div>
          <div><label class="gte-l">Beneficiary</label><input id="gteBen" class="gte-i" placeholder="Employer / client"></div>
          <div><label class="gte-l">Project</label><select id="gteProject" class="gte-i"><option value="">—</option>${projOpts}</select></div>
          <div><label class="gte-l">Amount (${cur.trim()})</label><input id="gteAmount" type="number" step="any" class="gte-i" placeholder="0"></div>
          <div><label class="gte-l">Issue date</label><input id="gteIssue" type="date" class="gte-i"></div>
          <div><label class="gte-l">Expiry date</label><input id="gteExpiry" type="date" class="gte-i"></div>
          <div style="align-self:end;"><button onclick="window._gteAdd()" style="width:100%;background:linear-gradient(135deg,#ef8420,#d6402c);color:#fff;border:none;border-radius:8px;padding:9px 14px;font-size:13px;font-weight:800;cursor:pointer;">+ Add</button></div>
        </div>
      </div>
    </div>
    <style>.gte-l{display:block;font-size:11px;font-weight:700;color:#64748b;margin-bottom:3px;}.gte-i{width:100%;border:1px solid #e2e8f0;border-radius:8px;padding:8px 10px;font-size:13px;outline:none;}</style>`;
}
window.renderGuarantees = renderGuarantees;

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
