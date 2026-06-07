/**
 * ═══════════════════════════════════════════════════════════
 * True Site Sync — Planning & Scheduling Module
 * ═══════════════════════════════════════════════════════════
 * Task management with material requisitions, equipment
 * linking, pre-flight resource checks, and conflict detection.
 * ═══════════════════════════════════════════════════════════
 */

import { state, saveAllData } from './state.js';
import { showToast, formatINR, mobileSavePDF } from './utils.js';
const _planHeader = (doc, o) => (typeof window !== 'undefined' && window.getSimpleHeaderForPDF) ? window.getSimpleHeaderForPDF(doc, o) : 14;

// ── Status constants ──
const TASK_STATUSES = ['Not Started', 'Ready to Start', 'In Progress', 'On Hold', 'Completed', 'Cancelled'];

function _truncatePdf(doc, str, maxW) {
  str = String(str || '');
  if (doc.getTextWidth(str) <= maxW) return str;
  let s = str;
  while (s.length > 1 && doc.getTextWidth(s + '…') > maxW) s = s.slice(0, -1);
  return s + '…';
}

/**
 * Professional Planning & Schedule PDF: company header, project summary, a
 * Gantt timeline (status-coloured bars + progress + dependency links) and full
 * schedule + material / equipment / labour requirement tables.
 */
export function exportPlanningPDF() {
  try {
    const pid = state.currentProjectId;
    if (!pid) return showToast('Open a project first', 'error');
    if (!window.jspdf || !window.jspdf.jsPDF) return showToast('PDF library not loaded — refresh the page', 'error');
    const proj = (state.projects || []).find(p => p.id === pid) || {};
    const tasks = (state.planningTasks || []).filter(t => t.projectId === pid);
    if (!tasks.length) return showToast('No tasks to export', 'error');

    const matName = m => m.materialName || (state.rawMaterials || []).find(r => r.id === m.materialId)?.name || m.materialId || '—';
    const matUnit = m => (state.rawMaterials || []).find(r => r.id === m.materialId)?.unit || '';
    const eqName = e => e.equipmentName || (state.equipmentList || []).find(x => x.id === e.equipmentId)?.name || e.equipmentId || '—';
    const taskName = id => tasks.find(t => t.id === id)?.name || '';
    const fmtD = d => d || '—';
    const DAY = 86400000;
    const dur = (a, b) => { if (!a || !b) return ''; const d = Math.round((new Date(b) - new Date(a)) / DAY) + 1; return isNaN(d) ? '' : String(d); };
    const STC = { 'Not Started': [148, 163, 184], 'Ready to Start': [16, 185, 129], 'In Progress': [59, 130, 246], 'On Hold': [245, 158, 11], 'Completed': [99, 102, 241], 'Cancelled': [239, 68, 68] };
    const stColor = s => STC[s] || [148, 163, 184];

    const doc = new window.jspdf.jsPDF('l', 'mm', 'a4');
    const pw = doc.internal.pageSize.getWidth();
    const ph = doc.internal.pageSize.getHeight();
    const ml = 10, mr = 10;

    let y = _planHeader(doc, { ml, mr });
    doc.setFillColor(30, 58, 138); doc.rect(ml, y, pw - ml - mr, 8, 'F');
    doc.setTextColor(255, 255, 255); doc.setFont('helvetica', 'bold'); doc.setFontSize(12);
    doc.text('PROJECT PLANNING & SCHEDULE', pw / 2, y + 5.6, { align: 'center' });
    y += 12; doc.setTextColor(0, 0, 0);

    const wo = (proj.boqs || []).map(g => g.woNumber).filter(Boolean).join(', ') || proj.woNumber || '';
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9);
    doc.text(`Project: ${proj.name || '—'}${wo ? '   |   WO: ' + wo : ''}   |   Tasks: ${tasks.length}   |   Generated: ${new Date().toLocaleDateString('en-IN')}`, ml, y);
    y += 4;
    doc.setFontSize(8); doc.setTextColor(90);
    doc.text(TASK_STATUSES.map(s => `${s}: ${tasks.filter(t => t.status === s).length}`).join('   ·   '), ml, y);
    y += 6; doc.setTextColor(0);

    // ── Gantt timeline ──
    const dated = tasks.filter(t => t.startDate && t.endDate && !isNaN(new Date(t.startDate)) && !isNaN(new Date(t.endDate)));
    if (dated.length) {
      const minT = Math.min(...dated.map(t => +new Date(t.startDate)));
      const maxT = Math.max(...dated.map(t => +new Date(t.endDate)));
      const dayCount = Math.max(1, Math.round((maxT - minT) / DAY) + 1);
      const labelW = 68, gx = ml + labelW, gw = pw - mr - gx, pxPerDay = gw / dayCount, rowH = 6;
      let gy;
      const header = topY => {
        doc.setFontSize(11); doc.setFont('helvetica', 'bold'); doc.setTextColor(30, 58, 138);
        doc.text('Schedule Timeline (Gantt)', ml, topY);
        const hy = topY + 4;
        doc.setFontSize(6); doc.setFont('helvetica', 'normal'); doc.setTextColor(120);
        for (let d = 0; d <= dayCount; d += 7) {
          const x = gx + d * pxPerDay;
          doc.text(new Date(minT + d * DAY).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }), x, hy, { align: 'left' });
        }
        doc.setTextColor(0);
        return hy + 3;
      };
      gy = header(y);
      const gridTop = gy;
      const rowMap = {};
      const ordered = [...dated].sort((a, b) => new Date(a.startDate) - new Date(b.startDate));
      ordered.forEach(t => {
        if (gy + rowH > ph - 14) { doc.addPage('a4', 'l'); y = 14; gy = header(y); }
        const sx = gx + Math.round((new Date(t.startDate) - minT) / DAY) * pxPerDay;
        const ex = gx + (Math.round((new Date(t.endDate) - minT) / DAY) + 1) * pxPerDay;
        const barW = Math.max(1.5, ex - sx);
        doc.setFontSize(7); doc.setFont('helvetica', 'normal'); doc.setTextColor(30);
        doc.text(_truncatePdf(doc, t.name, labelW - 3), ml, gy + rowH - 2);
        doc.setDrawColor(241, 245, 249); doc.setLineWidth(0.1); doc.line(gx, gy + rowH, gx + gw, gy + rowH);
        const col = stColor(t.status), tint = col.map(c => Math.round(c + (255 - c) * 0.55));
        doc.setFillColor(tint[0], tint[1], tint[2]);
        doc.roundedRect(sx, gy + 1, barW, rowH - 2.5, 0.8, 0.8, 'F');
        const prog = t.status === 'Completed' ? 100 : (parseFloat(t.progress) || 0);
        if (prog > 0) { doc.setFillColor(col[0], col[1], col[2]); doc.roundedRect(sx, gy + 1, Math.max(1, barW * prog / 100), rowH - 2.5, 0.8, 0.8, 'F'); }
        rowMap[t.id] = { y: gy + rowH / 2, x1: sx, x2: ex };
        gy += rowH;
      });
      doc.setDrawColor(148, 163, 184); doc.setLineWidth(0.2);
      ordered.forEach(t => {
        const a = rowMap[t.dependsOn], b = rowMap[t.id];
        if (t.dependsOn && a && b) { doc.line(a.x2, a.y, b.x1, b.y); }
      });
      // legend
      gy += 3; let lx = ml;
      doc.setFontSize(6.5); doc.setFont('helvetica', 'normal');
      TASK_STATUSES.forEach(s => { const c = stColor(s); doc.setFillColor(c[0], c[1], c[2]); doc.roundedRect(lx, gy - 2.5, 3, 3, 0.5, 0.5, 'F'); doc.setTextColor(60); doc.text(s, lx + 4, gy, { align: 'left' }); lx += 4 + doc.getTextWidth(s) + 6; });
      doc.setTextColor(0);
      y = gy + 4;
    }

    // ── Detail tables (fresh page) ──
    const section = (title, head, body, colStyles) => {
      if (!body.length) return;
      if (y > ph - 34) { doc.addPage('a4', 'l'); y = 14; }
      doc.setFontSize(11); doc.setFont('helvetica', 'bold'); doc.setTextColor(30, 58, 138);
      doc.text(title, ml, y);
      doc.autoTable({
        startY: y + 2, head: [head], body, theme: 'grid',
        headStyles: { fillColor: [30, 58, 138], textColor: 255, fontSize: 7.5, halign: 'center', fontStyle: 'bold' },
        styles: { fontSize: 7, cellPadding: 1.5, overflow: 'linebreak' },
        columnStyles: colStyles || {}, margin: { left: ml, right: mr },
      });
      y = doc.lastAutoTable.finalY + 8; doc.setTextColor(0);
    };

    doc.addPage('a4', 'l'); y = 14;
    section('Task Schedule', ['Sr', 'Task', 'Area', 'Priority', 'Status', 'Prog', 'Start', 'End', 'Days', 'Assigned To', 'Depends On'],
      tasks.map((t, i) => [i + 1, t.name || '', t.area || '', t.priority || '', t.status || '', (t.status === 'Completed' ? 100 : (parseFloat(t.progress) || 0)) + '%', fmtD(t.startDate), fmtD(t.endDate), dur(t.startDate, t.endDate), t.assignedTo || '', taskName(t.dependsOn)]),
      { 0: { cellWidth: 8, halign: 'center' }, 1: { cellWidth: 'auto' }, 5: { halign: 'center' }, 8: { halign: 'center' } });

    const matRows = [];
    tasks.forEach(t => (state.taskMaterials || []).filter(m => m.taskId === t.id).forEach(m => matRows.push([t.name, matName(m), m.qtyRequired ?? '', matUnit(m), m.fromRecipe ? 'Mix Design' : 'Manual'])));
    section('Material Requirements', ['Task', 'Material', 'Qty', 'Unit', 'Source'], matRows, { 2: { halign: 'right' } });

    const eqRows = [];
    tasks.forEach(t => (state.taskEquipment || []).filter(e => e.taskId === t.id).forEach(e => eqRows.push([t.name, eqName(e), fmtD(t.startDate), fmtD(t.endDate)])));
    section('Equipment Schedule', ['Task', 'Equipment', 'From', 'To'], eqRows);

    const labRows = [];
    tasks.forEach(t => (t.labourReq || []).forEach(l => labRows.push([t.name, l.trade, String(l.count)])));
    section('Labour Requirements', ['Task', 'Trade', 'No.'], labRows, { 2: { halign: 'center' } });

    mobileSavePDF(doc, `Planning_${(proj.name || 'Project').replace(/[\\/]/g, '-')}.pdf`);
    showToast('Planning PDF downloaded');
  } catch (err) {
    console.error('Planning PDF failed:', err);
    showToast('PDF error: ' + (err && err.message ? err.message : err), 'error');
  }
}
if (typeof window !== 'undefined') window.exportPlanningPDF = exportPlanningPDF;

