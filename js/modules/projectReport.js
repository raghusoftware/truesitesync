/**
 * ═══════════════════════════════════════════════════════════
 * True Site Sync — Project Report (master composite)
 * ═══════════════════════════════════════════════════════════
 * One consolidated report per project, pulling from every module:
 * project + WO info, financial summary, BOQ vs executed, schedule,
 * execution (DPR/pours/milestones/QA/safety), labour, equipment,
 * transactions (sales/purchase/payments), issues, and site photos.
 * Exports a professional PDF and a multi-sheet Excel.
 * ═══════════════════════════════════════════════════════════
 */

import { state } from './state.js';
import { showToast, getPdfCurrency, mobileSavePDF, mobileSaveXLSX } from './utils.js';
import { formatNumber2 } from './format.js';

const _n2 = formatNumber2;
const _num = v => parseFloat(v) || 0;
const _hdr = (doc, o) => (typeof window !== 'undefined' && window.getSimpleHeaderForPDF) ? window.getSimpleHeaderForPDF(doc, o) : 16;

function _gather(pid) {
  const proj = (state.projects || []).find(p => p.id === pid) || {};
  const client = (state.clients || []).find(c => c.id === proj.clientId) || {};
  const by = key => (state[key] || []).filter(r => r.projectId === pid);
  const sum = (arr, f) => arr.reduce((s, r) => s + _num(typeof f === 'function' ? f(r) : r[f]), 0);

  const abstracts = by('abstracts');
  const invoices = by('saleInvoices');
  const paymentsIn = by('paymentsIn');
  const purchases = by('vendorMaterials');
  const expenses = by('expenses');
  const vendorPayments = by('vendorPayments');
  const labourSalaries = by('labourSalaries');
  const equipmentLogs = by('equipmentLogs');
  const tasks = by('planningTasks');
  const dpr = by('dailyProgress');
  const pours = by('concretePours');
  const milestones = by('milestones');
  const quality = by('qualityChecks');
  const safety = by('incidents');
  const issues = by('issues');

  const fin = {
    workBilled: sum(abstracts, 'totalAmount'),
    invoiced: sum(invoices, 'total'),
    received: sum(paymentsIn, 'amount'),
    purchases: sum(purchases, r => r.totalAmount ?? r.amount),
    expenses: sum(expenses, 'amount'),
    vendorPaid: sum(vendorPayments, 'amount'),
    labourCost: sum(labourSalaries, 'amount'),
    equipmentCost: sum(equipmentLogs, 'amount'),
  };
  fin.totalCost = fin.purchases + fin.expenses + fin.labourCost + fin.equipmentCost;
  fin.revenue = fin.invoiced || fin.workBilled;
  fin.margin = fin.revenue - fin.totalCost;
  fin.outstanding = (fin.invoiced || fin.workBilled) - fin.received;

  const woNo = (proj.boqs || []).map(g => g.woNumber).filter(Boolean).join(', ') || proj.woNumber || '';
  const boqValue = (proj.boqs || []).reduce((s, g) => s + _num(g.poValue), 0) || _num(proj.budget);

  // collect photos
  const photos = [];
  [['dailyProgress', dpr], ['concretePours', pours], ['qualityChecks', quality], ['incidents', safety], ['issues', issues]]
    .forEach(([, arr]) => arr.forEach(r => { if (r.photo) photos.push(r.photo); }));

  return { proj, client, woNo, boqValue, fin, abstracts, invoices, paymentsIn, purchases, expenses, tasks, dpr, pours, milestones, quality, safety, issues, photos };
}

