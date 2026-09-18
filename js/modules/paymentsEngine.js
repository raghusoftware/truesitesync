/**
 * ═══════════════════════════════════════════════════════════
 * True Site Sync — Unified Payments engine (pure, tested)
 * ═══════════════════════════════════════════════════════════
 * One place that turns a single "Payment Out / Payment In" instruction into the
 * exact set of ledger records, and recomputes balances — so Petty Cash and the
 * Main Account always reconcile and every rupee is auditable.
 *
 * Design (double-entry-lite): every payment has ONE cash-out leg and ONE ledger
 * leg, linked by a shared `paymentId`.
 *
 *   Pay FROM main account → the party/expense record itself carries `accountId`
 *     (one record debits the account AND updates the party/head).
 *   Pay FROM petty cash   → a pettyCashTxns EXPENSE debits the custodian wallet
 *     (attributed to that custodian), and — for a party payment — a linked
 *     vendorPayment/labourPayment with `source:'petty'` and NO `accountId` so the
 *     party ledger updates but the main account is NOT debited again (the money
 *     already left main when it was transferred to the custodian).
 *
 * This module is DOM/state-free: `buildPaymentRecords` returns records for the
 * caller to append; the recompute helpers take a `state`-shaped object. All of it
 * is unit-tested in tests/paymentsEngine.test.js.
 */

const _num = (v) => { const n = parseFloat(v); return Number.isFinite(n) ? n : 0; };

/** A starter chart of expense heads → sub-heads (editable by the user). */
export const DEFAULT_EXPENSE_HEADS = [
  { head: 'Materials', subs: ['Cement', 'Steel', 'Aggregate', 'Bricks/Blocks', 'Other'] },
  { head: 'Labour', subs: ['Wages', 'Contractor', 'Advance'] },
  { head: 'Maintenance', subs: ['Fuel/Diesel', 'Repair', 'Spares', 'Service'] },
  { head: 'Equipment', subs: ['Rental', 'Hire charges'] },
  { head: 'Transport', subs: ['Freight', 'Cartage', 'Travel'] },
  { head: 'Site', subs: ['Food/Refreshments', 'Tools/Hardware', 'Consumables', 'Water/Power'] },
  { head: 'Statutory', subs: ['GST', 'PF', 'ESI', 'TDS', 'Fees'] },
  { head: 'Office', subs: ['Rent', 'Stationery', 'Utilities'] },
  { head: 'Miscellaneous', subs: [] },
];

/** Payee kinds a payment can go to (Payment Out). */
export const PAYEE_TYPES = ['vendor', 'labour', 'contractor', 'expense', 'equipment', 'owner', 'statutory', 'pettyTopup'];
/** Payer kinds money can come in from (Payment In). */
export const PAYER_TYPES = ['client', 'other', 'owner', 'loan', 'custodianReturn'];

