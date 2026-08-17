/**
 * ═══════════════════════════════════════════════════════════
 * True Site Sync — Sales Ledger view
 * ═══════════════════════════════════════════════════════════
 * Sales-ledger list/filters + per-invoice cancel/delete/view.
 * Extracted from ui.js. Navigation (switchView) reached via window.
 * ═══════════════════════════════════════════════════════════
 */

import { state, saveAllData } from './state.js';
import { showToast, getCurrencySymbol } from './utils.js';

/** Deterministic avatar gradient from a party name. */
export function lxAvatarColor(name) {
  let h = 0; const s = String(name || '?');
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 360;
  return `linear-gradient(135deg, hsl(${h} 62% 55%), hsl(${(h + 32) % 360} 64% 44%))`;
}
/** Two-letter initials from a party name. */
export function lxInitials(name) {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  return (parts[0][0] + (parts[1] ? parts[1][0] : (parts[0][1] || ''))).toUpperCase();
}
/** ISO yyyy-mm-dd → dd MMM yyyy for compact ledger dates. */
export function lxFmtDate(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || ''));
  if (!m) return iso || '—';
  const mon = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][+m[2] - 1] || m[2];
  return `${m[3]} ${mon} ${m[1]}`;
}
/** Count-up animation for the .lx-val KPI numbers inside a container. */
export function lxAnimateKpis(containerId) {
  if (typeof document === 'undefined') return;
  if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const root = document.getElementById(containerId); if (!root) return;
  root.querySelectorAll('.lx-val').forEach(el => {
    const raw = el.textContent || '';
    const m = raw.match(/^(\D*)([\d,]*\.?\d*)(.*)$/); if (!m) return;
    const target = parseFloat(m[2].replace(/,/g, '')); if (!isFinite(target) || target === 0) return;
    const pre = m[1], post = m[3], dur = 650, t0 = performance.now();
    const step = now => {
      const p = Math.min(1, (now - t0) / dur);
      const e = 1 - Math.pow(1 - p, 3);
      const v = Math.round(target * e);
      el.textContent = pre + v.toLocaleString('en-IN') + post;
      if (p < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  });
}
if (typeof window !== 'undefined') window.lxAnimateKpis = lxAnimateKpis;

export function renderSalesLedger() {
  const clientFilter = document.getElementById('slFilterClient');
  if (clientFilter) {
    // Rebuild every render so renamed clients show their current name (was
    // built once, so a rename left the old name stuck in the filter).
    const keep = clientFilter.value;
    clientFilter.innerHTML = '<option value="">All Clients</option>';
    state.clients.forEach(c => clientFilter.innerHTML += `<option value="${c.id}">${c.name}</option>`);
    clientFilter.value = keep;
  }
  const search = (document.getElementById('slSearch')?.value || '').toLowerCase();
  const cFilter = document.getElementById('slFilterClient')?.value || '';
  const sFilter = document.getElementById('slFilterStatus')?.value || '';
  const fromD = document.getElementById('slFromDate')?.value || '';
  const toD = document.getElementById('slToDate')?.value || '';

  let filtered = state.invoices.filter(inv => {
    const c = state.clients.find(x => x.id === inv.clientId);
    const matchSearch = !search || inv.invoiceNum?.toLowerCase().includes(search) || c?.name?.toLowerCase().includes(search) || String(inv.taxAmount).includes(search);
    const matchClient = !cFilter || inv.clientId === cFilter;
    const matchStatus = !sFilter || inv.status === sFilter || (!inv.status && sFilter === 'Active');
    const matchFrom = !fromD || inv.date >= fromD;
    const matchTo = !toD || inv.date <= toD;
    return matchSearch && matchClient && matchStatus && matchFrom && matchTo;
  });
  filtered.sort((a, b) => new Date(b.date) - new Date(a.date));

  const tbody = document.getElementById('slTableBody');
  tbody.innerHTML = '';
  let kpiTotal = 0, kpiReceived = 0;

  const sym = getCurrencySymbol();
  const nf = v => (Number(v) || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 });
  let rowsHtml = '';
  filtered.forEach((inv, i) => {
    const c = state.clients.find(x => x.id === inv.clientId);
    const received = state.paymentsIn.filter(p => p.invoiceId === inv.id).reduce((s, p) => s + parseFloat(p.amount), 0);
    const clientReceived = received || state.paymentsIn.filter(p => p.clientId === inv.clientId).reduce((s, p) => s + parseFloat(p.amount), 0);
    const outstanding = Math.max(0, (inv.taxAmount || 0) - clientReceived);
    const isCancelled = inv.status === 'Cancelled';
    kpiTotal += isCancelled ? 0 : (inv.taxAmount || 0);
    kpiReceived += isCancelled ? 0 : clientReceived;
    const pill = isCancelled ? '<span class="lx-pill cancel">Cancelled</span>'
      : outstanding <= 0 ? '<span class="lx-pill paid">Paid</span>'
      : '<span class="lx-pill pending">Pending</span>';
    const nm = c ? c.name : 'Unknown';
    rowsHtml += `<tr class="${isCancelled ? 'lx-cancelled' : ''}" style="animation-delay:${Math.min(i * 28, 320)}ms">
      <td><span class="doc-no">${inv.invoiceNum}</span></td>
      <td style="color:var(--lx-muted)">${lxFmtDate(inv.date)}</td>
      <td><span class="lx-party"><span class="lx-av" style="background:${lxAvatarColor(nm)}">${lxInitials(nm)}</span><span style="font-weight:650">${nm}</span></span></td>
      <td class="num">${sym}${nf(inv.subtotal)}</td>
      <td class="num" style="color:var(--lx-muted)">${sym}${nf((inv.taxAmount || 0) - (inv.subtotal || 0))}</td>
      <td class="num" style="font-weight:750">${sym}${nf(inv.taxAmount)}</td>
      <td class="num" style="color:var(--lx-good);font-weight:700">${sym}${nf(clientReceived)}</td>
      <td class="num" style="${outstanding > 0 ? 'color:var(--lx-bad);font-weight:800' : 'color:var(--lx-faint)'}">${sym}${nf(outstanding)}</td>
      <td style="text-align:center">${pill}</td>
      <td style="text-align:center"><div class="lx-act"><button onclick="viewInvoiceFromLedger('${inv.id}')" class="lx-btn view">View</button>${!isCancelled ? `<button onclick="cancelInvoiceFromLedger('${inv.id}')" class="lx-btn warn">Cancel</button>` : ''}<button onclick="deleteInvoiceFromLedger('${inv.id}')" class="lx-btn del">Del</button></div></td>
    </tr>`;
  });
  tbody.innerHTML = rowsHtml || `<tr><td colspan="10" style="padding:44px;text-align:center;color:var(--lx-faint);font-weight:600">No invoices match your filters.</td></tr>`;

  const outstandingTotal = Math.max(0, kpiTotal - kpiReceived);
  document.getElementById('slKpiTotal').textContent = sym + nf(kpiTotal);
  document.getElementById('slKpiReceived').textContent = sym + nf(kpiReceived);
  document.getElementById('slKpiOutstanding').textContent = sym + nf(outstandingTotal);
  document.getElementById('slKpiCount').textContent = filtered.length;
  const pct = kpiTotal > 0 ? Math.round(kpiReceived / kpiTotal * 100) : 0;
  const setSub = (id, t) => { const e = document.getElementById(id); if (e) e.textContent = t; };
  setSub('slKpiReceivedSub', pct + '% collected');
  setSub('slKpiOutstandingSub', (100 - pct) + '% pending');
  const foot = document.getElementById('slTableFoot');
  if (foot) foot.innerHTML = `<td colspan="5">Showing ${filtered.length} of ${state.invoices.length} invoices</td><td class="num">${sym}${nf(kpiTotal)}</td><td class="num" style="color:var(--lx-good)">${sym}${nf(kpiReceived)}</td><td class="num" style="color:var(--lx-bad)">${sym}${nf(outstandingTotal)}</td><td colspan="2"></td>`;
}

export function clearSalesLedgerFilters() {
  ['slSearch', 'slFilterClient', 'slFilterStatus', 'slFromDate', 'slToDate'].forEach(id => {
    const el = document.getElementById(id); if (el) el.value = '';
  });
  renderSalesLedger();
}

export function cancelInvoiceFromLedger(id) {
  const inv = state.invoices.find(x => x.id === id);
  if (!inv) return;
  if (!confirm(`Cancel Invoice ${inv.invoiceNum}? This is reversible.`)) return;
  inv.status = 'Cancelled';
  saveAllData(); renderSalesLedger();
  showToast(`Invoice ${inv.invoiceNum} Cancelled`, 'warning');
}

export function deleteInvoiceFromLedger(id) {
  const inv = state.invoices.find(x => x.id === id);
  if (!inv) return;
  if (!confirm(`Permanently DELETE Invoice ${inv.invoiceNum}? This CANNOT be undone.`)) return;
  if (inv.abstractIds) {
    inv.abstractIds.forEach(aId => {
      const abs = state.abstracts.find(a => a.id === aId);
      if (abs) { abs.isInvoiced = false; abs.linkedInvoice = null; }
    });
  }
  window.recycleDelete && window.recycleDelete('invoices', id, 'Tax Invoice');
  saveAllData(); renderSalesLedger();
  showToast('Invoice Deleted', 'error');
}

export function viewInvoiceFromLedger(id) {
  // Open the full Sale Invoice form prefilled — matches the new ledger Open flow.
  if (typeof window.openSaleInvoiceForm === 'function') {
    try { window.openSaleInvoiceForm(id); return; } catch (e) { console.warn('[ledger view]', e); }
  }
  // Fallback to the old behaviour if the form isn't loaded.
  window.switchView('billingView');
  showToast('Switched to Billing view. See Invoice History below.', 'success');
}
