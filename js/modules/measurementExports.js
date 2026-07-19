/**
 * ═══════════════════════════════════════════════════════════
 * True Site Sync — Measurement-sheet exporters
 * ═══════════════════════════════════════════════════════════
 * PDF + Excel generators for measurement sheets (simple & detailed
 * Measurement Book). Extracted from ui.js. Aggregation math lives in
 * sheetCalc.js; this module only handles document layout/rendering.
 * ═══════════════════════════════════════════════════════════
 */

import { state } from './state.js';
import { showToast, getCompanyHeaderForPDF, getCurrencySymbol, mobileSavePDF, mobileSaveXLSX } from './utils.js';
const _simpleHeader = (doc, o) => (typeof window !== 'undefined' && window.getSimpleHeaderForPDF) ? window.getSimpleHeaderForPDF(doc, o) : getCompanyHeaderForPDF(doc);
import { lookupBoqItem } from './abstractCalc.js';
import { computeSheetPrevQtyMap, groupSheetEntries, sheetPrevQtyFor } from './sheetCalc.js';
import { BBS_UNIT_WEIGHTS } from './constants.js';

const _lookupBoqItem = lookupBoqItem;

function _measOrientation() {
  return (state.printSettings?.measurementOrientation) || 'portrait';
}
/** Page center X for the chosen orientation (A4) */
function _pageCenterX(orient) { return orient === 'landscape' ? 148 : 105; }

