/**
 * Smart Door — Groq Proxy Edge Function
 * supabase/functions/groq-proxy/index.ts
 *
 * Proxies requests to Groq API so the GROQ_API_KEY
 * never leaves the server. Browser calls this function;
 * this function calls Groq.
 *
 * Deploy with: supabase functions deploy groq-proxy --no-verify-jwt
 * Required env: GROQ_API_KEY (set in Supabase Dashboard → Settings → Secrets)
 */

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { corsHeaders } from '../_shared/cors.ts';
import { allowEdgeRequest, callerIp } from '../_shared/edgeRateLimit.ts';

const GROQ_BASE_URL = 'https://api.groq.com/openai/v1/chat/completions';
const GROQ_MODEL_WHITELIST = ['llama3-70b-8192', 'llama3-8b-8192', 'mixtral-8x7b-32768', 'llama-3.3-70b-versatile', 'llama-3.1-8b-instant'];

// AI Product Consultant (Phase 3) — this function is now called from an
// anonymous, unauthenticated public page (product.html/products.html), not
// just from logged-in owner-dashboard contexts. Same in-memory sliding-window
// limiter already used by send-sms/send-whatsapp/send-email; first line of
// defense against a script hammering this endpoint and running up the Groq
// bill. Resets on cold start — not a substitute for a DB-backed limit if this
// ever needs to be authoritative across instances.
const PER_IP_WINDOW_MS = 60_000;
const PER_IP_MAX = 12;

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const ip = callerIp(req);
    if (!allowEdgeRequest(`groq-proxy:ip:${ip}`, PER_IP_WINDOW_MS, PER_IP_MAX)) {
      return new Response(JSON.stringify({ error: 'Too many requests. Please wait a moment and try again.' }), {
        status: 429,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const groqApiKey = Deno.env.get('GROQ_API_KEY');
    if (!groqApiKey) {
      return new Response(JSON.stringify({ error: 'Groq API key not configured on server.' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const body = await req.json();
    const { messages, model = 'llama3-70b-8192', max_tokens = 500, temperature = 0.7 } = body;
    // Hard ceiling — max_tokens was previously passed straight through with
    // no upper bound, which was fine when every caller was an authenticated
    // owner-dashboard feature. Now that anonymous callers can reach this
    // function, an unbounded value is a cost-abuse vector.
    const safeMaxTokens = Math.min(Math.max(1, Number(max_tokens) || 500), 800);

    if (!GROQ_MODEL_WHITELIST.includes(model)) {
      return new Response(JSON.stringify({ error: 'Model not permitted.' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (!messages || !Array.isArray(messages)) {
      return new Response(JSON.stringify({ error: 'messages array is required.' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const groqResponse = await fetch(GROQ_BASE_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${groqApiKey}`,
      },
      body: JSON.stringify({ model, messages, max_tokens: safeMaxTokens, temperature }),
    });

    if (!groqResponse.ok) {
      const errText = await groqResponse.text();
      console.error('[groq-proxy] Groq API error:', groqResponse.status, errText);
      return new Response(JSON.stringify({ error: `Groq API error: ${groqResponse.status}` }), {
        status: groqResponse.status,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const data = await groqResponse.json();
    return new Response(JSON.stringify({
      success: true,
      content: data.choices?.[0]?.message?.content || '',
      model: data.model,
      usage: data.usage,
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (err) {
    console.error('[groq-proxy] Unexpected error:', err);
    return new Response(JSON.stringify({ error: 'Internal server error.' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
