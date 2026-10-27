/**
 * ═══════════════════════════════════════════════════════════
 * True Site Sync — Estimate documents: Classic & Modern PDF + Excel
 * ═══════════════════════════════════════════════════════════
 * Both templates draw on A4 (210 × 297 mm) with 16 mm margins all round and
 * use the locked brand palette below — templates never take user colours.
 * They are built from the ORIGINAL jsPDF constructor (newColorDoc), so the
 * app-wide black-and-white PDF mode does not strip the brand colours.
 *
 * Page-break rules (both templates):
 *   • table rows never split (autoTable rowPageBreak:'avoid'), header repeats;
 *   • the totals block and the signature block are kept whole;
 *   • T&C flows clause by clause and line by line — a line is never cut, and
 *     the heading always travels with at least its first two lines;
 *   • every continuation page gets a compact header; every page a footer with
 *     "Page n of N" (drawn last, once the page count is known).
 *
 * Data comes from estimateDoc.buildEstimateModel(), so the PDF, the Excel file
 * and the on-screen preview (which IS this PDF) always show the same thing.
 * ═══════════════════════════════════════════════════════════
 */
import { state } from './state.js';
import { mobileSavePDF, mobileSaveXLSX, amountToWordsCur, showToast } from './utils.js';
import { fitImage, loadFontFiles, newColorDoc, fmtLongDate } from './pdfModernTheme.js?v=1.2.0';
import { buildEstimateModel } from './estimateDoc.js';

/* ── Locked brand palette (RGB) ── */
export const BRAND = {
  INK: [17, 24, 39],        // #111827 primary text
  INK2: [75, 85, 99],       // #4B5563 secondary text
  MUTED: [107, 114, 128],   // #6B7280 labels, footer
  RULE: [229, 231, 235],    // #E5E7EB row hairlines
  NAVY: [15, 27, 45],       // #0F1B2D Modern colour block
  NAVY2: [30, 48, 80],      // #1E3050 Modern second tone
  SKY: [203, 213, 225],     // #CBD5E1 text on navy
  ACCENT: [217, 72, 31],    // #D9481F brand accent (rules, total bar, numbers)
  ACCENT_SOFT: [252, 236, 229], // #FCECE5 accent tint
  ZEBRA: [247, 248, 250],   // #F7F8FA alternate rows / cards
  WHITE: [255, 255, 255],
};
const W = 210, H = 297, M = 16, CW = W - 2 * M;

/* ── fonts: URW Gothic (headings, Century-Gothic look) + Noto Sans (body, has ₹) ── */
const FONT_FILES = ['URWGothic-Book.ttf', 'URWGothic-Demi.ttf', 'NotoSans-Regular.ttf', 'NotoSans-Bold.ttf', 'NotoSans-Black.ttf'];
async function newDoc() {
  const doc = newColorDoc('portrait');
  const F = { head: 'helvetica', sans: 'helvetica', black: 'helvetica', blackStyle: 'bold', ok: false };
  const files = await loadFontFiles(FONT_FILES);
  if (files) {
    try {
      const reg = (file, fam, style) => { doc.addFileToVFS(file, files[file]); doc.addFont(file, fam, style); };
      reg('URWGothic-Book.ttf', 'EHead', 'normal'); reg('URWGothic-Demi.ttf', 'EHead', 'bold');
      reg('NotoSans-Regular.ttf', 'ESans', 'normal'); reg('NotoSans-Bold.ttf', 'ESans', 'bold');
      reg('NotoSans-Black.ttf', 'EBlack', 'normal');
      Object.assign(F, { head: 'EHead', sans: 'ESans', black: 'EBlack', blackStyle: 'normal', ok: true });
    } catch (e) { console.warn('[Estimate PDF] font registration failed — Helvetica', e); }
  }
  return { doc, F };
}

