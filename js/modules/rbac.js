/**
 * ═══════════════════════════════════════════════════════════
 * True Site Sync — RBAC Module with Supabase Auth
 * ═══════════════════════════════════════════════════════════
 * Authentication: Supabase Auth (email/password)
 * Authorization: Local RBAC roles & permissions
 * ═══════════════════════════════════════════════════════════
 */

import { state, saveAllData, loadFromCloud, pushAllToCloud } from './state.js';
import { showToast } from './utils.js';
import { getSupabase } from '../database/supabase.js';

// ── Module definitions for access control ──
export const ACCESS_MODULES = [
  { id: 'projectDashboard', label: 'Dashboard', group: 'Project' },
  { id: 'planningView', label: 'Planning', group: 'Project' },
  { id: 'microPlanView', label: 'Micro Planning', group: 'Project' },
  { id: 'issuesView', label: 'Issues', group: 'Project' },
  { id: 'pettyCashView', label: 'Petty Cash', group: 'Project' },
  { id: 'labourView', label: 'Labour', group: 'Project' },
  { id: 'equipmentView', label: 'Equipment', group: 'Project' },
  { id: 'inventoryView', label: 'Inventory', group: 'Project' },
  { id: 'recipeView', label: 'Recipes', group: 'Project' },
  { id: 'assetsView', label: 'Tools & Assets', group: 'Project' },
  { id: 'measurementListView', label: 'Measurement', group: 'Project' },
  { id: 'abstractsView', label: 'Abstracts', group: 'Project' },
  { id: 'reportsView', label: 'Reports', group: 'General' },
  { id: 'salesLedgerView', label: 'Sale Invoices', group: 'Sale' },
  { id: 'saleOrderView', label: 'Sale Orders', group: 'Sale' },
  { id: 'proformaInvoiceView', label: 'Proforma Invoices', group: 'Sale' },
  { id: 'deliveryChallanView', label: 'Delivery Challans', group: 'Sale' },
  { id: 'estimatesView', label: 'Estimates', group: 'Sale' },
  { id: 'paymentInView', label: 'Payment In', group: 'Sale' },
  { id: 'saleReturnView', label: 'Sale Returns', group: 'Sale' },
  { id: 'otherIncomeView', label: 'Other Income', group: 'Sale' },
  { id: 'saleFixedAssetsView', label: 'Sale Fixed Assets', group: 'Sale' },
  { id: 'purchaseBillsView', label: 'Purchase Bills', group: 'Purchase' },
  { id: 'purchaseOrderView', label: 'Purchase Orders', group: 'Purchase' },
  { id: 'paymentOutView', label: 'Payment Out', group: 'Purchase' },
  { id: 'purchaseReturnView', label: 'Purchase Returns', group: 'Purchase' },
  { id: 'expensesView', label: 'Expenses', group: 'Purchase' },
  { id: 'purchaseAssetsView', label: 'Fixed Assets', group: 'Purchase' },
  { id: 'partiesLedgerView', label: 'Parties Ledger', group: 'Finance' },
  { id: 'accountsManagerView', label: 'Bank & Cash', group: 'Finance' },
  { id: 'accountingView', label: 'P&L Report', group: 'Finance' },
  { id: 'masterData', label: 'Master Data', group: 'System' },
  { id: 'settingsView', label: 'Backup', group: 'System' },
  { id: 'companyProfileView', label: 'Company', group: 'System' },
];

const ALL_MODULE_IDS = ACCESS_MODULES.map(m => m.id);

/** Group name for a sidebar button, from the nearest preceding section <p> label. */
function _sectionGroupFor(btn) {
  const MAP = { 'project modules': 'Project', 'sale': 'Sale', 'purchase': 'Purchase', 'finance': 'Finance', 'system': 'System', 'super admin': 'System' };
  let cur = btn;
  while (cur && cur.id !== 'appSidebar' && cur.tagName !== 'BODY') {
    let sib = cur.previousElementSibling;
    while (sib) {
      if (sib.tagName === 'P') { const t = (sib.textContent || '').trim(); return MAP[t.toLowerCase()] || t || 'Other'; }
      sib = sib.previousElementSibling;
    }
    cur = cur.parentElement;
  }
  return 'Other';
}

/**
 * Live module registry for RBAC. Starts from the known ACCESS_MODULES (stable
 * labels/groups/order), then auto-registers every sidebar nav button
 * ([data-target]) that isn't already listed — so ANY new module shows up in the
 * role-permissions UI automatically, with no hardcoding or redeploy.
 */
export function getAccessModules() {
  const out = ACCESS_MODULES.map(m => ({ ...m }));
  const seen = new Set(out.map(m => m.id));
  try {
    document.querySelectorAll('[data-target]').forEach(btn => {
      const id = btn.getAttribute('data-target');
      if (!id || seen.has(id) || id === 'projectsHome') return;
      const label = (btn.textContent || id).replace(/\s+/g, ' ').trim() || id;
      out.push({ id, label, group: _sectionGroupFor(btn) });
      seen.add(id);
    });
  } catch {}
  return out;
}
window.getAccessModules = getAccessModules;

const DEFAULT_ROLES = {
  Admin: { permissions: [...ALL_MODULE_IDS], isSystem: true },
  CEO: { permissions: [...ALL_MODULE_IDS] },
  Owner: { permissions: [...ALL_MODULE_IDS] },
  Accountant: { permissions: [
    'projectDashboard', 'reportsView',
    'salesLedgerView', 'saleOrderView', 'proformaInvoiceView', 'estimatesView', 'paymentInView', 'saleReturnView', 'otherIncomeView', 'saleFixedAssetsView',
    'purchaseBillsView', 'purchaseOrderView', 'paymentOutView', 'purchaseReturnView', 'expensesView', 'purchaseAssetsView',
    'partiesLedgerView', 'accountsManagerView', 'accountingView',
  ]},
  'Site Supervisor': { permissions: [
    'projectDashboard', 'planningView', 'microPlanView', 'issuesView', 'pettyCashView', 'labourView', 'equipmentView', 'inventoryView', 'recipeView', 'assetsView', 'measurementListView', 'abstractsView', 'reportsView',
  ]},
  Engineer: { permissions: [
    'projectDashboard', 'planningView', 'microPlanView', 'issuesView', 'inventoryView', 'recipeView', 'measurementListView', 'abstractsView', 'reportsView',
  ]},
};

// ── Cached auth user ──
let _cachedUser = null;

// ═══════════════════════════════════════════════
//  INIT & AUTH
// ═══════════════════════════════════════════════

export function initRBAC() {
  // Seed default roles if none exist
  if (!state.rbacRoles || !Object.keys(state.rbacRoles).length) {
    state.rbacRoles = JSON.parse(JSON.stringify(DEFAULT_ROLES));
    saveAllData();
  }
  // Migration: full-access roles (Admin/CEO/Owner) always include every module,
  // so newly-added modules (e.g. Issues, Petty Cash, Micro Planning) are granted
  // automatically on existing workspaces instead of silently missing.
  let _rolesChanged = false;
  ['Admin', 'CEO', 'Owner'].forEach(r => {
    const role = state.rbacRoles[r];
    if (!role) return;
    role.permissions = role.permissions || [];
    ALL_MODULE_IDS.forEach(id => { if (!role.permissions.includes(id)) { role.permissions.push(id); _rolesChanged = true; } });
  });
  if (_rolesChanged) saveAllData();
  // No default/seed user — the first person who logs in (via Supabase) becomes
  // the Admin of their own workspace (see _ensureRbacUser).
  if (!state.rbacUsers) { state.rbacUsers = []; saveAllData(); }
}

/**
 * Get the current Supabase Auth user
 */
