/**
 * attendanceGuard.js — who may punch a staff member in or out (no DOM, unit-tested).
 *
 * Anti-proxy rule: a staff punch is valid only when the logged-in user IS that staff
 * member (staff.userId === auth user id), from their registered phone, with a live
 * location — inside the site's geofence when the site has one. The owner / admin may
 * correct a punch, but only as a "manual correction" with a reason (flagged on the
 * record). The database enforces the same rule (supabase/migrations/…anti_proxy…),
 * so a modified client cannot get around it.
 */

const N = v => { const x = parseFloat(v); return Number.isFinite(x) ? x : 0; };

/** Metres between two { lat, lng } points (haversine). */
export function distanceM(a, b) {
  if (!a || !b || a.lat == null || b.lat == null) return null;
  const R = 6371000, rad = d => d * Math.PI / 180;
  const dLat = rad(N(b.lat) - N(a.lat)), dLng = rad(N(b.lng) - N(a.lng));
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(N(a.lat))) * Math.cos(rad(N(b.lat))) * Math.sin(dLng / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.sqrt(h)));
}

export const DEFAULT_RADIUS_M = 300;

/**
 * @param {{ staff:object, uid:string, deviceId:string, gps:{lat,lng,acc}|null,
 *           site?:{lat,lng,radius}|null, isAdmin?:boolean, manual?:boolean, reason?:string }} o
 * @returns {{ ok:boolean, code:string, msg:string, distance?:number }}
 */
export function checkPunch(o) {
  const s = o.staff || {};
  if (o.manual) {
    if (!o.isAdmin) return { ok: false, code: 'not_admin', msg: 'Only the owner or an admin can correct someone else\'s attendance.' };
    if (!String(o.reason || '').trim()) return { ok: false, code: 'no_reason', msg: 'Give a reason for the manual correction.' };
    return { ok: true, code: 'manual', msg: '' };
  }
  if (!o.uid) return { ok: false, code: 'no_session', msg: 'Sign in to punch attendance.' };
  if (!s.userId) return { ok: false, code: 'unlinked', msg: `${s.name || 'This staff member'} isn't linked to a login yet. The owner links it in Edit staff → Login.` };
  if (s.userId !== o.uid) return { ok: false, code: 'proxy', msg: `You can only punch your own attendance — this is ${s.name || 'another person'}'s card.` };
  if (s.boundDevice && o.deviceId && s.boundDevice !== o.deviceId) return { ok: false, code: 'device', msg: 'This attendance is registered to another phone. Ask the owner to reset the phone in Edit staff.' };
  if (!o.gps || o.gps.lat == null) return { ok: false, code: 'no_gps', msg: 'Turn on location — punches need your live location.' };
  const site = o.site;
  if (site && site.lat != null) {
    const d = distanceM(site, o.gps);
    const allow = N(site.radius) || DEFAULT_RADIUS_M;
    // Give back up to 100 m of the phone's own GPS error before calling it off-site.
    if (d > allow + Math.min(N(o.gps.acc), 100)) return { ok: false, code: 'off_site', msg: `You are ${d >= 1000 ? (d / 1000).toFixed(1) + ' km' : d + ' m'} from the site (allowed ${allow} m). Punch when you reach the site.`, distance: d };
    return { ok: true, code: 'ok', msg: '', distance: d };
  }
  return { ok: true, code: 'ok', msg: '' };
}

/** A stable id for this phone / browser (device binding). */
export function deviceId(store = (typeof localStorage !== 'undefined' ? localStorage : null)) {
  const K = 'tss_device_id';
  try {
    let id = store && store.getItem(K);
    if (!id) { id = 'dev_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10); store && store.setItem(K, id); }
    return id;
  } catch { return ''; }
}
