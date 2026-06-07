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
import { showToast } from './utils.js';
import { getCurrentUser } from './rbac.js';

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
let _pendingPhoto = null;

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
  if (_section === 'milestones') return _renderMilestones(root);
  if (_section === 'quality') return _renderQuality(root);
  if (_section === 'safety') return _renderSafety(root);
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
  const card = (icon, color, title, sub, sec, count) => `
    <div onclick="_exOpen('${sec}')" style="background:#fff;border:1px solid #e2e8f0;border-radius:16px;padding:20px 16px;cursor:pointer;transition:.15s;box-shadow:0 1px 3px rgba(0,0,0,.04);position:relative;" onmouseover="this.style.transform='translateY(-2px)';this.style.boxShadow='0 8px 24px rgba(0,0,0,.08)'" onmouseout="this.style.transform='';this.style.boxShadow='0 1px 3px rgba(0,0,0,.04)'">
      ${count != null ? `<span style="position:absolute;top:10px;right:12px;font-size:11px;font-weight:800;color:${color};background:${color}15;border:1px solid ${color}30;border-radius:9px;padding:1px 7px;">${count}</span>` : ''}
      <div style="width:50px;height:50px;background:${color}15;border:2px solid ${color}30;border-radius:14px;display:flex;align-items:center;justify-content:center;font-size:24px;margin-bottom:10px;">${icon}</div>
      <div style="font-size:13px;font-weight:700;color:#0f172a;">${title}</div>
      <div style="font-size:10px;color:#94a3b8;margin-top:2px;">${sub}</div>
    </div>`;
  root.innerHTML = `
    <h2 class="text-3xl font-extrabold text-slate-800 mb-1">Site Execution</h2>
    <p class="text-sm text-slate-400 mb-5">Daily progress, concrete pours, milestones, quality & safety</p>
    <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(165px,1fr));gap:12px;">
      ${card('&#128202;', '#1e3a8a', 'Dashboard', 'Overview & KPIs', 'dashboard')}
      ${card('&#128221;', '#0ea5e9', 'Daily Progress', 'DPR — work done daily', 'dpr', _arr('dailyProgress').length)}
      ${card('&#129521;', '#f97316', 'Concrete Pour Card', 'Pour records & checks', 'pour', _arr('concretePours').length)}
      ${card('&#127937;', '#6366f1', 'Milestones', 'Planned vs actual', 'milestones', _arr('milestones').length)}
      ${card('&#9989;', '#10b981', 'Quality', 'Cube tests, NCR, checks', 'quality', _arr('qualityChecks').length)}
      ${card('&#9937;', '#ef4444', 'Safety', 'Incidents & PPE', 'safety', _arr('incidents').length)}
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
  const ms = _arr('milestones');
  const msDone = ms.filter(m => m.status === 'Completed').length;
  const q = _arr('qualityChecks');
  const qOpen = q.filter(x => x.status !== 'Closed' && x.status !== 'Pass').length;
  const safety = _arr('incidents');
  const kpi = (l, v, c, i) => `<div style="background:#fff;border:1px solid #e2e8f0;border-radius:16px;padding:16px;"><div style="display:flex;justify-content:space-between;align-items:center;"><div><div style="font-size:11px;text-transform:uppercase;letter-spacing:.05em;color:#94a3b8;font-weight:700;">${l}</div><div style="font-size:26px;font-weight:800;color:${c};margin-top:2px;">${v}</div></div><div style="font-size:26px;opacity:.25;">${i}</div></div></div>`;
  root.innerHTML = `${_backBar('Execution Dashboard')}
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px;">
      ${kpi('DPRs this month', dprThisMonth, '#0ea5e9', '&#128221;')}
      ${kpi('Concrete poured', pourVol.toFixed(1) + ' m³', '#f97316', '&#129521;')}
      ${kpi('Pours logged', pours.length, '#f59e0b', '&#128203;')}
      ${kpi('Milestones done', msDone + ' / ' + ms.length, '#6366f1', '&#127937;')}
      ${kpi('Open quality items', qOpen, '#10b981', '&#9989;')}
      ${kpi('Safety records', safety.length, '#ef4444', '&#9937;')}
    </div>`;
}

// ══════════════════════════════════════════════════════════
//  shared list shell + modal
// ══════════════════════════════════════════════════════════
function _modal(html) {
  let o = document.getElementById('exModalOverlay');
  if (!o) {
    o = document.createElement('div'); o.id = 'exModalOverlay';
    o.style.cssText = 'position:fixed;inset:0;background:rgba(15,23,42,.55);backdrop-filter:blur(3px);z-index:200000;display:flex;align-items:center;justify-content:center;padding:16px;';
    o.addEventListener('click', e => { if (e.target === o) _exCloseModal(); });
    document.body.appendChild(o);
  }
  o.innerHTML = `<div style="background:#fff;border-radius:18px;max-width:600px;width:100%;max-height:92vh;overflow:auto;box-shadow:0 24px 60px rgba(0,0,0,.3);">${html}</div>`;
  o.style.display = 'flex';
}
window._exCloseModal = function () { const o = document.getElementById('exModalOverlay'); if (o) o.style.display = 'none'; _pendingPhoto = null; };
const _inp = 'width:100%;padding:9px 11px;border:1px solid #e2e8f0;border-radius:10px;font-size:13px;box-sizing:border-box;';
const _lbl = 'display:block;font-size:11px;font-weight:700;color:#64748b;margin-bottom:3px;';
const _head = (t) => `<div style="padding:18px 20px;border-bottom:1px solid #f1f5f9;display:flex;justify-content:space-between;align-items:center;"><h3 style="font-weight:800;color:#0f172a;font-size:17px;">${t}</h3><button onclick="_exCloseModal()" style="border:none;background:#f1f5f9;border-radius:8px;width:28px;height:28px;cursor:pointer;color:#64748b;font-size:16px;">×</button></div>`;

window._exCapturePhoto = async function (input, previewId) {
  const file = input.files && input.files[0]; const prev = document.getElementById(previewId);
  if (!file) return;
  try { if (prev) prev.innerHTML = '<span style="font-size:12px;color:#94a3b8;">Compressing…</span>';
    _pendingPhoto = await _compressImage(file);
    if (prev) prev.innerHTML = _pendingPhoto ? `<img src="${_pendingPhoto}" style="max-height:120px;border-radius:10px;border:1px solid #e2e8f0;margin-top:6px;">` : '';
  } catch { _pendingPhoto = null; }
};
window._exLightbox = function (key, id) {
  const r = (state[key] || []).find(x => x.id === id); if (!r || !r.photo) return;
  let lb = document.getElementById('exLightbox');
  if (!lb) { lb = document.createElement('div'); lb.id = 'exLightbox'; lb.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.88);z-index:200001;display:flex;align-items:center;justify-content:center;padding:24px;cursor:zoom-out;'; lb.addEventListener('click', () => lb.remove()); document.body.appendChild(lb); }
  lb.innerHTML = `<img src="${r.photo}" style="max-width:96%;max-height:92%;border-radius:12px;">`;
};

function _delRow(key, id, re) {
  if (!confirm('Delete this record?')) return;
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
function _photoBtn(key, r) { return r.photo ? `<button onclick="event.stopPropagation();_exLightbox('${key}','${r.id}')" title="Photo" style="border:none;background:#f1f5f9;border-radius:8px;padding:4px 7px;cursor:pointer;font-size:14px;">&#128247;</button>` : ''; }
function _rowActions(key, r) {
  return `<div style="display:flex;align-items:center;gap:6px;flex-shrink:0;">${_photoBtn(key, r)}<button onclick="event.stopPropagation();_exDel('${key}','${r.id}')" title="Delete" style="border:none;background:transparent;color:#cbd5e1;cursor:pointer;font-size:14px;">&#128465;&#65039;</button></div>`;
}

