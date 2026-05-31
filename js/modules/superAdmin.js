/**
 * ═══════════════════════════════════════════════════════════
 * True Site Sync — Super Admin Dashboard
 * ═══════════════════════════════════════════════════════════
 * Internal admin panel for the software owner to manage
 * all organizations, users, subscriptions, and leads.
 * ═══════════════════════════════════════════════════════════
 */

import { getSupabase } from '../database/supabase.js';
import { showToast } from './utils.js';

// Super admin emails — only these users see the admin panel
const SUPER_ADMINS = ['raghupadhiyar9@gmail.com', 'pjchauhan0704@gmail.com'];

let _allOrgs = [];
let _allLeads = [];
let _stats = {};

/** Check if current user is super admin */
export async function isSuperAdmin() {
  const sb = getSupabase();
  if (!sb) return false;
  const { data: { user } } = await sb.auth.getUser();
  return user && SUPER_ADMINS.includes(user.email);
}

/** Load all data for super admin dashboard */
async function _loadAdminData() {
  const sb = getSupabase();
  if (!sb) return;

  // Use service-level queries via RPC or direct (super admin bypasses RLS via being owner of all)
  // For now, we query what RLS allows + use counts

  const [orgsRes, leadsRes, membersRes, subsRes] = await Promise.all([
    sb.from('organizations').select('*').order('created_at', { ascending: false }),
    sb.from('download_leads').select('*').order('downloaded_at', { ascending: false }).limit(100),
    sb.from('org_members').select('org_id, user_id, role, is_active'),
    sb.from('subscriptions').select('org_id, plan, amount_inr, status, created_at').order('created_at', { ascending: false }),
  ]);

  _allOrgs = orgsRes.data || [];
  _allLeads = leadsRes.data || [];

  // Build member counts per org
  const memberCounts = {};
  (membersRes.data || []).forEach(m => {
    if (m.is_active) memberCounts[m.org_id] = (memberCounts[m.org_id] || 0) + 1;
  });

  // Build revenue per org
  const revenue = {};
  let totalRevenue = 0;
  (subsRes.data || []).forEach(s => {
    if (s.status === 'active' && s.amount_inr > 0) {
      revenue[s.org_id] = (revenue[s.org_id] || 0) + s.amount_inr;
      totalRevenue += s.amount_inr;
    }
  });

  // Attach counts to orgs
  _allOrgs.forEach(org => {
    org._memberCount = memberCounts[org.id] || 0;
    org._revenue = revenue[org.id] || 0;
  });

  _stats = {
    totalOrgs: _allOrgs.length,
    activeOrgs: _allOrgs.filter(o => o.is_active).length,
    totalUsers: (membersRes.data || []).filter(m => m.is_active).length,
    totalRevenue,
    totalLeads: _allLeads.length,
    paidOrgs: _allOrgs.filter(o => o.plan !== 'free').length,
    freeOrgs: _allOrgs.filter(o => o.plan === 'free').length,
  };
}

