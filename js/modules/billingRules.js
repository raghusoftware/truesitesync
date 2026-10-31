/**
 * billingRules.js — Billing & Compliance Rules (no DOM, unit-tested).
 *
 * A client carries default rules; a project can override any of them (blank = use the client's):
 *   paymentTermsDays      credit days → due date → cash-flow forecast
 *   defaultTdsRate        % TDS the client deducts (s.194C / 393) → TDS receivable (tax credit)
 *   defaultRetentionRate  % retention the client withholds → Retention receivable (locked cash)
 *
 * Bill maths, in this order:
 *   1. taxable  = work value (after discount)
 *   2. + GST / tax on the taxable value (and TCS, round-off)   → invoice total (gross)
 *   3. − TDS       = taxable × TDS %          (on the value excluding GST)
 *   4. − Retention = taxable × Retention %    (on the work value)
 *   5. = Net receivable — the cash the client actually pays now
 * TDS and retention are not discounts: the invoice total is still billed in full. When the client
 * pays, the receipt carries the TDS and retention as deductions, which clear the client's ledger
 * and park each amount in its own register (TDS receivable / Retention receivable).
 *
 *   rulesFor(S, {projectId, clientId})  → effective rules + where each came from
 *   applyDeductions(o)                  → { taxable, tax, gross, tds, retention, net, … }
 *   clientFinance(S, clientId)          → Total billed / received / retention withheld / TDS deducted
 *   lockedRetention(S)                  → retention held across all clients (not in the 30-day forecast)
 *   nextRetentionBillNo(S)              → RRB-1, RRB-2 …
 */

const N = v => { const x = parseFloat(v); return Number.isFinite(x) ? x : 0; };
const r2 = v => Math.round(N(v) * 100) / 100;
const has = v => v != null && v !== '';

export const TDS_PRESETS = [0, 1, 2];
export const RETENTION_PRESETS = [0, 5, 10];

const live = d => !!d && !d.deleted && !/cancel|void|draft/i.test(String(d.status || ''));

/** Effective rules for a bill: the project's value when set, else the client's, else none. */
export function rulesFor(S, { projectId = '', clientId = '' } = {}) {
  const p = (S.projects || []).find(x => x.id === projectId) || null;
  const c = (S.clients || []).find(x => x.id === (clientId || p?.clientId)) || null;
  const pick = (pk, ck = pk) => (p && has(p[pk]) ? { v: N(p[pk]), src: 'project' } : c && has(c[ck]) ? { v: N(c[ck]), src: 'client' } : { v: null, src: '' });
  const terms = pick('paymentTermsDays'), tds = pick('defaultTdsRate'), ret = pick('defaultRetentionRate');
  return {
    termsDays: terms.v, tdsPct: tds.v ?? 0, retentionPct: ret.v ?? 0,
    source: { terms: terms.src, tds: tds.src, retention: ret.src },
    clientId: c?.id || '', projectId: p?.id || '',
  };
}

/** GST → TDS → Retention → Net, rounded to paise. */
export function applyDeductions({ taxable = 0, tax = 0, tcs = 0, roundOff = 0, tdsPct = 0, retentionPct = 0 } = {}) {
  const base = r2(taxable);
  const gross = r2(base + N(tax) + N(tcs) + N(roundOff));
  const tds = r2(base * N(tdsPct) / 100);
  const retention = r2(base * N(retentionPct) / 100);
  return { taxable: base, tax: r2(tax), gross, tdsPct: N(tdsPct), tds, retentionPct: N(retentionPct), retention, deductions: r2(tds + retention), net: r2(gross - tds - retention) };
}

const isTds = d => /tds/i.test(String(d.type || '')) || (d.nature === 'tax' && /tds/i.test(String(d.label || '')));
const isHeld = d => d.nature === 'held' || d.type === 'retention' || d.type === 'security_deposit';
const cashOf = p => N(p.amount);
const docOf = p => p.againstBillId || p.invoiceId || '';

