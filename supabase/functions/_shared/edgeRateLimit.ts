/**
 * Smart Door — Shared Edge Rate Limiter
 * supabase/functions/_shared/edgeRateLimit.ts
 *
 * Production hardening (Phase 4): send-sms, send-whatsapp, and send-email
 * are all deployed with `--no-verify-jwt` (required so unauthenticated
 * flows like OTP delivery and cron jobs can call them) and, before this
 * change, had NO rate limiting of their own. That combination meant any
 * caller who knew the public function URL could trigger unlimited paid
 * SMS/WhatsApp/email sends to arbitrary recipients — a real cost-abuse
 * and spam vector, not a theoretical one.
 *
 * This is the same in-memory sliding-window pattern already used in
 * verify-pin/index.ts (per-instance, resets on cold start), factored out
 * so every notification-dispatch function shares one implementation
 * instead of re-inlining it. It is a first line of defense — an instance
 * restart clears it — but it costs nothing, requires no schema change,
 * and stops the common case (a script hammering the endpoint) cold.
 *
 * NOT a replacement for the DB-backed check_rate_limit()/pin_lockouts
 * pattern used elsewhere for security-critical paths; those remain
 * server-authoritative because they persist across cold starts.
 */

const _buckets = new Map<string, number[]>();

// Periodically forget old keys so this Map can't grow unbounded across a
// long-lived instance lifetime.
let _lastSweep = Date.now();
const SWEEP_INTERVAL_MS = 10 * 60_000;

function _sweep(maxAgeMs: number) {
  const now = Date.now();
  if (now - _lastSweep < SWEEP_INTERVAL_MS) return;
  _lastSweep = now;
  for (const [key, list] of _buckets.entries()) {
    const kept = list.filter((t) => now - t < maxAgeMs);
    if (kept.length === 0) _buckets.delete(key);
    else _buckets.set(key, kept);
  }
}

/**
 * @param key        bucket key, e.g. `send-sms:otp:${phone}` or `send-sms:ip:${ip}`
 * @param windowMs   sliding window size in ms
 * @param max        max allowed events within the window
 * @returns true if allowed (and records this attempt), false if over the limit
 */
export function allowEdgeRequest(key: string, windowMs: number, max: number): boolean {
  _sweep(windowMs);
  const now = Date.now();
  const list = (_buckets.get(key) || []).filter((t) => now - t < windowMs);
  if (list.length >= max) {
    _buckets.set(key, list); // keep filtered list so it doesn't grow unbounded
    return false;
  }
  list.push(now);
  _buckets.set(key, list);
  return true;
}

/** Best-effort caller IP from standard proxy headers (Supabase sits behind one). */
export function callerIp(req: Request): string {
  return (
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    req.headers.get('cf-connecting-ip') ||
    'unknown'
  );
}