/* ── small drawing helpers ── */
function mk(doc, F) {
  const sym = (state.currencySettings || {}).symbol || '₹';
  const cur = F.ok || sym !== '₹' ? sym : 'Rs.';       // core fonts have no ₹ glyph
  const locale = (state.currencySettings || {}).locale || 'en-IN';
  const num = (n) => (Number(n) || 0).toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const qty = (n) => (Number(n) || 0).toLocaleString(locale, { maximumFractionDigits: 3 });
  const t = (str, x, y, o = {}) => {
    doc.setFont(o.font || F.sans, o.style || 'normal'); doc.setFontSize(o.size || 9);
    const c = o.color || BRAND.INK; doc.setTextColor(c[0], c[1], c[2]);
    const s2 = String(str == null ? '' : str);
    const opts = {}; if (o.maxWidth) opts.maxWidth = o.maxWidth;
    if (o.cs) {                                   // jsPDF aligns without charSpace → place it ourselves
      opts.charSpace = o.cs;
      const w = doc.getTextWidth(s2) + o.cs * Math.max(0, s2.length - 1);
      if (o.align === 'right') x -= w; else if (o.align === 'center') x -= w / 2;
    } else if (o.align) opts.align = o.align;
    doc.text(s2, x, y, opts);
  };
  const wrap = (str, w, size, font = F.sans, style = 'normal') => { doc.setFont(font, style); doc.setFontSize(size); return doc.splitTextToSize(String(str || ''), w); };
  const fill = (c) => doc.setFillColor(c[0], c[1], c[2]);
  const draw = (c) => doc.setDrawColor(c[0], c[1], c[2]);
  const lh = (pt, k = 1.38) => pt * 0.3528 * k;          // line height in mm
  return { cur, num, qty, t, wrap, fill, draw, lh };
}
const companyDetails = (c) => [c.address, [c.phone && 'Ph: ' + c.phone, c.email].filter(Boolean).join('   ·   '), c.gst && 'GSTIN: ' + c.gst].filter(Boolean);
const dateStr = (d) => (d ? fmtLongDate(d) : '');

/** Flowing-content cursor shared by both templates (manual blocks after the table). */
function flow(doc, { top, bottom, contTop, onNewPage }) {
  const f = { y: top, limit: H - bottom, contTop };
  f.need = (h) => { if (f.y + h > f.limit) { doc.addPage(); f.y = onNewPage(doc.getNumberOfPages()); return true; } return false; };
  f.breakNow = () => { doc.addPage(); f.y = onNewPage(doc.getNumberOfPages()); };
  // A measuring copy: same maths, draws nothing, never adds pages.
  f.dry = () => { const d = { y: f.y, limit: f.limit, contTop, isDry: true }; d.need = (h) => { if (d.y + h > d.limit) { d.y = contTop; return true; } return false; }; d.breakNow = () => { d.y = contTop; }; return d; };
  return f;
}
const SIG_H = 27;   // signature block height (kept whole)

/**
 * T&C + signatures with a keep-together rule: if the signature block would end
 * up alone on a new page, the last two clauses move over with it.
 */
function drawClosing(doc, h, f, model, style, F, accent) {
  const probe = f.dry();
  drawTerms(doc, h, probe, model, style);
  let breakAt = -1;
  if (model.terms.length && probe.y + SIG_H > probe.limit) breakAt = Math.max(0, model.terms.length - 2);
  drawTerms(doc, h, f, model, style, breakAt);
  drawSignatures(doc, h, f, model, F, accent);
}

/** T&C, clause by clause; never cuts a line, heading keeps its first two lines.
 *  breakAt = clause index that must start a new page (keep-together), or -1. */
function drawTerms(doc, h, f, model, style, breakAt = -1) {
  if (!model.terms.length) return;
  const size = 8.8, L = h.lh(size, 1.45), indent = 7, w = CW - indent;
  const first = h.wrap(model.terms[0], w, size);
  if (breakAt === 0) f.breakNow();
  else f.need(style.headH + Math.min(first.length, 2) * L + 2);
  if (!f.isDry) style.heading(f.y);
  f.y += style.headH;
  model.terms.forEach((clause, i) => {
    const lines = h.wrap(clause, w, size);
    if (i && i === breakAt) f.breakNow();
    else f.need(Math.min(lines.length, 2) * L);       // a clause starts with ≥ 2 lines on the page
    if (!f.isDry) style.number(i + 1, f.y);
    lines.forEach((ln, k) => {
      if (k) f.need(L);                                 // a long clause continues on the next page
      if (!f.isDry) h.t(ln, M + indent, f.y, { size, color: BRAND.INK2 });
      f.y += L;
    });
    f.y += 1.4;
  });
}

