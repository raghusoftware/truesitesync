/**
 * ═══════════════════════════════════════════════════════════════════════════
 * True Site Sync — GST Tax-Invoice designs (Rule 46, CGST Rules)
 * ───────────────────────────────────────────────────────────────────────────
 * Five selectable, print-ready invoice layouts driven by ONE compliant data
 * model, so every design carries the mandatory fields: supplier name/address/
 * GSTIN/state, invoice no. + date, recipient + GSTIN, place of supply, HSN/SAC,
 * description, qty + unit, rate, taxable value, CGST/SGST or IGST break-up,
 * total, amount in words, signature and reverse-charge note.
 *
 * Designs (Settings → Print → Invoice Design):
 *   classic  — Classic Professional (white, thin borders, totals box)
 *   modern   — Modern Minimal (grey header bar, alt rows, QR/IRN space)
 *   formal   — Traditional Formal (thick border, all tax cols, T&C + declaration)
 *   compact  — Compact Single-Page (dense, bottom total strip)
 *   accent   — Colour Accent (brand colour bars + coloured header)
 *
 * The renderer is parameterised by a style preset so the GST logic stays in one
 * place and can never drift between designs.
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
function _tint(rgb, f) { return rgb.map(ch => Math.round(ch + (255 - ch) * f)); }

// ── Style presets ───────────────────────────────────────────────────────────
const STYLES = {
  classic: { name: 'Classic Professional', accent: [30, 58, 138], border: 'thin', title: 'bar', altRows: false, taxSummary: true, footerCopies: true },
  modern:  { name: 'Modern Minimal',       accent: [71, 85, 105],  border: 'light', title: 'plain', headerBar: true, altRows: true, taxSummary: true, qr: true },
  formal:  { name: 'Traditional Formal',   accent: [17, 24, 39],   border: 'thick', title: 'underline', altRows: false, taxSummary: true, allTaxCols: true, terms: true, pageNo: true },
  compact: { name: 'Compact Single-Page',  accent: [15, 23, 42],   border: 'thin', title: 'plain', dense: true, altRows: false, taxSummary: true, bottomStrip: true },
  accent:  { name: 'Colour Accent',        accent: [37, 99, 235],  border: 'light', title: 'bar', accentBars: true, altRows: true, taxSummary: true, colouredTotals: true },
};
export function invoiceDesignName(key) { return (STYLES[key] || {}).name || 'Standard'; }
export function invoiceDesignKeys() { return Object.keys(STYLES); }

// ── Compliant data model (single source of truth) ───────────────────────────
function _prep(inv) {
  const cp = state.companyProfile || {};
  const c = (state.clients || []).find(x => x.id === inv.clientId) || {};
  const stateCode = (gstin) => (gstin && /^\d{2}/.test(gstin)) ? gstin.slice(0, 2) : '';
  const items = (inv.items || []).map((it, i) => {
    const amount = parseFloat(it.amount) || 0;                 // incl tax
    const tax = parseFloat(it.taxAmount) || 0;
    const taxable = amount - tax;
    const type = it.taxType || (tax > 0 ? 'CGST_SGST' : 'NONE');
    const pct = parseFloat(it.taxPct) || 0;
    const cgst = type === 'CGST_SGST' ? tax / 2 : 0;
    const sgst = type === 'CGST_SGST' ? tax / 2 : 0;
    const igst = type === 'IGST' ? tax : 0;
    return {
      sr: i + 1, desc: it.desc || '', hsn: it.hsn || '', qty: parseFloat(it.qty) || 0,
      unit: it.unit || '', rate: parseFloat(it.rate) || 0, taxable, tax, pct, type,
      cgst, sgst, igst, total: amount,
    };
  });
  const sum = (f) => items.reduce((s, it) => s + f(it), 0);
  const totals = {
    qty: sum(it => it.qty), taxable: sum(it => it.taxable),
    cgst: sum(it => it.cgst), sgst: sum(it => it.sgst), igst: sum(it => it.igst),
    tax: sum(it => it.tax), gross: sum(it => it.total),
  };
  const inter = totals.igst > 0.005;
  // HSN-wise summary
  const groups = {};
  items.forEach(it => {
    const k = it.hsn || '-';
    (groups[k] = groups[k] || { hsn: k, taxable: 0, cgst: 0, sgst: 0, igst: 0, pct: it.pct });
    groups[k].taxable += it.taxable; groups[k].cgst += it.cgst; groups[k].sgst += it.sgst; groups[k].igst += it.igst;
  });
  return {
    cp, c, items, totals, inter,
    hsnGroups: Object.values(groups),
    supplier: {
      name: cp.CompanyName || 'Company', address: cp.Address || '', gstin: cp.GST || '',
      stateCode: stateCode(cp.GST), phone: cp.Phone || '', email: cp.Email || '',
      bankName: cp.BankName || '', bankAcc: cp.BankAcc || '', ifsc: cp.IFSC || '', logo: cp.logo || '',
    },
    recipient: {
      name: c.name || inv.clientName || '—', address: c.address || inv.clientAddress || '',
      gstin: c.gst || '', state: inv.stateOfSupply || '',
    },
    meta: {
      no: inv.invoiceNo || '', date: inv.date || '', placeOfSupply: inv.stateOfSupply || '',
      poNo: inv.poNo || '', poDate: inv.poDate || '', reverseCharge: (inv.reverseCharge === 'Yes'),
      tcs: parseFloat(inv.tcsAmount) || 0, roundAmt: parseFloat(inv.roundAmt) || 0,
      grand: parseFloat(inv.total) || (totals.gross + (parseFloat(inv.tcsAmount) || 0)),
      words: amountToWordsINR(parseFloat(inv.total) || totals.gross), notes: inv.notes || '',
    },
  };
}

// ── Public dispatch ─────────────────────────────────────────────────────────
export function renderStyledInvoice(inv, styleKey) {
  try {
    if (!window.jspdf || !window.jspdf.jsPDF) return showToast('PDF library not loaded — refresh', 'error');
    const style = STYLES[styleKey] || STYLES.classic;
    // The "accent" design uses the user's brand colour from Settings.
    const st = { ...style };
    if (styleKey === 'accent') st.accent = _rgb(state.printSettings?.invoiceColor, st.accent);
    const d = _prep(inv);
    _render(inv, d, st);
  } catch (err) {
    console.error('Invoice PDF failed:', err);
    showToast('PDF error: ' + (err && err.message ? err.message : err), 'error');
  }
}

// ── Core renderer ────────────────────────────────────────────────────────────
function _render(inv, d, st) {
  const cur = (getPdfCurrency() || 'Rs.').trim();
  const doc = new window.jspdf.jsPDF('p', 'mm', 'a4');
  const pw = doc.internal.pageSize.getWidth();
  const ph = doc.internal.pageSize.getHeight();
  const ml = 14, mr = 14, cw = pw - ml - mr;
  const A = st.accent, Aint = _tint(A, 0.86);
  const lineRGB = st.border === 'thick' ? [0, 0, 0] : st.border === 'light' ? [210, 216, 224] : [120, 130, 145];
  const lineW = st.border === 'thick' ? 0.5 : st.border === 'light' ? 0.1 : 0.2;
  let y = 12;

  // Top accent bar (accent design)
  if (st.accentBars) { doc.setFillColor(A[0], A[1], A[2]); doc.rect(0, 0, pw, 4, 'F'); y = 12; }

  // ── Header: supplier block (+ optional coloured/grey bar) ──
  const headerH = 26;
  if (st.headerBar) { doc.setFillColor(A[0], A[1], A[2]); doc.rect(ml, y, cw, headerH, 'F'); }
  const onBar = !!st.headerBar;
  let hx = ml + 2;
  if (d.supplier.logo) { try { doc.addImage(d.supplier.logo, 'PNG', ml + 2, y + 2, 20, 20); hx = ml + 26; } catch {} }
  doc.setFont('helvetica', 'bold'); doc.setFontSize(st.dense ? 12 : 14);
  doc.setTextColor(...(onBar ? [255, 255, 255] : A));
  doc.text(d.supplier.name, hx, y + 7);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5);
  doc.setTextColor(...(onBar ? [235, 240, 248] : [60, 66, 78]));
  const supLines = [
    d.supplier.address,
    [d.supplier.phone && ('Ph: ' + d.supplier.phone), d.supplier.email].filter(Boolean).join('   '),
    [d.supplier.gstin && ('GSTIN: ' + d.supplier.gstin), d.supplier.stateCode && ('State Code: ' + d.supplier.stateCode)].filter(Boolean).join('    '),
  ].filter(Boolean);
  let sy = y + 12;
  supLines.forEach(t => { doc.splitTextToSize(t, cw - (hx - ml) - 4).forEach(ln => { doc.text(ln, hx, sy); sy += 3.6; }); });
  y = Math.max(y + headerH, sy) + 3;
  doc.setTextColor(0, 0, 0);

  // ── Title ──
  if (st.title === 'bar') {
    doc.setFillColor(A[0], A[1], A[2]); doc.rect(ml, y, cw, 8, 'F');
    doc.setTextColor(255, 255, 255); doc.setFont('helvetica', 'bold'); doc.setFontSize(11);
    doc.text('TAX INVOICE', pw / 2, y + 5.6, { align: 'center' });
    doc.setTextColor(0, 0, 0); y += 12;
  } else {
    doc.setFont('helvetica', 'bold'); doc.setFontSize(st.title === 'underline' ? 15 : 12);
    doc.setTextColor(...A);
    doc.text('TAX INVOICE', pw / 2, y + 6, { align: 'center' });
    if (st.title === 'underline') { const tw = doc.getTextWidth('TAX INVOICE'); doc.setDrawColor(...A); doc.setLineWidth(0.4); doc.line(pw / 2 - tw / 2, y + 8, pw / 2 + tw / 2, y + 8); }
    doc.setTextColor(0, 0, 0); y += 12;
  }
  if (d.meta.reverseCharge) {
    doc.setFont('helvetica', 'bold'); doc.setFontSize(7.5); doc.setTextColor(180, 30, 30);
    doc.text('Tax payable under Reverse Charge: YES', pw - mr, y - 1, { align: 'right' });
    doc.setTextColor(0, 0, 0);
  }

  // ── Parties: recipient (left) + invoice meta (right) ──
  const boxed = st.border === 'thick';
  const colR = ml + cw / 2 + 3;
  const py = y;
  let ly = y + (boxed ? 5 : 4.5), ry = y + (boxed ? 5 : 4.5);
  doc.setFontSize(8.5); doc.setFont('helvetica', 'bold'); doc.text('Bill To (Recipient):', ml + (boxed ? 2 : 0), ly); ly += 4.6;
  doc.setFontSize(9); doc.text(d.recipient.name, ml + (boxed ? 2 : 0), ly); ly += 4.4;
  doc.setFont('helvetica', 'normal'); doc.setFontSize(8);
  if (d.recipient.address) doc.splitTextToSize(d.recipient.address, cw / 2 - 6).forEach(l => { doc.text(l, ml + (boxed ? 2 : 0), ly); ly += 3.8; });
  if (d.recipient.gstin) { doc.text('GSTIN: ' + d.recipient.gstin, ml + (boxed ? 2 : 0), ly); ly += 3.8; }
  doc.text('Place of Supply: ' + (d.meta.placeOfSupply || '—'), ml + (boxed ? 2 : 0), ly); ly += 3.8;

  doc.setFont('helvetica', 'bold'); doc.setFontSize(8.5); doc.text('Invoice Details:', colR + (boxed ? 2 : 0), ry); ry += 4.6;
  doc.setFontSize(8);
  const meta = (label, val) => { if (!val) return; doc.setFont('helvetica', 'bold'); doc.text(label, colR + (boxed ? 2 : 0), ry); const w = doc.getTextWidth(label); doc.setFont('helvetica', 'normal'); doc.text(' ' + val, colR + (boxed ? 2 : 0) + w, ry); ry += 3.9; };
  meta('Invoice No:', d.meta.no); meta('Date:', d.meta.date);
  meta('PO No:', d.meta.poNo); meta('PO Date:', d.meta.poDate);
  const pend = Math.max(ly, ry) + (boxed ? 3 : 1);
  if (boxed) {
    doc.setDrawColor(...lineRGB); doc.setLineWidth(lineW);
    doc.rect(ml, py, cw / 2, pend - py); doc.rect(ml + cw / 2, py, cw / 2, pend - py);
  }
  y = pend + 3;

  // ── Items table ──
  const dense = !!st.dense;
  const showCS = st.allTaxCols || !d.inter;    // CGST/SGST columns
  const showIG = st.allTaxCols || d.inter;     // IGST columns
  const head = ['Sr', 'Description', 'HSN/SAC', 'Qty', 'Unit', `Rate`, 'Taxable'];
  if (!dense) {
    if (showCS) head.push('CGST', 'SGST');
    if (showIG) head.push('IGST');
  } else head.push('GST');
  head.push('Amount');
  const body = d.items.map(it => {
    const row = [it.sr, it.desc, it.hsn, _intStr(it.qty), it.unit, _n2(it.rate), _n2(it.taxable)];
    if (!dense) {
      if (showCS) row.push(_n2(it.cgst), _n2(it.sgst));
      if (showIG) row.push(_n2(it.igst));
    } else row.push(_n2(it.tax));
    row.push(_n2(it.total));
    return row;
  });
  const minRows = Math.max(0, parseInt(state.printSettings?.invoiceMinRows ?? 6) || 0);
  while (body.length < minRows) body.push(head.map(() => ''));

  const footRow = ['', 'Total', '', _intStr(d.totals.qty), '', '', _n2(d.totals.taxable)];
  if (!dense) { if (showCS) footRow.push(_n2(d.totals.cgst), _n2(d.totals.sgst)); if (showIG) footRow.push(_n2(d.totals.igst)); }
  else footRow.push(_n2(d.totals.tax));
  footRow.push(_n2(d.totals.gross));

  doc.autoTable({
    startY: y, head: [head], body, foot: [footRow], theme: 'grid',
    headStyles: { fillColor: A, textColor: 255, fontSize: dense ? 6.5 : 7.2, fontStyle: 'bold', halign: 'center', lineColor: lineRGB, lineWidth: lineW },
    footStyles: { fillColor: Aint, textColor: 20, fontStyle: 'bold', fontSize: dense ? 6.5 : 7.2 },
    styles: { fontSize: dense ? 6.5 : 7.2, cellPadding: dense ? 1 : 1.5, overflow: 'linebreak', lineColor: lineRGB, lineWidth: lineW, minCellHeight: dense ? 5 : 6 },
    alternateRowStyles: st.altRows ? { fillColor: [247, 249, 252] } : undefined,
    columnStyles: (() => {
      const cs = { 0: { cellWidth: 7, halign: 'center' }, 1: { cellWidth: 'auto' }, 2: { cellWidth: 15, halign: 'center' }, 3: { cellWidth: 12, halign: 'right' }, 4: { cellWidth: 10, halign: 'center' }, 5: { cellWidth: 17, halign: 'right' }, 6: { cellWidth: 19, halign: 'right' } };
      let i = 7; const money = 15;
      if (!dense) { if (showCS) { cs[i++] = { cellWidth: money, halign: 'right' }; cs[i++] = { cellWidth: money, halign: 'right' }; } if (showIG) { cs[i++] = { cellWidth: money, halign: 'right' }; } }
      else cs[i++] = { cellWidth: 18, halign: 'right' };
      cs[i] = { cellWidth: 20, halign: 'right' };
      return cs;
    })(),
    margin: { left: ml, right: mr },
  });
  y = doc.lastAutoTable.finalY + 4;

  // ── Tax summary (HSN-wise) + Totals ──
  const needed = 46;
  if (y + needed > ph - 16) { doc.addPage(); y = 16; }

  if (st.taxSummary) {
    const tHead = d.inter ? ['HSN/SAC', 'Taxable', 'IGST%', 'IGST', 'Total Tax'] : ['HSN/SAC', 'Taxable', 'CGST%', 'CGST', 'SGST%', 'SGST', 'Total Tax'];
    const tBody = d.hsnGroups.map(g => d.inter
      ? [g.hsn, _n2(g.taxable), (g.pct || '') && (g.pct + '%'), _n2(g.igst), _n2(g.igst)]
      : [g.hsn, _n2(g.taxable), (g.pct ? (g.pct / 2) + '%' : ''), _n2(g.cgst), (g.pct ? (g.pct / 2) + '%' : ''), _n2(g.sgst), _n2(g.cgst + g.sgst)]);
    tBody.push(d.inter
      ? ['TOTAL', _n2(d.totals.taxable), '', _n2(d.totals.igst), _n2(d.totals.igst)]
      : ['TOTAL', _n2(d.totals.taxable), '', _n2(d.totals.cgst), '', _n2(d.totals.sgst), _n2(d.totals.cgst + d.totals.sgst)]);
    doc.autoTable({
      startY: y, head: [tHead], body: tBody, theme: 'grid',
      headStyles: { fillColor: [71, 85, 105], textColor: 255, fontSize: 6.5, halign: 'center' },
      styles: { fontSize: 6.5, cellPadding: 1.2, halign: 'right', lineColor: lineRGB, lineWidth: lineW },
      columnStyles: { 0: { halign: 'center' } },
      margin: { left: ml, right: pw / 2 + 2 },
    });
  }
  const taxBottom = doc.lastAutoTable ? doc.lastAutoTable.finalY : y;

  // Totals box (right half)
  const totX = pw / 2 + 6, valX = pw - mr;
  let ty = y;
  if (st.colouredTotals || st.bottomStrip) { /* boxed later */ }
  const totBoxTop = ty;
  const trow = (label, val, bold) => {
    doc.setFont('helvetica', bold ? 'bold' : 'normal'); doc.setFontSize(bold ? 10 : 8.5);
    doc.text(label, totX, ty + 4); doc.text(val, valX - 1, ty + 4, { align: 'right' }); ty += bold ? 6.5 : 5;
  };
  trow('Taxable Value :', cur + ' ' + _n2(d.totals.taxable));
  if (d.totals.cgst) trow('CGST :', cur + ' ' + _n2(d.totals.cgst));
  if (d.totals.sgst) trow('SGST :', cur + ' ' + _n2(d.totals.sgst));
  if (d.totals.igst) trow('IGST :', cur + ' ' + _n2(d.totals.igst));
  if (d.meta.tcs) trow('TCS :', cur + ' ' + _n2(d.meta.tcs));
  if (d.meta.roundAmt) trow('Round Off :', (d.meta.roundAmt < 0 ? '- ' : '+ ') + cur + ' ' + _n2(Math.abs(d.meta.roundAmt)));
  // Grand total emphasised
  if (st.colouredTotals) { doc.setFillColor(...Aint); doc.rect(totX - 3, ty, valX - totX + 4, 8, 'F'); }
  doc.setDrawColor(...A); doc.setLineWidth(0.3); doc.line(totX - 3, ty, valX + 1, ty);
  ty += 1.5; trow('Grand Total :', cur + ' ' + _n2(d.meta.grand), true);
  if (st.border === 'thick' || st.colouredTotals) { doc.setDrawColor(...lineRGB); doc.setLineWidth(lineW); doc.rect(totX - 3, totBoxTop, valX - totX + 4, ty - totBoxTop); }

  y = Math.max(taxBottom, ty) + 5;

  // ── Amount in words ──
  if (y + 28 > ph - 12) { doc.addPage(); y = 16; }
  doc.setFont('helvetica', 'bold'); doc.setFontSize(8); doc.text('Amount in Words:', ml, y);
  doc.setFont('helvetica', 'normal');
  const wLines = doc.splitTextToSize(d.meta.words, cw - 30);
  wLines.forEach((l, i) => doc.text(l, ml + 26, y + i * 4)); y += Math.max(4.5, wLines.length * 4) + 3;

  // ── Bank details + signature ──
  const sigTop = y;
  doc.setFont('helvetica', 'bold'); doc.setFontSize(7.5); doc.text('Bank Details:', ml, y); y += 4;
  doc.setFont('helvetica', 'normal');
  const bank = [
    d.supplier.bankName && ('Bank: ' + d.supplier.bankName),
    d.supplier.bankAcc && ('A/c: ' + d.supplier.bankAcc),
    d.supplier.ifsc && ('IFSC: ' + d.supplier.ifsc),
  ].filter(Boolean);
  (bank.length ? bank : ['—']).forEach(t => { doc.text(t, ml, y); y += 3.8; });

  // QR / IRN placeholder (modern / e-invoice ready)
  if (st.qr) {
    const qx = pw / 2 - 12, qy = sigTop;
    doc.setDrawColor(...lineRGB); doc.setLineWidth(0.2); doc.rect(qx, qy, 20, 20);
    doc.setFontSize(5.5); doc.setTextColor(140); doc.text('QR / IRN', qx + 10, qy + 11, { align: 'center' }); doc.setTextColor(0);
  }

  doc.setFont('helvetica', 'bold'); doc.setFontSize(8.5);
  doc.text('For ' + d.supplier.name, valX, sigTop + 2, { align: 'right' });
  doc.setFont('helvetica', 'normal'); doc.setFontSize(8);
  doc.text('Authorised Signatory', valX, sigTop + 18, { align: 'right' });
  y = Math.max(y, sigTop + 20) + 3;

  // ── Terms & Declaration (formal) ──
  if (st.terms) {
    if (y + 24 > ph - 12) { doc.addPage(); y = 16; }
    doc.setDrawColor(...lineRGB); doc.setLineWidth(lineW); doc.line(ml, y, pw - mr, y); y += 4;
    doc.setFont('helvetica', 'bold'); doc.setFontSize(7.5); doc.text('Terms & Conditions:', ml, y); y += 3.8;
    doc.setFont('helvetica', 'normal'); doc.setFontSize(6.8);
    ['1. Goods/services once sold will not be taken back.', '2. Payment due as per agreed credit terms; interest applies on delays.', '3. Subject to jurisdiction. E.&O.E.'].forEach(t => { doc.text(t, ml, y); y += 3.3; });
    y += 1;
    doc.setFont('helvetica', 'bold'); doc.setFontSize(7); doc.text('Declaration:', ml, y); y += 3.4;
    doc.setFont('helvetica', 'normal'); doc.setFontSize(6.8);
    doc.splitTextToSize('We declare that this invoice shows the actual price of the goods/services described and that all particulars are true and correct.', cw).forEach(l => { doc.text(l, ml, y); y += 3.2; });
  }

  if (d.meta.notes) { doc.setFontSize(7); doc.setTextColor(90); doc.text('Notes: ' + d.meta.notes, ml, Math.min(y + 3, ph - 10)); doc.setTextColor(0); }

  // ── Footer on every page ──
  const pages = doc.internal.getNumberOfPages();
  for (let p = 1; p <= pages; p++) {
    doc.setPage(p);
    if (st.accentBars) { doc.setFillColor(A[0], A[1], A[2]); doc.rect(0, ph - 3, pw, 3, 'F'); }
    doc.setFont('helvetica', 'normal'); doc.setFontSize(6.5); doc.setTextColor(120);
    if (st.footerCopies) doc.text('Original for Recipient  /  Duplicate for Supplier', ml, ph - 6);
    if (st.pageNo) doc.text('Page ' + p + ' of ' + pages, pw - mr, ph - 6, { align: 'right' });
    doc.setTextColor(0);
  }

  mobileSavePDF(doc, (d.meta.no || 'Invoice').replace(/[\\/]/g, '-') + '.pdf');
  showToast('Invoice PDF downloaded (' + (st.name) + ')');
}
