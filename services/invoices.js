/**
 * Smart Door — Invoices Service
 * services/invoices.js
 *
 * SaaS Launch — Subscription Dashboard: Invoices / Payment History.
 * Reads directly from the `invoices` table (owner-scoped RLS —
 * sql/46_saas_billing_schema.sql), same pattern as services/payments.js's
 * getPaymentLogs() for the hardware checkout flow.
 */

import { supabase } from './supabase.js';

export async function getInvoices(ownerId, { limit = 20 } = {}) {
  const { data, error } = await supabase
    .from('invoices')
    .select('id, invoice_number, plan, billing_cycle, amount, currency, status, period_start, period_end, razorpay_payment_id, refund_amount, created_at')
    .eq('owner_id', ownerId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) return { success: false, error: error.message };
  return { success: true, invoices: data || [] };
}

export function formatInvoiceStatus(status) {
  const map = {
    paid:      { label: 'Paid',      color: '#22C55E' },
    pending:   { label: 'Pending',   color: '#F59E0B' },
    failed:    { label: 'Failed',    color: '#EF4444' },
    refunded:  { label: 'Refunded',  color: '#94A3B8' },
    cancelled: { label: 'Cancelled', color: '#94A3B8' },
  };
  return map[status] || { label: status, color: '#94A3B8' };
}
