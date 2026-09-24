/**
 * ═══════════════════════════════════════════════════════════
 * True Site Sync — Super Admin Dashboard
 * ═══════════════════════════════════════════════════════════
 */

import { getSupabase, SUPABASE_URL } from '../database/supabase.js';
import { showToast } from './utils.js';

const SUPER_ADMINS = ['raghupadhiyar9@gmail.com', 'pjchauhan0704@gmail.com'];

let _data = null; // cached admin data

export async function isSuperAdmin() {
  const sb = getSupabase();
  if (!sb) return false;
  try {
    // Try getSession first (cached, faster), fallback to getUser
    const { data: { session } } = await sb.auth.getSession();
    if (session?.user) return SUPER_ADMINS.includes(session.user.email);
    const { data: { user } } = await sb.auth.getUser();
    return user && SUPER_ADMINS.includes(user.email);
  } catch { return false; }
}

async function _fetchAdminData() {
  const sb = getSupabase();
  if (!sb) return null;
  try {
    const { data: { session } } = await sb.auth.getSession();
    if (!session) return null;
    const res = await fetch(`${SUPABASE_URL}/functions/v1/admin-data`, {
      headers: { 'Authorization': `Bearer ${session.access_token}`, 'Content-Type': 'application/json' }
    });
    if (!res.ok) return null;
    _data = await res.json();
    return _data;
  } catch (e) {
    console.error('[admin] fetch failed:', e);
    return null;
  }
}

export async function renderSuperAdminDashboard() {
  const container = document.getElementById('superAdminContent');
  if (!container) return;
  container.innerHTML = '<div style="text-align:center;padding:40px;"><div style="font-size:20px;margin-bottom:8px;color:#94a3b8;">Loading admin data...</div></div>';

  const data = await _fetchAdminData();
  if (!data) {
    container.innerHTML = '<div style="text-align:center;padding:40px;color:#ef4444;">Failed to load admin data. Are you a super admin?</div>';
    return;
  }

  const s = data.stats;
  const now = new Date();

  container.innerHTML = `
    <!-- KPI Cards -->
    <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(140px,1fr));gap:10px;margin-bottom:20px;">
      ${_kpi(s.totalUsers, 'Total Users', '#2563eb')}
      ${_kpi(s.activeToday, 'Active Today', '#ef8420')}
      ${_kpi(s.activeWeek, 'Active 7 Days', '#d6402c')}
      ${_kpi(s.withProjects, 'With Projects', '#7c3aed')}
      ${_kpi(s.totalOrgs, 'Organizations', '#f59e0b')}
      ${_kpi(s.paidOrgs, 'Paid Plans', '#d6402c')}
      ${_kpi('₹' + (s.totalRevenue || 0).toLocaleString('en-IN'), 'Revenue', '#d6402c')}
      ${_kpi(s.totalLeads, 'Downloads', '#ea580c')}
      ${_kpi(s.totalDemoLeads || 0, 'Demo Requests', '#7c3aed')}
    </div>

    <!-- Tabs -->
    <div style="display:flex;gap:2px;margin-bottom:16px;background:#f1f5f9;border-radius:10px;padding:3px;">
      <button onclick="_saTab('users')" id="saTabUsers" class="sa-tab sa-tab-active">Users</button>
      <button onclick="_saTab('demo')" id="saTabDemo" class="sa-tab">Demo Requests${(s.totalDemoLeads||0) ? ` (${s.totalDemoLeads})` : ''}</button>
      <button onclick="_saTab('leads')" id="saTabLeads" class="sa-tab">Download Leads</button>
      <button onclick="_saTab('orgs')" id="saTabOrgs" class="sa-tab">Organizations</button>
    </div>
    <div id="saTabContent"></div>
  `;

  // Add tab styles
  if (!document.getElementById('saTabStyles')) {
    const style = document.createElement('style');
    style.id = 'saTabStyles';
    style.textContent = `.sa-tab{flex:1;padding:8px 12px;font-size:12px;font-weight:600;border:none;background:none;color:#64748b;border-radius:8px;cursor:pointer;transition:all .15s}.sa-tab:hover{color:#1e293b}.sa-tab-active{background:#fff;color:#1e293b;box-shadow:0 1px 3px rgba(0,0,0,.08)}`;
    document.head.appendChild(style);
  }

  _renderUsersTab();
}

