/**
 * ═══════════════════════════════════════════════════════════════════════════
 * True Site Sync — GST Tax-Invoice designs (Rule 46, CGST Rules)
 * ───────────────────────────────────────────────────────────────────────────
 * FIVE visually distinct, client-ready invoice layouts sharing ONE compliant
 * data model, so the mandatory fields are always present while the presentation
 * changes completely between designs:
 *
 *   classic  — Corporate Classic  : serif letterhead, navy + gold, ruled table
 *   modern   — Modern Band        : full-width brand band, soft totals card
 *   sidebar  — Left Sidebar       : coloured vertical panel (logo/contact/bank)
 *   minimal  — Minimal Mono       : whitespace, hairlines, tracked caps
 *   accent   — Accent Brand       : brand bars, zebra rows, solid total card
 *
 * Mandatory (Rule 46) fields in every design: supplier name/address/GSTIN/state
 * code, invoice no.+date, recipient+GSTIN, place of supply, HSN/SAC, description,
 * qty+unit, rate, taxable value, CGST/SGST or IGST break-up, total, amount in
 * words, signature, reverse-charge note.
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { state } from './state.js';
import { getPdfCurrency, mobileSavePDF, showToast } from './utils.js';
import { formatNumber2, amountToWordsINR } from './format.js';

const _n2 = formatNumber2;
const _intStr = (n) => _n2(n).replace(/\.00$/, '');

function _rgb(hex, fallback) {
  const m = /^#?([0-9a-fA-F]{6})$/.exec(hex || '');
  if (!m) return fallback;
  const v = parseInt(m[1], 16);
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
}
const _tint = (rgb, f) => rgb.map(ch => Math.round(ch + (255 - ch) * f));
const _shade = (rgb, f) => rgb.map(ch => Math.round(ch * (1 - f)));

const STYLES = {
  classic: { name: 'Corporate Classic', accent: [23, 43, 84],  gold: [176, 141, 62] },
  modern:  { name: 'Modern Band',       accent: [37, 99, 235] },
  sidebar: { name: 'Left Sidebar',      accent: [15, 118, 110] },
  minimal: { name: 'Minimal Mono',      accent: [17, 24, 39] },
  accent:  { name: 'Accent Brand',      accent: [220, 38, 38] },
};
export function invoiceDesignName(key) { return (STYLES[key] || {}).name || 'Standard'; }
export function invoiceDesignKeys() { return Object.keys(STYLES); }

// ── Compliant data model (single source of truth) ───────────────────────────
function _prep(inv) {
  const cp = state.companyProfile || {};
  const c = (state.clients || []).find(x => x.id === inv.clientId) || {};
  const scode = (g) => (g && /^\d{2}/.test(g)) ? g.slice(0, 2) : '';
  const items = (inv.items || []).map((it, i) => {
    const amount = parseFloat(it.amount) || 0, tax = parseFloat(it.taxAmount) || 0;
    const taxable = amount - tax;
    const type = it.taxType || (tax > 0 ? 'CGST_SGST' : 'NONE');
    const pct = parseFloat(it.taxPct) || 0;
    return {
      sr: i + 1, desc: it.desc || '', hsn: it.hsn || '', qty: parseFloat(it.qty) || 0,
      unit: it.unit || '', rate: parseFloat(it.rate) || 0, taxable, tax, pct, type,
      cgst: type === 'CGST_SGST' ? tax / 2 : 0, sgst: type === 'CGST_SGST' ? tax / 2 : 0,
      igst: type === 'IGST' ? tax : 0, total: amount,
    };
  });
  const sum = f => items.reduce((s, it) => s + f(it), 0);
  const totals = { qty: sum(i => i.qty), taxable: sum(i => i.taxable), cgst: sum(i => i.cgst), sgst: sum(i => i.sgst), igst: sum(i => i.igst), tax: sum(i => i.tax), gross: sum(i => i.total) };
  const inter = totals.igst > 0.005;
  const groups = {};
  items.forEach(it => { const k = it.hsn || '-'; (groups[k] = groups[k] || { hsn: k, taxable: 0, cgst: 0, sgst: 0, igst: 0, pct: it.pct }); groups[k].taxable += it.taxable; groups[k].cgst += it.cgst; groups[k].sgst += it.sgst; groups[k].igst += it.igst; });
  return {
    cp, c, items, totals, inter, hsnGroups: Object.values(groups),
    supplier: { name: cp.CompanyName || 'Your Company', address: cp.Address || '', gstin: cp.GST || '', stateCode: scode(cp.GST), phone: cp.Phone || '', email: cp.Email || '', bankName: cp.BankName || '', bankAcc: cp.BankAcc || '', ifsc: cp.IFSC || '', logo: cp.logo || '' },
    recipient: { name: c.name || inv.clientName || '—', address: c.address || inv.clientAddress || '', gstin: c.gst || '', state: inv.stateOfSupply || '' },
    meta: { no: inv.invoiceNo || '', date: inv.date || '', placeOfSupply: inv.stateOfSupply || '', poNo: inv.poNo || '', poDate: inv.poDate || '', reverseCharge: inv.reverseCharge === 'Yes', tcs: parseFloat(inv.tcsAmount) || 0, roundAmt: parseFloat(inv.roundAmt) || 0, grand: parseFloat(inv.total) || totals.gross, words: amountToWordsINR(parseFloat(inv.total) || totals.gross), notes: inv.notes || '' },
  };
}

// ── Public dispatch ─────────────────────────────────────────────────────────
export function renderStyledInvoice(inv, styleKey) {
  try {
    if (!window.jspdf || !window.jspdf.jsPDF) return showToast('PDF library not loaded — refresh', 'error');
    const st = { ...(STYLES[styleKey] || STYLES.classic) };
    if (styleKey === 'accent') st.accent = _rgb(state.printSettings?.invoiceColor, st.accent);
    const d = _prep(inv);
    const doc = new window.jspdf.jsPDF('p', 'mm', 'a4');
    const cur = (getPdfCurrency() || 'Rs.').trim();
    const ctx = { doc, d, st, cur, pw: doc.internal.pageSize.getWidth(), ph: doc.internal.pageSize.getHeight() };
    ({ classic: _classic, modern: _modern, sidebar: _sidebar, minimal: _minimal, accent: _accent }[styleKey] || _classic)(ctx);
    mobileSavePDF(doc, (d.meta.no || 'Invoice').replace(/[\\/]/g, '-') + '.pdf');
    showToast('Invoice PDF downloaded (' + st.name + ')');
  } catch (err) {
    console.error('Invoice PDF failed:', err);
    showToast('PDF error: ' + (err && err.message ? err.message : err), 'error');
  }
}

// ── Shared building blocks ───────────────────────────────────────────────────
function _supplierMeta(d) {
  return [d.supplier.gstin && ('GSTIN ' + d.supplier.gstin + (d.supplier.stateCode ? '   ·   State Code ' + d.supplier.stateCode : ''))].filter(Boolean);
}
function _lineTableData(d) {
  const head = [['#', 'Description', 'Qty', `Rate`, 'Taxable', 'GST', 'Amount']];
  const body = d.items.map(it => [
    String(it.sr),
    it.desc + (it.hsn ? `\nHSN/SAC: ${it.hsn}` : ''),
    _intStr(it.qty) + (it.unit ? ' ' + it.unit : ''),
    _n2(it.rate), _n2(it.taxable),
    _n2(it.tax) + (it.pct ? `  ${it.pct}%` : ''),
    _n2(it.total),
  ]);
  const foot = [['', 'Total', _intStr(d.totals.qty), '', _n2(d.totals.taxable), _n2(d.totals.tax), _n2(d.totals.gross)]];
  return { head, body, foot };
}
const _lineCols = () => ({ 0: { cellWidth: 7, halign: 'center' }, 1: { cellWidth: 'auto', minCellWidth: 30 }, 2: { cellWidth: 15, halign: 'right' }, 3: { cellWidth: 18, halign: 'right' }, 4: { cellWidth: 20, halign: 'right' }, 5: { cellWidth: 18, halign: 'right' }, 6: { cellWidth: 20, halign: 'right' } });
function _totalRows(d, cur) {
  const r = [['Taxable Value', cur + ' ' + _n2(d.totals.taxable)]];
  if (d.totals.cgst) r.push(['CGST', cur + ' ' + _n2(d.totals.cgst)]);
  if (d.totals.sgst) r.push(['SGST', cur + ' ' + _n2(d.totals.sgst)]);
  if (d.totals.igst) r.push(['IGST', cur + ' ' + _n2(d.totals.igst)]);
  if (d.meta.tcs) r.push(['TCS', cur + ' ' + _n2(d.meta.tcs)]);
  if (d.meta.roundAmt) r.push(['Round Off', (d.meta.roundAmt < 0 ? '- ' : '+ ') + cur + ' ' + _n2(Math.abs(d.meta.roundAmt))]);
  return r;
}
function _taxSummary(doc, d, x, y, w, accent) {
  const inter = d.inter;
  const head = inter ? [['HSN/SAC', 'Taxable', 'IGST %', 'IGST', 'Tax']] : [['HSN/SAC', 'Taxable', 'CGST', 'SGST', 'Tax']];
  const body = d.hsnGroups.map(g => inter
    ? [g.hsn, _n2(g.taxable), (g.pct ? g.pct + '%' : ''), _n2(g.igst), _n2(g.igst)]
    : [g.hsn, _n2(g.taxable), _n2(g.cgst), _n2(g.sgst), _n2(g.cgst + g.sgst)]);
  doc.autoTable({
    startY: y, head, body, theme: 'grid', tableWidth: w, margin: { left: x },
    headStyles: { fillColor: _tint(accent, 0.82), textColor: _shade(accent, 0.35), fontSize: 6.3, fontStyle: 'bold', halign: 'center', lineWidth: 0.1, lineColor: [225, 228, 233] },
    styles: { fontSize: 6.3, cellPadding: 1.1, halign: 'right', lineWidth: 0.1, lineColor: [230, 233, 238], textColor: [55, 62, 74] },
    columnStyles: { 0: { halign: 'left' } },
  });
  return doc.lastAutoTable.finalY;
}
function _rcNote(doc, d, x, y, align) {
  doc.setFont('helvetica', d.meta.reverseCharge ? 'bold' : 'normal'); doc.setFontSize(6.8);
  doc.setTextColor(d.meta.reverseCharge ? 180 : 130, d.meta.reverseCharge ? 30 : 130, d.meta.reverseCharge ? 30 : 130);
  doc.text('Reverse Charge: ' + (d.meta.reverseCharge ? 'YES' : 'No'), x, y, align ? { align } : undefined);
  doc.setTextColor(0, 0, 0);
}
function _footerLine(doc, pw, ph, text, col) {
  doc.setFont('helvetica', 'normal'); doc.setFontSize(6.6); doc.setTextColor(col[0], col[1], col[2]);
  doc.text(text, pw / 2, ph - 7, { align: 'center' }); doc.setTextColor(0, 0, 0);
}

// ═════════════════════════════════════════════════════════════════════════════
// 1) CORPORATE CLASSIC — serif letterhead, navy + gold, ruled
// ═════════════════════════════════════════════════════════════════════════════
function _classic(ctx) {
  const { doc, d, st, cur, pw, ph } = ctx; const ml = 16, mr = 16, A = st.accent, G = st.gold;
  let y = 16;
  if (d.supplier.logo) { try { doc.addImage(d.supplier.logo, 'PNG', ml, y, 20, 20); } catch {} }
  const tx = d.supplier.logo ? ml + 25 : ml;
  doc.setFont('times', 'bold'); doc.setFontSize(18); doc.setTextColor(A[0], A[1], A[2]);
  doc.text(d.supplier.name, tx, y + 7);
  doc.setFont('times', 'normal'); doc.setFontSize(9); doc.setTextColor(70, 76, 88);
  let sy = y + 12.5; doc.splitTextToSize(d.supplier.address, pw / 2).forEach(l => { doc.text(l, tx, sy); sy += 4.2; });
  [d.supplier.phone && ('Tel ' + d.supplier.phone), d.supplier.email].filter(Boolean).forEach(t => { doc.text(t, tx, sy); sy += 4.2; });
  _supplierMeta(d).forEach(t => { doc.setFont('times', 'bold'); doc.text(t, tx, sy); sy += 4.2; });
  // right title
  doc.setFont('times', 'bold'); doc.setFontSize(22); doc.setTextColor(A[0], A[1], A[2]);
  doc.text('TAX INVOICE', pw - mr, y + 8, { align: 'right' });
  doc.setDrawColor(G[0], G[1], G[2]); doc.setLineWidth(0.8); doc.line(pw - mr - 62, y + 11, pw - mr, y + 11);
  doc.setFont('times', 'normal'); doc.setFontSize(9); doc.setTextColor(50, 55, 66);
  let ry = y + 17;
  const rline = (l, v) => { if (!v) return; doc.setFont('times', 'bold'); doc.text(l, pw - mr - 40, ry); doc.setFont('times', 'normal'); doc.text(String(v), pw - mr, ry, { align: 'right' }); ry += 4.6; };
  rline('Invoice No', d.meta.no); rline('Date', d.meta.date); rline('PO No', d.meta.poNo);
  y = Math.max(sy, ry) + 3;
  doc.setDrawColor(A[0], A[1], A[2]); doc.setLineWidth(0.5); doc.line(ml, y, pw - mr, y); y += 6;

  // Parties
  doc.setFont('times', 'bold'); doc.setFontSize(9.5); doc.setTextColor(A[0], A[1], A[2]);
  doc.text('BILL TO', ml, y);
  doc.text('PLACE OF SUPPLY', pw / 2 + 4, y); y += 5;
  doc.setTextColor(20, 22, 28); doc.setFont('times', 'bold'); doc.setFontSize(11); doc.text(d.recipient.name, ml, y);
  doc.setFont('times', 'normal'); doc.setFontSize(10.5); doc.text(d.meta.placeOfSupply || '—', pw / 2 + 4, y); y += 5;
  doc.setFont('times', 'normal'); doc.setFontSize(9); doc.setTextColor(70, 76, 88);
  let by = y; if (d.recipient.address) doc.splitTextToSize(d.recipient.address, pw / 2 - 8).forEach(l => { doc.text(l, ml, by); by += 4.2; });
  if (d.recipient.gstin) { doc.setFont('times', 'bold'); doc.text('GSTIN ' + d.recipient.gstin, ml, by); by += 4.2; }
  _rcNote(doc, d, pw / 2 + 4, y + 1);
  y = by + 3;

  const t = _lineTableData(d);
  doc.autoTable({
    startY: y, head: t.head, body: t.body, foot: t.foot, theme: 'grid',
    headStyles: { fillColor: A, textColor: 255, fontSize: 8, fontStyle: 'bold', font: 'times', halign: 'center', lineColor: A, lineWidth: 0.1 },
    footStyles: { fillColor: _tint(A, 0.9), textColor: A, fontStyle: 'bold', font: 'times', fontSize: 8.5 },
    styles: { font: 'times', fontSize: 9, cellPadding: 2.2, lineColor: [214, 218, 226], lineWidth: 0.1, textColor: [30, 34, 42] },
    columnStyles: _lineCols(), margin: { left: ml, right: mr },
    didParseCell: (c) => { if (c.section === 'body' && c.column.index === 1 && c.cell.text.length > 1) { /* HSN second line lighter handled globally */ } },
  });
  y = doc.lastAutoTable.finalY + 5;
  _classicFooter(ctx, y, ml, mr, A, G, cur);
}
function _classicFooter(ctx, y, ml, mr, A, G, cur) {
  const { doc, d, pw, ph } = ctx;
  const ty0 = y; const boxW = 74, boxX = pw - mr - boxW;
  _taxSummary(doc, d, ml, y, pw / 2 - ml - 2, A);
  // totals box
  let ty = y; const rows = _totalRows(d, cur);
  doc.setDrawColor(A[0], A[1], A[2]); doc.setLineWidth(0.4);
  rows.forEach(([l, v]) => { doc.setFont('times', 'normal'); doc.setFontSize(9.5); doc.setTextColor(60, 65, 76); doc.text(l, boxX + 2, ty + 5); doc.text(v, pw - mr - 2, ty + 5, { align: 'right' }); ty += 5.5; });
  doc.setFillColor(A[0], A[1], A[2]); doc.rect(boxX, ty + 1, boxW, 9, 'F');
  doc.setFont('times', 'bold'); doc.setFontSize(11.5); doc.setTextColor(255, 255, 255);
  doc.text('Grand Total', boxX + 2, ty + 7); doc.text(cur + ' ' + _n2(d.meta.grand), pw - mr - 2, ty + 7, { align: 'right' });
  doc.setTextColor(0, 0, 0);
  let yy = Math.max(doc.lastAutoTable.finalY, ty + 12) + 6;
  // words
  doc.setFont('times', 'bold'); doc.setFontSize(9); doc.setTextColor(A[0], A[1], A[2]); doc.text('Amount in Words', ml, yy); yy += 4.5;
  doc.setFont('times', 'italic'); doc.setTextColor(40, 44, 52);
  doc.splitTextToSize(d.meta.words, pw - ml - mr).forEach(l => { doc.text(l, ml, yy); yy += 4.4; }); yy += 3;
  _bankSign(ctx, yy, ml, mr, A, 'times');
  doc.setDrawColor(G[0], G[1], G[2]); doc.setLineWidth(0.8); doc.line(ml, ph - 12, pw - mr, ph - 12);
  _footerLine(doc, pw, ph, 'Original for Recipient   ·   Duplicate for Supplier   ·   Triplicate for Transporter', [120, 125, 135]);
}

