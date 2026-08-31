/**
 * ═══════════════════════════════════════════════════════════
 * True Site Sync — Location-based Drag-and-Drop Schedule Builder
 * ───────────────────────────────────────────────────────────
 * Create locations (Block A, Basement, Tower-2 …); drag standard construction
 * tasks from a palette onto each location's timeline instead of retyping them.
 * Set per-task duration / start / dependencies, Auto-Schedule sequential dates,
 * duplicate a whole location, highlight repeated tasks, and export a Gantt/table.
 *
 * Vanilla JS + native HTML5 drag-and-drop (same pattern as planning.js board).
 * Data: state.scheduleLocations (project-scoped, synced). Palette = project BOQ
 * items (proj.boqs[].items) + a categorised standard task library.
 * ═══════════════════════════════════════════════════════════
 */
import { state, saveAllData, saveLocalKey } from './state.js';
import { showToast, getCompanyHeaderForPDF, mobileSavePDF } from './utils.js';
import { seedBaselineFromSchedule } from './executionEngine.js';

/* ── standard task library (used when a project has no BOQ, and always available) ── */
const STD_TASKS = [
  // Substructure
  ['Site Clearance', '🧹', 'Substructure'], ['Excavation', '🚜', 'Substructure'],
  ['Anti-Termite', '🐛', 'Substructure'], ['PCC', '🧱', 'Substructure'],
  ['Footing', '🏗️', 'Substructure'], ['Raft', '🏗️', 'Substructure'],
  ['Plinth Beam', '🧱', 'Substructure'], ['Backfilling', '⛰️', 'Substructure'],
  // Superstructure
  ['Columns', '🏛️', 'Superstructure'], ['RCC Slab', '🏗️', 'Superstructure'],
  ['Beams', '🧱', 'Superstructure'], ['Staircase', '🪜', 'Superstructure'],
  ['Brick Masonry', '🧱', 'Superstructure'], ['Block Work', '🧱', 'Superstructure'],
  ['Lintel', '🧱', 'Superstructure'],
  // Finishing
  ['Plaster', '🎨', 'Finishing'], ['Flooring / Tiling', '⬜', 'Finishing'],
  ['Painting', '🖌️', 'Finishing'], ['Waterproofing', '💧', 'Finishing'],
  ['Doors & Windows', '🚪', 'Finishing'], ['False Ceiling', '☁️', 'Finishing'],
  // MEP
  ['Plumbing', '🚰', 'MEP'], ['Electrical', '⚡', 'MEP'],
  ['HVAC', '🌀', 'MEP'], ['Fire Fighting', '🧯', 'MEP'],
];
const CATEGORIES = ['All', 'Planned', 'BOQ', 'Substructure', 'Superstructure', 'Finishing', 'MEP'];

/* ── module UI state ── */
let _sbLocId = null;      // selected location
let _sbCat = 'All';       // palette category filter
let _sbSearch = '';
let _sbDrag = null;       // { type:'new'|'move', task?, taskId? }
let _sbPalMap = {};       // masterTaskId → palette item (avoids embedding JSON in HTML)
let _sbDirty = false;     // unsaved local edits (synced only on explicit Save)

/** Persist edits LOCALLY only (no cloud push) and flag unsaved changes, so a
 *  mid-edit background sync can't wipe a just-added task. Sync happens on Save. */
function _sbTouch() { saveLocalKey('scheduleLocations'); _sbDirty = true; _updateSaveBtn(); }
function _updateSaveBtn() { const b = document.getElementById('sbSaveBtn'); if (b) { b.classList.toggle('sb-dirty', _sbDirty); b.innerHTML = _sbDirty ? '💾 Save changes •' : '💾 Saved'; } }
window._sbSaveAll = function () {
  saveAllData(); _sbDirty = false; _updateSaveBtn();
  showToast('Schedule saved & synced', 'success');
};

/* ── helpers ── */
const esc = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const q = s => String(s == null ? '' : s).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
const num = v => { const n = parseFloat(v); return isNaN(n) ? 0 : n; };
const uid = p => (p || 'x') + '_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7);
const pid = () => state.currentProjectId;
const proj = () => (state.projects || []).find(p => p.id === pid());
const locs = () => (state.scheduleLocations || []).filter(l => l.projectId === pid());
const locById = id => (state.scheduleLocations || []).find(l => l.id === id);
function ensure() { if (!Array.isArray(state.scheduleLocations)) state.scheduleLocations = []; }

