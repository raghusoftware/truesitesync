/**
 * ═══════════════════════════════════════════════════════════════════════════
 * True Site Sync — GST Tax-Invoice designs (client-supplied templates)
 * ───────────────────────────────────────────────────────────────────────────
 * Exactly THREE invoice layouts, reproduced from the client's sample PDFs —
 * geometry, colours and typography follow the templates; only the data varies:
 *
 *   grid     — Classic Grid : black text on a grey ruled grid, logo letterhead,
 *                             Invoice No./Date/Place/PO grid, Amounts panel,
 *                             HSN-wise CGST/SGST table, signature box.
 *   detailed — GST Detailed : slate ink (#3F4155) with light-grey bands —
 *                             big logo letterhead, Bill To / Invoice Details,
 *                             Transportation, Tax Summary + totals panel,
 *                             Payment Mode, separate signature box.
 *   compact  — GST Compact  : name-only letterhead, items grid drawn to the
 *                             foot of the page, Tax Summary + totals panel.
 *
 * Every design keeps the Rule 46 (CGST Rules) fields: supplier name/address/
 * GSTIN, invoice no.+date, recipient+GSTIN, place of supply, HSN/SAC, qty,
 * rate, CGST/SGST or IGST break-up, total, amount in words, signature, and a
 * reverse-charge note when applicable. Non-GST countries get one VAT/sales-tax
 * column. Segoe UI (the templates' font) is proprietary, so Noto Sans is
 * embedded instead; documents bypass the global monochrome mode so the
 * template colours survive.
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { state } from './state.js';
import { mobileSavePDF, showToast, amountToWordsCur, getTaxConfig, getTerm } from './utils.js';
import { formatNumber2, CURRENCY_WORDS } from './format.js?v=1.0.1';
import { GST_STATE } from './constants.js?v=1.1.0';
import { fitImage, loadFontFiles, newColorDoc } from './pdfModernTheme.js?v=1.2.0';

const DESIGNS = {
  grid:     { name: 'Classic Grid', desc: 'Black text · grey ruled grid' },
  detailed: { name: 'GST Detailed', desc: 'Logo letterhead · grey bands' },
  compact:  { name: 'GST Compact',  desc: 'Name header · full-page items grid' },
};
export const DEFAULT_INVOICE_DESIGN = 'detailed';
export function invoiceDesignKeys() { return Object.keys(DESIGNS); }
export function invoiceDesignName(key) { return (DESIGNS[key] || {}).name || DESIGNS[DEFAULT_INVOICE_DESIGN].name; }
export function invoiceDesignDesc(key) { return (DESIGNS[key] || {}).desc || ''; }
/** Any unknown / legacy design key (old "standard", "classic", "modern" …) maps to the default. */
export function resolveInvoiceDesign(key) { return DESIGNS[key] ? key : DEFAULT_INVOICE_DESIGN; }

// ── Palette (sampled from the templates) ────────────────────────────────────
const BLACK = [0, 0, 0];
const GREY_RULE = [128, 128, 128];   // #808080 grid lines (Classic Grid)
const SLATE = [63, 65, 85];          // #3F4155 text + rules (GST Detailed / Compact)
const BAND = [244, 244, 244];        // #F4F4F4 header bands
const LW = 0.26;                     // 1px rule

const X0 = 16.2, X1 = 196.2, W = X1 - X0;  // template frame
const PAGE_BOTTOM = 287;

const _n2 = (n) => formatNumber2(n, (state.currencySettings || {}).locale || 'en-IN');
const _qty = (n) => _n2(n).replace(/\.00$/, '');

// ── Data model (single source of truth) ─────────────────────────────────────
const _code = (g) => (String(g || '').trim().slice(0, 2).match(/^\d{2}$/) || [])[0] || '';
const _stateLabel = (g) => { const c = _code(g); return c ? c + '-' + (GST_STATE[c] || 'State ' + c) : ''; };
function _dmy(v, sep) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(v || ''));
  return m ? [m[3], m[2], m[1]].join(sep) : (v || '');
}
/** "Five Lakh … Seven Rupees only" — the templates' amount-in-words style. */
function _words(n) {
  const code = ((state.currencySettings || {}).code || 'INR').toUpperCase();
  const major = (CURRENCY_WORDS[code] || {}).major || '';
  let w = amountToWordsCur(n).replace(/\s+Only$/, '');
  if (major && w.startsWith(major + ' ')) {
    w = w.slice(major.length + 1);
    w = / and /.test(w) ? w.replace(' and ', ' ' + major + ' and ') : w + ' ' + major;
  }
  return w + ' only';
}