// ═════════════════════════════════════════════════════════════════════════════
// 2) MODERN BAND — full-width brand band, soft totals card
// ═════════════════════════════════════════════════════════════════════════════
function _modern(ctx) {
  const { doc, d, st, cur, pw, ph } = ctx; const ml = 16, mr = 16, A = st.accent;
  doc.setFillColor(A[0], A[1], A[2]); doc.rect(0, 0, pw, 34, 'F');
  if (d.supplier.logo) { try { doc.setFillColor(255, 255, 255); doc.roundedRect(ml, 7, 20, 20, 2, 2, 'F'); doc.addImage(d.supplier.logo, 'PNG', ml + 1.5, 8.5, 17, 17); } catch {} }
  const tx = d.supplier.logo ? ml + 25 : ml;
  doc.setFont('helvetica', 'bold'); doc.setFontSize(15); doc.setTextColor(255, 255, 255); doc.text(d.supplier.name, tx, 15);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); doc.setTextColor(...[..._tint(A, 0.8)]);
  let sy = 20; [d.supplier.address, [d.supplier.phone, d.supplier.email].filter(Boolean).join('  ·  '), _supplierMeta(d)[0]].filter(Boolean).forEach(t => { doc.splitTextToSize(t, pw / 2).forEach(l => { doc.text(l, tx, sy); sy += 3.4; }); });
  doc.setFont('helvetica', 'bold'); doc.setFontSize(24); doc.setTextColor(255, 255, 255); doc.setCharSpace(1);
  doc.text('INVOICE', pw - mr, 17, { align: 'right' }); doc.setCharSpace(0);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.text('Tax Invoice', pw - mr, 23, { align: 'right' });
  let y = 42;
  // meta strip
  const cells = [['Invoice No', d.meta.no], ['Date', d.meta.date], ['Place of Supply', d.meta.placeOfSupply || '—'], ['PO No', d.meta.poNo || '—']];
  const cw = (pw - ml - mr) / cells.length;
  cells.forEach(([l, v], i) => { const x = ml + i * cw; doc.setFont('helvetica', 'bold'); doc.setFontSize(6.5); doc.setTextColor(A[0], A[1], A[2]); doc.text(l.toUpperCase(), x, y); doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(30, 34, 42); doc.text(String(v), x, y + 5); });
  y += 12;
  doc.setDrawColor(...(_tint(A, 0.6))); doc.setLineWidth(0.2); doc.line(ml, y, pw - mr, y); y += 6;
  // bill to
  doc.setFont('helvetica', 'bold'); doc.setFontSize(7); doc.setTextColor(A[0], A[1], A[2]); doc.text('BILL TO', ml, y); y += 5;
  doc.setFontSize(11); doc.setTextColor(20, 22, 28); doc.text(d.recipient.name, ml, y); y += 5;
  doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); doc.setTextColor(70, 76, 88);
  if (d.recipient.address) doc.splitTextToSize(d.recipient.address, pw - ml - mr).forEach(l => { doc.text(l, ml, y); y += 4; });
  if (d.recipient.gstin) { doc.text('GSTIN: ' + d.recipient.gstin, ml, y); y += 4; }
  _rcNote(doc, d, pw - mr, y - 4, 'right'); y += 2;

  const t = _lineTableData(d);
  doc.autoTable({
    startY: y, head: t.head, body: t.body, foot: t.foot, theme: 'striped',
    headStyles: { fillColor: A, textColor: 255, fontSize: 7.6, fontStyle: 'bold', halign: 'center' },
    footStyles: { fillColor: _tint(A, 0.86), textColor: _shade(A, 0.3), fontStyle: 'bold', fontSize: 8 },
    alternateRowStyles: { fillColor: _tint(A, 0.955) },
    styles: { fontSize: 8.5, cellPadding: 2.4, lineWidth: 0, textColor: [45, 50, 60] },
    columnStyles: _lineCols(), margin: { left: ml, right: mr },
  });
  y = doc.lastAutoTable.finalY + 6;
  // tax summary left + soft totals card right
  _taxSummary(doc, d, ml, y, pw / 2 - ml - 2, A);
  const cardX = pw / 2 + 6, cardW = pw - mr - cardX; let cy = y;
  doc.setFillColor(...(_tint(A, 0.93))); doc.roundedRect(cardX, cy, cardW, _totalRows(d, cur).length * 5.4 + 15, 3, 3, 'F');
  cy += 6; _totalRows(d, cur).forEach(([l, v]) => { doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); doc.setTextColor(70, 75, 86); doc.text(l, cardX + 4, cy); doc.text(v, cardX + cardW - 4, cy, { align: 'right' }); cy += 5.4; });
  cy += 1; doc.setFillColor(A[0], A[1], A[2]); doc.roundedRect(cardX, cy, cardW, 10, 2, 2, 'F');
  doc.setFont('helvetica', 'bold'); doc.setFontSize(11); doc.setTextColor(255, 255, 255); doc.text('Grand Total', cardX + 4, cy + 6.6); doc.text(cur + ' ' + _n2(d.meta.grand), cardX + cardW - 4, cy + 6.6, { align: 'right' });
  doc.setTextColor(0, 0, 0);
  let yy = Math.max(doc.lastAutoTable.finalY, cy + 14) + 6;
  doc.setFont('helvetica', 'bold'); doc.setFontSize(7); doc.setTextColor(A[0], A[1], A[2]); doc.text('AMOUNT IN WORDS', ml, yy); yy += 4.4;
  doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); doc.setTextColor(40, 44, 52);
  doc.splitTextToSize(d.meta.words, pw - ml - mr).forEach(l => { doc.text(l, ml, yy); yy += 4.2; }); yy += 3;
  _bankSign(ctx, yy, ml, mr, A, 'helvetica');
  doc.setFillColor(A[0], A[1], A[2]); doc.rect(0, ph - 8, pw, 8, 'F');
  doc.setFont('helvetica', 'bold'); doc.setFontSize(7.5); doc.setTextColor(255, 255, 255); doc.text('Thank you for your business', pw / 2, ph - 3, { align: 'center' }); doc.setTextColor(0, 0, 0);
}

