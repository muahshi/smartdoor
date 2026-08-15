/**
 * SDOS — Controlled Runtime Caller (Phase 14B)
 * ai/core/runtime/runtimeCaller.js
 *
 * The smallest legitimate caller of ai/core/events/eventBus.js#emitEvent()
 * that actually exercises Runtime → Event Bus → Validate → Authorize →
 * Persist → Broadcast → Audit end to end, per Phase 14B Objective 4.
 *
 * This is deliberately NOT an executive, NOT a task processor, and NOT
 * a general-purpose "emit any event" helper. It emits exactly one
 * infrastructure-level event — proof the pipeline works — and nothing
 * else:
 *
 *   - event_type:  'lifecycle.transition' (already a KNOWN_EVENT_TYPES
 *     entry in eventBus.js, so this adds no new type to the catalog)
 *   - source:      'sdos-system' (the identity eventBus.js's own
 *     ALLOWED_SOURCES comment reserves for "infrastructure-level
 *     emissions... never used to represent a customer, visitor, or
 *     SmartDoor production component" — chosen specifically because
 *     using 'ceo'/'cto'/etc. here would misrepresent this call as an
 *     executive turn, which ai/core/runtime/AGENT_LIFECYCLE.md's own
 *     REGISTERED → SPAWNING → ACTIVE → EMITTING → RETIRED states
 *     describe and this caller does not perform any of)
 *   - payload:     a fixed, non-input-derived infrastructure marker —
 *     no order/customer/payment reference, no PII, no financial
 *     figure, no credential, no free-text field of any kind
 *
 * IMPORTANT: NO AUTONOMY (same constraint eventBus.js's own header
 * states for Phase 14A, restated here because this is the first file
 * that actually calls it from something resembling "the runtime"):
 *   - Never calls Groq, groq-proxy, or any AI_ROUTER/EXECUTIVE_ROUTER
 *     path.
 *   - Never spawns, invokes, or references an executive
 *     (ai/executives/**) in any way.
 *   - Never reads or writes any SmartDoor production table — this file
 *     has no Supabase import of its own; it only calls emitEvent(),
 *     which itself only ever touches SDOS's own two tables via
 *     ai/integrations/supabase/sdosEventsStore.js (SECURITY_MODEL.md
 *     constraint 1 — this file does not open a second access path).
 *   - Has no side effect beyond what emitEvent() already does when the
 *     kill switch (feature_flags.sdos_event_bus_enabled) is on; when
 *     it is off, this function returns the same DISABLED no-op
 *     emitEvent() itself returns — see EMIT_RESULT.outcome.
 *
 * Not imported by any SmartDoor production file. Not wired into any
 * HTTP route, cron job, or Edge Function in this phase — invoked only
 * via scripts/sdos-runtime-caller-verify.js (manual, operator-run) or
 * a test's injected `deps`, per Objective 5's "controlled" requirement.
 */

import { emitEvent } from '../events/eventBus.js';

// Fixed, non-runtime-editable — matches eventBus.js's own ALLOWED_SOURCES
// pattern for identity (SECURITY_IMPLEMENTATION_PLAN.md "Agent Identity").
const CALLER_SOURCE = 'sdos-system';
const CALLER_COMPONENT = 'sdos-runtime-caller';

/**
 * Builds the one event this caller is allowed to emit. Exported
 * separately from invoke() so a test can assert on its shape without
 * any I/O (mirrors eventBus.js's own validateEvent/authorizeEvent
 * pure-function pattern).
 *
 * @param {string} [correlationId] - optional; a fresh one is generated
 *   if omitted, so repeated manual verification runs are individually
 *   traceable in sdos_event_lifecycle without colliding.
 */
export function buildVerificationEvent(correlationId) {
  return {
    event_type: 'lifecycle.transition',
    source: CALLER_SOURCE,
    correlation_id: correlationId || `runtime-caller-${Date.now()}`,
    priority: 'normal',
    payload: {
      component: CALLER_COMPONENT,
      purpose: 'phase-14b-controlled-pipeline-verification',
      // Deliberately NOT ai/core/runtime/AGENT_LIFECYCLE.md's executive
      // states (REGISTERED/SPAWNING/ACTIVE/...) — those describe an
      // executive turn, which never happens here. These two labels
      // describe only this caller's own before/after, so a reader of
      // sdos_events never mistakes this row for a real executive
      // lifecycle transition.
      from_state: 'not_verified',
      to_state: 'verified',
    },
  };
}

/**
 * invoke — the single entry point. Calls emitEvent() exactly once and
 * returns its EmitResult unchanged (no reinterpretation of outcome, no
 * swallowed error) — per EVENT_BUS.md Delivery Contract Rule 3 ("no
 * event is silently dropped"), applied one layer up: this caller must
 * not silently drop emitEvent()'s own result either.
 *
 * @param {object} [opts]
 * @param {string} [opts.correlationId] - see buildVerificationEvent()
 * @param {object} [opts.deps] - forwarded to emitEvent() unchanged;
 *   the same { store, isEnabledOverride } test-injection seam
 *   eventBus.js already exposes. Production callers omit this and get
 *   the real ai/integrations/supabase/sdosEventsStore.js.
 * @returns {Promise<object>} emitEvent()'s EmitResult
 */
export async function invoke(opts = {}) {
  const event = buildVerificationEvent(opts.correlationId);
  return emitEvent(event, opts.deps || {});
}

export default { invoke, buildVerificationEvent };
