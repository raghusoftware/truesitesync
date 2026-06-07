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
import { formatNumber2, amountToWordsINR } from './format.js';

const _num2 = formatNumber2;

/**
 * "Simple" Tax Invoice theme — our company header + a clean GST invoice table.
 * Supports a configurable minimum number of table rows (blank filler rows) so
 * the items table always looks full/proper: Settings → Print → Tax Invoice
 * minimum rows (state.printSettings.invoiceMinRows).
 */
export function exportSaleInvoicePDF(id) {
  const inv = (state.saleInvoices || []).find(i => i.id === id);
  if (!inv) { showToast('Invoice not found', 'error'); return; }
  const c = state.clients.find(x => x.id === inv.clientId);
  const clientName = c?.name || inv.clientName || 'Unknown';
  const cp = state.companyProfile || {};

  const doc = new window.jspdf.jsPDF('p', 'mm', 'a4');
  const pw = doc.internal.pageSize.getWidth();
  const ml = 14, mr = 14;
  const cur = (getPdfCurrency() || 'Rs.').trim();

  // ── Company header: logo at top-left, name beside it, details on one line ──
  let y = 14;
  let textX = ml;
  if (cp.logo) {
    try { doc.addImage(cp.logo, 'PNG', ml, y, 22, 22); textX = ml + 27; } catch {}
  }
  doc.setTextColor(0, 0, 0); doc.setFont('helvetica', 'bold'); doc.setFontSize(15);
  doc.text(cp.CompanyName || 'YOUR COMPANY', textX, y + 6);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(70, 70, 70);
  const hp = [];
  if (cp.Address) hp.push(cp.Address);
  if (cp.Phone) hp.push('Ph: ' + cp.Phone);
  if (cp.Email) hp.push(cp.Email);
  if (cp.GST) hp.push('GSTIN: ' + cp.GST);
  let dy = y + 11;
  doc.splitTextToSize(hp.join('   |   '), pw - textX - mr).forEach(line => { doc.text(line, textX, dy); dy += 4; });
  y = Math.max(y + 22, dy) + 2;
  doc.setDrawColor(203, 213, 225); doc.setLineWidth(0.3); doc.line(ml, y, pw - mr, y);
  y += 4; doc.setTextColor(0, 0, 0);

  // Title bar
  doc.setFillColor(30, 58, 138);
  doc.rect(ml, y, pw - ml - mr, 8, 'F');
  doc.setTextColor(255, 255, 255); doc.setFont('helvetica', 'bold'); doc.setFontSize(11);
  doc.text('TAX INVOICE', pw / 2, y + 5.6, { align: 'center' });
  y += 12; doc.setTextColor(0, 0, 0);

  // ── Bill To (left) + Invoice details (right) ──
  const colR = pw / 2 + 4;
  let ly = y, ry = y;
  doc.setFont('helvetica', 'bold'); doc.setFontSize(8.5);
  doc.text('Bill To:', ml, ly); ly += 4.5;
  doc.setFontSize(9.5); doc.text(clientName, ml, ly); ly += 4.5;
  doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5);
  const addr = (c?.address || inv.clientAddress || '').toString();
  if (addr) doc.splitTextToSize(addr, pw / 2 - ml - 6).forEach(line => { doc.text(line, ml, ly); ly += 4; });
  if (c?.gst) { doc.text('GSTIN: ' + c.gst, ml, ly); ly += 4; }
  if (inv.stateOfSupply) { doc.text('State: ' + inv.stateOfSupply, ml, ly); ly += 4; }

  doc.setFont('helvetica', 'bold'); doc.setFontSize(8.5);
  doc.text('Invoice Details:', colR, ry); ry += 4.5;
  doc.setFontSize(8.5);
  const detail = (label, val) => {
    if (val === undefined || val === null || val === '') return;
    doc.setFont('helvetica', 'bold'); doc.text(label, colR, ry);
    const lw = doc.getTextWidth(label);
    doc.setFont('helvetica', 'normal'); doc.text(' ' + val, colR + lw, ry); ry += 4;
  };
  detail('No:', inv.invoiceNo || '');
  detail('Date:', inv.date || '');
  detail('Place of Supply:', inv.stateOfSupply || '');
  detail('PO No:', inv.poNo || '');
  detail('PO Date:', inv.poDate || '');
  y = Math.max(ly, ry) + 3;

  // ── Items table (with minimum filler rows) ──
  const items = inv.items || [];
  const intStr = (n) => _num2(n).replace(/\.00$/, '');
  const body = items.map((it, i) => [
    i + 1, it.desc || '', it.hsn || '', intStr(it.qty || 0), it.unit || '',
    _num2(it.rate || 0),
    _num2(it.taxAmount || 0) + (it.taxPct ? ` (${it.taxPct}%)` : ''),
    _num2(it.amount || 0),
  ]);
  const minRows = Math.max(0, parseInt(state.printSettings?.invoiceMinRows ?? 8) || 0);
  while (body.length < minRows) body.push(['', '', '', '', '', '', '', '']);

  const sumQty = items.reduce((s, it) => s + (parseFloat(it.qty) || 0), 0);
  const sumTax = items.reduce((s, it) => s + (parseFloat(it.taxAmount) || 0), 0);
  const sumGross = items.reduce((s, it) => s + (parseFloat(it.amount) || 0), 0);
  const sumTaxable = sumGross - sumTax;

  doc.autoTable({
    startY: y,
    head: [['#', 'Item name', 'HSN/SAC', 'Quantity', 'Unit', `Price/Unit (${cur})`, `GST (${cur})`, `Amount (${cur})`]],
    body,
    foot: [['', 'Total', '', intStr(sumQty), '', '', _num2(sumTax), _num2(sumGross)]],
    theme: 'grid',
    headStyles: { fillColor: [30, 58, 138], textColor: 255, fontSize: 8, halign: 'center', fontStyle: 'bold' },
    footStyles: { fillColor: [241, 245, 249], textColor: 0, fontStyle: 'bold', fontSize: 8 },
    styles: { fontSize: 8, cellPadding: 2, overflow: 'linebreak', lineColor: [203, 213, 225], lineWidth: 0.1, minCellHeight: 7 },
    columnStyles: {
      0: { cellWidth: 8, halign: 'center' }, 1: { cellWidth: 'auto' }, 2: { cellWidth: 20, halign: 'center' },
      3: { cellWidth: 18, halign: 'right' }, 4: { cellWidth: 14, halign: 'center' }, 5: { cellWidth: 26, halign: 'right' },
      6: { cellWidth: 26, halign: 'right' }, 7: { cellWidth: 28, halign: 'right' },
    },
    margin: { left: ml, right: mr },
  });
  y = doc.lastAutoTable.finalY + 4;

  // ── Tax summary (HSN-wise, CGST + SGST split) — left half ──
  const groups = {};
  items.forEach(it => {
    const k = it.hsn || '-';
    if (!groups[k]) groups[k] = { taxable: 0, tax: 0, rate: parseFloat(it.taxPct) || 0 };
    groups[k].taxable += (parseFloat(it.amount) || 0) - (parseFloat(it.taxAmount) || 0);
    groups[k].tax += (parseFloat(it.taxAmount) || 0);
  });
  const taxBody = Object.entries(groups).map(([hsn, g]) => {
    const half = g.tax / 2, hr = g.rate / 2;
    return [hsn, _num2(g.taxable), hr ? hr + '%' : '', _num2(half), hr ? hr + '%' : '', _num2(half), _num2(g.tax)];
  });
  taxBody.push(['TOTAL', _num2(sumTaxable), '', _num2(sumTax / 2), '', _num2(sumTax / 2), _num2(sumTax)]);
  doc.autoTable({
    startY: y,
    head: [['HSN/SAC', `Taxable`, 'CGST%', `CGST`, 'SGST%', `SGST`, `Total Tax`]],
    body: taxBody, theme: 'grid',
    headStyles: { fillColor: [71, 85, 105], textColor: 255, fontSize: 7, halign: 'center' },
    styles: { fontSize: 7, cellPadding: 1.4, halign: 'right' },
    columnStyles: { 0: { halign: 'center' } },
    margin: { left: ml, right: pw / 2 + 2 },
  });
  const taxBottom = doc.lastAutoTable.finalY;

  // ── Totals (right half) ──
  let ty = y + 2; const totX = pw / 2 + 6, valX = pw - mr;
  const totRow = (label, val, bold) => {
    doc.setFont('helvetica', bold ? 'bold' : 'normal'); doc.setFontSize(bold ? 10 : 9);
    doc.text(label, totX, ty); doc.text(val, valX, ty, { align: 'right' }); ty += bold ? 6 : 5;
  };
  totRow('Sub Total :', cur + ' ' + _num2(sumGross));
  if (inv.tcsAmount) totRow('TCS :', cur + ' ' + _num2(inv.tcsAmount));
  if (inv.roundAmt) totRow('Round Off :', (inv.roundAmt < 0 ? '- ' : '+ ') + cur + ' ' + _num2(Math.abs(inv.roundAmt)));
  totRow('Total :', cur + ' ' + _num2(inv.total), true);
  y = Math.max(taxBottom, ty) + 6;

  // ── Payment mode, amount in words, received/balance, signature ──
  doc.setFont('helvetica', 'bold'); doc.setFontSize(8.5);
  doc.text('Payment Mode: ', ml, y);
  doc.setFont('helvetica', 'normal'); doc.text(inv.payType || 'Credit', ml + doc.getTextWidth('Payment Mode: '), y);
  y += 6;
  doc.setFont('helvetica', 'bold'); doc.text('Invoice Amount in Words:', ml, y); y += 4.5;
  doc.setFont('helvetica', 'normal');
  doc.splitTextToSize(amountToWordsINR(inv.total || 0), pw - ml - mr).forEach(line => { doc.text(line, ml, y); y += 4.2; });
  y += 2;
  const sigY = y;
  // Received / Balance — only when enabled in invoice settings
  if (state.printSettings?.invoiceShowReceived) {
    const received = parseFloat(inv.received) || 0;
    doc.text('Received : ' + cur + ' ' + _num2(received), ml, y);
    doc.text('Balance : ' + cur + ' ' + _num2((inv.total || 0) - received), ml, y + 4.5);
  }

  doc.setFont('helvetica', 'bold'); doc.setFontSize(8.5);
  doc.text('For ' + (cp.CompanyName || 'Company') + ':', valX, sigY, { align: 'right' });
  doc.setFont('helvetica', 'normal'); doc.setFontSize(8);
  doc.text('Authorized Signatory', valX, sigY + 16, { align: 'right' });

  if (inv.notes) { y += 22; doc.setFontSize(7.5); doc.setTextColor(90, 90, 90); doc.text('Notes: ' + inv.notes, ml, y); }

  mobileSavePDF(doc, (inv.invoiceNo || 'Invoice').replace(/[\\/]/g, '-') + '.pdf');
  showToast('Invoice PDF downloaded');
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
