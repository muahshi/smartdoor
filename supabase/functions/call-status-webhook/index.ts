/**
 * Smart Door — Supabase Edge Function: call-status-webhook
 * Deploy to: supabase/functions/call-status-webhook/index.ts
 *
 * Receives provider status callbacks (Exotel `StatusCallback`, Twilio
 * `StatusCallback`) for a call previously created by initiate-call.
 * Updates call_logs with the authoritative status/duration, and implements
 * FAMILY ROUTING FALLBACK: if the owner doesn't answer (no_answer/busy), the
 * next family member (by priority) is automatically tried.
 *
 * URL shape: .../call-status-webhook?call_id={call_logs.id}
 *
 * NOTE: Exotel and Twilio both POST form-encoded bodies, with different
 * field names for the same concepts — normalized below.
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';
import * as exotel from '../_shared/providers/exotel.ts';
import * as twilio from '../_shared/providers/twilio.ts';
import { signCallCallback, verifyCallCallback } from '../_shared/callbackAuth.ts';

const TERMINAL_FAILURE_STATUSES = ['no-answer', 'no_answer', 'busy', 'failed'];

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const callId = url.searchParams.get('call_id');
    if (!callId) {
      return Response.json({ success: false, message: 'Missing call_id' }, { status: 400, headers: corsHeaders });
    }

    // SECURITY (Phase 9): this endpoint has no other request authentication
    // (neither Exotel nor Twilio callback signing is wired up here), so an
    // HMAC token minted by initiate-call at call-creation time is required
    // — without it, anyone who obtained/guessed a call_logs id could inject
    // fake status transitions (including triggering the family-fallback
    // dial-out below).
    const sig = url.searchParams.get('sig');
    if (!(await verifyCallCallback(callId, sig))) {
      console.error(`[call-status-webhook] Rejected unsigned/invalid callback for call_id=${callId}`);
      return Response.json({ success: false, message: 'Invalid signature' }, { status: 403, headers: corsHeaders });
    }

    const form = await req.formData();
    // Normalize provider-specific field names into one shape.
    const rawStatus = (form.get('Status') || form.get('CallStatus') || '').toString().toLowerCase();
    const rawDuration = (form.get('Duration') || form.get('CallDuration') || '0').toString();
    const status = _normalizeStatus(rawStatus);
    const duration = parseInt(rawDuration, 10) || 0;

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    const { data: callLog } = await supabaseAdmin
      .from('call_logs')
      .select('*')
      .eq('id', callId)
      .single();

    if (!callLog) {
      return Response.json({ success: false, message: 'Call not found' }, { status: 404, headers: corsHeaders });
    }

    await supabaseAdmin
      .from('call_logs')
      .update({
        call_status: status,
        duration,
        ended_at: ['completed', 'no_answer', 'busy', 'failed', 'rejected'].includes(status) ? new Date().toISOString() : null,
      })
      .eq('id', callId);

    // ── FAMILY ROUTING FALLBACK ──
    // If the current tier didn't answer, automatically try the next priority
    // family member, up to 4 tiers, instead of just giving up.
    if (TERMINAL_FAILURE_STATUSES.includes(status) && callLog.routed_to_priority < 4) {
      await _tryNextFamilyMember(supabaseAdmin, callLog);
    }

    if (status === 'completed' || status === 'failed' || TERMINAL_FAILURE_STATUSES.includes(status)) {
      await supabaseAdmin.from('audit_logs').insert({
        owner_id: callLog.owner_id,
        action: 'call_ended',
        details: { callId, status, duration },
      });
    }

    return Response.json({ success: true }, { headers: corsHeaders });
  } catch (err) {
    console.error('[call-status-webhook] Error:', err);
    return Response.json({ success: false, message: 'Server error' }, { status: 500, headers: corsHeaders });
  }
});

async function _tryNextFamilyMember(supabaseAdmin: any, callLog: any) {
  const nextPriority = callLog.routed_to_priority + 1;

  const { data: nextMember } = await supabaseAdmin
    .from('family_members')
    .select('*')
    .eq('owner_id', callLog.owner_id)
    .eq('priority', nextPriority)
    .eq('is_active', true)
    .single();

  if (!nextMember) return; // no more tiers to fall back to

  const { data: newCallLog } = await supabaseAdmin
    .from('call_logs')
    .insert({
      owner_id: callLog.owner_id,
      plate_id: callLog.plate_id,
      visitor_identifier: callLog.visitor_identifier,
      call_status: 'initiated',
      provider: callLog.provider,
      routed_to_priority: nextPriority,
    })
    .select()
    .single();

  if (!newCallLog) return;

  const fallbackSig = await signCallCallback(newCallLog.id);
  const callbackUrl = `${Deno.env.get('SUPABASE_URL')}/functions/v1/call-status-webhook?call_id=${newCallLog.id}${fallbackSig ? `&sig=${fallbackSig}` : ''}`;
  const providerModule = callLog.provider === 'twilio' ? twilio : exotel;

  // Note: this fallback leg dials the next family member's number directly;
  // the original visitor leg is not re-captured here since most telephony
  // providers can re-bridge an already-connected leg to a new target via
  // their Conference/Bridge APIs — wire that provider-specific call here
  // once your Exotel/Twilio account's exact masking product is finalized.
  const result = await providerModule.placeCall({
    visitorPhone: null, // see note above
    ownerPhone: nextMember.phone,
    callbackUrl,
  });

  await supabaseAdmin
    .from('call_logs')
    .update({
      call_status: result.success ? (result.status || 'ringing') : 'failed',
      masked_number: result.maskedNumber,
      provider_call_sid: result.providerCallSid,
    })
    .eq('id', newCallLog.id);
}

function _normalizeStatus(raw: string): string {
  const map: Record<string, string> = {
    'no-answer': 'no_answer',
    'no_answer': 'no_answer',
    'busy': 'busy',
    'completed': 'completed',
    'failed': 'failed',
    'canceled': 'rejected',
    'rejected': 'rejected',
    'in-progress': 'in_progress',
    'ringing': 'ringing',
  };
  return map[raw] || raw || 'unknown';
}

/**
 * DEPLOY COMMAND:
 * supabase functions deploy call-status-webhook --no-verify-jwt
 *
 * Register this URL as the StatusCallback for both Exotel and Twilio —
 * it's already passed automatically by initiate-call, so no manual
 * dashboard config is needed beyond deploying the function.
 */
