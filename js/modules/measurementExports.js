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
import { showToast, getCompanyHeaderForPDF, getCurrencySymbol, mobileSavePDF, mobileSaveXLSX, mobileDownloadBlob } from './utils.js';
const _simpleHeader = (doc, o) => (typeof window !== 'undefined' && window.getSimpleHeaderForPDF) ? window.getSimpleHeaderForPDF(doc, o) : getCompanyHeaderForPDF(doc);
import { lookupBoqItem } from './abstractCalc.js';
import { computeSheetPrevQtyMap, groupSheetEntries, sheetPrevQtyFor } from './sheetCalc.js';
import { BBS_UNIT_WEIGHTS } from './constants.js';
import { MD, fitImage, loadModernFonts, newModernDoc } from './pdfModernTheme.js?v=1.2.0';

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
// Custom label for a built-in dimension column ('nos'|'l'|'b'|'h'), else the export default.
function _hl(s, key, def) { return (s && s.columnLabels && s.columnLabels[key]) ? s.columnLabels[key] : def; }

// ── Dynamic column model ────────────────────────────────────────────────────
// Exports must mirror the Measurement Sheet's ACTUAL configured columns — never
// a fixed/assumed structure. The only user-configurable extras are the custom
// columns (added via "+ Custom Columns"); these helpers surface them, in their
// configured position order, so every template reproduces exactly what the sheet
// shows. Renamed built-in headers (Nos/L/B/H) are already handled by _hl().
const _CC_ORDER = { 'after-nos': 3.5, 'after-l': 4.5, 'after-b': 5.5, 'after-h': 6.5, 'after-qty': 8.5, 'after-remarks': 9.5 };
/** Custom columns configured on a sheet, in their configured position order. */
function _sheetCustomCols(s) {
  return [...((s && s.customColumns) || [])].sort((a, b) => (_CC_ORDER[a.position] ?? 9.5) - (_CC_ORDER[b.position] ?? 9.5));
}
/** Value of a custom column for an entry line (blank when unset). */
function _ccVal(e, col) { return (e && e.customData && e.customData[col.id] != null) ? e.customData[col.id] : ''; }

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
    // Columns come strictly from the sheet: fixed built-ins + any custom columns
    // (in configured order). No hard-coded Coef/Size column.
    const cc = _sheetCustomCols(s);
    const head = [['Sr\nNo.', 'Description', 'UOM', _hl(s, 'nos', 'Nos.'), _hl(s, 'l', 'Length'), _hl(s, 'b', 'Width'), _hl(s, 'h', 'Height\nThk.'), ...cc.map(c => c.name), 'Qty', 'Total\nQty']];
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
        '', '', '', '', ...cc.map(() => ''), '',
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
          ...cc.map(col => ({ content: _ccVal(e, col), styles: { halign: 'center' } })),
          { content: (e.qty != null && e.qty !== '') ? _qtyDp(e.qty) : '', styles: { halign: 'center' } }
        ]);
      });
    });
    // Column widths: fixed built-ins, then one slot per custom column, then Qty + Total.
    const plantCS = { 0: { cellWidth: 10, halign: 'center' }, 1: { cellWidth: 'auto' }, 2: { cellWidth: 13, halign: 'center' }, 3: { cellWidth: 13, halign: 'center' }, 4: { cellWidth: 16, halign: 'center' }, 5: { cellWidth: 16, halign: 'center' }, 6: { cellWidth: 16, halign: 'center' } };
    cc.forEach((_, i) => { plantCS[7 + i] = { cellWidth: 15, halign: 'center' }; });
    plantCS[7 + cc.length] = { cellWidth: 18, halign: 'center' };
    plantCS[8 + cc.length] = { cellWidth: 20, halign: 'center' };
    doc.autoTable({
      startY: ty + 6, head, body, theme: 'grid',
      headStyles: { fillColor: [255, 255, 255], textColor: [0, 0, 0], fontStyle: 'bold', halign: 'center', valign: 'middle', lineColor: [0, 0, 0], lineWidth: 0.2, fontSize: 7.5 },
      styles: { fontSize: 8, cellPadding: 1.3, lineColor: [0, 0, 0], lineWidth: 0.15, textColor: [15, 23, 42] },
      columnStyles: plantCS,
      margin: { left: 14, right: 14 }
    });
    mobileSavePDF(doc, `Measurement_${s.sheetNum}.pdf`);
  } catch (err) {
    console.error('Plant measurement PDF failed:', err);
    showToast('PDF error: ' + (err && err.message ? err.message : err), 'error');
  }
}

