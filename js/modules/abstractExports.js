/**
 * ═══════════════════════════════════════════════════════════
 * True Site Sync — Abstract / RA-Bill exporters
 * ═══════════════════════════════════════════════════════════
 * PDF + Excel generators for abstracts and RA bills. Extracted
 * from ui.js. Billing math lives in abstractCalc.js / sheetCalc.js;
 * this module only handles document layout/rendering.
 * ═══════════════════════════════════════════════════════════
 */

import { state } from './state.js';
import { showToast, getCompanyHeaderForPDF, getPdfCurrency, amountToWordsINR, mobileSavePDF, mobileSaveXLSX } from './utils.js';
const _simpleHeader = (doc, o) => (typeof window !== 'undefined' && window.getSimpleHeaderForPDF) ? window.getSimpleHeaderForPDF(doc, o) : getCompanyHeaderForPDF(doc);
import { formatNumber2 } from './format.js';
import { computeAbstractRows, lookupBoqItem } from './abstractCalc.js';
import { computeSheetPrevQtyMap, groupSheetEntries, sheetPrevQtyFor } from './sheetCalc.js';
import { BBS_UNIT_WEIGHTS } from './constants.js';

const _num2 = formatNumber2;

/** Parse a #rrggbb hex into [r,g,b]; falls back when invalid. */
function _rgb(hex, fallback) {
  const m = /^#?([0-9a-fA-F]{6})$/.exec(hex || '');
  if (!m) return fallback;
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function exportAbstractPDF(id) {
  try {
  const a = state.abstracts.find(x => x.id === id);
  if (!a) return showToast('Abstract not found', 'error');
  if (!window.jspdf || !window.jspdf.jsPDF) return showToast('PDF library not loaded — refresh the page', 'error');
  const c = state.clients.find(x => x.id === a.clientId);
  const proj = state.projects.find(p => p.id === a.projectId);
  const clientName = c?.name || proj?.clientName || a.clientName || '—';
  const projectName = c?.projectName || proj?.name || a.projectName || '—';
  const sym = getPdfCurrency().trim();

  const doc = new window.jspdf.jsPDF('portrait');
  const accent = _rgb(state.printSettings?.abstractColor, [30, 58, 138]);
  let nextY = _simpleHeader(doc);
  doc.setFontSize(13); doc.setFont("helvetica", "bold"); doc.setTextColor(accent[0], accent[1], accent[2]);
  doc.text("ABSTRACT OF MEASUREMENT (RA BILL)", 105, nextY, null, null, "center");
  nextY += 8;
  doc.setFontSize(9.5); doc.setFont("helvetica", "normal"); doc.setTextColor(60, 60, 60);
  doc.text(`Client: ${clientName} | Project: ${projectName}`, 14, nextY);
  doc.text(`Abstract No: ${a.abstractNum || '—'} | Date: ${a.date || '—'}`, 14, nextY + 6);
  doc.text(`Ref Sheet: ${a.sheetNum || '—'} | Area: ${a.area || '—'}`, 14, nextY + 12);
  let rows = [];
  (a.items || []).forEach((i, index) => rows.push([index + 1, i.code || '', i.desc || '', (i.qty || 0).toFixed(3), i.uom || '', _num2(i.rate), _num2(i.amount)]));
  doc.autoTable({ startY: nextY + 18, head: [['#', 'Item Code', 'Description', 'Qty', 'Unit', `Rate (${sym})`, `Amount (${sym})`]], body: rows, theme: 'grid', headStyles: { fillColor: accent, textColor: [255,255,255], fontSize: 8 }, styles: { fontSize: 8, cellPadding: 2, overflow: 'linebreak' }, columnStyles: { 0: { cellWidth: 10 }, 1: { cellWidth: 22 }, 2: { cellWidth: 60 }, 3: { halign: 'right', cellWidth: 18 }, 4: { cellWidth: 15 }, 5: { halign: 'right', cellWidth: 28 }, 6: { halign: 'right', cellWidth: 28 } } });
  let gtY = doc.lastAutoTable.finalY + 12;
  doc.setFontSize(12); doc.setFont("helvetica", "bold"); doc.setTextColor(accent[0], accent[1], accent[2]);
  doc.text(`Grand Total Amount: ${sym} ${_num2(a.totalAmount)}`, 14, gtY);
  doc.setFontSize(9); doc.setFont("helvetica", "italic"); doc.setTextColor(60, 60, 60);
  const words = doc.splitTextToSize(`Amount in Words: ${amountToWordsINR(a.totalAmount)}`, doc.internal.pageSize.width - 28);
  doc.text(words, 14, gtY + 7);
  mobileSavePDF(doc,`${a.abstractNum || 'Abstract'}.pdf`);
  } catch (err) {
    console.error('Abstract PDF failed:', err);
    showToast('PDF error: ' + (err && err.message ? err.message : err), 'error');
  }
}

export function exportDetailedAbstractPDF(id) {
  const a = state.abstracts.find(x => x.id === id);
  if (!a) return showToast('Abstract not found', 'error');
  const c = state.clients.find(x => x.id === a.clientId);
  const proj = state.projects.find(p => p.id === a.projectId);
  const cp = state.companyProfile || {};

  // Billing math (previous/this-bill/total qty + amounts) — shared, tested.
  const { rows: calcRows, totals } = computeAbstractRows(a, state.abstracts, proj);
  const { grandPreAmt, grandThisAmt, grandTotalAmt } = totals;

  const doc = new window.jspdf.jsPDF('portrait');
  const accent = _rgb(state.printSettings?.abstractColor, [30, 58, 138]);
  let y = _simpleHeader(doc);
  const pw = doc.internal.pageSize.width;

  // Title
  doc.setFontSize(12); doc.setFont('helvetica', 'bold'); doc.setTextColor(accent[0], accent[1], accent[2]);
  doc.text('DETAILED ABSTRACT OF MEASUREMENT', pw / 2, y + 5, null, null, 'center');
  y += 10;

  // Project info
  doc.setFontSize(8); doc.setFont('helvetica', 'normal'); doc.setTextColor(60);
  const info = [
    `Name of Work: ${proj?.description || proj?.name || '—'}`,
    `Contractor: ${c?.name || '—'}  |  Abstract: ${a.abstractNum}  |  Date: ${a.date}`,
    `Ref Sheet: ${a.sheetNum}  |  Area: ${a.area || 'N/A'}`
  ];
  info.forEach(line => { doc.text(line, 10, y + 4); y += 4.5; });
  y += 2;

  // Table with BOQ/PO Qty column (use Rs. — jsPDF can't render ₹)
  const sym = getPdfCurrency().trim();
  const head = [['Sr\nNo.', 'Item\nNo.', 'Description', 'UOM', 'BOQ/PO\nQty.', 'Pre.\nQty.', 'This Bill\nQty.', 'Total\nQty.', `Rate\n(${sym})`, `Pre.\nAmt (${sym})`, `This Bill\nAmt (${sym})`, `TOTAL\nAmt (${sym})`]];
  const rows = [];
  calcRows.forEach(rw => {
    rows.push([
      rw.srNo,
      rw.code || '-',
      rw.desc || '-',
      rw.uom || '-',
      rw.boqQty ? rw.boqQty.toFixed(3) : '-',
      rw.prevQty.toFixed(3),
      rw.thisBillQty.toFixed(3),
      rw.totalQty.toFixed(3),
      _num2(rw.rate),
      _num2(rw.preAmt),
      _num2(rw.thisAmt),
      _num2(rw.totalAmt)
    ]);
  });

  // Grand total row
  rows.push([
    '', '', { content: 'GRAND TOTAL', styles: { fontStyle: 'bold', halign: 'right' } }, '',
    '', '', '', '', '',
    { content: _num2(grandPreAmt), styles: { fontStyle: 'bold' } },
    { content: _num2(grandThisAmt), styles: { fontStyle: 'bold' } },
    { content: _num2(grandTotalAmt), styles: { fontStyle: 'bold' } }
  ]);

  doc.autoTable({
    startY: y,
    head,
    body: rows,
    theme: 'grid',
    margin: { left: 4, right: 4 },
    headStyles: { fillColor: accent, textColor: [255, 255, 255], fontSize: 5, fontStyle: 'bold', halign: 'center', lineWidth: 0.2, lineColor: [0, 0, 0], cellPadding: 0.8 },
    styles: { fontSize: 5, cellPadding: 0.8, lineWidth: 0.15, lineColor: [0, 0, 0], overflow: 'linebreak' },
    columnStyles: {
      0: { halign: 'center', cellWidth: 8 },
      1: { halign: 'center', cellWidth: 12 },
      2: { cellWidth: 'auto', overflow: 'linebreak' },
      3: { halign: 'center', cellWidth: 9 },
      4: { halign: 'right', cellWidth: 15 },
      5: { halign: 'right', cellWidth: 15 },
      6: { halign: 'right', cellWidth: 15 },
      7: { halign: 'right', cellWidth: 15 },
      8: { halign: 'right', cellWidth: 17 },
      9: { halign: 'right', cellWidth: 17 },
      10: { halign: 'right', cellWidth: 17 },
      11: { halign: 'right', fontStyle: 'bold', cellWidth: 17 }
    }
  });

  // Amount in words
  const wordsY = doc.lastAutoTable.finalY + 7;
  doc.setFontSize(8); doc.setFont('helvetica', 'italic'); doc.setTextColor(40);
  const dWords = doc.splitTextToSize(`Amount in Words: ${amountToWordsINR(grandTotalAmt)}`, pw - 8);
  doc.text(dWords, 4, wordsY);

  // Signature area
  const finalY = wordsY + dWords.length * 4 + 12;
  doc.setFontSize(7); doc.setFont('helvetica', 'normal'); doc.setTextColor(0);
  doc.text('Prepared By', 25, finalY); doc.line(15, finalY + 2, 55, finalY + 2);
  doc.text('Checked By', pw / 2 - 15, finalY); doc.line(pw / 2 - 25, finalY + 2, pw / 2 + 15, finalY + 2);
  doc.text('Approved By', pw - 40, finalY); doc.line(pw - 50, finalY + 2, pw - 10, finalY + 2);

  mobileSavePDF(doc,`Detailed_${a.abstractNum}.pdf`);
}

export function exportDetailedAbstractExcel(id) {
  const XLSX = window.XLSX;
  if (!XLSX) return showToast('SheetJS library not loaded', 'error');
  const a = state.abstracts.find(x => x.id === id);
  if (!a) return showToast('Abstract not found', 'error');
  const c = state.clients.find(x => x.id === a.clientId);
  const proj = state.projects.find(p => p.id === a.projectId);
  const cp = state.companyProfile || {};

  // Billing math (previous/this-bill/total qty + amounts) — shared, tested.
  const { rows: calcRows, totals } = computeAbstractRows(a, state.abstracts, proj);
  const { grandPreAmt, grandThisAmt, grandTotalAmt } = totals;

  const rows = [];
  const merges = [];
  let r = 0;
  const lastCol = 11;

  // Header rows
  rows.push([cp.CompanyName || 'DETAILED ABSTRACT']);
  merges.push({ s: { r, c: 0 }, e: { r, c: lastCol } }); r++;
  rows.push(['DETAILED ABSTRACT OF MEASUREMENT']);
  merges.push({ s: { r, c: 0 }, e: { r, c: lastCol } }); r++;
  rows.push([`Name of Work: ${proj?.description || proj?.name || '—'}`]);
  merges.push({ s: { r, c: 0 }, e: { r, c: lastCol } }); r++;
  rows.push([`Contractor: ${c?.name || '—'}  |  Abstract: ${a.abstractNum}  |  Date: ${a.date}`]);
  merges.push({ s: { r, c: 0 }, e: { r, c: lastCol } }); r++;
  rows.push([`Ref Sheet: ${a.sheetNum}  |  Area: ${a.area || 'N/A'}`]);
  merges.push({ s: { r, c: 0 }, e: { r, c: lastCol } }); r++;
  rows.push([]); r++;

  // Column headers
  rows.push(['Sr No.', 'Item No.', 'Description', 'UOM', 'BOQ/PO Qty.', 'Pre. Qty.', 'This Bill Qty.', 'Total Qty.', 'Rate', 'Pre. Amount', 'This Bill Amount', 'TOTAL Amount']);
  const headerRow = r; r++;

  calcRows.forEach(rw => {
    rows.push([rw.srNo, rw.code || '-', rw.desc || rw.code || '-', rw.uom || '-',
      rw.boqQty || '-', rw.prevQty, rw.thisBillQty, rw.totalQty, rw.rate, rw.preAmt, rw.thisAmt, rw.totalAmt]);
    r++;
  });

  // Grand total row
  rows.push(['', '', 'GRAND TOTAL', '', '', '', '', '', '', grandPreAmt, grandThisAmt, grandTotalAmt]);
  const totalRow = r; r++;

  // Signature row
  rows.push([]); r++;
  rows.push(['Prepared By', '', '', '', 'Checked By', '', '', '', 'Approved By']);
  r++;

  // Build workbook
  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws['!merges'] = merges;
  ws['!cols'] = [
    { wch: 6 }, { wch: 14 }, { wch: 30 }, { wch: 6 },
    { wch: 12 }, { wch: 12 }, { wch: 14 }, { wch: 12 },
    { wch: 12 }, { wch: 14 }, { wch: 16 }, { wch: 16 }
  ];

  // Style header rows
  for (let i = 0; i < 5; i++) {
    const cell = ws[XLSX.utils.encode_cell({ r: i, c: 0 })];
    if (cell) { cell.s = { font: { bold: true, sz: i === 0 ? 14 : 10 }, alignment: { horizontal: 'center' } }; }
  }
  // Style column header row
  for (let col = 0; col <= lastCol; col++) {
    const cell = ws[XLSX.utils.encode_cell({ r: headerRow, c: col })];
    if (cell) { cell.s = { font: { bold: true, sz: 9 }, fill: { fgColor: { rgb: 'FFD700' } }, alignment: { horizontal: 'center', wrapText: true }, border: { top: { style: 'thin' }, bottom: { style: 'thin' }, left: { style: 'thin' }, right: { style: 'thin' } } }; }
  }
  // Style total row
  for (let col = 0; col <= lastCol; col++) {
    const cell = ws[XLSX.utils.encode_cell({ r: totalRow, c: col })];
    if (cell) { cell.s = { font: { bold: true }, border: { top: { style: 'double' }, bottom: { style: 'double' } } }; }
  }

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Detailed Abstract');
  mobileSaveXLSX(wb, `Detailed_${a.abstractNum}.xlsx`);
}

export function exportRABillExcel(abstractId) {
  const XLSX = window.XLSX;
  if (!XLSX) return showToast('SheetJS library not loaded', 'error');
  const a = state.abstracts.find(x => x.id === abstractId);
  if (!a) return showToast('Abstract not found', 'error');
  const s = state.sheets.find(x => x.id === a.sheetId);
  if (!s) return showToast('Linked measurement sheet not found', 'error');
  const c = state.clients.find(x => x.id === a.clientId);
  const proj = state.projects.find(p => p.id === a.projectId);
  const boqItems = proj?.boqItems || [];
  const cp = state.companyProfile || {};
  const raBillLabel = s.raBillNum ? s.raBillNum + ' RA BILL' : 'RA BILL';

  // Previous-bill quantities + entry grouping — shared, tested (sheetCalc.js)
  const prevQtyMap = computeSheetPrevQtyMap(s, state.sheets);
  const groupedEntries = groupSheetEntries(s.entries);

  // ============ SHEET 1: MEASUREMENT ============
  const cc = s.customColumns || [];
  const totalCols = 7 + cc.length;
  const lastCol = totalCols - 1;
  const mesRows = [];
  const mesMerges = [];
  let mr = 0;

  mesRows.push([cp.CompanyName || proj?.clientName || 'MEASUREMENT BOOK']);
  mesMerges.push({ s: { r: mr, c: 0 }, e: { r: mr, c: lastCol } }); mr++;
  mesRows.push(['MEASUREMENT BOOK']);
  mesMerges.push({ s: { r: mr, c: 0 }, e: { r: mr, c: lastCol } }); mr++;
  mesRows.push([raBillLabel]);
  mesMerges.push({ s: { r: mr, c: 0 }, e: { r: mr, c: lastCol } }); mr++;
  mesRows.push(['Name of Work :- ' + (proj?.description || proj?.name || '—')]);
  mesMerges.push({ s: { r: mr, c: 0 }, e: { r: mr, c: lastCol } }); mr++;
  mesRows.push(['Name of Contractor :- ' + (c?.name || proj?.clientName || '—')]);
  mesMerges.push({ s: { r: mr, c: 0 }, e: { r: mr, c: lastCol } }); mr++;
  mesRows.push(['Name of Authority :- ' + (state.printSettings?.authorityName || cp.CompanyName || '—')]);
  mesMerges.push({ s: { r: mr, c: 0 }, e: { r: mr, c: lastCol } }); mr++;

  const baseHeaders = ['Sr. No.', 'Description', 'Nos.', 'Length', 'Breadth', 'Height', 'Total'];
  mesRows.push([...baseHeaders, ...cc.map(col => col.name)]);
  mr++;

  let itemNum = 0;
  Object.keys(groupedEntries).forEach(key => {
    const entries = groupedEntries[key];
    const firstEntry = entries[0];
    const boqItem = lookupBoqItem(proj, firstEntry.boqIndex);
    itemNum++;

    const tenderQty = boqItem?.qty || 0;
    const tenderRate = boqItem?.rate || 0;
    const unit = firstEntry.uom || boqItem?.unit || '';
    const descText = firstEntry.description || firstEntry.code || '—';

    const tenderRow = new Array(totalCols).fill('');
    tenderRow[0] = itemNum; tenderRow[1] = descText;
    tenderRow[4] = 'Tender Qty in ' + unit; tenderRow[6] = tenderQty;
    mesRows.push(tenderRow); mr++;
    const rateRow = new Array(totalCols).fill('');
    rateRow[4] = 'Tender Rate'; rateRow[6] = tenderRate;
    mesRows.push(rateRow); mr++;

    let thisBillQty = 0;
    entries.forEach(e => {
      const row = ['', e.remarks || '', e.nos || '', e.l || '', e.b || '', e.h || '', e.qty || 0];
      cc.forEach(col => row.push(e.customData?.[col.id] || ''));
      mesRows.push(row); thisBillQty += (e.qty || 0); mr++;
    });

    const prevQty = sheetPrevQtyFor(prevQtyMap, key, firstEntry);
    const totalDoneQty = prevQty + thisBillQty;
    const sumRow1 = new Array(totalCols).fill(''); sumRow1[4] = 'This Bill Qty in ' + unit; sumRow1[6] = thisBillQty;
    mesRows.push(sumRow1); mr++;
    const sumRow2 = new Array(totalCols).fill(''); sumRow2[4] = 'Previous Bill Qty'; sumRow2[6] = prevQty;
    mesRows.push(sumRow2); mr++;
    const sumRow3 = new Array(totalCols).fill(''); sumRow3[4] = 'Total Done Qty in ' + unit; sumRow3[6] = totalDoneQty;
    mesRows.push(sumRow3); mr++;
    mesRows.push([]); mr++;
  });

  const mesWs = XLSX.utils.aoa_to_sheet(mesRows);
  mesWs['!merges'] = mesMerges;
  const mesColWidths = [{ wch: 8 }, { wch: 35 }, { wch: 8 }, { wch: 10 }, { wch: 18 }, { wch: 10 }, { wch: 14 }];
  cc.forEach(() => mesColWidths.push({ wch: 14 }));
  mesWs['!cols'] = mesColWidths;

  // ============ SHEET 2: BBS (if exists) ============
  const bbs = state.bbsData[s.id];
  let bbsWs = null;
  if (bbs && bbs.length) {
    const bbsRows = [];
    const bbsMerges = [];
    let br = 0;
    const diaCols = [8, 10, 12, 16, 20];
    const totalCols = 18;

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

    bbsRows.push(['', 'Total RM', '', '', '', '', '', '', '', '', '', '', '', ...diaCols.map(d => diaTotals[d] || 0)]); br++;
    bbsRows.push(['', 'KG/RM', '', '', '', '', '', '', '', '', '', '', '', ...diaCols.map(d => BBS_UNIT_WEIGHTS[d] || 0)]); br++;
    const wtPerDia = diaCols.map(d => diaTotals[d] * (BBS_UNIT_WEIGHTS[d] || 0));
    bbsRows.push(['', 'Total KG per Dia', '', '', '', '', '', '', '', '', '', '', '', ...wtPerDia]); br++;
    const grandKG = wtPerDia.reduce((a, b) => a + b, 0);
    bbsRows.push(['', 'Total Weight (KG)', '', '', '', '', '', '', '', '', '', '', '', grandKG]);
    bbsMerges.push({ s: { r: br, c: 13 }, e: { r: br, c: totalCols - 1 } }); br++;
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

  // ============ SHEET 3: ABSTRACT ============
  const absRows = [];
  const absMerges = [];
  let ar = 0;

  absRows.push([cp.CompanyName || 'ABSTRACT SHEET']);
  absMerges.push({ s: { r: ar, c: 0 }, e: { r: ar, c: 11 } }); ar++;
  absRows.push(['DETAILED ABSTRACT OF MEASUREMENT']);
  absMerges.push({ s: { r: ar, c: 0 }, e: { r: ar, c: 11 } }); ar++;
  absRows.push([raBillLabel]);
  absMerges.push({ s: { r: ar, c: 0 }, e: { r: ar, c: 11 } }); ar++;
  absRows.push(['Name of Work :- ' + (proj?.description || proj?.name || '—')]);
  absMerges.push({ s: { r: ar, c: 0 }, e: { r: ar, c: 11 } }); ar++;
  absRows.push(['Name of Contractor :- ' + (c?.name || proj?.clientName || '—')]);
  absMerges.push({ s: { r: ar, c: 0 }, e: { r: ar, c: 11 } }); ar++;
  absRows.push(['Name of Authority :- ' + (state.printSettings?.authorityName || cp.CompanyName || '—')]);
  absMerges.push({ s: { r: ar, c: 0 }, e: { r: ar, c: 11 } }); ar++;
  absRows.push([]); ar++;

  absRows.push(['Sr No.', 'Item No.', 'Description', 'UOM', 'BOQ/PO Qty.', 'Pre. Qty.', 'This Bill Qty.', 'Total Qty.', 'Rate', 'Pre. Amount', 'This Bill Amount', 'TOTAL Amount']);
  ar++;

  // Billing math (previous/this-bill/total qty + amounts) — shared, tested.
  const { rows: absCalcRows, totals: absTotals } = computeAbstractRows(a, state.abstracts, proj);
  const { grandPreAmt, grandThisAmt, grandTotalAmt } = absTotals;
  absCalcRows.forEach(rw => {
    absRows.push([rw.srNo, rw.code || '-', rw.desc || rw.code || '-', rw.uom || '-',
      rw.boqQty || '-', rw.prevQty, rw.thisBillQty, rw.totalQty, rw.rate, rw.preAmt, rw.thisAmt, rw.totalAmt]);
    ar++;
  });

  absRows.push(['', '', 'GRAND TOTAL', '', '', '', '', '', '', grandPreAmt, grandThisAmt, grandTotalAmt]);
  ar++;
  absRows.push([]); ar++;
  absRows.push(['Prepared By', '', '', '', 'Checked By', '', '', '', 'Approved By']);

  const absWs = XLSX.utils.aoa_to_sheet(absRows);
  absWs['!merges'] = absMerges;
  absWs['!cols'] = [{ wch: 6 }, { wch: 14 }, { wch: 30 }, { wch: 6 }, { wch: 12 }, { wch: 12 }, { wch: 14 }, { wch: 12 }, { wch: 12 }, { wch: 14 }, { wch: 16 }, { wch: 16 }];

  // ============ CREATE WORKBOOK ============
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, mesWs, 'RA Measurement');
  if (bbsWs) XLSX.utils.book_append_sheet(wb, bbsWs, 'BBS');
  XLSX.utils.book_append_sheet(wb, absWs, 'Abstract');
  mobileSaveXLSX(wb, `RA_Bill_${a.abstractNum}_${a.date}.xlsx`);
  showToast('RA Bill Excel exported', 'success');
}
