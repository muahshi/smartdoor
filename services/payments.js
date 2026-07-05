/**
 * Smart Door — Payments Service (Razorpay)
 * services/payments.js
 *
 * Sabhi payment operations yahan se handle hoti hain.
 * Frontend → Razorpay SDK → verifyAndCapture → Supabase
 *
 * NOTE: Razorpay order creation aur signature verification
 * ALWAYS Supabase Edge Functions se hogi (secret key never client-side).
 * Yeh file frontend + Edge Function bridge hai.
 */

import { supabase } from './supabase.js';

// ────────── CONFIG ──────────
const RAZORPAY_KEY_ID = window.__SD_CONFIG__?.razorpayKeyId || '';

if (!RAZORPAY_KEY_ID) {
  console.warn('[Payments] Missing razorpayKeyId in SD_CONFIG');
}

// ────────── LOAD RAZORPAY SDK ──────────
/**
 * Dynamically load Razorpay checkout script.
 * Ek baar load hone ke baad re-use karta hai.
 */
export function loadRazorpaySDK() {
  return new Promise((resolve, reject) => {
    if (window.Razorpay) { resolve(true); return; }
    const script = document.createElement('script');
    script.src = 'https://checkout.razorpay.com/v1/checkout.js';
    script.onload  = () => resolve(true);
    script.onerror = () => reject(new Error('Razorpay SDK load failed'));
    document.head.appendChild(script);
  });
}

// ────────── CREATE RAZORPAY ORDER (via Edge Function) ──────────
/**
 * Server-side pe Razorpay order banata hai.
 * Returns { razorpayOrderId, amount, currency, orderId (our DB) }
 *
 * @param {object} params
 * @param {string} params.productType  - 'acrylic' | 'stainless' | 'teakwood'
 * @param {string} params.plan         - 'hardware_only' | 'smartdoor_care'
 * @param {object} params.shipping     - { line1, city, state, pincode }
 * @param {string} params.houseName    - Customer ka ghar ka naam
 * @param {string} params.houseNumber  - e.g. B-204
 * @param {string} params.fontStyle    - 'modern' | 'classic' | 'bold'
 * @param {string} params.ownerId      - (optional) existing owner
 */
export async function createRazorpayOrder(params) {
  try {
    const { data, error } = await supabase.functions.invoke('create-razorpay-order', {
      body: params,
    });

    if (error || !data?.success) {
      return { success: false, error: data?.message || error?.message || 'Order creation failed' };
    }

    return {
      success: true,
      razorpayOrderId: data.razorpayOrderId,
      amount:          data.amount,          // paise mein (e.g. 299900 = ₹2999)
      currency:        data.currency || 'INR',
      orderId:         data.orderId,         // our DB UUID
      orderNumber:     data.orderNumber,     // SD-ORD-20260618-0001
    };
  } catch (err) {
    console.error('[Payments] createRazorpayOrder error:', err);
    return { success: false, error: 'Network error. Please retry.' };
  }
}

// ────────── OPEN RAZORPAY CHECKOUT ──────────
/**
 * Razorpay checkout modal open karta hai.
 * Returns Promise<{ razorpayPaymentId, razorpayOrderId, razorpaySignature }>
 *
 * @param {object} opts
 * @param {string} opts.razorpayOrderId
 * @param {number} opts.amount         - paise mein
 * @param {string} opts.customerName
 * @param {string} opts.customerEmail
 * @param {string} opts.customerPhone
 * @param {string} opts.description    - e.g. "Smart Door Acrylic Plate"
 */
export function openRazorpayCheckout(opts) {
  return new Promise((resolve, reject) => {
    if (!window.Razorpay) {
      reject(new Error('Razorpay SDK not loaded. Call loadRazorpaySDK() first.'));
      return;
    }

    const rzp = new window.Razorpay({
      key:         RAZORPAY_KEY_ID,
      amount:      opts.amount,
      currency:    'INR',
      order_id:    opts.razorpayOrderId,
      name:        'Smart Door',
      description: opts.description || 'Smart Door QR Nameplate',
      image:       '/images/favicon-192x192.png',
      prefill: {
        name:    opts.customerName  || '',
        email:   opts.customerEmail || '',
        contact: opts.customerPhone || '',
      },
      theme: {
        color: '#00A2E8',
      },
      modal: {
        ondismiss: () => reject(new Error('Payment cancelled by user')),
      },
      handler: (response) => {
        resolve({
          razorpayPaymentId: response.razorpay_payment_id,
          razorpayOrderId:   response.razorpay_order_id,
          razorpaySignature: response.razorpay_signature,
        });
      },
    });

    rzp.open();
  });
}

// ────────── VERIFY + CAPTURE PAYMENT (via Edge Function) ──────────
/**
 * Payment signature verify karta hai aur order confirm karta hai.
 * Yahan se plate ID generate hoti hai, manufacturing queue mein jaata hai.
 *
 * @param {object} params
 * @param {string} params.orderId            - Our DB order UUID
 * @param {string} params.razorpayPaymentId
 * @param {string} params.razorpayOrderId
 * @param {string} params.razorpaySignature
 */