export function getCurrentUser() {
  if (_cachedUser) return _cachedUser;
  const sb = getSupabase();
  if (!sb) return _getFallbackUser();
  // Synchronous check from cached session
  try {
    const storageKey = Object.keys(localStorage).find(k => k.startsWith('sb-') && k.endsWith('-auth-token'));
    if (storageKey) {
      const raw = localStorage.getItem(storageKey);
      if (raw) {
        const parsed = JSON.parse(raw);
        const user = parsed?.user || parsed?.currentSession?.user;
        if (user) {
          _cachedUser = _mapSupabaseUser(user);
          return _cachedUser;
        }
      }
    }
  } catch {}
  return _getFallbackUser();
}

function _getFallbackUser() {
  // Fallback: check old session storage for backward compat
  try {
    const raw = sessionStorage.getItem('mes_current_user');
    if (!raw) return null;
    const session = JSON.parse(raw);
    return (state.rbacUsers || []).find(u => u.id === session.userId && u.active) || null;
  } catch { return null; }
}

function _mapSupabaseUser(supaUser) {
  const meta = supaUser.user_metadata || {};
  // Map to our internal user format. IMPORTANT: match the RBAC entry by
  // supabaseId OR email — an admin-created teammate (Add User) has the role set
  // but no supabaseId until they log in, so a supabaseId-only match would miss it
  // and fall back to 'Admin', silently bypassing all role permissions.
  const em = (supaUser.email || '').trim().toLowerCase();
  const rbacUser = (state.rbacUsers || []).find(u => u.supabaseId === supaUser.id)
    || (em ? (state.rbacUsers || []).find(u => ((u.email || u.username || '').trim().toLowerCase() === em)) : null);
  const role = rbacUser?.role || meta.role || 'Admin';
  return {
    id: rbacUser?.id || 'usr_supa_' + supaUser.id.substring(0, 8),
    supabaseId: supaUser.id,
    name: rbacUser?.name || meta.display_name || meta.name || supaUser.email?.split('@')[0] || 'User',
    username: supaUser.email,
    email: supaUser.email,
    role,
    active: true,
  };
}

export function isLoggedIn() {
  return !!getCurrentUser();
}

// ═══════════════════════════════════════════════
//  PROJECT-SCOPED ACCESS (team members see only their assigned projects)
// ═══════════════════════════════════════════════

/** The current user's rbacUsers entry (stable id source for project.teamMembers). */
export function getMyRbacUser() {
  const u = getCurrentUser();
  if (!u) return null;
  const users = state.rbacUsers || [];
  return users.find(r => (u.supabaseId && r.supabaseId === u.supabaseId))
      || users.find(r => r.id === u.id)
      || (u.email ? users.find(r => (r.email || r.username || '').trim().toLowerCase() === u.email.trim().toLowerCase()) : null)
      || null;
}

/** True if the current user is an Admin (sees ALL projects/data). Reads the live
 *  rbacUsers role (not the possibly-stale cached session role). Defaults to true
 *  when we can't resolve a user, so single-user/local mode is never locked out. */
export function isCurrentUserAdmin() {
  const me = getMyRbacUser();
  if (!me) { const u = getCurrentUser(); return !u || u.role === 'Admin'; }
  return me.role === 'Admin';
}

/** Projects the current user may access: all for admins, else only those whose
 *  teamMembers include this user's rbac id. */
export function getVisibleProjects() {
  const all = state.projects || [];
  if (isCurrentUserAdmin()) return all;
  const me = getMyRbacUser();
  const myId = me?.id;
  if (!myId) return all; // can't resolve identity → don't hide everything
  return all.filter(p => Array.isArray(p.teamMembers) && p.teamMembers.includes(myId));
}

/** True if the current user may open/see the given project. */
export function userCanAccessProject(projId) {
  if (isCurrentUserAdmin()) return true;
  return getVisibleProjects().some(p => p.id === projId);
}

if (typeof window !== 'undefined') {
  window.getMyRbacUser = getMyRbacUser;
  window.isCurrentUserAdmin = isCurrentUserAdmin;
  window.getVisibleProjects = getVisibleProjects;
  window.userCanAccessProject = userCanAccessProject;
}

/**
 * Supabase email/password sign in
 */
export async function loginUserSupabase(email, password) {
  const sb = getSupabase();
  if (!sb) return { error: 'Supabase not initialized' };

  const { data, error } = await sb.auth.signInWithPassword({ email, password });
  if (error) {
    if (error.message.toLowerCase().includes('email not confirmed')) {
      return { error: 'Your email is not confirmed yet. Please check your inbox and click the confirmation link.' };
    }
    return { error: error.message };
  }

  _cachedUser = _mapSupabaseUser(data.user);

  // Ensure this user has an RBAC record
  _ensureRbacUser(data.user);

  return { user: _cachedUser };
}

/**
 * Supabase email/password sign up
 */
export async function signupUserSupabase(email, password, displayName) {
  const sb = getSupabase();
  if (!sb) return { error: 'Supabase not initialized' };

  const redirectUrl = window.location.origin + window.location.pathname;

  const { data, error } = await sb.auth.signUp({
    email,
    password,
    options: {
      data: { display_name: displayName || email.split('@')[0], role: 'Admin' },
      emailRedirectTo: redirectUrl
    }
  });
  if (error) return { error: error.message };

  // Duplicate email — Supabase returns user with empty identities
  if (data.user && data.user.identities?.length === 0) {
    return { error: 'This email is already registered. Please sign in instead.' };
  }

  // If session exists, email confirmation is disabled — auto-login
  if (data.session) {
    _cachedUser = _mapSupabaseUser(data.user);
    _ensureRbacUser(data.user);
    // NOTE: do NOT bulk-push here. If this account was invited into an existing
    // organization, _resolveOrg() joins that org and a blind pushAllToCloud would
    // overwrite the whole company's shared data with this new user's empty state.
    // handleLogin() seeds the cloud ONLY when the org is brand-new (see below).
    return { user: _cachedUser };
  }

  // Email confirmation required
  return {
    needsConfirmation: true,
    email: email,
    message: `We've sent a confirmation link to ${email}. Please check your inbox and click the link to activate your account.`
  };
}

export function _ensureRbacUser(supaUser) {
  if (!state.rbacUsers) state.rbacUsers = [];
  // Drop the legacy seeded local "admin" placeholder (pre-Supabase) if present
  const before = state.rbacUsers.length;
  state.rbacUsers = state.rbacUsers.filter(u => !(u.id === 'usr_admin' || (u.username === 'admin' && !u.supabaseId)));
  let changed = state.rbacUsers.length !== before;

  const existing = state.rbacUsers.find(u => u.supabaseId === supaUser.id);
  if (!existing) {
    // RECONCILE BY EMAIL: if an admin pre-created this teammate via "Add User"
    // (no supabaseId yet), link THIS login to that same entry — keeping the
    // admin-assigned role + project assignments. Its id is stable, so any
    // project.teamMembers references to it stay valid. Only when there's no
    // matching entry at all is this a genuinely new self-signup (the org
    // owner / first user) → create a fresh Admin entry.
    const email = (supaUser.email || '').trim().toLowerCase();
    const byEmail = email ? state.rbacUsers.find(u =>
      !u.supabaseId && ((u.email || '').trim().toLowerCase() === email || (u.username || '').trim().toLowerCase() === email)
    ) : null;
    if (byEmail) {
      byEmail.supabaseId = supaUser.id;
      if (!byEmail.name) byEmail.name = supaUser.user_metadata?.display_name || supaUser.email?.split('@')[0];
      byEmail.email = supaUser.email;
      byEmail.username = supaUser.email;
      byEmail.active = byEmail.active !== false;
      // role + assignments intentionally preserved (admin assigned them)
      changed = true;
    } else {
      state.rbacUsers.push({
        id: 'usr_supa_' + supaUser.id.substring(0, 8),
        supabaseId: supaUser.id,
        name: supaUser.user_metadata?.display_name || supaUser.email?.split('@')[0],
        username: supaUser.email,
        email: supaUser.email,
        phone: supaUser.user_metadata?.phone || supaUser.phone || '',
        role: 'Admin',
        active: true,
        createdAt: new Date().toISOString(),
      });
      changed = true;
    }
  }
  if (changed) { _cachedUser = null; saveAllData(); } // re-derive role after linking the entry
}

