/**
 * ═══════════════════════════════════════════════════════════
 * True Site Sync — Project Issues / Snag tracker
 * ═══════════════════════════════════════════════════════════
 * Project-scoped issue register: Dashboard, Pending, Delayed &
 * Solved views, with a full add/edit form (date, due date, details,
 * assignee, priority, category, location, photo) that can be linked
 * to a BOQ/PO item and a Planning task (and thereby micro-planning).
 * Offline-first, mirrors the Petty Cash module pattern.
 * ═══════════════════════════════════════════════════════════
 */

import { state, saveAllData } from './state.js';
import { showToast } from './utils.js';
import { getCurrentUser } from './rbac.js';

export const ISSUE_CATEGORIES = ['Client', 'Communication', 'Compliance', 'Design', 'Environmental', 'Financial', 'Management', 'Operational', 'Quality', 'Request for Information', 'Safety', 'Supply', 'Technical', 'Other'];
const PRIORITIES = ['Low', 'Medium', 'High', 'Critical'];
const PRIORITY_COLOR = { Low: '#10b981', Medium: '#f59e0b', High: '#f97316', Critical: '#ef4444' };
const CAT_COLOR = '#6366f1';

// ── helpers ────────────────────────────────────────────────
function _pid() { return state.currentProjectId || null; }
function _today() { return new Date().toISOString().split('T')[0]; }
function _esc(s) { return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }

function _issues() {
  const pid = _pid();
  return (state.issues || []).filter(i => i.projectId === pid);
}
/** Derived status: Solved | Delayed (overdue & open) | Pending (open). */
function _status(i) {
  if (i.status === 'Solved') return 'Solved';
  if (i.dueDate && i.dueDate < _today()) return 'Delayed';
  return 'Pending';
}
function _byStatus(st) { return _issues().filter(i => _status(i) === st); }

// Linked data sources (BOQ + planning tasks → micro planning)
function _projBoqItems() {
  const proj = (state.projects || []).find(p => p.id === _pid());
  const out = [];
  if (proj?.boqs?.length) {
    proj.boqs.forEach(g => (g.items || []).forEach((it, i) => out.push({ ref: g.id + ':' + i, label: (it.code ? it.code + ' — ' : '') + (it.description || it.code || 'Item') })));
  } else if (proj?.boqItems?.length) {
    proj.boqItems.forEach((it, i) => out.push({ ref: String(i), label: (it.code ? it.code + ' — ' : '') + (it.description || it.code || 'Item') }));
  }
  return out;
}
function _projTasks() { return (state.planningTasks || []).filter(t => t.projectId === _pid()); }
function _users() { return (state.rbacUsers || []).filter(u => u.active !== false); }
function _userName(id) { const u = (state.rbacUsers || []).find(x => x.id === id); return u ? (u.name || u.username || u.email) : (id || '—'); }
function _taskName(id) { const t = (state.planningTasks || []).find(x => x.id === id); return t ? (t.name || t.title || 'Task') : ''; }
function _boqLabel(ref) { return (_projBoqItems().find(b => b.ref === ref) || {}).label || ''; }

/** Public: issues linked to a planning task (for planning/micro-planning UI). */
export function getIssuesForTask(taskId) { return (state.issues || []).filter(i => i.taskId === taskId); }
/** Public: open-issue count for a BOQ ref. */
export function getOpenIssueCountForBoq(ref) { return (state.issues || []).filter(i => i.boqRef === ref && i.status !== 'Solved').length; }