function iconFor(name) {
  const n = (name || '').toLowerCase();
  const hit = STD_TASKS.find(t => n.includes(t[0].toLowerCase().split(' ')[0]));
  if (hit) return hit[1];
  if (/excavat|earth/.test(n)) return '🚜'; if (/pcc|rcc|concrete|slab|beam|column|raft|footing/.test(n)) return '🏗️';
  if (/brick|block|mason/.test(n)) return '🧱'; if (/plaster|paint|finish/.test(n)) return '🎨';
  if (/tile|floor/.test(n)) return '⬜'; if (/water|proof/.test(n)) return '💧';
  if (/plumb/.test(n)) return '🚰'; if (/electr/.test(n)) return '⚡'; if (/steel|reinforce/.test(n)) return '🔩';
  return '🔧';
}
function catFor(name) {
  const n = (name || '').toLowerCase();
  if (/excavat|pcc|footing|raft|plinth|anti|backfill|clearance|earth/.test(n)) return 'Substructure';
  if (/rcc|column|slab|beam|stair|mason|brick|block|lintel|reinforce|steel/.test(n)) return 'Superstructure';
  if (/plaster|paint|tile|floor|water|proof|door|window|ceiling|finish/.test(n)) return 'Finishing';
  if (/plumb|electr|hvac|fire|mep/.test(n)) return 'MEP';
  return 'BOQ';
}
/** Palette items: BOQ items of the project + the standard library. */
function palette() {
  const out = [];
  const seen = new Set();
  // 1) Planned activities from the Planning module come FIRST — scheduling is
  //    sequencing what was planned. Each carries its planned qty/unit/duration.
  const _pid = proj()?.id;
  (state.execActivities || []).filter(a => a.projectId === _pid && (a.name || a.code)).forEach(a => {
    const name = a.name || a.code;
    const key = (a.code || name).toLowerCase();
    if (seen.has(key)) return; seen.add(key);
    out.push({ masterTaskId: a.id, name, icon: iconFor(name), category: 'Planned', unit: (a.qty && a.qty.unit) || '', qty: num(a.qty && a.qty.plannedQty), duration: num(a.schedule && a.schedule.duration) || 0, planned: true });
  });
  (proj()?.boqs || []).forEach(g => (g.items || []).forEach(it => {
    const name = it.description || it.desc || it.name || it.code || '';
    if (!name) return;
    const key = (it.code || name).toLowerCase();
    if (seen.has(key)) return; seen.add(key);
    out.push({ masterTaskId: it.code || key, name, icon: iconFor(name), category: 'BOQ', unit: it.uom || it.unit || '', qty: num(it.qty) });
  }));
  STD_TASKS.forEach(([name, icon, category]) => {
    const key = name.toLowerCase();
    if (seen.has(key)) return; seen.add(key);
    out.push({ masterTaskId: 'std_' + key.replace(/\W+/g, '_'), name, icon, category });
  });
  return out;
}
/** Count each task name across all locations (for duplicate highlighting). */
function dupCounts() {
  const m = {};
  locs().forEach(l => (l.tasks || []).forEach(t => { const k = (t.name || '').toLowerCase(); m[k] = (m[k] || 0) + 1; }));
  return m;
}

/* ── date utils ── */
function addDays(d, n) { const x = new Date(d); x.setDate(x.getDate() + n); return x; }
function fmtISO(d) { return new Date(d).toISOString().slice(0, 10); }
function fmtNice(s) { if (!s) return '—'; const d = new Date(s); return isNaN(d) ? '—' : d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: '2-digit' }); }

/* ═══════════════════════════════════════════════════════
 *  MAIN RENDER
 * ═══════════════════════════════════════════════════════ */
/** Planning → Scheduling → Execution flow stepper. */
function _psStepper(active) {
  const step = (key, label, view) => {
    const on = active === key;
    return `<button onclick="window.switchView&&window.switchView('${view}')" style="padding:5px 11px;border-radius:8px;font-size:11px;font-weight:800;cursor:pointer;border:1px solid ${on ? '#7c3aed' : '#e2e8f0'};background:${on ? '#7c3aed' : '#fff'};color:${on ? '#fff' : '#64748b'};white-space:nowrap;">${label}</button>`;
  };
  const arr = `<span style="color:#cbd5e1;font-weight:800;">&rarr;</span>`;
  return `<div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin-bottom:10px;">${step('plan', '① Planning', 'execEngineView')}${arr}${step('sched', '② Scheduling', 'scheduleBuilderView')}${arr}${step('exec', '③ Execution', 'executionView')}</div>`;
}

/* ═══════════════════════════════════════════════════════════
 *  SIMPLE SCHEDULING — sequence the SAME planned activities on a timeline.
 *  Editing a start/duration writes straight to the activity, so Planning and
 *  Scheduling always agree (no separate task lists to reconcile).
 * ═══════════════════════════════════════════════════════════ */
function _sbActs() { return (state.execActivities || []).filter(a => a.projectId === pid()); }
function _sbFinish(a) { const s = (a.schedule && a.schedule.plannedStart) || ''; if (!s) return ''; return fmtISO(addDays(s, Math.max(0, num(a.schedule && a.schedule.duration)))); }

