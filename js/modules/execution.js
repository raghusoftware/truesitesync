/**
 * ═══════════════════════════════════════════════════════════
 * True Site Sync — Site Execution module
 * ═══════════════════════════════════════════════════════════
 * Project-scoped on-site execution hub (app-icon grid) covering:
 *   • Dashboard          • Daily Progress Report (DPR)
 *   • Concrete Pour Card • Milestones
 *   • Quality (cube tests / NCR / inspections)
 *   • Safety (incidents / near-miss / PPE-toolbox)
 * Mirrors the Petty Cash / Issues module pattern. Offline-first.
 * ═══════════════════════════════════════════════════════════
 */

import { state, saveAllData } from './state.js';
import { showToast, mobileSavePDF, mobileSaveXLSX, getCompanyHeaderForPDF } from './utils.js';
import { getCurrentUser } from './rbac.js';
import { uploadExecMedia, signedExecUrl, removeExecMedia, getGps, gpsLabel } from './execMedia.js';

// ── option lists ───────────────────────────────────────────
const POUR_ELEMENTS = ['Footing', 'Column', 'Beam', 'Slab', 'Raft', 'Pile / Pile Cap', 'Retaining Wall', 'Plinth Beam', 'Staircase', 'Pedestal', 'Other'];
const GRADES = ['M10', 'M15', 'M20', 'M25', 'M30', 'M35', 'M40', 'M45', 'M50'];
const QUALITY_TYPES = ['Cube Test', 'NCR', 'Inspection', 'Material Test'];
const SAFETY_TYPES = ['Incident', 'Near Miss', 'PPE / Toolbox', 'Unsafe Condition'];
const SEVERITIES = ['Low', 'Medium', 'High', 'Critical'];
const POUR_CHECKS = [
  ['formwork', 'Formwork checked & oiled'],
  ['reinforcement', 'Reinforcement as per drawing'],
  ['cover', 'Cover blocks placed'],
  ['embedments', 'Embedments / inserts fixed'],
  ['cleaning', 'Surface cleaned & watered'],
  ['level', 'Level & alignment checked'],
];

