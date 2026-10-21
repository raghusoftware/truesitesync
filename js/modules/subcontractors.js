/**
 * ═══════════════════════════════════════════════════════════
 * True Site Sync — Subcontractor packages & back-to-back payments
 * ═══════════════════════════════════════════════════════════
 * A GCC main contractor subcontracts packages (MEP, finishing, steel…) and
 * pays each subcontractor back-to-back with its own client certificates.
 * Each package has its own contract value, retention and advance. This
 * module registers packages and issues Subcontractor Payment Certificates
 * (SPC): work certified this period − retention − advance recovery −
 * previously certified = net payable, with paid/outstanding tracking and a
 * printable certificate. Distinct from material vendors and daily-wage
 * labour gangs.
 * ═══════════════════════════════════════════════════════════
 */
import { state, saveAllData } from './state.js';
import { keepOnly } from './state.js';
import { showToast, getCurrencySymbol, getPdfCurrency, getCompanyHeaderForPDF, mobileSavePDF, amountToWordsCur, getTaxConfig } from './utils.js';
import { formatNumber2 } from './format.js?v=1.0.1';
import { openFormModal, closeFormModal, fsField, FS_INPUT } from './formHelpers.js';

const _esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const _num = n => (Number(n) || 0);
const _n2 = formatNumber2;
const _uid = p => p + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
const _proj = id => (state.projects || []).find(p => p.id === id);

/** Cumulative position for a subcontract package. */
function _position(sc) {
  const pays = (state.subPayments || []).filter(p => p.subcontractId === sc.id)
    .sort((a, b) => (a.date || '').localeCompare(b.date || ''));
  const certified = pays.reduce((s, p) => s + _num(p.work), 0);
  const retHeld = certified * _num(sc.retentionPct) / 100;
  const advRec = Math.min(_num(sc.advancePaid), certified * _num(sc.advanceRecoveryPct) / 100);
  const netCertified = certified - retHeld - advRec;
  const paid = pays.reduce((s, p) => s + (p.paid ? _num(p.net) : 0), 0);
  return { pays, certified, retHeld, advRec, netCertified, paid, balance: netCertified - paid };
}

