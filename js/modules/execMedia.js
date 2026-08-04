/**
 * ═══════════════════════════════════════════════════════════
 * True Site Sync — Execution media & site-capture helpers
 * ───────────────────────────────────────────────────────────
 * Shared by the Execution Intelligence platform (change log + actuals) to
 * attach PHOTOS and VOICE NOTES and to stamp GPS on site records.
 *
 * SPLIT STORAGE (same design as projectDocs.js):
 *   • BYTES     → Supabase Storage, reusing the private 'project-docs' bucket
 *       under an `exec/` prefix: {orgId}/exec/{id}-{safeName}. First path
 *       segment is the org, matching the bucket RLS (user_org_ids()). No new
 *       bucket or migration needed. Large media never touches the synced JSON.
 *   • REFS ONLY → stored in execChanges / execActuals as
 *       { path, name, size, type, uploadedAt, uploadedBy }. Viewing a file
 *       fetches a short-lived signed URL on demand.
 *
 * CAPTURE:
 *   • GPS   → @capacitor/geolocation when native, else navigator.geolocation.
 *   • Photo → plain <input type=file accept=image/* capture> (no plugin).
 *   • Voice → @capacitor-community/voice-recorder when native, else the web
 *       MediaRecorder API. Both resolve to a File ready for upload().
 * ═══════════════════════════════════════════════════════════
 */
import { showToast } from './utils.js';
import { getSupabase } from '../database/supabase.js';

const BUCKET = 'project-docs';

function _orgId() {
  try { const o = localStorage.getItem('mes_org_id'); if (o) return o; } catch {}
  try { return window.getCurrentOrg?.()?.id || null; } catch {}
  return null;
}
function _who() {
  const u = (window.getCurrentUser && window.getCurrentUser()) || {};
  return u.name || u.email || 'You';
}
function _safeName(name) {
  return String(name || 'file').replace(/[^a-zA-Z0-9._-]/g, '_').slice(-80);
}
function _isNative() {
  return !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());
}

/* ─────────────────────────────────────────────────────────
 *  STORAGE
 * ───────────────────────────────────────────────────────── */

/**
 * Upload one File/Blob and return a lightweight ref to persist in state.
 * Returns null (and toasts) on failure so callers can keep going.
 */
export async function uploadExecMedia(file, kind = 'media') {
  if (!file) return null;
  const sb = getSupabase();
  const orgId = _orgId();
  if (!sb || !orgId) { showToast('Attachments need a cloud connection — sign in and sync first', 'error'); return null; }
  if (typeof navigator !== 'undefined' && navigator.onLine === false) { showToast('You are offline — connect to attach files', 'error'); return null; }

  const name = file.name || (kind + '-' + Date.now() + (file.type && file.type.includes('audio') ? '.webm' : '.jpg'));
  const id = 'em_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
  const path = `${orgId}/exec/${id}-${_safeName(name)}`;
  try {
    const { error } = await sb.storage.from(BUCKET).upload(path, file, { upsert: false, contentType: file.type || undefined });
    if (error) { console.warn('[execMedia] upload failed', name, error); showToast('Upload failed: ' + (error.message || name), 'error'); return null; }
    return { path, name, size: file.size || 0, type: file.type || '', kind, uploadedAt: new Date().toISOString(), uploadedBy: _who() };
  } catch (e) { console.warn('[execMedia] upload error', e); showToast('Upload error: ' + (e.message || e), 'error'); return null; }
}

/** Open a stored media ref via a short-lived signed URL. */
export async function openExecMedia(ref) {
  const path = typeof ref === 'string' ? ref : ref?.path;
  if (!path) return;
  const sb = getSupabase();
  if (!sb) return showToast('Cloud not connected', 'error');
  try {
    const { data, error } = await sb.storage.from(BUCKET).createSignedUrl(path, 300, { download: (ref && ref.name) || undefined });
    if (error || !data?.signedUrl) return showToast('Could not open file: ' + (error?.message || 'not found'), 'error');
    window.open(data.signedUrl, '_blank');
  } catch (e) { showToast('Open failed: ' + (e.message || e), 'error'); }
}

/** Remove bytes for a stored ref (best-effort). */
export async function removeExecMedia(ref) {
  const path = typeof ref === 'string' ? ref : ref?.path;
  if (!path) return;
  const sb = getSupabase();
  if (!sb) return;
  try { await sb.storage.from(BUCKET).remove([path]); } catch (e) { console.warn('[execMedia] remove failed', e); }
}