function _prep(inv) {
  const cp = state.companyProfile || {};
  const c = (state.clients || []).find(x => x.id === inv.clientId) || {};
  const tx = getTaxConfig();
  const isGst = tx.mode === 'gst';
  const items = (inv.items || []).map((it, i) => {
    const amount = parseFloat(it.amount) || 0, tax = parseFloat(it.taxAmount) || 0;
    const type = it.taxType || (tax > 0 ? tx.defaultType : 'NONE');
    const isSplit = type === 'CGST_SGST';
    return {
      sr: i + 1, desc: it.desc || '', hsn: it.hsn || '', qty: parseFloat(it.qty) || 0, unit: it.unit || '',
      rate: parseFloat(it.rate) || 0, taxable: amount - tax, tax, pct: parseFloat(it.taxPct) || 0,
      cgst: isSplit ? tax / 2 : 0, sgst: isSplit ? tax / 2 : 0, igst: (!isSplit && type !== 'NONE') ? tax : 0, total: amount,
    };
  });
  const sum = f => items.reduce((s, it) => s + f(it), 0);
  const totals = { qty: sum(i => i.qty), taxable: sum(i => i.taxable), cgst: sum(i => i.cgst), sgst: sum(i => i.sgst), igst: sum(i => i.igst), tax: sum(i => i.tax), gross: sum(i => i.total) };
  const groups = {};
  items.forEach(it => {
    const k = (it.hsn || '-') + '|' + it.pct;
    const g = (groups[k] = groups[k] || { hsn: it.hsn || '-', pct: it.pct, taxable: 0, cgst: 0, sgst: 0, igst: 0 });
    g.taxable += it.taxable; g.cgst += it.cgst; g.sgst += it.sgst; g.igst += it.igst;
  });
  // Place of supply: intra → supplier's state; inter / unset → buyer's state.
  const pos = !isGst ? '' : (inv.stateOfSupply === 'intra' ? _stateLabel(cp.GST) : (_stateLabel(c.gst) || _stateLabel(cp.GST)));
  const grand = parseFloat(inv.total) || totals.gross;
  const received = parseFloat(inv.received) || 0;
  return {
    items, totals, hsnGroups: Object.values(groups).sort((a, b) => String(a.hsn).localeCompare(String(b.hsn)) || a.pct - b.pct), isGst,
    split: isGst && !(totals.igst > 0.005),            // CGST+SGST columns vs one IGST/VAT column
    singleTax: isGst ? 'IGST' : tx.singleLabel,
    taxLabel: isGst ? 'GST' : tx.singleLabel, taxIdLabel: getTerm('taxId'), codeLabel: isGst ? 'HSN/ SAC' : 'Code',
    supplier: { name: cp.CompanyName || 'Your Company', address: cp.Address || '', gstin: cp.GST || '', state: isGst ? _stateLabel(cp.GST) : '', phone: cp.Phone || '', email: cp.Email || '', logo: cp.logo || '' },
    recipient: { name: c.name || inv.clientName || '—', address: c.address || inv.clientAddress || '', gstin: c.gst || '', state: isGst ? _stateLabel(c.gst) : '' },
    meta: {
      no: inv.invoiceNo || '', date: inv.date || '', pos, poNo: inv.poNo || '', poDate: inv.poDate || '',
      reverseCharge: inv.reverseCharge === 'Yes', delivery: inv.delivery || '', payType: inv.payType || 'Credit',
      tcs: parseFloat(inv.tcsAmount) || 0, roundAmt: parseFloat(inv.roundAmt) || 0, grand, received, balance: grand - received,
      words: _words(grand), terms: inv.terms || '', notes: inv.notes || '',
    },
    // Settings → Print: minimum item lines (blank space) and Received/Balance rows.
    minRows: Math.max(0, parseInt(state.printSettings?.invoiceMinRows ?? 0) || 0),
    showReceived: state.printSettings?.invoiceShowReceived !== false,
  };
}

// ── Fonts ───────────────────────────────────────────────────────────────────
const _FONTS = ['NotoSans-Regular.ttf', 'NotoSans-Bold.ttf', 'NotoSans-Black.ttf'];
function _newDoc(fonts) {
  const doc = newColorDoc();
  const F = { sans: 'helvetica', black: 'helvetica', blackStyle: 'bold', custom: false };
  if (fonts) {
    try {
      doc.addFileToVFS('NotoSans-Regular.ttf', fonts['NotoSans-Regular.ttf']); doc.addFont('NotoSans-Regular.ttf', 'INV', 'normal');
      doc.addFileToVFS('NotoSans-Bold.ttf', fonts['NotoSans-Bold.ttf']); doc.addFont('NotoSans-Bold.ttf', 'INV', 'bold');
      doc.addFileToVFS('NotoSans-Black.ttf', fonts['NotoSans-Black.ttf']); doc.addFont('NotoSans-Black.ttf', 'INVBlack', 'normal');
      Object.assign(F, { sans: 'INV', black: 'INVBlack', blackStyle: 'normal', custom: true });
    } catch (e) { console.warn('[Invoice PDF] font registration failed — using Helvetica', e); }
  }
  return { doc, F };
}

// ── Public dispatch ─────────────────────────────────────────────────────────
export async function renderStyledInvoice(inv, styleKey) {
  try {
    if (!window.jspdf || !window.jspdf.jsPDF) return showToast('PDF library not loaded — refresh', 'error');
    const key = resolveInvoiceDesign(styleKey);
    const d = _prep(inv);                              // read state before awaiting
    const fonts = await loadFontFiles(_FONTS);
    const { doc, F } = _newDoc(fonts);
    const sym = (state.currencySettings || {}).symbol || '₹';
    const cur = F.custom ? sym : (sym === '₹' ? 'Rs.' : sym);
    const ctx = { doc, d, F, cur, m: (n) => cur + ' ' + _n2(n) };
    ({ grid: _grid, detailed: _detailed, compact: _compact })[key](ctx);
    mobileSavePDF(doc, 'Tax_Invoice_' + (d.meta.no || 'Invoice').replace(/[\\/]/g, '-') + '.pdf');
    showToast('Invoice PDF downloaded (' + invoiceDesignName(key) + ')');
  } catch (err) {
    console.error('Invoice PDF failed:', err);
    showToast('PDF error: ' + (err && err.message ? err.message : err), 'error');
  }
}