/**
 * Logout — clears Supabase session and old session
 */
export async function logoutUser() {
  const sb = getSupabase();
  if (sb) {
    try { await sb.auth.signOut(); } catch {}
  }
  _cachedUser = null;
  _isSignupMode = false;
  sessionStorage.removeItem('mes_current_user');
  // Reset login form so it can be re-upgraded
  const loginEl = document.getElementById('loginPage');
  if (loginEl) delete loginEl.dataset.upgraded;
  showLoginPage();
}

/**
 * Google OAuth sign in
 */
export async function loginWithGoogle() {
  const sb = getSupabase();
  if (!sb) { showToast('Supabase not initialized', 'error'); return; }

  const isDesktop = window.location.protocol === 'file:';
  const isCapacitor = window.location.protocol === 'https:' && navigator.userAgent.includes('TrueSiteSync-Android');

  const opts = { provider: 'google' };
  if (isCapacitor) {
    // Capacitor: redirect back to the app's https://localhost URL
    opts.options = { redirectTo: window.location.origin + '/' };
  } else if (!isDesktop) {
    opts.options = { redirectTo: window.location.origin + window.location.pathname };
  }

  const { error } = await sb.auth.signInWithOAuth(opts);
  if (error) {
    showToast('Google sign-in failed: ' + error.message, 'error');
  }
}

// Legacy wrapper for backward compat (used by old onclick handlers)
export function loginUser(username, password) {
  // This is now async — but kept for onclick wiring
  // Real auth goes through handleLogin
  const user = (state.rbacUsers || []).find(u =>
    u.username === username && u.password === password && u.active
  );
  if (!user) return false;
  sessionStorage.setItem('mes_current_user', JSON.stringify({ userId: user.id, loginAt: new Date().toISOString() }));
  return user;
}

// ═══════════════════════════════════════════════
//  ACCESS CHECK
// ═══════════════════════════════════════════════

export function hasAccess(viewId) {
  const user = getCurrentUser();
  if (!user) return false;
  if (user.role === 'Admin') return true;
  if (viewId === 'projectsHome') return true;
  const role = (state.rbacRoles || {})[user.role];
  if (!role) return false;
  return (role.permissions || []).includes(viewId);
}

export function enforceAccess(viewId) {
  if (!isLoggedIn()) { showLoginPage(); return false; }
  if (viewId === 'projectsHome') return true;
  if (!hasAccess(viewId)) {
    showToast('Access denied — you do not have permission for this module', 'error');
    return false;
  }
  return true;
}

export function hideRestrictedSidebar() {
  const user = getCurrentUser();
  if (!user) return;
  document.querySelectorAll('[data-target]').forEach(btn => {
    const viewId = btn.dataset.target;
    if (viewId === 'projectsHome') return;
    if (user.role === 'Admin') { btn.style.display = ''; return; }
    const role = (state.rbacRoles || {})[user.role];
    const allowed = role && role.permissions && role.permissions.includes(viewId);
    btn.style.display = allowed ? '' : 'none';
  });
  document.querySelectorAll('aside nav p').forEach(header => {
    const next = header.nextElementSibling;
    if (!next) return;
    if (next.classList && next.classList.contains('sidebar-dropdown')) {
      const visibleBtns = next.querySelectorAll('[data-target]');
      const anyVisible = Array.from(visibleBtns).some(b => b.style.display !== 'none');
      header.style.display = anyVisible ? '' : 'none';
    }
  });
}

// ═══════════════════════════════════════════════
//  LOGIN PAGE
// ═══════════════════════════════════════════════

export function showLoginPage() {
  const appEl = document.getElementById('appContainer');
  const loginEl = document.getElementById('loginPage');
  if (appEl) appEl.style.display = 'none';
  if (loginEl) {
    loginEl.style.display = 'flex';
    // Update login form for Supabase auth
    _upgradeLoginForm();
    setTimeout(() => { const el = document.getElementById('loginEmail'); if (el) el.focus(); }, 100);
  }
}

function _upgradeLoginForm() {
  const loginEl = document.getElementById('loginPage');
  if (!loginEl || loginEl.dataset.upgraded) return;
  loginEl.dataset.upgraded = 'true';

  loginEl.innerHTML = `
    <div style="width:420px;background:#fff;border-radius:24px;padding:44px 40px;box-shadow:0 25px 60px rgba(0,0,0,.4);">
      <div style="text-align:center;margin-bottom:28px;">
        <img src="assets/logo.png" alt="True Site Sync" style="display:block;width:84px;height:84px;object-fit:contain;border-radius:16px;margin:0 auto 12px;">
        <h2 style="font-size:22px;font-weight:800;color:#0f172a;margin:0 0 4px;">Welcome to True Site Sync</h2>
        <p style="font-size:13px;color:#64748b;margin:0;" id="loginSubtitle">Sign in to your account</p>
      </div>

      <div id="loginError" style="display:none;background:#fef2f2;border:1px solid #fecaca;color:#dc2626;padding:10px 14px;border-radius:10px;font-size:12px;font-weight:600;margin-bottom:16px;text-align:center;"></div>
      <div id="loginSuccess" style="display:none;background:#f0fdf4;border:1px solid #bbf7d0;color:#16a34a;padding:10px 14px;border-radius:10px;font-size:12px;font-weight:600;margin-bottom:16px;text-align:center;"></div>

      <!-- OAuth Buttons -->
      <div style="margin-bottom:20px;">
        <button onclick="window._rbacGoogleLogin()" style="width:100%;padding:13px 16px;background:#fff;border:2px solid #e2e8f0;border-radius:12px;font-size:14px;font-weight:600;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:10px;color:#334155;transition:all .15s;" onmouseover="this.style.borderColor='#3b82f6';this.style.background='#f8fafc'" onmouseout="this.style.borderColor='#e2e8f0';this.style.background='#fff'">
          <svg width="20" height="20" viewBox="0 0 24 24"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18A10.96 10.96 0 0 0 1 12c0 1.77.42 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/></svg>
          Continue with Google
        </button>
      </div>

      <!-- Divider -->
      <div style="display:flex;align-items:center;gap:12px;margin-bottom:20px;">
        <div style="flex:1;height:1px;background:#e2e8f0;"></div>
        <span style="font-size:11px;color:#94a3b8;font-weight:600;text-transform:uppercase;letter-spacing:1px;">or</span>
        <div style="flex:1;height:1px;background:#e2e8f0;"></div>
      </div>

      <!-- Email/Password Form -->
      <div id="signInForm">
        <div id="signupNameField" style="display:none;margin-bottom:14px;">
          <label style="display:block;font-size:10px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:1px;margin-bottom:6px;">Full Name</label>
          <input type="text" id="signupName" style="width:100%;padding:12px 14px;border:2px solid #e2e8f0;border-radius:12px;font-size:14px;font-weight:600;outline:none;box-sizing:border-box;transition:border .15s;" placeholder="Your full name" onfocus="this.style.borderColor='#3b82f6'" onblur="this.style.borderColor='#e2e8f0'">
        </div>
        <div style="margin-bottom:14px;">
          <label style="display:block;font-size:10px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:1px;margin-bottom:6px;">Email</label>
          <input type="email" id="loginEmail" style="width:100%;padding:12px 14px;border:2px solid #e2e8f0;border-radius:12px;font-size:14px;font-weight:600;outline:none;box-sizing:border-box;transition:border .15s;" placeholder="your@email.com" onfocus="this.style.borderColor='#3b82f6'" onblur="this.style.borderColor='#e2e8f0'" onkeydown="if(event.key==='Enter')window._rbacHandleLogin()">
        </div>
        <div style="margin-bottom:22px;">
          <label style="display:block;font-size:10px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:1px;margin-bottom:6px;">Password</label>
          <input type="password" id="loginPassword" style="width:100%;padding:12px 14px;border:2px solid #e2e8f0;border-radius:12px;font-size:14px;font-weight:600;outline:none;box-sizing:border-box;transition:border .15s;" placeholder="Min. 6 characters" onfocus="this.style.borderColor='#3b82f6'" onblur="this.style.borderColor='#e2e8f0'" onkeydown="if(event.key==='Enter')window._rbacHandleLogin()">
        </div>
        <div id="forgotPwRow" style="text-align:right;margin-top:-12px;margin-bottom:16px;">
          <a href="#" onclick="window._rbacForgotPassword();return false;" style="font-size:11px;color:#3b82f6;font-weight:600;text-decoration:none;">Forgot password?</a>
        </div>
        <button id="loginBtn" onclick="window._rbacHandleLogin()" style="width:100%;padding:14px;background:linear-gradient(135deg,#3b82f6,#1d4ed8);color:#fff;border:none;border-radius:12px;font-size:15px;font-weight:700;cursor:pointer;box-shadow:0 4px 14px rgba(59,130,246,.35);transition:opacity .15s;" onmouseover="this.style.opacity='0.92'" onmouseout="this.style.opacity='1'">Sign In</button>
        <p style="text-align:center;margin-top:18px;font-size:12px;color:#64748b;">
          <span id="authToggleText">Don't have an account?</span>
          <a href="#" onclick="window._rbacToggleAuth();return false;" style="color:#3b82f6;font-weight:700;text-decoration:none;margin-left:4px;" id="authToggleLink">Create Account</a>
        </p>
      </div>

      <!-- Sync indicator -->
      <div id="loginSyncStatus" style="display:none;text-align:center;margin-top:14px;">
        <div style="display:inline-flex;align-items:center;gap:6px;font-size:11px;color:#3b82f6;font-weight:600;">
          <svg style="width:14px;height:14px;animation:spin 1s linear infinite;" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" stroke-width="2" stroke-dasharray="30 60"/></svg>
          <span id="syncStatusText">Syncing your data...</span>
        </div>
      </div>
    </div>
    <style>@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}</style>
  `;
}