// ══════════════════════════════════════════════════════════
//  PDF
// ══════════════════════════════════════════════════════════
export function exportProjectReportPDF(pid) {
  try {
    pid = pid || state.currentProjectId;
    if (!pid) return showToast('Select a project first', 'error');
    if (!window.jspdf || !window.jspdf.jsPDF) return showToast('PDF library not loaded — refresh the page', 'error');
    const d = _gather(pid);
    const doc = new window.jspdf.jsPDF('p', 'mm', 'a4');
    const pw = doc.internal.pageSize.getWidth(), ph = doc.internal.pageSize.getHeight();
    const ml = 12, mr = 12;
    const cur = (getPdfCurrency() || 'Rs.').trim();
    const M = v => cur + ' ' + _n2(v);
    const accent = [30, 58, 138];

    let y = _hdr(doc, { ml, mr });
    doc.setFillColor(accent[0], accent[1], accent[2]); doc.rect(ml, y, pw - ml - mr, 9, 'F');
    doc.setTextColor(255, 255, 255); doc.setFont('helvetica', 'bold'); doc.setFontSize(13);
    doc.text('PROJECT REPORT', pw / 2, y + 6.2, { align: 'center' });
    y += 13; doc.setTextColor(0, 0, 0);

    const sec = (title) => {
      if (y > ph - 28) { doc.addPage(); y = 16; }
      doc.setFont('helvetica', 'bold'); doc.setFontSize(11); doc.setTextColor(accent[0], accent[1], accent[2]);
      doc.text(title, ml, y); doc.setTextColor(0, 0, 0); y += 2;
    };
    const tbl = (head, body, colStyles) => {
      if (!body.length) { doc.setFont('helvetica', 'italic'); doc.setFontSize(8.5); doc.setTextColor(150); doc.text('No records.', ml, y + 5); doc.setTextColor(0); y += 9; return; }
      doc.autoTable({ startY: y + 2, head: head ? [head] : undefined, body, theme: 'grid',
        headStyles: { fillColor: accent, textColor: 255, fontSize: 7.5, halign: 'center', fontStyle: 'bold' },
        styles: { fontSize: 7.5, cellPadding: 1.6, overflow: 'linebreak' }, columnStyles: colStyles || {}, margin: { left: ml, right: mr } });
      y = doc.lastAutoTable.finalY + 6;
    };

    // Project info
    const p = d.proj;
    doc.autoTable({ startY: y + 1, theme: 'grid', styles: { fontSize: 8.5, cellPadding: 2 },
      columnStyles: { 0: { fontStyle: 'bold', cellWidth: 32, fillColor: [239, 246, 255] }, 1: { cellWidth: 62 }, 2: { fontStyle: 'bold', cellWidth: 30, fillColor: [239, 246, 255] }, 3: { cellWidth: 'auto' } },
      body: [
        ['Project', p.name || '—', 'Code', p.code || '—'],
        ['Client', d.client.name || p.clientName || '—', 'Status', p.status || '—'],
        ['WO No.', d.woNo || '—', 'WO Value', M(d.boqValue)],
        ['Location', p.location || '—', 'Manager', p.manager || '—'],
        ['Start', p.startDate || '—', 'End', p.endDate || '—'],
      ], margin: { left: ml, right: mr } });
    y = doc.lastAutoTable.finalY + 6;

    // Financial summary
    sec('Financial Summary');
    const f = d.fin;
    tbl(['Particular', 'Amount', 'Particular', 'Amount'], [
      ['Work Billed (Abstracts)', M(f.workBilled), 'Material Purchases', M(f.purchases)],
      ['Tax Invoices', M(f.invoiced), 'Site Expenses', M(f.expenses)],
      ['Received', M(f.received), 'Labour Cost', M(f.labourCost)],
      ['Outstanding', M(f.outstanding), 'Equipment Cost', M(f.equipmentCost)],
      [{ content: 'Revenue', styles: { fontStyle: 'bold' } }, { content: M(f.revenue), styles: { fontStyle: 'bold' } }, { content: 'Total Cost', styles: { fontStyle: 'bold' } }, { content: M(f.totalCost), styles: { fontStyle: 'bold' } }],
      [{ content: 'Gross Margin', styles: { fontStyle: 'bold', textColor: f.margin >= 0 ? [16, 133, 89] : [220, 38, 38] } }, { content: M(f.margin), styles: { fontStyle: 'bold', textColor: f.margin >= 0 ? [16, 133, 89] : [220, 38, 38] } }, '', ''],
    ], { 1: { halign: 'right' }, 3: { halign: 'right' } });

    // Schedule
    sec('Schedule (Planning Tasks)');
    tbl(['Task', 'Status', 'Prog', 'Start', 'End'],
      d.tasks.map(t => [t.name || '', t.status || '', (t.progress || 0) + '%', t.startDate || '', t.endDate || '']),
      { 0: { cellWidth: 'auto' }, 2: { halign: 'center', cellWidth: 14 } });

    // Execution summary
    sec('Execution Summary');
    const pourVol = d.pours.reduce((s, x) => s + _num(x.volume), 0);
    tbl(null, [
      ['Daily Progress Reports', String(d.dpr.length)],
      ['Concrete Pours', d.pours.length + '  (' + pourVol.toFixed(2) + ' m³)'],
      ['Milestones', d.milestones.filter(m => m.status === 'Completed').length + ' / ' + d.milestones.length + ' completed'],
      ['Quality Records', String(d.quality.length)],
      ['Safety Records', String(d.safety.length)],
      ['Open Issues', String(d.issues.filter(i => i.status !== 'Solved').length)],
    ], { 0: { fontStyle: 'bold', cellWidth: 70 } });

    if (d.pours.length) {
      sec('Concrete Pours');
      tbl(['Pour', 'Date', 'Element', 'Grade', 'Vol m³', 'Slump', 'Cubes'],
        d.pours.map(x => [x.pourNo || '', x.date || '', x.element || '', x.grade || '', _num(x.volume).toFixed(2), x.slump || '', x.cubes || '']),
        { 4: { halign: 'right' } });
    }

    // Transactions
    sec('Sales Invoices');
    tbl(['Invoice', 'Date', 'Taxable', 'Tax', 'Total'],
      d.invoices.map(i => [i.invoiceNo || '', i.date || '', _n2(i.subtotal), _n2(i.gstAmount), _n2(i.total)]),
      { 2: { halign: 'right' }, 3: { halign: 'right' }, 4: { halign: 'right' } });

    sec('Purchase Bills');
    tbl(['Bill', 'Date', 'Vendor', 'Amount'],
      d.purchases.map(b => [b.billNo || '', b.date || '', (state.vendors || []).find(v => v.id === b.vendorId)?.name || '', _n2(b.totalAmount ?? b.amount)]),
      { 3: { halign: 'right' } });

    // Issues
    if (d.issues.length) {
      sec('Issues');
      tbl(['Title', 'Category', 'Priority', 'Status'],
        d.issues.map(i => [i.title || '', i.category || '', i.priority || '', i.status === 'Solved' ? 'Solved' : (i.dueDate && i.dueDate < new Date().toISOString().slice(0, 10) ? 'Delayed' : 'Pending')]));
    }

    // Site photos
    if (d.photos.length) {
      sec('Site Photographs');
      let px = ml, pyTop = y + 2, rowH = 0; const tw = 42, th = 32, gap = 4;
      d.photos.slice(0, 12).forEach((img, i) => {
        if (px + tw > pw - mr) { px = ml; pyTop += th + gap; }
        if (pyTop + th > ph - 14) { doc.addPage(); pyTop = 16; px = ml; }
        try { doc.addImage(img, 'JPEG', px, pyTop, tw, th); } catch {}
        px += tw + gap; rowH = pyTop + th;
      });
      y = rowH + 6;
    }

    doc.setFontSize(7); doc.setTextColor(150);
    doc.text('Generated by True Site Sync · ' + new Date().toLocaleString('en-IN'), ml, ph - 6);

    mobileSavePDF(doc, `ProjectReport_${(p.name || 'Project').replace(/[\\/]/g, '-')}.pdf`);
    showToast('Project report PDF downloaded');
  } catch (err) {
    console.error('Project report PDF failed:', err);
    showToast('PDF error: ' + (err && err.message ? err.message : err), 'error');
  }
}