export function renderScheduleBuilder() {
  ensure();
  const host = document.getElementById('scheduleBuilderContent');
  if (!host) return;
  const p = proj();
  if (!p) { host.innerHTML = `<div class="sb-empty"><div style="font-size:34px">🗓️</div><p class="font-bold text-slate-700">Select a project first</p></div>`; return; }
  const list = _sbActs();
  const projStart = p.startDate || '';
  const idate = 'padding:6px 8px;border:1px solid #e2e8f0;border-radius:8px;font-size:12px;';
  let minD = null, maxD = null;
  list.forEach(a => { const s = a.schedule && a.schedule.plannedStart; if (!s) return; const sd = new Date(s), ed = addDays(s, Math.max(0, num(a.schedule.duration))); if (!minD || sd < minD) minD = sd; if (!maxD || ed > maxD) maxD = ed; });
  const totalDays = (minD && maxD) ? Math.max(1, Math.round((maxD - minD) / 86400000)) : 1;
  const rows = list.map((a, i) => {
    const s = (a.schedule && a.schedule.plannedStart) || '';
    const d = num(a.schedule && a.schedule.duration);
    return `<tr style="border-top:1px solid #f1f5f9;">
      <td style="padding:7px 10px;color:#94a3b8;">${i + 1}</td>
      <td style="padding:7px 10px;font-weight:700;color:#0f172a;">${esc(a.name || 'Untitled')}</td>
      <td style="padding:7px 10px;"><input type="date" value="${esc(s)}" onchange="window._sbSetStart('${a.id}',this.value)" style="${idate}"></td>
      <td style="padding:7px 10px;"><input type="number" min="1" value="${d || ''}" onchange="window._sbSetDur('${a.id}',this.value)" style="${idate}width:64px;" placeholder="days"></td>
      <td style="padding:7px 10px;color:#64748b;white-space:nowrap;">${s ? fmtNice(_sbFinish(a)) : '—'}</td>
    </tr>`;
  }).join('');
  const gantt = list.filter(a => a.schedule && a.schedule.plannedStart).map(a => {
    const s = new Date(a.schedule.plannedStart), d = Math.max(1, num(a.schedule.duration) || 1);
    const off = minD ? Math.round((s - minD) / 86400000) : 0;
    const left = totalDays ? (off / totalDays * 100) : 0;
    const width = totalDays ? (d / totalDays * 100) : 100;
    return `<div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;">
      <div style="width:150px;flex-shrink:0;font-size:11px;font-weight:600;color:#334155;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${esc(a.name || '')}</div>
      <div style="flex:1;position:relative;height:18px;background:#f1f5f9;border-radius:6px;">
        <div title="${fmtNice(a.schedule.plannedStart)} → ${fmtNice(_sbFinish(a))} (${d}d)" style="position:absolute;left:${left}%;width:${Math.max(2, width)}%;top:0;bottom:0;background:#7c3aed;border-radius:6px;"></div>
      </div></div>`;
  }).join('');
  host.innerHTML = `
    <div class="sb-wrap">
      <button onclick="window._navBack&&window._navBack()" style="margin-bottom:8px;padding:6px 14px;background:#f1f5f9;border:1px solid #e2e8f0;border-radius:8px;color:#64748b;font-size:12px;font-weight:600;cursor:pointer;">&larr; Back</button>
      ${_psStepper('sched')}
      <div style="display:flex;flex-wrap:wrap;align-items:flex-end;justify-content:space-between;gap:10px;margin-bottom:14px;">
        <div><h2 class="text-2xl font-extrabold text-slate-800">Scheduling</h2>
        <p class="text-xs text-slate-400 mt-0.5">${esc(p.name || '')} · set each activity's start &amp; duration (or Auto-Schedule) — dates sync straight to Planning.</p></div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;">
          ${list.length ? `<label style="font-size:11px;font-weight:700;color:#64748b;display:flex;align-items:center;gap:5px;">Project start <input type="date" value="${esc(projStart)}" onchange="window._sbSetProjStart(this.value)" style="${idate}"></label>` : ''}
          ${list.length ? `<button class="sb-btn-ok" onclick="window._sbAutoScheduleAll()" title="Sequence all activities from the project start using their durations">⚡ Auto-Schedule</button>` : ''}
          ${list.length ? `<button class="sb-btn-ghost" onclick="window._sbGanttPDF()">⬇ Gantt PDF</button>` : ''}
        </div>
      </div>
      ${!list.length
        ? `<div class="sb-empty"><div style="font-size:34px">📋</div><p class="font-bold text-slate-700">No activities to schedule yet</p><p class="text-xs text-slate-400 mt-1">Add your work activities in <b>Planning</b> first — they appear here to sequence on a timeline.</p><button class="sb-btn-primary mt-3" onclick="window.switchView&&window.switchView('execEngineView')">Go to Planning →</button></div>`
        : `<div style="display:flex;flex-direction:column;gap:16px;">
            <div style="background:#fff;border:1px solid #e2e8f0;border-radius:14px;overflow:hidden;"><div style="overflow-x:auto;"><table style="width:100%;border-collapse:collapse;font-size:12px;min-width:520px;">
              <thead><tr style="background:#f8fafc;color:#64748b;text-transform:uppercase;font-size:10px;"><th style="padding:7px 10px;text-align:left;">#</th><th style="padding:7px 10px;text-align:left;">Activity</th><th style="padding:7px 10px;text-align:left;">Start</th><th style="padding:7px 10px;text-align:left;">Days</th><th style="padding:7px 10px;text-align:left;">Finish</th></tr></thead>
              <tbody>${rows}</tbody></table></div></div>
            <div style="background:#fff;border:1px solid #e2e8f0;border-radius:14px;padding:14px;">
              <div style="font-size:12px;font-weight:800;color:#0f172a;margin-bottom:10px;">Timeline${minD ? ` · ${fmtNice(fmtISO(minD))} → ${fmtNice(fmtISO(maxD))}` : ''}</div>
              ${gantt || '<p style="font-size:12px;color:#94a3b8;">Set start dates (or Auto-Schedule) to see the timeline.</p>'}
            </div>
          </div>`}
    </div>`;
}
window.renderScheduleBuilder = renderScheduleBuilder;