// ── "Modern Design" measurement sheet (client template — colours are fixed) ──
// Palette + helpers live in pdfModernTheme.js so the Abstract matches exactly.

/** Shrink a single line of text until it fits maxW; returns the font size used. */
function _mdFit(doc, text, maxW, size, min = 6.5) {
  doc.setFontSize(size);
  while (size > min && doc.getTextWidth(String(text)) > maxW) { size -= 0.5; doc.setFontSize(size); }
  return size;
}

/**
 * Letterhead of the Modern Design measurement sheet: large logo, orange company
 * name (up to 3 lines), right-hand Document ID / Status / Version, grey title
 * and the teal rule. Returns the y of the teal rule.
 */
function _mdMeasHeader(doc, F, { title, docId, status, version }) {
  const cp = state.companyProfile || {};
  const pw = doc.internal.pageSize.getWidth();
  const ml = 14, mr = 14;
  let bottom = 48;
  let nameX = ml + 2;
  if (cp.logo) {
    const r = fitImage(doc, cp.logo, ml + 1.5, 9, 38, 39, 'center');
    if (r) { nameX = 62; bottom = Math.max(bottom, r.y + r.h); }
  }
  if (cp.CompanyName) {
    const maxW = 136 - nameX;
    doc.setFont(F.gothic, 'bold');
    let size = 26, lines;
    do { doc.setFontSize(size); lines = doc.splitTextToSize(String(cp.CompanyName).toUpperCase(), maxW); size -= 1; }
    while ((lines.length > 3 || lines.some(l => doc.getTextWidth(l) > maxW)) && size > 13);
    size += 1;
    const step = size * 0.3528 * 1.18;
    doc.setTextColor(MD.ORANGE[0], MD.ORANGE[1], MD.ORANGE[2]);
    let ny = 21 + size * 0.3528 * 0.55;
    lines.slice(0, 3).forEach(ln => { doc.text(ln, nameX, ny); ny += step; });
    bottom = Math.max(bottom, ny - step + 3);
  }
  // Document ID / Status / Version (labels right-aligned, values to the right).
  const lx = 168, vx = 174, vw = pw - mr - vx;
  [['Document ID:', docId], ['Status :', status], ['Version:', version]].forEach(([lab, val], i) => {
    const by = 24.5 + i * 12;
    doc.setFont(F.gothic, 'bold'); doc.setFontSize(11); doc.setTextColor(MD.LABEL[0], MD.LABEL[1], MD.LABEL[2]);
    doc.text(lab, lx, by, { align: 'right' });
    doc.setFont(F.sans, 'normal'); doc.setTextColor(MD.INK[0], MD.INK[1], MD.INK[2]);
    _mdFit(doc, val == null ? '' : val, vw, 10);
    doc.text(String(val == null ? '' : val), vx, by);
  });
  // Title + teal rule.
  const ruleY = Math.max(60.5, bottom + 9);
  doc.setFont(F.gothic, 'bold'); doc.setFontSize(13); doc.setTextColor(MD.LABEL[0], MD.LABEL[1], MD.LABEL[2]);
  doc.text(title, cp.logo ? 59 : ml + 2, ruleY - 2);
  doc.setDrawColor(MD.TEAL[0], MD.TEAL[1], MD.TEAL[2]); doc.setLineWidth(1.2);
  doc.line(ml, ruleY, pw - mr, ruleY);
  doc.setLineWidth(0.2);
  return ruleY;
}

