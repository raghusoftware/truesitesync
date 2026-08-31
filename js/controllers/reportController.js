/**
 * ═══════════════════════════════════════════════════════════
 * True Site Sync — Report Controller
 * ═══════════════════════════════════════════════════════════
 * Connects the ReportEngine to the Reports UI.
 * Handles category grid rendering, report execution,
 * table/chart/KPI rendering, export, and navigation.
 * ═══════════════════════════════════════════════════════════
 */

import { ReportEngine, REPORT_CATEGORIES } from '../modules/ReportEngine.js?v=1.6.90';
import { getReportDefinition } from '../config/reportDefinitions.js';
import { addReportHistory, getReportHistory, getDashPref, setDashPref } from '../database/db.js';
import { state } from '../modules/state.js';
import { formatINR, showToast, printReport, getCompanyHeaderForPDF, mobileSavePDF } from '../modules/utils.js';
import { getEntryFormButton, hasEntryForm } from '../modules/formEngine.js';

const engine = new ReportEngine();

// Last executed report result — powers the five-zone A4 PDF export.
let _currentResult = null;
let _currentCat = null;
let _currentReportDef = null;
let _currentParams = {};

// Executive MIS / Dashboard reports now live in the dedicated Analytics page.
// Exclude that category from the Reports module so it shows operational reports only.
const HIDDEN_CATEGORY_IDS = ['dashboard'];
const VISIBLE_CATEGORIES = REPORT_CATEGORIES.filter(c => !HIDDEN_CATEGORY_IDS.includes(c.id));

let _currentCategoryId = null;
let _currentReportId = null;
let _breadcrumb = [];

function _scrollTop() {
  const m = document.querySelector('main');
  if (m) m.scrollTop = 0;
}

// ────────────────────────────────────────────
//  INIT — Render the reports dashboard
// ────────────────────────────────────────────
export function renderReportsDashboard() {
  _currentCategoryId = null;
  _currentReportId = null;
  _breadcrumb = [{ label: 'Reports', action: 'renderReportsDashboard' }];
  _scrollTop();

  const container = document.getElementById('reportsDashContent');
  if (!container) return;

  const totalReports = VISIBLE_CATEGORIES.reduce((s, c) => s + c.reports.length, 0);
  const totalCats = VISIBLE_CATEGORIES.length;

  // Summary KPI bar
  const projectCount = (state.projects || []).length;
  const invoiceCount = (state.saleInvoices || []).length;
  const totalSales = (state.saleInvoices || []).reduce((s, i) => s + (parseFloat(i.total) || 0), 0);
  const totalPurchase = (state.vendorMaterials || []).reduce((s, v) => s + (parseFloat(v.totalAmount) || 0), 0);

  let html = `
    <div class="rpt-breadcrumb"><span class="rpt-bc-active">📊 Reports Dashboard</span></div>

    <div class="rpt-kpi-strip">
      <div class="rpt-kpi-card">
        <div class="rpt-kpi-val">${totalReports}</div>
        <div class="rpt-kpi-lbl">Total Reports</div>
      </div>
      <div class="rpt-kpi-card">
        <div class="rpt-kpi-val">${totalCats}</div>
        <div class="rpt-kpi-lbl">Categories</div>
      </div>
      <div class="rpt-kpi-card">
        <div class="rpt-kpi-val">${projectCount}</div>
        <div class="rpt-kpi-lbl">Projects</div>
      </div>
      <div class="rpt-kpi-card">
        <div class="rpt-kpi-val">${formatINR(totalSales)}</div>
        <div class="rpt-kpi-lbl">Total Sales</div>
      </div>
      <div class="rpt-kpi-card">
        <div class="rpt-kpi-val">${formatINR(totalPurchase)}</div>
        <div class="rpt-kpi-lbl">Total Purchase</div>
      </div>
    </div>

    <div class="rpt-search-bar">
      <input type="text" id="reportSearchInput" placeholder="🔍 Search across ${totalReports} reports..."
             class="rpt-search-input" oninput="window._rptSearchReports(this.value)">
    </div>

    <div id="reportSearchResults" class="rpt-search-results hide"></div>

    <h3 class="rpt-section-title">Report Categories</h3>
    <div class="rpt-category-grid" id="reportCategoryGrid">
  `;

  VISIBLE_CATEGORIES.forEach(cat => {
    html += `
      <div class="rpt-app-icon" onclick="window._rptOpenCategory('${cat.id}')" title="${cat.name} (${cat.reports.length} reports)">
        <div class="rpt-app-icon-circle" style="background:linear-gradient(135deg, ${cat.color}22, ${cat.color}44); border-color: ${cat.color}55;">
          <span class="rpt-app-icon-emoji">${cat.icon}</span>
        </div>
        <div class="rpt-app-icon-name">${cat.name}</div>
        <div class="rpt-app-icon-count">${cat.reports.length} reports</div>
      </div>`;
  });

  html += `</div>`;

  // Recent reports section
  html += `<div id="recentReportsSection"></div>`;

  container.innerHTML = html;

  // Load recent reports async
  _loadRecentReports();
}

async function _loadRecentReports() {
  const section = document.getElementById('recentReportsSection');
  if (!section) return;
  const history = await getReportHistory(8);
  if (!history.length) { section.innerHTML = ''; return; }

  let html = `<h3 class="rpt-section-title" style="margin-top:24px;">Recently Viewed</h3><div class="rpt-recent-list">`;
  const seen = new Set();
  history.forEach(h => {
    if (seen.has(h.reportId)) return;
    seen.add(h.reportId);
    html += `<div class="rpt-recent-item" onclick="window._rptRunReport('${h.reportId}')">
      <span class="rpt-recent-dot"></span> ${h.reportName}
    </div>`;
  });
  html += `</div>`;
  section.innerHTML = html;
}

// ────────────────────────────────────────────
//  CATEGORY VIEW — List reports in a category
// ────────────────────────────────────────────
export function openReportCategory(catId) {
  const cat = REPORT_CATEGORIES.find(c => c.id === catId);
  if (!cat) return;
  _currentCategoryId = catId;
  _currentReportId = null;
  _scrollTop();
  _breadcrumb = [
    { label: 'Reports', action: 'renderReportsDashboard' },
    { label: cat.name, action: null },
  ];

  const container = document.getElementById('reportsDashContent');
  if (!container) return;

  let html = `
    <div class="rpt-breadcrumb">
      <span class="rpt-bc-link" onclick="window._rptGoHome()">📊 Reports</span>
      <span class="rpt-bc-sep">›</span>
      <span class="rpt-bc-active">${cat.icon} ${cat.name}</span>
    </div>

    <div class="rpt-cat-header" style="border-left: 4px solid ${cat.color};">
      <div class="rpt-cat-header-icon" style="background:${cat.color}22; color:${cat.color};">${cat.icon}</div>
      <div>
        <h3 class="rpt-cat-header-title">${cat.name}</h3>
        <p class="rpt-cat-header-count">${cat.reports.length} reports available</p>
      </div>
    </div>

    <div class="rpt-search-bar">
      <input type="text" id="catReportSearch" placeholder="🔍 Search in ${cat.name}..."
             class="rpt-search-input" oninput="window._rptFilterCatReports(this.value, '${catId}')">
    </div>

    <div class="rpt-report-list" id="catReportList">
  `;

  cat.reports.forEach((r, i) => {
    const typeIcon = { dashboard: '📊', table: '📋', kpi: '🎯', chart: '📈' }[r.type] || '📋';
    const typeBadge = { dashboard: 'bg-emerald-100 text-emerald-800', table: 'bg-blue-100 text-blue-800', kpi: 'bg-amber-100 text-amber-800', chart: 'bg-purple-100 text-purple-800' }[r.type] || 'bg-gray-100 text-gray-800';
    html += `
      <div class="rpt-report-row" onclick="window._rptRunReport('${r.id}')" data-name="${r.name.toLowerCase()}">
        <div class="rpt-report-row-num">${i + 1}</div>
        <div class="rpt-report-row-icon">${typeIcon}</div>
        <div class="rpt-report-row-info">
          <div class="rpt-report-row-name">${r.name}</div>
          <div class="rpt-report-row-meta">
            <span class="rpt-type-badge ${typeBadge}">${r.type}</span>
            ${r.dataSource ? `<span class="rpt-ds-badge">📂 ${r.dataSource}</span>` : '<span class="rpt-ds-badge">📂 computed</span>'}
          </div>
        </div>
        <div class="rpt-report-row-arrow">→</div>
      </div>`;
  });

  html += `</div>`;
  container.innerHTML = html;
}

