/**
 * ═══════════════════════════════════════════════════════════
 * True Site Sync — US Pay Application (AIA G702/G703 style)
 * ═══════════════════════════════════════════════════════════
 * The North-American equivalent of an RA bill. A progress payment is
 * presented as:
 *   • G702  — Application & Certificate for Payment (the summary block)
 *   • G703  — Continuation Sheet (the Schedule of Values, line by line)
 * with retainage held back on completed work.
 *
 * It is generated from an existing raBill (the "this period" billing) plus
 * the project's Schedule of Values (planned value per line from the BOQ), so
 * US/Canada users get a compliant pay application from the same certified
 * work that drives an Indian RA bill. India is untouched.
 * ═══════════════════════════════════════════════════════════
 */
import { state } from './state.js';
import { showToast, getPdfCurrency, getCompanyHeaderForPDF, mobileSavePDF, amountToWordsCur, getTerm } from './utils.js';
import { formatNumber2 } from './format.js?v=1.0.1';

const _n2 = formatNumber2;

/** Default retainage %, remembered per workspace once set. */
function _retainagePct() {
  const stored = state.printSettings && state.printSettings.retainagePct;
  return (stored == null || isNaN(stored)) ? 10 : Number(stored);
}

/** Schedule-of-Values value per BOQ code, from the project plan (planned qty × rate). */
function _sovMap(projectId) {
  const map = {};
  try {
    const pva = window.mpPlanVsActual && window.mpPlanVsActual(projectId);
    (pva && pva.rows || []).forEach(r => {
      map[r.code] = (Number(r.plannedQty) || 0) * (Number(r.rate) || 0);
    });
  } catch {}
  return map;
}