// ── Drawing helpers ─────────────────────────────────────────────────────────
function _setColor(doc, rgb) { doc.setTextColor(rgb[0], rgb[1], rgb[2]); }
function _rule(doc, rgb) { doc.setDrawColor(rgb[0], rgb[1], rgb[2]); doc.setLineWidth(LW); }
function _hline(doc, x0, x1, y, rgb) { _rule(doc, rgb); doc.line(x0, y, x1, y); }
function _vline(doc, x, y0, y1, rgb) { _rule(doc, rgb); doc.line(x, y0, x, y1); }
function _box(doc, x, y, w, h, rgb, fill) {
  _rule(doc, rgb);
  if (fill) { doc.setFillColor(fill[0], fill[1], fill[2]); doc.rect(x, y, w, h, 'FD'); } else doc.rect(x, y, w, h, 'S');
}
function _text(doc, F, s, x, y, size, bold, rgb, opt) {
  doc.setFont(F.sans, bold ? 'bold' : 'normal'); doc.setFontSize(size); _setColor(doc, rgb);
  doc.text(String(s), x, y, opt);
}
/** New page when a block of height h would not fit; returns the y to draw at. */
function _room(doc, y, h) { if (y + h > PAGE_BOTTOM) { doc.addPage(); return 14; } return y; }

/**
 * "Label: value" with a bold value, wrapping the value inside maxW the way the
 * templates do (first line continues after the label). Returns the baseline of
 * the last line drawn.
 */
function _labelValue(doc, F, label, value, x, y, maxW, size, rgb, lh) {
  doc.setFont(F.sans, 'normal'); doc.setFontSize(size);
  const lw = label ? doc.getTextWidth(label) : 0;
  if (label) { _setColor(doc, rgb); doc.text(label, x, y); }
  doc.setFont(F.sans, 'bold');
  let rest = String(value || ''), first = true;
  while (rest.length) {
    const avail = first ? maxW - lw : maxW;
    let cut = rest.length;
    while (cut > 1 && doc.getTextWidth(rest.slice(0, cut)) > avail) cut--;
    if (cut < rest.length) {
      const br = Math.max(rest.lastIndexOf(' ', cut), rest.lastIndexOf('-', cut - 1) + 1, rest.lastIndexOf('/', cut - 1) + 1);
      if (br > 0) cut = br;
      else if (first && lw) { first = false; y += lh; continue; }  // nothing fits after the label → next line
    }
    _setColor(doc, rgb);
    doc.text(rest.slice(0, cut).trimEnd(), first ? x + lw : x, y);
    rest = rest.slice(cut).trimStart();
    first = false;
    if (rest.length) y += lh;
  }
  return y;
}
/** Wrapped plain text; returns the baseline of the last line. */
function _para(doc, F, s, x, y, maxW, size, bold, rgb, lh) {
  doc.setFont(F.sans, bold ? 'bold' : 'normal'); doc.setFontSize(size); _setColor(doc, rgb);
  const lines = doc.splitTextToSize(String(s || ''), maxW);
  lines.forEach((ln, i) => doc.text(ln, x, y + i * lh));
  return y + Math.max(0, lines.length - 1) * lh;
}
/** Largest font size (≤ size) at which s fits in maxW on one line. */
function _fit(doc, font, style, s, maxW, size, min) {
  doc.setFont(font, style);
  while (size > min) { doc.setFontSize(size); if (doc.getTextWidth(String(s)) <= maxW) break; size -= 0.5; }
  doc.setFontSize(size);
  return size;
}

/** Item rows shared by the designs. gstTwoLine → "₹ x\n(18%)" (Detailed/Compact). */
function _itemRows(ctx, { unitCol, gstTwoLine }) {
  const { d, m } = ctx;
  return d.items.map(it => {
    const gst = it.tax || it.pct ? m(it.tax) + (it.pct ? (gstTwoLine ? '\n' : ' ') + '(' + it.pct + '%)' : '') : '';
    const row = [String(it.sr), it.desc, it.hsn, unitCol ? _qty(it.qty) : _qty(it.qty) + (it.unit ? ' ' + it.unit : '')];
    if (unitCol) row.push(it.unit);
    row.push(m(it.rate), gst, m(it.total));
    return row;
  });
}

