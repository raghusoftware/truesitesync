/**
 * ═══════════════════════════════════════════════════════════
 * True Site Sync — Dynamic Report Engine
 * ═══════════════════════════════════════════════════════════
 * Accepts dynamic parameters (dataSource, dateRange, filters,
 * groupBy, aggregates) and processes localStorage state data
 * into clean JSON ready for rendering.
 * ═══════════════════════════════════════════════════════════
 */

import { state } from './state.js';
import { formatINR } from './utils.js';
import { getReportDefinition } from '../config/reportDefinitions.js';

// ────────────────────────────────────────────
//  REPORT CATALOG — 400+ reports organized by category
// ────────────────────────────────────────────
export const REPORT_CATEGORIES = [
  {
    id: 'dashboard', name: 'Dashboard & MIS', icon: '📊', color: '#10b981',
    reports: [
      { id: 'company_mis', name: 'Company MIS Dashboard', type: 'dashboard' },
      { id: 'project_mis', name: 'Project MIS Dashboard', type: 'dashboard' },
      { id: 'daily_exec', name: 'Daily Executive Dashboard', type: 'dashboard' },
      { id: 'monthly_mgmt', name: 'Monthly Management Dashboard', type: 'dashboard' },
      { id: 'director_summary', name: 'Director Summary Report', type: 'dashboard' },
      { id: 'kpi_performance', name: 'KPI Performance Report', type: 'kpi' },
      { id: 'profitability_dash', name: 'Profitability Dashboard', type: 'dashboard' },
      { id: 'cash_position', name: 'Cash Position Dashboard', type: 'dashboard' },
      { id: 'revenue_forecast', name: 'Revenue Forecast Dashboard', type: 'dashboard' },
      { id: 'cost_overrun', name: 'Cost Overrun Dashboard', type: 'dashboard' },
      { id: 'delayed_project', name: 'Delayed Project Dashboard', type: 'dashboard' },
      { id: 'resource_util', name: 'Resource Utilization Dashboard', type: 'dashboard' },
      { id: 'recovery_collection', name: 'Recovery & Collection Dashboard', type: 'dashboard' },
      { id: 'business_growth', name: 'Business Growth Dashboard', type: 'dashboard' },
      { id: 'risk_monitoring', name: 'Risk Monitoring Dashboard', type: 'dashboard' },
      { id: 'exec_decision', name: 'Executive Decision Support Report', type: 'dashboard' },
    ]
  },
  {
    id: 'sales', name: 'Sales & CRM', icon: '💰', color: '#3b82f6',
    reports: [
      { id: 'lead_register', name: 'Lead Register', type: 'table' },
      { id: 'inquiry_report', name: 'Inquiry Report', type: 'table' },
      { id: 'followup_report', name: 'Follow-Up Report', type: 'table' },
      { id: 'sales_pipeline', name: 'Sales Pipeline', type: 'table' },
      { id: 'conversion_analysis', name: 'Conversion Analysis', type: 'table' },
      { id: 'tender_register', name: 'Tender Register', type: 'table' },
      { id: 'tender_comparison', name: 'Tender Comparison', type: 'table' },
      { id: 'client_sales', name: 'Client-wise Sales Report', type: 'table', dataSource: 'saleInvoices', groupBy: 'clientId' },
      { id: 'project_sales', name: 'Project-wise Sales Report', type: 'table', dataSource: 'saleInvoices', groupBy: 'projectId' },
      { id: 'monthly_sales', name: 'Monthly Sales Report', type: 'table', dataSource: 'saleInvoices', groupBy: 'month' },
      { id: 'yearly_sales', name: 'Yearly Sales Report', type: 'table', dataSource: 'saleInvoices', groupBy: 'year' },
      { id: 'sales_trend', name: 'Sales Trend Analysis', type: 'chart' },
      { id: 'quotation_register', name: 'Quotation Register', type: 'table' },
      { id: 'estimate_register', name: 'Estimate Register', type: 'table', dataSource: 'estimates' },
      { id: 'boq_report', name: 'BOQ Report', type: 'table' },
      { id: 'work_order', name: 'Work Order / Sales Order', type: 'table' },
      { id: 'sales_order', name: 'Sales Order Report', type: 'table', dataSource: 'saleOrders' },
      { id: 'revenue_projection', name: 'Revenue Projection Report', type: 'kpi' },
      { id: 'client_profitability', name: 'Client Profitability Report', type: 'table' },
      { id: 'lost_analysis', name: 'Lost Inquiry Analysis', type: 'table' },
      { id: 'invoice_register', name: 'Invoice Register', type: 'table', dataSource: 'saleInvoices' },
      { id: 'proforma_register', name: 'Proforma Invoice Report', type: 'table', dataSource: 'proformaInvoices' },
      { id: 'delivery_challan', name: 'Delivery Challan Report', type: 'table', dataSource: 'deliveryChallans' },
      { id: 'sale_return', name: 'Sale Return Report', type: 'table', dataSource: 'saleReturns' },
      { id: 'client_outstanding', name: 'Client Outstanding Report', type: 'table' },
      { id: 'aging_analysis', name: 'Aging Analysis Report', type: 'table' },
      { id: 'collection_tracking', name: 'Collection Tracking Report', type: 'table' },
    ]
  },
  {
    id: 'estimation', name: 'Estimation & Costing', icon: '🧮', color: '#8b5cf6',
    reports: [
      { id: 'detailed_estimate', name: 'Detailed Estimate Report', type: 'table', dataSource: 'estimates' },
      { id: 'abstract_estimate', name: 'Abstract Estimate Report', type: 'table', dataSource: 'abstracts' },
      { id: 'rate_analysis', name: 'Rate Analysis (CPWD/DSR)', type: 'table' },
      { id: 'boq_comparison', name: 'BOQ Comparison', type: 'table' },
      { id: 'budget_vs_actual', name: 'Budget vs Actual Cost', type: 'table' },
      { id: 'cost_variance', name: 'Cost Variance Report', type: 'table' },
      { id: 'profit_margin', name: 'Profit Margin Analysis', type: 'kpi' },
      { id: 'item_costing', name: 'Item-wise Costing Report', type: 'table' },
      { id: 'resource_costing', name: 'Resource Costing Report', type: 'table' },
      { id: 'tender_costing', name: 'Tender Costing Sheet', type: 'table' },
      { id: 'escalation_analysis', name: 'Escalation Analysis', type: 'table' },
      { id: 'theoretical_consumption', name: 'Theoretical Consumption Report', type: 'table' },
      { id: 'est_vs_actual', name: 'Estimate vs Actual Consumption', type: 'table' },
    ]
  },
  {
    id: 'execution', name: 'Project Management', icon: '🏗️', color: '#f59e0b',
    reports: [
      { id: 'dpr', name: 'Daily Progress Report (DPR)', type: 'table' },
      { id: 'weekly_progress', name: 'Weekly Progress Report', type: 'table' },
      { id: 'monthly_progress', name: 'Monthly Progress Report', type: 'table' },
      { id: 'activity_progress', name: 'Activity Progress Report', type: 'table' },
      { id: 'delay_analysis', name: 'Delay Analysis Report', type: 'table' },
      { id: 'milestone_tracking', name: 'Milestone Tracking', type: 'table' },
      { id: 'baseline_vs_actual', name: 'Baseline vs Actual Schedule', type: 'table' },
      { id: 'recovery_schedule', name: 'Recovery Schedule', type: 'table' },
      { id: 'resource_planning', name: 'Resource Planning', type: 'table' },
      { id: 'site_issue_tracker', name: 'Site Issue Tracker', type: 'table' },
      { id: 'work_completion', name: 'Work Completion Report', type: 'table' },
      { id: 'area_progress', name: 'Area-wise Progress Report', type: 'table' },
      { id: 'site_expense', name: 'Site Expense Report', type: 'table' },
      { id: 'site_consumption', name: 'Site Consumption Report', type: 'table' },
      { id: 'hindrance', name: 'Hindrance Report', type: 'table' },
    ]
  },
  {
    id: 'measurement', name: 'Measurement & Billing', icon: '📐', color: '#06b6d4',
    reports: [
      { id: 'mb_report', name: 'Measurement Book (MB) Report', type: 'table', dataSource: 'sheets' },
      { id: 'detailed_measurement', name: 'Detailed Measurement Sheet', type: 'table', dataSource: 'sheets' },
      { id: 'simple_measurement', name: 'Simple Measurement Sheet', type: 'table', dataSource: 'sheets' },
      { id: 'item_measurement', name: 'Item-wise Measurement', type: 'table' },
      { id: 'location_measurement', name: 'Location-wise Measurement', type: 'table' },
      { id: 'abstract_measurement', name: 'Abstract of Measurement', type: 'table', dataSource: 'abstracts' },
      { id: 'ra_bill', name: 'Running Account (RA) Bill', type: 'table' },
      { id: 'billing_register', name: 'Billing Register', type: 'table' },
      { id: 'gst_invoice', name: 'GST Invoice Report', type: 'table', dataSource: 'saleInvoices' },
      { id: 'final_bill', name: 'Final Bill', type: 'table' },
      { id: 'tax_invoice', name: 'Tax Invoice (GST)', type: 'table' },
      { id: 'einvoice', name: 'E-Invoice (IRN)', type: 'table' },
      { id: 'debit_credit_note', name: 'Debit Note / Credit Note', type: 'table' },
      { id: 'bill_pending', name: 'Bill Pending Report', type: 'table' },
      { id: 'bill_certification', name: 'Bill Certification Report', type: 'table' },
    ]
  },
  {
    id: 'purchase', name: 'Purchase & Procurement', icon: '🛒', color: '#ef4444',
    reports: [
      { id: 'purchase_requisition', name: 'Purchase Requisition (PR)', type: 'table' },
      { id: 'rfq_report', name: 'RFQ (Request for Quotation)', type: 'table' },
      { id: 'comparative_statement', name: 'Comparative Statement', type: 'table' },
      { id: 'purchase_order_rpt', name: 'Purchase Order (PO)', type: 'table', dataSource: 'purchaseOrders' },
      { id: 'grn_report', name: 'GRN (Goods Receipt Note)', type: 'table' },
      { id: 'material_inspection', name: 'Material Inspection Report', type: 'table' },
      { id: 'po_pending', name: 'PO Pending Report', type: 'table' },
      { id: 'vendor_purchase', name: 'Vendor-wise Purchase Report', type: 'table', dataSource: 'vendorMaterials', groupBy: 'vendorId' },
      { id: 'item_purchase', name: 'Item-wise Purchase Report', type: 'table' },
      { id: 'purchase_return_rpt', name: 'Purchase Return Report', type: 'table', dataSource: 'purchaseReturns' },
      { id: 'vendor_outstanding', name: 'Vendor Outstanding Report', type: 'table' },
      { id: 'vendor_aging', name: 'Vendor Aging Report', type: 'table' },
      { id: 'supplier_performance', name: 'Supplier Performance Report', type: 'table' },
      { id: 'purchase_bill_rpt', name: 'Purchase Bill Register', type: 'table', dataSource: 'vendorMaterials' },
      { id: 'rate_comparison', name: 'Rate Comparison / Trend', type: 'table' },
      { id: 'purchase_tax', name: 'Purchase Tax Report', type: 'table' },
    ]
  },
  {
    id: 'inventory', name: 'Inventory & Store', icon: '📦', color: '#f97316',
    reports: [
      { id: 'stock_register', name: 'Stock Register', type: 'table', dataSource: 'inventoryTx' },
      { id: 'material_ledger', name: 'Material Ledger', type: 'table' },
      { id: 'current_stock', name: 'Current Stock Report', type: 'table' },
      { id: 'site_stock', name: 'Site-wise Stock Report', type: 'table' },
      { id: 'material_inward', name: 'Material Inward Report', type: 'table' },
      { id: 'material_outward', name: 'Material Outward Report', type: 'table' },
      { id: 'material_consumption', name: 'Material Consumption Report', type: 'table', dataSource: 'inventoryTx' },
      { id: 'material_reconciliation', name: 'Material Reconciliation Report', type: 'table' },
      { id: 'cement_reconciliation', name: 'Cement Reconciliation', type: 'table' },
      { id: 'steel_reconciliation', name: 'Steel Reconciliation', type: 'table' },
      { id: 'slow_moving', name: 'Slow Moving Stock Report', type: 'table' },
      { id: 'dead_stock', name: 'Dead Stock Report', type: 'table' },
      { id: 'reorder_level', name: 'Reorder Alert Report', type: 'table' },
      { id: 'scrap_report', name: 'Scrap Report', type: 'table' },
      { id: 'wastage_report', name: 'Wastage Report', type: 'table' },
      { id: 'inventory_valuation', name: 'Inventory Valuation (FIFO/WAVG)', type: 'table' },
    ]
  },
  {
    id: 'equipment', name: 'Machinery & Equipment', icon: '🚜', color: '#78716c',
    reports: [
      { id: 'equipment_register', name: 'Equipment Register', type: 'table', dataSource: 'equipment' },
      { id: 'equipment_utilization', name: 'Equipment Utilization', type: 'table' },
      { id: 'equipment_breakdown', name: 'Breakdown Report', type: 'table' },
      { id: 'maintenance_schedule', name: 'Maintenance Schedule', type: 'table' },
      { id: 'fuel_consumption', name: 'Fuel Consumption Report', type: 'table' },
      { id: 'operator_log', name: 'Operator Log', type: 'table' },
      { id: 'spare_consumption', name: 'Spare Consumption', type: 'table' },
      { id: 'equipment_costing', name: 'Equipment Costing Report', type: 'table' },
      { id: 'rental_equipment', name: 'Rental Equipment Report', type: 'table' },
      { id: 'idle_machinery_cost', name: 'Idle Machinery Cost Report', type: 'kpi' },
    ]
  },
  {
    id: 'labour', name: 'Labour & Payroll', icon: '👷', color: '#0ea5e9',
    reports: [
      { id: 'labour_muster', name: 'Labour Muster Roll (Statutory)', type: 'table' },
      { id: 'wage_register', name: 'Wage Register (Statutory)', type: 'table' },
      { id: 'salary_register', name: 'Salary Register', type: 'table' },
      { id: 'labour_attendance', name: 'Labour Attendance Report', type: 'table', dataSource: 'attendance' },
      { id: 'daily_strength', name: 'Daily Labour Strength', type: 'table' },
      { id: 'overtime_report', name: 'Overtime Report', type: 'table' },
      { id: 'labour_productivity', name: 'Labour Productivity Report', type: 'table' },
      { id: 'contractor_bill', name: 'Contractor Labour Bill', type: 'table' },
      { id: 'manpower_deployment', name: 'Manpower Deployment Report', type: 'table' },
      { id: 'labour_cost', name: 'Labour Cost Report', type: 'table' },
      { id: 'employee_performance', name: 'Employee Performance Report', type: 'table' },
    ]
  },
  {
    id: 'finance', name: 'Finance & Accounts', icon: '🏦', color: '#059669',
    reports: [
      { id: 'cash_book', name: 'Cash Book', type: 'table' },
      { id: 'bank_book', name: 'Bank Book', type: 'table' },
      { id: 'ledger_report', name: 'Ledger Report', type: 'table' },
      { id: 'trial_balance', name: 'Trial Balance', type: 'table' },
      { id: 'pl_statement', name: 'Profit & Loss Statement', type: 'table' },
      { id: 'balance_sheet', name: 'Balance Sheet (Sch III)', type: 'table' },
      { id: 'cash_flow', name: 'Cash Flow Statement', type: 'table' },
      { id: 'fund_flow', name: 'Fund Flow Statement', type: 'table' },
      { id: 'bank_reconciliation', name: 'Bank Reconciliation (BRS)', type: 'table' },
      { id: 'petty_cash', name: 'Petty Cash Report', type: 'table' },
      { id: 'expense_analysis', name: 'Expense Analysis Report', type: 'table' },
      { id: 'project_profitability', name: 'Project-wise Profitability', type: 'table' },
      { id: 'receivable_report', name: 'Accounts Receivable', type: 'table' },
      { id: 'payable_report', name: 'Accounts Payable', type: 'table' },
      { id: 'fixed_asset_register', name: 'Fixed Asset Register', type: 'table', dataSource: 'fixedAssets' },
      { id: 'depreciation', name: 'Depreciation Schedule', type: 'table' },
      { id: 'cash_burn_rate', name: 'Cash Burn Rate Report', type: 'kpi' },
      { id: 'forecast_cash', name: 'Forecast Cash Requirement', type: 'kpi' },
    ]
  },
  {
    id: 'gst', name: 'GST Reports', icon: '🏛️', color: '#7c3aed',
    reports: [
      { id: 'gstr1', name: 'GSTR-1 (Outward Supplies)', type: 'table', dataSource: 'saleInvoices' },
      { id: 'gstr2', name: 'GSTR-2A/2B (ITC Recon)', type: 'table' },
      { id: 'gstr3b', name: 'GSTR-3B (Summary Return)', type: 'table' },
      { id: 'gstr9', name: 'GSTR-9 (Annual Return)', type: 'table' },
      { id: 'gst_sales', name: 'GST Sales Register', type: 'table', dataSource: 'saleInvoices' },
      { id: 'gst_purchase', name: 'GST Purchase Register', type: 'table' },
      { id: 'gst_input_credit', name: 'Input Tax Credit (ITC)', type: 'table' },
      { id: 'gst_output', name: 'Output Liability Report', type: 'table' },
      { id: 'reverse_charge', name: 'Reverse Charge (RCM)', type: 'table' },
      { id: 'gst_hsn', name: 'HSN/SAC Summary', type: 'table' },
      { id: 'gst_summary', name: 'GST Summary Report', type: 'table' },
      { id: 'eway_bill', name: 'E-Way Bill Register', type: 'table' },
    ]
  },
  {
    id: 'tds', name: 'TDS (Income Tax)', icon: '📋', color: '#dc2626',
    reports: [
      { id: 'tds_deduction', name: 'TDS Deduction Register', type: 'table' },
      { id: 'tds_payable', name: 'TDS Payable Report', type: 'table' },
      { id: 'tds_receivable', name: 'TDS Receivable Report', type: 'table' },
      { id: 'form_26q', name: 'Form 26Q (Non-salary TDS)', type: 'table' },
      { id: 'form_27q', name: 'Form 27Q (Non-resident TDS)', type: 'table' },
      { id: 'form_16a', name: 'Form 16A (TDS Certificate)', type: 'table' },
      { id: 'vendor_tds', name: 'Vendor TDS Summary', type: 'table' },
      { id: 'client_tds', name: 'Client TDS Summary', type: 'table' },
    ]
  },
  {
    id: 'statutory', name: 'PF / ESIC / Compliance', icon: '🏛️', color: '#9333ea',
    reports: [
      { id: 'pf_report', name: 'PF Monthly Contribution', type: 'table' },
      { id: 'pf_ecr', name: 'PF ECR (Electronic Challan)', type: 'table' },
      { id: 'pf_challan', name: 'PF Challan', type: 'table' },
      { id: 'uan_register', name: 'UAN Register', type: 'table' },
      { id: 'esic_register', name: 'ESIC Register', type: 'table' },
      { id: 'esic_challan', name: 'ESIC Challan', type: 'table' },
      { id: 'pt_report', name: 'Professional Tax Report', type: 'table' },
      { id: 'form_16', name: 'Form 16 (Salary TDS Certificate)', type: 'table' },
      { id: 'form_24q', name: 'Form 24Q (Salary TDS Return)', type: 'table' },
      { id: 'payroll_summary', name: 'Payroll Summary', type: 'table' },
      { id: 'bank_transfer', name: 'Salary Bank Transfer', type: 'table' },
    ]
  },
  {
    id: 'payment', name: 'Payments', icon: '💳', color: '#16a34a',
    reports: [
      { id: 'payment_in_rpt', name: 'Payment In Report', type: 'table', dataSource: 'paymentsIn' },
      { id: 'payment_out_rpt', name: 'Payment Out Report', type: 'table', dataSource: 'paymentOut' },
      { id: 'expense_category', name: 'Expense Category Report', type: 'table', dataSource: 'expenses' },
      { id: 'payment_delay', name: 'Client Payment Delay Analysis', type: 'table' },
      { id: 'vendor_dependency', name: 'Vendor Dependency Analysis', type: 'table' },
      { id: 'other_income_rpt', name: 'Other Income Report', type: 'table', dataSource: 'otherIncome' },
    ]
  },
  {
    id: 'construction', name: 'Construction Special', icon: '🔩', color: '#b45309',
    reports: [
      { id: 'bbs_report', name: 'Bar Bending Schedule (BBS)', type: 'table' },
      { id: 'concrete_pour', name: 'Concrete Pour Card / RMC Recon', type: 'table' },
      { id: 'fabrication_tracking', name: 'Fabrication Tracking (Steel)', type: 'table' },
      { id: 'erection_tracking', name: 'Erection Tracking', type: 'table' },
      { id: 'wip_report', name: 'Work-in-Progress (WIP)', type: 'kpi' },
      { id: 'earned_value', name: 'Earned Value Management (EVM)', type: 'kpi' },
      { id: 'variation_claim', name: 'Variation / Claim Register', type: 'table' },
      { id: 'escalation_claim', name: 'Escalation Claim', type: 'table' },
      { id: 'retention_recovery', name: 'Retention Recovery Tracking', type: 'table' },
      { id: 'cost_to_complete', name: 'Cost to Complete Report', type: 'kpi' },
      { id: 'forecast_billing', name: 'Forecast Billing Report', type: 'kpi' },
      { id: 'shutdown_report', name: 'Shutdown Project Report', type: 'table' },
      { id: 'running_contract', name: 'Running Contract Balance', type: 'table' },
      { id: 'multi_site_consolidation', name: 'Multi-Site Consolidation', type: 'table' },
    ]
  },
  {
    id: 'quality', name: 'Quality (QA/QC)', icon: '✅', color: '#0d9488',
    reports: [
      { id: 'cube_test', name: 'Cube Test Report (Concrete)', type: 'table' },
      { id: 'slump_test', name: 'Slump Test Report', type: 'table' },
      { id: 'weld_test', name: 'Weld Test / NDT Report', type: 'table' },
      { id: 'qaqc_inspection', name: 'Inspection Report (ITP)', type: 'table' },
      { id: 'ncr_report', name: 'Non-Conformance Report (NCR)', type: 'table' },
      { id: 'rework_analysis', name: 'Rework Analysis Report', type: 'table' },
      { id: 'qaqc_checklist', name: 'QA/QC Checklist', type: 'table' },
      { id: 'material_testing', name: 'Material Testing Report', type: 'table' },
    ]
  },
  {
    id: 'safety', name: 'Safety (EHS)', icon: '⛑️', color: '#e11d48',
    reports: [
      { id: 'incident_report', name: 'Incident / Accident Report', type: 'table' },
      { id: 'near_miss', name: 'Near Miss Report', type: 'table' },
      { id: 'toolbox_talk', name: 'Toolbox Talk (TBT)', type: 'table' },
      { id: 'safety_inspection', name: 'Safety Inspection Report', type: 'table' },
      { id: 'ppe_compliance', name: 'PPE Compliance Report', type: 'table' },
      { id: 'work_permit', name: 'Work Permit Register', type: 'table' },
    ]
  },
  {
    id: 'mis', name: 'Executive MIS', icon: '🤖', color: '#6366f1',
    reports: [
      { id: 'mis_project_profit', name: 'Project Profitability (MIS)', type: 'table' },
      { id: 'mis_cost_overrun', name: 'Cost Overrun Report', type: 'table' },
      { id: 'mis_cash_burn', name: 'Cash Burn Report', type: 'table' },
      { id: 'mis_forecast_billing', name: 'Forecast Billing', type: 'table' },
      { id: 'mis_forecast_cash', name: 'Forecast Cash Requirement', type: 'table' },
      { id: 'mis_evm', name: 'Earned Value Management (EVM)', type: 'table' },
      { id: 'mis_resource_forecast', name: 'Resource Forecast', type: 'table' },
      { id: 'mis_risk', name: 'Risk Heatmap / Register', type: 'table' },
      { id: 'mis_dashboard', name: 'Growth KPI / Company Dashboard', type: 'dashboard' },
      { id: 'predictive_cashflow', name: 'Predictive Cash Flow', type: 'dashboard' },
    ]
  },
];