export function exportPayApplicationPdf(raBillId) {
  try {
    if (!window.jspdf || !window.jspdf.jsPDF) return showToast('PDF library not loaded — refresh', 'error');
    const b = (state.raBills || []).find(x => x.id === raBillId);
    if (!b) return showToast('Pay application source not found', 'error');

    // Retainage — ask once, remember it.
    const cur0 = _retainagePct();
    const entered = prompt('Retainage % held on completed work:', String(cur0));
    if (entered === null) return; // cancelled
    const rp = Math.max(0, Math.min(100, parseFloat(entered) || 0));
    state.printSettings = state.printSettings || {};
    state.printSettings.retainagePct = rp;
    try { window.saveAllData && window.saveAllData(); } catch {}

    const proj = (state.projects || []).find(p => p.id === b.projectId) || {};
    const client = (state.clients || []).find(c => c.id === b.clientId) || {};
    const cp = state.companyProfile || {};
    const cur = getPdfCurrency();
    const sov = _sovMap(b.projectId);

    // Build G703 lines. C=scheduled, D=previous, E=this period, G=D+E.
    let sumC = 0, sumD = 0, sumE = 0, sumG = 0;
    const rows = (b.lines || []).map((l, i) => {
      const rate = Number(l.rate) || 0;
      const D = (Number(l.prevBilledQty) || 0) * rate;
      const E = (Number(l.thisQty) || 0) * rate;
      const G = D + E;
      const C = sov[l.code] != null && sov[l.code] > 0 ? sov[l.code] : ((Number(l.cumulativeQty) || 0) * rate) || G;
      const pct = C > 0 ? Math.min(100, (G / C) * 100) : (G > 0 ? 100 : 0);
      const bal = Math.max(0, C - G);
      const ret = G * rp / 100;
      sumC += C; sumD += D; sumE += E; sumG += G;
      return [
        String(i + 1),
        l.description || l.code || '',
        cur + _n2(C),
        cur + _n2(D),
        cur + _n2(E),
        cur + _n2(G),
        pct.toFixed(0) + '%',
        cur + _n2(bal),
        cur + _n2(ret),
      ];
    });
    const retTotal = sumG * rp / 100;
    const prevRet = sumD * rp / 100;
    const earnedLessRet = sumG - retTotal;
    const lessPrev = sumD - prevRet;
    const currentDue = earnedLessRet - lessPrev; // == sumE - retainage on sumE
    const balToFinish = sumC - sumG + retTotal;

    const doc = new window.jspdf.jsPDF('p', 'mm', 'a4');
    const pw = doc.internal.pageSize.getWidth();
    const ml = 12, mr = 12;
    const NAVY = [30, 41, 59];

    let y = getCompanyHeaderForPDF(doc);

    // Title band
    doc.setFillColor(NAVY[0], NAVY[1], NAVY[2]);
    doc.rect(ml, y, pw - ml - mr, 9, 'F');
    doc.setTextColor(255, 255, 255); doc.setFont('helvetica', 'bold'); doc.setFontSize(11);
    doc.text('APPLICATION AND CERTIFICATE FOR PAYMENT', pw / 2, y + 6, { align: 'center' });
    y += 13; doc.setTextColor(0, 0, 0);

    // Meta: to (owner) left, application no/date right
    doc.setFontSize(8.5);
    const appNo = (b.raNo || '').replace(/^RA-?/i, '') || String((state.raBills || []).filter(x => x.projectId === b.projectId).findIndex(x => x.id === b.id) + 1);
    doc.setFont('helvetica', 'bold'); doc.text('TO OWNER:', ml, y);
    doc.setFont('helvetica', 'normal'); doc.text(client.name || proj.clientName || '—', ml + 22, y);
    doc.setFont('helvetica', 'bold'); doc.text('APPLICATION NO:', pw - 78, y);
    doc.setFont('helvetica', 'normal'); doc.text(String(appNo), pw - 30, y); y += 5;
    doc.setFont('helvetica', 'bold'); doc.text('PROJECT:', ml, y);
    doc.setFont('helvetica', 'normal'); doc.text(proj.name || b.locationLabels?.join(', ') || '—', ml + 22, y);
    doc.setFont('helvetica', 'bold'); doc.text('PERIOD TO:', pw - 78, y);
    doc.setFont('helvetica', 'normal'); doc.text(b.date || '—', pw - 30, y); y += 5;
    doc.setFont('helvetica', 'bold'); doc.text('FROM CONTRACTOR:', ml, y);
    doc.setFont('helvetica', 'normal'); doc.text(cp.CompanyName || 'Contractor', ml + 34, y);
    doc.setFont('helvetica', 'bold'); doc.text('RETAINAGE:', pw - 78, y);
    doc.setFont('helvetica', 'normal'); doc.text(rp + '%', pw - 30, y); y += 7;

    // G702 summary block (right-aligned money column)
    const sumRows = [
      ['1. Original Contract Sum', cur + _n2(sumC)],
      ['2. Net change by Change Orders', cur + _n2(0)],
      ['3. Contract Sum to Date (1 ± 2)', cur + _n2(sumC)],
      ['4. Total Completed & Stored to Date', cur + _n2(sumG)],
      ['5. Retainage (' + rp + '% of completed work)', cur + _n2(retTotal)],
      ['6. Total Earned Less Retainage (4 − 5)', cur + _n2(earnedLessRet)],
      ['7. Less Previous Certificates for Payment', cur + _n2(lessPrev)],
      ['8. CURRENT PAYMENT DUE', cur + _n2(currentDue)],
      ['9. Balance to Finish, Including Retainage', cur + _n2(balToFinish)],
    ];
    doc.autoTable({
      startY: y,
      body: sumRows,
      theme: 'grid',
      styles: { fontSize: 8.5, cellPadding: 1.8, lineColor: [203, 213, 225], lineWidth: 0.1 },
      columnStyles: { 0: { cellWidth: 'auto', fontStyle: 'normal' }, 1: { cellWidth: 44, halign: 'right', fontStyle: 'bold' } },
      didParseCell: (d) => { if (d.row.index === 7) { d.cell.styles.fillColor = [255, 243, 234]; d.cell.styles.textColor = [194, 50, 31]; d.cell.styles.fontStyle = 'bold'; d.cell.styles.fontSize = 9.5; } },
      margin: { left: ml, right: mr },
    });
    y = doc.lastAutoTable.finalY + 5;

    // G703 Continuation Sheet — Schedule of Values
    doc.setFont('helvetica', 'bold'); doc.setFontSize(9); doc.setTextColor(NAVY[0], NAVY[1], NAVY[2]);
    doc.text('CONTINUATION SHEET — SCHEDULE OF VALUES', ml, y); y += 2;
    doc.setTextColor(0, 0, 0);
    doc.autoTable({
      startY: y + 1,
      head: [['#', 'Description of Work', 'Scheduled\nValue', 'From Prev.\nApplication', 'This\nPeriod', 'Completed &\nStored to Date', '%', 'Balance\nto Finish', 'Retainage']],
      body: rows,
      foot: [['', 'GRAND TOTAL', cur + _n2(sumC), cur + _n2(sumD), cur + _n2(sumE), cur + _n2(sumG), (sumC > 0 ? Math.min(100, sumG / sumC * 100).toFixed(0) : '0') + '%', cur + _n2(Math.max(0, sumC - sumG)), cur + _n2(retTotal)]],
      theme: 'grid',
      headStyles: { fillColor: NAVY, textColor: 255, fontSize: 6.6, fontStyle: 'bold', halign: 'center', valign: 'middle' },
      footStyles: { fillColor: [241, 245, 249], textColor: 0, fontStyle: 'bold', fontSize: 7 },
      styles: { fontSize: 7, cellPadding: 1.3, lineColor: [203, 213, 225], lineWidth: 0.1, overflow: 'linebreak' },
      columnStyles: {
        0: { cellWidth: 7, halign: 'center' }, 1: { cellWidth: 'auto' },
        2: { cellWidth: 22, halign: 'right' }, 3: { cellWidth: 22, halign: 'right' },
        4: { cellWidth: 20, halign: 'right' }, 5: { cellWidth: 24, halign: 'right' },
        6: { cellWidth: 10, halign: 'center' }, 7: { cellWidth: 20, halign: 'right' }, 8: { cellWidth: 18, halign: 'right' },
      },
      margin: { left: ml, right: mr },
    });
    y = doc.lastAutoTable.finalY + 6;

    // Amount in words for the current payment due
    doc.setFont('helvetica', 'bold'); doc.setFontSize(8);
    const wLines = doc.splitTextToSize('Current Payment Due in words: ' + amountToWordsCur(currentDue), pw - ml - mr);
    wLines.forEach(line => { doc.text(line, ml, y); y += 4.2; });
    y += 6;

    // Signatures
    const colW = (pw - ml - mr) / 2;
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8);
    doc.line(ml, y, ml + colW - 8, y);
    doc.line(ml + colW, y, pw - mr, y); y += 4;
    doc.text('Contractor  ·  Date', ml, y);
    doc.text('Architect / Owner  ·  Date', ml + colW, y);

    // Footer page number
    const pageH = doc.internal.pageSize.getHeight();
    doc.setFontSize(7); doc.setTextColor(148, 163, 184);
    doc.text('Application for Payment ' + (b.raNo || ''), ml, pageH - 6);
    doc.text('Generated by True Site Sync', pw - mr, pageH - 6, { align: 'right' });

    mobileSavePDF(doc, `PayApp-${(b.raNo || 'application').replace(/[\\/]/g, '-')}.pdf`);
    showToast('Pay Application (AIA) downloaded', 'success');
  } catch (err) {
    console.error('Pay Application PDF failed:', err);
    showToast('PDF error: ' + (err && err.message ? err.message : err), 'error');
  }
}
window.exportPayApplicationPdf = exportPayApplicationPdf;
