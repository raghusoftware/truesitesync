import { $ } from '../lib/dom.js';
import { state } from './state.js';
import { formatNumber, formatNumber2, amountToWordsINR } from './format.js';

// Re-export pure formatters so existing imports from utils.js keep working.
export { amountToWordsINR } from './format.js';

/** @param {string} msg @param {'success'|'error'|'warning'} [type] */
export function showToast(msg, type = 'success') {
  const div = document.createElement('div');
  div.className = `toast toast-${type}`;
  div.textContent = msg;
  document.getElementById('toastContainer').appendChild(div);
  setTimeout(() => div.remove(), 3000);
}

/** @returns {Array<{id:string, name:string, type:string}>} */
export function getAllLocations() {
  const combined = [];
  
  // 1. STRICTLY Active Projects, labelled with the CLIENT name only.
  // Every site/location dropdown in the app renders `name`, so this is the one
  // place that decides how they all read.
  (state.projects || []).forEach(p => {
    const client = (state.clients || []).find(c => c.id === p.clientId);
    const cName = client ? client.name : (p.clientName || 'Unknown Client');
    combined.push({ id: p.id, name: cName, projectName: p.name, type: 'Project' });
  });

  // 2. Real warehouse/site locations (if you have created any dedicated warehouses)
  (state.locations || []).forEach(l => {
    if (!combined.some(x => x.id === l.id)) {
      combined.push({ id: l.id, name: `${l.name} (Warehouse)`, type: l.type });
    }
  });

  // We have completely removed the legacy fallback logic here to prevent "ghost" sites.
  return combined;
}

/** @param {string} newName @param {string|null} [skipRmId] @returns {string|false} */
export function isNameTaken(newName, skipRmId = null) {
  const nameLower = newName.toLowerCase().trim();
  if (state.rawMaterials.some(rm => rm.id !== skipRmId && rm.name.toLowerCase().trim() === nameLower)) {
    return 'Name already exists as a Material/Tool.';
  }
  for (const cId in state.items) {
    for (const code in state.items[cId]) {
      if (state.items[cId][code].code.toLowerCase().trim() === nameLower ||
          state.items[cId][code].description.toLowerCase().trim() === nameLower) {
        return 'Name already exists as an Execution Item.';
      }
    }
  }
  return false;
}

/** Refresh material dropdowns in purchase rows */
export function refreshPurchaseDropdowns() {
  let rmOptions = '<option value="">-- Select Material / Asset --</option>';
  state.rawMaterials.forEach(rm => {
    rmOptions += `<option value="${rm.id}">${rm.name} (${rm.unit}) [${rm.type}]</option>`;
  });
  document.querySelectorAll('.pur-mat').forEach(select => {
    const currentVal = select.value;
    select.innerHTML = rmOptions;
    select.value = currentVal;
  });
}

/** Populate all dropdown selects from state */
export function populateDropdowns() {
  const cSelects = [
    'sheetClientSelect', 'accInClient', 'accExpClient', 'hubClientSelect',
    'itemMasterClientSelect', 'billingClientSelect',
    'estClient', 'recipeClientSelect', 'repConsSite'
  ];
  cSelects.forEach(id => {
    const el = document.getElementById(id);
    if (el) {
      const val = el.value;
      el.innerHTML = id === 'accExpClient'
        ? '<option value="">-- No Project (Overhead) --</option>'
        : '<option value="">-- Select Client / Project --</option>';
      state.clients.forEach(c => {
        el.innerHTML += `<option value="${c.id}">${c.name} - ${c.projectName}</option>`;
      });
      el.value = val;
    }
  });

  // 🔥 CLEANED UP SITE SELECTION 🔥
  // No more digging through legacy transaction data. Only strict locations.
  const allLocs = getAllLocations();
  ['purSite', 'invSiteSelect'].forEach(id => {
    const el = document.getElementById(id);
    if (el) {
      const val = el.value;
      
      el.innerHTML = id === 'invSiteSelect'
        ? '<option value="">All sites</option>'
        : '<option value="">-- Select Site / Location --</option>';
      
      allLocs.forEach(l => {
        el.innerHTML += `<option value="${l.id}">${l.name}</option>`;
      });
      
      el.value = val;
    }
  });

  ['accInAccount', 'accExpAccount', 'venPayAccount', 'eqLogAccount'].forEach(id => {
    const el = document.getElementById(id);
    if (el) {
      const val = el.value;
      el.innerHTML = '';
      state.accounts.forEach(a => {
        el.innerHTML += `<option value="${a.id}">${a.name} (${a.type})</option>`;
      });
      if (val) el.value = val;
    }
  });

  ['purVendor', 'venPayVendor'].forEach(id => {
    const el = document.getElementById(id);
    if (el) {
      const val = el.value;
      el.innerHTML = '<option value="">-- Select Vendor --</option>';
      state.vendors.forEach(v => {
        el.innerHTML += `<option value="${v.id}">${v.name}</option>`;
      });
      if (val) el.value = val;
    }
  });

  const elInvMat = document.getElementById('invMaterial');
  if (elInvMat) {
    const val = elInvMat.value;
    elInvMat.innerHTML = '<option value="">-- Select Material / Tool --</option>';
    state.rawMaterials.forEach(r => {
      elInvMat.innerHTML += `<option value="${r.id}">${r.name} (${r.type})</option>`;
    });
    if (val) elInvMat.value = val;
    window.refreshInvUnitPicker && window.refreshInvUnitPicker();
  }
}

