/**
 * Micro-Planning Module v2 — Daily & Weekly Labor Allocation Engine
 * - Users can add custom tasks (not just from BOQ/planning)
 * - Specify hours required, labour requirements per trade
 * - Shows free/available labour for each day
 * - Supports daily and weekly planning modes
 */
import { state, saveAllData } from './state.js';
import { showToast, formatINR, getCurrencySymbol, getCompanyHeaderForPDF } from './utils.js';

// ─────────────────────────────────────────────────────
//  CONSTANTS & HELPERS
// ─────────────────────────────────────────────────────
const WORK_HOURS = 8;
const SUNDAY = 0;

function _fmtDate(d) { return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); } // local parts — toISOString shifts a day back in ahead-of-UTC zones (IST)
function _parseDate(s) { const [y,m,d] = s.split('-').map(Number); return new Date(y, m-1, d); }
function _isWorkingDay(dateStr) {
  const d = _parseDate(dateStr);
  if (d.getDay() === SUNDAY) return false;
  const proj = state.projects.find(p => p.id === state.currentProjectId);
  return !(proj?.holidays || []).includes(dateStr);
}
function _nextWorkingDay(dateStr) {
  let d = _parseDate(dateStr);
  do { d.setDate(d.getDate() + 1); } while (d.getDay() === SUNDAY);
  return _fmtDate(d);
}
function _workingDaysInRange(s, e) {
  const dates = []; let d = _parseDate(s); const end = _parseDate(e);
  while (d <= end) { const ds = _fmtDate(d); if (_isWorkingDay(ds)) dates.push(ds); d.setDate(d.getDate()+1); }
  return dates;
}
function _esc(s) { return (s||'').replace(/"/g,'&quot;').replace(/</g,'&lt;'); }

function _pid() { return state.currentProjectId || state.projects?.[0]?.id; }

function _getProjectWorkers() {
  const pid = _pid();
  return (state.labourMaster || []).filter(w => !w.projectId || w.projectId === pid);
}

function _getWorkerExceptions(w) {
  if (w.calendar_exceptions) return w.calendar_exceptions;
  return (state.attendanceLogs || []).filter(a => a.labourId === w.id && a.status === 'Absent').map(a => a.date);
}
function _isWorkerAvailable(w, dateStr) { return !_getWorkerExceptions(w).includes(dateStr); }

// Get ALL tasks for this project (planning + custom micro-tasks)
function _getAllTasks() {
  const pid = _pid();
  const planning = (state.planningTasks || []).filter(t => t.projectId === pid && t.status !== 'Completed');
  const micro = (state.microTasks || []).filter(t => t.projectId === pid && t.status !== 'Completed');
  return [...planning, ...micro];
}

// ─────────────────────────────────────────────────────
//  MICRO TASK CRUD
// ─────────────────────────────────────────────────────
// Canonical trade list — MUST mirror planning.js _TRADES so both modules show
// the same dropdown. Any extra trades found on actual workers are appended.
const _PLAN_TRADES = ['Mason','Bar Bender','Shuttering Carpenter','Steel Fixer','Plumber','Electrician','Painter','Welder','Operator','Skilled Helper','Unskilled Helper','Mistri'];
function _getUniqueTrades() {
  const byKey = new Map();           // lowercase key -> display value (order preserved)
  _PLAN_TRADES.forEach(t => byKey.set(t.toLowerCase(), t));
  _getProjectWorkers().forEach(w => {
    const t = (w.trade || '').trim();
    if (t && !byKey.has(t.toLowerCase())) byKey.set(t.toLowerCase(), t);
  });
  return [...byKey.values()];
}

export function mpOpenTaskForm(editId) {
  document.getElementById('mpTaskFormModal')?.remove();
  const existing = editId ? (state.microTasks || []).concat(state.planningTasks || []).find(t => t.id === editId) : null;
  const today = new Date().toISOString().split('T')[0];
  const trades = _getUniqueTrades();
  const allTasks = _getAllTasks().filter(t => t.id !== editId);

  // Parse existing labour requirements.
  // Carry over from the Planning module: planning tasks store labour as
  // `labourReq` ([{trade,count}]); micro tasks use `labourReqs`
  // ([{trade,count,hoursPerDay}]). If a planning task hasn't been micro-edited
  // yet, map its planned labour in so "2 masons required" shows up pre-filled.
  let existingLabour = existing?.labourReqs || [];
  if ((!existingLabour || !existingLabour.length) && existing?.labourReq?.length) {
    existingLabour = existing.labourReq.map(l => ({ trade: l.trade, count: l.count, hoursPerDay: 8 }));
  }

  const html = `
    <div id="mpTaskFormModal" class="ef-overlay" style="z-index:199999" onclick="if(event.target===this)_mpCloseTaskForm()">
      <div class="ef-modal" style="max-width:620px;">
        <div class="ef-header" style="background:linear-gradient(135deg,#1e3a8a,#3b82f6)">
          <h3 class="ef-title" style="color:#fff">${existing ? 'Edit Task' : 'Add Micro-Plan Task'}</h3>
          <button onclick="_mpCloseTaskForm()" class="ef-close" style="color:#fff">&times;</button>
        </div>
        <div class="ef-body" style="max-height:70vh;overflow-y:auto">
          <div class="ef-grid">
            <div class="ef-field ef-field-full">
              <label class="ef-label">Task Name *</label>
              <input type="text" id="mpt_name" class="ef-input" value="${_esc(existing?.name || '')}" placeholder="e.g. RCC Slab Casting Block-B">
            </div>
            <div class="ef-field ef-field-full">
              <label class="ef-label">Location / Area</label>
              <input type="text" id="mpt_area" class="ef-input" value="${_esc(existing?.area || '')}" placeholder="e.g. Building A, 2nd Floor">
            </div>
            <div class="ef-field">
              <label class="ef-label">Start Date *</label>
              <input type="date" id="mpt_start" class="ef-input" value="${existing?.startDate || today}">
            </div>
            <div class="ef-field">
              <label class="ef-label">End Date *</label>
              <input type="date" id="mpt_end" class="ef-input" value="${existing?.endDate || today}">
            </div>
            <div class="ef-field">
              <label class="ef-label">Total Hours Required *</label>
              <input type="number" id="mpt_hours" class="ef-input" value="${existing?.totalEffortHours || ''}" placeholder="e.g. 48" min="1">
            </div>
            <div class="ef-field">
              <label class="ef-label">Priority</label>
              <select id="mpt_priority" class="ef-input">
                ${['Critical','High','Medium','Low'].map(p => `<option value="${p}" ${(existing?.priority||'Medium')===p?'selected':''}>${p}</option>`).join('')}
              </select>
            </div>
            <div class="ef-field">
              <label class="ef-label">Dependency (after)</label>
              <select id="mpt_dep" class="ef-input">
                <option value="">-- None --</option>
                ${allTasks.map(t => `<option value="${t.id}" ${existing?.dependsOn===t.id?'selected':''}>${t.name}</option>`).join('')}
              </select>
            </div>
            <div class="ef-field">
              <label class="ef-label">Quantity (optional)</label>
              <input type="number" id="mpt_qty" class="ef-input" value="${existing?.quantity || ''}" placeholder="e.g. 500 sqft">
            </div>
          </div>

          <!-- LABOUR REQUIREMENTS SECTION -->
          <div class="mt-5 border-t pt-4">
            <div class="flex items-center justify-between mb-3">
              <h4 class="font-bold text-sm text-slate-800">Labour Requirements</h4>
              <button onclick="_mpAddLabourRow()" class="text-xs bg-blue-100 text-blue-700 px-3 py-1.5 rounded-lg font-bold hover:bg-blue-200">+ Add Trade</button>
            </div>
            <p class="text-[10px] text-slate-400 mb-2">Specify how many workers of each trade are needed per day for this task.</p>
            <div id="mptLabourRows">
              ${existingLabour.length > 0
                ? existingLabour.map((lr, i) => _labourReqRowHtml(i, trades, lr.trade, lr.count, lr.hoursPerDay)).join('')
                : _labourReqRowHtml(0, trades, '', 1, 8)
              }
            </div>
          </div>

          <!-- PLANNED RESOURCES (carried over from the Planning module) -->
          ${existing ? _plannedResourcesSummary(existing) : ''}

          <!-- ADDITIONAL MATERIAL (beyond the plan) -->
          <div class="mt-5 border-t pt-4">
            <div class="flex items-center justify-between mb-2">
              <h4 class="font-bold text-sm text-slate-800">Additional Material <span class="text-[10px] font-medium text-slate-400">(beyond the plan)</span></h4>
              <button onclick="_mpAddMatRow()" class="text-xs bg-emerald-100 text-emerald-700 px-3 py-1.5 rounded-lg font-bold hover:bg-emerald-200">+ Add Material</button>
            </div>
            <div id="mptMatRows">
              ${(existing?.extraMaterials || []).map(m => _mpMatRowHtml(m.materialId, m.qty)).join('')}
            </div>
          </div>

          <!-- REASON FOR CHANGES BEYOND PLAN -->
          <div class="mt-4">
            <label class="ef-label">Reason for extra labour / material (beyond the plan)</label>
            <textarea id="mpt_changeReason" class="ef-input ef-textarea" rows="2" placeholder="e.g. 2 extra masons + 10 bags cement needed because slab area increased on site">${_esc(existing?.changeReason || '')}</textarea>
          </div>

          <!-- REMARKS -->
          <div class="mt-4">
            <label class="ef-label">Remarks</label>
            <input type="text" id="mpt_remarks" class="ef-input" value="${_esc(existing?.remarks || '')}" placeholder="Special instructions...">
          </div>
        </div>
        <div class="ef-footer">
          <button onclick="_mpCloseTaskForm()" class="ef-btn-cancel">Cancel</button>
          <button onclick="_mpSaveTask('${editId || ''}')" class="ef-btn-save">${existing ? 'Update Task' : 'Add Task'}</button>
        </div>
      </div>
    </div>`;
  document.body.insertAdjacentHTML('beforeend', html);
  setTimeout(() => document.getElementById('mpt_name')?.focus(), 100);
}

// Read-only summary of material / equipment / tools planned for a task in the
// Planning module — shown in the micro-plan form so the carried-over
// requirements are visible.
function _plannedResourcesSummary(task) {
  if (!task) return '';
  const rm = id => (state.rawMaterials || []).find(r => r.id === id);
  const mats = (state.taskMaterials || []).filter(m => m.taskId === task.id);
  const eqs  = (state.taskEquipment || []).filter(e => e.taskId === task.id);
  const tools = task.toolsReq || [];
  if (!mats.length && !eqs.length && !tools.length) return '';
  const chip = (txt, bg, col) => `<span style="display:inline-block;background:${bg};color:${col};font-size:10px;font-weight:600;padding:2px 8px;border-radius:6px;margin:2px 4px 2px 0;">${_esc(txt)}</span>`;
  let h = '<div class="mt-4 p-3 rounded-lg" style="background:#f6faf8;border:1px solid #e6ece8;">';
  h += '<div class="text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-1.5">📋 Carried over from Planning</div>';
  if (mats.length) h += '<div class="mb-1"><span class="text-[10px] text-slate-400">Material:</span> ' + mats.map(m => chip(((rm(m.materialId)?.name) || m.materialName || '—') + ' · ' + (m.qtyRequired || 0) + (m.fromRecipe ? ' (recipe)' : ''), '#ecfdf5', '#047857')).join('') + '</div>';
  if (eqs.length) h += '<div class="mb-1"><span class="text-[10px] text-slate-400">Equipment:</span> ' + eqs.map(e => chip((state.equipmentList || []).find(x => x.id === e.equipmentId)?.name || '—', '#f5f3ff', '#6d28d9')).join('') + '</div>';
  if (tools.length) h += '<div><span class="text-[10px] text-slate-400">Tools:</span> ' + tools.map(t => chip(((rm(t.toolId)?.name) || '—') + (t.qty ? ' · ' + t.qty : ''), '#faf6ea', '#92700a')).join('') + '</div>';
  h += '</div>';
  return h;
}

function _labourReqRowHtml(idx, trades, selTrade, count, hrs) {
  const sel = (selTrade || '').toLowerCase();
  return `<div class="flex gap-2 items-end mb-2" id="mptLR_${idx}">
    <div style="flex:1;">
      <div class="text-[9px] font-bold text-slate-400 uppercase tracking-wide mb-0.5">Trade</div>
      <select class="mptLR_trade border rounded px-2 py-1.5 text-xs w-full">
        <option value="">Select Trade</option>
        ${trades.map(t => `<option value="${t}" ${t.toLowerCase() === sel ? 'selected' : ''}>${t}</option>`).join('')}
      </select>
    </div>
    <div style="width:74px;">
      <div class="text-[9px] font-bold text-slate-400 uppercase tracking-wide mb-0.5">Workers</div>
      <input type="number" class="mptLR_count border rounded px-2 py-1.5 text-xs w-full" min="1" value="${count || 1}" placeholder="No." title="Number of workers required">
    </div>
    <div style="width:80px;">
      <div class="text-[9px] font-bold text-slate-400 uppercase tracking-wide mb-0.5">Hours/day</div>
      <input type="number" class="mptLR_hrs border rounded px-2 py-1.5 text-xs w-full" min="1" max="12" value="${hrs || 8}" placeholder="Hrs" title="Hours each worker works per day">
    </div>
    <button onclick="this.parentElement.remove()" class="text-red-400 hover:text-red-600 text-base font-bold px-1 pb-1.5" title="Remove">&times;</button>
  </div>`;
}

// Additional-material row (extra material added in micro-plan, beyond planning)
function _mpMatRowHtml(matId, qty) {
  const opts = (state.rawMaterials || []).filter(m => m.type !== 'Tools')
    .map(m => `<option value="${m.id}" ${m.id === matId ? 'selected' : ''}>${_esc(m.name)}${m.unit ? ' (' + m.unit + ')' : ''}</option>`).join('');
  return `<div class="flex gap-2 items-center mb-2">
    <select class="mptMat_id border rounded px-2 py-1.5 text-xs flex-1"><option value="">Select Material</option>${opts}</select>
    <input type="number" class="mptMat_qty border rounded px-2 py-1.5 text-xs w-20" min="0" step="any" value="${qty || ''}" placeholder="Qty">
    <button onclick="this.parentElement.remove()" class="text-red-400 hover:text-red-600 text-base font-bold px-1" title="Remove">&times;</button>
  </div>`;
}
window._mpAddMatRow = function() {
  const c = document.getElementById('mptMatRows');
  if (c) c.insertAdjacentHTML('beforeend', _mpMatRowHtml('', ''));
};

let _labourRowIdx = 10;
export function mpAddLabourRow() {
  const c = document.getElementById('mptLabourRows');
  if (!c) return;
  const trades = _getUniqueTrades();
  c.insertAdjacentHTML('beforeend', _labourReqRowHtml(_labourRowIdx++, trades, '', 1, 8));
}

export function mpCloseTaskForm() {
  document.getElementById('mpTaskFormModal')?.remove();
}

export function mpSaveTask(editId) {
  const name = document.getElementById('mpt_name')?.value.trim();
  if (!name) { showToast('Task name is required', 'error'); return; }
  const startDate = document.getElementById('mpt_start')?.value;
  const endDate = document.getElementById('mpt_end')?.value;
  if (!startDate || !endDate) { showToast('Start & end dates are required', 'error'); return; }
  const totalHours = parseFloat(document.getElementById('mpt_hours')?.value) || 0;
  if (!totalHours) { showToast('Total hours required', 'error'); return; }

  // Collect labour requirements
  const labourReqs = [];
  const rows = document.querySelectorAll('#mptLabourRows > div');
  rows.forEach(row => {
    const trade = row.querySelector('.mptLR_trade')?.value;
    const count = parseInt(row.querySelector('.mptLR_count')?.value) || 1;
    const hoursPerDay = parseInt(row.querySelector('.mptLR_hrs')?.value) || 8;
    if (trade) labourReqs.push({ trade, count, hoursPerDay });
  });

  if (!labourReqs.length) { showToast('Add at least one trade requirement', 'error'); return; }

  // Build requiredSkills from labour reqs
  const requiredSkills = labourReqs.map(lr => lr.trade);

  // Additional material added in micro-plan (beyond what planning specified)
  const extraMaterials = [];
  document.querySelectorAll('#mptMatRows > div').forEach(row => {
    const materialId = row.querySelector('.mptMat_id')?.value;
    const qty = parseFloat(row.querySelector('.mptMat_qty')?.value) || 0;
    if (materialId && qty > 0) extraMaterials.push({ materialId, qty });
  });

  const pid = _pid();
  const data = {
    name,
    area: document.getElementById('mpt_area')?.value.trim() || '',
    startDate, endDate,
    totalEffortHours: totalHours,
    priority: document.getElementById('mpt_priority')?.value || 'Medium',
    dependsOn: document.getElementById('mpt_dep')?.value || '',
    quantity: parseFloat(document.getElementById('mpt_qty')?.value) || 0,
    remarks: document.getElementById('mpt_remarks')?.value.trim() || '',
    changeReason: document.getElementById('mpt_changeReason')?.value.trim() || '',
    extraMaterials,
    labourReqs,
    requiredSkills,
    projectId: pid,
    status: 'Not Started',
    progress: 0,
    source: 'micro', // mark as micro-task (not from planning module)
  };

  if (!state.microTasks) state.microTasks = [];

  if (editId) {
    // Check if it's a planning task or micro task
    let idx = state.microTasks.findIndex(t => t.id === editId);
    if (idx >= 0) {
      state.microTasks[idx] = { ...state.microTasks[idx], ...data };
    } else {
      // It's a planning task being edited — update labourReqs on it
      idx = (state.planningTasks || []).findIndex(t => t.id === editId);
      if (idx >= 0) {
        state.planningTasks[idx] = { ...state.planningTasks[idx], ...data, source: 'planning' };
      }
    }
  } else {
    data.id = 'mpt_' + Date.now() + '_' + Math.floor(Math.random() * 1000);
    data.createdAt = new Date().toISOString();
    state.microTasks.push(data);
  }

  saveAllData();
  mpCloseTaskForm();
  showToast(editId ? 'Task updated' : 'Task added');
  renderMicroPlanningView();
}

export function mpDeleteTask(taskId) {
  if (!confirm('Delete this micro-plan task?')) return;
  window.recycleDelete && window.recycleDelete('microTasks', taskId, 'Micro Task');
  saveAllData();
  showToast('Task deleted');
  renderMicroPlanningView();
}

// ─────────────────────────────────────────────────────
//  DECOMPOSE TASKS TO DAILY CHUNKS
// ─────────────────────────────────────────────────────
export function decomposeTasksToDaily(tasks, horizonStart, horizonEnd) {
  const result = {};
  const workDays = _workingDaysInRange(horizonStart, horizonEnd);
  workDays.forEach(d => { result[d] = []; });

  const prioMap = { Critical: 0, High: 1, Medium: 2, Low: 3 };
  const sorted = [...tasks].sort((a, b) => {
    const da = a.startDate || '9999', db = b.startDate || '9999';
    if (da !== db) return da.localeCompare(db);
    return (prioMap[a.priority] || 2) - (prioMap[b.priority] || 2);
  });

  const taskCompletion = {};

  sorted.forEach(task => {
    if (!task.startDate) return;
    const totalHours = task.totalEffortHours || _estimateEffort(task);
    const progressDone = (task.progress || 0) / 100;
    let remainingHours = totalHours * (1 - progressDone);
    if (remainingHours <= 0) { taskCompletion[task.id] = task.startDate; return; }

    let effectiveStart = task.startDate;
    if (task.dependsOn) {
      const depEnd = taskCompletion[task.dependsOn];
      if (depEnd && depEnd >= effectiveStart) effectiveStart = _nextWorkingDay(depEnd);
    }

    const effectiveEnd = task.endDate || horizonEnd;
    const taskWorkDays = _workingDaysInRange(effectiveStart, effectiveEnd).filter(d => d >= horizonStart && d <= horizonEnd);
    if (!taskWorkDays.length) return;

    const hoursPerDay = Math.ceil(remainingHours / taskWorkDays.length);
    const totalQty = task.quantity || 0;
    const qtyPerDay = totalQty > 0 ? Math.ceil((totalQty * (1 - progressDone)) / taskWorkDays.length) : 0;

    taskWorkDays.forEach((day, idx) => {
      if (remainingHours <= 0) return;
      const hrs = Math.min(hoursPerDay, remainingHours);
      const qty = idx === taskWorkDays.length - 1
        ? Math.max(0, (totalQty * (1 - progressDone)) - qtyPerDay * idx) : qtyPerDay;
      if (result[day]) {
        result[day].push({
          taskId: task.id,
          taskName: task.name,
          hoursForDay: Math.round(hrs * 10) / 10,
          quantityForDay: Math.round(qty),
          requiredSkills: task.requiredSkills || _inferSkills(task),
          labourReqs: task.labourReqs || [],
          location: task.area || task.location || '',
          priority: task.priority || 'Medium',
          source: task.source || 'planning',
        });
      }
      remainingHours -= hrs;
    });
    taskCompletion[task.id] = taskWorkDays[taskWorkDays.length - 1] || effectiveEnd;
  });
  return result;
}

function _estimateEffort(task) {
  if (task.totalEffortHours) return task.totalEffortHours;
  const days = _workingDaysInRange(task.startDate, task.endDate || task.startDate).length;
  return days * WORK_HOURS;
}

function _inferSkills(task) {
  const n = (task.name || '').toLowerCase();
  if (n.includes('plaster')) return ['mason', 'helper'];
  if (n.includes('rebar') || n.includes('bar bend') || n.includes('reinforcement')) return ['bar_bender', 'helper'];
  if (n.includes('tile') || n.includes('floor')) return ['tile_fitter', 'helper'];
  if (n.includes('paint')) return ['painter', 'helper'];
  if (n.includes('electric') || n.includes('wiring')) return ['electrician', 'helper'];
  if (n.includes('plumb')) return ['plumber', 'helper'];
  if (n.includes('concrete') || n.includes('rcc') || n.includes('casting')) return ['mason', 'helper'];
  if (n.includes('shuttering') || n.includes('formwork')) return ['carpenter', 'helper'];
  return ['general', 'helper'];
}

// ─────────────────────────────────────────────────────
//  CALCULATE LABOR REQUIREMENTS (from labourReqs)
// ─────────────────────────────────────────────────────
export function calculateLaborRequirements(chunk) {
  // If chunk has explicit labourReqs from form, use them
  if (chunk.labourReqs && chunk.labourReqs.length > 0) {
    const reqs = {};
    chunk.labourReqs.forEach(lr => {
      reqs[lr.trade] = (reqs[lr.trade] || 0) + lr.count;
    });
    return reqs;
  }
  // Fallback: infer from skills/hours
  const reqs = {};
  const skills = chunk.requiredSkills || ['general'];
  skills.forEach(trade => {
    const share = chunk.hoursForDay / skills.length;
    reqs[trade] = Math.max(1, Math.ceil(share / WORK_HOURS));
  });
  return reqs;
}

// ─────────────────────────────────────────────────────
//  ALLOCATE LABOR
// ─────────────────────────────────────────────────────
export function allocateLabor(dailyChunks, availableWorkers, dateStr) {
  const assignments = [];
  const workerHoursUsed = {};

  const sortedWorkers = [...availableWorkers].sort((a, b) => {
    if ((a.dayRate || 0) !== (b.dayRate || 0)) return (a.dayRate || 0) - (b.dayRate || 0);
    return (b.skillLevel || b.skill_level || 3) - (a.skillLevel || a.skill_level || 3);
  });

  const prioMap = { Critical: 0, High: 1, Medium: 2, Low: 3 };
  const sortedChunks = [...dailyChunks].sort((a, b) => (prioMap[a.priority] || 2) - (prioMap[b.priority] || 2));

  sortedChunks.forEach(chunk => {
    const reqs = calculateLaborRequirements(chunk);
    // Determine hours per worker for this chunk from labourReqs
    const labourHrsMap = {};
    (chunk.labourReqs || []).forEach(lr => { labourHrsMap[lr.trade] = lr.hoursPerDay || WORK_HOURS; });

    Object.entries(reqs).forEach(([trade, count]) => {
      let assigned = 0;
      const hrsPerWorker = labourHrsMap[trade] || WORK_HOURS;
      for (const worker of sortedWorkers) {
        if (assigned >= count) break;
        const wTrade = (worker.trade || '').toLowerCase();
        const targetTrade = trade.toLowerCase();
        const tradeMatch = wTrade === targetTrade
          || (targetTrade === 'helper' && true) // any trade can be helper
          || (wTrade === 'general');
        if (!tradeMatch) continue;
        // Prefer exact match first pass
        if (wTrade !== targetTrade && assigned < count) {
          // Skip non-exact matches first round, pick them on second pass
          continue;
        }
        const used = workerHoursUsed[worker.id] || 0;
        const capacity = worker.daily_capacity_hours || worker.dailyCapacityHours || WORK_HOURS;
        const avail = capacity - used;
        if (avail <= 0) continue;
        const hrs = Math.min(avail, hrsPerWorker);
        assignments.push({
          workerId: worker.id, workerName: worker.name,
          taskId: chunk.taskId, taskName: chunk.taskName,
          trade, hours: Math.round(hrs * 10) / 10,
          location: chunk.location,
          cost: Math.round((worker.dayRate || 0) * (hrs / capacity) * 100) / 100,
          skillLevel: worker.skillLevel || worker.skill_level || 3
        });
        workerHoursUsed[worker.id] = used + hrs;
        assigned++;
      }
      // Second pass: non-exact matches (helpers, generals)
      if (assigned < count) {
        for (const worker of sortedWorkers) {
          if (assigned >= count) break;
          const wTrade = (worker.trade || '').toLowerCase();
          const targetTrade = trade.toLowerCase();
          if (wTrade === targetTrade) continue; // already tried
          const tradeMatch = (targetTrade === 'helper') || (wTrade === 'general');
          if (!tradeMatch) continue;
          const used = workerHoursUsed[worker.id] || 0;
          const capacity = worker.daily_capacity_hours || worker.dailyCapacityHours || WORK_HOURS;
          const avail = capacity - used;
          if (avail <= 0) continue;
          const hrs = Math.min(avail, labourHrsMap[trade] || WORK_HOURS);
          assignments.push({
            workerId: worker.id, workerName: worker.name,
            taskId: chunk.taskId, taskName: chunk.taskName,
            trade, hours: Math.round(hrs * 10) / 10,
            location: chunk.location,
            cost: Math.round((worker.dayRate || 0) * (hrs / capacity) * 100) / 100,
            skillLevel: worker.skillLevel || worker.skill_level || 3
          });
          workerHoursUsed[worker.id] = used + hrs;
          assigned++;
        }
      }
    });
  });
  return { assignments, workerHoursUsed };
}

// ─────────────────────────────────────────────────────
//  DETECT CONFLICTS
// ─────────────────────────────────────────────────────
export function detectConflicts(dailyChunks, allocationResult, availableWorkers) {
  const conflicts = [];
  const { assignments, workerHoursUsed } = allocationResult;

  dailyChunks.forEach(chunk => {
    const reqs = calculateLaborRequirements(chunk);
    Object.entries(reqs).forEach(([trade, needed]) => {
      const assigned = assignments.filter(a => a.taskId === chunk.taskId && a.trade === trade).length;
      if (assigned < needed) {
        conflicts.push({
          type: 'SHORTAGE', severity: 'high',
          message: `${trade} shortage for "${chunk.taskName}": need ${needed}, only ${assigned} assigned`
        });
      }
    });
  });

  const workerTasks = {};
  assignments.forEach(a => {
    if (!workerTasks[a.workerId]) workerTasks[a.workerId] = [];
    workerTasks[a.workerId].push(a);
  });
  Object.entries(workerTasks).forEach(([wId, tasks]) => {
    if (tasks.length > 1) {
      const totalHrs = tasks.reduce((s, t) => s + t.hours, 0);
      const w = availableWorkers.find(w => w.id === wId);
      const cap = w?.daily_capacity_hours || w?.dailyCapacityHours || WORK_HOURS;
      if (totalHrs > cap) {
        conflicts.push({ type: 'OVERBOOKED', severity: 'high',
          message: `${tasks[0].workerName} overbooked: ${totalHrs}h across ${tasks.length} tasks (cap: ${cap}h)` });
      }
    }
  });
  return conflicts;
}

// ─────────────────────────────────────────────────────
//  GENERATE DAILY SHEET
// ─────────────────────────────────────────────────────
export function generateDailySheet(dateStr, allocation, conflicts, chunks, allWorkers) {
  const { assignments, workerHoursUsed } = allocation;
  const dayName = _parseDate(dateStr).toLocaleDateString('en-IN', { weekday: 'long' });
  const dateLabel = _parseDate(dateStr).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });

  const tradeCount = {};
  let totalHours = 0, totalCost = 0;
  const assignedWorkerIds = new Set();
  assignments.forEach(a => {
    tradeCount[a.trade] = (tradeCount[a.trade] || 0) + 1;
    totalHours += a.hours;
    totalCost += a.cost;
    assignedWorkerIds.add(a.workerId);
  });

  // FREE LABOUR — workers available but not assigned to any task
  const availWorkers = allWorkers.filter(w => _isWorkerAvailable(w, dateStr));
  const freeWorkers = availWorkers.filter(w => !assignedWorkerIds.has(w.id));
  const onLeave = allWorkers.filter(w => !_isWorkerAvailable(w, dateStr));

  const freeLabourHtml = freeWorkers.length > 0
    ? freeWorkers.map(w => `<span onclick="_mpManualAssign('${dateStr}','${w.id}')" title="Click to assign to a task" class="cursor-pointer inline-flex items-center gap-1 text-[10px] bg-green-50 text-green-700 border border-green-200 px-2 py-1 rounded-full font-medium hover:bg-green-100"><span class="w-1.5 h-1.5 bg-green-500 rounded-full"></span>${w.name} <span class="text-green-500">(${w.trade || 'general'})</span> <span class="text-green-600 font-bold">+</span></span>`).join(' ')
    : '<span class="text-[10px] text-slate-400">All workers assigned</span>';

  const onLeaveHtml = onLeave.length > 0
    ? onLeave.map(w => `<span class="inline-flex items-center gap-1 text-[10px] bg-red-50 text-red-600 border border-red-200 px-2 py-1 rounded-full font-medium">${w.name}</span>`).join(' ')
    : '';

  const conflictHtml = conflicts.length > 0
    ? `<div class="space-y-1">${conflicts.map(c => `<div class="flex items-start gap-2 text-xs p-2 rounded ${c.severity === 'critical' ? 'bg-red-50 text-red-700 border border-red-200' : c.severity === 'high' ? 'bg-orange-50 text-orange-700 border border-orange-200' : 'bg-yellow-50 text-yellow-700 border border-yellow-200'}"><span class="font-bold">${c.type}</span><span>${c.message}</span></div>`).join('')}</div>`
    : '<p class="text-xs text-green-600 font-medium">No conflicts</p>';

  const taskSummary = chunks.map(ch => {
    const reqs = calculateLaborRequirements(ch);
    const reqStr = Object.entries(reqs).map(([t,c]) => `${c} ${t}`).join(', ');
    const task = (state.planningTasks || []).find(t => t.id === ch.taskId) || (state.microTasks || []).find(t => t.id === ch.taskId);
    const prog = task?.progress || 0;
    return `<div class="text-xs py-2 border-b border-slate-100 last:border-0">
      <div class="flex items-center justify-between mb-1">
        <div class="flex items-center gap-2">
          <span class="font-semibold text-slate-700">${ch.taskName}</span>
          ${ch.source === 'micro' ? '<span class="text-[8px] bg-purple-100 text-purple-600 px-1.5 py-0.5 rounded font-bold">CUSTOM</span>' : ''}
        </div>
        <span class="text-slate-400 text-[10px]">${ch.location || '-'} | Need: ${reqStr} | ${ch.hoursForDay}h</span>
      </div>
      <div class="flex items-center gap-2">
        <span class="text-[9px] text-slate-400 font-bold uppercase">Completion:</span>
        <input type="range" min="0" max="100" value="${prog}" oninput="this.nextElementSibling.textContent=this.value+'%'" onchange="_mpUpdateProgress('${ch.taskId}', this.value)" style="flex:1;max-width:160px;accent-color:#2563eb;">
        <span class="text-[10px] font-bold text-blue-600" style="width:34px;">${prog}%</span>
        ${prog >= 100 ? '<span class="text-[9px] bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-bold">✓ Done</span>' : `<button onclick="_mpUpdateProgress('${ch.taskId}',100)" class="text-[9px] bg-green-50 text-green-700 border border-green-200 px-2 py-0.5 rounded-full font-bold">Mark Done</button>`}
      </div>
    </div>`;
  }).join('');

  return `
    <div class="bg-white rounded-xl border shadow-sm mb-4 overflow-hidden" id="dailySheet_${dateStr}">
      <!-- HEADER -->
      <div class="bg-gradient-to-r from-blue-600 to-blue-800 text-white px-5 py-3 flex justify-between items-center">
        <div>
          <h3 class="font-bold text-base">${dayName}, ${dateLabel}</h3>
          <p class="text-blue-200 text-[10px] mt-0.5">${assignedWorkerIds.size} assigned | ${freeWorkers.length} free | ${totalHours}h | ${formatINR(totalCost)}</p>
        </div>
        <div class="flex gap-2">
          <button onclick="window._mpExportLocationPlanPDF('${dateStr}')" title="Location-wise plan (no cost) — for site" class="bg-white/20 hover:bg-white/30 text-white text-[10px] px-3 py-1.5 rounded font-bold">📍 Plan PDF</button>
          <button onclick="_mpExportDayPDF('${dateStr}')" title="Allocation with cost (office)" class="bg-white/20 hover:bg-white/30 text-white text-[10px] px-3 py-1.5 rounded font-bold">PDF</button>
          <button onclick="_mpPrintDay('${dateStr}')" class="bg-white/20 hover:bg-white/30 text-white text-[10px] px-3 py-1.5 rounded font-bold">Print</button>
          <button onclick="document.getElementById('dailySheet_${dateStr}').remove()" title="Close this day" class="bg-white/20 hover:bg-white/30 text-white text-[12px] px-2.5 py-1.5 rounded font-bold leading-none">✕</button>
        </div>
      </div>

      <!-- FREE LABOUR PANEL -->
      <div class="px-5 py-2.5 bg-green-50/50 border-b">
        <div class="flex items-center justify-between mb-1">
          <p class="text-[10px] font-bold text-green-700 uppercase">Free Labour — click a worker to assign manually</p>
          ${freeWorkers.length > 0 ? `<button onclick="_mpAutoAssignDay('${dateStr}')" class="text-[10px] bg-blue-600 text-white px-3 py-1 rounded-full font-bold hover:bg-blue-700">🤖 Auto-Assign Free</button>` : ''}
        </div>
        <div class="flex flex-wrap gap-1.5">${freeLabourHtml}</div>
        ${onLeaveHtml ? `<p class="text-[10px] font-bold text-red-500 uppercase mt-2 mb-1">On Leave</p><div class="flex flex-wrap gap-1.5">${onLeaveHtml}</div>` : ''}
      </div>

      <!-- TASKS SUMMARY -->
      <div class="px-5 py-2.5 bg-slate-50 border-b">
        <p class="text-[10px] font-bold text-slate-500 uppercase mb-1">Tasks (${chunks.length})</p>
        ${taskSummary}
      </div>

      <!-- ASSIGNMENT TABLE -->
      <div class="overflow-x-auto">
        <table class="w-full text-xs">
          <thead class="bg-slate-50 border-b">
            <tr>
              <th class="px-3 py-2 text-left font-bold text-slate-600">#</th>
              <th class="px-3 py-2 text-left font-bold text-slate-600">Worker</th>
              <th class="px-3 py-2 text-left font-bold text-slate-600">Trade</th>
              <th class="px-3 py-2 text-left font-bold text-slate-600">Task</th>
              <th class="px-3 py-2 text-center font-bold text-slate-600">Hours</th>
              <th class="px-3 py-2 text-left font-bold text-slate-600">Location</th>
              <th class="px-3 py-2 text-right font-bold text-slate-600">Cost (${getCurrencySymbol()})</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-slate-100">
            ${assignments.length > 0
              ? assignments.map((a, i) => `<tr class="hover:bg-blue-50/30">
                  <td class="px-3 py-2 text-slate-400">${i + 1}</td>
                  <td class="px-3 py-2 font-medium text-slate-800">${a.workerName}</td>
                  <td class="px-3 py-2"><span class="bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full text-[10px] font-bold">${a.trade}</span></td>
                  <td class="px-3 py-2 text-slate-700">${a.taskName}</td>
                  <td class="px-3 py-2 text-center font-bold">${a.hours}</td>
                  <td class="px-3 py-2 text-slate-500">${a.location}</td>
                  <td class="px-3 py-2 text-right text-slate-600">${formatINR(a.cost)}</td>
                </tr>`).join('')
              : '<tr><td colspan="7" class="px-3 py-6 text-center text-slate-400">No workers assigned</td></tr>'}
          </tbody>
        </table>
      </div>

      <!-- TRADE SUMMARY -->
      <div class="px-5 py-2.5 bg-slate-50 border-t flex flex-wrap gap-2">
        ${Object.entries(tradeCount).map(([t, c]) => `<span class="text-[10px] font-bold text-slate-600 bg-white border rounded-full px-3 py-1">${t}: ${c}</span>`).join('')}
      </div>

      <!-- CONFLICTS -->
      <div class="px-5 py-2.5 border-t">
        <p class="text-[10px] font-bold text-slate-500 uppercase mb-1">Conflicts</p>
        ${conflictHtml}
      </div>

      <!-- PROGRESS INPUT -->
      <div class="px-5 py-3 bg-blue-50/50 border-t">
        <p class="text-[10px] font-bold text-slate-500 uppercase mb-2">End-of-Day Progress</p>
        <div class="space-y-2">
          ${chunks.map(ch => `<div class="flex items-center gap-3">
            <span class="text-xs font-medium text-slate-700 w-48 truncate">${ch.taskName}</span>
            <input type="number" id="prog_${dateStr}_${ch.taskId}" class="border rounded px-2 py-1 text-xs w-20" placeholder="%" min="0" max="100">
            <span class="text-[10px] text-slate-400">% done</span>
          </div>`).join('')}
          <button onclick="_mpSaveProgress('${dateStr}')" class="bg-blue-600 text-white text-xs px-4 py-2 rounded-lg font-bold mt-2 hover:bg-blue-700">Save Progress & Reallocate</button>
        </div>
      </div>

      <!-- SIGN-OFF -->
      <div class="px-5 py-2.5 border-t bg-slate-50">
        <p class="text-[10px] text-slate-400">Supervisor: _____________________ &nbsp; Sign: _______________ &nbsp; Date: ${dateLabel}</p>
      </div>
    </div>`;
}