// ────────────────────────────────────────────
//  RUN REPORT — Execute and render results
// ────────────────────────────────────────────
export function runReport(reportId, params = {}) {
  // Find category and report def
  let cat = null, reportDef = null;
  for (const c of REPORT_CATEGORIES) {
    const r = c.reports.find(x => x.id === reportId);
    if (r) { cat = c; reportDef = r; break; }
  }
  if (!reportDef) { showToast('Report not found', 'error'); return; }

  _currentReportId = reportId;
  _scrollTop();
  _breadcrumb = [
    { label: 'Reports', action: 'renderReportsDashboard' },
    { label: cat.name, action: () => openReportCategory(cat.id) },
    { label: reportDef.name, action: null },
  ];

  // Track in history
  addReportHistory(reportId, reportDef.name);

  // Custom composite builders
  if (reportId === 'project_report') { _renderProjectReportPanel(); return; }
  if (reportId === 'bank_statement') { _renderFinancePanel('bank'); return; }
  if (reportId === 'parties_statement') { _renderFinancePanel('parties'); return; }
  if (reportId === 'cash_flow_forecast') { _renderFinancePanel('cashflow'); return; }

  // Execute query
  const result = engine.generateReport(reportId, params);

  const container = document.getElementById('reportsDashContent');
  if (!container) return;

  // Domain definition
  const domainDef = result.domainDef || getReportDefinition(reportId);

  // Cache for the five-zone A4 PDF export.
  _currentResult = result;
  _currentCat = cat;
  _currentReportDef = reportDef;
  _currentParams = params || {};

  let html = `
    <div class="rpt-breadcrumb">
      <span class="rpt-bc-link" onclick="window._rptGoHome()">📊 Reports</span>
      <span class="rpt-bc-sep">›</span>
      <span class="rpt-bc-link" onclick="window._rptOpenCategory('${cat.id}')">${cat.icon} ${cat.name}</span>
      <span class="rpt-bc-sep">›</span>
      <span class="rpt-bc-active">${reportDef.name}</span>
    </div>

    <div class="rpt-report-header">
      <div>
        <h3 class="rpt-report-title">${reportDef.name}</h3>
        <p class="rpt-report-subtitle">${cat.name} • ${domainDef?.statutory ? '🏛️ Statutory' : reportDef.type}</p>
      </div>
      <div class="rpt-report-actions">
        ${getEntryFormButton(reportId)}
        <button class="rpt-btn rpt-btn-outline" onclick="window._rptRefreshReport()">🔄 Refresh</button>
        <button class="rpt-btn rpt-btn-outline" onclick="window._rptExportReportPDF('${reportId}')">📄 PDF</button>
        <button class="rpt-btn rpt-btn-outline" onclick="window._rptExportReportExcel('${reportId}')">📊 Excel</button>
        <button class="rpt-btn rpt-btn-outline" onclick="window._rptPrintReport()">🖨️ Print</button>
      </div>
    </div>

    ${_buildFilterBar(reportId)}
  `;

  // Statutory badge + notes
  if (domainDef?.statutory) {
    html += `<div class="rpt-statutory-badge">🏛️ Statutory Report — Government Format</div>`;
  }
  if (domainDef?.notes) {
    html += `<div class="rpt-domain-note">ℹ️ ${domainDef.notes}</div>`;
  }

  // Render KPIs
  if (result.kpis && Object.keys(result.kpis).length) {
    html += `<div class="rpt-kpi-strip">`;
    Object.entries(result.kpis).forEach(([k, v]) => {
      const label = k.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
      const val = typeof v === 'number' && v > 1000 ? formatINR(v) : v;
      html += `<div class="rpt-kpi-card"><div class="rpt-kpi-val">${val}</div><div class="rpt-kpi-lbl">${label}</div></div>`;
    });
    html += `</div>`;
  }

  // Render table
  html += `<div class="rpt-table-wrap" id="reportTableArea">`;
  if (result.rows.length && result.columns.length) {
    html += _renderDomainTable(result.rows, result.columns, result.headers || null, result.aggregateRow || null, domainDef);
  } else if (!reportDef.dataSource) {
    html += _renderComputedReport(reportId, reportDef);
  } else {
    html += `<div class="rpt-empty"><div class="rpt-empty-icon">📭</div><p>No data found for this report.</p><p class="rpt-empty-hint">Try adjusting filters or adding more data to the system.</p></div>`;
  }
  html += `</div>`;

  // Summary
  if (result.summary && Object.keys(result.summary).length) {
    html += `<div class="rpt-summary-bar">`;
    Object.entries(result.summary).forEach(([k, v]) => {
      html += `<span class="rpt-summary-item"><strong>${k.replace(/([A-Z])/g, ' $1')}:</strong> ${v}</span>`;
    });
    html += `</div>`;
  }

  container.innerHTML = html;
}