// ═════════════════════════════════════════════════════════════════════════════
// 3) LEFT SIDEBAR — coloured vertical panel
// ═════════════════════════════════════════════════════════════════════════════
function _sidebar(ctx) {
  const { doc, d, st, cur, pw, ph } = ctx; const A = st.accent; const sbW = 54;
  doc.setFillColor(A[0], A[1], A[2]); doc.rect(0, 0, sbW, ph, 'F');
  const px = 8; let py = 14;
  if (d.supplier.logo) { try { doc.setFillColor(255, 255, 255); doc.roundedRect(px, py, 20, 20, 2, 2, 'F'); doc.addImage(d.supplier.logo, 'PNG', px + 1.5, py + 1.5, 17, 17); py += 25; } catch {} }
  doc.setFont('helvetica', 'bold'); doc.setFontSize(12); doc.setTextColor(255, 255, 255);
  doc.splitTextToSize(d.supplier.name, sbW - px * 2).forEach(l => { doc.text(l, px, py); py += 5.2; }); py += 2;
  doc.setFont('helvetica', 'normal'); doc.setFontSize(7.2); doc.setTextColor(...(_tint(A, 0.78)));
  const sblock = (label, lines) => { if (!lines.filter(Boolean).length) return; doc.setFont('helvetica', 'bold'); doc.setFontSize(6.3); doc.setTextColor(...(_tint(A, 0.55))); doc.setCharSpace(0.5); doc.text(label.toUpperCase(), px, py); doc.setCharSpace(0); py += 4; doc.setFont('helvetica', 'normal'); doc.setFontSize(7.2); doc.setTextColor(...(_tint(A, 0.82))); lines.filter(Boolean).forEach(t => doc.splitTextToSize(t, sbW - px * 2).forEach(l => { doc.text(l, px, py); py += 3.5; })); py += 3; };
  sblock('Contact', [d.supplier.phone, d.supplier.email]);
  sblock('Address', [d.supplier.address]);
  sblock('GSTIN', [d.supplier.gstin, d.supplier.stateCode ? 'State Code ' + d.supplier.stateCode : '']);
  sblock('Bank Details', [d.supplier.bankName, d.supplier.bankAcc && ('A/c ' + d.supplier.bankAcc), d.supplier.ifsc && ('IFSC ' + d.supplier.ifsc)]);
  // signatory bottom of sidebar
  doc.setDrawColor(...(_tint(A, 0.5))); doc.setLineWidth(0.3); doc.line(px, ph - 30, sbW - px, ph - 30);
  doc.setFont('helvetica', 'bold'); doc.setFontSize(7.5); doc.setTextColor(255, 255, 255); doc.text('For ' + d.supplier.name, px, ph - 24, { maxWidth: sbW - px * 2 });
  doc.setFont('helvetica', 'normal'); doc.setFontSize(6.8); doc.setTextColor(...(_tint(A, 0.75))); doc.text('Authorised Signatory', px, ph - 9);

  // Main area
  const ml = sbW + 8, mr = 14; let y = 16;
  doc.setFont('helvetica', 'bold'); doc.setFontSize(22); doc.setTextColor(A[0], A[1], A[2]); doc.setCharSpace(0.5);
  doc.text('TAX INVOICE', ml, y + 4); doc.setCharSpace(0);
  y += 12;
  const meta = (l, v) => { if (!v) return; doc.setFont('helvetica', 'bold'); doc.setFontSize(7); doc.setTextColor(120, 126, 138); doc.text(l.toUpperCase(), ml, y); doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(30, 34, 42); doc.text(String(v), ml + 30, y); y += 5.2; };
  meta('Invoice No', d.meta.no); meta('Date', d.meta.date); meta('PO No', d.meta.poNo);
  y += 2;
  doc.setFont('helvetica', 'bold'); doc.setFontSize(7); doc.setTextColor(A[0], A[1], A[2]); doc.text('BILL TO', ml, y);
  doc.text('PLACE OF SUPPLY', pw - mr - 40, y); y += 5;
  doc.setFontSize(10.5); doc.setTextColor(20, 22, 28); doc.text(d.recipient.name, ml, y);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.text(d.meta.placeOfSupply || '—', pw - mr - 40, y); y += 4.6;
  doc.setFont('helvetica', 'normal'); doc.setFontSize(8.2); doc.setTextColor(70, 76, 88);
  if (d.recipient.address) doc.splitTextToSize(d.recipient.address, pw - ml - mr - 42).forEach(l => { doc.text(l, ml, y); y += 3.8; });
  if (d.recipient.gstin) { doc.text('GSTIN: ' + d.recipient.gstin, ml, y); y += 3.8; }
  _rcNote(doc, d, ml, y); y += 4;

  const t = _lineTableData(d);
  doc.autoTable({
    startY: y, head: t.head, body: t.body, foot: t.foot, theme: 'grid',
    headStyles: { fillColor: A, textColor: 255, fontSize: 7.6, fontStyle: 'bold', halign: 'center', lineColor: A, lineWidth: 0.1 },
    footStyles: { fillColor: _tint(A, 0.9), textColor: _shade(A, 0.3), fontStyle: 'bold', fontSize: 8 },
    styles: { fontSize: 8.4, cellPadding: 2.2, lineColor: [222, 226, 232], lineWidth: 0.1, textColor: [40, 45, 55] },
    columnStyles: _lineCols(), margin: { left: ml, right: mr },
  });
  y = doc.lastAutoTable.finalY + 5;
  const taxW = 60;
  _taxSummary(doc, d, ml, y, taxW, A);
  const boxX = ml + taxW + 8, boxW = pw - mr - boxX; let ty = y;
  _totalRows(d, cur).forEach(([l, v]) => { doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); doc.setTextColor(70, 75, 86); doc.text(l, boxX, ty + 4); doc.text(v, pw - mr, ty + 4, { align: 'right' }); ty += 5.2; });
  doc.setFillColor(A[0], A[1], A[2]); doc.roundedRect(boxX - 2, ty + 1, boxW + 2, 10, 2, 2, 'F');
  doc.setFont('helvetica', 'bold'); doc.setFontSize(11); doc.setTextColor(255, 255, 255); doc.text('Grand Total', boxX, ty + 7.6); doc.text(cur + ' ' + _n2(d.meta.grand), pw - mr - 2, ty + 7.6, { align: 'right' });
  doc.setTextColor(0, 0, 0);
  let yy = Math.max(doc.lastAutoTable.finalY, ty + 14) + 5;
  doc.setFont('helvetica', 'bold'); doc.setFontSize(7); doc.setTextColor(A[0], A[1], A[2]); doc.text('AMOUNT IN WORDS', ml, yy); yy += 4.2;
  doc.setFont('helvetica', 'normal'); doc.setFontSize(8.3); doc.setTextColor(40, 44, 52);
  doc.splitTextToSize(d.meta.words, pw - ml - mr).forEach(l => { doc.text(l, ml, yy); yy += 4; });
}

