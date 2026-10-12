/**
 * ═══════════════════════════════════════════════════════════
 * True Site Sync — Payment Deductions engine (pure, tested)
 * ═══════════════════════════════════════════════════════════
 * A payment (in or out) records the CASH that moved in `amount`, plus an
 * optional list of `deductions` (TDS, GST-TDS, retention, penalty, recovery…).
 *
 *   Bill amount settled = cash + Σ deductions
 *
 * Party ledgers are cleared by the settled amount; bank / petty balances keep
 * using `amount` (cash) so existing balances never change. Each deduction lands
 * in its own register (TDS Receivable/Payable, Retention, Penalties…).
 *
 * Old payments have no `deductions` → settled === amount (no migration needed).
 * DOM/state-free; unit-tested in tests/deductions.test.js.
 */

const _num = (v) => { const n = parseFloat(v); return Number.isFinite(n) ? n : 0; };
const _r2 = (n) => Math.round(n * 100) / 100;

/** What a deduction IS decides where it goes (see registerName). */
export const DEDUCTION_NATURES = {
  tax: 'Tax',
  held: 'Held / refundable',
  penalty: 'Penalty',
  recovery: 'Recovery',
  other: 'Other',
};

/** Starter list (editable in Settings via state.deductionTypes). */
export const DEFAULT_DEDUCTION_TYPES = [
  { key: 'tds', label: 'TDS', nature: 'tax', rate: 2, section: '393(1) / 194C' },
  { key: 'gst_tds', label: 'GST-TDS', nature: 'tax', rate: 2, section: 'CGST s.51' },
  { key: 'labour_cess', label: 'Labour cess (BOCW)', nature: 'tax', rate: 1, section: '' },
  { key: 'retention', label: 'Retention', nature: 'held', rate: 5 },
  { key: 'security_deposit', label: 'Security deposit', nature: 'held' },
  { key: 'ld_penalty', label: 'LD / Delay penalty', nature: 'penalty', remarkRequired: true },
  { key: 'quality_penalty', label: 'Quality / short-work penalty', nature: 'penalty', remarkRequired: true },
  { key: 'advance_recovery', label: 'Advance recovery', nature: 'recovery' },
  { key: 'material_recovery', label: 'Material recovery', nature: 'recovery' },
  { key: 'other', label: 'Other deduction', nature: 'other', remarkRequired: true },
];

/** The active deduction types for this company (user edits override defaults). */
export function deductionTypes(state) {
  const list = state && Array.isArray(state.deductionTypes) && state.deductionTypes.length
    ? state.deductionTypes : DEFAULT_DEDUCTION_TYPES;
  return list.filter(t => !t.disabled);
}

export function findType(state, key) {
  return deductionTypes(state).find(t => t.key === key)
    || DEFAULT_DEDUCTION_TYPES.find(t => t.key === key)
    || { key: key || 'other', label: 'Deduction', nature: 'other' };
}

/**
 * Clean a raw list of deduction rows into the stored shape. Drops empty rows,
 * fills label/nature from the type, rounds to paise.
 */
export function normalizeDeductions(rows, state) {
  if (!Array.isArray(rows)) return [];
  return rows.map(r => {
    const t = findType(state, r.type);
    const amount = _r2(_num(r.amount));
    const out = { type: t.key, label: r.label || t.label, nature: t.nature, amount };
    const rate = _num(r.rate);
    if (rate > 0) out.rate = rate;
    const section = r.section != null && r.section !== '' ? String(r.section) : (t.nature === 'tax' ? (t.section || '') : '');
    if (section) out.section = section;
    if (r.remark) out.remark = String(r.remark).trim();
    return out;
  }).filter(d => d.amount > 0);
}

/** Validation errors for a deduction list (e.g. penalty without a remark). */
export function validateDeductions(rows, state) {
  const errs = [];
  (rows || []).forEach(r => {
    if (!(_num(r.amount) > 0)) return;
    const t = findType(state, r.type);
    if (t.remarkRequired && !String(r.remark || '').trim()) errs.push(`Add a remark for "${t.label}"`);
  });
  return errs;
}

export function deductionTotal(rec) {
  return _r2((rec && Array.isArray(rec.deductions) ? rec.deductions : []).reduce((s, d) => s + _num(d.amount), 0));
}

/** The amount that clears the party's ledger: cash + all deductions. */
export function settledAmount(rec) {
  return _r2(_num(rec && rec.amount) + deductionTotal(rec));
}

/**
 * Solve gross / cash / per-row amounts.
 *  - rows with a `rate` (and no `fixed` flag) are % of gross;
 *  - rows without a rate are fixed ₹ amounts.
 *  anchor 'gross': gross is given → amounts → cash = gross − Σ.
 *  anchor 'cash' : cash is given → gross = (cash + Σfixed) / (1 − Σrate%).
 */
