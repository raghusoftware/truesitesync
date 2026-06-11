/**
 * ═══════════════════════════════════════════════════════════
 * True Site Sync — Organization & Multi-Tenant Module
 * ═══════════════════════════════════════════════════════════
 * Handles: org creation, team management, invites, seat limits,
 * Razorpay billing, and super admin dashboard.
 * ═══════════════════════════════════════════════════════════
 */

import { getSupabase, SUPABASE_URL } from '../database/supabase.js';
import { state, saveAllData } from './state.js';
import { showToast } from './utils.js';

const PLANS = {
  free:       { name: 'Free',       seats: 3,  projects: 2,   price: 0,     label: 'Free Trial' },
  solo:       { name: 'Solo',       seats: 1,  projects: 3,   price: 2500,  label: '₹2,500/yr' },
  starter:    { name: 'Starter',    seats: 5,  projects: 5,   price: 5000,  label: '₹5,000/yr' },
  business:   { name: 'Business',   seats: 12, projects: 20,  price: 12000, label: '₹12,000/yr' },
  pro:        { name: 'Pro',        seats: 25, projects: 50,  price: 25000, label: '₹25,000/yr' },
  enterprise: { name: 'Enterprise', seats: 50, projects: 100, price: 50000, label: '₹50,000/yr' },
};

let _currentOrg = null;
let _orgMembers = [];
let _orgInvites = [];

// ── Org cache: lets Plan/Billing + the trial gate render INSTANTLY from local
//    storage, before the network refresh completes (perf). ──
const ORG_CACHE_KEY = 'mes_org_cache';
function _cacheOrg(org) {
  try {
    if (!org || !org.id) return;
    localStorage.setItem(ORG_CACHE_KEY, JSON.stringify({
      id: org.id, name: org.name, plan: org.plan, trial_ends_at: org.trial_ends_at,
      max_seats: org.max_seats, max_projects: org.max_projects, _userRole: org._userRole,
    }));
  } catch {}
}
function _cachedOrg() {
  try { const s = localStorage.getItem(ORG_CACHE_KEY); return s ? JSON.parse(s) : null; } catch { return null; }
}
/** Synchronously seed _currentOrg from the local cache so the Plan/Billing page
 *  and the trial gate are instant on load. The background loadUserOrg() refresh
 *  then replaces it with the authoritative copy. */
export function hydrateOrgFromCache() {
  if (_currentOrg) return _currentOrg;
  const c = _cachedOrg();
  if (c) { c._fromCache = true; _currentOrg = c; }
  return _currentOrg;
}

// ══════════════════════════════════════════
// ORG LIFECYCLE
// ══════════════════════════════════════════

/** Create a new organization when user signs up */
export async function createOrganization(name, userId, userEmail) {
  const sb = getSupabase();
  if (!sb) return null;

  // Atomic create (org + owner membership) via SECURITY DEFINER RPC.
  // This avoids the RLS RETURNING/SELECT-policy trap: a plain
  // insert().select() on organizations fails because the membership row
  // (which org_select depends on) does not exist yet at RETURNING time.
  // The RPC also reuses an existing workspace if the user already has one.
  const { data: orgId, error } = await sb.rpc('create_org_with_owner', {
    p_name: name,
    p_email: userEmail,
  });
  if (error || !orgId) { console.error('[org] create failed:', error); return null; }

  const { data: org } = await sb.from('organizations').select('*').eq('id', orgId).single();
  if (org) { _currentOrg = org; _currentOrg._userRole = 'owner'; _cacheOrg(_currentOrg); }
  return org || null;
}

/** Load current user's organization */
export async function loadUserOrg() {
  const sb = getSupabase();
  if (!sb) return null;

  // Fast path: read the user from the LOCAL session (no network round-trip like
  // getUser(), which validates against the auth server on every call).
  let user = null;
  try { const { data } = await sb.auth.getSession(); user = data?.session?.user || null; } catch {}
  if (!user) { try { const { data } = await sb.auth.getUser(); user = data?.user || null; } catch {} }
  if (!user) return null;

  // Get user's org membership
  const { data: memberships } = await sb.from('org_members')
    .select('org_id, role, organizations(*)')
    .eq('user_id', user.id)
    .eq('is_active', true)
    .limit(1);

  if (memberships?.length) {
    _currentOrg = memberships[0].organizations;
    _currentOrg._userRole = memberships[0].role;
    _cacheOrg(_currentOrg);
    return _currentOrg;
  }

  // No org — check for pending invitation
  const { data: invites } = await sb.from('invitations')
    .select('*, organizations(name)')
    .eq('email', user.email)
    .eq('accepted', false);

  if (invites?.length) {
    // Auto-accept first invitation
    await acceptInvitation(invites[0].token);
    return _currentOrg;
  }

  return null;
}

/** Get current org */
export function getCurrentOrg() { return _currentOrg; }

/** Check if user is org owner/admin */
export function isOrgAdmin() {
  return _currentOrg?._userRole === 'owner' || _currentOrg?._userRole === 'admin';
}

// ══════════════════════════════════════════
// TEAM MANAGEMENT
// ══════════════════════════════════════════

