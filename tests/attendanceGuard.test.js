import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkPunch, distanceM, deviceId } from '../js/modules/attendanceGuard.js';

const site = { lat: 22.3072, lng: 73.1812, radius: 300 };
const near = { lat: 22.3080, lng: 73.1815, acc: 15 };   // ~95 m away
const far = { lat: 22.3300, lng: 73.1812, acc: 15 };    // ~2.5 km away
const staffA = { id: 's1', name: 'Amit', userId: 'u-amit', boundDevice: 'dev-1' };

test('distanceM', () => {
  assert.ok(Math.abs(distanceM(site, near) - 95) < 10);
  assert.ok(Math.abs(distanceM(site, far) - 2535) < 30);
  assert.equal(distanceM(null, near), null);
});

test('checkPunch: only the staff member themself, on their phone, on site', () => {
  const ok = checkPunch({ staff: staffA, uid: 'u-amit', deviceId: 'dev-1', gps: near, site });
  assert.equal(ok.ok, true); assert.ok(ok.distance < 120);
  assert.equal(checkPunch({ staff: staffA, uid: 'u-bina', deviceId: 'dev-9', gps: near, site }).code, 'proxy');   // Supervisor B for A
  assert.equal(checkPunch({ staff: staffA, uid: 'u-amit', deviceId: 'dev-2', gps: near, site }).code, 'device');
  assert.equal(checkPunch({ staff: staffA, uid: 'u-amit', deviceId: 'dev-1', gps: null, site }).code, 'no_gps');
  assert.equal(checkPunch({ staff: staffA, uid: 'u-amit', deviceId: 'dev-1', gps: far, site }).code, 'off_site');
  assert.equal(checkPunch({ staff: { name: 'New' }, uid: 'u-amit', gps: near }).code, 'unlinked');
  assert.equal(checkPunch({ staff: staffA, uid: '', gps: near }).code, 'no_session');
  assert.equal(checkPunch({ staff: { ...staffA, boundDevice: '' }, uid: 'u-amit', deviceId: 'dev-7', gps: far }).ok, true);   // no site set, first phone
});

test('checkPunch: manual correction is owner/admin only, with a reason', () => {
  assert.equal(checkPunch({ staff: staffA, uid: 'u-bina', manual: true, isAdmin: false, reason: 'x' }).code, 'not_admin');
  assert.equal(checkPunch({ staff: staffA, uid: 'u-own', manual: true, isAdmin: true, reason: ' ' }).code, 'no_reason');
  assert.equal(checkPunch({ staff: staffA, uid: 'u-own', manual: true, isAdmin: true, reason: 'Phone died' }).ok, true);
});

test('deviceId is stable per store', () => {
  const m = new Map(); const store = { getItem: k => m.get(k) ?? null, setItem: (k, v) => m.set(k, v) };
  const a = deviceId(store); assert.match(a, /^dev_/); assert.equal(deviceId(store), a);
});
