import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseTerms, buildEstimateModel, upsertPreset, removePreset, defaultPreset, sortedPresets } from '../js/modules/estimateDoc.js';

test('parseTerms strips numbering and bullets, keeps wrapped clauses together', () => {
  const t = parseTerms(`1. Rates are valid for 30 days.
2) GST extra as applicable
   at the time of billing.
- Water and power by client.

Payment: 40% advance, balance on completion.`);
  assert.deepEqual(t, [
    'Rates are valid for 30 days.',
    'GST extra as applicable at the time of billing.',
    'Water and power by client.',
    'Payment: 40% advance, balance on completion.',
  ]);
  assert.deepEqual(parseTerms(''), []);
});

test('buildEstimateModel resolves client, project, rounding and totals', () => {
  const S = {
    clients: [{ id: 'c1', name: 'Nexcel', address: 'Vapi', gst: '24abc', projectId: 'p1' }],
    projects: [{ id: 'p1', name: 'Chemical Plant' }],
    companyProfile: { CompanyName: 'Raghu Infra', GST: '24xyz' },
  };
  const m = buildEstimateModel({ estNum: 'EST-1', clientId: 'c1', items: [{ desc: ' PCC ', qty: 233.4999999997, unit: 'Cum', rate: 4500 }], subTotal: 1050750, discountType: 'pct', discountValue: 5, discountAmount: 52537.5, total: 998212.5, terms: '1. A\n2. B', template: 'modern' }, S);
  assert.equal(m.client.name, 'Nexcel'); assert.equal(m.client.gst, '24ABC');
  assert.equal(m.project, 'Chemical Plant'); assert.equal(m.company.gst, '24XYZ');
  assert.equal(m.items[0].qty, 233.5); assert.equal(m.items[0].desc, 'PCC'); assert.equal(m.items[0].amount, 1050750);
  assert.equal(m.discountLabel, 'Discount (5%)'); assert.equal(m.total, 998212.5);
  assert.deepEqual(m.terms, ['A', 'B']); assert.equal(m.template, 'modern');
  assert.equal(buildEstimateModel({ template: 'weird' }).template, 'classic');
});

test('presets: upsert by title, single default, remove, sort', () => {
  let n = 0; const mk = () => 'p' + (++n);
  let { list } = upsertPreset([], { title: 'Road Work', body: 'a' }, mk);
  ({ list } = upsertPreset(list, { title: 'Building', body: 'b', isDefault: true }, mk));
  ({ list } = upsertPreset(list, { title: 'road work', body: 'a2' }, mk));        // same title → update
  assert.equal(list.length, 2);
  assert.equal(list.find(p => p.id === 'p1').body, 'a2');
  assert.equal(defaultPreset(list).title, 'Building');
  ({ list } = upsertPreset(list, { id: 'p1', title: 'Road Work', body: 'a2', isDefault: true }, mk));
  assert.equal(defaultPreset(list).id, 'p1');
  assert.equal(list.filter(p => p.isDefault).length, 1);
  assert.deepEqual(sortedPresets(list).map(p => p.title), ['Road Work', 'Building']);
  assert.equal(removePreset(list, 'p1').length, 1);
  assert.throws(() => upsertPreset([], { title: '  ' }));
});
