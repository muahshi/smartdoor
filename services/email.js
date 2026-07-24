/**
 * My Smart Door — Email Service
 * services/email.js
 *
 * Provider: Resend (primary)
 * Future: SMTP fallback
 *
 * Yeh service ONLY Supabase Edge Functions se call hoti hai
 * (RESEND_API_KEY kabhi browser mein expose nahi hota).
 *
 * Frontend mein: supabase.functions.invoke('send-email', { body: { template, to, data } })
 * Edge Function: yeh service use karta hai direct.
 */

import { supabase } from './supabase.js';

// ────────── EMAIL TEMPLATES ──────────
export const EMAIL_TEMPLATES = {
  ORDER_CONFIRMATION:      'order_confirmation',
  PAYMENT_SUCCESS:         'payment_success',
  DISPATCH_NOTIFICATION:   'dispatch_notification',
  DELIVERY_CONFIRMATION:   'delivery_confirmation',
  SUBSCRIPTION_ACTIVATED:  'subscription_activated',
  RENEWAL_REMINDER_30:     'renewal_reminder_30',   // 30 days pehle
  RENEWAL_REMINDER_7:      'renewal_reminder_7',    // 7 days pehle
  RENEWAL_REMINDER_1:      'renewal_reminder_1',    // 1 day pehle
  SUBSCRIPTION_EXPIRED:    'subscription_expired',
};

// ────────── SEND EMAIL (via Edge Function) ──────────
/**
 * Email send karo via 'send-email' Edge Function.
 * Edge Function mein Resend ya SMTP use hota hai.
 *
 * @param {string}   template   - EMAIL_TEMPLATES key
 * @param {string}   to         - recipient email
 * @param {string}   toName     - recipient name
 * @param {object}   data       - template variables
 */
export async function sendEmail(template, to, toName, data = {}) {
  try {
    const { data: result, error } = await supabase.functions.invoke('send-email', {
      body: {
        template,
        to,
        to_name: toName,
        data,
      },
    });

    if (error || !result?.success) {
      console.error('[Email] Send failed:', error?.message || result?.message);
      return { success: false, error: error?.message || 'Email send failed' };
    }

    return { success: true, messageId: result.messageId };
  } catch (err) {
    console.error('[Email] sendEmail error:', err);
    return { success: false, error: err.message };
  }
}

// ────────── CONVENIENCE: ORDER CONFIRMATION ──────────
export async function sendOrderConfirmation({ to, toName, orderNumber, productType, totalAmount, estimatedDelivery }) {
  return sendEmail(EMAIL_TEMPLATES.ORDER_CONFIRMATION, to, toName, {
    order_number:       orderNumber,
    product_type:       productType,
    total_amount:       `₹${totalAmount}`,
    estimated_delivery: estimatedDelivery || '5–7 business days',
    support_email:      'support@mysmartdoor.in',
  });
}

// ────────── CONVENIENCE: PAYMENT SUCCESS ──────────
export async function sendPaymentSuccess({ to, toName, orderNumber, plateId, amount }) {
  return sendEmail(EMAIL_TEMPLATES.PAYMENT_SUCCESS, to, toName, {
    order_number: orderNumber,
    plate_id:     plateId,
    amount:       `₹${amount}`,
    dashboard_url: `${window.__SD_CONFIG__?.baseUrl || 'https://mysmartdoor.in'}/app.html`,
  });
}

// ────────── CONVENIENCE: DISPATCH NOTIFICATION ──────────
export async function sendDispatchNotification({ to, toName, orderNumber, trackingNumber, courier }) {
  return sendEmail(EMAIL_TEMPLATES.DISPATCH_NOTIFICATION, to, toName, {
    order_number:    orderNumber,
    tracking_number: trackingNumber || 'To be updated',
    courier:         courier || 'Courier Partner',
  });
}

// ────────── CONVENIENCE: DELIVERY CONFIRMATION ──────────
export async function sendDeliveryConfirmation({ to, toName, orderNumber, plateId }) {
  return sendEmail(EMAIL_TEMPLATES.DELIVERY_CONFIRMATION, to, toName, {
    order_number:  orderNumber,
    plate_id:      plateId,
    app_url:       `${window.__SD_CONFIG__?.baseUrl || 'https://mysmartdoor.in'}/app.html`,
    setup_guide:   `${window.__SD_CONFIG__?.baseUrl || 'https://mysmartdoor.in'}/setup`,
  });
}

// ────────── CONVENIENCE: RENEWAL REMINDER ──────────
export async function sendRenewalReminder({ to, toName, daysLeft, expiryDate, planName, renewalPrice }) {
  const template =
    daysLeft <= 1  ? EMAIL_TEMPLATES.RENEWAL_REMINDER_1  :
    daysLeft <= 7  ? EMAIL_TEMPLATES.RENEWAL_REMINDER_7  :
                     EMAIL_TEMPLATES.RENEWAL_REMINDER_30;

  return sendEmail(template, to, toName, {
    days_left:     daysLeft,
    expiry_date:   expiryDate,
    plan_name:     planName,
    renewal_price: `₹${renewalPrice}`,
    renew_url:     `${window.__SD_CONFIG__?.baseUrl || 'https://mysmartdoor.in'}/app.html#renew`,
  });
}