// ── Build domain-specific filter bar based on report definition ──
function _buildFilterBar(reportId) {
  const domainDef = getReportDefinition(reportId);
  const filterKeys = domainDef?.filters || ['dateRange', 'project', 'client'];

  let html = `<div class="rpt-filter-bar" id="reportFilterBar">`;

  if (filterKeys.includes('project')) {
    html += `<div class="rpt-filter-group"><label class="rpt-filter-label">Project</label>
      <select id="rptFilterProject" class="rpt-filter-select" onchange="window._rptApplyFilters()">
        <option value="">All Projects</option>
        ${(state.projects || []).map(p => `<option value="${p.id}">${p.name}</option>`).join('')}
      </select></div>`;
  }
  if (filterKeys.includes('dateRange')) {
    html += `<div class="rpt-filter-group"><label class="rpt-filter-label">From</label>
      <input type="date" id="rptFilterDateFrom" class="rpt-filter-input" onchange="window._rptApplyFilters()"></div>`;
    html += `<div class="rpt-filter-group"><label class="rpt-filter-label">To</label>
      <input type="date" id="rptFilterDateTo" class="rpt-filter-input" onchange="window._rptApplyFilters()"></div>`;
  }
  if (filterKeys.includes('period')) {
    const currentYear = new Date().getFullYear();
    const months = ['April','May','June','July','August','September','October','November','December','January','February','March'];
    html += `<div class="rpt-filter-group"><label class="rpt-filter-label">Period</label>
      <select id="rptFilterPeriod" class="rpt-filter-select" onchange="window._rptApplyFilters()">
        <option value="">All Periods</option>
        ${months.map((m, i) => {
          const yr = i < 9 ? currentYear : currentYear + 1;
          const mo = String((i + 4) % 12 || 12).padStart(2, '0');
          return `<option value="${yr}-${mo}">${m} ${yr}</option>`;
        }).join('')}
      </select></div>`;
  }
  if (filterKeys.includes('client')) {
    html += `<div class="rpt-filter-group"><label class="rpt-filter-label">Client</label>
      <select id="rptFilterClient" class="rpt-filter-select" onchange="window._rptApplyFilters()">
        <option value="">All Clients</option>
        ${(state.clients || []).map(c => `<option value="${c.id}">${c.name}</option>`).join('')}
      </select></div>`;
  }
  if (filterKeys.includes('vendor')) {
    html += `<div class="rpt-filter-group"><label class="rpt-filter-label">Vendor</label>
      <select id="rptFilterVendor" class="rpt-filter-select" onchange="window._rptApplyFilters()">
        <option value="">All Vendors</option>
        ${(state.vendors || []).map(v => `<option value="${v.id}">${v.name}</option>`).join('')}
      </select></div>`;
  }
  if (filterKeys.includes('site')) {
    html += `<div class="rpt-filter-group"><label class="rpt-filter-label">Site</label>
      <select id="rptFilterSite" class="rpt-filter-select" onchange="window._rptApplyFilters()">
        <option value="">All Sites</option>
        ${(state.projects || []).map(p => `<option value="${p.id}">${p.name}</option>`).join('')}
      </select></div>`;
  }
  if (filterKeys.includes('material')) {
    html += `<div class="rpt-filter-group"><label class="rpt-filter-label">Material</label>
      <select id="rptFilterMaterial" class="rpt-filter-select" onchange="window._rptApplyFilters()">
        <option value="">All Materials</option>
        ${(state.rawMaterials || []).map(m => `<option value="${m.id}">${m.name}</option>`).join('')}
      </select></div>`;
  }

  html += `<button class="rpt-btn rpt-btn-sm" onclick="window._rptClearFilters()">✕ Clear</button></div>`;
  return html;
}

// ── Render domain-aware table with multi-level headers, column widths, and aggregate footer ──
function _renderDomainTable(rows, columns, headers, aggregateRow, domainDef) {
  let html = `<table class="rpt-table">`;

  // Multi-level header row (if defined)
  if (headers && headers.length) {
    html += `<thead><tr class="rpt-multi-header">`;
    headers.forEach(h => {
      html += `<th colspan="${h.colspan}" class="rpt-multi-header-cell">${h.label}</th>`;
    });
    html += `</tr>`;
  } else {
    html += `<thead>`;
  }

  // Column header row
  html += `<tr>`;
  columns.forEach(c => {
    const align = c.align === 'right' || c.type === 'currency' || c.type === 'number' || c.type === 'percent' ? 'text-right' : '';
    const w = c.width ? `style="min-width:${c.width}px"` : '';
    html += `<th class="${align}" ${w}>${c.label}</th>`;
  });
  html += `</tr></thead><tbody>`;

  // Data rows
  rows.forEach(r => {
    const isTotal = r.type === 'Total' || r._isTotal;
    html += `<tr class="${isTotal ? 'rpt-total-row' : ''}">`;
    columns.forEach(c => {
      let val = r[c.key] ?? '—';
      let cls = c.align === 'right' ? 'text-right' : '';
      if (c.type === 'currency') { val = formatINR(parseFloat(val) || 0); cls = 'text-right'; }
      else if (c.type === 'number') { val = val === '—' ? '—' : (parseFloat(val) || 0).toLocaleString('en-IN'); cls = 'text-right'; }
      else if (c.type === 'percent') { val = val === '—' ? '—' : (parseFloat(val) || 0).toFixed(1) + '%'; cls = 'text-right'; }
      else if (c.type === 'date') { val = val || '—'; }
      else if (c.type === 'badge') {
        const badgeMap = {
          'Active': 'emerald', 'Paid': 'emerald', 'Complete': 'emerald', 'Eligible': 'emerald', 'Under Budget': 'emerald', 'Current': 'emerald',
          'Cancelled': 'red', 'Over Budget': 'red', 'Ineligible': 'red', '90+ Days': 'red',
          'B2B': 'blue', 'B2CS': 'amber', 'B2CL': 'purple', 'In Progress': 'blue', 'Not Started': 'gray',
          'Owned': 'blue', 'Rented': 'amber', 'Yes': 'emerald', 'No': 'gray',
          'Income': 'emerald', 'Expense': 'red', 'Total': 'blue',
          'Released': 'emerald', 'Held': 'amber', 'Pending': 'amber',
        };
        const color = badgeMap[val] || 'blue';
        val = `<span class="rpt-badge rpt-badge-${color}">${val}</span>`;
      }
      html += `<td class="${cls}">${val}</td>`;
    });
    html += `</tr>`;
  });

  // Aggregate footer row
  if (aggregateRow && Object.keys(aggregateRow).length) {
    html += `<tr class="rpt-aggregate-row">`;
    columns.forEach((c, i) => {
      if (i === 0) {
        html += `<td class="rpt-agg-label"><strong>TOTAL</strong></td>`;
      } else if (aggregateRow[c.key] !== undefined) {
        const val = c.type === 'currency' ? formatINR(aggregateRow[c.key]) : (parseFloat(aggregateRow[c.key]) || 0).toLocaleString('en-IN');
        html += `<td class="text-right rpt-agg-val"><strong>${val}</strong></td>`;
      } else {
        html += `<td></td>`;
      }
    });
    html += `</tr>`;
  }

  html += `</tbody></table>`;

  // Row count
  html += `<div class="rpt-row-count">${rows.length} record${rows.length !== 1 ? 's' : ''}</div>`;

  return html;
}

// ── Render computed reports (no direct dataSource) ──
function _renderComputedReport(reportId, reportDef) {
  // Try to compute data based on report type
  const computed = _computeSpecialReport(reportId);
  if (computed && computed.rows.length) {
    return _renderDomainTable(computed.rows, computed.columns, null, null, null);
  }

  return `
    <div class="rpt-computed-card">
      <div class="rpt-computed-icon">${reportDef.type === 'dashboard' ? '📊' : reportDef.type === 'kpi' ? '🎯' : '📋'}</div>
      <h4>${reportDef.name}</h4>
      <p class="rpt-computed-desc">This is a computed report. Data is assembled from multiple sources.</p>
      <div class="rpt-computed-sources">
        <span class="rpt-source-tag">Projects: ${(state.projects || []).length}</span>
        <span class="rpt-source-tag">Invoices: ${(state.saleInvoices || []).length}</span>
        <span class="rpt-source-tag">Purchases: ${(state.vendorMaterials || []).length}</span>
        <span class="rpt-source-tag">Sheets: ${(state.sheets || []).length}</span>
      </div>
    </div>`;
}

// ── Special computed reports ──
function _computeSpecialReport(reportId) {
  switch (reportId) {
    case 'project_profitability':
    case 'profitability_dash':
      return _projectProfitability();
    case 'budget_vs_actual':
      return _budgetVsActual();
    case 'client_outstanding':
      return _clientOutstanding();
    case 'vendor_outstanding':
      return _vendorOutstanding();
    case 'current_stock':
      return _currentStock();
    case 'cash_book':
      return _cashBook();
    case 'pl_statement':
      return _plStatement();
    default:
      return null;
  }
}