/** Rounded Project / Site / Area · Engineer / Date / Sheet box. Returns its bottom y. */
function _mdMeasInfoBox(doc, F, top, left3, right3) {
  const x = 16.8, w = 163, h = 39.6;
  doc.setDrawColor(MD.BOX[0], MD.BOX[1], MD.BOX[2]); doc.setLineWidth(0.6);
  doc.roundedRect(x, top, w, h, 6, 6, 'S');
  const rows = [10.3, 24.9, 36];
  const put = (pairs, labX, valX, valMax) => pairs.forEach(([lab, val], i) => {
    const by = top + rows[i];
    doc.setFont(F.gothic, 'bold'); doc.setFontSize(11); doc.setTextColor(MD.LABEL[0], MD.LABEL[1], MD.LABEL[2]);
    doc.text(lab, labX, by);
    doc.setFont(F.sans, 'normal'); doc.setTextColor(MD.INK[0], MD.INK[1], MD.INK[2]);
    const v = String(val == null ? '' : val);
    _mdFit(doc, v, valMax, 11);
    doc.text(v, valX, by);
  });
  put(left3, 25.8, 61.8, 120.5 - 61.8);
  put(right3, 124.7, 146.7, 179 - 146.7);
  // Faint separators under the first two rows (as on the template).
  doc.setDrawColor(MD.HEADBOX[0], MD.HEADBOX[1], MD.HEADBOX[2]); doc.setLineWidth(0.25);
  doc.line(22.3, top + 16.6, 121.8, top + 16.6);
  doc.line(22.3, top + 28.4, 121.8, top + 28.4);
  doc.line(146, top + 16.6, 177, top + 16.6);
  doc.line(123.5, top + 28.4, 181, top + 28.4);
  doc.setLineWidth(0.2);
  return top + h;
}

/**
 * Measurement Sheet — "Modern Design" template (client's Jay Ambe Modern Design
 * PDF): big logo + orange company name + Document ID/Status/Version, grey title
 * over a teal rule, rounded info box, rounded column-head box, grey-barred item
 * headings, ruled measurement lines and a light-blue "TOTAL <item>" band.
 * Columns follow the sheet's own configuration (renamed headers + custom columns).
 */
