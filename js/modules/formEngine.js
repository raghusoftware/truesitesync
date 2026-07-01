import { state, saveAllData } from './state.js';
import { showToast, formatINR } from './utils.js';

// ═══════════════════════════════════════════════
// FORM ENGINE — Universal data entry for all modules
// ═══════════════════════════════════════════════

const FORM_SCHEMAS = {

  // ── Sales & CRM ──
  lead: {
    title: 'Add New Lead',
    stateKey: 'leads',
    fields: [
      { key: 'name', label: 'Lead / Company Name', type: 'text', required: true },
      { key: 'contactPerson', label: 'Contact Person', type: 'text' },
      { key: 'phone', label: 'Phone', type: 'text' },
      { key: 'email', label: 'Email', type: 'email' },
      { key: 'source', label: 'Source', type: 'select', options: ['Direct', 'Referral', 'Online', 'Tender Portal', 'Cold Call', 'Exhibition', 'Other'] },
      { key: 'estimatedValue', label: 'Estimated Value (₹)', type: 'number' },
      { key: 'probability', label: 'Probability (%)', type: 'number', max: 100 },
      { key: 'status', label: 'Status', type: 'select', options: ['New', 'Contacted', 'Qualified', 'Proposal Sent', 'Negotiation', 'Won', 'Lost'], default: 'New' },
      { key: 'followUpDate', label: 'Follow-up Date', type: 'date' },
      { key: 'notes', label: 'Notes', type: 'textarea' }
    ]
  },

  tender: {
    title: 'Add Tender',
    stateKey: 'tenders',
    fields: [
      { key: 'tenderNo', label: 'Tender / NIT Number', type: 'text', required: true },
      { key: 'title', label: 'Tender Title', type: 'text', required: true },
      { key: 'client', label: 'Client / Authority', type: 'text', required: true },
      { key: 'publishDate', label: 'Publish Date', type: 'date' },
      { key: 'submitDeadline', label: 'Submission Deadline', type: 'date', required: true },
      { key: 'estimatedValue', label: 'Estimated Value (₹)', type: 'number' },
      { key: 'emd', label: 'EMD Amount (₹)', type: 'number' },
      { key: 'category', label: 'Category', type: 'select', options: ['Civil', 'Electrical', 'Plumbing', 'HVAC', 'Road', 'Bridge', 'Building', 'Other'] },
      { key: 'status', label: 'Status', type: 'select', options: ['Identified', 'Document Purchased', 'Under Preparation', 'Submitted', 'Technical Qualified', 'Financial Opened', 'Awarded', 'Not Awarded', 'Withdrawn'], default: 'Identified' },
      { key: 'notes', label: 'Remarks', type: 'textarea' }
    ]
  },

  // ── Labour & Payroll ──
  labour: {
    title: 'Add Worker',
    stateKey: 'labourMaster',
    fields: [
      { key: 'name', label: 'Worker Name', type: 'text', required: true },
      { key: 'role', label: 'Role / Trade', type: 'select', options: ['Mason', 'Helper', 'Carpenter', 'Plumber', 'Electrician', 'Painter', 'Welder', 'Bar Bender', 'Machine Operator', 'Supervisor', 'Foreman', 'Driver', 'Watchman', 'Other'] },
      { key: 'phone', label: 'Phone Number', type: 'text' },
      { key: 'dailyRate', label: 'Daily Wage (₹)', type: 'number', required: true },
      { key: 'aadhaar', label: 'Aadhaar Number', type: 'text' },
      { key: 'pfNo', label: 'PF / UAN Number', type: 'text' },
      { key: 'esicNo', label: 'ESIC Number', type: 'text' },
      { key: 'bankAccount', label: 'Bank A/C Number', type: 'text' },
      { key: 'ifsc', label: 'IFSC Code', type: 'text' },
      { key: 'joiningDate', label: 'Joining Date', type: 'date' },
      { key: 'emergencyContact', label: 'Emergency Contact', type: 'text' },
      { key: 'status', label: 'Status', type: 'select', options: ['Active', 'Inactive', 'Left'], default: 'Active' }
    ]
  },

  attendance: {
    title: 'Mark Attendance',
    stateKey: 'attendanceLogs',
    fields: [
      { key: 'workerId', label: 'Worker', type: 'dynamic_select', source: 'labourMaster', displayField: 'name', required: true },
      { key: 'date', label: 'Date', type: 'date', required: true, default: 'today' },
      { key: 'status', label: 'Attendance', type: 'select', options: ['Present', 'Absent', 'Half Day', 'Overtime'], default: 'Present' },
      { key: 'hoursWorked', label: 'Hours Worked', type: 'number', default: 8 },
      { key: 'overtimeHours', label: 'OT Hours', type: 'number', default: 0 },
      { key: 'notes', label: 'Remarks', type: 'text' }
    ]
  },

  // ── Quality (QA/QC) ──
  cubeTest: {
    title: 'Add Cube Test Result',
    stateKey: 'cubeTests',
    fields: [
      { key: 'date', label: 'Casting Date', type: 'date', required: true, default: 'today' },
      { key: 'grade', label: 'Concrete Grade', type: 'select', options: ['M15', 'M20', 'M25', 'M30', 'M35', 'M40', 'M45', 'M50'], required: true },
      { key: 'specimenId', label: 'Specimen ID', type: 'text', required: true },
      { key: 'location', label: 'Pour Location', type: 'text' },
      { key: 'supplier', label: 'Concrete Supplier', type: 'text' },
      { key: 'batchNo', label: 'Batch / DC No', type: 'text' },
      { key: 'strength7d', label: '7-Day Strength (MPa)', type: 'number' },
      { key: 'strength28d', label: '28-Day Strength (MPa)', type: 'number' },
      { key: 'requiredStrength', label: 'Required Strength (MPa)', type: 'number' },
      { key: 'result', label: 'Result', type: 'select', options: ['Pass', 'Fail', 'Pending'], default: 'Pending' },
      { key: 'testedBy', label: 'Tested By / Lab', type: 'text' },
      { key: 'remarks', label: 'Remarks', type: 'textarea' }
    ]
  },

  ncr: {
    title: 'Log Non-Conformance Report',
    stateKey: 'ncrReports',
    fields: [
      { key: 'date', label: 'Date Raised', type: 'date', required: true, default: 'today' },
      { key: 'ncrNo', label: 'NCR Number', type: 'text', required: true },
      { key: 'category', label: 'Category', type: 'select', options: ['Material', 'Workmanship', 'Design', 'Safety', 'Process', 'Other'], required: true },
      { key: 'location', label: 'Location / Area', type: 'text', required: true },
      { key: 'description', label: 'Description of Non-Conformance', type: 'textarea', required: true },
      { key: 'severity', label: 'Severity', type: 'select', options: ['Minor', 'Major', 'Critical'], default: 'Minor' },
      { key: 'raisedBy', label: 'Raised By', type: 'text' },
      { key: 'assignedTo', label: 'Assigned To', type: 'text' },
      { key: 'correctiveAction', label: 'Corrective Action', type: 'textarea' },
      { key: 'targetDate', label: 'Target Closure Date', type: 'date' },
      { key: 'status', label: 'Status', type: 'select', options: ['Open', 'In Progress', 'Closed', 'Rejected'], default: 'Open' }
    ]
  },

  qualityCheck: {
    title: 'Add Quality Inspection',
    stateKey: 'qualityChecks',
    fields: [
      { key: 'date', label: 'Inspection Date', type: 'date', required: true, default: 'today' },
      { key: 'checkType', label: 'Inspection Type', type: 'select', options: ['Material Inspection', 'In-Process Check', 'Final Inspection', 'Third Party Test', 'Rebar Check', 'Level Survey', 'Soil Test'], required: true },
      { key: 'location', label: 'Location / Element', type: 'text', required: true },
      { key: 'description', label: 'Description', type: 'textarea' },
      { key: 'inspectedBy', label: 'Inspected By', type: 'text' },
      { key: 'result', label: 'Result', type: 'select', options: ['Approved', 'Approved with Remarks', 'Rejected', 'Re-Inspection Required'], default: 'Approved' },
      { key: 'remarks', label: 'Remarks', type: 'textarea' }
    ]
  },

  // ── Safety (EHS) ──
  incident: {
    title: 'Report Safety Incident',
    stateKey: 'incidents',
    fields: [
      { key: 'date', label: 'Date & Time', type: 'date', required: true, default: 'today' },
      { key: 'type', label: 'Incident Type', type: 'select', options: ['Near Miss', 'First Aid', 'Minor Injury', 'Major Injury', 'Fatality', 'Property Damage', 'Fire', 'Environmental'], required: true },
      { key: 'location', label: 'Location', type: 'text', required: true },
      { key: 'description', label: 'Description', type: 'textarea', required: true },
      { key: 'injuredPerson', label: 'Injured Person (if any)', type: 'text' },
      { key: 'severity', label: 'Severity', type: 'select', options: ['Low', 'Medium', 'High', 'Critical'], default: 'Low' },
      { key: 'rootCause', label: 'Root Cause', type: 'textarea' },
      { key: 'actionTaken', label: 'Immediate Action Taken', type: 'textarea' },
      { key: 'reportedBy', label: 'Reported By', type: 'text' },
      { key: 'status', label: 'Status', type: 'select', options: ['Open', 'Under Investigation', 'Corrective Action', 'Closed'], default: 'Open' }
    ]
  },

  ppeCheck: {
    title: 'PPE Compliance Check',
    stateKey: 'ppeChecks',
    fields: [
      { key: 'date', label: 'Check Date', type: 'date', required: true, default: 'today' },
      { key: 'workerName', label: 'Worker Name', type: 'text', required: true },
      { key: 'area', label: 'Work Area', type: 'text' },
      { key: 'helmet', label: 'Helmet', type: 'select', options: ['Yes', 'No', 'N/A'], default: 'Yes' },
      { key: 'safetyShoes', label: 'Safety Shoes', type: 'select', options: ['Yes', 'No', 'N/A'], default: 'Yes' },
      { key: 'vest', label: 'Reflective Vest', type: 'select', options: ['Yes', 'No', 'N/A'], default: 'Yes' },
      { key: 'gloves', label: 'Gloves', type: 'select', options: ['Yes', 'No', 'N/A'], default: 'Yes' },
      { key: 'goggles', label: 'Safety Goggles', type: 'select', options: ['Yes', 'No', 'N/A'], default: 'N/A' },
      { key: 'harness', label: 'Safety Harness', type: 'select', options: ['Yes', 'No', 'N/A'], default: 'N/A' },
      { key: 'earPlugs', label: 'Ear Protection', type: 'select', options: ['Yes', 'No', 'N/A'], default: 'N/A' },
      { key: 'remarks', label: 'Remarks / Action Taken', type: 'textarea' }
    ]
  },

  // ── Equipment ──
  equipUtilization: {
    title: 'Log Equipment Usage',
    stateKey: 'equipUtilization',
    fields: [
      { key: 'equipmentId', label: 'Equipment', type: 'dynamic_select', source: 'equipmentList', displayField: 'name', required: true },
      { key: 'date', label: 'Date', type: 'date', required: true, default: 'today' },
      { key: 'hoursRun', label: 'Hours Run', type: 'number', required: true },
      { key: 'idleHours', label: 'Idle Hours', type: 'number', default: 0 },
      { key: 'breakdownHours', label: 'Breakdown Hours', type: 'number', default: 0 },
      { key: 'fuelUsed', label: 'Fuel Used (Litres)', type: 'number' },
      { key: 'operator', label: 'Operator Name', type: 'text' },
      { key: 'activity', label: 'Activity / Work Done', type: 'text' },
      { key: 'meterReading', label: 'Meter / Odometer Reading', type: 'number' },
      { key: 'remarks', label: 'Remarks', type: 'text' }
    ]
  },

  // ── Project Management ──
  dailyProgress: {
    title: 'Daily Progress Report (DPR)',
    stateKey: 'dailyProgress',
    fields: [
      { key: 'date', label: 'Date', type: 'date', required: true, default: 'today' },
      { key: 'activity', label: 'Activity / Work Item', type: 'text', required: true },
      { key: 'location', label: 'Location / Zone', type: 'text' },
      { key: 'plannedQty', label: 'Planned Qty', type: 'number' },
      { key: 'achievedQty', label: 'Achieved Qty', type: 'number', required: true },
      { key: 'uom', label: 'Unit', type: 'select', options: ['M3', 'M2', 'RMT', 'MT', 'Nos', 'Kg', 'Bags', 'Lot', 'LS'] },
      { key: 'manpower', label: 'Manpower Used', type: 'number' },
      { key: 'weather', label: 'Weather', type: 'select', options: ['Clear', 'Cloudy', 'Light Rain', 'Heavy Rain', 'Storm'], default: 'Clear' },
      { key: 'hindrance', label: 'Hindrance / Delay Reason', type: 'text' },
      { key: 'remarks', label: 'Remarks', type: 'textarea' }
    ]
  },

  milestone: {
    title: 'Add Project Milestone',
    stateKey: 'milestones',
    fields: [
      { key: 'name', label: 'Milestone Name', type: 'text', required: true },
      { key: 'description', label: 'Description', type: 'textarea' },
      { key: 'plannedDate', label: 'Planned Date', type: 'date', required: true },
      { key: 'actualDate', label: 'Actual Date', type: 'date' },
      { key: 'weightage', label: 'Weightage (%)', type: 'number' },
      { key: 'status', label: 'Status', type: 'select', options: ['Not Started', 'In Progress', 'Completed', 'Delayed', 'On Hold'], default: 'Not Started' },
      { key: 'remarks', label: 'Remarks', type: 'text' }
    ]
  },

  // ── Finance / Expense ──
  expense: {
    title: 'Record Expense',
    stateKey: 'expenses',
    fields: [
      { key: 'date', label: 'Date', type: 'date', required: true, default: 'today' },
      { key: 'category', label: 'Category', type: 'select', options: ['Material', 'Labour', 'Transport', 'Equipment Rental', 'Fuel', 'Office', 'Travel', 'Food', 'Utility', 'Repair', 'Miscellaneous'], required: true },
      { key: 'description', label: 'Description', type: 'text', required: true },
      { key: 'amount', label: 'Amount (₹)', type: 'number', required: true },
      { key: 'paidBy', label: 'Paid By / Account', type: 'text' },
      { key: 'receiptNo', label: 'Receipt / Bill No', type: 'text' },
      { key: 'remarks', label: 'Remarks', type: 'text' }
    ]
  }
};

