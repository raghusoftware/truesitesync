/**
 * PDF Theme Engine — 15 Tally-Inspired themes for Measurement, Abstract & Invoice
 * Each theme is a function(doc, data, settings) that renders a full PDF page
 */
import { state, saveAllData } from './state.js';

// ─── Helpers ───
function getCp() { return state.companyProfile || {}; }
function _sym() { return (state.currencySettings || {}).symbol || '₹'; }
function _curName() { const c = (state.currencySettings || {}).code || 'INR'; const map = {INR:'Rupees',USD:'Dollars',EUR:'Euros',GBP:'Pounds',AED:'Dirhams',SAR:'Riyals',QAR:'Riyals',OMR:'Rials',KWD:'Dinars',BHD:'Dinars'}; return map[c] || c; }
function fmtINR(n, decimals) {
  const cs = state.currencySettings || {};
  const sym = cs.symbol || '₹';
  const locale = cs.locale || 'en-IN';
  const dec = decimals ?? cs.decimals ?? 2;
  return sym + (n || 0).toLocaleString(locale, { minimumFractionDigits: dec, maximumFractionDigits: dec });
}
function numWords(n) {
  if (!n) return 'Zero';
  const a = ['','One','Two','Three','Four','Five','Six','Seven','Eight','Nine','Ten','Eleven','Twelve','Thirteen','Fourteen','Fifteen','Sixteen','Seventeen','Eighteen','Nineteen'];
  const b = ['','','Twenty','Thirty','Forty','Fifty','Sixty','Seventy','Eighty','Ninety'];
  const num = Math.round(Math.abs(n));
  if (num < 20) return a[num];
  if (num < 100) return b[Math.floor(num/10)] + (num%10 ? ' ' + a[num%10] : '');
  if (num < 1000) return a[Math.floor(num/100)] + ' Hundred' + (num%100 ? ' and ' + numWords(num%100) : '');
  if (num < 100000) return numWords(Math.floor(num/1000)) + ' Thousand' + (num%1000 ? ' ' + numWords(num%1000) : '');
  if (num < 10000000) return numWords(Math.floor(num/100000)) + ' Lakh' + (num%100000 ? ' ' + numWords(num%100000) : '');
  return numWords(Math.floor(num/10000000)) + ' Crore' + (num%10000000 ? ' ' + numWords(num%10000000) : '');
}

function getPrintSettings(docType) {
  const ps = state.printSettings || {};
  const defaults = {
    extra_space_on_top: 0, extra_space_on_bottom: 0,
    extra_space_on_left: 0, extra_space_on_right: 0,
    minimum_lines: 0, print_orientation: 'portrait',
    paper_size: 'a4', show_grid_lines: true,
    base_font_size: 8, font_family: 'helvetica',
    footer_text: '',
    prefix_sale: 'INV-', prefix_measurement: 'MS-', prefix_project: 'PRJ-'
  };
  return Object.assign({}, defaults, ps[docType] || {});
}

function getMargins(ps) {
  return {
    left: 10 + (ps.extra_space_on_left || 0),
    right: 10 + (ps.extra_space_on_right || 0),
    top: 10 + (ps.extra_space_on_top || 0),
    bottom: 15 + (ps.extra_space_on_bottom || 0)
  };
}

function _getHS() {
  const hs = state.headerSettings || {};
  return {
    showHeader: hs.showHeader !== false, showLogo: hs.showLogo !== false,
    showCompanyName: hs.showCompanyName !== false, showAddress: hs.showAddress !== false,
    showPhone: hs.showPhone !== false, showEmail: hs.showEmail !== false, showGST: hs.showGST !== false,
    companyNameSize: hs.companyNameSize || 18, companyNameFont: hs.companyNameFont || 'helvetica',
    companyNameStyle: hs.companyNameStyle || 'bold', companyNameAlign: hs.companyNameAlign || 'center',
    companyNameColor: hs.companyNameColor || '#1e3a8a',
    detailsSize: hs.detailsSize || 9, detailsFont: hs.detailsFont || 'helvetica',
    detailsAlign: hs.detailsAlign || 'center', detailsColor: hs.detailsColor || '#64748b',
    gstSize: hs.gstSize || 9, gstStyle: hs.gstStyle || 'bold',
    showSeparator: hs.showSeparator !== false, separatorColor: hs.separatorColor || '#f97316',
    separatorWidth: hs.separatorWidth || 0.6, headerSpacing: hs.headerSpacing ?? 5,
    logoWidth: hs.logoWidth || 22, logoHeight: hs.logoHeight || 22
  };
}
function _hRgb(hex) { return [parseInt(hex.slice(1,3),16), parseInt(hex.slice(3,5),16), parseInt(hex.slice(5,7),16)]; }
function _hAlignX(a, pw, ml, mr) { return a === 'center' ? pw/2 : a === 'right' ? pw-mr : ml; }

function drawCompanyHeader(doc, m, _style) {
  const cp = getCp();
  const hs = _getHS();
  let y = m.top;
  const pw = doc.internal.pageSize.getWidth();

  if (!hs.showHeader) return y;

  const nc = _hRgb(hs.companyNameColor), dc = _hRgb(hs.detailsColor);
  const nAlign = hs.companyNameAlign;
  const dAlign = hs.detailsAlign;
  const nX = _hAlignX(nAlign, pw, m.left, m.right);
  const dX = _hAlignX(dAlign, pw, m.left, m.right);

  const hasLogoLeft = hs.showLogo && cp.logo && nAlign !== 'center';
  let textX = nX;

  if (hs.showLogo && cp.logo) {
    try {
      const lw = Math.min(hs.logoWidth, 22), lh = Math.min(hs.logoHeight, 22);
      const lx = nAlign === 'center' ? pw/2 - lw/2 : nAlign === 'right' ? pw - m.right - lw : m.left;
      doc.addImage(cp.logo, 'PNG', lx, y, lw, lh);
      if (nAlign === 'center') { y += lh + 2; } else { textX = m.left + lw + 4; }
    } catch(e){}
  }

  if (hs.showCompanyName) {
    doc.setFontSize(hs.companyNameSize); doc.setFont(hs.companyNameFont, hs.companyNameStyle);
    doc.setTextColor(nc[0], nc[1], nc[2]);
    if (hasLogoLeft) { doc.text(cp.CompanyName || '', textX, y + 6); }
    else { doc.text(cp.CompanyName || '', nX, y + 2, {align: nAlign}); }
    y += hs.companyNameSize * 0.4 + 2;
  }

  doc.setFontSize(hs.detailsSize); doc.setFont(hs.detailsFont, 'normal');
  doc.setTextColor(dc[0], dc[1], dc[2]);

  if (hs.showAddress && cp.Address) {
    if (hasLogoLeft) doc.text(cp.Address, textX, y + 4);
    else doc.text(cp.Address, dX, y + 4, {align: dAlign});
    y += hs.detailsSize * 0.5 + 2;
  }
  const parts = [];
  if (hs.showPhone && cp.Phone) parts.push(cp.Phone);
  if (hs.showEmail && cp.Email) parts.push(cp.Email);
  if (parts.length) {
    if (hasLogoLeft) doc.text(parts.join(' | '), textX, y + 4);
    else doc.text(parts.join('  |  '), dX, y + 4, {align: dAlign});
    y += hs.detailsSize * 0.5 + 2;
  }
  if (hs.showGST && cp.GST) {
    doc.setFontSize(hs.gstSize); doc.setFont(hs.detailsFont, hs.gstStyle);
    if (hasLogoLeft) doc.text('GSTIN: ' + cp.GST, textX, y + 4);
    else doc.text('GSTIN: ' + cp.GST, dX, y + 4, {align: dAlign});
    y += hs.gstSize * 0.5 + 2;
  }

  y += 2;
  if (hs.showSeparator) {
    const sc = _hRgb(hs.separatorColor);
    doc.setDrawColor(sc[0], sc[1], sc[2]); doc.setLineWidth(hs.separatorWidth);
    doc.line(m.left, y, pw - m.right, y);
  }
  return y + hs.headerSpacing;
}

