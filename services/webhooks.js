/**
 * Smart Door — Razorpay Webhook Service Architecture
 * services/webhooks.js
 *
 * ──────────────────────────────────────────────────
 * DO NOT connect live Razorpay. This is architecture + integration points only.
 * Webhook routing is in: supabase/functions/razorpay-webhook/index.ts (new)
 * ──────────────────────────────────────────────────
 *
 * Razorpay sends signed POST webhooks to:
 *   https://mysmartdoor.in/api/razorpay-webhook
 *   → routed via vercel.json to the Supabase Edge Function
 *
 * Every webhook must:
 *   1. Verify HMAC-SHA256 signature using RAZORPAY_WEBHOOK_SECRET env var
 *   2. Be idempotent (check if already processed by razorpay_event_id)
 *   3. Respond with 200 within 5 seconds (else Razorpay retries up to 3x)
 *   4. Write to webhook_events table for replay/audit
 *
 * Supported events:
 *   payment.captured   → handlePaymentSuccess()
 *   subscription.charged → handleSubscriptionRenewal()
 *   refund.created     → handleRefund()
 *   payment.failed     → handlePaymentFailed()
 *   subscription.cancelled → handleSubscriptionCancelled()
 *
 * ──────────────────────────────────────────────────
 * INTEGRATION POINTS (connect when Razorpay account is ready):
 *   1. Set RAZORPAY_WEBHOOK_SECRET in Supabase Edge Function env
 *   2. Register webhook URL in Razorpay Dashboard → Webhooks
 *   3. Uncomment the live handler calls in razorpay-webhook/index.ts
 *   4. Test with Razorpay test mode first
 * ──────────────────────────────────────────────────
 */

import { supabase } from './supabase.js';
import { getAdminSession } from './admin.js';

// ────────── INTEGRATION POINT 1: Signature Verification ──────────
// This runs inside the Edge Function, not client-side.
// Placed here as architecture documentation.
export const WEBHOOK_SIGNATURE_VERIFICATION = `
  // Inside supabase/functions/razorpay-webhook/index.ts:
  const secret = Deno.env.get('RAZORPAY_WEBHOOK_SECRET');
  const body = await req.text();
  const signature = req.headers.get('x-razorpay-signature');
  const key = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  );
  const mac = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(body));
  const expected = Array.from(new Uint8Array(mac)).map(b => b.toString(16).padStart(2, '0')).join('');
  if (expected !== signature) return new Response('Invalid signature', { status: 400 });
`;

// ────────── EVENT SCHEMA ──────────
// webhook_events table (see sql/16_phase13_schema.sql):
//   id, event_id (razorpay event id), event_type, entity_id, payload JSONB,
//   processed_at, status ('pending'|'processed'|'failed'|'duplicate')

// ────────── HANDLERS ──────────

/**
 * handlePaymentSuccess()
 * Triggered by: payment.captured
 *
 * Flow:
 *   1. Extract payment entity from webhook payload
 *   2. Find matching order by razorpay_order_id (orders.razorpay_order_id)
 *   3. Update orders.payment_status = 'paid', orders.razorpay_payment_id
 *   4. Update subscriptions.status = 'active' if this was a new subscription payment
 *   5. Trigger plate activation if not already active
 *   6. Send confirmation email + WhatsApp via Edge Functions
 *   7. Log to activation_events (event_type = 'subscription_activated')
 */