let _isSignupMode = false;

export function toggleAuthMode() {
  _isSignupMode = !_isSignupMode;
  const nameField = document.getElementById('signupNameField');
  const subtitle = document.getElementById('loginSubtitle');
  const btn = document.getElementById('loginBtn');
  const toggleText = document.getElementById('authToggleText');
  const toggleLink = document.getElementById('authToggleLink');
  const errEl = document.getElementById('loginError');
  const successEl = document.getElementById('loginSuccess');

  if (errEl) errEl.style.display = 'none';
  if (successEl) successEl.style.display = 'none';
  const forgotRow = document.getElementById('forgotPwRow');

  if (_isSignupMode) {
    if (nameField) nameField.style.display = '';
    if (forgotRow) forgotRow.style.display = 'none';
    if (subtitle) subtitle.textContent = 'Create a new account';
    if (btn) btn.textContent = 'Create Account';
    if (toggleText) toggleText.textContent = 'Already have an account?';
    if (toggleLink) toggleLink.textContent = 'Sign In';
  } else {
    if (forgotRow) forgotRow.style.display = '';
    if (nameField) nameField.style.display = 'none';
    if (subtitle) subtitle.textContent = 'Sign in to your account';
    if (btn) btn.textContent = 'Sign In';
    if (toggleText) toggleText.textContent = "Don't have an account?";
    if (toggleLink) toggleLink.textContent = 'Create Account';
  }
}

function _showConfirmationScreen(email) {
  const loginEl = document.getElementById('loginPage');
  if (!loginEl) return;

  loginEl.innerHTML = `
    <div style="width:420px;background:#fff;border-radius:24px;padding:44px 40px;box-shadow:0 25px 60px rgba(0,0,0,.4);text-align:center;">
      <div style="width:64px;height:64px;background:linear-gradient(135deg,#22c55e,#16a34a);border-radius:50%;display:inline-flex;align-items:center;justify-content:center;margin-bottom:20px;">
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>
      </div>
      <h2 style="font-size:20px;font-weight:800;color:#0f172a;margin:0 0 8px;">Check Your Email</h2>
      <p style="font-size:14px;color:#64748b;margin:0 0 6px;line-height:1.5;">We've sent a confirmation link to</p>
      <p style="font-size:15px;font-weight:700;color:#1e3a8a;margin:0 0 24px;word-break:break-all;">${email}</p>
      <div style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:12px;padding:16px;margin-bottom:18px;text-align:left;">
        <p style="font-size:12px;color:#1e3a8a;font-weight:700;margin:0 0 8px;">Enter the 6-digit code from the email</p>
        <input id="signupOtp" type="text" inputmode="numeric" maxlength="8" placeholder="Enter code" style="width:100%;padding:12px 14px;border:2px solid #e2e8f0;border-radius:10px;font-size:18px;font-weight:700;letter-spacing:4px;text-align:center;outline:none;box-sizing:border-box;margin-bottom:10px;" onkeydown="if(event.key==='Enter')window._rbacVerifySignupOtp('${email}')">
        <button onclick="window._rbacVerifySignupOtp('${email}')" id="otpVerifyBtn" style="width:100%;padding:12px;background:linear-gradient(135deg,#3b82f6,#1d4ed8);color:#fff;border:none;border-radius:10px;font-size:14px;font-weight:700;cursor:pointer;">Verify &amp; Continue</button>
        <p style="font-size:10px;color:#94a3b8;margin:8px 0 0;text-align:center;">…or just click the confirmation link in the email.</p>
      </div>
      <p style="font-size:11px;color:#94a3b8;margin:0 0 16px;">Didn't receive it? Check spam or</p>
      <button onclick="window._rbacResendConfirmation('${email}')" id="resendBtn" style="background:none;border:2px solid #e2e8f0;border-radius:10px;padding:10px 20px;font-size:13px;font-weight:600;color:#3b82f6;cursor:pointer;transition:all .15s;" onmouseover="this.style.borderColor='#3b82f6';this.style.background='#eff6ff'" onmouseout="this.style.borderColor='#e2e8f0';this.style.background='none'">Resend Confirmation Email</button>
      <div style="margin-top:20px;border-top:1px solid #e2e8f0;padding-top:16px;">
        <a href="#" onclick="window._rbacBackToLogin();return false;" style="font-size:12px;color:#64748b;text-decoration:none;font-weight:600;">&#8592; Back to Sign In</a>
      </div>
    </div>
  `;
}

export async function resendConfirmation(email) {
  const sb = getSupabase();
  if (!sb) return;
  const btn = document.getElementById('resendBtn');
  if (btn) { btn.disabled = true; btn.textContent = 'Sending...'; btn.style.opacity = '0.6'; }

  try {
    const { error } = await sb.auth.resend({
      type: 'signup',
      email,
      options: { emailRedirectTo: window.location.origin + window.location.pathname }
    });
    if (error) {
      showToast('Failed to resend: ' + error.message, 'error');
    } else {
      showToast('Confirmation email resent!', 'success');
    }
  } catch {
    showToast('Could not resend email. Try again later.', 'error');
  }
  if (btn) { btn.disabled = false; btn.textContent = 'Resend Confirmation Email'; btn.style.opacity = '1'; }
}

export function backToLogin() {
  const loginEl = document.getElementById('loginPage');
  if (loginEl) {
    loginEl.dataset.upgraded = '';
    _isSignupMode = false;
    _upgradeLoginForm();
    setTimeout(() => { const el = document.getElementById('loginEmail'); if (el) el.focus(); }, 100);
  }
}

