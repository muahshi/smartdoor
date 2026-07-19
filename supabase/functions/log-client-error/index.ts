/**
 * Smart Door — Edge Function: log-client-error
 * supabase/functions/log-client-error/index.ts
 *
 * PHASE 10 — OBSERVABILITY & RELIABILITY
 *
 * PRODUCTION GAP THIS FIXES:
 * error_logs (sql/09) has always had RLS policy
 *   "error_logs_no_public_access" ... FOR ALL TO anon, authenticated USING (false)
 * A `FOR ALL` policy with no explicit WITH CHECK reuses USING for the
 * insert-time check too — so `USING (false)` blocks INSERT as well as
 * SELECT/UPDATE/DELETE for anon/authenticated roles. services/monitoring.js's
 * _flushToDB() has always called `supabase.from('error_logs').insert(...)`
 * using the browser's anon/authenticated client — every one of those
 * inserts has been silently rejected by RLS since it was written (caught by
 * its own try/catch, logged only to the browser console). In effect, no
 * frontend warning/error/fatal event has ever actually reached the
 * database in production; the whole client-side observability pipeline
 * has been non-functional past the in-memory ring buffer + optional
 * Sentry passthrough.
 *
 * This function is the fix: a small, rate-limited, public endpoint (like
 * send-sms / send-whatsapp / health-check) that runs with the service role
 * and does the actual insert server-side, bypassing the (intentionally
 * strict, and otherwise-correct) RLS policy safely. No RLS policy is
 * changed — anon/authenticated clients still cannot read/write error_logs
 * or system_alerts directly, which is the correct security posture for a
 * table that will contain internal stack traces and metadata.
 *
 * Body: { events: LogEntry[], alert?: AlertPayload }
 *   LogEntry:  { level, category, message, meta?, sessionId?, userAgent?,
 *                url?, requestId?, ts? }
 *   AlertPayload (optional, sent alongside a batch that tripped a client-
 *   side threshold in services/monitoring.js): { alertKey, level, message,
 *   count, windowSecs, meta?, requestId? }
 *
 * Deploy: supabase functions deploy log-client-error --no-verify-jwt
 * (must be reachable from an unauthenticated visitor page too — a WebRTC
 * or QR-scan error on visitor.html is exactly the kind of thing this
 * needs to capture, and that page has no admin/user session.)
 */

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';
import { allowEdgeRequest, callerIp } from '../_shared/edgeRateLimit.ts';

const VALID_LEVELS = new Set(['debug', 'info', 'warn', 'error', 'fatal']);
const MAX_EVENTS_PER_BATCH = 50;
const MAX_STRING_LEN = 2000;

// Same cost-abuse concern as send-sms/send-whatsapp (public, --no-verify-jwt):
// cap volume per source IP so this can't be used to flood the DB / burn
// Postgres storage.
const PER_IP_WINDOW_MS = 60_000;
const PER_IP_MAX_BATCHES = 30; // 30 batches/min per IP (each up to 50 events)

function clip(s: unknown): string | null {
  if (typeof s !== 'string') return null;
  return s.slice(0, MAX_STRING_LEN);
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') {
    return Response.json({ success: false, error: 'Method not allowed' }, { status: 405, headers: corsHeaders });
  }

  const ip = callerIp(req);
  if (!allowEdgeRequest(`log-client-error:ip:${ip}`, PER_IP_WINDOW_MS, PER_IP_MAX_BATCHES)) {
    // Fail quiet (200) — a client-side logger should never surface a loud
    // error to the user just because its own telemetry got throttled.
    return Response.json({ success: true, throttled: true }, { status: 200, headers: corsHeaders });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return Response.json({ success: false, error: 'Invalid JSON body' }, { status: 400, headers: corsHeaders });
  }

  const rawEvents = Array.isArray(body.events) ? body.events : [];
  const events = rawEvents.slice(0, MAX_EVENTS_PER_BATCH);

  const rows = events
    .filter((e: any) => e && VALID_LEVELS.has(e.level))
    .map((e: any) => ({
      level:       e.level,
      category:    clip(e.category) || 'system',
      message:     clip(e.message) || '(no message)',
      meta:        typeof e.meta === 'object' && e.meta !== null ? e.meta : {},
      session_id:  clip(e.sessionId),
      user_agent:  clip(e.userAgent),
      url:         clip(e.url),
      request_id:  clip(e.requestId),
      created_at:  typeof e.ts === 'string' ? e.ts : new Date().toISOString(),
    }));

  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

  let inserted = 0;
  if (rows.length) {
    const { error, count } = await db.from('error_logs').insert(rows, { count: 'exact' });
    if (error) {
      console.error('[log-client-error] insert failed:', error.message);
      return Response.json({ success: false, error: 'Could not persist events' }, { status: 500, headers: corsHeaders });
    }
    inserted = count ?? rows.length;
  }

  // Optional: a threshold-breach alert riding along with this batch.
  let alertRecorded = false;
  const alert = body.alert as Record<string, unknown> | undefined;
  if (alert && typeof alert.alertKey === 'string' && typeof alert.message === 'string') {
    const { error: alertErr } = await db.from('system_alerts').insert({
      alert_key:   clip(alert.alertKey),
      level:       alert.level === 'critical' ? 'critical' : 'warning',
      message:     clip(alert.message),
      count:       Number.isFinite(alert.count) ? Number(alert.count) : 1,
      window_secs: Number.isFinite(alert.windowSecs) ? Number(alert.windowSecs) : null,
      meta:        typeof alert.meta === 'object' && alert.meta !== null ? alert.meta : {},
      source:      'client',
      request_id:  clip(alert.requestId),
    });
    if (alertErr) {
      console.error('[log-client-error] alert insert failed:', alertErr.message);
    } else {
      alertRecorded = true;
    }
  }

  return Response.json({ success: true, inserted, alertRecorded }, { status: 200, headers: corsHeaders });
});
