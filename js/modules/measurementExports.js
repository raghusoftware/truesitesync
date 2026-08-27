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

// Measured-quantity decimal places, per Settings (2 or 3). Used everywhere a
// quantity is printed so the whole document is consistent.
const _qtyDp = v => (Number(v) || 0).toFixed(state.printSettings?.measurementDecimals ?? 2);

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

/** Display a stored ISO date (yyyy-mm-dd) as dd-mm-yyyy. */
function _fmtDMY(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || ''));
  return m ? `${m[3]}-${m[2]}-${m[1]}` : (iso || '');
}

/**
 * Measurement Sheet — "Plant / Tabular" template (ruled grid, grouped items
 * with F-lines and a per-item Total Qty spanning cell). Letterhead uses the
 * saved Company Profile. Selected via Settings → Print → Document Template.
 */
export function exportMeasurementPlantPdf(id) {
  try {
    const sheetId = id || state.currentSheetId;
    if (!sheetId) return showToast('Save sheet before exporting', 'error');
    const s = state.sheets.find(x => x.id === sheetId);
    if (!s) return showToast('Sheet not found', 'error');
    if (!window.jspdf || !window.jspdf.jsPDF) return showToast('PDF library not loaded — refresh the page', 'error');
    const c = state.clients.find(x => x.id === s.clientId);
    const proj = state.projects.find(p => p.id === s.projectId);
    const doc = new window.jspdf.jsPDF('portrait');
    const pw = doc.internal.pageSize.getWidth();
    let y = getCompanyHeaderForPDF(doc) + 2;

    // TO / DATE / SHEET-NO block
    const authority = (state.printSettings?.authorityName || '').trim();
    doc.setFontSize(9); doc.setFont('helvetica', 'normal'); doc.setTextColor(30);
    doc.text(`TO, ${c?.name || proj?.clientName || '—'}`, 14, y + 4);
    doc.text(authority || 'Name of Authority', 14, y + 14);
    doc.setFont('helvetica', 'bold');
    doc.text(`DATE: ${_fmtDMY(s.date)}`, pw - 14, y + 4, { align: 'right' });
    doc.setFont('helvetica', 'normal');
    doc.text(`PROJECT / AREA : ${s.area || proj?.name || '—'}`, pw - 14, y + 9, { align: 'right' });
    doc.setFont('helvetica', 'bold');
    doc.text(`MEASUREMENT SHEET NO. ${s.sheetNum || ''}`, pw - 14, y + 14, { align: 'right' });

    const ty = y + 19;
    doc.setFontSize(12); doc.setFont('helvetica', 'bold'); doc.setTextColor(20);
    doc.text('Measurement Sheet', pw / 2, ty + 3, { align: 'center' });

    // Grouped body: item header row + F-lines + a per-group Total Qty (rowSpan).
    const groups = groupSheetEntries(s.entries || []);
    const head = [['Sr\nNo.', 'Description', 'UOM', 'Nos.', 'Length', 'Width', 'Height\nThk.', 'Coeff\nSize', 'Qty', 'Total\nQty']];
    const body = [];
    let itemNum = 0;
    Object.keys(groups).forEach(key => {
      const lines = groups[key];
      const first = lines[0] || {};
      itemNum++;
      let total = 0; lines.forEach(e => total += (e.qty || 0));
      body.push([
        { content: itemNum, styles: { halign: 'center', fontStyle: 'bold' } },
        { content: (first.description || first.code || ''), styles: { fontStyle: 'bold' } },
        { content: (first.uom || ''), styles: { halign: 'center', fontStyle: 'bold' } },
        '', '', '', '', '', '',
        { content: _qtyDp(total), rowSpan: lines.length + 1, styles: { valign: 'middle', halign: 'center', fontStyle: 'bold' } }
      ]);
      lines.forEach(e => {
        body.push([
          '',
          { content: e.remarks || '', styles: { halign: 'center' } },
          '',
          { content: e.nos || '', styles: { halign: 'center' } },
          { content: e.l || '', styles: { halign: 'center' } },
          { content: e.b || '', styles: { halign: 'center' } },
          { content: e.h || '', styles: { halign: 'center' } },
          '',
          { content: (e.qty != null && e.qty !== '') ? _qtyDp(e.qty) : '', styles: { halign: 'center' } }
        ]);
      });
    });
    doc.autoTable({
      startY: ty + 6, head, body, theme: 'grid',
      headStyles: { fillColor: [255, 255, 255], textColor: [0, 0, 0], fontStyle: 'bold', halign: 'center', valign: 'middle', lineColor: [0, 0, 0], lineWidth: 0.2, fontSize: 7.5 },
      styles: { fontSize: 8, cellPadding: 1.3, lineColor: [0, 0, 0], lineWidth: 0.15, textColor: [15, 23, 42] },
      columnStyles: { 0: { cellWidth: 10, halign: 'center' }, 1: { cellWidth: 'auto' }, 2: { cellWidth: 13, halign: 'center' }, 3: { cellWidth: 13, halign: 'center' }, 4: { cellWidth: 16, halign: 'center' }, 5: { cellWidth: 16, halign: 'center' }, 6: { cellWidth: 16, halign: 'center' }, 7: { cellWidth: 15, halign: 'center' }, 8: { cellWidth: 18, halign: 'center' }, 9: { cellWidth: 20, halign: 'center' } },
      margin: { left: 14, right: 14 }
    });
    mobileSavePDF(doc, `Measurement_${s.sheetNum}.pdf`);
  } catch (err) {
    console.error('Plant measurement PDF failed:', err);
    showToast('PDF error: ' + (err && err.message ? err.message : err), 'error');
  }
}

