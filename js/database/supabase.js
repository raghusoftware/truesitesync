/**
 * ═══════════════════════════════════════════════════════════
 * True Site Sync — Supabase Client
 * ═══════════════════════════════════════════════════════════
 * Initializes and exports the Supabase client singleton.
 * ═══════════════════════════════════════════════════════════
 */

const SUPABASE_URL = 'https://cuxblomxefwgdcijmpjk.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImN1eGJsb214ZWZ3Z2RjaWptcGprIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk5MzE2ODgsImV4cCI6MjA5NTUwNzY4OH0.BPSv4rkvjIn0mYdwkfdpRc6NZXB9aOLycongwShisRU';

let _supabase = null;

export function getSupabase() {
  if (_supabase) return _supabase;
  if (!window.supabase?.createClient) {
    console.warn('[MES] Supabase SDK not loaded yet');
    return null;
  }
  _supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  return _supabase;
}

export { SUPABASE_URL, SUPABASE_ANON_KEY };
