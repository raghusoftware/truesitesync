/**
 * ═══════════════════════════════════════════════════════════
 * True Site Sync — Sale invoice & sales-ledger exporters
 * ═══════════════════════════════════════════════════════════
 * PDF / Excel / share helpers for sale (tax) invoices and the
 * sales ledger. Extracted from ui.js. Invoice theming lives in
 * pdfThemes.js; this module only renders / exports documents.
 * ═══════════════════════════════════════════════════════════
 */

import { state } from './state.js';
import { showToast, getCompanyHeaderForPDF, getPdfCurrency, pdfMoney, formatINR, mobileSavePDF } from './utils.js';
import { formatNumber2 } from './format.js';
import { getActiveThemeId, THEMES, renderWithTheme } from './pdfThemes.js';

const _num2 = formatNumber2;

export function exportSaleInvoicePDF(id) {
  const inv = (state.saleInvoices || []).find(i => i.id === id);
  if (!inv) { showToast('Invoice not found', 'error'); return; }
  const c = state.clients.find(x => x.id === inv.clientId);
  const clientName = c?.name || inv.clientName || 'Unknown';

  // Try theme engine
  const themeId = getActiveThemeId('invoice');
  if (themeId && THEMES.invoice && THEMES.invoice[themeId]) {
    const doc = new window.jspdf.jsPDF();
    const items = (inv.items || []).map((it, idx) => ({ sn: idx+1, ref: it.hsn || '', desc: it.desc, qty: it.qty, unit: it.unit, rate: it.rate, taxPct: it.taxPct, amount: it.amount }));
    const data = { invoiceNum: inv.invoiceNo || '', date: inv.date, clientName, projectName: inv.projectName || '', status: inv.status || 'Active', items, subtotal: inv.subtotal, taxAmount: inv.gstAmount || 0, gstType: inv.gstType, taxPct: inv.taxPct, totalAmount: inv.grandTotal || inv.subtotal + (inv.gstAmount||0), payType: inv.payType };
    renderWithTheme('invoice', themeId, doc, data);
    mobileSavePDF(doc,`SaleInvoice_${inv.invoiceNo || id}.pdf`);
    return;
  }

  // Fallback
  const doc = new window.jspdf.jsPDF('p', 'mm', 'a4');
  const pw = doc.internal.pageSize.getWidth();
  let y = getCompanyHeaderForPDF(doc);
  doc.setFontSize(12); doc.setFont('helvetica', 'bold'); doc.setTextColor(0, 0, 0);
  doc.text('TAX INVOICE', pw / 2, y, { align: 'center' }); y += 7;
  // Invoice details
  doc.setFontSize(9); doc.setFont('helvetica', 'normal'); doc.setTextColor(50, 50, 50);
  doc.text('Invoice No: ' + (inv.invoiceNo || ''), 14, y);
  doc.text('Date: ' + (inv.date || ''), pw - 14, y, { align: 'right' }); y += 5;
  doc.text('Client: ' + clientName, 14, y);
  doc.text('Pay Type: ' + (inv.payType || ''), pw - 14, y, { align: 'right' }); y += 5;
  if (inv.poNo) { doc.text('WO/PO: ' + inv.poNo, 14, y); y += 5; }
  y += 2;
  // Items table
  const rows = (inv.items || []).map((item, i) => [
    i + 1, item.desc, item.hsn || '', item.qty, item.unit || '',
    _num2(item.rate || 0), item.taxPct + '%',
    _num2(item.amount || 0)
  ]);
  const invCur = getPdfCurrency().trim();
  doc.autoTable({
    startY: y, head: [['#', 'Description', 'HSN/SAC', 'Qty', 'Unit', `Rate (${invCur})`, 'Tax', `Amount (${invCur})`]],
    body: rows, theme: 'grid', headStyles: { fillColor: [30, 58, 138], fontSize: 8 },
    styles: { fontSize: 8, cellPadding: 2, overflow: 'linebreak' }, columnStyles: { 0: { cellWidth: 8 }, 1: { cellWidth: 50 }, 2: { cellWidth: 18 }, 3: { halign: 'right', cellWidth: 12 }, 4: { cellWidth: 12 }, 5: { halign: 'right', cellWidth: 25 }, 6: { halign: 'right', cellWidth: 14 }, 7: { halign: 'right', cellWidth: 28 } },
    margin: { left: 14, right: 14 }
  });
  y = doc.lastAutoTable.finalY + 6;
  // Summary
  const summaryData = [
    ['Subtotal', pdfMoney(inv.subtotal)],
    ['Tax', pdfMoney(inv.gstAmount)],
  ];
  if (inv.tcsAmount) summaryData.push(['TCS', pdfMoney(inv.tcsAmount)]);
  if (inv.roundAmt) summaryData.push(['Round Off', (inv.roundAmt > 0 ? '+' : '') + inv.roundAmt.toFixed(2)]);
  summaryData.push(['Grand Total', pdfMoney(inv.total)]);
  doc.setTextColor(0, 0, 0);
  summaryData.forEach(([label, val]) => {
    const isBold = label === 'Grand Total';
    doc.setFont('helvetica', isBold ? 'bold' : 'normal');
    doc.setFontSize(isBold ? 10 : 9);
    doc.text(label + ':', pw - 70, y); doc.text(val, pw - 14, y, { align: 'right' }); y += 5;
  });
  if (inv.notes) { y += 4; doc.setFontSize(8); doc.setFont('helvetica', 'normal'); doc.text('Notes: ' + inv.notes, 14, y); }
  mobileSavePDF(doc,(inv.invoiceNo || 'Invoice') + '.pdf');
  showToast('PDF downloaded!');
}