/** Verify the 6-digit signup email OTP and log the user in. */
export async function verifySignupOtp(email) {
  const sb = getSupabase();
  if (!sb) return;
  const token = (document.getElementById('signupOtp')?.value || '').trim();
  if (token.length < 6) { showToast('Enter the 6-digit code', 'error'); return; }
  const btn = document.getElementById('otpVerifyBtn');
  if (btn) { btn.disabled = true; btn.textContent = 'Verifying…'; btn.style.opacity = '0.7'; }
  try {
    let { error } = await sb.auth.verifyOtp({ email, token, type: 'signup' });
    if (error) { const r = await sb.auth.verifyOtp({ email, token, type: 'email' }); if (r.error) throw error; }
    const { data: { user } } = await sb.auth.getUser();
    if (user) { _cachedUser = _mapSupabaseUser(user); _ensureRbacUser(user); }
    try { await pushAllToCloud(); } catch {}
    if (typeof window._bootApp === 'function') window._bootApp();
    showToast('Email verified — welcome!', 'success');
  } catch (e) {
    showToast(e.message || 'Invalid or expired code. Try again.', 'error');
    if (btn) { btn.disabled = false; btn.textContent = 'Verify & Continue'; btn.style.opacity = '1'; }
  }
}

/** Send a password-reset email to the address in the login form. */
// Email of the account currently going through a code-based password reset.
let _recoveryEmail = '';

export function forgotPassword() {
  // Open the self-contained reset screen (prefill the email if already typed).
  const prefill = (document.getElementById('loginEmail')?.value || '').trim();
  showPasswordResetCodeScreen(prefill);
}

/** Self-contained reset screen: enter email → send code → enter code + new password. */
export function showPasswordResetCodeScreen(prefillEmail) {
  const loginEl = document.getElementById('loginPage');
  const app = document.getElementById('appContainer');
  if (app) app.style.display = 'none';
  if (!loginEl) return;
  loginEl.dataset.upgraded = '';
  loginEl.style.display = 'flex';
  const inp = 'width:100%;padding:12px 14px;border:2px solid #e2e8f0;border-radius:12px;font-size:14px;font-weight:600;outline:none;box-sizing:border-box;margin-bottom:12px;';
  loginEl.innerHTML = `
    <div style="width:420px;background:#fff;border-radius:24px;padding:44px 40px;box-shadow:0 25px 60px rgba(0,0,0,.4);">
      <div style="text-align:center;margin-bottom:20px;">
        <img src="assets/logo.png" alt="True Site Sync" style="display:block;width:72px;height:72px;object-fit:contain;border-radius:14px;margin:0 auto 12px;">
        <h2 style="font-size:20px;font-weight:800;color:#0f172a;margin:0 0 6px;">Reset Your Password</h2>
        <p style="font-size:13px;color:#64748b;margin:0;">Enter your email to get a 6-digit reset code.</p>
      </div>
      <div id="prError" style="display:none;background:#fef2f2;border:1px solid #fecaca;color:#dc2626;padding:10px 14px;border-radius:10px;font-size:12px;font-weight:600;margin-bottom:14px;text-align:center;"></div>
      <div id="prHint" style="display:none;background:#f0fdf4;border:1px solid #bbf7d0;color:#16a34a;padding:10px 14px;border-radius:10px;font-size:12px;font-weight:600;margin-bottom:14px;text-align:center;"></div>
      <input id="prEmail" type="email" placeholder="your@email.com" value="${(prefillEmail || '').replace(/"/g, '&quot;')}" style="${inp}" onkeydown="if(event.key==='Enter')window._rbacSendResetCode()">
      <button id="prSendBtn" onclick="window._rbacSendResetCode()" style="width:100%;padding:13px;background:linear-gradient(135deg,#059669,#10b981);color:#fff;border:none;border-radius:12px;font-size:14px;font-weight:700;cursor:pointer;margin-bottom:18px;">Send Reset Code</button>
      <div style="border-top:1px solid #f1f5f9;padding-top:16px;">
        <input id="prCode" inputmode="numeric" autocomplete="one-time-code" maxlength="8" placeholder="6-digit code from email" style="${inp}text-align:center;letter-spacing:4px;font-size:18px;font-weight:700;">
        <input id="prPass" type="password" placeholder="New password (min 6)" style="${inp}">
        <input id="prPass2" type="password" placeholder="Confirm new password" style="${inp}margin-bottom:18px;" onkeydown="if(event.key==='Enter')window._rbacResetWithCode()">
        <button id="prBtn" onclick="window._rbacResetWithCode()" style="width:100%;padding:14px;background:linear-gradient(135deg,#3b82f6,#1d4ed8);color:#fff;border:none;border-radius:12px;font-size:15px;font-weight:700;cursor:pointer;">Update Password</button>
      </div>
      <p style="text-align:center;margin:16px 0 0;"><a href="#" onclick="window._rbacShowLogin&&window._rbacShowLogin();return false;" style="font-size:12px;color:#64748b;font-weight:600;text-decoration:none;">Back to sign in</a></p>
    </div>`;
  setTimeout(() => document.getElementById('prEmail')?.focus(), 50);
}

/** Send the recovery code email to the address in the reset screen. */
export async function sendResetCode() {
  const sb = getSupabase();
  if (!sb) return;
  const email = (document.getElementById('prEmail')?.value || '').trim();
  const err = document.getElementById('prError');
  const hint = document.getElementById('prHint');
  const showErr = m => { if (err) { err.textContent = m; err.style.display = 'block'; } if (hint) hint.style.display = 'none'; };
  if (err) err.style.display = 'none';
  if (!/^.+@.+\..+$/.test(email)) return showErr('Enter a valid email address');
  const btn = document.getElementById('prSendBtn');
  if (btn) { btn.disabled = true; btn.textContent = 'Sending…'; btn.style.opacity = '0.7'; }
  try {
    const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: window.location.origin + window.location.pathname });
    if (error) throw error;
    _recoveryEmail = email;
    if (hint) { hint.textContent = '✅ Code sent to ' + email + '. Enter it below with your new password.'; hint.style.display = 'block'; }
    if (btn) { btn.textContent = 'Resend Code'; btn.disabled = false; btn.style.opacity = '1'; }
    document.getElementById('prCode')?.focus();
  } catch (e) {
    showErr(e.message || 'Could not send reset email. Please try again.');
    if (btn) { btn.disabled = false; btn.textContent = 'Send Reset Code'; btn.style.opacity = '1'; }
  }
}

/** Verify the emailed recovery code, then set the new password and sign in. */
export async function resetWithCode() {
  const sb = getSupabase();
  if (!sb) return;
  const email = (document.getElementById('prEmail')?.value || '').trim() || _recoveryEmail;
  const code = (document.getElementById('prCode')?.value || '').trim();
  const p1 = document.getElementById('prPass')?.value || '';
  const p2 = document.getElementById('prPass2')?.value || '';
  const err = document.getElementById('prError');
  const showErr = m => { if (err) { err.textContent = m; err.style.display = 'block'; } };
  if (err) err.style.display = 'none';
  if (!email) return showErr('Enter your email and tap "Send Reset Code" first');
  if (code.length < 6) return showErr('Enter the 6-digit code from your email');
  if (p1.length < 6) return showErr('Password must be at least 6 characters');
  if (p1 !== p2) return showErr('Passwords do not match');
  const btn = document.getElementById('prBtn');
  if (btn) { btn.disabled = true; btn.textContent = 'Verifying…'; btn.style.opacity = '0.7'; }
  try {
    const { error: vErr } = await sb.auth.verifyOtp({ email, token: code, type: 'recovery' });
    if (vErr) throw vErr;
    const { error } = await sb.auth.updateUser({ password: p1 });
    if (error) throw error;
    const { data: { user } } = await sb.auth.getUser();
    if (user) { _cachedUser = _mapSupabaseUser(user); _ensureRbacUser(user); }
    showToast('Password updated — signed in!', 'success');
    try { await loadFromCloud(); } catch {}
    if (typeof window._bootApp === 'function') window._bootApp();
  } catch (e) {
    showErr(e.message || 'Invalid or expired code. Request a new one.');
    if (btn) { btn.disabled = false; btn.textContent = 'Update Password'; btn.style.opacity = '1'; }
  }
}

