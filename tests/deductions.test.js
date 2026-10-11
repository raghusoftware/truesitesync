import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeDeductions, validateDeductions, settledAmount, deductionTotal, computeDeductions,
  buildSettlementRemark, deductionRegister, deductionBalances, fyQuarter, tdsDueDate, registerName,
} from '../js/modules/deductions.js';
import { buildPaymentIn, buildPaymentOut, accountBalance, vendorOutstanding } from '../js/modules/paymentsEngine.js';

const ACC = 'acc_main';
function apply(state, append) { for (const k in append) state[k] = (state[k] || []).concat(append[k]); }

test('old payments without deductions: settled === amount', () => {
  assert.equal(settledAmount({ amount: 5000 }), 5000);
  assert.equal(settledAmount({ amount: '1200.5' }), 1200.5);
  assert.equal(deductionTotal({ amount: 10 }), 0);
});

test('normalize drops empty rows, fills label/nature/section, rounds', () => {
  const d = normalizeDeductions([
    { type: 'tds', rate: 2, amount: 2000.004 },
    { type: 'ld_penalty', amount: 3000, remark: ' delay in slab ' },
    { type: 'retention', amount: 0 },
  ]);
  assert.equal(d.length, 2);
  assert.deepEqual(d[0], { type: 'tds', label: 'TDS', nature: 'tax', amount: 2000, rate: 2, section: '393(1) / 194C' });
  assert.equal(d[1].nature, 'penalty');
  assert.equal(d[1].remark, 'delay in slab');
});

test('penalty / other require a remark', () => {
  assert.deepEqual(validateDeductions([{ type: 'tds', amount: 100 }]), []);
  assert.equal(validateDeductions([{ type: 'ld_penalty', amount: 100 }]).length, 1);
  assert.equal(validateDeductions([{ type: 'other', amount: 100, remark: 'x' }]).length, 0);
});

test('compute from GROSS: % rows on gross, cash = gross − Σ', () => {
  const r = computeDeductions({ anchor: 'gross', gross: 100000, rows: [
    { type: 'tds', rate: 2 }, { type: 'retention', rate: 2 }, { type: 'ld_penalty', amount: 3000 },
  ] });
  assert.equal(r.total, 7000);
  assert.equal(r.cash, 93000);
  assert.equal(r.gross, 100000);
});

test('compute from CASH: solves gross so that cash + Σ = gross', () => {
  const r = computeDeductions({ anchor: 'cash', cash: 93000, rows: [
    { type: 'tds', rate: 2 }, { type: 'retention', rate: 2 }, { type: 'ld_penalty', amount: 3000 },
  ] });
  assert.equal(r.gross, 100000);
  assert.equal(r.rows[0].amount, 2000);
  assert.equal(r.cash, 93000);
});

test('fixed flag overrides rate', () => {
  const r = computeDeductions({ anchor: 'gross', gross: 100000, rows: [{ type: 'tds', rate: 2, amount: 1500, fixed: true }] });
  assert.equal(r.rows[0].amount, 1500);
  assert.equal(r.cash, 98500);
});

test('settlement remark', () => {
  const s = buildSettlementRemark({ direction: 'in', cash: 98000, billRef: 'RA-3',
    deductions: [{ label: 'TDS', section: '194C', rate: 2, amount: 2000 }], fmt: n => 'Rs' + n });
  assert.equal(s, 'Received Rs98000 + TDS (194C @2%) Rs2000 = Rs100000 settled against RA-3');
  assert.equal(buildSettlementRemark({ cash: 5, deductions: [] }), '');
});

test('client receipt with TDS + penalty clears the full bill; bank gets only cash', () => {
  const s = { paymentsIn: [], otherIncome: [], pettyCashTxns: [] };
  apply(s, buildPaymentIn({ payerType: 'client', payerId: 'c1', accountId: ACC, amount: 95000,
    deductions: [{ type: 'tds', rate: 2, amount: 2000 }, { type: 'ld_penalty', amount: 3000, remark: 'delay' }] }).append);
  const p = s.paymentsIn[0];
  assert.equal(p.amount, 95000);
  assert.equal(settledAmount(p), 100000);
  assert.equal(p.settledAmount, 100000);
  assert.equal(accountBalance(s, ACC), 95000);
});