// ══════════════════════════════════════════════════════════
//  DAILY PROGRESS REPORT
// ══════════════════════════════════════════════════════════
function _renderDPR(root) {
  const list = _arr('dailyProgress').sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  const rows = list.map(d => `<div onclick="_exDprForm('${d.id}')" style="background:#fff;border:1px solid #e2e8f0;border-left:4px solid #0ea5e9;border-radius:12px;padding:12px 14px;cursor:pointer;display:flex;justify-content:space-between;gap:10px;">
    <div style="min-width:0;"><div style="font-weight:700;color:#0f172a;font-size:13px;">${_esc(d.date)} ${d.weather ? '· ' + _esc(d.weather) : ''}${d.area ? ' · ' + _esc(d.area) : ''}</div>
    <div style="font-size:11px;color:#64748b;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${_esc(d.workDone || '')}</div>
    <div style="font-size:10px;color:#94a3b8;margin-top:3px;">&#128100; ${(_num(d.manpowerSkilled) + _num(d.manpowerUnskilled)) || 0} workers${d.hindrance ? ' · ⚠ ' + _esc(d.hindrance.slice(0, 30)) : ''}</div></div>
    ${_rowActions('dailyProgress', d)}</div>`).join('');
  root.innerHTML = _listShell('Daily Progress Report', '+ Add DPR', "_exDprForm()", rows, list.length);
}
window._exDprForm = function (id) {
  const d = id ? (state.dailyProgress || []).find(x => x.id === id) : null;
  _pendingPhoto = d?.photo || null;
  _modal(`${_head(d ? 'Edit DPR' : 'Daily Progress Report')}<div style="padding:20px;">
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:12px;">
      <div><label style="${_lbl}">Date</label><input id="dpDate" type="date" value="${d ? _esc(d.date) : _today()}" style="${_inp}"></div>
      <div><label style="${_lbl}">Weather</label><input id="dpWeather" placeholder="e.g. Clear / Rainy" value="${d ? _esc(d.weather) : ''}" style="${_inp}"></div>
    </div>
    <div style="margin-bottom:12px;"><label style="${_lbl}">Area / Location</label><input id="dpArea" placeholder="e.g. Block A, 2nd floor" value="${d ? _esc(d.area) : ''}" style="${_inp}"></div>
    <div style="margin-bottom:12px;"><label style="${_lbl}">Work Done Today</label><textarea id="dpWork" rows="3" placeholder="Describe today's progress…" style="${_inp}resize:vertical;">${d ? _esc(d.workDone) : ''}</textarea></div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:12px;">
      <div><label style="${_lbl}">Manpower — Skilled</label><input id="dpSkilled" type="number" value="${d ? d.manpowerSkilled || '' : ''}" style="${_inp}"></div>
      <div><label style="${_lbl}">Manpower — Unskilled</label><input id="dpUnskilled" type="number" value="${d ? d.manpowerUnskilled || '' : ''}" style="${_inp}"></div>
    </div>
    <div style="margin-bottom:12px;"><label style="${_lbl}">Equipment Deployed</label><input id="dpEquip" placeholder="e.g. 1 JCB, 2 mixers" value="${d ? _esc(d.equipment) : ''}" style="${_inp}"></div>
    <div style="margin-bottom:12px;"><label style="${_lbl}">Hindrances / Delays</label><input id="dpHindrance" placeholder="Any blockers" value="${d ? _esc(d.hindrance) : ''}" style="${_inp}"></div>
    <div style="margin-bottom:14px;"><label style="${_lbl}">Site Photo</label><input type="file" accept="image/*" capture="environment" onchange="_exCapturePhoto(this,'dpPrev')" style="font-size:12px;"><div id="dpPrev">${_pendingPhoto ? `<img src="${_pendingPhoto}" style="max-height:120px;border-radius:10px;margin-top:6px;">` : ''}</div></div>
    <button onclick="_exDprSave('${id || ''}')" style="width:100%;padding:11px;background:#1e3a8a;color:#fff;border:none;border-radius:10px;font-weight:700;cursor:pointer;">${d ? 'Save' : 'Create DPR'}</button>
  </div>`);
};
window._exDprSave = function (id) {
  const v = i => (document.getElementById(i)?.value || '').trim();
  const data = { date: v('dpDate') || _today(), weather: v('dpWeather'), area: v('dpArea'), workDone: v('dpWork'), manpowerSkilled: _num(v('dpSkilled')), manpowerUnskilled: _num(v('dpUnskilled')), equipment: v('dpEquip'), hindrance: v('dpHindrance'), photo: _pendingPhoto || null };
  if (!state.dailyProgress) state.dailyProgress = [];
  if (id) { const r = state.dailyProgress.find(x => x.id === id); if (r) Object.assign(r, data); }
  else state.dailyProgress.push({ id: 'dpr_' + Date.now(), projectId: _pid(), createdBy: getCurrentUser()?.id || '', createdAt: Date.now(), ...data });
  _pendingPhoto = null; saveAllData(); _exCloseModal(); showToast('DPR saved', 'success'); renderExecution();
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
    <div style="font-size:10px;color:#94a3b8;margin-top:3px;">Pre-pour checks ${checks}/${POUR_CHECKS.length} · Cubes: ${p.cubes || 0} · Slump: ${p.slump || '—'}</div></div>
    ${_rowActions('concretePours', p)}</div>`; }).join('');
  root.innerHTML = _listShell('Concrete Pour Card', '+ New Pour Card', "_exPourForm()", rows, list.length);
}
window._exPourForm = function (id) {
  const p = id ? (state.concretePours || []).find(x => x.id === id) : null;
  _pendingPhoto = p?.photo || null;
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
    <div style="margin-bottom:12px;"><label style="${_lbl}">Location / Grid</label><input id="cpLocation" placeholder="e.g. Grid A1–A3, Footing F1" value="${p ? _esc(p.location) : ''}" style="${_inp}"></div>
    <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;margin-bottom:12px;">
      <div><label style="${_lbl}">Start Time</label><input id="cpStart" type="time" value="${p ? _esc(p.startTime) : ''}" style="${_inp}"></div>
      <div><label style="${_lbl}">End Time</label><input id="cpEnd" type="time" value="${p ? _esc(p.endTime) : ''}" style="${_inp}"></div>
      <div><label style="${_lbl}">Slump (mm)</label><input id="cpSlump" type="number" value="${p ? p.slump || '' : ''}" style="${_inp}"></div>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;margin-bottom:12px;">
      <div><label style="${_lbl}">Cubes Cast</label><input id="cpCubes" type="number" value="${p ? p.cubes || '' : ''}" style="${_inp}"></div>
      <div><label style="${_lbl}">RMC Supplier</label><input id="cpSupplier" placeholder="Supplier / site mix" value="${p ? _esc(p.supplier) : ''}" style="${_inp}"></div>
      <div><label style="${_lbl}">Batch / DC No.</label><input id="cpBatch" value="${p ? _esc(p.batchNo) : ''}" style="${_inp}"></div>
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
    <div style="margin-bottom:14px;"><label style="${_lbl}">Photo</label><input type="file" accept="image/*" capture="environment" onchange="_exCapturePhoto(this,'cpPrev')" style="font-size:12px;"><div id="cpPrev">${_pendingPhoto ? `<img src="${_pendingPhoto}" style="max-height:120px;border-radius:10px;margin-top:6px;">` : ''}</div></div>
    <button onclick="_exPourSave('${id || ''}')" style="width:100%;padding:11px;background:#f97316;color:#fff;border:none;border-radius:10px;font-weight:700;cursor:pointer;">${p ? 'Save Pour Card' : 'Create Pour Card'}</button>
  </div>`);
};
window._exPourSave = function (id) {
  const v = i => (document.getElementById(i)?.value || '').trim();
  const checklist = {}; POUR_CHECKS.forEach(([k]) => { checklist[k] = !!document.getElementById('cpck_' + k)?.checked; });
  const data = {
    pourNo: v('cpNo'), date: v('cpDate') || _today(), element: v('cpElement'), grade: v('cpGrade'),
    volume: _num(v('cpVolume')), location: v('cpLocation'), startTime: v('cpStart'), endTime: v('cpEnd'),
    slump: v('cpSlump'), cubes: _num(v('cpCubes')), supplier: v('cpSupplier'), batchNo: v('cpBatch'),
    checklist, approvedBy: v('cpApproved'), status: v('cpStatus') || 'Completed', remarks: v('cpRemarks'), photo: _pendingPhoto || null,
  };
  if (!state.concretePours) state.concretePours = [];
  if (id) { const r = state.concretePours.find(x => x.id === id); if (r) Object.assign(r, data); }
  else state.concretePours.push({ id: 'cpc_' + Date.now(), projectId: _pid(), createdBy: getCurrentUser()?.id || '', createdAt: Date.now(), ...data });
  _pendingPhoto = null; saveAllData(); _exCloseModal(); showToast('Pour card saved', 'success'); renderExecution();
};

