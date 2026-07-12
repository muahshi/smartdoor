/**
 * Smart Door — Supabase Edge Function: send-whatsapp
 * Deploy to: supabase/functions/send-whatsapp/index.ts
 *
 * Called by services/whatsapp.js. Picks the active vendor from
 * WHATSAPP_PROVIDER ('msg91' | 'meta' | 'twilio') so client code and the
 * rest of the notification engine never need to know which vendor is live.
 * Adding a new vendor = add a case here + a new file in _shared/providers/.
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { corsHeaders } from '../_shared/cors.ts';
import * as msg91 from '../_shared/providers/msg91.ts';
import { allowEdgeRequest, callerIp } from '../_shared/edgeRateLimit.ts';

// Phase 4 hardening — same rationale as send-sms: this function is
// --no-verify-jwt with no other auth gate, so it needs its own limits to
// avoid becoming a free spam/cost-abuse relay.
const PER_PHONE_WINDOW_MS = 10 * 60_000;
const PER_PHONE_MAX       = 5;
const PER_IP_WINDOW_MS    = 60_000;
const PER_IP_MAX          = 20;

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { toPhone, templateName, templateVars = {} } = await req.json();

    if (!toPhone || !templateName) {
      return Response.json({ success: false, message: 'Missing toPhone or templateName' }, { status: 400, headers: corsHeaders });
    }

    const ip = callerIp(req);
    if (!allowEdgeRequest(`send-whatsapp:ip:${ip}`, PER_IP_WINDOW_MS, PER_IP_MAX)) {
      return Response.json({ success: false, message: 'Too many requests. Please try again shortly.' }, { status: 429, headers: { ...corsHeaders, 'Retry-After': '60' } });
    }
    if (!allowEdgeRequest(`send-whatsapp:phone:${toPhone}`, PER_PHONE_WINDOW_MS, PER_PHONE_MAX)) {
      return Response.json({ success: false, message: 'Too many messages sent to this number recently.' }, { status: 429, headers: { ...corsHeaders, 'Retry-After': '300' } });
    }

    const activeProvider = Deno.env.get('WHATSAPP_PROVIDER') || 'msg91';
    let result;

    switch (activeProvider) {
      case 'msg91':
        result = await msg91.sendMessage({ toPhone, templateName, templateVars });
        break;
      case 'meta':
        // TODO: implement supabase/functions/_shared/providers/meta.ts
        // (Meta WhatsApp Cloud API — POST https://graph.facebook.com/v19.0/{PHONE_NUMBER_ID}/messages)
        result = { success: false, error: 'Meta WhatsApp provider not yet implemented' };
        break;
      case 'twilio':
        // TODO: implement Twilio WhatsApp (reuses TWILIO_ACCOUNT_SID/AUTH_TOKEN,
        // sends to a "whatsapp:+<number>" address via the Messages API)
        result = { success: false, error: 'Twilio WhatsApp provider not yet implemented' };
        break;
      default:
        result = { success: false, error: `Unknown WHATSAPP_PROVIDER: ${activeProvider}` };
    }

    if (!result.success) {
      return Response.json({ success: false, message: result.error }, { status: 502, headers: corsHeaders });
    }

    return Response.json({ success: true, messageId: result.messageId }, { headers: corsHeaders });
  } catch (err) {
    console.error('[send-whatsapp] Error:', err);
    return Response.json({ success: false, message: 'Server error' }, { status: 500, headers: corsHeaders });
  }
});

/**
 * DEPLOY COMMAND:
 * supabase functions deploy send-whatsapp --no-verify-jwt
 *
 * SECRETS to set:
 * supabase secrets set WHATSAPP_PROVIDER=msg91
 * supabase secrets set MSG91_API_KEY=... MSG91_WHATSAPP_NUMBER=... MSG91_NAMESPACE=...
 */
