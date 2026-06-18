/**
 * Smart Door — Admin Support Service
 * services/support.js
 *
 * Ticket management, assignment, internal notes.
 */

import { supabase } from './supabase.js';
import { adminAuditLog } from './admin.js';

// ────────── TICKET STATUS/PRIORITY LABELS ──────────

export const TICKET_STATUS = {
  open:     { label: 'Open',     color: '#EF4444', bg: 'rgba(239,68,68,0.1)' },
  pending:  { label: 'Pending',  color: '#F59E0B', bg: 'rgba(245,158,11,0.1)' },
  resolved: { label: 'Resolved', color: '#10B981', bg: 'rgba(16,185,129,0.1)' },
  closed:   { label: 'Closed',   color: '#6B7280', bg: 'rgba(107,114,128,0.1)' },
};

export const TICKET_PRIORITY = {
  low:      { label: 'Low',      color: '#6B7280' },
  medium:   { label: 'Medium',   color: '#3B82F6' },
  high:     { label: 'High',     color: '#F59E0B' },
  critical: { label: 'Critical', color: '#EF4444' },
};

export const TICKET_CATEGORIES = [
  'general', 'billing', 'technical', 'delivery', 'qr', 'account'
];

// ────────── LIST TICKETS ──────────

export async function listTickets({ status = null, assignedTo = null, limit = 50, offset = 0 } = {}) {
  try {
    let qb = supabase
      .from('support_tickets')
      .select(`
        *,
        admin_users!assigned_to(id, full_name, email)
      `, { count: 'exact' })
      .range(offset, offset + limit - 1)
      .order('created_at', { ascending: false });

    if (status) qb = qb.eq('status', status);
    if (assignedTo) qb = qb.eq('assigned_to', assignedTo);

    const { data, error, count } = await qb;
    if (error) return { success: false, error: error.message };

    return { success: true, tickets: data || [], total: count || 0 };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

// ────────── GET TICKET DETAIL ──────────

export async function getTicketDetail(ticketId) {
  try {
    const [ticketRes, commentsRes] = await Promise.all([
      supabase
        .from('support_tickets')
        .select(`*, admin_users!assigned_to(id, full_name, email)`)
        .eq('id', ticketId)
        .single(),
      supabase
        .from('ticket_comments')
        .select(`*, admin_users!admin_id(id, full_name, email)`)
        .eq('ticket_id', ticketId)
        .order('created_at', { ascending: true }),
    ]);

    if (ticketRes.error) return { success: false, error: ticketRes.error.message };

    return {
      success: true,
      ticket: ticketRes.data,
      comments: commentsRes.data || [],
    };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

// ────────── CREATE TICKET ──────────

export async function createTicket(ticketData) {
  try {
    // Generate ticket number
    const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const { count } = await supabase
      .from('support_tickets')
      .select('id', { count: 'exact', head: true })
      .gte('created_at', new Date().toISOString().slice(0, 10));

    const ticketNumber = `TKT-${today}-${String((count || 0) + 1).padStart(4, '0')}`;

    const { data, error } = await supabase
      .from('support_tickets')
      .insert({ ...ticketData, ticket_number: ticketNumber })
      .select()
      .single();

    if (error) return { success: false, error: error.message };

    await adminAuditLog('ticket_created', 'support', data.id, {}, ticketData, `Ticket ${ticketNumber} created`);
    return { success: true, ticket: data };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

// ────────── UPDATE TICKET ──────────

export async function updateTicket(ticketId, updates) {
  try {
    const { data: before } = await supabase.from('support_tickets').select('*').eq('id', ticketId).single();

    if (updates.status === 'resolved' && !updates.resolved_at) {
      updates.resolved_at = new Date().toISOString();
    }

    const { data, error } = await supabase
      .from('support_tickets')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', ticketId)
      .select()
      .single();

    if (error) return { success: false, error: error.message };

    await adminAuditLog('ticket_updated', 'support', ticketId, before, data);
    return { success: true, ticket: data };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

// ────────── ADD COMMENT / INTERNAL NOTE ──────────

export async function addTicketComment(ticketId, adminId, content, isInternal = true) {
  try {
    const { data, error } = await supabase
      .from('ticket_comments')
      .insert({ ticket_id: ticketId, admin_id: adminId, content, is_internal: isInternal })
      .select()
      .single();

    if (error) return { success: false, error: error.message };

    // Update ticket updated_at
    await supabase.from('support_tickets')
      .update({ updated_at: new Date().toISOString() })
      .eq('id', ticketId);

    return { success: true, comment: data };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

// ────────── TICKET STATS ──────────

export async function getTicketStats() {
  try {
    const { data } = await supabase.from('support_tickets').select('status, priority');
    const stats = { open: 0, pending: 0, resolved: 0, closed: 0, critical: 0 };
    (data || []).forEach(t => {
      if (stats[t.status] !== undefined) stats[t.status]++;
      if (t.priority === 'critical') stats.critical++;
    });
    return { success: true, stats };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

// ────────── GET ADMIN AGENTS (for assignment dropdown) ──────────

export async function getSupportAgents() {
  try {
    const { data, error } = await supabase
      .from('admin_users')
      .select('id, full_name, email, admin_roles!role_id(name, label)')
      .eq('is_active', true)
      .in('admin_roles.name', ['super_admin', 'ops_manager', 'support']);

    if (error) return { success: false, error: error.message };
    return { success: true, agents: data || [] };
  } catch (err) {
    return { success: false, error: err.message };
  }
}