// ── Map report IDs to form schema keys ──
const REPORT_FORM_MAP = {
  lead_register: 'lead',
  sales_pipeline: 'lead',
  tender_register: 'tender',
  labour_register: 'labour',
  muster_roll: 'attendance',
  attendance_register: 'attendance',
  wage_register: 'attendance',
  labour_productivity: 'attendance',
  salary_register: 'attendance',
  pf_report: 'labour',
  esic_register: 'labour',
  payroll_summary: 'attendance',
  cube_test: 'cubeTest',
  ncr_report: 'ncr',
  qaqc_inspection: 'qualityCheck',
  incident_report: 'incident',
  ppe_compliance: 'ppeCheck',
  safety_register: 'incident',
  near_miss: 'incident',
  safety_inspection: 'ppeCheck',
  equipment_utilization: 'equipUtilization',
  equipment_log: 'equipUtilization',
  daily_progress: 'dailyProgress',
  dpr: 'dailyProgress',
  weekly_progress: 'dailyProgress',
  delay_analysis: 'dailyProgress',
  milestone_tracking: 'milestone',
  expense_analysis: 'expense',
  expense_report: 'expense',
  cash_flow: 'expense'
};

// ── Render the form modal ──
export function openEntryForm(reportId) {
  const schemaKey = REPORT_FORM_MAP[reportId];
  if (!schemaKey) {
    showToast('No entry form available for this report', 'warning');
    return;
  }
  const schema = FORM_SCHEMAS[schemaKey];
  if (!schema) return;

  // Remove existing modal
  const existing = document.getElementById('entryFormModal');
  if (existing) existing.remove();

  const today = new Date().toISOString().split('T')[0];

  let fieldsHtml = '';
  schema.fields.forEach(f => {
    const req = f.required ? ' *' : '';
    const id = `ef_${f.key}`;
    let input = '';

    if (f.type === 'text' || f.type === 'email') {
      input = `<input type="${f.type}" id="${id}" class="ef-input" placeholder="Enter ${f.label.toLowerCase()}" ${f.required ? 'required' : ''}>`;
    } else if (f.type === 'number') {
      input = `<input type="number" id="${id}" class="ef-input" placeholder="0" step="any" ${f.max ? `max="${f.max}"` : ''} value="${f.default || ''}" ${f.required ? 'required' : ''}>`;
    } else if (f.type === 'date') {
      const val = f.default === 'today' ? today : (f.default || '');
      input = `<input type="date" id="${id}" class="ef-input" value="${val}" ${f.required ? 'required' : ''}>`;
    } else if (f.type === 'select') {
      const opts = f.options.map(o => `<option value="${o}" ${o === f.default ? 'selected' : ''}>${o}</option>`).join('');
      input = `<select id="${id}" class="ef-input">${opts}</select>`;
    } else if (f.type === 'dynamic_select') {
      const items = state[f.source] || [];
      const projItems = state.currentProjectId ? items.filter(i => !i.projectId || i.projectId === state.currentProjectId) : items;
      const opts = projItems.map(i => `<option value="${i.id}">${i[f.displayField] || i.name || i.id}</option>`).join('');
      input = `<select id="${id}" class="ef-input"><option value="">-- Select --</option>${opts}</select>`;
    } else if (f.type === 'textarea') {
      input = `<textarea id="${id}" class="ef-input ef-textarea" placeholder="Enter ${f.label.toLowerCase()}" rows="2" ${f.required ? 'required' : ''}></textarea>`;
    }

    fieldsHtml += `<div class="ef-field ${f.type === 'textarea' ? 'ef-field-full' : ''}">
      <label class="ef-label" for="${id}">${f.label}${req}</label>
      ${input}
    </div>`;
  });

  const modalHtml = `
    <div id="entryFormModal" class="ef-overlay" onclick="if(event.target===this)window._efClose()">
      <div class="ef-modal">
        <div class="ef-header">
          <h3 class="ef-title">${schema.title}</h3>
          <button onclick="window._efClose()" class="ef-close">&times;</button>
        </div>
        <div class="ef-body">
          <div class="ef-grid">${fieldsHtml}</div>
        </div>
        <div class="ef-footer">
          <button onclick="window._efClose()" class="ef-btn-cancel">Cancel</button>
          <button onclick="window._efSave('${schemaKey}', '${reportId}')" class="ef-btn-save">Save Entry</button>
        </div>
      </div>
    </div>`;

  document.body.insertAdjacentHTML('beforeend', modalHtml);

  // Focus first input
  setTimeout(() => {
    const first = document.querySelector('#entryFormModal .ef-input');
    if (first) first.focus();
  }, 100);
}