function _projectProfitability() {
  const projects = state.projects || [];
  if (!projects.length) return null;
  const rows = projects.map(p => {
    const sales = (state.saleInvoices || []).filter(i => i.projectId === p.id && i.status !== 'Cancelled');
    const purchases = (state.vendorMaterials || []).filter(v => v.siteId === p.id);
    const totalSales = sales.reduce((s, i) => s + (parseFloat(i.total) || 0), 0);
    const totalPurchase = purchases.reduce((s, v) => s + (parseFloat(v.totalAmount) || 0), 0);
    const profit = totalSales - totalPurchase;
    return { name: p.name, clientName: p.clientName || '—', totalSales, totalPurchase, profit, margin: totalSales ? ((profit / totalSales) * 100).toFixed(1) + '%' : '—' };
  });
  return {
    rows,
    columns: [
      { key: 'name', label: 'Project', type: 'text' },
      { key: 'clientName', label: 'Client', type: 'text' },
      { key: 'totalSales', label: 'Total Sales', type: 'currency' },
      { key: 'totalPurchase', label: 'Total Purchase', type: 'currency' },
      { key: 'profit', label: 'Profit', type: 'currency' },
      { key: 'margin', label: 'Margin %', type: 'text' },
    ]
  };
}

function _budgetVsActual() {
  const projects = state.projects || [];
  if (!projects.length) return null;
  const rows = projects.map(p => {
    const boqs = p.boqs || [];
    let budgetTotal = 0;
    boqs.forEach(g => { (g.items || []).forEach(item => { budgetTotal += (parseFloat(item.qty) || 0) * (parseFloat(item.rate) || 0); }); });
    const actualPurchase = (state.vendorMaterials || []).filter(v => v.siteId === p.id).reduce((s, v) => s + (parseFloat(v.totalAmount) || 0), 0);
    const variance = budgetTotal - actualPurchase;
    return { name: p.name, budget: budgetTotal, actual: actualPurchase, variance, status: variance >= 0 ? 'Under Budget' : 'Over Budget' };
  });
  return {
    rows,
    columns: [
      { key: 'name', label: 'Project', type: 'text' },
      { key: 'budget', label: 'Budget', type: 'currency' },
      { key: 'actual', label: 'Actual', type: 'currency' },
      { key: 'variance', label: 'Variance', type: 'currency' },
      { key: 'status', label: 'Status', type: 'badge' },
    ]
  };
}

function _clientOutstanding() {
  const clients = state.clients || [];
  if (!clients.length) return null;
  const rows = clients.map(c => {
    const invoiced = (state.saleInvoices || []).filter(i => i.clientId === c.id && i.status !== 'Cancelled').reduce((s, i) => s + (parseFloat(i.total) || 0), 0);
    const received = (state.paymentsIn || []).filter(p => p.clientId === c.id).reduce((s, p) => s + (parseFloat(p.amount) || 0), 0);
    const outstanding = invoiced - received;
    return { name: c.name, invoiced, received, outstanding };
  }).filter(r => r.invoiced > 0);
  return {
    rows,
    columns: [
      { key: 'name', label: 'Client', type: 'text' },
      { key: 'invoiced', label: 'Total Invoiced', type: 'currency' },
      { key: 'received', label: 'Received', type: 'currency' },
      { key: 'outstanding', label: 'Outstanding', type: 'currency' },
    ]
  };
}

function _vendorOutstanding() {
  const vendors = state.vendors || [];
  if (!vendors.length) return null;
  const rows = vendors.map(v => {
    const billed = (state.vendorMaterials || []).filter(m => m.vendorId === v.id).reduce((s, m) => s + (parseFloat(m.totalAmount) || 0), 0);
    const paid = (state.vendorPayments || []).filter(p => p.vendorId === v.id).reduce((s, p) => s + (parseFloat(p.amount) || 0), 0);
    return { name: v.name, billed, paid, outstanding: billed - paid };
  }).filter(r => r.billed > 0);
  return {
    rows,
    columns: [
      { key: 'name', label: 'Vendor', type: 'text' },
      { key: 'billed', label: 'Total Billed', type: 'currency' },
      { key: 'paid', label: 'Paid', type: 'currency' },
      { key: 'outstanding', label: 'Outstanding', type: 'currency' },
    ]
  };
}

function _currentStock() {
  const txns = state.inventoryTx || [];
  if (!txns.length) return null;
  const stock = {};
  txns.forEach(tx => {
    const key = (tx.rawMaterialId || tx.itemId || 'unknown') + '_' + (tx.siteId || 'all');
    if (!stock[key]) stock[key] = { materialId: tx.rawMaterialId || tx.itemId, siteId: tx.siteId, qty: 0 };
    const qty = parseFloat(tx.qty) || 0;
    stock[key].qty += tx.type === 'IN' ? qty : -qty;
  });
  const rows = Object.values(stock).map(s => {
    const mat = (state.rawMaterials || []).find(m => m.id === s.materialId) || (state.itemsMaster || []).find(m => m.id === s.materialId);
    return { name: mat?.name || s.materialId, unit: mat?.unit || '—', qty: s.qty, site: engine._resolveSite(s.siteId) };
  });
  return {
    rows,
    columns: [
      { key: 'name', label: 'Material', type: 'text' },
      { key: 'unit', label: 'Unit', type: 'text' },
      { key: 'qty', label: 'Qty', type: 'number' },
      { key: 'site', label: 'Site', type: 'text' },
    ]
  };
}

function _cashBook() {
  const allTx = [];
  (state.paymentsIn || []).forEach(p => {
    const client = (state.clients || []).find(c => c.id === p.clientId);
    allTx.push({ date: p.date, particular: 'Received from ' + (client?.name || p.clientId || '—'), debit: parseFloat(p.amount) || 0, credit: 0 });
  });
  (state.vendorPayments || []).forEach(p => {
    const vendor = (state.vendors || []).find(v => v.id === p.vendorId);
    allTx.push({ date: p.date, particular: 'Paid to ' + (vendor?.name || p.partyName || '—'), debit: 0, credit: parseFloat(p.amount) || 0 });
  });
  (state.expenses || []).forEach(e => allTx.push({ date: e.date, particular: 'Expense - ' + (e.category || e.description || ''), debit: 0, credit: parseFloat(e.amount) || 0 }));
  allTx.sort((a, b) => (a.date || '').localeCompare(b.date || ''));
  let balance = 0;
  allTx.forEach(t => { balance += t.debit - t.credit; t.balance = balance; });
  return {
    rows: allTx,
    columns: [
      { key: 'date', label: 'Date', type: 'date' },
      { key: 'particular', label: 'Particulars', type: 'text' },
      { key: 'debit', label: 'Debit', type: 'currency' },
      { key: 'credit', label: 'Credit', type: 'currency' },
      { key: 'balance', label: 'Balance', type: 'currency' },
    ]
  };
}