/** Render the super admin dashboard */
export async function renderSuperAdminDashboard() {
  const container = document.getElementById('superAdminContent');
  if (!container) return;

  container.innerHTML = '<div style="text-align:center;padding:40px;color:#94a3b8;"><div style="font-size:24px;margin-bottom:8px;">Loading...</div></div>';

  await _loadAdminData();

  const s = _stats;

  let html = `
    <!-- KPI Cards -->
    <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:10px;margin-bottom:20px;">
      <div style="background:#fff;border:1px solid #e5e7eb;border-radius:10px;padding:16px;border-left:3px solid #2563eb;">
        <div style="font-size:22px;font-weight:800;color:#1e293b;font-family:'JetBrains Mono',monospace;">${s.totalOrgs}</div>
        <div style="font-size:10px;color:#94a3b8;text-transform:uppercase;font-weight:600;margin-top:2px;">Total Orgs</div>
      </div>
      <div style="background:#fff;border:1px solid #e5e7eb;border-radius:10px;padding:16px;border-left:3px solid #10b981;">
        <div style="font-size:22px;font-weight:800;color:#1e293b;font-family:'JetBrains Mono',monospace;">${s.activeOrgs}</div>
        <div style="font-size:10px;color:#94a3b8;text-transform:uppercase;font-weight:600;margin-top:2px;">Active</div>
      </div>
      <div style="background:#fff;border:1px solid #e5e7eb;border-radius:10px;padding:16px;border-left:3px solid #f59e0b;">
        <div style="font-size:22px;font-weight:800;color:#1e293b;font-family:'JetBrains Mono',monospace;">${s.totalUsers}</div>
        <div style="font-size:10px;color:#94a3b8;text-transform:uppercase;font-weight:600;margin-top:2px;">Total Users</div>
      </div>
      <div style="background:#fff;border:1px solid #e5e7eb;border-radius:10px;padding:16px;border-left:3px solid #7c3aed;">
        <div style="font-size:22px;font-weight:800;color:#1e293b;font-family:'JetBrains Mono',monospace;">${s.paidOrgs}</div>
        <div style="font-size:10px;color:#94a3b8;text-transform:uppercase;font-weight:600;margin-top:2px;">Paid Orgs</div>
      </div>
      <div style="background:#fff;border:1px solid #e5e7eb;border-radius:10px;padding:16px;border-left:3px solid #059669;">
        <div style="font-size:22px;font-weight:800;color:#059669;font-family:'JetBrains Mono',monospace;">₹${s.totalRevenue.toLocaleString('en-IN')}</div>
        <div style="font-size:10px;color:#94a3b8;text-transform:uppercase;font-weight:600;margin-top:2px;">Total Revenue</div>
      </div>
      <div style="background:#fff;border:1px solid #e5e7eb;border-radius:10px;padding:16px;border-left:3px solid #ea580c;">
        <div style="font-size:22px;font-weight:800;color:#1e293b;font-family:'JetBrains Mono',monospace;">${s.totalLeads}</div>
        <div style="font-size:10px;color:#94a3b8;text-transform:uppercase;font-weight:600;margin-top:2px;">Download Leads</div>
      </div>
    </div>

    <!-- Tabs -->
    <div style="display:flex;gap:4px;margin-bottom:16px;border-bottom:1px solid #e5e7eb;">
      <button onclick="_saTab('orgs')" id="saTabOrgs" style="padding:10px 18px;font-size:13px;font-weight:600;color:#2563eb;background:none;border:none;border-bottom:2px solid #2563eb;cursor:pointer;">Organizations</button>
      <button onclick="_saTab('leads')" id="saTabLeads" style="padding:10px 18px;font-size:13px;font-weight:600;color:#64748b;background:none;border:none;border-bottom:2px solid transparent;cursor:pointer;">Download Leads</button>
    </div>
    <div id="saTabContent"></div>`;

  container.innerHTML = html;
  _renderOrgsTab();
}

function _saTabSwitch(tab) {
  document.querySelectorAll('[id^="saTab"]').forEach(t => {
    if (t.id === 'saTabContent') return;
    t.style.color = '#64748b';
    t.style.borderBottomColor = 'transparent';
  });
  const id = 'saTab' + tab.charAt(0).toUpperCase() + tab.slice(1);
  const el = document.getElementById(id);
  if (el) { el.style.color = '#2563eb'; el.style.borderBottomColor = '#2563eb'; }

  if (tab === 'orgs') _renderOrgsTab();
  else if (tab === 'leads') _renderLeadsTab();
}

