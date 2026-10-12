/**
 * ═══════════════════════════════════════════════════════════
 * True Site Sync — Sale invoice & sales-ledger exporters
 * ═══════════════════════════════════════════════════════════
 * PDF / Excel / share helpers for sale (tax) invoices and the
 * sales ledger. Extracted from ui.js. Invoice designs live in
 * invoiceTemplates.js; this module only renders / exports documents.
 * ═══════════════════════════════════════════════════════════
 */

import { state } from './state.js';
import { showToast, getCompanyHeaderForPDF, getPdfCurrency, formatINR, mobileSavePDF, mobileDownloadBlob } from './utils.js';
import { formatNumber2 } from './format.js?v=1.0.1';
import { renderStyledInvoice, resolveInvoiceDesign } from './invoiceTemplates.js?v=2.0.1';

const _num2 = formatNumber2;

/**
 * Tax Invoice PDF — one of the three client-supplied designs (Classic Grid /
 * GST Detailed / GST Compact) chosen in Settings → Print → Tax Invoice Design.
 * Legacy or unset choices resolve to the default design.
 */
export function exportSaleInvoicePDF(id) {
  const inv = (state.saleInvoices || []).find(i => i.id === id);
  if (!inv) { showToast('Invoice not found', 'error'); return; }
  return renderStyledInvoice(inv, resolveInvoiceDesign(state.printSettings?.invoiceTemplate));
}

// ── Print Sale Invoice ──
export function printSaleInvoice(id) {
  exportSaleInvoicePDF(id);
}

// ── Preview an invoice DESIGN from Settings (no state change) ──
// Uses the most recent real invoice if any, else a built-in sample, so a brand
// new account can still preview each design.
function _sampleInvoice() {
  const c = (state.clients || [])[0] || {};
  return {
    id: '_preview', clientId: c.id, clientName: c.name || 'Sample Client Pvt Ltd',
    clientAddress: c.address || '12 Market Road, Pune, Maharashtra 411001',
    invoiceNo: 'SAMPLE-001', date: new Date().toISOString().slice(0, 10),
    stateOfSupply: 'intra', poNo: 'PO-1024', poDate: '', reverseCharge: 'No',
    items: [
      { desc: 'RCC M25 grade concrete work (with shuttering)', hsn: '995415', qty: 10, unit: 'Cum', rate: 6500, taxType: 'CGST_SGST', taxPct: 18, taxAmount: 11700, amount: 76700 },
      { desc: 'TMT steel supply Fe500', hsn: '7214', qty: 2.5, unit: 'MT', rate: 62000, taxType: 'CGST_SGST', taxPct: 18, taxAmount: 27900, amount: 182900 },
    ],
    total: 259600, tcsAmount: 0, roundAmt: 0, notes: 'Sample invoice — for design preview only.',
  };
}
window._previewInvoiceDesign = function (key) {
  const latest = (state.saleInvoices || [])[(state.saleInvoices || []).length - 1];
  renderStyledInvoice(latest || _sampleInvoice(), key);
};

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
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
  // Capacitor-aware save so it works in the Android app, not just the browser.
  mobileDownloadBlob(blob, 'Sales_Ledger_' + new Date().toISOString().slice(0, 10) + '.csv', 'text/csv');
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
