/**
 * Smart Door — Supabase Edge Function: ai-session-token
 * supabase/functions/ai-session-token/index.ts
 *
 * PHASE 3.1A — GROQ PROXY SECURITY HARDENING.
 *
 * Mints the short-lived signed token that groq-proxy now requires (see
 * supabase/functions/_shared/aiSessionAuth.ts for why, and
 * groq-proxy/index.ts for enforcement). This is a NEW, separate function —
 * it does not duplicate groq-proxy, never talks to Groq, and never sees
 * GROQ_API_KEY.
 *
 * Deliberately anonymous — the AI Product Consultant (product.html /
 * products.html) and AI Receptionist (visitor.html) are pre-login,
 * unauthenticated surfaces by design, so this cannot require a Supabase
 * session either. What it CAN require is that the request's Origin is one
 * of our known frontends (see _shared/cors.ts isAllowedOrigin) — the same
 * allow-list already used for restrictedCors() on payment/admin functions.
 *
 * Deploy with: supabase functions deploy ai-session-token --no-verify-jwt
 * Required env: AI_SESSION_SECRET (any long random string, set in
 * Supabase Dashboard → Settings → Secrets — separate secret from
 * CALL_WEBHOOK_SECRET so the two token spaces can't be confused).
 */

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { corsHeaders, isAllowedOrigin } from '../_shared/cors.ts';
import { allowEdgeRequest, callerIp } from '../_shared/edgeRateLimit.ts';
import { mintAiSessionToken } from '../_shared/aiSessionAuth.ts';

// Generous — this only mints a token, it never calls Groq or spends money
// directly. The real cost gate is groq-proxy's own per-IP limit. This just
// stops a script from spinning up tokens for no reason.
const PER_IP_WINDOW_MS = 60_000;
const PER_IP_MAX = 30;

const TOKEN_TTL_SECONDS = 300;

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed.' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  try {
    const ip = callerIp(req);
    if (!allowEdgeRequest(`ai-session-token:ip:${ip}`, PER_IP_WINDOW_MS, PER_IP_MAX)) {
      return new Response(JSON.stringify({ error: 'Too many requests. Please wait a moment and try again.' }), {
        status: 429,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const origin = req.headers.get('origin');
    if (!isAllowedOrigin(origin)) {
      // Logged server-side only — the client just sees a generic denial,
      // no detail about the allow-list to probe against.
      console.warn(`[ai-session-token] rejected origin: ${origin || '(none)'}`);
      return new Response(JSON.stringify({ error: 'Origin not permitted.' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const token = await mintAiSessionToken(origin!);
    if (!token) {
      // AI_SESSION_SECRET missing — fail closed. groq-proxy will reject
      // every call without a valid token, same as if this function were
      // down; better than silently minting an unverifiable token.
      return new Response(JSON.stringify({ error: 'AI session service unavailable.' }), {
        status: 503,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ success: true, token, expiresIn: TOKEN_TTL_SECONDS }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('[ai-session-token] Unexpected error:', err);
    return new Response(JSON.stringify({ error: 'Internal server error.' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