export function computeDeductions({ anchor = 'gross', gross = 0, cash = 0, rows = [], base = 0 } = {}) {
  // With a separate `base` (e.g. pre-GST work value of an RA bill) % rows are
  // a fixed share of that base, independent of the gross.
  if (_num(base) > 0) {
    rows = rows.map(r => (_num(r.rate) > 0 && !r.fixed) ? { ...r, amount: _r2(_num(base) * _num(r.rate) / 100), fixed: true, _fromBase: true } : r);
  }
  const isRate = (r) => _num(r.rate) > 0 && !r.fixed;
  let g;
  if (anchor === 'cash') {
    const fixed = rows.filter(r => !isRate(r)).reduce((s, r) => s + _num(r.amount), 0);
    const pct = rows.filter(isRate).reduce((s, r) => s + _num(r.rate), 0) / 100;
    g = pct < 1 ? (_num(cash) + fixed) / (1 - pct) : _num(cash) + fixed;
  } else {
    g = _num(gross);
  }
  const outRows = rows.map(r => {
    const o = isRate(r) ? { ...r, amount: _r2(g * _num(r.rate) / 100) } : { ...r, amount: _r2(_num(r.amount)) };
    if (o._fromBase) { delete o._fromBase; delete o.fixed; }
    return o;
  });
  const total = _r2(outRows.reduce((s, r) => s + r.amount, 0));
  g = _r2(g);
  const c = anchor === 'cash' ? _r2(_num(cash)) : _r2(g - total);
  return { gross: anchor === 'cash' ? _r2(c + total) : g, cash: c, total, rows: outRows };
}

/** Where a deduction is booked, from the point of view of the user's company. */
export function registerName(nature, direction, label) {
  const inward = direction === 'in';
  switch (nature) {
    case 'tax': return `${label} ${inward ? 'Receivable' : 'Payable'}`;
    case 'held': return `${label} ${inward ? 'Receivable (held by client)' : 'Payable (held by us)'}`;
    case 'penalty': return inward ? 'Penalty suffered (expense)' : 'Penalty levied (income)';
    case 'recovery': return inward ? 'Advance / material adjusted' : 'Advance / material recovered';
    default: return inward ? 'Other deductions suffered' : 'Other deductions levied';
  }
}

/** Human remark: "Received ₹93,000 + TDS ₹2,000 + … = ₹1,00,000 settled against RA-3". */
export function buildSettlementRemark({ direction = 'in', cash = 0, deductions = [], billRef = '', fmt } = {}) {
  const f = typeof fmt === 'function' ? fmt : (n) => '₹' + Math.round(_num(n)).toLocaleString('en-IN');
  const ds = (deductions || []).filter(d => _num(d.amount) > 0);
  if (!ds.length) return '';
  const parts = ds.map(d => {
    const tag = [d.section, d.rate ? `@${d.rate}%` : ''].filter(Boolean).join(' ');
    return `${d.label}${tag ? ' (' + tag + ')' : ''} ${f(d.amount)}${d.remark ? ' – ' + d.remark : ''}`;
  });
  const total = _num(cash) + ds.reduce((s, d) => s + _num(d.amount), 0);
  return `${direction === 'in' ? 'Received' : 'Paid'} ${f(cash)} + ${parts.join(' + ')} = ${f(total)} settled${billRef ? ' against ' + billRef : ''}`;
}

/* ───────────── Registers (for reports & the CA export) ───────────── */

/** Payment collections that can carry deductions, with direction & party resolver. */
const SOURCES = [
  { key: 'paymentsIn', dir: 'in', party: (s, p) => ['Client', _nm(s.clients, p.clientId)] },
  { key: 'vendorPayments', dir: 'out', party: (s, p) => ['Vendor', _nm(s.vendors, p.vendorId)] },
  { key: 'labourPayments', dir: 'out', party: (s, p) => ['Labour', _nm(s.labourMaster, p.labourId)] },
  { key: 'expenses', dir: 'out', party: (s, p) => [p.gangId ? 'Contractor' : 'Expense', p.gangId ? _nm(s.labourContractors, p.gangId) : (p.party || p.head || p.category || '')] },
];
function _nm(list, id) { return ((list || []).find(x => x.id === id) || {}).name || ''; }

/** Flat list of every deduction across all payments, newest first. */
export function deductionRegister(state, { from = '', to = '', projectId = null, direction = '', type = '', clientId = '' } = {}) {
  const rows = [];
  SOURCES.forEach(src => {
    (state[src.key] || []).forEach(p => {
      if (!Array.isArray(p.deductions) || !p.deductions.length) return;
      if (from && (p.date || '') < from) return;
      if (to && (p.date || '') > to) return;
      if (projectId && p.projectId && p.projectId !== projectId) return;
      if (direction && direction !== src.dir) return;
      if (clientId && p.clientId !== clientId) return;
      const [partyType, partyName] = src.party(state, p);
      p.deductions.forEach(d => {
        if (type && d.type !== type) return;
        rows.push({
          date: p.date || '', direction: src.dir, partyType, partyName,
          ref: p.receiptNo || p.ref || '', billRef: p.againstBillRef || '',
          type: d.type, label: d.label, nature: d.nature, section: d.section || '', rate: d.rate || 0,
          amount: _num(d.amount), remark: d.remark || '',
          cash: _num(p.amount), settled: settledAmount(p),
          register: registerName(d.nature, src.dir, d.label),
          src: src.key, paymentId: p.id, projectId: p.projectId || null,
          deposited: !!d.deposited, matched26AS: !!d.matched26AS,
        });
      });
    });
  });
  rows.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  return rows;
}

