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
 *   -- Phase 7: Operations & Administration Platform --
 *   shipment_list / shipment_create / shipment_update_status
 *   replacement_list / replacement_decide
 *   transfer_list / transfer_decide
 *   warranty_list / warranty_create / warranty_claim_update
 *   product_sku_list / product_sku_upsert / product_sku_toggle
 *   operations_health   — edge fn + AI + realtime + background job + error health
 *   backup_list / backup_trigger
 *
 * Permissions enforced server-side per the admin role/RBAC system.
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
// Partner-application approval (Phase 8C) needs to create a real admin_users
// row with a bcrypt password hash — same library/pattern as admin-login.
import bcryptjs from 'npm:bcryptjs@2.4.3';
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

      // Phase 6 completion: dealers only ever see orders they personally provisioned/created —
      // every other role with orders:read keeps seeing the full org-wide list (unchanged).
      if (ctx.role_name === 'dealer') {
        qb = qb.eq('created_by_admin_id', ctx.id);
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

      // ── Fire shipped notification when order is marked dispatched ──
      if (updates.manufacturing_status === 'dispatched' || updates.tracking_status === 'shipped') {
        try {
          const { data: ord } = await db.from('orders').select('owner_id, plate_id').eq('id', order_id).maybeSingle();
          if ((ord as any)?.owner_id && (ord as any)?.plate_id) {
            await db.from('notifications').insert({
              id: crypto.randomUUID(),
              owner_id: (ord as any).owner_id,
              type: 'status_change',
              title: '🚚 Shipped!',
              body: 'Your Smart Door nameplate is on the way.',
              payload: { plateId: (ord as any).plate_id },
              priority: 'high',
              channels: ['in_app'],
              delivery_status: {},
            });
          }
        } catch (_ne) { /* non-fatal */ }
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
        created_by_admin_id: ctx.id,   // Phase 6 completion: lets dealer role see only their own orders
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

    // ── TICKET HANDLERS ─────────────────────────────────────────────────────
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

    // ── COMMUNICATION LOGS ──────────────────────────────────────────────────
    if (type === 'communication_logs') {
      const climit = Number((body as any).limit) || 100;
      const ctype = (body as any).type;
      const logs: any = {};
      if (!ctype || ctype === 'calls') { const { data } = await db.from('call_logs').select('*').order('created_at', { ascending: false }).limit(climit); logs.calls = data || []; }
      if (!ctype || ctype === 'messages') { const { data } = await db.from('message_logs').select('*').order('created_at', { ascending: false }).limit(climit); logs.messages = data || []; }
      if (!ctype || ctype === 'voice_notes') { const { data } = await db.from('voice_notes').select('*').order('created_at', { ascending: false }).limit(climit); logs.voice_notes = data || []; }
      return Response.json({ success: true, logs }, { headers });
    }

    // ── ADMIN TEAM ──────────────────────────────────────────────────────────
    if (type === 'admin_team') {
      const { data: ateam } = await db.from('admin_users').select('id, email, full_name, is_active, last_login_at, role_id, admin_roles(name, label, color)').order('created_at', { ascending: false });
      return Response.json({ success: true, team: ateam || [] }, { headers });
    }

    // ── QR MANAGEMENT ───────────────────────────────────────────────────────
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
      // FIX: isPlateActive() requires activation_date != null. Stamp it here so the
      // QR scan path (visitorExperience → isPlateActive) resolves to 'ready'.
      await db.from('plates').update({ status: 'active', activation_date: new Date().toISOString(), updated_at: new Date().toISOString() }).eq('plate_id', rpid);
      await db.from('admin_audit_logs').insert({ admin_id: ctx.id, admin_email: ctx.email, action: 'qr_reactivate', resource: 'plates', resource_id: rpid });
      return Response.json({ success: true }, { headers });
    }

    // ── MANUFACTURING ────────────────────────────────────────────────────────
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

      // ── Fire lifecycle notification to owner ──
      try {
        const { data: mfgRow } = await db.from('manufacturing')
          .select('plate_id, order_id, orders(owner_id)')
          .eq('id', muid)
          .maybeSingle();
        const ownerId = (mfgRow as any)?.orders?.owner_id;
        const plateId = (mfgRow as any)?.plate_id;
        if (ownerId && plateId) {
          const notifMap: Record<string, { title: string; body: string; notif_type: string }> = {
            printing:      { title: '🏭 In Production', body: 'Your Smart Door nameplate is being manufactured.', notif_type: 'status_change' },
            quality_check: { title: '🔍 Quality Check', body: 'Your nameplate is undergoing quality inspection.', notif_type: 'status_change' },
            packed:        { title: '📦 Packed & Ready', body: 'Your package is packed and ready for dispatch.', notif_type: 'status_change' },
            ready:         { title: '✅ Ready to Ship', body: 'Your Smart Door nameplate is ready to be shipped.', notif_type: 'status_change' },
          };
          const n = notifMap[mustatus];
          if (n) {
            await db.from('notifications').insert({
              id: crypto.randomUUID(),
              owner_id: ownerId,
              type: n.notif_type,
              title: n.title,
              body: n.body,
              payload: { plateId, production_status: mustatus },
              priority: 'normal',
              channels: ['in_app'],
              delivery_status: {},
            });
          }
        }
      } catch (_ne) { /* non-fatal */ }

      return Response.json({ success: true }, { headers });
    }

    // ══════════════════════════════════════════════════════════════════════
    // PHASE 5 — ENTERPRISE RBAC MODULES (Manufacturer/Dealer/Franchise/Installer)
    // All additive. Existing types above are untouched.
    // ══════════════════════════════════════════════════════════════════════

    // ── INVENTORY (Manufacturer) ────────────────────────────────────────────
    if (type === 'inventory_list') {
      if (!adminCan(ctx, 'inventory', 'read')) return Response.json({ success: false, message: 'Permission denied' }, { status: 403, headers });
      const { data } = await db.from('inventory_items').select('*').order('created_at', { ascending: false });
      return Response.json({ success: true, items: data || [] }, { headers });
    }

    if (type === 'inventory_upsert') {
      if (!adminCan(ctx, 'inventory', 'write')) return Response.json({ success: false, message: 'Permission denied' }, { status: 403, headers });
      const { id: invId, sku, name, category, unit, quantity_on_hand, reorder_threshold, notes } = body as any;
      const payload = { sku, name, category, unit, quantity_on_hand, reorder_threshold, notes, updated_at: new Date().toISOString() };
      const { data, error } = invId
        ? await db.from('inventory_items').update(payload).eq('id', invId).select().maybeSingle()
        : await db.from('inventory_items').insert({ ...payload, created_by: ctx.id }).select().maybeSingle();
      if (error) return Response.json({ success: false, message: error.message }, { status: 400, headers });
      await db.from('admin_audit_logs').insert({ admin_id: ctx.id, admin_email: ctx.email, action: invId ? 'inventory_update' : 'inventory_create', resource: 'inventory', resource_id: data?.id });
      return Response.json({ success: true, item: data }, { headers });
    }

    if (type === 'inventory_adjust') {
      if (!adminCan(ctx, 'inventory', 'write')) return Response.json({ success: false, message: 'Permission denied' }, { status: 403, headers });
      const { item_id: iid, change_qty: cq, reason: ireason } = body as any;
      const { data: item } = await db.from('inventory_items').select('quantity_on_hand').eq('id', iid).maybeSingle();
      if (!item) return Response.json({ success: false, message: 'Item not found' }, { status: 404, headers });
      const newQty = Number(item.quantity_on_hand || 0) + Number(cq || 0);
      await db.from('inventory_items').update({ quantity_on_hand: newQty, updated_at: new Date().toISOString() }).eq('id', iid);
      await db.from('inventory_movements').insert({ item_id: iid, change_qty: cq, reason: ireason || 'adjustment', recorded_by: ctx.id });
      return Response.json({ success: true, new_quantity: newQty }, { headers });
    }

    // ── BATCHES (Manufacturer) ──────────────────────────────────────────────
    if (type === 'batch_list') {
      if (!adminCan(ctx, 'batches', 'read')) return Response.json({ success: false, message: 'Permission denied' }, { status: 403, headers });
      const { data } = await db.from('inventory_batches').select('*').order('created_at', { ascending: false });
      return Response.json({ success: true, batches: data || [] }, { headers });
    }

    if (type === 'batch_create') {
      if (!adminCan(ctx, 'batches', 'write')) return Response.json({ success: false, message: 'Permission denied' }, { status: 403, headers });
      const { product_type: bpt, planned_qty: bpq, notes: bnotes } = body as any;
      const { data: numRow } = await db.rpc('generate_batch_number');
      const { data, error } = await db.from('inventory_batches').insert({
        batch_number: numRow || `BATCH-${Date.now()}`,
        product_type: bpt || 'acrylic',
        planned_qty: bpq || 0,
        notes: bnotes || null,
        created_by: ctx.id,
      }).select().maybeSingle();
      if (error) return Response.json({ success: false, message: error.message }, { status: 400, headers });
      await db.from('admin_audit_logs').insert({ admin_id: ctx.id, admin_email: ctx.email, action: 'batch_create', resource: 'batches', resource_id: data?.id });
      return Response.json({ success: true, batch: data }, { headers });
    }

    if (type === 'batch_update') {
      if (!adminCan(ctx, 'batches', 'write')) return Response.json({ success: false, message: 'Permission denied' }, { status: 403, headers });
      const { id: bid, status: bstatus, completed_qty: bcq } = body as any;
      const upd: Record<string, unknown> = { updated_at: new Date().toISOString() };
      if (bstatus) upd.status = bstatus;
      if (bcq !== undefined) upd.completed_qty = bcq;
      await db.from('inventory_batches').update(upd).eq('id', bid);
      await db.from('admin_audit_logs').insert({ admin_id: ctx.id, admin_email: ctx.email, action: 'batch_update', resource: 'batches', resource_id: bid, after_data: upd });
      return Response.json({ success: true }, { headers });
    }

    // ── MANUFACTURING ANALYTICS (Manufacturer) ──────────────────────────────
    // Read-only aggregation over tables that already exist (inventory_items,
    // inventory_batches, plate_dealer_assignments). No new tables, no new
    // financial logic — pure counts/sums for a dashboard summary row.
    if (type === 'manufacturing_analytics') {
      if (!adminCan(ctx, 'batches', 'read') && !adminCan(ctx, 'inventory', 'read') && !adminCan(ctx, 'manufacturing', 'read')) {
        return Response.json({ success: false, message: 'Permission denied' }, { status: 403, headers });
      }
      const [batchesRes, inventoryRes, assignmentsRes] = await Promise.all([
        db.from('inventory_batches').select('status, planned_qty, completed_qty'),
        db.from('inventory_items').select('quantity_on_hand, reorder_threshold'),
        db.from('plate_dealer_assignments').select('status'),
      ]);
      const batches = batchesRes.data || [];
      const inventory = inventoryRes.data || [];
      const assignments = assignmentsRes.data || [];
      const sum = (arr: any[], key: string) => arr.reduce((t, r) => t + Number(r[key] || 0), 0);
      return Response.json({
        success: true,
        analytics: {
          batchesTotal: batches.length,
          batchesInProgress: batches.filter((b: any) => b.status === 'in_progress').length,
          batchesCompleted: batches.filter((b: any) => b.status === 'completed').length,
          plannedUnits: sum(batches, 'planned_qty'),
          completedUnits: sum(batches, 'completed_qty'),
          inventoryItemCount: inventory.length,
          inventoryLowStockCount: inventory.filter((i: any) => Number(i.quantity_on_hand) <= Number(i.reorder_threshold || 0)).length,
          plateAssignmentsActive: assignments.filter((a: any) => a.status === 'assigned').length,
          plateAssignmentsInstalled: assignments.filter((a: any) => a.status === 'installed').length,
        },
      }, { headers });
    }

    // ── DEALER ASSIGNMENT (Manufacturer → Dealer) ───────────────────────────
    if (type === 'dealer_assignment_list') {
      if (!adminCan(ctx, 'dealer_assignment', 'read') && !adminCan(ctx, 'installations', 'read')) {
        return Response.json({ success: false, message: 'Permission denied' }, { status: 403, headers });
      }
      let q = db.from('plate_dealer_assignments').select('*, admin_users!plate_dealer_assignments_dealer_admin_id_fkey(full_name,email)').order('assigned_at', { ascending: false });
      // Dealers only see their own assignments; manufacturer/super_admin see all.
      if (ctx.role_name === 'dealer') q = q.eq('dealer_admin_id', ctx.id);
      const { data } = await q;
      return Response.json({ success: true, assignments: data || [] }, { headers });
    }

    if (type === 'dealer_assignment_create') {
      if (!adminCan(ctx, 'dealer_assignment', 'write')) return Response.json({ success: false, message: 'Permission denied' }, { status: 403, headers });
      const { plate_id: apid, dealer_admin_id: adid, notes: anotes } = body as any;
      const { data, error } = await db.from('plate_dealer_assignments').insert({
        plate_id: apid, dealer_admin_id: adid, assigned_by: ctx.id, notes: anotes || null,
      }).select().maybeSingle();
      if (error) return Response.json({ success: false, message: error.message }, { status: 400, headers });
      await db.from('admin_audit_logs').insert({ admin_id: ctx.id, admin_email: ctx.email, action: 'dealer_assignment_create', resource: 'dealer_assignment', resource_id: data?.id, after_data: { plate_id: apid, dealer_admin_id: adid } });
      return Response.json({ success: true, assignment: data }, { headers });
    }

    // ── INSTALLATION JOBS (Installer) ───────────────────────────────────────
    if (type === 'installation_job_list') {
      if (!adminCan(ctx, 'installation_jobs', 'read') && !adminCan(ctx, 'installations', 'read')) {
        return Response.json({ success: false, message: 'Permission denied' }, { status: 403, headers });
      }
      const scope = (body as any).scope; // 'pool' | 'mine'
      let q = db.from('installation_jobs').select('*, installation_job_photos(id, photo_url, caption, created_at)').order('created_at', { ascending: false });
      if (ctx.role_name === 'installer') {
        q = scope === 'pool' ? q.eq('status', 'pending') : q.eq('installer_admin_id', ctx.id);
      }
      const { data } = await q;
      return Response.json({ success: true, jobs: data || [] }, { headers });
    }

    // Request installer visit for an order — sets installation_status='pending',
    // which fires trg_orders_installation_pending → auto-creates the job.
    if (type === 'installation_request') {
      // Dealer gets this via 'installations':'write' (Phase 6 completion) without
      // needing full 'orders':'write' (payment/manufacturing edit rights).
      // Anyone with orders:write (support/super_admin/manufacturing) keeps working as before.
      if (!adminCan(ctx, 'orders', 'write') && !adminCan(ctx, 'installations', 'write')) {
        return Response.json({ success: false, message: 'Permission denied' }, { status: 403, headers });
      }
      const { order_id: reqOid } = body as any;
      const { error } = await db.from('orders').update({ installation_status: 'pending', updated_at: new Date().toISOString() }).eq('id', reqOid);
      if (error) return Response.json({ success: false, message: error.message }, { status: 400, headers });
      await db.from('admin_audit_logs').insert({ admin_id: ctx.id, admin_email: ctx.email, action: 'installation_request', resource: 'orders', resource_id: reqOid });
      return Response.json({ success: true }, { headers });
    }

    if (type === 'installation_job_claim') {
      if (!adminCan(ctx, 'installation_jobs', 'write')) return Response.json({ success: false, message: 'Permission denied' }, { status: 403, headers });
      const { job_id: jid } = body as any;
      // Only claim if still unclaimed — avoids two installers grabbing the same job.
      const { data, error } = await db.from('installation_jobs')
        .update({ status: 'claimed', installer_admin_id: ctx.id, claimed_at: new Date().toISOString(), updated_at: new Date().toISOString() })
        .eq('id', jid).eq('status', 'pending').select().maybeSingle();
      if (error) return Response.json({ success: false, message: error.message }, { status: 400, headers });
      if (!data) return Response.json({ success: false, message: 'Job already claimed by someone else' }, { status: 409, headers });
      await db.from('orders').update({ installation_status: 'claimed' }).eq('id', data.order_id);
      return Response.json({ success: true, job: data }, { headers });
    }

    if (type === 'installation_job_update') {
      if (!adminCan(ctx, 'installation_jobs', 'write')) return Response.json({ success: false, message: 'Permission denied' }, { status: 403, headers });
      const { job_id: ujid, status: jstatus, completion_notes: jcnotes } = body as any;
      const { data: job } = await db.from('installation_jobs').select('installer_admin_id, order_id').eq('id', ujid).maybeSingle();
      if (!job) return Response.json({ success: false, message: 'Job not found' }, { status: 404, headers });
      // Installers may only update their own claimed job; super_admin/franchise can override.
      if (ctx.role_name === 'installer' && job.installer_admin_id !== ctx.id) {
        return Response.json({ success: false, message: 'Not your job' }, { status: 403, headers });
      }
      const upd: Record<string, unknown> = { status: jstatus, updated_at: new Date().toISOString() };
      if (jstatus === 'in_progress') upd.started_at = new Date().toISOString();
      if (jstatus === 'completed') { upd.completed_at = new Date().toISOString(); upd.completion_notes = jcnotes || null; }
      await db.from('installation_jobs').update(upd).eq('id', ujid);
      if (job.order_id) await db.from('orders').update({ installation_status: jstatus }).eq('id', job.order_id);
      return Response.json({ success: true }, { headers });
    }

    // Photo upload: base64 in, stored to installation-photos bucket via service_role.
    if (type === 'installation_job_photo_add') {
      if (!adminCan(ctx, 'installation_jobs', 'write')) return Response.json({ success: false, message: 'Permission denied' }, { status: 403, headers });
      const { job_id: pjid, file_base64, mime_type: pmime, caption: pcaption } = body as any;
      if (!file_base64) return Response.json({ success: false, message: 'file_base64 required' }, { status: 400, headers });
      const ext = (pmime || 'image/jpeg').includes('png') ? 'png' : (pmime || '').includes('webp') ? 'webp' : 'jpg';
      const path = `${pjid}/${crypto.randomUUID()}.${ext}`;
      const bytes = Uint8Array.from(atob(file_base64), c => c.charCodeAt(0));
      const { error: upErr } = await db.storage.from('installation-photos').upload(path, bytes, { contentType: pmime || 'image/jpeg' });
      if (upErr) return Response.json({ success: false, message: upErr.message }, { status: 400, headers });
      const { data: signed } = await db.storage.from('installation-photos').createSignedUrl(path, 60 * 60 * 24 * 7);
      const { data: photoRow } = await db.from('installation_job_photos').insert({
        job_id: pjid, photo_url: signed?.signedUrl || path, caption: pcaption || null, uploaded_by: ctx.id,
      }).select().maybeSingle();
      return Response.json({ success: true, photo: photoRow }, { headers });
    }

    // ── INSTALLER ANALYTICS (Installer's own history) ───────────────────────
    // Read-only aggregation over installation_jobs. Installer sees only their
    // own numbers; franchise/super_admin see the org-wide (or region-wide,
    // once per-region job tagging exists) picture. Reuses installation_jobs —
    // no new table.
    if (type === 'installer_analytics') {
      if (!adminCan(ctx, 'installation_jobs', 'read') && !adminCan(ctx, 'installations', 'read')) {
        return Response.json({ success: false, message: 'Permission denied' }, { status: 403, headers });
      }
      let q = db.from('installation_jobs').select('status, claimed_at, completed_at');
      if (ctx.role_name === 'installer') q = q.eq('installer_admin_id', ctx.id);
      const { data } = await q;
      const jobs = data || [];
      const completedJobs = jobs.filter((j: any) => j.status === 'completed' && j.claimed_at && j.completed_at);
      const avgTurnaroundHrs = completedJobs.length
        ? completedJobs.reduce((total: number, j: any) => {
            const hrs = (new Date(j.completed_at).getTime() - new Date(j.claimed_at).getTime()) / 36e5;
            return total + hrs;
          }, 0) / completedJobs.length
        : null;
      return Response.json({
        success: true,
        analytics: {
          completed: jobs.filter((j: any) => j.status === 'completed').length,
          inProgress: jobs.filter((j: any) => j.status === 'in_progress').length,
          claimed: jobs.filter((j: any) => j.status === 'claimed').length,
          pendingPool: jobs.filter((j: any) => j.status === 'pending').length,
          avgTurnaroundHrs: avgTurnaroundHrs !== null ? Math.round(avgTurnaroundHrs * 10) / 10 : null,
        },
      }, { headers });
    }

    // ── FRANCHISE ────────────────────────────────────────────────────────────
    if (type === 'franchise_installers') {
      if (!adminCan(ctx, 'installers', 'read')) return Response.json({ success: false, message: 'Permission denied' }, { status: 403, headers });
      // Franchise sees installers they onboarded (parent_admin_id = them). Super_admin sees all.
      let q = db.from('admin_users').select('id, email, full_name, is_active, last_login_at, region, role_id, admin_roles(name,label,color)').order('created_at', { ascending: false });
      if (ctx.role_name === 'franchise') q = q.eq('parent_admin_id', ctx.id);
      const { data } = await q;
      const installers = (data || []).filter((a: any) => a.admin_roles?.name === 'installer');
      return Response.json({ success: true, installers }, { headers });
    }

    if (type === 'franchise_dealers') {
      if (!adminCan(ctx, 'dealers', 'read')) return Response.json({ success: false, message: 'Permission denied' }, { status: 403, headers });
      // Franchise sees dealers they onboarded (parent_admin_id = them). Super_admin sees all.
      // Mirrors franchise_installers exactly, filtered to the 'dealer' role instead.
      let q = db.from('admin_users').select('id, email, full_name, is_active, last_login_at, region, role_id, admin_roles(name,label,color)').order('created_at', { ascending: false });
      if (ctx.role_name === 'franchise') q = q.eq('parent_admin_id', ctx.id);
      const { data } = await q;
      const dealers = (data || []).filter((a: any) => a.admin_roles?.name === 'dealer');
      return Response.json({ success: true, dealers }, { headers });
    }

    if (type === 'franchise_overview') {
      if (!adminCan(ctx, 'franchise_overview', 'read')) return Response.json({ success: false, message: 'Permission denied' }, { status: 403, headers });
      // Lightweight region-scoped counts. If no region set on this franchise account yet,
      // returns org-wide counts (documented default — franchise onboarding should set `region`).
      const { data: fAdmin } = await db.from('admin_users').select('region').eq('id', ctx.id).maybeSingle();
      const region = fAdmin?.region || null;
      const [installersRes, dealersRes, jobsRes, ticketsRes, inventoryRes] = await Promise.all([
        db.from('admin_users').select('id', { count: 'exact', head: true }).eq('parent_admin_id', ctx.id),
        db.from('admin_users').select('id, admin_roles(name)').eq('parent_admin_id', ctx.id),
        db.from('installation_jobs').select('id, status', { count: 'exact', head: false }),
        db.from('support_tickets').select('id, status', { count: 'exact', head: false }),
        db.from('inventory_items').select('id, quantity_on_hand, reorder_threshold', { count: 'exact', head: false }),
      ]);
      const dealerCount = (dealersRes.data || []).filter((a: any) => a.admin_roles?.name === 'dealer').length;
      const inventoryRows = inventoryRes.data || [];
      return Response.json({
        success: true,
        overview: {
          region,
          installerCount: installersRes.count || 0,
          dealerCount,
          jobsPending: (jobsRes.data || []).filter((j: any) => j.status === 'pending').length,
          jobsCompleted: (jobsRes.data || []).filter((j: any) => j.status === 'completed').length,
          openTickets: (ticketsRes.data || []).filter((t: any) => t.status === 'open').length,
          // Additive: regional inventory snapshot (org-wide until per-region inventory tagging exists)
          inventoryItemCount: inventoryRows.length,
          inventoryLowStockCount: inventoryRows.filter((i: any) => Number(i.quantity_on_hand) <= Number(i.reorder_threshold || 0)).length,
        },
      }, { headers });
    }

    // ── DEALER COMMISSIONS (foundation — read-only, no calc engine yet) ─────
    if (type === 'commission_list') {
      if (!adminCan(ctx, 'commissions', 'read')) return Response.json({ success: false, message: 'Permission denied' }, { status: 403, headers });
      let q = db.from('dealer_commissions').select('*').order('created_at', { ascending: false });
      if (ctx.role_name === 'dealer') q = q.eq('dealer_admin_id', ctx.id);
      const { data } = await q;
      return Response.json({ success: true, commissions: data || [] }, { headers });
    }

    // Manual status transition only (pending -> approved -> paid). Deliberately does NOT
    // calculate or modify `amount` — no commission formula exists yet per the Phase 6 brief
    // ("if business rules are not available, create placeholders only, do not invent
    // financial logic"). Gated on commissions:write, which today only super_admin holds
    // via the '*' wildcard — dealers keep read-only visibility into their own ledger.
    if (type === 'commission_update_status') {
      if (!adminCan(ctx, 'commissions', 'write')) return Response.json({ success: false, message: 'Permission denied' }, { status: 403, headers });
      const { commission_id: cid, status: newStatus } = body as any;
      const VALID_COMMISSION_STATUSES = ['pending', 'approved', 'paid'];
      if (!cid || !VALID_COMMISSION_STATUSES.includes(String(newStatus))) {
        return Response.json({ success: false, message: 'commission_id and a valid status are required' }, { status: 400, headers });
      }
      const { data, error } = await db.from('dealer_commissions')
        .update({ status: newStatus, updated_at: new Date().toISOString() })
        .eq('id', cid).select().maybeSingle();
      if (error) return Response.json({ success: false, message: error.message }, { status: 400, headers });
      await db.from('admin_audit_logs').insert({
        admin_id: ctx.id, admin_email: ctx.email, action: 'commission_update_status',
        resource: 'commissions', resource_id: cid, after_data: { status: newStatus },
      });
      return Response.json({ success: true, commission: data }, { headers });
    }

    // ══════════════════════════════════════════════
    // PHASE 8C — PARTNER APPLICATIONS + KYC REVIEW
    // Gated on 'partner_applications' — no admin_roles row grants this
    // today (see migration 58), so only super_admin's '*' wildcard can
    // reach these handlers until a future migration scopes it further.
    // ══════════════════════════════════════════════
    if (type === 'partner_application_list') {
      if (!adminCan(ctx, 'partner_applications', 'read')) return Response.json({ success: false, message: 'Permission denied' }, { status: 403, headers });
      const { status: filterStatus, partner_type: filterType } = body as any;
      let q = db.from('partner_applications').select('*').order('created_at', { ascending: false });
      if (filterStatus) q = q.eq('status', filterStatus);
      if (filterType) q = q.eq('partner_type', filterType);
      const { data, error } = await q;
      if (error) return Response.json({ success: false, message: error.message }, { status: 400, headers });
      return Response.json({ success: true, applications: data || [] }, { headers });
    }

    if (type === 'partner_application_detail') {
      if (!adminCan(ctx, 'partner_applications', 'read')) return Response.json({ success: false, message: 'Permission denied' }, { status: 403, headers });
      const { application_id: paid } = body as any;
      if (!paid) return Response.json({ success: false, message: 'application_id required' }, { status: 400, headers });
      const { data: app, error } = await db.from('partner_applications').select('*').eq('id', paid).maybeSingle();
      if (error) return Response.json({ success: false, message: error.message }, { status: 400, headers });
      if (!app) return Response.json({ success: false, message: 'Application not found' }, { status: 404, headers });
      const { data: docs } = await db.from('partner_kyc_documents').select('*').eq('application_id', paid).order('created_at', { ascending: false });
      return Response.json({ success: true, application: app, documents: docs || [] }, { headers });
    }

    // Reviewer approves/rejects one uploaded document. Approving the
    // gst_certificate/pan_card doc types also flips the corresponding
    // gst_verified/pan_verified flag on the application — this is the
    // real verification hook: a human checked the document. Wiring an
    // automated GST/PAN API is a drop-in replacement for this same
    // column pair later, not a new schema.
    if (type === 'partner_kyc_document_review') {
      if (!adminCan(ctx, 'partner_applications', 'write')) return Response.json({ success: false, message: 'Permission denied' }, { status: 403, headers });
      const { document_id: did, status: docStatus, review_notes: dnotes } = body as any;
      const VALID_DOC_STATUSES = ['pending', 'approved', 'rejected'];
      if (!did || !VALID_DOC_STATUSES.includes(String(docStatus))) {
        return Response.json({ success: false, message: 'document_id and a valid status are required' }, { status: 400, headers });
      }
      const { data: doc, error: docErr } = await db.from('partner_kyc_documents')
        .update({ status: docStatus, review_notes: dnotes || null, reviewed_by: ctx.id, reviewed_at: new Date().toISOString() })
        .eq('id', did).select().maybeSingle();
      if (docErr) return Response.json({ success: false, message: docErr.message }, { status: 400, headers });
      if (!doc) return Response.json({ success: false, message: 'Document not found' }, { status: 404, headers });

      if (docStatus === 'approved' && (doc.doc_type === 'gst_certificate' || doc.doc_type === 'pan_card')) {
        const flagField = doc.doc_type === 'gst_certificate' ? 'gst_verified' : 'pan_verified';
        const atField = doc.doc_type === 'gst_certificate' ? 'gst_verified_at' : 'pan_verified_at';
        await db.from('partner_applications').update({ [flagField]: true, [atField]: new Date().toISOString() }).eq('id', doc.application_id);
      }

      await db.from('admin_audit_logs').insert({
        admin_id: ctx.id, admin_email: ctx.email, action: 'partner_kyc_document_review',
        resource: 'partner_kyc_documents', resource_id: did, after_data: { status: docStatus },
      });
      return Response.json({ success: true, document: doc }, { headers });
    }

    // Approve/reject the application itself.
    //   - reject: sets status + rejection_reason. Applicant can call
    //     partner-application's `reapply` afterwards.
    //   - approve: creates the real admin_users row (role matched to
    //     partner_type — this is the missing step identified during the
    //     audit; no code anywhere in this repo created admin_users
    //     before this migration/handler). Generates a one-time temp
    //     password (bcrypt-hashed, same library as admin-login), returns
    //     it once in the response for the reviewer to relay, and emails
    //     it to the applicant via the existing send-email function.
    if (type === 'partner_application_review') {
      if (!adminCan(ctx, 'partner_applications', 'write')) return Response.json({ success: false, message: 'Permission denied' }, { status: 403, headers });
      const { application_id: raid, decision, rejection_reason: rreason } = body as any;
      if (!raid || !['approve', 'reject'].includes(String(decision))) {
        return Response.json({ success: false, message: 'application_id and decision (approve|reject) are required' }, { status: 400, headers });
      }

      const { data: app, error: appErr } = await db.from('partner_applications').select('*').eq('id', raid).maybeSingle();
      if (appErr) return Response.json({ success: false, message: appErr.message }, { status: 400, headers });
      if (!app) return Response.json({ success: false, message: 'Application not found' }, { status: 404, headers });
      if (app.status === 'approved' || app.status === 'rejected') {
        return Response.json({ success: false, message: `Application is already ${app.status}` }, { status: 400, headers });
      }

      if (decision === 'reject') {
        if (!rreason || String(rreason).trim().length < 3) {
          return Response.json({ success: false, message: 'rejection_reason is required' }, { status: 400, headers });
        }
        const { data: updated, error } = await db.from('partner_applications')
          .update({ status: 'rejected', rejection_reason: rreason, reviewed_by: ctx.id, reviewed_at: new Date().toISOString() })
          .eq('id', raid).select().maybeSingle();
        if (error) return Response.json({ success: false, message: error.message }, { status: 400, headers });

        await db.from('admin_audit_logs').insert({
          admin_id: ctx.id, admin_email: ctx.email, action: 'partner_application_reject',
          resource: 'partner_applications', resource_id: raid, after_data: { status: 'rejected', reason: rreason },
        });

        if (app.contact_email) {
          try {
            await db.functions.invoke('send-email', {
              body: { template: 'partner_application_rejected', to: app.contact_email, to_name: app.contact_name, data: { application_number: app.application_number, reason: rreason } },
            });
          } catch (e) { console.warn('[admin-data] partner rejection email failed (non-fatal):', (e as Error).message); }
        }

        return Response.json({ success: true, application: updated }, { headers });
      }

      // decision === 'approve'
      if (!app.gst_verified && app.gst_number) {
        return Response.json({ success: false, message: 'GST document is not verified yet — review the KYC documents before approving.' }, { status: 400, headers });
      }
      if (!app.pan_verified) {
        return Response.json({ success: false, message: 'PAN document is not verified yet — review the KYC documents before approving.' }, { status: 400, headers });
      }
      if (!app.contact_email) {
        return Response.json({ success: false, message: 'Application has no contact_email — cannot create login credentials.' }, { status: 400, headers });
      }

      const { data: role, error: roleErr } = await db.from('admin_roles').select('id').eq('name', app.partner_type).maybeSingle();
      if (roleErr || !role) return Response.json({ success: false, message: `No admin role found for partner_type '${app.partner_type}'` }, { status: 500, headers });

      const { data: existingAdmin } = await db.from('admin_users').select('id').eq('email', app.contact_email).maybeSingle();
      if (existingAdmin) return Response.json({ success: false, message: `An admin account already exists for ${app.contact_email}` }, { status: 409, headers });

      const tempPassword = crypto.randomUUID().replace(/-/g, '').slice(0, 12);
      const passwordHash = bcryptjs.hashSync(tempPassword, 10);

      const { data: newAdmin, error: adminInsertErr } = await db.from('admin_users').insert({
        email: app.contact_email,
        full_name: app.contact_name,
        role_id: role.id,
        password_hash: passwordHash,
        is_active: true,
        region: app.requested_territory || null,
        created_by: ctx.id,
      }).select('id, email, full_name').maybeSingle();
      if (adminInsertErr) return Response.json({ success: false, message: adminInsertErr.message }, { status: 400, headers });

      const { data: updated, error } = await db.from('partner_applications')
        .update({ status: 'approved', reviewed_by: ctx.id, reviewed_at: new Date().toISOString(), resulting_admin_id: newAdmin!.id })
        .eq('id', raid).select().maybeSingle();
      if (error) return Response.json({ success: false, message: error.message }, { status: 400, headers });

      await db.from('admin_audit_logs').insert({
        admin_id: ctx.id, admin_email: ctx.email, action: 'partner_application_approve',
        resource: 'partner_applications', resource_id: raid, after_data: { status: 'approved', new_admin_id: newAdmin!.id, role: app.partner_type },
      });

      try {
        await db.functions.invoke('send-email', {
          body: { template: 'partner_application_approved', to: app.contact_email, to_name: app.contact_name, data: { application_number: app.application_number, login_email: app.contact_email, temp_password: tempPassword } },
        });
      } catch (e) { console.warn('[admin-data] partner approval email failed (non-fatal):', (e as Error).message); }

      // temp_password returned once — not stored in plaintext anywhere, not retrievable again after this response.
      return Response.json({ success: true, application: updated, new_admin: newAdmin, temp_password: tempPassword }, { headers });
    }

    // ══════════════════════════════════════════════
    // SAAS BILLING — PLAN CATALOG (public-ish, but routed through here so
    // the admin panel's pricing editor and the owner pricing UI both read
    // the exact same source of truth)
    // ══════════════════════════════════════════════
    if (type === 'plan_catalog_list') {
      const { data, error } = await db.from('plan_catalog').select('*').order('sort_order', { ascending: true });
      if (error) return Response.json({ success: false, message: error.message }, { status: 500, headers });
      return Response.json({ success: true, plans: data || [] }, { headers });
    }

    // ══════════════════════════════════════════════
    // SAAS BILLING — INVOICES (admin view across all owners)
    // ══════════════════════════════════════════════
    if (type === 'invoice_list') {
      if (!adminCan(ctx, 'subscriptions', 'read')) {
        return Response.json({ success: false, message: 'Permission denied' }, { status: 403, headers });
      }
      const { owner_id = null, status_filter = null, invoice_type_filter = null, limit = 50, offset = 0 } = body as any;

      let qb = db.from('invoices')
        .select('*, users!owner_id(full_name, phone, email, plate_id)', { count: 'exact' })
        .range(Number(offset), Number(offset) + Number(limit) - 1)
        .order('created_at', { ascending: false });

      if (owner_id) qb = qb.eq('owner_id', owner_id);
      if (status_filter && status_filter !== 'all') qb = qb.eq('status', status_filter);
      if (invoice_type_filter && invoice_type_filter !== 'all') qb = qb.eq('invoice_type', invoice_type_filter);

      const { data, error, count } = await qb;
      if (error) return Response.json({ success: false, message: error.message }, { status: 500, headers });

      return Response.json({ success: true, invoices: data || [], total: count || 0 }, { headers });
    }

    // ══════════════════════════════════════════════
    // PHASE 8B — GST BILLING & INVOICING PLATFORM
    // Reuses the 'subscriptions' RBAC resource (same permission that already
    // gates invoice_list/refund above) — no new admin_roles migration needed.
    // ══════════════════════════════════════════════

    // ── GST Settings: read (for the admin settings editor) ──
    if (type === 'gst_settings_get') {
      if (!adminCan(ctx, 'subscriptions', 'read')) {
        return Response.json({ success: false, message: 'Permission denied' }, { status: 403, headers });
      }
      const { data, error } = await db.from('gst_settings').select('*').eq('id', 1).maybeSingle();
      if (error) return Response.json({ success: false, message: error.message }, { status: 500, headers });
      return Response.json({ success: true, settings: data }, { headers });
    }

    // ── GST Settings: update (company details / rates — future GST rate
    //    changes go here, never a code deploy) ──
    if (type === 'gst_settings_update') {
      if (!adminCan(ctx, 'subscriptions', 'write')) {
        return Response.json({ success: false, message: 'Permission denied' }, { status: 403, headers });
      }
      const { updates } = body as any;
      if (!updates || typeof updates !== 'object') {
        return Response.json({ success: false, message: 'updates object required' }, { status: 400, headers });
      }
      if (updates.seller_gstin && !/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/.test(updates.seller_gstin)) {
        return Response.json({ success: false, message: 'Invalid GSTIN format' }, { status: 400, headers });
      }

      const { data: before } = await db.from('gst_settings').select('*').eq('id', 1).maybeSingle();
      const { data, error } = await db.from('gst_settings').update(updates).eq('id', 1).select('*').maybeSingle();
      if (error) return Response.json({ success: false, message: error.message }, { status: 500, headers });

      await db.from('admin_audit_logs').insert({
        admin_id: ctx.id, admin_email: ctx.email, action: 'gst_settings_update',
        resource: 'gst_settings', resource_id: '1', before_data: before || {}, after_data: data || {},
      });

      return Response.json({ success: true, settings: data }, { headers });
    }

    // ── Credit / Debit Notes: list (history + tracking) ──
    if (type === 'billing_note_list') {
      if (!adminCan(ctx, 'subscriptions', 'read')) {
        return Response.json({ success: false, message: 'Permission denied' }, { status: 403, headers });
      }
      const { note_type = null, approval_status_filter = null, limit = 50, offset = 0 } = body as any;

      let qb = db.from('invoices')
        .select('*, users!owner_id(full_name, phone, email)', { count: 'exact' })
        .in('invoice_type', note_type && note_type !== 'all' ? [note_type] : ['credit_note', 'debit_note'])
        .range(Number(offset), Number(offset) + Number(limit) - 1)
        .order('created_at', { ascending: false });

      if (approval_status_filter && approval_status_filter !== 'all') qb = qb.eq('approval_status', approval_status_filter);

      const { data, error, count } = await qb;
      if (error) return Response.json({ success: false, message: error.message }, { status: 500, headers });

      return Response.json({ success: true, notes: data || [], total: count || 0 }, { headers });
    }

    // ── Credit Note: issue (manual — e.g. goodwill adjustment, not tied to
    //    a Razorpay refund, which auto-issues its own via razorpay-refund) ──
    if (type === 'credit_note_issue') {
      if (!adminCan(ctx, 'subscriptions', 'write')) {
        return Response.json({ success: false, message: 'Permission denied' }, { status: 403, headers });
      }
      const { invoice_id, amount, reason } = body as any;
      if (!invoice_id || !amount || !reason) {
        return Response.json({ success: false, message: 'invoice_id, amount and reason are required' }, { status: 400, headers });
      }

      const { data: noteId, error } = await db.rpc('issue_billing_note', {
        p_original_invoice_id: invoice_id, p_note_type: 'credit_note',
        p_amount: amount, p_reason: reason, p_issued_by: ctx.email,
      });
      if (error) return Response.json({ success: false, message: error.message }, { status: 500, headers });

      await db.from('admin_audit_logs').insert({
        admin_id: ctx.id, admin_email: ctx.email, action: 'credit_note_issue',
        resource: 'billing', resource_id: String(noteId), notes: reason,
      });

      return Response.json({ success: true, noteId }, { headers });
    }

    // ── Debit Note: issue (e.g. additional charges against an existing
    //    invoice — installation surcharge, replacement fee, etc.) ──
    if (type === 'debit_note_issue') {
      if (!adminCan(ctx, 'subscriptions', 'write')) {
        return Response.json({ success: false, message: 'Permission denied' }, { status: 403, headers });
      }
      const { invoice_id, amount, reason } = body as any;
      if (!invoice_id || !amount || !reason) {
        return Response.json({ success: false, message: 'invoice_id, amount and reason are required' }, { status: 400, headers });
      }

      const { data: noteId, error } = await db.rpc('issue_billing_note', {
        p_original_invoice_id: invoice_id, p_note_type: 'debit_note',
        p_amount: amount, p_reason: reason, p_issued_by: ctx.email,
      });
      if (error) return Response.json({ success: false, message: error.message }, { status: 500, headers });

      await db.from('admin_audit_logs').insert({
        admin_id: ctx.id, admin_email: ctx.email, action: 'debit_note_issue',
        resource: 'billing', resource_id: String(noteId), notes: reason,
      });

      return Response.json({ success: true, noteId }, { headers });
    }

    // ── Credit / Debit Note: approve or reject ──
    if (type === 'billing_note_approve') {
      if (!adminCan(ctx, 'subscriptions', 'write')) {
        return Response.json({ success: false, message: 'Permission denied' }, { status: 403, headers });
      }
      const { note_id, decision } = body as any;
      if (!note_id || !['approved', 'rejected'].includes(decision)) {
        return Response.json({ success: false, message: 'note_id and a valid decision are required' }, { status: 400, headers });
      }

      const { data, error } = await db.rpc('approve_billing_note', {
        p_note_id: note_id, p_admin_email: ctx.email, p_decision: decision,
      });
      if (error) return Response.json({ success: false, message: error.message }, { status: 500, headers });
      if (!(data as any)?.success) return Response.json({ success: false, message: (data as any)?.message || 'Could not process note' }, { status: 400, headers });

      await db.from('admin_audit_logs').insert({
        admin_id: ctx.id, admin_email: ctx.email, action: 'billing_note_' + decision,
        resource: 'billing', resource_id: note_id,
      });

      return Response.json({ success: true, ...(data as any) }, { headers });
    }

    // ── Refund Ledger: history ──
    if (type === 'refund_ledger_list') {
      if (!adminCan(ctx, 'subscriptions', 'read')) {
        return Response.json({ success: false, message: 'Permission denied' }, { status: 403, headers });
      }
      const { limit = 50, offset = 0 } = body as any;
      const { data, error, count } = await db.from('refund_ledger')
        .select('*, users!owner_id(full_name, phone, email)', { count: 'exact' })
        .range(Number(offset), Number(offset) + Number(limit) - 1)
        .order('created_at', { ascending: false });
      if (error) return Response.json({ success: false, message: error.message }, { status: 500, headers });
      return Response.json({ success: true, refunds: data || [], total: count || 0 }, { headers });
    }

    // ── Billing Analytics: invoice totals, tax collected, refund totals,
    //    outstanding invoices, monthly billing. Distinct from the existing
    //    financial_metrics action (revenue-focused) — this is GST/tax-
    //    focused and drives the GST return filing workflow. ──
    if (type === 'billing_analytics') {
      if (!adminCan(ctx, 'subscriptions', 'read')) {
        return Response.json({ success: false, message: 'Permission denied' }, { status: 403, headers });
      }
      const { from_date = null, to_date = null } = body as any;

      let qb = db.from('invoices').select('invoice_type, status, approval_status, amount, taxable_value, cgst_amount, sgst_amount, igst_amount, invoice_total, created_at');
      if (from_date) qb = qb.gte('created_at', from_date);
      if (to_date) qb = qb.lte('created_at', to_date);

      const { data: rows, error } = await qb;
      if (error) return Response.json({ success: false, message: error.message }, { status: 500, headers });

      const all = rows || [];
      const taxInvoices  = all.filter(r => r.invoice_type === 'tax_invoice');
      const creditNotes  = all.filter(r => r.invoice_type === 'credit_note' && r.approval_status === 'approved');
      const paidInvoices = taxInvoices.filter(r => r.status === 'paid' || r.status === 'issued');
      const outstanding  = taxInvoices.filter(r => r.status === 'pending');

      const sum = (arr: any[], key: string) => arr.reduce((s, r) => s + (Number(r[key]) || 0), 0);

      const { data: refundTotals } = await db.from('refund_ledger').select('amount');
      const totalRefunds = sum(refundTotals || [], 'amount');

      // Monthly billing breakdown (by invoice month, tax invoices only)
      const monthly: Record<string, { count: number; total: number; tax: number }> = {};
      for (const r of paidInvoices) {
        const month = new Date(r.created_at).toISOString().slice(0, 7); // YYYY-MM
        if (!monthly[month]) monthly[month] = { count: 0, total: 0, tax: 0 };
        monthly[month].count += 1;
        monthly[month].total += Number(r.invoice_total || r.amount || 0);
        monthly[month].tax += Number(r.cgst_amount || 0) + Number(r.sgst_amount || 0) + Number(r.igst_amount || 0);
      }

      return Response.json({
        success: true,
        analytics: {
          invoiceTotal:      sum(paidInvoices, 'invoice_total') || sum(paidInvoices, 'amount'),
          taxableValueTotal: sum(paidInvoices, 'taxable_value'),
          taxCollected:      sum(paidInvoices, 'cgst_amount') + sum(paidInvoices, 'sgst_amount') + sum(paidInvoices, 'igst_amount'),
          creditNoteTotal:   sum(creditNotes, 'invoice_total') || sum(creditNotes, 'amount'),
          refundTotal:       totalRefunds,
          outstandingCount:  outstanding.length,
          outstandingTotal:  sum(outstanding, 'amount'),
          invoiceCount:      paidInvoices.length,
          monthly: Object.entries(monthly)
            .sort((a, b) => b[0].localeCompare(a[0]))
            .map(([month, v]) => ({ month, ...v })),
        },
      }, { headers });
    }

    // ══════════════════════════════════════════════
    // SAAS BILLING — USAGE SUMMARY (admin lookup for one owner)
    // ══════════════════════════════════════════════
    if (type === 'subscription_usage') {
      if (!adminCan(ctx, 'subscriptions', 'read')) {
        return Response.json({ success: false, message: 'Permission denied' }, { status: 403, headers });
      }
      const { owner_id } = body as any;
      if (!owner_id) return Response.json({ success: false, message: 'owner_id required' }, { status: 400, headers });

      const { data, error } = await db.rpc('get_usage_summary', { p_owner_id: owner_id });
      if (error) return Response.json({ success: false, message: error.message }, { status: 500, headers });

      return Response.json({ success: true, usage: data }, { headers });
    }

    // ══════════════════════════════════════════════
    // SAAS BILLING — ADMIN: MANUAL PLAN ASSIGNMENT
    // Enable/disable subscriptions, manual upgrades/downgrades, comps, and
    // plan assignment for a customer — no payment involved. Fully audited.
    // ══════════════════════════════════════════════
    if (type === 'assign_plan') {
      if (!adminCan(ctx, 'subscriptions', 'write')) {
        return Response.json({ success: false, message: 'Permission denied' }, { status: 403, headers });
      }
      const { owner_id, plan_key, billing_cycle = 'yearly', duration_days = null, notes = '' } = body as any;
      if (!owner_id || !plan_key) {
        return Response.json({ success: false, message: 'owner_id and plan_key required' }, { status: 400, headers });
      }

      const { data: plan } = await db.from('plan_catalog').select('*').eq('plan_key', plan_key).maybeSingle();
      if (!plan) return Response.json({ success: false, message: 'Unknown plan_key' }, { status: 400, headers });

      const startDate  = new Date();
      const expiryDate = new Date(startDate);
      if (duration_days) {
        expiryDate.setDate(expiryDate.getDate() + Number(duration_days));
      } else if (plan_key === 'free' || plan_key === 'hardware_only') {
        expiryDate.setFullYear(expiryDate.getFullYear() + 100); // effectively never expires
      } else if (billing_cycle === 'monthly') {
        expiryDate.setMonth(expiryDate.getMonth() + 1);
      } else {
        expiryDate.setFullYear(expiryDate.getFullYear() + 1);
      }

      const { data: existing } = await db.from('subscriptions')
        .select('id').eq('owner_id', owner_id).eq('status', 'active').maybeSingle();

      const renewalPrice = billing_cycle === 'monthly' ? plan.price_monthly : plan.price_yearly;

      if (existing) {
        const { error } = await db.from('subscriptions').update({
          plan: plan_key, status: 'active', billing_cycle,
          expiry_date: expiryDate.toISOString(), renewal_price: renewalPrice,
          cancel_at_period_end: false, grace_until: null,
          is_admin_assigned: true, admin_notes: notes, source: 'admin_manual',
          updated_at: startDate.toISOString(),
        }).eq('id', existing.id);
        if (error) return Response.json({ success: false, message: error.message }, { status: 500, headers });
      } else {
        const { error } = await db.from('subscriptions').insert({
          owner_id, plan: plan_key, status: 'active', billing_cycle,
          start_date: startDate.toISOString(), expiry_date: expiryDate.toISOString(),
          renewal_price: renewalPrice, is_admin_assigned: true, admin_notes: notes,
          source: 'admin_manual',
        });
        if (error) return Response.json({ success: false, message: error.message }, { status: 500, headers });
      }

      try {
        await db.from('notifications').insert({
          id: crypto.randomUUID(), owner_id, type: 'status_change',
          title: '✨ Plan Updated', body: `An admin moved your account to the ${plan.name} plan.`,
          priority: 'normal', channels: ['in_app'], delivery_status: {}, payload: { plan: plan_key },
        });
      } catch (_ne) { /* non-fatal */ }

      await db.from('admin_audit_logs').insert({
        admin_id: ctx.id, admin_email: ctx.email, action: 'assign_plan',
        resource: 'subscriptions', resource_id: owner_id,
        metadata: { plan_key, billing_cycle, duration_days, notes },
        created_at: new Date().toISOString(),
      });

      return Response.json({ success: true, plan: plan_key, expiryDate: expiryDate.toISOString() }, { headers });
    }

    // ══════════════════════════════════════════════
    // SAAS BILLING — ADMIN: ENABLE / DISABLE A SUBSCRIPTION
    // Distinct from 'cancel' (which is owner self-service, end-of-period).
    // This is an immediate admin suspend/restore — e.g. abuse, chargebacks.
    // ══════════════════════════════════════════════
    if (type === 'toggle_subscription_enabled') {
      if (!adminCan(ctx, 'subscriptions', 'write')) {
        return Response.json({ success: false, message: 'Permission denied' }, { status: 403, headers });
      }
      const { sub_id, enabled } = body as any;
      if (!sub_id || typeof enabled !== 'boolean') {
        return Response.json({ success: false, message: 'sub_id and enabled (boolean) required' }, { status: 400, headers });
      }
      const { error } = await db.from('subscriptions').update({
        status: enabled ? 'active' : 'suspended',
        updated_at: new Date().toISOString(),
      }).eq('id', sub_id);
      if (error) return Response.json({ success: false, message: error.message }, { status: 500, headers });

      await db.from('admin_audit_logs').insert({
        admin_id: ctx.id, admin_email: ctx.email,
        action: enabled ? 'enable_subscription' : 'disable_subscription',
        resource: 'subscriptions', resource_id: sub_id,
        created_at: new Date().toISOString(),
      });

      return Response.json({ success: true }, { headers });
    }

    // ══════════════════════════════════════════════
    // PHASE 7 — SHIPMENT TRACKING
    // Admin surface over the existing `shipments` / `tracking_events`
    // tables and services/shipping.js logic (that service was previously
    // never called from any UI — this wires it up, no new schema).
    // ══════════════════════════════════════════════
    if (type === 'shipment_list') {
      if (!adminCan(ctx, 'shipments', 'read')) {
        return Response.json({ success: false, message: 'Permission denied' }, { status: 403, headers });
      }
      const { status = null, limit = 100, offset = 0 } = body as any;
      let qb = db.from('shipments')
        .select('*, orders(id, plate_id, owner_id, product_type, users(name, phone))', { count: 'exact' })
        .order('created_at', { ascending: false })
        .range(Number(offset), Number(offset) + Number(limit) - 1);
      if (status) qb = qb.eq('status', status);
      const { data, error, count } = await qb;
      if (error) return Response.json({ success: false, message: error.message }, { status: 500, headers });
      return Response.json({ success: true, shipments: data || [], total: count || 0 }, { headers });
    }

    if (type === 'shipment_create') {
      if (!adminCan(ctx, 'shipments', 'write')) {
        return Response.json({ success: false, message: 'Permission denied' }, { status: 403, headers });
      }
      const { order_id, awb_number, provider = 'manual', tracking_url = null, estimated_delivery = null } = body as any;
      if (!order_id || !awb_number) {
        return Response.json({ success: false, message: 'order_id and awb_number required' }, { status: 400, headers });
      }
      const { data, error } = await db.from('shipments').insert({
        order_id, awb_number, provider, tracking_url, estimated_delivery, status: 'created',
      }).select().maybeSingle();
      if (error) return Response.json({ success: false, message: error.message }, { status: 500, headers });

      await db.from('tracking_events').insert({
        order_id, event_type: 'shipped', event_label: 'Shipment created',
        event_detail: `AWB ${awb_number} via ${provider}`, actor: 'admin',
        metadata: { awb_number, provider },
      });

      await db.from('admin_audit_logs').insert({
        admin_id: ctx.id, admin_email: ctx.email, action: 'shipment_created',
        resource: 'shipments', resource_id: (data as any)?.id, metadata: { order_id, awb_number, provider },
        created_at: new Date().toISOString(),
      });

      return Response.json({ success: true, shipment: data }, { headers });
    }

    if (type === 'shipment_update_status') {
      if (!adminCan(ctx, 'shipments', 'write')) {
        return Response.json({ success: false, message: 'Permission denied' }, { status: 403, headers });
      }
      const { shipment_id, status, remarks = '' } = body as any;
      const validStatuses = ['created', 'in_transit', 'out_for_delivery', 'delivered', 'failed', 'returned'];
      if (!shipment_id || !validStatuses.includes(status)) {
        return Response.json({ success: false, message: 'shipment_id and a valid status required' }, { status: 400, headers });
      }
      const { data: shipment, error: fetchErr } = await db.from('shipments').select('order_id').eq('id', shipment_id).maybeSingle();
      if (fetchErr || !shipment) return Response.json({ success: false, message: 'Shipment not found' }, { status: 404, headers });

      const { error } = await db.from('shipments').update({ status, remarks, updated_at: new Date().toISOString() }).eq('id', shipment_id);
      if (error) return Response.json({ success: false, message: error.message }, { status: 500, headers });

      await db.from('tracking_events').insert({
        order_id: (shipment as any).order_id, event_type: status,
        event_label: `Shipment ${status.replace(/_/g, ' ')}`, event_detail: remarks, actor: 'admin',
      });

      if (status === 'delivered') {
        await db.from('orders').update({ manufacturing_status: 'delivered', updated_at: new Date().toISOString() }).eq('id', (shipment as any).order_id);
      }

      await db.from('admin_audit_logs').insert({
        admin_id: ctx.id, admin_email: ctx.email, action: 'shipment_status_update',
        resource: 'shipments', resource_id: shipment_id, metadata: { status, remarks },
        created_at: new Date().toISOString(),
      });

      return Response.json({ success: true }, { headers });
    }

    // ══════════════════════════════════════════════
    // PHASE 7 — REPLACEMENT & OWNERSHIP TRANSFER CONSOLE
    // The backend logic (services/replacementTransfer.js) already existed
    // and is untouched here — this only adds the admin read/approve
    // surface that was missing (no admin panel called it before).
    // ══════════════════════════════════════════════
    if (type === 'replacement_list') {
      if (!adminCan(ctx, 'replacements', 'read')) {
        return Response.json({ success: false, message: 'Permission denied' }, { status: 403, headers });
      }
      const { status = null, limit = 100 } = body as any;
      let qb = db.from('replacement_requests')
        .select('*, users(name, phone, email)')
        .order('created_at', { ascending: false })
        .limit(Number(limit));
      if (status) qb = qb.eq('status', status);
      const { data, error } = await qb;
      if (error) return Response.json({ success: false, message: error.message }, { status: 500, headers });
      return Response.json({ success: true, requests: data || [] }, { headers });
    }

    if (type === 'replacement_decide') {
      if (!adminCan(ctx, 'replacements', 'write')) {
        return Response.json({ success: false, message: 'Permission denied' }, { status: 403, headers });
      }
      const { request_id, decision, replacement_order_id = null, reason = '' } = body as any;
      if (!request_id || !['approved', 'rejected'].includes(decision)) {
        return Response.json({ success: false, message: 'request_id and decision (approved|rejected) required' }, { status: 400, headers });
      }
      const updates: Record<string, unknown> = { status: decision, updated_at: new Date().toISOString() };
      if (decision === 'approved') {
        updates.replacement_order_id = replacement_order_id;
      } else {
        updates.resolved_at = new Date().toISOString();
        updates.notes = reason;
      }
      const { error } = await db.from('replacement_requests').update(updates).eq('id', request_id);
      if (error) return Response.json({ success: false, message: error.message }, { status: 500, headers });

      await db.from('admin_audit_logs').insert({
        admin_id: ctx.id, admin_email: ctx.email, action: `replacement_${decision}`,
        resource: 'replacements', resource_id: request_id, metadata: { decision, reason },
        created_at: new Date().toISOString(),
      });

      return Response.json({ success: true }, { headers });
    }

    if (type === 'transfer_list') {
      if (!adminCan(ctx, 'replacements', 'read')) {
        return Response.json({ success: false, message: 'Permission denied' }, { status: 403, headers });
      }
      const { status = null, limit = 100 } = body as any;
      let qb = db.from('ownership_transfers')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(Number(limit));
      if (status) qb = qb.eq('status', status);
      const { data, error } = await qb;
      if (error) return Response.json({ success: false, message: error.message }, { status: 500, headers });
      return Response.json({ success: true, transfers: data || [] }, { headers });
    }

    if (type === 'transfer_decide') {
      if (!adminCan(ctx, 'replacements', 'write')) {
        return Response.json({ success: false, message: 'Permission denied' }, { status: 403, headers });
      }
      const { transfer_id, decision, new_owner_id = null, reason = '' } = body as any;
      if (!transfer_id || !['completed', 'cancelled'].includes(decision)) {
        return Response.json({ success: false, message: 'transfer_id and decision (completed|cancelled) required' }, { status: 400, headers });
      }

      if (decision === 'completed') {
        const { data: transfer, error: fetchErr } = await db.from('ownership_transfers').select('plate_id, new_owner_id').eq('id', transfer_id).maybeSingle();
        if (fetchErr || !transfer) return Response.json({ success: false, message: 'Transfer not found' }, { status: 404, headers });
        const ownerId = new_owner_id || (transfer as any).new_owner_id;
        if (!ownerId) return Response.json({ success: false, message: 'new_owner_id required to complete transfer' }, { status: 400, headers });

        const { error: plateErr } = await db.from('plates').update({ owner_id: ownerId }).eq('plate_id', (transfer as any).plate_id);
        if (plateErr) return Response.json({ success: false, message: plateErr.message }, { status: 500, headers });

        await db.from('ownership_transfers').update({
          status: 'completed', new_owner_id: ownerId, transferred_at: new Date().toISOString(), updated_at: new Date().toISOString(),
        }).eq('id', transfer_id);
      } else {
        await db.from('ownership_transfers').update({
          status: 'cancelled', notes: reason, updated_at: new Date().toISOString(),
        }).eq('id', transfer_id);
      }

      await db.from('admin_audit_logs').insert({
        admin_id: ctx.id, admin_email: ctx.email, action: `transfer_${decision}`,
        resource: 'replacements', resource_id: transfer_id, metadata: { decision, reason },
        created_at: new Date().toISOString(),
      });

      return Response.json({ success: true }, { headers });
    }

    // ══════════════════════════════════════════════
    // PHASE 7 — WARRANTY MANAGEMENT
    // ══════════════════════════════════════════════
    if (type === 'warranty_list') {
      if (!adminCan(ctx, 'warranty', 'read')) {
        return Response.json({ success: false, message: 'Permission denied' }, { status: 403, headers });
      }
      const { status = null, limit = 100 } = body as any;
      let qb = db.from('warranties')
        .select('*, users(name, phone), warranty_claims(id, status)')
        .order('created_at', { ascending: false })
        .limit(Number(limit));
      if (status) qb = qb.eq('status', status);
      const { data, error } = await qb;
      if (error) return Response.json({ success: false, message: error.message }, { status: 500, headers });
      return Response.json({ success: true, warranties: data || [] }, { headers });
    }

    if (type === 'warranty_create') {
      if (!adminCan(ctx, 'warranty', 'write')) {
        return Response.json({ success: false, message: 'Permission denied' }, { status: 403, headers });
      }
      const { plate_id, owner_id, order_id = null, coverage_type = 'standard', duration_months = 12, terms = '' } = body as any;
      if (!plate_id || !owner_id) {
        return Response.json({ success: false, message: 'plate_id and owner_id required' }, { status: 400, headers });
      }
      const startsAt = new Date();
      const endsAt = new Date(startsAt);
      endsAt.setMonth(endsAt.getMonth() + Number(duration_months || 12));

      const { data, error } = await db.from('warranties').insert({
        plate_id, owner_id, order_id, coverage_type, terms,
        starts_at: startsAt.toISOString(), ends_at: endsAt.toISOString(), status: 'active',
      }).select().maybeSingle();
      if (error) return Response.json({ success: false, message: error.message }, { status: 500, headers });

      await db.from('admin_audit_logs').insert({
        admin_id: ctx.id, admin_email: ctx.email, action: 'warranty_created',
        resource: 'warranty', resource_id: (data as any)?.id, metadata: { plate_id, coverage_type, duration_months },
        created_at: new Date().toISOString(),
      });

      return Response.json({ success: true, warranty: data }, { headers });
    }

    if (type === 'warranty_claim_update') {
      if (!adminCan(ctx, 'warranty', 'write')) {
        return Response.json({ success: false, message: 'Permission denied' }, { status: 403, headers });
      }
      const { claim_id, status, resolution = '', admin_notes = '' } = body as any;
      const validStatuses = ['open', 'in_review', 'approved', 'rejected', 'resolved'];
      if (!claim_id || !validStatuses.includes(status)) {
        return Response.json({ success: false, message: 'claim_id and a valid status required' }, { status: 400, headers });
      }
      const updates: Record<string, unknown> = { status, resolution, admin_notes, updated_at: new Date().toISOString() };
      if (status === 'resolved' || status === 'rejected') {
        updates.resolved_by = ctx.id;
        updates.resolved_at = new Date().toISOString();
      }
      const { error } = await db.from('warranty_claims').update(updates).eq('id', claim_id);
      if (error) return Response.json({ success: false, message: error.message }, { status: 500, headers });

      await db.from('admin_audit_logs').insert({
        admin_id: ctx.id, admin_email: ctx.email, action: 'warranty_claim_update',
        resource: 'warranty', resource_id: claim_id, metadata: { status, resolution },
        created_at: new Date().toISOString(),
      });

      return Response.json({ success: true }, { headers });
    }

    // ══════════════════════════════════════════════
    // PHASE 7 — PRODUCT SKU MANAGEMENT
    // ══════════════════════════════════════════════
    if (type === 'product_sku_list') {
      if (!adminCan(ctx, 'product_skus', 'read')) {
        return Response.json({ success: false, message: 'Permission denied' }, { status: 403, headers });
      }
      const { data, error } = await db.from('product_skus').select('*').order('sort_order', { ascending: true });
      if (error) return Response.json({ success: false, message: error.message }, { status: 500, headers });
      return Response.json({ success: true, skus: data || [] }, { headers });
    }

    if (type === 'product_sku_upsert') {
      if (!adminCan(ctx, 'product_skus', 'write')) {
        return Response.json({ success: false, message: 'Permission denied' }, { status: 403, headers });
      }
      const { id = null, sku, name, material, description = '', price, image_url = null, sort_order = 0 } = body as any;
      if (!sku || !name || !material || price == null) {
        return Response.json({ success: false, message: 'sku, name, material and price required' }, { status: 400, headers });
      }
      const row = { sku, name, material, description, price, image_url, sort_order, updated_at: new Date().toISOString() };
      const { data, error } = id
        ? await db.from('product_skus').update(row).eq('id', id).select().maybeSingle()
        : await db.from('product_skus').insert({ ...row, created_by: ctx.id }).select().maybeSingle();
      if (error) return Response.json({ success: false, message: error.message }, { status: 500, headers });

      await db.from('admin_audit_logs').insert({
        admin_id: ctx.id, admin_email: ctx.email, action: id ? 'product_sku_updated' : 'product_sku_created',
        resource: 'product_skus', resource_id: (data as any)?.id, metadata: { sku, name, price },
        created_at: new Date().toISOString(),
      });

      return Response.json({ success: true, sku: data }, { headers });
    }

    if (type === 'product_sku_toggle') {
      if (!adminCan(ctx, 'product_skus', 'write')) {
        return Response.json({ success: false, message: 'Permission denied' }, { status: 403, headers });
      }
      const { id, is_active } = body as any;
      if (!id || typeof is_active !== 'boolean') {
        return Response.json({ success: false, message: 'id and is_active (boolean) required' }, { status: 400, headers });
      }
      const { error } = await db.from('product_skus').update({ is_active, updated_at: new Date().toISOString() }).eq('id', id);
      if (error) return Response.json({ success: false, message: error.message }, { status: 500, headers });

      await db.from('admin_audit_logs').insert({
        admin_id: ctx.id, admin_email: ctx.email, action: is_active ? 'product_sku_activated' : 'product_sku_deactivated',
        resource: 'product_skus', resource_id: id, created_at: new Date().toISOString(),
      });

      return Response.json({ success: true }, { headers });
    }

    // ══════════════════════════════════════════════
    // PHASE 7 — LIVE OPERATIONS HEALTH
    // Aggregates existing signals only (error_logs, webhook_events,
    // ai_call_screenings, rtc_call_attempts/rtc_presence_events,
    // renewal_engine_logs) plus the existing health-check Edge Function
    // (reused via internal fetch, not duplicated) — every field here
    // reads a table or function that already existed pre-Phase-7.
    // ══════════════════════════════════════════════
    if (type === 'operations_health') {
      if (!adminCan(ctx, 'system', 'read')) {
        return Response.json({ success: false, message: 'Permission denied' }, { status: 403, headers });
      }
      const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

      const [
        edgeHealthRes, errorLogsRes, errorCountRes, webhookFailRes,
        aiScreeningsRes, rtcAttemptsRes, rtcPresenceRes, renewalLogRes,
      ] = await Promise.all([
        // Reuse the existing public health-check function instead of
        // re-implementing its dependency checks here.
        fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/health-check`)
          .then((r) => r.json()).catch(() => null),
        db.from('error_logs').select('id, level, category, message, created_at').order('created_at', { ascending: false }).limit(15),
        db.from('error_logs').select('level', { count: 'exact', head: false }).gte('created_at', since24h),
        db.from('webhook_events').select('id', { count: 'exact', head: true }).eq('status', 'failed').gte('created_at', since24h),
        db.from('ai_call_screenings').select('confidence', { count: 'exact', head: false }).gte('created_at', since24h),
        db.from('rtc_call_attempts').select('outcome, fallback_triggered').gte('created_at', since24h),
        db.from('rtc_presence_events').select('event_type', { count: 'exact', head: false }).gte('created_at', since24h),
        db.from('renewal_engine_logs').select('*').order('run_at', { ascending: false }).limit(5),
      ]);

      const errorCounts = { warn: 0, error: 0, fatal: 0 };
      for (const row of (errorCountRes.data || []) as any[]) {
        if (row.level in errorCounts) (errorCounts as any)[row.level]++;
      }

      const aiRows = (aiScreeningsRes.data || []) as any[];
      const aiAvgConfidence = aiRows.length
        ? aiRows.reduce((sum, r) => sum + Number(r.confidence || 0), 0) / aiRows.length
        : null;

      const rtcRows = (rtcAttemptsRes.data || []) as any[];
      const rtcSuccess = rtcRows.filter((r) => r.outcome === 'connected' || r.outcome === 'answered').length;
      const rtcFallbacks = rtcRows.filter((r) => r.fallback_triggered).length;

      return Response.json({
        success: true,
        health: {
          edgeFunctions: edgeHealthRes || { status: 'unknown', note: 'health-check function unreachable' },
          errors: { last24h: errorCounts, recent: errorLogsRes.data || [] },
          integrations: { webhookFailures24h: webhookFailRes.count || 0 },
          ai: { screenings24h: aiRows.length, avgConfidence: aiAvgConfidence },
          realtime: {
            callAttempts24h: rtcRows.length, successfulCalls24h: rtcSuccess,
            fallbacksTriggered24h: rtcFallbacks, presenceEvents24h: rtcPresenceRes.count || 0,
          },
          backgroundJobs: { renewalEngine: renewalLogRes.data || [] },
          timestamp: new Date().toISOString(),
        },
      }, { headers });
    }

    // ══════════════════════════════════════════════
    // PHASE 7 — BACKUP & RECOVERY
    // Exports critical tables as a single JSON snapshot to the
    // 'backup-snapshots' storage bucket and logs the run. This is an
    // app-data export/restore aid, not a substitute for Supabase's
    // infra-level Postgres backups (not reachable from an Edge Function).
    // ══════════════════════════════════════════════
    if (type === 'backup_list') {
      if (!adminCan(ctx, 'backup', 'read') && !adminCan(ctx, '*', 'read')) {
        return Response.json({ success: false, message: 'Permission denied' }, { status: 403, headers });
      }
      const { data, error } = await db.from('backup_snapshots').select('*').order('created_at', { ascending: false }).limit(20);
      if (error) return Response.json({ success: false, message: error.message }, { status: 500, headers });
      return Response.json({ success: true, backups: data || [] }, { headers });
    }

    if (type === 'backup_trigger') {
      if (!adminCan(ctx, 'backup', 'write') && !adminCan(ctx, '*', 'write')) {
        return Response.json({ success: false, message: 'Permission denied' }, { status: 403, headers });
      }
      const BACKUP_TABLES = [
        'users', 'plates', 'orders', 'subscriptions', 'manufacturing',
        'inventory_items', 'support_tickets', 'admin_users', 'product_skus', 'warranties',
      ];

      const { data: run, error: runErr } = await db.from('backup_snapshots').insert({
        snapshot_type: 'manual', tables_included: BACKUP_TABLES, status: 'running', triggered_by: ctx.id,
      }).select().maybeSingle();
      if (runErr || !run) return Response.json({ success: false, message: runErr?.message || 'Could not start backup' }, { status: 500, headers });

      try {
        const snapshot: Record<string, unknown> = {};
        const rowCounts: Record<string, number> = {};
        for (const table of BACKUP_TABLES) {
          const { data: rows, error: tblErr } = await db.from(table).select('*').limit(5000);
          if (tblErr) throw new Error(`${table}: ${tblErr.message}`);
          snapshot[table] = rows || [];
          rowCounts[table] = (rows || []).length;
        }

        const path = `snapshots/${(run as any).id}.json`;
        const { error: uploadErr } = await db.storage.from('backup-snapshots').upload(
          path, new Blob([JSON.stringify(snapshot)], { type: 'application/json' }), { upsert: true },
        );
        if (uploadErr) throw new Error(uploadErr.message);

        await db.from('backup_snapshots').update({
          status: 'completed', storage_path: path, row_counts: rowCounts, completed_at: new Date().toISOString(),
        }).eq('id', (run as any).id);

        await db.from('admin_audit_logs').insert({
          admin_id: ctx.id, admin_email: ctx.email, action: 'backup_triggered',
          resource: 'backup', resource_id: (run as any).id, metadata: { tables: BACKUP_TABLES, rowCounts },
          created_at: new Date().toISOString(),
        });

        return Response.json({ success: true, backup_id: (run as any).id, rowCounts }, { headers });
      } catch (backupErr) {
        await db.from('backup_snapshots').update({
          status: 'failed', error_message: String(backupErr), completed_at: new Date().toISOString(),
        }).eq('id', (run as any).id);
        return Response.json({ success: false, message: `Backup failed: ${String(backupErr)}` }, { status: 500, headers });
      }
    }

    return Response.json({ success: false, message: `Unknown type: ${type}` }, { status: 400, headers });

  } catch (err) {
    console.error('[admin-data] Unexpected error:', err);
    return Response.json({ success: false, message: 'Server error. Please try again.' }, { status: 500, headers });
  }
});