// ─────────────────────────────────────────────────────
//  REALLOCATE FOR DELAYS
// ─────────────────────────────────────────────────────
export function reallocateForDelays(dateStr, progressMap) {
  let changed = false;
  Object.entries(progressMap).forEach(([taskId, actualPct]) => {
    // Search in both planningTasks and microTasks
    let task = (state.planningTasks || []).find(t => t.id === taskId)
            || (state.microTasks || []).find(t => t.id === taskId);
    if (!task) return;
    const expectedDaily = 100 / (_workingDaysInRange(task.startDate, task.endDate || task.startDate).length || 1);
    const expectedPct = Math.min(100, (task.progress || 0) + expectedDaily);
    if (actualPct < expectedPct) {
      const remainingPct = 100 - actualPct;
      const remainingDays = Math.ceil(remainingPct / expectedDaily);
      let newEnd = dateStr;
      for (let i = 0; i < remainingDays; i++) newEnd = _nextWorkingDay(newEnd);
      if (newEnd > (task.endDate || dateStr)) { task.endDate = newEnd; changed = true; }
    }
    task.progress = actualPct;
  });
  if (changed) showToast('Delayed tasks rescheduled', 'info');
  if (!state.microPlanProgress) state.microPlanProgress = {};
  state.microPlanProgress[dateStr] = progressMap;
  saveAllData();
}

// ─────────────────────────────────────────────────────
//  UTILIZATION VISUALIZATION
// ─────────────────────────────────────────────────────
export function computeUtilization(startDate, endDate, allAllocations) {
  const workDays = _workingDaysInRange(startDate, endDate);
  const workers = _getProjectWorkers();
  const tradeCapacity = {};
  workers.forEach(w => {
    const t = (w.trade || 'general').toLowerCase();
    tradeCapacity[t] = (tradeCapacity[t] || 0) + WORK_HOURS;
  });
  const trades = Object.keys(tradeCapacity);
  const utilData = { dates: workDays, trades: {} };
  trades.forEach(t => { utilData.trades[t] = []; });
  workDays.forEach(day => {
    const alloc = allAllocations[day] || { assignments: [] };
    const tradeHours = {};
    (alloc.assignments || []).forEach(a => {
      const tr = (a.trade || 'general').toLowerCase();
      tradeHours[tr] = (tradeHours[tr] || 0) + a.hours;
    });
    trades.forEach(t => {
      utilData.trades[t].push(Math.round(((tradeHours[t] || 0) / (tradeCapacity[t] || WORK_HOURS)) * 100));
    });
  });
  return utilData;
}