/** Load all members of current org */
export async function loadOrgMembers() {
  const sb = getSupabase();
  if (!sb || !_currentOrg) return [];

  const { data } = await sb.from('org_members')
    .select('id, user_id, role, is_active, joined_at')
    .eq('org_id', _currentOrg.id)
    .order('joined_at', { ascending: true });

  // Fetch user profiles
  if (data?.length) {
    const userIds = data.map(m => m.user_id);
    const { data: profiles } = await sb.from('user_profiles')
      .select('id, display_name, email')
      .in('id', userIds);

    const profileMap = {};
    (profiles || []).forEach(p => profileMap[p.id] = p);

    _orgMembers = data.map(m => ({
      ...m,
      display_name: profileMap[m.user_id]?.display_name || 'User',
      email: profileMap[m.user_id]?.email || '',
    }));
  } else {
    _orgMembers = [];
  }

  return _orgMembers;
}

/** Load pending invitations */
export async function loadOrgInvites() {
  const sb = getSupabase();
  if (!sb || !_currentOrg) return [];

  const { data } = await sb.from('invitations')
    .select('*')
    .eq('org_id', _currentOrg.id)
    .eq('accepted', false)
    .order('created_at', { ascending: false });

  _orgInvites = data || [];
  return _orgInvites;
}

/** Invite a team member */
export async function inviteMember(email, role = 'member') {
  const sb = getSupabase();
  if (!sb || !_currentOrg) { showToast('No organization found', 'error'); return false; }

  // Check seat limit
  const activeMembers = _orgMembers.filter(m => m.is_active).length;
  const pendingInvites = _orgInvites.length;
  if (activeMembers + pendingInvites >= _currentOrg.max_seats) {
    showToast(`Seat limit reached (${_currentOrg.max_seats}). Upgrade your plan to add more users.`, 'error');
    return false;
  }

  // Check if already a member
  if (_orgMembers.some(m => m.email === email)) {
    showToast('This user is already a member', 'error');
    return false;
  }

  // Check if already invited
  if (_orgInvites.some(i => i.email === email)) {
    showToast('This user already has a pending invitation', 'error');
    return false;
  }

  const { data: { user } } = await sb.auth.getUser();
  const { error } = await sb.from('invitations').insert({
    org_id: _currentOrg.id,
    email,
    role,
    invited_by: user.id,
  });

  if (error) { showToast('Failed to send invitation: ' + error.message, 'error'); return false; }

  showToast(`Invitation sent to ${email}`, 'success');
  await loadOrgInvites();
  return true;
}

/** Accept an invitation by token */
export async function acceptInvitation(token) {
  const sb = getSupabase();
  if (!sb) return false;

  const { data: { user } } = await sb.auth.getUser();
  if (!user) return false;

  // Find the invitation
  const { data: invite } = await sb.from('invitations')
    .select('*')
    .eq('token', token)
    .eq('accepted', false)
    .single();

  if (!invite) { showToast('Invitation not found or expired', 'error'); return false; }

  // Add user to org
  await sb.from('org_members').insert({
    org_id: invite.org_id,
    user_id: user.id,
    role: invite.role,
  });

  // Mark invitation as accepted
  await sb.from('invitations').update({ accepted: true }).eq('id', invite.id);

  // Load the org
  await loadUserOrg();
  showToast('You have joined the organization!', 'success');
  return true;
}

/** Remove a member from org */
export async function removeMember(memberId) {
  const sb = getSupabase();
  if (!sb || !_currentOrg) return;

  const member = _orgMembers.find(m => m.id === memberId);
  if (member?.role === 'owner') { showToast('Cannot remove the owner', 'error'); return; }

  if (!confirm(`Remove ${member?.display_name || 'this user'} from the organization?`)) return;

  await sb.from('org_members').update({ is_active: false }).eq('id', memberId);
  showToast('Member removed', 'success');
  await loadOrgMembers();
  renderTeamPanel();
}

/** Update member role */
export async function updateMemberRole(memberId, newRole) {
  const sb = getSupabase();
  if (!sb || !_currentOrg) return;

  await sb.from('org_members').update({ role: newRole }).eq('id', memberId);
  showToast('Role updated', 'success');
  await loadOrgMembers();
  renderTeamPanel();
}

/** Cancel a pending invitation */
export async function cancelInvite(inviteId) {
  const sb = getSupabase();
  if (!sb) return;

  await sb.from('invitations').delete().eq('id', inviteId);
  showToast('Invitation cancelled', 'success');
  await loadOrgInvites();
  renderTeamPanel();
}

// ══════════════════════════════════════════
// BILLING / RAZORPAY
// ══════════════════════════════════════════

/** Open Razorpay checkout for plan upgrade */
export async function upgradePlan(planId) {
  const sb = getSupabase();
  if (!sb || !_currentOrg) return;

  const { data: { session } } = await sb.auth.getSession();
  if (!session) { showToast('Please login first', 'error'); return; }

  // Create order via edge function
  const res = await fetch(`${SUPABASE_URL}/functions/v1/razorpay-order`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${session.access_token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ plan_id: planId, org_id: _currentOrg.id }),
  });

  const order = await res.json();
  if (order.error) { showToast('Payment error: ' + order.error, 'error'); return; }

  // Open Razorpay checkout
  _openRazorpayCheckout(order);
}

/** Buy extra seats */
export async function buyExtraSeats(count) {
  const sb = getSupabase();
  if (!sb || !_currentOrg) return;

  const { data: { session } } = await sb.auth.getSession();
  if (!session) return;

  const res = await fetch(`${SUPABASE_URL}/functions/v1/razorpay-order`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${session.access_token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ extra_seats: count, org_id: _currentOrg.id }),
  });

  const order = await res.json();
  if (order.error) { showToast('Payment error: ' + order.error, 'error'); return; }

  _openRazorpayCheckout(order);
}