/** Signature row: client acceptance (left) and company signatory (right), kept whole. */
function drawSignatures(doc, h, f, model, F, accent) {
  f.need(SIG_H); f.y += 6;                  // the whole block stays together
  const y = f.y + 13;
  h.draw(BRAND.INK2); doc.setLineWidth(0.25);
  doc.line(M, y, M + 64, y); doc.line(W - M - 64, y, W - M, y);
  h.t('Accepted by client', M, f.y, { size: 8, color: BRAND.MUTED, font: F.head, style: 'bold', cs: 0.3 });
  h.t('Name, signature & date', M, y + 4.5, { size: 7.5, color: BRAND.MUTED });
  h.t(`For ${model.company.name || 'the company'}`, W - M, f.y, { size: 8.5, style: 'bold', align: 'right' });
  h.t('Authorised signatory', W - M, y + 4.5, { size: 7.5, color: BRAND.MUTED, align: 'right' });
  if (accent) { h.fill(accent); doc.rect(W - M - 64, y - 0.2, 14, 0.8, 'F'); }
  f.y = y + 6;
}

/* ═════════════ Template 1 · Classic ═════════════ */
async function renderClassic(model) {
  const { doc, F } = await newDoc();
  const h = mk(doc, F);
  // header
  let lx = M, top = M;
  const logo = model.company.logo ? fitImage(doc, model.company.logo, M, top, 32, 20) : null;
  if (logo) lx = M + logo.w + 6;
  const rightW = 62, leftW = W - M - rightW - lx - 4;
  let ly = top + 6;
  h.wrap(model.company.name || 'Your Company', leftW, 16, F.head, 'bold').forEach(l => { h.t(l, lx, ly, { font: F.head, style: 'bold', size: 16 }); ly += h.lh(16, 1.15); });
  ly += 0.6;
  companyDetails(model.company).forEach(d => h.wrap(d, leftW, 8).forEach(l => { h.t(l, lx, ly, { size: 8, color: BRAND.INK2 }); ly += h.lh(8); }));
  h.t('ESTIMATE', W - M, top + 8, { font: F.head, style: 'bold', size: 22, align: 'right', cs: 1.4 });
  h.t(`No. ${model.number}`, W - M, top + 15, { size: 9, align: 'right', style: 'bold' });
  if (model.date) h.t(dateStr(model.date), W - M, top + 19.6, { size: 9, align: 'right', color: BRAND.INK2 });
  let y = Math.max(ly, top + 22, logo ? logo.y + logo.h : 0) + 3;
  h.draw(BRAND.INK); doc.setLineWidth(0.35); doc.line(M, y, W - M, y);
  h.fill(BRAND.ACCENT); doc.rect(M, y + 0.9, 26, 1.1, 'F');
  // parties
  y += 10;
  const colW = CW / 2 - 6;
  const label = (s, x, yy) => h.t(s, x, yy, { font: F.head, style: 'bold', size: 7.5, color: BRAND.MUTED, cs: 0.6 });
  label('PREPARED FOR', M, y); label('PROJECT', M + CW / 2 + 6, y);
  let cy = y + 5.5;
  h.wrap(model.client.name || '—', colW, 11.5, F.sans, 'bold').forEach(l => { h.t(l, M, cy, { size: 11.5, style: 'bold' }); cy += h.lh(11.5, 1.2); });
  [model.client.address, model.client.gst && 'GSTIN: ' + model.client.gst, model.client.phone && 'Ph: ' + model.client.phone].filter(Boolean)
    .forEach(d => h.wrap(d, colW, 8.8).forEach(l => { h.t(l, M, cy, { size: 8.8, color: BRAND.INK2 }); cy += h.lh(8.8); }));
  let py = y + 5.5;
  h.wrap(model.project || '—', colW, 11.5, F.sans, 'bold').forEach(l => { h.t(l, M + CW / 2 + 6, py, { size: 11.5, style: 'bold' }); py += h.lh(11.5, 1.2); });
  py += 2.5; label('ESTIMATE VALUE', M + CW / 2 + 6, py); py += 5.2;
  h.t(`${h.cur} ${h.num(model.total)}`, M + CW / 2 + 6, py, { size: 12, style: 'bold' }); py += 2;
  y = Math.max(cy, py) + 8;

  const cont = (pageNo) => {           // compact header on continuation pages
    h.t(model.company.name || '', M, M + 2, { font: F.head, style: 'bold', size: 10 });
    h.t(`Estimate ${model.number} — continued`, W - M, M + 2, { size: 8.5, color: BRAND.INK2, align: 'right' });
    h.draw(BRAND.INK); doc.setLineWidth(0.3); doc.line(M, M + 5, W - M, M + 5);
    return M + 12;
  };
  doc.autoTable({
    startY: y, margin: { left: M, right: M, top: M + 12, bottom: 22 },
    head: [['#', 'Description', 'Qty', 'Unit', `Rate (${h.cur})`, `Amount (${h.cur})`]],
    body: model.items.map(r => [r.sn, r.desc, h.qty(r.qty), r.unit, h.num(r.rate), h.num(r.amount)]),
    theme: 'plain', showHead: 'everyPage', rowPageBreak: 'avoid',
    styles: { font: F.sans, fontSize: 9.4, textColor: BRAND.INK, cellPadding: { top: 2.7, bottom: 2.7, left: 2, right: 2 }, valign: 'top', overflow: 'linebreak' },
    headStyles: { font: F.head, fontStyle: 'bold', fontSize: 7.6, textColor: BRAND.INK2, cellPadding: { top: 2.6, bottom: 2.6, left: 2, right: 2 } },
    columnStyles: { 0: { cellWidth: 9, textColor: BRAND.MUTED }, 1: { cellWidth: 'auto' }, 2: { cellWidth: 18, halign: 'right' }, 3: { cellWidth: 15 }, 4: { cellWidth: 25, halign: 'right' }, 5: { cellWidth: 28, halign: 'right', fontStyle: 'bold' } },
    didParseCell: (d) => { if (d.section === 'head' && [2, 4, 5].includes(d.column.index)) d.cell.styles.halign = 'right'; if (d.section === 'head' && d.column.index >= 4) d.cell.styles.font = F.sans; },
    didDrawCell: (d) => {
      const { x, y: cy2, width, height } = d.cell;
      if (d.section === 'head') { h.draw(BRAND.INK); doc.setLineWidth(0.35); doc.line(x, cy2, x + width, cy2); doc.line(x, cy2 + height, x + width, cy2 + height); }
      else { h.draw(BRAND.RULE); doc.setLineWidth(0.2); doc.line(x, cy2 + height, x + width, cy2 + height); }
    },
    didDrawPage: (d) => { if (d.pageNumber > 1) cont(d.pageNumber); },
  });
  const f = flow(doc, { top: doc.lastAutoTable.finalY, bottom: 22, contTop: M + 12, onNewPage: cont });
  // totals (kept whole) + amount in words
  const rows = [['Subtotal', model.subTotal]];
  if (model.discountAmount > 0) rows.push([model.discountLabel, -model.discountAmount]);
  const words = h.wrap('Amount in words: ' + amountToWordsCur(model.total), CW - 90, 8.4);
  f.need(8 + rows.length * 6 + 12);
  f.y += 7;
  const tx = W - M - 82;
  rows.forEach(([l, v]) => { h.t(l, tx, f.y, { size: 9, color: BRAND.INK2 }); h.t((v < 0 ? '− ' : '') + h.num(Math.abs(v)), W - M - 2, f.y, { size: 9, align: 'right' }); f.y += 6; });
  h.draw(BRAND.INK); doc.setLineWidth(0.35); doc.line(tx, f.y - 2.4, W - M, f.y - 2.4);
  h.t('TOTAL', tx, f.y + 3.4, { font: F.head, style: 'bold', size: 10, cs: 0.8 });
  h.t(`${h.cur} ${h.num(model.total)}`, W - M - 2, f.y + 3.6, { size: 13, style: 'bold', align: 'right' });
  let wy = f.y - rows.length * 6;
  words.forEach(l => { h.t(l, M, wy, { size: 8.4, color: BRAND.INK2 }); wy += h.lh(8.4); });
  f.y += 14;
  // terms
  drawClosing(doc, h, f, model, {
    headH: 8.5,
    heading: (yy) => { h.t('TERMS & CONDITIONS', M, yy, { font: F.head, style: 'bold', size: 9, cs: 0.9 }); h.fill(BRAND.ACCENT); doc.rect(M, yy + 2, 14, 0.8, 'F'); },
    number: (n, yy) => h.t(n + '.', M, yy, { size: 8.8, style: 'bold' }),
  }, F, null);
  // footers
  const n = doc.getNumberOfPages();
  for (let p = 1; p <= n; p++) {
    doc.setPage(p);
    h.draw(BRAND.RULE); doc.setLineWidth(0.25); doc.line(M, H - 14, W - M, H - 14);
    h.t(`Estimate ${model.number}${model.company.name ? '  ·  ' + model.company.name : ''}`, M, H - 9.5, { size: 7.5, color: BRAND.MUTED });
    h.t(`Page ${p} of ${n}`, W - M, H - 9.5, { size: 7.5, color: BRAND.MUTED, align: 'right' });
  }
  return doc;
}