// ═════════════════════════════════════════════════════════════════════════════
// 1) CLASSIC GRID
// ═════════════════════════════════════════════════════════════════════════════
function _grid(ctx) {
  const { doc, d, F, m } = ctx;
  const INK = BLACK, RULE = GREY_RULE, fs = 7.2, lh = 3.75;
  _text(doc, F, 'Tax Invoice', 106.2, 14.3, 9.8, true, INK, { align: 'center' });

  // ── Letterhead (left) + Invoice No./Date/Place/PO grid (right) ──
  let y = 16.2;
  const s = d.supplier;
  const hasLogo = s.logo && fitImage(doc, s.logo, 17.6, 18.6, 17.5, 20, 'center');
  const tx = hasLogo ? 36.7 : 18.2, tw = 106.1 - tx - 1.5;
  _fit(doc, F.sans, 'bold', s.name, tw, 11.2, 8); _setColor(doc, INK); doc.text(s.name, tx, 21.9);
  let ly = 26.3;
  const lines = [];
  doc.setFont(F.sans, 'normal'); doc.setFontSize(fs);
  if (s.address) lines.push(...doc.splitTextToSize(s.address, tw));
  if (s.phone) lines.push('Phone no.: ' + s.phone);
  if (s.email) lines.push('Email: ' + s.email);
  if (s.gstin) lines.push(d.taxIdLabel + ': ' + s.gstin);
  if (s.state) lines.push('State: ' + s.state);
  lines.forEach(t => { _text(doc, F, t, tx, ly, fs, false, INK); ly += 3.85; });
  const cells = [['Invoice No.', d.meta.no], ['Date', _dmy(d.meta.date, '-')]];
  if (d.meta.pos) cells.push(['Place of supply', d.meta.pos]);
  if (d.meta.poDate) cells.push(['PO date', _dmy(d.meta.poDate, '-')]);
  if (d.meta.poNo) cells.push(['PO number', d.meta.poNo]);
  if (d.meta.reverseCharge) cells.push(['Reverse charge', 'Yes']);
  const gridRows = Math.max(3, Math.ceil(cells.length / 2)), rowH = 9.4;
  const headH = Math.max(28.5, ly - 3.85 + 3.2 - y, gridRows * rowH);
  _box(doc, X0, y, W, headH, RULE);
  _vline(doc, 106.1, y, y + headH, RULE);
  _vline(doc, 151.1, y, y + gridRows * rowH, RULE);
  for (let r = 1; r < gridRows; r++) _hline(doc, 106.1, X1, y + r * rowH, RULE);
  if (gridRows * rowH < headH) _hline(doc, 106.1, X1, y + gridRows * rowH, RULE);
  cells.forEach(([lab, val], i) => {
    const cx = i % 2 ? 152.2 : 107.2, cy = y + Math.floor(i / 2) * rowH;
    _text(doc, F, lab, cx, cy + 3.8, fs, false, INK);
    doc.setFont(F.sans, 'bold'); _fit(doc, F.sans, 'bold', val, 43, fs, 5.5); _setColor(doc, INK); doc.text(String(val), cx, cy + 7.6);
  });
  y += headH;

  // ── Bill To ──
  const r = d.recipient;
  doc.setFont(F.sans, 'normal'); doc.setFontSize(fs);
  const addr = r.address ? doc.splitTextToSize(r.address, W - 3) : [];
  let by = y + 3.7;
  _text(doc, F, 'Bill To', 17.2, by, fs, false, INK); by += 5.3;
  _text(doc, F, r.name, 17.2, by, fs, true, INK); by += 5.3;
  addr.forEach(t => { _text(doc, F, t, 17.2, by, fs, false, INK); by += 3.75; }); if (addr.length) by += 1.55;
  if (r.gstin) { _text(doc, F, d.taxIdLabel + ' : ' + r.gstin, 17.2, by, fs, false, INK); by += 5.3; }
  if (r.state) { _text(doc, F, 'State: ' + r.state, 17.2, by, fs, false, INK); by += 5.3; }
  const billH = by - 5.3 + 2.2 - y;
  _box(doc, X0, y, W, billH, RULE);
  y += billH;

  // ── Items ──
  const head = [['#', 'Item name', d.codeLabel, 'Quantity', 'Unit', 'Price/ Unit', d.taxLabel, 'Amount']];
  const cols = { 0: { cellWidth: 7.1 }, 1: { cellWidth: 45.7, fontStyle: 'bold' }, 2: { cellWidth: 18.9 }, 3: { cellWidth: 20.6, halign: 'right' }, 4: { cellWidth: 18.7, halign: 'right' }, 5: { cellWidth: 22.3, halign: 'right' }, 6: { cellWidth: 22.2, halign: 'right' }, 7: { cellWidth: 24.5, halign: 'right' } };
  const base = { font: F.sans, fontSize: fs, textColor: INK, lineColor: RULE, lineWidth: LW, cellPadding: { top: 1.25, bottom: 1.25, left: 1, right: 1 }, valign: 'middle', minCellHeight: 5.7 };
  doc.setLineHeightFactor(1.3);
  doc.autoTable({
    startY: y, head, body: _itemRows(ctx, { unitCol: true, gstTwoLine: false }), theme: 'grid', rowPageBreak: 'avoid', margin: { left: X0, right: 210 - X1, bottom: 12 },
    styles: base, headStyles: { fontStyle: 'bold', fillColor: false }, bodyStyles: { fillColor: false }, columnStyles: cols,
    didParseCell: (c) => { if (c.section === 'head') c.cell.styles.halign = c.column.index >= 3 ? 'right' : 'left'; },
  });
  doc.autoTable({
    startY: doc.lastAutoTable.finalY, theme: 'grid', rowPageBreak: 'avoid', margin: { left: X0, right: 210 - X1, bottom: 12 },
    body: [['', '', '', '', '', '', '', ''], ['', 'Total', '', _qty(d.totals.qty), '', '', m(d.totals.tax), m(d.totals.gross)]],
    styles: { ...base, fontStyle: 'bold' }, bodyStyles: { fillColor: false }, columnStyles: cols,
    didParseCell: (c) => { if (c.row.index === 0) c.cell.styles.minCellHeight = Math.max(11.1, (d.minRows - d.items.length) * 5.7); },
  });
  y = doc.lastAutoTable.finalY;

  // ── Amount in words / payment mode  |  Amounts ──
  const amt = [['Sub Total', m(d.totals.gross)]];
  if (d.meta.tcs) amt.push(['TCS', m(d.meta.tcs)]);
  if (d.meta.roundAmt) amt.push(['Round off', m(d.meta.roundAmt)]);
  doc.setFont(F.sans, 'bold'); doc.setFontSize(fs);
  const wl = doc.splitTextToSize(d.meta.words, 106.1 - 17.2 - 2);
  const leftH = 11 + wl.length * lh + 12.2;
  const rightH = 5.6 * (amt.length + (d.showReceived ? 4 : 2)) + 4.5;
  const blkH = Math.max(32.9, leftH, rightH);
  y = _room(doc, y, blkH);
  _box(doc, X0, y, W, blkH, RULE); _vline(doc, 106.1, y, y + blkH, RULE);
  let wy = y + 3.6;
  _text(doc, F, 'Invoice Amount in Words', 17.2, wy, fs, false, INK); wy += 5.6;
  wl.forEach(t => { _text(doc, F, t, 17.2, wy, fs, true, INK); wy += lh; });
  _hline(doc, X0, 106.1, wy - lh + 2.1, RULE);
  wy += 1.4;
  _text(doc, F, 'Payment mode', 17.2, wy, fs, false, INK); wy += 5.2;
  _text(doc, F, d.meta.payType, 17.2, wy, fs, true, INK);
  let ay = y + 3.6;
  _text(doc, F, 'Amounts', 107.2, ay, fs, true, INK); ay += 5.6;
  amt.forEach(([l, v]) => { _text(doc, F, l, 107.2, ay, fs, false, INK); _text(doc, F, v, 195.2, ay, fs, false, INK, { align: 'right' }); ay += 5.4; });
  _hline(doc, 106.1, X1, ay - 3.9, RULE);
  _text(doc, F, 'Total', 107.2, ay, fs, true, INK); _text(doc, F, m(d.meta.grand), 195.2, ay, fs, true, INK, { align: 'right' });
  if (d.showReceived) {
    _hline(doc, 106.1, X1, ay + 1.9, [208, 208, 208]); ay += 5.6;
    _text(doc, F, 'Received', 107.2, ay, fs, false, INK); _text(doc, F, m(d.meta.received), 195.2, ay, fs, false, INK, { align: 'right' });
    _hline(doc, 106.1, X1, ay + 1.9, RULE); ay += 5.6;
    _text(doc, F, 'Balance', 107.2, ay, fs, false, INK); _text(doc, F, m(d.meta.balance), 195.2, ay, fs, false, INK, { align: 'right' });
  }
  y += blkH;

  // ── HSN-wise tax table ──
  y = _taxTable(ctx, {
    y, x: X0, widths: d.split ? [29.1, 34.0, 12.3, 26.6, 12.3, 26.6, 39.1] : [29.1, 34.0, 19.5, 58.3, 39.1],
    ink: INK, rule: RULE, fs, headFill: false, rupee: true, pctSuffix: '%', taxableHead: 'Taxable amount',
    totalHead: 'Total Tax Amount', rateHead: 'Rate', amtHead: 'Amount', totalLabel: 'Total', totalAlign: 'right',
    rowH: 5.6, headH: [5.9, 5.6],
  });

  // ── Terms / notes (only when present) ──
  y = _notesBlock(ctx, y, { ink: INK, rule: RULE, fs, band: false });

  // ── Signature ──
  y = _room(doc, y, 34.8);
  _box(doc, X0, y, W, 34.8, RULE);
  _text(doc, F, 'For : ' + d.supplier.name, 166.1, y + 7.2, fs, false, INK, { align: 'center' });
  _text(doc, F, 'Authorized Signatory', 166.1, y + 31.0, fs, true, INK, { align: 'center' });
}

