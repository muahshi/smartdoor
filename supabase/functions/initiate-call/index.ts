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

    const callbackUrl = `${Deno.env.get('SUPABASE_URL')}/functions/v1/call-status-webhook?call_id=${callLog.id}`;
    const providerModule = provider === 'twilio' ? twilio : exotel;

    const result = await providerModule.placeCall({ visitorPhone, ownerPhone: owner.phone, callbackUrl });

    if (!result.success) {
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
