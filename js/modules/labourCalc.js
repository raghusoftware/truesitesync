/**
 * labourCalc.js — pure helpers for the Labour Attendance screen (one tap per
 * worker: P / A / H / OT). Works on state.attendanceLogs records:
 *   { id, date, siteId, labourId, status: 'P'|'H'|'A', ot, shift }
 * No DOM; unit-tested in tests/labourCalc.test.js.
 */

export const STATUS_LABEL = { P: 'Present', A: 'Absent', H: 'Half Day' };

/** The log for one worker on one day (or null). */
export function dayLog(logs, labourId, date) {
  return (logs || []).find(a => a.labourId === labourId && a.date === date) || null;
}

/**
 * Mark a worker for a day, in place. `patch` may carry status and/or ot.
 * Tapping the status that is already set clears it (back to "not marked"),
 * unless OT is recorded — then the worker stays Present.
 * Returns { log, remove } — `remove` is a log the caller must delete through
 * state.keepOnly (so the deletion is tombstoned and can't sync back).
 */
export function markDay(logs, { labourId, date, siteId, status, ot }, makeId = () => 'att_' + Date.now() + '_' + labourId) {
  const i = logs.findIndex(a => a.labourId === labourId && a.date === date);
  let log = i >= 0 ? logs[i] : null;
  if (status !== undefined && log && log.status === status && ot === undefined && !(log.ot > 0)) {
    return { log: null, remove: log };
  }
  if (!log) {
    log = { id: makeId(), date, siteId: siteId || 'site', labourId, status: 'P', ot: 0, shift: 'Day' };
    logs.push(log);
    if (status === undefined) status = 'P'; // OT on an unmarked worker → present
  }
  if (status !== undefined) log.status = status;
  if (ot !== undefined) {
    log.ot = Math.max(0, Math.min(24, Number(ot) || 0));
    if (log.ot > 0 && log.status === 'A') log.status = 'P';
  }
  return { log, remove: null };
}

/** Counts for a day across the given workers. */
export function daySummary(logs, labourIds, date) {
  const ids = new Set(labourIds);
  const s = { P: 0, A: 0, H: 0, unmarked: 0, ot: 0 };
  const seen = new Set();
  (logs || []).forEach(a => {
    if (a.date !== date || !ids.has(a.labourId) || seen.has(a.labourId)) return;
    seen.add(a.labourId);
    if (s[a.status] !== undefined) s[a.status]++;
    s.ot += Number(a.ot) || 0;
  });
  s.unmarked = ids.size - seen.size;
  return s;
}

/** Filter chip for a worker on a day: P | A | H | none */
export function dayState(logs, labourId, date) {
  const l = dayLog(logs, labourId, date);
  return l ? l.status : 'none';
}

/** YYYY-MM-DD ± days (local calendar, no time-zone drift). */
export function shiftDate(date, days) {
  const [y, m, d] = String(date).split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + days));
  return t.toISOString().slice(0, 10);
}

export function todayISO(now = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}`;
}

/** "Today, 23 Oct 2026" · "Yesterday, …" · "Fri, 20 Oct 2026" */
export function dayLabel(date, today = todayISO()) {
  const [y, m, d] = String(date).split('-').map(Number);
  const mon = 'Jan Feb Mar Apr May Jun Jul Aug Sep Oct Nov Dec'.split(' ')[m - 1];
  const base = `${String(d).padStart(2, '0')} ${mon} ${y}`;
  if (date === today) return 'Today, ' + base;
  if (date === shiftDate(today, -1)) return 'Yesterday, ' + base;
  const wd = 'Sun Mon Tue Wed Thu Fri Sat'.split(' ')[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
  return `${wd}, ${base}`;
}