/** Simple Measurement Sheet PDF */
/** Parse a #rrggbb hex into [r,g,b]; falls back when invalid. */
function _rgb(hex, fallback) {
  const m = /^#?([0-9a-fA-F]{6})$/.exec(hex || '');
  if (!m) return fallback;
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function exportSimpleMeasurementPdf(id) {
  try {
  const sheetId = id || state.currentSheetId;
  if (!sheetId) return showToast('Save sheet before exporting', 'error');
  const s = state.sheets.find(x => x.id === sheetId);
  if (!s) return showToast('Sheet not found', 'error');
  if (!window.jspdf || !window.jspdf.jsPDF) return showToast('PDF library not loaded — refresh the page', 'error');
  const c = state.clients.find(x => x.id === s.clientId);
  const proj = state.projects.find(p => p.id === s.projectId);

  const orient = _measOrientation();
  const isP = orient === 'portrait';
  const cx = _pageCenterX(orient);

  // Direct inline rendering (theme engine removed — respects orientation setting)
  const doc = new window.jspdf.jsPDF(orient);
  let y = _simpleHeader(doc);
  const sym = getCurrencySymbol();
  // User-selectable measurement PDF colours (Settings → Print)
  const accent = _rgb(state.printSettings?.measurementColor, [249, 115, 22]);
  const tint = accent.map(ch => Math.round(ch + (255 - ch) * 0.88));
  // Item-name / section heading row — its OWN colour (was derived from `tint`).
  const itemLineFill = _rgb(state.printSettings?.measurementItemLineColor, tint);
  const totalFill = _rgb(state.printSettings?.measurementTotalColor, [254, 243, 199]);
  const border = _rgb(state.printSettings?.measurementBorderColor, [226, 232, 240]);
  const fontCol = _rgb(state.printSettings?.measurementFontColor, [15, 23, 42]);
  const titleCol = _rgb(state.printSettings?.measurementTitleColor, [15, 23, 42]);
  const headTextCol = _rgb(state.printSettings?.measurementHeaderTextColor, [255, 255, 255]);

  doc.setFontSize(14); doc.setTextColor(titleCol[0], titleCol[1], titleCol[2]); doc.setFont('helvetica', 'bold');
  doc.text('MEASUREMENT SHEET', cx, y + 5, null, null, 'center');
  doc.setFontSize(9); doc.setFont('helvetica', 'normal'); doc.setTextColor(80);

  const info = [
    [`Project: ${proj?.name || '—'}`, `Client: ${c?.name || proj?.clientName || '—'}`],
    [`Sheet No: ${s.sheetNum}`, `Date: ${s.date}`, `Area: ${s.area || 'N/A'}`]
  ];
  const pdfWO = (proj?.boqs || []).map(g => g.woNumber).filter(Boolean).join(', ') || proj?.woNumber || '';
  if (pdfWO) info[0].push(`WO: ${pdfWO}`);
  info.forEach((line, i) => doc.text(line.join('  |  '), 14, y + 13 + i * 6));

  // Grouped (Measurement-Book) body: item entered once -> measurement lines -> Total Quantity
  const groups = groupSheetEntries(s.entries || []);
  const head = [['Sr', 'Particulars of work', 'Nos', 'L', 'B', 'H', 'Qty', 'Unit']];
  const rows = [];
  let itemNum = 0;
  Object.keys(groups).forEach(key => {
    const lines = groups[key];
    const first = lines[0] || {};
    itemNum++;
    const title = (first.code ? first.code + ' — ' : '') + (first.description || first.code || '');
    rows.push([
      { content: itemNum, styles: { fontStyle: 'bold' } },
      { content: title, colSpan: 7, styles: { fontStyle: 'bold', fillColor: itemLineFill, textColor: accent } }
    ]);
    let total = 0;
    lines.forEach(e => {
      total += (e.qty || 0);
      rows.push(['', e.remarks || '', e.nos || '', e.l || '', e.b || '', e.h || '', (e.qty || 0).toFixed(3), e.uom || first.uom || '']);
    });
    rows.push([
      '', { content: 'Total Quantity', colSpan: 5, styles: { halign: 'right', fontStyle: 'bold' } },
      { content: total.toFixed(3), styles: { fontStyle: 'bold', halign: 'center', fillColor: totalFill } },
      { content: first.uom || '', styles: { fontStyle: 'bold', halign: 'center' } }
    ]);
  });
  doc.autoTable({
    startY: y + 28, head, body: rows, theme: 'grid', tableWidth: 'auto',
    headStyles: { fillColor: accent, textColor: headTextCol, fontSize: isP ? 7 : 7.5, fontStyle: 'bold', halign: 'center', lineColor: border, lineWidth: 0.15 },
    styles: { fontSize: isP ? 7 : 7.5, cellPadding: 1.6, overflow: 'linebreak', textColor: fontCol, lineColor: border, lineWidth: 0.15 },
    columnStyles: {
      0: { cellWidth: 9, halign: 'center' }, 1: { cellWidth: 'auto', overflow: 'linebreak' },
      2: { cellWidth: 15, halign: 'center' }, 3: { cellWidth: 18, halign: 'center' }, 4: { cellWidth: 18, halign: 'center' },
      5: { cellWidth: 18, halign: 'center' },
      6: { cellWidth: 22, halign: 'center', fontStyle: 'bold', textColor: accent }, 7: { cellWidth: 16, halign: 'center' }
    }
  });

  // BBS summary if exists
  const bbs = (state.bbsData || {})[s.id];
  if (bbs && bbs.length) {
    const bbsY = doc.lastAutoTable.finalY + 10;
    doc.setFontSize(11); doc.setFont('helvetica', 'bold'); doc.setTextColor(0);
    doc.text('DETAIL OF STEEL (BBS)', 14, bbsY);
    const diaCols = [8, 10, 12, 16, 20];
    const diaTotals = {}; diaCols.forEach(d => diaTotals[d] = 0);
    const bbsRows = bbs.map((b, i) => {
      const dia = parseInt(b.dia) || 0;
      const row = [i + 1, b.mark || '', dia ? dia + 'mm' : '', b.noBar || '', b.no || '', b.totalBars || '',
        b.a || '', b.b || '', b.c || '', b.d || '', b.hook || '',
        b.cutLen ? b.cutLen.toFixed(2) : '', b.totalLen ? b.totalLen.toFixed(2) : '',
        '', '', '', '', ''];
      const ci = diaCols.indexOf(dia);
      if (ci !== -1) { row[13 + ci] = b.totalLen ? b.totalLen.toFixed(2) : ''; diaTotals[dia] += (b.totalLen || 0); }
      return row;
    });
    // Total RM
    bbsRows.push(['', 'Total RM', '', '', '', '', '', '', '', '', '', '', '', ...diaCols.map(d => diaTotals[d] ? diaTotals[d].toFixed(2) : '-')]);
    // KG/RM
    bbsRows.push(['', 'KG/RM', '', '', '', '', '', '', '', '', '', '', '', ...diaCols.map(d => BBS_UNIT_WEIGHTS[d] ? BBS_UNIT_WEIGHTS[d].toFixed(3) : '-')]);
    // Total KG per Dia
    const wtPerDia = diaCols.map(d => diaTotals[d] * (BBS_UNIT_WEIGHTS[d] || 0));
    bbsRows.push(['', 'Total KG per Dia', '', '', '', '', '', '', '', '', '', '', '', ...wtPerDia.map(w => w ? w.toFixed(2) : '-')]);
    const grandKG = wtPerDia.reduce((a, b) => a + b, 0);
    bbsRows.push([{ content: 'Total Weight: ' + grandKG.toFixed(2) + ' KG  |  ' + (grandKG / 1000).toFixed(3) + ' MT', colSpan: 18, styles: { fontStyle: 'bold', halign: 'center', fillColor: [245, 245, 245] } }]);
    doc.autoTable({
      startY: bbsY + 4,
      head: [['SN', 'Description', 'DIA', 'No of Bar', 'No.', 'Total Bars', 'A', 'B', 'C', 'D', 'Hook', 'Cut Len', 'Total Len', '8mm', '10mm', '12mm', '16mm', '20mm']],
      body: bbsRows, theme: 'grid',
      headStyles: { fillColor: [124, 58, 237], fontSize: 6, fontStyle: 'bold' },
      styles: { fontSize: 6, cellPadding: 1.5 },
      columnStyles: { 0: { cellWidth: 8 }, 1: { cellWidth: 22 } }
    });
  }

  mobileSavePDF(doc,`Measurement_${s.sheetNum}.pdf`);
  } catch (err) {
    console.error('Simple measurement PDF failed:', err);
    showToast('PDF error: ' + (err && err.message ? err.message : err), 'error');
  }
}

/** Detailed RA Bill / Measurement Sheet PDF (VMC format) */
export function exportDetailedMeasurementPdf(id) {
  const sheetId = id || state.currentSheetId;
  if (!sheetId) return showToast('Save sheet before exporting', 'error');
  const s = state.sheets.find(x => x.id === sheetId);
  if (!s) return showToast('Sheet not found', 'error');
  const c = state.clients.find(x => x.id === s.clientId);
  const proj = state.projects.find(p => p.id === s.projectId);
  const boqItems = proj?.boqItems || [];
  const doc = new window.jspdf.jsPDF('portrait');
  const pw = 210, ph = 297, ml = 10, mr = 10, mt = 10, mb = 20;
  const cw = pw - ml - mr;

  // Previous-bill quantities + entry grouping — shared, tested (sheetCalc.js)
  const prevQtyMap = computeSheetPrevQtyMap(s, state.sheets);
  const groupedEntries = groupSheetEntries(s.entries);

  let y = _simpleHeader(doc);

  doc.setFontSize(11); doc.setFont('helvetica', 'bold'); doc.setTextColor(0);
  doc.text('MEASUREMENT BOOK', pw / 2, y, { align: 'center' });
  y += 6;

  const raBillNum = s.raBillNum || '';
  if (raBillNum) {
    doc.setFontSize(10); doc.setFont('helvetica', 'bold');
    doc.text(raBillNum + ' RA BILL', pw / 2, y, { align: 'center' });
    y += 6;
  }

  const cp = state.companyProfile || {};
  doc.setFontSize(8); doc.setFont('helvetica', 'normal'); doc.setTextColor(0);
  const details = [
    `Name of Work: ${proj?.description || proj?.name || '—'}`,
    `Name of Contractor: ${c?.name || proj?.clientName || '—'}`,
    `Name of Authority: ${state.printSettings?.authorityName || cp.CompanyName || '—'}`
  ];
  details.forEach(line => { doc.text(line, ml, y + 4); y += 5; });
  y += 3;

  doc.setDrawColor(0); doc.setLineWidth(0.3);
  doc.line(ml, y, pw - mr, y);
  y += 2;

  // Build column positions dynamically based on custom columns
  const cc = s.customColumns || [];
  const baseColX = [ml, ml + 14, ml + 70, ml + 95, ml + 120, ml + 145, ml + 168];
  const baseHeaders = ['Sr. No.', 'Description', 'Nos.', 'Length', 'Breadth', 'Height', 'Total'];
  const colX = [...baseColX];
  const colHeaders = [...baseHeaders];
  const ccStartX = baseColX[6] + 22;
  const ccSpacing = 20;
  cc.forEach((col, i) => {
    colX.push(ccStartX + i * ccSpacing);
    colHeaders.push(col.name);
  });

  doc.setFontSize(7); doc.setFont('helvetica', 'bold'); doc.setTextColor(0);
  colHeaders.forEach((h, i) => {
    if (i >= 7) doc.setTextColor(180, 100, 0);
    doc.text(h, colX[i], y + 4);
  });
  doc.setTextColor(0);
  y += 6;
  doc.line(ml, y, pw - mr, y);
  y += 3;

  let itemNum = 0;
  const summaryLabelCol = cc.length ? colX[colX.length - 2] : colX[4];
  const summaryValCol = cc.length ? colX[colX.length - 1] : colX[6];

  Object.keys(groupedEntries).forEach(key => {
    const entries = groupedEntries[key];
    const firstEntry = entries[0];
    const boqItem = _lookupBoqItem(proj, firstEntry.boqIndex);
    itemNum++;

    const neededHeight = (entries.length + 8) * 4.5;
    if (y + neededHeight > ph - mb) {
      doc.addPage(); y = mt + 5;
    }

    // Item number and description
    doc.setFontSize(8); doc.setFont('helvetica', 'bold'); doc.setTextColor(0);
    doc.text(String(itemNum), colX[0], y + 3);
    const descText = firstEntry.description || firstEntry.code || '—';
    const descLines = doc.splitTextToSize(descText, 52);
    doc.setFont('helvetica', 'normal');
    descLines.forEach((line, li) => { doc.text(line, colX[1], y + 3 + li * 3.5); });

    // Tender Qty and Rate (from BOQ)
    const tenderQty = boqItem?.qty || 0;
    const tenderRate = boqItem?.rate || 0;
    const unit = firstEntry.uom || boqItem?.uom || '';
    doc.setFontSize(7); doc.setFont('helvetica', 'normal'); doc.setTextColor(80);
    doc.text(`Tender Qty in ${unit}`, summaryLabelCol, y + 3);
    doc.setFont('helvetica', 'bold'); doc.setTextColor(0);
    doc.text(String(tenderQty), summaryValCol, y + 3);
    doc.setFont('helvetica', 'normal'); doc.setTextColor(80);
    doc.text('Tender Rate', summaryLabelCol, y + 7);
    doc.setTextColor(0);
    doc.text(String(tenderRate), summaryValCol, y + 7);
    y += Math.max(descLines.length * 3.5, 4) + 7;

    // Individual measurement rows
    doc.setFontSize(7); doc.setTextColor(0); doc.setFont('helvetica', 'normal');
    let thisBillQty = 0;
    entries.forEach(e => {
      if (y > ph - mb - 15) { doc.addPage(); y = mt + 5; }
      const remark = e.remarks || '';
      if (remark) { doc.setFont('helvetica', 'bold'); doc.text(remark, colX[1], y + 3); doc.setFont('helvetica', 'normal'); }
      const vals = [e.nos || '', e.l || '', e.b || '', e.h || '', (e.qty || 0).toFixed(3)];
      const positions = [colX[2], colX[3], colX[4], colX[5], colX[6]];
      vals.forEach((v, vi) => { if (v !== '') doc.text(String(v), positions[vi], y + 3); });
      // Custom column values
      cc.forEach((col, ci) => {
        const val = e.customData?.[col.id] || '';
        if (val) doc.text(String(val), colX[7 + ci], y + 3);
      });
      thisBillQty += (e.qty || 0);
      y += 4;
    });

    // Summary lines
    if (y > ph - mb - 20) { doc.addPage(); y = mt + 5; }
    const prevQty = sheetPrevQtyFor(prevQtyMap, key, firstEntry);
    const totalDoneQty = prevQty + thisBillQty;

    y += 2;
    doc.setFont('helvetica', 'bold'); doc.setFontSize(7);
    doc.text(`This Bill Qty in ${unit}`, summaryLabelCol, y + 3);
    doc.text(thisBillQty.toFixed(3), summaryValCol, y + 3);
    y += 4;
    doc.setFont('helvetica', 'normal');
    doc.text('Previous Bill Qty', summaryLabelCol, y + 3);
    doc.text(prevQty.toFixed(3), summaryValCol, y + 3);
    y += 4;
    doc.setFont('helvetica', 'bold');
    doc.text(`Total Done Qty in ${unit}`, summaryLabelCol, y + 3);
    doc.text(totalDoneQty.toFixed(3), summaryValCol, y + 3);
    y += 5;

    // Separator
    doc.setDrawColor(200); doc.setLineWidth(0.1);
    doc.line(ml, y, pw - mr, y);
    y += 4;
  });

  // BBS page if data exists
  const bbs = (state.bbsData || {})[s.id];
  if (bbs && bbs.length) {
    doc.addPage('landscape');
    y = _simpleHeader(doc);
    doc.setFontSize(11); doc.setFont('helvetica', 'bold'); doc.setTextColor(0);
    doc.text('Detail of Steel (BBS)', doc.internal.pageSize.getWidth() / 2, y, { align: 'center' });
    y += 6;
    doc.setFontSize(8); doc.setFont('helvetica', 'normal');
    details.forEach(line => { doc.text(line, ml, y + 3); y += 5; });
    y += 5;

    const diaCols = [8, 10, 12, 16, 20];
    const diaTotals = {}; diaCols.forEach(d => diaTotals[d] = 0);
    const bbsHead = [['SN', 'Description', 'DIA', 'No of Bar', 'No.', 'Total Bars', 'A', 'B', 'C', 'D', 'Hook', 'Cut Len', 'Total Len', '8mm', '10mm', '12mm', '16mm', '20mm']];
    const bbsRows = bbs.map((b, i) => {
      const dia = parseInt(b.dia) || 0;
      const row = [i + 1, b.mark || '', dia ? dia + 'mm' : '', b.noBar || '', b.no || '', b.totalBars || '',
        b.a || '', b.b || '', b.c || '', b.d || '', b.hook || '',
        b.cutLen ? b.cutLen.toFixed(2) : '', b.totalLen ? b.totalLen.toFixed(2) : '',
        '', '', '', '', ''];
      const ci = diaCols.indexOf(dia);
      if (ci !== -1) { row[13 + ci] = b.totalLen ? b.totalLen.toFixed(2) : ''; diaTotals[dia] += (b.totalLen || 0); }
      return row;
    });

    bbsRows.push(['', 'Total RM', '', '', '', '', '', '', '', '', '', '', '', ...diaCols.map(d => diaTotals[d] ? diaTotals[d].toFixed(2) : '-')]);
    bbsRows.push(['', 'KG/RM', '', '', '', '', '', '', '', '', '', '', '', ...diaCols.map(d => BBS_UNIT_WEIGHTS[d] ? BBS_UNIT_WEIGHTS[d].toFixed(3) : '-')]);
    const wtPerDia = diaCols.map(d => diaTotals[d] * (BBS_UNIT_WEIGHTS[d] || 0));
    bbsRows.push(['', 'Total KG per Dia', '', '', '', '', '', '', '', '', '', '', '', ...wtPerDia.map(w => w ? w.toFixed(2) : '-')]);
    const grandKG = wtPerDia.reduce((a, b) => a + b, 0);
    bbsRows.push([{ content: 'Total Weight: ' + grandKG.toFixed(2) + ' KG  |  ' + (grandKG / 1000).toFixed(3) + ' MT', colSpan: 18, styles: { fontStyle: 'bold', halign: 'center', fillColor: [245, 245, 245] } }]);

    doc.autoTable({
      startY: y, head: bbsHead, body: bbsRows, theme: 'grid',
      headStyles: { fillColor: [124, 58, 237], fontSize: 6, fontStyle: 'bold' },
      styles: { fontSize: 6, cellPadding: 1.5 },
      columnStyles: { 0: { cellWidth: 8 }, 1: { cellWidth: 28 } }
    });
  }

  mobileSavePDF(doc,`Detailed_Measurement_${s.sheetNum}.pdf`);
}

export function exportToExcel() {
  if (!state.currentSheetId) return showToast('Save sheet before exporting', 'error');
  const s = state.sheets.find(x => x.id === state.currentSheetId);
  let csvContent = "data:text/csv;charset=utf-8,Code,Description,Unit,Nos,L,B,H,Qty,Remarks\n";
  s.entries.forEach(e => {
    let row = [e.code, `"${(e.description || '').replace(/"/g, '""')}"`, e.uom, e.nos, e.l, e.b, e.h, e.qty, `"${(e.remarks || '').replace(/"/g, '""')}"`];
    csvContent += row.join(",") + "\n";
  });
  const encodedUri = encodeURI(csvContent);
  const link = document.createElement("a");
  link.setAttribute("href", encodedUri);
  link.setAttribute("download", `Measurement_${s.sheetNum}.csv`);
  document.body.appendChild(link); link.click(); document.body.removeChild(link);
}

/** Detailed RA Measurement Excel Export (VMC format) */
export function exportDetailedMeasurementExcel() {
  if (!state.currentSheetId) return showToast('Save sheet before exporting', 'error');
  const XLSX = window.XLSX;
  if (!XLSX) return showToast('SheetJS library not loaded', 'error');

  const s = state.sheets.find(x => x.id === state.currentSheetId);
  const c = state.clients.find(x => x.id === s.clientId);
  const proj = state.projects.find(p => p.id === s.projectId);
  const boqItems = proj?.boqItems || [];
  const cp = state.companyProfile || {};

  // Previous-bill quantities + entry grouping — shared, tested (sheetCalc.js)
  const prevQtyMap = computeSheetPrevQtyMap(s, state.sheets);
  const groupedEntries = groupSheetEntries(s.entries);

  // --- Build Measurement Sheet ---
  const cc = s.customColumns || [];
  const totalCols = 7 + cc.length;
  const lastCol = totalCols - 1;
  const mesRows = [];
  const merges = [];
  let r = 0;

  // Header rows
  mesRows.push([cp.CompanyName || proj?.clientName || 'MEASUREMENT BOOK']);
  merges.push({ s: { r, c: 0 }, e: { r, c: lastCol } }); r++;
  mesRows.push(['MEASUREMENT BOOK']);
  merges.push({ s: { r, c: 0 }, e: { r, c: lastCol } }); r++;
  const raBillLabel = s.raBillNum ? s.raBillNum + ' RA BILL' : 'RA BILL';
  mesRows.push([raBillLabel]);
  merges.push({ s: { r, c: 0 }, e: { r, c: lastCol } }); r++;
  mesRows.push(['Name of Work :- ' + (proj?.description || proj?.name || '—')]);
  merges.push({ s: { r, c: 0 }, e: { r, c: lastCol } }); r++;
  mesRows.push(['Name of Contractor :- ' + (c?.name || proj?.clientName || '—')]);
  merges.push({ s: { r, c: 0 }, e: { r, c: lastCol } }); r++;
  mesRows.push(['Name of Authority :- ' + (state.printSettings?.authorityName || cp.CompanyName || '—')]);
  merges.push({ s: { r, c: 0 }, e: { r, c: lastCol } }); r++;

  // Column headers
  const baseHeaders = ['Sr. No.', 'Description', 'Nos.', 'Length', 'Breadth', 'Height', 'Total'];
  mesRows.push([...baseHeaders, ...cc.map(c => c.name)]);
  r++;

  let itemNum = 0;
  Object.keys(groupedEntries).forEach(key => {
    const entries = groupedEntries[key];
    const firstEntry = entries[0];
    const boqItem = _lookupBoqItem(proj, firstEntry.boqIndex);
    itemNum++;

    const tenderQty = boqItem?.qty || 0;
    const tenderRate = boqItem?.rate || 0;
    const unit = firstEntry.uom || boqItem?.uom || '';
    const descText = firstEntry.description || firstEntry.code || '—';

    // Item header row — label and value in last two base columns
    const tenderRow = new Array(totalCols).fill('');
    tenderRow[0] = itemNum; tenderRow[1] = descText;
    tenderRow[4] = 'Tender Qty in ' + unit; tenderRow[6] = tenderQty;
    mesRows.push(tenderRow); r++;
    const rateRow = new Array(totalCols).fill('');
    rateRow[4] = 'Tender Rate'; rateRow[6] = tenderRate;
    mesRows.push(rateRow); r++;

    // Measurement rows
    let thisBillQty = 0;
    entries.forEach(e => {
      const remark = e.remarks || '';
      const row = ['', remark, e.nos || '', e.l || '', e.b || '', e.h || '', e.qty || 0];
      cc.forEach(col => row.push(e.customData?.[col.id] || ''));
      mesRows.push(row);
      thisBillQty += (e.qty || 0);
      r++;
    });

    const prevQty = sheetPrevQtyFor(prevQtyMap, key, firstEntry);
    const totalDoneQty = prevQty + thisBillQty;

    // Summary rows
    const sumRow1 = new Array(totalCols).fill(''); sumRow1[4] = 'This Bill Qty in ' + unit; sumRow1[6] = thisBillQty;
    mesRows.push(sumRow1); r++;
    const sumRow2 = new Array(totalCols).fill(''); sumRow2[4] = 'Previous Bill Qty'; sumRow2[6] = prevQty;
    mesRows.push(sumRow2); r++;
    const sumRow3 = new Array(totalCols).fill(''); sumRow3[4] = 'Total Done Qty in ' + unit; sumRow3[6] = totalDoneQty;
    mesRows.push(sumRow3); r++;
    mesRows.push([]); r++;
  });

  const mesWs = XLSX.utils.aoa_to_sheet(mesRows);
  mesWs['!merges'] = merges;
  const colWidths = [
    { wch: 8 },   // A - Sr. No.
    { wch: 35 },  // B - Description
    { wch: 8 },   // C - Nos.
    { wch: 10 },  // D - Length
    { wch: 18 },  // E - Breadth / labels
    { wch: 10 },  // F - Height
    { wch: 14 },  // G - Total
  ];
  cc.forEach(col => colWidths.push({ wch: 14 }));
  mesWs['!cols'] = colWidths;

  // --- Build BBS Sheet (if data exists) ---
  const bbs = state.bbsData[s.id];
  let bbsWs = null;
  if (bbs && bbs.length) {
    const bbsRows = [];
    const bbsMerges = [];
    let br = 0;
    const diaCols = [8, 10, 12, 16, 20];
    const totalCols = 18; // SN + Description + DIA + NoBar + No + TotalBars + A + B + C + D + Hook + CutLen + TotalLen + 5 dia cols

    bbsRows.push([cp.CompanyName || 'DETAIL OF STEEL (BBS)']);
    bbsMerges.push({ s: { r: br, c: 0 }, e: { r: br, c: totalCols - 1 } }); br++;
    bbsRows.push(['Detail of Steel (BBS)']);
    bbsMerges.push({ s: { r: br, c: 0 }, e: { r: br, c: totalCols - 1 } }); br++;
    bbsRows.push([raBillLabel]);
    bbsMerges.push({ s: { r: br, c: 0 }, e: { r: br, c: totalCols - 1 } }); br++;
    bbsRows.push(['Name of Work :- ' + (proj?.description || proj?.name || '—')]);
    bbsMerges.push({ s: { r: br, c: 0 }, e: { r: br, c: totalCols - 1 } }); br++;
    bbsRows.push(['Name of Contractor :- ' + (c?.name || proj?.clientName || '—')]);
    bbsMerges.push({ s: { r: br, c: 0 }, e: { r: br, c: totalCols - 1 } }); br++;
    bbsRows.push(['Name of Authority :- ' + (state.printSettings?.authorityName || cp.CompanyName || '—')]);
    bbsMerges.push({ s: { r: br, c: 0 }, e: { r: br, c: totalCols - 1 } }); br++;

    bbsRows.push(['SN', 'Description', 'DIA', 'No of Bar', 'No.', 'Total Bars', 'A', 'B', 'C', 'D', 'Hook', 'Cut Len', 'Total Len', '8mm', '10mm', '12mm', '16mm', '20mm']);
    br++;

    const diaTotals = {}; diaCols.forEach(d => diaTotals[d] = 0);
    bbs.forEach((b, i) => {
      const dia = parseInt(b.dia) || 0;
      const row = [i + 1, b.mark || '', dia ? dia + 'mm' : '', b.noBar || 0, b.no || 0, b.totalBars || 0,
        b.a || 0, b.b || 0, b.c || 0, b.d || 0, b.hook || 0,
        b.cutLen || 0, b.totalLen || 0, '', '', '', '', ''];
      const ci = diaCols.indexOf(dia);
      if (ci !== -1) { row[13 + ci] = b.totalLen || 0; diaTotals[dia] += (b.totalLen || 0); }
      bbsRows.push(row); br++;
    });

    // Total RM
    bbsRows.push(['', 'Total RM', '', '', '', '', '', '', '', '', '', '', '', ...diaCols.map(d => diaTotals[d] || 0)]); br++;
    // KG/RM
    bbsRows.push(['', 'KG/RM', '', '', '', '', '', '', '', '', '', '', '', ...diaCols.map(d => BBS_UNIT_WEIGHTS[d] || 0)]); br++;
    // Total KG per Dia
    const wtPerDia = diaCols.map(d => diaTotals[d] * (BBS_UNIT_WEIGHTS[d] || 0));
    bbsRows.push(['', 'Total KG per Dia', '', '', '', '', '', '', '', '', '', '', '', ...wtPerDia]); br++;
    const grandKG = wtPerDia.reduce((a, b) => a + b, 0);
    // Total Weight KG
    bbsRows.push(['', 'Total Weight (KG)', '', '', '', '', '', '', '', '', '', '', '', grandKG]);
    bbsMerges.push({ s: { r: br, c: 13 }, e: { r: br, c: totalCols - 1 } }); br++;
    // Total Weight MT
    bbsRows.push(['', 'Total Weight (MT)', '', '', '', '', '', '', '', '', '', '', '', grandKG / 1000]);
    bbsMerges.push({ s: { r: br, c: 13 }, e: { r: br, c: totalCols - 1 } }); br++;

    bbsWs = XLSX.utils.aoa_to_sheet(bbsRows);
    bbsWs['!merges'] = bbsMerges;
    bbsWs['!cols'] = [
      { wch: 5 }, { wch: 24 }, { wch: 6 }, { wch: 9 }, { wch: 5 }, { wch: 10 },
      { wch: 7 }, { wch: 7 }, { wch: 7 }, { wch: 7 }, { wch: 7 },
      { wch: 9 }, { wch: 10 }, { wch: 9 }, { wch: 9 }, { wch: 9 }, { wch: 9 }, { wch: 9 }
    ];
  }

  // --- Build Abstract Sheet ---
  const absRows = [];
  const absMerges = [];
  let ar = 0;

  absRows.push([cp.CompanyName || 'ABSTRACT SHEET']);
  absMerges.push({ s: { r: ar, c: 0 }, e: { r: ar, c: 6 } }); ar++;
  absRows.push(['', 'Abstract Sheet']);
  absMerges.push({ s: { r: ar, c: 1 }, e: { r: ar, c: 6 } }); ar++;
  absRows.push([raBillLabel]);
  absMerges.push({ s: { r: ar, c: 0 }, e: { r: ar, c: 6 } }); ar++;
  absRows.push(['Name of Work :- ' + (proj?.description || proj?.name || '—')]);
  absMerges.push({ s: { r: ar, c: 0 }, e: { r: ar, c: 6 } }); ar++;
  absRows.push(['Name of Contractor :- ' + (c?.name || proj?.clientName || '—')]);
  absMerges.push({ s: { r: ar, c: 0 }, e: { r: ar, c: 6 } }); ar++;
  absRows.push(['Name of Authority :- ' + (state.printSettings?.authorityName || cp.CompanyName || '—')]);
  absMerges.push({ s: { r: ar, c: 0 }, e: { r: ar, c: 6 } }); ar++;

  absRows.push(['Item No.', 'Item Description', 'Unit', 'Tender Qty', 'Done Qty', 'Rate', 'Total Allow Amount']);
  ar++;

  let grandTotalAmount = 0;
  let absItemNum = 0;
  Object.keys(groupedEntries).forEach(key => {
    const entries = groupedEntries[key];
    const firstEntry = entries[0];
    const boqItem = _lookupBoqItem(proj, firstEntry.boqIndex);
    absItemNum++;

    const tenderQty = boqItem?.qty || 0;
    const tenderRate = boqItem?.rate || 0;
    const unit = firstEntry.uom || boqItem?.uom || '';
    const descText = firstEntry.description || firstEntry.code || '—';

    const thisBillQty = entries.reduce((sum, e) => sum + (e.qty || 0), 0);
    const prevQty = sheetPrevQtyFor(prevQtyMap, key, firstEntry);
    const totalDoneQty = prevQty + thisBillQty;
    const totalAmount = totalDoneQty * tenderRate;
    grandTotalAmount += totalAmount;

    absRows.push([absItemNum, descText, unit, tenderQty, totalDoneQty, tenderRate, totalAmount]);
    ar++;
  });

  // Grand total row
  absRows.push(['', '', '', '', '', 'GRAND TOTAL', grandTotalAmount]);
  ar++;

  const absWs = XLSX.utils.aoa_to_sheet(absRows);
  absWs['!merges'] = absMerges;
  absWs['!cols'] = [
    { wch: 8 }, { wch: 45 }, { wch: 6 }, { wch: 12 }, { wch: 12 }, { wch: 10 }, { wch: 18 }
  ];

  // --- Create workbook with all sheets ---
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, mesWs, 'RA Measurement');
  if (bbsWs) XLSX.utils.book_append_sheet(wb, bbsWs, 'BBS');
  XLSX.utils.book_append_sheet(wb, absWs, 'Abstract');

  mobileSaveXLSX(wb, `RA_Bill_${s.sheetNum}_${s.date}.xlsx`);
  showToast('Detailed RA Excel exported', 'success');
}