/** Set all date fields to today */
export function setDateFields() {
  const today = new Date().toISOString().split('T')[0];
  ['sheetDate', 'accInDate', 'accExpDate', 'venPayDate', 'estDate', 'purDate', 'invDate', 'maintDate'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = today;
  });
}

/** @param {number} n @returns {string} formatted with currency settings */
export function formatINR(n) {
  const cs = state.currencySettings || {};
  const locale = cs.locale || 'en-IN';
  return (cs.symbol || '₹') + formatNumber(n, cs.decimals ?? 0, locale);
}

/** @param {number} n @returns {string} formatted with 2 decimals minimum */
export function formatINR2(n) {
  const cs = state.currencySettings || {};
  return (cs.symbol || '₹') + formatNumber2(n, cs.locale || 'en-IN');
}

/** Get currency symbol from settings */
export function getCurrencySymbol() {
  return (state.currencySettings || {}).symbol || '₹';
}

/** PDF-safe currency prefix — jsPDF Helvetica can't render ₹, so use Rs. */
export function getPdfCurrency() {
  const sym = (state.currencySettings || {}).symbol || '₹';
  return sym === '₹' ? 'Rs. ' : sym + ' ';
}

/** PDF-safe money string, e.g. "Rs. 1,234.56" (avoids the broken ₹ glyph). */
export function pdfMoney(n) {
  return getPdfCurrency() + formatNumber2(n);
}

/** Get resolved header settings with defaults */
export function getHeaderSettings() {
  const hs = state.headerSettings || {};
  return {
    showHeader: hs.showHeader !== false,
    showLogo: hs.showLogo !== false,
    showCompanyName: hs.showCompanyName !== false,
    showAddress: hs.showAddress !== false,
    showPhone: hs.showPhone !== false,
    showEmail: hs.showEmail !== false,
    showGST: hs.showGST !== false,
    companyNameSize: hs.companyNameSize || 18,
    companyNameFont: hs.companyNameFont || 'helvetica',
    companyNameStyle: hs.companyNameStyle || 'bold',
    companyNameAlign: hs.companyNameAlign || 'center',
    companyNameColor: hs.companyNameColor || '#1e3a8a',
    detailsSize: hs.detailsSize || 9,
    detailsFont: hs.detailsFont || 'helvetica',
    detailsAlign: hs.detailsAlign || 'center',
    detailsColor: hs.detailsColor || '#64748b',
    gstSize: hs.gstSize || 9,
    gstStyle: hs.gstStyle || 'bold',
    showSeparator: hs.showSeparator !== false,
    separatorColor: hs.separatorColor || '#f97316',
    separatorWidth: hs.separatorWidth || 0.6,
    headerSpacing: hs.headerSpacing ?? 5,
    logoWidth: hs.logoWidth || 22,
    logoHeight: hs.logoHeight || 22
  };
}

function _hexToRgb(hex) {
  const r = parseInt(hex.slice(1,3),16), g = parseInt(hex.slice(3,5),16), b = parseInt(hex.slice(5,7),16);
  return [r, g, b];
}

function _pdfAlignX(align, pw, ml, mr) {
  if (align === 'center') return pw / 2;
  if (align === 'right') return pw - mr;
  return ml;
}