// ═════════════════════════════════════════════════════════════════════════════
// 4) MINIMAL MONO — whitespace, hairlines, tracked caps
// ═════════════════════════════════════════════════════════════════════════════
function _minimal(ctx) {
  const { doc, d, st, cur, pw, ph } = ctx; const ml = 20, mr = 20, A = st.accent, INK = [24, 28, 36], MUT = [130, 136, 146];
  let y = 22;
  doc.setFont('helvetica', 'bold'); doc.setFontSize(12); doc.setTextColor(...INK); doc.text(d.supplier.name, ml, y);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); doc.setTextColor(...MUT);
  let sy = y + 4.5; [d.supplier.address, [d.supplier.phone, d.supplier.email].filter(Boolean).join('   '), _supplierMeta(d)[0]].filter(Boolean).forEach(t => doc.splitTextToSize(t, pw / 2).forEach(l => { doc.text(l, ml, sy); sy += 3.6; }));
  doc.setFont('helvetica', 'normal'); doc.setFontSize(18); doc.setTextColor(...INK); doc.setCharSpace(1.3);
  doc.text('TAX INVOICE', pw - mr, y + 2, { align: 'right' }); doc.setCharSpace(0);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(...MUT);
  let ry = y + 8;
  const rl = (l, v) => { if (!v) return; doc.text(l, pw - mr - 34, ry); doc.setTextColor(...INK); doc.text(String(v), pw - mr, ry, { align: 'right' }); doc.setTextColor(...MUT); ry += 4.4; };
  rl('Invoice', d.meta.no); rl('Date', d.meta.date); rl('PO', d.meta.poNo);
  y = Math.max(sy, ry) + 4;
  doc.setDrawColor(...INK); doc.setLineWidth(0.4); doc.line(ml, y, pw - mr, y); y += 8;

  doc.setFont('helvetica', 'bold'); doc.setFontSize(6.5); doc.setTextColor(...MUT); doc.setCharSpace(1);
  doc.text('BILLED TO', ml, y); doc.text('PLACE OF SUPPLY', pw / 2 + 4, y); doc.setCharSpace(0); y += 5;
  doc.setFont('helvetica', 'bold'); doc.setFontSize(11); doc.setTextColor(...INK); doc.text(d.recipient.name, ml, y);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.text(d.meta.placeOfSupply || '—', pw / 2 + 4, y); y += 5;
  doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(...MUT);
  let by = y; if (d.recipient.address) doc.splitTextToSize(d.recipient.address, pw / 2 - 6).forEach(l => { doc.text(l, ml, by); by += 3.8; });
  if (d.recipient.gstin) { doc.text('GSTIN ' + d.recipient.gstin, ml, by); by += 3.8; }
  _rcNote(doc, d, pw / 2 + 4, y); y = by + 6;

  const t = _lineTableData(d);
  const line = [232, 234, 238];
  doc.autoTable({
    startY: y, head: t.head, body: t.body, foot: t.foot, theme: 'plain',
    headStyles: { textColor: MUT, fontSize: 6.6, fontStyle: 'bold', halign: 'center', cellPadding: { top: 1, bottom: 3, left: 2, right: 2 } },
    footStyles: { textColor: INK, fontStyle: 'bold', fontSize: 8.5, cellPadding: { top: 3, bottom: 1, left: 2, right: 2 } },
    styles: { fontSize: 9, cellPadding: 3, textColor: [55, 60, 70], lineWidth: 0 },
    columnStyles: _lineCols(), margin: { left: ml, right: mr },
    didDrawCell: (c) => {
      if (c.column.index === 0 && (c.section === 'head' || c.section === 'body')) {
        doc.setDrawColor(line[0], line[1], line[2]); doc.setLineWidth(0.1);
        doc.line(ml, c.cell.y + c.cell.height, pw - mr, c.cell.y + c.cell.height);
      }
      if (c.section === 'head' && c.column.index === 0) { doc.setDrawColor(...INK); doc.setLineWidth(0.3); doc.line(ml, c.cell.y, pw - mr, c.cell.y); }
    },
  });
  y = doc.lastAutoTable.finalY + 8;
  // totals — right aligned, airy
  let ty = y; const totX = pw - mr - 70;
  _totalRows(d, cur).forEach(([l, v]) => { doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(...MUT); doc.text(l, totX, ty); doc.setTextColor(...INK); doc.text(v, pw - mr, ty, { align: 'right' }); ty += 5.4; });
  ty += 1; doc.setDrawColor(A[0], A[1], A[2]); doc.setLineWidth(0.6); doc.line(totX, ty, pw - mr, ty); ty += 5.5;
  doc.setFont('helvetica', 'bold'); doc.setFontSize(13); doc.setTextColor(...INK); doc.text('Total Due', totX, ty); doc.text(cur + ' ' + _n2(d.meta.grand), pw - mr, ty, { align: 'right' });
  // words + tax summary lower-left
  let yy = y;
  doc.setFont('helvetica', 'bold'); doc.setFontSize(6.5); doc.setTextColor(...MUT); doc.setCharSpace(1); doc.text('AMOUNT IN WORDS', ml, yy); doc.setCharSpace(0); yy += 4.4;
  doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); doc.setTextColor(...INK);
  doc.splitTextToSize(d.meta.words, pw / 2 - ml).forEach(l => { doc.text(l, ml, yy); yy += 4; });
  yy = Math.max(yy, ty) + 8;
  _taxSummary(doc, d, ml, yy, pw / 2 - ml, A);
  const bankY = Math.max(doc.lastAutoTable.finalY + 6, yy);
  _bankSign(ctx, bankY, ml, mr, A, 'helvetica');
}

