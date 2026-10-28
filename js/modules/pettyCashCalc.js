/**
 * pettyCashCalc.js — pure petty-cash ledger rules (no DOM, unit-tested).
 *
 *   txnEffect(t)                 → what one txn does to the custodian's usable wallet
 *   walletStats(txns, custId)    → issued / confirmed / pending / spent / returned / balance
 *   ownerSummary(txns, custIds)  → "Funds Given" vs "Funds Reconciled" across custodians
 *   runningBalances(txns)        → txn id → wallet balance right after that txn
 *   afterSpend(balance, amount)  → live "balance after this expense" preview
 *
 * Txn types: TRANSFER (owner → custodian; counts only once accepted),
 * EXPENSE (custodian spends), RETURN (custodian hands unspent cash back).
 */

const _n = (v) => { const x = Number(v); return Number.isFinite(x) ? x : 0; };
const _r2 = (v) => Math.round(_n(v) * 100) / 100;

/** A transfer with no status is a legacy record (before acceptance existed) → already accepted. */
export const isAccepted = (t) => t.status == null || t.status === 'accepted';

/** Effect of a txn on the custodian's usable balance. Pending / disputed transfers don't count yet. */
export function txnEffect(t) {
  if (!t) return 0;
  if (t.type === 'TRANSFER') return isAccepted(t) ? _n(t.amount) : 0;
  return -_n(t.amount);   // EXPENSE and RETURN both reduce the wallet
}

/** Oldest first: by date, then creation time (same order the money actually moved). */
export function chronological(txns) {
  return (txns || []).slice().sort((a, b) =>
    String(a.date || '').localeCompare(String(b.date || '')) || _n(a.createdAt) - _n(b.createdAt));
}

export function walletStats(txns, custId) {
  const s = { issued: 0, confirmed: 0, pending: 0, disputed: 0, spent: 0, returned: 0, balance: 0, count: 0 };
  (txns || []).forEach(t => {
    if (t.custodianId !== custId) return;
    const a = _n(t.amount);
    s.count++;
    if (t.type === 'TRANSFER') {
      s.issued += a;
      if (isAccepted(t)) s.confirmed += a;
      else if (t.status === 'pending') s.pending += a;
      else if (t.status === 'disputed') s.disputed += a;
    } else if (t.type === 'EXPENSE') s.spent += a;
    else if (t.type === 'RETURN') s.returned += a;
  });
  s.reconciled = s.spent + s.returned;          // money the custodian has accounted for
  s.balance = s.confirmed - s.reconciled;       // cash still in their hand
  Object.keys(s).forEach(k => { if (k !== 'count') s[k] = _r2(s[k]); });
  return s;
}

/** Owner's high-level view: funds given vs funds reconciled, summed over custodians. */
export function ownerSummary(txns, custIds) {
  const tot = { given: 0, confirmed: 0, pending: 0, disputed: 0, reconciled: 0, inField: 0 };
  (custIds || []).forEach(id => {
    const s = walletStats(txns, id);
    tot.given += s.issued; tot.confirmed += s.confirmed; tot.pending += s.pending;
    tot.disputed += s.disputed; tot.reconciled += s.reconciled; tot.inField += s.balance;
  });
  Object.keys(tot).forEach(k => { tot[k] = _r2(tot[k]); });
  // Share of the cash that actually reached the field that is already accounted for.
  tot.pct = tot.confirmed > 0 ? Math.max(0, Math.min(100, Math.round(tot.reconciled / tot.confirmed * 100))) : 0;
  return tot;
}

/** txn id → custodian wallet balance right after that txn (per custodian, chronological). */
export function runningBalances(txns) {
  const bal = {}, out = {};
  chronological(txns).forEach(t => {
    const k = t.custodianId || '';
    bal[k] = _r2((bal[k] || 0) + txnEffect(t));
    out[t.id] = bal[k];
  });
  return out;
}

/** Live preview while the custodian types an expense amount. */
export function afterSpend(balance, amount) {
  const a = _n(amount);
  const after = _r2(_n(balance) - (a > 0 ? a : 0));
  return { after, short: after < 0 ? _r2(-after) : 0, ok: a > 0 };
}
