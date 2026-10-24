import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || '';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
const SUPER_ADMINS = ['raghupadhiyar9@gmail.com', 'pjchauhan0704@gmail.com'];
// Subscription rows that mean money was actually received.
const PAID_STATUSES = ['active', 'paid'];

const maxDate = (...ds: (string | null | undefined)[]) => {
  const t = ds.filter(Boolean).map(d => new Date(d as string).getTime()).filter(n => !isNaN(n));
  return t.length ? new Date(Math.max(...t)).toISOString() : null;
};

Deno.serve(async (req: Request) => {
  const cors = { 'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization,content-type','Access-Control-Allow-Methods':'GET,OPTIONS' };
  if (req.method === 'OPTIONS') return new Response(null, { headers: cors });

  try {
    const token = (req.headers.get('Authorization') || '').replace('Bearer ','');
    const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const { data: { user }, error: authErr } = await sb.auth.getUser(token);
    if (authErr || !user || !SUPER_ADMINS.includes(user.email || '')) {
      return new Response(JSON.stringify({error:'Unauthorized'}), {status:403, headers:{...cors,'Content-Type':'application/json'}});
    }

    const { data: { users } } = await sb.auth.admin.listUsers({ perPage: 1000 });
    const { data: dataCounts } = await sb.from('user_data').select('user_id, data_key');
    const { data: projectData } = await sb.from('user_data').select('user_id, data').eq('data_key', 'projects');
    const { data: orgs } = await sb.from('organizations').select('*');
    const { data: members } = await sb.from('org_members').select('*');
    const { data: subs } = await sb.from('subscriptions').select('*').order('created_at', { ascending: false });
    const { data: leads } = await sb.from('download_leads').select('*').order('downloaded_at', { ascending: false }).limit(200);
    const { data: demoLeads } = await sb.from('demo_leads').select('*').order('created_at', { ascending: false }).limit(300);
    // Real activity: session refreshes (app opened), data saved, client errors logged.
    const { data: activity } = await sb.rpc('admin_user_activity');
    const { data: orgProjects } = await sb.rpc('admin_org_project_counts');

    const userDataMap: Record<string, string[]> = {};
    (dataCounts || []).forEach((d: any) => {
      if (!userDataMap[d.user_id]) userDataMap[d.user_id] = [];
      userDataMap[d.user_id].push(d.data_key);
    });
    const projectMap: Record<string, number> = {};
    (projectData || []).forEach((d: any) => { projectMap[d.user_id] = Array.isArray(d.data) ? d.data.length : 0; });
    const orgProjectMap: Record<string, number> = {};
    (orgProjects || []).forEach((r: any) => { orgProjectMap[r.org_id] = Number(r.projects) || 0; });
    const activityMap: Record<string, any> = {};
    (activity || []).forEach((a: any) => { activityMap[a.user_id] = a; });

    // Payment summary per org.
    const payMap: Record<string, any> = {};
    (subs || []).forEach((s: any) => {
      if (!s.org_id) return;
      const p = payMap[s.org_id] ||= { paid_total: 0, payments: 0, last_paid_at: null, paid_until: null, paid_plan: null, pending: 0 };
      if (PAID_STATUSES.includes(String(s.status || '').toLowerCase())) {
        p.paid_total += s.amount_inr || 0;
        p.payments += 1;
        const at = s.starts_at || s.created_at;
        if (!p.last_paid_at || at > p.last_paid_at) { p.last_paid_at = at; p.paid_plan = s.plan; }
        if (s.ends_at && (!p.paid_until || s.ends_at > p.paid_until)) p.paid_until = s.ends_at;
      } else if (String(s.status || '').toLowerCase() === 'pending') {
        p.pending += 1;
      }
    });

    const now = Date.now();
    const userList = (users || []).map((u: any) => {
      const mem = (members || []).find((m: any) => m.user_id === u.id && m.is_active);
      const org = mem ? (orgs || []).find((o: any) => o.id === mem.org_id) : null;
      const act = activityMap[u.id] || {};
      const pay = org ? payMap[org.id] : null;
      const plan = String(org?.plan || 'free').toLowerCase();
      let payment_status = 'free';
      if (pay?.payments) payment_status = pay.paid_until && new Date(pay.paid_until).getTime() < now ? 'lapsed' : 'paid';
      else if (plan !== 'free') payment_status = 'manual';
      else if (pay?.pending) payment_status = 'pending';
      return {
        id: u.id, email: u.email,
        name: u.user_metadata?.display_name || u.user_metadata?.name || '',
        phone: u.user_metadata?.phone || u.phone || '',
        created_at: u.created_at, last_sign_in: u.last_sign_in_at,
        last_active: maxDate(u.last_sign_in_at, act.last_session, act.last_data, act.last_error),
        last_data: act.last_data || null,
        projects: (org ? orgProjectMap[org.id] : 0) || projectMap[u.id] || 0,
        data_keys: (userDataMap[u.id] || []).length,
        org_id: org?.id || null,
        org_name: org?.name || null,
        org_plan: plan,
        org_active: org?.is_active ?? true,
        max_seats: org?.max_seats || 3,
        max_projects: org?.max_projects || 2,
        trial_ends: org?.trial_ends_at || null,
        role: mem?.role || 'owner',
        payment_status,
        paid_total: pay?.paid_total || 0,
        last_paid_at: pay?.last_paid_at || null,
        paid_until: pay?.paid_until || null,
        paid_plan: pay?.paid_plan || null,
      };
    });

    const activeSince = (ms: number) => userList.filter((u: any) => u.last_active && new Date(u.last_active).getTime() > now - ms).length;
    const paidOrgIds = Object.keys(payMap).filter(id => payMap[id].payments > 0);
    const stats = {
      totalUsers: userList.length,
      activeToday: activeSince(86400000),
      activeWeek: activeSince(7 * 86400000),
      activeMonth: activeSince(30 * 86400000),
      withProjects: userList.filter((u: any) => u.projects > 0).length,
      totalOrgs: (orgs || []).length,
      paidOrgs: paidOrgIds.length,
      paidUsers: userList.filter((u: any) => u.payment_status === 'paid').length,
      manualPlanOrgs: (orgs || []).filter((o: any) => String(o.plan || 'free').toLowerCase() !== 'free' && !paidOrgIds.includes(o.id)).length,
      totalLeads: (leads || []).length,
      totalDemoLeads: (demoLeads || []).length,
      totalRevenue: (subs || []).filter((s: any) => PAID_STATUSES.includes(String(s.status || '').toLowerCase())).reduce((sum: number, s: any) => sum + (s.amount_inr || 0), 0),
    };

    const orgList = (orgs || []).map((o: any) => ({ ...o, projects: orgProjectMap[o.id] || 0, ...(payMap[o.id] || {}) }));

    return new Response(JSON.stringify({ users: userList, stats, leads, demoLeads: demoLeads || [], orgs: orgList }), {
      headers: { ...cors, 'Content-Type':'application/json', 'Connection':'keep-alive' }
    });
  } catch (e) {
    return new Response(JSON.stringify({error:(e as Error).message}), {status:500, headers:{'Content-Type':'application/json','Access-Control-Allow-Origin':'*'}});
  }
});