// ── Save entry ──
export function saveEntry(schemaKey, reportId) {
  const schema = FORM_SCHEMAS[schemaKey];
  if (!schema) return;

  const entry = {
    id: schemaKey + '_' + Date.now() + '_' + Math.floor(Math.random() * 1000),
    projectId: state.currentProjectId || state.projects[0]?.id,
    createdAt: new Date().toISOString()
  };

  let hasError = false;
  schema.fields.forEach(f => {
    const el = document.getElementById(`ef_${f.key}`);
    if (!el) return;
    let val = el.value.trim();

    if (f.required && !val) {
      el.style.borderColor = '#ef4444';
      hasError = true;
      return;
    }

    if (f.type === 'number' && val) val = parseFloat(val);
    entry[f.key] = val;
  });

  if (hasError) {
    showToast('Please fill all required fields', 'error');
    return;
  }

  // Add to state
  if (!state[schema.stateKey]) state[schema.stateKey] = [];
  state[schema.stateKey].push(entry);
  saveAllData();

  showToast(`${schema.title.replace('Add ', '').replace('Log ', '').replace('Record ', '').replace('Report ', '').replace('Mark ', '')} saved successfully`, 'success');
  closeEntryForm();

  // Refresh report
  if (window._rptRefreshReport) window._rptRefreshReport();
}