function addFooter(doc, ps, m) {
  const pw = doc.internal.pageSize.getWidth();
  const ph = doc.internal.pageSize.getHeight();
  const pages = doc.internal.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    doc.setFontSize(6.5); doc.setFont('helvetica', 'normal'); doc.setTextColor(150);
    let ft = ps.footer_text || '';
    ft = ft.replace('{page_number}', i + '/' + pages).replace('{print_date}', new Date().toLocaleDateString('en-IN'));
    doc.text(ft || ('Page ' + i + ' of ' + pages), pw/2, ph - 5, {align: 'center'});
  }
}

function addMinRows(rows, minLines, cols) {
  while (rows.length < minLines) {
    rows.push(new Array(cols).fill(''));
  }
  return rows;
}

function addSignatureBlock(doc, y, m, pw) {
  if (y > doc.internal.pageSize.getHeight() - 35) { doc.addPage(); y = 20; }
  y += 12;
  doc.setFontSize(7); doc.setFont('helvetica', 'normal'); doc.setTextColor(0);
  doc.text('Prepared By', m.left + 10, y); doc.line(m.left, y + 2, m.left + 40, y + 2);
  doc.text('Checked By', pw/2 - 15, y); doc.line(pw/2 - 25, y + 2, pw/2 + 15, y + 2);
  doc.text('Approved By', pw - m.right - 30, y); doc.line(pw - m.right - 40, y + 2, pw - m.right, y + 2);
  return y + 8;
}

// ═══════════════════════════════════════════════
//  MEASUREMENT SHEET THEMES (5)
// ═══════════════════════════════════════════════