const TASK_PRIORITIES = ['Low', 'Medium', 'High', 'Critical'];
const MATERIAL_STATUSES = ['Required', 'Ordered', 'Available', 'Insufficient'];

// ═══════════════════════════════════════════════
//  RENDER — Main Planning View
// ═══════════════════════════════════════════════

export function renderPlanningView() {
  const container = document.getElementById('planningViewContent');
  if (!container) return;
  const pid = state.currentProjectId || state.projects?.[0]?.id;
  const tasks = (state.planningTasks || []).filter(t => t.projectId === pid);

  // KPIs
  const total = tasks.length;
  const notStarted = tasks.filter(t => t.status === 'Not Started').length;
  const inProgress = tasks.filter(t => t.status === 'In Progress' || t.status === 'Ready to Start').length;
  const completed = tasks.filter(t => t.status === 'Completed').length;
  const conflicts = _getAllConflicts(pid).length;
  const shortages = _getUpcomingShortages(pid, 3).length;

  container.innerHTML = `
    <!-- KPI Row -->
    <div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 mb-6">
      <div class="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
        <p class="text-[10px] font-bold uppercase text-slate-400 tracking-wider">Total Tasks</p>
        <p class="text-2xl font-extrabold text-slate-800">${total}</p>
      </div>
      <div class="bg-white p-4 rounded-xl border border-l-4 border-l-slate-400 shadow-sm">
        <p class="text-[10px] font-bold uppercase text-slate-400 tracking-wider">Not Started</p>
        <p class="text-2xl font-extrabold text-slate-600">${notStarted}</p>
      </div>
      <div class="bg-white p-4 rounded-xl border border-l-4 border-l-blue-500 shadow-sm">
        <p class="text-[10px] font-bold uppercase text-slate-400 tracking-wider">In Progress</p>
        <p class="text-2xl font-extrabold text-blue-600">${inProgress}</p>
      </div>
      <div class="bg-white p-4 rounded-xl border border-l-4 border-l-green-500 shadow-sm">
        <p class="text-[10px] font-bold uppercase text-slate-400 tracking-wider">Completed</p>
        <p class="text-2xl font-extrabold text-green-600">${completed}</p>
      </div>
      <div class="bg-white p-4 rounded-xl border border-l-4 shadow-sm ${conflicts ? 'border-l-red-500' : 'border-l-slate-200'}">
        <p class="text-[10px] font-bold uppercase text-slate-400 tracking-wider">Conflicts</p>
        <p class="text-2xl font-extrabold ${conflicts ? 'text-red-600' : 'text-slate-400'}">${conflicts}</p>
      </div>
      <div class="bg-white p-4 rounded-xl border border-l-4 shadow-sm ${shortages ? 'border-l-amber-500' : 'border-l-slate-200'}">
        <p class="text-[10px] font-bold uppercase text-slate-400 tracking-wider">Shortages (3d)</p>
        <p class="text-2xl font-extrabold ${shortages ? 'text-amber-600' : 'text-slate-400'}">${shortages}</p>
      </div>
    </div>

    <!-- Shortage Alerts Widget -->
    ${_renderShortageWidget(pid)}

    <!-- Toolbar -->
    <div class="flex flex-wrap items-center justify-between gap-3 mb-4">
      <div class="flex items-center gap-2 flex-wrap">
        <select id="planFilterArea" class="p-2 text-xs border border-slate-300 rounded-lg bg-white font-medium" onchange="window._planRefreshList()">
          <option value="">All Areas</option>
          ${_getExistingAreas(pid).map(a => `<option value="${a}">${a}</option>`).join('')}
        </select>
        <select id="planFilterStatus" class="p-2 text-xs border border-slate-300 rounded-lg bg-white font-medium" onchange="window._planRefreshList()">
          <option value="">All Statuses</option>
          ${TASK_STATUSES.map(s => `<option value="${s}">${s}</option>`).join('')}
        </select>
        <select id="planFilterPriority" class="p-2 text-xs border border-slate-300 rounded-lg bg-white font-medium" onchange="window._planRefreshList()">
          <option value="">All Priorities</option>
          ${TASK_PRIORITIES.map(p => `<option value="${p}">${p}</option>`).join('')}
        </select>
        <input type="text" id="planSearchInput" placeholder="Search tasks..." class="p-2 text-xs border border-slate-300 rounded-lg bg-white w-48" oninput="window._planRefreshList()">
      </div>
      <div class="flex items-center gap-2">
        <button onclick="window.exportPlanningPDF&&window.exportPlanningPDF()" class="bg-slate-700 text-white text-xs font-bold px-4 py-2 rounded-lg hover:bg-slate-800 shadow-sm transition inline-flex items-center gap-1.5">&#128196; Export PDF</button>
        <button onclick="window._planOpenTaskForm()" class="bg-blue-600 text-white text-xs font-bold px-4 py-2 rounded-lg hover:bg-blue-700 shadow-sm transition">+ Add Task</button>
      </div>
    </div>

    <!-- Task List -->
    <div class="space-y-2" id="planningTaskList">
      ${_renderTaskList(tasks)}
    </div>
  `;
}

function _renderShortageWidget(pid) {
  const shortages = _getUpcomingShortages(pid, 3);
  const conflicts = _getAllConflicts(pid);
  if (!shortages.length && !conflicts.length) return '';

  let html = '<div class="bg-white rounded-xl border border-amber-200 shadow-sm mb-6 overflow-hidden">';
  html += '<div class="px-4 py-3 bg-amber-50 border-b border-amber-200 flex items-center gap-2"><span class="text-base">&#9888;&#65039;</span><h4 class="text-xs font-bold text-amber-800 uppercase tracking-wider">Resource Alerts — Next 3 Days</h4></div>';
  html += '<div class="p-4 grid grid-cols-1 md:grid-cols-2 gap-3">';

  shortages.forEach(s => {
    html += `<div class="flex items-start gap-3 p-3 rounded-lg bg-amber-50 border border-amber-100">
      <span class="text-lg mt-0.5">&#128230;</span>
      <div>
        <p class="text-xs font-bold text-slate-700">${s.materialName}</p>
        <p class="text-[10px] text-slate-500">Task: ${s.taskName} &middot; Need: ${s.requiredQty} ${s.unit} &middot; Available: <span class="font-bold text-red-600">${s.availableQty}</span></p>
        <p class="text-[10px] text-amber-700 font-bold">Shortage: ${s.requiredQty - s.availableQty} ${s.unit}</p>
      </div>
    </div>`;
  });

  conflicts.forEach(c => {
    html += `<div class="flex items-start gap-3 p-3 rounded-lg bg-red-50 border border-red-100">
      <span class="text-lg mt-0.5">&#128295;</span>
      <div>
        <p class="text-xs font-bold text-slate-700">${c.equipmentName}</p>
        <p class="text-[10px] text-slate-500">Conflict on ${c.date}: assigned to both "${c.task1}" and "${c.task2}"</p>
        <p class="text-[10px] text-red-700 font-bold">Resource Conflict</p>
      </div>
    </div>`;
  });

  html += '</div></div>';
  return html;
}