/* ═════════════ Template 2 · Modern ═════════════ */
async function renderModern(model) {
  const { doc, F } = await newDoc();
  const h = mk(doc, F);
  // Faint diagonal company-name watermark behind the content of every page.
  const wm = () => {
    const word = (model.company.name || 'ESTIMATE').toUpperCase().slice(0, 40);
    try { doc.setGState(new doc.GState({ opacity: 0.045 })); } catch {}
    // size it so the diagonal word stays inside the page: width·cos(32°) ≤ content width
    doc.setFont(F.black, F.blackStyle); doc.setFontSize(10);
    doc.setFontSize(Math.max(24, Math.min(64, 10 * (CW / 0.85) / doc.getTextWidth(word))));
    doc.setTextColor(...BRAND.NAVY);
    const tw = doc.getTextWidth(word), a = 32 * Math.PI / 180;
    doc.text(word, W / 2 - (tw / 2) * Math.cos(a), H / 2 + 10 + (tw / 2) * Math.sin(a), { angle: 32 });   // centred on the page
    try { doc.setGState(new doc.GState({ opacity: 1 })); } catch {}
  };
  // page-1 colour block
  const BAND = 50;
  h.fill(BRAND.NAVY); doc.rect(0, 0, W, BAND, 'F');
  h.fill(BRAND.NAVY2); doc.triangle(W - 92, 0, W - 40, 0, W - 66, BAND, 'F'); doc.triangle(W - 66, BAND, W - 40, 0, W - 14, BAND, 'F');
  h.fill(BRAND.ACCENT); doc.triangle(W - 40, 0, W, 0, W, BAND, 'F'); doc.triangle(W - 40, 0, W, BAND, W - 14, BAND, 'F');
  let lx = M;
  if (model.company.logo) {
    h.fill(BRAND.WHITE); doc.roundedRect(M, 12, 26, 26, 3, 3, 'F');
    const lg = fitImage(doc, model.company.logo, M + 2.5, 14.5, 21, 21, 'center');
    if (lg) lx = M + 32;
  }
  const nameW = W - lx - 80;
  let ny = 20;
  h.wrap(model.company.name || 'Your Company', nameW, 15, F.head, 'bold').slice(0, 2).forEach(l => { h.t(l, lx, ny, { font: F.head, style: 'bold', size: 15, color: BRAND.WHITE }); ny += h.lh(15, 1.1); });
  ny += 0.8;
  companyDetails(model.company).forEach(d => h.wrap(d, nameW, 7.6).slice(0, 2).forEach(l => { if (ny < BAND - 4) { h.t(l, lx, ny, { size: 7.6, color: BRAND.SKY }); ny += h.lh(7.6); } }));
  h.t('ESTIMATE', W - M, 25, { font: F.black, style: F.blackStyle, size: 26, color: BRAND.WHITE, align: 'right', cs: 0.6 });
  h.t(`No. ${model.number}${model.date ? '   ·   ' + dateStr(model.date) : ''}`, W - M, 32.5, { size: 8.6, color: BRAND.WHITE, align: 'right', style: 'bold' });
  // info cards
  let y = BAND + 8;
  const gap = 4, cw = (CW - 2 * gap) / 3, ch = 27;
  const card = (x, title, lines, tone) => {
    h.fill(tone === 'accent' ? BRAND.ACCENT_SOFT : BRAND.ZEBRA); doc.roundedRect(x, y, cw, ch, 2.4, 2.4, 'F');
    h.fill(tone === 'accent' ? BRAND.ACCENT : BRAND.NAVY); doc.rect(x, y + 4, 1.1, ch - 8, 'F');
    h.t(title, x + 5, y + 6.5, { font: F.head, style: 'bold', size: 7.2, color: BRAND.MUTED, cs: 0.6 });
    let yy = y + 12;
    lines.forEach(([txt, o]) => h.wrap(txt, cw - 9, o.size, F.sans, o.style || 'normal').slice(0, o.max || 1).forEach(l => { if (yy < y + ch - 2) { h.t(l, x + 5, yy, { size: o.size, style: o.style, color: o.color || BRAND.INK }); yy += h.lh(o.size, 1.25); } }));
  };
  card(M, 'BILL TO', [[model.client.name || '—', { size: 10.5, style: 'bold', max: 2 }], [model.client.gst ? 'GSTIN ' + model.client.gst : (model.client.address || ''), { size: 7.8, color: BRAND.INK2, max: 2 }]]);
  card(M + cw + gap, 'PROJECT', [[model.project || '—', { size: 10.5, style: 'bold', max: 2 }], [model.date ? 'Dated ' + dateStr(model.date) : '', { size: 7.8, color: BRAND.INK2 }]]);
  card(M + 2 * (cw + gap), 'ESTIMATE TOTAL', [[`${h.cur} ${h.num(model.total)}`, { size: 13, style: 'bold', color: BRAND.ACCENT }], [`${model.items.length} item${model.items.length === 1 ? '' : 's'}`, { size: 7.8, color: BRAND.INK2 }]], 'accent');
  y += ch + 8;

  const cont = () => {                  // slim colour band on continuation pages
    h.fill(BRAND.NAVY); doc.rect(0, 0, W, 16, 'F');
    h.fill(BRAND.ACCENT); doc.triangle(W - 22, 0, W, 0, W, 16, 'F'); doc.triangle(W - 22, 0, W, 16, W - 8, 16, 'F');
    h.t(model.company.name || '', M, 10, { font: F.head, style: 'bold', size: 10, color: BRAND.WHITE });
    h.t(`ESTIMATE  ·  ${model.number}`, W - M - 14, 10, { size: 8.4, color: BRAND.SKY, align: 'right', style: 'bold' });
    return 26;
  };
  doc.autoTable({
    startY: y, margin: { left: M, right: M, top: 24, bottom: 20 },
    head: [['#', 'Description', 'Qty', 'Unit', `Rate (${h.cur})`, `Amount (${h.cur})`]],
    body: model.items.map(r => [String(r.sn).padStart(2, '0'), r.desc, h.qty(r.qty), r.unit, h.num(r.rate), h.num(r.amount)]),
    theme: 'plain', showHead: 'everyPage', rowPageBreak: 'avoid',
    styles: { font: F.sans, fontSize: 9.2, textColor: BRAND.INK, cellPadding: { top: 3, bottom: 3, left: 2.4, right: 2.4 }, valign: 'top', overflow: 'linebreak' },
    headStyles: { font: F.head, fontStyle: 'bold', fontSize: 7.8, textColor: BRAND.WHITE, fillColor: BRAND.NAVY, cellPadding: { top: 3.2, bottom: 3.2, left: 2.4, right: 2.4 } },
    alternateRowStyles: { fillColor: BRAND.ZEBRA },
    columnStyles: { 0: { cellWidth: 10, textColor: BRAND.ACCENT, fontStyle: 'bold' }, 1: { cellWidth: 'auto' }, 2: { cellWidth: 18, halign: 'right' }, 3: { cellWidth: 15 }, 4: { cellWidth: 25, halign: 'right' }, 5: { cellWidth: 28, halign: 'right', fontStyle: 'bold' } },
    didParseCell: (d) => { if (d.section === 'head' && [2, 4, 5].includes(d.column.index)) d.cell.styles.halign = 'right'; if (d.section === 'head' && d.column.index >= 4) d.cell.styles.font = F.sans; },
    didDrawPage: (d) => { if (d.pageNumber > 1) cont(); },
  });
  const f = flow(doc, { top: doc.lastAutoTable.finalY, bottom: 20, contTop: 26, onNewPage: cont });
  // totals card + amount in words
  const rows = [['Subtotal', model.subTotal]];
  if (model.discountAmount > 0) rows.push([model.discountLabel, -model.discountAmount]);
  const boxW = 84, bx = W - M - boxW, bh = 8 + rows.length * 6.2 + 13;
  f.need(bh + 8); f.y += 6;
  h.fill(BRAND.ZEBRA); doc.roundedRect(bx, f.y, boxW, bh, 2.4, 2.4, 'F');
  let ty = f.y + 7.5;
  rows.forEach(([l, v]) => { h.t(l, bx + 5, ty, { size: 9, color: BRAND.INK2 }); h.t((v < 0 ? '− ' : '') + h.num(Math.abs(v)), bx + boxW - 5, ty, { size: 9, align: 'right' }); ty += 6.2; });
  h.fill(BRAND.ACCENT); doc.roundedRect(bx, ty - 2.2, boxW, 13, 2.4, 2.4, 'F');
  h.t('TOTAL', bx + 5, ty + 6, { font: F.head, style: 'bold', size: 9.5, color: BRAND.WHITE, cs: 0.8 });
  h.t(`${h.cur} ${h.num(model.total)}`, bx + boxW - 5, ty + 6.3, { size: 13, style: 'bold', color: BRAND.WHITE, align: 'right' });
  const words = h.wrap(amountToWordsCur(model.total), CW - boxW - 10, 8.6, F.sans, 'bold');
  h.t('AMOUNT IN WORDS', M, f.y + 7.5, { font: F.head, style: 'bold', size: 7.2, color: BRAND.MUTED, cs: 0.6 });
  let wy = f.y + 12.5; words.forEach(l => { h.t(l, M, wy, { size: 8.6, style: 'bold', color: BRAND.NAVY }); wy += h.lh(8.6); });
  f.y += bh + 12;
  // terms
  drawClosing(doc, h, f, model, {
    headH: 9,
    heading: (yy) => { h.fill(BRAND.ACCENT); doc.rect(M, yy - 3.4, 2.6, 2.6, 'F'); h.t('Terms & Conditions', M + 5, yy - 1, { font: F.head, style: 'bold', size: 11, color: BRAND.NAVY }); h.draw(BRAND.RULE); doc.setLineWidth(0.25); doc.line(M, yy + 2.6, W - M, yy + 2.6); },
    number: (n, yy) => { h.fill(BRAND.ACCENT); doc.circle(M + 2.3, yy - 1.1, 2.3, 'F'); h.t(n, M + 2.3, yy - 0.15, { size: 6.4, style: 'bold', color: BRAND.WHITE, align: 'center' }); },
  }, F, BRAND.ACCENT);
  // footer strip
  const n = doc.getNumberOfPages();
  const foot = [model.company.phone, model.company.email].filter(Boolean).join('   ·   ');
  for (let p = 1; p <= n; p++) {
    doc.setPage(p);
    wm();
    h.fill(BRAND.NAVY); doc.rect(0, H - 10, W, 10, 'F');
    h.fill(BRAND.ACCENT); doc.rect(0, H - 10, 34, 10, 'F');
    h.t(model.number, 17, H - 4, { size: 7.6, style: 'bold', color: BRAND.WHITE, align: 'center' });
    if (foot) h.t(foot, 40, H - 4, { size: 7.4, color: BRAND.SKY });
    h.t(`Page ${p} of ${n}`, W - M, H - 4, { size: 7.4, color: BRAND.WHITE, align: 'right' });
  }
  return doc;
}