function _openRazorpayCheckout(order) {
  if (!window.Razorpay) {
    showToast('Razorpay SDK not loaded. Please try again.', 'error');
    return;
  }

  const options = {
    key: order.key_id,
    amount: order.amount,
    currency: order.currency,
    name: 'True Site Sync',
    description: order.plan,
    order_id: order.order_id,
    handler: async function (response) {
      showToast('Payment successful! Upgrading your plan...', 'success');
      // Reload org to get updated seats/plan, then lift the trial paywall.
      setTimeout(async () => {
        await loadUserOrg();
        try { enforceTrialGate(); } catch {}
        renderTeamPanel();
        renderBillingPanel();
        if (typeof window.renderPlanBilling === 'function') window.renderPlanBilling();
      }, 2000);
    },
    prefill: {
      email: _currentOrg?.email || '',
    },
    theme: { color: '#10b981' },
    modal: { ondismiss: () => showToast('Payment cancelled', 'warning') },
  };

  const rzp = new window.Razorpay(options);
  rzp.open();
}

// ══════════════════════════════════════════
// UI RENDERING
// ══════════════════════════════════════════

/** Render the Organization Settings view */
export function renderOrgSettings() {
  // Prefer the merged Settings tab container, fall back to standalone view
  const container = document.getElementById('settOrgContent') || document.getElementById('orgSettingsContent');
  if (!container) return;

  if (!_currentOrg) {
    container.innerHTML = `
      <div style="text-align:center;padding:60px 20px;">
        <div style="font-size:48px;margin-bottom:16px;">🏢</div>
        <h3 style="font-size:18px;font-weight:700;color:#1e293b;margin-bottom:8px;">Create Your Organization</h3>
        <p style="color:#64748b;font-size:13px;margin-bottom:24px;">Set up your company to start adding team members.</p>
        <button onclick="_orgCreateNew()" style="padding:12px 28px;background:#2563eb;color:#fff;border:none;border-radius:10px;font-size:14px;font-weight:600;cursor:pointer;">
          Create Organization
        </button>
      </div>`;
    return;
  }

  const plan = PLANS[_currentOrg.plan] || PLANS.free;
  const activeMembers = _orgMembers.filter(m => m.is_active).length;
  const trialDays = _currentOrg.trial_ends_at ? Math.max(0, Math.ceil((new Date(_currentOrg.trial_ends_at) - Date.now()) / 86400000)) : 0;

  container.innerHTML = `
    <div style="max-width:900px;">
      <!-- Org Header -->
      <div style="background:#fff;border:1px solid #e5e7eb;border-radius:12px;padding:20px 24px;margin-bottom:16px;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px;">
        <div style="display:flex;align-items:center;gap:14px;">
          <div style="width:48px;height:48px;border-radius:12px;background:linear-gradient(135deg,#3b82f6,#2563eb);display:flex;align-items:center;justify-content:center;color:#fff;font-weight:900;font-size:18px;">${(_currentOrg.name || 'O')[0].toUpperCase()}</div>
          <div>
            <h3 style="font-size:16px;font-weight:700;color:#1e293b;margin:0;">${_currentOrg.name}</h3>
            <p style="font-size:11px;color:#64748b;margin:2px 0 0;">Plan: <strong style="color:#10b981;text-transform:capitalize;">${_currentOrg.plan}</strong> · ${activeMembers}/${_currentOrg.max_seats} seats used${_currentOrg.plan === 'free' && trialDays > 0 ? ` · <span style="color:#f59e0b;">${trialDays} days left in trial</span>` : ''}</p>
          </div>
        </div>
        ${isOrgAdmin() ? `<button onclick="switchOrgTab('billing')" style="padding:8px 16px;background:#10b981;color:#fff;border:none;border-radius:8px;font-size:12px;font-weight:600;cursor:pointer;">Upgrade Plan</button>` : ''}
      </div>

      <!-- Tabs -->
      <div style="display:flex;gap:4px;margin-bottom:16px;border-bottom:1px solid #e5e7eb;padding-bottom:0;">
        <button onclick="switchOrgTab('team')" id="orgTabTeam" class="org-tab active" style="padding:10px 18px;font-size:13px;font-weight:600;color:#2563eb;background:none;border:none;border-bottom:2px solid #2563eb;cursor:pointer;">Team</button>
        <button onclick="switchOrgTab('billing')" id="orgTabBilling" class="org-tab" style="padding:10px 18px;font-size:13px;font-weight:600;color:#64748b;background:none;border:none;border-bottom:2px solid transparent;cursor:pointer;">Billing</button>
        <button onclick="switchOrgTab('settings')" id="orgTabSettings" class="org-tab" style="padding:10px 18px;font-size:13px;font-weight:600;color:#64748b;background:none;border:none;border-bottom:2px solid transparent;cursor:pointer;">Settings</button>
      </div>

      <!-- Tab Content -->
      <div id="orgTabContent"></div>
    </div>`;

  switchOrgTab('team');
}

