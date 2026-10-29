/**
 * bbsPdf.js — the Bar Bending Schedule PDF (premium layout, landscape or portrait).
 *
 *   bbsModel(rows)            pure: table rows (with weight per row), totals and the per-diameter
 *                             summary — only the diameters actually used get a column
 *   renderBbs(doc, F, ctx)    draws the schedule into a jsPDF doc (own pages): letterhead, project
 *                             panel, KPI strip, the schedule table, summary by diameter, sign-off,
 *                             page footers. Landscape shows A/B/C/D/Hook as columns; portrait folds
 *                             them into one "Shape (A · B · C · D · Hook)" column.
 *   exportBbsPdf(sheetId, orientation)   stand-alone download (Export → PDF → Bar Bending Schedule)
 */
import { state } from './state.js';
import { showToast, mobileSavePDF } from './utils.js';
import { bbsRowsOf } from './sheetCalc.js?v=1.1.0';
import { bbsModel } from './bbsCalc.js?v=1.0.0';
export { bbsModel };
import { fitImage, loadFontFiles, newColorDoc } from './pdfModernTheme.js?v=1.2.0';

const N = v => { const x = parseFloat(v); return Number.isFinite(x) ? x : 0; };
const r2 = v => Math.round(N(v) * 100) / 100;
const f2 = v => N(v).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const f3 = v => N(v).toLocaleString('en-IN', { minimumFractionDigits: 3, maximumFractionDigits: 3 });
/** Shape dimensions as entered, at most 3 decimals, blank for zero. */
const dim = v => (N(v) ? String(Math.round(N(v) * 1000) / 1000) : '');

// Palettes — Modern Design: slate ink, brand orange accent, quiet greys.
const COLOR = {
  INK: [15, 23, 42], INK2: [51, 65, 85], MUTE: [100, 116, 139], FAINT: [148, 163, 184],
  LINE: [226, 232, 240], ZEBRA: [248, 250, 252], PANEL: [246, 248, 251],
  HEAD: [30, 41, 59], ACC: [234, 88, 12], ACC2: [194, 50, 31], ACCBG: [255, 247, 237], WHITE: [255, 255, 255],
  HLLINE: [253, 186, 116], CALLMUTE: [203, 213, 225], CALLACC: [253, 186, 116],
};
// Standard / Plant templates: pure black-and-white, prints cleanly on any office printer.
const MONO = {
  INK: [0, 0, 0], INK2: [25, 25, 25], MUTE: [85, 85, 85], FAINT: [120, 120, 120],
  LINE: [175, 175, 175], ZEBRA: [244, 244, 244], PANEL: [255, 255, 255],
  HEAD: [0, 0, 0], ACC: [0, 0, 0], ACC2: [0, 0, 0], ACCBG: [232, 232, 232], WHITE: [255, 255, 255],
  HLLINE: [0, 0, 0], CALLMUTE: [190, 190, 190], CALLACC: [225, 225, 225],
};

/** True when Settings → Print uses a plain template (Standard / Plant) → black-and-white BBS. */
export const bbsMono = () => ((state.printSettings?.docTemplate) || 'flint') !== 'flint';

/** Sheet + project context for the letterhead and panels. */
function _ctxFor(s) {
  const proj = (state.projects || []).find(p => p.id === s.projectId) || {};
  const client = (state.clients || []).find(c => c.id === (s.clientId || proj.clientId)) || {};
  const cp = state.companyProfile || {};
  return {
    company: { name: cp.CompanyName || 'Your Company', address: cp.Address || '', phone: cp.Phone || '', email: cp.Email || '', gstin: cp.GST || '', logo: cp.logo || '' },
    work: proj.description || proj.name || '—', contractor: client.name || proj.clientName || '—',
    authority: state.printSettings?.authorityName || cp.CompanyName || '—', location: s.area || '',
    sheetNo: s.sheetNum || '', raBill: s.raBillNum || '', date: s.date || new Date().toISOString().slice(0, 10), project: proj.name || '',
  };
}

/**
 * Draw the schedule on new pages of `doc`.
 * @param {object} doc  jsPDF
 * @param {{ sans:string }} F  font family ('helvetica' fallback)
 * @param {{ sheet:object, rows:Array, orientation:'landscape'|'portrait', firstPage?:boolean, mono?:boolean }} o
 *   firstPage: draw on the doc's current (blank) first page instead of adding one
 *   mono: black-and-white palette (defaults to the Settings → Print template)
 */