// ── helpers ────────────────────────────────────────────────
function _pid() { return state.currentProjectId || null; }
function _today() { return new Date().toISOString().split('T')[0]; }
function _esc(s) { return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
function _arr(key) { return (state[key] || []).filter(r => r.projectId === _pid()); }
function _num(v) { return parseFloat(v) || 0; }

// ── cross-module links (Planning tasks / Vendors / BOQ / Pours) ──
function _projTasks() { return (state.planningTasks || []).filter(t => t.projectId === _pid()); }
function _taskName(id) { const t = (state.planningTasks || []).find(x => x.id === id); return t ? (t.name || t.title || 'Task') : ''; }
function _vendors() { return (state.vendors || []); }
function _vendorName(id) { return (state.vendors || []).find(v => v.id === id)?.name || ''; }
function _projBoqItems() {
  const proj = (state.projects || []).find(p => p.id === _pid());
  const out = [];
  if (proj?.boqs?.length) proj.boqs.forEach(g => (g.items || []).forEach((it, i) => out.push({ ref: g.id + ':' + i, label: (it.code ? it.code + ' — ' : '') + (it.description || it.code || 'Item') })));
  else if (proj?.boqItems?.length) proj.boqItems.forEach((it, i) => out.push({ ref: String(i), label: (it.code ? it.code + ' — ' : '') + (it.description || 'Item') }));
  return out;
}
function _boqLabel(ref) { return (_projBoqItems().find(b => b.ref === ref) || {}).label || ''; }
function _pours() { return _arr('concretePours'); }
const _opt = (val, label, cur) => `<option value="${_esc(val)}" ${String(cur) === String(val) ? 'selected' : ''}>${_esc(label)}</option>`;
function _taskSelect(id, cur) { return `<select id="${id}" style="${_inp}"><option value="">— None —</option>${_projTasks().map(t => _opt(t.id, t.name || t.title || 'Task', cur)).join('')}</select>`; }
function _boqSelect(id, cur) { return `<select id="${id}" style="${_inp}"><option value="">— None —</option>${_projBoqItems().map(b => _opt(b.ref, b.label, cur)).join('')}</select>`; }
function _vendorSelect(id, cur) { return `<select id="${id}" style="${_inp}"><option value="">— Select / none —</option>${_vendors().map(v => _opt(v.id, v.name, cur)).join('')}</select>`; }
function _pourSelect(id, cur) { return `<select id="${id}" style="${_inp}"><option value="">— None —</option>${_pours().map(p => _opt(p.id, (p.pourNo || 'Pour') + ' · ' + (p.element || '') + ' ' + (p.grade || ''), cur)).join('')}</select>`; }

// `_inp` / `_lbl` are defined further down; forward-declare via hoisted consts below.

function _compressImage(file) {
  return new Promise((resolve, reject) => {
    if (!file || !file.type.startsWith('image/')) { resolve(null); return; }
    const reader = new FileReader();
    reader.onload = e => {
      const img = new Image();
      img.onload = () => {
        const maxW = 1000, scale = Math.min(1, maxW / img.width);
        const w = Math.round(img.width * scale), h = Math.round(img.height * scale);
        const c = document.createElement('canvas'); c.width = w; c.height = h;
        c.getContext('2d').drawImage(img, 0, 0, w, h);
        try { resolve(c.toDataURL('image/jpeg', 0.6)); } catch (err) { reject(err); }
      };
      img.onerror = reject; img.src = e.target.result;
    };
    reader.onerror = reject; reader.readAsDataURL(file);
  });
}

// ── view state ─────────────────────────────────────────────
let _section = 'home';   // home | dashboard | dpr | pour | milestones | quality | safety
let _pendingPhoto = null;         // legacy base64 (back-compat display)
let _pendingPhotoPath = null;     // Storage path of a newly-captured photo

export function renderExecution() {
  const root = document.getElementById('executionRoot');
  if (!root) return;
  if (!_pid()) {
    root.innerHTML = `<div style="text-align:center;padding:60px 20px;color:#94a3b8;">
      <div style="font-size:42px;margin-bottom:10px;">&#127959;</div>
      <p style="font-weight:700;color:#475569;">Open a project first</p>
      <p style="font-size:13px;">Site execution is tracked per project.</p></div>`;
    return;
  }
  if (_section === 'dashboard') return _renderDashboard(root);
  if (_section === 'dpr') return _renderDPR(root);
  if (_section === 'pour') return _renderPours(root);
  if (_section === 'quality') return _renderQuality(root);
  if (_section === 'safety') return _renderSafety(root);
  if (_section === 'staff') return _renderStaff(root);
  return _renderHome(root);
}
window._exOpen = function (s) { _section = s; renderExecution(); };

function _backBar(title) {
  return `<button onclick="_exOpen('home')" style="margin-bottom:14px;padding:6px 14px;background:#f1f5f9;border:1px solid #e2e8f0;border-radius:8px;color:#64748b;font-size:12px;font-weight:600;cursor:pointer;">&larr; Execution</button>
    <h2 class="text-2xl font-extrabold text-slate-800 mb-4">${title}</h2>`;
}

// ══════════════════════════════════════════════════════════
//  HOME — app-icon grid
// ══════════════════════════════════════════════════════════
function _renderHome(root) {
  const card = (icon, color, title, sub, sec) => `
    <div onclick="_exOpen('${sec}')" style="background:#fff;border:1px solid #e2e8f0;border-radius:16px;padding:20px 16px;cursor:pointer;transition:.15s;box-shadow:0 1px 3px rgba(0,0,0,.04);position:relative;" onmouseover="this.style.transform='translateY(-2px)';this.style.boxShadow='0 8px 24px rgba(0,0,0,.08)'" onmouseout="this.style.transform='';this.style.boxShadow='0 1px 3px rgba(0,0,0,.04)'">
      <div style="width:50px;height:50px;background:${color}15;border:2px solid ${color}30;border-radius:14px;display:flex;align-items:center;justify-content:center;font-size:24px;margin-bottom:10px;">${icon}</div>
      <div style="font-size:13px;font-weight:700;color:#0f172a;">${title}</div>
      <div style="font-size:10px;color:#94a3b8;margin-top:2px;">${sub}</div>
    </div>`;
  root.innerHTML = `
    <button onclick="window._navBack&&window._navBack()" style="margin-bottom:12px;padding:6px 14px;background:#f1f5f9;border:1px solid #e2e8f0;border-radius:8px;color:#64748b;font-size:12px;font-weight:600;cursor:pointer;">&larr; Back</button>
    <h2 class="text-3xl font-extrabold text-slate-800 mb-1">Site Execution</h2>
    <p class="text-sm text-slate-400 mb-5">Daily progress, concrete pours, quality & safety</p>
    <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(165px,1fr));gap:12px;">
      ${card('&#128202;', '#1e3a8a', 'Dashboard', 'Overview & KPIs', 'dashboard')}
      ${card('&#128221;', '#0ea5e9', 'Daily Progress', 'DPR — work done daily', 'dpr', _arr('dailyProgress').length)}
      ${card('&#129521;', '#f97316', 'Concrete Pour Card', 'Pour records & checks', 'pour', _arr('concretePours').length)}
      ${card('&#9989;', '#ef8420', 'Quality', 'Cube tests, NCR, checks', 'quality', _arr('qualityChecks').length)}
      ${card('&#9937;', '#ef4444', 'Safety', 'Incidents & PPE', 'safety', _arr('incidents').length)}
      ${card('&#128100;', '#7c3aed', 'Staff & Attendance', 'GPS punch in/out & pay', 'staff', _arr('staffMaster').length)}
    </div>`;
}

// ══════════════════════════════════════════════════════════
//  DASHBOARD
// ══════════════════════════════════════════════════════════
function _renderDashboard(root) {
  const month = _today().slice(0, 7);
  const dprThisMonth = _arr('dailyProgress').filter(d => (d.date || '').startsWith(month)).length;
  const pours = _arr('concretePours');
  const pourVol = pours.reduce((s, p) => s + _num(p.volume), 0);
  const q = _arr('qualityChecks');
  const qOpen = q.filter(x => x.status !== 'Closed' && x.status !== 'Pass').length;
  const safety = _arr('incidents');
  const kpi = (l, v, c, i) => `<div style="background:#fff;border:1px solid #e2e8f0;border-radius:16px;padding:16px;"><div style="display:flex;justify-content:space-between;align-items:center;"><div><div style="font-size:11px;text-transform:uppercase;letter-spacing:.05em;color:#94a3b8;font-weight:700;">${l}</div><div style="font-size:26px;font-weight:800;color:${c};margin-top:2px;">${v}</div></div><div style="font-size:26px;opacity:.25;">${i}</div></div></div>`;
  root.innerHTML = `${_backBar('Execution Dashboard')}
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px;">
      ${kpi('DPRs this month', dprThisMonth, '#0ea5e9', '&#128221;')}
      ${kpi('Concrete poured', pourVol.toFixed(1) + ' m³', '#f97316', '&#129521;')}
      ${kpi('Pours logged', pours.length, '#f59e0b', '&#128203;')}
      ${kpi('Open quality items', qOpen, '#ef8420', '&#9989;')}
      ${kpi('Safety records', safety.length, '#ef4444', '&#9937;')}
    </div>`;
}

// ══════════════════════════════════════════════════════════
//  shared list shell + modal
// ══════════════════════════════════════════════════════════
function _modal(html, opts) {
  const full = opts && opts.full;
  let o = document.getElementById('exModalOverlay');
  if (!o) {
    o = document.createElement('div'); o.id = 'exModalOverlay';
    o.addEventListener('click', e => { if (e.target === o) _exCloseModal(); });
    document.body.appendChild(o);
  }
  // Full-screen forms (e.g. DPR) fill the viewport; standard modals stay centered.
  o.style.cssText = full
    ? 'position:fixed;inset:0;background:rgba(15,23,42,.55);backdrop-filter:blur(3px);z-index:200000;display:flex;align-items:stretch;justify-content:center;padding:0;'
    : 'position:fixed;inset:0;background:rgba(15,23,42,.55);backdrop-filter:blur(3px);z-index:200000;display:flex;align-items:center;justify-content:center;padding:16px;';
  o.innerHTML = full
    ? `<div style="background:#fff;width:100%;height:100%;max-height:100vh;overflow:auto;box-shadow:0 0 60px rgba(0,0,0,.3);">${html}</div>`
    : `<div style="background:#fff;border-radius:18px;max-width:600px;width:100%;max-height:92vh;overflow:auto;box-shadow:0 24px 60px rgba(0,0,0,.3);">${html}</div>`;
  o.style.display = 'flex';
}
window._exCloseModal = function () { const o = document.getElementById('exModalOverlay'); if (o) o.style.display = 'none'; _pendingPhoto = null; _pendingPhotoPath = null; };
const _inp = 'width:100%;padding:9px 11px;border:1px solid #e2e8f0;border-radius:10px;font-size:13px;box-sizing:border-box;';
const _lbl = 'display:block;font-size:11px;font-weight:700;color:#64748b;margin-bottom:3px;';
const _head = (t) => `<div style="padding:18px 20px;border-bottom:1px solid #f1f5f9;display:flex;justify-content:space-between;align-items:center;"><h3 style="font-weight:800;color:#0f172a;font-size:17px;">${t}</h3><button onclick="_exCloseModal()" style="border:none;background:#f1f5f9;border-radius:8px;width:28px;height:28px;cursor:pointer;color:#64748b;font-size:16px;">×</button></div>`;

window._exCapturePhoto = async function (input, previewId) {
  const file = input.files && input.files[0]; const prev = document.getElementById(previewId);
  if (!file) return;
  let objUrl = ''; try { objUrl = URL.createObjectURL(file); } catch {}
  if (prev) prev.innerHTML = `<img src="${objUrl}" style="max-height:120px;border-radius:10px;border:1px solid #e2e8f0;margin-top:6px;opacity:.6;"><div style="font-size:11px;color:#94a3b8;">Uploading…</div>`;
  const ref = await uploadExecMedia(file, 'dpr', 'dpr');
  if (ref) {
    _pendingPhotoPath = ref.path; _pendingPhoto = null;
    if (prev) prev.innerHTML = `<img src="${objUrl}" style="max-height:120px;border-radius:10px;border:1px solid #e2e8f0;margin-top:6px;">`;
  } else {
    if (prev) prev.innerHTML = '<span style="font-size:12px;color:#dc2626;">Upload failed — connect and retry</span>';
    try { input.value = ''; } catch {}
  }
};
window._exLightbox = async function (key, id) {
  const r = (state[key] || []).find(x => x.id === id); if (!r || (!r.photo && !r.photoPath)) return;
  let lb = document.getElementById('exLightbox');
  if (!lb) { lb = document.createElement('div'); lb.id = 'exLightbox'; lb.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.88);z-index:200001;display:flex;align-items:center;justify-content:center;padding:24px;cursor:zoom-out;'; lb.addEventListener('click', () => lb.remove()); document.body.appendChild(lb); }
  let src = r.photo || null;
  if (!src && r.photoPath) { lb.innerHTML = '<div style="color:#fff;font-size:13px;opacity:.7;">Loading photo…</div>'; src = await signedExecUrl(r.photoPath); if (!document.getElementById('exLightbox')) return; }
  lb.innerHTML = src ? `<img src="${src}" style="max-width:96%;max-height:92%;border-radius:12px;">` : '<div style="color:#fff;">Could not load photo</div>';
};

function _delRow(key, id, re) {
  if (!confirm('Delete this record?')) return;
  const _r = (state[key] || []).find(x => x.id === id);
  if (_r && _r.photoPath) removeExecMedia({ path: _r.photoPath });   // clean up the Storage file
  state[key] = (state[key] || []).filter(x => x.id !== id);
  saveAllData(); showToast('Deleted'); re();
}
window._exDel = function (key, id) { _delRow(key, id, renderExecution); };

function _listShell(title, addLabel, addFn, rowsHtml, count) {
  return `${_backBar(title)}
    <div style="margin-bottom:14px;"><button onclick="${addFn}" style="padding:9px 16px;background:#1e3a8a;color:#fff;border:none;border-radius:10px;font-size:13px;font-weight:700;cursor:pointer;">${addLabel}</button>
    <span style="margin-left:10px;font-size:12px;color:#94a3b8;">${count} record${count === 1 ? '' : 's'}</span></div>
    <div style="display:flex;flex-direction:column;gap:10px;">${rowsHtml || '<div style="text-align:center;padding:40px;color:#94a3b8;">No records yet.</div>'}</div>`;
}
function _photoBtn(key, r) { return (r.photo || r.photoPath) ? `<button onclick="event.stopPropagation();_exLightbox('${key}','${r.id}')" title="Photo" style="border:none;background:#f1f5f9;border-radius:8px;padding:4px 7px;cursor:pointer;font-size:14px;">&#128247;</button>` : ''; }
function _pdfBtn(key, r) { return key === 'dailyProgress' ? `<button onclick="event.stopPropagation();window._exDprPdf('${r.id}')" title="Download PDF" style="border:none;background:#eff6ff;color:#1d4ed8;border-radius:8px;padding:4px 8px;cursor:pointer;font-size:11px;font-weight:700;">PDF</button>` : ''; }
function _rowActions(key, r) {
  return `<div style="display:flex;align-items:center;gap:6px;flex-shrink:0;">${_pdfBtn(key, r)}${_photoBtn(key, r)}<button onclick="event.stopPropagation();_exDel('${key}','${r.id}')" title="Delete" style="border:none;background:transparent;color:#cbd5e1;cursor:pointer;font-size:14px;">&#128465;&#65039;</button></div>`;
}

// ══════════════════════════════════════════════════════════
//  DAILY PROGRESS REPORT
// ══════════════════════════════════════════════════════════
function _renderDPR(root) {
  const list = _arr('dailyProgress').sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  const rows = list.map(d => `<div onclick="_exDprForm('${d.id}')" style="background:#fff;border:1px solid #e2e8f0;border-left:4px solid #0ea5e9;border-radius:12px;padding:12px 14px;cursor:pointer;display:flex;justify-content:space-between;gap:10px;">
    <div style="min-width:0;"><div style="font-weight:700;color:#0f172a;font-size:13px;">${d.dprNum ? '<span style="color:#0ea5e9;">' + _esc(d.dprNum) + '</span> · ' : ''}${_esc(d.date)} ${d.weather ? '· ' + _esc(d.weather) : ''}${d.area ? ' · ' + _esc(d.area) : ''}</div>
    <div style="font-size:11px;color:#64748b;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${_esc(d.workDone || '')}</div>
    <div style="font-size:10px;color:#94a3b8;margin-top:3px;">&#128100; ${(_num(d.manpowerSkilled) + _num(d.manpowerUnskilled)) || 0} workers${d.taskId ? ' · &#128197; ' + _esc(_taskName(d.taskId)) : ''}${d.hindrance ? ' · ⚠ ' + _esc(d.hindrance.slice(0, 30)) : ''}</div></div>
    ${_rowActions('dailyProgress', d)}</div>`).join('');
  root.innerHTML = `${_backBar('Daily Progress Report')}
    <div style="display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin-bottom:14px;">
      <button onclick="_exDprForm()" style="padding:9px 16px;background:#1e3a8a;color:#fff;border:none;border-radius:10px;font-size:13px;font-weight:700;cursor:pointer;">+ Add DPR</button>
      <button onclick="window._exDprPeriodPdf('week')" style="padding:9px 14px;background:#fff3ea;color:#7a1f14;border:1px solid #fdd9be;border-radius:10px;font-size:13px;font-weight:700;cursor:pointer;">📄 Weekly Report</button>
      <button onclick="window._exDprPeriodPdf('month')" style="padding:9px 14px;background:#fff3ea;color:#7a1f14;border:1px solid #fdd9be;border-radius:10px;font-size:13px;font-weight:700;cursor:pointer;">📄 Monthly Report</button>
      <span style="margin-left:auto;font-size:12px;color:#94a3b8;">${list.length} record${list.length === 1 ? '' : 's'}</span>
    </div>
    <div style="display:flex;flex-direction:column;gap:10px;">${rows || '<div style="text-align:center;padding:40px;color:#94a3b8;">No records yet.</div>'}</div>`;
}
// ── DPR shared builders (window-bound for inline handlers) ──
// Larger, easy-to-read/fill inputs (the DPR opens full-screen).
const _DPR_INP = 'padding:8px 9px;border:1px solid #cbd5e1;border-radius:8px;font-size:14px;';
const _dprBoqList = () => (typeof window.mpBoqItems === 'function' ? window.mpBoqItems() : []);
const _dprLocList = () => (typeof window.mpProjectLocations === 'function' ? window.mpProjectLocations() : []);

// ===== MEASUREMENT row (BOQ + Nos×L×B×H → auto qty) — same metrics as the
//       measurement sheet, flows to abstract → invoice → sales. Accepts a full
//       prefill (d = {nos,l,b,h,qty}) so a reopened DPR shows what was entered. =====
window._dprMeasRow = function (loc, code, d) {
  d = d || {};
  const isOther = !!(d.isNonBoq || (typeof code === 'string' && code.indexOf('NB:') === 0));
  const boqOpts = '<option value="">— BOQ item —</option>' + _dprBoqList().map(b =>
    `<option value="${_esc(b.code)}" data-uom="${_esc(b.uom || '')}" data-rate="${b.rate || 0}" data-desc="${_esc(b.description || '')}" ${!isOther && code === b.code ? 'selected' : ''}>${_esc(b.code)} — ${_esc(b.description || '')}</option>`).join('')
    + `<option value="__OTHER__" ${isOther ? 'selected' : ''}>✏️ Other (Non-BOQ)…</option>`;
  const dim = (cls, val, lbl) => `<td class="dpr-dim" data-l="${lbl}" style="padding:4px;"><input class="${cls}" type="number" min="0" step="0.001" value="${val != null && val !== '' ? _esc(val) : ''}" oninput="window._dprMeasCalc(this)" style="${_DPR_INP}width:60px;text-align:right;"></td>`;
  return `<tr>
    <td class="dpr-wide" data-l="Location" style="padding:4px;"><input class="dm-loc" list="dprLocList" value="${_esc(loc || '')}" placeholder="location" style="${_DPR_INP}width:130px;"></td>
    <td class="dpr-wide" data-l="BOQ Item" style="padding:4px;">
      <select class="dm-boq" onchange="window._dprMeasPick(this)" style="${_DPR_INP}width:210px;">${boqOpts}</select>
      <input class="dm-otherdesc" value="${_esc(isOther ? (d.description || '') : '')}" placeholder="Type Non-BOQ item name…" style="${_DPR_INP}width:210px;margin-top:3px;display:${isOther ? 'block' : 'none'};">
    </td>
    ${dim('dm-nos', d.nos, 'Nos')}${dim('dm-l', d.l, 'L')}${dim('dm-b', d.b, 'B')}${dim('dm-h', d.h, 'H')}
    <td class="dpr-half" data-l="Qty" style="padding:4px;"><input class="dm-qty" type="number" min="0" step="0.001" value="${d.qty != null && d.qty !== '' ? _esc(d.qty) : ''}" placeholder="0" style="${_DPR_INP}width:78px;text-align:right;font-weight:800;color:#1d4ed8;background:#f8fafc;"></td>
    <td class="dpr-half" data-l="Unit" style="padding:4px;"><input class="dm-uom" value="${_esc(d.uom || '')}" ${isOther ? '' : 'readonly'} style="${_DPR_INP}width:56px;background:${isOther ? '#fff' : '#f8fafc'};"></td>
    <td class="dpr-del" style="padding:4px;text-align:center;"><button onclick="this.closest('tr').remove()" style="border:none;background:none;color:#ef4444;cursor:pointer;font-weight:700;font-size:16px;">✕</button></td>
  </tr>`;
};
window._dprAddMeas = function () { const tb = document.getElementById('dprMeasBody'); if (tb) tb.insertAdjacentHTML('beforeend', window._dprMeasRow()); };
window._dprMeasPick = function (sel) {
  const o = sel.selectedOptions[0];
  const tr = sel.closest('tr');
  const u = tr.querySelector('.dm-uom');
  const other = tr.querySelector('.dm-otherdesc');
  if (sel.value === '__OTHER__') {
    if (other) { other.style.display = 'block'; other.focus(); }
    if (u) { u.removeAttribute('readonly'); u.style.background = '#fff'; }
  } else {
    if (other) other.style.display = 'none';
    if (u) { u.value = o?.dataset.uom || ''; u.setAttribute('readonly', 'readonly'); u.style.background = '#f8fafc'; }
  }
};
window._dprMeasCalc = function (el) {
  const tr = el.closest('tr');
  const r = s => { const v = (tr.querySelector(s)?.value ?? '').trim(); if (v === '') return { v: 1, has: false }; const n = parseFloat(v); return { v: isNaN(n) ? 1 : n, has: true }; };
  const nos = r('.dm-nos'), l = r('.dm-l'), b = r('.dm-b'), h = r('.dm-h');
  const any = nos.has || l.has || b.has || h.has;
  const q = tr.querySelector('.dm-qty');
  if (any) { const dec = (state.printSettings?.measurementDecimals ?? 2); q.value = String(parseFloat((nos.v * l.v * b.v * h.v).toFixed(dec))); q.readOnly = true; q.style.background = '#f8fafc'; }
  else { q.readOnly = false; q.style.background = '#fff'; }
};

// ===== NON-BOQ / OVERHEAD row with resource selection + auto cost =====
const _DPR_OH_TYPES = ['Labour', 'Equipment', 'Material', 'Other'];
function _dprOhResources(type) {
  const pid = (typeof _pid === 'function') ? _pid() : state.currentProjectId;
  if (type === 'Labour') return (state.labourMaster || []).filter(w => !w.projectId || w.projectId === pid).map(w => ({ id: w.id, name: `${w.name} (${w.trade || 'labour'})`, rate: parseFloat(w.dayRate) || 0, unit: 'day' }));
  if (type === 'Equipment') return (state.equipmentList || []).map(e => ({ id: e.id, name: e.name || e.code || 'Equipment', rate: parseFloat(e.rentRate) || 0, unit: e.rentBasis === 'daily' ? 'day' : e.rentBasis === 'monthly' ? 'mo' : 'hr' }));
  if (type === 'Material') return (state.rawMaterials || []).map(m => ({ id: m.id, name: m.name, rate: _dprMatRate(m.id), unit: m.unit || 'nos' }));
  return [];
}
// Latest purchase rate for a material, from EVERY source a rate is entered —
// inventory stock-IN, purchase bills (net rate), and GRN receipts (most recent
// by date), else the item master's stored rate. Mirrors Cost & Profit costing.
function _dprMatRate(id) {
  if (!id) return 0;
  let best = null;
  const consider = (date, rate) => { const r = parseFloat(rate) || 0; if (r <= 0) return; const t = date ? new Date(date).getTime() : 0; if (!best || t >= best.t) best = { t: t || 0, rate: r }; };
  (state.inventoryTx || []).forEach(x => { if (x.rawMaterialId === id && x.type === 'IN') consider(x.date, x.rate); });
  (state.vendorMaterials || []).forEach(b => (b.items || []).forEach(it => { if (it.rawMatId === id || it.rawMaterialId === id) consider(b.date, it.netRate != null ? it.netRate : it.rate); }));
  (state.grnRecords || []).forEach(g => { if ((g.matId || g.rawMatId || g.rawMaterialId) === id) consider(g.date || g.receivedAt, g.rate); });
  if (best) return best.rate;
  const rm = (state.rawMaterials || []).find(m => m.id === id);
  return rm ? (parseFloat(rm.rate) || parseFloat(rm.lastRate) || parseFloat(rm.stdRate) || parseFloat(rm.purchaseRate) || 0) : 0;
}
function _dprOhResOpts(type, selId) { return '<option value="">— select —</option>' + _dprOhResources(type).map(r => `<option value="${_esc(r.id)}" data-rate="${r.rate}" data-name="${_esc(r.name)}" data-unit="${_esc(r.unit)}" ${selId && String(selId) === String(r.id) ? 'selected' : ''}>${_esc(r.name)}${r.rate ? ` · ${r.rate}/${r.unit}` : ''}</option>`).join(''); }

// ══════════════════════════════════════════════════════════
//  DPR ← attendance / equipment auto-fill · owner review · weekly/monthly reports
//  The engineer records the DPR; labour is pulled from that day's attendance and
//  equipment from the project's list, so nothing is re-typed. Money (rates/costs)
//  is hidden from non-owners — it still flows to Cost & Profit behind the scenes.
// ══════════════════════════════════════════════════════════
(function () { if (!document.getElementById('dprMoneyCss')) { const s = document.createElement('style'); s.id = 'dprMoneyCss'; s.textContent = '.dpr-hide-money .dpr-money{display:none!important}'; (document.head || document.documentElement).appendChild(s); } })();
const _DPR_FULL_ROLES = ['Admin', 'CEO', 'Owner'];
/** Owner/admin (full access) sees costs + the review control; engineers don't. */
function _dprIsOwner() { try { const u = getCurrentUser && getCurrentUser(); return !u || _DPR_FULL_ROLES.includes(u.role); } catch (e) { return true; } }
const _DPR_SKILLED_RE = /engineer|supervisor|foreman|mason|carpenter|electric|plumb|fitter|welder|bar ?bender|operator|surveyor|steel|shutter|painter|tile|mistri|mestri/i;
function _dprIsSkilled(s) { return _DPR_SKILLED_RE.test((s.designation || '') + ' ' + (s.name || '')); }
/** Snapshot of staff present (attendance punched-in) for a date, scoped to project. */
function _dprAttForDate(date) {
  const pid = _pid(); date = date || _today();
  const out = [];
  (state.staffAttendance || []).forEach(a => {
    if (a.date !== date || !a.inAt) return;
    const s = (state.staffMaster || []).find(x => x.id === a.staffId);
    if (!s) return;
    if (pid && s.projectId && s.projectId !== pid) return;
    out.push({ staffId: s.id, name: s.name, designation: s.designation || 'Staff', hours: (a.hours != null ? a.hours : ''), otHours: a.otHours || 0, dayPay: a.dayPay || 0, totalPay: a.totalPay || 0, skilled: _dprIsSkilled(s) });
  });
  return out;
}
function _dprEquipForProject() {
  const pid = _pid();
  return (state.equipmentList || []).filter(e => !e.projectId || !pid || e.projectId === pid).map(e => ({ id: e.id, name: e.name || e.code || 'Equipment' }));
}
function _dprAttTable(att) {
  if (!att || !att.length) return '<div style="font-size:11px;color:#94a3b8;">No staff marked present for this date. Mark attendance in <b>Staff &amp; Attendance</b>, then tap &ldquo;Pull from attendance&rdquo;.</div>';
  return '<div style="overflow-x:auto;"><table style="width:100%;border-collapse:collapse;font-size:12px;"><thead><tr style="font-size:10px;text-transform:uppercase;color:#94a3b8;text-align:left;"><th style="padding:3px;">Name</th><th style="padding:3px;">Designation</th><th style="padding:3px;">Type</th><th style="padding:3px;text-align:right;">Hours</th></tr></thead><tbody>'
    + att.map(a => `<tr><td style="padding:3px;font-weight:600;color:#0f172a;">${_esc(a.name)}</td><td style="padding:3px;color:#64748b;">${_esc(a.designation)}</td><td style="padding:3px;"><span style="font-size:10px;font-weight:700;padding:2px 7px;border-radius:6px;${a.skilled ? 'color:#c2401c;background:#fff3ea;' : 'color:#475569;background:#f1f5f9;'}">${a.skilled ? 'Skilled' : 'Unskilled'}</span></td><td style="padding:3px;text-align:right;font-variant-numeric:tabular-nums;">${a.hours !== '' ? a.hours + 'h' : '—'}${a.otHours ? ` <span style="color:#d97706;">+${a.otHours}</span>` : ''}</td></tr>`).join('')
    + `</tbody></table><div style="margin-top:6px;font-size:11px;color:#475569;">Present: <b>${att.length}</b> &middot; Skilled: <b>${att.filter(a => a.skilled).length}</b> &middot; Unskilled: <b>${att.filter(a => !a.skilled).length}</b></div></div>`;
}
/** Pull labour from that day's attendance + equipment from the project into the open DPR. */
window._dprAutoFill = function (silent) {
  const date = (document.getElementById('dpDate')?.value) || _today();
  const att = _dprAttForDate(date);
  window.__dprAtt = att;
  const sk = att.filter(a => a.skilled).length, un = att.length - sk;
  const set = (id, val) => { const el = document.getElementById(id); if (el) el.value = val || ''; };
  set('dpSkilled', sk || ''); set('dpUnskilled', un || '');
  const box = document.getElementById('dprAttBox'); if (box) box.innerHTML = _dprAttTable(att);
  const eq = _dprEquipForProject(); window.__dprEquip = eq;
  const eqEl = document.getElementById('dpEquip'); if (eqEl && !eqEl.value.trim() && eq.length) eqEl.value = eq.map(e => e.name).join(', ');
  if (!silent) showToast(att.length ? `Pulled ${att.length} present from attendance` : ('No attendance marked for ' + date), att.length ? 'success' : 'info');
};
// ── Consolidated weekly / monthly progress report (PDF) ──
window._exDprPeriodPdf = async function (period) {
  try {
    if (!window.jspdf || !window.jspdf.jsPDF) return showToast('PDF library not loaded — refresh the page', 'error');
    const pid = _pid();
    const t = new Date();
    let start, end, label;
    if (period === 'week') {
      const dow = (t.getDay() + 6) % 7; // Monday = 0
      const s = new Date(t); s.setDate(t.getDate() - dow);
      const e = new Date(s); e.setDate(s.getDate() + 6);
      start = _iso(s); end = _iso(e); label = 'WEEKLY PROGRESS REPORT';
    } else {
      start = _iso(new Date(t.getFullYear(), t.getMonth(), 1));
      end = _iso(new Date(t.getFullYear(), t.getMonth() + 1, 0));
      label = 'MONTHLY PROGRESS REPORT';
    }
    const dprs = (state.dailyProgress || []).filter(d => d.projectId === pid && (d.date || '') >= start && (d.date || '') <= end).sort((a, b) => (a.date || '').localeCompare(b.date || ''));
    if (!dprs.length) return showToast(`No DPRs found for this ${period}`, 'info');

    const measMap = {}, matMap = {}, equipSet = {};
    let manDays = 0, skilledDays = 0, unskilledDays = 0;
    const daily = [];
    dprs.forEach(d => {
      (d.measurements || []).forEach(m => { const k = (m.description || m.code || 'Item') + '||' + (m.uom || ''); const o = measMap[k] || (measMap[k] = { name: m.description || m.code || 'Item', uom: m.uom || '', qty: 0 }); o.qty += (parseFloat(m.qty) || 0); });
      const att = Array.isArray(d.attendance) ? d.attendance : [];
      const sk = att.length ? att.filter(a => a.skilled).length : _num(d.manpowerSkilled);
      const un = att.length ? (att.length - att.filter(a => a.skilled).length) : _num(d.manpowerUnskilled);
      skilledDays += sk; unskilledDays += un; manDays += (sk + un);
      (d.overheads || []).forEach(o => {
        if (o.type === 'Material') { const k = o.resource || o.activity || 'Material'; (matMap[k] = matMap[k] || { name: k, qty: 0, uom: o.uom || '' }).qty += (parseFloat(o.qty) || 0); }
        if (o.type === 'Equipment') { const k = o.resource || o.activity || 'Equipment'; equipSet[k] = (equipSet[k] || 0) + (parseFloat(o.qty) || 0); }
      });
      (d.equipmentUsed || []).forEach(e => { if (e && e.name && !(e.name in equipSet)) equipSet[e.name] = 0; });
      daily.push([d.date || '—', String((att.length || (sk + un)) || 0), (d.workDone || '—').replace(/\s+/g, ' ').slice(0, 90), d.hindrance ? 'Yes' : '—']);
    });

    const proj = (state.projects || []).find(x => x.id === pid) || {};
    const doc = new window.jspdf.jsPDF('p', 'mm', 'a4');
    const pw = doc.internal.pageSize.getWidth(), ml = 14, mr = 14;
    const accent = [14, 165, 233];
    let y = (typeof window.getSimpleHeaderForPDF === 'function') ? window.getSimpleHeaderForPDF(doc, { ml, mr }) : 16;
    doc.setFillColor(accent[0], accent[1], accent[2]); doc.rect(ml, y, pw - ml - mr, 9, 'F');
    doc.setTextColor(255, 255, 255); doc.setFont('helvetica', 'bold'); doc.setFontSize(13);
    doc.text(label, pw / 2, y + 6.2, { align: 'center' });
    y += 13; doc.setTextColor(0);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9);
    doc.text(`Project: ${proj.name || '—'}    |    Period: ${start} to ${end}    |    DPRs: ${dprs.length}`, ml, y);
    y += 4;

    // KPI summary
    doc.autoTable({
      startY: y, theme: 'grid', styles: { fontSize: 9, cellPadding: 2.4 },
      head: [['DPRs', 'Total man-days', 'Skilled', 'Unskilled', 'Items measured', 'Materials']],
      body: [[String(dprs.length), String(manDays), String(skilledDays), String(unskilledDays), String(Object.keys(measMap).length), String(Object.keys(matMap).length)]],
      headStyles: { fillColor: [240, 249, 255], textColor: [3, 105, 161], fontStyle: 'bold' },
      margin: { left: ml, right: mr },
    });
    y = doc.lastAutoTable.finalY + 6;

    const section = (title) => { doc.setFont('helvetica', 'bold'); doc.setFontSize(10); doc.setTextColor(3, 105, 161); doc.text(title, ml, y); doc.setTextColor(0); y += 2; };
    const measRows = Object.values(measMap).filter(m => m.qty > 0).map(m => [m.name, (Math.round(m.qty * 1000) / 1000).toLocaleString('en-IN'), m.uom || '—']);
    if (measRows.length) { section('Work Done — Measurement Totals'); doc.autoTable({ startY: y + 2, theme: 'striped', styles: { fontSize: 9, cellPadding: 2 }, head: [['Item', 'Total Qty', 'Unit']], columnStyles: { 1: { halign: 'right', fontStyle: 'bold' }, 2: { cellWidth: 24 } }, headStyles: { fillColor: accent }, margin: { left: ml, right: mr } }); y = doc.lastAutoTable.finalY + 6; }

    const labourRows = [['Skilled man-days', String(skilledDays)], ['Unskilled man-days', String(unskilledDays)], ['Total man-days', String(manDays)]];
    section('Labour (from attendance)'); doc.autoTable({ startY: y + 2, theme: 'grid', styles: { fontSize: 9, cellPadding: 2 }, body: labourRows, columnStyles: { 0: { fontStyle: 'bold', fillColor: [240, 249, 255], cellWidth: 60 }, 1: { halign: 'right' } }, margin: { left: ml, right: mr } }); y = doc.lastAutoTable.finalY + 6;

    const eqNames = Object.keys(equipSet);
    if (eqNames.length) { section('Equipment Deployed'); doc.autoTable({ startY: y + 2, theme: 'plain', styles: { fontSize: 9, cellPadding: 1.6 }, body: [[eqNames.join(',  ')]], margin: { left: ml, right: mr } }); y = doc.lastAutoTable.finalY + 6; }

    const matRows = Object.values(matMap).filter(m => m.qty > 0).map(m => [m.name, (Math.round(m.qty * 1000) / 1000).toLocaleString('en-IN'), m.uom || '—']);
    if (matRows.length) { section('Material Consumed'); doc.autoTable({ startY: y + 2, theme: 'striped', styles: { fontSize: 9, cellPadding: 2 }, head: [['Material', 'Qty', 'Unit']], columnStyles: { 1: { halign: 'right', fontStyle: 'bold' }, 2: { cellWidth: 24 } }, headStyles: { fillColor: accent }, margin: { left: ml, right: mr } }); y = doc.lastAutoTable.finalY + 6; }

    section('Daily Log'); doc.autoTable({ startY: y + 2, theme: 'striped', styles: { fontSize: 8.5, cellPadding: 1.8 }, head: [['Date', 'Workers', 'Work done', 'Delay']], columnStyles: { 0: { cellWidth: 22 }, 1: { cellWidth: 16, halign: 'center' }, 3: { cellWidth: 14, halign: 'center' } }, headStyles: { fillColor: accent }, body: daily, margin: { left: ml, right: mr } });

    mobileSavePDF(doc, `${period === 'week' ? 'Weekly' : 'Monthly'}_Progress_${start}_to_${end}.pdf`);
    showToast(`${period === 'week' ? 'Weekly' : 'Monthly'} report downloaded`);
  } catch (err) {
    console.error('Period report failed:', err);
    showToast('Report error: ' + (err && err.message ? err.message : err), 'error');
  }
};
function _iso(d) { return d.toISOString().slice(0, 10); }
window._dprOhRow = function (o) {
  o = o || {};
  const type = o.type || 'Labour';
  const typeOpts = _DPR_OH_TYPES.map(t => `<option ${t === type ? 'selected' : ''}>${t}</option>`).join('');
  const resCell = (type === 'Other')
    ? `<input class="oh-res-text" value="${_esc(o.resource || o.activity || '')}" placeholder="activity name" style="${_DPR_INP}width:210px;">`
    : `<select class="oh-res" onchange="window._dprOhRes(this)" style="${_DPR_INP}width:210px;">${_dprOhResOpts(type, o.resourceId)}</select>`;
  const qty = o.qty != null ? o.qty : 1, rate = o.rate != null ? o.rate : '', cost = Math.round((parseFloat(qty) || 0) * (parseFloat(rate) || 0)).toLocaleString('en-IN');
  return `<tr>
    <td class="dpr-half" data-l="Type" style="padding:4px;"><select class="oh-type" onchange="window._dprOhType(this)" style="${_DPR_INP}width:110px;">${typeOpts}</select></td>
    <td class="dpr-wide oh-res-cell" data-l="Resource" style="padding:4px;">${resCell}</td>
    <td class="dpr-half" data-l="Qty" style="padding:4px;"><input class="oh-qty" type="number" min="0" step="0.01" value="${_esc(qty)}" oninput="window._dprOhCalc(this)" style="${_DPR_INP}width:64px;text-align:right;"></td>
    <td class="dpr-half dpr-money" data-l="Rate" style="padding:4px;"><input class="oh-rate" type="number" min="0" step="0.01" value="${rate !== '' ? _esc(rate) : ''}" oninput="window._dprOhCalc(this)" style="${_DPR_INP}width:80px;text-align:right;"></td>
    <td class="dpr-half dpr-money" data-l="Cost" style="padding:4px;text-align:right;"><span class="oh-cost" style="font-weight:800;color:#92400e;font-size:14px;">${cost}</span></td>
    <td class="dpr-wide" data-l="Note" style="padding:4px;"><input class="oh-note" value="${_esc(o.note || (type === 'Other' ? '' : o.activity) || '')}" placeholder="" style="${_DPR_INP}width:130px;"></td>
    <td class="dpr-del" style="padding:4px;text-align:center;"><button onclick="this.closest('tr').remove()" style="border:none;background:none;color:#ef4444;cursor:pointer;font-weight:700;font-size:16px;">✕</button></td>
  </tr>`;
};
window._dprAddOh = function () { const tb = document.getElementById('dprOhBody'); if (tb) tb.insertAdjacentHTML('beforeend', window._dprOhRow()); };
window._dprOhType = function (sel) {
  const tr = sel.closest('tr'); const type = sel.value; const cell = tr.querySelector('.oh-res-cell');
  if (type === 'Other') { cell.innerHTML = `<input class="oh-res-text" placeholder="activity name" style="${_DPR_INP}width:150px;">`; tr.querySelector('.oh-rate').value = ''; }
  else { cell.innerHTML = `<select class="oh-res" onchange="window._dprOhRes(this)" style="${_DPR_INP}width:150px;">${_dprOhResOpts(type)}</select>`; }
  window._dprOhCalc(tr.querySelector('.oh-qty'));
};
window._dprOhRes = function (sel) { const tr = sel.closest('tr'); const o = sel.selectedOptions[0]; if (o && o.dataset.rate) tr.querySelector('.oh-rate').value = o.dataset.rate; window._dprOhCalc(tr.querySelector('.oh-qty')); };
window._dprOhCalc = function (el) { const tr = el.closest('tr'); const qty = parseFloat(tr.querySelector('.oh-qty')?.value) || 0; const rate = parseFloat(tr.querySelector('.oh-rate')?.value) || 0; const c = tr.querySelector('.oh-cost'); if (c) c.textContent = Math.round(qty * rate).toLocaleString('en-IN'); };