// ══════════════════════════════════════════════════════════
//  EXCEL (multi-sheet)
// ══════════════════════════════════════════════════════════
export function exportProjectReportExcel(pid) {
  try {
    pid = pid || state.currentProjectId;
    if (!pid) return showToast('Select a project first', 'error');
    if (!window.XLSX) return showToast('Excel library not loaded — refresh the page', 'error');
    const d = _gather(pid); const f = d.fin; const p = d.proj;
    const wb = window.XLSX.utils.book_new();
    const add = (name, aoa) => window.XLSX.utils.book_append_sheet(wb, window.XLSX.utils.aoa_to_sheet(aoa), name.slice(0, 31));

    add('Summary', [
      ['PROJECT REPORT'],
      ['Project', p.name || ''], ['Code', p.code || ''], ['Client', d.client.name || p.clientName || ''],
      ['WO No.', d.woNo || ''], ['WO Value', d.boqValue], ['Status', p.status || ''], ['Location', p.location || ''],
      [], ['FINANCIAL SUMMARY'],
      ['Work Billed (Abstracts)', f.workBilled], ['Tax Invoices', f.invoiced], ['Received', f.received], ['Outstanding', f.outstanding],
      ['Material Purchases', f.purchases], ['Site Expenses', f.expenses], ['Labour Cost', f.labourCost], ['Equipment Cost', f.equipmentCost],
      ['Total Cost', f.totalCost], ['Revenue', f.revenue], ['Gross Margin', f.margin],
    ]);
    add('Schedule', [['Task', 'Status', 'Progress%', 'Start', 'End'], ...d.tasks.map(t => [t.name, t.status, t.progress || 0, t.startDate, t.endDate])]);
    add('Sales', [['Invoice', 'Date', 'Taxable', 'Tax', 'Total'], ...d.invoices.map(i => [i.invoiceNo, i.date, _num(i.subtotal), _num(i.gstAmount), _num(i.total)])]);
    add('Purchases', [['Bill', 'Date', 'Vendor', 'Amount'], ...d.purchases.map(b => [b.billNo, b.date, (state.vendors || []).find(v => v.id === b.vendorId)?.name || '', _num(b.totalAmount ?? b.amount)])]);
    add('DPR', [['Date', 'Area', 'Work Done', 'Skilled', 'Unskilled', 'Weather', 'Hindrance'], ...d.dpr.map(x => [x.date, x.area, x.workDone, x.manpowerSkilled, x.manpowerUnskilled, x.weather, x.hindrance])]);
    add('Pours', [['Pour', 'Date', 'Element', 'Grade', 'Vol m3', 'Slump', 'Cubes', 'Vendor'], ...d.pours.map(x => [x.pourNo, x.date, x.element, x.grade, _num(x.volume), x.slump, x.cubes, x.supplier])]);
    add('Milestones', [['Milestone', 'Planned', 'Actual', 'Progress%', 'Status'], ...d.milestones.map(m => [m.name, m.plannedDate, m.actualDate, m.progress || 0, m.status])]);
    add('Quality', [['Type', 'Date', 'Element', 'Grade', 'Result', 'Status'], ...d.quality.map(q => [q.type, q.date, q.element, q.grade, q.result, q.status])]);
    add('Safety', [['Type', 'Severity', 'Date', 'Location', 'Description'], ...d.safety.map(s => [s.type, s.severity, s.date, s.location, s.description])]);
    add('Issues', [['Title', 'Category', 'Priority', 'Status', 'Assigned'], ...d.issues.map(i => [i.title, i.category, i.priority, i.status, i.assignedTo])]);

    mobileSaveXLSX(wb, `ProjectReport_${(p.name || 'Project').replace(/[\\/]/g, '-')}.xlsx`);
    showToast('Project report Excel downloaded');
  } catch (err) {
    console.error('Project report Excel failed:', err);
    showToast('Excel error: ' + (err && err.message ? err.message : err), 'error');
  }
}

if (typeof window !== 'undefined') {
  window.exportProjectReportPDF = exportProjectReportPDF;
  window.exportProjectReportExcel = exportProjectReportExcel;
}