// ═════════════════════════════════════════════════════════════════════════════
// 5) ACCENT BRAND — brand bars, zebra, solid total card
// ═════════════════════════════════════════════════════════════════════════════
function _accent(ctx) {
  const { doc, d, st, cur, pw, ph } = ctx; const ml = 16, mr = 16, A = st.accent;
  doc.setFillColor(A[0], A[1], A[2]); doc.rect(0, 0, pw, 5, 'F');
  let y = 15;
  if (d.supplier.logo) { try { doc.addImage(d.supplier.logo, 'PNG', ml, y, 19, 19); } catch {} }
  const tx = d.supplier.logo ? ml + 24 : ml;
  doc.setFont('helvetica', 'bold'); doc.setFontSize(15); doc.setTextColor(...(_shade(A, 0.15))); doc.text(d.supplier.name, tx, y + 6);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); doc.setTextColor(90, 96, 108);
  let sy = y + 11; [d.supplier.address, [d.supplier.phone, d.supplier.email].filter(Boolean).join('  ·  '), _supplierMeta(d)[0]].filter(Boolean).forEach(t => doc.splitTextToSize(t, pw / 2).forEach(l => { doc.text(l, tx, sy); sy += 3.6; }));
  // title chip
  doc.setFillColor(A[0], A[1], A[2]); doc.roundedRect(pw - mr - 60, y, 60, 22, 2, 2, 'F');
  doc.setFont('helvetica', 'bold'); doc.setFontSize(15); doc.setTextColor(255, 255, 255); doc.setCharSpace(0.5);
  doc.text('TAX INVOICE', pw - mr - 30, y + 8, { align: 'center' }); doc.setCharSpace(0);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); doc.setTextColor(...(_tint(A, 0.8)));
  doc.text('No. ' + (d.meta.no || '—'), pw - mr - 30, y + 14, { align: 'center' });
  doc.text('Date: ' + (d.meta.date || '—'), pw - mr - 30, y + 18.5, { align: 'center' });
  y = Math.max(sy, y + 24) + 4;

  // Bill To band
  doc.setFillColor(...(_tint(A, 0.92))); doc.rect(ml, y, pw - ml - mr, 20, 'F');
  doc.setFont('helvetica', 'bold'); doc.setFontSize(6.8); doc.setTextColor(...(_shade(A, 0.1))); doc.text('BILL TO', ml + 3, y + 5);
  doc.text('PLACE OF SUPPLY', pw / 2 + 3, y + 5);
  doc.setFontSize(10.5); doc.setTextColor(25, 28, 36); doc.text(d.recipient.name, ml + 3, y + 11);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.text(d.meta.placeOfSupply || '—', pw / 2 + 3, y + 11);
  doc.setFontSize(7.6); doc.setTextColor(70, 76, 88);
  const rline2 = [d.recipient.address, d.recipient.gstin && ('GSTIN: ' + d.recipient.gstin)].filter(Boolean).join('   ·   ');
  if (rline2) doc.text(doc.splitTextToSize(rline2, pw / 2 - 6)[0], ml + 3, y + 16);
  _rcNote(doc, d, pw / 2 + 3, y + 16.5);
  y += 25;

  const t = _lineTableData(d);
  doc.autoTable({
    startY: y, head: t.head, body: t.body, foot: t.foot, theme: 'striped',
    headStyles: { fillColor: A, textColor: 255, fontSize: 7.8, fontStyle: 'bold', halign: 'center' },
    footStyles: { fillColor: _tint(A, 0.85), textColor: _shade(A, 0.25), fontStyle: 'bold', fontSize: 8 },
    alternateRowStyles: { fillColor: _tint(A, 0.95) },
    styles: { fontSize: 8.5, cellPadding: 2.4, lineWidth: 0, textColor: [45, 50, 60] },
    columnStyles: _lineCols(), margin: { left: ml, right: mr },
  });
  y = doc.lastAutoTable.finalY + 6;
  _taxSummary(doc, d, ml, y, pw / 2 - ml - 2, A);
  const cardX = pw / 2 + 6, cardW = pw - mr - cardX; let ty = y;
  _totalRows(d, cur).forEach(([l, v]) => { doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); doc.setTextColor(70, 75, 86); doc.text(l, cardX, ty + 4); doc.text(v, pw - mr, ty + 4, { align: 'right' }); ty += 5.3; });
  ty += 2; doc.setFillColor(A[0], A[1], A[2]); doc.roundedRect(cardX - 2, ty, cardW + 2, 12, 2, 2, 'F');
  doc.setFont('helvetica', 'bold'); doc.setFontSize(9); doc.setTextColor(...(_tint(A, 0.8))); doc.text('AMOUNT DUE', cardX + 2, ty + 4.6);
  doc.setFontSize(13); doc.setTextColor(255, 255, 255); doc.text(cur + ' ' + _n2(d.meta.grand), pw - mr - 2, ty + 8.5, { align: 'right' });
  doc.setTextColor(0, 0, 0);
  let yy = Math.max(doc.lastAutoTable.finalY, ty + 16) + 6;
  doc.setFont('helvetica', 'bold'); doc.setFontSize(7); doc.setTextColor(...(_shade(A, 0.1))); doc.text('AMOUNT IN WORDS', ml, yy); yy += 4.4;
  doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); doc.setTextColor(40, 44, 52);
  doc.splitTextToSize(d.meta.words, pw - ml - mr).forEach(l => { doc.text(l, ml, yy); yy += 4.2; }); yy += 2;
  _bankSign(ctx, yy, ml, mr, A, 'helvetica');
  doc.setFillColor(A[0], A[1], A[2]); doc.rect(0, ph - 5, pw, 5, 'F');
}

