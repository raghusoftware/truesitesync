/**
 * ═══════════════════════════════════════════════════════════
 * True Site Sync — Report Definitions (Domain Configuration Layer)
 * ═══════════════════════════════════════════════════════════
 * Every report's exact structure is defined here using real-
 * world Indian EPC, CPWD, and GST statutory terminology.
 * The ReportEngine reads these configs to produce domain-
 * accurate output—not generic spreadsheets.
 * ═══════════════════════════════════════════════════════════
 */

// ── Column type constants ──
const T = 'text', N = 'number', C = 'currency', D = 'date', B = 'badge', P = 'percent';

/**
 * REPORT_DEFINITIONS
 * Key = report ID (matches REPORT_CATEGORIES in ReportEngine.js)
 * Each definition contains:
 *   columns     — exact column layout with key, label, type, width, align
 *   headers     — optional multi-level header groups (for GST, BBS etc.)
 *   compute     — function name string for domain-specific calculations
 *   aggregates  — footer row aggregation rules
 *   filters     — which filter controls to show
 *   exportTitle — title for PDF/Excel export
 *   statutory   — true if this is a government-format report
 *   notes       — domain notes for the report
 */
export const REPORT_DEFINITIONS = {

  // ═══════════════════════════════════════════════
  //  GST REPORTS — Indian Statutory Formats
  // ═══════════════════════════════════════════════

  gstr1: {
    exportTitle: 'GSTR-1 — Outward Supplies Return',
    statutory: true,
    notes: 'As per GST Rule 59. B2B invoices > ₹2.5L, B2C Large > ₹2.5L, B2C Small ≤ ₹2.5L.',
    filters: ['dateRange', 'period'],
    headers: [
      { label: 'Invoice Details', colspan: 4 },
      { label: 'Receiver Details', colspan: 3 },
      { label: 'Item Details', colspan: 2 },
      { label: 'Tax Bifurcation', colspan: 5 },
    ],
    columns: [
      { key: 'invoiceNo',    label: 'Invoice No.',       type: T, width: 100 },
      { key: 'invoiceDate',  label: 'Invoice Date',      type: D, width: 90 },
      { key: 'invoiceValue', label: 'Invoice Value (₹)', type: C, width: 110, align: 'right' },
      { key: 'supplyType',   label: 'Supply Type',       type: B, width: 60 },   // B2B / B2CS / B2CL
      { key: 'gstin',        label: 'GSTIN/UIN of Recipient', type: T, width: 160 },
      { key: 'receiverName', label: 'Receiver Name',     type: T, width: 140 },
      { key: 'pos',          label: 'Place of Supply',   type: T, width: 80 },    // State code
      { key: 'hsnSac',       label: 'HSN/SAC Code',      type: T, width: 80 },
      { key: 'taxableValue', label: 'Taxable Value (₹)', type: C, width: 110, align: 'right' },
      { key: 'igst',         label: 'IGST (₹)',          type: C, width: 90, align: 'right' },
      { key: 'cgst',         label: 'CGST (₹)',          type: C, width: 90, align: 'right' },
      { key: 'sgst',         label: 'SGST/UTGST (₹)',    type: C, width: 90, align: 'right' },
      { key: 'cess',         label: 'Cess (₹)',          type: C, width: 70, align: 'right' },
      { key: 'gstRate',      label: 'Rate (%)',          type: P, width: 60, align: 'right' },
    ],
    aggregates: [
      { key: 'invoiceValue', fn: 'sum', label: 'Total Invoice Value' },
      { key: 'taxableValue', fn: 'sum', label: 'Total Taxable Value' },
      { key: 'igst',         fn: 'sum', label: 'Total IGST' },
      { key: 'cgst',         fn: 'sum', label: 'Total CGST' },
      { key: 'sgst',         fn: 'sum', label: 'Total SGST' },
      { key: 'cess',         fn: 'sum', label: 'Total Cess' },
    ],
    compute: 'computeGSTR1',
  },

  gstr3b: {
    exportTitle: 'GSTR-3B — Monthly Summary Return',
    statutory: true,
    filters: ['period'],
    columns: [
      { key: 'nature',       label: 'Nature of Supplies',      type: T, width: 200 },
      { key: 'taxableValue', label: 'Total Taxable Value (₹)', type: C, width: 130, align: 'right' },
      { key: 'igst',         label: 'IGST (₹)',                type: C, width: 100, align: 'right' },
      { key: 'cgst',         label: 'CGST (₹)',                type: C, width: 100, align: 'right' },
      { key: 'sgst',         label: 'SGST (₹)',                type: C, width: 100, align: 'right' },
      { key: 'cess',         label: 'Cess (₹)',                type: C, width: 80, align: 'right' },
    ],
    compute: 'computeGSTR3B',
  },

  gst_summary: {
    exportTitle: 'GST Summary Report',
    statutory: true,
    filters: ['dateRange', 'project'],
    columns: [
      { key: 'month',        label: 'Tax Period',              type: T, width: 100 },
      { key: 'outputTax',    label: 'Output Tax (₹)',          type: C, width: 110, align: 'right' },
      { key: 'inputCredit',  label: 'Input Credit (₹)',        type: C, width: 110, align: 'right' },
      { key: 'netPayable',   label: 'Net Tax Payable (₹)',     type: C, width: 120, align: 'right' },
      { key: 'igst',         label: 'IGST (₹)',                type: C, width: 90, align: 'right' },
      { key: 'cgst',         label: 'CGST (₹)',                type: C, width: 90, align: 'right' },
      { key: 'sgst',         label: 'SGST (₹)',                type: C, width: 90, align: 'right' },
    ],
    aggregates: [
      { key: 'outputTax',   fn: 'sum' },
      { key: 'inputCredit', fn: 'sum' },
      { key: 'netPayable',  fn: 'sum' },
    ],
    compute: 'computeGSTSummary',
  },

  gst_hsn: {
    exportTitle: 'HSN-wise Summary of Outward Supplies',
    statutory: true,
    filters: ['dateRange'],
    columns: [
      { key: 'hsnCode',      label: 'HSN/SAC',                 type: T, width: 80 },
      { key: 'description',  label: 'Description',             type: T, width: 180 },
      { key: 'uqc',          label: 'UQC',                     type: T, width: 50 },
      { key: 'totalQty',     label: 'Total Qty',               type: N, width: 80, align: 'right' },
      { key: 'totalValue',   label: 'Total Value (₹)',         type: C, width: 110, align: 'right' },
      { key: 'taxableValue', label: 'Taxable Value (₹)',       type: C, width: 110, align: 'right' },
      { key: 'igst',         label: 'IGST (₹)',                type: C, width: 90, align: 'right' },
      { key: 'cgst',         label: 'CGST (₹)',                type: C, width: 90, align: 'right' },
      { key: 'sgst',         label: 'SGST (₹)',                type: C, width: 90, align: 'right' },
    ],
    compute: 'computeHSNSummary',
  },

  gst_input_credit: {
    exportTitle: 'Input Tax Credit (ITC) Register',
    statutory: true,
    filters: ['dateRange', 'vendor'],
    columns: [
      { key: 'billNo',       label: 'Bill/Invoice No.',        type: T, width: 100 },
      { key: 'date',         label: 'Date',                    type: D, width: 90 },
      { key: 'vendorName',   label: 'Supplier Name',           type: T, width: 150 },
      { key: 'vendorGSTIN',  label: 'Supplier GSTIN',          type: T, width: 160 },
      { key: 'taxableValue', label: 'Taxable Value (₹)',       type: C, width: 110, align: 'right' },
      { key: 'igst',         label: 'IGST Credit (₹)',         type: C, width: 90, align: 'right' },
      { key: 'cgst',         label: 'CGST Credit (₹)',         type: C, width: 90, align: 'right' },
      { key: 'sgst',         label: 'SGST Credit (₹)',         type: C, width: 90, align: 'right' },
      { key: 'eligibility',  label: 'Eligibility',             type: B, width: 80 },
    ],
    compute: 'computeITCRegister',
  },

  // ═══════════════════════════════════════════════
  //  TDS REPORTS — Indian Statutory
  // ═══════════════════════════════════════════════

  tds_deduction: {
    exportTitle: 'TDS Deduction Register',
    statutory: true,
    filters: ['dateRange', 'vendor'],
    columns: [
      { key: 'date',          label: 'Date of Payment',     type: D, width: 90 },
      { key: 'vendorName',    label: 'Deductee Name',       type: T, width: 150 },
      { key: 'pan',           label: 'PAN',                 type: T, width: 100 },
      { key: 'section',       label: 'Section',             type: T, width: 70 },  // 194C, 194J etc.
      { key: 'grossAmount',   label: 'Gross Amount (₹)',    type: C, width: 110, align: 'right' },
      { key: 'tdsRate',       label: 'TDS Rate (%)',        type: P, width: 70, align: 'right' },
      { key: 'tdsAmount',     label: 'TDS Amount (₹)',      type: C, width: 100, align: 'right' },
      { key: 'netPayable',    label: 'Net Payable (₹)',     type: C, width: 100, align: 'right' },
      { key: 'challanNo',     label: 'Challan No.',         type: T, width: 90 },
      { key: 'depositDate',   label: 'Date of Deposit',     type: D, width: 90 },
    ],
    aggregates: [
      { key: 'grossAmount', fn: 'sum' },
      { key: 'tdsAmount',   fn: 'sum' },
      { key: 'netPayable',  fn: 'sum' },
    ],
    compute: 'computeTDSDeduction',
  },

  // ═══════════════════════════════════════════════
  //  MEASUREMENT & BILLING — CPWD / Civil Eng Formats
  // ═══════════════════════════════════════════════

  mb_report: {
    exportTitle: 'Measurement Book (MB)',
    notes: 'Standard CPWD Measurement Book format. L×B×D method for civil quantities.',
    filters: ['project', 'dateRange', 'client'],
    headers: [
      { label: 'Item Reference', colspan: 3 },
      { label: 'Description & Location', colspan: 2 },
      { label: 'Dimensions (Measurement)', colspan: 4 },
      { label: 'Result', colspan: 2 },
    ],
    columns: [
      { key: 'mbPageNo',     label: 'MB Page No.',        type: T, width: 60 },
      { key: 'itemNo',       label: 'Item No.',           type: T, width: 60 },
      { key: 'boqRef',       label: 'BOQ Ref.',           type: T, width: 70 },
      { key: 'description',  label: 'Description of Work',type: T, width: 180 },
      { key: 'location',     label: 'Location / Area',    type: T, width: 100 },
      { key: 'nos',          label: 'No.',                 type: N, width: 40, align: 'right' },
      { key: 'length',       label: 'L (m)',               type: N, width: 60, align: 'right' },
      { key: 'breadth',      label: 'B (m)',               type: N, width: 60, align: 'right' },
      { key: 'depth',        label: 'D/Ht (m)',            type: N, width: 60, align: 'right' },
      { key: 'quantity',     label: 'Qty',                 type: N, width: 70, align: 'right' },
      { key: 'unit',         label: 'Unit',                type: T, width: 50 },
    ],
    aggregates: [
      { key: 'quantity', fn: 'sum', label: 'Total Quantity' },
    ],
    compute: 'computeMBReport',
  },

  detailed_measurement: {
    exportTitle: 'Detailed Measurement Sheet',
    filters: ['project', 'dateRange'],
    columns: [
      { key: 'sheetNo',      label: 'Sheet No.',           type: T, width: 70 },
      { key: 'date',         label: 'Date',                type: D, width: 90 },
      { key: 'itemNo',       label: 'Item No.',            type: T, width: 60 },
      { key: 'description',  label: 'Description',         type: T, width: 180 },
      { key: 'location',     label: 'Location',            type: T, width: 100 },
      { key: 'nos',          label: 'No.',                 type: N, width: 40, align: 'right' },
      { key: 'length',       label: 'L',                   type: N, width: 55, align: 'right' },
      { key: 'breadth',      label: 'B',                   type: N, width: 55, align: 'right' },
      { key: 'depth',        label: 'D',                   type: N, width: 55, align: 'right' },
      { key: 'quantity',     label: 'Qty',                 type: N, width: 70, align: 'right' },
      { key: 'unit',         label: 'Unit',                type: T, width: 50 },
      { key: 'rate',         label: 'Rate (₹)',            type: C, width: 80, align: 'right' },
      { key: 'amount',       label: 'Amount (₹)',          type: C, width: 100, align: 'right' },
    ],
    aggregates: [
      { key: 'amount', fn: 'sum', label: 'Total Amount' },
    ],
    compute: 'computeDetailedMeasurement',
  },

  ra_bill: {
    exportTitle: 'Running Account (RA) Bill',
    notes: 'Progressive billing as per CPWD/MoRTH format. Shows cumulative up-to-date and this-bill quantities.',
    filters: ['project', 'client'],
    headers: [
      { label: 'Item Details', colspan: 3 },
      { label: 'BOQ', colspan: 2 },
      { label: 'Up to Previous RA', colspan: 2 },
      { label: 'This RA Bill', colspan: 2 },
      { label: 'Cumulative', colspan: 2 },
    ],
    columns: [
      { key: 'itemNo',       label: 'S.No.',                type: T, width: 40 },
      { key: 'description',  label: 'Description of Item',  type: T, width: 200 },
      { key: 'unit',         label: 'Unit',                  type: T, width: 50 },
      { key: 'boqQty',       label: 'BOQ Qty',               type: N, width: 70, align: 'right' },
      { key: 'boqRate',      label: 'Rate (₹)',              type: C, width: 80, align: 'right' },
      { key: 'prevQty',      label: 'Prev Qty',              type: N, width: 70, align: 'right' },
      { key: 'prevAmount',   label: 'Prev Amt (₹)',          type: C, width: 90, align: 'right' },
      { key: 'thisQty',      label: 'This Qty',              type: N, width: 70, align: 'right' },
      { key: 'thisAmount',   label: 'This Amt (₹)',          type: C, width: 90, align: 'right' },
      { key: 'cumQty',       label: 'Cum Qty',               type: N, width: 70, align: 'right' },
      { key: 'cumAmount',    label: 'Cum Amt (₹)',           type: C, width: 100, align: 'right' },
    ],
    aggregates: [
      { key: 'prevAmount', fn: 'sum', label: 'Previous Total' },
      { key: 'thisAmount', fn: 'sum', label: 'This Bill Total' },
      { key: 'cumAmount',  fn: 'sum', label: 'Cumulative Total' },
    ],
    compute: 'computeRABill',
  },

  abstract_measurement: {
    exportTitle: 'Abstract of Measurements',
    filters: ['project', 'client'],
    columns: [
      { key: 'itemNo',       label: 'S.No.',                type: T, width: 40 },
      { key: 'description',  label: 'Description',          type: T, width: 200 },
      { key: 'unit',         label: 'Unit',                  type: T, width: 50 },
      { key: 'totalQty',     label: 'Total Qty',             type: N, width: 80, align: 'right' },
      { key: 'rate',         label: 'Rate (₹)',              type: C, width: 80, align: 'right' },
      { key: 'amount',       label: 'Amount (₹)',            type: C, width: 110, align: 'right' },
    ],
    aggregates: [
      { key: 'amount', fn: 'sum', label: 'Grand Total' },
    ],
    compute: 'computeAbstractMeasurement',
  },

  // ═══════════════════════════════════════════════
  //  BBS — Bar Bending Schedule (IS 2502)
  // ═══════════════════════════════════════════════

  bbs_report: {
    exportTitle: 'Bar Bending Schedule (BBS) — IS 2502',
    notes: 'As per IS 2502:1963 standard. Bar shapes per SP 34.',
    filters: ['project'],
    headers: [
      { label: 'Bar Reference', colspan: 3 },
      { label: 'Bar Properties', colspan: 3 },
      { label: 'Cutting Length', colspan: 2 },
      { label: 'Weight', colspan: 2 },
    ],
    columns: [
      { key: 'memberRef',   label: 'Member',              type: T, width: 90 },
      { key: 'barMarkNo',   label: 'Bar Mark No.',        type: T, width: 70 },
      { key: 'barShape',    label: 'Shape Code',          type: T, width: 60 },
      { key: 'diameter',    label: 'Dia (mm)',             type: N, width: 55, align: 'right' },
      { key: 'noOfBars',    label: 'No. of Bars',         type: N, width: 55, align: 'right' },
      { key: 'spacing',     label: 'Spacing (mm)',        type: N, width: 60, align: 'right' },
      { key: 'cuttingLen',  label: 'Cutting Length (m)',   type: N, width: 80, align: 'right' },
      { key: 'totalLen',    label: 'Total Length (m)',     type: N, width: 80, align: 'right' },
      { key: 'unitWt',      label: 'Unit Wt (kg/m)',      type: N, width: 70, align: 'right' },
      { key: 'totalWt',     label: 'Total Wt (kg)',       type: N, width: 80, align: 'right' },
    ],
    aggregates: [
      { key: 'totalLen', fn: 'sum', label: 'Total Length' },
      { key: 'totalWt',  fn: 'sum', label: 'Total Weight' },
    ],
    compute: 'computeBBS',
  },

  // ═══════════════════════════════════════════════
  //  SITE EXECUTION — DPR, Progress, Hindrance
  // ═══════════════════════════════════════════════

  dpr: {
    exportTitle: 'Daily Progress Report (DPR)',
    notes: 'Standard construction site DPR with weather, manpower, equipment, and work done details.',
    filters: ['project', 'dateRange', 'site'],
    columns: [
      { key: 'date',          label: 'Date',               type: D, width: 90 },
      { key: 'activity',      label: 'Activity',           type: T, width: 150 },
      { key: 'location',      label: 'Location',           type: T, width: 100 },
      { key: 'plannedQty',    label: 'Planned Qty',        type: N, width: 70, align: 'right' },
      { key: 'achievedQty',   label: 'Achieved Qty',       type: N, width: 70, align: 'right' },
      { key: 'unit',          label: 'Unit',               type: T, width: 50 },
      { key: 'variance',      label: 'Variance',           type: N, width: 70, align: 'right' },
      { key: 'manpower',      label: 'Manpower',           type: N, width: 60, align: 'right' },
      { key: 'weather',       label: 'Weather',            type: T, width: 70 },
      { key: 'hindrances',    label: 'Hindrances',         type: T, width: 130 },
      { key: 'remarks',       label: 'Remarks',            type: T, width: 100 },
    ],
    compute: 'computeDPR',
  },

  activity_progress: {
    exportTitle: 'Activity-wise Progress Report',
    filters: ['project', 'dateRange'],
    columns: [
      { key: 'activityNo',   label: 'Activity No.',       type: T, width: 60 },
      { key: 'description',  label: 'Activity Description', type: T, width: 200 },
      { key: 'unit',         label: 'Unit',                type: T, width: 50 },
      { key: 'boqQty',       label: 'BOQ Qty',             type: N, width: 70, align: 'right' },
      { key: 'achievedQty',  label: 'Achieved Qty',        type: N, width: 80, align: 'right' },
      { key: 'progressPct',  label: 'Progress (%)',        type: P, width: 70, align: 'right' },
      { key: 'balanceQty',   label: 'Balance Qty',         type: N, width: 80, align: 'right' },
      { key: 'status',       label: 'Status',              type: B, width: 80 },
    ],
    compute: 'computeActivityProgress',
  },

  // ═══════════════════════════════════════════════
  //  MACHINERY & EQUIPMENT
  // ═══════════════════════════════════════════════

  idle_machinery_cost: {
    exportTitle: 'Idle Machinery Cost Report',
    notes: 'Calculates financial loss from equipment idle time based on hourly depreciation or rental rate.',
    filters: ['project', 'dateRange', 'site'],
    columns: [
      { key: 'equipmentId',   label: 'Equipment ID',        type: T, width: 80 },
      { key: 'name',          label: 'Equipment Name',      type: T, width: 140 },
      { key: 'type',          label: 'Owned/Rented',        type: B, width: 70 },
      { key: 'siteName',      label: 'Site / Location',     type: T, width: 120 },
      { key: 'totalHours',    label: 'Total Available (hrs)', type: N, width: 80, align: 'right' },
      { key: 'workingHours',  label: 'Working Hours',       type: N, width: 70, align: 'right' },
      { key: 'idleHours',     label: 'Idle Hours',          type: N, width: 70, align: 'right' },
      { key: 'utilization',   label: 'Utilization (%)',     type: P, width: 70, align: 'right' },
      { key: 'hourlyRate',    label: 'Hourly Rate (₹)',     type: C, width: 80, align: 'right' },
      { key: 'idleCost',      label: 'Idle Cost (₹)',       type: C, width: 100, align: 'right' },
    ],
    aggregates: [
      { key: 'idleHours', fn: 'sum', label: 'Total Idle Hours' },
      { key: 'idleCost',  fn: 'sum', label: 'Total Idle Cost' },
    ],
    compute: 'computeIdleMachineryCost',
  },

  equipment_register: {
    exportTitle: 'Equipment Register',
    filters: ['site'],
    columns: [
      { key: 'slNo',         label: 'S.No.',              type: N, width: 40 },
      { key: 'name',         label: 'Equipment Name',     type: T, width: 140 },
      { key: 'make',         label: 'Make / Model',       type: T, width: 100 },
      { key: 'regNo',        label: 'Reg No.',            type: T, width: 80 },
      { key: 'type',         label: 'Owned/Rented',       type: B, width: 70 },
      { key: 'capacity',     label: 'Capacity',           type: T, width: 70 },
      { key: 'location',     label: 'Current Location',   type: T, width: 120 },
      { key: 'status',       label: 'Status',             type: B, width: 80 },
      { key: 'lastService',  label: 'Last Service',       type: D, width: 90 },
      { key: 'nextService',  label: 'Next Service',       type: D, width: 90 },
    ],
    compute: 'computeEquipmentRegister',
  },

  fuel_consumption: {
    exportTitle: 'Machine Fuel Consumption Report',
    filters: ['project', 'dateRange', 'site'],
    columns: [
      { key: 'date',         label: 'Date',                type: D, width: 90 },
      { key: 'equipmentName',label: 'Equipment',           type: T, width: 140 },
      { key: 'regNo',        label: 'Reg No.',             type: T, width: 80 },
      { key: 'openingKm',    label: 'Opening (km/hr)',     type: N, width: 80, align: 'right' },
      { key: 'closingKm',    label: 'Closing (km/hr)',     type: N, width: 80, align: 'right' },
      { key: 'fuelQty',      label: 'Fuel (L)',            type: N, width: 60, align: 'right' },
      { key: 'fuelRate',     label: 'Rate (₹/L)',          type: C, width: 70, align: 'right' },
      { key: 'fuelCost',     label: 'Cost (₹)',            type: C, width: 80, align: 'right' },
      { key: 'avgConsumption', label: 'Avg (km/L)',        type: N, width: 60, align: 'right' },
    ],
    aggregates: [
      { key: 'fuelQty',  fn: 'sum' },
      { key: 'fuelCost', fn: 'sum' },
    ],
    compute: 'computeFuelConsumption',
  },

  // ═══════════════════════════════════════════════
  //  LABOUR & HR
  // ═══════════════════════════════════════════════

  labour_muster: {
    exportTitle: 'Labour Muster Roll',
    notes: 'As per Building & Other Construction Workers Act. Monthly attendance with OT.',
    filters: ['project', 'period', 'site'],
    columns: [
      { key: 'slNo',         label: 'S.No.',               type: N, width: 40 },
      { key: 'labourName',   label: 'Name of Worker',      type: T, width: 140 },
      { key: 'fatherName',   label: "Father's Name",       type: T, width: 120 },
      { key: 'category',     label: 'Category',            type: T, width: 80 },     // Skilled/Semi/Unskilled
      { key: 'designation',  label: 'Designation',         type: T, width: 80 },
      { key: 'daysPresent',  label: 'Days Present',        type: N, width: 55, align: 'right' },
      { key: 'daysAbsent',   label: 'Days Absent',         type: N, width: 55, align: 'right' },
      { key: 'overtimeHrs',  label: 'OT Hours',            type: N, width: 55, align: 'right' },
      { key: 'wageRate',     label: 'Daily Wage (₹)',      type: C, width: 80, align: 'right' },
      { key: 'basicWage',    label: 'Basic Wage (₹)',      type: C, width: 90, align: 'right' },
      { key: 'otAmount',     label: 'OT Amount (₹)',       type: C, width: 80, align: 'right' },
      { key: 'grossWage',    label: 'Gross Wage (₹)',      type: C, width: 90, align: 'right' },
      { key: 'deductions',   label: 'Deductions (₹)',      type: C, width: 80, align: 'right' },
      { key: 'netPay',       label: 'Net Pay (₹)',         type: C, width: 90, align: 'right' },
    ],
    aggregates: [
      { key: 'basicWage',  fn: 'sum' },
      { key: 'otAmount',   fn: 'sum' },
      { key: 'grossWage',  fn: 'sum' },
      { key: 'deductions', fn: 'sum' },
      { key: 'netPay',     fn: 'sum' },
    ],
    compute: 'computeLabourMuster',
  },

  salary_register: {
    exportTitle: 'Salary Register',
    filters: ['period', 'site'],
    columns: [
      { key: 'slNo',         label: 'S.No.',              type: N, width: 40 },
      { key: 'name',         label: 'Employee Name',      type: T, width: 140 },
      { key: 'designation',  label: 'Designation',        type: T, width: 80 },
      { key: 'daysWorked',   label: 'Days Worked',        type: N, width: 55, align: 'right' },
      { key: 'basicPay',     label: 'Basic Pay (₹)',      type: C, width: 80, align: 'right' },
      { key: 'da',           label: 'DA (₹)',             type: C, width: 70, align: 'right' },
      { key: 'hra',          label: 'HRA (₹)',            type: C, width: 70, align: 'right' },
      { key: 'otherAllow',   label: 'Other Allow. (₹)',   type: C, width: 80, align: 'right' },
      { key: 'grossSalary',  label: 'Gross Salary (₹)',   type: C, width: 90, align: 'right' },
      { key: 'pf',           label: 'PF (₹)',             type: C, width: 70, align: 'right' },
      { key: 'esi',          label: 'ESI (₹)',            type: C, width: 70, align: 'right' },
      { key: 'tds',          label: 'TDS (₹)',            type: C, width: 70, align: 'right' },
      { key: 'otherDed',     label: 'Other Ded. (₹)',     type: C, width: 80, align: 'right' },
      { key: 'netSalary',    label: 'Net Salary (₹)',     type: C, width: 90, align: 'right' },
    ],
    aggregates: [
      { key: 'grossSalary', fn: 'sum' },
      { key: 'netSalary',   fn: 'sum' },
    ],
    compute: 'computeSalaryRegister',
  },

  // ═══════════════════════════════════════════════
  //  SALES REPORTS
  // ═══════════════════════════════════════════════

  invoice_register: {
    exportTitle: 'Sales Invoice Register',
    filters: ['dateRange', 'project', 'client'],
    columns: [
      { key: 'invoiceNo',    label: 'Invoice No.',        type: T, width: 90 },
      { key: 'date',         label: 'Date',               type: D, width: 90 },
      { key: 'clientName',   label: 'Client / Party',     type: T, width: 150 },
      { key: 'projectName',  label: 'Project',            type: T, width: 120 },
      { key: 'hsnSac',       label: 'HSN/SAC',            type: T, width: 70 },
      { key: 'taxableValue', label: 'Taxable Value (₹)',  type: C, width: 100, align: 'right' },
      { key: 'cgst',         label: 'CGST (₹)',           type: C, width: 70, align: 'right' },
      { key: 'sgst',         label: 'SGST (₹)',           type: C, width: 70, align: 'right' },
      { key: 'igst',         label: 'IGST (₹)',           type: C, width: 70, align: 'right' },
      { key: 'totalAmount',  label: 'Total (₹)',          type: C, width: 100, align: 'right' },
      { key: 'status',       label: 'Status',             type: B, width: 70 },
    ],
    aggregates: [
      { key: 'taxableValue', fn: 'sum' },
      { key: 'totalAmount',  fn: 'sum' },
    ],
    compute: 'computeInvoiceRegister',
  },

  client_outstanding: {
    exportTitle: 'Client Outstanding / Receivable Report',
    filters: ['project', 'client'],
    columns: [
      { key: 'clientName',   label: 'Client Name',        type: T, width: 160 },
      { key: 'projectName',  label: 'Project',            type: T, width: 120 },
      { key: 'totalInvoiced', label: 'Total Invoiced (₹)', type: C, width: 110, align: 'right' },
      { key: 'totalReceived', label: 'Received (₹)',      type: C, width: 100, align: 'right' },
      { key: 'tdsDeducted',  label: 'TDS Deducted (₹)',   type: C, width: 90, align: 'right' },
      { key: 'retention',    label: 'Retention (₹)',      type: C, width: 90, align: 'right' },
      { key: 'outstanding',  label: 'Outstanding (₹)',    type: C, width: 110, align: 'right' },
      { key: 'overdueDays',  label: 'Overdue Days',       type: N, width: 60, align: 'right' },
      { key: 'agingBucket',  label: 'Aging',              type: B, width: 70 },
    ],
    aggregates: [
      { key: 'totalInvoiced', fn: 'sum' },
      { key: 'totalReceived', fn: 'sum' },
      { key: 'outstanding',   fn: 'sum' },
    ],
    compute: 'computeClientOutstanding',
  },

  aging_analysis: {
    exportTitle: 'Receivable Aging Analysis',
    filters: ['client'],
    columns: [
      { key: 'clientName',   label: 'Client Name',        type: T, width: 160 },
      { key: 'current',      label: '0-30 Days (₹)',      type: C, width: 90, align: 'right' },
      { key: 'days31_60',    label: '31-60 Days (₹)',     type: C, width: 90, align: 'right' },
      { key: 'days61_90',    label: '61-90 Days (₹)',     type: C, width: 90, align: 'right' },
      { key: 'days91_180',   label: '91-180 Days (₹)',    type: C, width: 90, align: 'right' },
      { key: 'over180',      label: '180+ Days (₹)',      type: C, width: 90, align: 'right' },
      { key: 'totalOutstanding', label: 'Total (₹)',      type: C, width: 100, align: 'right' },
    ],
    aggregates: [
      { key: 'current',    fn: 'sum' },
      { key: 'days31_60',  fn: 'sum' },
      { key: 'days61_90',  fn: 'sum' },
      { key: 'days91_180', fn: 'sum' },
      { key: 'over180',    fn: 'sum' },
      { key: 'totalOutstanding', fn: 'sum' },
    ],
    compute: 'computeAgingAnalysis',
  },

  // ═══════════════════════════════════════════════
  //  PURCHASE / VENDOR
  // ═══════════════════════════════════════════════

  purchase_bill_rpt: {
    exportTitle: 'Purchase Bill Register',
    filters: ['dateRange', 'vendor', 'project'],
    columns: [
      { key: 'billNo',       label: 'Bill / GRN No.',     type: T, width: 90 },
      { key: 'date',         label: 'Date',               type: D, width: 90 },
      { key: 'vendorName',   label: 'Vendor / Supplier',  type: T, width: 150 },
      { key: 'vendorGSTIN',  label: 'Vendor GSTIN',       type: T, width: 160 },
      { key: 'siteName',     label: 'Delivered to Site',   type: T, width: 120 },
      { key: 'taxableValue', label: 'Taxable Value (₹)',  type: C, width: 100, align: 'right' },
      { key: 'cgst',         label: 'CGST (₹)',           type: C, width: 70, align: 'right' },
      { key: 'sgst',         label: 'SGST (₹)',           type: C, width: 70, align: 'right' },
      { key: 'igst',         label: 'IGST (₹)',           type: C, width: 70, align: 'right' },
      { key: 'tdsApplicable',label: 'TDS Applicable',     type: B, width: 60 },
      { key: 'totalAmount',  label: 'Total Amount (₹)',   type: C, width: 100, align: 'right' },
    ],
    aggregates: [
      { key: 'taxableValue', fn: 'sum' },
      { key: 'totalAmount',  fn: 'sum' },
    ],
    compute: 'computePurchaseBillRegister',
  },

  vendor_outstanding: {
    exportTitle: 'Vendor Outstanding / Payable Report',
    filters: ['vendor'],
    columns: [
      { key: 'vendorName',   label: 'Vendor Name',        type: T, width: 160 },
      { key: 'totalBilled',  label: 'Total Billed (₹)',   type: C, width: 100, align: 'right' },
      { key: 'totalPaid',    label: 'Total Paid (₹)',     type: C, width: 100, align: 'right' },
      { key: 'advancePaid',  label: 'Advance (₹)',        type: C, width: 80, align: 'right' },
      { key: 'retentionHeld',label: 'Retention (₹)',      type: C, width: 80, align: 'right' },
      { key: 'outstanding',  label: 'Outstanding (₹)',    type: C, width: 110, align: 'right' },
      { key: 'overdueDays',  label: 'Overdue Days',       type: N, width: 60, align: 'right' },
    ],
    aggregates: [
      { key: 'totalBilled',  fn: 'sum' },
      { key: 'totalPaid',    fn: 'sum' },
      { key: 'outstanding',  fn: 'sum' },
    ],
    compute: 'computeVendorOutstanding',
  },

  // ═══════════════════════════════════════════════
  //  INVENTORY
  // ═══════════════════════════════════════════════

  stock_register: {
    exportTitle: 'Stock Register / Material Ledger',
    filters: ['dateRange', 'site', 'material'],
    columns: [
      { key: 'date',         label: 'Date',               type: D, width: 90 },
      { key: 'materialName', label: 'Material / Item',    type: T, width: 150 },
      { key: 'unit',         label: 'Unit',               type: T, width: 50 },
      { key: 'openingQty',   label: 'Opening Qty',        type: N, width: 70, align: 'right' },
      { key: 'receivedQty',  label: 'Received',           type: N, width: 70, align: 'right' },
      { key: 'issuedQty',    label: 'Issued',             type: N, width: 70, align: 'right' },
      { key: 'closingQty',   label: 'Closing Qty',        type: N, width: 70, align: 'right' },
      { key: 'rate',         label: 'Rate (₹)',           type: C, width: 70, align: 'right' },
      { key: 'closingValue', label: 'Closing Value (₹)',  type: C, width: 100, align: 'right' },
      { key: 'reference',    label: 'GRN / Issue Ref',    type: T, width: 90 },
    ],
    compute: 'computeStockRegister',
  },

  cement_reconciliation: {
    exportTitle: 'Cement Reconciliation Statement',
    notes: 'Mandatory for all RCC/concrete works. Compares theoretical consumption vs actual.',
    filters: ['project', 'dateRange'],
    columns: [
      { key: 'grade',        label: 'Concrete Grade',     type: T, width: 80 },
      { key: 'volume',       label: 'Volume (cum)',        type: N, width: 70, align: 'right' },
      { key: 'mixRatio',     label: 'Mix Ratio',           type: T, width: 60 },
      { key: 'theoreticalCement', label: 'Theoretical (bags)', type: N, width: 80, align: 'right' },
      { key: 'actualCement', label: 'Actual (bags)',       type: N, width: 70, align: 'right' },
      { key: 'variance',     label: 'Variance (%)',        type: P, width: 60, align: 'right' },
      { key: 'remark',       label: 'Remark',              type: T, width: 100 },
    ],
    compute: 'computeCementReconciliation',
  },

  steel_reconciliation: {
    exportTitle: 'Steel Reconciliation Statement',
    notes: 'Compares BBS theoretical steel vs actual consumption per diameter.',
    filters: ['project', 'dateRange'],
    columns: [
      { key: 'diameter',     label: 'Dia (mm)',            type: N, width: 55 },
      { key: 'theoreticalWt',label: 'Theoretical (kg)',    type: N, width: 90, align: 'right' },
      { key: 'actualReceived',label: 'Received (kg)',      type: N, width: 80, align: 'right' },
      { key: 'actualUsed',   label: 'Used (kg)',           type: N, width: 80, align: 'right' },
      { key: 'wastage',      label: 'Wastage (kg)',        type: N, width: 70, align: 'right' },
      { key: 'wastagePct',   label: 'Wastage (%)',         type: P, width: 60, align: 'right' },
      { key: 'balance',      label: 'Balance (kg)',        type: N, width: 70, align: 'right' },
    ],
    compute: 'computeSteelReconciliation',
  },

  // ═══════════════════════════════════════════════
  //  FINANCE — P&L, Cash Book, Trial Balance
  // ═══════════════════════════════════════════════

  pl_statement: {
    exportTitle: 'Profit & Loss Statement',
    filters: ['dateRange', 'project'],
    columns: [
      { key: 'particular',   label: 'Particulars',        type: T, width: 250 },
      { key: 'type',         label: 'Type',               type: B, width: 70 },
      { key: 'amount',       label: 'Amount (₹)',         type: C, width: 130, align: 'right' },
    ],
    compute: 'computePLStatement',
  },

  cash_book: {
    exportTitle: 'Cash Book',
    filters: ['dateRange', 'account'],
    columns: [
      { key: 'date',         label: 'Date',               type: D, width: 90 },
      { key: 'voucherNo',    label: 'Voucher No.',        type: T, width: 80 },
      { key: 'particular',   label: 'Particulars',        type: T, width: 200 },
      { key: 'accountHead',  label: 'Account Head',       type: T, width: 100 },
      { key: 'debit',        label: 'Receipt / Dr (₹)',   type: C, width: 100, align: 'right' },
      { key: 'credit',       label: 'Payment / Cr (₹)',   type: C, width: 100, align: 'right' },
      { key: 'balance',      label: 'Balance (₹)',        type: C, width: 100, align: 'right' },
    ],
    aggregates: [
      { key: 'debit',  fn: 'sum', label: 'Total Receipts' },
      { key: 'credit', fn: 'sum', label: 'Total Payments' },
    ],
    compute: 'computeCashBook',
  },

  project_profitability: {
    exportTitle: 'Project-wise Profitability Statement',
    filters: ['project', 'dateRange'],
    columns: [
      { key: 'projectName',  label: 'Project Name',       type: T, width: 160 },
      { key: 'clientName',   label: 'Client',             type: T, width: 120 },
      { key: 'contractValue',label: 'Contract Value (₹)', type: C, width: 110, align: 'right' },
      { key: 'totalBilled',  label: 'Billed (₹)',         type: C, width: 100, align: 'right' },
      { key: 'totalReceived',label: 'Received (₹)',       type: C, width: 100, align: 'right' },
      { key: 'materialCost', label: 'Material Cost (₹)',  type: C, width: 100, align: 'right' },
      { key: 'labourCost',   label: 'Labour Cost (₹)',    type: C, width: 90, align: 'right' },
      { key: 'equipmentCost',label: 'Eqpt Cost (₹)',      type: C, width: 80, align: 'right' },
      { key: 'overheads',    label: 'Overheads (₹)',      type: C, width: 80, align: 'right' },
      { key: 'totalCost',    label: 'Total Cost (₹)',     type: C, width: 100, align: 'right' },
      { key: 'profit',       label: 'Profit (₹)',         type: C, width: 100, align: 'right' },
      { key: 'margin',       label: 'Margin (%)',         type: P, width: 60, align: 'right' },
    ],
    aggregates: [
      { key: 'totalBilled',  fn: 'sum' },
      { key: 'totalCost',    fn: 'sum' },
      { key: 'profit',       fn: 'sum' },
    ],
    compute: 'computeProjectProfitability',
  },

  // ═══════════════════════════════════════════════
  //  CONSTRUCTION SPECIAL — EVM, WIP, Retention
  // ═══════════════════════════════════════════════

  earned_value: {
    exportTitle: 'Earned Value Management (EVM) Report',
    notes: 'As per PMI/PMBOK methodology. PV, EV, AC, SPI, CPI analysis.',
    filters: ['project'],
    columns: [
      { key: 'activityName', label: 'Activity / WBS',     type: T, width: 180 },
      { key: 'bac',          label: 'BAC (₹)',            type: C, width: 90, align: 'right' },   // Budget at Completion
      { key: 'plannedPct',   label: 'Planned %',          type: P, width: 60, align: 'right' },
      { key: 'actualPct',    label: 'Actual %',           type: P, width: 60, align: 'right' },
      { key: 'pv',           label: 'PV (₹)',             type: C, width: 90, align: 'right' },   // Planned Value
      { key: 'ev',           label: 'EV (₹)',             type: C, width: 90, align: 'right' },   // Earned Value
      { key: 'ac',           label: 'AC (₹)',             type: C, width: 90, align: 'right' },   // Actual Cost
      { key: 'sv',           label: 'SV (₹)',             type: C, width: 80, align: 'right' },   // Schedule Variance
      { key: 'cv',           label: 'CV (₹)',             type: C, width: 80, align: 'right' },   // Cost Variance
      { key: 'spi',          label: 'SPI',                type: N, width: 50, align: 'right' },   // Schedule Perf Index
      { key: 'cpi',          label: 'CPI',                type: N, width: 50, align: 'right' },   // Cost Perf Index
      { key: 'eac',          label: 'EAC (₹)',            type: C, width: 90, align: 'right' },   // Estimate at Completion
    ],
    compute: 'computeEarnedValue',
  },

  retention_recovery: {
    exportTitle: 'Retention Money Recovery Tracker',
    filters: ['project', 'client'],
    columns: [
      { key: 'clientName',   label: 'Client',             type: T, width: 140 },
      { key: 'projectName',  label: 'Project',            type: T, width: 120 },
      { key: 'raBillNo',     label: 'RA Bill No.',        type: T, width: 70 },
      { key: 'billAmount',   label: 'Bill Amount (₹)',    type: C, width: 100, align: 'right' },
      { key: 'retentionPct', label: 'Retention %',        type: P, width: 60, align: 'right' },
      { key: 'retentionAmt', label: 'Retention (₹)',      type: C, width: 90, align: 'right' },
      { key: 'dlpEndDate',   label: 'DLP End Date',       type: D, width: 90 },     // Defect Liability Period
      { key: 'releaseDate',  label: 'Release Date',       type: D, width: 90 },
      { key: 'status',       label: 'Status',             type: B, width: 80 },
    ],
    aggregates: [
      { key: 'retentionAmt', fn: 'sum', label: 'Total Retention' },
    ],
    compute: 'computeRetentionRecovery',
  },

  wip_report: {
    exportTitle: 'Work-in-Progress (WIP) Report',
    filters: ['project'],
    columns: [
      { key: 'projectName',  label: 'Project',            type: T, width: 160 },
      { key: 'contractValue',label: 'Contract Value (₹)', type: C, width: 110, align: 'right' },
      { key: 'completionPct',label: 'Completion (%)',      type: P, width: 70, align: 'right' },
      { key: 'costIncurred', label: 'Cost Incurred (₹)',  type: C, width: 100, align: 'right' },
      { key: 'revRecognized',label: 'Revenue Recognized (₹)', type: C, width: 110, align: 'right' },
      { key: 'billedToDate', label: 'Billed to Date (₹)', type: C, width: 100, align: 'right' },
      { key: 'unbilledRev',  label: 'Unbilled Revenue (₹)', type: C, width: 100, align: 'right' },
      { key: 'wipBalance',   label: 'WIP Balance (₹)',    type: C, width: 100, align: 'right' },
    ],
    aggregates: [
      { key: 'contractValue', fn: 'sum' },
      { key: 'costIncurred',  fn: 'sum' },
      { key: 'wipBalance',    fn: 'sum' },
    ],
    compute: 'computeWIP',
  },

  // ═══════════════════════════════════════════════
  //  SALES & CRM — Lead, Pipeline, Tender
  // ═══════════════════════════════════════════════

  lead_register: {
    exportTitle: 'Lead Register',
    filters: ['dateRange', 'project'],
    columns: [
      { key: 'leadNo',     label: 'Lead No.',          type: T, width: 80 },
      { key: 'date',       label: 'Date',              type: D, width: 90 },
      { key: 'clientName', label: 'Client / Party',    type: T, width: 140 },
      { key: 'contact',    label: 'Contact',           type: T, width: 100 },
      { key: 'source',     label: 'Source',             type: B, width: 80 },
      { key: 'projectType',label: 'Project Type',      type: T, width: 80 },
      { key: 'location',   label: 'Location',          type: T, width: 100 },
      { key: 'estValue',   label: 'Est. Value (₹)',    type: C, width: 110, align: 'right' },
      { key: 'owner',      label: 'Owner',             type: T, width: 80 },
      { key: 'stage',      label: 'Stage',             type: B, width: 80 },
      { key: 'nextFollowup',label: 'Next Follow-up',   type: D, width: 90 },
      { key: 'status',     label: 'Status',            type: B, width: 70 },
    ],
    aggregates: [
      { key: 'estValue', fn: 'sum', label: 'Total Pipeline Value' },
    ],
    compute: 'computeLeadRegister',
  },

  sales_pipeline: {
    exportTitle: 'Sales Pipeline — Weighted Forecast',
    filters: ['dateRange'],
    columns: [
      { key: 'stage',        label: 'Stage',           type: B, width: 80 },
      { key: 'clientName',   label: 'Lead / Client',   type: T, width: 140 },
      { key: 'estValue',     label: 'Est. Value (₹)',  type: C, width: 110, align: 'right' },
      { key: 'probability',  label: 'Probability %',   type: P, width: 70, align: 'right' },
      { key: 'weightedValue',label: 'Weighted Value (₹)',type: C, width: 110, align: 'right' },
      { key: 'expectedClose',label: 'Expected Close',  type: D, width: 90 },
      { key: 'owner',        label: 'Owner',           type: T, width: 80 },
    ],
    aggregates: [
      { key: 'estValue', fn: 'sum' },
      { key: 'weightedValue', fn: 'sum' },
    ],
    compute: 'computeSalesPipeline',
  },

  tender_register: {
    exportTitle: 'Tender Register',
    filters: ['dateRange', 'client'],
    columns: [
      { key: 'tenderNo',       label: 'Tender No.',       type: T, width: 80 },
      { key: 'title',          label: 'Title',            type: T, width: 160 },
      { key: 'clientDept',     label: 'Client / Dept',    type: T, width: 120 },
      { key: 'category',       label: 'Category',         type: B, width: 70 },
      { key: 'emd',            label: 'EMD (₹)',          type: C, width: 80, align: 'right' },
      { key: 'tenderValue',    label: 'Est. Value (₹)',   type: C, width: 100, align: 'right' },
      { key: 'publishDate',    label: 'Publish Date',     type: D, width: 90 },
      { key: 'submissionDate', label: 'Deadline',         type: D, width: 90 },
      { key: 'status',         label: 'Status',           type: B, width: 80 },
    ],
    aggregates: [
      { key: 'tenderValue', fn: 'sum' },
      { key: 'emd', fn: 'sum' },
    ],
    compute: 'computeTenderRegister',
  },

  // ═══════════════════════════════════════════════
  //  PROJECT MANAGEMENT — Weekly, Monthly, Delay, Milestone
  // ═══════════════════════════════════════════════

  weekly_progress: {
    exportTitle: 'Weekly Progress Report',
    filters: ['project', 'dateRange'],
    columns: [
      { key: 'activity',     label: 'Activity',        type: T, width: 180 },
      { key: 'unit',         label: 'Unit',             type: T, width: 50 },
      { key: 'planWeek',     label: 'Plan (Wk)',       type: N, width: 70, align: 'right' },
      { key: 'actualWeek',   label: 'Actual (Wk)',     type: N, width: 70, align: 'right' },
      { key: 'cumPlan',      label: 'Cum Plan',        type: N, width: 70, align: 'right' },
      { key: 'cumActual',    label: 'Cum Actual',      type: N, width: 70, align: 'right' },
      { key: 'pctComplete',  label: '% Complete',      type: P, width: 70, align: 'right' },
      { key: 'slipDays',     label: 'Slip Days',       type: N, width: 60, align: 'right' },
      { key: 'lookAhead',    label: 'Look-ahead',      type: T, width: 140 },
    ],
    compute: 'computeWeeklyProgress',
  },

  delay_analysis: {
    exportTitle: 'Delay Analysis Report',
    filters: ['project'],
    columns: [
      { key: 'activity',     label: 'Activity',         type: T, width: 160 },
      { key: 'plannedEnd',   label: 'Planned End',      type: D, width: 90 },
      { key: 'actualEnd',    label: 'Actual / Forecast', type: D, width: 90 },
      { key: 'delayDays',    label: 'Delay Days',       type: N, width: 60, align: 'right' },
      { key: 'reason',       label: 'Reason',           type: B, width: 90 },
      { key: 'responsible',  label: 'Responsible',      type: T, width: 80 },
      { key: 'costImpact',   label: 'Cost Impact (₹)',  type: C, width: 100, align: 'right' },
      { key: 'recoveryPlan', label: 'Recovery Plan',    type: T, width: 140 },
      { key: 'status',       label: 'Status',           type: B, width: 70 },
    ],
    compute: 'computeDelayAnalysis',
  },

  milestone_tracking: {
    exportTitle: 'Milestone Tracking Report',
    filters: ['project'],
    columns: [
      { key: 'milestone',     label: 'Milestone',        type: T, width: 160 },
      { key: 'description',   label: 'Description',      type: T, width: 120 },
      { key: 'plannedDate',   label: 'Planned Date',     type: D, width: 90 },
      { key: 'actualDate',    label: 'Actual Date',      type: D, width: 90 },
      { key: 'weightage',     label: 'Weightage (%)',     type: P, width: 70, align: 'right' },
      { key: 'status',        label: 'Status',            type: B, width: 80 },
      { key: 'remarks',       label: 'Remarks',           type: T, width: 100 },
    ],
    compute: 'computeMilestoneTracking',
  },

  // ═══════════════════════════════════════════════
  //  PF / ESIC / PAYROLL COMPLIANCE — Statutory
  // ═══════════════════════════════════════════════

  pf_report: {
    exportTitle: 'PF Monthly Contribution Report',
    statutory: true,
    notes: 'As per EPF Act. PF wage cap ₹15,000. EPF 3.67% + EPS 8.33% + EDLI 0.5% + Admin 0.5%.',
    filters: ['period'],
    columns: [
      { key: 'uan',          label: 'UAN',              type: T, width: 120 },
      { key: 'name',         label: 'Name',             type: T, width: 140 },
      { key: 'pfWage',       label: 'PF Wage (₹)',      type: C, width: 90, align: 'right' },
      { key: 'ee12',         label: 'EE 12% (₹)',       type: C, width: 80, align: 'right' },
      { key: 'erEpf',        label: 'ER EPF 3.67% (₹)', type: C, width: 90, align: 'right' },
      { key: 'eps',          label: 'EPS 8.33% (₹)',    type: C, width: 90, align: 'right' },
      { key: 'edli',         label: 'EDLI 0.5% (₹)',    type: C, width: 80, align: 'right' },
      { key: 'admin',        label: 'Admin 0.5% (₹)',   type: C, width: 80, align: 'right' },
      { key: 'total',        label: 'Total (₹)',        type: C, width: 90, align: 'right' },
    ],
    aggregates: [
      { key: 'pfWage', fn: 'sum' },
      { key: 'ee12', fn: 'sum' },
      { key: 'total', fn: 'sum' },
    ],
    compute: 'computePFReport',
  },

  esic_register: {
    exportTitle: 'ESIC Contribution Register',
    statutory: true,
    notes: 'As per ESI Act. Eligibility: gross wage ≤ ₹21,000. EE 0.75%, ER 3.25%.',
    filters: ['period'],
    columns: [
      { key: 'ipNo',        label: 'IP No.',            type: T, width: 100 },
      { key: 'name',        label: 'Name',              type: T, width: 140 },
      { key: 'grossWage',   label: 'Gross Wage (₹)',    type: C, width: 100, align: 'right' },
      { key: 'days',        label: 'Days',              type: N, width: 50, align: 'right' },
      { key: 'ee075',       label: 'EE 0.75% (₹)',      type: C, width: 80, align: 'right' },
      { key: 'er325',       label: 'ER 3.25% (₹)',      type: C, width: 80, align: 'right' },
      { key: 'total',       label: 'Total (₹)',         type: C, width: 90, align: 'right' },
    ],
    aggregates: [
      { key: 'grossWage', fn: 'sum' },
      { key: 'total', fn: 'sum' },
    ],
    compute: 'computeESICRegister',
  },

  payroll_summary: {
    exportTitle: 'Payroll Summary Report',
    filters: ['period', 'project'],
    columns: [
      { key: 'costCentre',  label: 'Cost Centre / Project', type: T, width: 140 },
      { key: 'headcount',   label: 'Headcount',        type: N, width: 60, align: 'right' },
      { key: 'gross',       label: 'Gross (₹)',        type: C, width: 90, align: 'right' },
      { key: 'pf',          label: 'PF (₹)',           type: C, width: 80, align: 'right' },
      { key: 'esic',        label: 'ESIC (₹)',         type: C, width: 70, align: 'right' },
      { key: 'pt',          label: 'PT (₹)',           type: C, width: 60, align: 'right' },
      { key: 'tds',         label: 'TDS (₹)',          type: C, width: 70, align: 'right' },
      { key: 'net',         label: 'Net (₹)',          type: C, width: 90, align: 'right' },
    ],
    aggregates: [
      { key: 'headcount', fn: 'sum' },
      { key: 'gross', fn: 'sum' },
      { key: 'net', fn: 'sum' },
    ],
    compute: 'computePayrollSummary',
  },

  // ═══════════════════════════════════════════════
  //  FINANCE — Cash Flow, Bank Book, Trial Balance, etc.
  // ═══════════════════════════════════════════════

  cash_flow: {
    exportTitle: 'Cash Flow Statement',
    notes: 'Liquidity view: inflows, outflows, projected cash position.',
    filters: ['dateRange', 'project'],
    columns: [
      { key: 'period',      label: 'Month / Week',     type: T, width: 80 },
      { key: 'opening',     label: 'Opening (₹)',      type: C, width: 100, align: 'right' },
      { key: 'collections', label: 'Collections (₹)',  type: C, width: 100, align: 'right' },
      { key: 'otherInflow', label: 'Other Inflow (₹)', type: C, width: 90, align: 'right' },
      { key: 'vendorPay',   label: 'Vendor Pay (₹)',   type: C, width: 100, align: 'right' },
      { key: 'salaryWages', label: 'Salary/Wages (₹)', type: C, width: 90, align: 'right' },
      { key: 'statutory',   label: 'Statutory (₹)',    type: C, width: 80, align: 'right' },
      { key: 'overheads',   label: 'Overheads (₹)',    type: C, width: 80, align: 'right' },
      { key: 'netFlow',     label: 'Net Flow (₹)',     type: C, width: 90, align: 'right' },
      { key: 'closing',     label: 'Closing (₹)',      type: C, width: 100, align: 'right' },
    ],
    aggregates: [
      { key: 'collections', fn: 'sum' },
      { key: 'vendorPay', fn: 'sum' },
      { key: 'netFlow', fn: 'sum' },
    ],
    compute: 'computeCashFlow',
  },

  expense_analysis: {
    exportTitle: 'Expense Analysis Report',
    filters: ['dateRange', 'project'],
    columns: [
      { key: 'expenseHead', label: 'Expense Head',     type: T, width: 140 },
      { key: 'project',     label: 'Project',          type: T, width: 120 },
      { key: 'thisMonth',   label: 'This Month (₹)',   type: C, width: 100, align: 'right' },
      { key: 'lastMonth',   label: 'Last Month (₹)',   type: C, width: 100, align: 'right' },
      { key: 'ytd',         label: 'YTD (₹)',          type: C, width: 100, align: 'right' },
      { key: 'pctTotal',    label: '% of Total',       type: P, width: 60, align: 'right' },
    ],
    aggregates: [
      { key: 'thisMonth', fn: 'sum' },
      { key: 'ytd', fn: 'sum' },
    ],
    compute: 'computeExpenseAnalysis',
  },

  // ═══════════════════════════════════════════════
  //  EQUIPMENT — Utilization, Breakdown, Maintenance
  // ═══════════════════════════════════════════════

  equipment_utilization: {
    exportTitle: 'Equipment Utilization Report',
    notes: 'Run vs idle vs breakdown hours. Fleet utilization and cost per hour.',
    filters: ['project', 'dateRange'],
    columns: [
      { key: 'equipCode',   label: 'Equip Code',       type: T, width: 80 },
      { key: 'name',        label: 'Equipment',        type: T, width: 140 },
      { key: 'ownedHired',  label: 'Owned/Hired',      type: B, width: 70 },
      { key: 'availHrs',    label: 'Available Hrs',     type: N, width: 70, align: 'right' },
      { key: 'runHrs',      label: 'Run Hrs',           type: N, width: 60, align: 'right' },
      { key: 'idleHrs',     label: 'Idle Hrs',          type: N, width: 60, align: 'right' },
      { key: 'breakdownHrs',label: 'B/D Hrs',           type: N, width: 60, align: 'right' },
      { key: 'utilPct',     label: 'Utilization %',     type: P, width: 70, align: 'right' },
      { key: 'costPerHr',   label: 'Cost/Hr (₹)',      type: C, width: 80, align: 'right' },
      { key: 'totalCost',   label: 'Total Cost (₹)',   type: C, width: 100, align: 'right' },
    ],
    aggregates: [
      { key: 'runHrs', fn: 'sum' },
      { key: 'idleHrs', fn: 'sum' },
      { key: 'totalCost', fn: 'sum' },
    ],
    compute: 'computeEquipmentUtilization',
  },

  // ═══════════════════════════════════════════════
  //  LABOUR — Wage Register, Productivity
  // ═══════════════════════════════════════════════

  wage_register: {
    exportTitle: 'Wage Register (Statutory)',
    statutory: true,
    notes: 'As per Minimum Wages Act / CLRA. OT = 2x normal hourly rate per Factories Act.',
    filters: ['project', 'period', 'site'],
    columns: [
      { key: 'name',        label: 'Name',             type: T, width: 140 },
      { key: 'trade',       label: 'Trade',            type: T, width: 80 },
      { key: 'days',        label: 'Days',             type: N, width: 50, align: 'right' },
      { key: 'ratePerDay',  label: 'Rate/Day (₹)',     type: C, width: 80, align: 'right' },
      { key: 'basic',       label: 'Basic (₹)',        type: C, width: 80, align: 'right' },
      { key: 'ot',          label: 'OT (₹)',           type: C, width: 70, align: 'right' },
      { key: 'gross',       label: 'Gross (₹)',        type: C, width: 80, align: 'right' },
      { key: 'pf',          label: 'PF (₹)',           type: C, width: 70, align: 'right' },
      { key: 'esic',        label: 'ESIC (₹)',         type: C, width: 60, align: 'right' },
      { key: 'pt',          label: 'PT (₹)',           type: C, width: 50, align: 'right' },
      { key: 'advance',     label: 'Advance (₹)',      type: C, width: 70, align: 'right' },
      { key: 'netPayable',  label: 'Net Payable (₹)',  type: C, width: 90, align: 'right' },
    ],
    aggregates: [
      { key: 'basic', fn: 'sum' },
      { key: 'gross', fn: 'sum' },
      { key: 'netPayable', fn: 'sum' },
    ],
    compute: 'computeWageRegister',
  },

  labour_productivity: {
    exportTitle: 'Labour Productivity Report',
    notes: 'Output per worker/trade vs norm. Efficiency = Actual/Norm.',
    filters: ['project', 'dateRange'],
    columns: [
      { key: 'trade',       label: 'Trade',            type: T, width: 100 },
      { key: 'activity',    label: 'Activity',         type: T, width: 160 },
      { key: 'unit',        label: 'Unit',             type: T, width: 50 },
      { key: 'output',      label: 'Output',           type: N, width: 70, align: 'right' },
      { key: 'mandays',     label: 'Mandays',          type: N, width: 60, align: 'right' },
      { key: 'productivity',label: 'Prod (out/manday)',type: N, width: 80, align: 'right' },
      { key: 'norm',        label: 'Norm',             type: N, width: 60, align: 'right' },
      { key: 'efficiency',  label: 'Efficiency %',     type: P, width: 70, align: 'right' },
    ],
    compute: 'computeLabourProductivity',
  },

  // ═══════════════════════════════════════════════
  //  QUALITY — Cube Test, NCR
  // ═══════════════════════════════════════════════

  cube_test: {
    exportTitle: 'Cube Test Report (Concrete)',
    statutory: true,
    notes: 'Compressive strength per IS 516 / IS 456. Acceptance criteria per standard.',
    filters: ['project', 'dateRange'],
    columns: [
      { key: 'cubeId',       label: 'Specimen ID',       type: T, width: 80 },
      { key: 'castDate',     label: 'Cast Date',         type: D, width: 90 },
      { key: 'grade',        label: 'Grade',             type: T, width: 50 },
      { key: 'location',     label: 'Pour Location',     type: T, width: 100 },
      { key: 'supplier',     label: 'Supplier',          type: T, width: 100 },
      { key: 'batchNo',      label: 'Batch No',          type: T, width: 80 },
      { key: 'strength7d',   label: '7d Str (MPa)',      type: N, width: 70, align: 'right' },
      { key: 'strength28d',  label: '28d Str (MPa)',     type: N, width: 70, align: 'right' },
      { key: 'reqdStrength', label: 'Reqd Str (MPa)',    type: N, width: 70, align: 'right' },
      { key: 'result',       label: 'Result',            type: B, width: 60 },
      { key: 'testedBy',     label: 'Tested By',         type: T, width: 90 },
    ],
    compute: 'computeCubeTest',
  },

  ncr_report: {
    exportTitle: 'Non-Conformance Report (NCR)',
    filters: ['project', 'dateRange'],
    columns: [
      { key: 'ncrNo',           label: 'NCR No.',           type: T, width: 80 },
      { key: 'date',            label: 'Date Raised',       type: D, width: 90 },
      { key: 'category',        label: 'Category',          type: B, width: 80 },
      { key: 'location',        label: 'Location',          type: T, width: 100 },
      { key: 'description',     label: 'Description',       type: T, width: 160 },
      { key: 'severity',        label: 'Severity',          type: B, width: 70 },
      { key: 'raisedBy',        label: 'Raised By',         type: T, width: 90 },
      { key: 'assignedTo',      label: 'Assigned To',       type: T, width: 90 },
      { key: 'correctiveAction',label: 'Corrective Action', type: T, width: 140 },
      { key: 'targetDate',      label: 'Target Date',       type: D, width: 90 },
      { key: 'status',          label: 'Status',            type: B, width: 70 },
    ],
    compute: 'computeNCR',
  },

  qaqc_inspection: {
    exportTitle: 'QA/QC Inspection Report (ITP)',
    filters: ['project', 'dateRange'],
    columns: [
      { key: 'srNo',         label: '#',               type: N, width: 40, align: 'right' },
      { key: 'date',         label: 'Date',            type: D, width: 90 },
      { key: 'checkType',    label: 'Inspection Type', type: B, width: 120 },
      { key: 'location',     label: 'Location',        type: T, width: 110 },
      { key: 'description',  label: 'Description',     type: T, width: 160 },
      { key: 'inspectedBy',  label: 'Inspected By',    type: T, width: 100 },
      { key: 'result',       label: 'Result',          type: B, width: 90 },
      { key: 'remarks',      label: 'Remarks',         type: T, width: 120 },
    ],
    compute: 'computeQualityInspection',
  },

  // ═══════════════════════════════════════════════
  //  SAFETY — Incident, TBT, PPE
  // ═══════════════════════════════════════════════

  incident_report: {
    exportTitle: 'Incident / Accident Report',
    statutory: true,
    notes: 'As per Factories Act / BOCW. Reportable incidents to DISH/Inspectorate.',
    filters: ['project', 'dateRange'],
    columns: [
      { key: 'incidentNo',    label: 'Incident No.',      type: T, width: 80 },
      { key: 'date',          label: 'Date',              type: D, width: 90 },
      { key: 'type',          label: 'Type',              type: B, width: 80 },
      { key: 'severity',      label: 'Severity',          type: B, width: 70 },
      { key: 'location',      label: 'Location',          type: T, width: 100 },
      { key: 'injuredPerson', label: 'Injured Person',    type: T, width: 100 },
      { key: 'description',   label: 'Description',       type: T, width: 160 },
      { key: 'rootCause',     label: 'Root Cause',        type: T, width: 120 },
      { key: 'actionTaken',   label: 'Action Taken',      type: T, width: 130 },
      { key: 'reportedBy',    label: 'Reported By',       type: T, width: 90 },
      { key: 'status',        label: 'Status',            type: B, width: 60 },
    ],
    compute: 'computeIncidentReport',
  },

  ppe_compliance: {
    exportTitle: 'PPE Compliance Report',
    filters: ['project', 'dateRange'],
    columns: [
      { key: 'date',          label: 'Date',             type: D, width: 80 },
      { key: 'workerName',    label: 'Worker',           type: T, width: 100 },
      { key: 'area',          label: 'Area',             type: T, width: 90 },
      { key: 'helmet',        label: 'Helmet',           type: B, width: 55 },
      { key: 'safetyShoes',   label: 'Shoes',            type: B, width: 55 },
      { key: 'vest',          label: 'Vest',             type: B, width: 55 },
      { key: 'gloves',        label: 'Gloves',           type: B, width: 55 },
      { key: 'goggles',       label: 'Goggles',          type: B, width: 55 },
      { key: 'harness',       label: 'Harness',          type: B, width: 55 },
      { key: 'compliancePct', label: 'Compliance %',     type: P, width: 70, align: 'right' },
      { key: 'remarks',       label: 'Remarks',          type: T, width: 100 },
    ],
    compute: 'computePPECompliance',
  },

  // ═══════════════════════════════════════════════
  //  EXECUTIVE MIS — Project Profitability, EVM, Risk
  // ═══════════════════════════════════════════════

  mis_project_profit: {
    exportTitle: 'Project Profitability (MIS)',
    notes: 'Real margin per project: contract value, cost-to-date, forecast margin.',
    filters: ['project'],
    columns: [
      { key: 'project',     label: 'Project',          type: T, width: 140 },
      { key: 'client',      label: 'Client',           type: T, width: 120 },
      { key: 'contractValue',label: 'Contract Value (₹)',type: C, width: 110, align: 'right' },
      { key: 'billed',      label: 'Billed (₹)',       type: C, width: 100, align: 'right' },
      { key: 'collected',   label: 'Collected (₹)',    type: C, width: 100, align: 'right' },
      { key: 'costToDate',  label: 'Cost-to-date (₹)', type: C, width: 100, align: 'right' },
      { key: 'forecastMargin',label: 'Forecast Margin (₹)',type: C, width: 100, align: 'right' },
      { key: 'marginPct',   label: 'Margin %',         type: P, width: 60, align: 'right' },
      { key: 'pctComplete', label: '% Complete',        type: P, width: 60, align: 'right' },
      { key: 'status',      label: 'Status',           type: B, width: 70 },
    ],
    aggregates: [
      { key: 'contractValue', fn: 'sum' },
      { key: 'billed', fn: 'sum' },
      { key: 'costToDate', fn: 'sum' },
    ],
    compute: 'computeMISProjectProfit',
  },

};

/**
 * getReportDefinition(reportId)
 * Returns the domain config for a report, or null if not defined.
 * Reports without explicit definitions fall back to generic rendering.
 */
export function getReportDefinition(reportId) {
  return REPORT_DEFINITIONS[reportId] || null;
}

/**
 * getAllDefinedReportIds()
 */
export function getAllDefinedReportIds() {
  return Object.keys(REPORT_DEFINITIONS);
}