export async function exportMeasurementFlintPdf(id) {
  try {
    const sheetId = id || state.currentSheetId;
    if (!sheetId) return showToast('Save sheet before exporting', 'error');
    const s = state.sheets.find(x => x.id === sheetId);
    if (!s) return showToast('Sheet not found', 'error');
    if (!window.jspdf || !window.jspdf.jsPDF) return showToast('PDF library not loaded — refresh the page', 'error');
    const proj = state.projects.find(p => p.id === s.projectId);
    const client = state.clients.find(x => x.id === s.clientId);
    const clientName = client?.name || proj?.clientName || '';
    const fonts = await loadModernFonts();
    const { doc, F } = newModernDoc(fonts);
    const pw = doc.internal.pageSize.getWidth();
    const ml = 14, mr = 14;
    const status = s.locked ? 'Verified & Locked' : (s.status || 'Draft');
    const ruleY = _mdMeasHeader(doc, F, { title: 'Measurement Sheet', docId: 'MES/' + (s.sheetNum || ''), status, version: s.version || '1.0' });
    const boxBottom = _mdMeasInfoBox(doc, F, ruleY + 4.3,
      [['Project Name :', proj?.name || clientName || ''], ['Site Location:', proj?.siteLocation || proj?.location || ''], ['Area :', s.area || '']],
      [['Engineer:', s.engineer || ''], ['Date:', _fmtDMY(s.date)], ['Sheet:', s.sheetNum || '']]
    );

    // Columns strictly from the sheet: built-ins (with renamed labels) + custom columns.
    const cc = _sheetCustomCols(s);
    const head = [['Sr.No', 'Description', 'UOM', _hl(s, 'nos', 'Nos.'), _hl(s, 'l', 'Length'), _hl(s, 'b', 'Width'), _hl(s, 'h', 'Height\n/Thk.'), ...cc.map(c => c.name), 'Qty']];
    const N = head[0].length;
    const kinds = [];
    const body = [];
    const push = (kind, row) => { kinds.push(kind); body.push(row); };
    const groups = groupSheetEntries(s.entries || []);
    let itemNum = 0;
    Object.keys(groups).forEach(key => {
      const lines = groups[key];
      const first = lines[0] || {};
      const desc = String(first.description || first.code || '').toUpperCase();
      itemNum++;
      let total = 0; lines.forEach(e => total += (Number(e.qty) || 0));
      push('gap', [{ content: '', colSpan: N }]);
      push('sec', [
        { content: itemNum + ' ' + desc, colSpan: 2 },
        { content: first.uom || '', styles: { halign: 'center' } },
        { content: '', colSpan: N - 3 }
      ]);
      lines.forEach(e => push('line', [
        '',
        e.remarks || '',
        '',
        e.nos ?? '', e.l ?? '', e.b ?? '', e.h ?? '',
        ...cc.map(col => _ccVal(e, col)),
        (e.qty != null && e.qty !== '') ? _qtyDp(e.qty) : ''
      ]));
      push('total', [
        { content: 'TOTAL ' + desc, colSpan: N - 1 },
        { content: _qtyDp(total), styles: { halign: 'center' } }
      ]);
    });

    const colStyles = { 0: { cellWidth: 14 }, 1: { cellWidth: 'auto' }, 2: { cellWidth: 13 }, 3: { cellWidth: 13 }, 4: { cellWidth: 16 }, 5: { cellWidth: 15 }, 6: { cellWidth: 16 } };
    cc.forEach((_, i) => { colStyles[7 + i] = { cellWidth: 16 }; });
    colStyles[N - 1] = { cellWidth: 20 };
    const tableW = pw - ml - mr;

    doc.autoTable({
      startY: boxBottom + 2.3, head, body, theme: 'plain', showHead: 'firstPage',
      margin: { left: ml, right: mr, top: 14, bottom: 14 },
      rowPageBreak: 'avoid',
      styles: { font: F.sans, fontSize: 10.5, fontStyle: 'bold', textColor: MD.INK, halign: 'center', valign: 'middle', cellPadding: { top: 1.2, bottom: 1.2, left: 1, right: 1 }, minCellHeight: 5.9, lineWidth: 0, overflow: 'linebreak' },
      headStyles: { font: F.gothic, fontSize: 10, fontStyle: 'bold', textColor: MD.LABEL, halign: 'center', valign: 'middle', minCellHeight: 11.7, cellPadding: { top: 1, bottom: 1, left: 1, right: 1 } },
      columnStyles: colStyles,
      didParseCell: (d) => {
        if (d.section === 'head') { if (d.column.index === 0) d.cell.styles.halign = 'left'; return; }
        const k = kinds[d.row.index];
        if (k === 'gap') { d.cell.styles.minCellHeight = 5.5; d.cell.styles.cellPadding = 0; d.cell.styles.fontSize = 1; }
        else if (k === 'sec') {
          d.cell.styles.font = F.gothic; d.cell.styles.textColor = MD.LABEL; d.cell.styles.fontSize = 10.5; d.cell.styles.minCellHeight = 6.2;
          if (d.column.index === 0) { d.cell.styles.halign = 'left'; d.cell.styles.cellPadding = { top: 1, bottom: 1, left: 2.2, right: 1 }; }
        } else if (k === 'total') {
          d.cell.styles.font = F.gothic; d.cell.styles.fillColor = MD.TOTFILL; d.cell.styles.textColor = MD.TOTTEXT; d.cell.styles.fontSize = 9.5; d.cell.styles.minCellHeight = 5.7;
          if (d.column.index === 0) { d.cell.styles.halign = 'left'; d.cell.styles.cellPadding = { top: 1, bottom: 1, left: 6, right: 1 }; }
        }
      },
      didDrawCell: (d) => {
        const c = d.cell;
        if (d.section === 'head') {
          if (d.column.index === 0) {
            doc.setDrawColor(MD.HEADBOX[0], MD.HEADBOX[1], MD.HEADBOX[2]); doc.setLineWidth(0.6);
            doc.roundedRect(ml, c.y + 0.3, tableW, c.height - 0.6, 2.8, 2.8, 'S');
          }
          return;
        }
        const k = kinds[d.row.index];
        if (k === 'line') {
          doc.setDrawColor(MD.RULE[0], MD.RULE[1], MD.RULE[2]); doc.setLineWidth(0.45);
          doc.line(c.x, c.y + c.height, c.x + c.width, c.y + c.height);
        } else if (k === 'total') {
          doc.setDrawColor(MD.TOTLINE[0], MD.TOTLINE[1], MD.TOTLINE[2]); doc.setLineWidth(0.6);
          doc.line(c.x, c.y, c.x + c.width, c.y);
          doc.line(c.x, c.y + c.height, c.x + c.width, c.y + c.height);
        } else if (k === 'sec' && d.column.index === 0) {
          doc.setFillColor(MD.BOX[0], MD.BOX[1], MD.BOX[2]);
          doc.rect(c.x + 0.2, c.y + 0.6, 0.5, c.height - 1.0, 'F');
        }
      }
    });
    doc.setLineWidth(0.2);
    mobileSavePDF(doc, `Measurement_${s.sheetNum}.pdf`);
  } catch (err) {
    console.error('Modern measurement PDF failed:', err);
    showToast('PDF error: ' + (err && err.message ? err.message : err), 'error');
  }
}