export function renderSubcontractors() {
  const c = document.getElementById('subcontractorsContent');
  if (!c) return;
  const cur = getCurrencySymbol();
  const m = n => cur + Math.round(_num(n)).toLocaleString('en-IN');
  const list = (state.subcontracts || []).slice().sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));

  let totVal = 0, totCert = 0, totRet = 0, totBal = 0;
  const cards = list.map(sc => {
    const pos = _position(sc);
    totVal += _num(sc.contractValue); totCert += pos.certified; totRet += pos.retHeld; totBal += pos.balance;
    const pctCert = _num(sc.contractValue) > 0 ? Math.min(100, pos.certified / _num(sc.contractValue) * 100) : 0;
    const certRows = pos.pays.slice().reverse().map(p => `<tr>
        <td style="color:var(--dm-ink-2);">${p.date || ''} <span class="dm-ref">${_esc(p.no || '')}</span></td>
        <td class="num tnum">${m(p.work)}</td>
        <td class="num tnum dm-amt">${m(p.net)}</td>
        <td style="text-align:center;">${p.paid ? '<span class="dm-chip ok"><span class="dot"></span>Paid</span>' : `<button class="dm-iact" style="width:auto;padding:0 11px;font-size:11px;font-weight:700;" onclick="window._scMarkPaid('${p.id}')">Mark paid</button>`}</td>
        <td class="num"><button class="dm-iact" title="Download certificate" onclick="window._scCertPdf('${p.id}')">⤓</button></td>
      </tr>`).join('') || '<tr><td colspan="5" style="padding:16px;text-align:center;color:var(--dm-ink-3);font-size:12px;">No certificates yet — certify the first payment above.</td></tr>';
    return `<div class="dm-panel">
      <div style="padding:16px 16px 0;">
        <div style="display:flex;justify-content:space-between;gap:10px;align-items:start;">
          <div style="min-width:0;"><div class="dm-name" style="font-size:15px;">${_esc(sc.name)} <span style="color:var(--dm-ink-3);font-weight:600;font-size:12px;">· ${_esc(sc.trade || '')}</span></div>
            <div class="dm-ref" style="font-size:12px;margin-top:3px;">${_esc(_proj(sc.projectId)?.name || 'No project')} · Contract ${m(sc.contractValue)} · Retention ${_num(sc.retentionPct)}%</div></div>
          <span class="dm-rowact" style="opacity:1;flex-shrink:0;">
            <button class="dm-iact" title="Edit package" onclick="window._scOpenForm('${sc.id}')">✎</button>
            <button class="dm-iact" title="Delete package" onclick="window._scDelete('${sc.id}')">🗑</button></span>
        </div>
        <div class="dm-prog"><i style="width:${pctCert}%"></i></div>
        <div style="display:flex;flex-wrap:wrap;gap:18px;font-size:11.5px;color:var(--dm-ink-2);margin-bottom:12px;">
          <span>Certified <b class="dm-amt tnum">${m(pos.certified)}</b> <span style="color:var(--dm-ink-3);">(${pctCert.toFixed(0)}%)</span></span>
          <span>Retention <b class="dm-amt tnum">${m(pos.retHeld)}</b></span>
          <span>Paid <b class="tnum" style="color:var(--dm-ok);">${m(pos.paid)}</b></span>
          <span>Outstanding <b class="tnum" style="color:var(--dm-accent);">${m(pos.balance)}</b></span>
        </div>
      </div>
      <div style="border-top:1px solid var(--dm-line);padding:11px 16px;display:flex;justify-content:space-between;align-items:center;">
        <span style="font-size:10.5px;font-weight:800;text-transform:uppercase;letter-spacing:.06em;color:var(--dm-ink-3);">Payment certificates</span>
        <button class="dm-btn dm-btn-ghost dm-btn-sm" onclick="window._scOpenCertify('${sc.id}')">+ Certify payment</button>
      </div>
      <div class="dm-tscroll"><table class="dm-table" style="min-width:520px;">
        <thead><tr><th>Date</th><th class="num">Work</th><th class="num">Net payable</th><th style="text-align:center;">Status</th><th class="num">Cert</th></tr></thead>
        <tbody>${certRows}</tbody></table></div>
    </div>`;
  }).join('') || `<div class="dm-panel"><div class="dm-empty"><div class="ico">🤝</div><h3>No subcontract packages yet</h3><p>Register each subcontract package, then certify payments back-to-back — net of retention and advance — and track what's still owed.</p><button class="dm-btn dm-btn-primary" onclick="window._scOpenForm()">+ Add your first package</button></div></div>`;

  c.innerHTML = `
    <div class="dm">
      <div class="dm-bar">
        <div class="dm-lead"><h1>Subcontractors</h1><span class="dm-sub">Back-to-back packages — certify payments net of retention &amp; advance</span></div>
        <button class="dm-btn dm-btn-primary" onclick="window._scOpenForm()">+ New package</button>
      </div>
      <div style="display:flex;gap:12px;flex-wrap:wrap;margin-bottom:16px;">
        <div class="dm-kpi" style="flex:1;min-width:160px;"><span class="dm-rail"></span><div class="dm-cap">Subcontract value</div><div class="dm-val tnum">${m(totVal)}</div></div>
        <div class="dm-kpi" style="flex:1;min-width:160px;"><span class="dm-rail"></span><div class="dm-cap">Certified to date</div><div class="dm-val tnum">${m(totCert)}</div></div>
        <div class="dm-kpi" style="flex:1;min-width:160px;"><span class="dm-rail"></span><div class="dm-cap">Retention held</div><div class="dm-val tnum">${m(totRet)}</div></div>
        <div class="dm-kpi ${totBal > 0 ? 'attn' : ''}" style="flex:1;min-width:160px;"><span class="dm-rail"></span><div class="dm-cap">Outstanding to subs</div><div class="dm-val tnum">${m(totBal)}</div></div>
      </div>
      ${cards}
    </div>`;
}
window.renderSubcontractors = renderSubcontractors;

/** Open the add/edit subcontract package modal. */
window._scOpenForm = function (id) {
  const sc = (state.subcontracts || []).find(x => x.id === id) || {};
  const cur = getCurrencySymbol().trim();
  const projOpts = ['<option value="">— No project —</option>']
    .concat((state.projects || []).map(p => `<option value="${p.id}" ${sc.projectId === p.id ? 'selected' : ''}>${_esc(p.name)}</option>`)).join('');
  const body =
    fsField('Subcontractor', `<input id="scName" style="${FS_INPUT}" value="${_esc(sc.name || '')}" placeholder="Firm name">`, { req: true }) +
    fsField('Trade / scope', `<input id="scTrade" style="${FS_INPUT}" value="${_esc(sc.trade || '')}" placeholder="MEP, finishing…">`) +
    fsField('Project', `<select id="scProject" style="${FS_INPUT}">${projOpts}</select>`, { span: true }) +
    fsField(`Contract value (${cur})`, `<input id="scValue" type="number" step="any" style="${FS_INPUT}" value="${sc.contractValue != null ? sc.contractValue : ''}" placeholder="0">`, { req: true }) +
    fsField('Retention %', `<input id="scRet" type="number" step="any" style="${FS_INPUT}" value="${sc.retentionPct != null ? sc.retentionPct : 10}">`) +
    fsField(`Advance paid (${cur})`, `<input id="scAdv" type="number" step="any" style="${FS_INPUT}" value="${sc.advancePaid != null ? sc.advancePaid : 0}">`) +
    fsField('Advance recovery % of work', `<input id="scAdvRec" type="number" step="any" style="${FS_INPUT}" value="${sc.advanceRecoveryPct != null ? sc.advanceRecoveryPct : 0}">`);
  openFormModal(id ? 'Edit package' : 'Add subcontract package', body, { onSave: `window._scSaveForm('${id || ''}')`, saveLabel: id ? 'Save changes' : 'Add package' });
};