/** Shown when the user returns from a password-reset email (PASSWORD_RECOVERY). */
export function showPasswordResetScreen() {
  const loginEl = document.getElementById('loginPage');
  const app = document.getElementById('appContainer');
  if (app) app.style.display = 'none';
  if (!loginEl) return;
  loginEl.dataset.upgraded = '';
  loginEl.style.display = 'flex';
  loginEl.innerHTML = `
    <div style="width:420px;background:#fff;border-radius:24px;padding:44px 40px;box-shadow:0 25px 60px rgba(0,0,0,.4);">
      <h2 style="font-size:20px;font-weight:800;color:#0f172a;margin:0 0 6px;text-align:center;">Set a New Password</h2>
      <p style="font-size:13px;color:#64748b;margin:0 0 22px;text-align:center;">Enter a new password for your account.</p>
      <div id="prError" style="display:none;background:#fef2f2;border:1px solid #fecaca;color:#dc2626;padding:10px 14px;border-radius:10px;font-size:12px;font-weight:600;margin-bottom:16px;text-align:center;"></div>
      <input id="prPass" type="password" placeholder="New password (min 6)" style="width:100%;padding:12px 14px;border:2px solid #e2e8f0;border-radius:12px;font-size:14px;font-weight:600;outline:none;box-sizing:border-box;margin-bottom:12px;">
      <input id="prPass2" type="password" placeholder="Confirm new password" style="width:100%;padding:12px 14px;border:2px solid #e2e8f0;border-radius:12px;font-size:14px;font-weight:600;outline:none;box-sizing:border-box;margin-bottom:18px;" onkeydown="if(event.key==='Enter')window._rbacSubmitNewPassword()">
      <button id="prBtn" onclick="window._rbacSubmitNewPassword()" style="width:100%;padding:14px;background:linear-gradient(135deg,#3b82f6,#1d4ed8);color:#fff;border:none;border-radius:12px;font-size:15px;font-weight:700;cursor:pointer;">Update Password</button>
    </div>`;
}

/** Apply the new password (during a recovery session) and enter the app. */
export async function submitNewPassword() {
  const sb = getSupabase();
  if (!sb) return;
  const p1 = document.getElementById('prPass')?.value || '';
  const p2 = document.getElementById('prPass2')?.value || '';
  const err = document.getElementById('prError');
  const showErr = m => { if (err) { err.textContent = m; err.style.display = 'block'; } };
  if (p1.length < 6) return showErr('Password must be at least 6 characters');
  if (p1 !== p2) return showErr('Passwords do not match');
  const btn = document.getElementById('prBtn');
  if (btn) { btn.disabled = true; btn.textContent = 'Updating…'; btn.style.opacity = '0.7'; }
  try {
    const { error } = await sb.auth.updateUser({ password: p1 });
    if (error) throw error;
    const { data: { user } } = await sb.auth.getUser();
    if (user) { _cachedUser = _mapSupabaseUser(user); _ensureRbacUser(user); }
    showToast('Password updated — signed in!', 'success');
    try { await loadFromCloud(); } catch {}
    if (typeof window._bootApp === 'function') window._bootApp();
  } catch (e) {
    showErr(e.message || 'Could not update password.');
    if (btn) { btn.disabled = false; btn.textContent = 'Update Password'; btn.style.opacity = '1'; }
  }
}

// Self-register (cache-safe — avoids new named imports in app.js).
if (typeof window !== 'undefined') {
  window._rbacVerifySignupOtp = verifySignupOtp;
  window._rbacForgotPassword = forgotPassword;
  window._rbacShowPasswordReset = showPasswordResetScreen;
  window._rbacSubmitNewPassword = submitNewPassword;
  window._rbacResetWithCode = resetWithCode;
  window._rbacSendResetCode = sendResetCode;
  window._rbacShowPasswordResetCode = showPasswordResetCodeScreen;
  window._rbacShowLogin = showLoginPage;
}

export async function handleLogin() {
  const email = (document.getElementById('loginEmail')?.value || '').trim();
  const password = document.getElementById('loginPassword')?.value || '';
  const errEl = document.getElementById('loginError');
  const successEl = document.getElementById('loginSuccess');
  const syncEl = document.getElementById('loginSyncStatus');
  const btn = document.getElementById('loginBtn');

  if (errEl) errEl.style.display = 'none';
  if (successEl) successEl.style.display = 'none';

  if (!email || !password) {
    if (errEl) { errEl.textContent = 'Enter email and password'; errEl.style.display = 'block'; }
    return;
  }
  if (password.length < 6) {
    if (errEl) { errEl.textContent = 'Password must be at least 6 characters'; errEl.style.display = 'block'; }
    return;
  }

  // Disable button during auth
  if (btn) { btn.disabled = true; btn.textContent = _isSignupMode ? 'Creating...' : 'Signing in...'; btn.style.opacity = '0.7'; }

  try {
    if (_isSignupMode) {
      const displayName = document.getElementById('signupName')?.value?.trim() || '';
      const result = await signupUserSupabase(email, password, displayName);

      if (result.error) {
        if (errEl) { errEl.textContent = result.error; errEl.style.display = 'block'; }
        return;
      }
      if (result.needsConfirmation) {
        // Show email confirmation UI
        _showConfirmationScreen(result.email);
        return;
      }
      // Auto-logged in after signup
      if (syncEl) syncEl.style.display = '';
      const syncText = document.getElementById('syncStatusText');
      if (syncText) syncText.textContent = 'Setting up your workspace...';

      // CRITICAL — pull the company's data FIRST. If this account was invited into
      // an existing organization, that org already has data we must ADOPT, never
      // overwrite with this new user's empty local state. Only seed the cloud
      // (bulk push) when nothing came back, i.e. this is a brand-new org.
      let joinedExisting = false;
      try {
        joinedExisting = await Promise.race([loadFromCloud(), new Promise(r => setTimeout(() => r(false), 6000))]);
      } catch (e) { console.warn('[auth] cloud load failed:', e); }
      if (!joinedExisting) {
        if (syncText) syncText.textContent = 'Creating your workspace...';
        try { await Promise.race([pushAllToCloud(), new Promise(r => setTimeout(r, 6000))]); } catch (e) { console.warn('[auth] initial push failed:', e); }
      } else if (syncText) {
        syncText.textContent = 'Joined your team — loading company data...';
      }

      if (typeof window._bootApp === 'function') window._bootApp();
      showToast(`Welcome, ${result.user.name}! Your account is ready.`, 'success');
    } else {
      const result = await loginUserSupabase(email, password);

      if (result.error) {
        if (errEl) { errEl.textContent = result.error; errEl.style.display = 'block'; }
        return;
      }

      // Show sync status
      if (syncEl) syncEl.style.display = '';

      // Pull cloud data — but never hang the login if org resolution stalls.
      let hadCloud = false;
      try { hadCloud = await Promise.race([loadFromCloud(), new Promise(r => setTimeout(() => r(false), 6000))]); } catch (e) { console.warn('[auth] cloud load failed:', e); }
      if (hadCloud) {
        const syncText = document.getElementById('syncStatusText');
        if (syncText) syncText.textContent = 'Data loaded from cloud!';
      }

      if (typeof window._bootApp === 'function') window._bootApp();
      showToast(`Welcome back, ${result.user.name}!`, 'success');
    }
  } catch (e) {
    console.error('[auth]', e);
    if (errEl) { errEl.textContent = 'Connection error. Please try again.'; errEl.style.display = 'block'; }
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = _isSignupMode ? 'Create Account' : 'Sign In'; btn.style.opacity = '1'; }
  }
}