export async function handlePaymentSuccess(webhookPayload) {
  // ARCHITECTURE STUB — do not call in production without Razorpay integration
  const { payment } = webhookPayload;
  const razorpayPaymentId = payment.entity.id;
  const razorpayOrderId = payment.entity.order_id;
  const amountPaid = payment.entity.amount / 100; // Razorpay amounts are in paise

  console.log('[webhooks] handlePaymentSuccess called', { razorpayPaymentId, razorpayOrderId, amountPaid });

  // INTEGRATION POINT: This logic runs server-side in razorpay-webhook Edge Function
  // Steps documented here for implementation reference:
  //
  // Step 1: Idempotency check
  //   SELECT id FROM webhook_events WHERE event_id = payment.id AND status = 'processed'
  //   → if found, return early (duplicate webhook)
  //
  // Step 2: Find order
  //   SELECT * FROM orders WHERE razorpay_order_id = razorpayOrderId
  //
  // Step 3: Update order
  //   UPDATE orders SET payment_status = 'paid', razorpay_payment_id = razorpayPaymentId,
  //     amount_paid = amountPaid, paid_at = NOW() WHERE razorpay_order_id = razorpayOrderId
  //
  // Step 4: Activate subscription
  //   UPDATE subscriptions SET status = 'active', start_date = NOW() WHERE owner_id = order.user_id
  //
  // Step 5: Activate plate
  //   UPDATE plates SET status = 'active', activation_date = NOW() WHERE owner_id = order.user_id
  //
  // Step 6: Send confirmation
  //   supabase.functions.invoke('send-email', { template: 'payment_success', ... })
  //   supabase.functions.invoke('send-whatsapp', { ... })
  //
  // Step 7: Audit
  //   INSERT INTO activation_events (event_type = 'subscription_activated', ...)
  //   INSERT INTO audit_logs (action = 'payment_verified', ...)

  return { handled: true, action: 'payment_success_stub' };
}

/**
 * handleSubscriptionRenewal()
 * Triggered by: subscription.charged
 *
 * Flow:
 *   1. Find subscription by razorpay_subscription_id
 *   2. Extend expiry by billing cycle (monthly/annual)
 *   3. Update subscriptions.expiry_date, renewal_count, last_renewed_at
 *   4. Clear any grace period flags
 *   5. Log renewal_engine event
 *   6. Send renewal confirmation to owner
 */
export async function handleSubscriptionRenewal(webhookPayload) {
  // ARCHITECTURE STUB
  const { subscription } = webhookPayload;
  const razorpaySubId = subscription.entity.id;
  const chargeAt = subscription.entity.charge_at;

  console.log('[webhooks] handleSubscriptionRenewal called', { razorpaySubId, chargeAt });

  // INTEGRATION POINT: razorpay-webhook Edge Function steps:
  //
  // Step 1: Find subscription
  //   SELECT * FROM subscriptions WHERE razorpay_subscription_id = razorpaySubId
  //
  // Step 2: Calculate new expiry
  //   const newExpiry = new Date(subscription.expiry_date);
  //   newExpiry.setMonth(newExpiry.getMonth() + 1); // or +12 for annual
  //
  // Step 3: Update subscription
  //   UPDATE subscriptions SET
  //     status = 'active',
  //     expiry_date = newExpiry,
  //     renewal_count = renewal_count + 1,
  //     last_renewed_at = NOW(),
  //     grace_period_start = NULL,
  //     grace_period_end = NULL
  //
  // Step 4: Update plate status to active (in case it was suspended for non-renewal)
  //   UPDATE plates SET status = 'active' WHERE owner_id = subscription.owner_id
  //
  // Step 5: Send renewal confirmation
  //   supabase.functions.invoke('send-email', { template: 'renewal_success', ... })
  //
  // Step 6: Log
  //   INSERT INTO activation_events (event_type = 'subscription_renewed', ...)

  return { handled: true, action: 'subscription_renewal_stub' };
}

/**
 * handleRefund()
 * Triggered by: refund.created
 *
 * Flow:
 *   1. Find payment/order by razorpay_payment_id
 *   2. Record refund in payments table
 *   3. If full refund: cancel subscription, update plate to inactive
 *   4. If partial refund: just record the amount
 *   5. Send refund confirmation email
 *   6. Log to audit_logs
 */
