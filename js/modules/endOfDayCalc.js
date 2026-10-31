/**
 * endOfDayCalc.js — one site day at a glance (no DOM, unit-tested).
 *
 *   daySummary(S, pid, date)  → everything the End-of-Day screen shows for a project and date:
 *       progress   the day's DPR and its work rows (BOQ item · qty · done by)
 *       pours      concrete pour cards cast that day (+ total m³)
 *       quality    QC checks / checklists, safety incidents (worst severity)
 *       workforce  labour present / half-day / absent by sub contractor and trade, staff punched in
 *       done       which of the four sections have something recorded
 *       report     the DPR feed: BOQ work (logged here + pulled from measurement sheets, grouped
 *                  by item), non-BOQ work, equipment hours per machine, checklist, lock state
 *   checklistResult(items)  → 'Pass' | 'Fail' | 'Open' for a QC checklist
 *   QC_TEMPLATES            → the quick digital checklists
 */

const N = v => { const x = parseFloat(v); return Number.isFinite(x) ? x : 0; };

// Shared with the registers in execution.js.
export const POUR_ELEMENTS = ['Footing', 'Column', 'Beam', 'Slab', 'Raft', 'Pile / Pile Cap', 'Retaining Wall', 'Plinth Beam', 'Staircase', 'Pedestal', 'Other'];
export const GRADES = ['M10', 'M15', 'M20', 'M25', 'M30', 'M35', 'M40', 'M45', 'M50'];
export const QUALITY_TYPES = ['Cube Test', 'NCR', 'Inspection', 'Material Test'];
export const SAFETY_TYPES = ['Incident', 'Near Miss', 'PPE / Toolbox', 'Unsafe Condition'];
export const SEVERITIES = ['Low', 'Medium', 'High', 'Critical'];
export const POUR_CHECKS = [
  ['formwork', 'Formwork checked & oiled'],
  ['reinforcement', 'Reinforcement as per drawing'],
  ['cover', 'Cover blocks placed'],
  ['embedments', 'Embedments / inserts fixed'],
  ['cleaning', 'Surface cleaned & watered'],
  ['level', 'Level & alignment checked'],
];
const SEV_RANK = { Low: 1, Medium: 2, High: 3, Critical: 4 };

/** Quick QC checklists — each item is answered Pass / Fail / N.A. on site. */
export const QC_TEMPLATES = {
  'Pre-pour': ['Formwork aligned, propped & oiled', 'Reinforcement as per drawing (dia, spacing, laps)', 'Cover blocks placed', 'Embedments / sleeves / inserts fixed', 'Surface cleaned & wetted', 'Vibrators & standby ready'],
  'Brickwork': ['Bricks soaked', 'Mortar mix as specified', 'Line, level & plumb', 'Joints filled, ≤ 10 mm', 'Bond pattern maintained', 'Curing arranged'],
  'Plaster': ['Surface hacked & wetted', 'Thickness as specified', 'Mix ratio checked', 'Line & level with straight edge', 'Corners & edges true', 'Curing arranged'],
  'Shuttering removal': ['Minimum striking time passed', 'No honeycombing / cracks', 'Props retained where required', 'Surface defects marked for repair'],
  'Waterproofing': ['Surface dry & clean', 'Primer applied', 'Laps & overlaps as specified', 'Corners / junctions treated', 'Ponding test arranged'],
};

/** Pass when every applicable item passed; Fail if any failed; Open while items are unanswered. */
export function checklistResult(items) {
  const list = (items || []).filter(i => i.result !== 'NA');
  if (list.some(i => i.result === 'Fail')) return 'Fail';
  if (!list.length || list.some(i => i.result !== 'Pass')) return 'Open';
  return 'Pass';
}