/**
 * Balance per register = Σ deducted − Σ settled. Settling records are payments
 * flagged `settlesDeduction: <typeKey>` (retention release in, TDS deposit out).
 */
export function deductionBalances(state, opts = {}) {
  const map = {};
  deductionRegister(state, opts).forEach(r => {
    const k = r.direction + ':' + r.type;
    map[k] = map[k] || { direction: r.direction, type: r.type, label: r.label, nature: r.nature, register: r.register, deducted: 0, settled: 0 };
    map[k].deducted += r.amount;
  });
  const settle = (dir, p) => {
    if (opts.clientId && p.clientId !== opts.clientId) return;
    if ((opts.from && (p.date || '') < opts.from) || (opts.to && (p.date || '') > opts.to)) return;
    const k = dir + ':' + p.settlesDeduction;
    if (!map[k]) {
      const t = findType(state, p.settlesDeduction);
      map[k] = { direction: dir, type: t.key, label: t.label, nature: t.nature, register: registerName(t.nature, dir, t.label), deducted: 0, settled: 0 };
    }
    map[k].settled += _num(p.amount);
  };
  (state.otherIncome || []).forEach(p => { if (p.settlesDeduction) settle('in', p); });
  (state.expenses || []).forEach(p => { if (p.settlesDeduction) settle('out', p); });
  return Object.values(map).map(m => ({ ...m, deducted: _r2(m.deducted), settled: _r2(m.settled), balance: _r2(m.deducted - m.settled) }));
}

/** Indian financial-year quarter label for a yyyy-mm-dd date, e.g. "FY 2026-27 Q3". */
export function fyQuarter(date) {
  const d = String(date || '');
  const y = parseInt(d.slice(0, 4), 10), m = parseInt(d.slice(5, 7), 10);
  if (!y || !m) return '';
  const fyStart = m >= 4 ? y : y - 1;
  const q = m >= 4 && m <= 6 ? 1 : m >= 7 && m <= 9 ? 2 : m >= 10 ? 3 : 4;
  return `FY ${fyStart}-${String((fyStart + 1) % 100).padStart(2, '0')} Q${q}`;
}

/** TDS deposit due date for a deduction made on `date`: 7th of next month (30 Apr for March). */
export function tdsDueDate(date) {
  const d = String(date || '');
  const y = parseInt(d.slice(0, 4), 10), m = parseInt(d.slice(5, 7), 10);
  if (!y || !m) return '';
  if (m === 3) return `${y}-04-30`;
  const ny = m === 12 ? y + 1 : y, nm = m === 12 ? 1 : m + 1;
  return `${ny}-${String(nm).padStart(2, '0')}-07`;
}

/** Short ledger note: " — cash ₹95,000 + TDS ₹2,000 + LD / Delay penalty ₹3,000 (delay)". '' when none. */
export function deductionNote(rec, fmt) {
  if (!(deductionTotal(rec) > 0)) return '';
  const f = typeof fmt === 'function' ? fmt : (n) => '₹' + (Math.round(_num(n) * 100) / 100).toLocaleString('en-IN');
  return ' — cash ' + f(rec.amount) + rec.deductions.map(d => ` + ${d.label} ${f(d.amount)}${d.remark ? ' (' + d.remark + ')' : ''}`).join('');
}

/**
 * Mark the oldest not-yet-deposited deductions of `type` (payments OUT) as
 * deposited under `challanNo`, up to `amount`. Mutates the payment records.
 * Returns how much was matched.
 */
export function markDeposited(state, type, amount, challanNo = '', date = '') {
  const cands = [];
  ['vendorPayments', 'labourPayments', 'expenses'].forEach(k => (state[k] || []).forEach(p => {
    (p.deductions || []).forEach(d => { if (d.type === type && !d.deposited) cands.push({ p, d }); });
  }));
  cands.sort((a, b) => String(a.p.date || '').localeCompare(String(b.p.date || '')));
  let left = _num(amount), matched = 0;
  for (const { d } of cands) {
    if (_num(d.amount) > left + 0.005) break;
    d.deposited = true; if (challanNo) d.challanNo = challanNo; if (date) d.depositDate = date;
    left -= _num(d.amount); matched += _num(d.amount);
  }
  return _r2(matched);
}