/** Switch between org tabs */
export function switchOrgTab(tab) {
  document.querySelectorAll('.org-tab').forEach(t => {
    t.style.color = '#64748b';
    t.style.borderBottomColor = 'transparent';
  });
  const activeTab = document.getElementById('orgTab' + tab.charAt(0).toUpperCase() + tab.slice(1));
  if (activeTab) {
    activeTab.style.color = '#2563eb';
    activeTab.style.borderBottomColor = '#2563eb';
  }

  if (tab === 'team') renderTeamPanel();
  else if (tab === 'billing') renderBillingPanel();
  else if (tab === 'settings') renderOrgSettingsPanel();
}

/** Render team management panel */
export function renderTeamPanel() {
  const container = document.getElementById('orgTabContent');
  if (!container) return;

  const activeMembers = _orgMembers.filter(m => m.is_active);
  const seatsFull = activeMembers.length + _orgInvites.length >= (_currentOrg?.max_seats || 3);
  const admin = isOrgAdmin();

  let html = '';

  // Adding teammates now happens in Master Data → Users (Add User), where the
  // admin also picks which projects each member can access. Point there instead
  // of the old invite box (which wrote to a separate table not wired to auto-join).
  if (admin) {
    html += `
      <div style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:10px;padding:14px 16px;margin-bottom:16px;">
        <h4 style="font-size:13px;font-weight:700;color:#1e3a8a;margin:0 0 4px;">Add team members in Users</h4>
        <p style="font-size:12px;color:#475569;margin:0;">Go to <b>Master Data → Users → + Add User</b> to invite a teammate and choose which projects they can access. They join automatically when they sign in with that email.</p>
        ${seatsFull ? `<p style="color:#dc2626;font-size:11px;margin-top:8px;font-weight:600;">All ${_currentOrg.max_seats} seats used. <a href="#" onclick="switchOrgTab('billing');return false" style="color:#2563eb;text-decoration:underline;">Upgrade plan</a> or <a href="#" onclick="_orgBuySeats();return false" style="color:#2563eb;text-decoration:underline;">buy extra seats</a>.</p>` : ''}
      </div>`;
  }

  // Members list
  html += `<div style="background:#fff;border:1px solid #e5e7eb;border-radius:10px;overflow:hidden;">
    <div style="padding:12px 16px;border-bottom:1px solid #e5e7eb;display:flex;justify-content:space-between;align-items:center;">
      <h4 style="font-size:13px;font-weight:700;color:#1e293b;margin:0;">Team Members (${activeMembers.length}/${_currentOrg?.max_seats || 3})</h4>
    </div>`;

  activeMembers.forEach(m => {
    const isOwner = m.role === 'owner';
    const roleColors = { owner:'#7c3aed', admin:'#2563eb', member:'#059669', supervisor:'#d97706', viewer:'#6b7280' };
    html += `
      <div style="padding:12px 16px;border-bottom:1px solid #f3f4f6;display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;">
        <div style="display:flex;align-items:center;gap:10px;flex:1;min-width:200px;">
          <div style="width:36px;height:36px;border-radius:50%;background:${roleColors[m.role] || '#6b7280'};display:flex;align-items:center;justify-content:center;color:#fff;font-weight:700;font-size:13px;flex-shrink:0;">${(m.display_name || 'U')[0].toUpperCase()}</div>
          <div>
            <div style="font-size:13px;font-weight:600;color:#1e293b;">${m.display_name || 'User'}</div>
            <div style="font-size:11px;color:#94a3b8;">${m.email || ''}</div>
          </div>
        </div>
        <div style="display:flex;align-items:center;gap:8px;">
          <span style="font-size:10px;font-weight:700;text-transform:uppercase;color:${roleColors[m.role] || '#6b7280'};background:${roleColors[m.role] || '#6b7280'}15;padding:3px 8px;border-radius:6px;">${m.role}</span>
          ${admin && !isOwner ? `
            <select onchange="_orgChangeRole('${m.id}',this.value)" style="font-size:11px;padding:4px 6px;border:1px solid #e5e7eb;border-radius:6px;cursor:pointer;">
              ${['admin','member','supervisor','viewer'].map(r => `<option value="${r}" ${m.role === r ? 'selected' : ''}>${r}</option>`).join('')}
            </select>
            <button onclick="_orgRemoveMember('${m.id}')" style="padding:4px 8px;background:#fef2f2;color:#dc2626;border:1px solid #fecaca;border-radius:6px;font-size:10px;font-weight:600;cursor:pointer;">Remove</button>
          ` : ''}
        </div>
      </div>`;
  });

  html += '</div>';

  // Pending invitations
  if (_orgInvites.length) {
    html += `<div style="background:#fff;border:1px solid #e5e7eb;border-radius:10px;overflow:hidden;margin-top:16px;">
      <div style="padding:12px 16px;border-bottom:1px solid #e5e7eb;">
        <h4 style="font-size:13px;font-weight:700;color:#1e293b;margin:0;">Pending Invitations (${_orgInvites.length})</h4>
      </div>`;
    _orgInvites.forEach(inv => {
      html += `
        <div style="padding:10px 16px;border-bottom:1px solid #f3f4f6;display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap;">
          <div>
            <span style="font-size:13px;font-weight:500;color:#1e293b;">${inv.email}</span>
            <span style="font-size:10px;color:#94a3b8;margin-left:8px;">as ${inv.role}</span>
          </div>
          ${admin ? `<button onclick="_orgCancelInvite('${inv.id}')" style="padding:4px 10px;background:#fef2f2;color:#dc2626;border:1px solid #fecaca;border-radius:6px;font-size:10px;font-weight:600;cursor:pointer;">Cancel</button>` : ''}
        </div>`;
    });
    html += '</div>';
  }

  container.innerHTML = html;
}