// ── "New Format" palette (matches the client's Jay Ambe PDF) ──
const _FL_TEAL = [23, 162, 184];
const _FL_ORANGE = [247, 148, 30];
const _FL_LABEL = [90, 100, 115];
const _FL_HEADFILL = [238, 240, 242];
const _FL_TOTFILL = [222, 235, 255];
const _FL_TOTTEXT = [30, 64, 150];
const _FL_PEACH = [253, 235, 214];
const _FL_NAVY = [30, 55, 100];

// Shared "New Format" top band: company logo top-left, company name in orange
// beside it, and a right-aligned Document ID / Status / Version block, closed by
// a teal rule and the document title. Returns the y below the rule+title.
function _flintTopBand(doc, { title, docId, status, version }) {
  const cp = state.companyProfile || {};
  const pw = doc.internal.pageSize.getWidth();
  const ml = 14, mr = 14;
  const topY = 12;
  let logoBottom = topY, nameRight = ml;
  if (cp.logo) { try { doc.addImage(cp.logo, 'PNG', ml, topY, 30, 22); logoBottom = topY + 22; nameRight = ml + 34; } catch { nameRight = ml; } }
  // Company name in orange, wrapped beside the logo.
  if (cp.CompanyName) {
    doc.setFont('helvetica', 'bold'); doc.setFontSize(15);
    doc.setTextColor(_FL_ORANGE[0], _FL_ORANGE[1], _FL_ORANGE[2]);
    const nameW = (pw / 2) - nameRight;
    const lines = doc.splitTextToSize(String(cp.CompanyName).toUpperCase(), nameW > 30 ? nameW : 60);
    let ny = topY + 6;
    lines.forEach(ln => { doc.text(ln, nameRight, ny); ny += 6.5; });
    logoBottom = Math.max(logoBottom, ny - 4);
  }
  // Right-aligned document meta block.
  const rx = pw - mr;
  doc.setFont('helvetica', 'bold'); doc.setFontSize(10); doc.setTextColor(_FL_LABEL[0], _FL_LABEL[1], _FL_LABEL[2]);
  doc.text('Document ID :', rx - 26, topY + 5, { align: 'right' });
  doc.text('Status :', rx - 26, topY + 12, { align: 'right' });
  doc.text('Version :', rx - 26, topY + 19, { align: 'right' });
  doc.setTextColor(40); doc.setFont('helvetica', 'normal');
  doc.text(String(docId || ''), rx - 22, topY + 5);
  doc.text(String(status || 'Draft'), rx - 22, topY + 12);
  doc.text(String(version || '1.0'), rx - 22, topY + 19);
  let y = Math.max(logoBottom, topY + 22) + 3;
  // Teal rule.
  doc.setDrawColor(_FL_TEAL[0], _FL_TEAL[1], _FL_TEAL[2]); doc.setLineWidth(1.1);
  doc.line(ml, y, pw - mr, y);
  // Title in teal.
  doc.setFont('helvetica', 'bold'); doc.setFontSize(13); doc.setTextColor(_FL_TEAL[0], _FL_TEAL[1], _FL_TEAL[2]);
  doc.text(title, ml + 4, y + 7);
  doc.setLineWidth(0.2);
  return y + 11;
}
if (typeof window !== 'undefined') { window._flintTopBand = _flintTopBand; window._flintPalette = { _FL_TEAL, _FL_ORANGE, _FL_LABEL, _FL_HEADFILL, _FL_TOTFILL, _FL_TOTTEXT, _FL_PEACH, _FL_NAVY }; }

