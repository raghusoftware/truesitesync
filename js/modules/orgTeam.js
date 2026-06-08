/* ============================================================================
 * orgTeam.js — Company team & teammate invites (org-shared real-time sync)
 * Invite a teammate by email → when they sign in with that email they auto-join
 * your organization (via accept_pending_invites) and share one live dataset.
 * ==========================================================================*/
import { getSupabase } from '../database/supabase.js';
import { showToast } from './utils.js';

const _esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export async function renderOrgTeam() {
  const el = document.getElementById('orgTeamSection');
  if (!el) return;
  const sb = getSupabase();
  const orgId = (typeof window.getSyncOrgId === 'function') ? window.getSyncOrgId() : null;
  if (!sb || !orgId) {
    el.innerHTML = `<div class="bg-white rounded-xl shadow-sm border p-5 text-sm text-slate-400">Setting up your company workspace… reload in a moment.</div>`;
    return;
  }

  let members = [], invites = [], me = null;
  try { me = (await sb.auth.getUser()).data?.user || null; } catch {}
  try { const { data } = await sb.rpc('org_member_list', { p_org_id: orgId }); members = data || []; } catch {}
  try { const { data } = await sb.from('org_invites').select('*').eq('org_id', orgId).eq('status', 'pending').order('created_at', { ascending: false }); invites = data || []; } catch {}

  const roleOpt = (v) => ['member', 'admin', 'owner'].map(r => `<option value="${r}" ${v === r ? 'selected' : ''}>${r[0].toUpperCase() + r.slice(1)}</option>`).join('');

  const memberRows = members.map(m => {
    const isMe = me && m.user_id === me.id;
    const canRemove = !isMe && m.role !== 'owner';
    return `<div class="flex items-center justify-between py-2.5 px-1 border-b border-slate-100">
      <div class="flex items-center gap-3 min-w-0">
        <div style="width:34px;height:34px;border-radius:10px;background:#10b98115;border:1px solid #10b98130;display:flex;align-items:center;justify-content:center;font-weight:800;color:#059669;flex-shrink:0;">${_esc((m.email || '?').charAt(0).toUpperCase())}</div>
        <div class="min-w-0">
          <div class="text-sm font-bold text-slate-800 truncate">${_esc(m.email)} ${isMe ? '<span class="text-[9px] bg-blue-50 text-blue-600 border border-blue-200 px-1.5 py-0.5 rounded-full font-bold">You</span>' : ''}</div>
          <div class="text-[10px] text-slate-400 font-semibold uppercase tracking-wide">${_esc(m.role)}${m.is_active ? '' : ' · inactive'}</div>
        </div>
      </div>
      ${canRemove ? `<button onclick="_orgRemoveMember('${m.user_id}')" class="text-[11px] font-bold text-red-500 hover:bg-red-50 border border-red-200 px-2.5 py-1 rounded">Remove</button>` : ''}
    </div>`;
  }).join('') || '<p class="text-xs text-slate-400 py-3">No members yet.</p>';

  const inviteRows = invites.map(i => `
    <div class="flex items-center justify-between py-2 px-1 border-b border-slate-100">
      <div class="min-w-0">
        <div class="text-sm font-semibold text-slate-700 truncate">${_esc(i.email)}</div>
        <div class="text-[10px] text-amber-600 font-semibold uppercase tracking-wide">Pending · ${_esc(i.role)}</div>
      </div>
      <button onclick="_orgRevokeInvite('${i.id}')" class="text-[11px] font-bold text-slate-500 hover:bg-slate-100 border border-slate-200 px-2.5 py-1 rounded">Revoke</button>
    </div>`).join('');

  el.innerHTML = `
    <div class="bg-white rounded-xl shadow-sm border p-5">
      <div class="flex items-center gap-2 mb-1">
        <span style="font-size:18px;">👥</span>
        <h3 class="font-extrabold text-slate-800 text-base">Company Team</h3>
      </div>
      <p class="text-xs text-slate-400 mb-4">Invite a teammate by email. They join automatically the moment they sign in with that email — and instantly share all your live data.</p>

      <div class="flex flex-col sm:flex-row gap-2 mb-5">
        <input id="orgInviteEmail" type="email" placeholder="teammate@company.com" class="flex-1 p-2.5 border border-slate-300 rounded-lg text-sm outline-none focus:border-emerald-500" onkeydown="if(event.key==='Enter')window._orgInvite()">
        <select id="orgInviteRole" class="p-2.5 border border-slate-300 rounded-lg text-sm font-bold text-slate-600 bg-white outline-none">${roleOpt('member')}</select>
        <button onclick="window._orgInvite()" class="px-5 py-2.5 rounded-lg font-bold text-sm text-white" style="background:linear-gradient(135deg,#059669,#10b981);">+ Invite</button>
      </div>

      ${invites.length ? `<div class="mb-4"><div class="text-[10px] font-bold text-slate-400 uppercase tracking-wide mb-1">Pending invites</div>${inviteRows}</div>` : ''}

      <div>
        <div class="text-[10px] font-bold text-slate-400 uppercase tracking-wide mb-1">Members (${members.length})</div>
        ${memberRows}
      </div>
    </div>`;
}

/* ── Actions ───────────────────────────────────────────────────────────────*/
window._orgInvite = async function () {
  const emailEl = document.getElementById('orgInviteEmail');
  const email = (emailEl?.value || '').trim().toLowerCase();
  const role = document.getElementById('orgInviteRole')?.value || 'member';
  if (!/^.+@.+\..+$/.test(email)) { showToast('Enter a valid email address', 'error'); return; }
  const sb = getSupabase();
  const orgId = window.getSyncOrgId && window.getSyncOrgId();
  if (!orgId) { showToast('Your company workspace is still loading — try again in a moment', 'error'); return; }
  let me = null; try { me = (await sb.auth.getUser()).data?.user?.id; } catch {}
  const { error } = await sb.from('org_invites')
    .upsert({ org_id: orgId, email, role, invited_by: me, status: 'pending', accepted_at: null }, { onConflict: 'org_id,email' });
  if (error) { showToast('Invite failed: ' + error.message, 'error'); return; }
  if (emailEl) emailEl.value = '';
  showToast('✅ Invitation created for ' + email + ' — they join when they sign in with this email', 'success');
  renderOrgTeam();
};

window._orgRevokeInvite = async function (id) {
  const sb = getSupabase();
  const { error } = await sb.from('org_invites').delete().eq('id', id);
  if (error) { showToast('Could not revoke: ' + error.message, 'error'); return; }
  showToast('Invite revoked', 'info');
  renderOrgTeam();
};

window._orgRemoveMember = async function (userId) {
  if (!confirm('Remove this teammate from the company? They will lose access to shared data.')) return;
  const sb = getSupabase();
  const orgId = window.getSyncOrgId && window.getSyncOrgId();
  const { error } = await sb.from('org_members').update({ is_active: false }).eq('org_id', orgId).eq('user_id', userId);
  if (error) { showToast('Could not remove (permission): ' + error.message, 'error'); return; }
  showToast('Teammate removed', 'info');
  renderOrgTeam();
};

if (typeof window !== 'undefined') window.renderOrgTeam = renderOrgTeam;
