/**
 * chatLayout.js — pure layout rules for the chat thread (no DOM), so they can
 * be unit-tested.
 *
 *   groupMessages(list)  → one entry per message with its bubble position in a
 *                          sender group, whether a day separator precedes it,
 *                          and whether the name / avatar should show.
 *   mediaGridClass(n)    → grid layout for n photos in one message.
 *   tileFor(lat, lng, z) → OpenStreetMap tile + pixel offset for a map preview.
 *
 * Grouping: consecutive messages from the same sender on the same day, each at
 * most GROUP_GAP_MS after the previous one, form a group. System messages and
 * priority (high / urgent / safety) messages always stand alone so they read
 * as distinct events.
 */
export const GROUP_GAP_MS = 5 * 60 * 1000;

const dayKey = (iso) => new Date(iso).toDateString();
const isPlain = (m) => m && m.kind !== 'system' && (!m.priority || m.priority === 'normal');

/** a (earlier) and b (later) belong to the same bubble group. */
export function joins(a, b, gapMs = GROUP_GAP_MS) {
  if (!isPlain(a) || !isPlain(b)) return false;
  if (a.user_id !== b.user_id) return false;
  if (dayKey(a.created_at) !== dayKey(b.created_at)) return false;
  const dt = new Date(b.created_at) - new Date(a.created_at);
  return dt >= 0 && dt <= gapMs;
}

/**
 * @param {Array<{user_id,created_at,kind?,priority?}>} list ascending by time
 * @returns {Array<{m, pos:'single'|'first'|'mid'|'last', dayBreak:boolean, showName:boolean, showAvatar:boolean}>}
 */
export function groupMessages(list, gapMs = GROUP_GAP_MS) {
  return list.map((m, i) => {
    const prev = list[i - 1], next = list[i + 1];
    const dayBreak = !prev || dayKey(prev.created_at) !== dayKey(m.created_at);
    const joinPrev = !dayBreak && joins(prev, m, gapMs);
    const joinNext = !!next && joins(m, next, gapMs);
    const pos = joinPrev ? (joinNext ? 'mid' : 'last') : (joinNext ? 'first' : 'single');
    return { m, pos, dayBreak, showName: !joinPrev, showAvatar: !joinNext };
  });
}

/** Today · Yesterday · weekday (this week) · 12 Oct 2026 */
export function dayLabel(iso, now = new Date()) {
  const d = new Date(iso);
  const start = (x) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diff = Math.round((start(now) - start(d)) / 86400000);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Yesterday';
  if (diff > 1 && diff < 7) return d.toLocaleDateString('en-IN', { weekday: 'long' });
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

/** 1 → single, 2 → side by side, 3 → one tall + two, 4+ → 2×2 (the 4th shows +N). */
export function mediaGridClass(n) {
  return n <= 1 ? 'g1' : n === 2 ? 'g2' : n === 3 ? 'g3' : 'g4';
}

/** Web-Mercator tile containing (lat, lng) at zoom z, and the point's pixel offset in it. */
export function tileFor(lat, lng, z = 16) {
  const n = 2 ** z;
  const xf = (lng + 180) / 360 * n;
  const r = lat * Math.PI / 180;
  const yf = (1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2 * n;
  const x = Math.floor(xf), y = Math.floor(yf);
  return { z, x, y, px: Math.round((xf - x) * 256), py: Math.round((yf - y) * 256) };
}