window._sbSetStart = function (id, val) {
  const a = (state.execActivities || []).find(x => x.id === id); if (!a) return;
  a.schedule = a.schedule || {}; a.schedule.plannedStart = val;
  a.schedule.plannedFinish = val ? fmtISO(addDays(val, Math.max(0, num(a.schedule.duration)))) : '';
  saveAllData(); renderScheduleBuilder();
};
window._sbSetDur = function (id, val) {
  const a = (state.execActivities || []).find(x => x.id === id); if (!a) return;
  a.schedule = a.schedule || {}; a.schedule.duration = num(val);
  if (a.schedule.plannedStart) a.schedule.plannedFinish = fmtISO(addDays(a.schedule.plannedStart, Math.max(0, num(val))));
  saveAllData(); renderScheduleBuilder();
};
window._sbSetProjStart = function (val) { const p = proj(); if (p) { p.startDate = val; saveAllData(); } };
window._sbAutoScheduleAll = function () {
  const list = _sbActs(); if (!list.length) { showToast('Add activities in Planning first', 'info'); return; }
  const p = proj(); const start0 = (p && p.startDate) ? new Date(p.startDate) : new Date();
  const ordered = list.slice().sort((a, b) => {
    const sa = (a.schedule && a.schedule.plannedStart) || '9999-12-31', sb = (b.schedule && b.schedule.plannedStart) || '9999-12-31';
    return sa.localeCompare(sb) || (a.createdAt || '').localeCompare(b.createdAt || '');
  });
  let prevEnd = new Date(start0);
  ordered.forEach((a, i) => {
    a.schedule = a.schedule || {};
    const d = Math.max(1, num(a.schedule.duration) || 1);
    const s = i === 0 ? new Date(start0) : new Date(prevEnd);
    a.schedule.plannedStart = fmtISO(s); a.schedule.duration = d;
    const e = addDays(s, d); a.schedule.plannedFinish = fmtISO(e); prevEnd = e;
  });
  saveAllData(); renderScheduleBuilder();
  showToast(`Auto-scheduled ${ordered.length} activit${ordered.length === 1 ? 'y' : 'ies'}`, 'success');
};
window._sbGanttPDF = function () {
  const ns = window.jspdf; if (!ns) { showToast('PDF engine not ready', 'error'); return; }
  const list = _sbActs().filter(a => a.schedule && a.schedule.plannedStart);
  if (!list.length) { showToast('Nothing scheduled yet', 'warning'); return; }
  const doc = new ns.jsPDF('landscape');
  const pw = doc.internal.pageSize.getWidth();
  let y = getCompanyHeaderForPDF(doc);
  doc.setFontSize(13); doc.setFont('helvetica', 'bold'); doc.setTextColor(20);
  doc.text('PROJECT SCHEDULE', pw / 2, y + 5, { align: 'center' });
  doc.setFontSize(9); doc.setFont('helvetica', 'normal'); doc.setTextColor(90);
  doc.text(proj()?.name || '', pw / 2, y + 10, { align: 'center' });
  const body = list.map((a, i) => [i + 1, a.name || '', fmtNice(a.schedule.plannedStart), num(a.schedule.duration) || 1, fmtNice(_sbFinish(a))]);
  doc.autoTable({ startY: y + 14, head: [['#', 'Activity', 'Start', 'Days', 'Finish']], body, theme: 'grid', headStyles: { fillColor: [124, 58, 237], textColor: 255, fontSize: 9 }, styles: { fontSize: 8.5, cellPadding: 2.5 }, columnStyles: { 0: { cellWidth: 10 }, 3: { halign: 'center' } }, margin: { left: 12, right: 12 } });
  mobileSavePDF(doc, `Schedule-${(proj()?.name || 'project').replace(/[^a-z0-9]+/gi, '-')}.pdf`);
};