function _plStatement() {
  const totalSales = (state.saleInvoices || []).filter(i => i.status !== 'Cancelled').reduce((s, i) => s + (parseFloat(i.total) || 0), 0);
  const totalOtherIncome = (state.otherIncome || []).reduce((s, i) => s + (parseFloat(i.amount) || 0), 0);
  const totalPurchase = (state.vendorMaterials || []).reduce((s, v) => s + (parseFloat(v.totalAmount) || 0), 0);
  const totalExpenses = (state.expenses || []).reduce((s, e) => s + (parseFloat(e.amount) || 0), 0);
  const totalLabour = (state.labourSalaries || []).reduce((s, l) => s + (parseFloat(l.netPay) || 0), 0);
  const rows = [
    { particular: 'Sales Revenue', amount: totalSales, type: 'Income' },
    { particular: 'Other Income', amount: totalOtherIncome, type: 'Income' },
    { particular: 'Material Purchase', amount: totalPurchase, type: 'Expense' },
    { particular: 'Operating Expenses', amount: totalExpenses, type: 'Expense' },
    { particular: 'Labour Cost', amount: totalLabour, type: 'Expense' },
    { particular: 'Net Profit', amount: (totalSales + totalOtherIncome) - (totalPurchase + totalExpenses + totalLabour), type: 'Total' },
  ];
  return {
    rows,
    columns: [
      { key: 'particular', label: 'Particulars', type: 'text' },
      { key: 'type', label: 'Type', type: 'badge' },
      { key: 'amount', label: 'Amount', type: 'currency' },
    ]
  };
}

// ────────────────────────────────────────────
//  SEARCH
// ────────────────────────────────────────────
export function searchReports(query) {
  const resultsDiv = document.getElementById('reportSearchResults');
  if (!resultsDiv) return;
  if (!query || query.length < 2) { resultsDiv.classList.add('hide'); return; }

  const q = query.toLowerCase();
  const matches = [];
  VISIBLE_CATEGORIES.forEach(cat => {
    cat.reports.forEach(r => {
      if (r.name.toLowerCase().includes(q) || r.id.includes(q) || cat.name.toLowerCase().includes(q)) {
        matches.push({ ...r, catName: cat.name, catIcon: cat.icon, catId: cat.id });
      }
    });
  });

  if (!matches.length) {
    resultsDiv.innerHTML = `<div class="rpt-search-empty">No reports found for "${query}"</div>`;
    resultsDiv.classList.remove('hide');
    return;
  }

  let html = `<div class="rpt-search-count">${matches.length} results</div>`;
  matches.slice(0, 20).forEach(m => {
    html += `<div class="rpt-search-item" onclick="window._rptRunReport('${m.id}')">
      <span class="rpt-search-item-icon">${m.catIcon}</span>
      <div><div class="rpt-search-item-name">${m.name}</div><div class="rpt-search-item-cat">${m.catName}</div></div>
    </div>`;
  });
  resultsDiv.innerHTML = html;
  resultsDiv.classList.remove('hide');
}

// ────────────────────────────────────────────
//  FILTER CATEGORY REPORTS
// ────────────────────────────────────────────
export function filterCatReports(query, catId) {
  const list = document.getElementById('catReportList');
  if (!list) return;
  const q = query.toLowerCase();
  list.querySelectorAll('.rpt-report-row').forEach(row => {
    const name = row.getAttribute('data-name') || '';
    row.style.display = name.includes(q) ? '' : 'none';
  });
}

// ────────────────────────────────────────────
//  FILTERS
// ────────────────────────────────────────────
export function applyFilters() {
  if (!_currentReportId) return;
  const params = { filters: {}, dateRange: {} };
  const projectId = document.getElementById('rptFilterProject')?.value || '';
  const dateFrom = document.getElementById('rptFilterDateFrom')?.value || '';
  const dateTo = document.getElementById('rptFilterDateTo')?.value || '';
  const clientId = document.getElementById('rptFilterClient')?.value || '';
  const vendorId = document.getElementById('rptFilterVendor')?.value || '';
  const siteId = document.getElementById('rptFilterSite')?.value || '';
  const materialId = document.getElementById('rptFilterMaterial')?.value || '';
  const period = document.getElementById('rptFilterPeriod')?.value || '';
  if (projectId) params.filters.projectId = projectId;
  if (clientId) params.filters.clientId = clientId;
  if (vendorId) params.filters.vendorId = vendorId;
  if (siteId) params.filters.siteId = siteId;
  if (materialId) params.filters.rawMaterialId = materialId;
  if (dateFrom) params.dateRange.start = dateFrom;
  if (dateTo) params.dateRange.end = dateTo;
  if (period) { params.dateRange.start = period + '-01'; params.dateRange.end = period + '-31'; }
  runReport(_currentReportId, params);
}

export function clearFilters() {
  const els = ['rptFilterProject', 'rptFilterDateFrom', 'rptFilterDateTo', 'rptFilterClient', 'rptFilterVendor', 'rptFilterSite', 'rptFilterMaterial', 'rptFilterPeriod'];
  els.forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
  if (_currentReportId) runReport(_currentReportId);
}

// ────────────────────────────────────────────
//  EXPORT
// ────────────────────────────────────────────
// ────────────────────────────────────────────
//  FIVE-ZONE A4 REPORT — shared skeleton for all reports
//  Zone 1 Title Block · Zone 2 Snapshot · Zone 4 Evidence · Footer trail
//  (see design reference "Report Doctrine", TSS-RPT-DR-001)
// ────────────────────────────────────────────
const _PDF_INK = [20, 24, 31];        // near-black slate
const _PDF_ACCENT = [33, 72, 111];    // blueprint indigo
const _PDF_SPARK = [244, 195, 0];     // hi-vis site yellow
const _PDF_MUTE = [108, 117, 128];    // muted ink
const _PDF_LINE = [205, 211, 219];    // hairline
const _PDF_RED = [196, 61, 46];
const _PDF_AMBER = [217, 122, 43];
const _PDF_GREEN = [47, 133, 90];

function _pdfDocNo(reportDef) {
  const abbr = (reportDef.name || 'REP').replace(/[^A-Za-z ]/g, '').split(/\s+/)
    .filter(Boolean).slice(0, 3).map(w => w[0]).join('').toUpperCase() || 'REP';
  const d = new Date();
  const ymd = d.getFullYear() + String(d.getMonth() + 1).padStart(2, '0') + String(d.getDate()).padStart(2, '0');
  return `TSS-${abbr}-${ymd}`;
}

// PDF-safe number formatter (jsPDF core fonts lack the ₹ glyph → use "Rs.")
function _pdfCell(val, type) {
  if (val === undefined || val === null || val === '—' || val === '') return type && type !== 'text' && type !== 'date' && type !== 'badge' ? '—' : (val || '—');
  if (type === 'currency') { const n = parseFloat(val) || 0; return 'Rs. ' + n.toLocaleString('en-IN', { maximumFractionDigits: 0 }); }
  if (type === 'number') { const n = parseFloat(val); return isNaN(n) ? String(val) : n.toLocaleString('en-IN'); }
  if (type === 'percent') { const n = parseFloat(val); return isNaN(n) ? String(val) : n.toFixed(1) + '%'; }
  if (type === 'badge' && typeof val === 'string') return val.replace(/<[^>]*>/g, '');
  return String(val).replace(/<[^>]*>/g, '');
}

// Applied-filter summary line (Zone 1 metadata)
function _pdfPeriodLabel(params) {
  const dr = params && params.dateRange;
  if (dr && (dr.start || dr.end)) {
    const f = dr.start ? dr.start : '…';
    const t = dr.end ? dr.end : '…';
    return `${f}  to  ${t}`;
  }
  return 'All dates';
}

