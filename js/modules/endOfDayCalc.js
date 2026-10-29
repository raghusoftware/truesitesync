/**
 * endOfDayCalc.js — one site day at a glance (no DOM, unit-tested).
 *
 *   daySummary(S, pid, date)  → everything the End-of-Day screen shows for a project and date:
 *       progress   the day's DPR and its work rows (BOQ item · qty · done by)
 *       pours      concrete pour cards cast that day (+ total m³)
 *       quality    QC checks / checklists, safety incidents (worst severity)
 *       workforce  labour present / half-day / absent by sub contractor and trade, staff punched in
 *       done       which of the four sections have something recorded
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

  return {
    date, dpr, dprs, work,
    pours, pourM3: Math.round(pourM3 * 100) / 100,
    qc, incidents, worstSeverity: worst,
    workforce: { ...lab, staff: staffIn.length, staffList: staffIn, headcount, manDays: lab.present + lab.half * 0.5 + staffIn.length },
    done: { progress: work.length > 0 || !!dpr, pour: pours.length > 0, quality: qc.length + incidents.length > 0, workforce: logs.length + staffIn.length > 0 },
  };
}
