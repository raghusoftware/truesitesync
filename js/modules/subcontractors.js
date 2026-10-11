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
import { showToast, getCurrencySymbol, getPdfCurrency, getCompanyHeaderForPDF, mobileSavePDF, amountToWordsCur, getTaxConfig } from './utils.js';
import { formatNumber2 } from './format.js?v=1.0.1';

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
    const certRows = pos.pays.slice().reverse().map(p => `<tr style="border-bottom:1px solid #f1f5f9;">
        <td style="padding:5px 8px;color:#64748b;">${p.date || ''}</td>
        <td style="padding:5px 8px;text-align:right;">${m(p.work)}</td>
        <td style="padding:5px 8px;text-align:right;font-weight:700;">${m(p.net)}</td>
        <td style="padding:5px 8px;text-align:center;">${p.paid ? '<span style="color:#059669;font-weight:700;font-size:10px;">✓ Paid</span>' : `<button onclick="window._scMarkPaid('${p.id}')" style="font-size:10px;font-weight:700;color:#2563eb;background:#eff6ff;border:1px solid #bfdbfe;border-radius:5px;padding:2px 8px;cursor:pointer;">Mark paid</button>`}</td>
        <td style="padding:5px 8px;text-align:center;"><button onclick="window._scCertPdf('${p.id}')" style="font-size:10px;font-weight:700;color:#7c3aed;cursor:pointer;background:none;border:none;">PDF</button></td>
      </tr>`).join('') || '<tr><td colspan="5" style="padding:10px;text-align:center;color:#94a3b8;font-size:11px;">No certificates yet.</td></tr>';
    return `<div style="background:#fff;border:1px solid #e2e8f0;border-radius:14px;padding:16px;margin-bottom:14px;">
      <div style="display:flex;justify-content:space-between;align-items:start;gap:10px;flex-wrap:wrap;">
        <div><div style="font-weight:800;color:#0f172a;font-size:15px;">${_esc(sc.name)} <span style="font-size:11px;color:#94a3b8;font-weight:600;">· ${_esc(sc.trade || '')}</span></div>
          <div style="font-size:11px;color:#64748b;margin-top:2px;">${_esc(_proj(sc.projectId)?.name || 'No project')} · Contract ${m(sc.contractValue)} · Retention ${_num(sc.retentionPct)}%</div></div>
        <button onclick="window._scDelete('${sc.id}')" style="font-size:11px;color:#ef4444;background:none;border:none;cursor:pointer;font-weight:700;">Delete</button>
      </div>
      <div style="height:6px;background:#f1f5f9;border-radius:3px;margin:10px 0;overflow:hidden;"><div style="height:100%;width:${pctCert}%;background:linear-gradient(90deg,#ef8420,#d6402c);"></div></div>
      <div style="display:flex;flex-wrap:wrap;gap:14px;font-size:11px;color:#64748b;margin-bottom:10px;">
        <span>Certified: <b style="color:#0f172a;">${m(pos.certified)}</b> (${pctCert.toFixed(0)}%)</span>
        <span>Retention held: <b style="color:#0f172a;">${m(pos.retHeld)}</b></span>
        <span>Advance recovered: <b style="color:#0f172a;">${m(pos.advRec)}</b></span>
        <span>Paid: <b style="color:#059669;">${m(pos.paid)}</b></span>
        <span>Outstanding: <b style="color:#d6402c;">${m(pos.balance)}</b></span>
      </div>
      <div style="display:flex;gap:8px;align-items:end;flex-wrap:wrap;background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:10px;margin-bottom:10px;">
        <div><label style="display:block;font-size:10px;font-weight:700;color:#64748b;margin-bottom:2px;">Work certified this period (${cur.trim()})</label>
          <input id="scWork_${sc.id}" type="number" step="any" placeholder="0" style="width:150px;border:1px solid #e2e8f0;border-radius:7px;padding:7px 9px;font-size:13px;text-align:right;"></div>
        <button onclick="window._scCertify('${sc.id}')" style="background:#0f172a;color:#fff;border:none;border-radius:7px;padding:8px 16px;font-size:12px;font-weight:800;cursor:pointer;">Certify payment →</button>
      </div>
      <div style="overflow-x:auto;"><table style="width:100%;border-collapse:collapse;font-size:11px;">
        <thead style="background:#f8fafc;"><tr style="color:#64748b;font-size:9px;text-transform:uppercase;font-weight:800;text-align:right;">
          <th style="padding:5px 8px;text-align:left;">Date</th><th style="padding:5px 8px;">Work</th><th style="padding:5px 8px;">Net payable</th><th style="padding:5px 8px;text-align:center;">Status</th><th style="padding:5px 8px;text-align:center;">Cert</th>
        </tr></thead><tbody>${certRows}</tbody></table></div>
    </div>`;
  }).join('') || '<div style="padding:24px;text-align:center;color:#94a3b8;">No subcontract packages yet. Add one below.</div>';

  const projOpts = (state.projects || []).map(p => `<option value="${p.id}">${_esc(p.name)}</option>`).join('');

  c.innerHTML = `
    <div style="max-width:1120px;margin:0 auto;">
      <div style="display:flex;gap:12px;flex-wrap:wrap;margin-bottom:16px;">
        <div style="flex:1;min-width:150px;background:#fff;border:1px solid #e2e8f0;border-radius:12px;padding:14px 16px;"><div style="font-size:11px;font-weight:700;color:#94a3b8;text-transform:uppercase;">Subcontract value</div><div style="font-size:19px;font-weight:900;color:#0f172a;">${m(totVal)}</div></div>
        <div style="flex:1;min-width:150px;background:#fff;border:1px solid #e2e8f0;border-radius:12px;padding:14px 16px;"><div style="font-size:11px;font-weight:700;color:#94a3b8;text-transform:uppercase;">Certified to date</div><div style="font-size:19px;font-weight:900;color:#0f172a;">${m(totCert)}</div></div>
        <div style="flex:1;min-width:150px;background:#fff;border:1px solid #e2e8f0;border-radius:12px;padding:14px 16px;"><div style="font-size:11px;font-weight:700;color:#94a3b8;text-transform:uppercase;">Retention held</div><div style="font-size:19px;font-weight:900;color:#0f172a;">${m(totRet)}</div></div>
        <div style="flex:1;min-width:150px;background:#fff3ea;border:1px solid #ffd9c7;border-radius:12px;padding:14px 16px;"><div style="font-size:11px;font-weight:700;color:#b45309;text-transform:uppercase;">Outstanding to subs</div><div style="font-size:19px;font-weight:900;color:#d6402c;">${m(totBal)}</div></div>
      </div>

      ${cards}

      <div style="background:#fff;border:1px solid #e2e8f0;border-radius:14px;padding:16px;margin-top:4px;">
        <div style="font-weight:800;color:#0f172a;font-size:13px;margin-bottom:12px;">Add subcontract package</div>
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px;align-items:end;">
          <div><label class="sc-l">Subcontractor</label><input id="scName" class="sc-i" placeholder="Firm name"></div>
          <div><label class="sc-l">Trade / scope</label><input id="scTrade" class="sc-i" placeholder="MEP, finishing…"></div>
          <div><label class="sc-l">Project</label><select id="scProject" class="sc-i"><option value="">—</option>${projOpts}</select></div>
          <div><label class="sc-l">Contract value (${cur.trim()})</label><input id="scValue" type="number" step="any" class="sc-i" placeholder="0"></div>
          <div><label class="sc-l">Retention %</label><input id="scRet" type="number" step="any" value="10" class="sc-i"></div>
          <div><label class="sc-l">Advance paid (${cur.trim()})</label><input id="scAdv" type="number" step="any" value="0" class="sc-i"></div>
          <div><label class="sc-l">Advance recovery %</label><input id="scAdvRec" type="number" step="any" value="0" class="sc-i"></div>
          <div style="align-self:end;"><button onclick="window._scAdd()" style="width:100%;background:linear-gradient(135deg,#ef8420,#d6402c);color:#fff;border:none;border-radius:8px;padding:9px 14px;font-size:13px;font-weight:800;cursor:pointer;">+ Add package</button></div>
        </div>
      </div>
    </div>
    <style>.sc-l{display:block;font-size:11px;font-weight:700;color:#64748b;margin-bottom:3px;}.sc-i{width:100%;border:1px solid #e2e8f0;border-radius:8px;padding:8px 10px;font-size:13px;outline:none;}</style>`;
}
window.renderSubcontractors = renderSubcontractors;