window._scSaveForm = function (id) {
  const existing = (state.subcontracts || []).find(x => x.id === id);
  const sc = existing || { id: _uid('sc_'), createdAt: Date.now() };
  sc.name = (document.getElementById('scName')?.value || '').trim();
  sc.trade = (document.getElementById('scTrade')?.value || '').trim();
  sc.projectId = document.getElementById('scProject')?.value || '';
  sc.contractValue = _num(document.getElementById('scValue')?.value);
  sc.retentionPct = _num(document.getElementById('scRet')?.value);
  sc.advancePaid = _num(document.getElementById('scAdv')?.value);
  sc.advanceRecoveryPct = _num(document.getElementById('scAdvRec')?.value);
  if (!sc.name) { showToast('Enter the subcontractor name', 'warning'); return; }
  if (!sc.contractValue) { showToast('Enter the contract value', 'warning'); return; }
  if (!Array.isArray(state.subcontracts)) state.subcontracts = [];
  if (!existing) state.subcontracts.push(sc);
  saveAllData(); closeFormModal(); renderSubcontractors();
  showToast(existing ? 'Package updated' : 'Subcontract package added', 'success');
};

/** Open the "certify payment" modal for a package. */
window._scOpenCertify = function (scId) {
  const sc = (state.subcontracts || []).find(x => x.id === scId); if (!sc) return;
  const cur = getCurrencySymbol().trim();
  const pos = _position(sc);
  const body =
    `<div style="grid-column:1/-1;font-size:12px;color:#64748b;background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:10px 12px;">
       <b style="color:#0f172a;">${_esc(sc.name)}</b> · certified ${cur} ${Math.round(pos.certified).toLocaleString('en-IN')} of ${cur} ${Math.round(_num(sc.contractValue)).toLocaleString('en-IN')} · retention ${_num(sc.retentionPct)}%
     </div>` +
    fsField(`Work certified this period (${cur})`, `<input id="scCertWork" type="number" step="any" style="${FS_INPUT}" placeholder="0">`, { req: true, span: true });
  openFormModal('Certify subcontractor payment', body, { onSave: `window._scCertify('${scId}')`, saveLabel: 'Create certificate', grid: 1 });
};

window._scDelete = function (id) {
  const sc = (state.subcontracts || []).find(x => x.id === id); if (!sc) return;
  if (!confirm(`Delete package "${sc.name}" and its certificates?`)) return;
  keepOnly('subcontracts', x => x.id !== id);
  keepOnly('subPayments', p => p.subcontractId !== id);
  saveAllData(); renderSubcontractors();
  showToast('Package deleted', 'info');
};

window._scCertify = function (scId) {
  const sc = (state.subcontracts || []).find(x => x.id === scId); if (!sc) return;
  const work = _num(document.getElementById('scCertWork')?.value);
  if (work <= 0) { showToast('Enter the work certified this period', 'warning'); return; }
  const posBefore = _position(sc);
  const retThis = work * _num(sc.retentionPct) / 100;
  const advTotalAfter = Math.min(_num(sc.advancePaid), (posBefore.certified + work) * _num(sc.advanceRecoveryPct) / 100);
  const advThis = Math.max(0, advTotalAfter - posBefore.advRec);
  const net = work - retThis - advThis;
  if (!Array.isArray(state.subPayments)) state.subPayments = [];
  const seq = state.subPayments.filter(p => p.subcontractId === scId).length + 1;
  state.subPayments.push({
    id: _uid('scp_'), subcontractId: scId, projectId: sc.projectId, no: 'SPC-' + seq,
    work, retention: retThis, advRecovery: advThis, net,
    date: new Date().toISOString().split('T')[0], paid: false, createdAt: Date.now(),
  });
  saveAllData(); closeFormModal(); renderSubcontractors();
  showToast(`Certificate SPC-${seq} created · net ${getCurrencySymbol()}${Math.round(net).toLocaleString('en-IN')}`, 'success');
};

window._scMarkPaid = function (payId) {
  const p = (state.subPayments || []).find(x => x.id === payId); if (!p) return;
  p.paid = true; p.paidAt = Date.now();
  saveAllData(); renderSubcontractors();
  showToast('Marked as paid', 'success');
};