/* ── palette ── */
function _paletteHtml() {
  const items = palette().filter(t =>
    (_sbCat === 'All' || t.category === _sbCat) &&
    (!_sbSearch || t.name.toLowerCase().includes(_sbSearch.toLowerCase())));
  // Cache items by id and pass only the id via a data attribute — never embed JSON
  // in an HTML attribute (its double-quotes would break the attribute).
  _sbPalMap = {};
  items.forEach(t => { _sbPalMap[t.masterTaskId] = t; });
  const plannedCount = palette().filter(t => t.planned).length;
  return `
    <div class="sb-pal-head">Task Palette</div>
    <p class="sb-mini" style="padding:0 2px 8px;color:#94a3b8;">${plannedCount ? `${plannedCount} planned activit${plannedCount === 1 ? 'y' : 'ies'} from Planning — drag onto a location.` : 'No planned activities yet — add them in Planning, or drag from BOQ / the library below.'}</p>
    <input class="sb-search" placeholder="Search tasks…" value="${esc(_sbSearch)}" oninput="window._sbSearchInput(this.value)">
    <div class="sb-cats">${CATEGORIES.map(c => `<button class="sb-cat ${_sbCat === c ? 'active' : ''}" onclick="window._sbCatSet('${c}')">${c}</button>`).join('')}</div>
    <div class="sb-pal-list">
      ${items.length ? items.map(t => `
        <div class="sb-chip" draggable="true" data-mtid="${esc(t.masterTaskId)}" ondragstart="window._sbPalDragStart(event, this.getAttribute('data-mtid'))" title="${t.planned ? 'Planned activity — drag onto a location' : 'Drag onto a location'}" ${t.planned ? 'style="border-left:3px solid #7c3aed;"' : ''}>
          <span class="sb-chip-ic">${t.icon}</span><span class="sb-chip-nm">${esc(t.name)}${t.planned ? ` <span style="font-size:9px;color:#7c3aed;font-weight:700;">•${t.duration || '?'}d</span>` : ''}</span>
        </div>`).join('')
      : `<p class="sb-mini" style="padding:12px">No tasks in this category.</p>`}
    </div>`;
}
window._sbCatSet = function (c) { _sbCat = c; _rerenderPalette(); };
window._sbSearchInput = function (v) { _sbSearch = v; _rerenderPalette(); };
function _rerenderPalette() { const a = document.querySelector('.sb-palette'); if (a) a.innerHTML = _paletteHtml(); }

/* ── location tabs + manager ── */
function _locTab(l) {
  const active = l.id === _sbLocId;
  return `<div class="sb-loctab ${active ? 'active' : ''}" onclick="window._sbSelectLoc('${l.id}')">
    <span class="sb-loctab-nm">${esc(l.name)}</span><span class="sb-loctab-ct">${(l.tasks || []).length}</span>
    ${active ? `<span class="sb-loctab-actions">
      <button onclick="event.stopPropagation();window._sbRenameLocation('${l.id}')" title="Rename">✏️</button>
      <button onclick="event.stopPropagation();window._sbDuplicateLocation('${l.id}')" title="Duplicate location">⧉</button>
      <button onclick="event.stopPropagation();window._sbDeleteLocation('${l.id}')" title="Delete">🗑️</button>
    </span>` : ''}
  </div>`;
}
window._sbSelectLoc = function (id) { _sbLocId = id; renderScheduleBuilder(); };
window._sbAddLocation = function () {
  const name = prompt('Location name (e.g. "Building A – Ground Floor"):', '');
  if (name == null) return;
  const nm = name.trim(); if (!nm) return;
  ensure();
  const l = { id: uid('loc'), projectId: pid(), name: nm, startDate: '', tasks: [], createdAt: new Date().toISOString() };
  state.scheduleLocations.push(l); _sbLocId = l.id; _sbTouch(); renderScheduleBuilder();
};
window._sbRenameLocation = function (id) {
  const l = locById(id); if (!l) return;
  const nm = prompt('Rename location:', l.name); if (nm == null) return;
  if (nm.trim()) { l.name = nm.trim(); _sbTouch(); renderScheduleBuilder(); }
};
window._sbDeleteLocation = function (id) {
  const l = locById(id); if (!l) return;
  if (!confirm(`Delete location "${l.name}" and its ${(l.tasks || []).length} task(s)?`)) return;
  window.recycleDelete && window.recycleDelete('scheduleLocations', id, 'Schedule Location', l.name);
  if (_sbLocId === id) _sbLocId = null;
  saveAllData(); _sbDirty = false; renderScheduleBuilder();
};
window._sbDuplicateLocation = function (id) {
  const l = locById(id); if (!l) return;
  const nm = prompt('Name for the duplicated location:', l.name + ' (copy)');
  if (nm == null || !nm.trim()) return;
  ensure();
  const copy = { id: uid('loc'), projectId: pid(), name: nm.trim(), startDate: l.startDate || '',
    tasks: (l.tasks || []).map((t, i) => ({ ...t, id: uid('t'), order: i + 1, startDate: '' })), createdAt: new Date().toISOString() };
  state.scheduleLocations.push(copy); _sbLocId = copy.id; _sbTouch(); renderScheduleBuilder();
  showToast(`Location duplicated with ${copy.tasks.length} task(s)`, 'success');
};