/** Render billing/plans panel */
export function renderBillingPanel() {
  const container = document.getElementById('orgTabContent');
  if (!container || !_currentOrg) return;

  const currentPlan = _currentOrg.plan || 'free';

  let html = `
    <div style="margin-bottom:20px;">
      <h4 style="font-size:14px;font-weight:700;color:#1e293b;margin:0 0 4px;">Choose Your Plan</h4>
      <p style="font-size:12px;color:#64748b;margin:0;">Upgrade to unlock more seats and projects.</p>
    </div>
    <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:12px;margin-bottom:24px;">`;

  Object.entries(PLANS).forEach(([id, plan]) => {
    const isCurrent = currentPlan === id;
    const isUpgrade = PLANS[currentPlan] && plan.price > PLANS[currentPlan].price;
    html += `
      <div style="background:#fff;border:${isCurrent ? '2px solid #10b981' : '1px solid #e5e7eb'};border-radius:12px;padding:20px;text-align:center;${isCurrent ? 'box-shadow:0 0 0 3px rgba(16,185,129,.15);' : ''}">
        ${isCurrent ? '<div style="font-size:9px;font-weight:700;text-transform:uppercase;color:#10b981;margin-bottom:6px;letter-spacing:1px;">Current Plan</div>' : ''}
        <h4 style="font-size:16px;font-weight:800;color:#1e293b;margin:0 0 4px;">${plan.name}</h4>
        <div style="font-size:22px;font-weight:900;color:#2563eb;margin:8px 0;">${plan.price ? '₹' + plan.price.toLocaleString('en-IN') : 'Free'}</div>
        <p style="font-size:11px;color:#94a3b8;margin:0 0 12px;">${plan.price ? 'per year' : '7-day trial'}</p>
        <div style="font-size:11px;color:#64748b;margin-bottom:4px;">✓ ${plan.seats} team seats</div>
        <div style="font-size:11px;color:#64748b;margin-bottom:12px;">✓ ${plan.projects} projects</div>
        ${isCurrent ? '<span style="font-size:11px;color:#10b981;font-weight:600;">Active</span>' :
          isUpgrade ? `<button onclick="_orgUpgrade('${id}')" style="padding:8px 20px;background:#2563eb;color:#fff;border:none;border-radius:8px;font-size:12px;font-weight:600;cursor:pointer;width:100%;">Upgrade</button>` :
          '<span style="font-size:11px;color:#94a3b8;">—</span>'}
      </div>`;
  });

  html += `</div>
    <!-- Extra seats -->
    <div style="background:#fffbeb;border:1px solid #fde68a;border-radius:10px;padding:16px;margin-bottom:20px;">
      <h4 style="font-size:13px;font-weight:700;color:#92400e;margin:0 0 8px;">Need more seats?</h4>
      <p style="font-size:12px;color:#78716c;margin:0 0 12px;">Buy additional seats at ₹500/seat/year without changing your plan.</p>
      <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;">
        <input type="number" id="extraSeatsCount" value="5" min="1" max="50" style="width:70px;padding:8px;border:1px solid #d1d5db;border-radius:8px;font-size:13px;text-align:center;">
        <span style="font-size:12px;color:#78716c;">seats × ₹500 =</span>
        <strong id="extraSeatsTotal" style="color:#92400e;">₹2,500</strong>
        <button onclick="_orgBuySeats()" style="padding:8px 16px;background:#d97706;color:#fff;border:none;border-radius:8px;font-size:12px;font-weight:600;cursor:pointer;">Buy Seats</button>
      </div>
    </div>`;

  container.innerHTML = html;

  // Extra seats price calculator
  const input = document.getElementById('extraSeatsCount');
  const total = document.getElementById('extraSeatsTotal');
  if (input && total) {
    input.addEventListener('input', () => {
      total.textContent = '₹' + ((parseInt(input.value) || 0) * 500).toLocaleString('en-IN');
    });
  }
}