window._exDprForm = function (id) {
  const d = id ? (state.dailyProgress || []).find(x => x.id === id) : null;
  _pendingPhoto = d?.photo || null; _pendingPhotoPath = d?.photoPath || null;

  // ── Real-time link to Micro-Planning: seed measurement rows from planned tasks ──
  const _tasks = (typeof window.mpActivePlannedTasks === 'function') ? window.mpActivePlannedTasks() : [];
  const _locList = _dprLocList();
  const _locDatalist = `<datalist id="dprLocList">${_locList.map(l => `<option value="${_esc(l.label)}">`).join('')}</datalist>`;
  // One measurement row per active task (pre-filled location + BOQ if the task
  // carries one), plus a blank row to add more.
  // Reopen persistence: if this DPR already stored measurement rows, prefill from
  // them; otherwise seed one row per active planned task + a blank row.
  const measRows = (d && Array.isArray(d.measurements) && d.measurements.length)
    ? d.measurements.map(m => window._dprMeasRow(m.location || '', m.code || '', m)).join('') + window._dprMeasRow()
    : (_tasks.length ? _tasks.map(t => window._dprMeasRow(t.area || '', t.boqCode || t.boqRef || '')).join('') : '') + window._dprMeasRow();
  const ohRows = (d && Array.isArray(d.overheads) && d.overheads.length)
    ? d.overheads.map(o => window._dprOhRow(o)).join('')
    : window._dprOhRow();

  _modal(`${_head(d ? 'Edit DPR' : 'Daily Progress Report')}<div class="${_dprIsOwner() ? '' : 'dpr-hide-money'}" style="padding:20px;">
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:12px;">
      <div><label style="${_lbl}">Date</label><input id="dpDate" type="date" value="${d ? _esc(d.date) : _today()}" onchange="window._dprAutoFill(true)" style="${_inp}"></div>
      <div><label style="${_lbl}">Weather</label><input id="dpWeather" placeholder="" value="${d ? _esc(d.weather) : ''}" style="${_inp}"></div>
    </div>
    <div style="margin-bottom:12px;"><label style="${_lbl}">Area / Location</label><input id="dpArea" placeholder="" value="${d ? _esc(d.area) : ''}" style="${_inp}"></div>
    <div style="margin-bottom:12px;"><label style="${_lbl}">Work Done Today</label><textarea id="dpWork" rows="3" placeholder="Describe today's progress…" style="${_inp}resize:vertical;">${d ? _esc(d.workDone) : ''}</textarea></div>
    <div style="border:1px solid #f3d9c4;background:#fdf5ee;border-radius:12px;padding:12px;margin-bottom:12px;">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
        <div style="font-weight:800;font-size:13px;color:#7a1f14;">👷 Labour — from Attendance</div>
        <button type="button" onclick="window._dprAutoFill()" style="font-size:11px;font-weight:700;background:#ffeede;color:#7a1f14;border:1px solid #fdd9be;border-radius:7px;padding:4px 10px;cursor:pointer;">⟳ Pull from attendance</button>
      </div>
      <div style="font-size:11px;color:#64748b;margin-bottom:8px;">Who was present on this date comes straight from Staff &amp; Attendance — no re-typing. Change the date to pull that day.</div>
      <div id="dprAttBox">${_dprAttTable(d && Array.isArray(d.attendance) ? d.attendance : [])}</div>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:12px;">
      <div><label style="${_lbl}">Manpower — Skilled <span style="font-weight:400;color:#94a3b8;">(auto)</span></label><input id="dpSkilled" type="number" value="${d ? d.manpowerSkilled || '' : ''}" style="${_inp}"></div>
      <div><label style="${_lbl}">Manpower — Unskilled <span style="font-weight:400;color:#94a3b8;">(auto)</span></label><input id="dpUnskilled" type="number" value="${d ? d.manpowerUnskilled || '' : ''}" style="${_inp}"></div>
    </div>
    <div style="margin-bottom:12px;"><label style="${_lbl}">Equipment Deployed</label><input id="dpEquip" placeholder="" value="${d ? _esc(d.equipment) : ''}" style="${_inp}"></div>
    <div style="margin-bottom:12px;"><label style="${_lbl}">Hindrances / Delays</label><input id="dpHindrance" placeholder="Any blockers" value="${d ? _esc(d.hindrance) : ''}" style="${_inp}"></div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:12px;">
      <div><label style="${_lbl}">Safety Observations</label><input id="dpSafety" placeholder="Toolbox talk, PPE, incidents…" value="${d ? _esc(d.safety || '') : ''}" style="${_inp}"></div>
      <div><label style="${_lbl}">Quality / Tests</label><input id="dpQuality" placeholder="Cube test, slump, checks…" value="${d ? _esc(d.quality || '') : ''}" style="${_inp}"></div>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:12px;">
      <div><label style="${_lbl}">Materials Received (challan)</label><input id="dpMatRecv" placeholder="e.g. Cement 50 bags (DC-1234)" value="${d ? _esc(d.materialsReceived || '') : ''}" style="${_inp}"></div>
      <div><label style="${_lbl}">Instructions / Visitors</label><input id="dpInstr" placeholder="Client/consultant notes, visitors" value="${d ? _esc(d.instructions || '') : ''}" style="${_inp}"></div>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:12px;">
      <div><label style="${_lbl}">Related Task (Planning)</label>${_taskSelect('dpTask', d?.taskId)}</div>
      <div><label style="${_lbl}">Related BOQ Item</label>${_boqSelect('dpBoq', d?.boqRef)}</div>
    </div>
    <div style="margin-bottom:14px;"><label style="${_lbl}">Site Photo</label><input type="file" accept="image/*" capture="environment" onchange="_exCapturePhoto(this,'dpPrev')" style="font-size:12px;"><div id="dpPrev">${_pendingPhoto ? `<img src="${_pendingPhoto}" style="max-height:120px;border-radius:10px;margin-top:6px;">` : (_pendingPhotoPath ? '<div style="font-size:12px;color:#c2401c;margin-top:6px;">&#10003; Photo attached</div>' : '')}</div></div>

    ${_locDatalist}
    <!-- ── MEASUREMENT — work done today (BOQ × Nos×L×B×H → bill) ── -->
    <div style="border:1px solid #fde3d0;background:#fff3ea;border-radius:12px;padding:12px;margin-bottom:12px;">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:2px;">
        <div style="font-weight:800;font-size:13px;color:#7a1f14;">📐 Measurement — Work Done Today</div>
        <button onclick="window._dprAddMeas()" style="font-size:11px;font-weight:700;background:#ffeede;color:#7a1f14;border:1px solid #fdd9be;border-radius:7px;padding:4px 10px;cursor:pointer;">+ Add row</button>
      </div>
      <div style="font-size:11px;color:#64748b;margin-bottom:8px;">Measure executed work per location. Pick the BOQ item and enter Nos × L × B × H (Qty auto-calculates) — or type Qty directly. It flows to the measurement sheet → abstract → RA bill → invoice → sales, and Cost &amp; Profit.</div>
      <div style="overflow-x:auto;"><table class="dpr-entry-table dpr-meas-table" style="width:100%;border-collapse:collapse;"><thead><tr style="font-size:10px;text-transform:uppercase;color:#94a3b8;text-align:left;">
        <th style="padding:3px;">Location</th><th style="padding:3px;">BOQ item</th><th style="padding:3px;">Nos</th><th style="padding:3px;">L</th><th style="padding:3px;">B</th><th style="padding:3px;">H</th><th style="padding:3px;">Qty</th><th style="padding:3px;">Unit</th><th style="padding:3px;"></th></tr></thead>
        <tbody id="dprMeasBody">${measRows}</tbody></table></div>
    </div>

    <!-- ── NON-BOQ / OVERHEAD — resource + auto cost (internal, not billed) ── -->
    <div style="border:1px solid #fde68a;background:#fffbeb;border-radius:12px;padding:12px;margin-bottom:14px;">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:2px;">
        <div style="font-weight:800;font-size:13px;color:#92400e;">🛠 Non-BOQ / Overhead — Cost Leaks</div>
        <button onclick="window._dprAddOh()" style="font-size:11px;font-weight:700;background:#fef3c7;color:#92400e;border:1px solid #fde68a;border-radius:7px;padding:4px 10px;cursor:pointer;">+ Add</button>
      </div>
      <div style="font-size:11px;color:#64748b;margin-bottom:8px;">Internal work NOT paid by the client. Pick <b>Labour / Equipment / Material</b> (or Other) — the rate auto-fills and cost = qty × rate. Tagged <b>Overhead</b>, it hits Cost &amp; Profit but never BOQ billing.</div>
      <div style="overflow-x:auto;"><table class="dpr-entry-table dpr-oh-table" style="width:100%;border-collapse:collapse;"><thead><tr style="font-size:10px;text-transform:uppercase;color:#94a3b8;text-align:left;">
        <th style="padding:3px;">Type</th><th style="padding:3px;">Resource</th><th style="padding:3px;">Qty</th><th class="dpr-money" style="padding:3px;">Rate</th><th class="dpr-money" style="padding:3px;text-align:right;">Cost</th><th style="padding:3px;">Note</th><th style="padding:3px;"></th></tr></thead>
        <tbody id="dprOhBody">${ohRows}</tbody></table></div>
    </div>

    <label style="display:flex;align-items:flex-start;gap:9px;margin:0 0 12px;cursor:pointer;background:#fff3ea;border:1px solid #f3d9c4;border-radius:10px;padding:11px;"><input type="checkbox" id="dpShowProgress" ${(!d || d.showProgress !== false) ? 'checked' : ''} style="width:18px;height:18px;margin-top:1px;"><span style="font-size:12px;color:#7a1f14;"><b>Include BOQ overall progress in the PDF</b> — adds the Plan vs Actual section (overall % and per-item planned vs done). Untick to leave it out of this report.</span></label>
    <button onclick="_exDprSave('${id || ''}')" style="width:100%;padding:11px;background:#1e3a8a;color:#fff;border:none;border-radius:10px;font-weight:700;cursor:pointer;">${d ? 'Save' : 'Create DPR'}</button>
  </div>`, { full: true });
  window.__dprAtt = (d && Array.isArray(d.attendance)) ? d.attendance : null;
  window.__dprEquip = (d && Array.isArray(d.equipmentUsed)) ? d.equipmentUsed : null;
  if (!d) setTimeout(() => window._dprAutoFill(true), 40); // new DPR → pull today's attendance
};
window._exDprSave = function (id) {
  const v = i => (document.getElementById(i)?.value || '').trim();
  const date = v('dpDate') || _today();
  // Resolve the DPR id up front so measurement/overhead lines can be tagged with
  // it (needed for idempotent edits and reopen persistence).
  const dprId = id || ('dpr_' + Date.now());

  // ── Collect measurement + overhead rows into flat arrays (also stored on the
  //    DPR record so reopening prefills them). ──
  const measurements = [];
  document.querySelectorAll('#dprMeasBody tr').forEach(tr => {
    const sel = tr.querySelector('.dm-boq');
    let code = sel?.value || '';
    const qty = parseFloat(tr.querySelector('.dm-qty')?.value) || 0;
    const dv = s => (tr.querySelector(s)?.value || '').trim();
    let description, uom, rate, isNonBoq = false;
    if (code === '__OTHER__') {
      // Non-BOQ item: use the typed name; a stable "NB:<name>" code lets it group
      // and flow into the measurement sheet like any other line (no BOQ rate).
      const nm = dv('.dm-otherdesc');
      if (!nm || qty <= 0) return;
      isNonBoq = true; code = 'NB:' + nm; description = nm; uom = dv('.dm-uom'); rate = 0;
    } else {
      if (!code || qty <= 0) return;
      const o = sel.selectedOptions[0];
      description = o?.dataset.desc; uom = o?.dataset.uom; rate = parseFloat(o?.dataset.rate) || 0;
    }
    measurements.push({ location: (tr.querySelector('.dm-loc')?.value || v('dpArea') || 'General').trim() || 'General', code, description, uom, rate, qty, nos: dv('.dm-nos'), l: dv('.dm-l'), b: dv('.dm-b'), h: dv('.dm-h'), isNonBoq });
  });
  const overheads = [];
  document.querySelectorAll('#dprOhBody tr').forEach(tr => {
    const type = tr.querySelector('.oh-type')?.value || 'Other';
    const resSel = tr.querySelector('.oh-res');
    const resName = type === 'Other' ? (tr.querySelector('.oh-res-text')?.value || '').trim() : (resSel?.selectedOptions?.[0]?.dataset.name || '').trim();
    const qty = parseFloat(tr.querySelector('.oh-qty')?.value) || 0;
    const rate = parseFloat(tr.querySelector('.oh-rate')?.value) || 0;
    const note = (tr.querySelector('.oh-note')?.value || '').trim();
    const activity = note || resName;
    if (!activity && !(qty > 0 && rate > 0)) return;
    overheads.push({ activity: activity || type, category: type, type, resourceId: resSel?.value || '', resource: resName, qty, rate, uom: (resSel?.selectedOptions?.[0]?.dataset.unit) || '', note, cost: Math.round(qty * rate * 100) / 100 });
  });

  // Labour snapshot from attendance + equipment (so period reports can aggregate).
  const attendance = Array.isArray(window.__dprAtt) ? window.__dprAtt : _dprAttForDate(date);
  const equipmentUsed = Array.isArray(window.__dprEquip) ? window.__dprEquip : _dprEquipForProject();
  const data = { date, weather: v('dpWeather'), area: v('dpArea'), workDone: v('dpWork'), manpowerSkilled: _num(v('dpSkilled')), manpowerUnskilled: _num(v('dpUnskilled')), equipment: v('dpEquip'), hindrance: v('dpHindrance'), safety: v('dpSafety'), quality: v('dpQuality'), materialsReceived: v('dpMatRecv'), instructions: v('dpInstr'), taskId: v('dpTask'), boqRef: v('dpBoq'), photo: _pendingPhoto || null, photoPath: _pendingPhotoPath || null, measurements, overheads, attendance, equipmentUsed, showProgress: (document.getElementById('dpShowProgress') ? !!document.getElementById('dpShowProgress').checked : true) };
  if (!state.dailyProgress) state.dailyProgress = [];
  if (id) { const r = state.dailyProgress.find(x => x.id === id); if (r) Object.assign(r, data); }
  else {
    // Continue the project's shared Measurement<->DPR series (NC/01, NC/02 …).
    const _proj = (state.projects || []).find(p => p.id === _pid());
    const dprNum = (typeof window._nextProjectSeries === 'function') ? window._nextProjectSeries(_proj?.clientId || '', _pid()) : '';
    state.dailyProgress.push(window.stampCreate({ id: dprId, projectId: _pid(), ...data, dprNum }));
  }

  // ── Feed measured work + overhead into the shared measurement pipeline. On an
  //    edit, first clear this DPR's prior lines so we don't double-count. ──
  let syncedLines = 0;
  if (typeof window.mpRecordWork === 'function') {
    if (id && typeof window.mpClearDpr === 'function') window.mpClearDpr(id);
    const byLoc = {};
    measurements.forEach(m => { (byLoc[m.location] = byLoc[m.location] || []).push(m); });
    const ohLoc = (data.area || Object.keys(byLoc)[0] || 'General').trim() || 'General';
    Object.keys(byLoc).forEach(loc => {
      const res = window.mpRecordWork({ date, locationId: loc, locationLabel: loc, items: byLoc[loc], overheads: (loc === ohLoc ? overheads : []), src: 'dpr', dprId });
      if (res) syncedLines += res.lines;
    });
    if (overheads.length && !byLoc[ohLoc]) {
      const res = window.mpRecordWork({ date, locationId: ohLoc, locationLabel: ohLoc, items: [], overheads, src: 'dpr', dprId });
      if (res) syncedLines += res.lines;
    }
  }

  _pendingPhoto = null; _pendingPhotoPath = null; saveAllData(); _exCloseModal();
  showToast(syncedLines ? `DPR saved — ${syncedLines} measurement/overhead line(s) synced to billing & cost` : 'DPR saved', 'success');
  renderExecution();
};

