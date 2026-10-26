/**
 * toolsCalc.js — pure rules for the Tools register (no DOM, unit-tested).
 *
 * A tool record:
 *   { id, projectId, name, code, category, qty, value, returnable, location,
 *     status: 'available' | 'in_use' | 'maintenance' | 'lost',
 *     holder: { labourId, since, byId, issueId } | null,
 *     history: [{ at, type, labourId?, note?, by? }] }
 *
 * Check-outs still write a state.toolIssues record (issueId) so worker
 * deductions and the older issue log keep working.
 */
export const CATEGORIES = [
  { key: 'power', label: 'Power tools' },
  { key: 'hand', label: 'Hand tools' },
  { key: 'heavy', label: 'Heavy equipment' },
  { key: 'measure', label: 'Measuring' },
  { key: 'safety', label: 'Safety gear' },
  { key: 'scaffold', label: 'Scaffolding' },
  { key: 'other', label: 'Other' },
];
export const STATUS = {
  available: { label: 'Available', tone: 'green' },
  in_use: { label: 'In use', tone: 'amber' },
  maintenance: { label: 'Under repair', tone: 'red' },
  lost: { label: 'Lost', tone: 'slate' },
};
export const OVERDUE_DAYS = 7;

/** Best-guess category from a free-text tool name. */
export function guessCategory(name) {
  const n = String(name || '').toLowerCase();
  if (/scaffold|tube|coupler|prop|plank|jack/.test(n)) return 'scaffold';
  if (/drill|grinder|cutter|saw|vibrator|breaker|mixer|welding|blower|hammer drill|router|planer/.test(n)) return 'power';
  if (/jcb|crane|excavator|roller|loader|dumper|hoist|compactor|generator|dg set/.test(n)) return 'heavy';
  if (/tape|level|theodolite|total station|meter|gauge|plumb|square|laser/.test(n)) return 'measure';
  if (/helmet|harness|glove|boot|goggle|vest|mask|belt|ear/.test(n)) return 'safety';
  if (/spanner|wrench|hammer|chisel|trowel|shovel|spade|crowbar|plier|screwdriver|pan|bucket|wheel ?barrow/.test(n)) return 'hand';
  return 'other';
}

/** Whole days since an ISO date (0 for today / unknown). */
export function daysSince(iso, now = new Date()) {
  if (!iso) return 0;
  const d = new Date(iso); if (isNaN(d)) return 0;
  const a = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  const b = Date.UTC(d.getFullYear(), d.getMonth(), d.getDate());
  return Math.max(0, Math.round((a - b) / 86400000));
}
export const isOverdue = (t, now) => t.status === 'in_use' && t.returnable !== false && daysSince(t.holder?.since, now) > OVERDUE_DAYS;

/** Next tag in the T-001 series for a project's tools. */
export function nextCode(tools) {
  const max = tools.reduce((m, t) => { const k = /^T-(\d+)$/.exec(t.code || ''); return k ? Math.max(m, +k[1]) : m; }, 0);
  return 'T-' + String(max + 1).padStart(3, '0');
}

/**
 * Build register entries from older free-text issue records (state.toolIssues)
 * that have no toolId yet. Issues are replayed oldest first; an issue reuses an
 * existing, currently available tool of the same name, otherwise a new tool is
 * created. Returns { created: [...newTools], links: { issueId: toolId } }.
 */
export function registerFromIssues(tools, issues, projectId, mkId = (i) => 'tl_m' + i) {
  const all = tools.slice();
  const created = [], links = {};
  const pending = issues.filter(i => i.projectId === projectId && !i.toolId && i.tool)
    .sort((a, b) => String(a.date).localeCompare(String(b.date)));
  pending.forEach((iss, n) => {
    const key = iss.tool.trim().toLowerCase();
    let t = all.find(x => x.projectId === projectId && x.name.trim().toLowerCase() === key && x.status === 'available');
    if (!t) {
      t = { id: mkId(n), projectId, name: iss.tool.trim(), code: nextCode(all.filter(x => x.projectId === projectId)), category: guessCategory(iss.tool),
        qty: 1, value: Number(iss.value) || 0, returnable: true, location: 'Site store', status: 'available', holder: null, history: [{ at: iss.date, type: 'created', note: 'From tool issue log' }] };
      all.push(t); created.push(t);
    }
    t.history.push({ at: iss.date, type: 'checkout', labourId: iss.labourId });
    if (iss.returned) { t.history.push({ at: iss.returnedDate || iss.date, type: 'return', labourId: iss.labourId }); t.status = 'available'; t.holder = null; }
    else { t.status = 'in_use'; t.holder = { labourId: iss.labourId, since: iss.date, issueId: iss.id }; }
    links[iss.id] = t.id;
  });
  return { created, links };
}

/**
 * Filter + order for the list. filter: all | available | in_use | maintenance |
 * mine | returnable | overdue. Search matches name, code, holder name, location.
 */
export function filterTools(tools, { q = '', filter = 'all', cat = '', meId = '', nameOf = () => '', now = new Date() } = {}) {
  const s = q.trim().toLowerCase();
  const rank = { maintenance: 0, in_use: 1, available: 2, lost: 3 };
  return tools.filter(t => {
    if (cat && t.category !== cat) return false;
    if (filter === 'available' && t.status !== 'available') return false;
    if (filter === 'in_use' && t.status !== 'in_use') return false;
    if (filter === 'maintenance' && t.status !== 'maintenance') return false;
    if (filter === 'mine' && !(t.status === 'in_use' && t.holder && t.holder.byId === meId)) return false;
    if (filter === 'returnable' && t.returnable === false) return false;
    if (filter === 'overdue' && !isOverdue(t, now)) return false;
    if (!s) return true;
    const hay = [t.name, t.code, t.location, t.holder ? nameOf(t.holder.labourId) : ''].join(' ').toLowerCase();
    return hay.includes(s);
  }).sort((a, b) => (isOverdue(b, now) - isOverdue(a, now)) || (rank[a.status] - rank[b.status]) || a.name.localeCompare(b.name));
}

export function statusCounts(tools, now = new Date()) {
  const c = { all: tools.length, available: 0, in_use: 0, maintenance: 0, lost: 0, overdue: 0 };
  tools.forEach(t => { c[t.status] = (c[t.status] || 0) + 1; if (isOverdue(t, now)) c.overdue++; });
  return c;
}
