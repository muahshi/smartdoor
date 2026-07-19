/**
 * Smart Door — Supabase Edge Function: initiate-call
 * Deploy to: supabase/functions/initiate-call/index.ts
 *
 * Called by services/exotel.js and services/twilio.js (both just dispatch
 * here with a different `provider` value — the client tries one, and if it
 * fails, calls this same function again with the other provider, per the
 * fallback loop in services/communication.js).
 *
 * Responsibilities:
 *  - Re-validate the rate limit server-side (never trust the client alone)
 *  - Check security_rules: allow_calls, call_forwarding, Night Mode
 *  - Look up the owner's real phone number (service role — RLS-bypassed,
 *    never returned to the client)
 *  - Place the call via the requested provider (Exotel or Twilio)
 *  - Write the call_logs row (owner/visitor numbers never stored together
 *    in plaintext alongside each other — visitor_identifier is a fingerprint,
 *    not a phone number, unless visitorPhone was explicitly provided for the
 *    two-leg dial, which is handled by the provider call itself, not logged)
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';
import * as exotel from '../_shared/providers/exotel.ts';
import * as twilio from '../_shared/providers/twilio.ts';
import { signCallCallback } from '../_shared/callbackAuth.ts';

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { plateId, ownerId, visitorPhone = null, visitorIdentifier = null, provider = 'exotel' } = await req.json();

    if (!plateId || !ownerId) {
      return Response.json({ success: false, message: 'Missing plateId or ownerId' }, { status: 400, headers: corsHeaders });
    }

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    // ── Server-side rate limit (authoritative, can't be bypassed) ──
    const { data: allowed } = await supabaseAdmin.rpc('check_rate_limit', {
      p_plate_id: plateId,
      p_action_type: 'call_attempt',
      p_window_secs: 300,
      p_max_count: 3,
    });
    if (allowed === false) {
      return Response.json({ success: false, message: 'Rate limit exceeded. Please try again shortly.' }, { status: 429, headers: corsHeaders });
    }

    // ── Security rules check ──
    const { data: rules } = await supabaseAdmin
      .from('security_rules')
      .select('allow_calls, call_forwarding, night_mode_on, night_mode_start, night_mode_end')
      .eq('owner_id', ownerId)
      .single();

    if (rules && (!rules.allow_calls || !rules.call_forwarding)) {
      return Response.json({ success: false, message: 'Owner is not accepting calls right now.' }, { status: 403, headers: corsHeaders });
    }
    // Night Mode silently blocks calls (not an emergency bypass — SOS uses a separate flow)
    if (rules?.night_mode_on && _isWithinNightMode(rules.night_mode_start, rules.night_mode_end)) {
      return Response.json({ success: false, message: 'Night Mode is active. Calls are paused.' }, { status: 403, headers: corsHeaders });
    }

    // ── Look up owner's real phone (service role only — never sent to client) ──
    const { data: owner, error: ownerError } = await supabaseAdmin
      .from('users')
      .select('phone')
      .eq('id', ownerId)
      .single();

    if (ownerError || !owner?.phone) {
      return Response.json({ success: false, message: 'Owner contact not found.' }, { status: 404, headers: corsHeaders });
    }

    // ── Insert a pending call_logs row first, so we have an id for the webhook callback ──
    const { data: callLog, error: insertError } = await supabaseAdmin
      .from('call_logs')
      .insert({
        owner_id: ownerId,
        plate_id: plateId,
        visitor_identifier: visitorIdentifier,
        call_status: 'initiated',
        provider,
      })
      .select()
      .single();

    if (insertError || !callLog) {
      return Response.json({ success: false, message: 'Could not create call record.' }, { status: 500, headers: corsHeaders });
    }

    const callSig = await signCallCallback(callLog.id);
    const callbackUrl = `${Deno.env.get('SUPABASE_URL')}/functions/v1/call-status-webhook?call_id=${callLog.id}${callSig ? `&sig=${callSig}` : ''}`;
    const providerModule = provider === 'twilio' ? twilio : exotel;

    // PRODUCTION FIX (phone-format bug — root cause of the reported
    // "+19575877758 is unverified" Twilio error): phone numbers are
    // stored and passed around this codebase as bare 10-digit Indian
    // numbers (see services/sanitize.js#phone, which intentionally
    // returns a 10-digit string, not E.164). That's correct for SMS
    // (send-sms strips any +91 back off) and for DB storage, but Twilio's
    // Voice API requires E.164 and — critically — silently assumes a
    // bare/ambiguous number is a US number (+1) rather than rejecting it,
    // which is exactly how an Indian mobile number became "+19575877758"
    // and then failed as "unverified" against a US number. Exotel's
    // Connect API also expects a fully-qualified number. Normalizing to
    // +91XXXXXXXXXX here — the one place both providers are invoked from
    // — fixes this for both providers without touching DB storage format,
    // sanitize.js, or any other caller.
    const toE164India = (raw: string | null): string | null => {
      if (!raw) return null;
      const digits = String(raw).replace(/\D/g, '');
      const ten = digits.length === 12 && digits.startsWith('91')
        ? digits.slice(2)
        : digits.length === 10
          ? digits
          : null;
      return ten ? `+91${ten}` : null;
    };

    const e164Visitor = toE164India(visitorPhone);
    const e164Owner = toE164India(owner.phone);
    if (!e164Owner) {
      console.error(`[initiate-call] Owner phone "${owner.phone}" could not be normalized to E.164 for callLog ${callLog.id}`);
      await supabaseAdmin.from('call_logs').update({ call_status: 'failed' }).eq('id', callLog.id);
      return Response.json({ success: false, message: 'Owner contact number is invalid.' }, { status: 500, headers: corsHeaders });
    }

    const result = await providerModule.placeCall({ visitorPhone: e164Visitor, ownerPhone: e164Owner, callbackUrl });

    if (!result.success) {
      // DIAGNOSTIC FIX: this path previously returned 502 with no server-side
      // log line, so the real provider failure reason (bad credentials,
      // rejected phone format, trial-account restriction, etc.) was visible
      // nowhere — not in Supabase Function logs, not in the client. Logging
      // it here does not change any response, status code, or behavior.
      console.error(`[initiate-call] Provider "${provider}" failed for callLog ${callLog.id}:`, result.error || 'Call provider failed');
      await supabaseAdmin.from('call_logs').update({ call_status: 'failed' }).eq('id', callLog.id);
      return Response.json({ success: false, message: result.error || 'Call provider failed' }, { status: 502, headers: corsHeaders });
    }

    await supabaseAdmin
      .from('call_logs')
      .update({
        call_status: result.status || 'ringing',
        masked_number: result.maskedNumber,
        provider_call_sid: result.providerCallSid,
      })
      .eq('id', callLog.id);

    return Response.json({
      success: true,
      callId: callLog.id,
      status: result.status || 'ringing',
    }, { headers: corsHeaders });

  } catch (err) {
    console.error('[initiate-call] Error:', err);
    return Response.json({ success: false, message: 'Server error' }, { status: 500, headers: corsHeaders });
  }
});

// ────────── NIGHT MODE HELPER ──────────
function _isWithinNightMode(start: string, end: string): boolean {
  const now = new Date();
  const currentMins = now.getHours() * 60 + now.getMinutes();
  const [startH, startM] = (start || '22:00').split(':').map(Number);
  const [endH, endM] = (end || '06:00').split(':').map(Number);
  const startMins = startH * 60 + startM;
  const endMins = endH * 60 + endM;

  if (startMins > endMins) return currentMins >= startMins || currentMins < endMins;
  return currentMins >= startMins && currentMins < endMins;
}

/**
 * DEPLOY COMMAND:
 * supabase functions deploy initiate-call --no-verify-jwt
 *
 * SECRETS to set (see .env.example):
 * supabase secrets set EXOTEL_SID=... EXOTEL_API_KEY=... EXOTEL_API_SECRET=... EXOTEL_VIRTUAL_NUMBER=...
 * supabase secrets set TWILIO_ACCOUNT_SID=... TWILIO_AUTH_TOKEN=... TWILIO_CALLER_NUMBER=...
 */