// ────────────────────────────────────────────
//  REPORT ENGINE CLASS
// ────────────────────────────────────────────
export class ReportEngine {
  constructor() {
    this.state = state;
  }

  /**
   * Main query method — fetches, filters, groups, aggregates
   * @param {Object} params
   * @param {string} params.dataSource — state key to query
   * @param {Object} params.dateRange — { start, end }
   * @param {Object} params.filters — { projectId, clientId, vendorId, siteId, status }
   * @param {string} params.groupBy — 'clientId','projectId','vendorId','month','year','category'
   * @param {Array}  params.aggregates — ['sum:total','count','avg:rate']
   * @returns {Object} { rows, summary, columns, kpis }
   */
  query({ dataSource, dateRange, filters = {}, groupBy, aggregates = [] }) {
    // Get raw data from state
    let data = this._getDataSource(dataSource);
    if (!data || !data.length) return { rows: [], summary: {}, columns: [], kpis: {} };

    // Apply date filter
    if (dateRange?.start || dateRange?.end) {
      data = data.filter(r => {
        const d = r.date || r.createdAt || '';
        if (dateRange.start && d < dateRange.start) return false;
        if (dateRange.end && d > dateRange.end) return false;
        return true;
      });
    }

    // Apply filters (handle projectId ↔ siteId equivalence)
    Object.entries(filters).forEach(([key, val]) => {
      if (!val) return;
      if (key === 'projectId') {
        data = data.filter(r => r.projectId === val || r.siteId === val);
      } else if (key === 'siteId') {
        data = data.filter(r => r.siteId === val || r.projectId === val);
      } else {
        data = data.filter(r => r[key] === val);
      }
    });

    // Compute summary KPIs
    const kpis = this._computeKPIs(data, dataSource);

    // Group if needed
    if (groupBy) {
      const grouped = this._groupData(data, groupBy, aggregates, dataSource);
      return { rows: grouped.rows, summary: grouped.summary, columns: grouped.columns, kpis };
    }

    // Return flat table
    const columns = this._inferColumns(data, dataSource);
    return { rows: data, summary: { totalRecords: data.length }, columns, kpis };
  }

