/**
 * ═══════════════════════════════════════════════════════════
 * True Site Sync — WPS (Wage Protection System) — UAE
 * ═══════════════════════════════════════════════════════════
 * UAE law requires private-sector wages to be paid through the Wage
 * Protection System: each cycle the employer uploads a Salary Information
 * File (.SIF) to its bank / exchange house. The SIF is a comma-separated
 * text file — one SCR (Salary Control Record) control line followed by one
 * EDR (Employee Detail Record) per worker.
 *
 * This module lets a UAE contractor keep each worker's WPS banking details
 * (IBAN, labour-card / MOHRE person ID, bank routing code), enter the pay
 * for a month, and export a bank-ready .SIF — straight from the people
 * already in Labour & Staff.
 *
 * NOTE: the exact SIF column order varies slightly between banks and
 * exchange houses. This builds the standard CBUAE layout; the screen tells
 * the user to confirm it against their bank's template.
 * ═══════════════════════════════════════════════════════════
 */
import { state, saveAllData } from './state.js';
import { showToast, mobileDownloadBlob } from './utils.js';
import { openFormModal, closeFormModal, fsField, FS_INPUT } from './formHelpers.js';

const _esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const _num = n => (Number(n) || 0);
const _pad2 = n => String(n).padStart(2, '0');

/** All payable people: site labour + staff, tagged by source array. */
function _workers() {
  const out = [];
  (state.labourMaster || []).forEach(w => out.push({ ...w, _src: 'labourMaster' }));
  (state.staffMaster || []).forEach(w => out.push({ ...w, _src: 'staffMaster' }));
  return out.filter(w => w && (w.active !== false));
}

function _wpsCfg() { return state.wpsSettings || (state.wpsSettings = {}); }

/** Current salary month, YYYY-MM, defaulting to the previous month (WPS pays arrears). */
function _defaultMonth() {
  const d = new Date(); d.setMonth(d.getMonth() - 1);
  return d.getFullYear() + '-' + _pad2(d.getMonth() + 1);
}

