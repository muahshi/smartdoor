/**
 * Smart Door — send-sms Edge Function
 * supabase/functions/send-sms/index.ts
 *
 * Routes SMS via MSG91 (primary) or Fast2SMS (fallback).
 * Called by services/sms.js and services/renewalEngine.js.
 *
 * Required Supabase Secrets:
 *   MSG91_AUTH_KEY          — MSG91 authkey
 *   MSG91_SENDER_ID         — DLT-registered sender ID (e.g. SMRTDR)
 *   MSG91_DLT_TE_ID         — DLT Template Entity ID (mandatory for India)
 *   FAST2SMS_API_KEY        — Fast2SMS API key (fallback only)
 *
 * DLT Template IDs map (per SMS_TEMPLATES in services/sms.js):
 *   order_placed, payment_success, shipped, out_for_delivery,
 *   delivered, otp, renewal_reminder
 *
 * Deploy: supabase functions deploy send-sms --no-verify-jwt
 */

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { corsHeaders } from '../_shared/cors.ts';

// ── DLT-registered template bodies ──────────────────────────────────────────
// These must match your DLT-approved templates exactly (variables as {#var#}).
const TEMPLATES: Record<string, { body: string; dltTeId?: string }> = {
  order_placed: {
    body: 'Dear {#name#}, your Smart Door order #{#order_number#} has been placed successfully. Thank you for choosing {#brand#}!',
  },
  payment_success: {
    body: 'Payment of Rs.{#amount#} received for order #{#order_number#}. Your Smart Door is being processed. - Smart Door',
  },
  shipped: {
    body: 'Your Smart Door order #{#order_number#} has been shipped via {#courier#}. Tracking ID: {#tracking_id#}. - Smart Door',
  },
  out_for_delivery: {
    body: 'Your Smart Door plate is out for delivery today! Expected by {#time#}. - Smart Door',
  },
  delivered: {
    body: 'Your Smart Door plate has been delivered. Please activate it at {#activation_url#}. - Smart Door',
  },
  otp: {
    body: '{#otp#} is your Smart Door verification OTP. Valid for 10 minutes. Do not share with anyone. - Smart Door',
  },
  renewal_reminder: {
    body: 'Dear {#name#}, your SmartDoor Care plan expires in {#days#} days. Renew at {#renewal_url#} to avoid interruption. - Smart Door',
  },
};

function buildSmsBody(template: string, data: Record<string, string>): string {
  const tpl = TEMPLATES[template];
  if (!tpl) throw new Error(`Unknown template: ${template}`);
  let body = tpl.body;
  for (const [key, value] of Object.entries(data)) {
    body = body.replaceAll(`{#${key}#}`, String(value));
  }
  return body;
}

// ── MSG91 sender ─────────────────────────────────────────────────────────────
async function sendViaMSG91(phone: string, message: string): Promise<{ success: boolean; messageId?: string; error?: string }> {
  const authKey = Deno.env.get('MSG91_AUTH_KEY');
  const senderId = Deno.env.get('MSG91_SENDER_ID') || 'SMRTDR';
  const dltTeId = Deno.env.get('MSG91_DLT_TE_ID') || '';

  if (!authKey) return { success: false, error: 'MSG91_AUTH_KEY not configured' };

  const payload = {
    sender: senderId,
    route: '4', // Transactional route
    country: '91',
    dlt_te_id: dltTeId,
    sms: [{ message, to: [phone.replace(/^\+/, '')] }],
  };

  const resp = await fetch('https://api.msg91.com/api/v2/sendsms', {
    method: 'POST',
    headers: {
      authkey: authKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  const data = await resp.json().catch(() => ({}));
  if (!resp.ok || data?.type === 'error') {
    return { success: false, error: data?.message || `MSG91 returned ${resp.status}` };
  }
  return { success: true, messageId: data?.request_id };
}

// ── Fast2SMS fallback ─────────────────────────────────────────────────────────
async function sendViaFast2SMS(phone: string, message: string): Promise<{ success: boolean; messageId?: string; error?: string }> {
  const apiKey = Deno.env.get('FAST2SMS_API_KEY');
  if (!apiKey) return { success: false, error: 'FAST2SMS_API_KEY not configured' };

  const resp = await fetch('https://www.fast2sms.com/dev/bulkV2', {
    method: 'POST',
    headers: {
      authorization: apiKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      route: 'q',
      message,
      language: 'english',
      flash: 0,
      numbers: phone.replace(/^\+91/, '').replace(/^\+/, ''),
    }),
  });

  const data = await resp.json().catch(() => ({}));
  if (!resp.ok || !data?.return) {
    return { success: false, error: data?.message?.[0] || `Fast2SMS returned ${resp.status}` };
  }
  return { success: true, messageId: data?.request_id };
}

// ── Main handler ─────────────────────────────────────────────────────────────
serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { template, phone, data = {}, provider = 'msg91' } = await req.json();

    if (!template || !phone) {
      return new Response(JSON.stringify({ success: false, error: 'template and phone are required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    let message: string;
    try {
      message = buildSmsBody(template, data);
    } catch (e) {
      return new Response(JSON.stringify({ success: false, error: (e as Error).message }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    let result;
    if (provider === 'fast2sms') {
      result = await sendViaFast2SMS(phone, message);
    } else {
      // Try MSG91 first, fall back to Fast2SMS
      result = await sendViaMSG91(phone, message);
      if (!result.success) {
        console.warn('[send-sms] MSG91 failed, trying Fast2SMS fallback:', result.error);
        result = await sendViaFast2SMS(phone, message);
      }
    }

    return new Response(JSON.stringify(result), {
      status: result.success ? 200 : 502,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (err) {
    console.error('[send-sms] Unexpected error:', err);
    return new Response(JSON.stringify({ success: false, error: 'Internal server error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
