/**
 * My Smart Door — Admin Customers Service
 * services/customers.js
 *
 * Full customer management for Admin Super Panel.
 * View, search, filter, and inspect customer profiles.
 */

import { supabase } from './supabase.js';
import { adminAuditLog } from './admin.js';

// ────────── SEARCH / LIST CUSTOMERS ──────────

export async function searchCustomers({ query = '', field = 'all', limit = 50, offset = 0 } = {}) {
  try {
    let qb = supabase
      .from('users')
      .select(`
        id, full_name, phone, email, plate_id, created_at,
        subscriptions!left(status, plan, expiry_date),
        plates!left(status, product_type),
        orders!left(id, payment_status, total_amount)
      `, { count: 'exact' })
      .range(offset, offset + limit - 1)
      .order('created_at', { ascending: false });

    if (query) {
      if (field === 'name' || field === 'all') {
        qb = qb.ilike('full_name', `%${query}%`);
      } else if (field === 'phone') {
        qb = qb.ilike('phone', `%${query}%`);
      } else if (field === 'email') {
        qb = qb.ilike('email', `%${query}%`);
      } else if (field === 'plate_id') {
        qb = qb.ilike('plate_id', `%${query}%`);
      }
    }

    const { data, error, count } = await qb;
    if (error) return { success: false, error: error.message };

    return { success: true, customers: data || [], total: count || 0 };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

// ────────── GET FULL CUSTOMER PROFILE ──────────

export async function getCustomerProfile(customerId) {
  try {
    const [
      userRes,
      ordersRes,
      subsRes,
      visitorLogsRes,
      voiceNotesRes,
      callLogsRes,
      familyRes,
      securityRes,
    ] = await Promise.all([
      supabase.from('users').select('*').eq('id', customerId).single(),
      supabase.from('orders').select('*').eq('owner_id', customerId).order('created_at', { ascending: false }),
      supabase.from('subscriptions').select('*').eq('owner_id', customerId).order('created_at', { ascending: false }),
      supabase.from('visitor_logs').select('*').eq('owner_id', customerId).order('created_at', { ascending: false }).limit(50),
      supabase.from('voice_notes').select('*').eq('owner_id', customerId).order('created_at', { ascending: false }).limit(20),
      supabase.from('call_logs').select('*').eq('owner_id', customerId).order('created_at', { ascending: false }).limit(20),
      supabase.from('family_members').select('*').eq('owner_id', customerId),
      supabase.from('security_rules').select('*').eq('owner_id', customerId),
    ]);

    if (userRes.error) return { success: false, error: userRes.error.message };

    // Phase 12 — Plate Management needs the plate row (status, QR, suspension
    // info) plus message/notification counts, alongside the existing profile data.
    let plate = null;
    let messagesCount = 0;
    let notificationsCount = 0;

    if (userRes.data?.plate_id) {
      const [plateRes, messagesRes, notificationsRes] = await Promise.all([
        supabase.from('plates').select('*').eq('plate_id', userRes.data.plate_id).maybeSingle(),
        supabase.from('message_logs').select('id', { count: 'exact', head: true }).eq('owner_id', customerId),
        supabase.from('notifications').select('id', { count: 'exact', head: true }).eq('owner_id', customerId),
      ]);
      plate = plateRes.data || null;
      messagesCount = messagesRes.count || 0;
      notificationsCount = notificationsRes.count || 0;
    }

    return {
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
      }
    };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

// ────────── UPDATE CUSTOMER ──────────

export async function updateCustomer(customerId, updates) {
  try {
    const { data: before } = await supabase.from('users').select('*').eq('id', customerId).single();

    const { data, error } = await supabase
      .from('users')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', customerId)
      .select()
      .single();

    if (error) return { success: false, error: error.message };

    await adminAuditLog('customer_update', 'customers', customerId, before, data, 'Customer profile updated');
    return { success: true, customer: data };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

// ────────── GET CUSTOMER STATS (for profile card) ──────────

export async function getCustomerStats(customerId) {
  try {
    const [ordersRes, logsRes, subRes] = await Promise.all([
      supabase.from('orders').select('total_amount, payment_status').eq('owner_id', customerId),
      supabase.from('visitor_logs').select('id', { count: 'exact' }).eq('owner_id', customerId),
      supabase.from('subscriptions').select('*').eq('owner_id', customerId).eq('status', 'active').single(),
    ]);

    const orders = ordersRes.data || [];
    const totalSpend = orders.filter(o => o.payment_status === 'paid').reduce((s, o) => s + (o.total_amount || 0), 0);

    return {
      success: true,
      stats: {
        totalOrders: orders.length,
        totalSpend,
        visitorLogCount: logsRes.count || 0,
        activeSub: subRes.data || null,
      }
    };
  } catch (err) {
    return { success: false, error: err.message };
  }
}