// Rounded info box with two label/value columns (Project/Engineer etc.).
function _flintInfoBox(doc, y, pairsL, pairsR) {
  const pw = doc.internal.pageSize.getWidth();
  const ml = 14, mr = 14;
  const rows = Math.max(pairsL.length, pairsR.length);
  const h = 8 + rows * 7;
  doc.setDrawColor(170, 180, 195); doc.setLineWidth(0.3);
  doc.roundedRect(ml, y, pw - ml - mr, h, 2.5, 2.5, 'S');
  const colX = (pw - ml - mr) / 2;
  const draw = (pairs, lx) => pairs.forEach((p, i) => {
    const ry = y + 8 + i * 7;
    doc.setFont('helvetica', 'bold'); doc.setFontSize(9.5); doc.setTextColor(_FL_LABEL[0], _FL_LABEL[1], _FL_LABEL[2]);
    doc.text(p[0], lx, ry);
    doc.setFont('helvetica', 'normal'); doc.setTextColor(40);
    doc.text(String(p[1] == null ? '' : p[1]), lx + 32, ry);
  });
  draw(pairsL, ml + 4);
  draw(pairsR, ml + colX + 4);
  doc.setLineWidth(0.2);
  return y + h + 4;
}

/**
 * Measurement Sheet — "New Format" template (client's Jay Ambe PDF): logo +
 * orange company name + Document ID/Status/Version, teal rule & title, a rounded
 * Project/Engineer info box, then a grouped grid with teal-accented item headers
 * and a light-blue "TOTAL <item>" row per item.
 */
