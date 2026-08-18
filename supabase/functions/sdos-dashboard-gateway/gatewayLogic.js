/**
 * SDOS Dashboard Gateway — Pure Capability/Validation Logic (Phase 17)
 * supabase/functions/sdos-dashboard-gateway/gatewayLogic.js
 *
 * Factored out of index.ts so the capability allow-list, field
 * validation, dispatch, and error-sanitization logic — the actual
 * security-relevant surface of the gateway — can be unit tested the
 * same way `ai/integrations/supabase/sdosEventsReader.js` already is:
 * plain ESM, no Deno-only import (`https://deno.land/...`,
 * `Deno.env`), dependency-injectable, importable from plain Node.
 *
 * `index.ts` imports this file for everything except the parts that
 * are inherently Deno/HTTP/Supabase-session-specific (CORS headers,
 * `verifyAdminSession`, `adminCan`, the `serve()` wrapper itself) —
 * those stay in index.ts and are exercised by the existing production
 * pattern every other admin Edge Function already relies on
 * (unit-testing `verifyAdminSession` itself is outside this repo's
 * existing test convention — no Edge Function's Deno-only auth
 * wrapper is Node-unit-tested anywhere in this repository today; see
 * ADR-0017 "Test Strategy").
 *
 * This file performs no write of any kind, imports only the three
 * named Phase 16 reader capabilities, and accepts no table/SQL/
 * arbitrary-query parameter from a caller — identical guarantees to
 * sdosEventsReader.js itself, one layer up.
 */

import {
  getRecentSdosEvents,
  getSdosEventById,
  getSdosEventLifecycle,
} from '../../../ai/integrations/supabase/sdosEventsReader.js';

// ── Capability allow-list — the ONLY three requestable capabilities ──
// Each entry names its own exact accepted-field set. `run` is the only
// place a capability is mapped to a reader function; deps.reader lets
// tests inject fakes exactly like sdosEventsReader.js's own deps.db/
// deps.client seam, without ever touching a real credential.
export const CAPABILITIES = {
  'sdos_events.recent': {
    fields: new Set(['capability', 'limit', 'event_type', 'correlation_id']),
    run: (input, deps = {}) => (deps.getRecentSdosEvents || getRecentSdosEvents)({
      limit: input.limit,
      event_type: input.event_type,
      correlation_id: input.correlation_id,
    }, deps.readerDeps || {}),
  },
  'sdos_events.by_id': {
    fields: new Set(['capability', 'event_id']),
    run: (input, deps = {}) => (deps.getSdosEventById || getSdosEventById)({
      event_id: input.event_id,
    }, deps.readerDeps || {}),
  },
  'sdos_event_lifecycle.by_event': {
    fields: new Set(['capability', 'event_id']),
    run: (input, deps = {}) => (deps.getSdosEventLifecycle || getSdosEventLifecycle)({
      event_id: input.event_id,
    }, deps.readerDeps || {}),
  },
};

export const ALLOWED_CAPABILITIES = Object.keys(CAPABILITIES);

/**
 * Validates a parsed JSON request body against the capability
 * allow-list, before any reader function is ever called. Returns
 * `{ ok: true, capability }` or `{ ok: false, status, message }`.
 * Never throws.
 */
export function validateCapabilityRequest(body) {
  if (body === null || typeof body !== 'object' || Array.isArray(body)) {
    return { ok: false, status: 400, message: 'Request body must be a JSON object' };
  }

  const capability = body.capability;
  if (typeof capability !== 'string' || !Object.prototype.hasOwnProperty.call(CAPABILITIES, capability)) {
    return {
      ok: false,
      status: 400,
      message: `Unknown or missing capability. Allowed: ${ALLOWED_CAPABILITIES.join(', ')}`,
    };
  }

  const spec = CAPABILITIES[capability];
  const unknownFields = Object.keys(body).filter((k) => !spec.fields.has(k));
  if (unknownFields.length > 0) {
    return { ok: false, status: 400, message: `Unknown field(s) for capability '${capability}': ${unknownFields.join(', ')}` };
  }

  if (capability === 'sdos_events.recent') {
    const { limit, event_type, correlation_id } = body;
    if (limit !== undefined && (!Number.isInteger(limit) || limit < 1 || limit > 200)) {
      return { ok: false, status: 400, message: 'limit must be an integer between 1 and 200' };
    }
    if (event_type !== undefined && typeof event_type !== 'string') {
      return { ok: false, status: 400, message: 'event_type must be a string' };
    }
    if (correlation_id !== undefined && typeof correlation_id !== 'string') {
      return { ok: false, status: 400, message: 'correlation_id must be a string' };
    }
  } else {
    const { event_id } = body;
    if (typeof event_id !== 'string' || event_id.trim().length === 0) {
      return { ok: false, status: 400, message: 'event_id must be a non-empty string' };
    }
  }

  return { ok: true, capability };
}

/**
 * Calls the reader function for an already-validated capability.
 * `deps` supports the same fake-injection pattern the reader's own
 * tests use — see gatewayLogic-test.js.
 */
export async function dispatchCapability(capability, body, deps = {}) {
  return CAPABILITIES[capability].run(body, deps);
}

/**
 * Sanitizes an IntegrationResult before it is allowed to reach the
 * browser: on INTEGRATION_ERROR, the raw reader error string is
 * replaced with a fixed, generic message — defense in depth on top of
 * sdosEventsReader.js's own guarantee that it never puts a credential
 * in `error` to begin with. Returns the shape the gateway sends as
 * `result` in its JSON response.
 */
export function sanitizeResult(result) {
  if (result.outcome === 'INTEGRATION_ERROR') {
    return {
      outcome: 'INTEGRATION_ERROR',
      source: result.source,
      fetched_at: result.fetched_at,
      error: 'Read failed. See server-side function logs for details.',
    };
  }
  return {
    outcome: result.outcome,
    data: result.data,
    source: result.source,
    fetched_at: result.fetched_at,
  };
}

export default { CAPABILITIES, ALLOWED_CAPABILITIES, validateCapabilityRequest, dispatchCapability, sanitizeResult };