const MEASUREMENT_THEMES = {
  classic_tally: {
    id: 'classic_tally', name: 'Classic Tally Measurement',
    desc: 'Full borders, monospace, grey alternating rows, carried-forward totals',
    render(doc, data) {
      const ps = getPrintSettings('measurement');
      const m = getMargins(ps);
      const pw = doc.internal.pageSize.getWidth();
      let y = drawCompanyHeader(doc, m, 'left');

      doc.setFontSize(12); doc.setFont('courier', 'bold'); doc.setTextColor(0);
      doc.text('MEASUREMENT SHEET', pw/2, y + 4, {align: 'center'}); y += 8;
      doc.setFontSize(7); doc.setFont('courier', 'normal'); doc.setTextColor(60);
      doc.text('Sheet: ' + (data.sheetNum || ''), m.left, y + 3);
      doc.text('Date: ' + (data.date || ''), pw/2, y + 3);
      doc.text('Area: ' + (data.area || ''), pw - m.right - 40, y + 3); y += 7;

      const head = [['Code', 'Description', 'Unit', 'Nos', 'L', 'B', 'H', 'Coef', 'Qty', 'Remarks']];
      let rows = data.entries.filter(e => e.code || e.description).map(e => [
        e.code||'', e.description||'', e.uom||'', e.nos||'', e.l||'', e.b||'', e.h||'', e.coef||'', (e.qty||0).toFixed(3), e.remarks||''
      ]);
      rows = addMinRows(rows, ps.minimum_lines, 10);

      doc.autoTable({
        startY: y, head, body: rows, theme: 'grid',
        headStyles: { fillColor: [220,220,220], textColor: [0,0,0], fontSize: 6.5, fontStyle: 'bold', font: 'courier' },
        styles: { fontSize: 6.5, cellPadding: 1.2, font: 'courier', lineWidth: 0.2, lineColor: [0,0,0], overflow: 'linebreak' },
        alternateRowStyles: { fillColor: [245,245,245] },
        columnStyles: { 0:{cellWidth:16}, 1:{cellWidth:42}, 2:{cellWidth:10}, 3:{cellWidth:10,halign:'center'}, 4:{cellWidth:12,halign:'center'}, 5:{cellWidth:12,halign:'center'}, 6:{cellWidth:12,halign:'center'}, 7:{cellWidth:10,halign:'center'}, 8:{cellWidth:14,halign:'right',fontStyle:'bold'}, 9:{cellWidth:28} },
        margin: { left: m.left, right: m.right }
      });
      addSignatureBlock(doc, doc.lastAutoTable.finalY, m, pw);
      addFooter(doc, ps, m);
    }
  },

  minimalist_table: {
    id: 'minimalist_table', name: 'Minimalist Table',
    desc: 'Horizontal lines only, clean sans-serif, generous margins',
    render(doc, data) {
      const ps = getPrintSettings('measurement');
      const m = getMargins(ps); m.left += 8;
      const pw = doc.internal.pageSize.getWidth();
      let y = drawCompanyHeader(doc, m, 'center');

      doc.setFontSize(11); doc.setFont('helvetica', 'bold'); doc.setTextColor(50);
      doc.text('MEASUREMENT SHEET', pw/2, y + 4, {align:'center'}); y += 8;
      doc.setFontSize(7.5); doc.setFont('helvetica', 'normal'); doc.setTextColor(100);
      doc.text('Sheet: ' + (data.sheetNum||'') + '  |  Date: ' + (data.date||'') + '  |  Area: ' + (data.area||''), pw/2, y + 3, {align:'center'}); y += 7;

      const head = [['Code', 'Description', 'Unit', 'Nos', 'L', 'B', 'H', 'Coef', 'Qty', 'Remarks']];
      let rows = data.entries.filter(e => e.code || e.description).map(e => [
        e.code||'', e.description||'', e.uom||'', e.nos||'', e.l||'', e.b||'', e.h||'', e.coef||'', (e.qty||0).toFixed(3), e.remarks||''
      ]);
      rows = addMinRows(rows, ps.minimum_lines, 10);

      doc.autoTable({
        startY: y, head, body: rows, theme: 'plain',
        headStyles: { fillColor: [80,80,80], textColor: [255,255,255], fontSize: 7, fontStyle:'bold' },
        styles: { fontSize: 7, cellPadding: 2, overflow:'linebreak', lineWidth:0 },
        columnStyles: { 0:{cellWidth:16}, 1:{cellWidth:44}, 2:{cellWidth:10}, 8:{cellWidth:14,halign:'right',fontStyle:'bold'}, 9:{cellWidth:28} },
        margin: { left: m.left, right: m.right },
        didDrawCell: function(d) {
          if (d.section === 'body') { doc.setDrawColor(200); doc.setLineWidth(0.15); doc.line(d.cell.x, d.cell.y + d.cell.height, d.cell.x + d.cell.width, d.cell.y + d.cell.height); }
        }
      });
      addSignatureBlock(doc, doc.lastAutoTable.finalY, m, pw);
      addFooter(doc, ps, m);
    }
  },

  blueprint_tally: {
    id: 'blueprint_tally', name: 'Blueprint Tally',
    desc: 'Blue grid on white, engineering print style, double-underline totals',
    render(doc, data) {
      const ps = getPrintSettings('measurement');
      const m = getMargins(ps);
      const pw = doc.internal.pageSize.getWidth();
      let y = drawCompanyHeader(doc, m, 'left');

      doc.setFontSize(12); doc.setFont('helvetica', 'bold'); doc.setTextColor(30, 80, 160);
      doc.text('MEASUREMENT SHEET', pw/2, y + 4, {align:'center'}); y += 8;
      doc.setFontSize(7.5); doc.setFont('helvetica', 'normal'); doc.setTextColor(80);
      doc.text('Sheet: ' + (data.sheetNum||''), m.left, y+3);
      doc.text('Date: ' + (data.date||''), pw-m.right-30, y+3); y += 7;

      const head = [['Code', 'Description', 'Unit', 'Nos', 'L', 'B', 'H', 'Coef', 'Qty', 'Remarks']];
      let rows = data.entries.filter(e => e.code || e.description).map(e => [
        e.code||'', e.description||'', e.uom||'', e.nos||'', e.l||'', e.b||'', e.h||'', e.coef||'', (e.qty||0).toFixed(3), e.remarks||''
      ]);
      rows = addMinRows(rows, ps.minimum_lines, 10);

      doc.autoTable({
        startY: y, head, body: rows, theme: 'grid',
        headStyles: { fillColor: [30,80,160], textColor: [255,255,255], fontSize: 7, fontStyle:'bold' },
        styles: { fontSize: 7, cellPadding: 1.5, lineWidth:0.15, lineColor:[150,180,220], overflow:'linebreak' },
        columnStyles: { 0:{cellWidth:16}, 1:{cellWidth:44}, 2:{cellWidth:10}, 8:{cellWidth:14,halign:'right',fontStyle:'bold'}, 9:{cellWidth:28} },
        margin: { left: m.left, right: m.right }
      });
      const fy = doc.lastAutoTable.finalY;
      doc.setDrawColor(30,80,160); doc.setLineWidth(0.5);
      doc.line(m.left, fy+1, pw-m.right, fy+1);
      doc.line(m.left, fy+2.5, pw-m.right, fy+2.5);
      addSignatureBlock(doc, fy + 4, m, pw);
      addFooter(doc, ps, m);
    }
  },

  compact_onsite: {
    id: 'compact_onsite', name: 'Compact On-Site',
    desc: 'Condensed 6pt font, max rows per page, remarks box at bottom',
    render(doc, data) {
      const ps = getPrintSettings('measurement');
      const m = getMargins(ps);
      const pw = doc.internal.pageSize.getWidth();
      let y = m.top;
      doc.setFontSize(9); doc.setFont('helvetica', 'bold'); doc.setTextColor(0);
      doc.text('MEASUREMENT SHEET — ' + (data.sheetNum||''), m.left, y+4);
      doc.text('Date: ' + (data.date||''), pw-m.right, y+4, {align:'right'});
      y += 8;

      const head = [['Code', 'Description', 'Unit', 'Nos', 'L', 'B', 'H', 'Coef', 'Qty', 'Remarks']];
      let rows = data.entries.filter(e => e.code || e.description).map(e => [
        e.code||'', e.description||'', e.uom||'', e.nos||'', e.l||'', e.b||'', e.h||'', e.coef||'', (e.qty||0).toFixed(3), e.remarks||''
      ]);
      rows = addMinRows(rows, ps.minimum_lines || 25, 10);

      doc.autoTable({
        startY: y, head, body: rows, theme: 'grid',
        headStyles: { fillColor: [0,0,0], textColor: [255,255,255], fontSize: 5.5, fontStyle:'bold' },
        styles: { fontSize: 5.5, cellPadding: 0.8, lineWidth:0.1, lineColor:[0,0,0], overflow:'linebreak' },
        columnStyles: { 0:{cellWidth:14}, 1:{cellWidth:38}, 2:{cellWidth:8}, 3:{cellWidth:8,halign:'center'}, 4:{cellWidth:10,halign:'center'}, 5:{cellWidth:10,halign:'center'}, 6:{cellWidth:10,halign:'center'}, 7:{cellWidth:8,halign:'center'}, 8:{cellWidth:12,halign:'right',fontStyle:'bold'}, 9:{cellWidth:24} },
        margin: { left: m.left, right: m.right }
      });
      const fy = doc.lastAutoTable.finalY + 3;
      doc.setDrawColor(0); doc.setLineWidth(0.3);
      doc.rect(m.left, fy, pw-m.left-m.right, 18);
      doc.setFontSize(6); doc.setFont('helvetica', 'bold');
      doc.text('SITE REMARKS:', m.left+2, fy+4);
      addFooter(doc, ps, m);
    }
  },

  professional_service: {
    id: 'professional_service', name: 'Professional Service',
    desc: 'Navy header, logo left, project details right, light blue alternation',
    render(doc, data) {
      const ps = getPrintSettings('measurement');
      const m = getMargins(ps);
      const pw = doc.internal.pageSize.getWidth();
      const cp = getCp();
      let y = m.top;

      // Navy header bar
      const hs5 = _getHS();
      if (hs5.showHeader) {
        doc.setFillColor(15, 23, 42); doc.rect(0, 0, pw, 22, 'F');
        if (hs5.showLogo && cp.logo) { try { doc.addImage(cp.logo, 'PNG', m.left, 2, 18, 18); } catch(e){} }
        const lOff = hs5.showLogo && cp.logo ? m.left + 22 : m.left;
        if (hs5.showCompanyName) { doc.setFontSize(14); doc.setFont('helvetica', 'bold'); doc.setTextColor(255); doc.text(cp.CompanyName || '', lOff, 10); }
        doc.setFontSize(8); doc.setFont('helvetica', 'normal'); doc.setTextColor(255);
        doc.text('Sheet: ' + (data.sheetNum||'') + '  |  Date: ' + (data.date||''), pw - m.right, 10, {align:'right'});
        doc.text('Project: ' + (data.projectName||'') + '  |  Area: ' + (data.area||''), pw - m.right, 16, {align:'right'});
        y = 28;
      }

      doc.setFontSize(11); doc.setFont('helvetica', 'bold'); doc.setTextColor(15,23,42);
      doc.text('MEASUREMENT SHEET', pw/2, y, {align:'center'}); y += 6;

      const head = [['Code', 'Description', 'Unit', 'Nos', 'L', 'B', 'H', 'Coef', 'Qty', 'Remarks']];
      let rows = data.entries.filter(e => e.code || e.description).map(e => [
        e.code||'', e.description||'', e.uom||'', e.nos||'', e.l||'', e.b||'', e.h||'', e.coef||'', (e.qty||0).toFixed(3), e.remarks||''
      ]);
      rows = addMinRows(rows, ps.minimum_lines, 10);

      doc.autoTable({
        startY: y, head, body: rows, theme: 'grid',
        headStyles: { fillColor: [15,23,42], textColor: [255,255,255], fontSize: 7, fontStyle:'bold' },
        styles: { fontSize: 7, cellPadding: 1.5, lineWidth:0.15, lineColor:[200,210,220], overflow:'linebreak' },
        alternateRowStyles: { fillColor: [235,245,255] },
        columnStyles: { 0:{cellWidth:16}, 1:{cellWidth:44}, 2:{cellWidth:10}, 8:{cellWidth:14,halign:'right',fontStyle:'bold'}, 9:{cellWidth:28} },
        margin: { left: m.left, right: m.right }
      });
      addSignatureBlock(doc, doc.lastAutoTable.finalY, m, pw);
      addFooter(doc, ps, m);
    }
  }
};

