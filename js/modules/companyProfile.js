/**
 * ═══════════════════════════════════════════════════════════
 * True Site Sync — Company Profile
 * ═══════════════════════════════════════════════════════════
 * Company details + logo used across PDFs/invoices. Extracted from ui.js.
 * ═══════════════════════════════════════════════════════════
 */

import { state } from './state.js';
import { showToast } from './utils.js';

export function loadCompanyProfile() {
  const cp = state.companyProfile;
  if (!cp) return;
  const fieldMap = { cpCompanyName: 'CompanyName', cpOwnerName: 'OwnerName', cpPhone: 'Phone', cpEmail: 'Email', cpGST: 'GST', cpAddress: 'Address', cpBankName: 'BankName', cpBankAcc: 'BankAcc', cpIFSC: 'IFSC', cpFY: 'FY' };
  for (const [elId, key] of Object.entries(fieldMap)) {
    const el = document.getElementById(elId);
    if (el && cp[key] !== undefined) el.value = cp[key];
  }
  if (cp.logo) {
    const img = document.getElementById('companyLogoPreview');
    const placeholder = document.getElementById('logoPlaceholder');
    const pdfImg = document.getElementById('pdfLogoPreview');
    if (img) { img.src = cp.logo; img.style.display = 'block'; }
    if (placeholder) placeholder.style.display = 'none';
    if (pdfImg) { pdfImg.src = cp.logo; pdfImg.style.display = 'block'; }
  }
  updateProfilePreview();
}

export function saveCompanyProfile() {
  const fieldMap = { cpCompanyName: 'CompanyName', cpOwnerName: 'OwnerName', cpPhone: 'Phone', cpEmail: 'Email', cpGST: 'GST', cpAddress: 'Address', cpBankName: 'BankName', cpBankAcc: 'BankAcc', cpIFSC: 'IFSC', cpFY: 'FY' };
  for (const [elId, key] of Object.entries(fieldMap)) {
    const el = document.getElementById(elId);
    if (el) state.companyProfile[key] = el.value;
  }
  localStorage.setItem('mes_companyProfile', JSON.stringify(state.companyProfile));
  updateProfilePreview();
  showToast('Company Profile Saved Successfully!', 'success');
}

export function handleLogoUpload(event) {
  const file = event.target.files[0];
  if (!file) return;
  if (file.size > 2 * 1024 * 1024) return showToast('Logo too large. Max 2MB.', 'error');
  const reader = new FileReader();
  reader.onload = function (e) {
    const base64 = e.target.result;
    state.companyProfile.logo = base64;
    const img = document.getElementById('companyLogoPreview');
    const pdfImg = document.getElementById('pdfLogoPreview');
    const placeholder = document.getElementById('logoPlaceholder');
    if (img) { img.src = base64; img.style.display = 'block'; }
    if (pdfImg) { pdfImg.src = base64; pdfImg.style.display = 'block'; }
    if (placeholder) placeholder.style.display = 'none';
    localStorage.setItem('mes_companyProfile', JSON.stringify(state.companyProfile));
    showToast('Logo Uploaded!', 'success');
  };
  reader.readAsDataURL(file);
}

export function removeCompanyLogo() {
  state.companyProfile.logo = null;
  localStorage.setItem('mes_companyProfile', JSON.stringify(state.companyProfile));
  const img = document.getElementById('companyLogoPreview');
  const pdfImg = document.getElementById('pdfLogoPreview');
  const placeholder = document.getElementById('logoPlaceholder');
  if (img) { img.src = ''; img.style.display = 'none'; }
  if (pdfImg) { pdfImg.src = ''; pdfImg.style.display = 'none'; }
  if (placeholder) placeholder.style.display = 'flex';
  showToast('Logo Removed', 'warning');
}

export function updateProfilePreview() {
  const cp = state.companyProfile;
  const nameEl = document.getElementById('previewCompName');
  const detailEl = document.getElementById('previewCompDetails');
  if (nameEl) nameEl.textContent = cp.CompanyName || 'YOUR COMPANY NAME';
  if (detailEl) detailEl.textContent = [cp.Phone, cp.Email, cp.GST ? `GST: ${cp.GST}` : '', cp.Address].filter(Boolean).join('  |  ') || 'Phone | Email | GST | Address';
}