export function renderBbs(doc, F, o) {
  const C = (o.mono ?? bbsMono()) ? MONO : COLOR;
  const land = o.orientation !== 'portrait';
  const m = bbsModel(o.rows);
  const x = _ctxFor(o.sheet);
  if (!o.firstPage) doc.addPage('a4', land ? 'landscape' : 'portrait');
  const startPage = doc.internal.getNumberOfPages();
  const pw = doc.internal.pageSize.getWidth(), ph = doc.internal.pageSize.getHeight();
  const ML = 12, MR = 12, W = pw - ML - MR;
  const font = (style, size, col) => { doc.setFont(F.sans, style); doc.setFontSize(size); doc.setTextColor(...(col || C.INK)); };
  const fill = (col) => doc.setFillColor(...col);
  const stroke = (col, w) => { doc.setDrawColor(...col); doc.setLineWidth(w || 0.2); };

  // ── Letterhead ──
  fill(C.ACC); doc.rect(0, 0, pw, 2.2, 'F');
  fill(C.ACC2); doc.rect(pw * 0.62, 0, pw * 0.38, 2.2, 'F');
  let y = 9;
  const logoBox = x.company.logo ? fitImage(doc, x.company.logo, ML, y, 22, 18) : null;
  const tx = logoBox ? ML + logoBox.w + 5 : ML;
  font('bold', 15, C.INK); doc.text(x.company.name, tx, y + 6);
  font('normal', 8, C.MUTE);
  const contact = [x.company.address, x.company.phone && 'Ph: ' + x.company.phone, x.company.email].filter(Boolean).join('   ·   ');
  doc.text(doc.splitTextToSize(contact, land ? 150 : 108), tx, y + 11);
  if (x.company.gstin) { font('bold', 8, C.INK2); doc.text('GSTIN  ' + x.company.gstin, tx, y + (contact.length > (land ? 110 : 80) ? 19.5 : 15.5)); }
  // Title block (right)
  const tbW = land ? 78 : 62, tbX = pw - MR - tbW;
  font('bold', land ? 15 : 13, C.ACC); doc.text('BAR BENDING', pw - MR, y + 5.5, { align: 'right' });
  doc.text('SCHEDULE', pw - MR, y + (land ? 11.5 : 10.5), { align: 'right' });
  font('normal', 7.5, C.MUTE);
  const meta = [['Sheet', x.sheetNo], ['RA bill', x.raBill], ['Date', x.date]].filter(([, v]) => v);
  meta.forEach(([k, v], i) => { const yy = y + 16 + i * 4; font('normal', 7.5, C.MUTE); doc.text(k, tbX, yy); font('bold', 7.5, C.INK); doc.text(String(v), pw - MR, yy, { align: 'right' }); });
  y = Math.max(y + 22, y + 16 + meta.length * 4) + 2;
  stroke(C.INK, 0.5); doc.line(ML, y, pw - MR, y);
  y += 4;

  // ── Project panel ──
  const panel = [['NAME OF WORK', x.work], ['CONTRACTOR', x.contractor], ['AUTHORITY', x.authority], ...(x.location ? [['LOCATION', x.location]] : [])];
  const cols = land ? panel.length : 2, cw = W / cols, rowsN = Math.ceil(panel.length / cols);
  const ph1 = 12.5 * rowsN + 2;
  fill(C.PANEL); stroke(C.LINE, 0.2); doc.roundedRect(ML, y, W, ph1, 2.5, 2.5, 'FD');
  panel.forEach(([k, v], i) => {
    const cx = ML + 5 + (i % cols) * cw, cy = y + 5 + Math.floor(i / cols) * 12.5;
    font('bold', 6.5, C.FAINT); doc.text(k, cx, cy);
    // Shrink long values to fit; if still too long, wrap to two lines with an ellipsis.
    const val = String(v || '—'), maxW = cw - 8;
    let fs = 9; font('bold', fs, C.INK);
    while (fs > 7 && doc.getTextWidth(val) > maxW) font('bold', fs -= 0.5, C.INK);
    let lines = doc.splitTextToSize(val, maxW);
    if (lines.length > 2) lines = [lines[0], doc.splitTextToSize(lines.slice(1).join(' '), maxW - 3)[0] + '…'];
    doc.text(lines, cx, cy + (lines.length > 1 ? 4 : 5), { lineHeightFactor: 1.05 });
    if (i % cols) { stroke(C.LINE, 0.2); doc.line(cx - 5, cy - 3, cx - 5, cy + 6.5); }
  });
  y += ph1 + 4;

  // ── KPI strip ──
  const kpis = [['TOTAL BARS', m.totalBars.toLocaleString('en-IN'), 'nos'], ['TOTAL LENGTH', f2(m.totalLen), 'running m'], ['STEEL WEIGHT', f2(m.totalKg), 'kg'], ['IN TONNES', f3(m.totalMt), 'MT']];
  const kw = (W - 3 * 3) / 4;
  kpis.forEach(([k, v, u], i) => {
    const kx = ML + i * (kw + 3), hl = i === 2;
    fill(hl ? C.ACCBG : C.WHITE); stroke(hl ? C.HLLINE : C.LINE, 0.25); doc.roundedRect(kx, y, kw, 15, 2.5, 2.5, 'FD');
    font('bold', 6.5, hl ? C.ACC2 : C.FAINT); doc.text(k, kx + 4, y + 5);
    font('bold', land ? 13 : 11.5, hl ? C.ACC2 : C.INK); doc.text(v, kx + 4, y + 11.6);
    const vw = doc.getTextWidth(v); font('normal', 7, C.MUTE); doc.text(u, kx + 5 + vw, y + 11.6);
  });
  y += 15 + 5;

  // ── Schedule table ──
  const showDiaCols = m.dias.length > 1 || land;
  const head = land
    ? ['SN', 'Bar mark / Member', 'Dia', 'Bars', 'Nos', 'Total bars', 'A', 'B', 'C', 'D', 'Hook', 'Cut len (m)', 'Total len (m)', ...(showDiaCols ? m.dias.map(d => 'Ø' + d + ' (m)') : []), 'Weight (kg)']
    : ['SN', 'Bar mark / Member', 'Dia', 'Bars × Nos', 'Total bars', 'Shape  A · B · C · D · Hook', 'Cut len (m)', 'Total len (m)', 'Weight (kg)'];
  let prevMark = '';
  const body = m.rows.map(r => {
    const cont = !r.mark;                          // continuation line of the member above
    const label = cont ? (prevMark ? 'do' : '') : r.mark; if (!cont) prevMark = r.mark;
    const base = [r.sn, label, r.dia ? 'Ø' + r.dia : '', r.noBar || '', r.no || '', r.bars || ''];
    if (land) {
      return [...base, dim(r.a), dim(r.b), dim(r.c), dim(r.d), dim(r.hook), r.cutLen ? f2(r.cutLen) : '', f2(r.len),
        ...(showDiaCols ? m.dias.map(d => (d === r.dia ? f2(r.len) : '')) : []), f2(r.kg)];
    }
    const shape = [r.a, r.b, r.c, r.d, r.hook].map(dim).map(v => v || '–').join(' · ');
    return [r.sn, label, r.dia ? 'Ø' + r.dia : '', `${r.noBar || 0} × ${r.no || 1}`, r.bars || '', shape, r.cutLen ? f2(r.cutLen) : '', f2(r.len), f2(r.kg)];
  });
  const totRow = land
    ? [{ content: 'TOTAL', colSpan: 5, styles: { halign: 'left' } }, m.totalBars, '', '', '', '', '', '', f2(m.totalLen), ...(showDiaCols ? m.byDia.map(g => f2(g.len)) : []), f2(m.totalKg)]
    : [{ content: 'TOTAL', colSpan: 4, styles: { halign: 'left' } }, m.totalBars, '', '', f2(m.totalLen), f2(m.totalKg)];
  const numFrom = land ? 3 : 3;
  const colStyles = land
    ? { 0: { cellWidth: 9, halign: 'center' }, 1: { cellWidth: 'auto', halign: 'left' }, 2: { cellWidth: 11 }, 12: { fontStyle: 'bold' } }
    : { 0: { cellWidth: 8, halign: 'center' }, 1: { cellWidth: 'auto', halign: 'left' }, 2: { cellWidth: 10 }, 5: { cellWidth: 36, halign: 'center' }, 7: { fontStyle: 'bold' } };
  colStyles[head.length - 1] = { fontStyle: 'bold', textColor: C.ACC2 };

  const footer = () => {
    font('normal', 7, C.FAINT);
    stroke(C.LINE, 0.2); doc.line(ML, ph - 10, pw - MR, ph - 10);
    doc.text(`Bar Bending Schedule${x.sheetNo ? ' · Sheet ' + x.sheetNo : ''}${x.project ? ' · ' + x.project : ''}`, ML, ph - 6);
  };
  doc.autoTable({
    startY: y, head: [head], body, foot: [totRow], theme: 'plain', showHead: 'everyPage', showFoot: 'lastPage',
    margin: { left: ML, right: MR, top: 16, bottom: 14 },
    styles: { font: F.sans, fontSize: land ? 7.6 : 7.4, cellPadding: { top: 2.1, bottom: 2.1, left: 1.6, right: 1.6 }, textColor: C.INK2, halign: 'right', valign: 'middle', lineColor: C.LINE, lineWidth: 0 },
    headStyles: { fillColor: C.HEAD, textColor: C.WHITE, fontStyle: 'bold', fontSize: land ? 7 : 6.8, halign: 'right', valign: 'middle', cellPadding: { top: 2.6, bottom: 2.6, left: 1.6, right: 1.6 } },
    footStyles: { fillColor: C.ACCBG, textColor: C.INK, fontStyle: 'bold', halign: 'right' },
    alternateRowStyles: { fillColor: C.ZEBRA },
    columnStyles: colStyles,
    didParseCell: d => {
      if (d.section === 'head' && (d.column.index <= 1)) d.cell.styles.halign = d.column.index === 0 ? 'center' : 'left';
      if (d.section === 'body' && d.column.index === 1 && d.cell.raw === 'do') d.cell.styles.textColor = C.FAINT;
      if (d.section === 'body' && d.column.index === 1 && d.cell.raw && d.cell.raw !== 'do') d.cell.styles.fontStyle = 'bold';
      if (d.section === 'body' && d.column.index === 2) { d.cell.styles.halign = 'center'; d.cell.styles.textColor = C.ACC2; d.cell.styles.fontStyle = 'bold'; }
      if (d.section === 'head' && d.column.index === 2) d.cell.styles.halign = 'center';
      if (d.column.index >= numFrom) d.cell.styles.font = F.sans;
    },
    didDrawCell: d => { if (d.section === 'body') { stroke(C.LINE, 0.15); doc.line(d.cell.x, d.cell.y + d.cell.height, d.cell.x + d.cell.width, d.cell.y + d.cell.height); } },
    didDrawPage: () => {
      const pg = doc.internal.getCurrentPageInfo().pageNumber;
      if (pg > startPage) {             // compact running header on continuation pages
        fill(C.ACC); doc.rect(0, 0, pw, 1.6, 'F');
        font('bold', 9, C.INK); doc.text(x.company.name, ML, 9);
        font('bold', 8, C.ACC); doc.text('BAR BENDING SCHEDULE' + (x.sheetNo ? ' · ' + x.sheetNo : ''), pw - MR, 9, { align: 'right' });
      }
      footer();
    },
  });
  y = doc.lastAutoTable.finalY + 7;

  // ── Summary by diameter + total weight ──
  const sumH = 12 + (m.byDia.length + 1) * 6.4 + 4;
  if (y + sumH + 30 > ph - 14) { doc.addPage('a4', land ? 'landscape' : 'portrait'); y = 18; footer(); }
  const sw = land ? 150 : W;
  font('bold', 10, C.INK); doc.text('Steel summary by diameter', ML, y + 3);
  doc.autoTable({
    startY: y + 6, margin: { left: ML, right: land ? pw - ML - sw : MR, bottom: 14 }, theme: 'plain', tableWidth: sw,
    head: [['Dia', 'Total bars', 'Length (m)', 'kg / m', 'Weight (kg)', 'Weight (MT)']],
    body: m.byDia.map(g => ['Ø' + g.dia + ' mm', g.bars.toLocaleString('en-IN'), f2(g.len), g.kgm.toFixed(3), f2(g.kg), f3(g.kg / 1000)]),
    foot: [['Total', m.totalBars.toLocaleString('en-IN'), f2(m.totalLen), '', f2(m.totalKg), f3(m.totalMt)]],
    styles: { font: F.sans, fontSize: 8, cellPadding: 2, textColor: C.INK2, halign: 'right' },
    headStyles: { fillColor: C.PANEL, textColor: C.MUTE, fontStyle: 'bold', fontSize: 7 },
    footStyles: { fillColor: C.ACCBG, textColor: C.ACC2, fontStyle: 'bold' },
    columnStyles: { 0: { halign: 'left', fontStyle: 'bold', textColor: C.INK } },
    didDrawCell: d => { if (d.section === 'body') { stroke(C.LINE, 0.15); doc.line(d.cell.x, d.cell.y + d.cell.height, d.cell.x + d.cell.width, d.cell.y + d.cell.height); } },
    didParseCell: d => { if (d.column.index === 0) d.cell.styles.halign = 'left'; },
    didDrawPage: () => footer(),
  });
  // Total weight callout beside the summary (landscape) or below it (portrait)
  const sumEnd = doc.lastAutoTable.finalY;
  const bx = land ? ML + sw + 8 : ML, by = land ? y + 6 : sumEnd + 5, bw = land ? W - sw - 8 : W, bh = 26;
  fill(C.HEAD); doc.roundedRect(bx, by, bw, bh, 3, 3, 'F');
  font('bold', 7, C.CALLMUTE); doc.text('TOTAL STEEL WEIGHT', bx + 6, by + 7);
  font('bold', 18, C.WHITE); doc.text(f2(m.totalKg) + ' kg', bx + 6, by + 16.5);
  font('normal', 8.5, C.CALLACC); doc.text(f3(m.totalMt) + ' MT  ·  ' + m.dias.map(d => 'Ø' + d).join(', ') + '  ·  ' + m.rows.length + ' lines', bx + 6, by + 22.5);
  y = Math.max(sumEnd, by + bh) + 12;

  // ── Sign-off ──
  if (y + 18 > ph - 14) { doc.addPage('a4', land ? 'landscape' : 'portrait'); y = 30; footer(); }
  const sgW = (W - 2 * 10) / 3;
  ['Prepared by', 'Checked by', 'Approved by'].forEach((l, i) => {
    const sx = ML + i * (sgW + 10);
    stroke(C.FAINT, 0.3); doc.line(sx, y + 8, sx + sgW, y + 8);
    font('bold', 8, C.INK2); doc.text(l, sx, y + 12.5);
    font('normal', 7, C.FAINT); doc.text('Name, signature & date', sx, y + 16);
  });

  // Page totals ("Page x of y") for the schedule's own pages
  const endPage = doc.internal.getNumberOfPages();
  for (let p = startPage; p <= endPage; p++) {
    doc.setPage(p);
    font('normal', 7, C.FAINT); doc.text(`Page ${p - startPage + 1} of ${endPage - startPage + 1}`, pw - MR, ph - 6, { align: 'right' });
  }
  doc.setPage(endPage);
  return m;
}