function _renderUtilizationChart(utilData) {
  if (!utilData.dates.length) return '<p class="text-xs text-slate-400 text-center py-4">No data</p>';
  const trades = Object.keys(utilData.trades);
  let html = '<div class="overflow-x-auto"><table class="w-full text-[10px] border"><thead class="bg-slate-50"><tr><th class="px-2 py-1.5 text-left font-bold text-slate-600 border-r">Trade</th>';
  utilData.dates.forEach(d => {
    const day = _parseDate(d);
    html += `<th class="px-2 py-1.5 text-center font-bold text-slate-500 min-w-[50px]">${day.toLocaleDateString('en-IN',{day:'2-digit',month:'short'})}<br><span class="text-[8px] text-slate-400">${day.toLocaleDateString('en-IN',{weekday:'short'})}</span></th>`;
  });
  html += '</tr></thead><tbody>';
  trades.forEach(trade => {
    html += `<tr><td class="px-2 py-1.5 font-bold text-slate-700 border-r whitespace-nowrap">${trade}</td>`;
    utilData.trades[trade].forEach(pct => {
      const bg = pct === 0 ? '#f1f5f9' : pct <= 50 ? '#dbeafe' : pct <= 80 ? '#bbf7d0' : pct <= 100 ? '#fef08a' : '#fecaca';
      const clr = pct === 0 ? '#94a3b8' : pct > 100 ? '#991b1b' : '#1e293b';
      html += `<td class="px-2 py-1.5 text-center font-bold" style="background:${bg};color:${clr}">${pct}%</td>`;
    });
    html += '</tr>';
  });
  html += '</tbody></table></div>';
  html += `<div class="flex gap-3 mt-2 text-[9px] text-slate-500 flex-wrap">
    <span><span class="inline-block w-3 h-3 rounded" style="background:#f1f5f9"></span> 0%</span>
    <span><span class="inline-block w-3 h-3 rounded" style="background:#dbeafe"></span> 1-50%</span>
    <span><span class="inline-block w-3 h-3 rounded" style="background:#bbf7d0"></span> 51-80%</span>
    <span><span class="inline-block w-3 h-3 rounded" style="background:#fef08a"></span> 81-100%</span>
    <span><span class="inline-block w-3 h-3 rounded" style="background:#fecaca"></span> Over 100%</span>
  </div>`;
  return html;
}

// ─────────────────────────────────────────────────────
//  WEEKLY VIEW RENDERER
// ─────────────────────────────────────────────────────
function _renderWeeklyView(decomposed, allocations, allWorkers, startDate, endDate) {
  const workDays = _workingDaysInRange(startDate, endDate);
  if (!workDays.length) return '<p class="text-sm text-slate-400 text-center py-6">No working days in this range.</p>';

  // Build a per-worker, per-day grid
  const workerDayMap = {}; // workerId -> { day -> {taskName, hours} }
  const allWorkersMap = {};
  allWorkers.forEach(w => { allWorkersMap[w.id] = w; workerDayMap[w.id] = {}; });

  workDays.forEach(day => {
    const alloc = allocations[day];
    if (!alloc) return;
    alloc.assignments.forEach(a => {
      if (!workerDayMap[a.workerId]) workerDayMap[a.workerId] = {};
      workerDayMap[a.workerId][day] = { taskName: a.taskName, hours: a.hours, trade: a.trade };
    });
  });

  // Day totals
  const dayTotals = {};
  workDays.forEach(d => {
    const alloc = allocations[d];
    dayTotals[d] = { workers: 0, hours: 0, cost: 0 };
    if (alloc) {
      const uniq = new Set(alloc.assignments.map(a => a.workerId));
      dayTotals[d].workers = uniq.size;
      dayTotals[d].hours = alloc.assignments.reduce((s, a) => s + a.hours, 0);
      dayTotals[d].cost = alloc.assignments.reduce((s, a) => s + a.cost, 0);
    }
  });

  let html = `<div class="bg-white border rounded-xl overflow-hidden">
    <div class="bg-gradient-to-r from-indigo-600 to-indigo-800 text-white px-5 py-3">
      <h3 class="font-bold text-base">Weekly Allocation Grid</h3>
      <p class="text-indigo-200 text-[10px]">${_parseDate(startDate).toLocaleDateString('en-IN',{day:'2-digit',month:'short'})} to ${_parseDate(endDate).toLocaleDateString('en-IN',{day:'2-digit',month:'short',year:'numeric'})}</p>
    </div>
    <div class="overflow-x-auto">
      <table class="w-full text-[10px] border-collapse">
        <thead class="bg-slate-50">
          <tr>
            <th class="px-2 py-2 text-left font-bold text-slate-600 border-r sticky left-0 bg-slate-50 z-10 min-w-[120px]">Worker</th>
            <th class="px-2 py-2 text-left font-bold text-slate-600 border-r min-w-[60px]">Trade</th>`;
  workDays.forEach(d => {
    const day = _parseDate(d);
    html += `<th class="px-2 py-2 text-center font-bold text-slate-500 min-w-[90px] border-r">${day.toLocaleDateString('en-IN',{weekday:'short'})}<br>${day.toLocaleDateString('en-IN',{day:'2-digit',month:'short'})}</th>`;
  });
  html += `<th class="px-2 py-2 text-center font-bold text-slate-600 min-w-[60px]">Total</th></tr></thead><tbody>`;

  allWorkers.forEach(w => {
    const dayData = workerDayMap[w.id] || {};
    let weekTotal = 0;
    html += `<tr class="border-b hover:bg-blue-50/30">
      <td class="px-2 py-1.5 font-medium text-slate-800 border-r sticky left-0 bg-white z-10">${w.name}</td>
      <td class="px-2 py-1.5 border-r"><span class="bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded text-[9px] font-bold">${w.trade || 'general'}</span></td>`;
    workDays.forEach(d => {
      const info = dayData[d];
      const onLeave = !_isWorkerAvailable(w, d);
      if (onLeave) {
        html += `<td class="px-1 py-1.5 text-center border-r bg-red-50"><span class="text-red-400 text-[9px] font-bold">LEAVE</span></td>`;
      } else if (info) {
        weekTotal += info.hours;
        html += `<td class="px-1 py-1.5 text-center border-r bg-blue-50"><span class="text-[9px] font-medium text-blue-800">${info.taskName.substring(0, 15)}</span><br><span class="text-[8px] text-blue-500 font-bold">${info.hours}h</span></td>`;
      } else {
        html += `<td class="px-1 py-1.5 text-center border-r bg-green-50"><span class="text-green-500 text-[9px] font-medium">FREE</span></td>`;
      }
    });
    html += `<td class="px-2 py-1.5 text-center font-bold text-slate-700">${weekTotal}h</td></tr>`;
  });

  // Totals row
  html += `<tr class="bg-slate-100 font-bold border-t-2"><td class="px-2 py-2 border-r sticky left-0 bg-slate-100 z-10 text-slate-700">DAILY TOTALS</td><td class="border-r"></td>`;
  let grandTotal = 0;
  workDays.forEach(d => {
    const dt = dayTotals[d];
    grandTotal += dt.hours;
    html += `<td class="px-1 py-2 text-center border-r text-slate-700"><span class="text-[9px]">${dt.workers} workers</span><br><span class="text-[9px]">${dt.hours}h | ${formatINR(dt.cost)}</span></td>`;
  });
  html += `<td class="px-2 py-2 text-center text-blue-700">${grandTotal}h</td></tr>`;
  html += '</tbody></table></div></div>';
  return html;
}

// ─────────────────────────────────────────────────────
//  MAIN RENDER — View Controller
// ─────────────────────────────────────────────────────
let _mpHorizonStart = '';
let _mpHorizonEnd = '';
let _mpAllocations = {};
let _mpDecomposed = {};
let _mpMode = 'daily'; // 'daily' | 'weekly'
let _mpSection = null; // currently-open MP sub-section (preserved across sync re-renders)

/** Recompute the End date from the Start date + current mode (no mode change). */
window._mpRecalcHorizon = function() { mpSwitchMode(_mpMode); };

export function mpSwitchMode(mode) {
  _mpMode = mode;
  // Update only the toggle buttons' styling — do NOT re-render the whole view
  // (that reset back to the hub grid, which felt like the button "going back").
  const d = document.getElementById('mpModeDaily');
  const w = document.getElementById('mpModeWeekly');
  if (d) d.className = 'px-3 py-2 rounded-md text-xs font-bold transition ' + (mode === 'daily' ? 'bg-blue-600 text-white' : 'text-slate-600 hover:bg-slate-200');
  if (w) w.className = 'px-3 py-2 rounded-md text-xs font-bold transition ' + (mode === 'weekly' ? 'bg-indigo-600 text-white' : 'text-slate-600 hover:bg-slate-200');
  // The End date is derived from the mode now, so reflect it and lock the box:
  // Daily → End = Start (one day); Weekly → End = Start + 6.
  const startEl = document.getElementById('mpStartDate');
  const endEl = document.getElementById('mpEndDate');
  if (startEl && endEl) {
    const startV = startEl.value || _fmtDate(new Date());
    if (mode === 'weekly') { const dd = _parseDate(startV); dd.setDate(dd.getDate() + 6); endEl.value = _fmtDate(dd); }
    else { endEl.value = startV; }
    endEl.readOnly = true; endEl.style.opacity = '.6';
    _mpHorizonStart = startV; _mpHorizonEnd = endEl.value;
  }
  // If a plan is already generated in this session, re-render it in the new mode.
  if (_mpDecomposed && Object.keys(_mpDecomposed).length) {
    const sheets = document.getElementById('mpDailySheets');
    if (sheets) {
      const allWorkers = _getProjectWorkers();
      if (mode === 'weekly') {
        sheets.innerHTML = _renderWeeklyView(_mpDecomposed, _mpAllocations, allWorkers, _mpHorizonStart, _mpHorizonEnd);
      } else {
        const workDays = Object.keys(_mpDecomposed).filter(x => _mpDecomposed[x].length > 0).sort();
        let html = '';
        workDays.forEach(day => {
          const chunks = _mpDecomposed[day];
          const conflicts = detectConflicts(chunks, _mpAllocations[day], allWorkers.filter(x => _isWorkerAvailable(x, day)));
          html += generateDailySheet(day, _mpAllocations[day], conflicts, chunks, allWorkers);
        });
        sheets.innerHTML = html;
      }
    }
  }
}

export function renderMicroPlanningView() {
  const container = document.getElementById('microPlanContent');
  if (!container) return;
  const pid = _pid();
  if (!pid) { container.innerHTML = '<p class="text-slate-500 text-sm py-8 text-center">Select a project first.</p>'; return; }

  const today = new Date().toISOString().split('T')[0];
  if (!_mpHorizonStart) _mpHorizonStart = today;
  if (!_mpHorizonEnd) { const d = new Date(); d.setDate(d.getDate() + 6); _mpHorizonEnd = _fmtDate(d); }

  const allTasks = _getAllTasks();
  const microTasks = (state.microTasks || []).filter(t => t.projectId === pid && t.status !== 'Completed');
  const planTasks = (state.planningTasks || []).filter(t => t.projectId === pid && t.status !== 'Completed');
  const workers = _getProjectWorkers();
  const trades = [...new Set(workers.map(w => (w.trade || 'general').toLowerCase()))];

  // Free labour today
  const todayAvail = workers.filter(w => _isWorkerAvailable(w, today));
  const tradeCounts = {};
  todayAvail.forEach(w => { const t = (w.trade||'general').toLowerCase(); tradeCounts[t] = (tradeCounts[t]||0) + 1; });

  container.innerHTML = `
    <!-- STAT CARDS -->
    <div class="grid grid-cols-2 lg:grid-cols-5 gap-3 mb-5">
      <div class="bg-blue-50 border border-blue-200 rounded-xl p-3 text-center">
        <p class="text-xl font-extrabold text-blue-700">${allTasks.length}</p>
        <p class="text-[9px] font-bold text-blue-500 uppercase">Total Tasks</p>
      </div>
      <div class="bg-purple-50 border border-purple-200 rounded-xl p-3 text-center">
        <p class="text-xl font-extrabold text-purple-700">${microTasks.length}</p>
        <p class="text-[9px] font-bold text-purple-500 uppercase">Custom Tasks</p>
      </div>
      <div class="bg-orange-50 border border-orange-200 rounded-xl p-3 text-center">
        <p class="text-xl font-extrabold text-orange-700">${workers.length}</p>
        <p class="text-[9px] font-bold text-orange-500 uppercase">Workers</p>
      </div>
      <div class="bg-green-50 border border-green-200 rounded-xl p-3 text-center">
        <p class="text-xl font-extrabold text-green-700">${todayAvail.length}</p>
        <p class="text-[9px] font-bold text-green-500 uppercase">Available Today</p>
      </div>
      <div class="bg-indigo-50 border border-indigo-200 rounded-xl p-3 text-center">
        <p class="text-xl font-extrabold text-indigo-700">${trades.length}</p>
        <p class="text-[9px] font-bold text-indigo-500 uppercase">Trade Types</p>
      </div>
    </div>

    <!-- APP-ICON GRID -->
    <div id="mpGrid" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:14px;margin-bottom:8px;">
      <div onclick="_openMpSection('tasks')" style="background:#fff;border:1px solid #e2e8f0;border-radius:16px;padding:22px 16px;cursor:pointer;text-align:center;transition:.15s;box-shadow:0 1px 3px rgba(0,0,0,.04);" onmouseover="this.style.transform='translateY(-2px)';this.style.boxShadow='0 8px 24px rgba(0,0,0,.08)'" onmouseout="this.style.transform='';this.style.boxShadow='0 1px 3px rgba(0,0,0,.04)'">
        <div style="width:50px;height:50px;background:#2563eb15;border:2px solid #2563eb30;border-radius:14px;display:inline-flex;align-items:center;justify-content:center;font-size:24px;margin-bottom:10px;">📝</div>
        <div style="font-size:14px;font-weight:700;color:#0f172a;">Tasks & Labour</div><div style="font-size:10px;color:#94a3b8;margin-top:2px;">Tasks + available workers</div>
      </div>
      <div onclick="_openMpSection('generate')" style="background:#fff;border:1px solid #e2e8f0;border-radius:16px;padding:22px 16px;cursor:pointer;text-align:center;transition:.15s;box-shadow:0 1px 3px rgba(0,0,0,.04);" onmouseover="this.style.transform='translateY(-2px)';this.style.boxShadow='0 8px 24px rgba(0,0,0,.08)'" onmouseout="this.style.transform='';this.style.boxShadow='0 1px 3px rgba(0,0,0,.04)'">
        <div style="width:50px;height:50px;background:#f59e0b15;border:2px solid #f59e0b30;border-radius:14px;display:inline-flex;align-items:center;justify-content:center;font-size:24px;margin-bottom:10px;">⚙️</div>
        <div style="font-size:14px;font-weight:700;color:#0f172a;">Generate Plan</div><div style="font-size:10px;color:#94a3b8;margin-top:2px;">Set horizon & allocate</div>
      </div>
      <div onclick="_openMpSection('plan')" style="background:#fff;border:1px solid #e2e8f0;border-radius:16px;padding:22px 16px;cursor:pointer;text-align:center;transition:.15s;box-shadow:0 1px 3px rgba(0,0,0,.04);" onmouseover="this.style.transform='translateY(-2px)';this.style.boxShadow='0 8px 24px rgba(0,0,0,.08)'" onmouseout="this.style.transform='';this.style.boxShadow='0 1px 3px rgba(0,0,0,.04)'">
        <div style="width:50px;height:50px;background:#10b98115;border:2px solid #10b98130;border-radius:14px;display:inline-flex;align-items:center;justify-content:center;font-size:24px;margin-bottom:10px;">📋</div>
        <div style="font-size:14px;font-weight:700;color:#0f172a;">Generated Plan</div><div style="font-size:10px;color:#94a3b8;margin-top:2px;">View saved daily sheets</div>
      </div>
      <div onclick="_openMpSection('rabill')" style="background:#fff;border:1px solid #e2e8f0;border-radius:16px;padding:22px 16px;cursor:pointer;text-align:center;transition:.15s;box-shadow:0 1px 3px rgba(0,0,0,.04);" onmouseover="this.style.transform='translateY(-2px)';this.style.boxShadow='0 8px 24px rgba(0,0,0,.08)'" onmouseout="this.style.transform='';this.style.boxShadow='0 1px 3px rgba(0,0,0,.04)'">
        <div style="width:50px;height:50px;background:#7c3aed15;border:2px solid #7c3aed30;border-radius:14px;display:inline-flex;align-items:center;justify-content:center;font-size:24px;margin-bottom:10px;">📑</div>
        <div style="font-size:14px;font-weight:700;color:#0f172a;">RA Billing</div><div style="font-size:10px;color:#94a3b8;margin-top:2px;">Running-account bill by location</div>
      </div>
      <div onclick="_openMpSection('progress')" style="background:#fff;border:1px solid #e2e8f0;border-radius:16px;padding:22px 16px;cursor:pointer;text-align:center;transition:.15s;box-shadow:0 1px 3px rgba(0,0,0,.04);" onmouseover="this.style.transform='translateY(-2px)';this.style.boxShadow='0 8px 24px rgba(0,0,0,.08)'" onmouseout="this.style.transform='';this.style.boxShadow='0 1px 3px rgba(0,0,0,.04)'">
        <div style="width:50px;height:50px;background:#0891b215;border:2px solid #0891b230;border-radius:14px;display:inline-flex;align-items:center;justify-content:center;font-size:24px;margin-bottom:10px;">📈</div>
        <div style="font-size:14px;font-weight:700;color:#0f172a;">Plan vs Actual</div><div style="font-size:10px;color:#94a3b8;margin-top:2px;">Planned qty vs work done</div>
      </div>
    </div>
    <button id="mpBackBtn" onclick="_openMpSection(null)" style="display:none;margin-bottom:14px;padding:6px 14px;background:#f1f5f9;border:1px solid #e2e8f0;border-radius:8px;color:#64748b;font-size:12px;font-weight:600;cursor:pointer;">← Back to Micro Planning</button>

    <!-- SECTION: TASKS & LABOUR -->
    <div id="mpSecTasks" class="mp-section hide">
    <!-- TODAY'S FREE LABOUR PANEL -->
    <div class="bg-white border rounded-xl p-4 mb-5">
      <div class="flex items-center justify-between mb-2">
        <h3 class="font-bold text-sm text-slate-800">Today's Available Labour</h3>
        <span class="text-[10px] text-slate-400">${today}</span>
      </div>
      <div class="flex flex-wrap gap-2 mb-2">
        ${todayAvail.map(w => `<span class="inline-flex items-center gap-1.5 text-xs bg-green-50 text-green-800 border border-green-200 px-2.5 py-1 rounded-full font-medium"><span class="w-2 h-2 bg-green-500 rounded-full"></span>${w.name} <span class="text-green-500 text-[10px]">(${w.trade || 'general'}) ${w.dayRate ? getCurrencySymbol()+w.dayRate+'/day' : ''}</span></span>`).join('')}
        ${todayAvail.length === 0 ? '<span class="text-xs text-slate-400">No workers registered for this project.</span>' : ''}
      </div>
      <div class="flex flex-wrap gap-2 mt-1">
        ${Object.entries(tradeCounts).map(([t,c]) => `<span class="text-[10px] font-bold bg-slate-100 text-slate-600 px-2.5 py-1 rounded-full">${t}: ${c}</span>`).join('')}
      </div>
    </div>

    <!-- TASK LIST + ADD TASK -->
    <div class="bg-white border rounded-xl p-4 mb-5">
      <div class="flex items-center justify-between mb-3">
        <h3 class="font-bold text-sm text-slate-800">Micro-Plan Tasks</h3>
        <button onclick="_mpOpenTaskForm()" class="bg-blue-600 text-white text-xs px-4 py-2 rounded-lg font-bold hover:bg-blue-700 transition">+ Add Task</button>
      </div>
      ${allTasks.length > 0 ? `
        <div class="overflow-x-auto">
          <table class="w-full text-xs">
            <thead class="bg-slate-50 border-b">
              <tr>
                <th class="px-2 py-2 text-left font-bold text-slate-600">Task</th>
                <th class="px-2 py-2 text-left font-bold text-slate-600">Location</th>
                <th class="px-2 py-2 text-center font-bold text-slate-600">Dates</th>
                <th class="px-2 py-2 text-center font-bold text-slate-600">Hours</th>
                <th class="px-2 py-2 text-left font-bold text-slate-600">Labour Need</th>
                <th class="px-2 py-2 text-center font-bold text-slate-600">Priority</th>
                <th class="px-2 py-2 text-center font-bold text-slate-600">Progress</th>
                <th class="px-2 py-2 text-right font-bold text-slate-600">Actions</th>
              </tr>
            </thead>
            <tbody class="divide-y">
              ${allTasks.map(t => {
                const lrStr = (t.labourReqs || []).map(lr => `${lr.count} ${lr.trade}`).join(', ') || (t.requiredSkills || []).join(', ') || '-';
                const src = t.source === 'micro' ? '<span class="text-[8px] bg-purple-100 text-purple-600 px-1 py-0.5 rounded font-bold ml-1">CUSTOM</span>' : '<span class="text-[8px] bg-blue-100 text-blue-600 px-1 py-0.5 rounded font-bold ml-1">PLAN</span>';
                const prioCls = { Critical:'bg-red-100 text-red-700', High:'bg-orange-100 text-orange-700', Medium:'bg-blue-100 text-blue-700', Low:'bg-slate-100 text-slate-600' };
                return `<tr class="hover:bg-slate-50">
                  <td class="px-2 py-2"><span class="font-semibold text-slate-800">${_esc(t.name)}</span>${src}</td>
                  <td class="px-2 py-2 text-slate-500">${t.area || '-'}</td>
                  <td class="px-2 py-2 text-center text-slate-500">${t.startDate || '-'} to ${t.endDate || '-'}</td>
                  <td class="px-2 py-2 text-center font-bold">${t.totalEffortHours || '-'}</td>
                  <td class="px-2 py-2 text-slate-600">${lrStr}</td>
                  <td class="px-2 py-2 text-center"><span class="text-[10px] font-bold px-2 py-0.5 rounded-full ${prioCls[t.priority] || prioCls.Medium}">${t.priority || 'Medium'}</span></td>
                  <td class="px-2 py-2 text-center">
                    <div class="w-full bg-slate-200 rounded-full h-1.5"><div class="bg-blue-600 h-1.5 rounded-full" style="width:${t.progress || 0}%"></div></div>
                    <span class="text-[9px] text-slate-400">${t.progress || 0}%</span>
                  </td>
                  <td class="px-2 py-2 text-right">
                    <button onclick="_mpOpenTaskForm('${t.id}')" class="text-blue-500 hover:text-blue-700 text-[10px] font-bold mr-2">Edit</button>
                    ${t.source === 'micro' ? `<button onclick="_mpDeleteTask('${t.id}')" class="text-red-400 hover:text-red-600 text-[10px] font-bold">Del</button>` : ''}
                  </td>
                </tr>`;
              }).join('')}
            </tbody>
          </table>
        </div>
      ` : '<p class="text-xs text-slate-400 text-center py-4">No tasks yet. Click <b>+ Add Task</b> to create one, or add tasks in the Planning module.</p>'}
    </div>
    </div><!-- /mpSecTasks -->

    <!-- SECTION: GENERATE -->
    <div id="mpSecGenerate" class="mp-section hide">
    <!-- HORIZON + MODE -->
    <div class="bg-white border rounded-xl p-4 mb-5 flex flex-wrap items-end gap-4">
      <div>
        <label class="block text-[10px] font-bold text-slate-500 uppercase mb-1">${_mpMode === 'weekly' ? 'Week starts' : 'Day'}</label>
        <input type="date" id="mpStartDate" value="${_mpHorizonStart}" onchange="window._mpRecalcHorizon&&window._mpRecalcHorizon()" class="border rounded-lg px-3 py-2 text-sm">
      </div>
      <div>
        <label class="block text-[10px] font-bold text-slate-500 uppercase mb-1">End <span class="text-slate-300 normal-case">(auto)</span></label>
        <input type="date" id="mpEndDate" value="${_mpHorizonEnd}" readonly style="opacity:.6" class="border rounded-lg px-3 py-2 text-sm">
      </div>
      <div class="flex gap-1 bg-slate-100 rounded-lg p-1">
        <button id="mpModeDaily" onclick="_mpSwitchMode('daily')" class="px-3 py-2 rounded-md text-xs font-bold transition ${_mpMode === 'daily' ? 'bg-blue-600 text-white' : 'text-slate-600 hover:bg-slate-200'}">Daily View</button>
        <button id="mpModeWeekly" onclick="_mpSwitchMode('weekly')" class="px-3 py-2 rounded-md text-xs font-bold transition ${_mpMode === 'weekly' ? 'bg-indigo-600 text-white' : 'text-slate-600 hover:bg-slate-200'}">Weekly View</button>
      </div>
      <button onclick="_mpGenerate()" class="bg-blue-600 text-white px-6 py-2.5 rounded-lg font-bold text-sm hover:bg-blue-700 transition">Generate Plan</button>
      <button onclick="_mpToggleUtil()" class="bg-slate-200 text-slate-700 px-4 py-2.5 rounded-lg font-bold text-sm hover:bg-slate-300 transition">Heatmap</button>
    </div>
    <!-- Utilization Panel -->
    <div id="mpUtilPanel" class="hidden mb-5"></div>
    </div><!-- /mpSecGenerate -->

    <!-- SECTION: GENERATED PLAN -->
    <div id="mpSecPlan" class="mp-section hide">
      <div class="bg-white border rounded-xl overflow-hidden mb-4">
        <div class="p-3 border-b font-bold text-slate-700 text-sm flex items-center justify-between">
          <span>📋 Saved Plans</span>
          <span class="text-[10px] text-slate-400 font-medium">Click a plan to view its sheets</span>
        </div>
        <div id="mpSavedPlansList"></div>
      </div>
      <div id="mpDailySheets"></div>
    </div><!-- /mpSecPlan -->

    <!-- SECTION: RA BILLING (running-account) -->
    <div id="mpSecProgress" class="mp-section hide">
      <div id="mpProgressContent"></div>
    </div><!-- /mpSecProgress -->

    <div id="mpSecRABill" class="mp-section hide">
      <div id="raBillingContent"></div>
    </div><!-- /mpSecRABill -->`;

  // Render the saved-plans list (transaction-style history)
  _mpRenderSavedPlans();
  // Restore whatever sub-section was open (null = icon grid). This is what stops
  // a background sync re-render from bouncing the user out of Generate/Plan/etc.
  if (typeof window._openMpSection === 'function') window._openMpSection(_mpSection);
}

