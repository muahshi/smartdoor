/**
 * Smart Door — Edge Function: admin-analytics
 * supabase/functions/admin-analytics/index.ts
 *
 * Phase 13 — Admin Dashboard Analytics
 * All reads use service_role to bypass RLS on admin/ops data.
 *
 * POST body: { type: MetricType, ...params }
 * Allowed roles: super_admin, ops_manager, analyst (read)
 * Permission: analytics.read
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { restrictedCors } from '../_shared/cors.ts';
import { getServiceClient, verifyAdminSession, adminCan, adminAuthError } from '../_shared/adminAuth.ts';

serve(async (req) => {
  const headers = restrictedCors(req.headers.get('origin'));
  if (req.method === 'OPTIONS') return new Response('ok', { headers });
  if (req.method !== 'POST') {
    return Response.json({ success: false, message: 'Method not allowed' }, { status: 405, headers });
  }

  const supabaseAdmin = getServiceClient();

  try {
    const ctx = await verifyAdminSession(req, supabaseAdmin);
    if (!ctx) return adminAuthError(headers);
    if (!adminCan(ctx, 'analytics', 'read')) {
      return Response.json({ success: false, message: 'You do not have permission to view analytics.' }, { status: 403, headers });
    }

    let body: { type?: string; days?: number };
    try { body = await req.json(); }
    catch { return Response.json({ success: false, message: 'Invalid JSON body' }, { status: 400, headers }); }

    const { type } = body;

    // ── Dashboard Metrics (7 KPIs) ──
    if (type === 'dashboard_metrics') {
      const now = new Date();
      const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
      const thirtyDaysOut = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

      const [
        activationsTodayRes,
        activationsMonthRes,
        messagesTodayRes,
        voiceNotesTodayRes,
        activePlatesRes,
        suspendedPlatesRes,
        renewalDueSoonRes,
      ] = await Promise.all([
        // New activations today
        supabaseAdmin
          .from('activation_events')
          .select('id', { count: 'exact', head: true })
          .eq('event_type', 'activated')
          .gte('created_at', todayStart),

        // New activations this month
        supabaseAdmin
          .from('activation_events')
          .select('id', { count: 'exact', head: true })
          .eq('event_type', 'activated')
          .gte('created_at', monthStart),

        // Messages today (message_logs)
        supabaseAdmin
          .from('message_logs')
          .select('id', { count: 'exact', head: true })
          .gte('created_at', todayStart),

        // Voice notes today
        supabaseAdmin
          .from('voice_notes')
          .select('id', { count: 'exact', head: true })
          .gte('created_at', todayStart),

        // Active plates
        supabaseAdmin
          .from('plates')
          .select('id', { count: 'exact', head: true })
          .eq('status', 'active'),

        // Suspended plates
        supabaseAdmin
          .from('plates')
          .select('id', { count: 'exact', head: true })
          .eq('status', 'suspended'),

        // Renewal due in next 30 days (active subscriptions expiring soon)
        supabaseAdmin
          .from('subscriptions')
          .select('id', { count: 'exact', head: true })
          .eq('status', 'active')
          .lte('expiry_date', thirtyDaysOut)
          .gte('expiry_date', now.toISOString()),
      ]);

      return Response.json({
        success: true,
        metrics: {
          activations_today: activationsTodayRes.count || 0,
          activations_month: activationsMonthRes.count || 0,
          messages_today: messagesTodayRes.count || 0,
          voice_notes_today: voiceNotesTodayRes.count || 0,
          active_plates: activePlatesRes.count || 0,
          suspended_plates: suspendedPlatesRes.count || 0,
          renewal_due_soon: renewalDueSoonRes.count || 0,
        },
        generated_at: now.toISOString(),
      }, { headers });
    }

    // ── Activation Trend (sparkline) ──
    if (type === 'activation_trend') {
      const days = Math.min(Number(body.days || 30), 90);
      const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

      const { data: events } = await supabaseAdmin
        .from('activation_events')
        .select('created_at')
        .eq('event_type', 'activated')
        .gte('created_at', since)
        .order('created_at', { ascending: true });

      // Group by date
      const byDate: Record<string, number> = {};
      for (const ev of (events || [])) {
        const date = ev.created_at.slice(0, 10);
        byDate[date] = (byDate[date] || 0) + 1;
      }

      // Fill in zeros for missing days
      const trend: { date: string; count: number }[] = [];
      for (let d = 0; d < days; d++) {
        const date = new Date(Date.now() - (days - d - 1) * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
        trend.push({ date, count: byDate[date] || 0 });
      }

      return Response.json({ success: true, trend, days }, { headers });
    }

    // ── Plate Status Breakdown ──
    if (type === 'status_breakdown') {
      const { data: plates } = await supabaseAdmin
        .from('plates')
        .select('status, fulfillment_status');

      const statusCounts: Record<string, number> = {};
      const fulfillmentCounts: Record<string, number> = {};

      for (const p of (plates || [])) {
        statusCounts[p.status] = (statusCounts[p.status] || 0) + 1;
        if (p.fulfillment_status) {
          fulfillmentCounts[p.fulfillment_status] = (fulfillmentCounts[p.fulfillment_status] || 0) + 1;
        }
      }

      return Response.json({ success: true, status_breakdown: statusCounts, fulfillment_breakdown: fulfillmentCounts }, { headers });
    }

    // ── Revenue Metrics ──
    if (type === 'revenue_metrics') {
      if (!adminCan(ctx, 'subscriptions', 'read')) {
        return Response.json({ success: false, message: 'Revenue data requires subscription read permission.' }, { status: 403, headers });
      }

      const now = new Date();
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

      const { data: subs } = await supabaseAdmin
        .from('subscriptions')
        .select('plan, status, renewal_price, start_date');

      const planPrices: Record<string, number> = { hardware_only: 0, smartdoor_care: 299 };
      let mrr = 0;
      let totalActiveSubs = 0;
      let newThisMonth = 0;

      for (const sub of (subs || [])) {
        if (sub.status === 'active') {
          mrr += (sub.renewal_price ?? planPrices[sub.plan] ?? 0) / 12;
          totalActiveSubs++;
        }
        if (sub.start_date >= monthStart) newThisMonth++;
      }

      return Response.json({
        success: true,
        revenue: {
          mrr: Math.round(mrr),
          arr: Math.round(mrr * 12),
          active_subscriptions: totalActiveSubs,
          new_subscriptions_this_month: newThisMonth,
        },
      }, { headers });
    }

    // ── Fulfillment Pipeline ──
    if (type === 'fulfillment_pipeline') {
      const STAGES = ['created', 'manufacturing', 'printed', 'packed', 'shipped', 'delivered', 'activated'];

      const { data: plates } = await supabaseAdmin
        .from('plates')
        .select('fulfillment_status');

      const pipeline: Record<string, number> = {};
      for (const stage of STAGES) pipeline[stage] = 0;

      for (const p of (plates || [])) {
        const s = p.fulfillment_status || 'created';
        if (pipeline[s] !== undefined) pipeline[s]++;
      }

      return Response.json({ success: true, pipeline }, { headers });
    }

    // ── AI Consultant Funnel (Phase 3.1B) ──
    // Anonymous, platform-wide — no owner_id exists on this data, same as
    // fulfillment_pipeline above. See sql/68_ai_consultant_analytics.sql
    // for get_ai_consultant_funnel().
    if (type === 'ai_consultant_funnel') {
      const days = Math.min(Math.max(Number(body.days || 30), 1), 90);
      const { data, error } = await supabaseAdmin.rpc('get_ai_consultant_funnel', { p_days: days });
      if (error) {
        console.error('[admin-analytics] get_ai_consultant_funnel error:', error.message);
        return Response.json({ success: false, message: 'Failed to load AI consultant analytics.' }, { status: 500, headers });
      }
      return Response.json({ success: true, funnel: data }, { headers });
    }

    // ── AI Consultant Insights (Phase 3.2 — Owner/Admin AI Insights Dashboard) ──
    // Additive extension of the funnel above: product performance, visitor
    // intent categories, and a daily trend. Same anonymous, platform-wide
    // table, separate RPC (sql/69_ai_consultant_insights.sql) so a bug here
    // can never break the working ai_consultant_funnel branch above.
    if (type === 'ai_consultant_insights') {
      const days = Math.min(Math.max(Number(body.days || 30), 1), 90);
      const { data, error } = await supabaseAdmin.rpc('get_ai_consultant_insights', { p_days: days });
      if (error) {
        console.error('[admin-analytics] get_ai_consultant_insights error:', error.message);
        return Response.json({ success: false, message: 'Failed to load AI insights.' }, { status: 500, headers });
      }
      return Response.json({ success: true, insights: data }, { headers });
    }

    return Response.json({ success: false, message: `Unknown metric type: ${type}` }, { status: 400, headers });

  } catch (err) {
    console.error('[admin-analytics] Unexpected error:', err);
    return Response.json({ success: false, message: 'Server error.' }, { status: 500, headers });
  }
});