/** Subcontractor Payment Certificate PDF. */
window._scCertPdf = function (payId) {
  try {
    if (!window.jspdf || !window.jspdf.jsPDF) return showToast('PDF library not loaded — refresh', 'error');
    const p = (state.subPayments || []).find(x => x.id === payId); if (!p) return;
    const sc = (state.subcontracts || []).find(x => x.id === p.subcontractId) || {};
    const pos = _position(sc);
    const cp = state.companyProfile || {};
    const cur = getPdfCurrency();
    const tax = getTaxConfig();
    const vatRate = tax.mode === 'vat' ? (tax.defaultRate || 0) : 0;
    const vatAmt = p.net > 0 ? p.net * vatRate / 100 : 0;
    const total = p.net + vatAmt;

    const doc = new window.jspdf.jsPDF('p', 'mm', 'a4');
    const pw = doc.internal.pageSize.getWidth();
    const ml = 14, mr = 14;
    let y = getCompanyHeaderForPDF(doc);
    doc.setFillColor(23, 37, 84); doc.rect(ml, y, pw - ml - mr, 9, 'F');
    doc.setTextColor(255); doc.setFont('helvetica', 'bold'); doc.setFontSize(11);
    doc.text('SUBCONTRACTOR PAYMENT CERTIFICATE', pw / 2, y + 6, { align: 'center' });
    y += 13; doc.setTextColor(0);
    doc.setFontSize(8.5);
    const meta = (l, v, x) => { doc.setFont('helvetica', 'bold'); doc.text(l, x, y); doc.setFont('helvetica', 'normal'); doc.text(' ' + v, x + doc.getTextWidth(l), y); };
    meta('Subcontractor:', sc.name || '—', ml); meta('Cert No:', p.no || '—', pw - 66); y += 5;
    meta('Trade:', sc.trade || '—', ml); meta('Date:', p.date || '—', pw - 66); y += 5;
    meta('Project:', _proj(sc.projectId)?.name || '—', ml); meta('Main contractor:', cp.CompanyName || '—', pw - 66); y += 7;

    const rows = [
      ['Work certified this period', cur + _n2(p.work)],
      [`Less: Retention (${_num(sc.retentionPct)}%)`, '(' + cur + _n2(p.retention) + ')'],
      ['Less: Advance recovery', '(' + cur + _n2(p.advRecovery) + ')'],
      ['NET PAYABLE THIS CERTIFICATE', cur + _n2(p.net)],
    ];
    if (vatRate > 0) { rows.push([`Add: ${tax.singleLabel} @ ${vatRate}%`, cur + _n2(vatAmt)]); rows.push(['TOTAL PAYABLE', cur + _n2(total)]); }
    doc.autoTable({
      startY: y, body: rows, theme: 'grid',
      styles: { fontSize: 9.5, cellPadding: 2.2, lineColor: [203, 213, 225], lineWidth: 0.1 },
      columnStyles: { 0: { cellWidth: 'auto' }, 1: { cellWidth: 50, halign: 'right', fontStyle: 'bold' } },
      didParseCell: d => { const l = rows[d.row.index] && rows[d.row.index][0]; if (l && (l.startsWith('NET') || l.startsWith('TOTAL'))) { d.cell.styles.fillColor = [255, 243, 234]; d.cell.styles.textColor = [194, 50, 31]; d.cell.styles.fontStyle = 'bold'; d.cell.styles.fontSize = 10.5; } },
      margin: { left: ml, right: mr },
    });
    y = doc.lastAutoTable.finalY + 5;
    doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); doc.setTextColor(90);
    doc.text(`Cumulative certified ${cur}${_n2(pos.certified)} of contract ${cur}${_n2(sc.contractValue)} · retention held ${cur}${_n2(pos.retHeld)}.`, ml, y); y += 6;
    doc.setTextColor(0); doc.setFont('helvetica', 'bold'); doc.setFontSize(8);
    doc.splitTextToSize('Net payable in words: ' + amountToWordsCur(vatRate > 0 ? total : p.net), pw - ml - mr).forEach(l => { doc.text(l, ml, y); y += 4.2; });
    y += 10;
    const colW = (pw - ml - mr) / 2;
    doc.setFont('helvetica', 'normal'); doc.line(ml, y, ml + colW - 8, y); doc.line(ml + colW, y, pw - mr, y); y += 4;
    doc.text('Main Contractor · Date', ml, y); doc.text('Subcontractor · Date', ml + colW, y);
    mobileSavePDF(doc, `${p.no}-${(sc.name || 'subcontractor').replace(/[\\/]/g, '-')}.pdf`);
    showToast('Certificate downloaded', 'success');
  } catch (e) { console.error('SPC PDF failed:', e); showToast('PDF error: ' + (e.message || e), 'error'); }
};