/**
 * The client's money picture.
 *   billed            invoices raised (sale invoices, RA tax invoices, un-invoiced abstracts) — excl. retention release bills
 *   received          cash actually received
 *   tds               TDS the client deducted on receipts (claimable tax credit)
 *   retentionHeld     retention / security deposit withheld on receipts, net of release bills raised
 *   retentionClaimed  release bills raised and not yet paid
 *   retentionDue      retention still to be withheld on unpaid invoices (expected, from the bill's rule)
 *   outstanding       ledger balance (what the client still owes, before retention)
 */
export function clientFinance(S, clientId) {
  const mine = k => (S[k] || []).filter(x => x.clientId === clientId);
  const sale = mine('saleInvoices').filter(live);
  const ra = mine('invoices').filter(i => i.status !== 'Cancelled');
  const abs = mine('abstracts').filter(a => a.status !== 'invoiced');
  const rrb = mine('retentionBills').filter(live);
  const pays = mine('paymentsIn');
  const billed = r2(sale.reduce((s, i) => s + N(i.total), 0) + ra.reduce((s, i) => s + N(i.taxAmount), 0) + abs.reduce((s, a) => s + N(a.totalAmount), 0));
  const received = r2(pays.reduce((s, p) => s + cashOf(p), 0));
  let tds = 0, held = 0;
  const dedByDoc = {};
  pays.forEach(p => (p.deductions || []).forEach(d => {
    if (isTds(d)) tds += N(d.amount);
    if (isHeld(d)) { held += N(d.amount); if (docOf(p)) dedByDoc[docOf(p)] = (dedByDoc[docOf(p)] || 0) + N(d.amount); }
  }));
  const raised = rrb.reduce((s, b) => s + N(b.amount), 0);
  const rrbPaid = rrb.reduce((s, b) => s + pays.filter(p => docOf(p) === b.id).reduce((t, p) => t + cashOf(p), 0), 0);
  const retentionDue = r2(sale.concat(ra).reduce((s, i) => s + Math.max(0, N(i.retentionAmt) - (dedByDoc[i.id] || 0)), 0));
  const settled = pays.reduce((s, p) => s + cashOf(p) + (p.deductions || []).reduce((t, d) => t + N(d.amount), 0), 0);
  return {
    billed, received, tds: r2(tds),
    retentionWithheld: r2(held), retentionHeld: r2(Math.max(0, held - raised)), retentionClaimed: r2(Math.max(0, raised - rrbPaid)), retentionReleased: r2(rrbPaid),
    retentionDue, outstanding: r2(billed + raised - settled),
    bills: sale.length + ra.length, releaseBills: rrb,
  };
}

/** Retention sitting with clients (withheld, not yet claimed) + what open bills will still withhold. */
export function lockedRetention(S) {
  let held = 0, due = 0, claimed = 0; const byClient = [];
  (S.clients || []).forEach(c => {
    const f = clientFinance(S, c.id);
    if (f.retentionHeld + f.retentionDue + f.retentionClaimed <= 0) return;
    held += f.retentionHeld; due += f.retentionDue; claimed += f.retentionClaimed;
    byClient.push({ clientId: c.id, name: c.name || 'Client', held: f.retentionHeld, due: f.retentionDue, claimed: f.retentionClaimed });
  });
  return { held: r2(held), due: r2(due), claimed: r2(claimed), total: r2(held + due), byClient: byClient.sort((a, b) => (b.held + b.due) - (a.held + a.due)) };
}

export function nextRetentionBillNo(S) {
  const n = (S.retentionBills || []).reduce((m, b) => Math.max(m, parseInt(String(b.billNo || '').replace(/\D/g, ''), 10) || 0), 0);
  return 'RRB-' + (n + 1);
}

/** Share of an invoice's open amount that is cash (the rest is TDS + retention kept by the client). */
export function cashShare(inv) {
  const total = N(inv.total) || N(inv.totalAmount);
  const ded = N(inv.tdsAmt) + N(inv.retentionAmt);
  if (!(total > 0) || !(ded > 0)) return { cash: 1, retention: 0 };
  return { cash: Math.max(0, (total - ded) / total), retention: N(inv.retentionAmt) / total };
}
