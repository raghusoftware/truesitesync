/**
 * ═══════════════════════════════════════════════════════════
 * True Site Sync — Project Documents (drawings & files, foldered)
 * ───────────────────────────────────────────────────────────
 * Each project gets a file tree. Users create folders (nested) and upload
 * drawings/PDFs/photos/any file into them.
 *
 * SPLIT STORAGE, by design:
 *   • FILE BYTES  → Supabase Storage, private bucket 'project-docs', at
 *       {orgId}/{projectId}/{fileId}-{safeName}. The first path segment is the
 *       org, which the bucket's RLS checks against user_org_ids() — the same
 *       org-scoping module_data uses. Large drawings never touch the synced JSON.
 *   • METADATA    → state.projectDocs[projectId] = { folders:[], files:[] },
 *       small enough to ride the normal module_data sync, so the folder tree and
 *       file list appear on every device. Only viewing/downloading a file needs
 *       the network (private bucket → short-lived signed URL).
 * ═══════════════════════════════════════════════════════════
 */
import { state, saveAllData } from './state.js';
import { showToast } from './utils.js';
import { getSupabase } from '../database/supabase.js';

const BUCKET = 'project-docs';

// Folder the browser is currently showing (null = project root).
let _docFolder = null;

function _esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
function _q(s) { return String(s == null ? '' : s).replace(/\\/g, '\\\\').replace(/'/g, "\\'"); }

/** The org this device is synced to — first path segment + RLS key. */
function _orgId() {
  try { const o = localStorage.getItem('mes_org_id'); if (o) return o; } catch {}
  try { return window.getCurrentOrg?.()?.id || null; } catch {}
  return null;
}
function _pid() { return state.currentProjectId; }

/** Get (or lazily create) the doc store for a project. */
function _store(pid) {
  if (!state.projectDocs) state.projectDocs = {};
  if (!state.projectDocs[pid]) state.projectDocs[pid] = { folders: [], files: [] };
  const s = state.projectDocs[pid];
  if (!Array.isArray(s.folders)) s.folders = [];
  if (!Array.isArray(s.files)) s.files = [];
  return s;
}

function _fmtSize(n) {
  n = Number(n) || 0;
  if (n < 1024) return n + ' B';
  if (n < 1024 * 1024) return (n / 1024).toFixed(0) + ' KB';
  return (n / 1024 / 1024).toFixed(1) + ' MB';
}
function _fileIcon(name, type) {
  const n = (name || '').toLowerCase();
  if ((type || '').startsWith('image/') || /\.(jpe?g|png|gif|webp|bmp|svg)$/.test(n)) return '🖼️';
  if (/\.pdf$/.test(n)) return '📕';
  if (/\.(dwg|dxf|dwf)$/.test(n)) return '📐';
  if (/\.(xls|xlsx|csv)$/.test(n)) return '📊';
  if (/\.(doc|docx)$/.test(n)) return '📝';
  if (/\.(zip|rar|7z)$/.test(n)) return '🗜️';
  return '📄';
}
function _safeName(name) {
  return String(name || 'file').replace(/[^\w.\- ]+/g, '_').replace(/\s+/g, ' ').trim().slice(0, 120) || 'file';
}

/** Breadcrumb chain from root down to the current folder. */
function _folderPath(pid, folderId) {
  const s = _store(pid);
  const chain = [];
  let cur = folderId;
  let guard = 0;
  while (cur && guard++ < 100) {
    const f = s.folders.find(x => x.id === cur);
    if (!f) break;
    chain.unshift(f);
    cur = f.parentId || null;
  }
  return chain;
}

export function renderProjectDocs() {
  const c = document.getElementById('projectDocsContent');
  if (!c) return;
  const pid = _pid();
  if (!pid) { c.innerHTML = '<p class="text-sm text-slate-500 py-8 text-center">Open a project first.</p>'; return; }

  // A folder that was deleted on another device may still be selected here.
  const s = _store(pid);
  if (_docFolder && !s.folders.some(f => f.id === _docFolder)) _docFolder = null;

  const subFolders = s.folders.filter(f => (f.parentId || null) === _docFolder)
    .sort((a, b) => (a.name || '').localeCompare(b.name || ''));
  const files = s.files.filter(f => (f.folderId || null) === _docFolder)
    .sort((a, b) => new Date(b.uploadedAt || 0) - new Date(a.uploadedAt || 0));

  // ── Breadcrumb ──
  const path = _folderPath(pid, _docFolder);
  const crumbs = `<button onclick="window._docOpen('')" class="hover:text-blue-600 font-semibold ${_docFolder ? 'text-slate-500' : 'text-slate-800'}">📁 All files</button>` +
    path.map(f => ` <span class="text-slate-300">/</span> <button onclick="window._docOpen('${_q(f.id)}')" class="hover:text-blue-600 font-semibold ${f.id === _docFolder ? 'text-slate-800' : 'text-slate-500'}">${_esc(f.name)}</button>`).join('');

  // ── Folder cards ──
  const folderCards = subFolders.map(f => {
    const childFolders = s.folders.filter(x => x.parentId === f.id).length;
    const childFiles = s.files.filter(x => x.folderId === f.id).length;
    return `<div class="group bg-white border rounded-xl p-3 flex items-center gap-3 hover:shadow-md hover:border-blue-200 transition">
      <button onclick="window._docOpen('${_q(f.id)}')" class="flex items-center gap-3 flex-1 min-w-0 text-left">
        <span class="text-2xl shrink-0">📁</span>
        <span class="min-w-0">
          <span class="block font-bold text-slate-800 text-sm truncate">${_esc(f.name)}</span>
          <span class="block text-[10px] text-slate-400">${childFolders ? childFolders + ' folder(s) · ' : ''}${childFiles} file(s)</span>
        </span>
      </button>
      <span class="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition shrink-0">
        <button onclick="window._docRenameFolder('${_q(f.id)}')" class="text-slate-400 hover:text-blue-600 text-xs px-1" title="Rename">✎</button>
        <button onclick="window._docDeleteFolder('${_q(f.id)}')" class="text-slate-400 hover:text-red-600 text-xs px-1" title="Delete">🗑</button>
      </span>
    </div>`;
  }).join('');

  // ── File rows ──
  const fileRows = files.map(f => `<div class="group bg-white border rounded-xl p-3 flex items-center gap-3 hover:shadow-md transition">
      <span class="text-2xl shrink-0">${_fileIcon(f.name, f.type)}</span>
      <div class="flex-1 min-w-0">
        <div class="font-semibold text-slate-800 text-sm truncate" title="${_esc(f.name)}">${_esc(f.name)}</div>
        <div class="text-[10px] text-slate-400">${_fmtSize(f.size)} · ${f.uploadedAt ? new Date(f.uploadedAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : ''}${f.uploadedBy ? ' · ' + _esc(f.uploadedBy) : ''}</div>
      </div>
      <span class="flex items-center gap-1 shrink-0">
        <button onclick="window._docDownload('${_q(f.id)}')" class="text-blue-600 hover:text-blue-800 font-bold text-xs bg-blue-50 px-3 py-1.5 rounded">Open</button>
        <button onclick="window._docDeleteFile('${_q(f.id)}')" class="text-slate-400 hover:text-red-600 text-xs px-1 opacity-0 group-hover:opacity-100 transition" title="Delete">🗑</button>
      </span>
    </div>`).join('');

  const empty = !subFolders.length && !files.length;

  c.innerHTML = `
    <div class="flex flex-wrap items-center justify-between gap-3 mb-4">
      <div class="text-sm">${crumbs}</div>
      <div class="flex items-center gap-2">
        <button onclick="window._docNewFolder()" class="text-xs px-3 py-2 rounded-lg font-bold border border-slate-200 bg-white text-slate-700 hover:bg-slate-50">+ New folder</button>
        <button onclick="document.getElementById('docUploadInput').click()" class="text-xs px-3 py-2 rounded-lg font-bold bg-blue-600 text-white hover:bg-blue-700 shadow-sm">⬆ Upload files</button>
        <input type="file" id="docUploadInput" multiple class="hidden" onchange="window._docUpload(this.files); this.value='';">
      </div>
    </div>
    ${subFolders.length ? `<div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 mb-4">${folderCards}</div>` : ''}
    ${files.length ? `<div class="space-y-2">${fileRows}</div>` : ''}
    ${empty ? `<div class="text-center py-14 border-2 border-dashed border-slate-200 rounded-xl">
        <div class="text-4xl mb-2">🗂️</div>
        <p class="text-sm text-slate-500">This folder is empty.</p>
        <p class="text-xs text-slate-400 mt-1">Create a folder or upload drawings & documents.</p>
      </div>` : ''}
    <p id="docUploadStatus" class="text-xs text-blue-600 mt-3"></p>`;
}
window.renderProjectDocs = renderProjectDocs;

// ── Navigation ──
window._docOpen = function (folderId) { _docFolder = folderId || null; renderProjectDocs(); };

// ── Folders ──
window._docNewFolder = function () {
  const pid = _pid(); if (!pid) return;
  const name = prompt('New folder name:', '');
  if (name == null) return;
  const clean = name.trim();
  if (!clean) return;
  const s = _store(pid);
  if (s.folders.some(f => (f.parentId || null) === _docFolder && f.name.toLowerCase() === clean.toLowerCase())) {
    return showToast('A folder with that name already exists here', 'error');
  }
  s.folders.push({ id: 'fold_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6), name: clean, parentId: _docFolder, createdAt: new Date().toISOString() });
  saveAllData();
  renderProjectDocs();
  showToast('Folder created', 'success');
};

window._docRenameFolder = function (id) {
  const pid = _pid(); const s = _store(pid);
  const f = s.folders.find(x => x.id === id); if (!f) return;
  const name = prompt('Rename folder:', f.name);
  if (name == null || !name.trim()) return;
  f.name = name.trim();
  saveAllData(); renderProjectDocs(); showToast('Folder renamed', 'success');
};

/** All descendant folder ids of `id`, inclusive. */
function _descendantFolders(pid, id) {
  const s = _store(pid);
  const out = [id];
  let i = 0;
  while (i < out.length) {
    const cur = out[i++];
    s.folders.forEach(f => { if (f.parentId === cur && !out.includes(f.id)) out.push(f.id); });
  }
  return out;
}

window._docDeleteFolder = async function (id) {
  const pid = _pid(); const s = _store(pid);
  const f = s.folders.find(x => x.id === id); if (!f) return;
  const ids = _descendantFolders(pid, id);
  const files = s.files.filter(x => ids.includes(x.folderId));
  const msg = files.length
    ? `Delete "${f.name}" and everything in it?\n\nThis removes ${files.length} file(s) and any sub-folders — permanently.`
    : `Delete folder "${f.name}"?`;
  if (!confirm(msg)) return;

  // Remove the bytes first; keep metadata if storage fails so nothing is orphaned silently.
  if (files.length) {
    const sb = getSupabase();
    const paths = files.map(x => x.path).filter(Boolean);
    if (sb && paths.length) {
      try {
        const { error } = await sb.storage.from(BUCKET).remove(paths);
        if (error) { showToast('Could not delete files from storage: ' + error.message, 'error'); return; }
      } catch (e) { showToast('Storage delete failed: ' + (e.message || e), 'error'); return; }
    }
  }
  s.folders = s.folders.filter(x => !ids.includes(x.id));
  s.files = s.files.filter(x => !ids.includes(x.folderId));
  if (ids.includes(_docFolder)) _docFolder = f.parentId || null;
  saveAllData();
  renderProjectDocs();
  showToast('Folder deleted', 'success');
};

// ── Files ──
window._docUpload = async function (fileList) {
  const pid = _pid(); if (!pid) return;
  const files = Array.from(fileList || []);
  if (!files.length) return;
  const sb = getSupabase();
  const orgId = _orgId();
  if (!sb || !orgId) return showToast('Documents need a cloud connection — sign in and sync first', 'error');
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return showToast('You are offline — connect to upload files', 'error');

  const s = _store(pid);
  const statusEl = () => document.getElementById('docUploadStatus');
  let done = 0, failed = 0;
  for (const file of files) {
    const st = statusEl(); if (st) st.textContent = `Uploading ${done + failed + 1} of ${files.length}: ${file.name}…`;
    const fileId = 'doc_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
    const path = `${orgId}/${pid}/${fileId}-${_safeName(file.name)}`;
    try {
      const { error } = await sb.storage.from(BUCKET).upload(path, file, { upsert: false, contentType: file.type || undefined });
      if (error) { failed++; console.warn('[docs] upload failed', file.name, error); continue; }
      s.files.push({
        id: fileId, name: file.name, folderId: _docFolder, path,
        size: file.size, type: file.type || '',
        uploadedAt: new Date().toISOString(),
        uploadedBy: (window.getCurrentUser?.() || {}).name || (window.getCurrentUser?.() || {}).email || 'You',
      });
      saveAllData();  // persist each success so a mid-batch failure never loses prior uploads
      done++;
    } catch (e) { failed++; console.warn('[docs] upload error', file.name, e); }
  }
  const st = statusEl(); if (st) st.textContent = '';
  renderProjectDocs();
  if (done) showToast(`${done} file(s) uploaded${failed ? `, ${failed} failed` : ''}`, failed ? 'error' : 'success');
  else showToast(`Upload failed for all ${failed} file(s)`, 'error');
};

window._docDownload = async function (id) {
  const pid = _pid(); const s = _store(pid);
  const f = s.files.find(x => x.id === id); if (!f) return;
  const sb = getSupabase();
  if (!sb) return showToast('Cloud not connected', 'error');
  try {
    const { data, error } = await sb.storage.from(BUCKET).createSignedUrl(f.path, 120, { download: f.name });
    if (error || !data?.signedUrl) return showToast('Could not open file: ' + (error?.message || 'not found'), 'error');
    window.open(data.signedUrl, '_blank');
  } catch (e) { showToast('Open failed: ' + (e.message || e), 'error'); }
};

window._docDeleteFile = async function (id) {
  const pid = _pid(); const s = _store(pid);
  const f = s.files.find(x => x.id === id); if (!f) return;
  if (!confirm(`Delete "${f.name}"? This cannot be undone.`)) return;
  const sb = getSupabase();
  if (sb && f.path) {
    try {
      const { error } = await sb.storage.from(BUCKET).remove([f.path]);
      // 'not found' is fine — the row is stale; anything else, keep metadata and stop.
      if (error && !/not.?found/i.test(error.message || '')) { showToast('Could not delete from storage: ' + error.message, 'error'); return; }
    } catch (e) { showToast('Storage delete failed: ' + (e.message || e), 'error'); return; }
  }
  s.files = s.files.filter(x => x.id !== id);
  saveAllData();
  renderProjectDocs();
  showToast('File deleted', 'success');
};

/** File count for the dashboard KPI / card. */
export function projectDocsCount(pid) {
  const s = state.projectDocs?.[pid];
  return s?.files?.length || 0;
}
window.projectDocsCount = projectDocsCount;