// ══════════════════════════════════════════════════════════
//  MILESTONES
// ══════════════════════════════════════════════════════════
function _renderMilestones(root) {
  const list = _arr('milestones').sort((a, b) => (a.plannedDate || '').localeCompare(b.plannedDate || ''));
  const stC = { 'Not Started': '#94a3b8', 'In Progress': '#0ea5e9', 'Completed': '#10b981', 'Delayed': '#ef4444' };
  const rows = list.map(m => { const c = stC[m.status] || '#94a3b8'; return `<div onclick="_exMsForm('${m.id}')" style="background:#fff;border:1px solid #e2e8f0;border-left:4px solid ${c};border-radius:12px;padding:12px 14px;cursor:pointer;display:flex;justify-content:space-between;gap:10px;">
    <div style="min-width:0;"><div style="font-weight:700;color:#0f172a;font-size:13px;">${_esc(m.name)} <span style="font-size:9px;font-weight:800;color:${c};background:${c}15;border-radius:8px;padding:1px 7px;">${_esc(m.status || 'Not Started')}</span></div>
    <div style="font-size:11px;color:#64748b;">Planned: ${_esc(m.plannedDate || '—')}${m.actualDate ? ' · Actual: ' + _esc(m.actualDate) : ''} · ${_num(m.progress)}%</div></div>
    <button onclick="event.stopPropagation();_exDel('milestones','${m.id}')" style="border:none;background:transparent;color:#cbd5e1;cursor:pointer;font-size:14px;">&#128465;&#65039;</button></div>`; }).join('');
  root.innerHTML = _listShell('Milestones', '+ Add Milestone', "_exMsForm()", rows, list.length);
}
window._exMsForm = function (id) {
  const m = id ? (state.milestones || []).find(x => x.id === id) : null;
  const sel = (opts, cur) => opts.map(o => `<option ${cur === o ? 'selected' : ''}>${o}</option>`).join('');
  _modal(`${_head(m ? 'Edit Milestone' : 'Add Milestone')}<div style="padding:20px;">
    <div style="margin-bottom:12px;"><label style="${_lbl}">Milestone</label><input id="msName" placeholder="e.g. Foundation complete" value="${m ? _esc(m.name) : ''}" style="${_inp}"></div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:12px;">
      <div><label style="${_lbl}">Planned Date</label><input id="msPlanned" type="date" value="${m ? _esc(m.plannedDate) : ''}" style="${_inp}"></div>
      <div><label style="${_lbl}">Actual Date</label><input id="msActual" type="date" value="${m ? _esc(m.actualDate) : ''}" style="${_inp}"></div>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:12px;">
      <div><label style="${_lbl}">Progress (%)</label><input id="msProgress" type="number" min="0" max="100" value="${m ? m.progress || 0 : 0}" style="${_inp}"></div>
      <div><label style="${_lbl}">Status</label><select id="msStatus" style="${_inp}">${sel(['Not Started', 'In Progress', 'Completed', 'Delayed'], m?.status || 'Not Started')}</select></div>
    </div>
    <div style="margin-bottom:14px;"><label style="${_lbl}">Remarks</label><input id="msRemarks" value="${m ? _esc(m.remarks) : ''}" style="${_inp}"></div>
    <button onclick="_exMsSave('${id || ''}')" style="width:100%;padding:11px;background:#6366f1;color:#fff;border:none;border-radius:10px;font-weight:700;cursor:pointer;">${m ? 'Save' : 'Add Milestone'}</button>
  </div>`);
};
window._exMsSave = function (id) {
  const v = i => (document.getElementById(i)?.value || '').trim();
  const name = v('msName'); if (!name) return showToast('Milestone name required', 'error');
  const data = { name, plannedDate: v('msPlanned'), actualDate: v('msActual'), progress: _num(v('msProgress')), status: v('msStatus') || 'Not Started', remarks: v('msRemarks') };
  if (!state.milestones) state.milestones = [];
  if (id) { const r = state.milestones.find(x => x.id === id); if (r) Object.assign(r, data); }
  else state.milestones.push({ id: 'ms_' + Date.now(), projectId: _pid(), createdAt: Date.now(), ...data });
  saveAllData(); _exCloseModal(); showToast('Milestone saved', 'success'); renderExecution();
};