function _pdfScopeLabel(params) {
  const f = (params && params.filters) || {};
  const bits = [];
  if (f.projectId) { const p = (state.projects || []).find(x => x.id === f.projectId); bits.push(p ? p.name : 'Project'); }
  if (f.clientId) { const c = (state.clients || []).find(x => x.id === f.clientId); bits.push(c ? (c.name || c.CompanyName) : 'Client'); }
  if (f.vendorId) bits.push('Supplier'); if (f.siteId) bits.push('Site'); if (f.rawMaterialId) bits.push('Material');
  return bits.length ? bits.join(' · ') : 'All records (organization-wide)';
}

function _pdfCurrentUser() {
  try { const u = (state.rbacUsers || []).find(x => x.id === state.currentUserId) || (state.rbacUsers || [])[0]; if (u) return u.name || u.username || u.email; } catch (_) {}
  return (state.companyProfile && state.companyProfile.CompanyName) || '—';
}

/** Zone 1 (title block) + Zone 2 (snapshot band). Returns the Y to start the table at. */
function _pdfTitleBlock(doc, { reportDef, cat, result, params, docNo }) {
  const pw = doc.internal.pageSize.getWidth();
  const ml = 14, mr = 14;
  let y = getCompanyHeaderForPDF(doc);
  y += 2;

  // Accent spine + hi-vis tick
  const barTop = y, barH = 15;
  doc.setFillColor(_PDF_ACCENT[0], _PDF_ACCENT[1], _PDF_ACCENT[2]);
  doc.rect(ml, barTop, 3, barH, 'F');
  doc.setFillColor(_PDF_SPARK[0], _PDF_SPARK[1], _PDF_SPARK[2]);
  doc.rect(ml, barTop, 3, 3.2, 'F');

  // Report name + category eyebrow
  doc.setTextColor(_PDF_ACCENT[0], _PDF_ACCENT[1], _PDF_ACCENT[2]);
  doc.setFont('helvetica', 'bold'); doc.setFontSize(7.5);
  doc.text(String((cat && cat.name) || 'Report').toUpperCase(), ml + 7, barTop + 3.5);
  doc.setTextColor(_PDF_INK[0], _PDF_INK[1], _PDF_INK[2]);
  doc.setFont('helvetica', 'bold'); doc.setFontSize(15);
  doc.text(String(reportDef.name), ml + 7, barTop + 11);

  // Status chip (right)
  const kpiCount = result && result.kpis ? Object.keys(result.kpis).length : 0;
  const recCount = (result && result.rows) ? result.rows.length : 0;
  const chipTxt = recCount ? `${recCount} RECORD${recCount !== 1 ? 'S' : ''}` : 'NO DATA';
  const chipCol = recCount ? _PDF_GREEN : _PDF_AMBER;
  doc.setFont('helvetica', 'bold'); doc.setFontSize(7.5);
  const cw = doc.getTextWidth(chipTxt) + 8;
  doc.setFillColor(chipCol[0], chipCol[1], chipCol[2]);
  doc.roundedRect(pw - mr - cw, barTop + 1, cw, 6, 1.2, 1.2, 'F');
  doc.setTextColor(255, 255, 255);
  doc.text(chipTxt, pw - mr - cw + 4, barTop + 5.1);

  y = barTop + barH + 2;

  // Metadata grid — DOC NO / REV / PERIOD / SCOPE / PREPARED BY / GENERATED
  const meta = [
    ['DOC NO', docNo], ['REV', 'A'],
    ['PERIOD', _pdfPeriodLabel(params)], ['SCOPE', _pdfScopeLabel(params)],
    ['PREPARED BY', _pdfCurrentUser()], ['GENERATED', new Date().toLocaleString('en-IN')],
  ];
  doc.setDrawColor(_PDF_LINE[0], _PDF_LINE[1], _PDF_LINE[2]); doc.setLineWidth(0.2);
  doc.line(ml, y, pw - mr, y);
  y += 3.5;
  const colW = (pw - ml - mr) / 2;
  for (let i = 0; i < meta.length; i += 2) {
    const rowY = y + (i / 2) * 5.2;
    [0, 1].forEach(j => {
      const cell = meta[i + j]; if (!cell) return;
      const x = ml + j * colW;
      doc.setFont('helvetica', 'bold'); doc.setFontSize(6.2); doc.setTextColor(_PDF_MUTE[0], _PDF_MUTE[1], _PDF_MUTE[2]);
      doc.text(cell[0], x, rowY);
      doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(_PDF_INK[0], _PDF_INK[1], _PDF_INK[2]);
      doc.text(doc.splitTextToSize(String(cell[1]), colW - 24)[0] || '—', x + 22, rowY);
    });
  }
  y += (meta.length / 2) * 5.2 + 1;
  doc.setDrawColor(_PDF_INK[0], _PDF_INK[1], _PDF_INK[2]); doc.setLineWidth(0.5);
  doc.line(ml, y, pw - mr, y);
  y += 5;

  // Zone 2 — Snapshot band (KPI cards)
  if (kpiCount) {
    const entries = Object.entries(result.kpis).slice(0, 5);
    const gap = 3, n = entries.length;
    const cardW = (pw - ml - mr - gap * (n - 1)) / n;
    const cardH = 15;
    entries.forEach(([k, v], i) => {
      const x = ml + i * (cardW + gap);
      doc.setDrawColor(_PDF_LINE[0], _PDF_LINE[1], _PDF_LINE[2]); doc.setLineWidth(0.2);
      doc.roundedRect(x, y, cardW, cardH, 1.5, 1.5, 'S');
      doc.setFillColor(_PDF_ACCENT[0], _PDF_ACCENT[1], _PDF_ACCENT[2]);
      doc.rect(x, y, 1.4, cardH, 'F');
      const label = k.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
      doc.setFont('helvetica', 'bold'); doc.setFontSize(5.8); doc.setTextColor(_PDF_MUTE[0], _PDF_MUTE[1], _PDF_MUTE[2]);
      doc.text(doc.splitTextToSize(label.toUpperCase(), cardW - 6), x + 4, y + 4);
      let val = v;
      if (typeof v === 'number') val = v > 1000 ? 'Rs. ' + v.toLocaleString('en-IN', { maximumFractionDigits: 0 }) : String(v);
      else val = String(v).replace(/<[^>]*>/g, '');
      doc.setFont('helvetica', 'bold'); doc.setFontSize(12.5); doc.setTextColor(_PDF_INK[0], _PDF_INK[1], _PDF_INK[2]);
      const vLines = doc.splitTextToSize(String(val), cardW - 6);
      doc.text(vLines[0], x + 4, y + 11.5);
    });
    y += cardH + 5;
  }

  return y;
}