export function refreshTaskList() {
  const pid = state.currentProjectId || state.projects?.[0]?.id;
  const tasks = (state.planningTasks || []).filter(t => t.projectId === pid);
  const el = document.getElementById('planningTaskList');
  if (el) el.innerHTML = _renderTaskList(tasks);
}

function _renderTaskList(tasks) {
  const areaFilter = document.getElementById('planFilterArea')?.value || '';
  const statusFilter = document.getElementById('planFilterStatus')?.value || '';
  const priorityFilter = document.getElementById('planFilterPriority')?.value || '';
  const search = (document.getElementById('planSearchInput')?.value || '').toLowerCase();

  let filtered = tasks;
  if (areaFilter) filtered = filtered.filter(t => t.area === areaFilter);
  if (statusFilter) filtered = filtered.filter(t => t.status === statusFilter);
  if (priorityFilter) filtered = filtered.filter(t => t.priority === priorityFilter);
  if (search) filtered = filtered.filter(t => (t.name || '').toLowerCase().includes(search) || (t.description || '').toLowerCase().includes(search) || (t.area || '').toLowerCase().includes(search));

  if (!filtered.length) {
    return `<div class="text-center py-12 text-slate-400">
      <p class="text-4xl mb-3">&#128197;</p>
      <p class="font-bold">No tasks yet</p>
      <p class="text-xs mt-1">Create your first task to start planning</p>
    </div>`;
  }

  // Sort within groups: Critical/High first, then by start date
  const prioOrder = { Critical: 0, High: 1, Medium: 2, Low: 3 };
  filtered.sort((a, b) => (prioOrder[a.priority] ?? 3) - (prioOrder[b.priority] ?? 3) || (a.startDate || '').localeCompare(b.startDate || ''));

  // Group by area
  const groups = {};
  filtered.forEach(t => {
    const area = t.area || 'Unassigned';
    if (!groups[area]) groups[area] = [];
    groups[area].push(t);
  });

  const areaNames = Object.keys(groups).sort((a, b) => a === 'Unassigned' ? 1 : b === 'Unassigned' ? -1 : a.localeCompare(b));

  return areaNames.map(area => {
    const areaTasks = groups[area];
    const areaCompleted = areaTasks.filter(t => t.status === 'Completed').length;
    const areaTotal = areaTasks.length;
    const areaProgress = areaTotal ? Math.round((areaCompleted / areaTotal) * 100) : 0;

    return `<div class="mb-4">
      <div class="flex items-center gap-3 mb-2 cursor-pointer select-none group" onclick="this.nextElementSibling.classList.toggle('hidden');this.querySelector('.area-chevron').classList.toggle('rotate-90')">
        <span class="area-chevron text-slate-400 text-[10px] transition-transform rotate-90">&#9654;</span>
        <div class="flex items-center gap-2 flex-1 min-w-0">
          <span class="text-sm">&#128205;</span>
          <h3 class="text-sm font-extrabold text-slate-700 truncate">${area}</h3>
          <span class="text-[10px] text-slate-400 font-medium">${areaTotal} task${areaTotal !== 1 ? 's' : ''}</span>
          <div class="flex-1 max-w-[120px] h-1.5 bg-slate-100 rounded-full overflow-hidden">
            <div class="h-full bg-blue-500 rounded-full transition-all" style="width:${areaProgress}%"></div>
          </div>
          <span class="text-[10px] font-bold ${areaCompleted === areaTotal && areaTotal > 0 ? 'text-green-600' : 'text-slate-400'}">${areaProgress}%</span>
        </div>
      </div>
      <div class="space-y-2 pl-5 border-l-2 border-slate-200 ml-1.5">
        ${areaTasks.map(t => _renderTaskCard(t)).join('')}
      </div>
    </div>`;
  }).join('');
}