// ═════════════════════════════════════════════════════════════════════════════
// 2) GST DETAILED  &  3) GST COMPACT  (shared slate / grey-band family)
// ═════════════════════════════════════════════════════════════════════════════
function _detailed(ctx) { _slate(ctx, false); }
function _compact(ctx) { _slate(ctx, true); }

function _band(doc, F, x, y, w, h, label, fs) {
  _box(doc, x, y, w, h, SLATE, BAND);
  if (label) _text(doc, F, label, x + 1.3, y + h / 2 + fs * 0.13, fs, true, SLATE);
}

function _slate(ctx, compact) {
  const { doc, d, F, m } = ctx;
  const fs = compact ? 7.6 : 8.4, lh = compact ? 3.95 : 4.5;
  const s = d.supplier, r = d.recipient;
  _text(doc, F, 'Tax Invoice', 106.2, compact ? 17.0 : 17.9, compact ? 15.5 : 17, true, SLATE, { align: 'center' });

  // ── Letterhead ──
  let y = compact ? 21.7 : 23.0;
  let hy;
  if (!compact) {
    const hasLogo = s.logo && fitImage(doc, s.logo, 18.2, 24.4, 28, 29, 'center');
    const tx = hasLogo ? 47.2 : 18.2;
    _fit(doc, F.black, F.blackStyle, s.name, X1 - tx - 2, 21.5, 11); _setColor(doc, SLATE); doc.text(s.name, tx, 32.6);
    hy = 39.8;
    if (s.address) hy = _para(doc, F, s.address, tx, hy, X1 - tx - 2, fs, false, SLATE, lh) + 6.6;
    else hy += 2.1;
    const pairRow = (l1, v1, l2, v2) => {
      if (v1) _labelValue(doc, F, l1, v1, tx, hy, 122.1 - tx - 2, fs, SLATE, lh);
      if (v2) _labelValue(doc, F, l2, v2, 122.1, hy, X1 - 122.1 - 1, fs, SLATE, lh);
      if (v1 || v2) hy += 5.6;
    };
    pairRow('Phone:  ', s.phone, 'Email:  ', s.email);
    pairRow(d.taxIdLabel + ':  ', s.gstin, 'State:  ', s.state);
    const headH = Math.max(31.5, hy - 5.6 + 2.5 - y);
    _box(doc, X0, y, W, headH, SLATE);
    y += headH;
  } else {
    _fit(doc, F.black, F.blackStyle, s.name, W - 3, 19, 10); _setColor(doc, SLATE); doc.text(s.name, 17.5, 29.6);
    hy = 36.8;
    let topRule = 32.3;
    if (s.address) { hy = _para(doc, F, s.address, 17.5, hy, W - 3, fs, false, SLATE, lh) + 5.1; }
    _hline(doc, X0, X1, topRule, SLATE);
    const row = (l1, v1, l2, v2) => {
      if (!v1 && !v2) return;
      if (v1) _labelValue(doc, F, l1, v1, 17.5, hy, 106.3 - 17.5 - 2, fs, SLATE, lh);
      if (v2) _labelValue(doc, F, l2, v2, 107.3, hy, X1 - 107.3 - 1, fs, SLATE, lh);
      hy += 5.1;
    };
    row('Phone:  ', s.phone, 'Email:  ', s.email);
    row(d.taxIdLabel + ':  ', s.gstin, 'State:  ', s.state);
    const headH = Math.max(17.2, hy - 5.1 + 2.1 - y);
    _box(doc, X0, y, W, headH, SLATE);
    y += headH;
  }

  // ── Bill To | Invoice Details ──
  const bandH = compact ? 6.4 : 6.9;
  _band(doc, F, X0, y, 106.3 - X0, bandH, 'Bill To:', fs);
  _band(doc, F, 106.3, y, X1 - 106.3, bandH, 'Invoice Details:', fs);
  y += bandH;
  const top = y;
  let ly = y + (compact ? 4.0 : 4.9);
  ly = _para(doc, F, r.name, 17.5, ly, 106.3 - 17.5 - 2, fs, true, SLATE, lh) + (compact ? 5.1 : 5.5);
  if (r.address) ly = _para(doc, F, r.address, 17.5, ly, 106.3 - 17.5 - 2, fs, false, SLATE, lh) + 5.6;
  if (r.gstin || r.state) {
    if (r.gstin) _labelValue(doc, F, d.taxIdLabel + ':  ', r.gstin, 17.5, ly, 52, fs, SLATE, lh);
    if (r.state) _labelValue(doc, F, 'State:  ', r.state, 70.5, ly, 106.3 - 70.5 - 1, fs, SLATE, lh);
    ly += 5.6;
  }
  const detA = [['Invoice No.:  ', d.meta.no], ['Date:  ', _dmy(d.meta.date, '/')]];
  if (d.meta.pos) detA.push(['Place Of Supply:  ', d.meta.pos]);
  if (d.meta.reverseCharge) detA.push(['Reverse Charge:  ', 'Yes']);
  const detB = [];
  if (d.meta.poDate) detB.push(['PO Date:  ', _dmy(d.meta.poDate, '/')]);
  if (d.meta.poNo) detB.push(['PO No:', d.meta.poNo, true]);
  const splitDet = detB.length > 0;
  const aW = splitDet ? 151.4 - 107.7 - 1.5 : X1 - 107.7 - 1.5;
  let ay = y + (compact ? 4.0 : 4.9);
  detA.forEach(([l, v]) => { ay = _labelValue(doc, F, l, v, 107.7, ay, aW, fs, SLATE, lh) + (compact ? 5.1 : 5.5); });
  let bY = y + (compact ? 4.0 : 4.9);
  detB.forEach(([l, v, ownLine]) => {
    if (ownLine) { _text(doc, F, l, 152.5, bY, fs, false, SLATE); bY = _para(doc, F, v, 152.5, bY + lh, X1 - 152.5 - 1.5, fs, true, SLATE, lh) + 5.5; }
    else bY = _labelValue(doc, F, l, v, 152.5, bY, X1 - 152.5 - 1.5, fs, SLATE, lh) + 5.5;
  });
  const detH = Math.max(compact ? 11.3 : 26.9, Math.max(ly, ay, bY) - (compact ? 5.1 : 5.5) + 2.6 - top);
  _box(doc, X0, top, W, detH, SLATE);
  _vline(doc, 106.3, top, top + detH, SLATE);
  if (splitDet) _vline(doc, 151.4, top, top + detH, SLATE);
  y = top + detH;

  // ── Transportation (Detailed only) ──
  if (!compact) {
    _band(doc, F, X0, y, W, 6.9, 'Transportation Details:', fs); y += 6.9;
    _box(doc, X0, y, W, 7.0, SLATE);
    _labelValue(doc, F, 'Delivery Location:  ', d.meta.delivery, 17.5, y + 4.6, W - 3, fs, SLATE, lh);
    y += 7.0;
  }
  y += compact ? 2.4 : 2.3;

  // ── Items ──
  const unitCol = !compact;
  const head = [unitCol
    ? ['#', 'Item name', d.codeLabel, 'Quantity', 'Unit', `Price/ Unit(${ctx.cur})`, `${d.taxLabel}(${ctx.cur})`, `Amount(${ctx.cur})`]
    : ['#', 'Item name', d.codeLabel, 'Quantity', `Price/ Unit(${ctx.cur})`, `${d.taxLabel}(${ctx.cur})`, `Amount(${ctx.cur})`]];
  const widths = unitCol ? [6.5, 41.8, 17.2, 21.7, 17.2, 24.4, 24.4, 26.8] : [7.6, 48.9, 20.1, 22.3, 25.9, 26.8, 28.4];
  const cols = {};
  widths.forEach((w, i) => { cols[i] = { cellWidth: w, halign: i >= 3 ? 'right' : 'left' }; });
  cols[1].fontStyle = 'bold';
  const pad = compact ? { top: 1.6, bottom: 1.6, left: 1.3, right: 1.3 } : { top: 2.1, bottom: 2.1, left: 1.3, right: 1.3 };
  const base = { font: F.sans, fontSize: fs, textColor: SLATE, lineColor: SLATE, lineWidth: LW, cellPadding: pad, valign: 'middle', overflow: 'linebreak' };
  doc.setLineHeightFactor(compact ? 1.47 : 1.5);
  const mgn = { left: X0, right: 210 - X1, bottom: 12 };
  doc.autoTable({
    startY: y, head, body: _itemRows(ctx, { unitCol, gstTwoLine: true }), theme: 'grid', rowPageBreak: 'avoid', margin: mgn,
    styles: base, headStyles: { fontStyle: 'bold', fillColor: BAND, minCellHeight: compact ? 7.2 : 12.7 }, bodyStyles: { fillColor: false }, columnStyles: cols,
    didParseCell: (c) => { if (c.section === 'head') c.cell.styles.halign = c.column.index >= 3 ? 'right' : 'left'; },
  });
  let fy = doc.lastAutoTable.finalY;
  // Bottom block (tax summary | totals panel) height, needed to size the filler.
  const sumRows = [['Sub Total', m(d.totals.gross)]];
  if (d.meta.tcs) sumRows.push(['TCS', m(d.meta.tcs)]);
  if (d.meta.roundAmt) sumRows.push(['Round Off', m(d.meta.roundAmt)]);
  doc.setFont(F.sans, 'normal'); doc.setFontSize(fs);
  const wl = doc.splitTextToSize(d.meta.words, X1 - 134.7 - 1.5);
  const rStep = compact ? 5.1 : 5.6;
  const rightH = sumRows.length * rStep + 1.5 + 6.8 + 6.9 + wl.length * lh + 3 + (d.showReceived ? 2 * rStep : 0) + 1.5;
  const leftH = compact ? 6.3 + 16.1 + (d.hsnGroups.length + 1) * 10.1 : 6.8 + 18.2 + (d.hsnGroups.length + 1) * 11.4 + 13.8;
  const blockH = Math.max(leftH, rightH);
  // Filler: Detailed keeps one tall blank row; Compact runs the grid down so the
  // signature box ends at the template's foot (278.4 mm).
  const totalRowH = compact ? 7.4 : 8.2;
  let filler = compact ? Math.max(0, 278.4 - 26.0 - 2.3 - blockH - 0.4 - totalRowH - fy) : Math.max(15.9, (d.minRows - d.items.length) * 8.0);
  if (compact && doc.internal.getNumberOfPages() > 1) filler = 0;
  const blank = widths.map(() => '');
  const total = unitCol
    ? ['', 'Total', '', _qty(d.totals.qty), '', '', m(d.totals.tax), m(d.totals.gross)]
    : ['', 'Total', '', _qty(d.totals.qty), '', m(d.totals.tax), m(d.totals.gross)];
  doc.autoTable({
    startY: fy, theme: 'grid', rowPageBreak: 'avoid', margin: mgn, body: filler > 0.5 ? [blank, total] : [total],
    styles: { ...base, fontStyle: 'bold' }, bodyStyles: { fillColor: false }, columnStyles: cols,
    didParseCell: (c) => {
      if (filler > 0.5 && c.row.index === 0) { c.cell.styles.minCellHeight = filler; c.cell.styles.cellPadding = 0; }
      else c.cell.styles.minCellHeight = totalRowH;
    },
  });
  y = doc.lastAutoTable.finalY + 0.4;

  // ── Tax Summary (left)  |  totals panel (right) ──
  const LX1 = 133.3;
  y = _room(doc, y, blockH);
  const top2 = y;
  _band(doc, F, X0, y, LX1 - X0, compact ? 6.3 : 6.8, 'Tax Summary:', fs);
  let ty = _taxTable(ctx, {
    y: y + (compact ? 6.3 : 6.8), x: X0,
    widths: d.split ? (compact ? [19.0, 22.2, 11.2, 14.2, 10.8, 14.3, 25.4] : [19.0, 22.2, 11.9, 13.5, 11.9, 13.2, 25.4]) : [19.0, 22.2, 14.0, 36.5, 25.4],
    ink: SLATE, rule: SLATE, fs, headFill: false, rupee: false, pctSuffix: '', taxableHead: `Taxable\namount (${ctx.cur})`,
    totalHead: `Total Tax (${ctx.cur})`, rateHead: 'Rate\n(%)', amtHead: compact ? `Amt (${ctx.cur})` : `Amt\n(${ctx.cur})`, totalLabel: 'TOTAL', totalAlign: 'right',
    rowH: compact ? 10.1 : 11.4, headH: compact ? [6.1, 10.0] : [6.8, 11.4], boldTotal: true, rightEdge: LX1,
  });
  if (!compact) {
    _band(doc, F, X0, ty, LX1 - X0, 6.8, 'Payment Mode:', fs); ty += 6.8;
    _box(doc, X0, ty, LX1 - X0, 7.0, SLATE);
    _text(doc, F, d.meta.payType, 17.5, ty + 4.6, fs, false, SLATE); ty += 7.0;
  }
  // Right panel
  let ry = top2 + (compact ? 4.3 : 4.6);
  const rowLV = (l, v, bold) => {
    _text(doc, F, l, 134.7, ry, fs, bold, SLATE); _text(doc, F, ':', 155.7, ry, fs, bold, SLATE);
    _text(doc, F, v, 195.0, ry, fs, bold, SLATE, { align: 'right' });
  };
  sumRows.forEach(([l, v]) => { rowLV(l, v, false); ry += rStep; });
  let rl = ry - rStep + (compact ? 1.9 : 1.9) + (compact ? 0 : 0);
  _hline(doc, LX1, X1, rl, SLATE);
  ry = rl + (compact ? 4.3 : 4.6);
  rowLV('Total', m(d.meta.grand), true);
  rl = ry + 1.9;
  _band(doc, F, LX1, rl, X1 - LX1, compact ? 6.4 : 7.0, 'Invoice Amount in Words:', fs);
  ry = rl + (compact ? 6.4 : 7.0) + (compact ? 4.3 : 4.6);
  wl.forEach(t => { _text(doc, F, t, 134.7, ry, fs, false, SLATE); ry += lh; });
  rl = ry - lh + 2.2; _hline(doc, LX1, X1, rl, SLATE);
  let rBottom = rl;
  if (d.showReceived) {
    ry = rl + (compact ? 3.9 : 4.4);
    rowLV('Received', m(d.meta.received), false); ry += rStep;
    rowLV('Balance', m(d.meta.balance), false);
    rBottom = ry + 1.9;
    _hline(doc, LX1, X1, rBottom, SLATE);
  }
  const bottom = Math.max(ty, rBottom);
  _box(doc, X0, top2, W, bottom - top2, SLATE);
  _vline(doc, LX1, top2, bottom, SLATE);
  y = bottom;

  // ── Terms / notes (only when present) ──
  y = _notesBlock(ctx, y + 2.3, { ink: SLATE, rule: SLATE, fs, band: true, lh }) - (d.meta.terms || d.meta.notes ? 0 : 2.3);

  // ── Signature box ──
  const sigH = compact ? 26.0 : 29.2, sb = compact ? 6.3 : 6.9;
  y = _room(doc, y + 2.3, sigH);
  _band(doc, F, 106.3, y, X1 - 106.3, sb, 'For ' + s.name + ':', fs);
  _box(doc, 106.3, y + sb, X1 - 106.3, sigH - sb, SLATE);
  _text(doc, F, 'Authorized Signatory', 151.3, y + sigH - (compact ? 3.4 : 3.3), fs + 0.6, false, SLATE, { align: 'center' });
}

