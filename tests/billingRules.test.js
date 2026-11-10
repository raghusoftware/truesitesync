import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rulesFor, applyDeductions, clientFinance, lockedRetention, nextRetentionBillNo, cashShare } from '../js/modules/billingRules.js';

const S = {
  clients: [{ id: 'c1', name: 'L&T', paymentTermsDays: 30, defaultTdsRate: 2, defaultRetentionRate: 5 }, { id: 'c2', name: 'Shah' }],
  projects: [{ id: 'p1', clientId: 'c1', defaultRetentionRate: 10 }, { id: 'p2', clientId: 'c1', paymentTermsDays: '', defaultTdsRate: 1 }, { id: 'p3', clientId: 'c2' }],
};

test('rulesFor: project overrides client, blank inherits', () => {
  const a = rulesFor(S, { projectId: 'p1' });
  assert.deepEqual([a.termsDays, a.tdsPct, a.retentionPct, a.source.retention, a.source.tds], [30, 2, 10, 'project', 'client']);
  const b = rulesFor(S, { projectId: 'p2' });
  assert.deepEqual([b.termsDays, b.tdsPct, b.retentionPct], [30, 1, 5]);
  const c = rulesFor(S, { projectId: 'p3' });
  assert.deepEqual([c.termsDays, c.tdsPct, c.retentionPct, c.source.tds], [null, 0, 0, '']);
  assert.equal(rulesFor(S, { clientId: 'c1' }).retentionPct, 5);
});

test('applyDeductions: GST first, then TDS and retention on the taxable value', () => {
  const r = applyDeductions({ taxable: 100000, tax: 18000, tdsPct: 2, retentionPct: 5 });
  assert.deepEqual([r.gross, r.tds, r.retention, r.deductions, r.net], [118000, 2000, 5000, 7000, 111000]);
  const z = applyDeductions({ taxable: 1234.5, tax: 222.21, roundOff: 0.29 });
  assert.deepEqual([z.gross, z.tds, z.retention, z.net], [1457, 0, 0, 1457]);
});

test('clientFinance + lockedRetention: billed, cash, TDS, retention held / claimed / due', () => {
  const T = {
    ...S,
    saleInvoices: [
      { id: 'i1', clientId: 'c1', total: 118000, tdsAmt: 2000, retentionAmt: 5000 },
      { id: 'i2', clientId: 'c1', total: 59000, tdsAmt: 1000, retentionAmt: 2500 },
      { id: 'i3', clientId: 'c1', total: 999, status: 'Cancelled' },
    ],
    paymentsIn: [
      { clientId: 'c1', invoiceId: 'i1', amount: 111000, deductions: [{ type: 'tds', nature: 'tax', amount: 2000 }, { type: 'retention', nature: 'held', amount: 5000 }] },
      { clientId: 'c1', againstBillId: 'r1', amount: 1500 },
    ],
    retentionBills: [{ id: 'r1', clientId: 'c1', billNo: 'RRB-1', amount: 2000 }],
  };
  const f = clientFinance(T, 'c1');
  assert.deepEqual([f.billed, f.received, f.tds, f.retentionWithheld, f.retentionHeld, f.retentionClaimed, f.retentionReleased, f.retentionDue],
    [177000, 112500, 2000, 5000, 3000, 500, 1500, 2500]);
  assert.equal(f.outstanding, 177000 + 2000 - 118000 - 1500);
  const L = lockedRetention(T);
  assert.deepEqual([L.held, L.due, L.claimed, L.total, L.byClient.length], [3000, 2500, 500, 5500, 1]);
  assert.equal(nextRetentionBillNo(T), 'RRB-2');
  assert.deepEqual(cashShare(T.saleInvoices[0]), { cash: 111000 / 118000, retention: 5000 / 118000 });
  assert.deepEqual(cashShare({ total: 100 }), { cash: 1, retention: 0 });
});
