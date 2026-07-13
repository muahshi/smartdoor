/**
 * Smart Door — Subscription Activation Service (Extended)
 * services/subscriptions.js
 *
 * Phase 6 additions:
 * - activateFromOrder()  → Order delivery ke baad auto-activate
 * - getRenewalInfo()     → Dashboard ke liye renewal details
 * - getDashboardCommerceData() → Sub + Order combined data
 *
 * Existing functions UNCHANGED — additive only.
 */

import { supabase } from './supabase.js';

const PLANS = {
  hardware_only:   { name: 'Hardware Only',   price: 0,   renewal_price: 0,   features: ['1 Plate', 'Basic Visitor Log', 'QR Access'] },
  smartdoor_care:  { name: 'SmartDoor Care',  price: 299, renewal_price: 299, features: ['1 Plate', 'AI Receptionist', 'Visitor Logs', '5 Family Members', 'Voice Notes', 'Analytics', 'Priority Support'] },
  // ────────── [NEW — SaaS Launch] 3-tier plan names, kept in sync with
  // plan_catalog (sql/46_saas_billing_schema.sql). This local copy exists
  // only so getSubscription()/getRenewalInfo() below can render a name/
  // price/feature-list synchronously without an extra network round trip;
  // services/plans.js's getPlanCatalog() remains the source of truth for
  // anything price-sensitive (checkout, pricing page). ──────────
  free:        { name: 'Free',       price: 0,   renewal_price: 0,   features: ['30 calls/mo', '7-day history', '20 photos/mo', '2 family members'] },
  premium:     { name: 'Premium',    price: 299, renewal_price: 299, features: ['500 calls/mo', '90-day history', 'AI Receptionist', 'Analytics', '5 family members', 'Priority Support'] },
  enterprise:  { name: 'Enterprise', price: 9999, renewal_price: 9999, features: ['Unlimited calls', '365-day history', 'AI Receptionist', 'Analytics', '20 family members', 'Dedicated Support'] },
};

// ────────── GET SUBSCRIPTION (UNCHANGED) ──────────
export async function getSubscription(ownerId) {
  const { data, error } = await supabase
    .from('subscriptions')
    .select('*')
    .eq('owner_id', ownerId)
    .eq('status', 'active')
    .maybeSingle(); // FIX: was .single() — 0 active-subscription rows is a
                    // normal state (e.g. hardware_only owners), not an error.
                    // .single() forces a 406 from PostgREST in that case.

  if (error) return { success: false, error: error.message };
  if (!data) return { success: false, error: 'No active subscription.' };

  const plan       = PLANS[data.plan] || PLANS.hardware_only;
  const expiryDate = new Date(data.expiry_date);
  const daysLeft   = Math.max(0, Math.ceil((expiryDate - Date.now()) / (1000 * 60 * 60 * 24)));

  return {
    success: true,
    subscription: {
      ...data,
      planName:  plan.name,
      planPrice: plan.price,
      features:  plan.features,
      daysLeft,
      isExpired: daysLeft === 0,
    },
  };
}

// ────────── INITIATE RAZORPAY RENEWAL (UNCHANGED) ──────────
export async function initiateRenewal(ownerId, planKey) {
  const plan = PLANS[planKey];
  if (!plan) return { success: false, error: 'Invalid plan.' };

  const { data, error } = await supabase.functions.invoke('create-razorpay-order', {
    body: { owner_id: ownerId, plan: planKey, amount: plan.price * 100 },
  });

  if (error) return { success: false, error: error.message };
  return { success: true, order: data };
}

// ────────── VERIFY PAYMENT + UPDATE SUBSCRIPTION (UNCHANGED) ──────────
export async function verifyAndActivate(ownerId, { razorpayPaymentId, razorpayOrderId, razorpaySignature, plan }) {
  const { data, error } = await supabase.functions.invoke('verify-razorpay-payment', {
    body: { owner_id: ownerId, razorpay_payment_id: razorpayPaymentId, razorpay_order_id: razorpayOrderId, razorpay_signature: razorpaySignature, plan },
  });

  if (error || !data?.success) {
    return { success: false, error: data?.message || 'Payment verification failed.' };
  }
  return { success: true };
}

// ────────── [NEW] ACTIVATE FROM ORDER ──────────
/**
 * Order delivery ke baad automatically subscription activate karta hai.
 * Edge Function 'activate-subscription' se invoke hota hai.
 *
 * @param {string} ownerId
 * @param {string} orderId
 * @param {string} plateId   - SD-ABX9K7
 * @param {string} plan      - Default 'hardware_only'
 */
export async function activateFromOrder(ownerId, orderId, plateId, plan = 'hardware_only') {
  try {
    const startDate  = new Date();
    const expiryDate = new Date(startDate);
    expiryDate.setFullYear(expiryDate.getFullYear() + 1);

    const { data: existing } = await supabase
      .from('subscriptions')
      .select('id')
      .eq('owner_id', ownerId)
      .eq('status', 'active')
      .maybeSingle(); // FIX: was .single() — first-time activation has no
                      // existing row yet, which is the expected path here.

    if (existing) {
      const { error } = await supabase
        .from('subscriptions')
        .update({ expiry_date: expiryDate.toISOString(), plan, updated_at: startDate.toISOString() })
        .eq('id', existing.id);
      if (error) return { success: false, error: error.message };
    } else {
      const { error } = await supabase
        .from('subscriptions')
        .insert({
          owner_id:      ownerId,
          plan,
          status:        'active',
          start_date:    startDate.toISOString(),
          expiry_date:   expiryDate.toISOString(),
          renewal_price: PLANS[plan]?.renewal_price ?? 0,
        });
      if (error) return { success: false, error: error.message };
    }

    // Plate activate karo
    await supabase
      .from('plates')
      .update({ status: 'active', activation_date: startDate.toISOString(), expiry_date: expiryDate.toISOString() })
      .eq('plate_id', plateId);

    return { success: true, startDate: startDate.toISOString(), expiryDate: expiryDate.toISOString(), plan };

  } catch (err) {
    console.error('[Subscriptions] activateFromOrder error:', err);
    return { success: false, error: err.message };
  }
}