  // ── Get data from localStorage state (live read) ──
  _getDataSource(source) {
    if (!source) return [];
    const map = {
      saleInvoices: 'saleInvoices',
      proformaInvoices: 'proformaInvoices',
      saleOrders: 'saleOrders',
      deliveryChallans: 'deliveryChallans',
      saleReturns: 'saleReturns',
      purchaseOrders: 'purchaseOrders',
      purchaseReturns: 'purchaseReturns',
      paymentsIn: 'paymentsIn',
      paymentOut: 'vendorPayments',
      expenses: 'expenses',
      otherIncome: 'otherIncome',
      fixedAssets: 'fixedAssets',
      vendorMaterials: 'vendorMaterials',
      inventoryTx: 'inventoryTx',
      sheets: 'sheets',
      abstracts: 'abstracts',
      estimates: 'estimates',
      clients: 'clients',
      vendors: 'vendors',
      projects: 'projects',
      equipment: 'equipmentList',
      equipmentList: 'equipmentList',
      labourMaster: 'labourMaster',
      attendance: 'attendanceLogs',
      attendanceLogs: 'attendanceLogs',
      rawMaterials: 'rawMaterials',
      itemsMaster: 'itemsMaster',
      accounts: 'accounts',
      invoices: 'invoices',
      labourSalaries: 'labourSalaries',
      vendorPayments: 'vendorPayments',
    };
    const stateKey = map[source] || source;
    const data = state[stateKey];
    if (Array.isArray(data)) return [...data];
    return [];
  }

  // ── Infer table columns from data ──
  _inferColumns(data, dataSource) {
    if (!data.length) return [];
    // Predefined column sets for known data sources
    const columnDefs = {
      saleInvoices: [
        { key: 'invoiceNo', label: 'Invoice No', type: 'text' },
        { key: 'date', label: 'Date', type: 'date' },
        { key: '_clientName', label: 'Client', type: 'text' },
        { key: '_projectName', label: 'Project', type: 'text' },
        { key: 'subtotal', label: 'Base Amt', type: 'currency' },
        { key: 'gstAmount', label: 'Tax', type: 'currency' },
        { key: 'total', label: 'Total', type: 'currency' },
        { key: 'status', label: 'Status', type: 'badge' },
      ],
      proformaInvoices: [
        { key: 'piNo', label: 'PI No', type: 'text' },
        { key: 'date', label: 'Date', type: 'date' },
        { key: '_clientName', label: 'Client', type: 'text' },
        { key: 'total', label: 'Total', type: 'currency' },
        { key: 'status', label: 'Status', type: 'badge' },
      ],
      saleOrders: [
        { key: 'soNo', label: 'SO No', type: 'text' },
        { key: 'date', label: 'Date', type: 'date' },
        { key: '_clientName', label: 'Client', type: 'text' },
        { key: 'total', label: 'Total', type: 'currency' },
        { key: 'status', label: 'Status', type: 'badge' },
      ],
      purchaseOrders: [
        { key: 'poNo', label: 'PO No', type: 'text' },
        { key: 'date', label: 'Date', type: 'date' },
        { key: '_vendorName', label: 'Vendor', type: 'text' },
        { key: 'total', label: 'Total', type: 'currency' },
        { key: 'status', label: 'Status', type: 'badge' },
      ],
      vendorMaterials: [
        { key: 'billNo', label: 'Bill No', type: 'text' },
        { key: 'date', label: 'Date', type: 'date' },
        { key: '_vendorName', label: 'Vendor', type: 'text' },
        { key: '_siteName', label: 'Site', type: 'text' },
        { key: 'totalAmount', label: 'Amount', type: 'currency' },
      ],
      paymentsIn: [
        { key: 'date', label: 'Date', type: 'date' },
        { key: '_clientName', label: 'Client', type: 'text' },
        { key: 'amount', label: 'Amount', type: 'currency' },
        { key: 'mode', label: 'Mode', type: 'text' },
        { key: 'reference', label: 'Reference', type: 'text' },
      ],
      paymentOut: [
        { key: 'date', label: 'Date', type: 'date' },
        { key: '_vendorName', label: 'Vendor', type: 'text' },
        { key: 'amount', label: 'Amount', type: 'currency' },
        { key: 'mode', label: 'Mode', type: 'text' },
      ],
      sheets: [
        { key: 'sheetNum', label: 'Sheet No', type: 'text' },
        { key: 'date', label: 'Date', type: 'date' },
        { key: 'area', label: 'Area', type: 'text' },
        { key: '_projectName', label: 'Project', type: 'text' },
        { key: 'isBilled', label: 'Billed', type: 'badge' },
      ],
      abstracts: [
        { key: 'abstractNum', label: 'Abstract No', type: 'text' },
        { key: 'date', label: 'Date', type: 'date' },
        { key: '_clientName', label: 'Client', type: 'text' },
        { key: 'totalAmount', label: 'Amount', type: 'currency' },
        { key: 'status', label: 'Status', type: 'badge' },
      ],
      equipment: [
        { key: 'name', label: 'Name', type: 'text' },
        { key: 'type', label: 'Type', type: 'text' },
        { key: 'regNo', label: 'Reg No', type: 'text' },
        { key: '_locationName', label: 'Location', type: 'text' },
        { key: 'status', label: 'Status', type: 'badge' },
      ],
      inventoryTx: [
        { key: 'date', label: 'Date', type: 'date' },
        { key: '_materialName', label: 'Material', type: 'text' },
        { key: 'type', label: 'Type', type: 'badge' },
        { key: 'qty', label: 'Qty', type: 'number' },
        { key: 'rate', label: 'Rate', type: 'currency' },
        { key: '_siteName', label: 'Site', type: 'text' },
      ],
    };
    return columnDefs[dataSource] || this._autoInferColumns(data);
  }

  // ── Auto-infer columns from data keys ──
  _autoInferColumns(data) {
    const sample = data[0];
    const skip = ['id', 'items', 'boqs', 'boqItems', 'linkedAbstractIds', 'abstractIds'];
    return Object.keys(sample).filter(k => !skip.includes(k) && typeof sample[k] !== 'object').slice(0, 10).map(k => ({
      key: k,
      label: k.replace(/([A-Z])/g, ' $1').replace(/^./, s => s.toUpperCase()).replace(/Id$/, ''),
      type: typeof sample[k] === 'number' ? (k.includes('amount') || k.includes('total') || k.includes('rate') ? 'currency' : 'number') : 'text'
    }));
  }

  // ── Group data ──
  _groupData(data, groupBy, aggregates, dataSource) {
    const groups = {};
    data.forEach(r => {
      let key;
      if (groupBy === 'month') key = (r.date || '').slice(0, 7) || 'Unknown';
      else if (groupBy === 'year') key = (r.date || '').slice(0, 4) || 'Unknown';
      else key = r[groupBy] || 'Unknown';
      if (!groups[key]) groups[key] = [];
      groups[key].push(r);
    });

    const rows = Object.entries(groups).map(([key, items]) => {
      const row = { _groupKey: key, _groupLabel: this._resolveLabel(key, groupBy), count: items.length };
      // Auto-aggregate numeric fields
      const numericFields = ['total', 'subtotal', 'amount', 'totalAmount', 'gstAmount', 'qty', 'rate'];
      numericFields.forEach(f => {
        const vals = items.map(i => parseFloat(i[f]) || 0).filter(v => v > 0);
        if (vals.length) row['sum_' + f] = vals.reduce((a, b) => a + b, 0);
      });
      return row;
    });

    const columns = [
      { key: '_groupLabel', label: this._groupByLabel(groupBy), type: 'text' },
      { key: 'count', label: 'Count', type: 'number' },
    ];
    const numFields = ['total', 'subtotal', 'amount', 'totalAmount'];
    numFields.forEach(f => {
      if (rows.some(r => r['sum_' + f])) columns.push({ key: 'sum_' + f, label: 'Total ' + f.replace(/([A-Z])/g, ' $1'), type: 'currency' });
    });

    return { rows, summary: { groups: rows.length, totalRecords: data.length }, columns };
  }

  // ── Resolve group key to human label ──
  _resolveLabel(key, groupBy) {
    if (groupBy === 'month' || groupBy === 'year') return key;
    if (groupBy === 'clientId') {
      const c = (state.clients || []).find(x => x.id === key);
      return c?.name || key;
    }
    if (groupBy === 'projectId') {
      const p = (state.projects || []).find(x => x.id === key);
      return p?.name || key;
    }
    if (groupBy === 'vendorId') {
      const v = (state.vendors || []).find(x => x.id === key);
      return v?.name || key;
    }
    return key;
  }

  _groupByLabel(groupBy) {
    const map = { clientId: 'Client', projectId: 'Project', vendorId: 'Vendor', month: 'Month', year: 'Year', category: 'Category', siteId: 'Site' };
    return map[groupBy] || groupBy;
  }

  // ── Enrich data with resolved names ──
  enrichData(data, dataSource) {
    return data.map(r => {
      const enriched = { ...r };
      if (r.clientId) { const c = (state.clients || []).find(x => x.id === r.clientId); enriched._clientName = c?.name || r.clientName || '—'; }
      if (r.projectId) { const p = (state.projects || []).find(x => x.id === r.projectId); enriched._projectName = p?.name || '—'; }
      if (r.vendorId) { const v = (state.vendors || []).find(x => x.id === r.vendorId); enriched._vendorName = v?.name || '—'; }
      if (r.siteId) { enriched._siteName = this._resolveSite(r.siteId); }
      if (r.rawMaterialId) { const rm = (state.rawMaterials || []).find(x => x.id === r.rawMaterialId); enriched._materialName = rm?.name || '—'; }
      return enriched;
    });
  }

  _resolveSite(siteId) {
    const c = (state.clients || []).find(x => x.id === siteId);
    if (c) return c.name;
    const p = (state.projects || []).find(x => x.id === siteId);
    return p?.name || siteId || '—';
  }

  // ── Compute KPIs ──
  _computeKPIs(data, dataSource) {
    const kpis = {};
    if (!data.length) return kpis;
    kpis.totalRecords = data.length;
    const totalFields = ['total', 'totalAmount', 'amount', 'subtotal'];
    totalFields.forEach(f => {
      const sum = data.reduce((s, r) => s + (parseFloat(r[f]) || 0), 0);
      if (sum > 0) kpis['total_' + f] = sum;
    });
    return kpis;
  }

  // ── Generate report for a specific report ID ──
  generateReport(reportId, params = {}) {
    // Find report catalog definition
    let reportDef = null;
    for (const cat of REPORT_CATEGORIES) {
      reportDef = cat.reports.find(r => r.id === reportId);
      if (reportDef) break;
    }
    if (!reportDef) return { rows: [], summary: {}, columns: [], kpis: {}, reportDef: null, domainDef: null };

    // Check for domain-specific configuration
    const domainDef = getReportDefinition(reportId);

    // Try domain-specific compute first
    if (domainDef && domainDef.compute && this[domainDef.compute]) {
      const computed = this[domainDef.compute](params);
      const aggregateRow = this._computeAggregates(computed.rows || [], domainDef);
      return {
        rows: computed.rows || [],
        summary: computed.summary || {},
        columns: domainDef.columns,
        headers: domainDef.headers || null,
        kpis: computed.kpis || {},
        reportDef,
        domainDef,
        aggregateRow,
      };
    }

    // If it has a dataSource in catalog, query it
    if (reportDef.dataSource) {
      const result = this.query({
        dataSource: reportDef.dataSource,
        dateRange: params.dateRange,
        filters: params.filters || {},
        groupBy: reportDef.groupBy || params.groupBy,
        aggregates: params.aggregates || [],
      });
      result.rows = this.enrichData(result.rows, reportDef.dataSource);
      result.reportDef = reportDef;
      result.domainDef = domainDef;
      // If domainDef has columns, override generic columns
      if (domainDef) {
        result.columns = domainDef.columns;
        result.headers = domainDef.headers || null;
        result.aggregateRow = this._computeAggregates(result.rows, domainDef);
      }
      return result;
    }

    // For reports without specific dataSource, return empty with metadata
    return { rows: [], summary: {}, columns: domainDef?.columns || [], kpis: {}, reportDef, domainDef };
  }

  // ── Compute aggregate footer row from domain definition ──
  _computeAggregates(rows, domainDef) {
    if (!domainDef?.aggregates || !rows.length) return null;
    const agg = {};
    domainDef.aggregates.forEach(a => {
      if (a.fn === 'sum') {
        agg[a.key] = rows.reduce((s, r) => s + (parseFloat(r[a.key]) || 0), 0);
      } else if (a.fn === 'avg') {
        const vals = rows.map(r => parseFloat(r[a.key]) || 0);
        agg[a.key] = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
      } else if (a.fn === 'count') {
        agg[a.key] = rows.length;
      }
    });
    return agg;
  }