// ══════════════════════════════════════════════════════════
//  CONCRETE POUR CARD
// ══════════════════════════════════════════════════════════
function _renderPours(root) {
  const list = _arr('concretePours').sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  const rows = list.map(p => {
    const checks = POUR_CHECKS.filter(([k]) => p.checklist && p.checklist[k]).length;
    return `<div onclick="_exPourForm('${p.id}')" style="background:#fff;border:1px solid #e2e8f0;border-left:4px solid #f97316;border-radius:12px;padding:12px 14px;cursor:pointer;display:flex;justify-content:space-between;gap:10px;">
    <div style="min-width:0;"><div style="font-weight:800;color:#0f172a;font-size:13px;">${_esc(p.pourNo || 'Pour')} · ${_esc(p.element || '')} ${p.grade ? '<span style="font-weight:700;color:#f97316;">' + _esc(p.grade) + '</span>' : ''}</div>
    <div style="font-size:11px;color:#64748b;">${_esc(p.location || '')} · ${_num(p.volume).toFixed(2)} m³ · ${_esc(p.date)}</div>
    <div style="font-size:10px;color:#94a3b8;margin-top:3px;">Pre-pour checks ${checks}/${POUR_CHECKS.length} · Cubes: ${p.cubes || 0} · Slump: ${p.slump || '—'}${(p.vendorId || p.supplier) ? ' · &#127981; ' + _esc(_vendorName(p.vendorId) || p.supplier) : ''}${p.taskId ? ' · &#128197; ' + _esc(_taskName(p.taskId)) : ''}</div></div>
    <div style="display:flex;align-items:center;gap:6px;flex-shrink:0;">
      <button onclick="event.stopPropagation();_exPourPDF('${p.id}')" title="Print pour card" style="border:none;background:#fff7ed;color:#9a3412;border:1px solid #fed7aa;border-radius:8px;padding:4px 8px;cursor:pointer;font-size:11px;font-weight:700;">&#128424; PDF</button>
      ${_photoBtn('concretePours', p)}
      <button onclick="event.stopPropagation();_exDel('concretePours','${p.id}')" title="Delete" style="border:none;background:transparent;color:#cbd5e1;cursor:pointer;font-size:14px;">&#128465;&#65039;</button>
    </div></div>`; }).join('');
  root.innerHTML = _listShell('Concrete Pour Card', '+ New Pour Card', "_exPourForm()", rows, list.length);
}
window._exPourForm = function (id) {
  const p = id ? (state.concretePours || []).find(x => x.id === id) : null;
  _pendingPhoto = p?.photo || null; _pendingPhotoPath = p?.photoPath || null;
  const ck = p?.checklist || {};
  const nextNo = 'CPC-' + String((_arr('concretePours').length) + 1).padStart(3, '0');
  const sel = (opts, cur) => opts.map(o => `<option ${cur === o ? 'selected' : ''}>${o}</option>`).join('');
  _modal(`${_head(p ? 'Edit Pour Card' : 'Concrete Pour Card')}<div style="padding:20px;">
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:12px;">
      <div><label style="${_lbl}">Pour No.</label><input id="cpNo" value="${p ? _esc(p.pourNo) : nextNo}" style="${_inp}"></div>
      <div><label style="${_lbl}">Date</label><input id="cpDate" type="date" value="${p ? _esc(p.date) : _today()}" style="${_inp}"></div>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;margin-bottom:12px;">
      <div><label style="${_lbl}">Element</label><select id="cpElement" style="${_inp}">${sel(POUR_ELEMENTS, p?.element)}</select></div>
      <div><label style="${_lbl}">Grade</label><select id="cpGrade" style="${_inp}">${sel(GRADES, p?.grade || 'M25')}</select></div>
      <div><label style="${_lbl}">Volume (m³)</label><input id="cpVolume" type="number" step="any" value="${p ? p.volume || '' : ''}" style="${_inp}"></div>
    </div>
    <div style="margin-bottom:12px;"><label style="${_lbl}">Location / Grid</label><input id="cpLocation" placeholder="" value="${p ? _esc(p.location) : ''}" style="${_inp}"></div>
    <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;margin-bottom:12px;">
      <div><label style="${_lbl}">Start Time</label><input id="cpStart" type="time" value="${p ? _esc(p.startTime) : ''}" style="${_inp}"></div>
      <div><label style="${_lbl}">End Time</label><input id="cpEnd" type="time" value="${p ? _esc(p.endTime) : ''}" style="${_inp}"></div>
      <div><label style="${_lbl}">Slump (mm)</label><input id="cpSlump" type="number" value="${p ? p.slump || '' : ''}" style="${_inp}"></div>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;margin-bottom:12px;">
      <div><label style="${_lbl}">Cubes Cast</label><input id="cpCubes" type="number" value="${p ? p.cubes || '' : ''}" style="${_inp}"></div>
      <div><label style="${_lbl}">RMC Vendor</label>${_vendorSelect('cpVendor', p?.vendorId)}</div>
      <div><label style="${_lbl}">Batch / DC No.</label><input id="cpBatch" value="${p ? _esc(p.batchNo) : ''}" style="${_inp}"></div>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:12px;">
      <div><label style="${_lbl}">Related Task (Planning)</label>${_taskSelect('cpTask', p?.taskId)}</div>
      <div><label style="${_lbl}">Related BOQ Item</label>${_boqSelect('cpBoq', p?.boqRef)}</div>
    </div>
    <div style="margin:14px 0;padding:12px;background:#fff7ed;border:1px solid #fed7aa;border-radius:12px;">
      <div style="font-size:12px;font-weight:800;color:#9a3412;margin-bottom:8px;">Pre-Pour Checklist</div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;">
        ${POUR_CHECKS.map(([k, label]) => `<label style="display:flex;align-items:center;gap:7px;font-size:12px;color:#475569;cursor:pointer;"><input type="checkbox" id="cpck_${k}" ${ck[k] ? 'checked' : ''} style="width:15px;height:15px;accent-color:#f97316;"> ${label}</label>`).join('')}
      </div>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:12px;">
      <div><label style="${_lbl}">Approved / Checked By</label><input id="cpApproved" placeholder="Engineer name" value="${p ? _esc(p.approvedBy) : ''}" style="${_inp}"></div>
      <div><label style="${_lbl}">Status</label><select id="cpStatus" style="${_inp}">${sel(['Planned', 'In Progress', 'Completed'], p?.status || 'Completed')}</select></div>
    </div>
    <div style="margin-bottom:12px;"><label style="${_lbl}">Remarks</label><input id="cpRemarks" value="${p ? _esc(p.remarks) : ''}" style="${_inp}"></div>
    <div style="margin-bottom:14px;"><label style="${_lbl}">Photo</label><input type="file" accept="image/*" capture="environment" onchange="_exCapturePhoto(this,'cpPrev')" style="font-size:12px;"><div id="cpPrev">${_pendingPhoto ? `<img src="${_pendingPhoto}" style="max-height:120px;border-radius:10px;margin-top:6px;">` : (_pendingPhotoPath ? '<div style="font-size:12px;color:#c2401c;margin-top:6px;">&#10003; Photo attached</div>' : '')}</div></div>
    <button onclick="_exPourSave('${id || ''}')" style="width:100%;padding:11px;background:#f97316;color:#fff;border:none;border-radius:10px;font-weight:700;cursor:pointer;">${p ? 'Save Pour Card' : 'Create Pour Card'}</button>
  </div>`);
};
/** Fetch a Storage image as a base64 data URL so jsPDF can embed it. */
async function _fetchImageDataUrl(path) {
  try {
    const url = await signedExecUrl(path);
    if (!url) return null;
    const resp = await fetch(url);
    if (!resp.ok) return null;
    const blob = await resp.blob();
    return await new Promise(res => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = () => res(null); r.readAsDataURL(blob); });
  } catch { return null; }
}