export async function verifyAndCapturePayment(params) {
  try {
    const { data, error } = await supabase.functions.invoke('verify-razorpay-payment', {
      body: params,
    });

    if (error || !data?.success) {
      return { success: false, error: data?.message || 'Payment verification failed' };
    }

    return {
      success:     true,
      plateId:     data.plateId,      // SD-ABX9K7
      orderNumber: data.orderNumber,
      message:     data.message || 'Payment verified. Your plate is in production!',
    };
  } catch (err) {
    console.error('[Payments] verifyAndCapture error:', err);
    return { success: false, error: 'Verification failed. Contact support.' };
  }
}

// ────────── INITIATE REFUND (via Edge Function) ──────────
/**
 * Razorpay refund initiate karta hai.
 * Only admin/service_role se call ho.
 *
 * @param {string} orderId  - Our DB order UUID
 * @param {number} amount   - Refund amount in paise (0 = full refund)
 * @param {string} reason   - Refund reason string
 */
export async function initiateRefund({ orderId, amount = 0, reason = '' }) {
  try {
    const { data, error } = await supabase.functions.invoke('razorpay-refund', {
      body: { order_id: orderId, amount, reason },
    });

    if (error || !data?.success) {
      return { success: false, error: data?.message || 'Refund failed' };
    }

    return { success: true, refundId: data.refundId, message: data.message };
  } catch (err) {
    console.error('[Payments] initiateRefund error:', err);
    return { success: false, error: 'Refund request failed. Please try again.' };
  }
}

// ────────── GET PAYMENT LOGS FOR ORDER ──────────
/**
 * Ek order ke saare payment records fetch karta hai.
 * @param {string} orderId
 */
export async function getPaymentLogs(orderId) {
  const { data, error } = await supabase
    .from('payments')
    .select('id, provider, provider_order_id, provider_payment_id, amount, currency, status, refund_id, refund_amount, created_at')
    .eq('order_id', orderId)
    .order('created_at', { ascending: false });

  if (error) return { success: false, error: error.message };
  return { success: true, payments: data || [] };
}

// ────────── CANCEL A PENDING ORDER (via Edge Function) ──────────
/**
 * Root-cause fix for the "409 on immediate retry" bug: Razorpay's checkout
 * modal has no server-side cancel callback, so without this call the order
 * row created by createRazorpayOrder() stayed 'pending' forever after the
 * customer dismissed checkout, and the very next attempt got wrongly
 * rejected as a duplicate. Fire-and-forget, best-effort — create-razorpay-order's
 * duplicate-check window is the backstop if this call itself fails
 * (offline, tab killed, etc.).
 *
 * @param {string} orderId - Our DB order UUID (from createRazorpayOrder())
 */
export async function cancelPendingOrder(orderId) {
  if (!orderId) return;
  try {
    await supabase.functions.invoke('cancel-pending-order', { body: { orderId } });
  } catch (err) {
    console.warn('[Payments] cancelPendingOrder failed (non-fatal):', err);
  }
}

// ────────── FULL CHECKOUT FLOW (convenience wrapper) ──────────
/**
 * Ek hi function mein poora checkout:
 * createOrder → openCheckout → verifyPayment
 *
 * @param {object} orderParams  - Same as createRazorpayOrder()
 * @param {object} customerInfo - { name, email, phone }
 * @returns {{ success, plateId, orderNumber, error }}
 */
export async function initiateCheckout(orderParams, customerInfo) {
  let orderResult; // hoisted so the catch block can cancel the right order
  try {
    // 1. SDK load karo
    await loadRazorpaySDK();

    // 2. Server pe order banao
    orderResult = await createRazorpayOrder({
      ...orderParams,
      customerName:  customerInfo.name,
      customerEmail: customerInfo.email,
      customerPhone: customerInfo.phone,
    });

    if (!orderResult.success) {
      return { success: false, error: orderResult.error };
    }

    // 3. Checkout modal open karo
    const paymentResult = await openRazorpayCheckout({
      razorpayOrderId: orderResult.razorpayOrderId,
      amount:          orderResult.amount,
      customerName:    customerInfo.name,
      customerEmail:   customerInfo.email,
      customerPhone:   customerInfo.phone,
      description:     `Smart Door ${orderParams.productType} Plate`,
    });

    // 4. Verify + capture
    const verifyResult = await verifyAndCapturePayment({
      orderId:           orderResult.orderId,
      razorpayPaymentId: paymentResult.razorpayPaymentId,
      razorpayOrderId:   paymentResult.razorpayOrderId,
      razorpaySignature: paymentResult.razorpaySignature,
    });

    return verifyResult;

  } catch (err) {
    // User ne modal band kiya
    if (err.message === 'Payment cancelled by user') {
      // Root cause of the "409 on immediate retry" bug: without this call,
      // this order stayed 'pending' forever and blocked the next attempt.
      await cancelPendingOrder(orderResult?.orderId);
      return { success: false, cancelled: true, error: 'Payment cancelled.' };
    }
    console.error('[Payments] initiateCheckout error:', err);
    return { success: false, error: err.message || 'Checkout failed.' };
  }
}
