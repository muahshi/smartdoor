/**
 * Smart Door — _shared/aiSessionAuth.ts
 * PHASE 3.1A — GROQ PROXY SECURITY HARDENING
 *
 * Problem: groq-proxy is deployed --no-verify-jwt (required — the AI
 * Product Consultant and AI Receptionist are anonymous, pre-login
 * surfaces) and is called with the Supabase anon key, which is public by
 * design. That combination meant nothing distinguished a real page
 * calling groq-proxy through the intended widgets from a script that
 * just read the public function URL + anon key out of the bundle and
 * called it directly with an arbitrary system prompt.
 *
 * Fix: a short-lived HMAC-signed token, minted only for allow-listed
 * origins (see cors.ts isAllowedOrigin) by the new ai-session-token
 * function, required on every groq-proxy call. Same signing pattern as
 * signCallCallback/verifyCallCallback in callbackAuth.ts — kept as a
 * separate module rather than generalizing that one, since call_id
 * signing and this have different payload shapes and call sites.
 *
 * This is call-site authentication, not user authentication:
 *   - It proves the caller first passed the Origin allow-list and asked
 *     for a token within the last few minutes.
 *   - It does NOT identify a person — these flows have no login.
 *   - A determined attacker who reverse-engineers the flow can still
 *     mint their own token (nothing stops that with a public, anonymous
 *     flow) — this raises the bar from "curl the URL" to "reimplement
 *     the token dance", and combines with per-IP rate limiting and
 *     request validation in groq-proxy for defense in depth.
 */

const encoder = new TextEncoder();

/** 5 minutes: long enough for one consultant/receptionist session, short enough to bound a leaked token. */
const TOKEN_TTL_SECONDS = 300;

async function hmacHex(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sigBuf = await crypto.subtle.sign('HMAC', key, encoder.encode(message));
  return Array.from(new Uint8Array(sigBuf)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function b64url(input: string): string {
  return btoa(input).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromB64url(input: string): string {
  const padded = input.replace(/-/g, '+').replace(/_/g, '/');
  const pad = padded.length % 4 === 0 ? '' : '='.repeat(4 - (padded.length % 4));
  return atob(padded + pad);
}

/** Mints a short-lived token scoped to the requesting origin. Returns null if AI_SESSION_SECRET isn't configured. */
export async function mintAiSessionToken(origin: string): Promise<string | null> {
  const secret = Deno.env.get('AI_SESSION_SECRET');
  if (!secret) {
    console.error('[aiSessionAuth] AI_SESSION_SECRET not configured — refusing to mint.');
    return null;
  }
  const payload = {
    o: origin || '',
    exp: Math.floor(Date.now() / 1000) + TOKEN_TTL_SECONDS,
    n: crypto.randomUUID(),
  };
  const payloadStr = JSON.stringify(payload);
  const sig = await hmacHex(secret, payloadStr);
  return `${b64url(payloadStr)}.${sig}`;
}

/** Verifies a token: signature valid, not expired, and bound to the caller's current origin. */
export async function verifyAiSessionToken(
  token: string | null,
  origin: string | null,
): Promise<{ ok: boolean; reason?: string }> {
  const secret = Deno.env.get('AI_SESSION_SECRET');
  if (!secret) return { ok: false, reason: 'not_configured' };
  if (!token) return { ok: false, reason: 'missing' };

  const dot = token.indexOf('.');
  if (dot <= 0 || dot === token.length - 1) return { ok: false, reason: 'malformed' };
  const payloadPart = token.slice(0, dot);
  const sig = token.slice(dot + 1);

  let payloadStr: string;
  try {
    payloadStr = fromB64url(payloadPart);
  } catch {
    return { ok: false, reason: 'malformed' };
  }

  const expected = await hmacHex(secret, payloadStr);
  if (!timingSafeEqual(expected, sig)) return { ok: false, reason: 'bad_signature' };

  let payload: { o: string; exp: number; n: string };
  try {
    payload = JSON.parse(payloadStr);
  } catch {
    return { ok: false, reason: 'malformed' };
  }

  if (typeof payload.exp !== 'number' || Math.floor(Date.now() / 1000) > payload.exp) {
    return { ok: false, reason: 'expired' };
  }

  // Origin binding — a token minted for one site can't be replayed from another.
  if ((payload.o || '') !== (origin || '')) return { ok: false, reason: 'origin_mismatch' };

  return { ok: true };
}