/** Render org settings panel (name, logo, details) */
function renderOrgSettingsPanel() {
  const container = document.getElementById('orgTabContent');
  if (!container || !_currentOrg) return;

  const admin = isOrgAdmin();

  container.innerHTML = `
    <div style="background:#fff;border:1px solid #e5e7eb;border-radius:10px;padding:20px;max-width:500px;">
      <h4 style="font-size:14px;font-weight:700;color:#1e293b;margin:0 0 16px;">Organization Details</h4>
      <div style="display:flex;flex-direction:column;gap:12px;">
        <div>
          <label style="font-size:11px;font-weight:600;color:#64748b;text-transform:uppercase;letter-spacing:.3px;display:block;margin-bottom:4px;">Company Name</label>
          <input type="text" id="orgSettingName" value="${_currentOrg.name || ''}" ${admin ? '' : 'readonly'} style="width:100%;padding:10px 12px;border:1px solid #e5e7eb;border-radius:8px;font-size:13px;outline:none;">
        </div>
        <div>
          <label style="font-size:11px;font-weight:600;color:#64748b;text-transform:uppercase;letter-spacing:.3px;display:block;margin-bottom:4px;">Email</label>
          <input type="email" id="orgSettingEmail" value="${_currentOrg.email || ''}" ${admin ? '' : 'readonly'} style="width:100%;padding:10px 12px;border:1px solid #e5e7eb;border-radius:8px;font-size:13px;outline:none;">
        </div>
        <div>
          <label style="font-size:11px;font-weight:600;color:#64748b;text-transform:uppercase;letter-spacing:.3px;display:block;margin-bottom:4px;">Phone</label>
          <input type="tel" id="orgSettingPhone" value="${_currentOrg.phone || ''}" ${admin ? '' : 'readonly'} style="width:100%;padding:10px 12px;border:1px solid #e5e7eb;border-radius:8px;font-size:13px;outline:none;">
        </div>
        <div>
          <label style="font-size:11px;font-weight:600;color:#64748b;text-transform:uppercase;letter-spacing:.3px;display:block;margin-bottom:4px;">GST Number</label>
          <input type="text" id="orgSettingGST" value="${_currentOrg.gst_number || ''}" ${admin ? '' : 'readonly'} style="width:100%;padding:10px 12px;border:1px solid #e5e7eb;border-radius:8px;font-size:13px;outline:none;">
        </div>
        <div>
          <label style="font-size:11px;font-weight:600;color:#64748b;text-transform:uppercase;letter-spacing:.3px;display:block;margin-bottom:4px;">Address</label>
          <textarea id="orgSettingAddress" rows="2" ${admin ? '' : 'readonly'} style="width:100%;padding:10px 12px;border:1px solid #e5e7eb;border-radius:8px;font-size:13px;outline:none;resize:vertical;">${_currentOrg.address || ''}</textarea>
        </div>
        ${admin ? `<button onclick="_orgSaveSettings()" style="padding:10px 20px;background:#2563eb;color:#fff;border:none;border-radius:8px;font-size:13px;font-weight:600;cursor:pointer;align-self:flex-start;">Save Changes</button>` : ''}
      </div>
    </div>
    <div style="margin-top:20px;padding:16px;background:#fef2f2;border:1px solid #fecaca;border-radius:10px;max-width:500px;">
      <p style="font-size:11px;color:#991b1b;margin:0;"><strong>Organization ID:</strong> ${_currentOrg.id}</p>
      <p style="font-size:11px;color:#991b1b;margin:4px 0 0;"><strong>Created:</strong> ${new Date(_currentOrg.created_at).toLocaleDateString('en-IN', { day:'numeric', month:'short', year:'numeric' })}</p>
    </div>`;
}

/** Save org settings */
async function _saveOrgSettings() {
  const sb = getSupabase();
  if (!sb || !_currentOrg) return;

  const { error } = await sb.from('organizations').update({
    name: document.getElementById('orgSettingName')?.value?.trim() || _currentOrg.name,
    email: document.getElementById('orgSettingEmail')?.value?.trim() || '',
    phone: document.getElementById('orgSettingPhone')?.value?.trim() || '',
    gst_number: document.getElementById('orgSettingGST')?.value?.trim() || '',
    address: document.getElementById('orgSettingAddress')?.value?.trim() || '',
    updated_at: new Date().toISOString(),
  }).eq('id', _currentOrg.id);

  if (error) { showToast('Failed to save: ' + error.message, 'error'); return; }

  await loadUserOrg();
  showToast('Organization updated!', 'success');
}

/** Create new org flow */
async function _createNewOrg() {
  const name = prompt('Enter your company/organization name:');
  if (!name?.trim()) return;

  const sb = getSupabase();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) { showToast('Please login first', 'error'); return; }

  const org = await createOrganization(name.trim(), user.id, user.email);
  if (org) {
    showToast('Organization created!', 'success');
    await loadOrgMembers();
    await loadOrgInvites();
    renderOrgSettings();
  }
}