// ────────── [NEW] GET RENEWAL INFO ──────────
export async function getRenewalInfo(ownerId) {
  const subResult = await getSubscription(ownerId);

  if (!subResult.success) {
    return { success: true, status: 'no_subscription', message: 'No active subscription.' };
  }

  const sub         = subResult.subscription;
  const expiryDate  = new Date(sub.expiry_date);
  const cycleLabel  = sub.billing_cycle === 'monthly' ? 'month' : 'year';
  const renewalText = `₹${sub.planPrice || 0}/${cycleLabel} · Renews ${_formatDate(expiryDate)}`;

  return {
    success:     true,
    status:      sub.daysLeft > 30 ? 'active' : sub.daysLeft > 0 ? 'expiring_soon' : 'expired',
    planName:    sub.planName,
    planKey:     sub.plan,
    planPrice:   sub.planPrice,
    billingCycle: sub.billing_cycle || 'yearly',
    cancelAtPeriodEnd: sub.cancel_at_period_end || false,
    daysLeft:    sub.daysLeft,
    expiryDate:  expiryDate.toISOString(),
    renewalText,
    features:    sub.features,
    isExpired:   sub.isExpired,
  };
}

// ────────── [NEW] GET COMBINED DASHBOARD DATA ──────────
export async function getDashboardCommerceData(ownerId) {
  const [renewalResult, orderResult] = await Promise.allSettled([
    getRenewalInfo(ownerId),
    import('./orders.js').then(m => m.getOrderSummary(ownerId)),
  ]);

  const renewal = renewalResult.status === 'fulfilled' ? renewalResult.value : null;
  const order   = orderResult.status   === 'fulfilled' ? orderResult.value   : null;

  return {
    success:      true,
    subscription: renewal,
    order:        order?.summary || null,
  };
}

// ────────── HELPER ──────────
function _formatDate(date) {
  return date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

// ══════════════════════════════════════════════════════════════
// [NEW — SaaS Launch] Subscription Plans, Billing, Dashboard actions
// Additive only — everything above this line is unchanged.
// ══════════════════════════════════════════════════════════════

/**
 * Starts a paid plan purchase/upgrade (Premium or Enterprise, monthly or
 * yearly). Creates a Razorpay order + pending invoice via the
 * create-subscription-order Edge Function. Caller opens Razorpay Checkout
 * with the returned order, then calls verifySubscriptionPayment() on
 * success.
 *
 * For downgrading to Free, use downgradeToFree() instead — no payment step.
 */
export async function changePlan(ownerId, planKey, billingCycle = 'yearly') {
  const { data, error } = await supabase.functions.invoke('create-subscription-order', {
    body: { ownerId, planKey, billingCycle },
  });
  if (error) return { success: false, error: error.message };
  if (!data?.success) return { success: false, error: data?.message || 'Could not start checkout.' };
  return { success: true, ...data };
}

/** Verifies a Razorpay payment for a plan purchase/upgrade and activates it. */
export async function verifySubscriptionPayment(ownerId, { invoiceId, razorpayPaymentId, razorpayOrderId, razorpaySignature }) {
  const { data, error } = await supabase.functions.invoke('verify-subscription-payment', {
    body: { ownerId, invoiceId, razorpayPaymentId, razorpayOrderId, razorpaySignature },
  });
  if (error) return { success: false, error: error.message };
  if (!data?.success) return { success: false, error: data?.message || 'Payment verification failed.' };
  return { success: true, ...data };
}

/** Immediately moves the owner to the Free plan — no payment involved. */
export async function downgradeToFree(ownerId) {
  const { data, error } = await supabase.functions.invoke('manage-subscription', {
    body: { ownerId, action: 'downgrade' },
  });
  if (error) return { success: false, error: error.message };
  return data?.success ? { success: true, ...data } : { success: false, error: data?.message || 'Downgrade failed.' };
}

/** Schedules cancellation — current paid plan stays active until expiry_date, then auto-moves to Free. */
export async function cancelSubscription(ownerId) {
  const { data, error } = await supabase.functions.invoke('manage-subscription', {
    body: { ownerId, action: 'cancel' },
  });
  if (error) return { success: false, error: error.message };
  return data?.success ? { success: true, ...data } : { success: false, error: data?.message || 'Could not cancel.' };
}

/** Reverses a scheduled cancellation. */
export async function reactivateSubscription(ownerId) {
  const { data, error } = await supabase.functions.invoke('manage-subscription', {
    body: { ownerId, action: 'reactivate' },
  });
  if (error) return { success: false, error: error.message };
  return data?.success ? { success: true, ...data } : { success: false, error: data?.message || 'Could not reactivate.' };
}

export { PLANS };