// ── Daily Progress Report PDF — premium, dashboard-grade ──
window._exDprPdf = async function (id) {
  try {
    const d = (state.dailyProgress || []).find(x => x.id === id);
    if (!d) return showToast('DPR not found', 'error');
    if (!window.jspdf || !window.jspdf.jsPDF) return showToast('PDF library not loaded — refresh the page', 'error');
    const _photoData = (d.photo && typeof d.photo === 'string' && d.photo.startsWith('data:image'))
      ? d.photo : (d.photoPath ? await _fetchImageDataUrl(d.photoPath) : null);
    const proj = (state.projects || []).find(x => x.id === d.projectId) || {};
    const client = (state.clients || state.parties || []).find(c => c.id === (proj.clientId || proj.client)) || null;
    const clientName = (client && (client.name || client.company)) || proj.client || '';
    const company = state.companyProfile || state.company || {};
    const companyName = company.name || company.companyName || 'True Site Sync';
    const companyLogo = (company.logo && String(company.logo).startsWith('data:image')) ? company.logo : null;

    const doc = new window.jspdf.jsPDF('p', 'mm', 'a4');
    const pw = doc.internal.pageSize.getWidth(), ph = doc.internal.pageSize.getHeight();
    const ml = 16, mr = 16, cw = pw - ml - mr;
    const NAVY = [13, 23, 42], NAVY2 = [30, 41, 59], ORANGE = [234, 120, 28], RED = [198, 48, 28], AMBER = [202, 138, 4], BROWN = [124, 45, 18];
    const INK = [24, 32, 44], MUTED = [110, 122, 138], LINE = [228, 231, 237], SOFT = [248, 249, 251], WARM = [255, 244, 236], WARMB = [244, 220, 198];
    const F = (c) => doc.setFillColor(c[0], c[1], c[2]); const T = (c) => doc.setTextColor(c[0], c[1], c[2]); const D = (c) => doc.setDrawColor(c[0], c[1], c[2]);

    const att = (Array.isArray(d.attendance) && d.attendance.length) ? d.attendance : (_dprAttForDate(d.date) || []);
    const skilled = att.length ? att.filter(a => a.skilled).length : _num(d.manpowerSkilled);
    const unskilled = att.length ? (att.length - att.filter(a => a.skilled).length) : _num(d.manpowerUnskilled);
    const totalW = att.length || (skilled + unskilled);
    const measRows = (d.measurements || []).filter(m => (parseFloat(m.qty) || 0) > 0).map(m => [m.description || m.code || 'Item', (Math.round((parseFloat(m.qty) || 0) * 1000) / 1000).toLocaleString('en-IN'), m.uom || '—', m.location || '—']);
    const matRows = (d.overheads || []).filter(o => o.type === 'Material' && (parseFloat(o.qty) || 0) > 0).map(o => [o.resource || o.activity || 'Material', (Math.round((parseFloat(o.qty) || 0) * 1000) / 1000).toLocaleString('en-IN'), o.uom || '—']);
    const eqRaw = ((d.equipment || '') + ',' + (d.equipmentUsed || []).map(e => e.name).join(',')).split(',').map(s => s.trim()).filter(Boolean);
    const equipList = [...new Set(eqRaw.map(s => s.toLowerCase()))].map(low => eqRaw.find(s => s.toLowerCase() === low)).join(', ');
    let dayName = ''; try { dayName = new Date(d.date).toLocaleDateString('en-IN', { weekday: 'long' }); } catch (e) {}
    let prepBy = ''; try { prepBy = (getCurrentUser && getCurrentUser()?.name) || ''; } catch (e) {}

    // ═══ Header band ═══
    const HB = 36;
    F(NAVY); doc.rect(0, 0, pw, HB, 'F');
    F(NAVY2); doc.rect(0, HB - 9, pw, 9, 'F');
    F(ORANGE); doc.rect(0, 0, pw, 2.4, 'F');
    let hx = ml;
    if (companyLogo) { try { const fm = /^data:image\/(png|jpe?g)/i.exec(companyLogo); doc.addImage(companyLogo, (fm ? fm[1].toUpperCase().replace('JPG', 'JPEG') : 'PNG'), ml, 8, 13, 13); hx = ml + 17; } catch (e) {} }
    T([255, 255, 255]); doc.setFont('helvetica', 'bold'); doc.setFontSize(17); doc.text('DAILY PROGRESS REPORT', hx, 18);
    T([203, 213, 225]); doc.setFont('helvetica', 'normal'); doc.setFontSize(9.5); doc.text(proj.name || 'Project', hx, 25);
    const chipW = 52, chipX = pw - mr - chipW;
    F([255, 255, 255]); doc.roundedRect(chipX, 7, chipW, 22, 2.5, 2.5, 'F');
    T(MUTED); doc.setFont('helvetica', 'bold'); doc.setFontSize(6.5); doc.text('DPR NO.', chipX + 5, 12.5);
    T(NAVY); doc.setFont('helvetica', 'bold'); doc.setFontSize(13); doc.text(String(d.dprNum || '—'), chipX + 5, 18.5);
    T(MUTED); doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); doc.text(`${d.date || '—'}${dayName ? ' · ' + dayName : ''}`, chipX + 5, 24.5);
    let y = HB + 8;

    // ═══ Meta row ═══
    const meta = [['CLIENT', clientName || '—'], ['LOCATION', d.area || proj.location || '—'], ['WEATHER', d.weather || '—'], ['PREPARED BY', prepBy || '—']];
    const mcw = cw / meta.length;
    meta.forEach((m, i) => { const x = ml + i * mcw; T(MUTED); doc.setFont('helvetica', 'bold'); doc.setFontSize(6.8); doc.text(m[0], x, y); T(INK); doc.setFont('helvetica', 'normal'); doc.setFontSize(9); const tv = doc.splitTextToSize(String(m[1]), mcw - 4); doc.text(tv[0] || '—', x, y + 4.8); });
    y += 9; D(LINE); doc.setLineWidth(0.3); doc.line(ml, y, pw - mr, y); y += 6;

    // ═══ KPI cards ═══
    const cards = [[String(totalW), 'WORKERS', NAVY], [String(skilled), 'SKILLED', ORANGE], [String(unskilled), 'UNSKILLED', AMBER], [String(measRows.length), 'WORK ITEMS', BROWN], [String(matRows.length), 'MATERIALS', RED]];
    const gap = 4, tw = (cw - gap * (cards.length - 1)) / cards.length, tH = 20;
    cards.forEach((c, i) => { const x = ml + i * (tw + gap); F([255, 255, 255]); D(LINE); doc.setLineWidth(0.5); doc.roundedRect(x, y, tw, tH, 2.4, 2.4, 'FD'); F(c[2]); doc.roundedRect(x, y, tw, 2.6, 1, 1, 'F'); doc.rect(x, y + 1.3, tw, 1.3, 'F'); T(NAVY); doc.setFont('helvetica', 'bold'); doc.setFontSize(17); doc.text(c[0], x + tw / 2, y + 12, { align: 'center' }); T(MUTED); doc.setFont('helvetica', 'bold'); doc.setFontSize(6.4); doc.text(c[1], x + tw / 2, y + 16.6, { align: 'center' }); });
    y += tH + 9;

    const sec = (title) => { if (y > ph - 40) { doc.addPage(); y = 18; } T(NAVY); doc.setFont('helvetica', 'bold'); doc.setFontSize(11); doc.text(title, ml, y); const wdt = doc.getTextWidth(title); D(ORANGE); doc.setLineWidth(1.1); doc.line(ml, y + 1.9, ml + Math.min(wdt, 62), y + 1.9); T(INK); y += 6.5; };
    const headStyles = { fillColor: NAVY, textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 8.5, cellPadding: 2.6, halign: 'left' };
    const baseTable = (opts) => { doc.autoTable(Object.assign({ theme: 'grid', styles: { fontSize: 9, cellPadding: 2.6, textColor: INK, lineColor: LINE, lineWidth: 0.2 }, headStyles, alternateRowStyles: { fillColor: SOFT }, margin: { left: ml, right: mr } }, opts)); y = doc.lastAutoTable.finalY + 8; };

    sec('Work Done Today');
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9.5); T(INK);
    const wl = doc.splitTextToSize(d.workDone || 'No description recorded.', cw); wl.forEach((ln, i) => doc.text(ln, ml, y + i * 4.7)); y += wl.length * 4.7 + 7;

    if (measRows.length) { sec('Measurement — Work Executed'); baseTable({ startY: y, head: [['Item', 'Qty', 'Unit', 'Location']], columnStyles: { 1: { halign: 'right', fontStyle: 'bold' }, 2: { cellWidth: 22, halign: 'center' }, 3: { cellWidth: 36 } }, body: measRows }); }

    // ── Progress — Plan vs Actual (cumulative measured vs contract BOQ) ──
    const pva = (d.showProgress !== false && typeof window.mpPlanVsActual === 'function') ? window.mpPlanVsActual(d.projectId) : null;
    if (pva && pva.rows && pva.rows.length) {
      const todayByCode = {}; (d.measurements || []).forEach(m => { const c = m.code || m.description; todayByCode[c] = (todayByCode[c] || 0) + (parseFloat(m.qty) || 0); });
      sec('Progress — Plan vs Actual');
      // overall progress bar
      const opct = pva.overallPct || 0;
      T(NAVY); doc.setFont('helvetica', 'bold'); doc.setFontSize(9); doc.text('Overall Project Progress', ml, y + 1);
      T(RED); doc.setFontSize(11); doc.text(`${opct.toFixed(1)}%`, pw - mr, y + 1.5, { align: 'right' });
      y += 3.5;
      F([241, 245, 249]); doc.roundedRect(ml, y, cw, 7, 2, 2, 'F');
      const ocol = opct >= 100 ? RED : opct >= 50 ? ORANGE : AMBER;
      F(ocol); doc.roundedRect(ml, y, Math.max(3, cw * opct / 100), 7, 2, 2, 'F');
      y += 12;
      const pvaBody = pva.rows.map(r => {
        const today = todayByCode[r.code] || 0;
        return [r.description || r.code, `${r.plannedQty.toLocaleString('en-IN', { maximumFractionDigits: 2 })} ${r.uom || ''}`.trim(), today ? today.toLocaleString('en-IN', { maximumFractionDigits: 2 }) : '—', r.doneQty.toLocaleString('en-IN', { maximumFractionDigits: 2 }), r.remaining.toLocaleString('en-IN', { maximumFractionDigits: 2 }), '', `${r.pct.toFixed(0)}%`];
      });
      baseTable({
        startY: y,
        head: [['Item', 'Planned', 'Today', 'Done', 'Balance', 'Progress', '%']],
        columnStyles: { 1: { halign: 'right', cellWidth: 24 }, 2: { halign: 'right', cellWidth: 18 }, 3: { halign: 'right', cellWidth: 20, fontStyle: 'bold' }, 4: { halign: 'right', cellWidth: 20 }, 5: { cellWidth: 30 }, 6: { halign: 'right', cellWidth: 14, fontStyle: 'bold' } },
        body: pvaBody,
        didDrawCell: (data) => {
          if (data.section === 'body' && data.column.index === 5) {
            const r = pva.rows[data.row.index]; if (!r) return;
            const bx = data.cell.x + 2, bw = data.cell.width - 4, by = data.cell.y + data.cell.height / 2 - 1.4, bh = 2.8;
            doc.setFillColor(233, 237, 242); doc.roundedRect(bx, by, bw, bh, 1, 1, 'F');
            const c = r.pct >= 100 ? RED : r.pct >= 50 ? ORANGE : r.pct > 0 ? AMBER : [226, 232, 240];
            doc.setFillColor(c[0], c[1], c[2]); doc.roundedRect(bx, by, Math.max(0.8, bw * r.pct / 100), bh, 1, 1, 'F');
          }
        }
      });
    }

    if (att.length) {
      sec('Manpower — from Attendance');
      baseTable({ startY: y, head: [['Name', 'Designation', 'Type', 'Hours']], columnStyles: { 2: { cellWidth: 26 }, 3: { halign: 'right', cellWidth: 22 } }, body: att.map(a => [a.name || '—', a.designation || '—', a.skilled ? 'Skilled' : 'Unskilled', (a.hours !== '' && a.hours != null) ? (a.hours + 'h') : '—']) });
      y -= 3; F(WARM); D(WARMB); doc.setLineWidth(0.4); doc.roundedRect(ml, y, cw, 9, 2, 2, 'FD'); T(RED); doc.setFont('helvetica', 'bold'); doc.setFontSize(8.6); doc.text(`Present ${att.length}      Skilled ${skilled}      Unskilled ${unskilled}      Total man-days ${att.length}`, ml + 4, y + 5.9); y += 15;
    }

    if (equipList.trim()) { sec('Equipment Deployed'); const eqRows = equipList.split(', ').filter(Boolean).map((e, i) => [String(i + 1), e]); baseTable({ startY: y, head: [['#', 'Equipment']], columnStyles: { 0: { cellWidth: 14, halign: 'center' } }, body: eqRows }); }

    if (matRows.length || (d.materialsReceived || '').trim()) {
      sec('Materials');
      if ((d.materialsReceived || '').trim()) { T(MUTED); doc.setFont('helvetica', 'bold'); doc.setFontSize(7.5); doc.text('RECEIVED', ml, y + 1); T(INK); doc.setFont('helvetica', 'normal'); doc.setFontSize(9.5); const rl = doc.splitTextToSize(d.materialsReceived, cw - 26); rl.forEach((ln, i) => doc.text(ln, ml + 26, y + 1 + i * 4.4)); y += Math.max(rl.length * 4.4, 5) + 3; }
      if (matRows.length) { baseTable({ startY: y, head: [['Material Used', 'Qty', 'Unit']], columnStyles: { 1: { halign: 'right', fontStyle: 'bold' }, 2: { cellWidth: 22, halign: 'center' } }, body: matRows }); }
    }

    const notes = [['Weather', d.weather], ['Hindrances / Delays', d.hindrance], ['Safety Observations', d.safety], ['Quality / Tests', d.quality], ['Instructions / Visitors', d.instructions], ['Related Task', _taskName(d.taskId)]].filter(n => (n[1] || '').toString().trim());
    if (notes.length) {
      sec('Site Conditions & Notes');
      const colW = (cw - 6) / 2; let maxY = y;
      notes.forEach((n, i) => {
        const col = i % 2; const x = ml + col * (colW + 6);
        if (col === 0 && i > 0) y = maxY + 4;
        const val = doc.splitTextToSize(String(n[1]), colW - 8); const boxH = 8 + val.length * 4.4;
        if (col === 0 && y + boxH > ph - 30) { doc.addPage(); y = 18; maxY = y; }
        F(SOFT); D(LINE); doc.setLineWidth(0.4); doc.roundedRect(x, y, colW, boxH, 2, 2, 'FD');
        T(RED); doc.setFont('helvetica', 'bold'); doc.setFontSize(7.2); doc.text(n[0].toUpperCase(), x + 3.5, y + 5);
        T(INK); doc.setFont('helvetica', 'normal'); doc.setFontSize(9); val.forEach((ln, k) => doc.text(ln, x + 3.5, y + 9.5 + k * 4.4));
        maxY = Math.max(maxY, y + boxH);
      });
      y = maxY + 8;
    }

    if (_photoData) { try { const iw = 80, ih = 60; if (y + ih > ph - 34) { doc.addPage(); y = 18; } sec('Site Photo'); const fm = /^data:image\/(png|jpe?g)/i.exec(_photoData); const fmt = fm ? fm[1].toUpperCase().replace('JPG', 'JPEG') : 'JPEG'; D(LINE); doc.setLineWidth(0.6); doc.roundedRect(ml, y, iw + 2, ih + 2, 2, 2, 'S'); doc.addImage(_photoData, fmt, ml + 1, y + 1, iw, ih); y += ih + 9; } catch (e) {} }

    if (y > ph - 34) { doc.addPage(); y = 18; }
    const sy = Math.max(y + 6, ph - 26); const sw = cw / 3;
    [['Site Engineer', prepBy], ['Project Manager', ''], ['Client Representative', '']].forEach((s, i) => { const x = ml + i * sw; D(LINE); doc.setLineWidth(0.4); doc.line(x, sy, x + sw - 14, sy); T(INK); doc.setFont('helvetica', 'bold'); doc.setFontSize(8.5); doc.text(s[0], x, sy + 5); if (s[1]) { T(MUTED); doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); doc.text(s[1], x, sy + 9); } });

    const pages = doc.internal.getNumberOfPages();
    const footBrand = (company.name || company.companyName) ? `${companyName} · Daily Progress Report` : 'Daily Progress Report';
    for (let p = 1; p <= pages; p++) { doc.setPage(p); F(NAVY); doc.rect(0, ph - 6, pw, 6, 'F'); T([203, 213, 225]); doc.setFont('helvetica', 'normal'); doc.setFontSize(6.8); doc.text(footBrand, ml, ph - 2); doc.text(`${d.date || ''}`, pw / 2, ph - 2, { align: 'center' }); doc.text(`Page ${p} of ${pages}`, pw - mr, ph - 2, { align: 'right' }); }

    mobileSavePDF(doc, `DPR_${(d.dprNum || d.date || 'report').toString().replace(/[\\/ ]/g, '-')}.pdf`);
    showToast('DPR PDF downloaded');
  } catch (err) {
    console.error('DPR PDF failed:', err);
    showToast('PDF error: ' + (err && err.message ? err.message : err), 'error');
  }
};

