/**
 * ═══════════════════════════════════════════════════════════
 * True Site Sync — Client Error Monitoring
 * ═══════════════════════════════════════════════════════════
 * Captures uncaught errors + unhandled promise rejections and
 * reports them to the `client_errors` table so we learn about
 * problems before customers call. Insert-only; throttled.
 * ═══════════════════════════════════════════════════════════
 */

import { getSupabase } from './supabase.js';

const APP_VERSION = '1.5.48';
const MAX_REPORTS_PER_SESSION = 25;
let _reportCount = 0;
const _recent = new Set(); // de-dupe identical messages within a short window

function _shouldReport(signature) {
  if (_reportCount >= MAX_REPORTS_PER_SESSION) return false;
  if (_recent.has(signature)) return false;
  _recent.add(signature);
  setTimeout(() => _recent.delete(signature), 30000); // 30s de-dupe window
  return true;
}

async function _report({ message, source, stack }) {
  try {
    const signature = (message || '') + '|' + (source || '');
    if (!_shouldReport(signature)) return;
    _reportCount++;

    const sb = getSupabase();
    if (!sb) return;

    let userId = null, userEmail = null;
    try {
      const { data } = await sb.auth.getUser();
      userId = data?.user?.id || null;
      userEmail = data?.user?.email || null;
    } catch (_) {}

    await sb.from('client_errors').insert({
      user_id: userId,
      user_email: userEmail,
      message: (message || 'Unknown error').slice(0, 1000),
      source: (source || '').slice(0, 500),
      stack: (stack || '').slice(0, 4000),
      url: (location.href || '').slice(0, 500),
      user_agent: (navigator.userAgent || '').slice(0, 500),
      app_version: APP_VERSION
    });
  } catch (_) {
    // Never let the reporter itself throw.
  }
}

let _installed = false;
export function installErrorMonitor() {
  if (_installed) return;
  _installed = true;

  window.addEventListener('error', (e) => {
    // Ignore resource-load errors (img/script 404s) — they have no message.
    if (!e.message) return;
    _report({
      message: e.message,
      source: `${e.filename || ''}:${e.lineno || ''}:${e.colno || ''}`,
      stack: e.error?.stack || ''
    });
  });

  window.addEventListener('unhandledrejection', (e) => {
    const reason = e.reason;
    _report({
      message: reason?.message || String(reason) || 'Unhandled promise rejection',
      source: 'unhandledrejection',
      stack: reason?.stack || ''
    });
  });

  console.log('[MES] Error monitoring active');
}

/** Manually report a caught error (e.g. inside try/catch). */
export function reportError(err, context) {
  _report({
    message: err?.message || String(err),
    source: context || 'manual',
    stack: err?.stack || ''
  });
}