function _renderTaskCard(t) {
  const matCount = (state.taskMaterials || []).filter(m => m.taskId === t.id).length;
  const eqCount = (state.taskEquipment || []).filter(e => e.taskId === t.id).length;
  const preflight = checkResourceAvailability(t.id);
  const prioColors = { Critical: '#ef4444', High: '#f97316', Medium: '#3b82f6', Low: '#94a3b8' };
  const statusColors = { 'Not Started': '#94a3b8', 'Ready to Start': '#10b981', 'In Progress': '#3b82f6', 'On Hold': '#f59e0b', 'Completed': '#6366f1', 'Cancelled': '#ef4444' };
  const pc = prioColors[t.priority] || '#94a3b8';
  const sc = statusColors[t.status] || '#94a3b8';
  const progress = t.status === 'Completed' ? 100 : t.status === 'In Progress' ? (parseFloat(t.progress) || 50) : t.status === 'Ready to Start' ? 5 : 0;

  return `<div class="bg-white rounded-xl border border-slate-200 shadow-sm hover:shadow-md transition overflow-hidden">
    <div class="flex items-stretch">
      <div style="width:4px;background:${pc};flex-shrink:0;"></div>
      <div class="flex-1 p-4">
        <div class="flex items-start justify-between gap-3 mb-2">
          <div class="flex-1 min-w-0">
            <div class="flex items-center gap-2 mb-1">
              <h4 class="text-sm font-bold text-slate-800 truncate">${t.name}</h4>
              <span class="text-[9px] font-bold px-1.5 py-0.5 rounded-full flex-shrink-0" style="background:${sc}15;color:${sc};border:1px solid ${sc}30;">${t.status}</span>
              ${t.priority === 'Critical' || t.priority === 'High' ? `<span class="text-[9px] font-bold px-1.5 py-0.5 rounded-full flex-shrink-0" style="background:${pc}15;color:${pc};">&#9650; ${t.priority}</span>` : ''}
              ${(() => { const n = (typeof window !== 'undefined' && window.getOpenIssueCountForTask) ? window.getOpenIssueCountForTask(t.id) : 0; return n ? `<span onclick="event.stopPropagation();window.switchView&&window.switchView('issuesView')" title="${n} open issue${n > 1 ? 's' : ''} on this task" class="text-[9px] font-bold px-1.5 py-0.5 rounded-full flex-shrink-0 cursor-pointer" style="background:#ef444415;color:#ef4444;border:1px solid #ef444430;">&#128681; ${n} issue${n > 1 ? 's' : ''}</span>` : ''; })()}
            </div>
            ${t.description ? `<p class="text-[11px] text-slate-400 truncate">${t.description}</p>` : ''}
          </div>
          <div class="flex items-center gap-1 flex-shrink-0">
            <button onclick="window._planOpenTaskDetail('${t.id}')" class="text-[10px] text-blue-500 hover:bg-blue-50 px-2 py-1 rounded font-bold transition" title="View Details">Details</button>
            <button onclick="window._planOpenTaskForm('${t.id}')" class="text-[10px] text-slate-400 hover:bg-slate-50 px-2 py-1 rounded font-bold transition" title="Edit">&#9998;</button>
            <button onclick="window._planDeleteTask('${t.id}')" class="text-[10px] text-red-400 hover:bg-red-50 px-2 py-1 rounded font-bold transition" title="Delete">&#128465;</button>
          </div>
        </div>
        <div class="flex flex-wrap items-center gap-3 text-[10px] text-slate-400 mb-2">
          ${t.startDate ? `<span>&#128197; ${t.startDate}${t.endDate ? ' → ' + t.endDate : ''}</span>` : ''}
          ${t.assignedTo ? `<span>&#128100; ${t.assignedTo}</span>` : ''}
          <span class="font-bold ${matCount ? 'text-green-600' : 'text-slate-300'}">&#128230; ${matCount} materials</span>
          <span class="font-bold ${eqCount ? 'text-purple-600' : 'text-slate-300'}">&#128295; ${eqCount} equipment</span>
          ${!preflight.ready && t.status !== 'Completed' && t.status !== 'Cancelled' ? '<span class="text-red-500 font-bold">&#9888; Resource issues</span>' : ''}
        </div>
        <div class="h-1.5 bg-slate-100 rounded-full overflow-hidden">
          <div class="h-full rounded-full transition-all" style="width:${progress}%;background:${sc};"></div>
        </div>
      </div>
    </div>
  </div>`;
}


// ═══════════════════════════════════════════════
//  TASK CRUD
// ═══════════════════════════════════════════════

export function openTaskForm(taskId) {
  const existing = taskId ? (state.planningTasks || []).find(t => t.id === taskId) : null;
  const pid = state.currentProjectId || state.projects?.[0]?.id;
  const today = new Date().toISOString().split('T')[0];

  // Remove existing modal
  document.getElementById('planTaskFormModal')?.remove();

  const html = `
    <div id="planTaskFormModal" class="ef-overlay" onclick="if(event.target===this)window._planCloseForm()">
      <div class="ef-modal" style="max-width:560px;">
        <div class="ef-header">
          <h3 class="ef-title">${existing ? 'Edit Task' : 'Create New Task'}</h3>
          <button onclick="window._planCloseForm()" class="ef-close">&times;</button>
        </div>
        <div class="ef-body">
          <div class="ef-grid">
            <div class="ef-field ef-field-full">
              <label class="ef-label">Task Name *</label>
              <input type="text" id="pt_name" class="ef-input" value="${existing?.name || ''}" placeholder="e.g. Column Casting Block-A" required>
            </div>
            <div class="ef-field ef-field-full">
              <label class="ef-label">Area / Location *</label>
              <input type="text" id="pt_area" class="ef-input" list="pt_area_list" value="${existing?.area || ''}" placeholder="e.g. Office Building, Block A, Site Infrastructure">
              <datalist id="pt_area_list">
                ${_getExistingAreas(pid).map(a => `<option value="${a}">`).join('')}
              </datalist>
            </div>
            <div class="ef-field ef-field-full">
              <label class="ef-label">Description</label>
              <textarea id="pt_desc" class="ef-input ef-textarea" rows="2" placeholder="Scope of work...">${existing?.description || ''}</textarea>
            </div>
            <div class="ef-field">
              <label class="ef-label">Start Date *</label>
              <input type="date" id="pt_start" class="ef-input" value="${existing?.startDate || today}" required>
            </div>
            <div class="ef-field">
              <label class="ef-label">End Date</label>
              <input type="date" id="pt_end" class="ef-input" value="${existing?.endDate || ''}">
            </div>
            <div class="ef-field">
              <label class="ef-label">Priority</label>
              <select id="pt_priority" class="ef-input">
                ${TASK_PRIORITIES.map(p => `<option value="${p}" ${(existing?.priority || 'Medium') === p ? 'selected' : ''}>${p}</option>`).join('')}
              </select>
            </div>
            <div class="ef-field">
              <label class="ef-label">Status</label>
              <select id="pt_status" class="ef-input">
                ${TASK_STATUSES.map(s => `<option value="${s}" ${(existing?.status || 'Not Started') === s ? 'selected' : ''}>${s}</option>`).join('')}
              </select>
            </div>
            <div class="ef-field">
              <label class="ef-label">Assigned To</label>
              <input type="text" id="pt_assigned" class="ef-input" value="${existing?.assignedTo || ''}" placeholder="Engineer / Supervisor">
            </div>
            <div class="ef-field">
              <label class="ef-label">Progress %</label>
              <input type="number" id="pt_progress" class="ef-input" value="${existing?.progress || 0}" min="0" max="100">
            </div>
            <div class="ef-field">
              <label class="ef-label">BOQ Link</label>
              <select id="pt_boqItem" class="ef-input">
                <option value="">-- None --</option>
                ${_getBoqOptions(pid, existing?.boqItemId)}
              </select>
            </div>
            <div class="ef-field">
              <label class="ef-label">Dependencies</label>
              <select id="pt_dependency" class="ef-input">
                <option value="">-- None --</option>
                ${(state.planningTasks || []).filter(t => t.projectId === pid && t.id !== taskId).map(t => `<option value="${t.id}" ${existing?.dependsOn === t.id ? 'selected' : ''}>${t.name}</option>`).join('')}
              </select>
            </div>
            <div class="ef-field ef-field-full">
              <label class="ef-label">Remarks</label>
              <input type="text" id="pt_remarks" class="ef-input" value="${existing?.remarks || ''}" placeholder="Any notes...">
            </div>
          </div>

          <!-- ── Resource Requirements ── -->
          <div style="margin-top:16px;border-top:1px solid #e2e8f0;padding-top:14px;">
            <p style="font-size:12px;font-weight:800;color:#475569;text-transform:uppercase;letter-spacing:.3px;margin-bottom:10px;">📋 Resource Requirements</p>

            <!-- Labour required -->
            <label class="ef-label">👷 Labour Required</label>
            <div id="pt_labourRows" style="margin-bottom:6px;"></div>
            <button type="button" onclick="window._ptAddLabourRow()" style="font-size:11px;font-weight:700;color:#2563eb;background:#eff6ff;border:1px solid #bfdbfe;border-radius:6px;padding:4px 10px;cursor:pointer;margin-bottom:12px;">+ Add Trade</button>

            <!-- Material from recipe -->
            <label class="ef-label">🧪 Material from Mix Design (Recipe)</label>
            <select id="pt_recipe" class="ef-input" style="margin-bottom:10px;">
              <option value="">-- None (no recipe materials) --</option>
              ${_getRecipeOptions(pid)}
            </select>

            <!-- Additional material -->
            <label class="ef-label">📦 Additional Material</label>
            <div id="pt_matRows" style="margin-bottom:6px;"></div>
            <button type="button" onclick="window._ptAddMatRow()" style="font-size:11px;font-weight:700;color:#059669;background:#ecfdf5;border:1px solid #a7f3d0;border-radius:6px;padding:4px 10px;cursor:pointer;margin-bottom:12px;">+ Add Material</button>

            <!-- Equipment required -->
            <label class="ef-label">🚜 Equipment Required</label>
            <div id="pt_equipRows" style="margin-bottom:6px;"></div>
            <button type="button" onclick="window._ptAddEquipRow()" style="font-size:11px;font-weight:700;color:#7c3aed;background:#f5f3ff;border:1px solid #ddd6fe;border-radius:6px;padding:4px 10px;cursor:pointer;">+ Add Equipment</button>
          </div>
        </div>
        <div class="ef-footer">
          <button onclick="window._planCloseForm()" class="ef-btn-cancel">Cancel</button>
          <button onclick="window._planSaveTask('${taskId || ''}')" class="ef-btn-save">${existing ? 'Update Task' : 'Create Task'}</button>
        </div>
      </div>
    </div>`;

  document.body.insertAdjacentHTML('beforeend', html);
  // Prefill resource rows on edit
  (existing?.labourReq || []).forEach(l => window._ptAddLabourRow(l.trade, l.count));
  if (existing?.recipeRef) { const r = document.getElementById('pt_recipe'); if (r) r.value = existing.recipeRef; }
  // Existing additional materials/equipment from task records
  if (existing) {
    (state.taskMaterials || []).filter(m => m.taskId === existing.id && !m.fromRecipe).forEach(m => window._ptAddMatRow(m.materialId, m.qtyRequired));
    (state.taskEquipment || []).filter(e => e.taskId === existing.id).forEach(e => window._ptAddEquipRow(e.equipmentId));
  }
  setTimeout(() => document.getElementById('pt_name')?.focus(), 100);
}

export function saveTask(taskId) {
  const name = document.getElementById('pt_name')?.value.trim();
  if (!name) { showToast('Task name is required', 'error'); return; }

  const pid = state.currentProjectId || state.projects?.[0]?.id;
  const area = document.getElementById('pt_area')?.value.trim() || '';
  if (!area) { showToast('Area / Location is required', 'error'); return; }

  const data = {
    name,
    area,
    description: document.getElementById('pt_desc')?.value.trim() || '',
    startDate: document.getElementById('pt_start')?.value || '',
    endDate: document.getElementById('pt_end')?.value || '',
    priority: document.getElementById('pt_priority')?.value || 'Medium',
    status: document.getElementById('pt_status')?.value || 'Not Started',
    assignedTo: document.getElementById('pt_assigned')?.value.trim() || '',
    progress: parseFloat(document.getElementById('pt_progress')?.value) || 0,
    boqItemId: document.getElementById('pt_boqItem')?.value || '',
    dependsOn: document.getElementById('pt_dependency')?.value || '',
    remarks: document.getElementById('pt_remarks')?.value.trim() || '',
    projectId: pid,
  };

  // Capture labour requirement
  data.labourReq = [];
  document.querySelectorAll('#pt_labourRows > div').forEach(row => {
    const trade = row.querySelector('.pt-lab-trade')?.value;
    const count = parseInt(row.querySelector('.pt-lab-count')?.value) || 0;
    if (trade && count > 0) data.labourReq.push({ trade, count });
  });
  data.recipeRef = document.getElementById('pt_recipe')?.value || '';

  // Pre-flight check if moving to "Ready to Start"
  if (data.status === 'Ready to Start') {
    const existing = taskId ? (state.planningTasks || []).find(t => t.id === taskId) : null;
    if (!existing || existing.status !== 'Ready to Start') {
      // Will validate after save
    }
  }

  if (!state.planningTasks) state.planningTasks = [];

  if (taskId) {
    const idx = state.planningTasks.findIndex(t => t.id === taskId);
    if (idx >= 0) {
      state.planningTasks[idx] = { ...state.planningTasks[idx], ...data };
    }
  } else {
    data.id = 'task_' + Date.now() + '_' + Math.floor(Math.random() * 1000);
    data.createdAt = new Date().toISOString();
    state.planningTasks.push(data);
    taskId = data.id;
  }

  // ── Persist material & equipment requirements ──
  if (!state.taskMaterials) state.taskMaterials = [];
  if (!state.taskEquipment) state.taskEquipment = [];
  // Clear previous for this task (rebuild from form)
  state.taskMaterials = state.taskMaterials.filter(m => m.taskId !== taskId);
  state.taskEquipment = state.taskEquipment.filter(e => e.taskId !== taskId);

  // Recipe materials
  const recipeRef = data.recipeRef;
  if (recipeRef && recipeRef.includes('::')) {
    const [key, code] = recipeRef.split('::');
    const r = state.recipes?.[key]?.[code];
    (r?.ingredients || []).forEach(ing => {
      state.taskMaterials.push({ id: 'tm_' + Date.now() + '_' + Math.random().toString(36).slice(2,6), taskId, materialId: ing.rawMatId || ing.materialId, qtyRequired: parseFloat(ing.qty) || 0, fromRecipe: true });
    });
  }
  // Additional materials
  document.querySelectorAll('#pt_matRows > div').forEach(row => {
    const materialId = row.querySelector('.pt-mat-id')?.value;
    const qtyRequired = parseFloat(row.querySelector('.pt-mat-qty')?.value) || 0;
    if (materialId && qtyRequired > 0) state.taskMaterials.push({ id: 'tm_' + Date.now() + '_' + Math.random().toString(36).slice(2,6), taskId, materialId, qtyRequired, fromRecipe: false });
  });
  // Equipment
  document.querySelectorAll('#pt_equipRows > div').forEach(row => {
    const equipmentId = row.querySelector('.pt-eq-id')?.value;
    if (equipmentId) state.taskEquipment.push({ id: 'te_' + Date.now() + '_' + Math.random().toString(36).slice(2,6), taskId, equipmentId });
  });

  saveAllData();
  closeTaskForm();

  // Run pre-flight if Ready to Start
  if (data.status === 'Ready to Start') {
    const preflight = checkResourceAvailability(taskId);
    if (!preflight.ready) {
      _showPreflightResults(preflight, data.name);
    }
  }

  showToast(taskId ? 'Task updated' : 'Task created', 'success');
  renderPlanningView();
}

export function deleteTask(taskId) {
  if (!confirm('Delete this task and all its material/equipment links?')) return;
  state.planningTasks = (state.planningTasks || []).filter(t => t.id !== taskId);
  state.taskMaterials = (state.taskMaterials || []).filter(m => m.taskId !== taskId);
  state.taskEquipment = (state.taskEquipment || []).filter(e => e.taskId !== taskId);
  saveAllData();
  showToast('Task deleted', 'success');
  renderPlanningView();
}

export function closeTaskForm() {
  document.getElementById('planTaskFormModal')?.remove();
}


// ═══════════════════════════════════════════════
//  TASK DETAIL — Requirements Tab
// ═══════════════════════════════════════════════

export function openTaskDetail(taskId) {
  const task = (state.planningTasks || []).find(t => t.id === taskId);
  if (!task) return;

  document.getElementById('planTaskDetailModal')?.remove();

  const materials = (state.taskMaterials || []).filter(m => m.taskId === taskId);
  const equipment = (state.taskEquipment || []).filter(e => e.taskId === taskId);
  const preflight = checkResourceAvailability(taskId);
  const sc = { 'Not Started': '#94a3b8', 'Ready to Start': '#10b981', 'In Progress': '#3b82f6', 'On Hold': '#f59e0b', 'Completed': '#6366f1', 'Cancelled': '#ef4444' };

  const html = `
    <div id="planTaskDetailModal" class="ef-overlay" onclick="if(event.target===this)window._planCloseDetail()">
      <div class="ef-modal" style="max-width:720px;max-height:90vh;overflow:hidden;display:flex;flex-direction:column;">
        <div class="ef-header">
          <div>
            <h3 class="ef-title">${task.name}</h3>
            <p class="text-[10px] text-slate-400 mt-0.5">${task.startDate || '—'}${task.endDate ? ' → ' + task.endDate : ''} &middot; ${task.assignedTo || 'Unassigned'}</p>
          </div>
          <div class="flex items-center gap-2">
            <span class="text-[10px] font-bold px-2 py-0.5 rounded-full" style="background:${sc[task.status] || '#94a3b8'}15;color:${sc[task.status] || '#94a3b8'};">${task.status}</span>
            <button onclick="window._planCloseDetail()" class="ef-close">&times;</button>
          </div>
        </div>
        <div style="flex:1;overflow-y:auto;">
          <!-- Tabs -->
          <div class="flex border-b border-slate-200 px-4 pt-2 bg-slate-50">
            <button class="plan-tab active text-xs font-bold px-4 py-2 border-b-2 border-blue-500 text-blue-600" onclick="window._planSwitchTab('materials',this)">&#128230; Materials (${materials.length})</button>
            <button class="plan-tab text-xs font-bold px-4 py-2 border-b-2 border-transparent text-slate-400 hover:text-slate-600" onclick="window._planSwitchTab('equipment',this)">&#128295; Equipment (${equipment.length})</button>
            <button class="plan-tab text-xs font-bold px-4 py-2 border-b-2 border-transparent text-slate-400 hover:text-slate-600" onclick="window._planSwitchTab('preflight',this)">&#9989; Pre-flight ${!preflight.ready ? '<span class="text-red-500">&#9888;</span>' : ''}</button>
          </div>

          <!-- Materials Tab -->
          <div id="planTab_materials" class="plan-tab-content p-4">
            <div class="flex justify-between items-center mb-3">
              <h4 class="text-xs font-bold text-slate-600 uppercase tracking-wider">Material Requisition</h4>
              <button onclick="window._planAddMaterial('${taskId}')" class="text-[10px] bg-blue-600 text-white px-3 py-1.5 rounded-lg font-bold hover:bg-blue-700">+ Add Material</button>
            </div>
            ${materials.length ? `<div class="border rounded-lg overflow-hidden">
              <table class="w-full text-xs">
                <thead class="bg-slate-50">
                  <tr>
                    <th class="px-3 py-2 text-left font-bold text-slate-500">Material</th>
                    <th class="px-3 py-2 text-right font-bold text-slate-500">Qty</th>
                    <th class="px-3 py-2 text-left font-bold text-slate-500">Unit</th>
                    <th class="px-3 py-2 text-left font-bold text-slate-500">Status</th>
                    <th class="px-3 py-2 text-right font-bold text-slate-500">In Stock</th>
                    <th class="px-3 py-2 text-center font-bold text-slate-500">Action</th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-slate-100">
                  ${materials.map(m => {
                    const avail = _getMaterialStock(m.materialId || m.materialName, task.projectId);
                    const shortfall = Math.max(0, (m.quantity || 0) - avail);
                    return `<tr>
                      <td class="px-3 py-2 font-medium text-slate-700">${m.materialName || '—'}</td>
                      <td class="px-3 py-2 text-right font-bold">${m.quantity || 0}</td>
                      <td class="px-3 py-2 text-slate-500">${m.unit || '—'}</td>
                      <td class="px-3 py-2"><span class="text-[10px] font-bold px-1.5 py-0.5 rounded-full ${shortfall > 0 ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'}">${shortfall > 0 ? 'Insufficient' : 'Available'}</span></td>
                      <td class="px-3 py-2 text-right ${shortfall > 0 ? 'text-red-600 font-bold' : ''}">${avail}</td>
                      <td class="px-3 py-2 text-center">
                        <button onclick="window._planRemoveMaterial('${m.id}','${taskId}')" class="text-red-400 hover:text-red-600 text-xs">&#128465;</button>
                      </td>
                    </tr>`;
                  }).join('')}
                </tbody>
              </table>
            </div>` : '<p class="text-xs text-slate-400 text-center py-8">No materials linked. Add materials this task requires.</p>'}
          </div>

          <!-- Equipment Tab -->
          <div id="planTab_equipment" class="plan-tab-content p-4 hidden">
            <div class="flex justify-between items-center mb-3">
              <h4 class="text-xs font-bold text-slate-600 uppercase tracking-wider">Equipment Requisition</h4>
              <button onclick="window._planAddEquipment('${taskId}')" class="text-[10px] bg-purple-600 text-white px-3 py-1.5 rounded-lg font-bold hover:bg-purple-700">+ Add Equipment</button>
            </div>
            ${equipment.length ? `<div class="border rounded-lg overflow-hidden">
              <table class="w-full text-xs">
                <thead class="bg-slate-50">
                  <tr>
                    <th class="px-3 py-2 text-left font-bold text-slate-500">Equipment</th>
                    <th class="px-3 py-2 text-left font-bold text-slate-500">Required Date</th>
                    <th class="px-3 py-2 text-left font-bold text-slate-500">Duration</th>
                    <th class="px-3 py-2 text-left font-bold text-slate-500">Conflicts</th>
                    <th class="px-3 py-2 text-center font-bold text-slate-500">Action</th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-slate-100">
                  ${equipment.map(e => {
                    const conflict = _checkEquipmentConflict(e.equipmentId, taskId, task.startDate, task.endDate);
                    return `<tr>
                      <td class="px-3 py-2 font-medium text-slate-700">${e.equipmentName || '—'}</td>
                      <td class="px-3 py-2 text-slate-500">${e.requiredDate || task.startDate || '—'}</td>
                      <td class="px-3 py-2 text-slate-500">${e.durationDays || 1} day(s)</td>
                      <td class="px-3 py-2">${conflict ? `<span class="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-red-100 text-red-700">&#9888; ${conflict}</span>` : '<span class="text-[10px] font-bold text-green-600">None</span>'}</td>
                      <td class="px-3 py-2 text-center">
                        <button onclick="window._planRemoveEquipment('${e.id}','${taskId}')" class="text-red-400 hover:text-red-600 text-xs">&#128465;</button>
                      </td>
                    </tr>`;
                  }).join('')}
                </tbody>
              </table>
            </div>` : '<p class="text-xs text-slate-400 text-center py-8">No equipment linked. Add equipment this task requires.</p>'}
          </div>

          <!-- Pre-flight Tab -->
          <div id="planTab_preflight" class="plan-tab-content p-4 hidden">
            <h4 class="text-xs font-bold text-slate-600 uppercase tracking-wider mb-3">Pre-flight Resource Check</h4>
            ${_renderPreflightDetail(preflight)}
            <div class="mt-4 text-center">
              <button onclick="window._planRunPreflight('${taskId}')" class="text-xs bg-slate-700 text-white px-4 py-2 rounded-lg font-bold hover:bg-slate-800">&#128260; Re-check Resources</button>
            </div>
          </div>
        </div>
      </div>
    </div>`;

  document.body.insertAdjacentHTML('beforeend', html);
}

function _renderPreflightDetail(pf) {
  if (pf.ready) {
    return `<div class="bg-green-50 border border-green-200 rounded-lg p-4 text-center">
      <p class="text-2xl mb-2">&#9989;</p>
      <p class="text-sm font-bold text-green-700">All Clear — Task Ready to Start</p>
      <p class="text-xs text-green-600 mt-1">All materials available &middot; No equipment conflicts</p>
    </div>`;
  }

  let html = '';
  if (pf.materialIssues.length) {
    html += '<div class="mb-3"><p class="text-xs font-bold text-red-700 mb-2">&#128230; Material Shortages:</p>';
    pf.materialIssues.forEach(i => {
      html += `<div class="flex items-center justify-between p-2 bg-red-50 border border-red-100 rounded mb-1">
        <span class="text-xs font-medium text-slate-700">${i.name}</span>
        <span class="text-[10px] text-red-600 font-bold">Need: ${i.required} | Available: ${i.available} | Short: ${i.shortfall}</span>
      </div>`;
    });
    html += '</div>';
  }
  if (pf.equipmentIssues.length) {
    html += '<div><p class="text-xs font-bold text-red-700 mb-2">&#128295; Equipment Conflicts:</p>';
    pf.equipmentIssues.forEach(i => {
      html += `<div class="flex items-center justify-between p-2 bg-red-50 border border-red-100 rounded mb-1">
        <span class="text-xs font-medium text-slate-700">${i.name}</span>
        <span class="text-[10px] text-red-600 font-bold">${i.conflict}</span>
      </div>`;
    });
    html += '</div>';
  }
  if (pf.dependencyIssues.length) {
    html += '<div class="mt-3"><p class="text-xs font-bold text-amber-700 mb-2">&#128279; Dependency Blocks:</p>';
    pf.dependencyIssues.forEach(i => {
      html += `<div class="p-2 bg-amber-50 border border-amber-100 rounded mb-1">
        <span class="text-xs font-medium text-slate-700">${i}</span>
      </div>`;
    });
    html += '</div>';
  }
  return html;
}

export function closeTaskDetail() {
  document.getElementById('planTaskDetailModal')?.remove();
}

export function switchPlanTab(tabName, btn) {
  document.querySelectorAll('.plan-tab-content').forEach(el => el.classList.add('hidden'));
  document.querySelectorAll('.plan-tab').forEach(el => {
    el.classList.remove('active', 'border-blue-500', 'text-blue-600');
    el.classList.add('border-transparent', 'text-slate-400');
  });
  const tab = document.getElementById('planTab_' + tabName);
  if (tab) tab.classList.remove('hidden');
  if (btn) {
    btn.classList.add('active', 'border-blue-500', 'text-blue-600');
    btn.classList.remove('border-transparent', 'text-slate-400');
  }
}


// ═══════════════════════════════════════════════
//  MATERIAL REQUISITION
// ═══════════════════════════════════════════════

export function addTaskMaterial(taskId) {
  document.getElementById('planMaterialFormModal')?.remove();
  const materials = state.rawMaterials || [];
  const pid = state.currentProjectId || state.projects?.[0]?.id;
  const projMaterials = materials.filter(m => !m.projectId || m.projectId === pid);

  const html = `
    <div id="planMaterialFormModal" class="ef-overlay" style="z-index:200001" onclick="if(event.target===this)this.remove()">
      <div class="ef-modal" style="max-width:420px;">
        <div class="ef-header">
          <h3 class="ef-title">Add Material Requirement</h3>
          <button onclick="document.getElementById('planMaterialFormModal').remove()" class="ef-close">&times;</button>
        </div>
        <div class="ef-body">
          <div class="ef-grid">
            <div class="ef-field ef-field-full">
              <label class="ef-label">Material *</label>
              <select id="pm_material" class="ef-input" onchange="window._planOnMaterialSelect()">
                <option value="">-- Select from Inventory --</option>
                ${projMaterials.map(m => `<option value="${m.id}" data-name="${m.name}" data-unit="${m.unit || 'Nos'}">${m.name} (${m.unit || 'Nos'})</option>`).join('')}
                <option value="__custom__">+ Enter Custom Material</option>
              </select>
            </div>
            <div id="pm_customNameWrap" class="ef-field ef-field-full hidden">
              <label class="ef-label">Material Name *</label>
              <input type="text" id="pm_customName" class="ef-input" placeholder="e.g. 20mm Aggregate">
            </div>
            <div class="ef-field">
              <label class="ef-label">Quantity Required *</label>
              <input type="number" id="pm_qty" class="ef-input" placeholder="0" step="any" required>
            </div>
            <div class="ef-field">
              <label class="ef-label">Unit</label>
              <input type="text" id="pm_unit" class="ef-input" value="Nos" placeholder="Bag / MT / M3">
            </div>
          </div>
        </div>
        <div class="ef-footer">
          <button onclick="document.getElementById('planMaterialFormModal').remove()" class="ef-btn-cancel">Cancel</button>
          <button onclick="window._planSaveMaterial('${taskId}')" class="ef-btn-save">Add Material</button>
        </div>
      </div>
    </div>`;

  document.body.insertAdjacentHTML('beforeend', html);
}

export function onMaterialSelect() {
  const sel = document.getElementById('pm_material');
  const wrap = document.getElementById('pm_customNameWrap');
  const unitInput = document.getElementById('pm_unit');
  if (sel.value === '__custom__') {
    wrap?.classList.remove('hidden');
  } else {
    wrap?.classList.add('hidden');
    const opt = sel.selectedOptions[0];
    if (opt && unitInput) unitInput.value = opt.dataset.unit || 'Nos';
  }
}

export function saveMaterial(taskId) {
  const sel = document.getElementById('pm_material');
  const qty = parseFloat(document.getElementById('pm_qty')?.value);
  const unit = document.getElementById('pm_unit')?.value || 'Nos';

  if (!qty || qty <= 0) { showToast('Enter a valid quantity', 'error'); return; }

  let materialId = '', materialName = '';
  if (sel.value === '__custom__') {
    materialName = document.getElementById('pm_customName')?.value.trim();
    if (!materialName) { showToast('Enter material name', 'error'); return; }
  } else if (sel.value) {
    materialId = sel.value;
    materialName = sel.selectedOptions[0]?.dataset.name || sel.selectedOptions[0]?.textContent || '';
  } else {
    showToast('Select a material', 'error'); return;
  }

  if (!state.taskMaterials) state.taskMaterials = [];
  state.taskMaterials.push({
    id: 'tm_' + Date.now() + '_' + Math.floor(Math.random() * 1000),
    taskId,
    materialId,
    materialName,
    quantity: qty,
    unit,
    status: 'Required',
    projectId: state.currentProjectId || state.projects?.[0]?.id,
    createdAt: new Date().toISOString(),
  });

  saveAllData();
  document.getElementById('planMaterialFormModal')?.remove();
  showToast('Material added', 'success');
  renderPlanningView();
  openTaskDetail(taskId);
}

export function removeMaterial(materialLinkId, taskId) {
  state.taskMaterials = (state.taskMaterials || []).filter(m => m.id !== materialLinkId);
  saveAllData();
  showToast('Material removed', 'success');
  renderPlanningView();
  openTaskDetail(taskId);
}


// ═══════════════════════════════════════════════
//  EQUIPMENT REQUISITION
// ═══════════════════════════════════════════════

export function addTaskEquipment(taskId) {
  document.getElementById('planEquipFormModal')?.remove();
  const equipment = state.equipmentList || [];
  const pid = state.currentProjectId || state.projects?.[0]?.id;
  const projEquip = equipment.filter(e => !e.projectId || e.projectId === pid);
  const task = (state.planningTasks || []).find(t => t.id === taskId);

  const html = `
    <div id="planEquipFormModal" class="ef-overlay" style="z-index:200001" onclick="if(event.target===this)this.remove()">
      <div class="ef-modal" style="max-width:420px;">
        <div class="ef-header">
          <h3 class="ef-title">Add Equipment Requirement</h3>
          <button onclick="document.getElementById('planEquipFormModal').remove()" class="ef-close">&times;</button>
        </div>
        <div class="ef-body">
          <div class="ef-grid">
            <div class="ef-field ef-field-full">
              <label class="ef-label">Equipment *</label>
              <select id="pe_equipment" class="ef-input">
                <option value="">-- Select Equipment --</option>
                ${projEquip.map(e => `<option value="${e.id}" data-name="${e.name}">${e.name} ${e.regNo ? '(' + e.regNo + ')' : ''}</option>`).join('')}
              </select>
            </div>
            <div class="ef-field">
              <label class="ef-label">Required From</label>
              <input type="date" id="pe_date" class="ef-input" value="${task?.startDate || new Date().toISOString().split('T')[0]}">
            </div>
            <div class="ef-field">
              <label class="ef-label">Duration (days)</label>
              <input type="number" id="pe_duration" class="ef-input" value="1" min="1">
            </div>
            <div class="ef-field ef-field-full">
              <label class="ef-label">Remarks</label>
              <input type="text" id="pe_remarks" class="ef-input" placeholder="e.g. With operator">
            </div>
          </div>
        </div>
        <div class="ef-footer">
          <button onclick="document.getElementById('planEquipFormModal').remove()" class="ef-btn-cancel">Cancel</button>
          <button onclick="window._planSaveEquipment('${taskId}')" class="ef-btn-save">Add Equipment</button>
        </div>
      </div>
    </div>`;

  document.body.insertAdjacentHTML('beforeend', html);
}

export function saveEquipment(taskId) {
  const sel = document.getElementById('pe_equipment');
  if (!sel?.value) { showToast('Select equipment', 'error'); return; }

  const equipmentId = sel.value;
  const equipmentName = sel.selectedOptions[0]?.dataset.name || sel.selectedOptions[0]?.textContent || '';
  const requiredDate = document.getElementById('pe_date')?.value || '';
  const durationDays = parseInt(document.getElementById('pe_duration')?.value) || 1;
  const remarks = document.getElementById('pe_remarks')?.value.trim() || '';

  // Check for conflict before adding
  const task = (state.planningTasks || []).find(t => t.id === taskId);
  const conflict = _checkEquipmentConflict(equipmentId, taskId, requiredDate, _addDays(requiredDate, durationDays));
  if (conflict) {
    if (!confirm(`Resource Conflict Detected:\n\n${conflict}\n\nAdd anyway?`)) return;
  }

  if (!state.taskEquipment) state.taskEquipment = [];
  state.taskEquipment.push({
    id: 'te_' + Date.now() + '_' + Math.floor(Math.random() * 1000),
    taskId,
    equipmentId,
    equipmentName,
    requiredDate,
    durationDays,
    remarks,
    projectId: state.currentProjectId || state.projects?.[0]?.id,
    createdAt: new Date().toISOString(),
  });

  saveAllData();
  document.getElementById('planEquipFormModal')?.remove();
  showToast(conflict ? 'Equipment added (conflict noted)' : 'Equipment added', conflict ? 'warning' : 'success');
  renderPlanningView();
  openTaskDetail(taskId);
}

export function removeEquipment(equipLinkId, taskId) {
  state.taskEquipment = (state.taskEquipment || []).filter(e => e.id !== equipLinkId);
  saveAllData();
  showToast('Equipment removed', 'success');
  renderPlanningView();
  openTaskDetail(taskId);
}


// ═══════════════════════════════════════════════
//  PRE-FLIGHT CHECK — checkResourceAvailability()
// ═══════════════════════════════════════════════

export function checkResourceAvailability(taskId) {
  const task = (state.planningTasks || []).find(t => t.id === taskId);
  if (!task) return { ready: true, materialIssues: [], equipmentIssues: [], dependencyIssues: [] };

  const result = { ready: true, materialIssues: [], equipmentIssues: [], dependencyIssues: [] };

  // 1. Check materials
  const materials = (state.taskMaterials || []).filter(m => m.taskId === taskId);
  materials.forEach(m => {
    const available = _getMaterialStock(m.materialId || m.materialName, task.projectId);
    if (available < (m.quantity || 0)) {
      result.ready = false;
      result.materialIssues.push({
        name: m.materialName,
        required: m.quantity,
        available,
        shortfall: (m.quantity || 0) - available,
        unit: m.unit || '',
      });
    }
  });

  // 2. Check equipment conflicts
  const equipment = (state.taskEquipment || []).filter(e => e.taskId === taskId);
  equipment.forEach(e => {
    const conflict = _checkEquipmentConflict(e.equipmentId, taskId, e.requiredDate || task.startDate, task.endDate);
    if (conflict) {
      result.ready = false;
      result.equipmentIssues.push({ name: e.equipmentName, conflict });
    }
  });

  // 3. Check dependencies
  if (task.dependsOn) {
    const dep = (state.planningTasks || []).find(t => t.id === task.dependsOn);
    if (dep && dep.status !== 'Completed') {
      result.ready = false;
      result.dependencyIssues.push(`Depends on "${dep.name}" which is "${dep.status}"`);
    }
  }

  return result;
}

export function runPreflight(taskId) {
  const task = (state.planningTasks || []).find(t => t.id === taskId);
  if (!task) return;
  const pf = checkResourceAvailability(taskId);
  _showPreflightResults(pf, task.name);
  // Refresh the detail modal preflight tab
  const tab = document.getElementById('planTab_preflight');
  if (tab) tab.innerHTML = `<h4 class="text-xs font-bold text-slate-600 uppercase tracking-wider mb-3">Pre-flight Resource Check</h4>${_renderPreflightDetail(pf)}<div class="mt-4 text-center"><button onclick="window._planRunPreflight('${taskId}')" class="text-xs bg-slate-700 text-white px-4 py-2 rounded-lg font-bold hover:bg-slate-800">&#128260; Re-check Resources</button></div>`;
}

