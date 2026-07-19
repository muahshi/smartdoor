/**
 * Smart Door — _shared/callbackAuth.ts
 *
 * SECURITY HARDENING (Phase 9):
 * call-status-webhook previously accepted status updates for any call_id
 * with zero request authentication — no Twilio/Exotel signature check of
 * any kind. Since call_id is passed back in the provider's callback URL,
 * anyone who obtained or guessed a call_logs UUID could POST arbitrary
 * status transitions to that endpoint.
 *
 * Neither Twilio (in this codebase's simple Voice-callback usage) nor
 * Exotel natively sign their status callbacks in a way already wired up
 * here, so instead we mint our own short-lived HMAC token per call at the
 * moment initiate-call creates the callback URL, and require it back on
 * every call-status-webhook request. This is a minimal, additive check —
 * it doesn't change either provider integration.
 */

const encoder = new TextEncoder();

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

/** Signs a call_id for embedding in the provider callback URL. */
export async function signCallCallback(callId: string): Promise<string | null> {
  const secret = Deno.env.get('CALL_WEBHOOK_SECRET');
  if (!secret) return null;
  return hmacHex(secret, callId);
}

/** Verifies a call_id + signature pair from an incoming callback request. */
export async function verifyCallCallback(callId: string, sig: string | null): Promise<boolean> {
  const secret = Deno.env.get('CALL_WEBHOOK_SECRET');
  if (!secret) {
    console.error('[callbackAuth] CALL_WEBHOOK_SECRET not configured — rejecting callback for safety.');
    return false;
  }
  if (!sig) return false;
  const expected = await hmacHex(secret, callId);
  return timingSafeEqual(expected, sig);
}