// ═══════════════════════════════════════════════
//  ABSTRACT / BOQ THEMES (5)
// ═══════════════════════════════════════════════

const ABSTRACT_THEMES = {
  tally_abstract_classic: {
    id: 'tally_abstract_classic', name: 'Tally Abstract Classic',
    desc: 'Vertical thin lines, ₹ prefix, total in words, retention, net payable',
    render(doc, data) {
      const ps = getPrintSettings('abstract');
      const m = getMargins(ps);
      const pw = doc.internal.pageSize.getWidth();
      let y = drawCompanyHeader(doc, m, 'left');

      doc.setFontSize(12); doc.setFont('helvetica', 'bold'); doc.setTextColor(30,58,138);
      doc.text('ABSTRACT OF MEASUREMENT (RA BILL)', pw/2, y+4, {align:'center'}); y += 10;
      doc.setFontSize(7.5); doc.setFont('helvetica', 'normal'); doc.setTextColor(60);
      doc.text('Client: '+(data.clientName||'')+' | Project: '+(data.projectName||''), m.left, y);
      doc.text('Abstract: '+(data.abstractNum||'')+' | Date: '+(data.date||''), m.left, y+5);
      doc.text('Sheet: '+(data.sheetNum||'')+' | Area: '+(data.area||''), m.left, y+10); y+=15;

      const head=[['#','Item Code','Description','Qty','Unit','Rate ('+_sym()+')','Amount ('+_sym()+')']];
      let rows = (data.items||[]).map((i,idx) => [idx+1, i.code, i.desc, (i.qty||0).toFixed(3), i.uom, fmtINR(i.rate), fmtINR(i.amount)]);
      rows = addMinRows(rows, ps.minimum_lines, 7);

      doc.autoTable({
        startY: y, head, body: rows, theme: 'grid',
        headStyles: { fillColor:[30,58,138], fontSize:7.5, fontStyle:'bold' },
        styles: { fontSize:7.5, cellPadding:1.5, lineWidth:0.15, lineColor:[0,0,0], overflow:'linebreak' },
        columnStyles: { 0:{cellWidth:8,halign:'center'}, 1:{cellWidth:18}, 2:{cellWidth:50,overflow:'linebreak'}, 3:{halign:'right',cellWidth:16}, 4:{cellWidth:12}, 5:{halign:'right',cellWidth:24}, 6:{halign:'right',cellWidth:26,fontStyle:'bold'} },
        margin: { left:m.left, right:m.right }
      });
      let fy = doc.lastAutoTable.finalY + 5;
      doc.setFontSize(9); doc.setFont('helvetica','bold'); doc.setTextColor(0);
      doc.text('Grand Total: ' + fmtINR(data.totalAmount), m.left, fy);
      doc.setFontSize(7); doc.setFont('helvetica','normal');
      doc.text('Amount in Words: ' + _curName() + ' ' + numWords(data.totalAmount) + ' Only', m.left, fy+6);
      addSignatureBlock(doc, fy+8, m, pw);
      addFooter(doc, ps, m);
    }
  },

  simple_billing: {
    id: 'simple_billing', name: 'Simple Billing Abstract',
    desc: 'No vertical lines, thick horizontal separators, whitespace-heavy',
    render(doc, data) {
      const ps = getPrintSettings('abstract');
      const m = getMargins(ps);
      const pw = doc.internal.pageSize.getWidth();
      let y = drawCompanyHeader(doc, m, 'center');

      doc.setFontSize(11); doc.setFont('helvetica','bold'); doc.setTextColor(50);
      doc.text('ABSTRACT OF MEASUREMENT', pw/2, y+4, {align:'center'}); y+=10;
      doc.setFontSize(7.5); doc.setFont('helvetica','normal'); doc.setTextColor(100);
      doc.text((data.abstractNum||'')+' | '+(data.date||'')+' | '+(data.clientName||''), pw/2, y, {align:'center'}); y+=7;

      const head=[['#','Item Code','Description','Qty','Unit','Rate ('+_sym()+')','Amount ('+_sym()+')']];
      let rows = (data.items||[]).map((i,idx) => [idx+1,i.code,i.desc,(i.qty||0).toFixed(3),i.uom,fmtINR(i.rate),fmtINR(i.amount)]);
      rows = addMinRows(rows, ps.minimum_lines, 7);

      doc.autoTable({
        startY: y, head, body: rows, theme: 'plain',
        headStyles: { fillColor:false, textColor:[0,0,0], fontSize:8, fontStyle:'bold' },
        styles: { fontSize:7.5, cellPadding:2.5, overflow:'linebreak' },
        columnStyles: { 0:{cellWidth:8}, 2:{cellWidth:52}, 5:{halign:'right',cellWidth:24}, 6:{halign:'right',cellWidth:26,fontStyle:'bold'} },
        margin: { left:m.left, right:m.right },
        didDrawPage: function(d) {
          doc.setDrawColor(0); doc.setLineWidth(0.8);
          doc.line(m.left, d.settings.startY-1, pw-m.right, d.settings.startY-1);
        },
        didDrawCell: function(d) {
          if (d.section === 'head') { doc.setDrawColor(0); doc.setLineWidth(0.5); doc.line(d.cell.x, d.cell.y+d.cell.height, d.cell.x+d.cell.width, d.cell.y+d.cell.height); }
        }
      });
      let fy = doc.lastAutoTable.finalY;
      doc.setDrawColor(0); doc.setLineWidth(0.8); doc.line(m.left, fy+1, pw-m.right, fy+1);
      doc.setFontSize(10); doc.setFont('helvetica','bold'); doc.setTextColor(0);
      doc.text('Grand Total: ' + fmtINR(data.totalAmount), pw-m.right, fy+8, {align:'right'});
      addFooter(doc, ps, m);
    }
  },

  detailed_analysis: {
    id: 'detailed_analysis', name: 'Detailed Analysis Abstract',
    desc: 'Extra columns for Rate, Previous/Current/Cumulative amounts, carried forward',
    render(doc, data) {
      const ps = getPrintSettings('abstract');
      const m = getMargins(ps);
      const pw = doc.internal.pageSize.getWidth();
      let y = drawCompanyHeader(doc, m, 'left');

      doc.setFontSize(11); doc.setFont('helvetica','bold'); doc.setTextColor(30,58,138);
      doc.text('DETAILED ABSTRACT OF MEASUREMENT', pw/2, y+4, {align:'center'}); y+=10;
      doc.setFontSize(7); doc.setFont('helvetica','normal'); doc.setTextColor(60);
      doc.text('Client: '+(data.clientName||'')+' | Project: '+(data.projectName||''), m.left, y);
      doc.text('Abstract: '+(data.abstractNum||'')+' | Date: '+(data.date||''), m.left, y+4); y+=10;

      const head=[['#','Code','Description','Unit','Qty','Rate ('+_sym()+')','Amount ('+_sym()+')']];
      let rows = (data.items||[]).map((i,idx) => [idx+1,i.code,i.desc,i.uom,(i.qty||0).toFixed(3),fmtINR(i.rate),fmtINR(i.amount)]);
      rows = addMinRows(rows, ps.minimum_lines, 7);
      rows.push([{content:'GRAND TOTAL', colSpan:5, styles:{fontStyle:'bold',halign:'right'}},'',{content:fmtINR(data.totalAmount),styles:{fontStyle:'bold'}}]);

      doc.autoTable({
        startY: y, head, body: rows, theme: 'grid',
        headStyles: { fillColor:[255,215,0], textColor:[0,0,0], fontSize:6.5, fontStyle:'bold' },
        styles: { fontSize:6.5, cellPadding:1.2, lineWidth:0.12, lineColor:[0,0,0], overflow:'linebreak' },
        columnStyles: { 0:{cellWidth:8,halign:'center'}, 1:{cellWidth:16}, 2:{cellWidth:44}, 3:{cellWidth:10,halign:'center'}, 4:{halign:'right',cellWidth:16}, 5:{halign:'right',cellWidth:22}, 6:{halign:'right',cellWidth:24} },
        margin: { left:m.left, right:m.right },
        showHead:'everyPage'
      });
      addSignatureBlock(doc, doc.lastAutoTable.finalY, m, pw);
      addFooter(doc, ps, m);
    }
  },

  subcontractor_statement: {
    id: 'subcontractor_statement', name: 'Subcontractor Statement',
    desc: 'Labour/contractor billing, deduction columns, receiver signature',
    render(doc, data) {
      const ps = getPrintSettings('abstract');
      const m = getMargins(ps);
      const pw = doc.internal.pageSize.getWidth();
      let y = drawCompanyHeader(doc, m, 'left');

      doc.setFontSize(12); doc.setFont('helvetica','bold'); doc.setTextColor(0);
      doc.text('SUBCONTRACTOR / LABOUR BILLING STATEMENT', pw/2, y+4, {align:'center'}); y+=10;
      doc.setFontSize(7.5); doc.setFont('helvetica','normal'); doc.setTextColor(60);
      doc.text('Contractor: '+(data.clientName||'')+' | Abstract: '+(data.abstractNum||''), m.left, y);
      doc.text('Date: '+(data.date||''), pw-m.right, y, {align:'right'}); y+=8;

      const head=[['#','Description','Unit','Qty','Rate ('+_sym()+')','Amount ('+_sym()+')']];
      let rows = (data.items||[]).map((i,idx) => [idx+1,i.desc||i.code,i.uom,(i.qty||0).toFixed(3),fmtINR(i.rate),fmtINR(i.amount)]);
      rows = addMinRows(rows, ps.minimum_lines, 6);

      doc.autoTable({
        startY: y, head, body: rows, theme: 'grid',
        headStyles: { fillColor:[249,115,22], textColor:[255,255,255], fontSize:7.5, fontStyle:'bold' },
        styles: { fontSize:7.5, cellPadding:1.5, lineWidth:0.15, lineColor:[0,0,0], overflow:'linebreak' },
        columnStyles: { 0:{cellWidth:8}, 1:{cellWidth:60}, 2:{cellWidth:12}, 3:{halign:'right',cellWidth:16}, 4:{halign:'right',cellWidth:24}, 5:{halign:'right',cellWidth:26} },
        margin: { left:m.left, right:m.right }
      });
      let fy = doc.lastAutoTable.finalY + 5;
      doc.setFontSize(8); doc.setFont('helvetica','bold');
      doc.text('Gross Amount:', pw-m.right-60, fy); doc.text(fmtINR(data.totalAmount), pw-m.right, fy, {align:'right'}); fy+=5;
      doc.setFont('helvetica','normal');
      doc.text('Less: Retention (5%):', pw-m.right-60, fy); doc.text(fmtINR(data.totalAmount*0.05), pw-m.right, fy, {align:'right'}); fy+=5;
      doc.text('Less: TDS (2%):', pw-m.right-60, fy); doc.text(fmtINR(data.totalAmount*0.02), pw-m.right, fy, {align:'right'}); fy+=5;
      doc.setFont('helvetica','bold'); doc.setFontSize(9);
      const net = data.totalAmount * 0.93;
      doc.text('Net Payable:', pw-m.right-60, fy); doc.text(fmtINR(net), pw-m.right, fy, {align:'right'}); fy+=10;
      doc.setFontSize(7); doc.setFont('helvetica','normal');
      doc.text("Receiver's Signature: ______________________", pw-m.right-60, fy);
      addFooter(doc, ps, m);
    }
  },

  high_contrast: {
    id: 'high_contrast', name: 'High-Contrast Digital',
    desc: 'Pure black/white, thick borders, bold amounts, zero decoration',
    render(doc, data) {
      const ps = getPrintSettings('abstract');
      const m = getMargins(ps);
      const pw = doc.internal.pageSize.getWidth();
      let y = m.top;

      doc.setFontSize(13); doc.setFont('helvetica','bold'); doc.setTextColor(0);
      doc.text('ABSTRACT OF MEASUREMENT', pw/2, y+5, {align:'center'}); y+=10;
      doc.setFontSize(8); doc.setFont('helvetica','normal');
      doc.text((data.abstractNum||'')+' | '+(data.date||'')+' | '+(data.clientName||'')+' | '+(data.area||''), m.left, y); y+=7;

      const head=[['#','Item Code','Description','Qty','Unit','Rate ('+_sym()+')','Amount ('+_sym()+')']];
      let rows = (data.items||[]).map((i,idx) => [idx+1,i.code,i.desc,(i.qty||0).toFixed(3),i.uom,fmtINR(i.rate),fmtINR(i.amount)]);
      rows = addMinRows(rows, ps.minimum_lines, 7);

      doc.autoTable({
        startY: y, head, body: rows, theme: 'grid',
        headStyles: { fillColor:[0,0,0], textColor:[255,255,255], fontSize:8, fontStyle:'bold' },
        styles: { fontSize:8, cellPadding:2, lineWidth:0.4, lineColor:[0,0,0], overflow:'linebreak' },
        columnStyles: { 0:{cellWidth:8,halign:'center'}, 1:{cellWidth:18}, 2:{cellWidth:52}, 3:{halign:'right',cellWidth:16}, 4:{cellWidth:12}, 5:{halign:'right',cellWidth:24,fontStyle:'bold'}, 6:{halign:'right',cellWidth:26,fontStyle:'bold'} },
        margin: { left:m.left, right:m.right }
      });
      let fy = doc.lastAutoTable.finalY + 5;
      doc.setFontSize(11); doc.setFont('helvetica','bold');
      doc.text('GRAND TOTAL: ' + fmtINR(data.totalAmount), pw-m.right, fy, {align:'right'});
      addFooter(doc, ps, m);
    }
  }
};

