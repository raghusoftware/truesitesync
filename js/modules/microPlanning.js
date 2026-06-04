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

function _fmtDate(d) { return d.toISOString().split('T')[0]; }
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
function _getUniqueTrades() {
  const all = _getProjectWorkers();
  const trades = new Set(all.map(w => (w.trade || 'General').toLowerCase()));
  trades.add('helper'); trades.add('mason'); trades.add('general');
  return [...trades].sort();
}

export function mpOpenTaskForm(editId) {
  document.getElementById('mpTaskFormModal')?.remove();
  const existing = editId ? (state.microTasks || []).concat(state.planningTasks || []).find(t => t.id === editId) : null;
  const today = new Date().toISOString().split('T')[0];
  const trades = _getUniqueTrades();
  const allTasks = _getAllTasks().filter(t => t.id !== editId);

  // Parse existing labour requirements
  const existingLabour = existing?.labourReqs || [];

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

function _labourReqRowHtml(idx, trades, selTrade, count, hrs) {
  return `<div class="flex gap-2 items-center mb-2" id="mptLR_${idx}">
    <select class="mptLR_trade border rounded px-2 py-1.5 text-xs flex-1">
      <option value="">Select Trade</option>
      ${trades.map(t => `<option value="${t}" ${t === selTrade ? 'selected' : ''}>${t.charAt(0).toUpperCase() + t.slice(1)}</option>`).join('')}
    </select>
    <input type="number" class="mptLR_count border rounded px-2 py-1.5 text-xs w-16" min="1" value="${count || 1}" placeholder="Qty" title="Number of workers">
    <input type="number" class="mptLR_hrs border rounded px-2 py-1.5 text-xs w-16" min="1" max="12" value="${hrs || 8}" placeholder="Hrs" title="Hours per day">
    <button onclick="this.parentElement.remove()" class="text-red-400 hover:text-red-600 text-sm font-bold px-1" title="Remove">&times;</button>
  </div>`;
}

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
  state.microTasks = (state.microTasks || []).filter(t => t.id !== taskId);
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
          <button onclick="_mpExportDayPDF('${dateStr}')" class="bg-white/20 hover:bg-white/30 text-white text-[10px] px-3 py-1.5 rounded font-bold">PDF</button>
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

export function mpSwitchMode(mode) {
  _mpMode = mode;
  renderMicroPlanningView();
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

    <!-- HORIZON + MODE -->
    <div class="bg-white border rounded-xl p-4 mb-5 flex flex-wrap items-end gap-4">
      <div>
        <label class="block text-[10px] font-bold text-slate-500 uppercase mb-1">Start</label>
        <input type="date" id="mpStartDate" value="${_mpHorizonStart}" class="border rounded-lg px-3 py-2 text-sm">
      </div>
      <div>
        <label class="block text-[10px] font-bold text-slate-500 uppercase mb-1">End</label>
        <input type="date" id="mpEndDate" value="${_mpHorizonEnd}" class="border rounded-lg px-3 py-2 text-sm">
      </div>
      <div class="flex gap-1 bg-slate-100 rounded-lg p-1">
        <button onclick="_mpSwitchMode('daily')" class="px-3 py-2 rounded-md text-xs font-bold transition ${_mpMode === 'daily' ? 'bg-blue-600 text-white' : 'text-slate-600 hover:bg-slate-200'}">Daily View</button>
        <button onclick="_mpSwitchMode('weekly')" class="px-3 py-2 rounded-md text-xs font-bold transition ${_mpMode === 'weekly' ? 'bg-indigo-600 text-white' : 'text-slate-600 hover:bg-slate-200'}">Weekly View</button>
      </div>
      <button onclick="_mpGenerate()" class="bg-blue-600 text-white px-6 py-2.5 rounded-lg font-bold text-sm hover:bg-blue-700 transition">Generate Plan</button>
      <button onclick="_mpToggleUtil()" class="bg-slate-200 text-slate-700 px-4 py-2.5 rounded-lg font-bold text-sm hover:bg-slate-300 transition">Heatmap</button>
    </div>

    <!-- Utilization Panel -->
    <div id="mpUtilPanel" class="hidden mb-5"></div>

    <!-- Daily/Weekly Sheets -->
    <div id="mpDailySheets">
      <div class="bg-slate-50 border rounded-xl p-8 text-center">
        <p class="text-slate-400 text-sm">Set dates and click <b>Generate Plan</b> to create ${_mpMode === 'daily' ? 'daily labor allocation sheets' : 'a weekly allocation grid'}.</p>
      </div>
    </div>`;

  // Restore previously saved plan (so it survives reload / re-open)
  const saved = state.microPlanAllocations?.[pid];
  if (saved && saved.allocations && saved.decomposed) {
    _mpDecomposed = saved.decomposed;
    _mpAllocations = saved.allocations;
    _mpMode = saved.mode || _mpMode;
    const allWorkers = _getProjectWorkers();
    const sheets = document.getElementById('mpDailySheets');
    const workDays = Object.keys(_mpDecomposed).filter(d => (_mpDecomposed[d] || []).length).sort();
    if (sheets && workDays.length) {
      if (_mpMode === 'weekly') {
        sheets.innerHTML = `<div class="bg-blue-50 border border-blue-200 rounded-lg p-2 mb-3 text-[11px] text-blue-700 font-medium">📋 Saved plan from ${new Date(saved.generated).toLocaleString('en-IN')}</div>` + _renderWeeklyView(_mpDecomposed, _mpAllocations, allWorkers, saved.horizon.start, saved.horizon.end);
      } else {
        let h = `<div class="bg-blue-50 border border-blue-200 rounded-lg p-2 mb-3 text-[11px] text-blue-700 font-medium">📋 Saved plan from ${new Date(saved.generated).toLocaleString('en-IN')} — regenerate to refresh</div>`;
        workDays.forEach(day => {
          const chunks = _mpDecomposed[day];
          const conflicts = detectConflicts(chunks, _mpAllocations[day], allWorkers.filter(w => _isWorkerAvailable(w, day)));
          h += generateDailySheet(day, _mpAllocations[day], conflicts, chunks, allWorkers);
        });
        sheets.innerHTML = h;
      }
    }
  }
}

// ─────────────────────────────────────────────────────
//  GENERATE PLAN (Daily or Weekly)
// ─────────────────────────────────────────────────────
export function mpGenerate() {
  _mpHorizonStart = document.getElementById('mpStartDate')?.value || _mpHorizonStart;
  _mpHorizonEnd = document.getElementById('mpEndDate')?.value || _mpHorizonEnd;

  const tasks = _getAllTasks();
  const allWorkers = _getProjectWorkers();

  if (!tasks.length) { showToast('No tasks found. Add a task first.', 'error'); return; }
  if (!allWorkers.length) { showToast('No workers found. Add labour in Labour module.', 'error'); return; }

  _mpDecomposed = decomposeTasksToDaily(tasks, _mpHorizonStart, _mpHorizonEnd);
  _mpAllocations = {};

  const sheetsContainer = document.getElementById('mpDailySheets');
  if (!sheetsContainer) return;

  const workDays = Object.keys(_mpDecomposed).filter(d => _mpDecomposed[d].length > 0).sort();
  if (!workDays.length) {
    sheetsContainer.innerHTML = '<div class="bg-yellow-50 border border-yellow-200 rounded-xl p-6 text-center"><p class="text-yellow-700 text-sm font-medium">No tasks in this date range. Adjust dates or add tasks.</p></div>';
    return;
  }

  // Run allocation for each day
  workDays.forEach(day => {
    const chunks = _mpDecomposed[day];
    const availWorkers = allWorkers.filter(w => _isWorkerAvailable(w, day));
    _mpAllocations[day] = allocateLabor(chunks, availWorkers, day);
  });

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

  state.microPlanAllocations[_pid()] = {
    generated: new Date().toISOString(),
    horizon: { start: _mpHorizonStart, end: _mpHorizonEnd },
    days: workDays.length,
    mode: _mpMode,
    decomposed: _mpDecomposed,
    allocations: _mpAllocations
  };
  saveAllData();
  showToast(`Plan generated & saved — ${workDays.length} day${workDays.length > 1 ? 's' : ''} (${_mpMode} view)`, 'success');
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

export function mpPrintDay(dateStr) {
  const el = document.getElementById(`dailySheet_${dateStr}`);
  if (!el) return;
  const w = window.open('', '_blank');
  w.document.write(`<html><head><title>Daily Plan ${dateStr}</title><link href="https://cdn.jsdelivr.net/npm/tailwindcss@2/dist/tailwind.min.css" rel="stylesheet"><style>@media print{.no-print{display:none}}</style></head><body class="p-4">${el.outerHTML}</body></html>`);
  w.document.close();
  setTimeout(() => { w.print(); }, 500);
}