test('vendor payment with TDS clears the vendor bill fully', () => {
  const s = { vendorMaterials: [{ vendorId: 'v1', amount: 100000 }], vendorPayments: [], accountTransfers: [{ toAccountId: ACC, amount: 200000 }] };
  apply(s, buildPaymentOut({ payeeType: 'vendor', payeeId: 'v1', source: 'account', accountId: ACC, amount: 99000,
    deductions: [{ type: 'tds', rate: 1, amount: 1000 }] }).append);
  assert.equal(vendorOutstanding(s, 'v1'), 0);
  assert.equal(accountBalance(s, ACC), 101000);
});

test('bill fully cleared by a deduction with zero cash is allowed', () => {
  const { append } = buildPaymentIn({ payerType: 'client', payerId: 'c1', accountId: ACC, amount: 0,
    deductions: [{ type: 'ld_penalty', amount: 5000, remark: 'full LD' }] });
  assert.equal(append.paymentsIn.length, 1);
  assert.equal(settledAmount(append.paymentsIn[0]), 5000);
  // and nothing at all when both are zero
  assert.equal(buildPaymentIn({ payerType: 'client', amount: 0 }).append.paymentsIn.length, 0);
});

test('petty-sourced vendor payment with deductions: cash leg = cash only', () => {
  const { append } = buildPaymentOut({ payeeType: 'vendor', payeeId: 'v1', source: 'petty', custodianId: 'k1', amount: 9900,
    deductions: [{ type: 'tds', amount: 100 }] });
  assert.equal(append.pettyCashTxns[0].amount, 9900);
  assert.equal(settledAmount(append.vendorPayments[0]), 10000);
});

test('register + balances: TDS deposit and retention release settle their registers', () => {
  const s = {
    clients: [{ id: 'c1', name: 'ABC Infra' }], vendors: [{ id: 'v1', name: 'Steel Co' }],
    paymentsIn: [{ id: 'p1', clientId: 'c1', date: '2026-10-05', amount: 96000, deductions: normalizeDeductions([{ type: 'tds', amount: 2000 }, { type: 'retention', amount: 2000 }]) }],
    vendorPayments: [{ id: 'p2', vendorId: 'v1', date: '2026-10-06', amount: 49500, deductions: normalizeDeductions([{ type: 'tds', amount: 500 }]) }],
    otherIncome: [{ id: 'o1', amount: 2000, settlesDeduction: 'retention', date: '2027-02-01' }],
    expenses: [{ id: 'e1', amount: 500, settlesDeduction: 'tds', date: '2026-11-07' }],
  };
  const reg = deductionRegister(s);
  assert.equal(reg.length, 3);
  assert.equal(reg[0].partyName, 'Steel Co');
  assert.equal(reg.find(r => r.type === 'tds' && r.direction === 'in').register, 'TDS Receivable');
  const bal = deductionBalances(s);
  const get = (d, t) => bal.find(b => b.direction === d && b.type === t);
  assert.equal(get('in', 'tds').balance, 2000);
  assert.equal(get('in', 'retention').balance, 0);
  assert.equal(get('out', 'tds').balance, 0);
  assert.equal(deductionRegister(s, { direction: 'out' }).length, 1);
});

test('FY quarter, TDS due date, register names', () => {
  assert.equal(fyQuarter('2026-10-11'), 'FY 2026-27 Q3');
  assert.equal(fyQuarter('2027-02-01'), 'FY 2026-27 Q4');
  assert.equal(fyQuarter('2026-04-01'), 'FY 2026-27 Q1');
  assert.equal(tdsDueDate('2026-10-11'), '2026-11-07');
  assert.equal(tdsDueDate('2026-12-31'), '2027-01-07');
  assert.equal(tdsDueDate('2027-03-15'), '2027-04-30');
  assert.equal(registerName('penalty', 'in', 'LD'), 'Penalty suffered (expense)');
  assert.equal(registerName('tax', 'out', 'TDS'), 'TDS Payable');
});
