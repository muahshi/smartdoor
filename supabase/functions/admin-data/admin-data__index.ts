/**
 * Smart Door — Edge Function: admin-data
 * supabase/functions/admin-data/index.ts
 *
 * THE FIX for the #1 root cause: admin.html reads users/plates/orders/subscriptions
 * with the anon key, but RLS blocks every one of those reads.
 * This function uses service_role (bypasses RLS) and serves all admin
 * panel data needs through one authenticated endpoint.
 *
 * POST body: { type: string, ...params }
 *
 * Types:
 *   dashboard_metrics   — all KPI cards
 *   customer_list       — searchable/paginated customer list
 *   customer_profile    — full profile for one customer
 *   financial_metrics   — revenue, MRR, ARR
 *   order_list          — orders table
 *   subscription_list   — subscriptions table
 *   audit_logs          — admin_audit_logs
 *   system_health       — connectivity + counts
 *
 * Permissions enforced server-side per the admin role/RBAC system.
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { restrictedCors } from '../_shared/cors.ts';
import {
  getServiceClient,
  verifyAdminSession,
  adminCan,
  adminAuthError,
} from '../_shared/adminAuth.ts';

serve(async (req) => {
  const headers = restrictedCors(req.headers.get('origin'));
  if (req.method === 'OPTIONS') return new Response('ok', { headers });
  if (req.method !== 'POST') {
    return Response.json({ success: false, message: 'Method not allowed' }, { status: 405, headers });
  }

  const db = getServiceClient();

  try {
    const ctx = await verifyAdminSession(req, db);
    if (!ctx) return adminAuthError(headers);

    let body: Record<string, unknown>;
    try { body = await req.json(); }
    catch { return Response.json({ success: false, message: 'Invalid JSON body' }, { status: 400, headers }); }

    const { type } = body as { type?: string };

    // ══════════════════════════════════════════════
    // DASHBOARD METRICS
    // ══════════════════════════════════════════════
    if (type === 'dashboard_metrics') {
      if (!adminCan(ctx, 'customers', 'read') && !adminCan(ctx, '*', 'read')) {
        return Response.json({ success: false, message: 'Permission denied' }, { status: 403, headers });
      }

      const now = new Date();
      const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
      const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString();
      const thirtyDaysOut = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

      const [
        usersRes, ordersRes, subsRes, mfgRes, ticketsRes, platesRes,
        msgsTodayRes, voiceTodayRes, newUsersMonthRes, newUsersLastMonthRes,
        renewalRes,
      ] = await Promise.all([
        db.from('users').select('id', { count: 'exact', head: true }),
        db.from('orders').select('id, payment_status, total_amount, created_at'),
        db.from('subscriptions').select('id, status, plan'),
        db.from('manufacturing').select('id, production_status', { count: 'exact', head: false }),
        db.from('support_tickets').select('id, status', { count: 'exact', head: false }),
        db.from('plates').select('id, status', { count: 'exact', head: false }),
        db.from('message_logs').select('id', { count: 'exact', head: true }).gte('created_at', todayStart),
        db.from('voice_notes').select('id', { count: 'exact', head: true }).gte('created_at', todayStart),
        db.from('users').select('id', { count: 'exact', head: true }).gte('created_at', monthStart),
        db.from('users').select('id', { count: 'exact', head: true }).gte('created_at', lastMonthStart).lt('created_at', monthStart),
        db.from('subscriptions').select('id', { count: 'exact', head: true }).eq('status', 'active').lte('expiry_date', thirtyDaysOut).gte('expiry_date', now.toISOString()),
      ]);

      const orders = ordersRes.data || [];
      const subs = subsRes.data || [];
      const mfg = mfgRes.data || [];
      const tickets = ticketsRes.data || [];
      const plates = platesRes.data || [];

      const paidOrders = orders.filter((o: any) => o.payment_status === 'paid');
      const revenueThisMonth = paidOrders
        .filter((o: any) => new Date(o.created_at) >= new Date(monthStart))
        .reduce((s: number, o: any) => s + (o.total_amount || 0), 0);

      const newThisMonth = newUsersMonthRes.count || 0;
      const newLastMonth = newUsersLastMonthRes.count || 0;
      const growthPct = newLastMonth > 0
        ? (((newThisMonth - newLastMonth) / newLastMonth) * 100).toFixed(1)
        : null;

      return Response.json({
        success: true,
        metrics: {
          totalCustomers: usersRes.count || 0,
          newCustomersThisMonth: newThisMonth,
          customerGrowthPct: growthPct,
          activeSubscriptions: subs.filter((s: any) => s.status === 'active').length,
          expiringSoon: renewalRes.count || 0,
          revenueThisMonth,
          pendingOrders: orders.filter((o: any) => o.payment_status === 'pending').length,
          paidOrders: paidOrders.length,
          manufacturingQueue: mfg.filter((m: any) => ['queued', 'printing', 'quality_check'].includes(m.production_status)).length,
          openTickets: tickets.filter((t: any) => t.status === 'open').length,
          pendingTickets: tickets.filter((t: any) => t.status === 'pending').length,
          totalPlates: plates.length,
          activePlates: plates.filter((p: any) => p.status === 'active').length,
          inactivePlates: plates.filter((p: any) => ['inactive', 'suspended'].includes(p.status)).length,
          messagesToday: msgsTodayRes.count || 0,
          voiceNotesToday: voiceTodayRes.count || 0,
        },
      }, { headers });
    }

    // ══════════════════════════════════════════════
    // CUSTOMER LIST (search + paginate)
    // ══════════════════════════════════════════════
    if (type === 'customer_list') {
      if (!adminCan(ctx, 'customers', 'read')) {
        return Response.json({ success: false, message: 'Permission denied' }, { status: 403, headers });
      }

      const { query = '', field = 'all', limit = 30, offset = 0 } = body as any;

      // FIX: PostgREST reverse-FK join `table!fk_column` is unreliable across versions.
      // Use explicit FK name to avoid ambiguity: plates!plates_owner_id_fkey etc.
      let qb = db
        .from('users')
        .select(`
          id, full_name, phone, email, plate_id, created_at,
          subscriptions!subscriptions_owner_id_fkey(status, plan, expiry_date),
          plates!plates_owner_id_fkey(status, product_type, qr_image_url, qr_svg_url),
          orders!orders_owner_id_fkey(id, payment_status, total_amount)
        `, { count: 'exact' })
        .range(Number(offset), Number(offset) + Number(limit) - 1)
        .order('created_at', { ascending: false });

      if (query) {
        const q = String(query).trim();
        if (field === 'name' || field === 'all') {
          qb = qb.ilike('full_name', `%${q}%`);
        } else if (field === 'phone') {
          qb = qb.ilike('phone', `%${q}%`);
        } else if (field === 'email') {
          qb = qb.ilike('email', `%${q}%`);
        } else if (field === 'plate_id') {
          qb = qb.ilike('plate_id', `%${q}%`);
        }
      }

      const { data, error, count } = await qb;
      if (error) return Response.json({ success: false, message: error.message }, { status: 500, headers });

      return Response.json({ success: true, customers: data || [], total: count || 0 }, { headers });
    }

    // ══════════════════════════════════════════════
    // CUSTOMER PROFILE (full detail)
    // ══════════════════════════════════════════════
    if (type === 'customer_profile') {
      if (!adminCan(ctx, 'customers', 'read')) {
        return Response.json({ success: false, message: 'Permission denied' }, { status: 403, headers });
      }

      const { customer_id } = body as { customer_id?: string };
      if (!customer_id) return Response.json({ success: false, message: 'customer_id required' }, { status: 400, headers });

      const [
        userRes, ordersRes, subsRes, visitorLogsRes,
        voiceNotesRes, callLogsRes, familyRes, securityRes,
      ] = await Promise.all([
        db.from('users').select('*').eq('id', customer_id).single(),
        db.from('orders').select('*').eq('owner_id', customer_id).order('created_at', { ascending: false }),
        db.from('subscriptions').select('*').eq('owner_id', customer_id).order('created_at', { ascending: false }),
        db.from('visitor_logs').select('*').eq('owner_id', customer_id).order('created_at', { ascending: false }).limit(50),
        db.from('voice_notes').select('*').eq('owner_id', customer_id).order('created_at', { ascending: false }).limit(20),
        db.from('call_logs').select('*').eq('owner_id', customer_id).order('created_at', { ascending: false }).limit(20),
        db.from('family_members').select('*').eq('owner_id', customer_id),
        db.from('security_rules').select('*').eq('owner_id', customer_id),
      ]);

      if (userRes.error) return Response.json({ success: false, message: userRes.error.message }, { status: 404, headers });

      let plate = null;
      let messagesCount = 0;
      let notificationsCount = 0;

      if (userRes.data?.plate_id) {
        const [plateRes, msgRes, notifRes] = await Promise.all([
          db.from('plates').select('*').eq('plate_id', userRes.data.plate_id).maybeSingle(),
          db.from('message_logs').select('id', { count: 'exact', head: true }).eq('owner_id', customer_id),
          db.from('notifications').select('id', { count: 'exact', head: true }).eq('owner_id', customer_id),
        ]);
        plate = plateRes.data || null;
        messagesCount = msgRes.count || 0;
        notificationsCount = notifRes.count || 0;
      }

      return Response.json({
        success: true,
        profile: {
          user: userRes.data,
          orders: ordersRes.data || [],
          subscriptions: subsRes.data || [],
          visitorLogs: visitorLogsRes.data || [],
          voiceNotes: voiceNotesRes.data || [],
          callLogs: callLogsRes.data || [],
          familyMembers: familyRes.data || [],
          securityRules: securityRes.data || [],
          plate,
          messagesCount,
          notificationsCount,
        },
      }, { headers });
    }

    // ══════════════════════════════════════════════
    // FINANCIAL METRICS
    // ══════════════════════════════════════════════
    if (type === 'financial_metrics') {
      if (!adminCan(ctx, 'analytics', 'read') && !adminCan(ctx, '*', 'read')) {
        return Response.json({ success: false, message: 'Permission denied' }, { status: 403, headers });
      }

      const now = new Date();
      const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
      const yearStart = new Date(now.getFullYear(), 0, 1).toISOString();

      const [paymentsRes, refundsRes, subsRes] = await Promise.all([
        db.from('orders').select('total_amount, payment_status, product_type, created_at').eq('payment_status', 'paid'),
        db.from('orders').select('total_amount').eq('payment_status', 'refunded'),
        db.from('subscriptions').select('plan, status, renewal_price'),
      ]);

      const all = paymentsRes.data || [];
      const sum = (arr: any[]) => arr.reduce((s, o) => s + (o.total_amount || 0), 0);
      const filterFrom = (from: string) => all.filter((o: any) => new Date(o.created_at) >= new Date(from));

      const revenueToday = sum(filterFrom(todayStart));
      const revenueMonth = sum(filterFrom(monthStart));
      const revenueYear = sum(filterFrom(yearStart));

      const subs = subsRes.data || [];
      const planPrices: Record<string, number> = { hardware_only: 0, smartdoor_care: 299 };
      let mrr = 0;
      subs.filter((s: any) => s.status === 'active').forEach((s: any) => {
        mrr += s.renewal_price ?? planPrices[s.plan] ?? 0;
      });
      mrr = Math.round(mrr / 12);

      const productRevenue: Record<string, number> = { acrylic: 0, stainless: 0, teakwood: 0 };
      all.forEach((o: any) => {
        if (productRevenue[o.product_type] !== undefined) productRevenue[o.product_type] += o.total_amount || 0;
      });

      return Response.json({
        success: true,
        financial: {
          revenueToday,
          revenueMonth,
          revenueYear,
          mrr,
          arr: mrr * 12,
          totalRefunds: sum(refundsRes.data || []),
          productRevenue,
          totalPaidOrders: all.length,
        },
      }, { headers });
    }

    // ══════════════════════════════════════════════
    // ORDER LIST
    // ══════════════════════════════════════════════
    if (type === 'order_list') {
      if (!adminCan(ctx, 'orders', 'read')) {
        return Response.json({ success: false, message: 'Permission denied' }, { status: 403, headers });
      }

      const { status_filter = null, limit = 50, offset = 0 } = body as any;

      let qb = db.from('orders')
        .select('*', { count: 'exact' })
        .range(Number(offset), Number(offset) + Number(limit) - 1)
        .order('created_at', { ascending: false });

      if (status_filter && status_filter !== 'all') {
        qb = qb.eq('payment_status', status_filter);
      }

      const { data, error, count } = await qb;
      if (error) return Response.json({ success: false, message: error.message }, { status: 500, headers });

      return Response.json({ success: true, orders: data || [], total: count || 0 }, { headers });
    }

    // ══════════════════════════════════════════════
    // SUBSCRIPTION LIST
    // ══════════════════════════════════════════════
    if (type === 'subscription_list') {
      if (!adminCan(ctx, 'subscriptions', 'read')) {
        return Response.json({ success: false, message: 'Permission denied' }, { status: 403, headers });
      }

      const { status_filter = null, limit = 50, offset = 0 } = body as any;

      let qb = db.from('subscriptions')
        .select('*, users!owner_id(full_name, phone, email, plate_id)', { count: 'exact' })
        .range(Number(offset), Number(offset) + Number(limit) - 1)
        .order('created_at', { ascending: false });

      if (status_filter && status_filter !== 'all') {
        qb = qb.eq('status', status_filter);
      }

      const { data, error, count } = await qb;
      if (error) return Response.json({ success: false, message: error.message }, { status: 500, headers });

      return Response.json({ success: true, subscriptions: data || [], total: count || 0 }, { headers });
    }

    // ══════════════════════════════════════════════
    // AUDIT LOGS
    // ══════════════════════════════════════════════
    if (type === 'audit_logs') {
      if (!adminCan(ctx, 'audit', 'read') && !adminCan(ctx, '*', 'read')) {
        return Response.json({ success: false, message: 'Permission denied' }, { status: 403, headers });
      }

      const { action = null, resource = null, limit = 100, offset = 0 } = body as any;

      let qb = db.from('admin_audit_logs')
        .select('*, admin_users!admin_id(full_name, email)', { count: 'exact' })
        .range(Number(offset), Number(offset) + Number(limit) - 1)
        .order('created_at', { ascending: false });

      if (action) qb = qb.eq('action', action);
      if (resource) qb = qb.eq('resource', resource);

      const { data, error, count } = await qb;
      if (error) return Response.json({ success: false, message: error.message }, { status: 500, headers });

      return Response.json({ success: true, logs: data || [], total: count || 0 }, { headers });
    }

    // ══════════════════════════════════════════════
    // SYSTEM HEALTH
    // ══════════════════════════════════════════════
    if (type === 'system_health') {
      const start = Date.now();
      const [usersRes, qrRes, logsRes] = await Promise.all([
        db.from('users').select('id', { count: 'exact', head: true }),
        db.from('plates').select('id', { count: 'exact', head: true }),
        db.from('admin_audit_logs').select('id', { count: 'exact', head: true }),
      ]);
      const latency = Date.now() - start;

      return Response.json({
        success: true,
        health: {
          supabase: usersRes.error ? 'degraded' : 'healthy',
          latencyMs: latency,
          totalUsers: usersRes.count || 0,
          totalPlates: qrRes.count || 0,
          totalAuditLogs: logsRes.count || 0,
          timestamp: new Date().toISOString(),
        },
      }, { headers });
    }

    // ══════════════════════════════════════════════
    // REVENUE CHART DATA
    // ══════════════════════════════════════════════
    if (type === 'revenue_chart') {
      if (!adminCan(ctx, 'analytics', 'read') && !adminCan(ctx, '*', 'read')) {
        return Response.json({ success: false, message: 'Permission denied' }, { status: 403, headers });
      }
      const months = Math.min(Number((body as any).months || 6), 12);
      const fromDate = new Date();
      fromDate.setMonth(fromDate.getMonth() - months);

      const { data } = await db
        .from('orders')
        .select('total_amount, created_at')
        .eq('payment_status', 'paid')
        .gte('created_at', fromDate.toISOString())
        .order('created_at', { ascending: true });

      const grouped: Record<string, number> = {};
      for (const o of (data || [])) {
        const d = new Date(o.created_at);
        const key = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
        grouped[key] = (grouped[key] || 0) + (o.total_amount || 0);
      }

      const labels: string[] = [];
      const values: number[] = [];
      for (let i = months - 1; i >= 0; i--) {
        const d = new Date();
        d.setMonth(d.getMonth() - i);
        const key = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
        labels.push(d.toLocaleString('default', { month: 'short', year: '2-digit' }));
        values.push(grouped[key] || 0);
      }

      return Response.json({ success: true, labels, values }, { headers });
    }

    // ══════════════════════════════════════════════
    // ADMIN ORDER ACTIONS (mark shipped / delivered)
    // ══════════════════════════════════════════════
    if (type === 'update_order') {
      if (!adminCan(ctx, 'orders', 'write')) {
        return Response.json({ success: false, message: 'Permission denied' }, { status: 403, headers });
      }
      const { order_id, updates, tracking_event } = body as any;
      if (!order_id || !updates) return Response.json({ success: false, message: 'order_id and updates required' }, { status: 400, headers });

      const { error } = await db.from('orders').update({ ...updates, updated_at: new Date().toISOString() }).eq('id', order_id);
      if (error) return Response.json({ success: false, message: error.message }, { status: 500, headers });

      if (tracking_event) {
        await db.from('tracking_events').insert({ order_id, ...tracking_event, created_at: new Date().toISOString() });
      }

      // Audit log
      await db.from('admin_audit_logs').insert({
        admin_id: ctx.id,
        action: 'update_order',
        resource: 'orders',
        resource_id: order_id,
        metadata: { updates },
        created_at: new Date().toISOString(),
      });

      return Response.json({ success: true }, { headers });
    }

    // ══════════════════════════════════════════════
    // ADMIN SUBSCRIPTION ACTIONS
    // ══════════════════════════════════════════════
    if (type === 'update_subscription') {
      if (!adminCan(ctx, 'subscriptions', 'write')) {
        return Response.json({ success: false, message: 'Permission denied' }, { status: 403, headers });
      }
      const { sub_id, updates } = body as any;
      if (!sub_id || !updates) return Response.json({ success: false, message: 'sub_id and updates required' }, { status: 400, headers });

      const { error } = await db.from('subscriptions').update({ ...updates, updated_at: new Date().toISOString() }).eq('id', sub_id);
      if (error) return Response.json({ success: false, message: error.message }, { status: 500, headers });

      await db.from('admin_audit_logs').insert({
        admin_id: ctx.id,
        action: 'update_subscription',
        resource: 'subscriptions',
        resource_id: sub_id,
        metadata: { updates },
        created_at: new Date().toISOString(),
      });

      return Response.json({ success: true }, { headers });
    }

    // TOGGLE ADMIN USER STATUS
    if (type === 'toggle_admin_status') {
      if (ctx.role_name !== 'super_admin' && !adminCan(ctx, '*', 'manage')) {
        return Response.json({ success: false, message: 'Permission denied' }, { status: 403, headers });
      }
      const { admin_id, is_active } = body as any;
      if (!admin_id) return Response.json({ success: false, message: 'admin_id required' }, { status: 400, headers });
      const { error } = await db.from('admin_users').update({ is_active, updated_at: new Date().toISOString() }).eq('id', admin_id);
      if (error) return Response.json({ success: false, message: error.message }, { status: 500, headers });
      await db.from('admin_audit_logs').insert({
        admin_id: ctx.id,
        action: is_active ? 'activate_admin' : 'deactivate_admin',
        resource: 'admin_users',
        resource_id: admin_id,
        created_at: new Date().toISOString(),
      });
      return Response.json({ success: true }, { headers });
    }

    // TEAM LIST
    if (type === 'team_list') {
      if (ctx.role_name !== 'super_admin' && !adminCan(ctx, '*', 'manage')) {
        return Response.json({ success: false, message: 'Permission denied' }, { status: 403, headers });
      }
      const { data, error } = await db
        .from('admin_users')
        .select('*, admin_roles!role_id(name, label, color)')
        .order('created_at', { ascending: false });
      if (error) return Response.json({ success: false, message: error.message }, { status: 500, headers });
      return Response.json({ success: true, team: data || [] }, { headers });
    }


    // TICKET LIST
    if (type === 'ticket_list') {
      const limit2 = Number((body as any).limit) || 50;
      const offset2 = Number((body as any).offset) || 0;
      let q = db.from('support_tickets')
        .select('id, ticket_number, subject, status, priority, created_at, updated_at, user_id')
        .order('created_at', { ascending: false })
        .range(offset2, offset2 + limit2 - 1);
      if ((body as any).status) q = q.eq('status', (body as any).status);
      const { data: tdata, error: terr } = await q;
      if (terr) return Response.json({ success: false, message: terr.message }, { status: 500, headers });
      return Response.json({ success: true, tickets: tdata || [] }, { headers });
    }

    if (type === 'ticket_stats') {
      const { data: tsdata } = await db.from('support_tickets').select('id, status, priority');
      const ts = tsdata || [];
      return Response.json({ success: true, stats: {
        open: ts.filter((x: any) => x.status === 'open').length,
        pending: ts.filter((x: any) => x.status === 'pending').length,
        resolved: ts.filter((x: any) => x.status === 'resolved').length,
        closed: ts.filter((x: any) => x.status === 'closed').length,
        critical: ts.filter((x: any) => x.priority === 'critical').length,
        high: ts.filter((x: any) => x.priority === 'high').length,
      }}, { headers });
    }

    if (type === 'ticket_detail') {
      const { data: td } = await db.from('support_tickets').select('*').eq('id', (body as any).ticket_id).maybeSingle();
      const { data: tc } = await db.from('ticket_comments').select('*').eq('ticket_id', (body as any).ticket_id).order('created_at', { ascending: true });
      return Response.json({ success: true, ticket: td, comments: tc || [] }, { headers });
    }

    if (type === 'update_ticket') {
      const { ticket_id: tid2, updates: tupdates } = body as any;
      await db.from('support_tickets').update({ ...tupdates, updated_at: new Date().toISOString() }).eq('id', tid2);
      return Response.json({ success: true }, { headers });
    }

    if (type === 'add_ticket_comment') {
      const { ticket_id: tcid, admin_id: taid, content: tcontent, is_internal: tis } = body as any;
      await db.from('ticket_comments').insert({ ticket_id: tcid, content: tcontent, is_internal: !!tis, author_id: taid || ctx.id, author_type: 'admin', created_at: new Date().toISOString() });
      return Response.json({ success: true }, { headers });
    }

    if (type === 'create_ticket') {
      const { subject: ts2, description: td2, priority: tp2, user_id: tu2, category: tc2 } = body as any;
      const tnum = 'TKT-' + Date.now().toString(36).toUpperCase();
      const { data: tnew } = await db.from('support_tickets').insert({ ticket_number: tnum, subject: ts2, description: td2, priority: tp2 || 'medium', status: 'open', user_id: tu2 || null, category: tc2 || 'general', created_at: new Date().toISOString(), updated_at: new Date().toISOString() }).select().single();
      return Response.json({ success: true, ticket: tnew }, { headers });
    }

    if (type === 'communication_logs') {
      const climit = Number((body as any).limit) || 100;
      const ctype = (body as any).type;
      const logs: any = {};
      if (!ctype || ctype === 'calls') { const { data } = await db.from('call_logs').select('*').order('created_at', { ascending: false }).limit(climit); logs.calls = data || []; }
      if (!ctype || ctype === 'messages') { const { data } = await db.from('message_logs').select('*').order('created_at', { ascending: false }).limit(climit); logs.messages = data || []; }
      if (!ctype || ctype === 'voice_notes') { const { data } = await db.from('voice_notes').select('*').order('created_at', { ascending: false }).limit(climit); logs.voice_notes = data || []; }
      return Response.json({ success: true, logs }, { headers });
    }

    if (type === 'admin_team') {
      const { data: ateam } = await db.from('admin_users').select('id, email, full_name, is_active, last_login_at, role_id, admin_roles(name, label, color)').order('created_at', { ascending: false });
      return Response.json({ success: true, team: ateam || [] }, { headers });
    }

    if (type === 'qr_search') {
      const { plate_id: qpid } = body as any;
      const { data: qplate } = await db.from('plates').select('plate_id, status, qr_image_url, qr_svg_url, owner_id, created_at').eq('plate_id', qpid).maybeSingle();
      return Response.json({ success: true, plate: qplate }, { headers });
    }

    if (type === 'qr_deactivate') {
      const { plate_id: dpid, reason: dreason } = body as any;
      await db.from('plates').update({ status: 'suspended', updated_at: new Date().toISOString() }).eq('plate_id', dpid);
      await db.from('admin_audit_logs').insert({ admin_id: ctx.id, admin_email: ctx.email, action: 'qr_deactivate', resource: 'plates', resource_id: dpid, notes: dreason || 'Admin action' });
      return Response.json({ success: true }, { headers });
    }

    if (type === 'qr_reactivate') {
      const { plate_id: rpid } = body as any;
      await db.from('plates').update({ status: 'active', updated_at: new Date().toISOString() }).eq('plate_id', rpid);
      await db.from('admin_audit_logs').insert({ admin_id: ctx.id, admin_email: ctx.email, action: 'qr_reactivate', resource: 'plates', resource_id: rpid });
      return Response.json({ success: true }, { headers });
    }

    if (type === 'manufacturing_queue') {
      const mstatus = (body as any).status;
      let mq = db.from('manufacturing').select('*, plates(plate_id, status), orders(order_number, total_amount)').order('created_at', { ascending: false });
      if (mstatus) mq = mq.eq('production_status', mstatus);
      const { data: mdata } = await mq;
      return Response.json({ success: true, queue: mdata || [] }, { headers });
    }

    if (type === 'manufacturing_counts') {
      const { data: mrows } = await db.from('manufacturing').select('production_status');
      const mr = mrows || [];
      const cnt = (s: string) => mr.filter((r: any) => r.production_status === s).length;
      return Response.json({ success: true, counts: { queued: cnt('queued'), in_production: cnt('in_production'), printing: cnt('printing'), quality_check: cnt('quality_check'), packed: cnt('packed'), ready: cnt('ready'), dispatched: cnt('dispatched'), delivered: cnt('delivered') }}, { headers });
    }

    if (type === 'update_manufacturing_status') {
      const { id: muid, status: mustatus } = body as any;
      await db.from('manufacturing').update({ production_status: mustatus, updated_at: new Date().toISOString() }).eq('id', muid);
      await db.from('admin_audit_logs').insert({ admin_id: ctx.id, admin_email: ctx.email, action: 'update_manufacturing_status', resource: 'manufacturing', resource_id: muid, after_data: { production_status: mustatus } });
      return Response.json({ success: true }, { headers });
    }


    return Response.json({ success: false, message: `Unknown type: ${type}` }, { status: 400, headers });

    // ══════════════════════════════════════════════
    // CREATE ORDER (Amazon / Flipkart / manual import)
    // ══════════════════════════════════════════════
    if (type === 'create_order') {
      if (!adminCan(ctx, 'orders', 'write')) {
        return Response.json({ success: false, message: 'Permission denied' }, { status: 403, headers });
      }

      const {
        owner_id, plate_id, product_type,
        order_source, external_order_id,
        customer_name, customer_phone, customer_email,
        shipping_address, notes,
      } = body as any;

      const VALID_SOURCES = ['admin_manual','amazon','flipkart','offline','whatsapp','website'];
      if (!owner_id || !plate_id || !VALID_SOURCES.includes(String(order_source))) {
        return Response.json({
          success: false,
          message: 'owner_id, plate_id, and a valid order_source are required',
        }, { status: 400, headers });
      }

      const ts = new Date().toISOString().slice(0, 10).replace(/-/g, '');
      const rnd = Math.random().toString(36).slice(2, 7).toUpperCase();
      const orderNumber = `SD-ORD-${ts}-${rnd}`;

      const { data: order, error: orderErr } = await db.from('orders').insert({
        order_number: orderNumber,
        owner_id,
        plate_id,
        product_type: product_type || 'acrylic',
        product_price: 0,
        subscription_price: 0,
        shipping_price: 0,
        total_amount: 0,
        payment_status: 'paid',
        manufacturing_status: 'queued',
        tracking_status: 'order_placed',
        fulfilment_status: 'new_order',
        order_source: String(order_source),
        external_order_id: external_order_id || null,
        customer_name: customer_name || null,
        customer_phone: customer_phone || null,
        customer_email: customer_email || null,
        shipping_address: shipping_address || {},
        notes: notes || null,
      }).select().single();

      if (orderErr) {
        return Response.json({ success: false, message: orderErr.message }, { status: 500, headers });
      }

      await db.from('admin_audit_logs').insert({
        admin_id: ctx.id,
        admin_email: ctx.email,
        action: 'create_order',
        resource: 'orders',
        resource_id: order.id,
        after_data: { order_number: orderNumber, order_source, plate_id },
        notes: `Order ${orderNumber} created (source: ${order_source})`,
        created_at: new Date().toISOString(),
      });

      return Response.json({ success: true, order }, { headers });
    }

    // ══════════════════════════════════════════════
    // ADVANCE FULFILMENT PIPELINE (9-stage)
    // ══════════════════════════════════════════════
    if (type === 'advance_fulfilment') {
      if (!adminCan(ctx, 'orders', 'write')) {
        return Response.json({ success: false, message: 'Permission denied' }, { status: 403, headers });
      }

      const { order_id, to_status } = body as any;
      const VALID_STAGES = [
        'new_order','payment_verified','manufacturing','qr_generated',
        'nameplate_printed','quality_check','packed','shipped','delivered',
        'owner_activated','live',
      ];

      if (!order_id || !VALID_STAGES.includes(String(to_status))) {
        return Response.json({ success: false, message: 'Invalid order_id or to_status' }, { status: 400, headers });
      }

      const MFG_MAP: Record<string,string> = {
        new_order:'queued', payment_verified:'queued', manufacturing:'in_production',
        qr_generated:'in_production', nameplate_printed:'in_production',
        quality_check:'quality_check', packed:'packed', shipped:'dispatched',
        delivered:'delivered', owner_activated:'delivered', live:'delivered',
      };

      const { error: updateErr } = await db.from('orders').update({
        fulfilment_status: to_status,
        manufacturing_status: MFG_MAP[to_status] || 'queued',
        tracking_status: to_status,
        updated_at: new Date().toISOString(),
      }).eq('id', order_id);

      if (updateErr) {
        return Response.json({ success: false, message: updateErr.message }, { status: 500, headers });
      }

      await db.from('tracking_events').insert({
        order_id, event_type: to_status,
        description: `Status advanced to "${to_status}" by ${ctx.email}`,
        created_at: new Date().toISOString(),
      }).catch(() => {});

      await db.from('admin_audit_logs').insert({
        admin_id: ctx.id, admin_email: ctx.email,
        action: 'advance_fulfilment', resource: 'orders', resource_id: order_id,
        after_data: { fulfilment_status: to_status },
        notes: `Fulfilment advanced to ${to_status}`,
        created_at: new Date().toISOString(),
      });

      return Response.json({ success: true, fulfilment_status: to_status }, { headers });
    }

    return Response.json({ success: false, message: `Unknown type: ${type}` }, { status: 400, headers });

  } catch (err) {
    console.error('[admin-data] Unexpected error:', err);
    return Response.json({ success: false, message: 'Server error. Please try again.' }, { status: 500, headers });
  }
});