function _renderOrgsTab() {
  const container = document.getElementById('saTabContent');
  if (!container) return;

  let html = `<div style="overflow-x:auto;">
    <table style="width:100%;border-collapse:collapse;font-size:12px;min-width:700px;">
      <thead>
        <tr style="background:#f8fafc;">
          <th style="text-align:left;padding:10px 12px;font-size:10px;font-weight:600;color:#64748b;text-transform:uppercase;border-bottom:1px solid #e5e7eb;">Company</th>
          <th style="text-align:center;padding:10px 12px;font-size:10px;font-weight:600;color:#64748b;text-transform:uppercase;border-bottom:1px solid #e5e7eb;">Plan</th>
          <th style="text-align:center;padding:10px 12px;font-size:10px;font-weight:600;color:#64748b;text-transform:uppercase;border-bottom:1px solid #e5e7eb;">Users</th>
          <th style="text-align:center;padding:10px 12px;font-size:10px;font-weight:600;color:#64748b;text-transform:uppercase;border-bottom:1px solid #e5e7eb;">Max Seats</th>
          <th style="text-align:right;padding:10px 12px;font-size:10px;font-weight:600;color:#64748b;text-transform:uppercase;border-bottom:1px solid #e5e7eb;">Revenue</th>
          <th style="text-align:center;padding:10px 12px;font-size:10px;font-weight:600;color:#64748b;text-transform:uppercase;border-bottom:1px solid #e5e7eb;">Status</th>
          <th style="text-align:center;padding:10px 12px;font-size:10px;font-weight:600;color:#64748b;text-transform:uppercase;border-bottom:1px solid #e5e7eb;">Created</th>
          <th style="text-align:center;padding:10px 12px;font-size:10px;font-weight:600;color:#64748b;text-transform:uppercase;border-bottom:1px solid #e5e7eb;">Actions</th>
        </tr>
      </thead>
      <tbody>`;

  if (!_allOrgs.length) {
    html += '<tr><td colspan="8" style="text-align:center;padding:30px;color:#94a3b8;">No organizations yet</td></tr>';
  }

  _allOrgs.forEach(org => {
    const planColors = { free:'#6b7280', starter:'#2563eb', business:'#7c3aed', enterprise:'#059669' };
    const planColor = planColors[org.plan] || '#6b7280';
    html += `
      <tr style="border-bottom:1px solid #f3f4f6;">
        <td style="padding:10px 12px;">
          <div style="font-weight:600;color:#1e293b;">${org.name}</div>
          <div style="font-size:10px;color:#94a3b8;">${org.email || ''}</div>
        </td>
        <td style="text-align:center;padding:10px 12px;">
          <span style="font-size:10px;font-weight:700;text-transform:uppercase;color:${planColor};background:${planColor}15;padding:3px 8px;border-radius:6px;">${org.plan}</span>
        </td>
        <td style="text-align:center;padding:10px 12px;font-weight:600;color:#1e293b;">${org._memberCount}</td>
        <td style="text-align:center;padding:10px 12px;color:#64748b;">${org.max_seats}</td>
        <td style="text-align:right;padding:10px 12px;font-weight:600;color:#059669;font-family:'JetBrains Mono',monospace;">₹${(org._revenue || 0).toLocaleString('en-IN')}</td>
        <td style="text-align:center;padding:10px 12px;">
          <span style="font-size:10px;font-weight:600;padding:3px 8px;border-radius:6px;${org.is_active ? 'color:#059669;background:#f0fdf4;' : 'color:#dc2626;background:#fef2f2;'}">${org.is_active ? 'Active' : 'Disabled'}</span>
        </td>
        <td style="text-align:center;padding:10px 12px;font-size:11px;color:#94a3b8;">${new Date(org.created_at).toLocaleDateString('en-IN', {day:'numeric',month:'short'})}</td>
        <td style="text-align:center;padding:10px 12px;">
          <div style="display:flex;gap:4px;justify-content:center;flex-wrap:wrap;">
            <button onclick="_saEditSeats('${org.id}',${org.max_seats})" style="padding:3px 8px;font-size:10px;font-weight:600;background:#eff6ff;color:#2563eb;border:1px solid #bfdbfe;border-radius:5px;cursor:pointer;">Seats</button>
            <button onclick="_saToggleOrg('${org.id}',${org.is_active})" style="padding:3px 8px;font-size:10px;font-weight:600;background:${org.is_active ? '#fef2f2' : '#f0fdf4'};color:${org.is_active ? '#dc2626' : '#059669'};border:1px solid ${org.is_active ? '#fecaca' : '#bbf7d0'};border-radius:5px;cursor:pointer;">${org.is_active ? 'Disable' : 'Enable'}</button>
          </div>
        </td>
      </tr>`;
  });

  html += '</tbody></table></div>';
  container.innerHTML = html;
}