/** Print a section by ID */
export function printReport(elemId, title) {
  const sourceElem = document.getElementById(elemId);
  if (!sourceElem) return;
  let printContainer = document.getElementById('print-container');
  if (!printContainer) {
    printContainer = document.createElement('div');
    printContainer.id = 'print-container';
    document.body.appendChild(printContainer);
  }
  const cp = state.companyProfile;
  const hs = getHeaderSettings();
  const timestamp = new Date().toLocaleString();
  const align = hs.companyNameAlign;
  const dtAlign = hs.detailsAlign;

  let headerHtml = '';
  if (hs.showHeader) {
    headerHtml += `<div style="text-align:${align};margin-bottom:20px;">`;
    if (hs.showLogo && cp.logo) {
      headerHtml += `<img src="${cp.logo}" style="height:${hs.logoHeight * 2}px;margin:${align === 'center' ? '0 auto 8px' : align === 'right' ? '0 0 8px auto' : '0 auto 8px 0'};display:block;">`;
    }
    if (hs.showCompanyName) {
      headerHtml += `<h1 style="color:${hs.companyNameColor};font-size:${hs.companyNameSize}px;font-weight:${hs.companyNameStyle === 'bold' ? '800' : '400'};font-family:${hs.companyNameFont},sans-serif;margin-bottom:4px;text-transform:uppercase;text-align:${align};">${cp.CompanyName || ''}</h1>`;
    }
    const detailLines = [];
    if (hs.showAddress && cp.Address) detailLines.push(cp.Address);
    const contactParts = [];
    if (hs.showPhone && cp.Phone) contactParts.push(cp.Phone);
    if (hs.showEmail && cp.Email) contactParts.push(cp.Email);
    if (contactParts.length) detailLines.push(contactParts.join('  |  '));
    if (hs.showGST && cp.GST) detailLines.push('GSTIN: ' + cp.GST);
    detailLines.forEach(line => {
      headerHtml += `<p style="color:${hs.detailsColor};font-size:${hs.detailsSize}px;font-family:${hs.detailsFont},sans-serif;margin:2px 0;text-align:${dtAlign};">${line}</p>`;
    });
    if (hs.showSeparator) {
      headerHtml += `<div style="border-bottom:${hs.separatorWidth * 2}px solid ${hs.separatorColor};margin:12px 0;"></div>`;
    }
    headerHtml += `<h2 style="font-size:18px;font-weight:bold;display:inline-block;padding-bottom:4px;text-align:${align};">${title}</h2>`;
    headerHtml += `<p style="font-size:12px;color:#94a3b8;margin-top:8px;text-align:${dtAlign};">Generated on: ${timestamp}</p>`;
    headerHtml += '</div>';
  } else {
    headerHtml = `<div style="text-align:center;margin-bottom:20px;">
      <h2 style="font-size:18px;font-weight:bold;">${title}</h2>
      <p style="font-size:12px;color:#94a3b8;margin-top:4px;">Generated on: ${timestamp}</p>
    </div>`;
  }
  printContainer.innerHTML = headerHtml + sourceElem.outerHTML;
  window.print();
}

/**
 * "Simple" PDF header — logo at the top-left corner, company name beside it,
 * and address | phone | email | GSTIN on a single line. Shared by the invoice,
 * measurement and abstract PDFs so their headers look identical.
 * Returns the y position just below the header (after a separator rule).
 */
export function getSimpleHeaderForPDF(doc, opts = {}) {
  const cp = state.companyProfile || {};
  const pw = doc.internal.pageSize.getWidth();
  const ml = opts.ml ?? 14, mr = opts.mr ?? 14;
  let y = 14, textX = ml;
  if (cp.logo) { try { doc.addImage(cp.logo, 'PNG', ml, y, 22, 22); textX = ml + 27; } catch {} }
  doc.setTextColor(0, 0, 0); doc.setFont('helvetica', 'bold'); doc.setFontSize(15);
  doc.text(cp.CompanyName || '', textX, y + 6);
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
  doc.setTextColor(0, 0, 0);
  return y + 4;
}

// Exposed on window so exporter modules can use it
if (typeof window !== 'undefined') window.getSimpleHeaderForPDF = getSimpleHeaderForPDF;

