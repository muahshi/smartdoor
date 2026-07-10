/**
 * Smart Door — Supabase Edge Function: get-turn-credentials
 * supabase/functions/get-turn-credentials/index.ts
 *
 * PRODUCTION FIX (WebRTC Root Cause #2 — TURN support).
 *
 * config/rtcConfig.js previously shipped STUN-only ICE servers, with TURN
 * explicitly documented as "Phase 4, not built yet". STUN alone cannot
 * traverse the symmetric / carrier-grade NAT used by most Indian mobile
 * networks (Jio, Airtel, Vi) — extremely common for both SmartDoor
 * visitors and owners — so calls between two such devices can fail to
 * find a direct P2P path even when ICE candidate delivery itself is
 * working correctly (see the companion fix in services/webrtcOwnerCall.js
 * for the OTHER, independent root cause).
 *
 * This function issues short-lived Twilio Network Traversal Service (NTS)
 * TURN credentials, mirroring the exact security model already used for
 * masked calling: TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN live only as
 * server-side secrets (see supabase/functions/_shared/providers/twilio.ts)
 * and never reach the browser. Called by both the visitor (anon) and
 * owner (authenticated) sides — services/webrtcCall.js and
 * services/webrtcOwnerCall.js — via config/rtcConfig.js#fetchIceServers().
 *
 * Fail-open contract: on ANY error (Twilio secrets not configured yet in
 * this environment, Twilio API error, rate limit hit), this returns
 * HTTP 200 with an EMPTY iceServers array rather than an error status.
 * The client already treats an empty/missing iceServers array as "use
 * STUN-only" — see fetchIceServers's fallback — so an unconfigured or
 * failing TURN backend can only ever degrade to prior (pre-fix) behavior,
 * never break the call flow further. Deploy with --no-verify-jwt, exactly
 * like initiate-call, since anonymous visitors call this too.
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';

const TWILIO_TOKEN_TTL_SECS = 3600; // 1 hour — comfortably longer than any single Tap to Talk call

// Best-effort in-process rate limit (per Deno isolate), same pattern as
// supabase/functions/verify-pin/index.ts's _recentAttempts map. The
// authoritative limit is the DB-backed check_rate_limit() RPC below.
const _recentAttempts = new Map<string, number[]>();
const EDGE_WINDOW_MS = 60_000;
const EDGE_MAX = 20;

function edgeRateLimit(key: string): boolean {
  const now = Date.now();
  const list = (_recentAttempts.get(key) || []).filter((t: number) => now - t < EDGE_WINDOW_MS);
  if (list.length >= EDGE_MAX) return false;
  list.push(now);
  _recentAttempts.set(key, list);
  return true;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }
  if (req.method !== 'POST') {
    return Response.json({ success: false, iceServers: [], message: 'Method not allowed' }, { status: 405, headers: corsHeaders });
  }

  try {
    let body: Record<string, unknown> = {};
    try { body = await req.json(); } catch { /* empty body is fine — both fields optional */ }

    const ownerId = typeof body.ownerId === 'string' ? body.ownerId : null;
    const plateId = typeof body.plateId === 'string' ? body.plateId : null;
    const rateLimitKey = plateId || (ownerId ? `owner:${ownerId}` : null);

    if (!rateLimitKey) {
      return Response.json({ success: false, iceServers: [], message: 'Missing ownerId or plateId' }, { status: 400, headers: corsHeaders });
    }

    if (!edgeRateLimit(rateLimitKey)) {
      // Fail open — a rate-limited caller just gets STUN-only, not a hard error.
      console.warn(`[RTC-TRACE][FAIL] get-turn-credentials edge rate limit | File=supabase/functions/get-turn-credentials/index.ts key=${rateLimitKey}`);
      return Response.json({ success: false, iceServers: [], message: 'Rate limited' }, { status: 200, headers: corsHeaders });
    }

    const accountSid = Deno.env.get('TWILIO_ACCOUNT_SID');
    const authToken = Deno.env.get('TWILIO_AUTH_TOKEN');

    if (!accountSid || !authToken) {
      // Twilio not configured in this environment yet — fail open to
      // STUN-only rather than erroring the call flow.
      console.warn('[RTC-TRACE] get-turn-credentials: TWILIO_ACCOUNT_SID/TWILIO_AUTH_TOKEN not set, returning empty iceServers | File=supabase/functions/get-turn-credentials/index.ts');
      return Response.json({ success: true, iceServers: [], message: 'TURN not configured' }, { status: 200, headers: corsHeaders });
    }

    // DB-backed authoritative rate limit — reuses the existing generic
    // rate_limit_events table/RPC (no schema change), same one already
    // used for call_attempt / qr_scan / sos elsewhere in the codebase.
    try {
      const supabaseAdmin = createClient(
        Deno.env.get('SUPABASE_URL')!,
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
      );
      const { data: allowed } = await supabaseAdmin.rpc('check_rate_limit', {
        p_plate_id: rateLimitKey,
        p_action_type: 'turn_credentials',
        p_window_secs: 300,
        p_max_count: 30,
      });
      if (allowed === false) {
        console.warn(`[RTC-TRACE][FAIL] get-turn-credentials DB rate limit | File=supabase/functions/get-turn-credentials/index.ts key=${rateLimitKey}`);
        return Response.json({ success: false, iceServers: [], message: 'Rate limited' }, { status: 200, headers: corsHeaders });
      }
      await supabaseAdmin.rpc('log_rate_limit_event', {
        p_plate_id: rateLimitKey,
        p_visitor_identifier: null,
        p_action_type: 'turn_credentials',
      });
    } catch (rlErr) {
      // Rate-limit bookkeeping is non-critical — never block a call over it.
      console.error('[get-turn-credentials] rate-limit RPC failed (non-fatal):', rlErr);
    }

    const twilioResp = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Tokens.json`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Basic ${btoa(`${accountSid}:${authToken}`)}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({ Ttl: String(TWILIO_TOKEN_TTL_SECS) }),
      }
    );

    if (!twilioResp.ok) {
      const errText = await twilioResp.text().catch(() => '');
      console.error(`[RTC-TRACE][FAIL] Twilio NTS Tokens.json failed | File=supabase/functions/get-turn-credentials/index.ts status=${twilioResp.status} body=${errText.slice(0, 300)}`);
      return Response.json({ success: false, iceServers: [], message: 'TURN provider error' }, { status: 200, headers: corsHeaders });
    }

    const twilioData = await twilioResp.json();
    const rawIceServers = Array.isArray(twilioData?.ice_servers) ? twilioData.ice_servers : [];

    const iceServers = rawIceServers
      .map((s: Record<string, unknown>) => ({
        urls: (s.urls as string) || (s.url as string),
        username: s.username as string | undefined,
        credential: s.credential as string | undefined,
      }))
      .filter((s: { urls?: string }) => !!s.urls);

    console.log(`[RTC-TRACE] TURN credentials issued | File=supabase/functions/get-turn-credentials/index.ts count=${iceServers.length} ttl=${TWILIO_TOKEN_TTL_SECS}`);

    return Response.json(
      { success: true, iceServers, ttl: TWILIO_TOKEN_TTL_SECS },
      { status: 200, headers: corsHeaders }
    );
  } catch (err) {
    console.error('[get-turn-credentials] Unhandled error (failing open to STUN-only):', err);
    return Response.json({ success: false, iceServers: [], message: 'Internal error' }, { status: 200, headers: corsHeaders });
  }
});