function _showPreflightResults(pf, taskName) {
  if (pf.ready) {
    showToast(`${taskName}: All resources available`, 'success');
    return;
  }
  let msg = [];
  if (pf.materialIssues.length) msg.push(`${pf.materialIssues.length} material shortage(s)`);
  if (pf.equipmentIssues.length) msg.push(`${pf.equipmentIssues.length} equipment conflict(s)`);
  if (pf.dependencyIssues.length) msg.push(`${pf.dependencyIssues.length} dependency block(s)`);
  showToast(`${taskName}: ${msg.join(', ')}`, 'error');
}


// ═══════════════════════════════════════════════
//  HELPERS
// ═══════════════════════════════════════════════

function _getMaterialStock(materialIdOrName, projectId) {
  // Check inventory transactions for stock level
  const txns = state.inventoryTx || [];
  let stock = 0;
  txns.forEach(tx => {
    const match = (tx.rawMaterialId === materialIdOrName) ||
      (tx.itemId === materialIdOrName) ||
      ((tx.itemName || '').toLowerCase() === (materialIdOrName || '').toLowerCase());
    if (!match) return;
    if (projectId && tx.siteId && tx.siteId !== projectId) return;
    const qty = parseFloat(tx.qty) || 0;
    stock += tx.type === 'IN' ? qty : -qty;
  });

  // Also check rawMaterials for any minStock data
  const rm = (state.rawMaterials || []).find(r => r.id === materialIdOrName || r.name === materialIdOrName);
  if (rm && stock === 0 && rm.currentStock) stock = parseFloat(rm.currentStock) || 0;

  return Math.max(0, stock);
}

