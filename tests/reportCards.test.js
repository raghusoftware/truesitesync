import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cardLayout, reportCardsHtml } from '../js/modules/reportCards.js';

const gstr1 = [
  { key: 'invoiceNo', label: 'Invoice No.', type: 'text' },
  { key: 'invoiceDate', label: 'Invoice Date', type: 'date' },
  { key: 'invoiceValue', label: 'Invoice Value (₹)', type: 'currency' },
  { key: 'supplyType', label: 'Supply Type', type: 'badge' },
  { key: 'gstin', label: 'GSTIN/UIN of Recipient', type: 'text' },
  { key: 'receiverName', label: 'Receiver Name', type: 'text' },
  { key: 'pos', label: 'Place of Supply', type: 'text' },
  { key: 'hsnSac', label: 'HSN/SAC Code', type: 'text' },
  { key: 'taxableValue', label: 'Taxable Value (₹)', type: 'currency' },
  { key: 'igst', label: 'IGST (₹)', type: 'currency' },
  { key: 'cgst', label: 'CGST (₹)', type: 'currency' },
  { key: 'sgst', label: 'SGST/UTGST (₹)', type: 'currency' },
  { key: 'cess', label: 'Cess (₹)', type: 'currency' },
  { key: 'gstRate', label: 'Rate (%)', type: 'percent' },
];
const keys = (cols) => cols.map(c => c && c.key);

test('cardLayout maps a GSTR-1 row: id, badge, date + party, hero amount, tax grid, rest in details', () => {
  const L = cardLayout(gstr1);
  assert.equal(L.title.key, 'invoiceNo');
  assert.equal(L.badge.key, 'supplyType');
  assert.equal(L.hero.key, 'invoiceValue');
  assert.deepEqual(keys(L.meta), ['invoiceDate', 'receiverName']);   // GSTIN is not used as the party name
  assert.deepEqual(keys(L.grid), ['taxableValue', 'igst', 'cgst', 'sgst']);
  assert.deepEqual(keys(L.details), ['gstin', 'pos', 'hsnSac', 'cess', 'gstRate']);
});

test('cardLayout honours a report hint', () => {
  const cols = [
    { key: 'month', label: 'Tax Period', type: 'text' },
    { key: 'outputTax', label: 'Output Tax', type: 'currency' },
    { key: 'netPayable', label: 'Net Payable', type: 'currency' },
  ];
  const L = cardLayout(cols, { hero: 'netPayable', grid: ['outputTax'] });
  assert.equal(L.hero.key, 'netPayable');
  assert.deepEqual(keys(L.grid), ['outputTax']);
  assert.deepEqual(L.details, []);
});

test('every column shows exactly once on a card', () => {
  const L = cardLayout(gstr1);
  const all = [L.title, L.badge, L.hero, ...L.meta, ...L.grid, ...L.details].filter(Boolean).map(c => c.key).sort();
  assert.deepEqual(all, gstr1.map(c => c.key).sort());
});

test('reportCardsHtml renders a card per row, hides empty details, adds a totals card and escapes text', () => {
  const fmt = (c, v) => (c.type === 'currency' ? '₹' + v : String(v).replace(/</g, '&lt;'));
  const rows = [
    { invoiceNo: 'INV-1', invoiceDate: '12 Oct', invoiceValue: 118, supplyType: 'B2B', receiverName: '<Shree>', taxableValue: 100, cgst: 9, sgst: 9, igst: 0, gstin: '24AAA', pos: '', hsnSac: '—', cess: 0, gstRate: 18 },
  ];
  const html = reportCardsHtml(rows, gstr1, { invoiceValue: 118 }, null, fmt);
  assert.equal((html.match(/class="rc-card"/g) || []).length, 1);
  assert.match(html, /class="rc-card total"/);
  assert.match(html, /&lt;Shree>/);
  assert.match(html, /View details <em>3<\/em>/);   // gstin, cess, gstRate — pos and hsn are empty
  assert.match(html, /<span>Taxable Value<\/span><b>₹100<\/b>/);
});