// ── Inline "add new client / vendor" from any sale/purchase form dropdown ──
if (typeof window !== 'undefined') {
  window._addPartyInline = function (selId, type) {
    window._pendingPartySelect = selId || '';
    if (type === 'vendor') { if (window.openVendorModal) window.openVendorModal(); }
    else { if (window.openClientModal) window.openClientModal(); }
  };
  
  window._applyPendingPartySelect = function (rec) {
    const selId = window._pendingPartySelect; window._pendingPartySelect = '';
    if (!selId || !rec) return;
    const sel = document.getElementById(selId);
    if (!sel) return;
    if (!Array.from(sel.options).some(o => o.value === rec.id)) {
      const o = document.createElement('option');
      o.value = rec.id;
      o.textContent = rec.name + (rec.projectName ? ' - ' + rec.projectName : '');
      sel.appendChild(o);
    }
    sel.value = rec.id;
    sel.dispatchEvent(new Event('change'));
  };

  window._addPartyChooser = function () {
    let o = document.getElementById('addPartyChooser');
    if (!o) {
      o = document.createElement('div');
      o.id = 'addPartyChooser';
      o.style.cssText = 'position:fixed;inset:0;background:rgba(15,23,42,.5);backdrop-filter:blur(2px);z-index:200000;display:flex;align-items:center;justify-content:center;padding:16px;';
      o.addEventListener('click', e => { if (e.target === o) o.style.display = 'none'; });
      document.body.appendChild(o);
    }
    window._pendingPartySelect = ''; 
    const btn = (label, icon, fn) => `<button onclick="document.getElementById('addPartyChooser').style.display='none';${fn}" style="display:flex;align-items:center;gap:10px;width:100%;padding:12px 14px;border:1px solid #e2e8f0;border-radius:12px;background:#fff;cursor:pointer;font-weight:700;color:#0f172a;font-size:14px;margin-bottom:8px;">${icon} ${label}</button>`;
    o.innerHTML = `<div style="background:#fff;border-radius:16px;max-width:360px;width:100%;padding:20px;box-shadow:0 24px 60px rgba(0,0,0,.3);">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;"><h3 style="font-weight:800;font-size:17px;color:#0f172a;">Add Party</h3><button onclick="document.getElementById('addPartyChooser').style.display='none'" style="border:none;background:#f1f5f9;border-radius:8px;width:28px;height:28px;cursor:pointer;color:#64748b;font-size:16px;">×</button></div>
      ${btn('Client', '🏢', 'window.openClientModal&&window.openClientModal();')}
      ${btn('Vendor / Supplier', '🏭', 'window.openVendorModal&&window.openVendorModal();')}
      ${btn('Labour', '👷', 'window.openLabourModal&&window.openLabourModal();')}
    </div>`;
    o.style.display = 'flex';
  };
}

/** Get company header for jsPDF documents */
export function getCompanyHeaderForPDF(doc) {
  const cp = state.companyProfile;
  const hs = getHeaderSettings();
  const pw = doc.internal.pageSize.getWidth();
  const ml = 14, mr = 14;
  let y = 15;

  if (!hs.showHeader) {
    return y;
  }

  const nameColor = _hexToRgb(hs.companyNameColor);
  const dtColor = _hexToRgb(hs.detailsColor);
  const nameAlign = hs.companyNameAlign;
  const dtAlign = hs.detailsAlign;
  const nameX = _pdfAlignX(nameAlign, pw, ml, mr);
  const dtX = _pdfAlignX(dtAlign, pw, ml, mr);

  if (hs.showLogo && cp.logo) {
    try {
      const lw = hs.logoWidth, lh = hs.logoHeight;
      const lx = nameAlign === 'center' ? pw/2 - lw/2 : nameAlign === 'right' ? pw - mr - lw : ml;
      doc.addImage(cp.logo, 'PNG', lx, y - 5, lw, lh);
      if (nameAlign === 'center') { y += lh + 2; } else { y += 0; }
    } catch {}
  }

  const hasLogoLeft = hs.showLogo && cp.logo && nameAlign !== 'center';
  const textXOff = hasLogoLeft ? ml + hs.logoWidth + 4 : nameX;

  if (hs.showCompanyName) {
    doc.setFontSize(hs.companyNameSize);
    doc.setFont(hs.companyNameFont, hs.companyNameStyle);
    doc.setTextColor(nameColor[0], nameColor[1], nameColor[2]);
    if (hasLogoLeft) {
      doc.text(cp.CompanyName || '', textXOff, y + 2);
    } else {
      doc.text(cp.CompanyName || '', nameX, y + 2, { align: nameAlign });
    }
    y += hs.companyNameSize * 0.4 + 2;
  }

  doc.setFontSize(hs.detailsSize);
  doc.setFont(hs.detailsFont, 'normal');
  doc.setTextColor(dtColor[0], dtColor[1], dtColor[2]);

  if (hs.showAddress && cp.Address) {
    if (hasLogoLeft) {
      doc.text(cp.Address, textXOff, y + 4);
    } else {
      doc.text(cp.Address, dtX, y + 4, { align: dtAlign });
    }
    y += hs.detailsSize * 0.5 + 2;
  }

  const contactParts = [];
  if (hs.showPhone && cp.Phone) contactParts.push(cp.Phone);
  if (hs.showEmail && cp.Email) contactParts.push(cp.Email);
  if (contactParts.length) {
    if (hasLogoLeft) {
      doc.text(contactParts.join('  |  '), textXOff, y + 4);
    } else {
      doc.text(contactParts.join('  |  '), dtX, y + 4, { align: dtAlign });
    }
    y += hs.detailsSize * 0.5 + 2;
  }

  if (hs.showGST && cp.GST) {
    doc.setFontSize(hs.gstSize);
    doc.setFont(hs.detailsFont, hs.gstStyle);
    if (hasLogoLeft) {
      doc.text('GSTIN: ' + cp.GST, textXOff, y + 4);
    } else {
      doc.text('GSTIN: ' + cp.GST, dtX, y + 4, { align: dtAlign });
    }
    y += hs.gstSize * 0.5 + 2;
  }

  y += 2;
  if (hs.showSeparator) {
    const sepColor = _hexToRgb(hs.separatorColor);
    doc.setDrawColor(sepColor[0], sepColor[1], sepColor[2]);
    doc.setLineWidth(hs.separatorWidth);
    doc.line(ml, y, pw - mr, y);
  }
  return y + hs.headerSpacing;
}