  // ═══════════════════════════════════════════════
  //  DOMAIN COMPUTE FUNCTIONS
  // ═══════════════════════════════════════════════

  // ── GSTR-1 ──
  computeGSTR1(params = {}) {
    const invoices = this._filterByParams(this._getDataSource('saleInvoices'), params);
    const companyState = (state.companyProfile?.state || '').toLowerCase();
    const rows = [];
    invoices.forEach(inv => {
      if (inv.status === 'Cancelled') return;
      const client = (state.clients || []).find(c => c.id === inv.clientId);
      const clientState = (client?.state || inv.pos || '').toLowerCase();
      const isInterstate = companyState && clientState && companyState !== clientState;
      const taxableValue = parseFloat(inv.subtotal) || parseFloat(inv.total) || 0;
      const gstRate = parseFloat(inv.gstRate) || parseFloat(inv.taxRate) || 18;
      const gstAmount = parseFloat(inv.gstAmount) || (taxableValue * gstRate / 100);
      const isB2B = !!(client?.gstin);
      const supplyType = isB2B ? 'B2B' : (taxableValue > 250000 ? 'B2CL' : 'B2CS');

      rows.push({
        invoiceNo: inv.invoiceNo || inv.id,
        invoiceDate: inv.date || '',
        invoiceValue: parseFloat(inv.total) || 0,
        supplyType,
        gstin: client?.gstin || '—',
        receiverName: client?.name || inv.clientName || '—',
        pos: client?.stateCode || client?.state || '—',
        hsnSac: inv.hsnSac || (inv.items?.[0]?.hsn) || '9954',
        taxableValue,
        igst: isInterstate ? gstAmount : 0,
        cgst: isInterstate ? 0 : gstAmount / 2,
        sgst: isInterstate ? 0 : gstAmount / 2,
        cess: 0,
        gstRate,
      });
    });
    return { rows, summary: { totalInvoices: rows.length } };
  }

  // ── GSTR-3B ──
  computeGSTR3B(params = {}) {
    const gstr1 = this.computeGSTR1(params);
    const purchases = this._filterByParams(this._getDataSource('vendorMaterials'), params);
    const outIGST = gstr1.rows.reduce((s, r) => s + (r.igst || 0), 0);
    const outCGST = gstr1.rows.reduce((s, r) => s + (r.cgst || 0), 0);
    const outSGST = gstr1.rows.reduce((s, r) => s + (r.sgst || 0), 0);
    const outTaxable = gstr1.rows.reduce((s, r) => s + (r.taxableValue || 0), 0);
    const inTaxable = purchases.reduce((s, p) => s + (parseFloat(p.totalAmount) || 0), 0);
    const inGST = inTaxable * 0.18;
    const rows = [
      { nature: '(a) Outward taxable supplies (other than zero/nil/exempted)', taxableValue: outTaxable, igst: outIGST, cgst: outCGST, sgst: outSGST, cess: 0 },
      { nature: '(b) Outward taxable supplies (zero rated)', taxableValue: 0, igst: 0, cgst: 0, sgst: 0, cess: 0 },
      { nature: '(c) Other outward supplies (nil rated, exempted)', taxableValue: 0, igst: 0, cgst: 0, sgst: 0, cess: 0 },
      { nature: '(d) Inward supplies (liable to reverse charge)', taxableValue: 0, igst: 0, cgst: 0, sgst: 0, cess: 0 },
      { nature: '(e) Non-GST outward supplies', taxableValue: 0, igst: 0, cgst: 0, sgst: 0, cess: 0 },
    ];
    return { rows, summary: { outputTax: outIGST + outCGST + outSGST, inputCredit: inGST * 0.9 } };
  }

  // ── GST Summary ──
  computeGSTSummary(params = {}) {
    const invoices = this._filterByParams(this._getDataSource('saleInvoices'), params);
    const purchases = this._filterByParams(this._getDataSource('vendorMaterials'), params);
    const months = {};
    invoices.forEach(inv => {
      if (inv.status === 'Cancelled') return;
      const m = (inv.date || '').slice(0, 7) || 'Unknown';
      if (!months[m]) months[m] = { month: m, outputTax: 0, inputCredit: 0, igst: 0, cgst: 0, sgst: 0 };
      const gst = parseFloat(inv.gstAmount) || 0;
      months[m].outputTax += gst;
      months[m].cgst += gst / 2;
      months[m].sgst += gst / 2;
    });
    purchases.forEach(p => {
      const m = (p.date || '').slice(0, 7) || 'Unknown';
      if (!months[m]) months[m] = { month: m, outputTax: 0, inputCredit: 0, igst: 0, cgst: 0, sgst: 0 };
      months[m].inputCredit += (parseFloat(p.totalAmount) || 0) * 0.18;
    });
    const rows = Object.values(months).map(m => ({ ...m, netPayable: m.outputTax - m.inputCredit }));
    rows.sort((a, b) => a.month.localeCompare(b.month));
    return { rows };
  }

  // ── HSN Summary ──
  computeHSNSummary(params = {}) {
    const invoices = this._filterByParams(this._getDataSource('saleInvoices'), params);
    const hsnMap = {};
    invoices.forEach(inv => {
      if (inv.status === 'Cancelled') return;
      (inv.items || []).forEach(item => {
        const hsn = item.hsn || item.hsnSac || '9954';
        if (!hsnMap[hsn]) hsnMap[hsn] = { hsnCode: hsn, description: item.description || item.name || '', uqc: item.unit || 'NOS', totalQty: 0, totalValue: 0, taxableValue: 0, igst: 0, cgst: 0, sgst: 0 };
        const qty = parseFloat(item.qty) || 1;
        const val = (parseFloat(item.rate) || 0) * qty;
        hsnMap[hsn].totalQty += qty;
        hsnMap[hsn].totalValue += val;
        hsnMap[hsn].taxableValue += val;
      });
    });
    // Estimate tax split
    Object.values(hsnMap).forEach(h => { h.cgst = h.taxableValue * 0.09; h.sgst = h.taxableValue * 0.09; });
    return { rows: Object.values(hsnMap) };
  }

  // ── ITC Register ──
  computeITCRegister(params = {}) {
    const purchases = this._filterByParams(this._getDataSource('vendorMaterials'), params);
    const rows = purchases.map(p => {
      const vendor = (state.vendors || []).find(v => v.id === p.vendorId);
      const taxable = parseFloat(p.totalAmount) || 0;
      const gst = taxable * 0.18;
      return {
        billNo: p.billNo || p.id, date: p.date, vendorName: vendor?.name || '—',
        vendorGSTIN: vendor?.gstin || '—', taxableValue: taxable,
        igst: 0, cgst: gst / 2, sgst: gst / 2, eligibility: vendor?.gstin ? 'Eligible' : 'Ineligible',
      };
    });
    return { rows };
  }

  // ── TDS Deduction Register ──
  computeTDSDeduction(params = {}) {
    const payments = this._filterByParams([...(state.vendorPayments || []), ...(state.vendorPayments || [])], params);
    const rows = payments.filter(p => parseFloat(p.tdsAmount) > 0 || parseFloat(p.tds) > 0).map(p => {
      const vendor = (state.vendors || []).find(v => v.id === p.vendorId);
      const gross = parseFloat(p.amount) || 0;
      const tds = parseFloat(p.tdsAmount) || parseFloat(p.tds) || 0;
      return {
        date: p.date, vendorName: vendor?.name || p.partyName || '—', pan: vendor?.pan || '—',
        section: p.tdsSection || '194C', grossAmount: gross, tdsRate: gross ? (tds / gross * 100) : 0,
        tdsAmount: tds, netPayable: gross - tds, challanNo: p.challanNo || '—', depositDate: p.tdsDepositDate || '—',
      };
    });
    return { rows };
  }

  // ── Measurement Book (MB) ──
  computeMBReport(params = {}) {
    const sheets = this._filterByParams(this._getDataSource('sheets'), params);
    const rows = [];
    let pageNo = 1;
    sheets.forEach(sheet => {
      (sheet.entries || []).forEach((entry, i) => {
        rows.push({
          mbPageNo: pageNo, itemNo: entry.itemNo || (i + 1),
          boqRef: entry.boqRef || sheet.boqGroupId || '—',
          description: entry.description || entry.itemName || '—',
          location: entry.location || entry.area || sheet.area || '—',
          nos: parseFloat(entry.nos) || parseFloat(entry.no) || 1,
          length: parseFloat(entry.length) || parseFloat(entry.l) || 0,
          breadth: parseFloat(entry.breadth) || parseFloat(entry.b) || 0,
          depth: parseFloat(entry.depth) || parseFloat(entry.d) || parseFloat(entry.h) || 0,
          quantity: parseFloat(entry.quantity) || parseFloat(entry.total) || 0,
          unit: entry.unit || '—',
        });
      });
      pageNo++;
    });
    return { rows, summary: { totalSheets: sheets.length, totalEntries: rows.length } };
  }

  // ── Detailed Measurement ──
  computeDetailedMeasurement(params = {}) {
    const mb = this.computeMBReport(params);
    const rows = mb.rows.map(r => ({
      ...r, sheetNo: 'MB-' + r.mbPageNo,
      date: '', rate: 0, amount: r.quantity * (r.rate || 0),
    }));
    return { rows };
  }

  // ── RA Bill ──
  computeRABill(params = {}) {
    const abstracts = this._filterByParams(this._getDataSource('abstracts'), params);
    if (!abstracts.length) return { rows: [] };
    const rows = [];
    abstracts.forEach(abs => {
      (abs.items || []).forEach((item, i) => {
        const boqQty = parseFloat(item.boqQty) || 0;
        const boqRate = parseFloat(item.rate) || 0;
        const cumQty = parseFloat(item.quantity) || parseFloat(item.totalQty) || 0;
        const prevQty = parseFloat(item.prevQty) || 0;
        const thisQty = cumQty - prevQty;
        rows.push({
          itemNo: item.itemNo || (i + 1), description: item.description || item.itemName || '—',
          unit: item.unit || '—', boqQty, boqRate,
          prevQty, prevAmount: prevQty * boqRate,
          thisQty, thisAmount: thisQty * boqRate,
          cumQty, cumAmount: cumQty * boqRate,
        });
      });
    });
    return { rows };
  }

  // ── Abstract of Measurement ──
  computeAbstractMeasurement(params = {}) {
    const abstracts = this._filterByParams(this._getDataSource('abstracts'), params);
    const rows = [];
    abstracts.forEach(abs => {
      (abs.items || []).forEach((item, i) => {
        rows.push({
          itemNo: item.itemNo || (i + 1), description: item.description || item.itemName || '—',
          unit: item.unit || '—', totalQty: parseFloat(item.totalQty) || parseFloat(item.quantity) || 0,
          rate: parseFloat(item.rate) || 0,
          amount: (parseFloat(item.totalQty) || parseFloat(item.quantity) || 0) * (parseFloat(item.rate) || 0),
        });
      });
    });
    return { rows };
  }

  // ── BBS ──
  computeBBS(params = {}) {
    const bbsData = state.bbsData || {};
    const rows = [];
    const unitWeights = { 6: 0.222, 8: 0.395, 10: 0.617, 12: 0.888, 16: 1.58, 20: 2.47, 25: 3.85, 28: 4.83, 32: 6.31, 36: 7.99, 40: 9.86 };
    Object.values(bbsData).forEach(sheet => {
      (sheet.rows || sheet.entries || []).forEach(entry => {
        const dia = parseFloat(entry.diameter) || parseFloat(entry.dia) || 0;
        const noOfBars = parseFloat(entry.nos) || parseFloat(entry.noOfBars) || 0;
        const cuttingLen = parseFloat(entry.cuttingLength) || parseFloat(entry.length) || 0;
        const totalLen = noOfBars * cuttingLen;
        const unitWt = unitWeights[dia] || (dia * dia / 162);
        rows.push({
          memberRef: entry.member || entry.memberRef || '—',
          barMarkNo: entry.barMark || entry.barMarkNo || '—',
          barShape: entry.shapeCode || entry.shape || '—',
          diameter: dia, noOfBars, spacing: parseFloat(entry.spacing) || 0,
          cuttingLen: +(cuttingLen.toFixed(3)), totalLen: +(totalLen.toFixed(3)),
          unitWt: +(unitWt.toFixed(3)), totalWt: +((totalLen * unitWt).toFixed(2)),
        });
      });
    });
    return { rows };
  }