/** Footer + running header stamped on every page after the table is laid out. */
function _pdfStampChrome(doc, { reportDef, docNo }) {
  const pw = doc.internal.pageSize.getWidth();
  const ph = doc.internal.pageSize.getHeight();
  const ml = 14, mr = 14;
  const total = doc.internal.getNumberOfPages();
  const cut = 'Cut-off ' + new Date().toLocaleString('en-IN');
  for (let p = 1; p <= total; p++) {
    doc.setPage(p);
    // Running header on continuation pages
    if (p > 1) {
      doc.setDrawColor(_PDF_INK[0], _PDF_INK[1], _PDF_INK[2]); doc.setLineWidth(0.4);
      doc.line(ml, 12, pw - mr, 12);
      doc.setFillColor(_PDF_ACCENT[0], _PDF_ACCENT[1], _PDF_ACCENT[2]); doc.rect(ml, 8.2, 3, 3, 'F');
      doc.setFont('helvetica', 'bold'); doc.setFontSize(7.5); doc.setTextColor(_PDF_INK[0], _PDF_INK[1], _PDF_INK[2]);
      doc.text(String(reportDef.name) + '  (continued)', ml + 5, 11);
      doc.setFont('helvetica', 'normal'); doc.setFontSize(6.5); doc.setTextColor(_PDF_MUTE[0], _PDF_MUTE[1], _PDF_MUTE[2]);
      doc.text(docNo, pw - mr, 11, { align: 'right' });
    }
    // Footer
    doc.setDrawColor(_PDF_LINE[0], _PDF_LINE[1], _PDF_LINE[2]); doc.setLineWidth(0.2);
    doc.line(ml, ph - 11, pw - mr, ph - 11);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(6.2); doc.setTextColor(_PDF_MUTE[0], _PDF_MUTE[1], _PDF_MUTE[2]);
    doc.text('True Site Sync  ·  ' + docNo, ml, ph - 7);
    doc.text(cut, pw / 2, ph - 7, { align: 'center' });
    doc.setFont('helvetica', 'bold'); doc.setTextColor(_PDF_INK[0], _PDF_INK[1], _PDF_INK[2]);
    doc.text(`Page ${p} of ${total}`, pw - mr, ph - 7, { align: 'right' });
  }
}

export function exportReportPDF(reportId) {
  const reportDef = _currentReportDef && _currentReportDef.id === reportId ? _currentReportDef : _findReport(reportId);
  if (!reportDef) return;
  const result = (_currentResult && _currentReportDef && _currentReportDef.id === reportId) ? _currentResult : null;
  const cat = _currentCat || null;
  const params = _currentParams || {};
  try {
    const useResult = result && result.rows && result.rows.length && result.columns && result.columns.length;
    // Wide tables → landscape; otherwise portrait A4 (the doctrine default).
    const colCount = useResult ? result.columns.length : (document.querySelectorAll('#reportTableArea thead th').length || 6);
    const orient = colCount > 7 ? 'l' : 'p';
    const doc = new window.jspdf.jsPDF(orient, 'mm', 'a4');
    const docNo = _pdfDocNo(reportDef);

    const startY = _pdfTitleBlock(doc, { reportDef, cat, result, params, docNo });

    const tableCommon = {
      startY,
      margin: { left: 14, right: 14, top: 16, bottom: 14 },
      styles: { fontSize: 7, cellPadding: 1.8, overflow: 'linebreak', lineColor: _PDF_LINE, lineWidth: 0.1, textColor: [57, 66, 78] },
      headStyles: { fillColor: _PDF_INK, textColor: [255, 255, 255], fontSize: 6.8, fontStyle: 'bold', halign: 'left' },
      alternateRowStyles: { fillColor: [246, 247, 248] },
    };

    if (useResult) {
      const cols = result.columns;
      const head = [cols.map(c => c.label)];
      const body = result.rows.map(r => cols.map(c => _pdfCell(r[c.key], c.type)));
      if (result.aggregateRow && Object.keys(result.aggregateRow).length) {
        body.push(cols.map((c, i) => i === 0 ? 'TOTAL' : (result.aggregateRow[c.key] !== undefined ? _pdfCell(result.aggregateRow[c.key], c.type || 'number') : '')));
      }
      const columnStyles = {};
      cols.forEach((c, i) => { if (c.align === 'right' || c.type === 'currency' || c.type === 'number' || c.type === 'percent') columnStyles[i] = { halign: 'right' }; });
      const totalIdx = result.aggregateRow && Object.keys(result.aggregateRow).length ? body.length - 1 : -1;
      const totalRows = new Set(result.rows.map((r, i) => (r.type === 'Total' || r._isTotal) ? i : -1).filter(i => i >= 0));
      doc.autoTable({
        ...tableCommon, head, body, columnStyles,
        didParseCell: (d) => {
          if (d.section === 'body' && (d.row.index === totalIdx || totalRows.has(d.row.index))) {
            d.cell.styles.fontStyle = 'bold'; d.cell.styles.fillColor = [238, 242, 247]; d.cell.styles.textColor = _PDF_INK;
          }
        },
      });
    } else {
      const tableEl = document.querySelector('#reportTableArea table');
      if (tableEl) doc.autoTable({ ...tableCommon, html: tableEl });
      else { doc.setFontSize(10); doc.setTextColor(_PDF_MUTE[0], _PDF_MUTE[1], _PDF_MUTE[2]); doc.text('No data found for this report.', 14, startY + 8); }
    }

    _pdfStampChrome(doc, { reportDef, docNo });
    mobileSavePDF(doc, reportDef.name.replace(/\s+/g, '_') + '.pdf');
    showToast('PDF exported', 'success');
  } catch (e) { showToast('PDF export failed: ' + e.message, 'error'); }
}

export function exportReportExcel(reportId) {
  const reportDef = _findReport(reportId);
  if (!reportDef) return;
  try {
    const tableEl = document.querySelector('#reportTableArea table');
    if (!tableEl) { showToast('No table data to export', 'error'); return; }
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.table_to_sheet(tableEl);
    XLSX.utils.book_append_sheet(wb, ws, reportDef.name.slice(0, 31));
    XLSX.writeFile(wb, reportDef.name.replace(/\s+/g, '_') + '.xlsx');
    showToast('Excel exported', 'success');
  } catch (e) { showToast('Excel export failed: ' + e.message, 'error'); }
}

export function printCurrentReport() {
  const area = document.getElementById('reportTableArea');
  if (!area) return;
  const w = window.open('', '_blank');
  w.document.write(`<html><head><title>Report</title><style>
    body{font-family:Arial;padding:20px} table{width:100%;border-collapse:collapse;font-size:12px}
    th,td{border:1px solid #ddd;padding:6px 8px;text-align:left} th{background:#0f172a;color:#fff}
    .text-right{text-align:right} .rpt-badge{padding:2px 6px;border-radius:4px;font-size:10px}
  </style></head><body>${area.innerHTML}</body></html>`);
  w.document.close();
  w.print();
}

function _findReport(reportId) {
  for (const c of REPORT_CATEGORIES) {
    const r = c.reports.find(x => x.id === reportId);
    if (r) return r;
  }
  return null;
}