/** List of saved plans — transaction-style rows */
function _mpRenderSavedPlans() {
  const box = document.getElementById('mpSavedPlansList');
  if (!box) return;
  const plans = (state.savedPlans || []).filter(p => p.projectId === _pid()).sort((a, b) => new Date(b.generated) - new Date(a.generated));
  if (!plans.length) {
    box.innerHTML = '<p class="text-xs text-slate-400 text-center py-6">No saved plans yet. Use <b>Generate Plan</b> to create one.</p>';
    return;
  }
  box.innerHTML = `<table class="w-full text-xs"><thead class="bg-slate-50"><tr>
    <th class="px-3 py-2 text-left font-bold uppercase text-slate-500">Generated</th>
    <th class="px-3 py-2 text-left font-bold uppercase text-slate-500">Period</th>
    <th class="px-3 py-2 text-center font-bold uppercase text-slate-500">Mode</th>
    <th class="px-3 py-2 text-center font-bold uppercase text-slate-500">Days</th>
    <th class="px-3 py-2 text-center font-bold uppercase text-slate-500">Workers</th>
    <th class="px-3 py-2 text-right font-bold uppercase text-slate-500">Actions</th>
  </tr></thead><tbody>
  ${plans.map(p => `<tr class="hover:bg-slate-50 cursor-pointer" data-planid="${p.id}" onclick="_mpViewSavedPlan('${p.id}')">
    <td class="px-3 py-2 font-bold text-slate-800">${new Date(p.generated).toLocaleString('en-IN', { day:'2-digit', month:'short', hour:'2-digit', minute:'2-digit' })}</td>
    <td class="px-3 py-2 text-slate-500">${p.horizon.start} → ${p.horizon.end}${p.outsideLabour ? ` <span class="text-[8px] font-bold bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded-full" title="${_esc(p.outsideLabour)}">+ OUTSIDE LABOUR</span>` : ''}</td>
    <td class="px-3 py-2 text-center"><span class="text-[9px] font-bold px-2 py-0.5 rounded-full ${p.mode === 'weekly' ? 'bg-indigo-100 text-indigo-700' : 'bg-blue-100 text-blue-700'}">${(p.mode || 'daily').toUpperCase()}</span></td>
    <td class="px-3 py-2 text-center font-bold">${p.days}</td>
    <td class="px-3 py-2 text-center">${p.workerCount || 0}</td>
    <td class="px-3 py-2 text-right whitespace-nowrap">
      <button onclick="event.stopPropagation();_mpViewSavedPlan('${p.id}')" class="text-blue-500 hover:text-blue-700 text-[10px] font-bold mr-2">View</button>
      <button onclick="event.stopPropagation();_mpDeleteSavedPlan('${p.id}')" class="text-red-400 hover:text-red-600 text-[10px] font-bold">Del</button>
    </td>
  </tr>`).join('')}
  </tbody></table>`;
}

/** View a specific saved plan's sheets */
window._mpViewSavedPlan = function(planId) {
  const p = (state.savedPlans || []).find(x => x.id === planId);
  if (!p) return;
  // Ensure the Plan section is visible, then render ONLY this plan's sheets.
  if (typeof window._openMpSection === 'function') window._openMpSection('plan');
  // Highlight the selected row, clear the others.
  document.querySelectorAll('#mpSavedPlansList tr[data-planid]').forEach(tr => {
    tr.style.background = tr.getAttribute('data-planid') === planId ? '#ecfdf5' : '';
  });
  _mpDecomposed = p.decomposed || {}; _mpAllocations = p.allocations || {}; _mpMode = p.mode || 'daily';
  const allWorkers = _getProjectWorkers();
  const sheets = document.getElementById('mpDailySheets');
  if (!sheets) return;
  sheets.innerHTML = '';   // clear any previously-open plan first — show one plan only
  const workDays = Object.keys(_mpDecomposed).filter(d => (_mpDecomposed[d] || []).length).sort();
  const header = `<div style="display:flex;align-items:center;justify-content:space-between;gap:10px;background:#eff6ff;border:1px solid #bfdbfe;border-radius:10px;padding:10px 14px;margin-bottom:12px;flex-wrap:wrap;">
      <div style="font-size:12px;font-weight:700;color:#1e40af;">📋 Viewing plan · ${new Date(p.generated).toLocaleString('en-IN')} · ${p.horizon.start} → ${p.horizon.end} · ${workDays.length} day${workDays.length === 1 ? '' : 's'}</div>
      <button onclick="document.getElementById('mpDailySheets').innerHTML=''; document.querySelectorAll('#mpSavedPlansList tr[data-planid]').forEach(t=>t.style.background='');" style="font-size:11px;font-weight:700;color:#64748b;background:#fff;border:1px solid #e2e8f0;border-radius:7px;padding:4px 12px;cursor:pointer;">✕ Close</button>
    </div>`;
  if (_mpMode === 'weekly') {
    sheets.innerHTML = header + _renderWeeklyView(_mpDecomposed, _mpAllocations, allWorkers, p.horizon.start, p.horizon.end);
  } else {
    let h = header;
    workDays.forEach(day => {
      const chunks = _mpDecomposed[day];
      const conflicts = detectConflicts(chunks, _mpAllocations[day], allWorkers.filter(w => _isWorkerAvailable(w, day)));
      h += generateDailySheet(day, _mpAllocations[day], conflicts, chunks, allWorkers);
    });
    sheets.innerHTML = h;
  }
  sheets.scrollIntoView({ behavior: 'smooth', block: 'start' });
};

window._mpDeleteSavedPlan = function(planId) {
  if (!confirm('Delete this saved plan?')) return;
  window.recycleDelete && window.recycleDelete('savedPlans', planId, 'Saved Plan');
  saveAllData();
  _mpRenderSavedPlans();
  const sheets = document.getElementById('mpDailySheets'); if (sheets) sheets.innerHTML = '';
  showToast('Plan deleted', 'warning');
};

/** App-icon section navigation for Micro Planning */
window._openMpSection = function(section) {
  _mpSection = section || null; // remember so a sync re-render doesn't bounce the user to the hub
  const grid = document.getElementById('mpGrid');
  const back = document.getElementById('mpBackBtn');
  document.querySelectorAll('.mp-section').forEach(s => s.classList.add('hide'));
  if (!section) { if (grid) grid.style.display = 'grid'; if (back) back.style.display = 'none'; return; }
  if (grid) grid.style.display = 'none'; if (back) back.style.display = 'inline-block';
  const map = { tasks: 'mpSecTasks', generate: 'mpSecGenerate', plan: 'mpSecPlan', rabill: 'mpSecRABill', progress: 'mpSecProgress' };
  const el = document.getElementById(map[section]); if (el) el.classList.remove('hide');
  if (section === 'rabill' && typeof window.renderRABilling === 'function') window.renderRABilling();
  if (section === 'progress' && typeof window.renderPlanVsActual === 'function') window.renderPlanVsActual();
};

/** Plan vs Actual — per BOQ item, planned (contract) qty vs actual done
 *  (cumulative measured), with % complete and remaining. */
window.renderPlanVsActual = function() {
  const c = document.getElementById('mpProgressContent');
  if (!c) return;
  const proj = _currentProject();
  if (!proj) { c.innerHTML = '<p class="text-sm text-slate-500 py-8 text-center">Select a project first.</p>'; return; }
  const cur = getCurrencySymbol();
  const fmt = n => cur + Math.round(n).toLocaleString('en-IN');
  // Planned qty per BOQ code (from the contract BOQ).
  const planned = {};
  (proj.boqs || []).forEach(g => (g.items || []).forEach(it => {
    const code = it.code || it.itemNo; if (!code) return;
    const q = parseFloat(it.qty) || 0;
    if (!planned[code]) planned[code] = { code, description: it.description || it.name || code, uom: it.uom || it.unit || '', rate: parseFloat(it.rate) || 0, plannedQty: 0 };
    planned[code].plannedQty += q;
  }));
  const done = _measuredByCode(proj.id); // { code: { qty, rate, ... } }
  const codes = Object.keys(planned).length ? Object.keys(planned) : Object.keys(done);
  let totPlanVal = 0, totDoneVal = 0;
  const rows = codes.map(code => {
    const p = planned[code] || { code, description: (done[code]?.description || code), uom: done[code]?.uom || '', rate: done[code]?.rate || 0, plannedQty: 0 };
    const dq = (done[code]?.qty) || 0;
    const pq = p.plannedQty;
    const pct = pq > 0 ? Math.min(100, (dq / pq) * 100) : (dq > 0 ? 100 : 0);
    totPlanVal += pq * p.rate; totDoneVal += dq * p.rate;
    return { ...p, doneQty: dq, pct, remaining: Math.max(0, pq - dq) };
  }).sort((a, b) => (a.pct - b.pct));
  const overallPct = totPlanVal > 0 ? Math.min(100, (totDoneVal / totPlanVal) * 100) : 0;

  const body = rows.map(r => {
    const barColor = r.pct >= 100 ? '#16a34a' : r.pct >= 50 ? '#0891b2' : r.pct > 0 ? '#f59e0b' : '#e2e8f0';
    return `<tr class="border-b hover:bg-slate-50">
      <td class="px-2 py-1.5 font-mono font-bold text-slate-700">${_esc(r.code)}</td>
      <td class="px-2 py-1.5 text-slate-600">${_esc(r.description)}</td>
      <td class="px-2 py-1.5 text-right text-slate-500">${r.plannedQty.toLocaleString('en-IN', { maximumFractionDigits: 2 })} ${_esc(r.uom)}</td>
      <td class="px-2 py-1.5 text-right font-bold text-slate-700">${r.doneQty.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</td>
      <td class="px-2 py-1.5 text-right text-slate-400">${r.remaining.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</td>
      <td class="px-2 py-1.5" style="min-width:120px;"><div style="background:#f1f5f9;border-radius:6px;height:14px;overflow:hidden;"><div style="background:${barColor};height:100%;width:${r.pct}%;"></div></div></td>
      <td class="px-2 py-1.5 text-right font-bold ${r.pct >= 100 ? 'text-green-600' : 'text-slate-600'}">${r.pct.toFixed(0)}%</td>
    </tr>`;
  }).join('');

  c.innerHTML = `
    <div class="bg-white border rounded-xl p-4 mb-4">
      <div class="flex items-center justify-between mb-2"><h3 class="font-bold text-slate-800 text-sm">📈 Overall progress</h3><span class="font-extrabold text-cyan-700">${overallPct.toFixed(1)}%</span></div>
      <div style="background:#f1f5f9;border-radius:8px;height:20px;overflow:hidden;"><div style="background:linear-gradient(90deg,#0891b2,#06b6d4);height:100%;width:${overallPct}%;"></div></div>
      <div class="flex justify-between text-[11px] text-slate-400 mt-1"><span>Done ${fmt(totDoneVal)}</span><span>Planned ${fmt(totPlanVal)}</span></div>
    </div>
    <div class="bg-white border rounded-xl overflow-hidden">
      <div class="p-3 border-b font-bold text-slate-700 text-sm">Plan vs Actual by BOQ item</div>
      <div class="overflow-x-auto"><table class="w-full text-xs"><thead class="bg-slate-50"><tr>
        <th class="px-2 py-2 text-left font-bold uppercase text-slate-500">Code</th><th class="px-2 py-2 text-left font-bold uppercase text-slate-500">Description</th>
        <th class="px-2 py-2 text-right font-bold uppercase text-slate-500">Planned</th><th class="px-2 py-2 text-right font-bold uppercase text-slate-500">Done</th>
        <th class="px-2 py-2 text-right font-bold uppercase text-slate-500">Balance</th><th class="px-2 py-2 text-left font-bold uppercase text-slate-500">Progress</th>
        <th class="px-2 py-2 text-right font-bold uppercase text-slate-500">%</th></tr></thead>
        <tbody>${body || '<tr><td colspan="7" class="p-5 text-center text-slate-400">No BOQ items or measured work yet.</td></tr>'}</tbody></table></div>
      <p class="text-[10px] text-slate-400 px-3 py-2 border-t">Planned = contract BOQ quantity. Done = cumulative measured (from DPR / measurement). Add BOQ quantities to your project to see planned targets.</p>
    </div>`;
};

// ─────────────────────────────────────────────────────
//  GENERATE PLAN (Daily or Weekly)
// ─────────────────────────────────────────────────────
let _mpOutsideLabour = null; // {confirmed:true, note} once the user arranges outside labour

/** Labour shortage gate — shown when required labour exceeds availability. */
function _showLabourGate(messages) {
  document.getElementById('mpLabourGate')?.remove();
  const list = messages.slice(0, 12).map(m => `<li style="margin:3px 0;">${_esc(m)}</li>`).join('');
  const more = messages.length > 12 ? `<li style="list-style:none;color:#92400e;">…and ${messages.length - 12} more</li>` : '';
  const html = `<div id="mpLabourGate" class="ef-overlay" style="z-index:299999" onclick="if(event.target===this)this.remove()">
      <div class="ef-modal" style="max-width:500px;">
        <div class="ef-header" style="background:linear-gradient(135deg,#b45309,#d97706)">
          <h3 class="ef-title" style="color:#fff">⚠ Not enough labour to execute</h3>
          <button onclick="document.getElementById('mpLabourGate').remove()" class="ef-close" style="color:#fff">&times;</button>
        </div>
        <div class="ef-body">
          <p style="font-size:13px;color:#475569;margin-bottom:8px;">This plan can't be generated as-is — the required labour exceeds the workers available in this project:</p>
          <ul style="font-size:12px;color:#b45309;background:#fffbeb;border:1px solid #fde68a;border-radius:8px;padding:10px 14px 10px 28px;margin-bottom:14px;max-height:160px;overflow:auto;">${list}${more}</ul>
          <label class="ef-label">Do you have another source of labour (outside / contract)?</label>
          <textarea id="mpOutsideNote" class="ef-input ef-textarea" rows="2" placeholder="e.g. 6 masons from XYZ contractor arranged for these days"></textarea>
          <p style="font-size:11px;color:#94a3b8;margin-top:6px;">Add labour in the <b>Labour</b> module for a permanent fix, or confirm outside labour to proceed.</p>
        </div>
        <div class="ef-footer">
          <button onclick="document.getElementById('mpLabourGate').remove()" class="ef-btn-cancel">Cancel — don't generate</button>
          <button onclick="window._mpConfirmOutsideLabour()" class="ef-btn-save">Arrange outside labour &amp; generate</button>
        </div>
      </div></div>`;
  document.body.insertAdjacentHTML('beforeend', html);
  setTimeout(() => document.getElementById('mpOutsideNote')?.focus(), 100);
}
window._mpConfirmOutsideLabour = function() {
  const note = document.getElementById('mpOutsideNote')?.value.trim() || 'Outside/contract labour arranged';
  _mpOutsideLabour = { confirmed: true, note };
  document.getElementById('mpLabourGate')?.remove();
  mpGenerate(); // re-run — gate is now bypassed and the note is recorded on the plan
};