function _kpi(value, label, color) {
  return `<div style="background:#fff;border:1px solid #e5e7eb;border-radius:10px;padding:14px 16px;border-left:3px solid ${color};">
    <div style="font-size:20px;font-weight:800;color:#1e293b;font-family:'JetBrains Mono',monospace;">${value}</div>
    <div style="font-size:9px;color:#94a3b8;text-transform:uppercase;font-weight:600;margin-top:2px;letter-spacing:.3px;">${label}</div>
  </div>`;
}

function _saTabSwitch(tab) {
  document.querySelectorAll('.sa-tab').forEach(t => t.classList.remove('sa-tab-active'));
  const el = document.getElementById('saTab' + tab.charAt(0).toUpperCase() + tab.slice(1));
  if (el) el.classList.add('sa-tab-active');
  if (tab === 'users') _renderUsersTab();
  else if (tab === 'demo') _renderDemoTab();
  else if (tab === 'leads') _renderLeadsTab();
  else if (tab === 'orgs') _renderOrgsTab();
}

function _renderDemoTab() {
  const container = document.getElementById('saTabContent');
  if (!container || !_data) return;
  const leads = _data.demoLeads || [];

  if (!leads.length) {
    container.innerHTML = '<div style="text-align:center;padding:40px;color:#94a3b8;"><div style="font-size:28px;margin-bottom:8px;">🎥</div>No demo requests yet.<br>Requests from the website Book-a-Demo form will show here.</div>';
    return;
  }

  const esc = (v) => String(v == null ? '' : v).replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));

  let html = `<div style="overflow-x:auto;"><table style="width:100%;border-collapse:collapse;font-size:12px;min-width:760px;">
    <thead><tr style="background:#f8fafc;">
      <th style="text-align:left;padding:10px 12px;font-size:10px;font-weight:600;color:#64748b;text-transform:uppercase;border-bottom:1px solid #e5e7eb;">Name</th>
      <th style="text-align:left;padding:10px;font-size:10px;font-weight:600;color:#64748b;text-transform:uppercase;border-bottom:1px solid #e5e7eb;">Company</th>
      <th style="text-align:left;padding:10px;font-size:10px;font-weight:600;color:#64748b;text-transform:uppercase;border-bottom:1px solid #e5e7eb;">Phone</th>
      <th style="text-align:left;padding:10px;font-size:10px;font-weight:600;color:#64748b;text-transform:uppercase;border-bottom:1px solid #e5e7eb;">Interested in</th>
      <th style="text-align:left;padding:10px;font-size:10px;font-weight:600;color:#64748b;text-transform:uppercase;border-bottom:1px solid #e5e7eb;">Note</th>
      <th style="text-align:center;padding:10px;font-size:10px;font-weight:600;color:#64748b;text-transform:uppercase;border-bottom:1px solid #e5e7eb;">Via</th>
      <th style="text-align:center;padding:10px;font-size:10px;font-weight:600;color:#64748b;text-transform:uppercase;border-bottom:1px solid #e5e7eb;">Received</th>
    </tr></thead><tbody>`;

  leads.forEach(l => {
    const phone = (l.phone || '').replace(/[^0-9]/g, '');
    const wa = phone ? (phone.length === 10 ? '91' + phone : phone) : '';
    const phoneCell = phone
      ? `<a href="https://wa.me/${wa}" target="_blank" rel="noopener" style="color:#d6402c;font-family:monospace;font-weight:600;text-decoration:none;">${esc(l.phone)}</a>`
      : '<span style="color:#cbd5e1;">—</span>';
    const via = (l.source === 'whatsapp')
      ? '<span style="font-size:10px;font-weight:700;padding:3px 8px;border-radius:6px;color:#d6402c;background:#fff3ea;">WhatsApp</span>'
      : '<span style="font-size:10px;font-weight:700;padding:3px 8px;border-radius:6px;color:#7c3aed;background:#f5f3ff;">Form</span>';
    const when = l.created_at ? new Date(l.created_at).toLocaleString('en-IN', {day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'}) : '—';
    html += `<tr style="border-bottom:1px solid #f3f4f6;">
      <td style="padding:10px 12px;font-weight:600;color:#1e293b;">${esc(l.name) || '—'}</td>
      <td style="padding:10px;color:#334155;">${esc(l.company) || '—'}</td>
      <td style="padding:10px;">${phoneCell}</td>
      <td style="padding:10px;color:#334155;">${esc(l.interest) || '—'}</td>
      <td style="padding:10px;color:#64748b;font-size:11px;max-width:220px;">${esc(l.note) || '—'}</td>
      <td style="text-align:center;padding:10px;">${via}</td>
      <td style="text-align:center;padding:10px;font-size:11px;color:#94a3b8;white-space:nowrap;">${when}</td>
    </tr>`;
  });

  html += '</tbody></table></div>';
  container.innerHTML = html;
}

function _renderUsersTab() {
  const container = document.getElementById('saTabContent');
  if (!container || !_data) return;
  const users = _data.users || [];
  const now = new Date();

  let html = `<div style="overflow-x:auto;"><table style="width:100%;border-collapse:collapse;font-size:12px;min-width:750px;">
    <thead><tr style="background:#f8fafc;">
      <th style="text-align:left;padding:10px 12px;font-size:10px;font-weight:600;color:#64748b;text-transform:uppercase;border-bottom:1px solid #e5e7eb;">User</th>
      <th style="text-align:left;padding:10px;font-size:10px;font-weight:600;color:#64748b;text-transform:uppercase;border-bottom:1px solid #e5e7eb;">Phone</th>
      <th style="text-align:center;padding:10px;font-size:10px;font-weight:600;color:#64748b;text-transform:uppercase;border-bottom:1px solid #e5e7eb;">Projects</th>
      <th style="text-align:center;padding:10px;font-size:10px;font-weight:600;color:#64748b;text-transform:uppercase;border-bottom:1px solid #e5e7eb;">Plan</th>
      <th style="text-align:center;padding:10px;font-size:10px;font-weight:600;color:#64748b;text-transform:uppercase;border-bottom:1px solid #e5e7eb;">Status</th>
      <th style="text-align:center;padding:10px;font-size:10px;font-weight:600;color:#64748b;text-transform:uppercase;border-bottom:1px solid #e5e7eb;">Signed Up</th>
      <th style="text-align:center;padding:10px;font-size:10px;font-weight:600;color:#64748b;text-transform:uppercase;border-bottom:1px solid #e5e7eb;">Last Active</th>
      <th style="text-align:center;padding:10px;font-size:10px;font-weight:600;color:#64748b;text-transform:uppercase;border-bottom:1px solid #e5e7eb;">Data</th>
    </tr></thead><tbody>`;

  if (!users.length) {
    html += '<tr><td colspan="8" style="text-align:center;padding:30px;color:#94a3b8;">No users yet</td></tr>';
  }

  users.forEach(u => {
    const signedUp = new Date(u.created_at);
    const lastActive = u.last_sign_in ? new Date(u.last_sign_in) : null;
    const daysAgo = lastActive ? Math.floor((now - lastActive) / 86400000) : 999;
    const activeColor = daysAgo === 0 ? '#ef8420' : daysAgo <= 7 ? '#f59e0b' : '#ef4444';
    const activeLabel = daysAgo === 0 ? 'Today' : daysAgo <= 1 ? 'Yesterday' : lastActive ? `${daysAgo}d ago` : 'Never';

    // Trial status
    const trialEnd = u.trial_ends ? new Date(u.trial_ends) : new Date(signedUp.getTime() + 6 * 86400000);
    const trialDaysLeft = Math.max(0, Math.ceil((trialEnd - now) / 86400000));
    const isTrial = u.org_plan === 'free' || !u.org_plan;
    const trialExpired = isTrial && trialDaysLeft <= 0;

    let statusHtml = '';
    if (!isTrial) {
      statusHtml = `<span style="font-size:10px;font-weight:700;padding:3px 8px;border-radius:6px;color:#d6402c;background:#fff3ea;">Paid</span>`;
    } else if (trialExpired) {
      statusHtml = `<span style="font-size:10px;font-weight:700;padding:3px 8px;border-radius:6px;color:#dc2626;background:#fef2f2;">Trial Expired</span>`;
    } else {
      statusHtml = `<span style="font-size:10px;font-weight:700;padding:3px 8px;border-radius:6px;color:#f59e0b;background:#fffbeb;">Trial ${trialDaysLeft}d left</span>`;
    }

    const planColors = { free:'#6b7280', starter:'#2563eb', business:'#7c3aed', enterprise:'#d6402c' };
    const plan = u.org_plan || 'free';

    html += `<tr style="border-bottom:1px solid #f3f4f6;">
      <td style="padding:10px 12px;">
        <div style="font-weight:600;color:#1e293b;font-size:12px;">${u.name || u.email.split('@')[0]}</div>
        <div style="font-size:10px;color:#94a3b8;">${u.email}</div>
        ${u.org_name ? `<div style="font-size:9px;color:#6366f1;font-weight:600;margin-top:2px;">${u.org_name}</div>` : ''}
      </td>
      <td style="padding:10px;font-family:monospace;font-size:12px;color:${u.phone ? '#1e293b' : '#cbd5e1'};">${u.phone || '—'}</td>
      <td style="text-align:center;padding:10px;font-weight:700;color:#1e293b;">${u.projects}</td>
      <td style="text-align:center;padding:10px;">
        <span style="font-size:10px;font-weight:700;text-transform:uppercase;color:${planColors[plan] || '#6b7280'};background:${(planColors[plan] || '#6b7280')}15;padding:3px 8px;border-radius:6px;">${plan}</span>
      </td>
      <td style="text-align:center;padding:10px;">${statusHtml}</td>
      <td style="text-align:center;padding:10px;font-size:11px;color:#64748b;">${signedUp.toLocaleDateString('en-IN', {day:'numeric',month:'short',year:'2-digit'})}</td>
      <td style="text-align:center;padding:10px;">
        <span style="font-size:10px;font-weight:600;color:${activeColor};">${activeLabel}</span>
      </td>
      <td style="text-align:center;padding:10px;font-size:11px;color:#94a3b8;">${u.data_keys} keys</td>
    </tr>`;
  });

  html += '</tbody></table></div>';
  container.innerHTML = html;
}

function _renderLeadsTab() {
  const container = document.getElementById('saTabContent');
  if (!container || !_data) return;
  const leads = _data.leads || [];

  let html = `<div style="overflow-x:auto;"><table style="width:100%;border-collapse:collapse;font-size:12px;min-width:500px;">
    <thead><tr style="background:#f8fafc;">
      <th style="text-align:left;padding:10px 12px;font-size:10px;font-weight:600;color:#64748b;text-transform:uppercase;border-bottom:1px solid #e5e7eb;">Name</th>
      <th style="text-align:left;padding:10px;font-size:10px;font-weight:600;color:#64748b;text-transform:uppercase;border-bottom:1px solid #e5e7eb;">Phone</th>
      <th style="text-align:left;padding:10px;font-size:10px;font-weight:600;color:#64748b;text-transform:uppercase;border-bottom:1px solid #e5e7eb;">Email</th>
      <th style="text-align:center;padding:10px;font-size:10px;font-weight:600;color:#64748b;text-transform:uppercase;border-bottom:1px solid #e5e7eb;">Platform</th>
      <th style="text-align:center;padding:10px;font-size:10px;font-weight:600;color:#64748b;text-transform:uppercase;border-bottom:1px solid #e5e7eb;">Downloaded</th>
    </tr></thead><tbody>`;

  if (!leads.length) {
    html += '<tr><td colspan="5" style="text-align:center;padding:30px;color:#94a3b8;">No download leads yet</td></tr>';
  }

  leads.forEach(l => {
    html += `<tr style="border-bottom:1px solid #f3f4f6;">
      <td style="padding:10px 12px;font-weight:600;color:#1e293b;">${l.name || '—'}</td>
      <td style="padding:10px;color:#1e293b;font-family:monospace;font-size:12px;">${l.phone || '—'}</td>
      <td style="padding:10px;color:#64748b;font-size:11px;">${l.email || '—'}</td>
      <td style="text-align:center;padding:10px;">
        <span style="font-size:10px;font-weight:600;text-transform:uppercase;padding:3px 8px;border-radius:6px;${l.platform === 'windows' ? 'color:#2563eb;background:#eff6ff;' : 'color:#d6402c;background:#fff3ea;'}">${l.platform || '—'}</span>
      </td>
      <td style="text-align:center;padding:10px;font-size:11px;color:#94a3b8;">${l.downloaded_at ? new Date(l.downloaded_at).toLocaleDateString('en-IN', {day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'}) : '—'}</td>
    </tr>`;
  });

  html += '</tbody></table></div>';
  container.innerHTML = html;
}

function _renderOrgsTab() {
  const container = document.getElementById('saTabContent');
  if (!container || !_data) return;
  const orgs = _data.orgs || [];

  if (!orgs.length) {
    container.innerHTML = '<div style="text-align:center;padding:40px;color:#94a3b8;"><div style="font-size:28px;margin-bottom:8px;">🏢</div>No organizations created yet.<br>Users will auto-create orgs on first login.</div>';
    return;
  }

  let html = `<div style="overflow-x:auto;"><table style="width:100%;border-collapse:collapse;font-size:12px;">
    <thead><tr style="background:#f8fafc;">
      <th style="text-align:left;padding:10px 12px;font-size:10px;font-weight:600;color:#64748b;text-transform:uppercase;border-bottom:1px solid #e5e7eb;">Company</th>
      <th style="text-align:center;padding:10px;font-size:10px;font-weight:600;color:#64748b;text-transform:uppercase;border-bottom:1px solid #e5e7eb;">Plan</th>
      <th style="text-align:center;padding:10px;font-size:10px;font-weight:600;color:#64748b;text-transform:uppercase;border-bottom:1px solid #e5e7eb;">Seats</th>
      <th style="text-align:center;padding:10px;font-size:10px;font-weight:600;color:#64748b;text-transform:uppercase;border-bottom:1px solid #e5e7eb;">Status</th>
      <th style="text-align:center;padding:10px;font-size:10px;font-weight:600;color:#64748b;text-transform:uppercase;border-bottom:1px solid #e5e7eb;">Created</th>
    </tr></thead><tbody>`;

  orgs.forEach(o => {
    html += `<tr style="border-bottom:1px solid #f3f4f6;">
      <td style="padding:10px 12px;font-weight:600;color:#1e293b;">${o.name}<div style="font-size:10px;color:#94a3b8;">${o.email || ''}</div></td>
      <td style="text-align:center;padding:10px;"><span style="font-size:10px;font-weight:700;text-transform:uppercase;padding:3px 8px;border-radius:6px;color:#2563eb;background:#eff6ff;">${o.plan}</span></td>
      <td style="text-align:center;padding:10px;font-weight:600;">${o.max_seats}</td>
      <td style="text-align:center;padding:10px;"><span style="font-size:10px;font-weight:600;padding:3px 8px;border-radius:6px;${o.is_active ? 'color:#d6402c;background:#fff3ea;' : 'color:#dc2626;background:#fef2f2;'}">${o.is_active ? 'Active' : 'Disabled'}</span></td>
      <td style="text-align:center;padding:10px;font-size:11px;color:#94a3b8;">${new Date(o.created_at).toLocaleDateString('en-IN', {day:'numeric',month:'short'})}</td>
    </tr>`;
  });

  html += '</tbody></table></div>';
  container.innerHTML = html;
}

export function bindSuperAdminFunctions() {
  window._saTab = _saTabSwitch;
  window.renderSuperAdminDashboard = renderSuperAdminDashboard;
}