function _checkEquipmentConflict(equipmentId, currentTaskId, startDate, endDate) {
  if (!equipmentId || !startDate) return null;
  const otherLinks = (state.taskEquipment || []).filter(e => e.equipmentId === equipmentId && e.taskId !== currentTaskId);

  for (const link of otherLinks) {
    const otherTask = (state.planningTasks || []).find(t => t.id === link.taskId);
    if (!otherTask || otherTask.status === 'Completed' || otherTask.status === 'Cancelled') continue;

    const otherStart = link.requiredDate || otherTask.startDate;
    const otherEnd = otherTask.endDate || _addDays(otherStart, link.durationDays || 1);

    // Check date overlap
    if (startDate <= otherEnd && (endDate || startDate) >= otherStart) {
      return `Assigned to "${otherTask.name}" (${otherStart}${otherEnd !== otherStart ? ' → ' + otherEnd : ''})`;
    }
  }
  return null;
}

function _getAllConflicts(projectId) {
  const conflicts = [];
  const equipLinks = (state.taskEquipment || []).filter(e => e.projectId === projectId);
  const seen = new Set();

  equipLinks.forEach(link => {
    const task = (state.planningTasks || []).find(t => t.id === link.taskId);
    if (!task || task.status === 'Completed' || task.status === 'Cancelled') return;

    const conflict = _checkEquipmentConflict(link.equipmentId, link.taskId, link.requiredDate || task.startDate, task.endDate);
    if (conflict) {
      const key = [link.equipmentId, link.taskId].sort().join('|');
      if (!seen.has(key)) {
        seen.add(key);
        conflicts.push({
          equipmentName: link.equipmentName,
          date: link.requiredDate || task.startDate,
          task1: task.name,
          task2: conflict.replace('Assigned to "', '').split('"')[0],
        });
      }
    }
  });
  return conflicts;
}

