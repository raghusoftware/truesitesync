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

  const rows = workers.map(w => {
    const b = w.wps || {};
    const ibanOk = /^AE\d{21}$/.test(String(b.iban || '').replace(/\s/g, ''));
    const cardOk = /^\d{14}$/.test(String(b.cardNo || ''));
    return `<tr data-id="${w.id}" data-src="${w._src}" style="border-bottom:1px solid #f1f5f9;">
      <td style="padding:6px 8px;font-weight:700;color:#0f172a;white-space:nowrap;">${_esc(w.name || '—')}</td>
      <td style="padding:6px 8px;"><input class="wps-card" value="${_esc(b.cardNo || '')}" placeholder="14-digit" maxlength="14" style="width:120px;border:1px solid ${b.cardNo && !cardOk ? '#f87171' : '#e2e8f0'};border-radius:6px;padding:5px 7px;font-size:12px;font-family:monospace;"></td>
      <td style="padding:6px 8px;"><input class="wps-iban" value="${_esc(b.iban || '')}" placeholder="AE………" maxlength="23" style="width:200px;border:1px solid ${b.iban && !ibanOk ? '#f87171' : '#e2e8f0'};border-radius:6px;padding:5px 7px;font-size:12px;font-family:monospace;text-transform:uppercase;"></td>
      <td style="padding:6px 8px;"><input class="wps-routing" value="${_esc(b.routing || '')}" placeholder="9-digit" maxlength="9" style="width:90px;border:1px solid #e2e8f0;border-radius:6px;padding:5px 7px;font-size:12px;font-family:monospace;"></td>
      <td style="padding:6px 8px;"><input class="wps-days" type="number" min="0" max="31" value="${b.days != null ? b.days : 30}" style="width:52px;border:1px solid #e2e8f0;border-radius:6px;padding:5px 6px;font-size:12px;text-align:right;"></td>
      <td style="padding:6px 8px;"><input class="wps-fixed" type="number" min="0" value="${b.fixed != null ? b.fixed : (w.wageMode === 'monthly' ? _num(w.rate) : '')}" style="width:90px;border:1px solid #e2e8f0;border-radius:6px;padding:5px 6px;font-size:12px;text-align:right;"></td>
      <td style="padding:6px 8px;"><input class="wps-variable" type="number" min="0" value="${b.variable != null ? b.variable : ''}" placeholder="0" style="width:80px;border:1px solid #e2e8f0;border-radius:6px;padding:5px 6px;font-size:12px;text-align:right;"></td>
    </tr>`;
  }).join('') || '<tr><td colspan="7" style="padding:24px;text-align:center;color:#94a3b8;">No workers yet. Add people in Labour & Staff first.</td></tr>';

  const runs = (state.wpsRuns || []).slice(-6).reverse().map(r =>
    `<div style="display:flex;justify-content:space-between;gap:10px;padding:7px 10px;border-bottom:1px solid #f1f5f9;font-size:12px;">
      <span style="font-weight:700;color:#0f172a;">${r.month}</span>
      <span style="color:#64748b;">${r.count} workers · AED ${_num(r.total).toLocaleString('en-AE')}</span>
      <span style="color:#94a3b8;">${new Date(r.at).toLocaleDateString('en-GB')}</span>
    </div>`).join('') || '<div style="padding:14px;text-align:center;color:#94a3b8;font-size:12px;">No files generated yet.</div>';

  c.innerHTML = `
    <div style="max-width:1100px;margin:0 auto;">
      <div style="background:linear-gradient(135deg,#fff3ea,#ffe9e2);border:1px solid #ffd9c7;border-radius:14px;padding:14px 16px;margin-bottom:16px;">
        <div style="font-weight:800;color:#0f172a;font-size:15px;">💳 Wage Protection System (WPS)</div>
        <p style="font-size:12px;color:#7a2e1a;margin:4px 0 0;">Generate a bank-ready <b>.SIF</b> salary file for your UAE payroll. Confirm the exact column layout with your bank or exchange house — formats vary slightly.</p>
      </div>

      <div style="background:#fff;border:1px solid #e2e8f0;border-radius:14px;padding:16px;margin-bottom:16px;">
        <div style="font-weight:800;color:#0f172a;font-size:13px;margin-bottom:10px;">Employer details</div>
        <div style="display:flex;flex-wrap:wrap;gap:14px;align-items:end;">
          <div><label style="display:block;font-size:11px;font-weight:700;color:#64748b;margin-bottom:3px;">Employer ID (MOHRE, 13-digit)</label>
            <input id="wpsEmpId" value="${_esc(cfg.employerId || '')}" maxlength="13" placeholder="e.g. 1234567890123" style="width:180px;border:1px solid #e2e8f0;border-radius:8px;padding:8px 10px;font-size:13px;font-family:monospace;"></div>
          <div><label style="display:block;font-size:11px;font-weight:700;color:#64748b;margin-bottom:3px;">Employer bank routing (9-digit)</label>
            <input id="wpsEmpRouting" value="${_esc(cfg.routingCode || '')}" maxlength="9" placeholder="e.g. 302240123" style="width:150px;border:1px solid #e2e8f0;border-radius:8px;padding:8px 10px;font-size:13px;font-family:monospace;"></div>
          <div><label style="display:block;font-size:11px;font-weight:700;color:#64748b;margin-bottom:3px;">Salary month</label>
            <input id="wpsMonth" type="month" value="${month}" style="border:1px solid #e2e8f0;border-radius:8px;padding:8px 10px;font-size:13px;"></div>
          <button onclick="window._wpsSave()" style="background:#f8fafc;border:1px solid #e2e8f0;color:#475569;border-radius:8px;padding:8px 14px;font-size:12px;font-weight:700;cursor:pointer;">Save details</button>
        </div>
      </div>

      <div style="background:#fff;border:1px solid #e2e8f0;border-radius:14px;overflow:hidden;margin-bottom:16px;">
        <div style="display:flex;justify-content:space-between;align-items:center;padding:12px 16px;border-bottom:1px solid #f1f5f9;">
          <span style="font-weight:800;color:#0f172a;font-size:13px;">Workers & pay for ${month}</span>
          <span style="font-size:11px;color:#94a3b8;">${workers.length} people</span>
        </div>
        <div style="overflow-x:auto;">
          <table style="width:100%;border-collapse:collapse;font-size:12px;">
            <thead style="background:#f8fafc;"><tr style="text-align:left;color:#64748b;font-size:10px;text-transform:uppercase;font-weight:800;">
              <th style="padding:8px;">Worker</th><th style="padding:8px;">Labour card</th><th style="padding:8px;">IBAN</th>
              <th style="padding:8px;">Routing</th><th style="padding:8px;">Days</th><th style="padding:8px;">Fixed (AED)</th><th style="padding:8px;">Variable (AED)</th>
            </tr></thead>
            <tbody id="wpsRows">${rows}</tbody>
          </table>
        </div>
      </div>

      <div style="display:flex;gap:12px;align-items:center;flex-wrap:wrap;margin-bottom:20px;">
        <button onclick="window._wpsGenerate()" style="background:linear-gradient(135deg,#ef8420,#d6402c);color:#fff;border:none;border-radius:10px;padding:11px 22px;font-size:14px;font-weight:800;cursor:pointer;box-shadow:0 6px 18px rgba(214,64,44,.25);">⬇ Generate .SIF file</button>
        <span style="font-size:11px;color:#94a3b8;">Saves worker details, validates, and downloads the salary file.</span>
      </div>

      <div style="background:#fff;border:1px solid #e2e8f0;border-radius:14px;overflow:hidden;">
        <div style="padding:10px 16px;border-bottom:1px solid #f1f5f9;font-weight:800;color:#0f172a;font-size:12px;">Recent files</div>
        ${runs}
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

window._wpsSave = function () {
  const cfg = _wpsCfg();
  cfg.employerId = (document.getElementById('wpsEmpId')?.value || '').trim();
  cfg.routingCode = (document.getElementById('wpsEmpRouting')?.value || '').trim();
  cfg._month = document.getElementById('wpsMonth')?.value || _defaultMonth();
  _persistRows(_collectRows());
  saveAllData();
  showToast('WPS details saved', 'success');
};

window._wpsGenerate = function () {
  const cfg = _wpsCfg();
  const employerId = (document.getElementById('wpsEmpId')?.value || '').trim();
  const routingCode = (document.getElementById('wpsEmpRouting')?.value || '').trim();
  const month = document.getElementById('wpsMonth')?.value || _defaultMonth(); // YYYY-MM
  cfg.employerId = employerId; cfg.routingCode = routingCode; cfg._month = month;

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