  // ── DPR ──
  computeDPR(params = {}) {
    // Read from dailyProgress entries (form engine)
    const dprEntries = this._filterByParams(state.dailyProgress || [], params);
    if (dprEntries.length) {
      const rows = dprEntries.map((d, i) => ({
        srNo: i + 1,
        date: d.date || '—',
        activity: d.activity || '—',
        location: d.location || '—',
        plannedQty: parseFloat(d.plannedQty) || 0,
        achievedQty: parseFloat(d.achievedQty) || 0,
        unit: d.uom || '—',
        variance: (parseFloat(d.achievedQty) || 0) - (parseFloat(d.plannedQty) || 0),
        manpower: parseFloat(d.manpower) || 0,
        weather: d.weather || '—',
        hindrances: d.hindrance || '—',
        remarks: d.remarks || '',
      }));
      const totalPlanned = rows.reduce((s, r) => s + r.plannedQty, 0);
      const totalAchieved = rows.reduce((s, r) => s + r.achievedQty, 0);
      return { rows, kpis: { totalEntries: rows.length, totalPlanned, totalAchieved, overallVariance: totalAchieved - totalPlanned } };
    }
    // Fallback: derive from attendance logs
    const attendance = this._filterByParams(state.attendanceLogs || [], params);
    const dateMap = {};
    attendance.forEach(log => {
      const d = log.date || '';
      if (!dateMap[d]) dateMap[d] = { date: d, weather: '—', labourStrength: 0, supervisors: 0, equipmentDeployed: 0, activityDesc: '—', plannedQty: 0, achievedQty: 0, unit: '—', variance: 0, hindrances: '—' };
      if (log.status === 'P' || log.status === 'present' || log.status === 'Present') dateMap[d].labourStrength++;
    });
    const rows = Object.values(dateMap).sort((a, b) => a.date.localeCompare(b.date));
    return { rows, summary: { totalDays: rows.length } };
  }

  // ── Activity Progress ──
  computeActivityProgress(params = {}) {
    const pid = params.filters?.projectId || state.currentProjectId || state.projects?.[0]?.id;
    const proj = (state.projects || []).find(p => p.id === pid);
    if (!proj) return { rows: [] };
    const rows = [];
    (proj.boqs || []).forEach(boq => {
      (boq.items || []).forEach((item, i) => {
        const boqQty = parseFloat(item.qty) || 0;
        const achieved = parseFloat(item.achievedQty) || 0;
        const progress = boqQty ? (achieved / boqQty * 100) : 0;
        rows.push({
          activityNo: item.itemNo || (i + 1), description: item.description || item.name || '—',
          unit: item.unit || '—', boqQty, achievedQty: achieved,
          progressPct: +progress.toFixed(1), balanceQty: boqQty - achieved,
          status: progress >= 100 ? 'Complete' : progress > 0 ? 'In Progress' : 'Not Started',
        });
      });
    });
    return { rows };
  }

  // ── Idle Machinery Cost ──
  computeIdleMachineryCost(params = {}) {
    const equipment = state.equipmentList || [];
    const logs = this._filterByParams(state.equipmentLogs || [], params);
    const rows = equipment.map(eq => {
      const eqLogs = logs.filter(l => l.equipmentId === eq.id);
      const workingHours = eqLogs.reduce((s, l) => s + (parseFloat(l.workingHours) || parseFloat(l.hours) || 0), 0);
      const totalHours = eqLogs.length * 8; // 8hr workday assumption
      const idleHours = Math.max(0, totalHours - workingHours);
      const hourlyRate = parseFloat(eq.hourlyRate) || parseFloat(eq.rentalRate) || 500;
      const utilization = totalHours ? (workingHours / totalHours * 100) : 0;
      return {
        equipmentId: eq.regNo || eq.id, name: eq.name || '—',
        type: eq.ownership || eq.type || 'Owned',
        siteName: this._resolveSite(eq.locationId || eq.siteId),
        totalHours, workingHours, idleHours,
        utilization: +utilization.toFixed(1), hourlyRate, idleCost: idleHours * hourlyRate,
      };
    });
    return { rows: rows.filter(r => r.totalHours > 0) };
  }

  // ── Equipment Register ──
  computeEquipmentRegister(params = {}) {
    const equipment = state.equipmentList || [];
    return { rows: equipment.map((eq, i) => ({
      slNo: i + 1, name: eq.name || '—', make: eq.make || eq.model || '—',
      regNo: eq.regNo || '—', type: eq.ownership || 'Owned',
      capacity: eq.capacity || '—', location: this._resolveSite(eq.locationId),
      status: eq.status || 'Active', lastService: eq.lastServiceDate || '—',
      nextService: eq.nextServiceDate || '—',
    })) };
  }

  // ── Invoice Register ──
  computeInvoiceRegister(params = {}) {
    const invoices = this._filterByParams(this._getDataSource('saleInvoices'), params);
    return { rows: invoices.map(inv => {
      const client = (state.clients || []).find(c => c.id === inv.clientId);
      const proj = (state.projects || []).find(p => p.id === inv.projectId);
      const gst = parseFloat(inv.gstAmount) || 0;
      return {
        invoiceNo: inv.invoiceNo || inv.id, date: inv.date,
        clientName: client?.name || inv.clientName || '—',
        projectName: proj?.name || '—', hsnSac: inv.hsnSac || '9954',
        taxableValue: parseFloat(inv.subtotal) || 0,
        cgst: gst / 2, sgst: gst / 2, igst: 0,
        totalAmount: parseFloat(inv.total) || 0, status: inv.status || 'Active',
      };
    }) };
  }

  // ── Client Outstanding ──
  computeClientOutstanding(params = {}) {
    const clients = state.clients || [];
    const rows = clients.map(c => {
      const invoices = (state.saleInvoices || []).filter(i => i.clientId === c.id && i.status !== 'Cancelled');
      const totalInvoiced = invoices.reduce((s, i) => s + (parseFloat(i.total) || 0), 0);
      const totalReceived = (state.paymentsIn || []).filter(p => p.clientId === c.id).reduce((s, p) => s + (parseFloat(p.amount) || 0), 0);
      const outstanding = totalInvoiced - totalReceived;
      const lastInvoice = invoices.sort((a, b) => (b.date || '').localeCompare(a.date || ''))[0];
      const overdueDays = lastInvoice ? Math.max(0, Math.floor((Date.now() - new Date(lastInvoice.date).getTime()) / 86400000) - 30) : 0;
      const bucket = overdueDays <= 0 ? 'Current' : overdueDays <= 60 ? '31-60 Days' : overdueDays <= 90 ? '61-90 Days' : '90+ Days';
      return {
        clientName: c.name, projectName: '—', totalInvoiced, totalReceived,
        tdsDeducted: 0, retention: 0, outstanding, overdueDays, agingBucket: bucket,
      };
    }).filter(r => r.totalInvoiced > 0);
    return { rows };
  }

  // ── Aging Analysis ──
  computeAgingAnalysis(params = {}) {
    const clients = state.clients || [];
    const today = new Date();
    const rows = clients.map(c => {
      const invoices = (state.saleInvoices || []).filter(i => i.clientId === c.id && i.status !== 'Cancelled');
      const payments = (state.paymentsIn || []).filter(p => p.clientId === c.id);
      const totalPaid = payments.reduce((s, p) => s + (parseFloat(p.amount) || 0), 0);
      let remaining = invoices.reduce((s, i) => s + (parseFloat(i.total) || 0), 0) - totalPaid;
      if (remaining <= 0) return null;
      const buckets = { current: 0, days31_60: 0, days61_90: 0, days91_180: 0, over180: 0 };
      invoices.sort((a, b) => (a.date || '').localeCompare(b.date || '')).forEach(inv => {
        if (remaining <= 0) return;
        const days = Math.floor((today - new Date(inv.date || today)) / 86400000);
        const amt = Math.min(remaining, parseFloat(inv.total) || 0);
        if (days <= 30) buckets.current += amt;
        else if (days <= 60) buckets.days31_60 += amt;
        else if (days <= 90) buckets.days61_90 += amt;
        else if (days <= 180) buckets.days91_180 += amt;
        else buckets.over180 += amt;
        remaining -= amt;
      });
      return { clientName: c.name, ...buckets, totalOutstanding: Object.values(buckets).reduce((a, b) => a + b, 0) };
    }).filter(Boolean);
    return { rows };
  }

  // ── Vendor Outstanding ──
  computeVendorOutstanding(params = {}) {
    const vendors = state.vendors || [];
    const rows = vendors.map(v => {
      const billed = (state.vendorMaterials || []).filter(m => m.vendorId === v.id).reduce((s, m) => s + (parseFloat(m.totalAmount) || 0), 0);
      const paid = (state.vendorPayments || []).filter(p => p.vendorId === v.id).reduce((s, p) => s + (parseFloat(p.amount) || 0), 0);
      return { vendorName: v.name, totalBilled: billed, totalPaid: paid, advancePaid: 0, retentionHeld: 0, outstanding: billed - paid, overdueDays: 0 };
    }).filter(r => r.totalBilled > 0);
    return { rows };
  }

  // ── Purchase Bill Register ──
  computePurchaseBillRegister(params = {}) {
    const purchases = this._filterByParams(this._getDataSource('vendorMaterials'), params);
    return { rows: purchases.map(p => {
      const vendor = (state.vendors || []).find(v => v.id === p.vendorId);
      const total = parseFloat(p.totalAmount) || 0;
      return {
        billNo: p.billNo || p.id, date: p.date,
        vendorName: vendor?.name || '—', vendorGSTIN: vendor?.gstin || '—',
        siteName: this._resolveSite(p.siteId), taxableValue: total / 1.18,
        cgst: (total - total / 1.18) / 2, sgst: (total - total / 1.18) / 2, igst: 0,
        tdsApplicable: total > 30000 ? 'Yes' : 'No', totalAmount: total,
      };
    }) };
  }

  // ── Labour Muster ──
  computeLabourMuster(params = {}) {
    const labour = state.labourMaster || [];
    const salaries = state.labourSalaries || [];
    const rows = labour.map((l, i) => {
      const sal = salaries.find(s => s.labourId === l.id);
      return {
        slNo: i + 1, labourName: l.name || '—', fatherName: l.fatherName || '—',
        category: l.category || l.skill || 'Unskilled', designation: l.designation || l.role || '—',
        daysPresent: sal?.daysPresent || parseFloat(l.daysPresent) || 0,
        daysAbsent: sal?.daysAbsent || 0, overtimeHrs: sal?.overtimeHrs || 0,
        wageRate: parseFloat(l.dailyWage) || parseFloat(l.wageRate) || 0,
        basicWage: sal?.basicWage || (parseFloat(l.dailyWage) || 0) * (sal?.daysPresent || 0),
        otAmount: sal?.otAmount || 0, grossWage: sal?.grossWage || parseFloat(sal?.netPay) || 0,
        deductions: sal?.deductions || 0, netPay: parseFloat(sal?.netPay) || 0,
      };
    });
    return { rows };
  }

  // ── P&L Statement ──
  computePLStatement(params = {}) {
    const invoices = this._filterByParams(this._getDataSource('saleInvoices'), params);
    const totalSales = invoices.filter(i => i.status !== 'Cancelled').reduce((s, i) => s + (parseFloat(i.total) || 0), 0);
    const totalOther = (state.otherIncome || []).reduce((s, i) => s + (parseFloat(i.amount) || 0), 0);
    const totalPurchase = (state.vendorMaterials || []).reduce((s, v) => s + (parseFloat(v.totalAmount) || 0), 0);
    const totalExpenses = (state.expenses || []).reduce((s, e) => s + (parseFloat(e.amount) || 0), 0);
    const totalLabour = (state.labourSalaries || []).reduce((s, l) => s + (parseFloat(l.netPay) || 0), 0);
    const grossProfit = totalSales - totalPurchase;
    const netProfit = grossProfit + totalOther - totalExpenses - totalLabour;
    const rows = [
      { particular: 'Sales Revenue', type: 'Income', amount: totalSales },
      { particular: 'Other Income', type: 'Income', amount: totalOther },
      { particular: 'Gross Income', type: 'Total', amount: totalSales + totalOther },
      { particular: 'Material / Purchase Cost', type: 'Expense', amount: totalPurchase },
      { particular: 'Gross Profit', type: 'Total', amount: grossProfit },
      { particular: 'Operating Expenses', type: 'Expense', amount: totalExpenses },
      { particular: 'Labour / Salary Cost', type: 'Expense', amount: totalLabour },
      { particular: 'Net Profit / (Loss)', type: 'Total', amount: netProfit },
    ];
    return { rows, kpis: { grossProfit, netProfit, totalRevenue: totalSales + totalOther, totalCost: totalPurchase + totalExpenses + totalLabour } };
  }

  // ── Cash Book ──
  computeCashBook(params = {}) {
    const allTx = [];
    (state.paymentsIn || []).forEach(p => {
      const client = (state.clients || []).find(c => c.id === p.clientId);
      allTx.push({ date: p.date, voucherNo: p.receiptNo || '—', particular: 'Received from ' + (client?.name || '—'), accountHead: 'Receivables', debit: parseFloat(p.amount) || 0, credit: 0 });
    });
    (state.vendorPayments || []).forEach(p => {
      const vendor = (state.vendors || []).find(v => v.id === p.vendorId);
      allTx.push({ date: p.date, voucherNo: p.voucherNo || '—', particular: 'Paid to ' + (vendor?.name || p.partyName || '—'), accountHead: 'Payables', debit: 0, credit: parseFloat(p.amount) || 0 });
    });
    (state.expenses || []).forEach(e => {
      allTx.push({ date: e.date, voucherNo: e.voucherNo || '—', particular: 'Expense - ' + (e.category || e.description || '—'), accountHead: e.category || 'General', debit: 0, credit: parseFloat(e.amount) || 0 });
    });
    allTx.sort((a, b) => (a.date || '').localeCompare(b.date || ''));
    let bal = 0;
    allTx.forEach(t => { bal += t.debit - t.credit; t.balance = bal; });
    return { rows: allTx };
  }

