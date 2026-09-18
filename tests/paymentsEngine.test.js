import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildPaymentOut, buildPaymentIn,
  accountBalance, custodianBalance, vendorOutstanding, expenseByHead,
} from '../js/modules/paymentsEngine.js';

// Minimal state; apply() merges a build result's records into it.
function freshState() {
  return {
    paymentsIn: [], otherIncome: [], expenses: [], vendorPayments: [], labourPayments: [],
    equipmentLogs: [], accountTransfers: [], pettyCashTxns: [], vendorMaterials: [],
  };
}
function apply(state, append) {
  for (const k in append) { state[k] = (state[k] || []).concat(append[k]); }
}

const ACC = 'acc_main';
const CUST = 'cust_ramesh';
const VEN = 'ven_steel';

// A vendor with a 10,000 bill outstanding.
function stateWithBill() {
  const s = freshState();
  s.vendorMaterials.push({ id: 'b1', vendorId: VEN, amount: 10000 });
  return s;
}

test('vendor paid from MAIN account: main −, vendor −, wallet untouched', () => {
  const s = stateWithBill();
  s.accountTransfers.push({ fromAccountId: 'seed', toAccountId: ACC, amount: 50000 }); // seed 50k into main
  apply(s, buildPaymentOut({ payeeType: 'vendor', payeeId: VEN, source: 'account', accountId: ACC, amount: 4000 }).append);
  assert.equal(accountBalance(s, ACC), 46000);      // 50000 − 4000
  assert.equal(vendorOutstanding(s, VEN), 6000);    // 10000 − 4000
  assert.equal(custodianBalance(s, CUST), 0);       // untouched
});

test('petty TOP-UP then vendor paid from PETTY: main debited ONCE (top-up only), no double count', () => {
  const s = stateWithBill();
  s.accountTransfers.push({ fromAccountId: 'seed', toAccountId: ACC, amount: 50000 });
  // 1) Top up custodian with 8,000 from main
  apply(s, buildPaymentOut({ payeeType: 'pettyTopup', payeeId: CUST, accountId: ACC, amount: 8000 }).append);
  // 2) Custodian pays vendor 4,000 from petty cash
  apply(s, buildPaymentOut({ payeeType: 'vendor', payeeId: VEN, source: 'petty', custodianId: CUST, amount: 4000 }).append);

  assert.equal(accountBalance(s, ACC), 42000);      // 50000 − 8000 top-up ONLY (vendor pay did NOT touch main)
  assert.equal(custodianBalance(s, CUST), 4000);    // 8000 in − 4000 spent
  assert.equal(vendorOutstanding(s, VEN), 6000);    // 10000 − 4000 (counted once)
});

test('petty vendor payment is attributed to the custodian', () => {
  const s = stateWithBill();
  const r = buildPaymentOut({ payeeType: 'vendor', payeeId: VEN, payeeName: 'Steel Co', source: 'petty', custodianId: CUST, amount: 4000 });
  apply(s, r.append);
  const pcx = s.pettyCashTxns.find(t => t.type === 'EXPENSE');
  assert.equal(pcx.custodianId, CUST);
  assert.equal(pcx.payeeType, 'vendor');
  assert.equal(pcx.payeeId, VEN);
  // both legs share the paymentId
  assert.equal(s.vendorPayments[0].paymentId, r.paymentId);
  assert.equal(pcx.paymentId, r.paymentId);
  assert.equal(s.vendorPayments[0].accountId, undefined); // no account debit
});

test('diesel from PETTY → booked to Maintenance/Fuel, wallet −, main untouched', () => {
  const s = freshState();
  s.accountTransfers.push({ fromAccountId: 'seed', toAccountId: ACC, amount: 20000 });
  apply(s, buildPaymentOut({ payeeType: 'pettyTopup', payeeId: CUST, accountId: ACC, amount: 5000 }).append);
  apply(s, buildPaymentOut({ payeeType: 'expense', head: 'Maintenance', subHead: 'Fuel/Diesel', source: 'petty', custodianId: CUST, amount: 1500 }).append);

  assert.equal(accountBalance(s, ACC), 15000);     // 20000 − 5000 top-up only
  assert.equal(custodianBalance(s, CUST), 3500);   // 5000 − 1500
  const byHead = expenseByHead(s);
  assert.equal(byHead['Maintenance'].total, 1500);
  assert.equal(byHead['Maintenance'].subs['Fuel/Diesel'], 1500);
  // exactly one expense leg exists (no double count)
  assert.equal(s.expenses.length, 0);                              // not stored as account expense
  assert.equal(s.pettyCashTxns.filter(t => t.type === 'EXPENSE').length, 1);
});

test('diesel from MAIN → main −, booked to Maintenance/Fuel once', () => {
  const s = freshState();
  s.accountTransfers.push({ fromAccountId: 'seed', toAccountId: ACC, amount: 20000 });
  apply(s, buildPaymentOut({ payeeType: 'expense', head: 'Maintenance', subHead: 'Fuel/Diesel', source: 'account', accountId: ACC, amount: 1500 }).append);
  assert.equal(accountBalance(s, ACC), 18500);
  assert.equal(expenseByHead(s)['Maintenance'].subs['Fuel/Diesel'], 1500);
  assert.equal(s.expenses.length, 1);
});

test('labour paid from petty: wallet −, main untouched', () => {
  const s = freshState();
  s.accountTransfers.push({ fromAccountId: 'seed', toAccountId: ACC, amount: 10000 });
  apply(s, buildPaymentOut({ payeeType: 'pettyTopup', payeeId: CUST, accountId: ACC, amount: 6000 }).append);
  apply(s, buildPaymentOut({ payeeType: 'labour', payeeId: 'lab_1', source: 'petty', custodianId: CUST, amount: 2000 }).append);
  assert.equal(accountBalance(s, ACC), 4000);          // top-up only
  assert.equal(custodianBalance(s, CUST), 4000);       // 6000 − 2000
  assert.equal(s.labourPayments[0].source, 'petty');
  assert.equal(s.labourPayments[0].accountId, undefined);
});

test('payment IN from client and custodian RETURN both credit main', () => {
  const s = freshState();
  apply(s, buildPaymentIn({ payerType: 'client', payerId: 'cli_1', accountId: ACC, amount: 30000 }).append);
  // custodian holds 5000, returns 2000 to main
  s.pettyCashTxns.push({ type: 'TRANSFER', custodianId: CUST, fromAccountId: ACC, amount: 5000, status: 'accepted' });
  apply(s, buildPaymentIn({ payerType: 'custodianReturn', payerId: CUST, accountId: ACC, amount: 2000 }).append);
  // main: +30000 in, −5000 transfer out, +2000 return = 27000
  assert.equal(accountBalance(s, ACC), 27000);
  assert.equal(custodianBalance(s, CUST), 3000);       // 5000 − 2000
});