/* ─────────────────────────────────────────────────────────
 *  GPS
 * ───────────────────────────────────────────────────────── */

/** Best-effort current position → {lat,lng,acc} or null. Never throws. */
export async function getGps() {
  try {
    if (_isNative() && window.Capacitor?.Plugins?.Geolocation) {
      const pos = await window.Capacitor.Plugins.Geolocation.getCurrentPosition({ enableHighAccuracy: true, timeout: 8000 });
      if (pos?.coords) return { lat: +pos.coords.latitude.toFixed(6), lng: +pos.coords.longitude.toFixed(6), acc: Math.round(pos.coords.accuracy || 0) };
    }
  } catch (e) { console.warn('[execMedia] native GPS failed', e); }
  return new Promise(resolve => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) return resolve(null);
    navigator.geolocation.getCurrentPosition(
      p => resolve({ lat: +p.coords.latitude.toFixed(6), lng: +p.coords.longitude.toFixed(6), acc: Math.round(p.coords.accuracy || 0) }),
      err => { console.warn('[execMedia] web GPS failed', err); resolve(null); },
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 30000 }
    );
  });
}

export function gpsLabel(gps) {
  if (!gps || gps.lat == null) return '';
  return `${gps.lat}, ${gps.lng}${gps.acc ? ` (±${gps.acc}m)` : ''}`;
}

/* ─────────────────────────────────────────────────────────
 *  VOICE RECORDING
 *  Returns a controller: { stop(): Promise<File|null> }.
 * ───────────────────────────────────────────────────────── */

let _webRec = null;   // { mediaRecorder, chunks, stream }
let _nativeRecording = false;

/** Begin recording. Resolves to true if recording started. */
export async function startVoice() {
  // Native plugin (more reliable mic permission handling on Android).
  const VR = window.Capacitor?.Plugins?.VoiceRecorder;
  if (_isNative() && VR) {
    try {
      const can = await VR.canDeviceVoiceRecord?.();
      if (can && can.value === false) { showToast('This device cannot record audio', 'error'); return false; }
      const perm = await VR.requestAudioRecordingPermission?.();
      if (perm && perm.value === false) { showToast('Microphone permission denied', 'error'); return false; }
      await VR.startRecording();
      _nativeRecording = true;
      return true;
    } catch (e) { console.warn('[execMedia] native voice start failed', e); /* fall through to web */ }
  }
  // Web MediaRecorder (works in the Android WebView too when RECORD_AUDIO is granted).
  try {
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') { showToast('Voice recording not supported here', 'error'); return false; }
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const mr = new MediaRecorder(stream);
    const chunks = [];
    mr.ondataavailable = e => { if (e.data && e.data.size) chunks.push(e.data); };
    mr.start();
    _webRec = { mediaRecorder: mr, chunks, stream };
    return true;
  } catch (e) { console.warn('[execMedia] web voice start failed', e); showToast('Microphone unavailable: ' + (e.message || e), 'error'); return false; }
}

/** Stop recording and resolve to a File (webm/aac) ready to upload, or null. */
export async function stopVoice() {
  const VR = window.Capacitor?.Plugins?.VoiceRecorder;
  if (_nativeRecording && VR) {
    _nativeRecording = false;
    try {
      const res = await VR.stopRecording();
      const rec = res?.value;
      if (rec?.recordDataBase64) {
        const mime = rec.mimeType || 'audio/aac';
        const bytes = _b64ToBytes(rec.recordDataBase64);
        const ext = mime.includes('aac') ? 'm4a' : (mime.includes('webm') ? 'webm' : 'aac');
        return new File([bytes], `voice-${Date.now()}.${ext}`, { type: mime });
      }
    } catch (e) { console.warn('[execMedia] native voice stop failed', e); }
    return null;
  }
  const rec = _webRec; _webRec = null;
  if (!rec) return null;
  return new Promise(resolve => {
    rec.mediaRecorder.onstop = () => {
      try { rec.stream.getTracks().forEach(t => t.stop()); } catch {}
      const blob = new Blob(rec.chunks, { type: rec.chunks[0]?.type || 'audio/webm' });
      if (!blob.size) return resolve(null);
      resolve(new File([blob], `voice-${Date.now()}.webm`, { type: blob.type }));
    };
    try { rec.mediaRecorder.stop(); } catch { resolve(null); }
  });
}

export function isRecording() { return _nativeRecording || !!_webRec; }

function _b64ToBytes(b64) {
  const bin = atob(b64);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return arr;
}