export function exportSimpleMeasurementPdf(id) {
  try {
  // Route to the selected template (Settings → Print). Modern Design is the default.
  const _tpl = (state.printSettings?.docTemplate) || 'flint';
  if (_tpl === 'flint') return exportMeasurementFlintPdf(id);
  if (_tpl === 'plant') return exportMeasurementPlantPdf(id);
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
  // Columns strictly from the sheet: built-ins + custom columns (configured order).
  const cc = _sheetCustomCols(s);
  const head = [['Sr', 'Particulars of work', _hl(s, 'nos', 'Nos'), _hl(s, 'l', 'L'), _hl(s, 'b', 'B'), _hl(s, 'h', 'H'), ...cc.map(c => c.name), 'Qty', 'Unit']];
  const rows = [];
  let itemNum = 0;
  Object.keys(groups).forEach(key => {
    const lines = groups[key];
    const first = lines[0] || {};
    itemNum++;
    const title = (first.code ? first.code + ' — ' : '') + (first.description || first.code || '');
    rows.push([
      { content: itemNum, styles: { fontStyle: 'bold' } },
      { content: title, colSpan: 7 + cc.length, styles: { fontStyle: 'bold', fillColor: itemLineFill, textColor: accent } }
    ]);
    let total = 0;
    lines.forEach(e => {
      total += (e.qty || 0);
      rows.push(['', e.remarks || '', e.nos || '', e.l || '', e.b || '', e.h || '', ...cc.map(col => _ccVal(e, col)), _qtyDp(e.qty), e.uom || first.uom || '']);
    });
    rows.push([
      '', { content: 'Total Quantity', colSpan: 5 + cc.length, styles: { halign: 'right', fontStyle: 'bold' } },
      { content: _qtyDp(total), styles: { fontStyle: 'bold', halign: 'center', fillColor: totalFill } },
      { content: first.uom || '', styles: { fontStyle: 'bold', halign: 'center' } }
    ]);
  });
  const simpleCS = {
    0: { cellWidth: 9, halign: 'center' }, 1: { cellWidth: 'auto', overflow: 'linebreak' },
    2: { cellWidth: 15, halign: 'center' }, 3: { cellWidth: 18, halign: 'center' }, 4: { cellWidth: 18, halign: 'center' }, 5: { cellWidth: 18, halign: 'center' }
  };
  cc.forEach((_, i) => { simpleCS[6 + i] = { cellWidth: 16, halign: 'center' }; });
  simpleCS[6 + cc.length] = { cellWidth: 22, halign: 'center', fontStyle: 'bold', textColor: accent };
  simpleCS[7 + cc.length] = { cellWidth: 16, halign: 'center' };
  doc.autoTable({
    startY: y + 28, head, body: rows, theme: 'grid', tableWidth: 'auto',
    headStyles: { fillColor: accent, textColor: headTextCol, fontSize: isP ? 7 : 7.5, fontStyle: 'bold', halign: 'center', lineColor: border, lineWidth: 0.15 },
    styles: { fontSize: isP ? 7 : 7.5, cellPadding: 1.6, overflow: 'linebreak', textColor: fontCol, lineColor: border, lineWidth: 0.15 },
    columnStyles: simpleCS
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
  const baseHeaders = ['Sr. No.', 'Description', _hl(s, 'nos', 'Nos.'), _hl(s, 'l', 'Length'), _hl(s, 'b', 'Breadth'), _hl(s, 'h', 'Height'), 'Total'];
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
  // Columns strictly from the sheet: built-ins + custom columns (configured order).
  const cc = _sheetCustomCols(s);
  const csvCell = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const headerCols = ['Code', 'Description', 'Unit', _hl(s, 'nos', 'Nos'), _hl(s, 'l', 'L'), _hl(s, 'b', 'B'), _hl(s, 'h', 'H'), ...cc.map(c => c.name), 'Qty', 'Remarks'];
  let csvContent = headerCols.map(csvCell).join(',') + `\n`;
  s.entries.forEach(e => {
    let row = [e.code, `"${(e.description || '').replace(/"/g, '""')}"`, e.uom, e.nos, e.l, e.b, e.h, ...cc.map(col => csvCell(_ccVal(e, col))), e.qty, `"${(e.remarks || '').replace(/"/g, '""')}"`];
    csvContent += row.join(",") + "\n";
  });
  // Save via the Capacitor-aware helper so it works in the Android app (writes the
  // file + opens the Save/Share sheet), not just the browser.
  const blob = new Blob(['﻿' + csvContent], { type: 'text/csv;charset=utf-8;' });
  mobileDownloadBlob(blob, `Measurement_${s.sheetNum}.csv`, 'text/csv');
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
  const baseHeaders = ['Sr. No.', 'Description', _hl(s, 'nos', 'Nos.'), _hl(s, 'l', 'Length'), _hl(s, 'b', 'Breadth'), _hl(s, 'h', 'Height'), 'Total'];
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


// ── Preview a measurement/abstract TEMPLATE from Settings (no state change) ──
// Temporarily applies the chosen docTemplate, exports the latest sheet (or a
// built-in sample added→removed without saving), then restores the setting.
function _sampleSheet() {
  return {
    id: '_preview_sheet', sheetNum: 'SAMPLE-01', date: new Date().toLocaleDateString('en-GB'),
    area: 'Block A — Ground Floor', clientId: (state.clients || [])[0]?.id, projectId: state.currentProjectId,
    entries: [
      { code: '4.2', description: 'RCC Slab M25', uom: 'Cum', nos: 4, l: 5, b: 4, h: 0.15, coef: '', qty: 12, remarks: 'Panel P1–P4' },
      { code: '4.2', description: 'RCC Slab M25', uom: 'Cum', nos: 2, l: 6, b: 4, h: 0.15, coef: '', qty: 7.2, remarks: 'Panel P5–P6' },
      { code: '5.1', description: 'Plaster 12mm CM 1:4', uom: 'Sqm', nos: 1, l: 42.5, b: 1, h: 1, coef: '', qty: 42.5, remarks: 'North wall' },
    ],
  };
}
window._previewMeasTemplate = function (key) {
  if (!state.printSettings) state.printSettings = {};
  const prev = state.printSettings.docTemplate;
  state.printSettings.docTemplate = key;
  let sheet = (state.sheets || [])[(state.sheets || []).length - 1];
  let temp = false;
  if (!sheet) { sheet = _sampleSheet(); state.sheets = state.sheets || []; state.sheets.push(sheet); temp = true; }
  try { exportSimpleMeasurementPdf(sheet.id); }
  finally {
    state.printSettings.docTemplate = prev;
    if (temp) { const i = state.sheets.indexOf(sheet); if (i >= 0) state.sheets.splice(i, 1); }
  }
};