function _updateUserBadge() {
  const user = getCurrentUser();
  const el = document.getElementById('userBadge');
  if (el && user) {
    el.innerHTML = `<span class="text-[10px] font-bold text-slate-500">${user.name}</span><span class="text-[9px] px-1.5 py-0.5 rounded-full bg-blue-50 text-blue-600 font-bold border border-blue-100">${user.role}</span>`;
    el.classList.remove('hidden');
  }
}

// ═══════════════════════════════════════════════
//  USER & ROLE MANAGEMENT (Master Data)
// ═══════════════════════════════════════════════

export function renderUsersRolesPanel() {
  const container = document.getElementById('usersRolesContent');
  if (!container) return;

  const users = state.rbacUsers || [];
  const roles = state.rbacRoles || {};
  const currentUser = getCurrentUser();

  container.innerHTML = `
    <!-- Users Section -->
    <div class="bg-white rounded-xl shadow-sm border p-6 mb-6">
      <div class="flex justify-between items-center mb-4">
        <h3 class="font-bold text-lg text-slate-800">Users</h3>
        <button onclick="window._rbacOpenUserForm()" class="bg-blue-600 text-white px-3 py-1.5 rounded-lg font-bold text-xs hover:bg-blue-700 transition">+ Add User</button>
      </div>
      <div class="overflow-x-auto border rounded-lg">
        <table class="min-w-full text-sm">
          <thead class="bg-slate-50">
            <tr class="text-left text-[10px] font-bold text-slate-500 uppercase">
              <th class="p-3">Name</th>
              <th class="p-3">Email / Username</th>
              <th class="p-3">Role</th>
              <th class="p-3">Auth</th>
              <th class="p-3">Status</th>
              <th class="p-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-slate-100">
            ${users.map(u => `<tr class="hover:bg-slate-50">
              <td class="p-3 font-bold text-slate-700">${u.name}</td>
              <td class="p-3 text-slate-500">${u.email || u.username}</td>
              <td class="p-3"><span class="text-[10px] font-bold px-2 py-0.5 rounded-full ${u.role === 'Admin' ? 'bg-red-50 text-red-600 border border-red-200' : 'bg-blue-50 text-blue-600 border border-blue-200'}">${u.role}</span></td>
              <td class="p-3"><span class="text-[10px] font-bold px-2 py-0.5 rounded-full ${u.supabaseId ? 'bg-emerald-50 text-emerald-600' : 'bg-amber-50 text-amber-600'}">${u.supabaseId ? 'Cloud' : 'Local'}</span></td>
              <td class="p-3"><span class="text-[10px] font-bold px-2 py-0.5 rounded-full ${u.active ? 'bg-green-50 text-green-600' : 'bg-slate-100 text-slate-400'}">${u.active ? 'Active' : 'Inactive'}</span></td>
              <td class="p-3 text-right">
                <button onclick="window._rbacOpenUserForm('${u.id}')" class="text-[10px] text-blue-500 font-bold hover:bg-blue-50 px-2 py-1 rounded transition">Edit</button>
                ${u.id !== (currentUser ? currentUser.id : null) && u.id !== 'usr_admin' ? `<button onclick="window._rbacDeleteUser('${u.id}')" class="text-[10px] text-red-400 font-bold hover:bg-red-50 px-2 py-1 rounded transition">Delete</button>` : ''}
              </td>
            </tr>`).join('')}
          </tbody>
        </table>
      </div>
    </div>

    <!-- Role Permissions Section -->
    <div class="bg-white rounded-xl shadow-sm border p-6">
      <h3 class="font-bold text-lg text-slate-800 mb-4">Role Permissions</h3>
      <p class="text-xs text-slate-400 mb-4">Configure which modules each role can access. Admin always has full access.</p>
      <div class="space-y-3">
        ${Object.keys(roles).filter(r => r !== 'Admin').map(roleName => {
          const role = roles[roleName];
          const perms = role.permissions || [];
          const total = ALL_MODULE_IDS.length;
          const granted = perms.length;
          return `<div class="border rounded-xl overflow-hidden">
            <div class="flex items-center justify-between p-3 bg-slate-50 cursor-pointer select-none" onclick="this.nextElementSibling.classList.toggle('hidden');this.querySelector('.role-chev').classList.toggle('rotate-90')">
              <div class="flex items-center gap-3">
                <span class="role-chev text-slate-400 text-[10px] transition-transform rotate-90">&#9654;</span>
                <span class="font-bold text-sm text-slate-700">${roleName}</span>
                <span class="text-[10px] text-slate-400">${granted}/${total} modules</span>
              </div>
              <div class="flex items-center gap-2">
                <div class="w-24 h-1.5 bg-slate-200 rounded-full overflow-hidden"><div class="h-full bg-blue-500 rounded-full" style="width:${Math.round((granted/total)*100)}%"></div></div>
              </div>
            </div>
            <div class="p-4 border-t">
              ${_renderPermissionGrid(roleName, perms)}
            </div>
          </div>`;
        }).join('')}
      </div>
    </div>
  `;
}

function _renderPermissionGrid(roleName, perms) {
  const groups = {};
  getAccessModules().forEach(m => {
    if (!groups[m.group]) groups[m.group] = [];
    groups[m.group].push(m);
  });

  return Object.entries(groups).map(([group, modules]) => {
    const allChecked = modules.every(m => perms.includes(m.id));
    return `<div class="mb-3">
      <div class="flex items-center gap-2 mb-2">
        <input type="checkbox" ${allChecked ? 'checked' : ''} onchange="window._rbacToggleGroup('${roleName}','${group}',this.checked)" class="accent-blue-600">
        <span class="text-[10px] font-bold uppercase text-slate-500 tracking-wider">${group}</span>
      </div>
      <div class="grid grid-cols-2 md:grid-cols-3 gap-1 pl-5">
        ${modules.map(m => `<label class="flex items-center gap-2 text-xs text-slate-600 py-1 px-2 rounded hover:bg-slate-50 cursor-pointer">
          <input type="checkbox" value="${m.id}" ${perms.includes(m.id) ? 'checked' : ''} onchange="window._rbacTogglePerm('${roleName}','${m.id}',this.checked)" class="accent-blue-600">
          ${m.label}
        </label>`).join('')}
      </div>
    </div>`;
  }).join('');
}

// ── User CRUD ──

