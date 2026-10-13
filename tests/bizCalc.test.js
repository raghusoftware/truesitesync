import { test } from 'node:test';
import assert from 'node:assert/strict';
import { activeMode, modeAllows, modeTerm, stockOnHand, lowStockItems, stockValue, customerDues, salesBetween, whatsappReminderLink } from '../js/modules/bizCalc.js';

const mk = (mode) => ({ currencySettings: mode ? { businessMode: mode } : {} });

test('mode defaults to construction and gates modules', () => {
  assert.equal(activeMode(mk()), 'construction');
  assert.equal(activeMode(mk('bogus')), 'construction');
  assert.equal(modeAllows('measurementListView', mk()), true);
  assert.equal(modeAllows('measurementListView', mk('shop')), false);
  assert.equal(modeAllows('recipeView', mk('shop')), false);
  assert.equal(modeAllows('recipeView', mk('manufacturing')), false);  // BOM lives in Items → Production Items
  assert.equal(modeAllows('assetsView', mk('manufacturing')), true);
  assert.equal(modeAllows('salesLedgerView', mk('shop')), true);
  assert.equal(modeAllows('inventoryView', mk('shop')), true);
  assert.equal(modeAllows('cat:measurement', mk('manufacturing')), false);
  assert.equal(modeAllows('cat:equipment', mk('manufacturing')), true);
  assert.equal(modeTerm('labour', mk('shop')), 'Staff');
  assert.equal(modeTerm('labour', mk()), 'Labour');
});

const S = {
  rawMaterials: [{ id: 'rice', name: 'Rice 25kg', unit: 'Bag', minStock: 10, rate: 1000 }, { id: 'oil', name: 'Oil 1L', unit: 'Pc', minStock: 5, rate: 150 }, { id: 'salt', name: 'Salt', unit: 'Pkt', rate: 20 }],
  inventoryTx: [
    { rawMaterialId: 'rice', type: 'IN', qty: 20, rate: 1100, date: '2026-10-01' },
    { rawMaterialId: 'rice', type: 'OUT', qty: 12, date: '2026-10-05' },
    { rawMaterialId: 'oil', type: 'IN', qty: 30, rate: 140, date: '2026-10-01' },
    { rawMaterialId: 'salt', type: 'IN', qty: 2, date: '2026-10-01' },
  ],
  clients: [{ id: 'c1', name: 'Ramesh', phone: '98765 43210' }, { id: 'c2', name: 'Suresh' }],
  saleInvoices: [
    { id: 's1', clientId: 'c1', date: '2026-10-10', total: 5000 }, { id: 's2', clientId: 'c2', date: '2026-10-12', total: 800 },
    { id: 's3', clientId: 'c1', date: '2026-10-12', total: 999, status: 'Cancelled' },
  ],
  paymentsIn: [{ id: 'p1', clientId: 'c1', date: '2026-10-11', amount: 1800, deductions: [{ type: 'other', amount: 200 }] }, { id: 'p2', clientId: 'c2', amount: 800 }],
};

test('stock on hand, low stock, value', () => {
  assert.deepEqual(stockOnHand(S), { rice: 8, oil: 30, salt: 2 });
  const low = lowStockItems(S);
  assert.equal(low.length, 1);           // salt has no minimum set
  assert.deepEqual([low[0].id, low[0].stock, low[0].shortBy], ['rice', 8, 2]);
  assert.equal(stockValue(S), 8 * 1100 + 30 * 140 + 2 * 20);
});

test('udhaar book: dues net of payments + deductions, cancelled ignored', () => {
  const d = customerDues(S);
  assert.equal(d.length, 1);
  assert.deepEqual([d[0].name, d[0].due, d[0].lastPay, d[0].lastBill], ['Ramesh', 3000, '2026-10-11', '2026-10-10']);
  assert.equal(salesBetween(S, '2026-10-12', '2026-10-12'), 800);
});

test('WhatsApp reminder link', () => {
  const l = whatsappReminderLink({ phone: '98765 43210', name: 'Ramesh', due: 3000, business: 'Shree Stores' });
  assert.ok(l.startsWith('https://wa.me/919876543210?text='));
  assert.ok(decodeURIComponent(l).includes('₹3,000 is pending with Shree Stores'));
});