function _renderLeadsTab() {
  const container = document.getElementById('saTabContent');
  if (!container) return;

  let html = `<div style="overflow-x:auto;">
    <table style="width:100%;border-collapse:collapse;font-size:12px;min-width:500px;">
      <thead>
        <tr style="background:#f8fafc;">
          <th style="text-align:left;padding:10px 12px;font-size:10px;font-weight:600;color:#64748b;text-transform:uppercase;border-bottom:1px solid #e5e7eb;">Name</th>
          <th style="text-align:left;padding:10px 12px;font-size:10px;font-weight:600;color:#64748b;text-transform:uppercase;border-bottom:1px solid #e5e7eb;">Phone</th>
          <th style="text-align:left;padding:10px 12px;font-size:10px;font-weight:600;color:#64748b;text-transform:uppercase;border-bottom:1px solid #e5e7eb;">Email</th>
          <th style="text-align:center;padding:10px 12px;font-size:10px;font-weight:600;color:#64748b;text-transform:uppercase;border-bottom:1px solid #e5e7eb;">Platform</th>
          <th style="text-align:center;padding:10px 12px;font-size:10px;font-weight:600;color:#64748b;text-transform:uppercase;border-bottom:1px solid #e5e7eb;">Date</th>
        </tr>
      </thead>
      <tbody>`;

  if (!_allLeads.length) {
    html += '<tr><td colspan="5" style="text-align:center;padding:30px;color:#94a3b8;">No download leads yet</td></tr>';
  }

  _allLeads.forEach(lead => {
    html += `
      <tr style="border-bottom:1px solid #f3f4f6;">
        <td style="padding:10px 12px;font-weight:600;color:#1e293b;">${lead.name || '—'}</td>
        <td style="padding:10px 12px;color:#1e293b;font-family:'JetBrains Mono',monospace;font-size:12px;">${lead.phone || '—'}</td>
        <td style="padding:10px 12px;color:#64748b;font-size:12px;">${lead.email || '—'}</td>
        <td style="text-align:center;padding:10px 12px;">
          <span style="font-size:10px;font-weight:600;text-transform:uppercase;padding:3px 8px;border-radius:6px;${lead.platform === 'windows' ? 'color:#2563eb;background:#eff6ff;' : 'color:#059669;background:#f0fdf4;'}">${lead.platform || '—'}</span>
        </td>
        <td style="text-align:center;padding:10px 12px;font-size:11px;color:#94a3b8;">${lead.downloaded_at ? new Date(lead.downloaded_at).toLocaleDateString('en-IN', {day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'}) : '—'}</td>
      </tr>`;
  });

  html += '</tbody></table></div>';
  container.innerHTML = html;
}

/** Edit org seats */
async function _editSeats(orgId, currentSeats) {
  const newSeats = prompt(`Current seats: ${currentSeats}\nEnter new seat limit:`, currentSeats);
  if (!newSeats || isNaN(newSeats)) return;

  const sb = getSupabase();
  await sb.from('organizations').update({ max_seats: parseInt(newSeats), updated_at: new Date().toISOString() }).eq('id', orgId);
  showToast(`Seats updated to ${newSeats}`, 'success');
  await renderSuperAdminDashboard();
}

/** Toggle org active/disabled */
async function _toggleOrg(orgId, currentlyActive) {
  const action = currentlyActive ? 'disable' : 'enable';
  if (!confirm(`Are you sure you want to ${action} this organization?`)) return;

  const sb = getSupabase();
  await sb.from('organizations').update({ is_active: !currentlyActive, updated_at: new Date().toISOString() }).eq('id', orgId);
  showToast(`Organization ${action}d`, 'success');
  await renderSuperAdminDashboard();
}

/** Bind window functions */
export function bindSuperAdminFunctions() {
  window._saTab = _saTabSwitch;
  window._saEditSeats = _editSeats;
  window._saToggleOrg = _toggleOrg;
  window.renderSuperAdminDashboard = renderSuperAdminDashboard;
}