/** Stand-alone Bar Bending Schedule PDF for a measurement sheet. */
export async function exportBbsPdf(sheetId, orientation = 'landscape') {
  try {
    if (!window.jspdf?.jsPDF) return showToast('PDF library not loaded — refresh', 'error');
    const s = (state.sheets || []).find(x => x.id === (sheetId || state.currentSheetId));
    if (!s) return showToast('Sheet not found', 'error');
    const rows = (state.bbsData || {})[s.id] || [];
    if (!bbsRowsOf(rows).length) return showToast('This sheet has no bar bending schedule yet', 'info');
    const land = orientation !== 'portrait';
    const doc = newColorDoc(land ? 'landscape' : 'portrait');
    const F = { sans: 'helvetica' };
    const fonts = await loadFontFiles(['NotoSans-Regular.ttf', 'NotoSans-Bold.ttf']);
    if (fonts) {
      try {
        doc.addFileToVFS('NotoSans-Regular.ttf', fonts['NotoSans-Regular.ttf']); doc.addFont('NotoSans-Regular.ttf', 'BBSSans', 'normal');
        doc.addFileToVFS('NotoSans-Bold.ttf', fonts['NotoSans-Bold.ttf']); doc.addFont('NotoSans-Bold.ttf', 'BBSSans', 'bold');
        F.sans = 'BBSSans';
      } catch (e) { console.warn('[BBS PDF] font registration failed — Helvetica', e); }
    }
    renderBbs(doc, F, { sheet: s, rows, orientation: land ? 'landscape' : 'portrait', firstPage: true });
    mobileSavePDF(doc, `BBS_${(s.sheetNum || 'Sheet').replace(/[\\/]/g, '-')}_${land ? 'Landscape' : 'Portrait'}.pdf`);
    showToast('Bar bending schedule downloaded', 'success');
  } catch (e) { console.error('BBS PDF failed:', e); showToast('PDF error: ' + (e.message || e), 'error'); }
}
if (typeof window !== 'undefined') window.exportBbsPdf = exportBbsPdf;
