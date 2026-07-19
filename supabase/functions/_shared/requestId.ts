/**
 * Smart Door — Shared Request/Correlation ID Helper
 * supabase/functions/_shared/requestId.ts
 *
 * PHASE 10 — OBSERVABILITY & RELIABILITY
 *
 * PRODUCTION GAP: nothing in this codebase generated or propagated a
 * correlation/trace id. A client-side error in services/monitoring.js and
 * whatever error an Edge Function logged while handling that same request
 * had no shared identifier — reconstructing a single logical request across
 * browser -> edge function -> DB during an incident meant manually lining
 * up timestamps.
 *
 * This is intentionally minimal: no distributed tracing system, no new
 * infrastructure — just a convention. Any Edge Function can:
 *   import { getOrCreateRequestId } from '../_shared/requestId.ts';
 *   const requestId = getOrCreateRequestId(req);
 * and echo it back via `X-Request-Id` on the response, and include it in
 * any error_logs / system_alerts row it writes (both now have a
 * `request_id` column — sql/62).
 */

/** Reads 'x-request-id' from the incoming request if the caller supplied one
 * (e.g. services/monitoring.js's monitor.getRequestId()); otherwise mints a
 * fresh one. Never throws. */
export function getOrCreateRequestId(req: Request): string {
  try {
    const incoming = req.headers.get('x-request-id');
    if (incoming && incoming.length <= 100) return incoming;
  } catch (_) { /* ignore malformed header */ }
  return generateRequestId();
}

export function generateRequestId(): string {
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  return 'req_' + Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

/** Merge a request id into an existing headers object for the response. */
export function withRequestIdHeader(headers: Record<string, string>, requestId: string): Record<string, string> {
  return { ...headers, 'X-Request-Id': requestId };
}
