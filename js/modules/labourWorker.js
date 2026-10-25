/**
 * labourWorker.js — tap a worker on Labour Attendance → a panel slides up in
 * place (no trip to the party ledger) showing, for a chosen period:
 * amount paid, wages earned, balance, attendance calendar and the payments.
 * The same period exports a one-worker Muster Card PDF that states the total
 * paid. All money / day maths lives in labourCalc.js (unit-tested).
 */
import { state } from './state.js';
import * as LC from './labourCalc.js';
import { settledAmount } from './deductions.js';
import { getCompanyHeaderForPDF, mobileSavePDF, pdfMoney, showToast } from './utils.js';

const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const cur = () => (typeof window.getCurrencySymbol === 'function' ? window.getCurrencySymbol() : '₹');
const money = (n) => cur() + (Number(n) || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const MON = 'Jan Feb Mar Apr May Jun Jul Aug Sep Oct Nov Dec'.split(' ');
const fmtD = (d) => { const [y, m, dd] = String(d).split('-').map(Number); return `${dd} ${MON[m - 1]} ${y}`; };
const monthLabel = (d) => { const [y, m] = String(d).split('-').map(Number); return `${MON[m - 1]} ${y}`; };

// Panel state: which worker, and the period filter.
let _id = null;
let _kind = 'month';        // month | week | custom
let _offset = 0;            // months back from the current month
let _from = '', _to = '';   // custom range

function worker(id) { return (state.labourMaster || []).find(w => w.id === id) || null; }

function range() {
  return LC.periodRange(_kind, { offset: _offset, from: _from, to: _to });
}

function summary(w, r = range()) {
  return LC.workerPeriod({
    worker: w, logs: state.attendanceLogs || [], payments: state.labourPayments || [],
    advances: state.labourAdvances || [], deductions: state.labourDeductions || [],
    from: r.from, to: r.to, settle: settledAmount,
  });
}

function periodTitle(r) {
  if (_kind === 'month') return monthLabel(r.from);
  if (_kind === 'week') return `This week · ${fmtD(r.from)} – ${fmtD(r.to)}`;
  return `${fmtD(r.from)} – ${fmtD(r.to)}`;
}

function accountName(id) { return (state.accounts || []).find(a => a.id === id)?.name || ''; }

/** Month calendar strip: one small tile per day, coloured by status. */
function calendarHtml(s) {
  const head = ['M', 'T', 'W', 'T', 'F', 'S', 'S'].map(d => `<span class="lw-cal-h">${d}</span>`).join('');
  const [y, m, d] = s.from.split('-').map(Number);
  const lead = (new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7;
  const today = LC.todayISO();
  const cells = Array(lead).fill('<span></span>').concat(s.days.map(day => {
    const n = Number(day.date.slice(8));
    const cls = day.status ? day.status.toLowerCase() : (day.date > today ? 'future' : '');
    const tip = `${fmtD(day.date)} · ${LC.STATUS_LABEL[day.status] || 'Not marked'}${day.ot ? ` · OT ${day.ot}h` : ''}`;
    return `<span class="lw-day ${cls}" title="${esc(tip)}">${n}${day.ot ? '<i></i>' : ''}</span>`;
  }));
  return `<div class="lw-cal">${head}${cells.join('')}</div>`;
}

function render() {
  const host = document.getElementById('labWorkerOverlay');
  const w = worker(_id);
  if (!host || !w) return;
  const r = range();
  const s = summary(w, r);
  const overall = (() => { try { return window._labourNetPayable?.(w.id)?.net || 0; } catch { return 0; } })();
  const av = w.photo ? `<img src="${esc(w.photo)}" alt="">` : esc((w.name || '?').trim().charAt(0).toUpperCase());
  const chip = (k, label) => `<button type="button" class="ts-chip ${_kind === k ? 'on' : ''}" onclick="window._lwKind('${k}')">${label}</button>`;
  const rows = [
    ...s.payments.map(p => ({ date: p.date, kind: 'Paid', note: [accountName(p.accountId), p.ref].filter(Boolean).join(' · '), amt: p.paid, cls: 'paid' })),
    ...s.advances.map(a => ({ date: a.date, kind: 'Advance', note: a.note || '', amt: parseFloat(a.amount) || 0, cls: 'adv' })),
    ...s.deductions.map(d => ({ date: d.date, kind: 'Deduction', note: [d.deductionType, d.note].filter(Boolean).join(' · '), amt: parseFloat(d.amount) || 0, cls: 'ded' })),
  ].sort((a, b) => (a.date < b.date ? 1 : -1));
  const list = rows.length
    ? rows.map(x => `<div class="lw-tx"><div><b>${esc(fmtD(x.date))}</b><small>${esc(x.kind)}${x.note ? ' · ' + esc(x.note) : ''}</small></div><span class="${x.cls}">${money(x.amt)}</span></div>`).join('')
    : '<div class="lw-none">No payments in this period</div>';

  host.innerHTML = `<div class="lw-sheet" role="dialog" aria-label="${esc(w.name)}">
    <div class="lw-grab"></div>
    <div class="lw-head">
      <div class="lab-av">${av}</div>
      <div class="lw-who"><b>${esc(w.name || 'Worker')}</b><small>${esc(w.trade || '')}${w.dayRate ? ` · ${money(w.dayRate).replace(/\.00$/, '')}/day` : ''}</small></div>
      <button type="button" class="lw-x" onclick="window._lwClose()" aria-label="Close">✕</button>
    </div>
    <div class="lw-body">
      <div class="lw-filter">
        <div class="lw-chips">${chip('month', 'Month')}${chip('week', 'This week')}${chip('custom', 'Custom')}</div>
        ${_kind === 'month' ? `<div class="lw-step">
            <button type="button" onclick="window._lwMonth(-1)" aria-label="Previous month">‹</button>
            <span>${esc(monthLabel(r.from))}</span>
            <button type="button" onclick="window._lwMonth(1)" aria-label="Next month" ${_offset >= 0 ? 'disabled' : ''}>›</button></div>` : ''}
        ${_kind === 'custom' ? `<div class="lw-dates">
            <label>From<input type="date" value="${r.from}" onchange="window._lwDates(this.value,null)"></label>
            <label>To<input type="date" value="${r.to}" onchange="window._lwDates(null,this.value)"></label></div>` : ''}
        ${_kind === 'week' ? `<div class="lw-period">${esc(periodTitle(r))}</div>` : ''}
      </div>
      <div class="lw-paid">
        <small>Amount paid</small><b>${money(s.paid)}</b>
        <span>${s.payments.length} payment${s.payments.length === 1 ? '' : 's'} · ${esc(periodTitle(r))}</span>
      </div>
      <div class="lw-money">
        <div><small>Wages earned</small><b>${money(s.earned)}</b></div>
        <div><small>Advance${s.deduction ? ' + deduction' : ''}</small><b>${money(s.advance + s.deduction)}</b></div>
        <div><small>Balance (period)</small><b class="${s.balance > 0 ? 'due' : ''}">${money(s.balance)}</b></div>
      </div>
      <div class="lw-att">
        <div><b class="p">${s.present}</b><small>Present</small></div>
        <div><b class="h">${s.half}</b><small>Half day</small></div>
        <div><b class="a">${s.absent}</b><small>Absent</small></div>
        <div><b class="ot">${s.otHours}</b><small>OT hrs</small></div>
      </div>
      ${calendarHtml(s)}
      <div class="lw-sec">Payments &amp; advances</div>
      <div class="lw-txs">${list}</div>
      <div class="lw-overall">Total still to pay (all time): <b>${money(overall)}</b></div>
    </div>
    <div class="lw-actions">
      <button type="button" class="lw-btn ghost" onclick="window._lwPdf()">⤓ Muster card PDF</button>
      <button type="button" class="lw-btn" onclick="window._lwPay()">+ Pay</button>
    </div>
  </div>`;
}

export function openWorkerPanel(id) {
  if (!worker(id)) return;
  _id = id;
  let o = document.getElementById('labWorkerOverlay');
  if (!o) {
    o = document.createElement('div');
    o.id = 'labWorkerOverlay';
    o.className = 'lw-overlay';
    o.addEventListener('click', (e) => { if (e.target === o) closeWorkerPanel(); });
    o.__onBack = closeWorkerPanel;   // hardware / browser Back closes the panel
    document.body.appendChild(o);
  }
  o.style.display = 'flex';
  render();
}

export function closeWorkerPanel() {
  const o = document.getElementById('labWorkerOverlay');
  if (o) o.style.display = 'none';
}

/* ───────────────────── Muster Card PDF (one worker) ───────────────────── */

export function exportMusterCard(id, from, to) {
  const w = worker(id);
  if (!w) return showToast('Worker not found', 'error');
  if (!window.jspdf?.jsPDF) return showToast('PDF library not loaded yet — try again', 'error');
  const r = from && to ? { from, to } : range();
  const s = summary(w, r);
  const proj = (state.projects || []).find(p => p.id === (w.projectId || state.currentProjectId));
  const doc = new window.jspdf.jsPDF('p', 'mm', 'a4');
  const pw = doc.internal.pageSize.getWidth();
  const M = 14, W = pw - M * 2;
  const ink = [15, 23, 42], muted = [100, 116, 139], brand = [194, 65, 12];

  let y = getCompanyHeaderForPDF(doc);
  // Title band
  // App PDFs print black & white (pdfMono.js), so every block also gets an outline.
  doc.setFillColor(...brand); doc.setLineWidth(0.5); doc.rect(M, y, W, 11, 'FD');
  doc.setTextColor(255); doc.setFont('helvetica', 'bold'); doc.setFontSize(13);
  doc.text('MUSTER CARD', M + 4, y + 7.4);
  doc.setFontSize(9); doc.setFont('helvetica', 'normal');
  doc.text(`${fmtD(s.from)}  to  ${fmtD(s.to)}`, pw - M - 4, y + 7.4, { align: 'right' });
  y += 16;

  // Worker details (two columns)
  const det = [
    ['Name', w.name || '-'], ['Trade', w.trade || '-'],
    ['Worker code', w.labourCode || '-'], ['Phone', w.phone || '-'],
    ['Day rate', pdfMoney(w.dayRate || 0)], ['Project / site', proj?.name || '-'],
  ];
  doc.setFontSize(9);
  det.forEach(([k, v], i) => {
    const x = M + (i % 2) * (W / 2), yy = y + Math.floor(i / 2) * 6;
    doc.setTextColor(...muted); doc.setFont('helvetica', 'normal'); doc.text(k, x, yy);
    doc.setTextColor(...ink); doc.setFont('helvetica', 'bold'); doc.text(String(v).slice(0, 40), x + 26, yy);
  });
  y += Math.ceil(det.length / 2) * 6 + 2;

  // Highlighted "Total amount paid" box + earned / balance
  const boxH = 18, bw = (W - 8) / 3;
  const box = (x, label, value, fill, txt, strong) => {
    doc.setFillColor(...fill); doc.setLineWidth(strong ? 0.8 : 0.2); doc.roundedRect(x, y, bw, boxH, 2, 2, 'FD');
    doc.setTextColor(...muted); doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.text(label, x + 4, y + 6);
    doc.setTextColor(...txt); doc.setFont('helvetica', 'bold'); doc.setFontSize(12.5); doc.text(value, x + 4, y + 14);
  };
  box(M, 'TOTAL AMOUNT PAID', pdfMoney(s.paid), [220, 252, 231], [21, 128, 61], true);
  box(M + bw + 4, 'WAGES EARNED', pdfMoney(s.earned), [241, 245, 249], ink);
  box(M + (bw + 4) * 2, 'BALANCE FOR PERIOD', pdfMoney(s.balance), [255, 237, 213], brand);
  doc.setLineWidth(0.2);
  y += boxH + 6;

  // Attendance calendar: weeks as rows, Mon..Sun as columns
  const [fy, fm, fd] = s.from.split('-').map(Number);
  const lead = (new Date(Date.UTC(fy, fm - 1, fd)).getUTCDay() + 6) % 7;
  const cells = Array(lead).fill(null).concat(s.days);
  while (cells.length % 7) cells.push(null);
  const weeks = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  const statusFill = { P: [220, 252, 231], H: [254, 243, 199], A: [254, 226, 226] };
  doc.autoTable({
    startY: y, margin: { left: M, right: M },
    head: [['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']],
    body: weeks.map(wk => wk.map(c => c ? `${Number(c.date.slice(8))}${c.date.slice(5, 7) !== s.from.slice(5, 7) || s.days.length > 31 ? ' ' + MON[Number(c.date.slice(5, 7)) - 1] : ''}\n${c.status || '-'}${c.ot ? ` +${c.ot}h` : ''}${c.night ? ' *' : ''}` : '')),
    theme: 'grid',
    styles: { fontSize: 8, halign: 'center', valign: 'middle', cellPadding: 1.6, minCellHeight: 10, textColor: ink, lineColor: [226, 232, 240] },
    headStyles: { fillColor: [30, 41, 59], textColor: 255, fontSize: 8 },
    didParseCell: (h) => {
      if (h.section !== 'body') return;
      const c = weeks[h.row.index][h.column.index];
      if (c && statusFill[c.status]) h.cell.styles.fillColor = statusFill[c.status];
      if (c && c.status) h.cell.styles.fontStyle = 'bold';
    },
  });
  y = doc.lastAutoTable.finalY + 6;

  // Summary table
  doc.autoTable({
    startY: y, margin: { left: M, right: M }, theme: 'plain',
    body: [
      ['Days present', String(s.present), 'Wages earned', pdfMoney(s.earned)],
      ['Half days', String(s.half), 'Advances (kharchi)', pdfMoney(s.advance)],
      ['Days absent', String(s.absent), 'Deductions', pdfMoney(s.deduction)],
      ['Overtime hours', String(s.otHours), 'Total amount paid', pdfMoney(s.paid)],
      ['Paid days (P + ½H)', String(s.present + s.half / 2), 'Balance for period', pdfMoney(s.balance)],
    ],
    styles: { fontSize: 9, cellPadding: 1.8, textColor: ink },
    columnStyles: { 0: { textColor: muted }, 1: { fontStyle: 'bold' }, 2: { textColor: muted }, 3: { fontStyle: 'bold', halign: 'right' } },
    didParseCell: (h) => { if (h.row.index === 3 && h.column.index >= 2) { h.cell.styles.textColor = [21, 128, 61]; h.cell.styles.fontStyle = 'bold'; } },
  });
  y = doc.lastAutoTable.finalY + 5;

  // Payments in the period, with a total row
  const payRows = s.payments.map(p => [fmtD(p.date), accountName(p.accountId) || '-', p.ref || '-', pdfMoney(p.paid)]);
  doc.autoTable({
    startY: y, margin: { left: M, right: M },
    head: [['Payment date', 'Paid from', 'Reference', 'Amount']],
    body: payRows.length ? payRows : [['No payments in this period', '', '', '']],
    foot: [['', '', 'TOTAL PAID', pdfMoney(s.paid)]],
    theme: 'grid',
    styles: { fontSize: 8.5, cellPadding: 1.8, textColor: ink },
    headStyles: { fillColor: [30, 41, 59], textColor: 255 },
    footStyles: { fillColor: [220, 252, 231], textColor: [21, 128, 61], fontStyle: 'bold' },
    columnStyles: { 3: { halign: 'right' } },
  });
  y = doc.lastAutoTable.finalY + 6;

  // Legend + signatures (new page if needed)
  const ph = doc.internal.pageSize.getHeight();
  if (y > ph - 40) { doc.addPage(); y = 20; }
  doc.setFontSize(7.5); doc.setTextColor(...muted); doc.setFont('helvetica', 'normal');
  doc.text('P = Present   H = Half day   A = Absent   - = Not marked   +2h = Overtime hours (1.5x)   * = Night shift', M, y);
  y += 20;
  const sw = (W - 16) / 3;
  ['Worker signature / thumb', 'Site engineer', 'Authorised signatory'].forEach((t, i) => {
    const x = M + i * (sw + 8);
    doc.setDrawColor(148, 163, 184); doc.line(x, y, x + sw, y);
    doc.text(t, x + sw / 2, y + 4, { align: 'center' });
  });
  doc.setFontSize(7); doc.text(`Generated ${fmtD(LC.todayISO())} · True Site Sync`, pw / 2, ph - 8, { align: 'center' });

  const safe = (w.name || 'Worker').replace(/[^\w]+/g, '_');
  mobileSavePDF(doc, `Muster_Card_${safe}_${s.from}_${s.to}.pdf`);
  showToast('Muster card ready', 'success');
}

if (typeof window !== 'undefined') {
  window.openLabourWorkerPanel = openWorkerPanel;
  window.exportLabourMusterCard = exportMusterCard;
  window._lwClose = closeWorkerPanel;
  window._lwKind = (k) => {
    if (k === 'custom' && !_from) { const r = range(); _from = r.from; _to = r.to; }
    _kind = k; if (k === 'month') _offset = Math.min(_offset, 0); render();
  };
  window._lwMonth = (d) => { _offset = Math.min(0, _offset + d); render(); };
  window._lwDates = (f, t) => { if (f) _from = f; if (t) _to = t; render(); };
  window._lwPdf = () => exportMusterCard(_id);
  window._lwPay = () => { const id = _id; closeWorkerPanel(); window.openLabourPaymentModal?.(id); };
}