/** Is the app running inside the Capacitor Android WebView? */
function _isCapacitor() {
  return !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());
}

/** Convert a Blob to base64 string (no data: prefix) */
function _blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(String(reader.result).split(',')[1]);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

/** Save a file on device via Capacitor Filesystem, then open Share sheet */
async function _capacitorSaveAndShare(base64, filename, mimeType) {
  const { Filesystem } = window.Capacitor.Plugins;
  const result = await Filesystem.writeFile({
    path: filename,
    data: base64,
    directory: 'CACHE',
  });
  try {
    const { Share } = window.Capacitor.Plugins;
    if (Share) {
      await Share.share({
        title: filename,
        url: result.uri,
        dialogTitle: 'Save or open ' + filename,
      });
      return;
    }
  } catch (_) {}
  try {
    const { FileOpener } = window.Capacitor.Plugins;
    if (FileOpener) { await FileOpener.open({ filePath: result.uri, contentType: mimeType }); return; }
  } catch (_) {}
}

/**
 * Mobile-friendly PDF save.
 * - Capacitor APK → Filesystem + Share
 * - Web/Desktop → standard download
 */
export function mobileSavePDF(doc, filename) {
  if (_isCapacitor()) {
    (async () => {
      try {
        const blob = doc.output('blob');
        const base64 = await _blobToBase64(blob);
        await _capacitorSaveAndShare(base64, filename, 'application/pdf');
        showToast('PDF ready — choose where to save', 'success');
      } catch (e) {
        try { window.open(doc.output('datauristring'), '_blank'); } catch(_) {}
        showToast('Download failed: ' + (e.message || e), 'error');
      }
    })();
    return;
  }
  const isMobileBrowser = /Android|iPhone|iPad/i.test(navigator.userAgent);
  if (isMobileBrowser) {
    try {
      const blob = doc.output('blob');
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = filename; a.target = '_blank';
      document.body.appendChild(a); a.click();
      setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(url); }, 1000);
    } catch(e) {
      window.open(doc.output('datauristring'), '_blank');
    }
  } else {
    doc.save(filename);
  }
}

/** Mobile-friendly XLSX workbook save (Capacitor APK or web) */
export function mobileSaveXLSX(wb, filename) {
  try {
    const wbout = window.XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
    const blob = new Blob([wbout], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    mobileDownloadBlob(blob, filename, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  } catch (e) {
    try { window.XLSX.writeFile(wb, filename); } catch(_) {}
  }
}

/** Mobile-friendly blob download (for Excel etc.) */
export function mobileDownloadBlob(blob, filename, mimeType) {
  if (_isCapacitor()) {
    (async () => {
      try {
        const base64 = await _blobToBase64(blob);
        await _capacitorSaveAndShare(base64, filename, mimeType || 'application/octet-stream');
        showToast('File ready — choose where to save', 'success');
      } catch (e) {
        showToast('Download failed: ' + (e.message || e), 'error');
      }
    })();
    return;
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.target = '_blank';
  document.body.appendChild(a); a.click();
  setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(url); }, 1000);
}