// ══════════════════════════════════════════
// WINDOW BINDINGS (called from HTML onclick)
// ══════════════════════════════════════════
/** Dedicated "Plan & Billing" page — trial status + plans + pay buttons */
let _planBillingRetried = false;
let _planBillingRefreshed = false;
export function renderPlanBilling() {
  const container = document.getElementById('planBillingContent');
  if (!container) return;
  let org = _currentOrg || hydrateOrgFromCache();
  // Rendered instantly from cache → refresh once in the background for fresh plan/trial.
  if (org && org._fromCache && !_planBillingRefreshed) {
    _planBillingRefreshed = true;
    loadUserOrg().then(o => { if (o) renderPlanBilling(); }).catch(() => {});
  }
  if (!org) {
    container.innerHTML = '<p style="color:#64748b;font-size:13px;">Loading your workspace…</p>';
    // Org not loaded yet — fetch it once, then re-render.
    if (!_planBillingRetried) {
      _planBillingRetried = true;
      loadUserOrg().then(async (loaded) => {
        if (!loaded) {
          // Brand-new user with no org yet — create one (with 7-day trial)
          const sb = getSupabase();
          if (sb) {
            const { data: { user } } = await sb.auth.getUser();
            if (user) {
              const orgName = user.user_metadata?.display_name || user.email?.split('@')[0] || 'My Company';
              await createOrganization(orgName + "'s Team", user.id, user.email);
            }
          }
        }
        renderPlanBilling();
      }).catch(() => {
        container.innerHTML = '<p style="color:#ef4444;font-size:13px;">Couldn\'t load your workspace. Please refresh and try again.</p>';
      });
    }
    return;
  }
  _planBillingRetried = false;
  const currentPlan = org.plan || 'free';
  const trialDays = org.trial_ends_at ? Math.max(0, Math.ceil((new Date(org.trial_ends_at) - Date.now()) / 86400000)) : 0;
  const onTrial = currentPlan === 'free' && trialDays > 0;
  const trialExpired = currentPlan === 'free' && trialDays === 0;

  let banner;
  if (onTrial) {
    banner = `<div style="background:linear-gradient(135deg,#ecfdf5,#d1fae5);border:1px solid #6ee7b7;border-radius:12px;padding:16px 20px;margin-bottom:24px;"><div style="font-size:15px;font-weight:800;color:#065f46;">🎉 Free Trial — ${trialDays} day${trialDays !== 1 ? 's' : ''} left</div><p style="font-size:12px;color:#047857;margin:4px 0 0;">Your 7-day free trial includes the full platform. Choose a plan below to continue after it ends.</p></div>`;
  } else if (trialExpired) {
    banner = `<div style="background:#fef2f2;border:1px solid #fecaca;border-radius:12px;padding:16px 20px;margin-bottom:24px;"><div style="font-size:15px;font-weight:800;color:#991b1b;">Your free trial has ended</div><p style="font-size:12px;color:#b91c1c;margin:4px 0 0;">Choose a plan below to keep using True Site Sync.</p></div>`;
  } else {
    banner = `<div style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:12px;padding:16px 20px;margin-bottom:24px;"><div style="font-size:15px;font-weight:800;color:#1e40af;text-transform:capitalize;">Current Plan: ${currentPlan}</div><p style="font-size:12px;color:#1d4ed8;margin:4px 0 0;">Active subscription · ${org.max_seats} seats · ${org.max_projects} projects.</p></div>`;
  }

  const order = ['solo', 'starter', 'business', 'pro', 'enterprise'];
  const cards = order.map(id => {
    const plan = PLANS[id];
    const isCurrent = currentPlan === id;
    const popular = id === 'business';
    return `<div style="background:#fff;border:${isCurrent ? '2px solid #10b981' : '1px solid #e5e7eb'};border-radius:14px;padding:24px;text-align:center;${popular ? 'box-shadow:0 8px 24px -8px rgba(37,99,235,.25);' : ''}">
      ${popular ? '<div style="font-size:9px;font-weight:800;color:#2563eb;letter-spacing:1px;margin-bottom:6px;">MOST POPULAR</div>' : ''}
      <h4 style="font-size:17px;font-weight:800;color:#1e293b;margin:0 0 6px;">${plan.name}</h4>
      <div style="font-size:26px;font-weight:900;color:#2563eb;">₹${plan.price.toLocaleString('en-IN')}<span style="font-size:12px;color:#94a3b8;font-weight:600;">/yr</span></div>
      <div style="font-size:12px;color:#64748b;margin:14px 0 4px;">✓ ${plan.seats} team seat${plan.seats === 1 ? '' : 's'}</div>
      ${id === 'solo' ? '' : `<div style="font-size:12px;color:#64748b;margin-bottom:18px;">✓ ${plan.projects} projects</div>`}
      ${isCurrent
        ? '<div style="font-size:12px;font-weight:700;color:#10b981;padding:10px;">✓ Current Plan</div>'
        : `<button onclick="_orgUpgrade('${id}')" style="width:100%;padding:11px;background:#2563eb;color:#fff;border:none;border-radius:10px;font-size:13px;font-weight:700;cursor:pointer;">${currentPlan === 'free' ? 'Buy Now' : 'Switch to ' + plan.name}</button>`}
    </div>`;
  }).join('');

  container.innerHTML = banner +
    `<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:16px;">${cards}</div>` +
    `<p style="font-size:11px;color:#94a3b8;margin-top:18px;text-align:center;">Secure payment via Razorpay · Annual billing · GST invoice provided.</p>`;
}

// ══════════════════════════════════════════
// TRIAL ENFORCEMENT — block the app once the 7-day free trial ends
// ══════════════════════════════════════════

/** Resolve the current trial/subscription status (uses cache when the live org
 *  isn't loaded yet so the gate can act instantly). Only a FREE plan whose
 *  trial_ends_at has passed is "blocked" — paid plans are always allowed. */
export function getTrialStatus() {
  const org = _currentOrg || _cachedOrg();
  if (!org || !org.plan) return { known: false, blocked: false };
  const paid = org.plan !== 'free';
  const ends = org.trial_ends_at ? new Date(org.trial_ends_at).getTime() : 0;
  const daysLeft = ends ? Math.max(0, Math.ceil((ends - Date.now()) / 86400000)) : 0;
  const expired = !paid && (!ends || ends <= Date.now());
  return { known: true, plan: org.plan, paid, daysLeft, expired, blocked: expired, admin: isOrgAdmin() };
}

/** Show the paywall when (and only when) we KNOW the free trial has expired,
 *  otherwise make sure it's hidden. Safe to call repeatedly. */
export function enforceTrialGate() {
  const s = getTrialStatus();
  if (s.known && s.blocked) _showTrialPaywall(s); else _hideTrialPaywall();
  return s;
}

function _hideTrialPaywall() {
  const el = document.getElementById('trialPaywallOverlay');
  if (el) { el.remove(); document.body.style.overflow = ''; }
}

