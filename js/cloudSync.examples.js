/* ============================================================================
 * TSCloud — Module integration examples
 * Shows how to replace localStorage saves with org-scoped cloud sync.
 * These are illustrative snippets — wire them to your real form ids.
 * ==========================================================================*/

/* ─────────────────────────────────────────────────────────────────────────
 * EXAMPLE 1 — LABOR ATTENDANCE & MUSTER
 * Form ids assumed: #attDate, and per-worker rows with name="att_<id>" radios
 * (P/H/A) plus #ot_<id>. We build one record per worker per day and push it.
 * ───────────────────────────────────────────────────────────────────────── */

// OLD (per-device, isolated):
//   localStorage.setItem('mes_attendance', JSON.stringify(state.attendanceLogs));
//
// NEW (org-shared, real-time):
async function saveAttendanceToCloud(workers) {
  const date = document.getElementById('attDate').value;
  for (const w of workers) {
    const radios = document.querySelectorAll(`input[name="att_${w.id}"]`);
    let status = 'A';
    radios.forEach(r => { if (r.checked) status = r.value; });
    const record = {
      id: `${date}_${w.id}`,                 // deterministic id → idempotent upsert
      date,
      workerId: w.id,
      workerName: w.name,
      trade: w.trade,
      status,                                // P | H | A
      ot: parseFloat(document.getElementById('ot_' + w.id)?.value) || 0,
      shift: document.getElementById('shift_' + w.id)?.value || 'Day',
    };
    await TSCloud.saveToCloud('labor_attendance', record, record.id);
  }
  // TSCloud already shows the glassmorphism "Saved & synced" toast.
}

// Live updates from other devices (e.g. a supervisor marking attendance on site):
TSCloud.onModuleChange('labor_attendance', (evt, payload) => {
  if (evt === 'DELETE') return;
  // Update just the one worker's row instead of re-rendering everything:
  const cell = document.querySelector(`[data-att-row="${payload.workerId}"][data-date="${payload.date}"]`);
  if (cell) cell.querySelector('.att-status').textContent = payload.status;
  // ...or call your existing renderer: renderMonthlyMuster();
});

// Initial paint when the module opens:
async function loadAttendance() {
  const rows = await TSCloud.loadModule('labor_attendance');   // [{id,date,workerId,...}, ...]
  rows.forEach(r => {/* paint r into the muster grid */});
}


/* ─────────────────────────────────────────────────────────────────────────
 * EXAMPLE 2 — EPC PROJECT SETUP & BILLING
 * Form ids assumed: #pName #pCode #pClient #pValue #pStart #pEnd #pStatus
 * One record per project (record_id = project id).
 * ───────────────────────────────────────────────────────────────────────── */

async function saveProjectToCloud(existingId) {
  const project = {
    id: existingId || ('proj_' + Date.now()),
    name:        document.getElementById('pName').value.trim(),
    code:        document.getElementById('pCode').value.trim(),
    clientName:  document.getElementById('pClient').value.trim(),
    contractValue: parseFloat(document.getElementById('pValue').value) || 0,
    startDate:   document.getElementById('pStart').value,
    endDate:     document.getElementById('pEnd').value,
    status:      document.getElementById('pStatus').value,         // Planning | Active | ...
    updatedAt:   new Date().toISOString(),
  };
  if (!project.name) { alert('Project name is required'); return; }

  const res = await TSCloud.saveToCloud('epc_project', project, project.id);
  if (res.ok) closeProjectForm();   // your existing close/refresh
}

// Billing line saved against a project (record_id ties it to the project):
async function saveProjectBilling(projectId, bill) {
  const record = {
    id: 'bill_' + projectId + '_' + Date.now(),
    projectId,
    raNumber: bill.raNumber,
    amount: bill.amount,
    gst: bill.gst,
    date: bill.date,
  };
  await TSCloud.saveToCloud('epc_billing', record, record.id);
}

// Real-time project list across the whole company:
TSCloud.onModuleChange('epc_project', (evt, payload) => {
  // Re-render the projects grid so every team member sees new/updated projects:
  if (typeof renderProjectsHome === 'function') renderProjectsHome();
});


/* ─────────────────────────────────────────────────────────────────────────
 * BOOTSTRAP (call once, after the user is authenticated)
 * ───────────────────────────────────────────────────────────────────────── */
async function bootCloudSync() {
  const ok = await TSCloud.init();           // auth + resolve organization_id + realtime
  if (!ok) return;
  await loadAttendance();                     // initial paint per module
  // await loadProjects(); ...etc
}
// document.addEventListener('DOMContentLoaded', bootCloudSync);