// ── Printable Concrete Pour Card PDF ──
window._exPourPDF = function (id) {
  try {
    const p = (state.concretePours || []).find(x => x.id === id);
    if (!p) return showToast('Pour not found', 'error');
    if (!window.jspdf || !window.jspdf.jsPDF) return showToast('PDF library not loaded — refresh the page', 'error');
    const proj = (state.projects || []).find(x => x.id === p.projectId) || {};
    const doc = new window.jspdf.jsPDF('p', 'mm', 'a4');
    const pw = doc.internal.pageSize.getWidth(), ph = doc.internal.pageSize.getHeight();
    const ml = 14, mr = 14;
    const accent = [249, 115, 22];

    let y = (typeof window.getSimpleHeaderForPDF === 'function') ? window.getSimpleHeaderForPDF(doc, { ml, mr }) : 16;
    doc.setFillColor(accent[0], accent[1], accent[2]); doc.rect(ml, y, pw - ml - mr, 9, 'F');
    doc.setTextColor(255, 255, 255); doc.setFont('helvetica', 'bold'); doc.setFontSize(13);
    doc.text('CONCRETE POUR CARD', pw / 2, y + 6.2, { align: 'center' });
    y += 13; doc.setTextColor(0, 0, 0);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9);
    doc.text(`Project: ${proj.name || '—'}    |    Pour No: ${p.pourNo || '—'}    |    Date: ${p.date || '—'}`, ml, y);
    y += 3;

    const fld = (l, v) => [l, (v === undefined || v === null || v === '') ? '—' : String(v)];
    const dur = (p.startTime || '') + (p.endTime ? ' – ' + p.endTime : '');
    const pairs = [
      fld('Element', p.element), fld('Grade', p.grade),
      fld('Volume (m³)', p.volume), fld('Slump (mm)', p.slump),
      fld('Location / Grid', p.location), fld('Pour Time', dur),
      fld('Cubes Cast', p.cubes), fld('RMC Vendor', _vendorName(p.vendorId) || p.supplier),
      fld('Batch / DC No.', p.batchNo), fld('Status', p.status),
      fld('Linked Task', _taskName(p.taskId)), fld('BOQ Item', _boqLabel(p.boqRef)),
    ];
    const rows = [];
    for (let i = 0; i < pairs.length; i += 2) rows.push([pairs[i][0], pairs[i][1], pairs[i + 1] ? pairs[i + 1][0] : '', pairs[i + 1] ? pairs[i + 1][1] : '']);
    doc.autoTable({
      startY: y + 2, body: rows, theme: 'grid',
      styles: { fontSize: 9, cellPadding: 2.2 },
      columnStyles: { 0: { fontStyle: 'bold', cellWidth: 34, fillColor: [255, 247, 237] }, 1: { cellWidth: 62 }, 2: { fontStyle: 'bold', cellWidth: 34, fillColor: [255, 247, 237] }, 3: { cellWidth: 'auto' } },
      margin: { left: ml, right: mr },
    });
    y = doc.lastAutoTable.finalY + 6;

    doc.setFont('helvetica', 'bold'); doc.setFontSize(10); doc.setTextColor(154, 52, 18);
    doc.text('Pre-Pour Checklist', ml, y); doc.setTextColor(0);
    const ck = p.checklist || {};
    doc.autoTable({
      startY: y + 2, head: [['Check', 'Done']], body: POUR_CHECKS.map(([k, label]) => [label, ck[k] ? 'Yes' : 'No']),
      theme: 'grid', headStyles: { fillColor: accent, textColor: 255, fontSize: 8.5 },
      styles: { fontSize: 8.5, cellPadding: 1.8 }, columnStyles: { 1: { halign: 'center', cellWidth: 24 } }, margin: { left: ml, right: mr },
    });
    y = doc.lastAutoTable.finalY + 6;

    if (p.remarks) {
      doc.setFont('helvetica', 'bold'); doc.setFontSize(9); doc.text('Remarks:', ml, y);
      doc.setFont('helvetica', 'normal');
      doc.splitTextToSize(p.remarks, pw - ml - mr - 20).forEach((ln, i) => doc.text(ln, ml + 18, y + i * 4));
      y += 8;
    }

    const sy = Math.max(y + 10, ph - 32);
    doc.setFontSize(9); doc.setFont('helvetica', 'normal'); doc.setTextColor(0);
    const sigW = (pw - ml - mr) / 3;
    [['Prepared By', ''], ['Checked By', p.approvedBy || ''], ['Approved By', '']].forEach(([lbl, nm], i) => {
      const x = ml + i * sigW;
      doc.line(x, sy, x + sigW - 12, sy);
      doc.text(lbl + (nm ? ': ' + nm : ''), x, sy + 5);
    });

    mobileSavePDF(doc, `PourCard_${(p.pourNo || 'CPC').replace(/[\\/]/g, '-')}.pdf`);
    showToast('Pour card PDF downloaded');
  } catch (err) {
    console.error('Pour card PDF failed:', err);
    showToast('PDF error: ' + (err && err.message ? err.message : err), 'error');
  }
};

window._exPourSave = function (id) {
  const v = i => (document.getElementById(i)?.value || '').trim();
  const checklist = {}; POUR_CHECKS.forEach(([k]) => { checklist[k] = !!document.getElementById('cpck_' + k)?.checked; });
  const data = {
    pourNo: v('cpNo'), date: v('cpDate') || _today(), element: v('cpElement'), grade: v('cpGrade'),
    volume: _num(v('cpVolume')), location: v('cpLocation'), startTime: v('cpStart'), endTime: v('cpEnd'),
    slump: v('cpSlump'), cubes: _num(v('cpCubes')), vendorId: v('cpVendor'), supplier: _vendorName(v('cpVendor')), batchNo: v('cpBatch'),
    taskId: v('cpTask'), boqRef: v('cpBoq'),
    checklist, approvedBy: v('cpApproved'), status: v('cpStatus') || 'Completed', remarks: v('cpRemarks'), photo: _pendingPhoto || null, photoPath: _pendingPhotoPath || null,
  };
  if (!state.concretePours) state.concretePours = [];
  if (id) { const r = state.concretePours.find(x => x.id === id); if (r) Object.assign(r, data); }
  else state.concretePours.push(window.stampCreate({ id: 'cpc_' + Date.now(), projectId: _pid(), ...data }));
  _pendingPhoto = null; _pendingPhotoPath = null; saveAllData(); _exCloseModal(); showToast('Pour card saved', 'success'); renderExecution();
};

// ══════════════════════════════════════════════════════════
//  QUALITY
// ══════════════════════════════════════════════════════════
function _renderQuality(root) {
  const list = _arr('qualityChecks').sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  const rows = list.map(q => { const ok = q.status === 'Pass' || q.status === 'Closed'; const c = ok ? '#ef8420' : '#ef4444';
    return `<div onclick="_exQForm('${q.id}')" style="background:#fff;border:1px solid #e2e8f0;border-left:4px solid ${c};border-radius:12px;padding:12px 14px;cursor:pointer;display:flex;justify-content:space-between;gap:10px;">
    <div style="min-width:0;"><div style="font-weight:700;color:#0f172a;font-size:13px;">${_esc(q.type || 'Check')} <span style="font-size:9px;font-weight:800;color:${c};background:${c}15;border-radius:8px;padding:1px 7px;">${_esc(q.status || 'Open')}</span></div>
    <div style="font-size:11px;color:#64748b;">${_esc(q.element || '')} ${q.grade ? '· ' + _esc(q.grade) : ''}${q.result ? ' · ' + _esc(q.result) : ''} · ${_esc(q.date)}</div></div>
    ${_rowActions('qualityChecks', q)}</div>`; }).join('');
  root.innerHTML = _listShell('Quality', '+ Add Quality Record', "_exQForm()", rows, list.length);
}
window._exQForm = function (id) {
  const q = id ? (state.qualityChecks || []).find(x => x.id === id) : null;
  _pendingPhoto = q?.photo || null; _pendingPhotoPath = q?.photoPath || null;
  const sel = (opts, cur) => opts.map(o => `<option ${cur === o ? 'selected' : ''}>${o}</option>`).join('');
  _modal(`${_head(q ? 'Edit Quality Record' : 'Quality Record')}<div style="padding:20px;">
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:12px;">
      <div><label style="${_lbl}">Type</label><select id="qType" style="${_inp}">${sel(QUALITY_TYPES, q?.type)}</select></div>
      <div><label style="${_lbl}">Date</label><input id="qDate" type="date" value="${q ? _esc(q.date) : _today()}" style="${_inp}"></div>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:12px;">
      <div><label style="${_lbl}">Element / Location</label><input id="qElement" value="${q ? _esc(q.element) : ''}" style="${_inp}"></div>
      <div><label style="${_lbl}">Grade / Spec</label><input id="qGrade" placeholder="" value="${q ? _esc(q.grade) : ''}" style="${_inp}"></div>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:12px;">
      <div><label style="${_lbl}">Result / Value</label><input id="qResult" placeholder="" value="${q ? _esc(q.result) : ''}" style="${_inp}"></div>
      <div><label style="${_lbl}">Status</label><select id="qStatus" style="${_inp}">${sel(['Open', 'Pass', 'Fail', 'Closed'], q?.status || 'Open')}</select></div>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:12px;">
      <div><label style="${_lbl}">Related Concrete Pour</label>${_pourSelect('qPour', q?.pourId)}</div>
      <div><label style="${_lbl}">Related Task</label>${_taskSelect('qTask', q?.taskId)}</div>
    </div>
    <div style="margin-bottom:12px;"><label style="${_lbl}">Remarks</label><input id="qRemarks" value="${q ? _esc(q.remarks) : ''}" style="${_inp}"></div>
    <div style="margin-bottom:14px;"><label style="${_lbl}">Photo</label><input type="file" accept="image/*" capture="environment" onchange="_exCapturePhoto(this,'qPrev')" style="font-size:12px;"><div id="qPrev">${_pendingPhoto ? `<img src="${_pendingPhoto}" style="max-height:120px;border-radius:10px;margin-top:6px;">` : (_pendingPhotoPath ? '<div style="font-size:12px;color:#c2401c;margin-top:6px;">&#10003; Photo attached</div>' : '')}</div></div>
    <button onclick="_exQSave('${id || ''}')" style="width:100%;padding:11px;background:#ef8420;color:#fff;border:none;border-radius:10px;font-weight:700;cursor:pointer;">${q ? 'Save' : 'Add Record'}</button>
  </div>`);
};
window._exQSave = function (id) {
  const v = i => (document.getElementById(i)?.value || '').trim();
  const data = { type: v('qType') || 'Inspection', date: v('qDate') || _today(), element: v('qElement'), grade: v('qGrade'), result: v('qResult'), status: v('qStatus') || 'Open', pourId: v('qPour'), taskId: v('qTask'), remarks: v('qRemarks'), photo: _pendingPhoto || null, photoPath: _pendingPhotoPath || null };
  if (!state.qualityChecks) state.qualityChecks = [];
  if (id) { const r = state.qualityChecks.find(x => x.id === id); if (r) Object.assign(r, data); }
  else state.qualityChecks.push(window.stampCreate({ id: 'qc_' + Date.now(), projectId: _pid(), ...data }));
  _pendingPhoto = null; _pendingPhotoPath = null; saveAllData(); _exCloseModal(); showToast('Quality record saved', 'success'); renderExecution();
};