function _showTrialPaywall(s) {
  if (document.getElementById('trialPaywallOverlay')) return; // already shown
  const admin = s.admin;
  const order = ['solo', 'starter', 'business', 'pro', 'enterprise'];
  const cards = admin ? order.map(id => {
    const p = PLANS[id]; const popular = id === 'business';
    return `<div style="background:#fff;border:${popular ? '2px solid #2563eb' : '1px solid #e5e7eb'};border-radius:12px;padding:16px;text-align:center;">
      ${popular ? '<div style="font-size:9px;font-weight:800;color:#2563eb;letter-spacing:1px;margin-bottom:4px;">MOST POPULAR</div>' : ''}
      <h4 style="font-size:15px;font-weight:800;color:#1e293b;margin:0 0 4px;">${p.name}</h4>
      <div style="font-size:20px;font-weight:900;color:#2563eb;">₹${p.price.toLocaleString('en-IN')}<span style="font-size:11px;color:#94a3b8;font-weight:600;">/yr</span></div>
      <div style="font-size:11px;color:#64748b;margin:8px 0 2px;">✓ ${p.seats} seat${p.seats === 1 ? '' : 's'}</div>
      ${id === 'solo' ? '' : `<div style="font-size:11px;color:#64748b;margin-bottom:12px;">✓ ${p.projects} projects</div>`}
      <button onclick="window._orgUpgrade && window._orgUpgrade('${id}')" style="width:100%;padding:10px;background:#2563eb;color:#fff;border:none;border-radius:9px;font-size:12px;font-weight:700;cursor:pointer;">Buy Now</button>
    </div>`;
  }).join('') : '';

  const overlay = document.createElement('div');
  overlay.id = 'trialPaywallOverlay';
  overlay.style.cssText = 'position:fixed;inset:0;z-index:2147483000;background:rgba(15,23,42,.72);backdrop-filter:blur(4px);display:flex;align-items:flex-start;justify-content:center;overflow:auto;padding:24px;';
  overlay.innerHTML = `
    <div style="background:#fff;border-radius:18px;max-width:780px;width:100%;margin:auto;padding:28px;box-shadow:0 24px 70px rgba(0,0,0,.35);">
      <div style="text-align:center;margin-bottom:18px;">
        <div style="font-size:42px;">🔒</div>
        <h2 style="font-size:22px;font-weight:900;color:#0f172a;margin:8px 0 6px;">Your 7-day free trial has ended</h2>
        <p style="font-size:13px;color:#64748b;margin:0;max-width:520px;margin:0 auto;">
          ${admin
            ? 'Choose a plan to continue using True Site Sync. Your data is safe and waiting — you’ll get full access the moment your payment completes.'
            : 'Your team’s free trial has ended. Please ask your account owner/admin to upgrade so your team can continue.'}
        </p>
      </div>
      ${admin ? `<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(165px,1fr));gap:12px;margin-bottom:18px;">${cards}</div>` : ''}
      <div style="display:flex;gap:10px;justify-content:center;flex-wrap:wrap;">
        <button onclick="window.__trialRefresh && window.__trialRefresh(this)" style="padding:10px 18px;background:#10b981;color:#fff;border:none;border-radius:9px;font-size:12px;font-weight:700;cursor:pointer;">I’ve already paid — Refresh</button>
        <button onclick="window._rbacLogout && window._rbacLogout()" style="padding:10px 18px;background:#fff;color:#dc2626;border:1px solid #fecaca;border-radius:9px;font-size:12px;font-weight:700;cursor:pointer;">Logout</button>
      </div>
      <p style="font-size:11px;color:#94a3b8;text-align:center;margin-top:14px;">Secure payment via Razorpay · Annual billing · GST invoice provided.</p>
    </div>`;
  document.body.appendChild(overlay);
  document.body.style.overflow = 'hidden';
}

/** Re-check the trial after a payment / "already paid" click. */
async function _trialRefresh(btn) {
  if (btn) { btn.disabled = true; btn.textContent = 'Checking…'; }
  try { await loadUserOrg(); } catch {}
  const s = enforceTrialGate();
  if (s.blocked) { try { showToast('No active plan found yet. If you just paid, give it a moment and try again.', 'warning'); } catch {} }
  if (btn) { btn.disabled = false; btn.textContent = 'I’ve already paid — Refresh'; }
}

export function bindOrgWindowFunctions() {
  window.renderPlanBilling = renderPlanBilling;
  window.hydrateOrgFromCache = hydrateOrgFromCache;
  window.enforceTrialGate = enforceTrialGate;
  window.getTrialStatus = getTrialStatus;
  window.__trialRefresh = _trialRefresh;
  window._orgCreateNew = _createNewOrg;
  window._orgSaveSettings = _saveOrgSettings;
  window._orgInviteMember = async () => {
    const email = document.getElementById('inviteEmail')?.value?.trim();
    const role = document.getElementById('inviteRole')?.value || 'member';
    if (!email) { showToast('Enter an email address', 'error'); return; }
    await inviteMember(email, role);
    document.getElementById('inviteEmail').value = '';
    renderTeamPanel();
  };
  window._orgRemoveMember = removeMember;
  window._orgChangeRole = updateMemberRole;
  window._orgCancelInvite = cancelInvite;
  window._orgUpgrade = upgradePlan;
  window._orgBuySeats = () => {
    const count = parseInt(document.getElementById('extraSeatsCount')?.value) || 5;
    buyExtraSeats(count);
  };
  window.switchOrgTab = switchOrgTab;
}