export function mpGenerate() {
  // The mode drives the horizon: Daily = just the selected day; Weekly = that day
  // + 6 days. (Previously it used the End-date box regardless of mode, so 'Daily'
  // could still generate a whole range.)
  const startV = document.getElementById('mpStartDate')?.value || _mpHorizonStart || _fmtDate(new Date());
  _mpHorizonStart = startV;
  if (_mpMode === 'weekly') {
    const d = _parseDate(startV); d.setDate(d.getDate() + 6); _mpHorizonEnd = _fmtDate(d);
  } else {
    _mpHorizonEnd = startV; // daily → single day
  }
  // Keep the End-date box in sync with what was actually generated.
  const endEl = document.getElementById('mpEndDate'); if (endEl) endEl.value = _mpHorizonEnd;

  const tasks = _getAllTasks();
  const allWorkers = _getProjectWorkers();

  // Show a clear, visible reason (not just a toast) when generation can't run,
  // and jump to the plan area so the user actually sees the message.
  const _notice = (icon, title, msg, action) => {
    const sheets = document.getElementById('mpDailySheets');
    if (sheets) sheets.innerHTML = `<div style="background:#fffbeb;border:1px solid #fde68a;border-radius:16px;padding:28px 20px;text-align:center;">
      <div style="font-size:34px;margin-bottom:8px;">${icon}</div>
      <h3 style="font-size:15px;font-weight:800;color:#92400e;margin-bottom:4px;">${title}</h3>
      <p style="font-size:13px;color:#b45309;margin-bottom:14px;">${msg}</p>${action || ''}</div>`;
    if (typeof window._openMpSection === 'function') window._openMpSection('plan');
  };

  if (!tasks.length) {
    _notice('🗓️', 'No tasks to plan', 'Add at least one task (with start &amp; end dates) in the <b>Planning</b> module — or use <b>+ Add Task</b> in the Tasks section here.',
      `<button onclick="_openMpSection('tasks')" style="background:#1e3a8a;color:#fff;border:none;padding:9px 18px;border-radius:9px;font-weight:700;font-size:13px;cursor:pointer;">+ Add a Task</button>`);
    showToast('No tasks found — add a task first', 'error');
    return;
  }
  if (!allWorkers.length) {
    _notice('👷', 'No workers available', 'Add labour in the <b>Labour</b> module first, then generate the plan.');
    showToast('No workers found — add labour first', 'error');
    return;
  }

  _mpDecomposed = decomposeTasksToDaily(tasks, _mpHorizonStart, _mpHorizonEnd);
  _mpAllocations = {};

  const sheetsContainer = document.getElementById('mpDailySheets');
  if (!sheetsContainer) return;

  const workDays = Object.keys(_mpDecomposed).filter(d => _mpDecomposed[d].length > 0).sort();
  if (!workDays.length) {
    _notice('📅', 'No tasks in this date range', `Your tasks fall outside <b>${_mpHorizonStart}</b> → <b>${_mpHorizonEnd}</b>. Widen the Start/End dates to cover your task dates, then Generate again.`);
    showToast('No tasks in the selected date range', 'warning');
    return;
  }

  // Run allocation for each day
  workDays.forEach(day => {
    const chunks = _mpDecomposed[day];
    const availWorkers = allWorkers.filter(w => _isWorkerAvailable(w, day));
    _mpAllocations[day] = allocateLabor(chunks, availWorkers, day);
  });

  // ── LABOUR AVAILABILITY GATE ──
  // If required labour exceeds the workers available on any day, the plan can't
  // be executed. Block generation and ask whether outside/contract labour will
  // be arranged. Only proceed once the user confirms an outside source.
  const shortages = [];
  workDays.forEach(day => {
    const avail = allWorkers.filter(w => _isWorkerAvailable(w, day));
    detectConflicts(_mpDecomposed[day], _mpAllocations[day], avail)
      .filter(c => c.type === 'SHORTAGE')
      .forEach(c => shortages.push(`${day}: ${c.message}`));
  });
  if (shortages.length && !(_mpOutsideLabour && _mpOutsideLabour.confirmed)) {
    _showLabourGate([...new Set(shortages)]);
    return; // do not render or save until resolved
  }

  if (_mpMode === 'weekly') {
    sheetsContainer.innerHTML = _renderWeeklyView(_mpDecomposed, _mpAllocations, allWorkers, _mpHorizonStart, _mpHorizonEnd);
  } else {
    let html = '';
    workDays.forEach(day => {
      const chunks = _mpDecomposed[day];
      const conflicts = detectConflicts(chunks, _mpAllocations[day], allWorkers.filter(w => _isWorkerAvailable(w, day)));
      html += generateDailySheet(day, _mpAllocations[day], conflicts, chunks, allWorkers);
    });
    sheetsContainer.innerHTML = html;
  }

  // Keep the "current" working plan for live edits
  state.microPlanAllocations[_pid()] = {
    generated: new Date().toISOString(),
    horizon: { start: _mpHorizonStart, end: _mpHorizonEnd },
    days: workDays.length, mode: _mpMode,
    decomposed: _mpDecomposed, allocations: _mpAllocations
  };
  // Save this generation as a separate record (transaction-style history)
  if (!state.savedPlans) state.savedPlans = [];
  const totalWorkers = new Set();
  Object.values(_mpAllocations).forEach(a => (a.assignments || []).forEach(x => totalWorkers.add(x.workerId)));
  state.savedPlans.push({
    id: 'plan_' + Date.now() + '_' + Math.floor(Math.random() * 100000),
    projectId: _pid(),
    generated: new Date().toISOString(),
    horizon: { start: _mpHorizonStart, end: _mpHorizonEnd },
    days: workDays.length, mode: _mpMode,
    workerCount: totalWorkers.size,
    outsideLabour: (_mpOutsideLabour && _mpOutsideLabour.confirmed) ? (_mpOutsideLabour.note || 'Outside/contract labour arranged') : null,
    decomposed: JSON.parse(JSON.stringify(_mpDecomposed)),
    allocations: JSON.parse(JSON.stringify(_mpAllocations))
  });
  _mpOutsideLabour = null; // reset so the next generation re-checks availability
  // cap history to last 50
  if (state.savedPlans.length > 50) state.savedPlans = state.savedPlans.slice(-50);
  saveAllData();
  _mpRenderSavedPlans();
  // Spec: after generating, return to the Micro Planning dashboard. The plan is
  // saved — the user opens "Saved Plans" to view it (each row opens only itself).
  if (typeof window._openMpSection === 'function') window._openMpSection(null);
  showToast(`✅ Plan generated — ${workDays.length} day${workDays.length > 1 ? 's' : ''}. Open "Saved Plans" to view it.`, 'success');
}

/** Update task completion % from the daily sheet — saved to the task record */
window._mpUpdateProgress = function(taskId, value) {
  const v = Math.max(0, Math.min(100, parseInt(value) || 0));
  let task = (state.planningTasks || []).find(t => t.id === taskId);
  let isMicro = false;
  if (!task) { task = (state.microTasks || []).find(t => t.id === taskId); isMicro = true; }
  if (!task) return;
  task.progress = v;
  if (v >= 100) task.status = 'Completed';
  else if (task.status === 'Completed') task.status = 'In Progress';
  saveAllData();
  showToast(`${task.name}: ${v}% complete${v >= 100 ? ' ✓' : ''}`, 'success');
};

/** Re-render a single day's sheet after manual/auto changes */
function _mpRerenderDay(dateStr) {
  const allWorkers = _getProjectWorkers();
  const chunks = _mpDecomposed[dateStr] || [];
  const conflicts = detectConflicts(chunks, _mpAllocations[dateStr], allWorkers.filter(w => _isWorkerAvailable(w, dateStr)));
  const html = generateDailySheet(dateStr, _mpAllocations[dateStr], conflicts, chunks, allWorkers);
  const old = document.getElementById('dailySheet_' + dateStr);
  if (old) old.outerHTML = html;
}

/** Manual assign: pick a task for this free worker */
window._mpManualAssign = function(dateStr, workerId) {
  const worker = _getProjectWorkers().find(w => w.id === workerId);
  const chunks = _mpDecomposed[dateStr] || [];
  if (!worker) return;
  if (!chunks.length) { showToast('No tasks this day', 'error'); return; }
  const taskOpts = chunks.map((ch, i) => `${i + 1}. ${ch.taskName} (${ch.location || '—'})`).join('\n');
  const pick = parseInt(prompt(`Assign ${worker.name} (${worker.trade || 'general'}) to:\n${taskOpts}\n\nEnter number:`)) - 1;
  if (isNaN(pick) || !chunks[pick]) return;
  const ch = chunks[pick];
  const hrs = 8;
  const rate = worker.dayRate || 0;
  const alloc = _mpAllocations[dateStr] || { assignments: [], workerHoursUsed: {}, unmet: [] };
  // Prevent double assignment
  if (alloc.assignments.some(a => a.workerId === workerId)) { showToast('Worker already assigned', 'warning'); return; }
  alloc.assignments.push({ workerId, workerName: worker.name, taskId: ch.taskId, taskName: ch.taskName, trade: worker.trade || 'general', hours: hrs, cost: (rate / 8) * hrs, manual: true });
  alloc.workerHoursUsed[workerId] = (alloc.workerHoursUsed[workerId] || 0) + hrs;
  _mpAllocations[dateStr] = alloc;
  saveAllData();
  _mpRerenderDay(dateStr);
  showToast(`${worker.name} → ${ch.taskName}`, 'success');
};

/** Auto-assign all free workers for a day to under-staffed tasks */
window._mpAutoAssignDay = function(dateStr) {
  const allWorkers = _getProjectWorkers();
  const availWorkers = allWorkers.filter(w => _isWorkerAvailable(w, dateStr));
  const chunks = _mpDecomposed[dateStr] || [];
  // Re-run allocation fresh for the day (keeps manual ones if any by merging)
  const manual = (_mpAllocations[dateStr]?.assignments || []).filter(a => a.manual);
  const fresh = allocateLabor(chunks, availWorkers, dateStr);
  // Merge: keep manual assignments, add auto ones for workers not already manually placed
  const manualIds = new Set(manual.map(a => a.workerId));
  fresh.assignments = [...manual, ...fresh.assignments.filter(a => !manualIds.has(a.workerId))];
  _mpAllocations[dateStr] = fresh;
  saveAllData();
  _mpRerenderDay(dateStr);
  showToast('Auto-assigned free labour', 'success');
};

export function mpToggleUtil() {
  const panel = document.getElementById('mpUtilPanel');
  if (!panel) return;
  if (!panel.classList.contains('hidden')) { panel.classList.add('hidden'); return; }
  if (!Object.keys(_mpAllocations).length) { showToast('Generate a plan first', 'error'); return; }
  const utilData = computeUtilization(_mpHorizonStart, _mpHorizonEnd, _mpAllocations);
  panel.innerHTML = `<div class="bg-white border rounded-xl p-5"><h3 class="font-bold text-sm text-slate-800 mb-3">Trade Utilization Heatmap</h3>${_renderUtilizationChart(utilData)}</div>`;
  panel.classList.remove('hidden');
}

export function mpSaveProgress(dateStr) {
  const chunks = _mpDecomposed[dateStr] || [];
  const progressMap = {};
  let hasInput = false;
  chunks.forEach(ch => {
    const el = document.getElementById(`prog_${dateStr}_${ch.taskId}`);
    if (el && el.value !== '') { progressMap[ch.taskId] = parseFloat(el.value) || 0; hasInput = true; }
  });
  if (!hasInput) { showToast('Enter at least one progress value', 'error'); return; }
  reallocateForDelays(dateStr, progressMap);
  mpGenerate();
  showToast('Progress saved & plan updated');
}

export function mpExportDayPDF(dateStr) {
  if (typeof window.jspdf === 'undefined' && typeof window.jsPDF === 'undefined') { showToast('jsPDF not loaded', 'error'); return; }
  const JsPDF = window.jspdf?.jsPDF || window.jsPDF;
  const doc = new JsPDF('p', 'mm', 'a4');
  const alloc = _mpAllocations[dateStr];
  if (!alloc) { showToast('No data for this date', 'error'); return; }

  const dayLabel = _parseDate(dateStr).toLocaleDateString('en-IN', { weekday:'long', day:'2-digit', month:'long', year:'numeric' });
  const cp = state.companyProfile || {};
  const proj = state.projects.find(p => p.id === _pid());

  let y = getCompanyHeaderForPDF(doc);
  doc.setFontSize(11); doc.setFont('helvetica','bold'); doc.setTextColor(0);
  doc.text(`Daily Labor Allocation — ${dayLabel}`, 14, y);
  if (proj) { doc.setFontSize(8); doc.setFont('helvetica','normal'); y += 5; doc.text(`Project: ${proj.name}`, 14, y); }
  y += 8;

  const rows = alloc.assignments.map((a,i) => [i+1, a.workerName, a.trade, a.taskName, a.hours, a.location, formatINR(a.cost)]);
  doc.autoTable({ startY: y, head: [['#','Worker','Trade','Task','Hours','Location','Cost ('+getCurrencySymbol()+')']], body: rows.length ? rows : [['','','','No assignments','','','']], styles: { fontSize: 7, cellPadding: 2 }, headStyles: { fillColor: [30,58,138], textColor: 255, fontStyle: 'bold' }, alternateRowStyles: { fillColor: [248,250,252] }, margin: { left: 14, right: 14 } });
  y = doc.lastAutoTable.finalY + 10;
  doc.setFontSize(8); doc.setTextColor(100);
  doc.text('Supervisor: _____________________   Sign: _______________   Date: _________', 14, y);
  doc.save(`DailyPlan_${dateStr}.pdf`);
  showToast('PDF downloaded');
}

/**
 * Location-wise plan PDF — grouped Location → Work Task → Labour allocation.
 * STRICTLY excludes all cost / financial data (this is a site-execution sheet,
 * not a costing document).
 */