// ══════════════════════════════════════════════════════════
//  SAFETY
// ══════════════════════════════════════════════════════════
function _renderSafety(root) {
  const list = _arr('incidents').sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  const sevC = { Low: '#ef8420', Medium: '#f59e0b', High: '#f97316', Critical: '#ef4444' };
  const rows = list.map(s => { const c = sevC[s.severity] || '#94a3b8'; return `<div onclick="_exSForm('${s.id}')" style="background:#fff;border:1px solid #e2e8f0;border-left:4px solid ${c};border-radius:12px;padding:12px 14px;cursor:pointer;display:flex;justify-content:space-between;gap:10px;">
    <div style="min-width:0;"><div style="font-weight:700;color:#0f172a;font-size:13px;">${_esc(s.type || 'Safety')} <span style="font-size:9px;font-weight:800;color:${c};background:${c}15;border-radius:8px;padding:1px 7px;">${_esc(s.severity || '')}</span></div>
    <div style="font-size:11px;color:#64748b;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${_esc(s.description || '')}</div>
    <div style="font-size:10px;color:#94a3b8;margin-top:3px;">${_esc(s.location || '')} · ${_esc(s.date)}</div>${window.attributionHTML(s, 'Reported')}</div>
    ${_rowActions('incidents', s)}</div>`; }).join('');
  root.innerHTML = _listShell('Safety', '+ Add Safety Record', "_exSForm()", rows, list.length);
}
window._exSForm = function (id) {
  const s = id ? (state.incidents || []).find(x => x.id === id) : null;
  _pendingPhoto = s?.photo || null; _pendingPhotoPath = s?.photoPath || null;
  const sel = (opts, cur) => opts.map(o => `<option ${cur === o ? 'selected' : ''}>${o}</option>`).join('');
  _modal(`${_head(s ? 'Edit Safety Record' : 'Safety Record')}<div style="padding:20px;">
    <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;margin-bottom:12px;">
      <div><label style="${_lbl}">Type</label><select id="sType" style="${_inp}">${sel(SAFETY_TYPES, s?.type)}</select></div>
      <div><label style="${_lbl}">Severity</label><select id="sSev" style="${_inp}">${sel(SEVERITIES, s?.severity || 'Low')}</select></div>
      <div><label style="${_lbl}">Date</label><input id="sDate" type="date" value="${s ? _esc(s.date) : _today()}" style="${_inp}"></div>
    </div>
    <div style="margin-bottom:12px;"><label style="${_lbl}">Location</label><input id="sLocation" value="${s ? _esc(s.location) : ''}" style="${_inp}"></div>
    <div style="margin-bottom:12px;"><label style="${_lbl}">Description</label><textarea id="sDesc" rows="2" style="${_inp}resize:vertical;">${s ? _esc(s.description) : ''}</textarea></div>
    <div style="margin-bottom:12px;"><label style="${_lbl}">Action Taken</label><input id="sAction" value="${s ? _esc(s.actionTaken) : ''}" style="${_inp}"></div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:12px;">
      <div><label style="${_lbl}">Reported By</label><input id="sReporter" value="${s ? _esc(s.reportedBy) : ''}" style="${_inp}"></div>
      <div><label style="${_lbl}">Related Task</label>${_taskSelect('sTask', s?.taskId)}</div>
    </div>
    <div style="margin-bottom:14px;"><label style="${_lbl}">Photo</label><input type="file" accept="image/*" capture="environment" onchange="_exCapturePhoto(this,'sPrev')" style="font-size:12px;"><div id="sPrev">${_pendingPhoto ? `<img src="${_pendingPhoto}" style="max-height:120px;border-radius:10px;margin-top:6px;">` : (_pendingPhotoPath ? '<div style="font-size:12px;color:#c2401c;margin-top:6px;">&#10003; Photo attached</div>' : '')}</div></div>
    <button onclick="_exSSave('${id || ''}')" style="width:100%;padding:11px;background:#ef4444;color:#fff;border:none;border-radius:10px;font-weight:700;cursor:pointer;">${s ? 'Save' : 'Add Record'}</button>
  </div>`);
};
window._exSSave = function (id) {
  const v = i => (document.getElementById(i)?.value || '').trim();
  const data = { type: v('sType') || 'Incident', severity: v('sSev') || 'Low', date: v('sDate') || _today(), location: v('sLocation'), description: v('sDesc'), actionTaken: v('sAction'), reportedBy: v('sReporter'), taskId: v('sTask'), photo: _pendingPhoto || null, photoPath: _pendingPhotoPath || null };
  if (!state.incidents) state.incidents = [];
  if (id) { const r = state.incidents.find(x => x.id === id); if (r) Object.assign(r, data); }
  else state.incidents.push(window.stampCreate({ id: 'inc_' + Date.now(), projectId: _pid(), ...data }));
  _pendingPhoto = null; _pendingPhotoPath = null; saveAllData(); _exCloseModal(); showToast('Safety record saved', 'success'); renderExecution();
};

// ══════════════════════════════════════════════════════════
//  STAFF & ATTENDANCE — GPS + camera punch in/out, present-for-day, OT pay
// ══════════════════════════════════════════════════════════
const _STD_HRS = 8;
function _staffToday(staffId, date) { date = date || _today(); return (state.staffAttendance || []).find(a => a.staffId === staffId && a.date === date); }
function _hm(iso) { if (!iso) return '—'; try { return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }); } catch { return '—'; } }
function _money(n) { return '₹' + Math.round(Number(n) || 0).toLocaleString('en-IN'); }

/** Day pay + overtime for an attendance record, from the staff member's config.
 *  Two worlds, per staff: fixed daily/monthly wage (present = full day) OR
 *  hourly. Extra hours beyond the standard day are paid as OT only when the
 *  staff member has overtime enabled — otherwise they're presence-only. */
function _staffComputePay(staff, hours) {
  const std = _num(staff.standardHours) || _STD_HRS;
  const otAllowed = !!staff.otAllowed;
  const otHours = Math.max(0, +(hours - std).toFixed(2));
  const rate = _num(staff.rate);
  const mode = staff.wageMode || 'daily';
  let base = 0, perHour = 0;
  if (mode === 'hourly') { perHour = rate; base = Math.min(hours, std) * rate; }
  else if (mode === 'monthly') { perHour = (rate / 30) / std; base = rate / 30; }
  else { perHour = std ? rate / std : 0; base = rate; } // daily: present = full day
  const otRate = _num(staff.otRate) || +(perHour * 1.5).toFixed(2);
  const otPay = otAllowed ? +(otHours * otRate).toFixed(2) : 0;
  return { std, otHours: otAllowed ? otHours : 0, otRate, dayPay: +base.toFixed(2), otPay, totalPay: +(base + otPay).toFixed(2) };
}