export function openUserForm(userId) {
  const existing = userId ? (state.rbacUsers || []).find(u => u.id === userId) : null;
  const roles = Object.keys(state.rbacRoles || {});

  { const _el = document.getElementById('rbacUserFormModal'); if (_el) _el.remove(); };
  const html = `
    <div id="rbacUserFormModal" class="ef-overlay" onclick="if(event.target===this)window._rbacCloseUserForm()">
      <div class="ef-modal" style="max-width:440px;">
        <div class="ef-header">
          <h3 class="ef-title">${existing ? 'Edit User' : 'Add New User'}</h3>
          <button onclick="window._rbacCloseUserForm()" class="ef-close">&times;</button>
        </div>
        <div class="ef-body">
          <div class="ef-grid">
            <div class="ef-field ef-field-full">
              <label class="ef-label">Full Name *</label>
              <input type="text" id="rbacUserName" class="ef-input" value="${(existing ? existing.name : '') || ''}" placeholder="e.g. Rajesh Kumar">
            </div>
            <div class="ef-field">
              <label class="ef-label">Email / Username *</label>
              <input type="text" id="rbacUserUsername" class="ef-input" value="${(existing ? (existing.email || existing.username) : '') || ''}" placeholder="e.g. user@company.com" ${(existing && existing.id === 'usr_admin') ? 'disabled' : ''}>
            </div>
            <div class="ef-field">
              <label class="ef-label">Role *</label>
              <select id="rbacUserRole" class="ef-input">
                ${roles.map(r => `<option value="${r}" ${((existing ? existing.role : '') || '') === r ? 'selected' : ''}>${r}</option>`).join('')}
              </select>
            </div>
            <div class="ef-field">
              <label class="ef-label">Status</label>
              <select id="rbacUserActive" class="ef-input">
                <option value="1" ${(existing ? existing.active !== false : true) ? 'selected' : ''}>Active</option>
                <option value="0" ${(existing && existing.active === false) ? 'selected' : ''}>Inactive</option>
              </select>
            </div>
            <div class="ef-field ef-field-full">
              <label class="ef-label">Projects this user can access</label>
              <p style="font-size:11px;color:#94a3b8;margin:-2px 0 6px;">Non-admin users see only the projects checked here. Admins always see every project.</p>
              <div id="rbacUserProjects" style="max-height:160px;overflow:auto;border:1px solid #e2e8f0;border-radius:8px;padding:8px;">
                ${(state.projects || []).length
                  ? (state.projects || []).map(p => {
                      const checked = existing && Array.isArray(p.teamMembers) && p.teamMembers.includes(existing.id);
                      return `<label style="display:flex;align-items:center;gap:8px;padding:5px 4px;font-size:13px;color:#475569;cursor:pointer;">
                        <input type="checkbox" class="rbac-proj-chk" value="${p.id}" ${checked ? 'checked' : ''} style="accent-color:#2563eb;width:15px;height:15px;">
                        <span style="font-weight:600;">${(p.name || p.code || p.id)}</span>
                        ${p.code ? `<span style="color:#94a3b8;font-size:11px;">${p.code}</span>` : ''}
                      </label>`;
                    }).join('')
                  : '<p style="font-size:12px;color:#94a3b8;padding:6px;">No projects yet — create a project first, then assign it here.</p>'}
              </div>
            </div>
          </div>
        </div>
        <div class="ef-footer">
          <button onclick="window._rbacCloseUserForm()" class="ef-btn-cancel">Cancel</button>
          <button onclick="window._rbacSaveUser('${userId || ''}')" class="ef-btn-save">${existing ? 'Update' : 'Add User'}</button>
        </div>
      </div>
    </div>`;
  document.body.insertAdjacentHTML('beforeend', html);
  setTimeout(() => { const _el = document.getElementById('rbacUserName'); if (_el) _el.focus(); }, 100);
}

export function saveUser(userId) {
  const name = document.getElementById('rbacUserName')?.value?.trim() || '';
  const username = document.getElementById('rbacUserUsername')?.value?.trim() || '';
  const role = document.getElementById('rbacUserRole')?.value;
  const active = document.getElementById('rbacUserActive')?.value === '1';

  if (!name || !username) { showToast('Name and email/username are required', 'error'); return; }

  const dup = (state.rbacUsers || []).find(u => (u.username === username || u.email === username) && u.id !== userId);
  if (dup) { showToast('Email/username already taken', 'error'); return; }

  if (!state.rbacUsers) state.rbacUsers = [];

  let isNew = false;
  let savedId = userId;
  if (userId) {
    const idx = state.rbacUsers.findIndex(u => u.id === userId);
    if (idx >= 0) {
      state.rbacUsers[idx].name = name;
      state.rbacUsers[idx].username = username;
      state.rbacUsers[idx].email = username;
      state.rbacUsers[idx].role = role;
      state.rbacUsers[idx].active = active;
    }
  } else {
    isNew = true;
    savedId = 'usr_' + Date.now();
    state.rbacUsers.push({
      id: savedId,
      name, username, email: username, role, active,
      createdAt: new Date().toISOString(),
    });
  }

  // ── Reconcile this user's project access (project.teamMembers is canonical) ──
  const checkedProjectIds = Array.from(document.querySelectorAll('#rbacUserProjects .rbac-proj-chk:checked')).map(el => el.value);
  (state.projects || []).forEach(p => {
    if (!Array.isArray(p.teamMembers)) p.teamMembers = [];
    const has = p.teamMembers.includes(savedId);
    const want = checkedProjectIds.includes(p.id);
    if (want && !has) p.teamMembers.push(savedId);
    else if (!want && has) p.teamMembers = p.teamMembers.filter(id => id !== savedId);
  });

  saveAllData();
  closeUserForm();
  // Cloud invite: when adding a NEW teammate by email, create a pending org invite so
  // they JOIN this company on first login (otherwise the app makes them a brand-new,
  // separate org and their data never syncs with yours).
  if (isNew && /^\S+@\S+\.\S+$/.test(username) && typeof window.createOrgInvite === 'function') {
    window.createOrgInvite(username, 'member').then(ok => {
      if (ok) showToast('☁️ Cloud invite created — they will join your company when they log in with ' + username, 'success');
      else showToast('User added locally, but the cloud invite could not be created. Ask them to log in and re-check.', 'warning');
    }).catch(() => {});
  }
  showToast(userId ? 'User updated' : 'User added', 'success');
  renderUsersRolesPanel();
  if (typeof window.renderProjectsHome === 'function') { try { window.renderProjectsHome(); } catch {} }

  // ── Give a brand-new teammate real cloud access: create an org invite so that
  //    when they sign in with this email they auto-join this org (accept_pending_invites). ──
  if (isNew && /^.+@.+\..+$/.test(username)) {
    _inviteUserToOrg(username.trim().toLowerCase(), role === 'Admin' ? 'admin' : 'member');
  }
}

/** Create/refresh an org_invites row so an added email auto-joins this org on
 *  sign-in. Mirrors orgTeam.js window._orgInvite. Best-effort + non-blocking. */
async function _inviteUserToOrg(email, role) {
  try {
    const sb = getSupabase();
    const orgId = (typeof window.getSyncOrgId === 'function') ? window.getSyncOrgId() : null;
    if (!sb || !orgId) return;
    let me = null; try { me = (await sb.auth.getUser()).data?.user?.id; } catch {}
    const { error } = await sb.from('org_invites')
      .upsert({ org_id: orgId, email, role, invited_by: me, status: 'pending', accepted_at: null }, { onConflict: 'org_id,email' });
    if (error) { showToast('Saved locally, but cloud invite failed: ' + error.message, 'warning'); return; }
    showToast('Cloud invite sent to ' + email + ' — they join when they sign in with this email', 'success');
  } catch (e) { console.warn('[rbac] org invite failed:', e); }
}

export function deleteUser(userId) {
  if (!confirm('Delete this user?')) return;
  window.recycleDelete && window.recycleDelete('rbacUsers', userId, 'User');
  saveAllData();
  showToast('User deleted', 'warning');
  renderUsersRolesPanel();
}

export function closeUserForm() {
  { const _el = document.getElementById('rbacUserFormModal'); if (_el) _el.remove(); };
}

// ── Permission toggles ──

export function togglePermission(roleName, moduleId, checked) {
  const role = (state.rbacRoles || {})[roleName];
  if (!role) return;
  if (!role.permissions) role.permissions = [];
  if (checked && !role.permissions.includes(moduleId)) {
    role.permissions.push(moduleId);
  } else if (!checked) {
    role.permissions = role.permissions.filter(p => p !== moduleId);
  }
  saveAllData();
  hideRestrictedSidebar();
  renderUsersRolesPanel();
}

export function toggleGroupPermissions(roleName, group, checked) {
  const role = (state.rbacRoles || {})[roleName];
  if (!role) return;
  if (!role.permissions) role.permissions = [];
  const groupModuleIds = getAccessModules().filter(m => m.group === group).map(m => m.id);
  if (checked) {
    groupModuleIds.forEach(id => { if (!role.permissions.includes(id)) role.permissions.push(id); });
  } else {
    role.permissions = role.permissions.filter(p => !groupModuleIds.includes(p));
  }
  saveAllData();
  hideRestrictedSidebar();
  renderUsersRolesPanel();
}