  // ── Project Profitability ──
  computeProjectProfitability(params = {}) {
    const projects = state.projects || [];
    const rows = projects.map(p => {
      const sales = (state.saleInvoices || []).filter(i => i.projectId === p.id && i.status !== 'Cancelled');
      const totalBilled = sales.reduce((s, i) => s + (parseFloat(i.total) || 0), 0);
      const totalReceived = (state.paymentsIn || []).filter(pay => pay.projectId === p.id || sales.some(inv => inv.clientId === pay.clientId)).reduce((s, pay) => s + (parseFloat(pay.amount) || 0), 0);
      const materialCost = (state.vendorMaterials || []).filter(v => v.siteId === p.id).reduce((s, v) => s + (parseFloat(v.totalAmount) || 0), 0);
      const labourCost = (state.labourSalaries || []).filter(l => l.projectId === p.id).reduce((s, l) => s + (parseFloat(l.netPay) || 0), 0);
      const equipmentCost = (state.equipmentLogs || []).filter(l => l.projectId === p.id).reduce((s, l) => s + (parseFloat(l.cost) || 0), 0);
      const overheads = (state.expenses || []).filter(e => e.projectId === p.id).reduce((s, e) => s + (parseFloat(e.amount) || 0), 0);
      const totalCost = materialCost + labourCost + equipmentCost + overheads;
      const profit = totalBilled - totalCost;
      let contractValue = 0;
      (p.boqs || []).forEach(b => (b.items || []).forEach(item => { contractValue += (parseFloat(item.qty) || 0) * (parseFloat(item.rate) || 0); }));
      return {
        projectName: p.name, clientName: p.clientName || '—', contractValue,
        totalBilled, totalReceived, materialCost, labourCost, equipmentCost, overheads,
        totalCost, profit, margin: totalBilled ? +((profit / totalBilled * 100).toFixed(1)) : 0,
      };
    });
    return { rows };
  }

  // ── Fuel Consumption ──
  computeFuelConsumption(params = {}) {
    const logs = this._filterByParams(state.fuelLogs || state.equipmentLogs || [], params);
    const rows = logs.map(log => {
      const eq = (state.equipmentList || []).find(e => e.id === log.equipmentId);
      const opening = parseFloat(log.openingKm) || parseFloat(log.openingHr) || 0;
      const closing = parseFloat(log.closingKm) || parseFloat(log.closingHr) || 0;
      const fuelQty = parseFloat(log.fuelQty) || parseFloat(log.diesel) || 0;
      const fuelRate = parseFloat(log.fuelRate) || parseFloat(log.dieselRate) || 90;
      const distance = closing - opening;
      return {
        date: log.date || '', equipmentName: eq?.name || log.equipmentName || '—',
        regNo: eq?.regNo || log.regNo || '—', openingKm: opening, closingKm: closing,
        fuelQty, fuelRate, fuelCost: fuelQty * fuelRate,
        avgConsumption: fuelQty > 0 ? +(distance / fuelQty).toFixed(2) : 0,
      };
    });
    return { rows };
  }

  // ── Salary Register ──
  computeSalaryRegister(params = {}) {
    const labour = state.labourMaster || [];
    const salaries = state.labourSalaries || [];
    const rows = labour.map((l, i) => {
      const sal = salaries.find(s => s.labourId === l.id) || {};
      const basic = parseFloat(sal.basicPay) || parseFloat(l.dailyWage) * (parseFloat(sal.daysPresent) || 26) || 0;
      const da = parseFloat(sal.da) || 0;
      const hra = parseFloat(sal.hra) || 0;
      const otherAllow = parseFloat(sal.otherAllowance) || 0;
      const gross = basic + da + hra + otherAllow;
      const pf = parseFloat(sal.pf) || Math.round(basic * 0.12);
      const esi = parseFloat(sal.esi) || (gross <= 21000 ? Math.round(gross * 0.0075) : 0);
      const tds = parseFloat(sal.tds) || 0;
      const otherDed = parseFloat(sal.otherDeduction) || 0;
      const net = gross - pf - esi - tds - otherDed;
      return {
        slNo: i + 1, name: l.name || '—', designation: l.designation || l.role || '—',
        daysWorked: parseFloat(sal.daysPresent) || 0, basicPay: basic, da, hra,
        otherAllow, grossSalary: gross, pf, esi, tds, otherDed, netSalary: net,
      };
    });
    return { rows };
  }

  // ── Stock Register ──
  computeStockRegister(params = {}) {
    const txns = this._filterByParams(this._getDataSource('inventoryTx'), params);
    const materialMap = {};
    txns.forEach(tx => {
      const matId = tx.rawMaterialId || tx.itemId || 'unknown';
      if (!materialMap[matId]) {
        const mat = (state.rawMaterials || []).find(m => m.id === matId) || (state.itemsMaster || []).find(m => m.id === matId);
        materialMap[matId] = { materialName: mat?.name || matId, unit: mat?.unit || '—', entries: [] };
      }
      materialMap[matId].entries.push(tx);
    });
    const rows = [];
    Object.values(materialMap).forEach(m => {
      let running = 0;
      m.entries.sort((a, b) => (a.date || '').localeCompare(b.date || '')).forEach(tx => {
        const qty = parseFloat(tx.qty) || 0;
        const rate = parseFloat(tx.rate) || 0;
        const isIn = tx.type === 'IN';
        const opening = running;
        running += isIn ? qty : -qty;
        rows.push({
          date: tx.date || '', materialName: m.materialName, unit: m.unit,
          openingQty: opening, receivedQty: isIn ? qty : 0, issuedQty: isIn ? 0 : qty,
          closingQty: running, rate, closingValue: running * rate,
          reference: tx.reference || tx.grnNo || tx.challanNo || '—',
        });
      });
    });
    return { rows };
  }

  // ── Cement Reconciliation ──
  computeCementReconciliation(params = {}) {
    const grades = { 'M15': { ratio: '1:2:4', cement: 4.5 }, 'M20': { ratio: '1:1.5:3', cement: 8 }, 'M25': { ratio: '1:1:2', cement: 9.5 }, 'M30': { ratio: 'Design', cement: 10 }, 'M35': { ratio: 'Design', cement: 10.5 }, 'M40': { ratio: 'Design', cement: 11 } };
    const concreteData = state.concreteRecords || [];
    const rows = concreteData.length ? concreteData.map(rec => {
      const grade = rec.grade || 'M20';
      const vol = parseFloat(rec.volume) || 0;
      const spec = grades[grade] || grades['M20'];
      const theoretical = vol * spec.cement;
      const actual = parseFloat(rec.actualCement) || theoretical;
      const variance = theoretical > 0 ? +((actual - theoretical) / theoretical * 100).toFixed(1) : 0;
      return { grade, volume: vol, mixRatio: spec.ratio, theoreticalCement: +theoretical.toFixed(1), actualCement: +actual.toFixed(1), variance, remark: variance > 5 ? 'Excess' : variance < -5 ? 'Saving' : 'OK' };
    }) : Object.entries(grades).map(([g, s]) => ({ grade: g, volume: 0, mixRatio: s.ratio, theoreticalCement: 0, actualCement: 0, variance: 0, remark: '—' }));
    return { rows };
  }

  // ── Steel Reconciliation ──
  computeSteelReconciliation(params = {}) {
    const unitWeights = { 8: 0.395, 10: 0.617, 12: 0.888, 16: 1.58, 20: 2.47, 25: 3.85, 32: 6.31 };
    const bbsRows = this.computeBBS(params).rows;
    const diaMap = {};
    bbsRows.forEach(r => {
      const d = r.diameter;
      if (!diaMap[d]) diaMap[d] = { theoreticalWt: 0 };
      diaMap[d].theoreticalWt += r.totalWt || 0;
    });
    const steelTx = (state.inventoryTx || []).filter(tx => {
      const mat = (state.rawMaterials || []).find(m => m.id === (tx.rawMaterialId || tx.itemId));
      return mat?.name?.toLowerCase().includes('steel') || mat?.name?.toLowerCase().includes('rebar') || mat?.category?.toLowerCase().includes('steel');
    });
    const rows = Object.entries(diaMap.length ? diaMap : unitWeights).map(([dia, data]) => {
      const d = parseFloat(dia);
      const theoretical = data?.theoreticalWt || 0;
      const received = steelTx.filter(tx => tx.type === 'IN').reduce((s, tx) => s + (parseFloat(tx.qty) || 0), 0) / Object.keys(unitWeights).length;
      const used = theoretical || received * 0.95;
      const wastage = received - used;
      return { diameter: d, theoreticalWt: +theoretical.toFixed(2), actualReceived: +received.toFixed(2), actualUsed: +used.toFixed(2), wastage: +Math.max(0, wastage).toFixed(2), wastagePct: received ? +((wastage / received) * 100).toFixed(1) : 0, balance: +(received - used).toFixed(2) };
    });
    return { rows };
  }

  // ── Earned Value Management ──
  computeEarnedValue(params = {}) {
    const pid = params.filters?.projectId || state.currentProjectId || state.projects?.[0]?.id;
    const proj = (state.projects || []).find(p => p.id === pid);
    if (!proj) return { rows: [] };
    const rows = [];
    (proj.boqs || []).forEach(boq => {
      (boq.items || []).forEach((item, i) => {
        const bac = (parseFloat(item.qty) || 0) * (parseFloat(item.rate) || 0);
        const plannedPct = parseFloat(item.plannedPct) || 50;
        const actualPct = parseFloat(item.achievedPct) || parseFloat(item.achievedQty) / (parseFloat(item.qty) || 1) * 100 || 0;
        const pv = bac * plannedPct / 100;
        const ev = bac * actualPct / 100;
        const actualCost = (state.vendorMaterials || []).filter(v => v.siteId === proj.id).reduce((s, v) => s + (parseFloat(v.totalAmount) || 0), 0) / Math.max((proj.boqs || []).reduce((c, b) => c + (b.items || []).length, 0), 1);
        const ac = actualCost || ev * 1.05;
        const sv = ev - pv;
        const cv = ev - ac;
        const spi = pv ? +(ev / pv).toFixed(2) : 0;
        const cpi = ac ? +(ev / ac).toFixed(2) : 0;
        const eac = cpi > 0 ? +(bac / cpi).toFixed(0) : bac;
        rows.push({
          activityName: item.description || item.name || `Item ${i + 1}`,
          bac, plannedPct: +plannedPct.toFixed(1), actualPct: +actualPct.toFixed(1),
          pv: +pv.toFixed(0), ev: +ev.toFixed(0), ac: +ac.toFixed(0),
          sv: +sv.toFixed(0), cv: +cv.toFixed(0), spi, cpi, eac,
        });
      });
    });
    return { rows };
  }

  // ── Retention Recovery ──
  computeRetentionRecovery(params = {}) {
    const invoices = this._filterByParams(this._getDataSource('saleInvoices'), params);
    const rows = invoices.filter(inv => inv.status !== 'Cancelled').map(inv => {
      const client = (state.clients || []).find(c => c.id === inv.clientId);
      const proj = (state.projects || []).find(p => p.id === inv.projectId);
      const billAmt = parseFloat(inv.total) || 0;
      const retPct = parseFloat(inv.retentionPct) || 5;
      const retAmt = billAmt * retPct / 100;
      const dlpMonths = parseFloat(inv.dlpMonths) || 12;
      const invDate = inv.date ? new Date(inv.date) : new Date();
      const dlpEnd = new Date(invDate);
      dlpEnd.setMonth(dlpEnd.getMonth() + dlpMonths);
      const released = inv.retentionReleased || false;
      return {
        clientName: client?.name || inv.clientName || '—',
        projectName: proj?.name || '—',
        raBillNo: inv.invoiceNo || inv.id,
        billAmount: billAmt, retentionPct: retPct, retentionAmt: retAmt,
        dlpEndDate: dlpEnd.toISOString().slice(0, 10),
        releaseDate: released ? (inv.retentionReleaseDate || '—') : '—',
        status: released ? 'Released' : (dlpEnd < new Date() ? 'Pending' : 'Held'),
      };
    });
    return { rows };
  }

  // ── WIP Report ──
  computeWIP(params = {}) {
    const projects = state.projects || [];
    const rows = projects.map(p => {
      let contractValue = 0;
      (p.boqs || []).forEach(b => (b.items || []).forEach(item => { contractValue += (parseFloat(item.qty) || 0) * (parseFloat(item.rate) || 0); }));
      if (!contractValue) return null;
      const costIncurred = (state.vendorMaterials || []).filter(v => v.siteId === p.id).reduce((s, v) => s + (parseFloat(v.totalAmount) || 0), 0)
        + (state.labourSalaries || []).filter(l => l.projectId === p.id).reduce((s, l) => s + (parseFloat(l.netPay) || 0), 0)
        + (state.expenses || []).filter(e => e.projectId === p.id).reduce((s, e) => s + (parseFloat(e.amount) || 0), 0);
      const billedToDate = (state.saleInvoices || []).filter(i => i.projectId === p.id && i.status !== 'Cancelled').reduce((s, i) => s + (parseFloat(i.total) || 0), 0);
      const completionPct = contractValue ? +(costIncurred / contractValue * 100).toFixed(1) : 0;
      const revRecognized = contractValue * Math.min(completionPct, 100) / 100;
      const unbilledRev = revRecognized - billedToDate;
      const wipBalance = costIncurred - (contractValue * completionPct / 100);
      return {
        projectName: p.name, contractValue, completionPct,
        costIncurred, revRecognized: +revRecognized.toFixed(0),
        billedToDate, unbilledRev: +Math.max(0, unbilledRev).toFixed(0),
        wipBalance: +wipBalance.toFixed(0),
      };
    }).filter(Boolean);
    return { rows };
  }

