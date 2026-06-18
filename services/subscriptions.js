/**
 * Smart Door — Subscriptions Service
 * services/subscriptions.js
 */

import { supabase } from './supabase.js';

const PLANS = {
  starter:  { name: 'Starter Suite',  price: 999,  features: ['1 Plate', 'AI Receptionist', 'Visitor Logs', '5 Family Members'] },
  standard: { name: 'Standard Fleet', price: 1999, features: ['3 Plates', 'All Starter Features', 'Voice Notes', 'Analytics'] },
  scale:    { name: 'Scale Mesh',     price: 2999, features: ['10 Plates', 'All Standard Features', 'Priority Support', 'API Access'] },
};

// ────────── GET SUBSCRIPTION ──────────
export async function getSubscription(ownerId) {
  const { data, error } = await supabase
    .from('subscriptions')
    .select('*')
    .eq('owner_id', ownerId)
    .eq('status', 'active')
    .single();

  if (error) return { success: false, error: error.message };

  const plan = PLANS[data.plan] || PLANS.starter;
  const expiryDate = new Date(data.expiry_date);
  const daysLeft = Math.max(0, Math.ceil((expiryDate - Date.now()) / (1000 * 60 * 60 * 24)));

  return {
    success: true,
    subscription: {
      ...data,
      planName: plan.name,
      planPrice: plan.price,
      features: plan.features,
      daysLeft,
      isExpired: daysLeft === 0,
    },
  };
}

// ────────── INITIATE RAZORPAY RENEWAL ──────────
export async function initiateRenewal(ownerId, planKey) {
  const plan = PLANS[planKey];
  if (!plan) return { success: false, error: 'Invalid plan.' };

  // In production: call your backend/Edge Function to create Razorpay order
  // Edge function returns: { orderId, amount, currency, key }
  const { data, error } = await supabase.functions.invoke('create-razorpay-order', {
    body: { owner_id: ownerId, plan: planKey, amount: plan.price * 100 },
  });

  if (error) return { success: false, error: error.message };
  return { success: true, order: data };
}

// ────────── VERIFY PAYMENT + UPDATE SUBSCRIPTION ──────────
export async function verifyAndActivate(ownerId, { razorpayPaymentId, razorpayOrderId, razorpaySignature, plan }) {
  const { data, error } = await supabase.functions.invoke('verify-razorpay-payment', {
    body: { owner_id: ownerId, razorpay_payment_id: razorpayPaymentId, razorpay_order_id: razorpayOrderId, razorpay_signature: razorpaySignature, plan },
  });

  if (error || !data?.success) {
    return { success: false, error: data?.message || 'Payment verification failed.' };
  }
  return { success: true };
}

export { PLANS };
