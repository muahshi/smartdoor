/**
 * Smart Door — SMS Service (Architecture)
 * services/sms.js
 *
 * Architecture only — production mein Edge Functions se call hoga.
 * Providers:
 *   - MSG91 (primary — transactional, DLT registered)
 *   - Fast2SMS (fallback — dev/testing)
 *
 * DLT Template IDs (MSG91 requires pre-approved templates for India):
 * Register karo: https://msg91.com/in
 */

import { supabase } from './supabase.js';

// ────────── SMS TEMPLATES ──────────
export const SMS_TEMPLATES = {
  ORDER_PLACED:     'order_placed',
  PAYMENT_SUCCESS:  'payment_success',
  SHIPPED:          'shipped',
  OUT_FOR_DELIVERY: 'out_for_delivery',
  DELIVERED:        'delivered',
  OTP:              'otp',
  RENEWAL_REMINDER: 'renewal_reminder',
};

// ────────── SEND SMS (via Edge Function) ──────────
/**
 * SMS send karo via 'send-sms' Edge Function.
 *
 * @param {string}   template   - SMS_TEMPLATES key
 * @param {string}   phone      - +91XXXXXXXXXX format
 * @param {object}   data       - template variables
 * @param {string}   provider   - 'msg91' | 'fast2sms' (default: msg91)
 */
export async function sendSms(template, phone, data = {}, provider = 'msg91') {
  try {
    const { data: result, error } = await supabase.functions.invoke('send-sms', {
      body: { template, phone, data, provider },
    });

    if (error || !result?.success) {
      console.error('[SMS] Send failed:', error?.message || result?.message);
      return { success: false, error: error?.message || 'SMS send failed' };
    }

    return { success: true, messageId: result.messageId };
  } catch (err) {
    console.error('[SMS] sendSms error:', err);
    return { success: false, error: err.message };
  }
}

// ────────── CONVENIENCE METHODS ──────────

export async function smsOrderPlaced(phone, { ownerName, orderNumber }) {
  return sendSms(SMS_TEMPLATES.ORDER_PLACED, phone, {
    name:         ownerName,
    order_number: orderNumber,
    brand:        'Smart Door',
  });
}

export async function smsPaymentSuccess(phone, { ownerName, orderNumber, amount }) {
  return sendSms(SMS_TEMPLATES.PAYMENT_SUCCESS, phone, {
    name:         ownerName,
    order_number: orderNumber,
    amount:       `Rs.${amount}`,
  });
}

export async function smsShipped(phone, { ownerName, trackingNumber, courier }) {
  return sendSms(SMS_TEMPLATES.SHIPPED, phone, {
    name:            ownerName,
    tracking_number: trackingNumber || 'N/A',
    courier:         courier || 'Courier Partner',
  });
}

export async function smsDelivered(phone, { ownerName, plateId }) {
  return sendSms(SMS_TEMPLATES.DELIVERED, phone, {
    name:     ownerName,
    plate_id: plateId,
    app_url:  'smartdoor.in/app',
  });
}

export async function smsRenewalReminder(phone, { ownerName, daysLeft, expiryDate }) {
  return sendSms(SMS_TEMPLATES.RENEWAL_REMINDER, phone, {
    name:        ownerName,
    days_left:   daysLeft,
    expiry_date: expiryDate,
    renew_url:   'smartdoor.in/renew',
  });
}

/*
 * ════════════════════════════════════════════════════════════
 * EDGE FUNCTION: supabase/functions/send-sms/index.ts
 * ════════════════════════════════════════════════════════════
 *
 * import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
 * import { corsHeaders } from "../_shared/cors.ts";
 *
 * const MSG91_AUTH_KEY    = Deno.env.get("MSG91_AUTH_KEY")!;
 * const MSG91_SENDER_ID   = Deno.env.get("MSG91_SENDER_ID") || "SMTDOR";
 * const FAST2SMS_API_KEY  = Deno.env.get("FAST2SMS_API_KEY");
 *
 * // DLT Template IDs — register karo MSG91 portal pe
 * const DLT_TEMPLATES: Record<string, { templateId: string; message: (...args: any[]) => string }> = {
 *   order_placed:     { templateId: "TID_XXXXXXX", message: (d) => `Dear ${d.name}, your Smart Door order ${d.order_number} has been placed. -Smart Door` },
 *   payment_success:  { templateId: "TID_XXXXXXX", message: (d) => `Payment of ${d.amount} received for order ${d.order_number}. Your plate is being manufactured. -Smart Door` },
 *   shipped:          { templateId: "TID_XXXXXXX", message: (d) => `Your Smart Door is on the way! Tracking: ${d.tracking_number} via ${d.courier}. -Smart Door` },
 *   delivered:        { templateId: "TID_XXXXXXX", message: (d) => `Smart Door ${d.plate_id} delivered! Visit ${d.app_url} to activate. -Smart Door` },
 *   renewal_reminder: { templateId: "TID_XXXXXXX", message: (d) => `Smart Door subscription expires in ${d.days_left} days. Renew at ${d.renew_url} -Smart Door` },
 * };
 *
 * serve(async (req) => {
 *   if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
 *   const { template, phone, data, provider } = await req.json();
 *   const tpl = DLT_TEMPLATES[template];
 *   if (!tpl) return Response.json({ success: false, message: "Unknown template" }, { status: 400 });
 *   const message = tpl.message(data);
 *
 *   if (provider === "fast2sms" && FAST2SMS_API_KEY) {
 *     // Fast2SMS send
 *     const r = await fetch("https://www.fast2sms.com/dev/bulkV2", {
 *       method: "POST",
 *       headers: { authorization: FAST2SMS_API_KEY, "Content-Type": "application/json" },
 *       body: JSON.stringify({ route: "dlt", sender_id: MSG91_SENDER_ID, message, language: "english", flash: 0, numbers: phone.replace("+91","") }),
 *     });
 *     const result = await r.json();
 *     return Response.json({ success: result.return, messageId: result.request_id }, { headers: corsHeaders });
 *   }
 *
 *   // MSG91 send (default)
 *   const r = await fetch("https://control.msg91.com/api/v5/flow/", {
 *     method: "POST",
 *     headers: { authkey: MSG91_AUTH_KEY, "Content-Type": "application/json" },
 *     body: JSON.stringify({ flow_id: tpl.templateId, sender: MSG91_SENDER_ID, mobiles: phone.replace("+",""), ...data }),
 *   });
 *   const result = await r.json();
 *   return Response.json({ success: result.type === "success", messageId: result.request_id }, { headers: corsHeaders });
 * });
 */