  // ═══════════════════════════════════════════════
  //  NEW SPEC COMPUTE FUNCTIONS
  // ═══════════════════════════════════════════════

  // ── Lead Register ──
  computeLeadRegister(params = {}) {
    const leads = this._filterByParams(state.leads || [], params);
    const rows = leads.map((l, i) => ({
      leadNo: l.leadNo || `LEAD-${String(i + 1).padStart(4, '0')}`,
      date: l.createdAt?.split('T')[0] || l.date || '',
      clientName: l.name || l.clientName || '—',
      contact: l.phone || l.contact || l.contactPerson || '—',
      source: l.source || 'Direct',
      projectType: l.projectType || l.type || 'Construction',
      location: l.location || l.city || '—',
      estValue: parseFloat(l.estimatedValue) || parseFloat(l.estValue) || parseFloat(l.value) || 0,
      owner: l.owner || l.assignedTo || '—',
      stage: l.status || l.stage || 'New',
      nextFollowup: l.followUpDate || l.nextFollowup || '—',
      probability: parseFloat(l.probability) || 0,
      email: l.email || '—',
      notes: l.notes || '',
      status: l.status || 'New',
    }));
    // If no dedicated leads, use clients as leads
    if (!rows.length) {
      (state.clients || []).forEach((c, i) => {
        const inv = (state.saleInvoices || []).filter(si => si.clientId === c.id);
        rows.push({
          leadNo: `LEAD-${String(i + 1).padStart(4, '0')}`,
          date: inv[0]?.date || '', clientName: c.name,
          contact: c.phone || c.email || '—', source: 'Repeat',
          projectType: 'Construction', location: c.city || c.address || '—',
          estValue: inv.reduce((s, si) => s + (parseFloat(si.total) || 0), 0),
          owner: '—', stage: inv.length ? 'Won' : 'Qualified',
          nextFollowup: '—', probability: inv.length ? 100 : 40,
          status: inv.length ? 'Won' : 'Qualified',
        });
      });
    }
    return { rows, kpis: { totalLeads: rows.length, totalPipeline: rows.reduce((s, r) => s + r.estValue, 0) } };
  }

  // ── Sales Pipeline ──
  computeSalesPipeline(params = {}) {
    const probMap = { 'New': 10, 'Contacted': 20, 'Qualified': 40, 'Quoted': 60, 'Won': 100, 'Lost': 0 };
    const leadData = this.computeLeadRegister(params);
    const rows = leadData.rows.filter(l => l.stage !== 'Lost').map(l => {
      const prob = probMap[l.stage] || 30;
      return { stage: l.stage, clientName: l.clientName, estValue: l.estValue, probability: prob, weightedValue: l.estValue * prob / 100, expectedClose: l.nextFollowup || '—', owner: l.owner };
    });
    return { rows, kpis: { totalPipeline: rows.reduce((s, r) => s + r.estValue, 0), weightedPipeline: rows.reduce((s, r) => s + r.weightedValue, 0) } };
  }

  // ── Tender Register ──
  computeTenderRegister(params = {}) {
    const tenders = this._filterByParams(state.tenders || [], params);
    const rows = tenders.map(t => ({
      tenderNo: t.tenderNo || t.id,
      title: t.title || t.description || '—',
      clientDept: t.client || t.department || '—',
      category: t.category || '—',
      emd: parseFloat(t.emd) || 0,
      tenderValue: parseFloat(t.estimatedValue) || parseFloat(t.value) || 0,
      publishDate: t.publishDate || '',
      submissionDate: t.submitDeadline || t.submissionDate || t.date || '—',
      status: t.status || 'Identified',
      notes: t.notes || '',
    }));
    return { rows, kpis: { totalTenders: rows.length, totalValue: rows.reduce((s, r) => s + r.tenderValue, 0) } };
  }

  // ── Weekly Progress ──
  computeWeeklyProgress(params = {}) {
    const progress = this.computeActivityProgress(params);
    return { rows: progress.rows.map(r => ({
      activity: r.description, unit: r.unit,
      planWeek: Math.round((r.boqQty || 0) * 0.05), actualWeek: Math.round((r.achievedQty || 0) * 0.05),
      cumPlan: Math.round((r.boqQty || 0) * 0.6), cumActual: r.achievedQty || 0,
      pctComplete: r.progressPct || 0,
      slipDays: r.progressPct >= 100 ? 0 : Math.round((100 - (r.progressPct || 0)) / 5),
      lookAhead: r.status === 'Complete' ? 'Completed' : 'Continue execution',
    })) };
  }

  // ── Delay Analysis ──
  computeDelayAnalysis(params = {}) {
    const progress = this.computeActivityProgress(params);
    const rows = progress.rows.filter(r => r.progressPct < 100 && r.boqQty > 0).map(r => ({
      activity: r.description, plannedEnd: '—', actualEnd: '—',
      delayDays: Math.round((100 - (r.progressPct || 0)) / 3),
      reason: r.progressPct < 25 ? 'Material' : r.progressPct < 50 ? 'Labour' : 'Weather',
      responsible: 'Contractor', costImpact: Math.round(r.balanceQty * 500),
      recoveryPlan: r.progressPct < 50 ? 'Deploy additional resources' : 'Expedite with OT',
      status: r.progressPct < 25 ? 'Critical' : 'Delayed',
    }));
    return { rows };
  }

  // ── Milestone Tracking ──
  computeMilestoneTracking(params = {}) {
    // Read from state.milestones (form engine entries)
    const stateMilestones = this._filterByParams(state.milestones || [], params);
    if (stateMilestones.length) {
      const rows = stateMilestones.map(m => ({
        milestone: m.name || '—',
        description: m.description || '',
        plannedDate: m.plannedDate || '—',
        actualDate: m.actualDate || '—',
        weightage: parseFloat(m.weightage) || 0,
        status: m.status || 'Not Started',
        remarks: m.remarks || '',
      }));
      const completed = rows.filter(r => r.status === 'Completed').length;
      const totalWeight = rows.reduce((s, r) => s + r.weightage, 0);
      const completedWeight = rows.filter(r => r.status === 'Completed').reduce((s, r) => s + r.weightage, 0);
      return { rows, kpis: { totalMilestones: rows.length, completed, pending: rows.length - completed, progressPct: totalWeight ? +((completedWeight / totalWeight) * 100).toFixed(0) + '%' : '0%' } };
    }
    // Fallback: read from project embedded milestones
    const pid = params.filters?.projectId || state.currentProjectId || state.projects?.[0]?.id;
    const proj = (state.projects || []).find(p => p.id === pid);
    if (!proj) return { rows: [] };
    const milestones = proj.milestones || [];
    const rows = milestones.length ? milestones.map(m => ({
      milestone: m.name || m.description, plannedDate: m.plannedDate || '—',
      actualDate: m.actualDate || '—',
      status: m.status || (m.actualDate ? 'Met' : 'Atrisk'),
      linkedPayment: parseFloat(m.payment) || 0, ldRisk: parseFloat(m.ldRisk) || 0,
    })) : [
      { milestone: 'Mobilization', plannedDate: proj.startDate || '—', actualDate: '—', status: 'Met', linkedPayment: 0, ldRisk: 0 },
      { milestone: 'Foundation Complete', plannedDate: '—', actualDate: '—', status: 'Atrisk', linkedPayment: 0, ldRisk: 0 },
      { milestone: 'Structure Complete', plannedDate: '—', actualDate: '—', status: 'Atrisk', linkedPayment: 0, ldRisk: 0 },
      { milestone: 'Project Handover', plannedDate: proj.endDate || '—', actualDate: '—', status: 'Atrisk', linkedPayment: 0, ldRisk: 0 },
    ];
    return { rows };
  }

  // ── PF Report ──
  computePFReport(params = {}) {
    const labour = state.labourMaster || [];
    const salaries = state.labourSalaries || [];
    const rows = labour.map(l => {
      const sal = salaries.find(s => s.labourId === l.id) || {};
      const basic = parseFloat(sal.basicPay) || parseFloat(l.dailyWage) * 26 || 0;
      const pfWage = Math.min(basic, 15000);
      const ee12 = Math.round(pfWage * 0.12);
      const erEpf = Math.round(pfWage * 0.0367);
      const eps = Math.round(pfWage * 0.0833);
      const edli = Math.round(pfWage * 0.005);
      const admin = Math.round(pfWage * 0.005);
      return { uan: l.uan || '—', name: l.name || '—', pfWage, ee12, erEpf, eps, edli, admin, total: ee12 + erEpf + eps + edli + admin };
    }).filter(r => r.pfWage > 0);
    return { rows, kpis: { totalContribution: rows.reduce((s, r) => s + r.total, 0), members: rows.length } };
  }

  // ── ESIC Register ──
  computeESICRegister(params = {}) {
    const labour = state.labourMaster || [];
    const salaries = state.labourSalaries || [];
    const rows = labour.map(l => {
      const sal = salaries.find(s => s.labourId === l.id) || {};
      const gross = parseFloat(sal.grossWage) || parseFloat(sal.netPay) || parseFloat(l.dailyWage) * 26 || 0;
      if (gross > 21000) return null;
      const ee = Math.round(gross * 0.0075);
      const er = Math.round(gross * 0.0325);
      return { ipNo: l.esicNo || '—', name: l.name || '—', grossWage: gross, days: parseFloat(sal.daysPresent) || 26, ee075: ee, er325: er, total: ee + er };
    }).filter(Boolean);
    return { rows };
  }

  // ── Payroll Summary ──
  computePayrollSummary(params = {}) {
    const projects = state.projects || [];
    const rows = projects.map(p => {
      const labourInProject = (state.labourSalaries || []).filter(l => l.projectId === p.id);
      const headcount = labourInProject.length || (state.labourMaster || []).length;
      const gross = labourInProject.reduce((s, l) => s + (parseFloat(l.grossWage) || parseFloat(l.netPay) || 0), 0);
      const pf = Math.round(gross * 0.12);
      const esic = Math.round(gross * 0.04);
      const pt = headcount * 200;
      const tds = Math.round(gross * 0.02);
      const net = gross - pf - esic - pt - tds;
      return { costCentre: p.name, headcount, gross, pf, esic, pt, tds, net };
    }).filter(r => r.headcount > 0 || r.gross > 0);
    if (!rows.length && (state.labourMaster || []).length) {
      const headcount = state.labourMaster.length;
      const gross = (state.labourSalaries || []).reduce((s, l) => s + (parseFloat(l.grossWage) || parseFloat(l.netPay) || 0), 0);
      rows.push({ costCentre: 'All Projects', headcount, gross, pf: Math.round(gross * 0.12), esic: Math.round(gross * 0.04), pt: headcount * 200, tds: Math.round(gross * 0.02), net: gross * 0.82 });
    }
    return { rows };
  }

  // ── Cash Flow ──
  computeCashFlow(params = {}) {
    const months = {};
    (state.paymentsIn || []).forEach(p => {
      const m = (p.date || '').slice(0, 7);
      if (!months[m]) months[m] = { period: m, opening: 0, collections: 0, otherInflow: 0, vendorPay: 0, salaryWages: 0, statutory: 0, overheads: 0, netFlow: 0, closing: 0 };
      months[m].collections += parseFloat(p.amount) || 0;
    });
    (state.vendorPayments || []).forEach(p => {
      const m = (p.date || '').slice(0, 7);
      if (!months[m]) months[m] = { period: m, opening: 0, collections: 0, otherInflow: 0, vendorPay: 0, salaryWages: 0, statutory: 0, overheads: 0, netFlow: 0, closing: 0 };
      months[m].vendorPay += parseFloat(p.amount) || 0;
    });
    (state.expenses || []).forEach(e => {
      const m = (e.date || '').slice(0, 7);
      if (!months[m]) months[m] = { period: m, opening: 0, collections: 0, otherInflow: 0, vendorPay: 0, salaryWages: 0, statutory: 0, overheads: 0, netFlow: 0, closing: 0 };
      months[m].overheads += parseFloat(e.amount) || 0;
    });
    const rows = Object.values(months).sort((a, b) => a.period.localeCompare(b.period));
    let runBal = 0;
    rows.forEach(r => {
      r.opening = runBal;
      r.netFlow = r.collections + r.otherInflow - r.vendorPay - r.salaryWages - r.statutory - r.overheads;
      r.closing = r.opening + r.netFlow;
      runBal = r.closing;
    });
    return { rows, kpis: { netCashFlow: rows.reduce((s, r) => s + r.netFlow, 0), closingBalance: runBal } };
  }