/* ── drop zone (timeline) ── */
function _dropZone(loc) {
  if (!loc) return '';
  const tasks = (loc.tasks || []).slice().sort((a, b) => (a.order || 0) - (b.order || 0));
  const dup = dupCounts();
  return `
    <div class="sb-zonebar">
      <label class="sb-startfld">Location start
        <input type="date" value="${esc(loc.startDate || '')}" onchange="window._sbLocStart('${loc.id}', this.value)">
      </label>
      <div class="flex gap-2">
        <button class="sb-btn-ok" onclick="window._sbAutoSchedule('${loc.id}')" title="Set start dates sequentially from durations & dependencies">⚡ Auto-Schedule</button>
        ${(loc.tasks || []).length ? `<button class="sb-btn-ghost" onclick="window._sbSendToBaseline('${loc.id}')" title="Create draft baseline activities in Planning & Execution from this location">→ Send to Baseline</button>` : ''}
      </div>
    </div>
    <div class="sb-zone" ondragover="window._sbAllow(event)" ondrop="window._sbDrop(event, null)">
      ${!tasks.length
      ? `<div class="sb-zone-empty" ondragover="window._sbAllow(event)" ondrop="window._sbDrop(event, null)">⬇ Drag tasks here to build the sequence</div>`
      : tasks.map((t, i) => _taskCard(loc, t, i, dup)).join('') + `<div class="sb-zone-tail" ondragover="window._sbAllow(event)" ondrop="window._sbDrop(event, null)">Drop here to add at the end</div>`}
    </div>`;
}
function _taskCard(loc, t, i, dup) {
  const isDup = (dup[(t.name || '').toLowerCase()] || 0) > 1;
  const deps = loc.tasks.filter(x => x.id !== t.id).sort((a, b) => (a.order || 0) - (b.order || 0));
  return `
    <div class="sb-task" draggable="true"
      ondragstart="window._sbTaskDragStart(event,'${t.id}')"
      ondragover="window._sbAllow(event)" ondrop="window._sbDrop(event, ${i})">
      <div class="sb-task-seq">${i + 1}</div>
      <div class="sb-task-ic">${t.icon || '🔧'}</div>
      <div class="sb-task-main">
        <div class="sb-task-nm">${esc(t.name)}${isDup ? '<span class="sb-dup" title="This task also appears in another location">repeated</span>' : ''}</div>
        <div class="sb-task-fields">
          <label>Dur<input type="number" min="0" class="sb-in" value="${esc(t.duration)}" oninput="window._sbTaskField('${loc.id}','${t.id}','duration',this.value)"><span>d</span></label>
          <label>Start<input type="date" class="sb-in sb-in-date" value="${esc(t.startDate || '')}" onchange="window._sbTaskField('${loc.id}','${t.id}','startDate',this.value)"></label>
          <label>After
            <select class="sb-in" onchange="window._sbTaskDep('${loc.id}','${t.id}',this.value)">
              <option value="">— sequence —</option>
              ${deps.map(d => `<option value="${d.id}" ${(t.deps || []).includes(d.id) ? 'selected' : ''}>${esc(d.name)}</option>`).join('')}
            </select>
          </label>
          ${t.startDate && num(t.duration) ? `<span class="sb-end">→ ${fmtNice(fmtISO(addDays(t.startDate, num(t.duration))))}</span>` : ''}
        </div>
      </div>
      <button class="sb-task-del" onclick="window._sbRemoveTask('${loc.id}','${t.id}')" title="Remove">✕</button>
    </div>`;
}

/* ── drag & drop handlers (native HTML5) ── */
window._sbPalDragStart = function (ev, mtid) { const t = _sbPalMap[mtid]; _sbDrag = t ? { type: 'new', task: t } : null; try { ev.dataTransfer.effectAllowed = 'copy'; ev.dataTransfer.setData('text/plain', mtid || 'new'); } catch {} };
window._sbTaskDragStart = function (ev, taskId) { _sbDrag = { type: 'move', taskId }; ev.dataTransfer.effectAllowed = 'move'; ev.dataTransfer.setData('text/plain', taskId); };
window._sbAllow = function (ev) { ev.preventDefault(); ev.dataTransfer.dropEffect = _sbDrag && _sbDrag.type === 'new' ? 'copy' : 'move'; if (ev.currentTarget.classList) ev.currentTarget.classList.add('sb-over'); };
window._sbDrop = function (ev, beforeIndex) {
  ev.preventDefault(); ev.stopPropagation();
  const loc = locById(_sbLocId); if (!loc || !_sbDrag) { _sbDrag = null; return; }
  loc.tasks = loc.tasks || [];
  if (_sbDrag.type === 'new') {
    const t = _sbDrag.task;
    const nt = { id: uid('t'), masterTaskId: t.masterTaskId, name: t.name, icon: t.icon, category: t.category || catFor(t.name), duration: (t.duration && t.duration > 0) ? t.duration : 1, startDate: '', deps: [], planned: !!t.planned, plannedActId: t.planned ? t.masterTaskId : '' };
    _insert(loc, nt, beforeIndex);
  } else if (_sbDrag.type === 'move') {
    const idx = loc.tasks.findIndex(x => x.id === _sbDrag.taskId);
    if (idx > -1) { const [moved] = loc.tasks.splice(idx, 1); _insert(loc, moved, beforeIndex, idx); }
  }
  _sbDrag = null;
  _reorder(loc); _sbTouch(); renderScheduleBuilder();
};
function _insert(loc, task, beforeIndex, removedFrom) {
  let bi = beforeIndex;
  if (bi == null || bi < 0 || bi > loc.tasks.length) loc.tasks.push(task);
  else { if (removedFrom != null && removedFrom < bi) bi -= 1; loc.tasks.splice(bi, 0, task); }
}
function _reorder(loc) { (loc.tasks || []).forEach((t, i) => t.order = i + 1); }