// ── Close modal ──
export function closeEntryForm() {
  const modal = document.getElementById('entryFormModal');
  if (modal) modal.remove();
}

// ── Delete entry ──
export function deleteEntry(stateKey, entryId, reportId) {
  if (!confirm('Move this entry to the Recycle Bin?')) return;
  if (state[stateKey]) {
    const it = state[stateKey].find(e => e.id === entryId);
    const label = it?.name || it?.title || it?.no || it?.number || it?.billNo || it?.invoiceNo || it?.date || entryId;
    if (window.recycleDelete) window.recycleDelete(stateKey, entryId, stateKey, label);
    else { state[stateKey] = state[stateKey].filter(e => e.id !== entryId); saveAllData(); }
    showToast('Moved to Recycle Bin', 'success');
    if (window._rptRefreshReport) window._rptRefreshReport();
  }
}

// ── View entries table for a report ──
export function getEntryFormButton(reportId) {
  const schemaKey = REPORT_FORM_MAP[reportId];
  if (!schemaKey) return '';
  const schema = FORM_SCHEMAS[schemaKey];
  if (!schema) return '';
  return `<button onclick="window._efOpen('${reportId}')" class="rpt-btn" style="background:#2563eb;color:#fff;border:none;">+ ${schema.title.replace('Add ', 'Add ').replace('Log ', 'Add ').replace('Record ', 'Add ').replace('Report ', 'Add ').replace('Mark ', 'Add ')}</button>`;
}

// ── Check if a report has a form ──
export function hasEntryForm(reportId) {
  return !!REPORT_FORM_MAP[reportId];
}

// ── Get form schema for a report ──
export function getFormSchema(reportId) {
  const schemaKey = REPORT_FORM_MAP[reportId];
  return schemaKey ? FORM_SCHEMAS[schemaKey] : null;
}
