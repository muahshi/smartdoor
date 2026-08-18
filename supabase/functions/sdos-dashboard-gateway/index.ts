/**
 * Smart Door — Edge Function: sdos-dashboard-gateway
 * supabase/functions/sdos-dashboard-gateway/index.ts
 *
 * PHASE 17 — Secure SDOS Dashboard Read Gateway.
 *
 * The one and only browser-reachable entry point into the Phase 16
 * isolated reader (`ai/integrations/supabase/sdosEventsReader.js`).
 * Authenticated, read-only, capability-scoped — exactly the three
 * named Phase 16 capabilities and nothing else.
 *
 *   Browser (ai/dashboard/)
 *         |  Authorization: Bearer <admin session token>
 *         v
 *   sdos-dashboard-gateway  (this file — Deno/HTTP/auth wrapper only)
 *         v
 *   gatewayLogic.js  (pure capability allow-list + validation + dispatch)
 *         v
 *   sdosEventsReader.js  (unmodified, Phase 16)
 *         v
 *   sdos_events / sdos_event_lifecycle
 *
 * AUTH: reuses the existing production admin-session pattern verbatim
 * — the same `verifyAdminSession()` / `adminCan()` / `restrictedCors()`
 * helpers every other authenticated admin Edge Function
 * (`admin-data`, `admin-analytics`, etc.) already uses. No new
 * authentication mechanism was invented for this phase.
 *
 * AUTHORIZATION: `adminCan(ctx, 'system', 'read')` — the same
 * resource/action pair `admin-data`'s `operations_health` handler
 * already gates on. Per the Phase 17 founder decision recorded in
 * ADR-0017, this is a deliberate reuse of an existing RBAC resource
 * key, not a new one — today only `super_admin` (via the `'*'`
 * wildcard) reaches it, because no migration grants the literal
 * `'system'` key to any other role; the door is left open for a
 * future role to be granted `system:read` without any code change
 * here.
 *
 * CAPABILITY MODEL: the request body's `capability` field must be one
 * of exactly three literal strings (see `gatewayLogic.js`), each
 * mapped to exactly one Phase 16 reader function and exactly one
 * fixed, hand-written allow-list of input fields. Any other
 * `capability` value, any field not on that capability's allow-list,
 * or a field of the wrong shape is rejected with 400 before the
 * reader is ever called — validated in `gatewayLogic.js`, not here.
 * There is no `/query`, `/table`, `/sql`, `/select-any`, or generic
 * reader anywhere in this gateway — grep this file and
 * `gatewayLogic.js`: the word "SELECT" does not appear, and no table
 * or SQL fragment of any kind is constructed in either file — every
 * actual query lives only inside sdosEventsReader.js, called as an
 * opaque function, never re-implemented.
 *
 * WRITE SURFACE: none. This file and `gatewayLogic.js` together import
 * exactly the three read functions from sdosEventsReader.js and
 * nothing else from it, call no `.insert(`/`.update(`/`.delete(`/
 * `.upsert(`/RPC of any kind themselves, and write no row to any
 * table (not even an audit log — see "Remaining Gaps" in ADR-0017 for
 * why that was deliberately left out of this phase's scope rather
 * than assumed).
 *
 * ERROR CONTRACT: outward-facing errors are always one of the
 * existing `{ success: false, message }` shapes `admin-data` already
 * uses for auth/validation failures, or — once a request has passed
 * auth + validation — the `ai/integrations/DATA_CONTRACTS.md`
 * `IntegrationResult` envelope (`outcome: 'OK' | 'EMPTY' |
 * 'INTEGRATION_ERROR'`), sanitized by `gatewayLogic.js`'s
 * `sanitizeResult()` so a raw reader error string never reaches the
 * browser as-is.
 *
 * EVENT BUS: not touched, not read, not checked.
 * `sdos_event_bus_enabled` remains FALSE and is irrelevant to this
 * file — reading event history is meaningful whether or not the bus
 * is currently enabled (same reasoning ADR-0016 already recorded for
 * the reader itself).
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { restrictedCors } from '../_shared/cors.ts';
import { getServiceClient, verifyAdminSession, adminCan, adminAuthError } from '../_shared/adminAuth.ts';
import { getOrCreateRequestId } from '../_shared/requestId.ts';
import { validateCapabilityRequest, dispatchCapability, sanitizeResult } from './gatewayLogic.js';

function safeJson(headers: Record<string, string>, status: number, body: Record<string, unknown>) {
  return Response.json(body, { status, headers });
}

serve(async (req) => {
  const headers = restrictedCors(req.headers.get('origin'));
  const requestId = getOrCreateRequestId(req);
  headers['X-Request-Id'] = requestId;

  if (req.method === 'OPTIONS') return new Response('ok', { headers });

  // Read-only, capability-scoped gateway — POST only (same convention
  // every existing authenticated admin Edge Function uses for a JSON
  // body; a GET-with-query-string variant would only add a second,
  // redundant input-parsing surface to keep in sync with this one).
  if (req.method !== 'POST') {
    return safeJson(headers, 405, { success: false, message: 'Method not allowed' });
  }

  const db = getServiceClient();

  let ctx;
  try {
    ctx = await verifyAdminSession(req, db);
  } catch (_e) {
    return adminAuthError(headers);
  }
  if (!ctx) return adminAuthError(headers);

  // AUTHORIZATION — see ADR-0017 "Founder Decision" for why this
  // specific resource/action pair, not a new one.
  if (!adminCan(ctx, 'system', 'read')) {
    return safeJson(headers, 403, { success: false, message: 'Permission denied' });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return safeJson(headers, 400, { success: false, message: 'Invalid JSON body' });
  }

  const validation = validateCapabilityRequest(body);
  if (!validation.ok) {
    return safeJson(headers, validation.status, { success: false, message: validation.message });
  }

  try {
    const result = await dispatchCapability(validation.capability, body, {}) as {
      outcome: 'OK' | 'EMPTY' | 'INTEGRATION_ERROR';
      data?: unknown;
      source?: string;
      fetched_at?: string;
      error?: string;
    };

    if (result.outcome === 'INTEGRATION_ERROR') {
      // Log the real reason server-side only (Edge Function logs) —
      // sanitizeResult() strips it from what goes to the browser.
      console.error(`[sdos-dashboard-gateway] ${requestId} capability=${validation.capability} INTEGRATION_ERROR:`, result.error);
    }

    return safeJson(headers, 200, { success: true, result: sanitizeResult(result) });
  } catch (err) {
    // Should not happen — every capability's reader function returns
    // an IntegrationResult and never throws. Caught anyway, fail
    // closed, no internal detail leaked.
    console.error(`[sdos-dashboard-gateway] ${requestId} capability=${validation.capability} unexpected error:`, err);
    return safeJson(headers, 500, { success: false, message: 'Server error. Please try again.' });
  }
});