export function daySummary(S, pid, date) {
  const mine = k => (S[k] || []).filter(x => x.projectId === pid && (x.date || '').slice(0, 10) === date);
  const gangName = id => (S.labourContractors || []).find(g => g.id === id)?.name || '';

  // ── Progress ──
  const dprs = mine('dailyProgress');
  const dpr = dprs[0] || null;
  const work = dprs.flatMap(d => (d.measurements || []).map(m => ({ ...m, dprId: d.id, doneBy: gangName(m.gangId) || 'Own labour' })));

  // ── Concrete ──
  const pours = mine('concretePours');
  const pourM3 = pours.reduce((t, p) => t + N(p.volume), 0);

  // ── Quality & safety ──
  const qc = mine('qualityChecks');
  const incidents = mine('incidents');
  const worst = incidents.reduce((w, i) => ((SEV_RANK[i.severity] || 0) > (SEV_RANK[w] || 0) ? i.severity : w), '');

  // ── Workforce ── attendance logs are stored per site (siteId), not projectId
  const labourById = {}; (S.labourMaster || []).forEach(l => { labourById[l.id] = l; });
  const logs = (S.attendanceLogs || []).filter(a => (a.siteId === pid || a.projectId === pid) && a.date === date);
  const lab = { present: 0, half: 0, absent: 0, ot: 0, byGroup: {}, byTrade: {} };
  logs.forEach(a => {
    if (a.status === 'P') lab.present++; else if (a.status === 'H') lab.half++; else lab.absent++;
    lab.ot += N(a.ot);
    if (a.status !== 'P' && a.status !== 'H') return;
    const l = labourById[a.labourId] || {};
    const g = gangName(l.contractorId) || 'Direct labour', t = l.trade || l.skill || 'General';
    lab.byGroup[g] = (lab.byGroup[g] || 0) + (a.status === 'H' ? 0.5 : 1);
    lab.byTrade[t] = (lab.byTrade[t] || 0) + (a.status === 'H' ? 0.5 : 1);
  });
  const staffIds = new Set((S.staffMaster || []).filter(s => !s.projectId || s.projectId === pid).map(s => s.id));
  const staffIn = (S.staffAttendance || []).filter(a => a.date === date && a.inAt && (staffIds.has(a.staffId) || a.projectId === pid));
  const headcount = lab.present + lab.half + staffIn.length;

  // ── Measurement sheets — lines recorded for this date outside today's DPR(s) ──
  const dprIds = new Set(dprs.map(d => d.id));
  const sheetLines = [];
  (S.sheets || []).filter(sh => sh.projectId === pid).forEach(sh => (sh.entries || []).forEach((e, i) => {
    const d = (e._date || sh.date || '').slice(0, 10);
    if (d !== date || (e._dprId && dprIds.has(e._dprId)) || !(N(e.qty) > 0)) return;
    if (String(e.code || '').indexOf('NB:') === 0) return;
    sheetLines.push({ code: e.code, description: e.description || e.code, uom: e.uom || '', qty: N(e.qty), nos: e.nos, l: e.l, b: e.b, h: e.h, sheetId: sh.id, sheetNo: sh.sheetNum || '', location: sh.area || sh.locationLabel || '', idx: i });
  }));
  const boqWork = work.filter(w => !w.isNonBoq && String(w.code || '').indexOf('NB:') !== 0);
  const nonBoq = work.filter(w => w.isNonBoq || String(w.code || '').indexOf('NB:') === 0);
  const groups = {};
  const add = (code, desc, uom, qty, line) => {
    const g = groups[code] || (groups[code] = { code, description: desc, uom, qty: 0, lines: [] });
    g.qty = Math.round((g.qty + qty) * 1000) / 1000; g.lines.push(line);
  };
  boqWork.forEach(w => add(w.code, w.description || w.code, w.uom || '', N(w.qty), { ...w, src: 'dpr', wi: work.indexOf(w) }));
  sheetLines.forEach(l => add(l.code, l.description, l.uom, l.qty, { ...l, src: 'sheet' }));

  // ── Equipment — logs for this project and date, one row per machine ──
  const eqById = {}; (S.equipmentList || []).forEach(e => { eqById[e.id] = e; });
  const eqLogs = (S.equipmentLogs || []).filter(l => (l.date || '').slice(0, 10) === date && (l.projectId === pid || (!l.projectId && eqById[l.assetId]?.projectId === pid)));
  const machines = {};
  eqLogs.forEach(l => {
    const e = eqById[l.assetId] || {};
    const m = machines[l.assetId] || (machines[l.assetId] = { assetId: l.assetId, name: e.name || e.code || 'Equipment', regNo: e.regNo || '', unit: e.unit || 'HMR', hours: 0, km: 0, litres: 0, logs: 0, breakdown: false });
    m.hours = Math.round((m.hours + N(l.hours)) * 100) / 100; m.km = Math.round((m.km + N(l.km)) * 100) / 100; m.litres = Math.round((m.litres + N(l.litres)) * 100) / 100;
    m.logs++; if (l.type === 'Breakdown') m.breakdown = true;
  });
  const equipment = Object.values(machines).sort((a, b) => b.hours - a.hours || a.name.localeCompare(b.name));

  const report = {
    groups: Object.values(groups), sheetLines, nonBoq, equipment,
    equipHours: Math.round(equipment.reduce((t, m) => t + m.hours, 0) * 100) / 100,
    locked: !!(dpr && dpr.eodSubmitted), submitted: dpr?.eodSubmitted || null,
  };

  return {
    date, dpr, dprs, work, report,
    pours, pourM3: Math.round(pourM3 * 100) / 100,
    qc, incidents, worstSeverity: worst,
    workforce: { ...lab, staff: staffIn.length, staffList: staffIn, headcount, manDays: lab.present + lab.half * 0.5 + staffIn.length },
    done: { progress: work.length > 0 || !!dpr, pour: pours.length > 0, quality: qc.length + incidents.length > 0, workforce: logs.length + staffIn.length > 0 },
  };
}
