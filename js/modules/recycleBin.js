/**
 * ═══════════════════════════════════════════════════════════
 * True Site Sync — Recycle Bin (soft delete)
 * ───────────────────────────────────────────────────────────
 * Deleting an item MOVES it into state.recycleBin and removes it from its source
 * array. The bin is the source of truth for "what's deleted": reconcileRecycleBin()
 * (state.js) re-strips binned items after every load/sync, so a stale device that
 * re-pushes a deleted record can never resurrect it. Restore puts the item back;
 * Delete Permanently drops it from the bin for good.
 * ═══════════════════════════════════════════════════════════
 */
import { state, saveAllData, saveKey, saveKeyReplace, recordPermanentDeletions } from './state.js';
import { showToast } from './utils.js';

const _who = () => { try { const u = window.getCurrentUser?.(); return u?.name || u?.email || ''; } catch { return ''; } };
const _esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/**
 * Soft-delete: move `state[key]` item with `id` into the recycle bin.
 * @returns {boolean} true if an item was moved.
 */
export function recycleDelete(key, id, type, label) {
  const arr = state[key];
  if (!Array.isArray(arr)) return false;
  const idx = arr.findIndex(x => x && x.id === id);
  if (idx < 0) return false;
  const item = arr[idx];
  arr.splice(idx, 1);
  // Auto-derive a readable label from the item if the caller didn't pass one.
  const autoLabel = label || item.name || item.title || item.invoiceNo || item.billNo ||
    item.no || item.number || item.poNo || item.sheetNum || item.abstractNum || item.raNo ||
    item.challanNo || item.docNo || item.description || item.date || String(id);
  if (!Array.isArray(state.recycleBin)) state.recycleBin = [];
  state.recycleBin.push({
    binId: 'bin_' + Date.now() + '_' + Math.floor(Math.random() * 1e6),
    key, id, type: type || key, label: autoLabel,
    item, deletedAt: new Date().toISOString(), deletedBy: _who()
  });
  saveAllData();
  return true;
}
window.recycleDelete = recycleDelete;

/** Restore a binned item back into its source array. */
export async function restoreFromBin(binId) {
  const bin = state.recycleBin || [];
  const i = bin.findIndex(e => e.binId === binId);
  if (i < 0) return;
  const e = bin[i];
  if (Array.isArray(state[e.key]) && !state[e.key].some(x => x && x.id === e.id)) {
    state[e.key].push(e.item);
  }
  bin.splice(i, 1);
  // The bin entry IS the tombstone for this record, so it must be REMOVED from the
  // cloud (hard overwrite) before the restored record is pushed — otherwise the
  // server would tombstone it straight back out of its source array.
  await saveKeyReplace('recycleBin');
  saveKey(e.key);
  showToast(`Restored ${e.type}`, 'success');
  renderRecycleBin();
  if (typeof window.refreshCurrentView === 'function') { try { window.refreshCurrentView(); } catch {} }
}
window.restoreFromBin = restoreFromBin;

/** Remove a binned item permanently (it's already gone from its source array). */
export async function permanentDelete(binId) {
  if (!confirm('Permanently delete this item? This cannot be undone.')) return;
  const entry = (state.recycleBin || []).find(e => e.binId === binId);
  // Record a lasting tombstone FIRST so the record can't be resurrected later.
  if (entry) await recordPermanentDeletions([{ key: entry.key, id: entry.id }]);
  state.recycleBin = (state.recycleBin || []).filter(e => e.binId !== binId);
  // Hard overwrite — a normal push would union the removed entry right back.
  saveKeyReplace('recycleBin');
  showToast('Permanently deleted', 'warning');
  renderRecycleBin();
}
window.permanentDelete = permanentDelete;

/** Empty the whole bin. */
export async function emptyRecycleBin() {
  if (!(state.recycleBin || []).length) return;
  if (!confirm('Empty the recycle bin? Everything in it will be permanently deleted.')) return;
  // Record lasting tombstones for every item FIRST — otherwise emptying the bin
  // removes the only "deleted" marker and stale devices resurrect the records.
  const entries = (state.recycleBin || []).map(e => ({ key: e.key, id: e.id }));
  await recordPermanentDeletions(entries);
  state.recycleBin = [];
  // Hard overwrite so the emptied bin actually sticks (the union merge can't shrink it).
  saveKeyReplace('recycleBin');
  showToast('Recycle bin emptied', 'warning');
  renderRecycleBin();
}
window.emptyRecycleBin = emptyRecycleBin;

export function renderRecycleBin() {
  const c = document.getElementById('recycleBinContent');
  if (!c) return;
  const bin = [...(state.recycleBin || [])].sort((a, b) => (b.deletedAt || '').localeCompare(a.deletedAt || ''));
  if (!bin.length) {
    c.innerHTML = `<div class="bg-white rounded-xl border border-slate-200 p-12 text-center">
      <p class="text-4xl mb-2">🗑️</p><p class="font-bold text-slate-600">Recycle bin is empty</p>
      <p class="text-xs text-slate-400 mt-1">Deleted records are moved here. You can restore them or delete them permanently.</p></div>`;
    return;
  }
  const fmtDate = s => { try { return new Date(s).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }); } catch { return s || ''; } };
  const rows = bin.map(e => `<tr class="border-b hover:bg-slate-50">
    <td class="px-3 py-2"><span class="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 border">${_esc(e.type)}</span></td>
    <td class="px-3 py-2 font-semibold text-slate-700">${_esc(e.label)}</td>
    <td class="px-3 py-2 text-slate-500 text-xs">${_esc(fmtDate(e.deletedAt))}${e.deletedBy ? ' · ' + _esc(e.deletedBy) : ''}</td>
    <td class="px-3 py-2 text-right whitespace-nowrap">
      <button onclick="window.restoreFromBin('${e.binId}')" class="text-emerald-700 bg-emerald-50 hover:bg-emerald-100 text-[11px] px-2.5 py-1 rounded font-bold mr-1">↩ Restore</button>
      <button onclick="window.permanentDelete('${e.binId}')" class="text-red-600 bg-red-50 hover:bg-red-100 text-[11px] px-2.5 py-1 rounded font-bold">Delete forever</button>
    </td></tr>`).join('');
  c.innerHTML = `
    <div class="flex items-center justify-between mb-3">
      <p class="text-xs text-slate-400">${bin.length} item${bin.length > 1 ? 's' : ''} in the bin. Restore to bring them back, or delete permanently.</p>
      <button onclick="window.emptyRecycleBin()" class="text-[11px] font-bold text-red-600 border border-red-200 bg-red-50 px-3 py-1.5 rounded-lg hover:bg-red-100">Empty bin</button>
    </div>
    <div class="bg-white border rounded-xl overflow-hidden">
      <div class="overflow-x-auto"><table class="w-full text-sm"><thead class="bg-slate-50"><tr>
        <th class="px-3 py-2 text-left font-bold uppercase text-[10px] text-slate-500">Type</th>
        <th class="px-3 py-2 text-left font-bold uppercase text-[10px] text-slate-500">Item</th>
        <th class="px-3 py-2 text-left font-bold uppercase text-[10px] text-slate-500">Deleted</th>
        <th class="px-3 py-2 text-right font-bold uppercase text-[10px] text-slate-500">Actions</th></tr></thead>
        <tbody>${rows}</tbody></table></div>
    </div>`;
}
window.renderRecycleBin = renderRecycleBin;
