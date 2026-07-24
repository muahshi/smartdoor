/**
 * My Smart Door — Invoices Service
 * services/invoices.js
 *
 * SaaS Launch — Subscription Dashboard: Invoices / Payment History.
 * Reads directly from the `invoices` table (owner-scoped RLS —
 * sql/46_saas_billing_schema.sql), same pattern as services/payments.js's
 * getPaymentLogs() for the hardware checkout flow.
 *
 * Phase 8B — GST Billing & Invoicing Platform (sql/58_gst_billing_phase8b.sql)
 * extends the SAME `invoices` table with GST fields + an `order_id` link so
 * hardware-plate sales also get a row here. This file gained:
 *   - GST columns in getInvoices()'s select list
 *   - getInvoiceForPdf() for the download portal
 *   - getGstSettings() — public company/GST config for the invoice letterhead
 *   - formatInvoiceType() for credit/debit note badges
 */

import { supabase } from './supabase.js';

export async function getInvoices(ownerId, { limit = 20 } = {}) {
  const { data, error } = await supabase
    .from('invoices')
    .select(`
      id, invoice_number, invoice_type, plan, billing_cycle, amount, currency, status,
      period_start, period_end, razorpay_payment_id, refund_amount, created_at,
      order_id, taxable_value, cgst_amount, sgst_amount, igst_amount, invoice_total,
      reference_invoice_id, approval_status
    `)
    .eq('owner_id', ownerId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) return { success: false, error: error.message };
  return { success: true, invoices: data || [] };
}

// ────────── FULL INVOICE DETAIL (for PDF rendering / download portal) ──────────
/**
 * Fetches everything needed to render a printable GST invoice: the invoice
 * row itself, plus (for hardware sales) the linked order for extra line
 * detail. RLS already restricts this to the invoice's own owner_id, same as
 * getInvoices() — no separate Edge Function needed for the owner-facing path.
 *
 * @param {string} invoiceId
 */
export async function getInvoiceForPdf(invoiceId) {
  const { data: invoice, error } = await supabase
    .from('invoices')
    .select('*')
    .eq('id', invoiceId)
    .single();

  if (error || !invoice) return { success: false, error: error?.message || 'Invoice not found' };

  let order = null;
  if (invoice.order_id) {
    const { data: orderData } = await supabase
      .from('orders')
      .select('order_number, product_type, shipping_address, customer_name, customer_email, customer_phone')
      .eq('id', invoice.order_id)
      .maybeSingle();
    order = orderData || null;
  }

  const settingsResult = await getGstSettings();

  return {
    success:  true,
    invoice,
    order,
    gstSettings: settingsResult.success ? settingsResult.settings : null,
  };
}

// ────────── GST SETTINGS (public — printed on every invoice letterhead) ──────────
export async function getGstSettings() {
  const { data, error } = await supabase
    .from('gst_settings')
    .select('*')
    .eq('id', 1)
    .maybeSingle();

  if (error) return { success: false, error: error.message };
  return { success: true, settings: data };
}

export function formatInvoiceStatus(status) {
  const map = {
    paid:      { label: 'Paid',      color: '#22C55E' },
    pending:   { label: 'Pending',   color: '#F59E0B' },
    failed:    { label: 'Failed',    color: '#EF4444' },
    refunded:  { label: 'Refunded',  color: '#94A3B8' },
    cancelled: { label: 'Cancelled', color: '#94A3B8' },
    issued:    { label: 'Issued',    color: '#22C55E' },
  };
  return map[status] || { label: status, color: '#94A3B8' };
}

export function formatInvoiceType(invoiceType) {
  const map = {
    tax_invoice: { label: 'Tax Invoice', color: '#00A2E8' },
    credit_note: { label: 'Credit Note', color: '#F59E0B' },
    debit_note:  { label: 'Debit Note',  color: '#EF4444' },
  };
  return map[invoiceType] || { label: invoiceType || 'Tax Invoice', color: '#94A3B8' };
}