/* ── task customization ── */
window._sbTaskField = function (locId, taskId, field, val) {
  const l = locById(locId); const t = l && (l.tasks || []).find(x => x.id === taskId); if (!t) return;
  t[field] = field === 'duration' ? num(val) : val;
  _sbTouch();
  // update just the end-date chip without a full re-render (keeps focus)
  if (field === 'startDate' || field === 'duration') renderScheduleBuilder();
};
window._sbTaskDep = function (locId, taskId, depId) {
  const l = locById(locId); const t = l && (l.tasks || []).find(x => x.id === taskId); if (!t) return;
  t.deps = depId ? [depId] : [];
  _sbTouch();
};
window._sbRemoveTask = function (locId, taskId) {
  const l = locById(locId); if (!l) return;
  l.tasks = (l.tasks || []).filter(x => x.id !== taskId); _reorder(l); _sbTouch(); renderScheduleBuilder();
};
window._sbLocStart = function (locId, val) { const l = locById(locId); if (l) { l.startDate = val; _sbTouch(); } };

/* ── auto-schedule ── */
window._sbAutoSchedule = function (locId) {
  const loc = locById(locId); if (!loc || !(loc.tasks || []).length) return;
  const tasks = loc.tasks.slice().sort((a, b) => (a.order || 0) - (b.order || 0));
  const start0 = loc.startDate ? new Date(loc.startDate) : (proj()?.startDate ? new Date(proj().startDate) : new Date());
  const byId = {}; tasks.forEach(t => byId[t.id] = t);
  let prevEnd = start0;
  tasks.forEach((t, i) => {
    let start = i === 0 ? new Date(start0) : new Date(prevEnd);
    (t.deps || []).forEach(depId => { const d = byId[depId]; if (d && d._end && d._end > start) start = new Date(d._end); });
    t.startDate = fmtISO(start);
    t._end = addDays(start, Math.max(0, num(t.duration)));
    prevEnd = t._end;
  });
  tasks.forEach(t => delete t._end);
  _sbTouch(); renderScheduleBuilder();
  showToast('Start dates auto-scheduled from durations & dependencies', 'success');
};

/* ── push scheduled dates back into the Planning activities ── */
/** Any scheduled task linked to a planned activity and carrying a start date? */
function _sbHasPlannedLinks() {
  return locs().some(l => (l.tasks || []).some(t => t.plannedActId && t.startDate));
}
window._sbPushToPlanning = function () {
  // Aggregate each planned activity's placements: earliest start, latest finish
  // (an activity can be scheduled across several locations).
  const byAct = {};
  locs().forEach(l => (l.tasks || []).forEach(t => {
    if (!t.plannedActId || !t.startDate) return;
    const s = new Date(t.startDate);
    const f = addDays(t.startDate, Math.max(0, num(t.duration)));
    const cur = byAct[t.plannedActId];
    if (!cur) byAct[t.plannedActId] = { minStart: s, maxFinish: f };
    else { if (s < cur.minStart) cur.minStart = s; if (f > cur.maxFinish) cur.maxFinish = f; }
  }));
  const ids = Object.keys(byAct);
  if (!ids.length) { showToast('Nothing to push — drag planned activities onto locations and Auto-Schedule first.', 'info'); return; }
  const acts = state.execActivities || [];
  const linked = ids.filter(id => acts.some(a => a.id === id));
  if (!linked.length) { showToast('Linked Planning activities were not found.', 'error'); return; }
  if (!confirm(`Update ${linked.length} Planning activit${linked.length === 1 ? 'y' : 'ies'} with the start / finish dates from this schedule?\n\nThis overwrites their Planned Start, Planned Finish and Duration.`)) return;
  let updated = 0;
  linked.forEach(id => {
    const a = acts.find(x => x.id === id); if (!a) return;
    if (!a.schedule) a.schedule = {};
    a.schedule.plannedStart = fmtISO(byAct[id].minStart);
    a.schedule.plannedFinish = fmtISO(byAct[id].maxFinish);
    a.schedule.duration = Math.max(1, Math.round((byAct[id].maxFinish - byAct[id].minStart) / 86400000));
    a.schedule.datedFromSchedule = new Date().toISOString();
    updated++;
  });
  saveAllData(); _sbDirty = false;
  showToast(`Pushed schedule dates to ${updated} Planning activit${updated === 1 ? 'y' : 'ies'}`, 'success');
  try { if (typeof window.renderExecEngine === 'function' && document.getElementById('execEngineContent')) window.renderExecEngine(); } catch {}
};

