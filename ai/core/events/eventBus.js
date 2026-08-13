/**
 * SDOS — Event Bus (Phase 14A)
 * ai/core/events/eventBus.js
 *
 * The first runtime implementation of ai/core/events/EVENT_BUS.md,
 * scoped exactly to Phase 14A: EVENT → Validate → Authorize → Persist →
 * Broadcast → Audit. Nothing beyond this — no reasoning, no task
 * delegation, no inter-agent execution (see the Phase 14A brief's
 * "IMPORTANT: NO AUTONOMY" section).
 *
 * This file never touches Supabase directly — every read/write goes
 * through ai/integrations/supabase/sdosEventsStore.js, per
 * ai/core/permissions/SECURITY_MODEL.md constraint 1.
 *
 * SDOS may RECEIVE/STORE/PROPAGATE events only. This module never
 * modifies an order, payment, customer, or product, never sends a
 * customer communication, and never triggers a production workflow —
 * emitEvent() has no side effect beyond writing to SDOS's own two
 * tables and a dedicated Realtime channel (PRODUCTION_BOUNDARY.md).
 */

import * as store from '../../integrations/supabase/sdosEventsStore.js';

// ── Identity (SECURITY_IMPLEMENTATION_PLAN.md "Agent Identity") ──────────
// A fixed, non-runtime-editable constant list — never derived from the
// event payload or any other caller-supplied input. Matches the six
// registered role_ids (ai/core/registry/EXECUTIVE_REGISTRY.md) plus the
// core system components EVENT_BUS.md's own event-type table names as
// emitters (runtime, router, permissions, tasks), plus a generic
// 'sdos-system' identity reserved for infrastructure-level emissions
// (e.g. this phase's own test/verification tooling) — never used to
// represent a customer, visitor, or SmartDoor production component.
export const ALLOWED_SOURCES = Object.freeze([
  'ceo', 'cfo', 'cmo', 'coo', 'cpo', 'cto',
  'runtime', 'router', 'permissions', 'tasks',
  'sdos-system',
]);

export const ALLOWED_PRIORITIES = Object.freeze(['normal', 'high', 'critical']);

// Foundational event types EVENT_BUS.md Phase 9 already names. Not an
// exhaustive allow-list — EVENT_CATALOG.md and EVENT_BUS.md's own Rule 1
// are explicit that new types are additive. Validation below only checks
// *shape* (namespace.action, lowercase, dot-separated) for any type not
// in this list, never rejects an otherwise well-formed, unrecognized
// type — rejecting unknown-but-well-formed types would make this module
// a second, competing source of truth for the catalog, which
// EVENT_CATALOG.md Rule 1 already forbids duplicating.
const KNOWN_EVENT_TYPES = new Set([
  'lifecycle.transition',
  'task.created', 'task.assigned', 'task.resolved',
  'permission.checked',
  'error.raised',
  'approval.requested', 'approval.decided',
]);

const EVENT_TYPE_SHAPE = /^[a-z][a-z0-9_]*\.[a-z][a-z0-9_]*$/;

// Defense-in-depth per SECURITY_IMPLEMENTATION_PLAN.md "Technical
// Secrets" / "Financial Data": a payload must never carry a raw secret,
// credential, or (per EVENT_CATALOG.md's banding rule) an unbanded
// financial figure. This module cannot know every future event type's
// exact schema, so it enforces the one thing it CAN check generically —
// key names that are near-universally secret-shaped — as a floor, not a
// substitute for each future event type's own documented "Minimum
// payload" once ai/integrations/ read paths exist to populate one.
const FORBIDDEN_PAYLOAD_KEYS = /^(password|secret|token|api[_-]?key|credential|ssn|ccnum|card[_-]?number|cvv)$/i;

const MAX_PAYLOAD_BYTES = 8192; // generous for banded/referenced fields; nowhere near a raw record dump

function nowIso() {
  return new Date().toISOString();
}