function _renderStaff(root) {
  const staff = _arr('staffMaster');
  const month = _today().slice(0, 7);
  const canManage = typeof window.canManageStaff !== 'function' || window.canManageStaff();
  const cards = staff.map(s => {
    const a = _staffToday(s.id);
    let statusHtml, action;
    if (!a || !a.inAt) {
      statusHtml = `<span style="color:#94a3b8;font-weight:700;">Not marked</span>`;
      action = canManage ? `<button onclick="_staffPunch('${s.id}','in')" style="background:#c2401c;color:#fff;border:none;border-radius:9px;padding:8px 13px;font-weight:700;font-size:12px;cursor:pointer;">📍 In</button>` : `<span style="font-size:11px;color:#94a3b8;">🔒</span>`;
    } else if (!a.outAt) {
      statusHtml = `<span style="color:#c2401c;font-weight:800;">● Present</span> <span style="color:#64748b;">In ${_hm(a.inAt)}</span>`;
      action = canManage ? `<button onclick="_staffPunch('${s.id}','out')" style="background:#dc2626;color:#fff;border:none;border-radius:9px;padding:8px 13px;font-weight:700;font-size:12px;cursor:pointer;">📍 Out</button>` : `<span style="font-size:11px;color:#94a3b8;">🔒</span>`;
    } else {
      statusHtml = `<span style="color:#c2401c;font-weight:800;">✓ ${a.hours}h</span> <span style="color:#64748b;">${_hm(a.inAt)}–${_hm(a.outAt)}</span>${a.otHours > 0 ? ` <span style="color:#d97706;font-weight:700;">+${a.otHours}h OT</span>` : ''}`;
      action = `<span style="font-size:13px;font-weight:800;color:#0f172a;">${_money(a.totalPay)}</span>`;
    }
    const wage = s.wageMode || 'daily';
    const wageLabel = wage === 'hourly' ? `${_money(s.rate)}/hr` : (wage === 'monthly' ? `${_money(s.rate)}/mo` : `${_money(s.rate)}/day`);
    return `<div style="background:#fff;border:1px solid #e2e8f0;border-radius:16px;padding:14px;box-shadow:0 1px 3px rgba(0,0,0,.04);">
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:10px;">
        <div style="width:40px;height:40px;border-radius:12px;background:#7c3aed15;border:2px solid #7c3aed30;display:flex;align-items:center;justify-content:center;font-size:18px;overflow:hidden;flex-shrink:0;">${s.photo ? `<img src="${s.photo}" style="width:100%;height:100%;object-fit:cover;">` : '👤'}</div>
        <div style="flex:1;min-width:0;"><div style="font-weight:800;color:#0f172a;font-size:14px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${_esc(s.name)}</div><div style="font-size:11px;color:#64748b;">${_esc(s.designation || 'Staff')} · ${wageLabel}${s.otAllowed ? ' · <span style="color:#d97706;font-weight:700;">OT✓</span>' : ''}</div></div>
        <button onclick="_staffHistory('${s.id}')" title="History" style="border:none;background:#f1f5f9;border-radius:8px;padding:4px 7px;cursor:pointer;">🗓</button>
        ${canManage ? `<button onclick="_staffForm('${s.id}')" title="Edit" style="border:none;background:#f1f5f9;border-radius:8px;padding:4px 7px;cursor:pointer;">✏️</button>` : ''}
      </div>
      <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;padding-top:10px;border-top:1px solid #f1f5f9;">
        <div style="font-size:12px;">${statusHtml}</div>${action}
      </div>
      ${(a && a.inAt) ? window.attributionHTML(a, 'Marked') : ''}
    </div>`;
  }).join('');
  const rows = staff.map(s => {
    const recs = (state.staffAttendance || []).filter(a => a.staffId === s.id && (a.date || '').startsWith(month) && a.inAt);
    const present = recs.length;
    if (!present) return '';
    const hours = recs.reduce((t, a) => t + _num(a.hours), 0);
    const ot = recs.reduce((t, a) => t + _num(a.otHours), 0);
    const pay = recs.reduce((t, a) => t + _num(a.totalPay), 0);
    return `<tr style="border-bottom:1px solid #f1f5f9;"><td style="padding:8px 10px;font-weight:700;">${_esc(s.name)}</td><td style="padding:8px 10px;text-align:center;">${present}</td><td style="padding:8px 10px;text-align:right;">${hours.toFixed(1)}</td><td style="padding:8px 10px;text-align:right;color:#d97706;">${ot.toFixed(1)}</td><td style="padding:8px 10px;text-align:right;font-weight:800;">${_money(pay)}</td></tr>`;
  }).join('');
  const payroll = rows ? `<div style="margin-top:20px;background:#fff;border:1px solid #e2e8f0;border-radius:16px;overflow:hidden;">
    <div style="padding:12px 16px;border-bottom:1px solid #f1f5f9;font-weight:800;color:#0f172a;font-size:14px;">📅 Payroll this month (${month})</div>
    <div style="overflow-x:auto;"><table style="width:100%;font-size:12px;border-collapse:collapse;"><thead><tr style="background:#f8fafc;color:#64748b;text-transform:uppercase;font-size:10px;"><th style="padding:8px 10px;text-align:left;">Staff</th><th style="padding:8px 10px;">Present</th><th style="padding:8px 10px;text-align:right;">Hours</th><th style="padding:8px 10px;text-align:right;">OT hrs</th><th style="padding:8px 10px;text-align:right;">Pay</th></tr></thead><tbody>${rows}</tbody></table></div></div>` : '';
  root.innerHTML = `${_backBar('Staff & Attendance')}
    <div style="display:flex;flex-wrap:wrap;align-items:center;gap:10px;margin-bottom:14px;">
      ${canManage ? `<button onclick="_staffForm()" style="padding:9px 16px;background:#7c3aed;color:#fff;border:none;border-radius:10px;font-size:13px;font-weight:700;cursor:pointer;">+ Add Staff</button>` : `<span style="font-size:12px;color:#b45309;background:#fffbeb;border:1px solid #fde68a;border-radius:8px;padding:6px 10px;font-weight:700;">🔒 View only — your role can't mark or edit attendance</span>`}
      <span style="font-size:12px;color:#94a3b8;">${staff.length} staff · GPS + photo-verified punches</span>
      <span style="margin-left:auto;display:flex;gap:8px;">
        <button onclick="_staffExportExcel()" style="padding:8px 12px;background:#d6402c;color:#fff;border:none;border-radius:9px;font-size:12px;font-weight:700;cursor:pointer;">⬇ Excel</button>
        <button onclick="_staffExportPDF()" style="padding:8px 12px;background:#dc2626;color:#fff;border:none;border-radius:9px;font-size:12px;font-weight:700;cursor:pointer;">⬇ PDF</button>
      </span>
    </div>
    <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:12px;">${cards || '<div style="text-align:center;padding:40px;color:#94a3b8;">No staff yet.' + (canManage ? ' Tap “+ Add Staff”.' : '') + '</div>'}</div>
    ${payroll}`;
}

/** Month attendance/payroll dataset for exports: per-staff totals + day-wise hours. */
function _staffMonthData(month) {
  month = month || _today().slice(0, 7);
  const [y, m] = month.split('-').map(Number);
  const days = new Date(y, m, 0).getDate();
  const staff = _arr('staffMaster');
  const rows = staff.map(s => {
    const recs = (state.staffAttendance || []).filter(a => a.staffId === s.id && (a.date || '').startsWith(month) && a.inAt);
    const byDay = {};
    recs.forEach(a => { const d = +(a.date.slice(8, 10)); byDay[d] = (a.hours != null ? a.hours : 'P'); });
    return {
      name: s.name, designation: s.designation || '', wageMode: s.wageMode || 'daily', rate: _num(s.rate),
      present: recs.length,
      hours: +recs.reduce((t, a) => t + _num(a.hours), 0).toFixed(2),
      ot: +recs.reduce((t, a) => t + _num(a.otHours), 0).toFixed(2),
      dayPay: +recs.reduce((t, a) => t + _num(a.dayPay), 0).toFixed(2),
      otPay: +recs.reduce((t, a) => t + _num(a.otPay), 0).toFixed(2),
      total: +recs.reduce((t, a) => t + _num(a.totalPay), 0).toFixed(2),
      byDay
    };
  });
  return { month, days, rows };
}

window._staffExportExcel = function () {
  const XLSX = window.XLSX; if (!XLSX) { showToast('Excel library not loaded', 'error'); return; }
  const { month, days, rows } = _staffMonthData();
  if (!rows.length) { showToast('No staff to export', 'warning'); return; }
  const proj = (state.projects || []).find(p => p.id === _pid());
  // Sheet 1: Payroll summary
  const sum = [['STAFF ATTENDANCE & PAYROLL'], [`${proj?.name || ''}  |  Month: ${month}`], [],
    ['Staff', 'Designation', 'Wage', 'Present', 'Hours', 'OT hrs', 'Day Pay', 'OT Pay', 'Total Pay']];
  rows.forEach(r => sum.push([r.name, r.designation, r.wageMode, r.present, r.hours, r.ot, r.dayPay, r.otPay, r.total]));
  sum.push(['TOTAL', '', '', '', '', '', '', '', +rows.reduce((t, r) => t + r.total, 0).toFixed(2)]);
  const ws1 = XLSX.utils.aoa_to_sheet(sum);
  ws1['!cols'] = [{ wch: 22 }, { wch: 16 }, { wch: 9 }, { wch: 8 }, { wch: 8 }, { wch: 8 }, { wch: 11 }, { wch: 10 }, { wch: 12 }];
  // Sheet 2: Daily muster grid (hours per day; P = present w/o hours)
  const head = ['Staff', ...Array.from({ length: days }, (_, i) => String(i + 1))];
  const grid = [[`Muster — ${month}`], head];
  rows.forEach(r => grid.push([r.name, ...Array.from({ length: days }, (_, i) => (r.byDay[i + 1] != null ? r.byDay[i + 1] : ''))]));
  const ws2 = XLSX.utils.aoa_to_sheet(grid);
  ws2['!cols'] = [{ wch: 22 }, ...Array.from({ length: days }, () => ({ wch: 4 }))];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws1, 'Payroll');
  XLSX.utils.book_append_sheet(wb, ws2, 'Muster');
  mobileSaveXLSX(wb, `Attendance_${month}.xlsx`);
  showToast('Excel exported', 'success');
};

window._staffExportPDF = function () {
  if (!window.jspdf || !window.jspdf.jsPDF) { showToast('PDF library not loaded', 'error'); return; }
  const { month, rows } = _staffMonthData();
  if (!rows.length) { showToast('No staff to export', 'warning'); return; }
  const proj = (state.projects || []).find(p => p.id === _pid());
  const n2 = x => (Number(x) || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const doc = new window.jspdf.jsPDF('landscape');
  let y = getCompanyHeaderForPDF(doc);
  const pw = doc.internal.pageSize.getWidth();
  doc.setFontSize(13); doc.setFont('helvetica', 'bold'); doc.setTextColor(20);
  doc.text('STAFF ATTENDANCE & PAYROLL', pw / 2, y + 5, { align: 'center' });
  doc.setFontSize(9); doc.setFont('helvetica', 'normal'); doc.setTextColor(90);
  doc.text(`${proj?.name || ''}   |   Month: ${month}`, pw / 2, y + 10, { align: 'center' });
  const body = rows.map(r => [r.name, r.designation, r.wageMode, r.present, r.hours, r.ot, 'Rs. ' + n2(r.dayPay), 'Rs. ' + n2(r.otPay), 'Rs. ' + n2(r.total)]);
  body.push([{ content: 'TOTAL', colSpan: 8, styles: { fontStyle: 'bold', halign: 'right' } }, { content: 'Rs. ' + n2(rows.reduce((t, r) => t + r.total, 0)), styles: { fontStyle: 'bold', halign: 'right' } }]);
  doc.autoTable({
    startY: y + 14,
    head: [['Staff', 'Designation', 'Wage', 'Present', 'Hours', 'OT hrs', 'Day Pay', 'OT Pay', 'Total Pay']],
    body, theme: 'grid',
    headStyles: { fillColor: [124, 58, 237], textColor: 255, fontSize: 9, halign: 'center' },
    styles: { fontSize: 8.5, cellPadding: 2.5 },
    columnStyles: { 0: { cellWidth: 'auto' }, 3: { halign: 'center' }, 4: { halign: 'right' }, 5: { halign: 'right' }, 6: { halign: 'right' }, 7: { halign: 'right' }, 8: { halign: 'right' } },
    margin: { left: 10, right: 10 }
  });
  mobileSavePDF(doc, `Attendance_${month}.pdf`);
  showToast('PDF exported', 'success');
};

window._staffForm = function (id) {
  if (typeof window.canManageStaff === 'function' && !window.canManageStaff()) { showToast('You do not have permission to manage staff', 'error'); return; }
  const s = id ? (state.staffMaster || []).find(x => x.id === id) : null;
  const sel = (opts, cur) => opts.map(o => `<option value="${o.v}" ${cur === o.v ? 'selected' : ''}>${o.t}</option>`).join('');
  _modal(`${_head(s ? 'Edit Staff' : 'Add Staff')}<div style="padding:20px;">
    <div style="margin-bottom:12px;"><label style="${_lbl}">Name *</label><input id="stfName" style="${_inp}" value="${s ? _esc(s.name) : ''}"></div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:12px;">
      <div><label style="${_lbl}">Designation</label><input id="stfDesig" style="${_inp}" placeholder="Site Engineer…" value="${s ? _esc(s.designation || '') : ''}"></div>
      <div><label style="${_lbl}">Phone</label><input id="stfPhone" style="${_inp}" value="${s ? _esc(s.phone || '') : ''}"></div>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:12px;">
      <div><label style="${_lbl}">Wage Mode</label><select id="stfMode" style="${_inp}" onchange="_staffModeHint()">${sel([{ v: 'daily', t: 'Daily wage' }, { v: 'monthly', t: 'Monthly salary' }, { v: 'hourly', t: 'Hourly' }], (s && s.wageMode) || 'daily')}</select></div>
      <div><label style="${_lbl}"><span id="stfRateLbl">Rate (₹/day)</span></label><input id="stfRate" type="number" style="${_inp}" value="${s ? _num(s.rate) : ''}"></div>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:12px;">
      <div><label style="${_lbl}">Standard hours / day</label><input id="stfStd" type="number" style="${_inp}" value="${s ? (_num(s.standardHours) || 8) : 8}"></div>
      <div><label style="${_lbl}">OT rate (₹/hr)</label><input id="stfOtRate" type="number" style="${_inp}" placeholder="auto 1.5×" value="${s && s.otRate ? _num(s.otRate) : ''}"></div>
    </div>
    <label style="display:flex;align-items:flex-start;gap:9px;margin-bottom:16px;cursor:pointer;background:#faf5ff;border:1px solid #e9d5ff;border-radius:10px;padding:11px;"><input type="checkbox" id="stfOt" ${s && s.otAllowed ? 'checked' : ''} style="width:18px;height:18px;margin-top:1px;"><span style="font-size:12px;color:#334155;"><b>Overtime pay allowed</b> — extra hours beyond the standard day are paid at the OT rate. Leave off for staff who are present-for-day only (no extra pay for extra hours).</span></label>
    <button onclick="_staffSave('${id || ''}')" style="width:100%;padding:11px;background:#7c3aed;color:#fff;border:none;border-radius:10px;font-weight:700;cursor:pointer;">${s ? 'Save' : 'Add Staff'}</button>
    ${s ? `<button onclick="_staffDelete('${s.id}')" style="width:100%;margin-top:8px;padding:9px;background:#fff;color:#dc2626;border:1px solid #fecaca;border-radius:10px;font-weight:700;cursor:pointer;">Delete staff</button>` : ''}
  </div>`);
  setTimeout(_staffModeHint, 30);
};
window._staffModeHint = function () {
  const m = document.getElementById('stfMode')?.value;
  const l = document.getElementById('stfRateLbl');
  if (l) l.textContent = m === 'hourly' ? 'Rate (₹/hour)' : (m === 'monthly' ? 'Salary (₹/month)' : 'Rate (₹/day)');
};
window._staffSave = function (id) {
  if (typeof window.canManageStaff === 'function' && !window.canManageStaff()) { showToast('You do not have permission to manage staff', 'error'); return; }
  const v = i => (document.getElementById(i)?.value || '').trim();
  const name = v('stfName'); if (!name) { showToast('Name required', 'error'); return; }
  const data = { name, designation: v('stfDesig'), phone: v('stfPhone'), wageMode: v('stfMode') || 'daily', rate: _num(v('stfRate')), standardHours: _num(v('stfStd')) || 8, otRate: _num(v('stfOtRate')), otAllowed: !!document.getElementById('stfOt')?.checked, active: true };
  if (!state.staffMaster) state.staffMaster = [];
  if (id) { const r = state.staffMaster.find(x => x.id === id); if (r) Object.assign(r, data); }
  else state.staffMaster.push(window.stampCreate({ id: 'stf_' + Date.now(), projectId: _pid(), ...data }));
  saveAllData(); _exCloseModal(); showToast('Staff saved', 'success'); renderExecution();
};
window._staffDelete = function (id) {
  if (!confirm('Delete this staff member? Their attendance history stays in records.')) return;
  state.staffMaster = (state.staffMaster || []).filter(x => x.id !== id);
  saveAllData(); _exCloseModal(); showToast('Staff deleted'); renderExecution();
};

// ── GPS + camera punch flow ──
// _punchFile = the raw File (uploaded to Supabase Storage on confirm, keeping the
// record light); _punchPhoto = a small base64 fallback used only when offline.
let _punchPhoto = null, _punchGps = null, _punchFile = null;
window._staffPunch = async function (staffId, kind) {
  const s = (state.staffMaster || []).find(x => x.id === staffId); if (!s) return;
  _punchPhoto = null; _punchGps = null; _punchFile = null;
  const isIn = kind === 'in';
  _modal(`${_head((isIn ? 'Punch In' : 'Punch Out') + ' — ' + _esc(s.name))}<div style="padding:20px;">
    <div style="text-align:center;margin-bottom:14px;"><div style="font-size:34px;font-weight:800;color:${isIn ? '#c2401c' : '#dc2626'};">${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div><div style="font-size:12px;color:#94a3b8;">${_today()}</div></div>
    <div style="display:flex;align-items:center;gap:8px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:10px 12px;margin-bottom:12px;font-size:12px;color:#64748b;">📍 <span id="punchGpsTxt">Getting location…</span></div>
    <label style="display:block;border:2px dashed #c4b5fd;background:#faf5ff;border-radius:12px;padding:16px;text-align:center;cursor:pointer;margin-bottom:14px;">
      <div style="font-size:26px;">📷</div><div style="font-size:12px;font-weight:700;color:#6d28d9;">Tap to capture photo *</div>
      <input type="file" accept="image/*" capture="user" onchange="_staffPunchPhoto(this)" style="display:none;"><div id="punchPrev" style="margin-top:8px;"></div></label>
    <button onclick="_staffPunchSave('${staffId}','${kind}')" style="width:100%;padding:12px;background:${isIn ? '#c2401c' : '#dc2626'};color:#fff;border:none;border-radius:10px;font-weight:800;cursor:pointer;">Confirm ${isIn ? 'Punch In' : 'Punch Out'}</button>
  </div>`);
  const gps = await getGps();
  _punchGps = gps;
  const t = document.getElementById('punchGpsTxt');
  if (t) t.textContent = gps ? gpsLabel(gps) : 'Location unavailable — will save without GPS';
};
window._staffPunchPhoto = function (input) {
  const file = input.files && input.files[0]; if (!file) return;
  _punchFile = file;   // uploaded to Storage on confirm
  const reader = new FileReader();
  reader.onload = e => {
    const img = new Image();
    img.onload = () => {
      const max = 720, sc = Math.min(1, max / (img.width || max));
      const w = Math.round(img.width * sc), h = Math.round(img.height * sc);
      const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
      cv.getContext('2d').drawImage(img, 0, 0, w, h);
      try { _punchPhoto = cv.toDataURL('image/jpeg', 0.55); } catch { _punchPhoto = null; }
      const p = document.getElementById('punchPrev');
      if (p && _punchPhoto) p.innerHTML = `<img src="${_punchPhoto}" style="max-height:120px;border-radius:10px;">`;
    };
    img.onerror = () => { _punchPhoto = null; };
    img.src = e.target.result;
  };
  reader.readAsDataURL(file);
};
window._staffPunchSave = async function (staffId, kind) {
  if (typeof window.canManageStaff === 'function' && !window.canManageStaff()) { showToast('You do not have permission to mark attendance', 'error'); return; }
  const s = (state.staffMaster || []).find(x => x.id === staffId); if (!s) return;
  if (!_punchPhoto && !_punchFile) { showToast('Capture a photo to verify the punch', 'error'); return; }
  const now = new Date().toISOString(), date = _today();
  if (!state.staffAttendance) state.staffAttendance = [];
  let a = _staffToday(staffId, date);
  if (kind === 'in' && a && a.inAt) { showToast('Already punched in today', 'info'); return; }
  if (kind === 'out' && (!a || !a.inAt)) { showToast('Punch in first', 'error'); return; }
  // Upload the photo to Supabase Storage (light record); fall back to base64 if
  // offline so the punch still works on site.
  let path = null;
  if (_punchFile) { try { const ref = await uploadExecMedia(_punchFile, 'staff', 'staff'); if (ref) path = ref.path; } catch {} }
  const photoB64 = path ? null : _punchPhoto;   // only keep base64 when upload didn't happen
  if (kind === 'in') {
    if (!a) { a = window.stampCreate({ id: 'att_' + Date.now(), staffId, projectId: _pid(), date, status: 'Present' }); state.staffAttendance.push(a); }
    a.inAt = now; a.inGps = _punchGps || null; a.inPhotoPath = path; a.inPhoto = photoB64; a.status = 'Present';
  } else {
    a.outAt = now; a.outGps = _punchGps || null; a.outPhotoPath = path; a.outPhoto = photoB64;
    a.hours = Math.max(0, +((new Date(a.outAt) - new Date(a.inAt)) / 3600000).toFixed(2));
    const pay = _staffComputePay(s, a.hours);
    a.otHours = pay.otHours; a.otRate = pay.otRate; a.dayPay = pay.dayPay; a.otPay = pay.otPay; a.totalPay = pay.totalPay;
  }
  _punchPhoto = null; _punchGps = null; _punchFile = null;
  saveAllData(); _exCloseModal();
  showToast(kind === 'in' ? `${s.name} marked Present` : `${s.name} punched out · ${a.hours}h`, 'success');
  renderExecution();
};
window._staffHistory = function (id) {
  const s = (state.staffMaster || []).find(x => x.id === id); if (!s) return;
  const recs = (state.staffAttendance || []).filter(a => a.staffId === id).sort((a, b) => (b.date || '').localeCompare(a.date || '')).slice(0, 60);
  const rows = recs.map(a => `<tr style="border-bottom:1px solid #f1f5f9;">
    <td style="padding:6px 8px;">${a.date}</td>
    <td style="padding:6px 8px;">${_hm(a.inAt)}${a.inGps ? ` <span title="${gpsLabel(a.inGps)}" style="color:#7c3aed;">📍</span>` : ''}${(a.inPhoto || a.inPhotoPath) ? ` <span onclick="_staffPhotoView('${a.id}','in')" style="cursor:pointer;">📷</span>` : ''}</td>
    <td style="padding:6px 8px;">${_hm(a.outAt)}${a.outGps ? ` <span title="${gpsLabel(a.outGps)}" style="color:#7c3aed;">📍</span>` : ''}${(a.outPhoto || a.outPhotoPath) ? ` <span onclick="_staffPhotoView('${a.id}','out')" style="cursor:pointer;">📷</span>` : ''}</td>
    <td style="padding:6px 8px;text-align:right;">${a.hours != null ? a.hours + 'h' : '—'}</td>
    <td style="padding:6px 8px;text-align:right;color:#d97706;">${a.otHours ? a.otHours + 'h' : ''}</td>
    <td style="padding:6px 8px;text-align:right;font-weight:700;">${a.totalPay != null ? _money(a.totalPay) : '—'}</td>
  </tr>`).join('') || '<tr><td colspan="6" style="padding:20px;text-align:center;color:#94a3b8;">No attendance yet.</td></tr>';
  _modal(`${_head('Attendance — ' + _esc(s.name))}<div style="padding:16px 20px;max-height:70vh;overflow:auto;"><div style="overflow-x:auto;"><table style="width:100%;font-size:12px;border-collapse:collapse;"><thead><tr style="background:#f8fafc;color:#64748b;text-transform:uppercase;font-size:10px;"><th style="padding:6px 8px;text-align:left;">Date</th><th style="padding:6px 8px;text-align:left;">In</th><th style="padding:6px 8px;text-align:left;">Out</th><th style="padding:6px 8px;text-align:right;">Hrs</th><th style="padding:6px 8px;text-align:right;">OT</th><th style="padding:6px 8px;text-align:right;">Pay</th></tr></thead><tbody>${rows}</tbody></table></div></div>`);
};
window._staffPhotoView = async function (attId, which) {
  const a = (state.staffAttendance || []).find(x => x.id === attId); if (!a) return;
  let src = which === 'in' ? a.inPhoto : a.outPhoto;
  const path = which === 'in' ? a.inPhotoPath : a.outPhotoPath;
  let lb = document.getElementById('exLightbox');
  if (!lb) { lb = document.createElement('div'); lb.id = 'exLightbox'; lb.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.88);z-index:200001;display:flex;align-items:center;justify-content:center;padding:24px;cursor:zoom-out;'; lb.addEventListener('click', () => lb.remove()); document.body.appendChild(lb); }
  if (!src && path) { lb.innerHTML = '<div style="color:#fff;font-size:13px;opacity:.7;">Loading photo…</div>'; src = await signedExecUrl(path); if (!document.getElementById('exLightbox')) return; }
  lb.innerHTML = src ? `<img src="${src}" style="max-width:96%;max-height:92%;border-radius:12px;">` : '<div style="color:#fff;">Could not load photo</div>';
};