/* ── send location → Execution baseline (draft activities) ── */
window._sbSendToBaseline = function (locId) {
  const loc = locById(locId); if (!loc || !(loc.tasks || []).length) return;
  if (!confirm(`Create ${loc.tasks.length} draft baseline activit${loc.tasks.length === 1 ? 'y' : 'ies'} in Planning & Execution from "${loc.name}"?\n\nThey open as drafts for you to add resources/cost and Approve. Tasks already sent are skipped.`)) return;
  let res;
  saveAllData(); _sbDirty = false; _updateSaveBtn();   // persist the schedule before/with seeding
  try { res = seedBaselineFromSchedule(loc); } catch (e) { console.warn('[schedule→baseline]', e); return showToast('Could not send to baseline: ' + (e.message || e), 'error'); }
  if (!res.added) return showToast(res.skipped ? 'Already sent — nothing new to add' : 'Nothing to send', 'info');
  showToast(`${res.added} activit${res.added === 1 ? 'y' : 'ies'} added to baseline${res.skipped ? `, ${res.skipped} already there` : ''}`, 'success');
  if (confirm('Open Planning & Execution to review and approve the baseline now?')) {
    if (typeof window.switchView === 'function') window.switchView('execEngineView');
    if (typeof window.renderExecEngine === 'function') window.renderExecEngine('baseline');
  }
};

/* ── export: per-location table + simple Gantt ── */
window._sbExportPDF = function () {
  const list = locs(); if (!list.length) return showToast('No locations to export', 'error');
  const ns = window.jspdf; if (!ns) return showToast('PDF engine not ready', 'error');
  const doc = new ns.jsPDF({ unit: 'mm', format: 'a4', orientation: 'landscape' });
  const ml = 12; let y = getCompanyHeaderForPDF(doc);
  doc.setFontSize(13); doc.setFont(undefined, 'bold'); doc.text('Location-wise Construction Schedule', ml, y); y += 5;
  doc.setFontSize(9); doc.setFont(undefined, 'normal');
  doc.text(`Project: ${proj()?.name || '—'}   |   ${new Date().toLocaleDateString('en-IN')}`, ml, y); y += 4;

  // date range across all tasks (for the Gantt)
  let minD = null, maxD = null;
  list.forEach(l => (l.tasks || []).forEach(t => { if (t.startDate) { const s = new Date(t.startDate), e = addDays(t.startDate, num(t.duration)); if (!minD || s < minD) minD = s; if (!maxD || e > maxD) maxD = e; } }));

  list.forEach(l => {
    const tasks = (l.tasks || []).slice().sort((a, b) => (a.order || 0) - (b.order || 0));
    if (y > 180) { doc.addPage(); y = 18; }
    doc.setFont(undefined, 'bold'); doc.setFontSize(11); doc.text(l.name, ml, y); y += 1;
    doc.autoTable({
      startY: y + 2, margin: { left: ml, right: ml }, styles: { fontSize: 8 }, headStyles: { fontStyle: 'bold' }, theme: 'grid',
      head: [['#', 'Task', 'Duration (d)', 'Start', 'End']],
      body: tasks.length ? tasks.map((t, i) => [i + 1, t.name, num(t.duration), t.startDate ? fmtNice(t.startDate) : '—', t.startDate ? fmtNice(fmtISO(addDays(t.startDate, num(t.duration)))) : '—'])
        : [['—', 'No tasks', '', '', '']],
    });
    y = doc.lastAutoTable.finalY + 4;
    // mini Gantt for this location if dated
    if (minD && maxD && tasks.some(t => t.startDate)) {
      const totalDays = Math.max(1, Math.round((maxD - minD) / 86400000));
      const gx = ml + 55, gw = 270 - 55, rowH = 5;
      if (y + tasks.length * rowH > 195) { doc.addPage(); y = 18; }
      tasks.forEach(t => {
        if (!t.startDate) { y += rowH; return; }
        doc.setFontSize(7); doc.setTextColor(60); doc.text(String(t.name).slice(0, 34), ml, y + 3.5);
        const s = new Date(t.startDate); const off = Math.round((s - minD) / 86400000);
        const bx = gx + (off / totalDays) * gw; const bw = Math.max(1.5, (Math.max(0, num(t.duration)) / totalDays) * gw);
        doc.setFillColor(30, 58, 138); doc.roundedRect(bx, y, bw, rowH - 1.5, 0.6, 0.6, 'F');
        y += rowH;
      });
      doc.setTextColor(0); y += 3;
    }
    y += 3;
  });
  mobileSavePDF(doc, `Schedule-${(proj()?.name || 'project').replace(/[^a-z0-9]+/gi, '-')}.pdf`);
};