// ══════════════════════════════════════════════════════════
//  QUALITY
// ══════════════════════════════════════════════════════════
function _renderQuality(root) {
  const list = _arr('qualityChecks').sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  const rows = list.map(q => { const ok = q.status === 'Pass' || q.status === 'Closed'; const c = ok ? '#10b981' : '#ef4444';
    return `<div onclick="_exQForm('${q.id}')" style="background:#fff;border:1px solid #e2e8f0;border-left:4px solid ${c};border-radius:12px;padding:12px 14px;cursor:pointer;display:flex;justify-content:space-between;gap:10px;">
    <div style="min-width:0;"><div style="font-weight:700;color:#0f172a;font-size:13px;">${_esc(q.type || 'Check')} <span style="font-size:9px;font-weight:800;color:${c};background:${c}15;border-radius:8px;padding:1px 7px;">${_esc(q.status || 'Open')}</span></div>
    <div style="font-size:11px;color:#64748b;">${_esc(q.element || '')} ${q.grade ? '· ' + _esc(q.grade) : ''}${q.result ? ' · ' + _esc(q.result) : ''} · ${_esc(q.date)}</div></div>
    ${_rowActions('qualityChecks', q)}</div>`; }).join('');
  root.innerHTML = _listShell('Quality', '+ Add Quality Record', "_exQForm()", rows, list.length);
}
window._exQForm = function (id) {
  const q = id ? (state.qualityChecks || []).find(x => x.id === id) : null;
  _pendingPhoto = q?.photo || null;
  const sel = (opts, cur) => opts.map(o => `<option ${cur === o ? 'selected' : ''}>${o}</option>`).join('');
  _modal(`${_head(q ? 'Edit Quality Record' : 'Quality Record')}<div style="padding:20px;">
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:12px;">
      <div><label style="${_lbl}">Type</label><select id="qType" style="${_inp}">${sel(QUALITY_TYPES, q?.type)}</select></div>
      <div><label style="${_lbl}">Date</label><input id="qDate" type="date" value="${q ? _esc(q.date) : _today()}" style="${_inp}"></div>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:12px;">
      <div><label style="${_lbl}">Element / Location</label><input id="qElement" value="${q ? _esc(q.element) : ''}" style="${_inp}"></div>
      <div><label style="${_lbl}">Grade / Spec</label><input id="qGrade" placeholder="e.g. M25 / 28-day" value="${q ? _esc(q.grade) : ''}" style="${_inp}"></div>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:12px;">
      <div><label style="${_lbl}">Result / Value</label><input id="qResult" placeholder="e.g. 32 MPa" value="${q ? _esc(q.result) : ''}" style="${_inp}"></div>
      <div><label style="${_lbl}">Status</label><select id="qStatus" style="${_inp}">${sel(['Open', 'Pass', 'Fail', 'Closed'], q?.status || 'Open')}</select></div>
    </div>
    <div style="margin-bottom:12px;"><label style="${_lbl}">Remarks</label><input id="qRemarks" value="${q ? _esc(q.remarks) : ''}" style="${_inp}"></div>
    <div style="margin-bottom:14px;"><label style="${_lbl}">Photo</label><input type="file" accept="image/*" capture="environment" onchange="_exCapturePhoto(this,'qPrev')" style="font-size:12px;"><div id="qPrev">${_pendingPhoto ? `<img src="${_pendingPhoto}" style="max-height:120px;border-radius:10px;margin-top:6px;">` : ''}</div></div>
    <button onclick="_exQSave('${id || ''}')" style="width:100%;padding:11px;background:#10b981;color:#fff;border:none;border-radius:10px;font-weight:700;cursor:pointer;">${q ? 'Save' : 'Add Record'}</button>
  </div>`);
};
window._exQSave = function (id) {
  const v = i => (document.getElementById(i)?.value || '').trim();
  const data = { type: v('qType') || 'Inspection', date: v('qDate') || _today(), element: v('qElement'), grade: v('qGrade'), result: v('qResult'), status: v('qStatus') || 'Open', remarks: v('qRemarks'), photo: _pendingPhoto || null };
  if (!state.qualityChecks) state.qualityChecks = [];
  if (id) { const r = state.qualityChecks.find(x => x.id === id); if (r) Object.assign(r, data); }
  else state.qualityChecks.push({ id: 'qc_' + Date.now(), projectId: _pid(), createdAt: Date.now(), ...data });
  _pendingPhoto = null; saveAllData(); _exCloseModal(); showToast('Quality record saved', 'success'); renderExecution();
};

