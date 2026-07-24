/**
 * Smart Door — Groq Proxy Edge Function
 * supabase/functions/groq-proxy/index.ts
 *
 * Proxies requests to Groq API so the GROQ_API_KEY
 * never leaves the server. Browser calls this function;
 * this function calls Groq.
 *
 * PHASE 3.1A — GROQ PROXY SECURITY HARDENING.
 * Until this phase, the only checks here were a model whitelist and a
 * per-IP rate limit — anyone who read the public function URL + anon key
 * out of the JS bundle (both necessarily public) could call this directly
 * with an arbitrary system prompt/messages array, bypassing the AI
 * Product Consultant and AI Receptionist widgets entirely. Added:
 *   1. AI session token required (see _shared/aiSessionAuth.ts +
 *      ai-session-token/index.ts) — call-site auth, not user auth.
 *   2. Origin allow-list enforced server-side (not just CORS headers).
 *   3. Request shape validation: message count/role/length caps.
 *   4. Outbound timeout on the Groq call itself.
 *   5. restrictedCors() instead of permissive '*' on responses.
 * None of this changes the request/response contract for legitimate
 * callers — same body in, same `{success, content, model, usage}` out.
 *
 * Deploy with: supabase functions deploy groq-proxy --no-verify-jwt
 * Required env:
 *   GROQ_API_KEY      (Groq API key, unchanged)
 *   AI_SESSION_SECRET (new — see ai-session-token/index.ts)
 */

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { restrictedCors, isAllowedOrigin } from '../_shared/cors.ts';
import { allowEdgeRequest, callerIp } from '../_shared/edgeRateLimit.ts';
import { verifyAiSessionToken } from '../_shared/aiSessionAuth.ts';

const GROQ_BASE_URL = 'https://api.groq.com/openai/v1/chat/completions';
const GROQ_MODEL_WHITELIST = ['llama3-70b-8192', 'llama3-8b-8192', 'mixtral-8x7b-32768', 'llama-3.3-70b-versatile', 'llama-3.1-8b-instant'];

// Same in-memory sliding-window limiter already used by send-sms/
// send-whatsapp/send-email/ai-session-token. First line of defense
// against a script hammering this endpoint and running up the Groq bill.
// Resets on cold start — not authoritative, just cheap and effective
// against the common case.
const PER_IP_WINDOW_MS = 60_000;
const PER_IP_MAX = 12;

// Request-shape caps (Phase 3.1A). Measured against real prompts before
// setting these: the AI Product Consultant's system prompt (product
// catalog + full knowledge-base JSON, js/aiConsultantKnowledge.js) runs
// ~6.2k chars today — MAX_MESSAGE_CHARS gives it room to grow as the
// catalog/KB grow without silently breaking. A receptionist
// classification system prompt is ~1.6-2.8k chars. These bound a
// direct-call abuse attempt; they are not meant to constrain any
// existing caller.
const MAX_MESSAGES = 40;
const MAX_SYSTEM_MESSAGES = 1;
const MAX_MESSAGE_CHARS = 12000; // per message
const MAX_TOTAL_CHARS = 24000; // across all messages combined
const ALLOWED_ROLES = new Set(['system', 'user', 'assistant']);

const GROQ_FETCH_TIMEOUT_MS = 15000;

function jsonError(message: string, status: number, headers: Record<string, string>) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { ...headers, 'Content-Type': 'application/json' },
  });
}

function validateMessages(messages: unknown): { ok: true } | { ok: false; error: string } {
  if (!messages || !Array.isArray(messages)) return { ok: false, error: 'messages array is required.' };
  if (messages.length === 0) return { ok: false, error: 'messages array cannot be empty.' };
  if (messages.length > MAX_MESSAGES) return { ok: false, error: 'Too many messages.' };

  let systemCount = 0;
  let totalChars = 0;
  for (const m of messages) {
    if (!m || typeof m !== 'object') return { ok: false, error: 'Invalid message entry.' };
    const { role, content } = m as { role?: unknown; content?: unknown };
    if (typeof role !== 'string' || !ALLOWED_ROLES.has(role)) return { ok: false, error: 'Invalid message role.' };
    if (typeof content !== 'string') return { ok: false, error: 'Message content must be a string.' };
    if (content.length > MAX_MESSAGE_CHARS) return { ok: false, error: 'Message too long.' };
    if (role === 'system') systemCount++;
    totalChars += content.length;
  }
  if (systemCount > MAX_SYSTEM_MESSAGES) return { ok: false, error: 'Too many system messages.' };
  if (totalChars > MAX_TOTAL_CHARS) return { ok: false, error: 'Combined message content too long.' };

  return { ok: true };
}

