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

/* ── Worker period summary (worker panel + muster card PDF) ── */

/** Day wage rules — same as the attendance sheet: half day = ½, OT at 1.5× of rate/8. */
export function wagesFor(rate, present, half, otHours) {
  const r = Number(rate) || 0;
  return Math.round((present + half * 0.5) * r + otHours * (r / 8) * 1.5);
}

/** Every YYYY-MM-DD from `from` to `to` inclusive (max ~1 year). */
export function dateRange(from, to) {
  const out = [];
  for (let d = from; d <= to && out.length < 400; d = shiftDate(d, 1)) out.push(d);
  return out;
}

/**
 * Period presets for the worker panel filter.
 * kind: 'month' (offset months from today's month) · 'week' (Mon → today) · 'custom'
 */
export function periodRange(kind, { offset = 0, from, to } = {}, today = todayISO()) {
  if (kind === 'custom') {
    const f = from || today, t = to || today;
    return f <= t ? { from: f, to: t } : { from: t, to: f };
  }
  if (kind === 'week') {
    const [y, m, d] = today.split('-').map(Number);
    const wd = (new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7; // Mon = 0
    return { from: shiftDate(today, -wd), to: today };
  }
  const [y, m] = today.split('-').map(Number);
  const first = new Date(Date.UTC(y, m - 1 + offset, 1));
  const last = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0));
  return { from: first.toISOString().slice(0, 10), to: last.toISOString().slice(0, 10) };
}

const _inRange = (d, from, to) => !!d && d >= from && d <= to;
const _amt = (v) => parseFloat(v) || 0;

/**
 * Attendance + money for one worker over [from, to].
 * `settle` returns what a payment clears (cash + deductions); defaults to amount.
 * Paid = wage payments in the period; advances / deductions are listed separately.
 */
export function workerPeriod({ worker, logs = [], payments = [], advances = [], deductions = [], from, to, settle = (p) => _amt(p.amount) }) {
  const id = worker && worker.id;
  const byDate = {};
  logs.forEach(a => { if (a.labourId === id && _inRange(a.date, from, to)) byDate[a.date] = a; });
  const days = dateRange(from, to).map(date => {
    const a = byDate[date];
    return { date, status: a ? a.status : '', ot: a ? (Number(a.ot) || 0) : 0, night: !!(a && a.shift === 'Night') };
  });
  const count = (s) => days.filter(d => d.status === s).length;
  const present = count('P'), half = count('H'), absent = count('A');
  const otHours = days.reduce((s, d) => s + d.ot, 0);
  const earned = wagesFor(worker && worker.dayRate, present, half, otHours);
  const mine = (list) => list.filter(r => r.labourId === id && _inRange(r.date, from, to)).sort((a, b) => (a.date < b.date ? -1 : 1));
  const payList = mine(payments).map(p => ({ ...p, paid: settle(p) }));
  const advList = mine(advances);
  const dedList = mine(deductions);
  const r2 = (n) => Math.round(n * 100) / 100;
  const paid = r2(payList.reduce((s, p) => s + p.paid, 0));
  const advance = r2(advList.reduce((s, a) => s + _amt(a.amount), 0));
  const deduction = r2(dedList.reduce((s, d) => s + _amt(d.amount), 0));
  return {
    from, to, days, present, half, absent, unmarked: days.length - present - half - absent,
    otHours, earned, paid, advance, deduction,
    balance: r2(earned - paid - advance - deduction),
    payments: payList, advances: advList, deductions: dedList,
  };
}
