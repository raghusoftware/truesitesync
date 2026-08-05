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
import { state, saveAllData } from './state.js';
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
const CATEGORIES = ['All', 'BOQ', 'Substructure', 'Superstructure', 'Finishing', 'MEP'];

/* ── module UI state ── */
let _sbLocId = null;      // selected location
let _sbCat = 'All';       // palette category filter
let _sbSearch = '';
let _sbDrag = null;       // { type:'new'|'move', task?, taskId? }
let _sbPalMap = {};       // masterTaskId → palette item (avoids embedding JSON in HTML)

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
export function renderScheduleBuilder() {
  ensure();
  const host = document.getElementById('scheduleBuilderContent');
  if (!host) return;
  const p = proj();
  if (!p) { host.innerHTML = `<div class="sb-empty"><div style="font-size:34px">🗓️</div><p class="font-bold text-slate-700">Select a project first</p></div>`; return; }
  const list = locs();
  if (_sbLocId && !locById(_sbLocId)) _sbLocId = null;
  if (!_sbLocId && list.length) _sbLocId = list[0].id;

  host.innerHTML = `
    <div class="sb-wrap">
      <div class="sb-head">
        <div>
          <h2 class="text-2xl font-extrabold text-slate-800">Schedule Builder</h2>
          <p class="text-xs text-slate-400 mt-0.5">${esc(p.name || '')} · drag tasks onto each location, then Auto-Schedule</p>
        </div>
        <div class="flex gap-2">
          ${list.length ? `<button class="sb-btn-ghost" onclick="window._sbExportPDF()">⬇ Gantt PDF</button>` : ''}
          <button class="sb-btn-primary" onclick="window._sbAddLocation()">+ New Location</button>
        </div>
      </div>
      ${!list.length
      ? `<div class="sb-empty"><div style="font-size:34px">📍</div><p class="font-bold text-slate-700">No locations yet</p><p class="text-xs text-slate-400 mt-1">Create a location (e.g. “Building A – Ground Floor”), then drag tasks from the palette onto its timeline.</p><button class="sb-btn-primary mt-3" onclick="window._sbAddLocation()">+ New Location</button></div>`
      : `<div class="sb-body">
          <aside class="sb-palette">${_paletteHtml()}</aside>
          <section class="sb-main">
            <div class="sb-loctabs">${list.map(_locTab).join('')}</div>
            ${_sbLocId ? _dropZone(locById(_sbLocId)) : ''}
          </section>
        </div>`}
    </div>`;
}
window.renderScheduleBuilder = renderScheduleBuilder;

/* ── palette ── */
function _paletteHtml() {
  const items = palette().filter(t =>
    (_sbCat === 'All' || t.category === _sbCat) &&
    (!_sbSearch || t.name.toLowerCase().includes(_sbSearch.toLowerCase())));
  // Cache items by id and pass only the id via a data attribute — never embed JSON
  // in an HTML attribute (its double-quotes would break the attribute).
  _sbPalMap = {};
  items.forEach(t => { _sbPalMap[t.masterTaskId] = t; });
  return `
    <div class="sb-pal-head">Task Palette</div>
    <input class="sb-search" placeholder="Search tasks…" value="${esc(_sbSearch)}" oninput="window._sbSearchInput(this.value)">
    <div class="sb-cats">${CATEGORIES.map(c => `<button class="sb-cat ${_sbCat === c ? 'active' : ''}" onclick="window._sbCatSet('${c}')">${c}</button>`).join('')}</div>
    <div class="sb-pal-list">
      ${items.length ? items.map(t => `
        <div class="sb-chip" draggable="true" data-mtid="${esc(t.masterTaskId)}" ondragstart="window._sbPalDragStart(event, this.getAttribute('data-mtid'))" title="Drag onto a location">
          <span class="sb-chip-ic">${t.icon}</span><span class="sb-chip-nm">${esc(t.name)}</span>
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
  state.scheduleLocations.push(l); _sbLocId = l.id; saveAllData(); renderScheduleBuilder();
};
window._sbRenameLocation = function (id) {
  const l = locById(id); if (!l) return;
  const nm = prompt('Rename location:', l.name); if (nm == null) return;
  if (nm.trim()) { l.name = nm.trim(); saveAllData(); renderScheduleBuilder(); }
};
window._sbDeleteLocation = function (id) {
  const l = locById(id); if (!l) return;
  if (!confirm(`Delete location "${l.name}" and its ${(l.tasks || []).length} task(s)?`)) return;
  window.recycleDelete && window.recycleDelete('scheduleLocations', id, 'Schedule Location', l.name);
  if (_sbLocId === id) _sbLocId = null;
  saveAllData(); renderScheduleBuilder();
};
window._sbDuplicateLocation = function (id) {
  const l = locById(id); if (!l) return;
  const nm = prompt('Name for the duplicated location:', l.name + ' (copy)');
  if (nm == null || !nm.trim()) return;
  ensure();
  const copy = { id: uid('loc'), projectId: pid(), name: nm.trim(), startDate: l.startDate || '',
    tasks: (l.tasks || []).map((t, i) => ({ ...t, id: uid('t'), order: i + 1, startDate: '' })), createdAt: new Date().toISOString() };
  state.scheduleLocations.push(copy); _sbLocId = copy.id; saveAllData(); renderScheduleBuilder();
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
    const nt = { id: uid('t'), masterTaskId: t.masterTaskId, name: t.name, icon: t.icon, category: t.category || catFor(t.name), duration: 1, startDate: '', deps: [] };
    _insert(loc, nt, beforeIndex);
  } else if (_sbDrag.type === 'move') {
    const idx = loc.tasks.findIndex(x => x.id === _sbDrag.taskId);
    if (idx > -1) { const [moved] = loc.tasks.splice(idx, 1); _insert(loc, moved, beforeIndex, idx); }
  }
  _sbDrag = null;
  _reorder(loc); saveAllData(); renderScheduleBuilder();
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
  saveAllData();
  // update just the end-date chip without a full re-render (keeps focus)
  if (field === 'startDate' || field === 'duration') renderScheduleBuilder();
};
window._sbTaskDep = function (locId, taskId, depId) {
  const l = locById(locId); const t = l && (l.tasks || []).find(x => x.id === taskId); if (!t) return;
  t.deps = depId ? [depId] : [];
  saveAllData();
};
window._sbRemoveTask = function (locId, taskId) {
  const l = locById(locId); if (!l) return;
  l.tasks = (l.tasks || []).filter(x => x.id !== taskId); _reorder(l); saveAllData(); renderScheduleBuilder();
};
window._sbLocStart = function (locId, val) { const l = locById(locId); if (l) { l.startDate = val; saveAllData(); } };

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
  saveAllData(); renderScheduleBuilder();
  showToast('Start dates auto-scheduled from durations & dependencies', 'success');
};

/* ── send location → Execution baseline (draft activities) ── */
window._sbSendToBaseline = function (locId) {
  const loc = locById(locId); if (!loc || !(loc.tasks || []).length) return;
  if (!confirm(`Create ${loc.tasks.length} draft baseline activit${loc.tasks.length === 1 ? 'y' : 'ies'} in Planning & Execution from "${loc.name}"?\n\nThey open as drafts for you to add resources/cost and Approve. Tasks already sent are skipped.`)) return;
  let res;
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
