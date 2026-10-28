import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatDocNo, seqOf, nextDocNo, parseStart } from '../js/modules/docNumbering.js';

test('formatDocNo pads to the configured width', () => {
  assert.equal(formatDocNo('GRN-', 54, 4), 'GRN-0054');
  assert.equal(formatDocNo('REC/', 7, 2), 'REC/07');
  assert.equal(formatDocNo('', 12345, 3), '12345');
  assert.equal(formatDocNo('PROJ-', 1), 'PROJ-0001');
});

test('seqOf reads only numbers issued under this prefix', () => {
  assert.equal(seqOf('GRN-0054', 'GRN-'), 54);
  assert.equal(seqOf('GRN-GEN-20261028-001', 'GRN-'), null);   // old automatic format
  assert.equal(seqOf('REC-0003', 'GRN-'), null);
  assert.equal(seqOf('0009', ''), 9);
});

test('nextDocNo never collides with a number already used', () => {
  assert.deepEqual(nextDocNo({ prefix: 'GRN-', nextNum: 1, digits: 4 }, []), { no: 'GRN-0001', n: 1 });
  // counter behind (another device synced GRN-0007) → jumps past it
  assert.deepEqual(nextDocNo({ prefix: 'GRN-', nextNum: 5, digits: 4 }, ['GRN-0004', 'GRN-0007', 'GRN-GEN-20261028-001']), { no: 'GRN-0008', n: 8 });
  // counter ahead (user set a higher start) → respected
  assert.deepEqual(nextDocNo({ prefix: 'GRN-', nextNum: 100, digits: 4 }, ['GRN-0007']), { no: 'GRN-0100', n: 100 });
  // a prefix change starts its own sequence
  assert.deepEqual(nextDocNo({ prefix: 'REC-', nextNum: 1, digits: 3 }, ['GRN-0007']), { no: 'REC-001', n: 1 });
});

test('parseStart takes the width from what was typed', () => {
  assert.deepEqual(parseStart('0001'), { nextNum: 1, digits: 4 });
  assert.deepEqual(parseStart('54'), { nextNum: 54, digits: 2 });
  assert.deepEqual(parseStart('000'), { nextNum: 1, digits: 3 });
  assert.equal(parseStart('12a'), null);
  assert.equal(parseStart(''), null);
});