// ────────────────────────────────────────────
//  WINDOW BINDINGS
// ────────────────────────────────────────────
window._rptGoHome = renderReportsDashboard;
window._rptOpenCategory = openReportCategory;
window._rptRunReport = runReport;
window._rptSearchReports = searchReports;
window._rptFilterCatReports = filterCatReports;
window._rptApplyFilters = applyFilters;
window._rptClearFilters = clearFilters;
function _renderProjectReportPanel() {
  const container = document.getElementById('reportsDashContent');
  if (!container) return;
  const projects = state.projects || [];
  const cur = state.currentProjectId || (projects[0] && projects[0].id) || '';
  const opts = projects.map(p => `<option value="${p.id}" ${p.id === cur ? 'selected' : ''}>${(p.name || 'Project').replace(/</g, '&lt;')}${p.code ? ' (' + p.code + ')' : ''}</option>`).join('');
  container.innerHTML = `
    <div style="max-width:640px;margin:0 auto;">
      <button onclick="renderReportsDashboard()" style="margin-bottom:14px;padding:6px 14px;background:#f1f5f9;border:1px solid #e2e8f0;border-radius:8px;color:#64748b;font-size:12px;font-weight:600;cursor:pointer;">&larr; Reports</button>
      <div style="background:#fff;border:1px solid #e2e8f0;border-radius:16px;padding:24px;box-shadow:0 1px 4px rgba(0,0,0,.04);">
        <h2 style="font-size:20px;font-weight:800;color:#1e3a8a;margin-bottom:4px;">&#127970; Project Report (Master)</h2>
        <p style="font-size:13px;color:#64748b;margin-bottom:18px;">One consolidated report — project &amp; WO info, financial summary, schedule, execution (DPR / pours / milestones / quality / safety), labour, equipment, sales &amp; purchase transactions, issues and site photos.</p>
        ${projects.length ? `
        <label style="display:block;font-size:11px;font-weight:700;color:#64748b;margin-bottom:4px;text-transform:uppercase;">Select Project</label>
        <select id="prjRptSel" style="width:100%;padding:10px 12px;border:1px solid #e2e8f0;border-radius:10px;font-size:14px;font-weight:600;margin-bottom:18px;">${opts}</select>
        <div style="display:flex;gap:10px;flex-wrap:wrap;">
          <button onclick="window.exportProjectReportPDF(document.getElementById('prjRptSel').value)" style="flex:1;min-width:160px;padding:12px;background:#1e3a8a;color:#fff;border:none;border-radius:10px;font-weight:700;font-size:14px;cursor:pointer;">&#128424; Download PDF</button>
          <button onclick="window.exportProjectReportExcel(document.getElementById('prjRptSel').value)" style="flex:1;min-width:160px;padding:12px;background:#10b981;color:#fff;border:none;border-radius:10px;font-weight:700;font-size:14px;cursor:pointer;">&#128202; Download Excel</button>
        </div>` : '<p style="color:#94a3b8;">No projects yet. Create a project first.</p>'}
      </div>
    </div>`;
}

function _renderFinancePanel(kind) {
  const container = document.getElementById('reportsDashContent');
  if (!container) return;
  const back = `<button onclick="renderReportsDashboard()" style="margin-bottom:14px;padding:6px 14px;background:#f1f5f9;border:1px solid #e2e8f0;border-radius:8px;color:#64748b;font-size:12px;font-weight:600;cursor:pointer;">&larr; Reports</button>`;
  const box = (title, desc, body) => `<div style="max-width:640px;margin:0 auto;">${back}<div style="background:#fff;border:1px solid #e2e8f0;border-radius:16px;padding:24px;box-shadow:0 1px 4px rgba(0,0,0,.04);"><h2 style="font-size:20px;font-weight:800;color:#1e3a8a;margin-bottom:4px;">${title}</h2><p style="font-size:13px;color:#64748b;margin-bottom:18px;">${desc}</p>${body}</div></div>`;
  const btns = (pdfFn, xlFn) => `<div style="display:flex;gap:10px;flex-wrap:wrap;">
      <button onclick="${pdfFn}" style="flex:1;min-width:160px;padding:12px;background:#1e3a8a;color:#fff;border:none;border-radius:10px;font-weight:700;font-size:14px;cursor:pointer;">&#128424; Download PDF</button>
      <button onclick="${xlFn}" style="flex:1;min-width:160px;padding:12px;background:#10b981;color:#fff;border:none;border-radius:10px;font-weight:700;font-size:14px;cursor:pointer;">&#128202; Download Excel</button>
    </div>`;
  const selStyle = 'width:100%;padding:10px 12px;border:1px solid #e2e8f0;border-radius:10px;font-size:14px;font-weight:600;margin-bottom:18px;';
  const lbl = 'display:block;font-size:11px;font-weight:700;color:#64748b;margin-bottom:4px;text-transform:uppercase;';

  if (kind === 'bank') {
    const accs = state.accounts || [];
    const body = accs.length
      ? `<label style="${lbl}">Select Account</label><select id="finSel" style="${selStyle}">${accs.map(a => `<option value="${a.id}">${(a.name || '').replace(/</g, '&lt;')} (${a.type || 'Account'})</option>`).join('')}</select>${btns("window.exportBankStatementPDF(document.getElementById('finSel').value)", "window.exportBankStatementExcel(document.getElementById('finSel').value)")}`
      : '<p style="color:#94a3b8;">No bank/cash accounts yet.</p>';
    container.innerHTML = box('&#127974; Bank / Cash Statement', 'Running-balance statement of all receipts, payments, transfers and petty-cash top-ups for an account.', body);
  } else if (kind === 'parties') {
    const esc = s => (s || '').replace(/</g, '&lt;');
    const cl = (state.clients || []).map(c => `<option value="client:${c.id}">🏢 ${esc(c.name)}</option>`).join('');
    const vn = (state.vendors || []).map(v => `<option value="vendor:${v.id}">🏭 ${esc(v.name)}</option>`).join('');
    const lb = (state.labourMaster || []).map(l => `<option value="labour:${l.id}">👷 ${esc(l.name)}</option>`).join('');
    const gg = (state.labourContractors || []).map(g => `<option value="contractor:${g.id}">🧑‍🔧 ${esc(g.name)}</option>`).join('');
    // Default period: current financial year (India, 1 Apr) → today.
    const now = new Date();
    const fyStart = (now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1) + '-04-01';
    const today = now.toISOString().split('T')[0];
    const dateStyle = 'width:100%;padding:9px 12px;border:1px solid #e2e8f0;border-radius:10px;font-size:13px;font-weight:600;';
    const args = "document.getElementById('finSel').value, document.getElementById('finFrom').value, document.getElementById('finTo').value";
    const body = (cl || vn || lb || gg)
      ? `<label style="${lbl}">Select Party</label><select id="finSel" style="${selStyle}">
           ${cl ? '<optgroup label="Clients">' + cl + '</optgroup>' : ''}
           ${vn ? '<optgroup label="Vendors">' + vn + '</optgroup>' : ''}
           ${lb ? '<optgroup label="Labour">' + lb + '</optgroup>' : ''}
           ${gg ? '<optgroup label="Contractors / Gangs">' + gg + '</optgroup>' : ''}
         </select>
         <div style="display:flex;gap:12px;margin-bottom:18px;">
           <div style="flex:1;"><label style="${lbl}">From</label><input type="date" id="finFrom" value="${fyStart}" style="${dateStyle}"></div>
           <div style="flex:1;"><label style="${lbl}">To</label><input type="date" id="finTo" value="${today}" style="${dateStyle}"></div>
         </div>
         ${btns("window.exportPartiesStatementPDF(" + args + ")", "window.exportPartiesStatementExcel(" + args + ")")}`
      : '<p style="color:#94a3b8;">No parties yet.</p>';
    container.innerHTML = box('&#129309; Parties Statement', 'Tally-style debit/credit ledger with opening balance and running balance for any client, vendor, labour or gang — filtered by date.', body);
  } else {
    container.innerHTML = box('&#128176; Cash Flow Forecast', 'Current cash &amp; bank position, expected inflows (receivables) and outflows (payables), with a 6-month projection.', btns('window.exportCashFlowForecastPDF()', 'window.exportCashFlowForecastExcel()'));
  }
}

window._rptRefreshReport = () => { if (_currentReportId) runReport(_currentReportId); };
window._rptExportReportPDF = exportReportPDF;
window._rptExportReportExcel = exportReportExcel;
window._rptPrintReport = printCurrentReport;