// ═══════════════════════════════════════════════
//  INVOICE THEMES (5)
// ═══════════════════════════════════════════════

const INVOICE_THEMES = {
  tally_classic: {
    id: 'tally_classic', name: 'Tally Classic Invoice',
    desc: 'Rectangular bordered, GSTIN, HSN, tax columns, total in words, bank details',
    render(doc, data) {
      const ps = getPrintSettings('invoice');
      const m = getMargins(ps);
      const pw = doc.internal.pageSize.getWidth();
      const cp = getCp();
      let y = m.top;

      // Outer border
      doc.setDrawColor(0); doc.setLineWidth(0.5);
      doc.rect(m.left-2, m.top-2, pw-m.left-m.right+4, doc.internal.pageSize.getHeight()-m.top-m.bottom+4);

      // Company block
      const hsR = _getHS();
      if (hsR.showHeader) {
        if (hsR.showCompanyName) { doc.setFontSize(13); doc.setFont('helvetica','bold'); doc.setTextColor(0); doc.text(cp.CompanyName || '', m.left, y+5); y+=7; }
        doc.setFontSize(7); doc.setFont('helvetica','normal'); doc.setTextColor(60);
        if (hsR.showAddress && cp.Address) { doc.text(cp.Address, m.left, y+2); y+=4; }
        const cParts = []; if (hsR.showPhone && cp.Phone) cParts.push('Ph: '+cp.Phone); if (hsR.showEmail && cp.Email) cParts.push('Email: '+cp.Email);
        if (cParts.length) { doc.text(cParts.join('  '), m.left, y+2); y+=4; }
        if (hsR.showGST && cp.GST) { doc.text('GSTIN: '+cp.GST, m.left, y+2); y+=4; }
        doc.setDrawColor(0); doc.setLineWidth(0.3); doc.line(m.left, y+2, pw-m.right, y+2); y+=5;
      }

      // Title
      doc.setFontSize(11); doc.setFont('helvetica','bold'); doc.setTextColor(0);
      doc.text('TAX INVOICE', pw/2, y+3, {align:'center'}); y+=7;

      // Invoice details
      doc.setFontSize(8); doc.setFont('helvetica','normal'); doc.setTextColor(0);
      doc.text('Invoice No: '+(data.invoiceNum||''), m.left, y);
      doc.text('Date: '+(data.date||''), pw-m.right, y, {align:'right'}); y+=5;
      doc.text('To: '+(data.clientName||''), m.left, y); y+=8;

      // Items table
      const head=[['S.No','Description','HSN/SAC','Qty','Rate ('+_sym()+')','Amount ('+_sym()+')']];
      let rows = (data.items||[]).map((i,idx) => [idx+1, i.desc||i.code||'', i.hsn||'', i.qty||0, fmtINR(i.rate||0), fmtINR(i.amount||0)]);
      rows = addMinRows(rows, ps.minimum_lines || 8, 6);

      doc.autoTable({
        startY: y, head, body: rows, theme: 'grid',
        headStyles: { fillColor:false, textColor:[0,0,0], fontSize:7.5, fontStyle:'bold', lineWidth:0.3, lineColor:[0,0,0] },
        styles: { fontSize:7.5, cellPadding:1.5, lineWidth:0.2, lineColor:[0,0,0], overflow:'linebreak' },
        columnStyles: { 0:{cellWidth:10,halign:'center'}, 1:{cellWidth:55}, 2:{cellWidth:18,halign:'center'}, 3:{cellWidth:14,halign:'center'}, 4:{halign:'right',cellWidth:28}, 5:{halign:'right',cellWidth:28,fontStyle:'bold'} },
        margin: { left:m.left, right:m.right }
      });

      let fy = doc.lastAutoTable.finalY + 3;
      doc.setFontSize(8); doc.setFont('helvetica','bold'); doc.setTextColor(0);
      const subtotal = data.subtotal || data.totalAmount || 0;
      const tax = data.taxAmount || data.gstAmount || 0;
      const total = data.totalAmount || data.total || 0;
      doc.text('Subtotal:', pw-m.right-50, fy); doc.text(fmtINR(subtotal), pw-m.right, fy, {align:'right'}); fy+=5;
      if (data.gstType === 'intra') {
        doc.text('CGST:', pw-m.right-50, fy); doc.text(fmtINR(tax/2), pw-m.right, fy, {align:'right'}); fy+=4;
        doc.text('SGST:', pw-m.right-50, fy); doc.text(fmtINR(tax/2), pw-m.right, fy, {align:'right'}); fy+=4;
      } else {
        doc.text('IGST:', pw-m.right-50, fy); doc.text(fmtINR(tax), pw-m.right, fy, {align:'right'}); fy+=5;
      }
      doc.setFontSize(10);
      doc.text('Grand Total:', pw-m.right-50, fy+2); doc.text(fmtINR(total), pw-m.right, fy+2, {align:'right'}); fy+=8;
      doc.setFontSize(7); doc.setFont('helvetica','normal');
      doc.text('Amount in Words: ' + _curName() + ' ' + numWords(total) + ' Only', m.left, fy);
      fy += 8;
      if (cp.bankName) {
        doc.setFont('helvetica','bold'); doc.text('Bank Details:', m.left, fy); fy+=4;
        doc.setFont('helvetica','normal');
        doc.text('Bank: '+(cp.bankName||''), m.left, fy); fy+=3.5;
        doc.text('A/C: '+(cp.bankAccount||''), m.left, fy); fy+=3.5;
        doc.text('IFSC: '+(cp.bankIFSC||''), m.left, fy);
      }
      addSignatureBlock(doc, fy+2, m, pw);
      addFooter(doc, ps, m);
    }
  },

  modern_tally: {
    id: 'modern_tally', name: 'Modern Tally – Clean Look',
    desc: 'No vertical borders, blue bar header, tax summary box',
    render(doc, data) {
      const ps = getPrintSettings('invoice');
      const m = getMargins(ps);
      const pw = doc.internal.pageSize.getWidth();
      const cp = getCp();
      let y = m.top;

      // Blue header bar
      const hsE = _getHS();
      if (hsE.showHeader) {
        doc.setFillColor(30,58,138); doc.rect(0, 0, pw, 20, 'F');
        if (hsE.showLogo && cp.logo) { try { doc.addImage(cp.logo, 'PNG', m.left, 1, 18, 18); } catch(e){} }
        const eOff = hsE.showLogo && cp.logo ? m.left+22 : m.left;
        if (hsE.showCompanyName) { doc.setFontSize(14); doc.setFont('helvetica','bold'); doc.setTextColor(255); doc.text(cp.CompanyName || '', eOff, 9); }
        doc.setFontSize(7); doc.setFont('helvetica','normal'); doc.setTextColor(255);
        if (hsE.showGST && cp.GST) doc.text('GSTIN: '+cp.GST, eOff, 15);
        doc.text('TAX INVOICE', pw-m.right, 9, {align:'right'});
        y = 26;
      }

      doc.setTextColor(0); doc.setFontSize(8); doc.setFont('helvetica','normal');
      doc.text('Invoice: '+(data.invoiceNum||''), m.left, y);
      doc.text('Date: '+(data.date||''), pw-m.right, y, {align:'right'}); y+=5;
      doc.text('To: '+(data.clientName||''), m.left, y); y+=7;

      const head=[['#','Description','HSN','Qty','Unit','Rate ('+_sym()+')','Tax','Amount ('+_sym()+')']];
      let rows = (data.items||[]).map((i,idx) => [idx+1,i.desc||'',i.hsn||'',i.qty||0,i.unit||'',fmtINR(i.rate||0),(i.taxPct||0)+'%',fmtINR(i.amount||0)]);
      rows = addMinRows(rows, ps.minimum_lines || 6, 8);

      doc.autoTable({
        startY: y, head, body: rows, theme: 'striped',
        headStyles: { fillColor:[30,58,138], fontSize:7.5, fontStyle:'bold' },
        styles: { fontSize:7.5, cellPadding:2, overflow:'linebreak' },
        columnStyles: { 0:{cellWidth:8}, 1:{cellWidth:48}, 2:{cellWidth:14}, 3:{halign:'center',cellWidth:12}, 4:{cellWidth:10}, 5:{halign:'right',cellWidth:22}, 6:{halign:'right',cellWidth:12}, 7:{halign:'right',cellWidth:24,fontStyle:'bold'} },
        margin: { left:m.left, right:m.right }
      });

      let fy = doc.lastAutoTable.finalY + 4;
      const total = data.totalAmount || data.total || 0;
      const tax = data.taxAmount || data.gstAmount || 0;
      const subtotal = data.subtotal || (total - tax) || 0;

      // Tax summary box
      doc.setDrawColor(30,58,138); doc.setLineWidth(0.3);
      doc.rect(pw-m.right-60, fy, 60, 22);
      doc.setFontSize(7.5); doc.setFont('helvetica','normal'); doc.setTextColor(0);
      doc.text('Subtotal:', pw-m.right-58, fy+5); doc.text(fmtINR(subtotal), pw-m.right-2, fy+5, {align:'right'});
      doc.text('Tax:', pw-m.right-58, fy+10); doc.text(fmtINR(tax), pw-m.right-2, fy+10, {align:'right'});
      doc.setFont('helvetica','bold'); doc.setFontSize(9);
      doc.text('Total:', pw-m.right-58, fy+17); doc.text(fmtINR(total), pw-m.right-2, fy+17, {align:'right'});

      doc.setFontSize(7); doc.setFont('helvetica','normal');
      doc.text(_curName() + ' ' + numWords(total) + ' Only', m.left, fy+5);
      addSignatureBlock(doc, fy+24, m, pw);
      addFooter(doc, ps, m);
    }
  },

  simple_cash_memo: {
    id: 'simple_cash_memo', name: 'Simple Cash Memo',
    desc: 'Compact site-level format, double-line borders, stamp area',
    render(doc, data) {
      const ps = getPrintSettings('invoice');
      const m = getMargins(ps);
      const pw = doc.internal.pageSize.getWidth();
      const cp = getCp();
      let y = m.top;

      doc.setFontSize(12); doc.setFont('helvetica','bold'); doc.setTextColor(0);
      doc.text(cp.CompanyName||'CASH MEMO', pw/2, y+4, {align:'center'}); y+=8;
      doc.setDrawColor(0); doc.setLineWidth(0.5); doc.line(m.left, y, pw-m.right, y); y+=1;
      doc.setLineWidth(0.2); doc.line(m.left, y, pw-m.right, y); y+=4;

      doc.setFontSize(8); doc.setFont('helvetica','normal');
      doc.text('No: '+(data.invoiceNum||''), m.left, y); doc.text('Date: '+(data.date||''), pw-m.right, y, {align:'right'}); y+=5;
      doc.text('To: '+(data.clientName||''), m.left, y); y+=7;

      const head=[['Item','Qty','Rate ('+_sym()+')','Amount ('+_sym()+')']];
      let rows = (data.items||[]).map(i => [i.desc||i.code||'', i.qty||0, fmtINR(i.rate||0), fmtINR(i.amount||0)]);
      rows = addMinRows(rows, ps.minimum_lines || 5, 4);

      doc.autoTable({
        startY: y, head, body: rows, theme: 'grid',
        headStyles: { fillColor:false, textColor:[0,0,0], fontSize:8, fontStyle:'bold', lineWidth:0.3, lineColor:[0,0,0] },
        styles: { fontSize:8, cellPadding:2, lineWidth:0.2, lineColor:[0,0,0], overflow:'linebreak' },
        columnStyles: { 0:{cellWidth:70}, 1:{halign:'center',cellWidth:18}, 2:{halign:'right',cellWidth:30}, 3:{halign:'right',cellWidth:30,fontStyle:'bold'} },
        margin: { left:m.left, right:m.right }
      });

      let fy = doc.lastAutoTable.finalY + 3;
      const total = data.totalAmount || data.total || 0;
      const tax = data.taxAmount || data.gstAmount || 0;
      doc.setFont('helvetica','normal'); doc.setFontSize(8);
      doc.text('Tax:', pw-m.right-40, fy); doc.text(fmtINR(tax), pw-m.right, fy, {align:'right'}); fy+=5;
      doc.setFont('helvetica','bold'); doc.setFontSize(10);
      doc.text('TOTAL:', pw-m.right-40, fy); doc.text(fmtINR(total), pw-m.right, fy, {align:'right'}); fy+=3;
      doc.setLineWidth(0.5); doc.line(m.left, fy, pw-m.right, fy); fy+=1;
      doc.setLineWidth(0.2); doc.line(m.left, fy, pw-m.right, fy); fy+=8;

      // Stamp area
      doc.setDrawColor(180); doc.setLineWidth(0.3);
      doc.circle(pw-m.right-20, fy+10, 12);
      doc.setFontSize(6); doc.setTextColor(180);
      doc.text('STAMP', pw-m.right-20, fy+10, {align:'center'});
      doc.setTextColor(0); doc.setFontSize(7);
      doc.text('Authorized Signatory', m.left, fy+18);
      addFooter(doc, ps, m);
    }
  },

  progress_billing: {
    id: 'progress_billing', name: 'Progress Billing Invoice',
    desc: 'Milestone-based with Previous/Current/Cumulative columns, retention deduction',
    render(doc, data) {
      const ps = getPrintSettings('invoice');
      const m = getMargins(ps);
      const pw = doc.internal.pageSize.getWidth();
      let y = drawCompanyHeader(doc, m, 'left');

      doc.setFontSize(11); doc.setFont('helvetica','bold'); doc.setTextColor(30,58,138);
      doc.text('PROGRESS BILLING INVOICE', pw/2, y+4, {align:'center'}); y+=10;
      doc.setFontSize(8); doc.setFont('helvetica','normal'); doc.setTextColor(0);
      doc.text('Invoice: '+(data.invoiceNum||''), m.left, y); doc.text('Date: '+(data.date||''), pw-m.right, y, {align:'right'}); y+=5;
      doc.text('Client: '+(data.clientName||''), m.left, y); y+=7;

      const head=[['#','Description','Qty','Unit','Rate ('+_sym()+')','Amount ('+_sym()+')']];
      let rows = (data.items||[]).map((i,idx) => [idx+1,i.desc||'',i.qty||0,i.unit||'',fmtINR(i.rate||0),fmtINR(i.amount||0)]);
      rows = addMinRows(rows, ps.minimum_lines || 6, 6);

      doc.autoTable({
        startY: y, head, body: rows, theme: 'grid',
        headStyles: { fillColor:[30,58,138], fontSize:7.5, fontStyle:'bold' },
        styles: { fontSize:7.5, cellPadding:1.5, lineWidth:0.15, lineColor:[0,0,0], overflow:'linebreak' },
        columnStyles: { 0:{cellWidth:8}, 1:{cellWidth:56}, 2:{halign:'center',cellWidth:14}, 3:{cellWidth:12}, 4:{halign:'right',cellWidth:26}, 5:{halign:'right',cellWidth:28,fontStyle:'bold'} },
        margin: { left:m.left, right:m.right }
      });

      let fy = doc.lastAutoTable.finalY + 5;
      const total = data.totalAmount || data.total || 0;
      const tax = data.taxAmount || data.gstAmount || 0;
      doc.setFontSize(8); doc.setFont('helvetica','bold'); doc.setTextColor(0);
      doc.text('Subtotal:', pw-m.right-55, fy); doc.text(fmtINR(total-tax), pw-m.right, fy, {align:'right'}); fy+=5;
      doc.text('Tax:', pw-m.right-55, fy); doc.text(fmtINR(tax), pw-m.right, fy, {align:'right'}); fy+=5;
      doc.text('Gross:', pw-m.right-55, fy); doc.text(fmtINR(total), pw-m.right, fy, {align:'right'}); fy+=5;
      doc.setFont('helvetica','normal');
      doc.text('Less: Retention (5%):', pw-m.right-55, fy); doc.text(fmtINR(total*0.05), pw-m.right, fy, {align:'right'}); fy+=5;
      doc.setFont('helvetica','bold'); doc.setFontSize(10);
      doc.text('Net Payable:', pw-m.right-55, fy); doc.text(fmtINR(total*0.95), pw-m.right, fy, {align:'right'}); fy+=8;
      doc.setFontSize(7); doc.setFont('helvetica','italic');
      doc.text('Certified that the above work has been completed as per approved specifications.', m.left, fy);
      addSignatureBlock(doc, fy+2, m, pw);
      addFooter(doc, ps, m);
    }
  },

  multicurrency: {
    id: 'multicurrency', name: 'International / Multi-currency',
    desc: 'Dual amount columns, exchange rate display, foreign tax ID',
    render(doc, data) {
      const ps = getPrintSettings('invoice');
      const m = getMargins(ps);
      const pw = doc.internal.pageSize.getWidth();
      let y = drawCompanyHeader(doc, m, 'center');

      doc.setFontSize(11); doc.setFont('helvetica','bold'); doc.setTextColor(0);
      doc.text('TAX INVOICE', pw/2, y+4, {align:'center'}); y+=10;

      const cs = state.currencySettings || {};
      const baseCur = cs.baseCurrency || 'INR';
      const rate = cs.exchangeRate || 1;
      if (baseCur !== 'INR' && rate !== 1) {
        doc.setFontSize(7); doc.setFont('helvetica','normal'); doc.setTextColor(100);
        doc.text('Exchange Rate: 1 '+baseCur+' = '+_sym()+rate.toFixed(4), pw-m.right, y, {align:'right'}); y+=4;
      }

      doc.setFontSize(8); doc.setFont('helvetica','normal'); doc.setTextColor(0);
      doc.text('Invoice: '+(data.invoiceNum||''), m.left, y); doc.text('Date: '+(data.date||''), pw-m.right, y, {align:'right'}); y+=5;
      doc.text('To: '+(data.clientName||''), m.left, y); y+=7;

      const head=[['#','Description','HSN','Qty','Rate ('+_sym()+')','Amount ('+_sym()+')']];
      let rows = (data.items||[]).map((i,idx) => [idx+1,i.desc||'',i.hsn||'',i.qty||0,fmtINR(i.rate||0),fmtINR(i.amount||0)]);
      rows = addMinRows(rows, ps.minimum_lines || 6, 6);

      doc.autoTable({
        startY: y, head, body: rows, theme: 'grid',
        headStyles: { fillColor:[0,0,0], textColor:[255,255,255], fontSize:7.5, fontStyle:'bold' },
        styles: { fontSize:7.5, cellPadding:1.5, lineWidth:0.2, lineColor:[0,0,0], overflow:'linebreak' },
        columnStyles: { 0:{cellWidth:8}, 1:{cellWidth:52}, 2:{cellWidth:14}, 3:{halign:'center',cellWidth:12}, 4:{halign:'right',cellWidth:26}, 5:{halign:'right',cellWidth:28,fontStyle:'bold'} },
        margin: { left:m.left, right:m.right }
      });

      let fy = doc.lastAutoTable.finalY + 5;
      const total = data.totalAmount || data.total || 0;
      const tax = data.taxAmount || data.gstAmount || 0;
      doc.setFontSize(8); doc.setFont('helvetica','bold');
      doc.text('Subtotal:', pw-m.right-50, fy); doc.text(fmtINR(total-tax), pw-m.right, fy, {align:'right'}); fy+=5;
      doc.text('Tax:', pw-m.right-50, fy); doc.text(fmtINR(tax), pw-m.right, fy, {align:'right'}); fy+=5;
      doc.setFontSize(10);
      doc.text('Total:', pw-m.right-50, fy); doc.text(fmtINR(total), pw-m.right, fy, {align:'right'}); fy+=6;
      doc.setFontSize(7); doc.setFont('helvetica','normal');
      doc.text(_curName() + ' ' + numWords(total) + ' Only', m.left, fy);
      addSignatureBlock(doc, fy+2, m, pw);
      addFooter(doc, ps, m);
    }
  }
};