export function renderWPS() {
  const c = document.getElementById('wpsContent');
  if (!c) return;
  const cfg = _wpsCfg();
  const month = cfg._month || _defaultMonth();
  const workers = _workers();

  const inp = 'border:1px solid var(--dm-line-strong);background:#fff;border-radius:8px;padding:7px 8px;font-size:12px;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;outline:none;';
  const bad = 'border-color:var(--dm-crit);background:var(--dm-crit-soft);';
  const rows = workers.map(w => {
    const b = w.wps || {};
    const ibanOk = /^AE\d{21}$/.test(String(b.iban || '').replace(/\s/g, ''));
    const cardOk = /^\d{14}$/.test(String(b.cardNo || ''));
    return `<tr data-id="${w.id}" data-src="${w._src}">
      <td style="font-weight:800;color:var(--dm-ink);white-space:nowrap;">${_esc(w.name || '—')}<div class="dm-ref">${w._src === 'staffMaster' ? 'Staff' : 'Labour'}</div></td>
      <td><input class="wps-card" value="${_esc(b.cardNo || '')}" placeholder="14-digit" maxlength="14" style="${inp}width:126px;${b.cardNo && !cardOk ? bad : ''}"></td>
      <td><input class="wps-iban" value="${_esc(b.iban || '')}" placeholder="AE………" maxlength="23" style="${inp}width:212px;text-transform:uppercase;${b.iban && !ibanOk ? bad : ''}"></td>
      <td><input class="wps-routing" value="${_esc(b.routing || '')}" placeholder="9-digit" maxlength="9" style="${inp}width:92px;"></td>
      <td class="num"><input class="wps-days" type="number" min="0" max="31" value="${b.days != null ? b.days : 30}" style="${inp}width:56px;text-align:right;"></td>
      <td class="num"><input class="wps-fixed" type="number" min="0" value="${b.fixed != null ? b.fixed : (w.wageMode === 'monthly' ? _num(w.rate) : '')}" style="${inp}width:98px;text-align:right;"></td>
      <td class="num"><input class="wps-variable" type="number" min="0" value="${b.variable != null ? b.variable : ''}" placeholder="0" style="${inp}width:90px;text-align:right;"></td>
    </tr>`;
  }).join('');

  const runs = (state.wpsRuns || []).slice(-6).reverse().map(r =>
    `<div style="display:flex;justify-content:space-between;gap:10px;padding:10px 16px;border-bottom:1px solid var(--dm-line);font-size:12.5px;">
      <span style="font-weight:800;color:var(--dm-ink);">${r.month}</span>
      <span style="color:var(--dm-ink-2);" class="tnum">${r.count} workers · AED ${_num(r.total).toLocaleString('en-AE')}</span>
      <span style="color:var(--dm-ink-3);" class="tnum">${new Date(r.at).toLocaleDateString('en-GB')}</span>
    </div>`).join('') || '<div style="padding:18px;text-align:center;color:var(--dm-ink-3);font-size:12.5px;">No files generated yet.</div>';

  c.innerHTML = `
    <div class="dm">
      <div class="dm-bar">
        <div class="dm-lead"><h1>WPS Salary</h1><span class="dm-sub">Bank-ready <b>.SIF</b> for UAE payroll — confirm the exact layout with your bank</span></div>
        <button class="dm-btn dm-btn-primary" onclick="window._wpsGenerate()">⬇ Generate .SIF</button>
      </div>

      <div style="display:flex;flex-wrap:wrap;gap:12px;align-items:center;justify-content:space-between;background:var(--dm-surface);border:1px solid var(--dm-line);border-radius:14px;padding:11px 16px;margin-bottom:16px;box-shadow:var(--dm-shadow);">
        <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;">
          <label style="font-size:12px;font-weight:700;color:var(--dm-ink-2);">Salary month</label>
          <input id="wpsMonth" type="month" value="${month}" style="border:1px solid var(--dm-line-strong);border-radius:8px;padding:7px 10px;font-size:13px;background:#fff;">
          ${cfg.employerId && cfg.routingCode
            ? `<span class="dm-chip ok"><span class="dot"></span>Employer configured</span>`
            : `<span class="dm-chip warn"><span class="dot"></span>Set employer details</span>`}
        </div>
        <button class="dm-btn dm-btn-ghost dm-btn-sm" onclick="window._wpsOpenSettings()">⚙ Employer &amp; bank details</button>
      </div>

      <div class="dm-panel">
        <div class="dm-panel-head">
          <h2>Workers &amp; pay · ${month}</h2>
          <div class="dm-tools"><span style="font-size:11px;color:var(--dm-ink-3);">${workers.length} ${workers.length === 1 ? 'person' : 'people'}</span>
            <button class="dm-btn dm-btn-ghost dm-btn-sm" onclick="window._wpsSave()">Save</button></div>
        </div>
        ${workers.length ? `<div class="dm-tscroll"><table class="dm-table">
          <thead><tr><th>Worker</th><th>Labour card</th><th>IBAN</th><th>Routing</th><th class="num">Days</th><th class="num">Fixed</th><th class="num">Variable</th></tr></thead>
          <tbody id="wpsRows">${rows}</tbody></table></div>`
        : `<div class="dm-empty"><div class="ico">💳</div><h3>No workers yet</h3><p>Add your people in Labour &amp; Staff first — they'll appear here to receive their WPS salary.</p></div>`}
      </div>

      <div class="dm-panel">
        <div class="dm-panel-head"><h2>Recent files</h2></div>
        <div>${runs}</div>
      </div>
    </div>`;
}
window.renderWPS = renderWPS;

/** Read the on-screen worker rows back into the worker records. */
function _collectRows() {
  const map = {};
  document.querySelectorAll('#wpsRows tr[data-id]').forEach(tr => {
    const id = tr.dataset.id, src = tr.dataset.src;
    const g = sel => tr.querySelector(sel);
    map[id] = {
      src,
      cardNo: (g('.wps-card')?.value || '').trim(),
      iban: (g('.wps-iban')?.value || '').trim().toUpperCase().replace(/\s/g, ''),
      routing: (g('.wps-routing')?.value || '').trim(),
      days: _num(g('.wps-days')?.value),
      fixed: _num(g('.wps-fixed')?.value),
      variable: _num(g('.wps-variable')?.value),
    };
  });
  return map;
}

/** Persist worker WPS banking/pay onto the underlying labourMaster/staffMaster records. */
function _persistRows(map) {
  Object.entries(map).forEach(([id, v]) => {
    const arr = state[v.src] || [];
    const rec = arr.find(x => x.id === id);
    if (rec) rec.wps = { cardNo: v.cardNo, iban: v.iban, routing: v.routing, days: v.days, fixed: v.fixed, variable: v.variable };
  });
}

/** Employer / bank details modal (set-once master config). */
window._wpsOpenSettings = function () {
  const cfg = _wpsCfg();
  const body =
    fsField('Employer ID (MOHRE, 13-digit)', `<input id="wpsEmpId" maxlength="13" style="${FS_INPUT}font-family:monospace;" value="${_esc(cfg.employerId || '')}" placeholder="e.g. 1234567890123">`, { req: true, span: true }) +
    fsField('Employer bank routing (9-digit)', `<input id="wpsEmpRouting" maxlength="9" style="${FS_INPUT}font-family:monospace;" value="${_esc(cfg.routingCode || '')}" placeholder="e.g. 302240123">`, { req: true, span: true }) +
    `<p style="grid-column:1/-1;font-size:11px;color:#94a3b8;margin:0;">These come from your bank / exchange-house WPS enrolment. Confirm the exact SIF layout with them — formats vary slightly.</p>`;
  openFormModal('Employer & bank details', body, { onSave: 'window._wpsSaveEmployer()', saveLabel: 'Save details' });
};
window._wpsSaveEmployer = function () {
  const cfg = _wpsCfg();
  cfg.employerId = (document.getElementById('wpsEmpId')?.value || '').trim();
  cfg.routingCode = (document.getElementById('wpsEmpRouting')?.value || '').trim();
  saveAllData(); closeFormModal(); renderWPS();
  showToast('Employer details saved', 'success');
};

window._wpsSave = function () {
  const cfg = _wpsCfg();
  cfg._month = document.getElementById('wpsMonth')?.value || _defaultMonth();
  _persistRows(_collectRows());
  saveAllData();
  showToast('Saved', 'success');
};

window._wpsGenerate = function () {
  const cfg = _wpsCfg();
  const employerId = (cfg.employerId || '').trim();
  const routingCode = (cfg.routingCode || '').trim();
  const month = document.getElementById('wpsMonth')?.value || _defaultMonth(); // YYYY-MM
  cfg._month = month;

  if (!/^\d{13}$/.test(employerId)) { showToast('Enter a valid 13-digit employer (MOHRE) ID', 'warning'); return; }
  if (!/^\d{9}$/.test(routingCode)) { showToast('Enter a valid 9-digit employer bank routing code', 'warning'); return; }

  const map = _collectRows();
  _persistRows(map);

  const [yy, mm] = month.split('-');
  const lastDay = new Date(Number(yy), Number(mm), 0).getDate();
  const payStart = `${yy}-${mm}-01`;
  const payEnd = `${yy}-${mm}-${_pad2(lastDay)}`;
  const mmYYYY = `${mm}${yy}`;

  const edrs = [];
  const problems = [];
  let total = 0;
  _workers().forEach(w => {
    const v = map[w.id]; if (!v) return;
    const pay = _num(v.fixed) + _num(v.variable);
    if (pay <= 0) return; // skip unpaid this cycle
    const iban = (v.iban || '').replace(/\s/g, '').toUpperCase();
    if (!/^AE\d{21}$/.test(iban)) problems.push(`${w.name}: IBAN must be AE + 21 digits`);
    if (!/^\d{14}$/.test(v.cardNo || '')) problems.push(`${w.name}: labour card must be 14 digits`);
    if (!/^\d{9}$/.test(v.routing || '')) problems.push(`${w.name}: routing must be 9 digits`);
    total += pay;
    // EDR,PersonID,AgentRouting,IBAN,PayStart,PayEnd,Days,Fixed,Variable
    edrs.push(['EDR', v.cardNo, v.routing, iban, payStart, payEnd, _num(v.days), _num(v.fixed).toFixed(2), _num(v.variable).toFixed(2)].join(','));
  });

  if (!edrs.length) { showToast('No workers with pay to include', 'warning'); return; }
  if (problems.length) {
    const ok = confirm('Some records look invalid:\n\n' + problems.slice(0, 8).join('\n') + (problems.length > 8 ? `\n…and ${problems.length - 8} more` : '') + '\n\nGenerate the file anyway?');
    if (!ok) { saveAllData(); renderWPS(); return; }
  }

  const now = new Date();
  const dateStr = `${now.getFullYear()}-${_pad2(now.getMonth() + 1)}-${_pad2(now.getDate())}`;
  const timeStr = `${_pad2(now.getHours())}${_pad2(now.getMinutes())}`;
  // SCR,EmployerID,EmployerRouting,CreationDate,CreationTime,SalaryMonth(MMYYYY),RecordCount,TotalSalary,Currency
  const scr = ['SCR', employerId, routingCode, dateStr, timeStr, mmYYYY, edrs.length, total.toFixed(2), 'AED'].join(',');
  const content = [scr, ...edrs].join('\r\n') + '\r\n';

  const ts = `${String(now.getFullYear()).slice(2)}${_pad2(now.getMonth() + 1)}${_pad2(now.getDate())}${_pad2(now.getHours())}${_pad2(now.getMinutes())}${_pad2(now.getSeconds())}`;
  const filename = `${employerId}${ts}.SIF`;
  try {
    const blob = new Blob([content], { type: 'text/plain' });
    mobileDownloadBlob(blob, filename, 'text/plain');
  } catch (e) { showToast('Download failed: ' + (e.message || e), 'error'); return; }

  if (!Array.isArray(state.wpsRuns)) state.wpsRuns = [];
  state.wpsRuns.push({ month, count: edrs.length, total, at: Date.now(), file: filename });
  saveAllData();
  renderWPS();
  showToast(`SIF generated · ${edrs.length} workers · AED ${total.toLocaleString('en-AE')}`, 'success');
};