function isPlainObject(v) {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function payloadContainsForbiddenKey(payload, depth = 0) {
  if (depth > 5 || !isPlainObject(payload)) return false;
  for (const [k, v] of Object.entries(payload)) {
    if (FORBIDDEN_PAYLOAD_KEYS.test(k)) return k;
    if (isPlainObject(v)) {
      const nested = payloadContainsForbiddenKey(v, depth + 1);
      if (nested) return nested;
    }
  }
  return false;
}

/**
 * Stage 1: Validate. Pure function — no I/O. Checks EVENT_BUS.md's
 * Event object shape and this module's own data-minimization floor.
 * Returns { ok: true } or { ok: false, reason }.
 */
export function validateEvent(input) {
  if (!isPlainObject(input)) return { ok: false, reason: 'malformed_payload: event must be an object' };
  if (typeof input.event_type !== 'string' || !input.event_type) {
    return { ok: false, reason: 'malformed_payload: event_type is required' };
  }
  if (!KNOWN_EVENT_TYPES.has(input.event_type) && !EVENT_TYPE_SHAPE.test(input.event_type)) {
    return { ok: false, reason: `malformed_payload: event_type "${input.event_type}" is not namespace.action-shaped` };
  }
  if (typeof input.source !== 'string' || !input.source) {
    return { ok: false, reason: 'malformed_payload: source is required' };
  }
  if (input.session_id !== undefined && input.session_id !== null && typeof input.session_id !== 'string') {
    return { ok: false, reason: 'malformed_payload: session_id must be a string' };
  }
  if (input.correlation_id !== undefined && input.correlation_id !== null && typeof input.correlation_id !== 'string') {
    return { ok: false, reason: 'malformed_payload: correlation_id must be a string' };
  }
  // approval.* and task.* events participate in a multi-event lifecycle
  // EVENT_BUS.md expects to be traceable by correlation_id — missing one
  // here is a validation failure, not a silent gap (Phase 14A brief,
  // test scenario 8: "missing correlation ID where required").
  if ((input.event_type.startsWith('task.') || input.event_type.startsWith('approval.'))
      && !input.correlation_id) {
    return { ok: false, reason: `missing_correlation_id: ${input.event_type} requires correlation_id` };
  }
  if (input.priority !== undefined && !ALLOWED_PRIORITIES.includes(input.priority)) {
    return { ok: false, reason: `malformed_payload: priority must be one of ${ALLOWED_PRIORITIES.join(', ')}` };
  }
  const payload = input.payload ?? {};
  if (!isPlainObject(payload)) {
    return { ok: false, reason: 'malformed_payload: payload must be an object' };
  }
  let payloadBytes;
  try {
    payloadBytes = JSON.stringify(payload).length;
  } catch (err) {
    return { ok: false, reason: 'malformed_payload: payload is not JSON-serializable' };
  }
  if (payloadBytes > MAX_PAYLOAD_BYTES) {
    return { ok: false, reason: `malformed_payload: payload exceeds ${MAX_PAYLOAD_BYTES} bytes` };
  }
  const forbiddenKey = payloadContainsForbiddenKey(payload);
  if (forbiddenKey) {
    return { ok: false, reason: `malformed_payload: payload key "${forbiddenKey}" looks like a secret; secrets are never carried in an event (SECURITY_BOUNDARIES.md)` };
  }
  return { ok: true };
}

/**
 * Stage 2: Authorize. Pure function — no I/O, no capability grant.
 * Per SECURITY_BOUNDARIES.md extension 1, this NEVER expands what a
 * source may do beyond confirming its identity is one of the fixed,
 * structural ALLOWED_SOURCES — it is not (and, until PERMISSION_MODEL.md
 * has a runtime implementation, cannot yet be) a full authority-matrix
 * check. This is this phase's honest, minimal Authorize step; a future
 * phase wiring EVENT_BUS.md to PERMISSION_MODEL.md replaces this
 * function's body, not eventBus.js's pipeline shape.
 */
export function authorizeEvent(input) {
  if (!ALLOWED_SOURCES.includes(input.source)) {
    return { ok: false, reason: `unauthorized_source: "${input.source}" is not a registered SDOS source` };
  }
  return { ok: true };
}

/**
 * emitEvent — the single entry point a future caller (an executive's
 * runtime turn, a permission check, a task transition) uses. Every
 * stage below is traced to sdos_event_lifecycle, per EVENT_BUS.md's
 * audit requirement, before this function returns.
 *
 * @param {object} input - { event_type, source, session_id?, correlation_id?, priority?, payload? }
 * @param {object} deps - injection seam for tests: { store, isEnabledOverride }
 * @returns {Promise<object>} EmitResult — { outcome, event_id, stage, reason?, event?, broadcast? }
 */
export async function emitEvent(input, deps = {}) {
  const s = deps.store || store;
  const event_id = (input && input.event_id) || (globalThis.crypto?.randomUUID?.() ?? cryptoRandomUUIDFallback());

  // Golden Rule 17 / this phase's kill switch: disabled means a
  // complete no-op — no lifecycle row, no event row, nothing written
  // anywhere. This is deliberately the ONE stage that produces no
  // audit trail at all, because when the bus is off, "SDOS wrote
  // nothing" is the entire, correctly-empty story.
  const enabled = deps.isEnabledOverride ?? await s.isEventBusEnabled();
  if (!enabled) {
    return { outcome: 'DISABLED', event_id, stage: 'received' };
  }

  await s.appendLifecycleStage({ event_id, stage: 'received', correlation_id: input?.correlation_id });

  const validation = validateEvent(input);
  if (!validation.ok) {
    await s.appendLifecycleStage({ event_id, stage: 'validation_failed', detail: validation.reason, correlation_id: input?.correlation_id });
    return { outcome: 'REJECTED', event_id, stage: 'validate', reason: validation.reason };
  }
  await s.appendLifecycleStage({ event_id, stage: 'validated', correlation_id: input.correlation_id });

  const authorization = authorizeEvent(input);
  if (!authorization.ok) {
    await s.appendLifecycleStage({ event_id, stage: 'authorization_failed', detail: authorization.reason, correlation_id: input.correlation_id });
    return { outcome: 'REJECTED', event_id, stage: 'authorize', reason: authorization.reason };
  }
  await s.appendLifecycleStage({ event_id, stage: 'authorized', correlation_id: input.correlation_id });

  const event = {
    event_id,
    event_type: input.event_type,
    source: input.source,
    session_id: input.session_id ?? null,
    correlation_id: input.correlation_id ?? null,
    priority: input.priority ?? 'normal',
    payload: input.payload ?? {},
    emitted_at: nowIso(),
  };

  const persistResult = await s.insertEvent(event);
  if (persistResult.outcome === 'DUPLICATE') {
    await s.appendLifecycleStage({ event_id, stage: 'duplicate_detected', correlation_id: input.correlation_id });
    return { outcome: 'DUPLICATE', event_id, stage: 'persist', event: persistResult.data };
  }
  if (persistResult.outcome !== 'OK') {
    await s.appendLifecycleStage({ event_id, stage: 'persistence_failed', detail: persistResult.error, correlation_id: input.correlation_id });
    // Delivery Contract Rule 3: no event is silently dropped. A
    // persistence failure is reported back to the caller as a hard
    // failure, not swallowed — the caller's own error-handling path
    // (a future error.raised emission) decides what happens next; this
    // module does not recursively emit an event about its own failure
    // to avoid an unbounded retry loop for a single broken write.
    return { outcome: 'PERSISTENCE_FAILED', event_id, stage: 'persist', reason: persistResult.error };
  }
  await s.appendLifecycleStage({ event_id, stage: 'persisted', correlation_id: input.correlation_id });

  await s.appendLifecycleStage({ event_id, stage: 'broadcast_attempted', correlation_id: input.correlation_id });
  const broadcastResult = await s.broadcastEvent(event);
  if (broadcastResult.outcome === 'OK') {
    await s.appendLifecycleStage({ event_id, stage: 'broadcast_succeeded', correlation_id: input.correlation_id });
  } else {
    // Broadcast failure never invalidates the already-persisted event —
    // EVENT_BUS.md Delivery Contract: "Persistence remains the source
    // of truth." A future consumer falls back to reading sdos_events.
    await s.appendLifecycleStage({ event_id, stage: 'broadcast_failed', detail: broadcastResult.error, correlation_id: input.correlation_id });
  }

  return {
    outcome: 'OK',
    event_id,
    stage: 'complete',
    event: persistResult.data,
    broadcast: broadcastResult.outcome,
  };
}

function cryptoRandomUUIDFallback() {
  // Only reached in an environment without globalThis.crypto.randomUUID
  // (older Node without --experimental-global-webcrypto). Not used in
  // any Deno Edge Function context, where crypto.randomUUID is always
  // present.
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export default { emitEvent, validateEvent, authorizeEvent, ALLOWED_SOURCES, ALLOWED_PRIORITIES };
