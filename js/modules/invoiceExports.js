/**
 * ═══════════════════════════════════════════════════════════
 * True Site Sync — Invoice & Estimate exporters
 * ═══════════════════════════════════════════════════════════
 * PDF generators for tax invoices and commercial estimates.
 * Extracted from ui.js. GST split lives in gstCalc.js; invoice
 * theming in pdfThemes.js. This module only renders documents.
 * ═══════════════════════════════════════════════════════════
 */

import { state } from './state.js';
import { showToast, getCompanyHeaderForPDF, getPdfCurrency, mobileSavePDF } from './utils.js';
import { formatNumber2 } from './format.js';
import { splitTaxForDisplay } from './gstCalc.js';
import { getActiveThemeId, THEMES, renderWithTheme } from './pdfThemes.js';

const _num2 = formatNumber2;

export function exportInvoicePDF(id) {
  const inv = state.invoices.find(x => x.id === id);
  const c = state.clients.find(x => x.id === inv.clientId);
  const proj = state.projects.find(p => p.id === inv.projectId || p.id === c?.projectId);
  const sym = getPdfCurrency().trim();

  // Try theme engine
  const themeId = getActiveThemeId('invoice');
  if (themeId && THEMES.invoice && THEMES.invoice[themeId]) {
    const doc = new window.jspdf.jsPDF();
    const items = [];
    (inv.abstractIds || []).forEach((aId, idx) => {
      const a = state.abstracts.find(x => x.id === aId);
      if (a) items.push({ sn: idx + 1, ref: a.abstractNum, desc: a.area, amount: a.totalAmount });
    });
    const data = { invoiceNum: inv.invoiceNum, date: inv.date, clientName: c?.name || '', projectName: c?.projectName || proj?.name || '', status: inv.status, items, subtotal: inv.subtotal, taxAmount: inv.taxAmount, gstType: inv.gstType, taxPct: inv.taxPct, totalAmount: inv.totalAmount };
    renderWithTheme('invoice', themeId, doc, data);
    mobileSavePDF(doc,`${inv.invoiceNum}.pdf`);
    return;
  }

  // Fallback
  const doc = new window.jspdf.jsPDF();
  let y = getCompanyHeaderForPDF(doc);
  doc.setFontSize(14); doc.setTextColor(0);
  doc.text(inv.status === 'Cancelled' ? "TAX INVOICE (CANCELLED)" : "TAX INVOICE", 105, y + 5, null, null, "center");
  doc.setFontSize(10); doc.setFont("helvetica", "normal");
  doc.text(`Invoice No: ${inv.invoiceNum}`, 14, y + 15);
  doc.text(`Date: ${inv.date}`, 14, y + 20);
  doc.text(`Billed To: ${c.name}`, 14, y + 28);
  doc.text(`Project: ${c.projectName}`, 14, y + 33);
  let rows = [];
  inv.abstractIds.forEach((aId, index) => {
    const a = state.abstracts.find(x => x.id === aId);
    if (a) rows.push([index + 1, a.abstractNum, a.area, a.totalAmount.toFixed(2)]);
  });
  doc.autoTable({ startY: y + 40, head: [['Sr No.', 'Abstract Ref', 'Area / Details', `Amount (${sym})`]], body: rows, theme: 'grid', headStyles: { fillColor: [30, 58, 138], fontSize: 9 }, styles: { fontSize: 9, cellPadding: 2.5, overflow: 'linebreak' }, columnStyles: { 0: { cellWidth: 18 }, 1: { cellWidth: 35 }, 2: { cellWidth: 80 }, 3: { halign: 'right', cellWidth: 35 } } });
  let tY = doc.lastAutoTable.finalY + 10;
  doc.setFont("helvetica", "bold");
  doc.text(`Subtotal:`, 140, tY); doc.text(`${sym} ${_num2(inv.subtotal)}`, 196, tY, null, null, "right"); tY += 6;
  const taxParts = splitTaxForDisplay(inv.taxAmount, inv.gstType);
  if (inv.gstType === 'intra') {
    doc.text(`CGST:`, 140, tY); doc.text(`${sym} ${_num2(taxParts.cgst)}`, 196, tY, null, null, "right"); tY += 6;
    doc.text(`SGST:`, 140, tY); doc.text(`${sym} ${_num2(taxParts.sgst)}`, 196, tY, null, null, "right"); tY += 6;
  } else {
    doc.text(`IGST:`, 140, tY); doc.text(`${sym} ${_num2(taxParts.igst)}`, 196, tY, null, null, "right"); tY += 6;
  }
  doc.setFontSize(12); doc.setTextColor(249, 115, 22);
  doc.text(`Grand Total:`, 120, tY + 4); doc.text(`${sym} ${_num2(inv.totalAmount)}`, 196, tY + 4, null, null, "right");
  mobileSavePDF(doc,`${inv.invoiceNum}.pdf`);
}

export function exportEstimatePDF(id) {
  const e = state.estimates.find(x => x.id === id);
  if (!e) return showToast('Estimate not found', 'error');
  const c = state.clients.find(x => x.id === e.clientId);
  const proj = state.projects.find(p => p.id === e.projectId || p.id === c?.projectId);
  const clientName = c?.name || proj?.clientName || e.clientName || '—';
  const projectName = c?.projectName || proj?.name || e.projectName || '—';
  const doc = new window.jspdf.jsPDF();
  let y = getCompanyHeaderForPDF(doc);
  doc.setFontSize(14); doc.setTextColor(0);
  doc.text("COMMERCIAL ESTIMATE / QUOTATION", 105, y + 5, null, null, "center");
  doc.setFontSize(10); doc.setFont("helvetica", "normal");
  doc.text(`Estimate No: ${e.estNum}`, 14, y + 15); doc.text(`Date: ${e.date}`, 14, y + 20);
  doc.text(`Client: ${clientName}`, 14, y + 28); doc.text(`Project: ${projectName}`, 14, y + 33);
  const sym = getPdfCurrency().trim();
  let rows = [];
  (e.items || []).forEach((i, idx) => rows.push([idx + 1, i.desc, i.qty, i.unit, _num2(i.rate), _num2(i.amount)]));
  doc.autoTable({ startY: y + 40, head: [['#', 'Description', 'Qty', 'Unit', `Rate (${sym})`, `Amount (${sym})`]], body: rows, theme: 'grid', headStyles: { fillColor: [16, 185, 129], fontSize: 9 }, styles: { fontSize: 9, cellPadding: 2.5, overflow: 'linebreak' }, columnStyles: { 0: { cellWidth: 10 }, 1: { cellWidth: 70 }, 2: { halign: 'right', cellWidth: 18 }, 3: { cellWidth: 15 }, 4: { halign: 'right', cellWidth: 30 }, 5: { halign: 'right', cellWidth: 30 } } });
  let tY = doc.lastAutoTable.finalY + 10;
  doc.setFontSize(12); doc.setFont("helvetica", "bold");
  doc.text(`Total Estimate Value: ${sym} ${_num2(e.total)}`, 14, tY);
  if (e.terms) { tY += 15; doc.setFontSize(10); doc.text("Terms & Conditions:", 14, tY); doc.setFont("helvetica", "normal"); doc.text(e.terms, 14, tY + 6, { maxWidth: 180 }); }
  mobileSavePDF(doc,`${e.estNum}.pdf`);
}