function _getUpcomingShortages(projectId, daysAhead) {
  const today = new Date();
  const cutoff = new Date(today);
  cutoff.setDate(cutoff.getDate() + daysAhead);
  const cutoffStr = cutoff.toISOString().split('T')[0];
  const todayStr = today.toISOString().split('T')[0];

  const shortages = [];
  const tasks = (state.planningTasks || []).filter(t =>
    t.projectId === projectId &&
    t.status !== 'Completed' && t.status !== 'Cancelled' &&
    t.startDate && t.startDate >= todayStr && t.startDate <= cutoffStr
  );

  tasks.forEach(task => {
    const materials = (state.taskMaterials || []).filter(m => m.taskId === task.id);
    materials.forEach(m => {
      const available = _getMaterialStock(m.materialId || m.materialName, projectId);
      if (available < (m.quantity || 0)) {
        shortages.push({
          taskName: task.name,
          materialName: m.materialName,
          requiredQty: m.quantity,
          availableQty: available,
          unit: m.unit || '',
          startDate: task.startDate,
        });
      }
    });
  });
  return shortages;
}

function _addDays(dateStr, days) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  d.setDate(d.getDate() + (days || 0));
  return d.toISOString().split('T')[0];
}

function _getBoqOptions(projectId, selectedVal) {
  const proj = (state.projects || []).find(p => p.id === projectId);
  if (!proj) return '';
  const items = [];
  (proj.boqs || []).forEach(g => {
    (g.items || []).forEach((item, i) => {
      const val = g.id + ':' + i; // stable reference
      const label = `${item.code || item.itemNo || ''} ${item.description || item.name || '—'} (${item.uom || item.unit || '—'})`.trim();
      items.push(`<option value="${val}" ${selectedVal === val ? 'selected' : ''}>${label}</option>`);
    });
  });
  return items.join('');
}