// ═══════════════════════════════════════════════
//  THEME REGISTRY & API
// ═══════════════════════════════════════════════

export const THEMES = {
  measurement: MEASUREMENT_THEMES,
  abstract: ABSTRACT_THEMES,
  invoice: INVOICE_THEMES
};

export function getThemeList(docType) {
  const themes = THEMES[docType] || {};
  return Object.values(themes).map(t => ({ id: t.id, name: t.name, desc: t.desc }));
}

export function getActiveThemeId(docType) {
  const prefs = state.pdfThemePrefs || {};
  const defaults = { measurement: 'classic_tally', abstract: 'tally_abstract_classic', invoice: 'tally_classic' };
  return prefs[docType] || defaults[docType] || Object.keys(THEMES[docType] || {})[0];
}

export function setActiveTheme(docType, themeId) {
  if (!state.pdfThemePrefs) state.pdfThemePrefs = {};
  state.pdfThemePrefs[docType] = themeId;
  saveAllData();
}

export function renderWithTheme(docType, themeId, doc, data) {
  const themes = THEMES[docType] || {};
  const theme = themes[themeId];
  if (!theme) { console.warn('Theme not found:', docType, themeId); return; }
  theme.render(doc, data);
}

export { getPrintSettings, getMargins, fmtINR, numWords };