export function exportMeasurementFlintPdf(id) {
  try {
    const sheetId = id || state.currentSheetId;
    if (!sheetId) return showToast('Save sheet before exporting', 'error');
    const s = state.sheets.find(x => x.id === sheetId);
    if (!s) return showToast('Sheet not found', 'error');
    if (!window.jspdf || !window.jspdf.jsPDF) return showToast('PDF library not loaded — refresh the page', 'error');
    const proj = state.projects.find(p => p.id === s.projectId);
    const client = state.clients.find(x => x.id === s.clientId);
    const clientName = client?.name || proj?.clientName || '';
    const doc = new window.jspdf.jsPDF('portrait');
    const status = s.locked ? 'Verified & Locked' : (s.status || 'Draft');
    let y = _flintTopBand(doc, { title: 'Measurement Sheet', docId: 'MES/' + (s.sheetNum || ''), status, version: '1.0' });
    y = _flintInfoBox(doc, y,
      [['Project Name :', proj?.name || clientName || '—'], ['Site Location:', proj?.siteLocation || s.area || '—'], ['Area :', s.area || '']],
      [['Engineer:', s.engineer || ''], ['Date:', s.date || ''], ['Sheet:', s.sheetNum || '']]
    );

    const groups = groupSheetEntries(s.entries || []);
    const head = [['Sr.No', 'Description', 'UOM', 'Nos.', 'Length', 'Width', 'Height /Thk.', 'Coeff./Size', 'Qty']];
    const body = [];
    const groupRows = []; // body-row indices that are item headers (for the teal accent bar)
    let itemNum = 0;
    Object.keys(groups).forEach(key => {
      const lines = groups[key];
      const first = lines[0] || {};
      itemNum++;
      let total = 0; lines.forEach(e => total += (e.qty || 0));
      groupRows.push(body.length);
      body.push([
        { content: itemNum, styles: { halign: 'center', fontStyle: 'bold' } },
        { content: (first.description || first.code || ''), styles: { fontStyle: 'bold' } },
        { content: (first.uom || ''), styles: { halign: 'center', fontStyle: 'bold' } },
        '', '', '', '', '', ''
      ]);
      lines.forEach(e => {
        body.push([
          '',
          { content: e.remarks || '', styles: { halign: 'center' } },
          '',
          { content: e.nos || '', styles: { halign: 'center' } },
          { content: e.l || '', styles: { halign: 'center' } },
          { content: e.b || '', styles: { halign: 'center' } },
          { content: e.h || '', styles: { halign: 'center' } },
          { content: e.coeff || e.size || '', styles: { halign: 'center' } },
          { content: (e.qty != null && e.qty !== '') ? _qtyDp(e.qty) : '', styles: { halign: 'center' } }
        ]);
      });
      body.push([
        { content: 'TOTAL ' + String(first.description || first.code || '').toUpperCase(), colSpan: 8, styles: { fontStyle: 'bold', fillColor: _FL_TOTFILL, textColor: _FL_TOTTEXT } },
        { content: _qtyDp(total), styles: { fontStyle: 'bold', halign: 'center', fillColor: _FL_TOTFILL, textColor: _FL_TOTTEXT } }
      ]);
    });
    doc.autoTable({
      startY: y, head, body, theme: 'grid',
      headStyles: { fillColor: _FL_HEADFILL, textColor: [40, 40, 40], fontStyle: 'bold', halign: 'center', valign: 'middle', lineColor: [210, 215, 222], lineWidth: 0.1, fontSize: 8 },
      styles: { fontSize: 8, cellPadding: 1.5, lineColor: [225, 228, 233], lineWidth: 0.1, textColor: [30, 40, 55] },
      columnStyles: { 0: { cellWidth: 11, halign: 'center' }, 1: { cellWidth: 'auto' }, 2: { cellWidth: 13, halign: 'center' }, 3: { cellWidth: 14, halign: 'center' }, 4: { cellWidth: 17, halign: 'center' }, 5: { cellWidth: 17, halign: 'center' }, 6: { cellWidth: 17, halign: 'center' }, 7: { cellWidth: 16, halign: 'center' }, 8: { cellWidth: 18, halign: 'center' } },
      margin: { left: 14, right: 14 },
      didParseCell: (d) => { if (d.section === 'body' && groupRows.includes(d.row.index)) d.cell.styles.fontStyle = 'bold'; },
      didDrawCell: (d) => {
        if (d.section === 'body' && d.column.index === 0 && groupRows.includes(d.row.index)) {
          doc.setFillColor(_FL_TEAL[0], _FL_TEAL[1], _FL_TEAL[2]);
          doc.rect(d.cell.x + 0.4, d.cell.y + 0.8, 1.4, d.cell.height - 1.6, 'F');
        }
      }
    });
    mobileSavePDF(doc, `Measurement_${s.sheetNum}.pdf`);
  } catch (err) {
    console.error('New-format measurement PDF failed:', err);
    showToast('PDF error: ' + (err && err.message ? err.message : err), 'error');
  }
}

export function exportSimpleMeasurementPdf(id) {
  try {
  // Route to the Plant/Tabular template when selected in Settings.
  if ((state.printSettings?.docTemplate) === 'flint') return exportMeasurementFlintPdf(id);
  if ((state.printSettings?.docTemplate) === 'plant') return exportMeasurementPlantPdf(id);
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
      rows.push(['', e.remarks || '', e.nos || '', e.l || '', e.b || '', e.h || '', _qtyDp(e.qty), e.uom || first.uom || '']);
    });
    rows.push([
      '', { content: 'Total Quantity', colSpan: 5, styles: { halign: 'right', fontStyle: 'bold' } },
      { content: _qtyDp(total), styles: { fontStyle: 'bold', halign: 'center', fillColor: totalFill } },
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
      const vals = [e.nos || '', e.l || '', e.b || '', e.h || '', _qtyDp(e.qty)];
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
    doc.text(_qtyDp(thisBillQty), summaryValCol, y + 3);
    y += 4;
    doc.setFont('helvetica', 'normal');
    doc.text('Previous Bill Qty', summaryLabelCol, y + 3);
    doc.text(_qtyDp(prevQty), summaryValCol, y + 3);
    y += 4;
    doc.setFont('helvetica', 'bold');
    doc.text(`Total Done Qty in ${unit}`, summaryLabelCol, y + 3);
    doc.text(_qtyDp(totalDoneQty), summaryValCol, y + 3);
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