/** Build the PDF for an estimate record (or an unsaved draft object). */
export async function renderEstimateDoc(est) {
  const model = buildEstimateModel(est, state);
  return model.template === 'modern' ? renderModern(model) : renderClassic(model);
}

export async function exportEstimatePDF(id) {
  const e = (state.estimates || []).find(x => x.id === id);
  if (!e) return showToast('Estimate not found', 'error');
  try {
    const doc = await renderEstimateDoc(e);
    mobileSavePDF(doc, `${(e.estNum || 'Estimate').replace(/[^\w.-]+/g, '_')}.pdf`);
  } catch (err) { console.error('[Estimate PDF]', err); showToast('Could not create the PDF: ' + (err.message || err), 'error'); }
}

/* ═════════════ Excel ═════════════ */
/**
 * Clean, editable workbook: letterhead rows, details, the item table with live
 * formulas (Amount = Qty × Rate, totals = SUM), number formats, column widths and
 * T&C below. (SheetJS community edition writes values/formulas/formats/merges;
 * cell colours are not supported, so the sheet stays neutral.)
 */
export function buildEstimateSheet(est) {
  const XLSX = window.XLSX;
  const m = buildEstimateModel(est, state);
  const A = [];      // array-of-arrays
  const merges = [];
  const row = (cells, mergeAll) => { A.push(cells); if (mergeAll) merges.push({ s: { r: A.length - 1, c: 0 }, e: { r: A.length - 1, c: 5 } }); };
  row([m.company.name || ''], true);
  companyDetails(m.company).forEach(d => row([d], true));
  row([]);
  row(['ESTIMATE / QUOTATION'], true);
  row(['Estimate No', m.number, '', 'Date', m.date || '']);
  row(['Client', m.client.name, '', 'Project', m.project]);
  if (m.client.gst || m.client.address) row(['Client GSTIN', m.client.gst, '', 'Address', m.client.address]);
  row([]);
  row(['#', 'Description', 'Qty', 'Unit', 'Rate', 'Amount']);
  const first = A.length;
  m.items.forEach(r => row([r.sn, r.desc, r.qty, r.unit, r.rate, r.amount]));
  const last = A.length - 1;
  row([]);
  const subR = A.length; row(['', '', '', '', 'Subtotal', m.subTotal]);
  let discR = -1; if (m.discountAmount > 0) { discR = A.length; row(['', '', '', '', m.discountLabel, m.discountAmount]); }
  const totR = A.length; row(['', '', '', '', 'TOTAL', m.total]);
  row(['Amount in words: ' + amountToWordsCur(m.total)], true);
  if (m.terms.length) { row([]); row(['TERMS & CONDITIONS'], true); m.terms.forEach((t, i) => row([`${i + 1}. ${t}`], true)); }
  const ws = XLSX.utils.aoa_to_sheet(A);
  const cell = (r, c) => XLSX.utils.encode_cell({ r, c });
  const fmt = '#,##0.00';
  for (let r = first; r <= last; r++) {
    ws[cell(r, 5)] = { t: 'n', v: A[r][5], f: `${cell(r, 2)}*${cell(r, 4)}`, z: fmt };
    ws[cell(r, 4)].z = fmt;   // qty keeps Excel's General format (no stray trailing dot)
  }
  if (last >= first) ws[cell(subR, 5)] = { t: 'n', v: m.subTotal, f: `SUM(${cell(first, 5)}:${cell(last, 5)})`, z: fmt };
  if (discR >= 0) ws[cell(discR, 5)].z = fmt;
  ws[cell(totR, 5)] = { t: 'n', v: m.total, f: discR >= 0 ? `${cell(subR, 5)}-${cell(discR, 5)}` : `${cell(subR, 5)}`, z: fmt };
  ws['!merges'] = merges;
  ws['!cols'] = [{ wch: 6 }, { wch: 54 }, { wch: 11 }, { wch: 9 }, { wch: 14 }, { wch: 17 }];
  const wb = XLSX.utils.book_new();
  wb.Props = { Title: `Estimate ${m.number}`, Company: m.company.name || '' };
  XLSX.utils.book_append_sheet(wb, ws, 'Estimate');
  return wb;
}
export function exportEstimateExcel(id) {
  const e = (state.estimates || []).find(x => x.id === id);
  if (!e) return showToast('Estimate not found', 'error');
  if (!window.XLSX) return showToast('Excel engine not ready — try again in a moment', 'error');
  mobileSaveXLSX(buildEstimateSheet(e), `${(e.estNum || 'Estimate').replace(/[^\w.-]+/g, '_')}.xlsx`);
}

window.exportEstimatePDF = exportEstimatePDF;
window.exportEstimateExcel = exportEstimateExcel;
window.renderEstimateDoc = renderEstimateDoc;