// ── HSN / rate-wise tax table (shared) ──────────────────────────────────────
function _taxTable(ctx, o) {
  const { doc, d, F, m } = ctx;
  const money = (n) => o.rupee ? m(n) : _n2(n);
  const rate = (p) => p ? (Number.isInteger(p) ? String(p) : _n2(p).replace(/0$/, '')) + o.pctSuffix : '';
  let head, body, foot;
  if (d.split) {
    head = [
      [{ content: d.codeLabel, rowSpan: 2 }, { content: o.taxableHead, rowSpan: 2 }, { content: 'CGST', colSpan: 2 }, { content: 'SGST', colSpan: 2 }, { content: o.totalHead, rowSpan: 2 }],
      [o.rateHead, o.amtHead, o.rateHead, o.amtHead],
    ];
    body = d.hsnGroups.map(g => [g.hsn, money(g.taxable), rate(g.pct / 2), money(g.cgst), rate(g.pct / 2), money(g.sgst), money(g.cgst + g.sgst)]);
    foot = [o.totalLabel, money(d.totals.taxable), '', money(d.totals.cgst), '', money(d.totals.sgst), money(d.totals.cgst + d.totals.sgst)];
  } else {
    head = [
      [{ content: d.codeLabel, rowSpan: 2 }, { content: o.taxableHead, rowSpan: 2 }, { content: d.singleTax, colSpan: 2 }, { content: o.totalHead, rowSpan: 2 }],
      [o.rateHead, o.amtHead],
    ];
    body = d.hsnGroups.map(g => [g.hsn, money(g.taxable), rate(g.pct), money(g.igst), money(g.igst)]);
    foot = [o.totalLabel, money(d.totals.taxable), '', money(d.totals.igst), money(d.totals.igst)];
  }
  const cols = {};
  o.widths.forEach((w, i) => { cols[i] = { cellWidth: w, halign: i === 0 ? 'left' : 'right' }; });
  const width = o.widths.reduce((a, b) => a + b, 0);
  let y = _room(doc, o.y, o.headH[0] + o.headH[1] + (body.length + 1) * o.rowH);
  doc.autoTable({
    startY: y, head, body: [...body, foot], theme: 'grid', rowPageBreak: 'avoid', tableWidth: width,
    margin: { left: o.x, right: 210 - o.x - width, bottom: 12 },
    styles: { font: F.sans, fontSize: o.fs, textColor: o.ink, lineColor: o.rule, lineWidth: LW, valign: 'middle', cellPadding: { top: 1.1, bottom: 1.1, left: 1.2, right: 1.2 }, minCellHeight: o.rowH, overflow: 'linebreak' },
    headStyles: { fontStyle: 'bold', fillColor: false, halign: 'center' },
    bodyStyles: { fillColor: false },
    columnStyles: cols,
    didParseCell: (c) => {
      if (c.section === 'head') { c.cell.styles.minCellHeight = o.headH[c.row.index] || 5.6; return; }
      if (c.row.index === body.length) { c.cell.styles.fontStyle = 'bold'; if (c.column.index === 0) c.cell.styles.halign = o.totalAlign; }
    },
  });
  return doc.lastAutoTable.finalY;
}