window._scAdd = function () {
  const sc = {
    id: _uid('sc_'),
    name: (document.getElementById('scName')?.value || '').trim(),
    trade: (document.getElementById('scTrade')?.value || '').trim(),
    projectId: document.getElementById('scProject')?.value || '',
    contractValue: _num(document.getElementById('scValue')?.value),
    retentionPct: _num(document.getElementById('scRet')?.value),
    advancePaid: _num(document.getElementById('scAdv')?.value),
    advanceRecoveryPct: _num(document.getElementById('scAdvRec')?.value),
    createdAt: Date.now(),
  };
  if (!sc.name) { showToast('Enter the subcontractor name', 'warning'); return; }
  if (!sc.contractValue) { showToast('Enter the contract value', 'warning'); return; }
  if (!Array.isArray(state.subcontracts)) state.subcontracts = [];
  state.subcontracts.push(sc);
  saveAllData(); renderSubcontractors();
  showToast('Subcontract package added', 'success');
};

window._scDelete = function (id) {
  const sc = (state.subcontracts || []).find(x => x.id === id); if (!sc) return;
  if (!confirm(`Delete package "${sc.name}" and its certificates?`)) return;
  state.subcontracts = (state.subcontracts || []).filter(x => x.id !== id);
  state.subPayments = (state.subPayments || []).filter(p => p.subcontractId !== id);
  saveAllData(); renderSubcontractors();
  showToast('Package deleted', 'info');
};

window._scCertify = function (scId) {
  const sc = (state.subcontracts || []).find(x => x.id === scId); if (!sc) return;
  const work = _num(document.getElementById('scWork_' + scId)?.value);
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
  saveAllData(); renderSubcontractors();
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