window._mpExportLocationPlanPDF = function(dateStr) {
  const JsPDF = window.jspdf?.jsPDF || window.jsPDF;
  if (!JsPDF) { showToast('PDF library not loaded — refresh the page', 'error'); return; }
  // Use the live allocation if present, else fall back to the latest saved plan
  // for this project that covers this date (so the PDF works after a reload too).
  let alloc = _mpAllocations[dateStr];
  if (!alloc || !(alloc.assignments || []).length) {
    const sp = (state.savedPlans || []).filter(p => p.projectId === _pid() && p.allocations && p.allocations[dateStr]).sort((a, b) => (b.generated || '').localeCompare(a.generated || ''))[0];
    if (sp) alloc = sp.allocations[dateStr];
  }
  if (!alloc || !(alloc.assignments || []).length) { showToast('No allocation for this day — generate the plan first', 'error'); return; }

  // Group: location -> task -> [ {worker, trade, hours} ]
  const byLoc = {};
  alloc.assignments.forEach(a => {
    const loc = a.location || 'Unassigned location';
    const task = a.taskName || 'Task';
    (byLoc[loc] = byLoc[loc] || {});
    (byLoc[loc][task] = byLoc[loc][task] || []).push({ worker: a.workerName, trade: a.trade, hours: a.hours });
  });

  const doc = new JsPDF('p', 'mm', 'a4');
  const proj = state.projects.find(p => p.id === _pid());
  const dayLabel = _parseDate(dateStr).toLocaleDateString('en-IN', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' });
  const pw = doc.internal.pageSize.getWidth(), ph = doc.internal.pageSize.getHeight(), ml = 14, mr = 14;

  let y = (typeof getCompanyHeaderForPDF === 'function') ? getCompanyHeaderForPDF(doc) : 16;
  doc.setFillColor(30, 58, 138); doc.rect(ml, y, pw - ml - mr, 9, 'F');
  doc.setTextColor(255); doc.setFont('helvetica', 'bold'); doc.setFontSize(12);
  doc.text('SITE WORK PLAN — LOCATION WISE', pw / 2, y + 6.2, { align: 'center' });
  y += 13; doc.setTextColor(0); doc.setFont('helvetica', 'normal'); doc.setFontSize(9);
  doc.text(`Project: ${proj ? proj.name : '—'}    |    Date: ${dayLabel}`, ml, y); y += 6;

  Object.keys(byLoc).sort().forEach(loc => {
    if (y > ph - 30) { doc.addPage(); y = 16; }
    // Location heading
    doc.setFillColor(238, 242, 255); doc.rect(ml, y, pw - ml - mr, 7, 'F');
    doc.setFont('helvetica', 'bold'); doc.setFontSize(10); doc.setTextColor(30, 58, 138);
    doc.text(`📍 ${loc}`, ml + 2, y + 5); y += 9; doc.setTextColor(0);
    Object.keys(byLoc[loc]).forEach(task => {
      const workers = byLoc[loc][task];
      doc.setFont('helvetica', 'bold'); doc.setFontSize(9);
      if (y > ph - 24) { doc.addPage(); y = 16; }
      doc.text(`Task: ${task}`, ml + 4, y); y += 1;
      doc.autoTable({
        startY: y + 1,
        head: [['#', 'Worker', 'Trade', 'Hours']],
        body: workers.map((w, i) => [i + 1, w.worker, w.trade || '-', w.hours]),
        styles: { fontSize: 8, cellPadding: 1.6 },
        headStyles: { fillColor: [71, 85, 105], textColor: 255, fontSize: 8 },
        columnStyles: { 0: { cellWidth: 10 }, 3: { halign: 'right', cellWidth: 22 } },
        margin: { left: ml + 4, right: mr },
        theme: 'grid'
      });
      y = doc.lastAutoTable.finalY + 4;
    });
    y += 2;
  });

  const sy = Math.max(y + 8, ph - 24);
  doc.setFontSize(8); doc.setFont('helvetica', 'normal'); doc.setTextColor(80);
  doc.text('Site Engineer: __________________     Supervisor: __________________     Date: ____________', ml, sy);
  doc.save(`SitePlan_LocationWise_${dateStr}.pdf`);
  showToast('Location-wise plan PDF downloaded');
};

export function mpPrintDay(dateStr) {
  const el = document.getElementById(`dailySheet_${dateStr}`);
  if (!el) return;
  const w = window.open('', '_blank');
  w.document.write(`<html><head><title>Daily Plan ${dateStr}</title><link href="https://cdn.jsdelivr.net/npm/tailwindcss@2/dist/tailwind.min.css" rel="stylesheet"><style>@media print{.no-print{display:none}}</style></head><body class="p-4">${el.outerHTML}</body></html>`);
  w.document.close();
  setTimeout(() => { w.print(); }, 500);
}

// ═══════════════════════════════════════════════════════════
//  LOCATION MASTER  (Block › Floor › Unit) — per project
//  The accumulator key for daily measurement & RA billing.
//  Stored on project.siteLocations = [{ id, block, floor, unit }]
// ═══════════════════════════════════════════════════════════
function _currentProject() {
  return (state.projects || []).find(p => p.id === _pid());
}
/**
 * Locations are NOT maintained separately — they're auto-pulled from the
 * locations/areas already used on this project's Planning & Micro tasks (the
 * task "Area" field). We also include locations already saved on running sheets
 * (so existing measurements stay selectable) and any legacy siteLocations.
 * Returns [{ id, _label }] where id === the area string (the accumulator key).
 */
function _projectLocations() {
  const pid = _pid();
  const map = new Map(); // id -> label
  const add = (id, label) => { const k = (id || '').toString().trim(); if (k && !map.has(k)) map.set(k, (label || k).toString().trim()); };
  (state.planningTasks || []).filter(t => t.projectId === pid).forEach(t => add(t.area, t.area));
  (state.microTasks || []).filter(t => t.projectId === pid).forEach(t => add(t.area, t.area));
  (state.sheets || []).filter(s => s.projectId === pid && s.locationId).forEach(s => add(s.locationId, s.area || s.locationId));
  const proj = (state.projects || []).find(p => p.id === pid);
  (proj?.siteLocations || []).forEach(l => add(l.id, [l.block, l.floor, l.unit].filter(Boolean).join(' › ') || l.id));
  return [...map.entries()].map(([id, _label]) => ({ id, _label }));
}
/** Readable label for a location id/object (area string or legacy {block…}). */
export function siteLocationLabel(loc) {
  if (!loc) return '';
  if (typeof loc === 'string') {
    const f = _projectLocations().find(l => l.id === loc);
    return f ? f._label : loc;
  }
  return loc._label || [loc.block, loc.floor, loc.unit].map(s => (s || '').trim()).filter(Boolean).join(' › ') || loc.id || 'Location';
}
window.siteLocationLabel = siteLocationLabel;

export function renderSiteLocations() {
  const c = document.getElementById('siteLocationsContent');
  if (!c) return;
  const proj = _currentProject();
  if (!proj) { c.innerHTML = '<p class="text-sm text-slate-500 py-8 text-center">Select a project first.</p>'; return; }
  const locs = _projectLocations();
  const rows = locs.map(l => `<tr class="hover:bg-slate-50 border-b">
      <td class="px-3 py-2 font-semibold text-slate-800">${_esc(siteLocationLabel(l))}</td>
      <td class="px-3 py-2 text-slate-500">${_esc(l.block || '-')}</td>
      <td class="px-3 py-2 text-slate-500">${_esc(l.floor || '-')}</td>
      <td class="px-3 py-2 text-slate-500">${_esc(l.unit || '-')}</td>
      <td class="px-3 py-2 text-right"><button onclick="window._deleteSiteLocation('${l.id}')" class="text-red-400 hover:text-red-600 text-[11px] font-bold">Delete</button></td>
    </tr>`).join('');
  c.innerHTML = `
    <div class="bg-white border rounded-xl p-4 mb-4">
      <h3 class="font-bold text-sm text-slate-800 mb-1">📍 Site Locations</h3>
      <p class="text-[11px] text-slate-400 mb-3">Define where work happens (Block / Floor / Unit). Daily measurements & RA bills are organised by location.</p>
      <div class="grid grid-cols-1 md:grid-cols-4 gap-2 items-end">
        <div><label class="block text-[10px] font-bold text-slate-500 uppercase mb-1">Block / Tower</label><input id="locBlock" placeholder="e.g. Block A" class="w-full p-2 border rounded-lg text-sm"></div>
        <div><label class="block text-[10px] font-bold text-slate-500 uppercase mb-1">Floor / Level</label><input id="locFloor" placeholder="e.g. 2nd Floor" class="w-full p-2 border rounded-lg text-sm"></div>
        <div><label class="block text-[10px] font-bold text-slate-500 uppercase mb-1">Unit / Flat / Grid</label><input id="locUnit" placeholder="e.g. Flat 203" class="w-full p-2 border rounded-lg text-sm"></div>
        <button onclick="window._addSiteLocation()" class="bg-teal-600 text-white px-4 py-2 rounded-lg font-bold text-sm hover:bg-teal-700">+ Add Location</button>
      </div>
    </div>
    <div class="bg-white border rounded-xl overflow-hidden">
      <div class="p-3 border-b font-bold text-slate-700 text-sm">${locs.length} location${locs.length === 1 ? '' : 's'}</div>
      <div class="overflow-x-auto"><table class="w-full text-xs"><thead class="bg-slate-50"><tr>
        <th class="px-3 py-2 text-left font-bold uppercase text-slate-500">Location</th>
        <th class="px-3 py-2 text-left font-bold uppercase text-slate-500">Block</th>
        <th class="px-3 py-2 text-left font-bold uppercase text-slate-500">Floor</th>
        <th class="px-3 py-2 text-left font-bold uppercase text-slate-500">Unit</th>
        <th class="px-3 py-2 text-right font-bold uppercase text-slate-500">Action</th>
      </tr></thead><tbody>${rows || '<tr><td colspan="5" class="p-5 text-center text-slate-400">No locations yet — add Block / Floor / Unit above.</td></tr>'}</tbody></table></div>
    </div>`;
}
window.renderSiteLocations = renderSiteLocations;

window._addSiteLocation = function() {
  const proj = _currentProject();
  if (!proj) { showToast('Select a project first', 'error'); return; }
  const block = (document.getElementById('locBlock')?.value || '').trim();
  const floor = (document.getElementById('locFloor')?.value || '').trim();
  const unit  = (document.getElementById('locUnit')?.value || '').trim();
  if (!block && !floor && !unit) { showToast('Enter at least a Block, Floor or Unit', 'error'); return; }
  if (!Array.isArray(proj.siteLocations)) proj.siteLocations = [];
  const label = [block, floor, unit].filter(Boolean).join(' › ');
  if (proj.siteLocations.some(l => siteLocationLabel(l).toLowerCase() === label.toLowerCase())) {
    showToast('That location already exists', 'warning'); return;
  }
  proj.siteLocations.push({ id: 'loc_' + Date.now().toString(36), block, floor, unit });
  saveAllData();
  renderSiteLocations();
  showToast('Location added', 'success');
};

window._deleteSiteLocation = function(id) {
  const proj = _currentProject();
  if (!proj || !Array.isArray(proj.siteLocations)) return;
  if (!confirm('Delete this location? Existing measurements already saved against it are not affected.')) return;
  proj.siteLocations = proj.siteLocations.filter(l => l.id !== id);
  saveAllData();
  renderSiteLocations();
  showToast('Location removed', 'info');
};

// ═══════════════════════════════════════════════════════════
//  PHASE 2 — DAILY MEASUREMENT  ("Record Work Done")
//  Captures executed quantity per LOCATION at day-close and
//  appends it to an OPEN running measurement sheet for that
//  (project, location). The sheet feeds the existing
//  Measurement → Abstract → RA Bill pipeline. Stays open
//  (accumulating) until an RA bill is cut, then it locks.
// ═══════════════════════════════════════════════════════════

/** Flatten a project's BOQ items → [{ code, description, uom, rate }]. */
function _mpBoqItems() {
  const proj = _currentProject();
  const out = [];
  (proj?.boqs || []).forEach(g => (g.items || []).forEach(it => {
    const code = it.code || it.itemNo;
    if (!code) return;
    out.push({ code, description: it.description || it.name || code, uom: it.uom || it.unit || '', rate: parseFloat(it.rate) || 0 });
  }));
  return out;
}

/** Find the OPEN (un-billed) running measurement sheet for a location, or create it. */
function _findOrCreateRunningSheet(locId, locLabel) {
  const proj = _currentProject();
  const pid = proj?.id;
  let s = (state.sheets || []).find(x => x.projectId === pid && x.locationId === locId && !x.isBilled);
  if (!s) {
    const n = (state.sheets || []).filter(x => x.projectId === pid).length + 1;
    s = {
      id: 's_' + Date.now(), projectId: pid, clientId: proj?.clientId || '',
      date: new Date().toISOString().split('T')[0], sheetNum: 'M-' + String(n).padStart(3, '0'),
      area: locLabel, locationId: locId, entries: [], overheadEntries: [],
      isBilled: false, linkedAbstract: null, _running: true, updatedAt: new Date().toISOString()
    };
    if (!state.sheets) state.sheets = [];
    state.sheets.push(s);
  }
  return s;
}

function _mpBoqRowHtml() {
  const opts = _mpBoqItems().map(b => `<option value="${_esc(b.code)}" data-uom="${_esc(b.uom)}" data-rate="${b.rate}" data-desc="${_esc(b.description)}">${_esc(b.code)} — ${_esc(b.description)}</option>`).join('');
  const dim = (cls) => `<td class="p-1"><input class="${cls} w-14 p-1.5 border rounded text-xs text-right" type="number" min="0" step="0.001" placeholder="" oninput="window._rwDimCalc(this)"></td>`;
  return `<tr>
    <td class="p-1"><select class="rw-boq w-full p-1.5 border rounded text-xs" onchange="window._rwBoqPick(this)"><option value="">-- BOQ item --</option>${opts}</select></td>
    ${dim('rw-nos')}${dim('rw-l')}${dim('rw-b')}${dim('rw-h')}
    <td class="p-1"><input class="rw-qty w-16 p-1.5 border rounded text-xs text-right font-bold text-blue-700 bg-slate-50" type="number" min="0" step="0.001" placeholder="0" title="Auto = Nos×L×B×H; type directly if no dimensions"></td>
    <td class="p-1"><input class="rw-uom w-12 p-1.5 border rounded text-xs" readonly></td>
    <td class="p-1 text-center"><button onclick="this.closest('tr').remove()" class="text-red-400 text-xs font-bold">✕</button></td>
  </tr>`;
}
function _mpOverheadRowHtml() {
  const cats = ['Material Handling', 'Housekeeping / Cleaning', 'Rework', 'Dewatering', 'Scaffolding', 'Curing', 'Idle / Standby', 'Safety', 'Mobilization', 'Other'];
  return `<tr>
    <td class="p-1"><input class="oh-act w-full p-1.5 border rounded text-xs" placeholder="e.g. Shift cement to 3rd floor"></td>
    <td class="p-1"><select class="oh-cat w-full p-1.5 border rounded text-xs">${cats.map(c => `<option>${c}</option>`).join('')}</select></td>
    <td class="p-1"><input class="oh-qty w-full p-1.5 border rounded text-xs text-right" type="number" min="0" step="0.01" placeholder="0"></td>
    <td class="p-1"><input class="oh-uom w-16 p-1.5 border rounded text-xs" placeholder="unit"></td>
    <td class="p-1 text-center"><button onclick="this.closest('tr').remove()" class="text-red-400 text-xs font-bold">✕</button></td>
  </tr>`;
}

window._rwBoqPick = function(sel) {
  const tr = sel.closest('tr'); const o = sel.selectedOptions?.[0];
  // Measurement records quantities only — the rate rides silently on the option
  // (data-rate) and is captured on save for RA billing; it isn't shown here.
  tr.querySelector('.rw-uom').value = o?.dataset.uom || '';
};
/** Qty = Nos × L × B × H (blank dims = 1). With no dims, the Qty cell is typed
 *  directly (weight/count units). Mirrors the measurement-sheet convention. */
window._rwDimCalc = function(el) {
  const tr = el.closest('tr');
  const read = sel => { const raw = tr.querySelector(sel)?.value ?? ''; if (raw === '') return { v: 1, has: false }; const n = parseFloat(raw); return { v: isNaN(n) ? 1 : n, has: true }; };
  const nos = read('.rw-nos'), l = read('.rw-l'), b = read('.rw-b'), h = read('.rw-h');
  const any = nos.has || l.has || b.has || h.has;
  const qtyEl = tr.querySelector('.rw-qty');
  if (any) { qtyEl.value = (nos.v * l.v * b.v * h.v).toFixed(3); qtyEl.readOnly = true; qtyEl.classList.add('bg-slate-50'); }
  else { qtyEl.readOnly = false; qtyEl.classList.remove('bg-slate-50'); }
};
window._rwAddBoq = function() { document.getElementById('rwBoqBody')?.insertAdjacentHTML('beforeend', _mpBoqRowHtml()); };
window._rwAddOverhead = function() { document.getElementById('rwOhBody')?.insertAdjacentHTML('beforeend', _mpOverheadRowHtml()); };

/** Open the Record-Work-Done modal for a given date. */
window._mpRecordWork = function(dateStr) {
  const proj = _currentProject();
  if (!proj) { showToast('Select a project first', 'error'); return; }
  const date = dateStr || new Date().toISOString().split('T')[0];
  const locs = _projectLocations();
  const cur = getCurrencySymbol();
  const locOpts = locs.map(l => `<option value="${l.id}">${_esc(siteLocationLabel(l))}</option>`).join('');
  const boqCount = _mpBoqItems().length;
  document.getElementById('mpRecordWorkModal')?.remove();
  const html = `<div id="mpRecordWorkModal" class="ef-overlay" style="z-index:299999" onclick="if(event.target===this)this.remove()">
    <div class="ef-modal" style="max-width:760px;">
      <div class="ef-header" style="background:linear-gradient(135deg,#059669,#047857)">
        <h3 class="ef-title" style="color:#fff">📐 Record Work Done</h3>
        <button onclick="document.getElementById('mpRecordWorkModal').remove()" class="ef-close" style="color:#fff">&times;</button>
      </div>
      <div class="ef-body" style="max-height:70vh;overflow:auto;">
        <div class="grid grid-cols-2 gap-3 mb-4">
          <div><label class="ef-label">Date</label><input id="rwDate" type="date" value="${date}" class="ef-input"></div>
          <div><label class="ef-label">Location</label>${locs.length
            ? `<select id="rwLocation" class="ef-input">${locOpts}</select>`
            : `<div class="text-[11px] text-amber-600 font-bold p-2 bg-amber-50 border border-amber-200 rounded">No locations yet — set an <b>Area</b> on a Planning / Micro task (Block, floor or zone). Locations are pulled from there automatically.</div>`}</div>
        </div>

        <div class="flex items-center justify-between mb-1">
          <h4 class="text-xs font-bold text-slate-700 uppercase">Chargeable work (from BOQ)</h4>
          <button onclick="window._rwAddBoq()" class="text-[11px] bg-emerald-50 text-emerald-700 border border-emerald-200 px-2 py-1 rounded font-bold">+ Add item</button>
        </div>
        ${boqCount === 0 ? '<p class="text-[11px] text-amber-600 mb-3">This project has no BOQ items yet — add them in the project BOQ to bill work.</p>' : ''}
        <p class="text-[10px] text-slate-400 mb-1">Enter Nos × L × B × H for measured items (Qty auto-calculates) — or leave dimensions blank and type Qty directly for weight/count units.</p>
        <div class="overflow-x-auto border rounded-lg mb-4"><table class="w-full text-xs"><thead class="bg-slate-50"><tr>
          <th class="p-1.5 text-left font-bold text-slate-500">BOQ Item</th>
          <th class="p-1.5 text-right font-bold text-slate-500">Nos</th><th class="p-1.5 text-right font-bold text-slate-500">L</th><th class="p-1.5 text-right font-bold text-slate-500">B</th><th class="p-1.5 text-right font-bold text-slate-500">H</th>
          <th class="p-1.5 text-right font-bold text-slate-500">Qty</th>
          <th class="p-1.5 text-left font-bold text-slate-500">Unit</th><th class="p-1.5"></th></tr></thead>
          <tbody id="rwBoqBody">${_mpBoqRowHtml()}${_mpBoqRowHtml()}</tbody></table></div>

        <div class="flex items-center justify-between mb-1">
          <h4 class="text-xs font-bold text-slate-700 uppercase">Non-BOQ / overhead work <span class="text-slate-400 font-medium normal-case">(owner record only, not billed)</span></h4>
          <button onclick="window._rwAddOverhead()" class="text-[11px] bg-slate-100 text-slate-600 border px-2 py-1 rounded font-bold">+ Add activity</button>
        </div>
        <div class="overflow-x-auto border rounded-lg"><table class="w-full text-xs"><thead class="bg-slate-50"><tr>
          <th class="p-1.5 text-left font-bold text-slate-500">Activity</th><th class="p-1.5 text-left font-bold text-slate-500">Category</th>
          <th class="p-1.5 text-right font-bold text-slate-500">Qty</th><th class="p-1.5 text-left font-bold text-slate-500">Unit</th><th class="p-1.5"></th></tr></thead>
          <tbody id="rwOhBody">${_mpOverheadRowHtml()}</tbody></table></div>
      </div>
      <div class="ef-footer">
        <button onclick="document.getElementById('mpRecordWorkModal').remove()" class="ef-btn-cancel">Cancel</button>
        <button onclick="window._mpSaveRecordWork()" class="ef-btn-save" ${locs.length ? '' : 'disabled style="opacity:.5;cursor:not-allowed;"'}>Save to measurement</button>
      </div>
    </div></div>`;
  document.body.insertAdjacentHTML('beforeend', html);
};

/**
 * PUBLIC measurement API — the single entry point any module (Record Work modal,
 * DPR/Execution, etc.) uses to record daily work into the running measurement
 * sheet for a location. This is what keeps Planning → DPR → RA Billing →
 * Cost & Profit → Cash Flow in real-time sync.
 *
 * @param {{date:string, locationId:string, locationLabel?:string,
 *   items?:Array<{code,description?,uom?,rate?,qty,nos?,l?,b?,h?,src?}>,
 *   overheads?:Array<{activity,category?,qty?,uom?,hours?,resource?}>,
 *   src?:string}} payload
 * @returns {{sheet:object, lines:number}|null}
 */
window.mpRecordWork = function(payload) {
  const proj = _currentProject();
  if (!proj || !payload) return null;
  const date = payload.date || new Date().toISOString().split('T')[0];
  const locId = payload.locationId || payload.locationLabel;
  if (!locId) return null;
  const locLabel = payload.locationLabel || siteLocationLabel(locId);
  const boqByCode = {}; _mpBoqItems().forEach(b => boqByCode[b.code] = b);

  const sheet = _findOrCreateRunningSheet(locId, locLabel);
  if (!sheet.entries) sheet.entries = [];
  if (!sheet.overheadEntries) sheet.overheadEntries = [];

  let lines = 0;
  // Chargeable BOQ lines — one entry per measurement (dims preserved). Rate is
  // taken from the payload or looked up from the BOQ; cumulative-per-code math
  // (RA billing) sums these lines.
  (payload.items || []).forEach(r => {
    if (!r.code || !(parseFloat(r.qty) > 0)) return;
    const boq = boqByCode[r.code] || {};
    sheet.entries.push({
      code: r.code, description: r.description || boq.description || r.code,
      uom: r.uom || boq.uom || '', rate: (r.rate != null ? r.rate : (boq.rate || 0)),
      nos: r.nos || '', l: r.l || '', b: r.b || '', h: r.h || '', qty: parseFloat(r.qty),
      remarks: `Daily ${date}`, _src: r.src || payload.src || 'daily', _date: date, _dprId: payload.dprId || ''
    });
    lines++;
  });
  // Non-BOQ / overhead lines — owner-only record, never billed (tagged Overhead).
  // Carries a resource (labour/equipment/material) and an auto-computed cost so
  // Cost & Profit can quantify the leak.
  (payload.overheads || []).forEach(o => {
    if (!o.activity && !(o.cost > 0)) return;
    const qty = parseFloat(o.qty) || 0, rate = parseFloat(o.rate) || 0;
    sheet.overheadEntries.push({
      activity: o.activity || o.resource || o.type || 'Overhead', category: o.category || o.type || 'Other',
      type: o.type || '', resourceId: o.resourceId || '', resource: o.resource || '',
      qty, uom: o.uom || '', rate, cost: (o.cost != null ? o.cost : Math.round(qty * rate * 100) / 100),
      date, _src: payload.src || 'daily', _dprId: payload.dprId || ''
    });
    lines++;
  });
  if (!lines) return null;

  sheet.updatedAt = new Date().toISOString();
  saveAllData();
  if (typeof window.renderMeasurementList === 'function') { try { window.renderMeasurementList(); } catch {} }
  _mpRefreshFinance();
  return { sheet, lines };
};

/** Remove all running-sheet entries + overhead entries recorded by a given DPR
 *  (so re-saving an edited DPR doesn't double-count). */
window.mpClearDpr = function(dprId) {
  if (!dprId) return 0;
  let removed = 0;
  (state.sheets || []).forEach(s => {
    if (Array.isArray(s.entries)) { const b = s.entries.length; s.entries = s.entries.filter(e => e._dprId !== dprId); removed += b - s.entries.length; }
    if (Array.isArray(s.overheadEntries)) { const b = s.overheadEntries.length; s.overheadEntries = s.overheadEntries.filter(e => e._dprId !== dprId); removed += b - s.overheadEntries.length; }
  });
  return removed;
};

/** Active (not-completed) planned + micro tasks for the current project. */
window.mpActivePlannedTasks = function() {
  const pid = _pid();
  return [...(state.planningTasks || []), ...(state.microTasks || [])]
    .filter(t => t.projectId === pid && t.status !== 'Completed');
};
/** BOQ items for the current project (code/description/uom/rate). For DPR pickers. */
window.mpBoqItems = function() { return _mpBoqItems(); };
/** Locations for the current project (auto-pulled). For DPR pickers. */
window.mpProjectLocations = function() { return _projectLocations().map(l => ({ id: l.id, label: siteLocationLabel(l) })); };

window._mpSaveRecordWork = function() {
  const date = document.getElementById('rwDate')?.value || new Date().toISOString().split('T')[0];
  const locId = document.getElementById('rwLocation')?.value || '';
  if (!locId) { showToast('Pick a location', 'error'); return; }
  const locLabel = siteLocationLabel(_projectLocations().find(l => l.id === locId));

  const items = [];
  document.querySelectorAll('#rwBoqBody tr').forEach(tr => {
    const code = tr.querySelector('.rw-boq')?.value;
    const qty = parseFloat(tr.querySelector('.rw-qty')?.value) || 0;
    if (code && qty > 0) {
      const o = tr.querySelector('.rw-boq').selectedOptions[0];
      const dv = sel => (tr.querySelector(sel)?.value || '').trim();
      items.push({ code, description: o?.dataset.desc, uom: o?.dataset.uom, rate: parseFloat(o?.dataset.rate) || 0, qty, nos: dv('.rw-nos'), l: dv('.rw-l'), b: dv('.rw-b'), h: dv('.rw-h') });
    }
  });
  const overheads = [];
  document.querySelectorAll('#rwOhBody tr').forEach(tr => {
    const act = (tr.querySelector('.oh-act')?.value || '').trim();
    if (act) overheads.push({ activity: act, category: tr.querySelector('.oh-cat')?.value || 'Other', qty: parseFloat(tr.querySelector('.oh-qty')?.value) || 0, uom: (tr.querySelector('.oh-uom')?.value || '').trim() });
  });
  if (!items.length && !overheads.length) { showToast('Enter at least one quantity', 'warning'); return; }

  const res = window.mpRecordWork({ date, locationId: locId, locationLabel: locLabel, items, overheads, src: 'daily' });
  if (!res) { showToast('Nothing to save', 'warning'); return; }
  document.getElementById('mpRecordWorkModal')?.remove();
  showToast(`Saved to ${res.sheet.sheetNum} · ${locLabel} — ${res.lines} line${res.lines > 1 ? 's' : ''} recorded`, 'success');
};

// ═══════════════════════════════════════════════════════════
//  PHASE 3 — RA BILLING ENGINE (running-account)
//  Cumulative measured per (location, BOQ code) − previously
//  billed = this RA. Bill one location or consolidate several.
//  Emits an raBills ledger record AND a standard abstract so it
//  flows into the existing RA-bill / tax-invoice pipeline.
// ═══════════════════════════════════════════════════════════

/** Cumulative measured qty per BOQ code for a location (summed across its sheets). */
function _cumulativeMeasured(locId) {
  const pid = _pid();
  const map = {};
  (state.sheets || []).filter(s => s.projectId === pid && s.locationId === locId).forEach(s => {
    (s.entries || []).forEach(e => {
      if (!e.code) return;
      if (!map[e.code]) map[e.code] = { code: e.code, description: e.description || e.code, uom: e.uom || '', rate: parseFloat(e.rate) || 0, qty: 0 };
      map[e.code].qty += parseFloat(e.qty) || 0;
      if (!map[e.code].rate && e.rate) map[e.code].rate = parseFloat(e.rate) || 0;
    });
  });
  return map;
}
/** Qty already billed for a (location, code) across all prior RA bills. */
function _prevBilled(locId, code) {
  let q = 0;
  (state.raBills || []).filter(b => b.projectId === _pid()).forEach(b => {
    (b.lines || []).forEach(l => { if (l.locId === locId && l.code === code) q += parseFloat(l.thisQty) || 0; });
  });
  return q;
}
/** Unbilled value sitting in a location (cumulative − billed). */
function _locationBalance(locId) {
  const meas = _cumulativeMeasured(locId);
  let measuredVal = 0, balanceVal = 0;
  Object.values(meas).forEach(m => {
    measuredVal += m.qty * m.rate;
    const bal = Math.max(0, m.qty - _prevBilled(locId, m.code));
    balanceVal += bal * m.rate;
  });
  return { measuredVal, balanceVal };
}

export function renderRABilling() {
  const c = document.getElementById('raBillingContent');
  if (!c) return;
  const proj = _currentProject();
  if (!proj) { c.innerHTML = '<p class="text-sm text-slate-500 py-8 text-center">Select a project first.</p>'; return; }
  const cur = getCurrencySymbol();
  // Only show locations that still have something to bill (unbilled balance > 0).
  // Fully-billed locations drop off the picker — no clutter, no accidental ₹0 RA.
  const locs = _projectLocations().filter(l => _locationBalance(l.id).balanceVal > 0.009);
  const raList = (state.raBills || []).filter(b => b.projectId === proj.id).sort((a, b) => (b.date || '').localeCompare(a.date || ''));

  const locCards = locs.map(l => {
    const { measuredVal, balanceVal } = _locationBalance(l.id);
    return `<label class="flex items-center gap-3 bg-white border rounded-xl px-4 py-3 cursor-pointer hover:bg-violet-50">
      <input type="checkbox" class="ra-loc-chk" value="${l.id}" style="width:16px;height:16px;">
      <div class="flex-1 min-w-0">
        <p class="font-bold text-slate-800 text-sm truncate">${_esc(siteLocationLabel(l))}</p>
        <p class="text-[11px] text-slate-400">Measured ${cur}${Math.round(measuredVal).toLocaleString('en-IN')}</p>
      </div>
      <div class="text-right"><p class="text-[10px] text-slate-400 uppercase font-bold">Unbilled</p><p class="font-extrabold ${balanceVal > 0 ? 'text-violet-700' : 'text-slate-300'}">${cur}${Math.round(balanceVal).toLocaleString('en-IN')}</p></div>
    </label>`;
  }).join('');

  const raRows = raList.map(b => {
    const abs = (state.abstracts || []).find(a => a.id === b.abstractId);
    const invoiced = abs && (abs.isInvoiced || abs.status === 'invoiced');
    return `<tr class="border-b hover:bg-slate-50">
      <td class="px-3 py-2 font-mono font-bold text-violet-700">${b.raNo}</td>
      <td class="px-3 py-2 text-slate-500">${b.date}</td>
      <td class="px-3 py-2 text-slate-600 truncate">${_esc((b.locationLabels || []).join(', '))}</td>
      <td class="px-3 py-2 text-right font-bold">${cur}${Math.round(b.total || 0).toLocaleString('en-IN')}</td>
      <td class="px-3 py-2 text-center">${invoiced
        ? `<span class="text-[10px] font-bold text-green-600" title="Billed via ${_esc(abs.linkedInvoice || abs.linkedInvoiceId || 'invoice')}">✓ Invoiced</span>`
        : `<button onclick="window._mpDeleteRA('${b.id}')" class="text-red-500 hover:bg-red-50 px-2 py-1 rounded text-[11px] font-bold" title="Delete this RA bill — its quantities return to unbilled">Delete</button>`}</td>
    </tr>`;
  }).join('');

  c.innerHTML = `
    <div class="bg-white border rounded-xl p-4 mb-4">
      <h3 class="font-bold text-sm text-slate-800 mb-1">📑 Prepare RA Bill</h3>
      <p class="text-[11px] text-slate-400 mb-3">Select one location (single RA) or several (consolidated RA). The bill auto-computes <b>cumulative measured − already billed</b> for each BOQ item.</p>
      ${locs.length ? `<div class="space-y-2 mb-3">${locCards}</div>
      <button onclick="window._mpPrepareRA()" class="bg-violet-600 text-white px-5 py-2.5 rounded-lg font-bold text-sm hover:bg-violet-700">Prepare RA Bill →</button>`
      : (raList.length
        ? '<p class="text-xs text-green-600 font-medium">✓ All measured work is billed. Record more work to raise the next RA.</p>'
        : '<p class="text-xs text-amber-600">No measured work yet. Use <b>📐 Record Work</b> on a daily sheet first.</p>')}
    </div>
    <div id="raBillDraft"></div>
    <div class="bg-white border rounded-xl overflow-hidden mt-4">
      <div class="p-3 border-b font-bold text-slate-700 text-sm">RA Bills (${raList.length})</div>
      <div class="overflow-x-auto"><table class="w-full text-xs"><thead class="bg-slate-50"><tr>
        <th class="px-3 py-2 text-left font-bold uppercase text-slate-500">RA No</th><th class="px-3 py-2 text-left font-bold uppercase text-slate-500">Date</th>
        <th class="px-3 py-2 text-left font-bold uppercase text-slate-500">Locations</th><th class="px-3 py-2 text-right font-bold uppercase text-slate-500">Amount</th>
        <th class="px-3 py-2 text-center font-bold uppercase text-slate-500">Action</th>
      </tr></thead><tbody>${raRows || '<tr><td colspan="5" class="p-5 text-center text-slate-400">No RA bills yet.</td></tr>'}</tbody></table></div>
    </div>`;
}
window.renderRABilling = renderRABilling;

/** Delete an RA bill — its quantities return to unbilled (prevBilled recomputes
 *  from raBills) and the mirrored abstract is removed. Blocked once invoiced. */
window._mpDeleteRA = function(id) {
  const b = (state.raBills || []).find(x => x.id === id);
  if (!b) return;
  const abs = (state.abstracts || []).find(a => a.id === b.abstractId);
  if (abs && (abs.isInvoiced || abs.status === 'invoiced')) {
    showToast(`Can't delete ${b.raNo} — its abstract is already invoiced. Cancel the invoice first.`, 'error');
    return;
  }
  if (!confirm(`Delete ${b.raNo} (${getCurrencySymbol()}${Math.round(b.total || 0).toLocaleString('en-IN')})?\n\nIts quantities go back to unbilled and can be billed again in a later RA.`)) return;
  window.recycleDelete && window.recycleDelete('raBills', id, 'RA Bill');
  if (b.abstractId) state.abstracts = (state.abstracts || []).filter(a => a.id !== b.abstractId);
  saveAllData();
  if (typeof window.renderAbstractsList === 'function') { try { window.renderAbstractsList(); } catch {} }
  if (typeof window.renderPartiesList === 'function') { try { window.renderPartiesList(); } catch {} }
  renderRABilling();
  _mpRefreshFinance();
  showToast(`${b.raNo} deleted — quantities returned to unbilled`, 'info');
};

/** Re-render the finance views that depend on RA bills (Cost & Profit ledger and
 *  the Owner Cockpit) so billed / WIP / margin stay in sync after any RA change. */
function _mpRefreshFinance() {
  if (typeof window.renderCostLedger === 'function') { try { window.renderCostLedger(); } catch {} }
  if (typeof window.renderCashFlow === 'function') { try { window.renderCashFlow(); } catch {} }
}

window._mpPrepareRA = function() {
  const locIds = [...document.querySelectorAll('.ra-loc-chk:checked')].map(c => c.value);
  if (!locIds.length) { showToast('Select at least one location', 'warning'); return; }
  const cur = getCurrencySymbol();
  let html = '', grand = 0, rowIdx = 0;
  locIds.forEach(locId => {
    const loc = _projectLocations().find(l => l.id === locId);
    const meas = _cumulativeMeasured(locId);
    const lines = Object.values(meas).map(m => {
      const prev = _prevBilled(locId, m.code);
      const balance = Math.max(0, m.qty - prev);
      return { ...m, prev, balance };
    }).filter(l => l.balance > 0.0001);
    if (!lines.length) return;
    const body = lines.map(l => {
      const amt = l.balance * l.rate; grand += amt;
      return `<tr class="border-b" data-loc="${locId}" data-code="${_esc(l.code)}" data-rate="${l.rate}" data-cum="${l.qty}" data-prev="${l.prev}" data-desc="${_esc(l.description)}" data-uom="${_esc(l.uom)}">
        <td class="px-2 py-1.5 font-mono font-bold text-slate-700">${_esc(l.code)}</td>
        <td class="px-2 py-1.5 text-slate-600">${_esc(l.description)}</td>
        <td class="px-2 py-1.5 text-right text-slate-500">${l.qty}</td>
        <td class="px-2 py-1.5 text-right text-slate-400">${l.prev}</td>
        <td class="px-2 py-1.5"><input type="number" min="0" max="${l.balance}" step="0.01" value="${l.balance}" class="ra-appr w-20 p-1 border rounded text-xs text-right" oninput="window._raRecalc()"></td>
        <td class="px-2 py-1.5 text-right text-slate-500">${cur}${l.rate.toLocaleString('en-IN')}</td>
        <td class="px-2 py-1.5 text-right font-bold ra-amt">${cur}${Math.round(amt).toLocaleString('en-IN')}</td>
      </tr>`;
    }).join('');
    html += `<div class="mb-3"><p class="text-xs font-extrabold text-violet-700 mb-1">📍 ${_esc(siteLocationLabel(loc))}</p>
      <div class="overflow-x-auto border rounded-lg"><table class="w-full text-xs"><thead class="bg-violet-50"><tr>
        <th class="px-2 py-1.5 text-left font-bold text-slate-500">Code</th><th class="px-2 py-1.5 text-left font-bold text-slate-500">Description</th>
        <th class="px-2 py-1.5 text-right font-bold text-slate-500">Cum. Measured</th><th class="px-2 py-1.5 text-right font-bold text-slate-500">Prev Billed</th>
        <th class="px-2 py-1.5 text-left font-bold text-slate-500">Approved (this RA)</th><th class="px-2 py-1.5 text-right font-bold text-slate-500">Rate</th>
        <th class="px-2 py-1.5 text-right font-bold text-slate-500">Amount</th></tr></thead><tbody>${body}</tbody></table></div></div>`;
    rowIdx += lines.length;
  });
  if (!rowIdx) { showToast('Nothing left to bill for the selected location(s)', 'info'); return; }
  document.getElementById('raBillDraft').innerHTML = `
    <div class="bg-white border-2 border-violet-200 rounded-xl p-4 mb-4">
      <h3 class="font-bold text-sm text-slate-800 mb-3">RA Bill draft — ${locIds.length > 1 ? 'consolidated, ' + locIds.length + ' locations' : 'single location'}</h3>
      ${html}
      <div class="flex items-center justify-between mt-3 pt-3 border-t">
        <p class="text-[11px] text-slate-400">Approved defaults to the full unbilled balance. Reduce it to certify less — the rest stays measured and bills in the next RA.</p>
        <div class="text-right"><span class="text-xs text-slate-500 mr-2">RA Total</span><span id="raGrand" class="text-xl font-extrabold text-violet-700">${cur}${Math.round(grand).toLocaleString('en-IN')}</span></div>
      </div>
      <div class="text-right mt-3"><button onclick="window._mpGenerateRA('${locIds.join(',')}')" class="bg-violet-600 text-white px-6 py-2.5 rounded-lg font-bold text-sm hover:bg-violet-700">✓ Generate RA Bill</button></div>
    </div>`;
  document.getElementById('raBillDraft').scrollIntoView({ behavior: 'smooth', block: 'start' });
};

window._raRecalc = function() {
  const cur = getCurrencySymbol(); let grand = 0;
  document.querySelectorAll('#raBillDraft tr[data-code]').forEach(tr => {
    const rate = parseFloat(tr.dataset.rate) || 0;
    const appr = parseFloat(tr.querySelector('.ra-appr')?.value) || 0;
    const amt = appr * rate; grand += amt;
    tr.querySelector('.ra-amt').textContent = cur + Math.round(amt).toLocaleString('en-IN');
  });
  const g = document.getElementById('raGrand'); if (g) g.textContent = cur + Math.round(grand).toLocaleString('en-IN');
};

window._mpGenerateRA = function(locIdsCsv) {
  const proj = _currentProject(); if (!proj) return;
  const lines = [];
  let total = 0;
  document.querySelectorAll('#raBillDraft tr[data-code]').forEach(tr => {
    const appr = parseFloat(tr.querySelector('.ra-appr')?.value) || 0;
    if (appr <= 0) return;
    const rate = parseFloat(tr.dataset.rate) || 0;
    const amount = Math.round(appr * rate * 100) / 100;
    total += amount;
    lines.push({
      locId: tr.dataset.loc, locLabel: siteLocationLabel(_projectLocations().find(l => l.id === tr.dataset.loc)),
      code: tr.dataset.code, description: tr.dataset.desc, uom: tr.dataset.uom, rate,
      cumulativeQty: parseFloat(tr.dataset.cum) || 0, prevBilledQty: parseFloat(tr.dataset.prev) || 0,
      thisQty: appr, amount
    });
  });
  if (!lines.length) { showToast('Nothing approved to bill', 'warning'); return; }
  const raSeq = (state.raBills || []).filter(b => b.projectId === proj.id).length + 1;
  const raNo = 'RA-' + raSeq;
  const date = new Date().toISOString().split('T')[0];
  const locLabels = [...new Set(lines.map(l => l.locLabel))];
  const raBill = {
    id: 'ra_' + Date.now(), raNo, projectId: proj.id, clientId: proj.clientId || '',
    date, locationIds: locIdsCsv.split(','), locationLabels: locLabels, lines,
    subtotal: Math.round(total * 100) / 100, total: Math.round(total * 100) / 100
  };
  // Mirror into a standard abstract so it appears in the Abstracts list, parties
  // ledger, and can be converted to a tax invoice via the existing pipeline.
  const abstract = {
    id: 'A_' + Date.now(), abstractNum: raNo, clientId: proj.clientId || '', projectId: proj.id,
    sheetId: null, sheetNum: raNo, date, area: locLabels.join(', '), totalAmount: raBill.total,
    items: lines.map(l => ({ code: l.code, description: l.description, uom: l.uom, qty: l.thisQty, rate: l.rate, amount: l.amount })),
    isInvoiced: false, linkedInvoice: null, _raBillId: raBill.id
  };
  if (!state.raBills) state.raBills = [];
  if (!state.abstracts) state.abstracts = [];
  state.raBills.push(raBill);
  raBill.abstractId = abstract.id;
  state.abstracts.push(abstract);
  saveAllData();
  if (typeof window.renderAbstractsList === 'function') { try { window.renderAbstractsList(); } catch {} }
  if (typeof window.renderPartiesList === 'function') { try { window.renderPartiesList(); } catch {} }
  document.getElementById('raBillDraft').innerHTML = '';
  renderRABilling();
  _mpRefreshFinance();
  showToast(`${raNo} generated · ${getCurrencySymbol()}${Math.round(raBill.total).toLocaleString('en-IN')} — also added to Abstracts`, 'success');
};

// ═══════════════════════════════════════════════════════════
//  PHASE 4 — OWNER COST & PROFIT LEDGER
//  Value of work done (measured) vs what it cost to produce:
//   • Material — recipe (mix design) × last purchase rate
//   • Labour   — attendance wages (present + OT) for the project
//   • Other    — project expenses (overhead)
//  → per-BOQ-item margin + project P&L + non-BOQ leakage.
// ═══════════════════════════════════════════════════════════

/** Most-recent purchase (IN) rate for a raw material from inventory. */
function _lastInRate(rawMatId) {
  const ins = (state.inventoryTx || []).filter(t => t.rawMaterialId === rawMatId && t.type === 'IN' && (parseFloat(t.rate) || 0) > 0);
  if (!ins.length) return 0;
  ins.sort((a, b) => new Date(b.date) - new Date(a.date));
  return parseFloat(ins[0].rate) || 0;
}
/** Resolve a recipe for a BOQ code (recipes are keyed by client.id-for-project or pid). */
function _recipeFor(code, pid) {
  pid = pid || _pid();
  const keys = [];
  const cl = (state.clients || []).find(c => c.projectId === pid);
  if (cl) keys.push(cl.id);
  keys.push(pid);
  for (const k of keys) { if (state.recipes?.[k]?.[code]?.ingredients?.length) return state.recipes[k][code]; }
  return null;
}
/** Material cost to produce ONE unit of a BOQ item, from its recipe. */
function _recipeUnitCost(code, pid) {
  const r = _recipeFor(code, pid);
  if (!r) return null; // null = no recipe defined (so we show "—" not 0)
  let cost = 0;
  (r.ingredients || []).forEach(ing => {
    const rate = _lastInRate(ing.rawMatId);
    cost += (parseFloat(ing.qty) || 0) * (1 + (parseFloat(ing.wastage) || 0) / 100) * rate;
  });
  return cost;
}
/** Measured qty + BOQ rate per code across the whole project (all locations). */
function _measuredByCode(pid) {
  pid = pid || _pid();
  const proj = (state.projects || []).find(p => p.id === pid);
  const boqRate = {};
  (proj?.boqs || []).forEach(g => (g.items || []).forEach(it => {
    const code = it.code || it.itemNo; if (code) boqRate[code] = { rate: parseFloat(it.rate) || 0, description: it.description || it.name || code, uom: it.uom || it.unit || '' };
  }));
  const map = {};
  (state.sheets || []).filter(s => s.projectId === pid).forEach(s => {
    (s.entries || []).forEach(e => {
      if (!e.code) return;
      if (!map[e.code]) map[e.code] = { code: e.code, description: boqRate[e.code]?.description || e.description || e.code, uom: boqRate[e.code]?.uom || e.uom || '', rate: boqRate[e.code]?.rate || parseFloat(e.rate) || 0, qty: 0 };
      map[e.code].qty += parseFloat(e.qty) || 0;
    });
  });
  return map;
}
/** Total attendance-accrued labour cost for a project's workers. */
function _projectLabourCost(pid) {
  pid = pid || _pid();
  const workers = (state.labourMaster || []).filter(w => !w.projectId || w.projectId === pid);
  const ids = new Set(workers.map(w => w.id));
  const rateOf = {}; workers.forEach(w => rateOf[w.id] = parseFloat(w.dayRate) || 0);
  let cost = 0;
  (state.attendanceLogs || []).forEach(a => {
    if (!ids.has(a.labourId)) return;
    if (a.siteId && a.siteId !== pid) return; // attendance marked under this project
    const dr = rateOf[a.labourId] || 0;
    if (a.status === 'P') cost += dr;
    else if (a.status === 'H') cost += dr * 0.5;
    cost += (parseFloat(a.ot) || 0) * (dr / 8) * 1.5;
  });
  return Math.round(cost);
}
/** Billed value so far (from RA bills) — to split earned into billed vs WIP. */
function _billedValue(pid) {
  pid = pid || _pid();
  return (state.raBills || []).filter(b => b.projectId === pid).reduce((s, b) => s + (parseFloat(b.total) || 0), 0);
}

/**
 * Single source of truth for project profitability. Used by both the
 * per-project Cost & Profit ledger (Micro-Planning) and the cross-project
 * Owner Cockpit (Cash Flow), so the two screens can never diverge.
 * @returns {{projectId, projectName, earned, billed, wip, material, labour,
 *   other, totalCost, profit, marginPct, noRecipe, byItem:[], leakage:{}}}
 */
export function computeProjectPnL(pid) {
  const proj = (state.projects || []).find(p => p.id === pid);
  const empty = { projectId: pid, projectName: proj?.name || '', earned: 0, billed: 0, wip: 0, material: 0, labour: 0, other: 0, totalCost: 0, profit: 0, marginPct: 0, noRecipe: 0, byItem: [], leakage: {} };
  if (!proj) return empty;
  const meas = _measuredByCode(pid);
  const codes = Object.values(meas).filter(m => m.qty > 0);
  let earned = 0, material = 0, noRecipe = 0;
  const byItem = codes.map(m => {
    const value = m.qty * m.rate; earned += value;
    const unitCost = _recipeUnitCost(m.code, pid);
    const matCost = unitCost == null ? null : unitCost * m.qty;
    if (matCost == null) noRecipe++; else material += matCost;
    const itemMargin = matCost == null ? null : value - matCost;
    const marginPct = (matCost == null || value === 0) ? null : (itemMargin / value) * 100;
    return { ...m, value, matCost, itemMargin, marginPct };
  }).sort((a, b) => b.value - a.value);
  const labour = _projectLabourCost(pid);
  const other = (state.expenses || []).filter(e => e.projectId === pid).reduce((s, e) => s + (parseFloat(e.amount) || 0), 0);
  const billed = _billedValue(pid);
  const wip = Math.max(0, earned - billed);
  // Non-BOQ overhead — sum the cost (and count) by category, plus a total. This
  // is the quantified cost leak, and it reduces profit.
  const leakage = {}; let overhead = 0;
  (state.sheets || []).filter(s => s.projectId === pid).forEach(s => (s.overheadEntries || []).forEach(o => {
    const c = parseFloat(o.cost) || 0; overhead += c;
    const cat = o.category || o.type || 'Other';
    if (!leakage[cat]) leakage[cat] = { count: 0, cost: 0 };
    leakage[cat].count++; leakage[cat].cost += c;
  }));
  overhead = Math.round(overhead);
  const totalCost = material + labour + other + overhead;
  const profit = earned - totalCost;
  const marginPct = earned > 0 ? (profit / earned) * 100 : 0;
  return { projectId: pid, projectName: proj.name, earned, billed, wip, material, labour, other, overhead, totalCost, profit, marginPct, noRecipe, byItem, leakage };
}
window.computeProjectPnL = computeProjectPnL;

// Cost & Profit filter scope (client + project). _costProject === undefined means
// "not initialised yet" → default to the current project on first render.
let _costClient = '';
let _costProject;
window._costSetClient = function(v) { _costClient = v || ''; _costProject = ''; renderCostLedger(); };
window._costSetProject = function(v) { _costProject = v || ''; renderCostLedger(); };

/** Aggregate several projects' P&L into one object shaped like computeProjectPnL,
 *  so the same render handles a single project or a whole portfolio. */
function _aggregatePnL(ids) {
  const parts = ids.map(id => computeProjectPnL(id)).filter(p => p && p.projectName);
  const sum = k => parts.reduce((s, p) => s + (p[k] || 0), 0);
  const itemMap = {};
  parts.forEach(p => (p.byItem || []).forEach(it => {
    const m = itemMap[it.code] || (itemMap[it.code] = { code: it.code, description: it.description, uom: it.uom, rate: it.rate, qty: 0, value: 0, matCost: null, itemMargin: null, marginPct: null });
    m.qty += it.qty; m.value += it.value;
    if (it.matCost != null) m.matCost = (m.matCost || 0) + it.matCost;
  }));
  Object.values(itemMap).forEach(m => { if (m.matCost != null) { m.itemMargin = m.value - m.matCost; m.marginPct = m.value ? (m.itemMargin / m.value) * 100 : null; } });
  const leakage = {};
  parts.forEach(p => Object.entries(p.leakage || {}).forEach(([cat, v]) => { if (!leakage[cat]) leakage[cat] = { count: 0, cost: 0 }; leakage[cat].count += v.count || 0; leakage[cat].cost += v.cost || 0; }));
  const earned = sum('earned'), billed = sum('billed'), material = sum('material'), labour = sum('labour'), other = sum('other'), overhead = sum('overhead');
  const totalCost = material + labour + other + overhead;
  const profit = earned - totalCost;
  return { earned, billed, wip: Math.max(0, earned - billed), material, labour, other, overhead, totalCost, profit, marginPct: earned > 0 ? (profit / earned) * 100 : 0, noRecipe: sum('noRecipe'), byItem: Object.values(itemMap).sort((a, b) => b.value - a.value), leakage, _parts: parts };
}

/** Owner "work done per labour": days worked, wages (cost) and the work-done
 *  value attributed to each worker by their man-day share of project earned. */
function _labourOutputRows(pid) {
  const workers = (state.labourMaster || []).filter(l => l.projectId === pid);
  const logs = (state.attendanceLogs || []).filter(a => a.siteId === pid);
  const earned = computeProjectPnL(pid).earned;
  const rows = workers.map(w => {
    const wl = logs.filter(a => a.labourId === w.id);
    const present = wl.filter(a => a.status === 'P').length;
    const half = wl.filter(a => a.status === 'H').length;
    const ot = wl.reduce((s, a) => s + (parseFloat(a.ot) || 0), 0);
    const manDays = present + half * 0.5;
    const rate = parseFloat(w.dayRate) || 0;
    const wages = Math.round(manDays * rate + ot * (rate / 8) * 1.5);
    return { name: w.name, trade: w.trade || '—', ot, manDays, wages };
  }).filter(r => r.manDays > 0 || r.wages > 0);
  const totalManDays = rows.reduce((s, r) => s + r.manDays, 0) || 1;
  rows.forEach(r => { r.output = Math.round(earned * (r.manDays / totalManDays)); r.ratio = r.wages > 0 ? r.output / r.wages : 0; });
  return rows.sort((a, b) => b.output - a.output);
}
function _labourOutputSection(pid) {
  const cur = getCurrencySymbol();
  const fmt = n => cur + Math.round(n).toLocaleString('en-IN');
  const rows = _labourOutputRows(pid);
  const body = rows.map(r => `<tr class="border-b hover:bg-slate-50">
    <td class="px-2 py-1.5 font-semibold text-slate-700">${_esc(r.name)}</td>
    <td class="px-2 py-1.5 text-slate-500">${_esc(r.trade)}</td>
    <td class="px-2 py-1.5 text-center">${r.manDays}${r.ot ? ` <span class="text-[10px] text-orange-500">+${r.ot}h OT</span>` : ''}</td>
    <td class="px-2 py-1.5 text-right text-slate-600">${fmt(r.wages)}</td>
    <td class="px-2 py-1.5 text-right font-bold text-teal-700">${fmt(r.output)}</td>
    <td class="px-2 py-1.5 text-right font-bold ${r.ratio >= 1 ? 'text-green-600' : 'text-red-500'}">${r.ratio ? r.ratio.toFixed(2) + '×' : '—'}</td>
  </tr>`).join('');
  return `<div class="bg-white border rounded-xl overflow-hidden mt-4">
    <div class="p-3 border-b font-bold text-slate-700 text-sm">👷 Work done per labour <span class="text-[10px] text-slate-400 font-medium">— value attributed by man-days</span></div>
    <div class="overflow-x-auto"><table class="w-full text-xs"><thead class="bg-slate-50"><tr>
      <th class="px-2 py-2 text-left font-bold uppercase text-slate-500">Labourer</th>
      <th class="px-2 py-2 text-left font-bold uppercase text-slate-500">Trade</th>
      <th class="px-2 py-2 text-center font-bold uppercase text-slate-500">Days</th>
      <th class="px-2 py-2 text-right font-bold uppercase text-slate-500">Wages</th>
      <th class="px-2 py-2 text-right font-bold uppercase text-slate-500">Work value</th>
      <th class="px-2 py-2 text-right font-bold uppercase text-slate-500">Output/₹</th></tr></thead>
      <tbody>${body || '<tr><td colspan="6" class="p-4 text-center text-slate-400">No attendance recorded yet.</td></tr>'}</tbody></table></div>
    <p class="text-[10px] text-slate-400 px-3 py-2 border-t">Work value = project earned shared across workers by man-days (present + ½ half-day). Output/₹ = value ÷ wages; above 1× means output exceeds wage cost.</p>
  </div>`;
}

export function renderCostLedger() {
  const c = document.getElementById('costLedgerContent');
  if (!c) return;
  const cur = getCurrencySymbol();
  const fmt = n => cur + Math.round(n).toLocaleString('en-IN');
  const allProjects = state.projects || [];
  if (!allProjects.length) { c.innerHTML = '<p class="text-sm text-slate-500 py-8 text-center">No projects yet.</p>'; return; }
  if (_costProject === undefined) _costProject = _pid() || ''; // default to current project

  // ── Scope resolution ──
  const scopeProjects = _costClient ? allProjects.filter(p => p.clientId === _costClient) : allProjects;
  if (_costProject && !allProjects.some(p => p.id === _costProject)) _costProject = '';
  const scopeIds = _costProject ? [_costProject] : scopeProjects.map(p => p.id);
  const single = scopeIds.length === 1;
  const pnl = single ? computeProjectPnL(scopeIds[0]) : _aggregatePnL(scopeIds);

  // ── Filter bar ──
  const clientName = (cid) => { const cl = (state.clients || []).find(c => c.id === cid); return cl ? cl.name : 'Unknown'; };
  const clientOpts = '<option value="">All clients</option>' + (state.clients || []).map(cl => `<option value="${cl.id}" ${_costClient === cl.id ? 'selected' : ''}>${_esc(cl.name)}</option>`).join('');
  const projOpts = '<option value="">All projects</option>' + scopeProjects.map(p => `<option value="${p.id}" ${_costProject === p.id ? 'selected' : ''}>${_esc(p.name)}${p.clientId ? ' — ' + _esc(clientName(p.clientId)) : ''}</option>`).join('');
  const filterBar = `<div class="flex flex-wrap items-center gap-2 mb-4 bg-white border rounded-xl p-3">
    <span class="text-[10px] font-bold text-slate-500 uppercase tracking-wide">Scope</span>
    <select onchange="window._costSetClient(this.value)" class="text-xs border rounded-lg px-2 py-1.5 bg-white font-medium">${clientOpts}</select>
    <select onchange="window._costSetProject(this.value)" class="text-xs border rounded-lg px-2 py-1.5 bg-white font-medium">${projOpts}</select>
    <span class="text-[11px] text-slate-400 ml-auto">${single ? '1 project' : scopeIds.length + ' projects (all sites)'}</span>
  </div>`;

  const rows = pnl.byItem;
  const income = pnl.earned, materialTotal = pnl.material, noRecipe = pnl.noRecipe;
  const labourCost = pnl.labour, otherExpenses = pnl.other, billed = pnl.billed, wip = pnl.wip;
  const profit = pnl.profit, marginPct = pnl.marginPct, overheadCost = pnl.overhead || 0;
  const ohByCat = pnl.leakage; // { category: { count, cost } }
  const ohTotal = Object.values(ohByCat).reduce((a, b) => a + (b.count || 0), 0);

  const itemRows = rows.map(r => `<tr class="border-b hover:bg-slate-50">
      <td class="px-2 py-1.5 font-mono font-bold text-slate-700">${_esc(r.code)}</td>
      <td class="px-2 py-1.5 text-slate-600">${_esc(r.description)}</td>
      <td class="px-2 py-1.5 text-right">${r.qty.toLocaleString('en-IN', { maximumFractionDigits: 2 })} ${_esc(r.uom)}</td>
      <td class="px-2 py-1.5 text-right text-slate-500">${fmt(r.value)}</td>
      <td class="px-2 py-1.5 text-right text-slate-500">${r.matCost == null ? '<span class="text-amber-500" title="No recipe defined">—</span>' : fmt(r.matCost)}</td>
      <td class="px-2 py-1.5 text-right font-bold ${r.itemMargin == null ? 'text-slate-300' : r.itemMargin >= 0 ? 'text-green-700' : 'text-red-600'}">${r.itemMargin == null ? '—' : fmt(r.itemMargin)}</td>
      <td class="px-2 py-1.5 text-right font-bold ${r.marginPct == null ? 'text-slate-300' : r.marginPct >= 0 ? 'text-green-600' : 'text-red-500'}">${r.marginPct == null ? '—' : r.marginPct.toFixed(0) + '%'}</td>
    </tr>`).join('');

  const card = (label, val, sub, color) => `<div class="bg-white border rounded-xl p-3 text-center">
      <p class="text-[10px] font-bold uppercase" style="color:${color}">${label}</p>
      <p class="text-lg font-extrabold text-slate-800">${val}</p>${sub ? `<p class="text-[10px] text-slate-400">${sub}</p>` : ''}</div>`;

  // Per-project breakdown (only in the multi-project / all-sites view).
  const projTable = single ? '' : `
    <div class="bg-white border rounded-xl overflow-hidden mb-4">
      <div class="p-3 border-b font-bold text-slate-700 text-sm">Per-project P&amp;L (${(pnl._parts || []).length} sites)</div>
      <div class="overflow-x-auto"><table class="w-full text-xs"><thead class="bg-slate-50"><tr>
        <th class="px-2 py-2 text-left font-bold uppercase text-slate-500">Project</th>
        <th class="px-2 py-2 text-right font-bold uppercase text-slate-500">Earned</th>
        <th class="px-2 py-2 text-right font-bold uppercase text-slate-500">Cost</th>
        <th class="px-2 py-2 text-right font-bold uppercase text-slate-500">Profit</th>
        <th class="px-2 py-2 text-right font-bold uppercase text-slate-500">%</th></tr></thead>
        <tbody>${(pnl._parts || []).slice().sort((a, b) => b.profit - a.profit).map(p => `<tr class="border-b hover:bg-slate-50">
          <td class="px-2 py-1.5 font-semibold text-slate-700">${_esc(p.projectName)}</td>
          <td class="px-2 py-1.5 text-right text-slate-500">${fmt(p.earned)}</td>
          <td class="px-2 py-1.5 text-right text-slate-500">${fmt(p.totalCost)}</td>
          <td class="px-2 py-1.5 text-right font-bold ${p.profit >= 0 ? 'text-green-700' : 'text-red-600'}">${fmt(p.profit)}</td>
          <td class="px-2 py-1.5 text-right font-bold ${p.marginPct >= 0 ? 'text-green-600' : 'text-red-500'}">${p.marginPct.toFixed(0)}%</td>
        </tr>`).join('') || '<tr><td colspan="5" class="p-5 text-center text-slate-400">No data.</td></tr>'}</tbody></table></div>
    </div>`;

  c.innerHTML = filterBar + `
    <div class="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
      ${card('Work done (earned)', fmt(income), `Billed ${fmt(billed)} · WIP ${fmt(wip)}`, '#0d9488')}
      ${card('Material cost', fmt(materialTotal), 'recipe × purchase rate', '#ea580c')}
      ${card('Labour cost', fmt(labourCost), 'attendance wages', '#7c3aed')}
      ${card(profit >= 0 ? 'Gross profit' : 'Gross loss', fmt(profit), marginPct.toFixed(1) + '% margin', profit >= 0 ? '#16a34a' : '#dc2626')}
    </div>
    ${projTable}

    <div class="bg-white border rounded-xl overflow-hidden mb-4">
      <div class="p-3 border-b font-bold text-slate-700 text-sm">Margin by BOQ item</div>
      <div class="overflow-x-auto"><table class="w-full text-xs"><thead class="bg-slate-50"><tr>
        <th class="px-2 py-2 text-left font-bold uppercase text-slate-500">Code</th><th class="px-2 py-2 text-left font-bold uppercase text-slate-500">Description</th>
        <th class="px-2 py-2 text-right font-bold uppercase text-slate-500">Done</th><th class="px-2 py-2 text-right font-bold uppercase text-slate-500">Value</th>
        <th class="px-2 py-2 text-right font-bold uppercase text-slate-500">Material</th><th class="px-2 py-2 text-right font-bold uppercase text-slate-500">Margin</th>
        <th class="px-2 py-2 text-right font-bold uppercase text-slate-500">%</th></tr></thead>
        <tbody>${itemRows || '<tr><td colspan="7" class="p-5 text-center text-slate-400">No measured work yet — record it in the DPR (Execution).</td></tr>'}</tbody></table></div>
      ${noRecipe ? `<p class="text-[11px] text-amber-600 px-3 py-2 border-t bg-amber-50">${noRecipe} item(s) have no mix-design recipe — their material cost shows "—" and isn't in the totals. Add recipes for accurate margins.</p>` : ''}
    </div>

    <div class="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <div class="bg-white border rounded-xl p-4">
        <h4 class="font-bold text-sm text-slate-800 mb-2">Project P&amp;L</h4>
        <div class="space-y-1.5 text-sm">
          <div class="flex justify-between"><span class="text-slate-500">Work done (earned)</span><span class="font-bold text-teal-700">${fmt(income)}</span></div>
          <div class="flex justify-between"><span class="text-slate-500">– Material (recipe)</span><span class="text-slate-700">${fmt(materialTotal)}</span></div>
          <div class="flex justify-between"><span class="text-slate-500">– Labour (attendance)</span><span class="text-slate-700">${fmt(labourCost)}</span></div>
          <div class="flex justify-between"><span class="text-slate-500">– Non-BOQ / overhead</span><span class="text-amber-700">${fmt(overheadCost)}</span></div>
          <div class="flex justify-between"><span class="text-slate-500">– Other expenses</span><span class="text-slate-700">${fmt(otherExpenses)}</span></div>
          <div class="flex justify-between border-t pt-1.5 mt-1.5"><span class="font-bold text-slate-700">${profit >= 0 ? 'Gross profit' : 'Gross loss'}</span><span class="font-extrabold ${profit >= 0 ? 'text-green-700' : 'text-red-600'}">${fmt(profit)} <span class="text-[11px] font-bold">(${marginPct.toFixed(1)}%)</span></span></div>
        </div>
      </div>
      <div class="bg-white border rounded-xl p-4">
        <h4 class="font-bold text-sm text-slate-800 mb-2">Non-BOQ / overhead leakage <span class="text-[10px] text-slate-400 font-medium">— cost not paid by the client</span></h4>
        ${ohTotal ? `<div class="space-y-1 text-xs">${Object.entries(ohByCat).sort((a, b) => (b[1].cost || 0) - (a[1].cost || 0)).map(([cat, v]) => `<div class="flex justify-between"><span class="text-slate-600">${_esc(cat)} <span class="text-slate-300">· ${v.count}</span></span><span class="font-bold text-amber-700">${fmt(v.cost || 0)}</span></div>`).join('')}</div>
          <div class="flex justify-between border-t pt-1.5 mt-1.5"><span class="font-bold text-slate-700">Total leak</span><span class="font-extrabold text-amber-700">${fmt(overheadCost)}</span></div>
          <p class="text-[11px] text-slate-400 mt-2">Internal cost across ${ohTotal} entr${ohTotal > 1 ? 'ies' : 'y'} — money spent that no client pays back. Watch this to protect margin.</p>`
          : '<p class="text-xs text-slate-400">No non-BOQ / overhead logged yet.</p>'}
      </div>
    </div>
    ${single ? _labourOutputSection(scopeIds[0]) : ''}
    <p class="text-[10px] text-slate-400 mt-3">Material cost = mix-design recipe × latest purchase rate of each ingredient. Labour = attendance wages (present + ½ half-day + 1.5× OT). Earned = measured value (billed + work-in-progress).</p>`;
}
window.renderCostLedger = renderCostLedger;