// ── Bank details (left) + signature (right) shared block ─────────────────────
function _bankSign(ctx, y, ml, mr, A, font) {
  const { doc, d, pw, ph } = ctx;
  y = Math.min(y, ph - 26);
  const bank = [d.supplier.bankName && ('Bank: ' + d.supplier.bankName), d.supplier.bankAcc && ('A/c: ' + d.supplier.bankAcc), d.supplier.ifsc && ('IFSC: ' + d.supplier.ifsc)].filter(Boolean);
  if (bank.length) {
    doc.setFont(font, 'bold'); doc.setFontSize(7.4); doc.setTextColor(A[0], A[1], A[2]); doc.text('Bank Details', ml, y);
    doc.setFont(font, 'normal'); doc.setFontSize(7.6); doc.setTextColor(60, 66, 76);
    let byy = y + 4; bank.forEach(t => { doc.text(t, ml, byy); byy += 3.6; });
  }
  doc.setFont(font, 'bold'); doc.setFontSize(8.5); doc.setTextColor(30, 34, 42);
  doc.text('For ' + d.supplier.name, pw - mr, y, { align: 'right' });
  doc.setFont(font, 'normal'); doc.setFontSize(7.8); doc.setTextColor(110, 116, 126);
  doc.text('Authorised Signatory', pw - mr, y + 16, { align: 'right' });
  doc.setTextColor(0, 0, 0);
  if (d.meta.notes) { doc.setFontSize(6.8); doc.setTextColor(120, 125, 135); doc.text('Notes: ' + d.meta.notes, ml, Math.min(y + 12, ph - 12)); doc.setTextColor(0, 0, 0); }
}