export async function handleRefund(webhookPayload) {
  // ARCHITECTURE STUB
  const { refund } = webhookPayload;
  const razorpayRefundId = refund.entity.id;
  const razorpayPaymentId = refund.entity.payment_id;
  const refundAmount = refund.entity.amount / 100;
  const isFullRefund = refund.entity.notes?.full_refund === 'true';

  console.log('[webhooks] handleRefund called', { razorpayRefundId, razorpayPaymentId, refundAmount, isFullRefund });

  // INTEGRATION POINT: razorpay-webhook Edge Function steps:
  //
  // Step 1: Find order/payment
  //   SELECT * FROM orders WHERE razorpay_payment_id = razorpayPaymentId
  //
  // Step 2: Record refund
  //   UPDATE payments SET
  //     refund_id = razorpayRefundId,
  //     refund_amount = refundAmount,
  //     refund_status = 'refunded',
  //     refunded_at = NOW()
  //   WHERE razorpay_payment_id = razorpayPaymentId
  //
  // Step 3: If full refund
  //   UPDATE subscriptions SET status = 'cancelled' WHERE owner_id = order.user_id
  //   UPDATE plates SET status = 'inactive' WHERE owner_id = order.user_id
  //
  // Step 4: Send refund email
  //   supabase.functions.invoke('send-email', { template: 'refund_confirmation', ... })
  //
  // Step 5: Log
  //   INSERT INTO audit_logs (action = 'refund_issued', ...)
  //   INSERT INTO admin_audit_logs (action = 'refund_issued', ...)

  return { handled: true, action: 'refund_stub' };
}

/**
 * handlePaymentFailed()
 * Triggered by: payment.failed
 *
 * Flow:
 *   1. Find order by razorpay_order_id
 *   2. Update order.payment_status = 'failed'
 *   3. Log failure for retry tracking
 *   4. Optional: send failure notification to admin
 */
export async function handlePaymentFailed(webhookPayload) {
  // ARCHITECTURE STUB
  const { payment } = webhookPayload;
  console.log('[webhooks] handlePaymentFailed called', { paymentId: payment.entity.id });

  // INTEGRATION POINT:
  //   UPDATE orders SET payment_status = 'failed', failure_reason = payment.entity.error_description
  //   INSERT INTO audit_logs (action = 'payment_failed', ...)
  //   Optional: notify admin Slack/email if repeated failures

  return { handled: true, action: 'payment_failed_stub' };
}

/**
 * handleSubscriptionCancelled()
 * Triggered by: subscription.cancelled
 *
 * Flow:
 *   1. Find subscription by razorpay_subscription_id
 *   2. Update subscriptions.status = 'cancelled'
 *   3. Start grace period (30 days) before plate suspension
 *   4. Log cancellation event
 */
export async function handleSubscriptionCancelled(webhookPayload) {
  // ARCHITECTURE STUB
  const { subscription } = webhookPayload;
  console.log('[webhooks] handleSubscriptionCancelled called', { subId: subscription.entity.id });

  // INTEGRATION POINT:
  //   UPDATE subscriptions SET
  //     status = 'cancelled',
  //     grace_period_start = NOW(),
  //     grace_period_end = NOW() + INTERVAL '30 days'
  //   WHERE razorpay_subscription_id = subscription.entity.id
  //
  //   INSERT INTO activation_events (event_type = 'subscription_cancelled', ...)
  //   → renewal-engine-cron will handle plate suspension after grace period

  return { handled: true, action: 'subscription_cancelled_stub' };
}

// ────────── WEBHOOK ROUTING TABLE ──────────
// Used by razorpay-webhook Edge Function to dispatch to correct handler
export const WEBHOOK_HANDLERS = {
  'payment.captured':         handlePaymentSuccess,
  'subscription.charged':     handleSubscriptionRenewal,
  'refund.created':           handleRefund,
  'payment.failed':           handlePaymentFailed,
  'subscription.cancelled':   handleSubscriptionCancelled,
};

// ────────── WEBHOOK EVENT LOGGER (client-facing admin view) ──────────
/**
 * Get recent webhook events for admin monitoring dashboard.
 * Requires admin session.
 */
export async function getWebhookEvents({ limit = 50, status = null } = {}) {
  const session = getAdminSession();
  if (!session) return { success: false, error: 'Not authenticated' };

  let query = supabase
    .from('webhook_events')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);

  if (status) query = query.eq('status', status);

  const { data, error } = await query;
  if (error) return { success: false, error: error.message };
  return { success: true, events: data };
}

/**
 * Replay a failed webhook event.
 * Admin-only. Calls the Edge Function directly.
 */
export async function replayWebhookEvent(eventId) {
  const session = getAdminSession();
  if (!session?.token) return { success: false, error: 'Not authenticated' };

  const { data, error } = await supabase.functions.invoke('razorpay-webhook-replay', {
    body: { event_id: eventId },
    headers: { Authorization: `Bearer ${session.token}` },
  });

  if (error) return { success: false, error: error.message };
  return data;
}