// ── Terms & conditions / notes (drawn only when the invoice has them) ───────
function _notesBlock(ctx, y, o) {
  const { doc, d, F } = ctx;
  const parts = [];
  if (d.meta.terms) parts.push(['Terms and Conditions:', d.meta.terms]);
  if (d.meta.notes) parts.push(['Notes:', d.meta.notes]);
  if (!parts.length) return y;
  const lh = o.lh || 3.75;
  parts.forEach(([label, text]) => {
    doc.setFont(F.sans, 'normal'); doc.setFontSize(o.fs);
    const lines = doc.splitTextToSize(text, W - 3);
    const h = (o.band ? 6.8 : 5.6) + lines.length * lh + 2.6;
    y = _room(doc, y, h);
    if (o.band) { _band(doc, F, X0, y, W, 6.8, label, o.fs); _box(doc, X0, y + 6.8, W, h - 6.8, o.rule); }
    else { _box(doc, X0, y, W, h, o.rule); _text(doc, F, label, 17.2, y + 3.7, o.fs, false, o.ink); }
    let ty = y + (o.band ? 6.8 + 4.4 : 9.0);
    lines.forEach(t => { _text(doc, F, t, 17.5, ty, o.fs, false, o.ink); ty += lh; });
    y += h;
  });
  return y;
}
