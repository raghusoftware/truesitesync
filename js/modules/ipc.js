/**
 * ═══════════════════════════════════════════════════════════
 * True Site Sync — FIDIC Interim Payment Certificate (IPC)
 * ═══════════════════════════════════════════════════════════
 * The GCC/UAE progress-payment document. Unlike an Indian RA bill, an IPC is
 * certified on a cumulative basis and nets out retention, mobilization-
 * advance recovery and previously-certified amounts:
 *
 *   Value of work to date  + materials on site
 *     − Retention (held to date)
 *     − Advance (mobilization) recovery to date
 *     − Amount previously certified
 *     = Net this certificate  (+ VAT)
 *
 * It reads the same certified raBills that drive measurement billing, plus
 * per-project contract terms (retention %, advance paid, recovery %).
 * Retention releases (taking-over + end of DLP) are tracked separately.
 * ═══════════════════════════════════════════════════════════
 */
import { state, saveAllData } from './state.js';
import { showToast, getPdfCurrency, getCompanyHeaderForPDF, mobileSavePDF, amountToWordsCur, getTaxConfig } from './utils.js';
import { formatNumber2 } from './format.js?v=1.0.1';

const _n2 = formatNumber2;
const _num = n => (Number(n) || 0);

/** Retention % from the project's / client's Billing & compliance rules (null when not set). */
function _ruleRet(pid) {
  const p = (state.projects || []).find(x => x.id === pid); if (!p) return null;
  const c = (state.clients || []).find(x => x.id === p.clientId) || {};
  const v = p.defaultRetentionRate != null && p.defaultRetentionRate !== '' ? p.defaultRetentionRate : c.defaultRetentionRate;
  return v != null && v !== '' ? _num(v) : null;
}
/** Per-project contract terms, with sensible UAE defaults. */
export function getContractTerms(pid) {
  const all = state.contractTerms || (state.contractTerms = {});
  const t = all[pid] || {};
  return {
    retentionPct: t.retentionPct != null ? _num(t.retentionPct) : _ruleRet(pid) ?? 10,
    advancePaid: _num(t.advancePaid),
    advanceRecoveryPct: t.advanceRecoveryPct != null ? _num(t.advanceRecoveryPct) : 0,
  };
}
export function saveContractTerms(pid, terms) {
  const all = state.contractTerms || (state.contractTerms = {});
  all[pid] = { ...all[pid], ...terms };
  saveAllData();
}
window.getContractTerms = getContractTerms;
window._saveContractTermsFromUI = function (pid) {
  saveContractTerms(pid, {
    retentionPct: _num(document.getElementById('ctRetPct')?.value),
    advancePaid: _num(document.getElementById('ctAdvPaid')?.value),
    advanceRecoveryPct: _num(document.getElementById('ctAdvRecPct')?.value),
  });
  try { window.closeFormModal && window.closeFormModal(); } catch {}
  showToast('Contract terms saved', 'success');
  try { window.renderRABilling && window.renderRABilling(); } catch {}
};

/** Retention held / released / balance for a project. */
export function retentionSummary(pid) {
  const t = getContractTerms(pid);
  const bills = (state.raBills || []).filter(b => b.projectId === pid);
  const cumWork = bills.reduce((s, b) => s + _num(b.total), 0);
  const held = cumWork * t.retentionPct / 100;
  const released = (state.retentionReleases || [])
    .filter(r => r.projectId === pid)
    .reduce((s, r) => s + _num(r.amount), 0);
  return { held, released, balance: Math.max(0, held - released) };
}
window.retentionSummary = retentionSummary;

window._recordRetentionRelease = function (pid) {
  const s = retentionSummary(pid);
  if (s.balance <= 0) { showToast('No retention balance to release', 'info'); return; }
  const kind = prompt('Retention release — type "1" for Taking-Over (half) or "2" for End of DLP (remaining):', '1');
  if (kind === null) return;
  const half = Math.round(s.held / 2 * 100) / 100;
  const amt = kind.trim() === '2' ? s.balance : Math.min(s.balance, half);
  if (!Array.isArray(state.retentionReleases)) state.retentionReleases = [];
  state.retentionReleases.push({
    id: 'rr_' + Date.now(), projectId: pid, amount: amt,
    kind: kind.trim() === '2' ? 'End of DLP' : 'Taking-Over',
    date: new Date().toISOString().split('T')[0], createdAt: Date.now(),
  });
  saveAllData();
  try { window.renderRABilling && window.renderRABilling(); } catch {}
  showToast('Retention release recorded', 'success');
};