// ══════════════════════════════════════════════════════════
//  SAFETY
// ══════════════════════════════════════════════════════════
function _renderSafety(root) {
  const list = _arr('incidents').sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  const sevC = { Low: '#10b981', Medium: '#f59e0b', High: '#f97316', Critical: '#ef4444' };
  const rows = list.map(s => { const c = sevC[s.severity] || '#94a3b8'; return `<div onclick="_exSForm('${s.id}')" style="background:#fff;border:1px solid #e2e8f0;border-left:4px solid ${c};border-radius:12px;padding:12px 14px;cursor:pointer;display:flex;justify-content:space-between;gap:10px;">
    <div style="min-width:0;"><div style="font-weight:700;color:#0f172a;font-size:13px;">${_esc(s.type || 'Safety')} <span style="font-size:9px;font-weight:800;color:${c};background:${c}15;border-radius:8px;padding:1px 7px;">${_esc(s.severity || '')}</span></div>
    <div style="font-size:11px;color:#64748b;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${_esc(s.description || '')}</div>
    <div style="font-size:10px;color:#94a3b8;margin-top:3px;">${_esc(s.location || '')} · ${_esc(s.date)}</div></div>
    ${_rowActions('incidents', s)}</div>`; }).join('');
  root.innerHTML = _listShell('Safety', '+ Add Safety Record', "_exSForm()", rows, list.length);
}
window._exSForm = function (id) {
  const s = id ? (state.incidents || []).find(x => x.id === id) : null;
  _pendingPhoto = s?.photo || null;
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
    <div style="margin-bottom:12px;"><label style="${_lbl}">Reported By</label><input id="sReporter" value="${s ? _esc(s.reportedBy) : ''}" style="${_inp}"></div>
    <div style="margin-bottom:14px;"><label style="${_lbl}">Photo</label><input type="file" accept="image/*" capture="environment" onchange="_exCapturePhoto(this,'sPrev')" style="font-size:12px;"><div id="sPrev">${_pendingPhoto ? `<img src="${_pendingPhoto}" style="max-height:120px;border-radius:10px;margin-top:6px;">` : ''}</div></div>
    <button onclick="_exSSave('${id || ''}')" style="width:100%;padding:11px;background:#ef4444;color:#fff;border:none;border-radius:10px;font-weight:700;cursor:pointer;">${s ? 'Save' : 'Add Record'}</button>
  </div>`);
};
window._exSSave = function (id) {
  const v = i => (document.getElementById(i)?.value || '').trim();
  const data = { type: v('sType') || 'Incident', severity: v('sSev') || 'Low', date: v('sDate') || _today(), location: v('sLocation'), description: v('sDesc'), actionTaken: v('sAction'), reportedBy: v('sReporter'), photo: _pendingPhoto || null };
  if (!state.incidents) state.incidents = [];
  if (id) { const r = state.incidents.find(x => x.id === id); if (r) Object.assign(r, data); }
  else state.incidents.push({ id: 'inc_' + Date.now(), projectId: _pid(), createdAt: Date.now(), ...data });
  _pendingPhoto = null; saveAllData(); _exCloseModal(); showToast('Safety record saved', 'success'); renderExecution();
};