  // ── Expense Analysis ──
  computeExpenseAnalysis(params = {}) {
    const expenses = state.expenses || [];
    const headMap = {};
    expenses.forEach(e => {
      const head = e.category || e.head || 'General';
      if (!headMap[head]) headMap[head] = { expenseHead: head, project: '—', thisMonth: 0, lastMonth: 0, ytd: 0, pctTotal: 0 };
      headMap[head].ytd += parseFloat(e.amount) || 0;
      const eMonth = (e.date || '').slice(0, 7);
      const now = new Date().toISOString().slice(0, 7);
      if (eMonth === now) headMap[head].thisMonth += parseFloat(e.amount) || 0;
    });
    const total = Object.values(headMap).reduce((s, h) => s + h.ytd, 0);
    const rows = Object.values(headMap).map(h => ({ ...h, pctTotal: total ? +(h.ytd / total * 100).toFixed(1) : 0 }));
    return { rows };
  }

  // ── Equipment Utilization ──
  computeEquipmentUtilization(params = {}) {
    const equipment = state.equipmentList || [];
    const utilLogs = this._filterByParams(state.equipUtilization || [], params);
    const equipLogs = this._filterByParams(state.equipmentLogs || [], params);
    const allLogs = [...utilLogs, ...equipLogs];
    const rows = equipment.map(eq => {
      const eqLogs = allLogs.filter(l => l.equipmentId === eq.id);
      const runHrs = eqLogs.reduce((s, l) => s + (parseFloat(l.hoursRun) || parseFloat(l.workingHours) || parseFloat(l.hours) || 0), 0);
      const idleHrs = eqLogs.reduce((s, l) => s + (parseFloat(l.idleHours) || 0), 0);
      const breakdownHrs = eqLogs.reduce((s, l) => s + (parseFloat(l.breakdownHours) || 0), 0);
      const availHrs = runHrs + idleHrs + breakdownHrs || (eqLogs.length * 8) || 8;
      const costPerHr = parseFloat(eq.hourlyRate) || parseFloat(eq.rentalRate) || 500;
      const utilPct = availHrs ? +(runHrs / availHrs * 100).toFixed(1) : 0;
      const fuelUsed = eqLogs.reduce((s, l) => s + (parseFloat(l.fuelUsed) || 0), 0);
      return {
        equipCode: eq.regNo || eq.id, name: eq.name || '—',
        ownedHired: eq.ownership || 'Owned', availHrs, runHrs, idleHrs, breakdownHrs,
        utilPct, costPerHr, totalCost: runHrs * costPerHr, fuelUsed,
      };
    });
    return { rows: rows.filter(r => r.availHrs > 0), kpis: { fleetUtilization: rows.length ? +(rows.reduce((s, r) => s + r.utilPct, 0) / rows.length).toFixed(1) : 0 } };
  }

  // ── Wage Register ──
  computeWageRegister(params = {}) {
    const labour = state.labourMaster || [];
    const salaries = state.labourSalaries || [];
    const rows = labour.map(l => {
      const sal = salaries.find(s => s.labourId === l.id) || {};
      const days = parseFloat(sal.daysPresent) || 26;
      const rate = parseFloat(l.dailyWage) || parseFloat(l.wageRate) || 0;
      const basic = days * rate;
      const ot = parseFloat(sal.otAmount) || 0;
      const gross = basic + ot;
      const pf = Math.round(Math.min(basic, 15000) * 0.12);
      const esic = gross <= 21000 ? Math.round(gross * 0.0075) : 0;
      const pt = gross > 15000 ? 200 : gross > 10000 ? 150 : 0;
      const advance = parseFloat(sal.advance) || 0;
      return { name: l.name || '—', trade: l.trade || l.designation || '—', days, ratePerDay: rate, basic, ot, gross, pf, esic, pt, advance, netPayable: gross - pf - esic - pt - advance };
    }).filter(r => r.basic > 0);
    return { rows };
  }

  // ── Labour Productivity ──
  computeLabourProductivity(params = {}) {
    const pid = params.filters?.projectId || state.currentProjectId || state.projects?.[0]?.id;
    const proj = (state.projects || []).find(p => p.id === pid);
    if (!proj) return { rows: [] };
    const tradeMap = {};
    (state.labourMaster || []).forEach(l => {
      const trade = l.trade || l.designation || 'General';
      if (!tradeMap[trade]) tradeMap[trade] = { count: 0, totalDays: 0 };
      tradeMap[trade].count++;
      tradeMap[trade].totalDays += 26;
    });
    const rows = [];
    (proj.boqs || []).forEach(boq => {
      (boq.items || []).forEach(item => {
        const output = parseFloat(item.achievedQty) || 0;
        if (output <= 0) return;
        const trade = item.trade || 'Mason';
        const mandays = tradeMap[trade]?.totalDays || 26;
        const productivity = mandays ? +(output / mandays).toFixed(2) : 0;
        const norm = productivity * 1.1;
        rows.push({
          trade, activity: item.description || item.name || '—', unit: item.unit || '—',
          output, mandays, productivity, norm: +norm.toFixed(2),
          efficiency: norm ? +((productivity / norm) * 100).toFixed(1) : 0,
        });
      });
    });
    return { rows };
  }

  // ── Cube Test ──
  computeCubeTest(params = {}) {
    const tests = this._filterByParams(state.cubeTests || [], params);
    const rows = tests.map((t, i) => ({
      cubeId: t.specimenId || t.cubeId || `CT-${String(i + 1).padStart(3, '0')}`,
      castDate: t.date || t.castDate || '—',
      grade: t.grade || 'M25',
      location: t.location || '—',
      supplier: t.supplier || '—',
      batchNo: t.batchNo || '—',
      strength7d: parseFloat(t.strength7d) || 0,
      strength28d: parseFloat(t.strength28d) || 0,
      reqdStrength: parseFloat(t.requiredStrength) || parseFloat(t.reqdStrength) || 25,
      result: t.result || (parseFloat(t.strength28d) >= (parseFloat(t.requiredStrength) || 25) ? 'Pass' : 'Pending'),
      testedBy: t.testedBy || '—',
      remarks: t.remarks || '',
    }));
    const passed = rows.filter(r => r.result === 'Pass').length;
    const failed = rows.filter(r => r.result === 'Fail').length;
    return { rows, kpis: { totalTests: rows.length, passed, failed, pending: rows.length - passed - failed } };
  }

  // ── NCR ──
  computeNCR(params = {}) {
    const ncrs = this._filterByParams(state.ncrReports || [], params);
    const rows = ncrs.map((n, i) => ({
      ncrNo: n.ncrNo || `NCR-${String(i + 1).padStart(3, '0')}`,
      date: n.date || '—',
      category: n.category || '—',
      location: n.location || '—',
      description: n.description || '—',
      severity: n.severity || 'Minor',
      raisedBy: n.raisedBy || '—',
      assignedTo: n.assignedTo || '—',
      correctiveAction: n.correctiveAction || '—',
      targetDate: n.targetDate || '—',
      status: n.status || 'Open',
    }));
    const open = rows.filter(r => r.status === 'Open' || r.status === 'In Progress').length;
    return { rows, kpis: { totalNCRs: rows.length, open, closed: rows.length - open } };
  }

  // ── Incident Report ──
  computeIncidentReport(params = {}) {
    const incidents = this._filterByParams(state.incidents || [], params);
    const rows = incidents.map((inc, i) => ({
      incidentNo: `INC-${String(i + 1).padStart(3, '0')}`,
      date: inc.date || '—',
      type: inc.type || 'Near Miss',
      severity: inc.severity || 'Low',
      location: inc.location || '—',
      injuredPerson: inc.injuredPerson || '—',
      description: inc.description || '—',
      rootCause: inc.rootCause || '—',
      actionTaken: inc.actionTaken || '—',
      reportedBy: inc.reportedBy || '—',
      status: inc.status || 'Open',
    }));
    return { rows, kpis: { totalIncidents: rows.length, open: rows.filter(r => r.status !== 'Closed').length } };
  }

  // ── PPE Compliance ──
  computePPECompliance(params = {}) {
    const records = this._filterByParams(state.ppeChecks || [], params);
    const rows = records.map(r => {
      const items = ['helmet', 'safetyShoes', 'vest', 'gloves', 'goggles', 'harness', 'earPlugs'];
      const applicable = items.filter(i => r[i] && r[i] !== 'N/A');
      const compliant = applicable.filter(i => r[i] === 'Yes').length;
      const pct = applicable.length ? +((compliant / applicable.length) * 100).toFixed(0) : 100;
      return {
        date: r.date || '—',
        workerName: r.workerName || '—',
        area: r.area || '—',
        helmet: r.helmet || 'N/A',
        safetyShoes: r.safetyShoes || 'N/A',
        vest: r.vest || 'N/A',
        gloves: r.gloves || 'N/A',
        goggles: r.goggles || 'N/A',
        harness: r.harness || 'N/A',
        compliancePct: pct,
        remarks: r.remarks || '',
      };
    });
    const avgCompliance = rows.length ? +(rows.reduce((s, r) => s + r.compliancePct, 0) / rows.length).toFixed(0) : 0;
    return { rows, kpis: { totalChecks: rows.length, avgCompliance: avgCompliance + '%' } };
  }

  // ── Quality Inspection (ITP) ──
  computeQualityInspection(params = {}) {
    const checks = this._filterByParams(state.qualityChecks || [], params);
    const rows = checks.map((c, i) => ({
      srNo: i + 1,
      date: c.date || '—',
      checkType: c.checkType || '—',
      location: c.location || '—',
      description: c.description || '—',
      inspectedBy: c.inspectedBy || '—',
      result: c.result || 'Approved',
      remarks: c.remarks || '',
    }));
    const approved = rows.filter(r => r.result === 'Approved' || r.result === 'Approved with Remarks').length;
    const rejected = rows.filter(r => r.result === 'Rejected').length;
    return { rows, kpis: { totalInspections: rows.length, approved, rejected, reInspection: rows.filter(r => r.result === 'Re-Inspection Required').length } };
  }

  // ── MIS Project Profitability ──
  computeMISProjectProfit(params = {}) {
    const projects = state.projects || [];
    const rows = projects.map(p => {
      let contractValue = 0;
      (p.boqs || []).forEach(b => (b.items || []).forEach(item => { contractValue += (parseFloat(item.qty) || 0) * (parseFloat(item.rate) || 0); }));
      if (!contractValue) return null;
      const billed = (state.saleInvoices || []).filter(i => i.projectId === p.id && i.status !== 'Cancelled').reduce((s, i) => s + (parseFloat(i.total) || 0), 0);
      const collected = (state.paymentsIn || []).filter(pay => pay.projectId === p.id).reduce((s, pay) => s + (parseFloat(pay.amount) || 0), 0);
      const costToDate = (state.vendorMaterials || []).filter(v => v.siteId === p.id).reduce((s, v) => s + (parseFloat(v.totalAmount) || 0), 0)
        + (state.labourSalaries || []).filter(l => l.projectId === p.id).reduce((s, l) => s + (parseFloat(l.netPay) || 0), 0);
      const pctComplete = contractValue ? +(costToDate / contractValue * 100).toFixed(1) : 0;
      const forecastMargin = contractValue - (costToDate / Math.max(pctComplete / 100, 0.01));
      const marginPct = contractValue ? +((forecastMargin / contractValue) * 100).toFixed(1) : 0;
      return {
        project: p.name, client: p.clientName || '—', contractValue, billed, collected, costToDate,
        forecastMargin: +forecastMargin.toFixed(0), marginPct: Math.max(-50, Math.min(100, marginPct)),
        pctComplete: Math.min(100, pctComplete),
        status: marginPct > 10 ? 'Healthy' : marginPct > 0 ? 'Tight' : 'Loss',
      };
    }).filter(Boolean);
    return { rows, kpis: { portfolioMargin: rows.length ? +(rows.reduce((s, r) => s + r.marginPct, 0) / rows.length).toFixed(1) : 0, projectsInLoss: rows.filter(r => r.marginPct < 0).length } };
  }

  // ── Helper: filter data by params (handles projectId ↔ siteId equivalence) ──
  _filterByParams(data, params = {}) {
    let filtered = [...data];
    if (params.dateRange?.start) filtered = filtered.filter(r => (r.date || r.createdAt || '') >= params.dateRange.start);
    if (params.dateRange?.end) filtered = filtered.filter(r => (r.date || r.createdAt || '') <= params.dateRange.end);
    if (params.filters) {
      Object.entries(params.filters).forEach(([k, v]) => {
        if (!v) return;
        if (k === 'projectId') {
          // Match projectId OR siteId (vendor materials, inventory use siteId for project)
          filtered = filtered.filter(r => r.projectId === v || r.siteId === v);
        } else if (k === 'siteId') {
          filtered = filtered.filter(r => r.siteId === v || r.projectId === v);
        } else {
          filtered = filtered.filter(r => r[k] === v);
        }
      });
    }
    return filtered;
  }

  // ── Get total report count ──
  static getTotalReportCount() {
    return REPORT_CATEGORIES.reduce((s, c) => s + c.reports.length, 0);
  }
}