// ── Print Sale Invoice ──
export function printSaleInvoice(id) {
  exportSaleInvoicePDF(id);
}

// ── Share Sale Invoice (copy link / use Web Share API) ──
export function shareSaleInvoice(id) {
  const inv = (state.saleInvoices || []).find(i => i.id === id);
  if (!inv) return;
  const text = `Invoice: ${inv.invoiceNo}\nDate: ${inv.date}\nTotal: ${formatINR(inv.total)}\nClient: ${inv.clientName || 'N/A'}`;
  if (navigator.share) {
    navigator.share({ title: inv.invoiceNo, text }).catch(() => {});
  } else {
    navigator.clipboard.writeText(text).then(() => showToast('Invoice details copied to clipboard!')).catch(() => showToast('Share not supported', 'error'));
  }
}

// ── Export Sales Ledger as PDF ──
export function exportSalesLedgerPDF() {
  const doc = new window.jspdf.jsPDF('l', 'mm', 'a4');
  const pw = doc.internal.pageSize.getWidth();
  let y = getCompanyHeaderForPDF(doc);
  doc.setFontSize(10); doc.setFont('helvetica', 'normal'); doc.setTextColor(50, 50, 50);
  doc.text('Sales Ledger Report — ' + new Date().toLocaleDateString('en-IN'), pw / 2, y, { align: 'center' }); y += 8;
  const rows = (state.saleInvoices || []).map(inv => {
    const c = state.clients.find(x => x.id === inv.clientId);
    const proj = inv.projectId ? (state.projects || []).find(p => p.id === inv.projectId) : null;
    const received = (state.paymentsIn || []).filter(p => p.clientId === inv.clientId).reduce((s, p) => s + parseFloat(p.amount || 0), 0);
    return [inv.invoiceNo, inv.date, c?.name || inv.clientName || '—', proj?.name || '—', inv.poNo || '—',
      _num2(inv.subtotal), _num2(inv.gstAmount), _num2(inv.total),
      _num2(Math.min(received, inv.total)), _num2(inv.total - Math.min(received, inv.total)), inv.status];
  });
  const slCur = getPdfCurrency().trim();
  doc.autoTable({
    startY: y, head: [['Invoice', 'Date', 'Client', 'Project', 'WO/PO', `Base (${slCur})`, `Tax (${slCur})`, `Total (${slCur})`, `Received (${slCur})`, `O/S (${slCur})`, 'Status']],
    body: rows, theme: 'grid', headStyles: { fillColor: [30, 58, 138], fontSize: 6.5 },
    styles: { fontSize: 6.5, cellPadding: 1.5, overflow: 'linebreak' }, margin: { left: 8, right: 8 },
    columnStyles: { 0: { cellWidth: 20 }, 1: { cellWidth: 18 }, 2: { cellWidth: 28, overflow: 'linebreak' }, 3: { cellWidth: 28, overflow: 'linebreak' }, 4: { cellWidth: 18 }, 5: { halign: 'right', cellWidth: 22 }, 6: { halign: 'right', cellWidth: 18 }, 7: { halign: 'right', cellWidth: 22 }, 8: { halign: 'right', cellWidth: 22 }, 9: { halign: 'right', cellWidth: 22 }, 10: { cellWidth: 16 } }
  });
  mobileSavePDF(doc,'Sales_Ledger_' + new Date().toISOString().slice(0, 10) + '.pdf');
  showToast('Sales Ledger PDF downloaded!');
}

// ── Export Sales Ledger as Excel ──
export function exportSalesLedgerExcel() {
  let csv = 'Invoice No,Date,Client,Project,WO/PO,Base Amount,Tax,Total,Received,Outstanding,Status\n';
  (state.saleInvoices || []).forEach(inv => {
    const c = state.clients.find(x => x.id === inv.clientId);
    const proj = inv.projectId ? (state.projects || []).find(p => p.id === inv.projectId) : null;
    const received = (state.paymentsIn || []).filter(p => p.clientId === inv.clientId).reduce((s, p) => s + parseFloat(p.amount || 0), 0);
    csv += `"${inv.invoiceNo}","${inv.date}","${c?.name || inv.clientName || ''}","${proj?.name || ''}","${inv.poNo || ''}",${inv.subtotal || 0},${inv.gstAmount || 0},${inv.total || 0},${Math.min(received, inv.total)},${inv.total - Math.min(received, inv.total)},"${inv.status}"\n`;
  });
  const blob = new Blob([csv], { type: 'text/csv' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
  a.download = 'Sales_Ledger_' + new Date().toISOString().slice(0, 10) + '.csv'; a.click();
  showToast('Sales Ledger CSV downloaded!');
}

// ── Share Sales Ledger ──
export function shareSalesLedger() {
  const total = (state.saleInvoices || []).reduce((s, i) => s + (i.total || 0), 0);
  const count = (state.saleInvoices || []).length;
  const text = `Sales Ledger Summary\nTotal Invoices: ${count}\nTotal Amount: ${formatINR(total)}\nDate: ${new Date().toLocaleDateString('en-IN')}`;
  if (navigator.share) {
    navigator.share({ title: 'Sales Ledger', text }).catch(() => {});
  } else {
    navigator.clipboard.writeText(text).then(() => showToast('Ledger summary copied to clipboard!')).catch(() => showToast('Share not supported', 'error'));
  }
}