function _getExistingAreas(projectId) {
  const areas = new Set();
  (state.planningTasks || []).forEach(t => {
    if (t.projectId === projectId && t.area) areas.add(t.area);
  });
  return [...areas].sort();
}

function _getRecipeOptions(projectId) {
  // recipes stored as object keyed by clientId/projectId → {itemCode: {ingredients}}
  const recipes = state.recipes || {};
  const opts = [];
  Object.keys(recipes).forEach(key => {
    const grp = recipes[key];
    Object.keys(grp || {}).forEach(code => {
      const r = grp[code];
      const ingCount = (r.ingredients || []).length;
      if (ingCount) opts.push(`<option value="${key}::${code}">${r.description || code} (${ingCount} materials)</option>`);
    });
  });
  return opts.join('');
}

// ── Task-form resource requirement row builders ──
const _RM_OPTS = () => (state.rawMaterials || []).map(m => `<option value="${m.id}">${m.name} (${m.unit})</option>`).join('');
const _EQ_OPTS = () => (state.equipmentList || []).map(e => `<option value="${e.id}">${e.name} (${e.regNo || 'No Reg'})</option>`).join('');
const _TRADES = ['Mason','Bar Bender','Shuttering Carpenter','Steel Fixer','Plumber','Electrician','Painter','Welder','Operator','Skilled Helper','Unskilled Helper','Mistri'];

window._ptAddLabourRow = function(trade, count) {
  const box = document.getElementById('pt_labourRows'); if (!box) return;
  const div = document.createElement('div');
  div.style.cssText = 'display:flex;gap:6px;margin-bottom:5px;';
  div.innerHTML = `<select class="ef-input pt-lab-trade" style="flex:1;">${_TRADES.map(t => `<option ${t===trade?'selected':''}>${t}</option>`).join('')}</select><input type="number" class="ef-input pt-lab-count" style="width:80px;" placeholder="Count" value="${count||''}"><button type="button" onclick="this.parentElement.remove()" style="color:#dc2626;background:#fef2f2;border:1px solid #fecaca;border-radius:6px;padding:0 10px;cursor:pointer;">✕</button>`;
  box.appendChild(div);
};
window._ptAddMatRow = function(matId, qty) {
  const box = document.getElementById('pt_matRows'); if (!box) return;
  const div = document.createElement('div');
  div.style.cssText = 'display:flex;gap:6px;margin-bottom:5px;';
  div.innerHTML = `<select class="ef-input pt-mat-id" style="flex:1;">${_RM_OPTS()}</select><input type="number" class="ef-input pt-mat-qty" style="width:80px;" placeholder="Qty" value="${qty||''}"><button type="button" onclick="this.parentElement.remove()" style="color:#dc2626;background:#fef2f2;border:1px solid #fecaca;border-radius:6px;padding:0 10px;cursor:pointer;">✕</button>`;
  if (matId) div.querySelector('.pt-mat-id').value = matId;
  box.appendChild(div);
};
window._ptAddEquipRow = function(eqId) {
  const box = document.getElementById('pt_equipRows'); if (!box) return;
  const div = document.createElement('div');
  div.style.cssText = 'display:flex;gap:6px;margin-bottom:5px;';
  div.innerHTML = `<select class="ef-input pt-eq-id" style="flex:1;">${_EQ_OPTS()}</select><button type="button" onclick="this.parentElement.remove()" style="color:#dc2626;background:#fef2f2;border:1px solid #fecaca;border-radius:6px;padding:0 10px;cursor:pointer;">✕</button>`;
  if (eqId) div.querySelector('.pt-eq-id').value = eqId;
  box.appendChild(div);
};
