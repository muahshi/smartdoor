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
  starter:  { name: 'Starter Suite',  price: 999,  features: ['1 Plate', 'AI Receptionist', 'Visitor Logs', '5 Family Members'] },
  standard: { name: 'Standard Fleet', price: 1999, features: ['3 Plates', 'All Starter Features', 'Voice Notes', 'Analytics'] },
  scale:    { name: 'Scale Mesh',     price: 2999, features: ['10 Plates', 'All Standard Features', 'Priority Support', 'API Access'] },
};

// ────────── GET SUBSCRIPTION (UNCHANGED) ──────────
export async function getSubscription(ownerId) {
  const { data, error } = await supabase
    .from('subscriptions')
    .select('*')
    .eq('owner_id', ownerId)
    .eq('status', 'active')
    .single();

  if (error) return { success: false, error: error.message };

  const plan       = PLANS[data.plan] || PLANS.starter;
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
 * @param {string} plan      - Default 'starter'
 */
export async function activateFromOrder(ownerId, orderId, plateId, plan = 'starter') {
  try {
    const startDate  = new Date();
    const expiryDate = new Date(startDate);
    expiryDate.setFullYear(expiryDate.getFullYear() + 1);

    const { data: existing } = await supabase
      .from('subscriptions')
      .select('id')
      .eq('owner_id', ownerId)
      .eq('status', 'active')
      .single();

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
          renewal_price: PLANS[plan]?.price || 999,
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
  const renewalText = `₹${sub.planPrice || 999}/year · Renews ${_formatDate(expiryDate)}`;

  return {
    success:     true,
    status:      sub.daysLeft > 30 ? 'active' : sub.daysLeft > 0 ? 'expiring_soon' : 'expired',
    planName:    sub.planName,
    planKey:     sub.plan,
    planPrice:   sub.planPrice,
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

export { PLANS };