const _id = (p) => `${p}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

/**
 * Build the ledger records for ONE Payment Out.
 * @returns {{paymentId:string, append:{vendorPayments:[],labourPayments:[],expenses:[],pettyCashTxns:[],accountTransfers:[]}}}
 */
export function buildPaymentOut(input) {
  const amount = _num(input.amount);
  const date = input.date || new Date().toISOString().split('T')[0];
  const projectId = input.projectId ?? null;
  const paymentId = input.paymentId || _id('pmt');
  const ref = input.ref || '';
  const src = input.source === 'petty' ? 'petty' : 'account';
  const out = { vendorPayments: [], labourPayments: [], expenses: [], pettyCashTxns: [], accountTransfers: [] };
  if (!(amount > 0)) return { paymentId, append: out };

  const base = { paymentId, date, amount, projectId, ref };

  // Petty-cash TOP-UP is just a main→custodian transfer (money leaves main here).
  if (input.payeeType === 'pettyTopup') {
    out.pettyCashTxns.push({
      id: _id('pct'), type: 'TRANSFER', custodianId: input.payeeId,
      fromAccountId: input.accountId, fromAccountName: input.accountName || '',
      status: 'accepted', note: ref, ...base,
    });
    return { paymentId, append: out };
  }

  // The cash-out leg.
  if (src === 'petty') {
    out.pettyCashTxns.push({
      id: _id('pcx'), type: 'EXPENSE', custodianId: input.custodianId,
      payeeType: input.payeeType, payeeId: input.payeeId || '',
      payeeName: input.payeeName || '', head: input.head || '', subHead: input.subHead || '',
      category: input.head || _payeeLabel(input), description: ref, ...base,
    });
  }

  // The ledger leg (party / expense head). When paid from petty, these carry
  // source:'petty' and NO accountId so the main account is not debited again.
  const acctFields = src === 'account'
    ? { accountId: input.accountId, accountName: input.accountName || '', source: 'account' }
    : { source: 'petty', custodianId: input.custodianId };

  switch (input.payeeType) {
    case 'vendor':
    case 'equipment': // equipment rental is paid to a vendor
      out.vendorPayments.push({ id: _id('vp'), vendorId: input.payeeId, ...acctFields, ...base });
      break;
    case 'labour':
      out.labourPayments.push({ id: _id('lpay'), labourId: input.payeeId, ...acctFields, ...base });
      break;
    case 'contractor':
      out.expenses.push({ id: _id('exp'), category: 'Piece-Rate Gang Payout', gangId: input.payeeId, head: 'Labour', subHead: 'Contractor', ...acctFields, ...base });
      break;
    case 'expense':
    case 'statutory':
    case 'owner':
      // A pure expense head. When paid from petty the pettyCashTxns EXPENSE above
      // IS the record — don't also create an `expenses` row (would double-count).
      if (src === 'account') {
        out.expenses.push({
          id: _id('exp'), category: input.head || 'Miscellaneous', head: input.head || 'Miscellaneous',
          subHead: input.subHead || '', party: input.payeeName || '', ...acctFields, ...base,
        });
      }
      break;
  }
  return { paymentId, append: out };
}

/** Build the ledger records for ONE Payment In. */
export function buildPaymentIn(input) {
  const amount = _num(input.amount);
  const date = input.date || new Date().toISOString().split('T')[0];
  const projectId = input.projectId ?? null;
  const paymentId = input.paymentId || _id('rcpt');
  const ref = input.ref || '';
  const out = { paymentsIn: [], otherIncome: [], pettyCashTxns: [] };
  if (!(amount > 0)) return { paymentId, append: out };
  const base = { paymentId, date, amount, projectId, ref };

  if (input.payerType === 'custodianReturn') {
    out.pettyCashTxns.push({
      id: _id('pcr'), type: 'RETURN', custodianId: input.payerId,
      toAccountId: input.accountId, toAccountName: input.accountName || '', note: ref, ...base,
    });
    return { paymentId, append: out };
  }
  if (input.payerType === 'other' || input.payerType === 'loan' || input.payerType === 'owner') {
    out.otherIncome.push({ id: _id('oi'), accountId: input.accountId, source: input.payerName || input.payerType, ...base });
    return { paymentId, append: out };
  }
  // client receipt
  out.paymentsIn.push({ id: _id('in'), clientId: input.payerId || '', accountId: input.accountId, ...base });
  return { paymentId, append: out };
}

function _payeeLabel(input) {
  return input.payeeName || (input.payeeType ? input.payeeType[0].toUpperCase() + input.payeeType.slice(1) : 'Payment');
}

/* ───────────────── Reconciliation (pure recompute, for audit & tests) ───────────────── */

const _accepted = (t) => t.status == null || t.status === 'accepted';

/** Main/bank/cash account balance = Σ credits − Σ debits tagged to this accountId. */
export function accountBalance(state, accId) {
  let bal = 0;
  (state.paymentsIn || []).forEach(p => { if (p.accountId === accId) bal += _num(p.amount); });
  (state.otherIncome || []).forEach(o => { if (o.accountId === accId) bal += _num(o.amount); });
  (state.accountTransfers || []).forEach(x => {
    if (x.toAccountId === accId) bal += _num(x.amount);
    if (x.fromAccountId === accId) bal -= _num(x.amount);
  });
  (state.pettyCashTxns || []).forEach(x => {
    if (x.type === 'TRANSFER' && x.fromAccountId === accId) bal -= _num(x.amount);
    if (x.type === 'RETURN' && x.toAccountId === accId) bal += _num(x.amount);
  });
  (state.expenses || []).forEach(e => { if (e.accountId === accId) bal -= _num(e.amount); });
  (state.vendorPayments || []).forEach(v => { if (v.accountId === accId) bal -= _num(v.amount); });
  (state.labourPayments || []).forEach(l => { if (l.accountId === accId) bal -= _num(l.amount); });
  (state.equipmentLogs || []).forEach(e => { if (e.accountId === accId) bal -= _num(e.amount); });
  return Math.round(bal * 100) / 100;
}

/** Custodian petty-cash wallet balance = Σ accepted transfers − expenses − returns. */
export function custodianBalance(state, custId) {
  let bal = 0;
  (state.pettyCashTxns || []).forEach(t => {
    if (t.custodianId !== custId) return;
    if (t.type === 'TRANSFER') bal += _accepted(t) ? _num(t.amount) : 0;
    else bal -= _num(t.amount); // EXPENSE and RETURN
  });
  return Math.round(bal * 100) / 100;
}

/** Vendor outstanding = Σ bills − Σ payments (from any source). */
export function vendorOutstanding(state, vendorId) {
  let bills = 0, paid = 0;
  (state.vendorMaterials || []).forEach(b => { if (b.vendorId === vendorId) bills += _num(b.totalAmount ?? b.amount); });
  (state.vendorPayments || []).forEach(p => { if (p.vendorId === vendorId) paid += _num(p.amount); });
  return Math.round((bills - paid) * 100) / 100;
}

/**
 * Total spend per expense head/sub-head, from BOTH account-sourced `expenses`
 * and petty-sourced `pettyCashTxns` EXPENSE rows that carry a head (pure
 * expenses only — party payments made from petty carry payeeId, not a head).
 */
export function expenseByHead(state) {
  const map = {};
  const add = (head, sub, amt) => {
    const h = head || 'Miscellaneous';
    map[h] = map[h] || { total: 0, subs: {} };
    map[h].total += amt;
    const s = sub || '—';
    map[h].subs[s] = (map[h].subs[s] || 0) + amt;
  };
  (state.expenses || []).forEach(e => add(e.head || e.category, e.subHead, _num(e.amount)));
  (state.pettyCashTxns || []).forEach(t => {
    if (t.type === 'EXPENSE' && t.head && !t.payeeId) add(t.head, t.subHead, _num(t.amount));
  });
  return map;
}