serve(async (req: Request) => {
  const origin = req.headers.get('origin');

  // OPTIONS/preflight: respond before any auth so browsers can complete
  // the CORS handshake, same as every other function here.
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: restrictedCors(origin) });
  }

  const headers = restrictedCors(origin);

  try {
    // ── Origin verification ──────────────────────────────────────────
    if (!isAllowedOrigin(origin)) {
      console.warn(`[groq-proxy] rejected origin: ${origin || '(none)'}`);
      return jsonError('Origin not permitted.', 403, headers);
    }

    // ── Per-IP rate limit ────────────────────────────────────────────
    const ip = callerIp(req);
    if (!allowEdgeRequest(`groq-proxy:ip:${ip}`, PER_IP_WINDOW_MS, PER_IP_MAX)) {
      return jsonError('Too many requests. Please wait a moment and try again.', 429, headers);
    }

    // ── AI session token ─────────────────────────────────────────────
    const sessionToken = req.headers.get('x-ai-session-token');
    const auth = await verifyAiSessionToken(sessionToken, origin);
    if (!auth.ok) {
      console.warn(`[groq-proxy] rejected token: ${auth.reason} ip=${ip}`);
      return jsonError('Unauthorized.', 401, headers);
    }

    const groqApiKey = Deno.env.get('GROQ_API_KEY');
    if (!groqApiKey) {
      console.error('[groq-proxy] GROQ_API_KEY not configured.');
      return jsonError('Groq API key not configured on server.', 500, headers);
    }

    let body: Record<string, unknown>;
    try {
      body = await req.json();
    } catch {
      return jsonError('Invalid JSON body.', 400, headers);
    }

    const { messages, model = 'llama-3.3-70b-versatile', max_tokens = 500, temperature = 0.7 } = body;

    if (!GROQ_MODEL_WHITELIST.includes(model as string)) {
      return jsonError('Model not permitted.', 400, headers);
    }

    const validation = validateMessages(messages);
    if (!validation.ok) {
      return jsonError(validation.error, 400, headers);
    }

    // Hard ceiling — max_tokens/temperature are caller-supplied; bound
    // both rather than passing through unchecked.
    const safeMaxTokens = Math.min(Math.max(1, Number(max_tokens) || 500), 800);
    const numTemperature = Number(temperature);
    const safeTemperature = Number.isFinite(numTemperature) ? Math.min(Math.max(0, numTemperature), 1.5) : 0.7;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), GROQ_FETCH_TIMEOUT_MS);

    let groqResponse: Response;
    try {
      groqResponse = await fetch(GROQ_BASE_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${groqApiKey}`,
        },
        body: JSON.stringify({ model, messages, max_tokens: safeMaxTokens, temperature: safeTemperature }),
        signal: controller.signal,
      });
    } catch (fetchErr) {
      if ((fetchErr as { name?: string }).name === 'AbortError') {
        console.error('[groq-proxy] Groq API call timed out.');
        return jsonError('Groq API timed out.', 504, headers);
      }
      throw fetchErr;
    } finally {
      clearTimeout(timeoutId);
    }

    if (!groqResponse.ok) {
      const errText = await groqResponse.text();
      console.error('[groq-proxy] Groq API error:', groqResponse.status, errText.slice(0, 300));
      return jsonError(`Groq API error: ${groqResponse.status}`, groqResponse.status, headers);
    }

    const data = await groqResponse.json();
    return new Response(JSON.stringify({
      success: true,
      content: data.choices?.[0]?.message?.content || '',
      model: data.model,
      usage: data.usage,
    }), {
      status: 200,
      headers: { ...headers, 'Content-Type': 'application/json' },
    });

  } catch (err) {
    console.error('[groq-proxy] Unexpected error:', err);
    return jsonError('Internal server error.', 500, headers);
  }
});