/** Compress an image File to a small JPEG base64 (max 1000px, q0.6). */
function _compressImage(file) {
  return new Promise((resolve, reject) => {
    if (!file || !file.type.startsWith('image/')) { resolve(null); return; }
    const reader = new FileReader();
    reader.onload = e => {
      const img = new Image();
      img.onload = () => {
        const maxW = 1000, scale = Math.min(1, maxW / img.width);
        const w = Math.round(img.width * scale), h = Math.round(img.height * scale);
        const canvas = document.createElement('canvas');
        canvas.width = w; canvas.height = h;
        canvas.getContext('2d').drawImage(img, 0, 0, w, h);
        try { resolve(canvas.toDataURL('image/jpeg', 0.6)); } catch (err) { reject(err); }
      };
      img.onerror = reject;
      img.src = e.target.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// ── view state ─────────────────────────────────────────────
let _section = 'dashboard';   // dashboard | pending | delayed | solved
let _pendingPhoto = null;

// ══════════════════════════════════════════════════════════
//  ENTRY + ROUTER
// ══════════════════════════════════════════════════════════
export function renderIssues() {
  const root = document.getElementById('issuesRoot');
  if (!root) return;
  if (!_pid()) {
    root.innerHTML = `<div style="text-align:center;padding:60px 20px;color:#94a3b8;">
      <div style="font-size:42px;margin-bottom:10px;">&#128681;</div>
      <p style="font-weight:700;color:#475569;">Open a project first</p>
      <p style="font-size:13px;">Issues are tracked per project.</p></div>`;
    return;
  }
  if (_section === 'pending') return _renderList(root, 'Pending');
  if (_section === 'delayed') return _renderList(root, 'Delayed');
  if (_section === 'solved') return _renderList(root, 'Solved');
  return _renderDashboard(root);
}
window._isOpen = function (section) { _section = section; renderIssues(); };

function _toolbar() {
  return `<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:16px;">
      <button onclick="_isOpenForm()" style="padding:9px 16px;background:#1e3a8a;color:#fff;border:none;border-radius:10px;font-size:13px;font-weight:700;cursor:pointer;">+ Add Issue</button>
      <div style="display:flex;gap:6px;flex-wrap:wrap;margin-left:auto;">
        ${[['dashboard', '&#128202; Dashboard'], ['pending', '&#9203; Pending'], ['delayed', '&#9888;&#65039; Delayed'], ['solved', '&#9989; Solved']]
      .map(([k, l]) => `<button onclick="_isOpen('${k}')" style="padding:7px 13px;border-radius:9px;font-size:12px;font-weight:700;cursor:pointer;border:1px solid ${_section === k ? '#1e3a8a' : '#e2e8f0'};background:${_section === k ? '#1e3a8a' : '#fff'};color:${_section === k ? '#fff' : '#475569'};">${l}</button>`).join('')}
      </div>
    </div>`;
}

// ══════════════════════════════════════════════════════════
//  DASHBOARD
// ══════════════════════════════════════════════════════════
function _renderDashboard(root) {
  const all = _issues();
  const pending = _byStatus('Pending').length;
  const delayed = _byStatus('Delayed').length;
  const solved = _byStatus('Solved').length;
  const open = pending + delayed;
  const kpi = (label, val, color, icon) => `
    <div style="background:#fff;border:1px solid #e2e8f0;border-radius:16px;padding:18px;box-shadow:0 1px 3px rgba(0,0,0,.04);">
      <div style="display:flex;justify-content:space-between;align-items:center;">
        <div><div style="font-size:11px;text-transform:uppercase;letter-spacing:.05em;color:#94a3b8;font-weight:700;">${label}</div>
        <div style="font-size:30px;font-weight:800;color:${color};margin-top:2px;">${val}</div></div>
        <div style="font-size:30px;opacity:.25;">${icon}</div>
      </div></div>`;

  // priority + category breakdown across OPEN issues
  const openIssues = all.filter(i => i.status !== 'Solved');
  const prCounts = PRIORITIES.map(p => [p, openIssues.filter(i => (i.priority || 'Medium') === p).length]);
  const catCounts = {};
  openIssues.forEach(i => { const c = i.category || 'Other'; catCounts[c] = (catCounts[c] || 0) + 1; });
  const recent = [...all].sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0)).slice(0, 6);

  root.innerHTML = `
    <h2 class="text-3xl font-extrabold text-slate-800 mb-1">Issues</h2>
    <p class="text-sm text-slate-400 mb-5">Track snags & issues for this project — assign, prioritise & resolve</p>
    ${_toolbar()}
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px;margin-bottom:18px;">
      ${kpi('Open', open, '#1e3a8a', '&#128203;')}
      ${kpi('Pending', pending, '#f59e0b', '&#9203;')}
      ${kpi('Delayed', delayed, '#ef4444', '&#9888;&#65039;')}
      ${kpi('Solved', solved, '#10b981', '&#9989;')}
    </div>
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:14px;">
      <div style="background:#fff;border:1px solid #e2e8f0;border-radius:16px;padding:16px;">
        <h3 style="font-size:13px;font-weight:800;color:#334155;margin-bottom:10px;">Open by Priority</h3>
        ${prCounts.map(([p, n]) => `<div style="display:flex;align-items:center;gap:8px;margin-bottom:7px;">
          <span style="width:9px;height:9px;border-radius:50%;background:${PRIORITY_COLOR[p]};"></span>
          <span style="font-size:12px;color:#475569;flex:1;">${p}</span>
          <span style="font-size:12px;font-weight:800;color:#0f172a;">${n}</span></div>`).join('')}
      </div>
      <div style="background:#fff;border:1px solid #e2e8f0;border-radius:16px;padding:16px;">
        <h3 style="font-size:13px;font-weight:800;color:#334155;margin-bottom:10px;">Open by Category</h3>
        ${Object.keys(catCounts).length ? Object.entries(catCounts).sort((a, b) => b[1] - a[1]).map(([c, n]) => `<div style="display:flex;align-items:center;gap:8px;margin-bottom:7px;">
          <span style="font-size:12px;color:#475569;flex:1;">${_esc(c)}</span>
          <span style="font-size:12px;font-weight:800;color:#0f172a;">${n}</span></div>`).join('') : '<p style="font-size:12px;color:#94a3b8;">No open issues.</p>'}
      </div>
      <div style="background:#fff;border:1px solid #e2e8f0;border-radius:16px;padding:16px;">
        <h3 style="font-size:13px;font-weight:800;color:#334155;margin-bottom:10px;">Recent Issues</h3>
        ${recent.length ? recent.map(i => `<div onclick="_isOpenForm('${i.id}')" style="cursor:pointer;display:flex;align-items:center;gap:8px;margin-bottom:8px;">
          <span style="width:8px;height:8px;border-radius:50%;background:${PRIORITY_COLOR[i.priority] || '#94a3b8'};flex-shrink:0;"></span>
          <span style="font-size:12px;color:#334155;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${_esc(i.title || i.details || 'Issue')}</span>
          <span style="font-size:10px;font-weight:700;color:${_status(i) === 'Solved' ? '#10b981' : _status(i) === 'Delayed' ? '#ef4444' : '#f59e0b'};">${_status(i)}</span></div>`).join('') : '<p style="font-size:12px;color:#94a3b8;">No issues yet.</p>'}
      </div>
    </div>`;
}

// ══════════════════════════════════════════════════════════
//  LIST (Pending / Delayed / Solved)
// ══════════════════════════════════════════════════════════
function _renderList(root, status) {
  const list = _byStatus(status).sort((a, b) => (a.dueDate || '').localeCompare(b.dueDate || '') || (b.createdAt || 0) - (a.createdAt || 0));
  const titles = { Pending: 'Pending Issues', Delayed: 'Delayed Issues', Solved: 'Solved Issues' };
  root.innerHTML = `
    <h2 class="text-3xl font-extrabold text-slate-800 mb-1">${titles[status]}</h2>
    <p class="text-sm text-slate-400 mb-5">${list.length} issue${list.length === 1 ? '' : 's'}</p>
    ${_toolbar()}
    <div style="display:flex;flex-direction:column;gap:10px;">
      ${list.map(i => _issueCard(i)).join('') || `<div style="text-align:center;padding:40px;color:#94a3b8;">No ${status.toLowerCase()} issues.</div>`}
    </div>`;
}

function _issueCard(i) {
  const st = _status(i);
  const stColor = st === 'Solved' ? '#10b981' : st === 'Delayed' ? '#ef4444' : '#f59e0b';
  const pr = i.priority || 'Medium';
  const photo = i.photo ? `<button onclick="event.stopPropagation();_isLightbox('${i.id}')" title="View photo" style="border:none;background:#f1f5f9;border-radius:8px;padding:4px 7px;cursor:pointer;font-size:14px;">&#128247;</button>` : '';
  const links = [];
  if (i.boqRef) links.push('&#128209; ' + _esc(_boqLabel(i.boqRef).slice(0, 28)));
  if (i.taskId) links.push('&#128197; ' + _esc(_taskName(i.taskId)));
  return `<div onclick="_isOpenForm('${i.id}')" style="background:#fff;border:1px solid #e2e8f0;border-left:4px solid ${stColor};border-radius:12px;padding:13px 15px;cursor:pointer;">
    <div style="display:flex;justify-content:space-between;align-items:start;gap:10px;">
      <div style="min-width:0;flex:1;">
        <div style="display:flex;align-items:center;gap:7px;flex-wrap:wrap;margin-bottom:3px;">
          <span style="font-weight:800;color:#0f172a;font-size:13px;">${_esc(i.title || 'Untitled issue')}</span>
          <span style="font-size:9px;font-weight:800;padding:1px 7px;border-radius:9px;background:${PRIORITY_COLOR[pr]}1a;color:${PRIORITY_COLOR[pr]};">${pr}</span>
          <span style="font-size:9px;font-weight:700;padding:1px 7px;border-radius:9px;background:${CAT_COLOR}14;color:${CAT_COLOR};">${_esc(i.category || 'Other')}</span>
        </div>
        <div style="font-size:11px;color:#64748b;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${_esc(i.details || '')}</div>
        <div style="font-size:10px;color:#94a3b8;margin-top:4px;display:flex;gap:10px;flex-wrap:wrap;">
          ${i.dueDate ? `<span>Due: <b style="color:${st === 'Delayed' ? '#ef4444' : '#64748b'}">${_esc(i.dueDate)}</b></span>` : ''}
          ${i.assignedTo ? `<span>&#128100; ${_esc(_userName(i.assignedTo))}</span>` : ''}
          ${i.location ? `<span>&#128205; ${_esc(i.location)}</span>` : ''}
          ${links.join(' ')}
        </div>
      </div>
      <div style="display:flex;align-items:center;gap:6px;flex-shrink:0;">
        ${photo}
        ${i.status !== 'Solved' ? `<button onclick="event.stopPropagation();_isSolve('${i.id}')" title="Mark solved" style="border:none;background:#ecfdf5;color:#047857;border:1px solid #a7f3d0;border-radius:8px;padding:5px 9px;cursor:pointer;font-size:11px;font-weight:700;">&#10003; Solve</button>`
      : `<button onclick="event.stopPropagation();_isReopen('${i.id}')" title="Reopen" style="border:none;background:#fff7ed;color:#c2410c;border:1px solid #fed7aa;border-radius:8px;padding:5px 9px;cursor:pointer;font-size:11px;font-weight:700;">Reopen</button>`}
        <button onclick="event.stopPropagation();_isDelete('${i.id}')" title="Delete" style="border:none;background:transparent;color:#cbd5e1;cursor:pointer;font-size:14px;">&#128465;&#65039;</button>
      </div>
    </div></div>`;
}

// ══════════════════════════════════════════════════════════
//  MODAL (add / edit)
// ══════════════════════════════════════════════════════════
function _modal(html) {
  let o = document.getElementById('issueModalOverlay');
  if (!o) {
    o = document.createElement('div');
    o.id = 'issueModalOverlay';
    o.style.cssText = 'position:fixed;inset:0;background:rgba(15,23,42,.55);backdrop-filter:blur(3px);z-index:200000;display:flex;align-items:center;justify-content:center;padding:16px;';
    o.addEventListener('click', e => { if (e.target === o) _isCloseModal(); });
    document.body.appendChild(o);
  }
  o.innerHTML = `<div style="background:#fff;border-radius:18px;max-width:560px;width:100%;max-height:92vh;overflow:auto;box-shadow:0 24px 60px rgba(0,0,0,.3);">${html}</div>`;
  o.style.display = 'flex';
}
window._isCloseModal = function () { const o = document.getElementById('issueModalOverlay'); if (o) o.style.display = 'none'; _pendingPhoto = null; };

const _inp = 'width:100%;padding:9px 11px;border:1px solid #e2e8f0;border-radius:10px;font-size:13px;box-sizing:border-box;';
const _lbl = 'display:block;font-size:11px;font-weight:700;color:#64748b;margin-bottom:3px;';

window._isOpenForm = function (editId) {
  const iss = editId ? (state.issues || []).find(x => x.id === editId) : null;
  _pendingPhoto = iss?.photo || null;
  const users = _users();
  const userOpts = ['<option value="">— Unassigned —</option>', ...users.map(u => `<option value="${u.id}" ${iss && iss.assignedTo === u.id ? 'selected' : ''}>${_esc(u.name || u.username || u.email)}</option>`)].join('');
  const prOpts = PRIORITIES.map(p => `<option ${iss && iss.priority === p ? 'selected' : (!iss && p === 'Medium' ? 'selected' : '')}>${p}</option>`).join('');
  const catOpts = ISSUE_CATEGORIES.map(c => `<option ${iss && iss.category === c ? 'selected' : ''}>${c}</option>`).join('');
  const boqOpts = ['<option value="">— None —</option>', ..._projBoqItems().map(b => `<option value="${b.ref}" ${iss && iss.boqRef === b.ref ? 'selected' : ''}>${_esc(b.label)}</option>`)].join('');
  const taskOpts = ['<option value="">— None —</option>', ..._projTasks().map(t => `<option value="${t.id}" ${iss && iss.taskId === t.id ? 'selected' : ''}>${_esc(t.name || t.title || 'Task')}</option>`)].join('');
  const photoPrev = _pendingPhoto ? `<img src="${_pendingPhoto}" style="max-height:120px;border-radius:10px;border:1px solid #e2e8f0;margin-top:6px;">` : '';

  _modal(`
    <div style="padding:18px 20px;border-bottom:1px solid #f1f5f9;display:flex;justify-content:space-between;align-items:center;">
      <h3 style="font-weight:800;color:#0f172a;font-size:17px;">${iss ? 'Edit Issue' : 'Add Issue'}</h3>
      <button onclick="_isCloseModal()" style="border:none;background:#f1f5f9;border-radius:8px;width:28px;height:28px;cursor:pointer;color:#64748b;font-size:16px;">×</button>
    </div>
    <div style="padding:20px;">
      <div style="margin-bottom:12px;"><label style="${_lbl}">Issue Title *</label>
        <input id="isTitle" placeholder="Short summary of the issue" value="${iss ? _esc(iss.title) : ''}" style="${_inp}"></div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:12px;">
        <div><label style="${_lbl}">Issue Date</label><input id="isDate" type="date" value="${iss ? _esc(iss.date) : _today()}" style="${_inp}"></div>
        <div><label style="${_lbl}">Due Date</label><input id="isDue" type="date" value="${iss ? _esc(iss.dueDate) : ''}" style="${_inp}"></div>
      </div>
      <div style="margin-bottom:12px;"><label style="${_lbl}">Issue Details</label>
        <textarea id="isDetails" rows="3" placeholder="Describe the issue…" style="${_inp}resize:vertical;">${iss ? _esc(iss.details) : ''}</textarea></div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:12px;">
        <div><label style="${_lbl}">Assign To</label><select id="isAssign" style="${_inp}">${userOpts}</select></div>
        <div><label style="${_lbl}">Priority</label><select id="isPriority" style="${_inp}">${prOpts}</select></div>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:12px;">
        <div><label style="${_lbl}">Category</label><select id="isCategory" style="${_inp}">${catOpts}</select></div>
        <div><label style="${_lbl}">Location Details</label><input id="isLocation" placeholder="e.g. Block A, 2nd floor" value="${iss ? _esc(iss.location) : ''}" style="${_inp}"></div>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:12px;">
        <div><label style="${_lbl}">Related BOQ / PO item</label><select id="isBoq" style="${_inp}">${boqOpts}</select></div>
        <div><label style="${_lbl}">Related Task (Planning)</label><select id="isTask" style="${_inp}">${taskOpts}</select></div>
      </div>
      <div style="margin-bottom:14px;">
        <label style="${_lbl}">Photo (optional)</label>
        <input id="isPhoto" type="file" accept="image/*" capture="environment" onchange="_isCapturePhoto(this)" style="font-size:12px;">
        <div id="isPhotoPreview">${photoPrev}</div>
      </div>
      <div style="display:flex;gap:10px;">
        <button onclick="_isSave('${editId || ''}')" style="flex:1;padding:11px;background:#1e3a8a;color:#fff;border:none;border-radius:10px;font-weight:700;cursor:pointer;">${iss ? 'Save Changes' : 'Create Issue'}</button>
        ${iss && iss.status !== 'Solved' ? `<button onclick="_isSolve('${iss.id}')" style="padding:11px 16px;background:#ecfdf5;color:#047857;border:1px solid #a7f3d0;border-radius:10px;font-weight:700;cursor:pointer;">&#10003; Solve</button>` : ''}
      </div>
    </div>`);
};

window._isCapturePhoto = async function (input) {
  const file = input.files && input.files[0];
  const prev = document.getElementById('isPhotoPreview');
  if (!file) return;
  try {
    if (prev) prev.innerHTML = '<span style="font-size:12px;color:#94a3b8;">Compressing…</span>';
    _pendingPhoto = await _compressImage(file);
    if (prev) prev.innerHTML = _pendingPhoto ? `<img src="${_pendingPhoto}" style="max-height:120px;border-radius:10px;border:1px solid #e2e8f0;margin-top:6px;">` : '<span style="font-size:12px;color:#dc2626;">Unsupported file</span>';
  } catch { _pendingPhoto = null; if (prev) prev.innerHTML = '<span style="font-size:12px;color:#dc2626;">Could not read image</span>'; }
};

window._isSave = function (editId) {
  const v = id => (document.getElementById(id)?.value || '').trim();
  const title = v('isTitle');
  if (!title) return showToast('Issue title is required', 'error');
  const data = {
    title, date: v('isDate') || _today(), dueDate: v('isDue'),
    details: v('isDetails'), assignedTo: v('isAssign'), priority: v('isPriority') || 'Medium',
    category: v('isCategory') || 'Other', location: v('isLocation'),
    boqRef: v('isBoq'), taskId: v('isTask'), photo: _pendingPhoto || null,
  };
  if (!state.issues) state.issues = [];
  if (editId) {
    const it = state.issues.find(x => x.id === editId);
    if (it) Object.assign(it, data);
  } else {
    const u = getCurrentUser();
    state.issues.push({
      id: 'iss_' + Date.now(), projectId: _pid(), status: 'Pending',
      raisedBy: u?.id || '', createdAt: Date.now(), ...data,
    });
  }
  _pendingPhoto = null;
  saveAllData(); _isCloseModal();
  showToast(editId ? 'Issue updated' : 'Issue created', 'success');
  renderIssues();
};

window._isSolve = function (id) {
  const it = (state.issues || []).find(x => x.id === id);
  if (!it) return;
  it.status = 'Solved'; it.solvedAt = Date.now();
  saveAllData(); _isCloseModal();
  showToast('Issue marked solved', 'success');
  renderIssues();
};
window._isReopen = function (id) {
  const it = (state.issues || []).find(x => x.id === id);
  if (!it) return;
  it.status = 'Pending'; it.solvedAt = null;
  saveAllData();
  showToast('Issue reopened', 'success');
  renderIssues();
};
window._isDelete = function (id) {
  if (!confirm('Delete this issue?')) return;
  state.issues = (state.issues || []).filter(x => x.id !== id);
  saveAllData();
  showToast('Issue deleted');
  renderIssues();
};

window._isLightbox = function (id) {
  const it = (state.issues || []).find(x => x.id === id);
  if (!it || !it.photo) return;
  let lb = document.getElementById('issueLightbox');
  if (!lb) {
    lb = document.createElement('div');
    lb.id = 'issueLightbox';
    lb.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.88);z-index:200001;display:flex;align-items:center;justify-content:center;padding:24px;cursor:zoom-out;';
    lb.addEventListener('click', () => lb.remove());
    document.body.appendChild(lb);
  }
  lb.innerHTML = `<img src="${it.photo}" style="max-width:96%;max-height:92%;border-radius:12px;box-shadow:0 30px 80px rgba(0,0,0,.6);">
    <div style="position:absolute;bottom:18px;left:0;right:0;text-align:center;color:#fff;font-size:13px;opacity:.85;">${_esc(it.title || 'Issue')}${it.location ? ' · ' + _esc(it.location) : ''}</div>`;
};