/** Generate the Interim Payment Certificate PDF for one raBill (= this period). */
export function exportIpcPdf(raBillId) {
  try {
    if (!window.jspdf || !window.jspdf.jsPDF) return showToast('PDF library not loaded — refresh', 'error');
    const b = (state.raBills || []).find(x => x.id === raBillId);
    if (!b) return showToast('Certificate source not found', 'error');
    const pid = b.projectId;
    const t = getContractTerms(pid);

    // Materials on site this period (optional).
    const mEntered = prompt('Value of materials on site this period (optional):', '0');
    if (mEntered === null) return;
    const materials = Math.max(0, _num(mEntered));

    // Cumulative basis: order bills, find this one's position.
    const bills = (state.raBills || []).filter(x => x.projectId === pid)
      .sort((a, c) => (a.date || '').localeCompare(c.date || '') || String(a.id).localeCompare(String(c.id)));
    const idx = bills.findIndex(x => x.id === b.id);
    const cumToDate = bills.slice(0, idx + 1).reduce((s, x) => s + _num(x.total), 0);
    const cumPrev = bills.slice(0, idx).reduce((s, x) => s + _num(x.total), 0);

    const retPct = t.retentionPct, advPaid = t.advancePaid, recPct = t.advanceRecoveryPct;
    const retToDate = cumToDate * retPct / 100;
    const retPrev = cumPrev * retPct / 100;
    const recToDate = Math.min(advPaid, cumToDate * recPct / 100);
    const recPrev = Math.min(advPaid, cumPrev * recPct / 100);

    const grossToDate = cumToDate + materials;
    const dueToDate = grossToDate - retToDate - recToDate;
    const prevNet = cumPrev - retPrev - recPrev;
    const netThis = dueToDate - prevNet;

    const tax = getTaxConfig();
    const vatRate = tax.mode === 'vat' ? (tax.defaultRate || 0) : 0;
    const vatAmt = netThis > 0 ? netThis * vatRate / 100 : 0;
    const totalPayable = netThis + vatAmt;

    const proj = (state.projects || []).find(p => p.id === pid) || {};
    const client = (state.clients || []).find(c => c.id === b.clientId) || {};
    const cp = state.companyProfile || {};
    const cur = getPdfCurrency();
    const ipcNo = idx + 1;

    // Contract value (SOV + approved change orders) for % complete.
    let sov = 0;
    try { const pva = window.mpPlanVsActual && window.mpPlanVsActual(pid); sov = _num(pva && pva.totPlanVal); } catch {}
    const coTotal = (state.changeOrders || []).filter(o => o.projectId === pid && o.status !== 'pending').reduce((s, o) => s + _num(o.amount), 0);
    const contractVal = (sov || cumToDate) + coTotal;
    const pctComplete = contractVal > 0 ? Math.min(100, cumToDate / contractVal * 100) : 0;

    const doc = new window.jspdf.jsPDF('p', 'mm', 'a4');
    const pw = doc.internal.pageSize.getWidth();
    const ml = 14, mr = 14;
    const NAVY = [23, 37, 84];
    let y = getCompanyHeaderForPDF(doc);

    doc.setFillColor(NAVY[0], NAVY[1], NAVY[2]);
    doc.rect(ml, y, pw - ml - mr, 9, 'F');
    doc.setTextColor(255, 255, 255); doc.setFont('helvetica', 'bold'); doc.setFontSize(11);
    doc.text('INTERIM PAYMENT CERTIFICATE', pw / 2, y + 6, { align: 'center' });
    y += 13; doc.setTextColor(0, 0, 0);

    doc.setFontSize(8.5);
    const meta = (lbl, val, x) => { doc.setFont('helvetica', 'bold'); doc.text(lbl, x, y); const w = doc.getTextWidth(lbl); doc.setFont('helvetica', 'normal'); doc.text(' ' + val, x + w, y); };
    meta('Employer:', client.name || proj.clientName || '—', ml); meta('IPC No:', String(ipcNo), pw - 70); y += 5;
    meta('Project:', proj.name || (b.locationLabels || []).join(', ') || '—', ml); meta('Date:', b.date || '—', pw - 70); y += 5;
    meta('Contractor:', cp.CompanyName || 'Contractor', ml); meta('Progress:', pctComplete.toFixed(1) + '%', pw - 70); y += 7;

    const rows = [
      ['A. Value of work executed to date', cur + _n2(cumToDate)],
      ['B. Add: Materials on site', cur + _n2(materials)],
      ['C. Gross value to date (A + B)', cur + _n2(grossToDate)],
      [`D. Less: Retention (${retPct}% of work)`, '(' + cur + _n2(retToDate) + ')'],
      ['E. Less: Advance recovery to date', '(' + cur + _n2(recToDate) + ')'],
      ['F. Amount due to date (C − D − E)', cur + _n2(dueToDate)],
      ['G. Less: Amount previously certified', '(' + cur + _n2(prevNet) + ')'],
      ['H. NET AMOUNT THIS CERTIFICATE (F − G)', cur + _n2(netThis)],
    ];
    if (vatRate > 0) {
      rows.push([`I. Add: ${tax.singleLabel} @ ${vatRate}%`, cur + _n2(vatAmt)]);
      rows.push(['J. TOTAL PAYABLE (incl ' + tax.singleLabel + ')', cur + _n2(totalPayable)]);
    }
    doc.autoTable({
      startY: y,
      body: rows,
      theme: 'grid',
      styles: { fontSize: 9, cellPadding: 2, lineColor: [203, 213, 225], lineWidth: 0.1 },
      columnStyles: { 0: { cellWidth: 'auto' }, 1: { cellWidth: 48, halign: 'right', fontStyle: 'bold' } },
      didParseCell: (d) => {
        const label = rows[d.row.index] && rows[d.row.index][0];
        if (label && (label.startsWith('H.') || label.startsWith('J.'))) {
          d.cell.styles.fillColor = [255, 243, 234]; d.cell.styles.textColor = [194, 50, 31];
          d.cell.styles.fontStyle = 'bold'; d.cell.styles.fontSize = 10;
        }
      },
      margin: { left: ml, right: mr },
    });
    y = doc.lastAutoTable.finalY + 5;

    // Advance + retention memo
    const rs = retentionSummary(pid);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); doc.setTextColor(90);
    doc.text(`Mobilization advance: ${cur}${_n2(advPaid)} · recovered to date ${cur}${_n2(recToDate)} · recovery rate ${recPct}% of work.`, ml, y); y += 4;
    doc.text(`Retention held to date ${cur}${_n2(rs.held)} · released ${cur}${_n2(rs.released)} · balance ${cur}${_n2(rs.balance)} (5% at taking-over, 5% at end of DLP).`, ml, y); y += 6;
    doc.setTextColor(0);

    doc.setFont('helvetica', 'bold'); doc.setFontSize(8);
    const amtForWords = vatRate > 0 ? totalPayable : netThis;
    doc.splitTextToSize('Amount certified in words: ' + amountToWordsCur(amtForWords), pw - ml - mr).forEach(line => { doc.text(line, ml, y); y += 4.2; });
    y += 8;

    const colW = (pw - ml - mr) / 2;
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8);
    doc.line(ml, y, ml + colW - 8, y); doc.line(ml + colW, y, pw - mr, y); y += 4;
    doc.text("Engineer's Representative · Date", ml, y);
    doc.text('Contractor · Date', ml + colW, y);

    const ph = doc.internal.pageSize.getHeight();
    doc.setFontSize(7); doc.setTextColor(148, 163, 184);
    doc.text('Interim Payment Certificate No. ' + ipcNo, ml, ph - 6);
    doc.text('Generated by True Site Sync', pw - mr, ph - 6, { align: 'right' });

    mobileSavePDF(doc, `IPC-${ipcNo}-${(proj.name || 'project').replace(/[\\/]/g, '-')}.pdf`);
    showToast('Interim Payment Certificate downloaded', 'success');
  } catch (err) {
    console.error('IPC PDF failed:', err);
    showToast('PDF error: ' + (err && err.message ? err.message : err), 'error');
  }
}
window.exportIpcPdf = exportIpcPdf;
