# Message Transport Implementation Plan

## Status

Planning only. No transport exists. No message has ever been sent.

## Contract This Plan Implements

`MESSAGE_SCHEMA.md` (envelope) and `INTER_AGENT_PROTOCOL.md` (protocol
rules 1–5, plus the Phase 13A ordering/dedup/traceability extension).
Neither is restated or redefined below — this plan only sequences the
concrete states a `Message` moves through, using the transport
recommended in `EVENT_BUS_IMPLEMENTATION_PLAN.md` (table + Realtime)
as the underlying mechanism, since `MESSAGE_SCHEMA.md`'s own "Future
Implementation Notes" defers transport choice for the same reason
`EVENT_BUS.md` does.

## Scope

CEO → CTO, CEO → COO, CEO → CFO, CEO → CMO, CEO → CPO, and legitimate
peer-to-peer cross-executive messages (e.g. CTO → CFO), per
`INTER_AGENT_PROTOCOL.md`'s scope: point-to-point input requests within
an open session, never task reassignment (`TASK_ROUTING.md` remains
exclusive owner of that).

## Lifecycle

```
Create
  → Validate
  → Authorize
  → Route
  → Deliver
  → Acknowledge
  → Process
  → Respond
  → Audit
```

### 1. Create

The sending executive instance, in `ACTIVE` state, assembles a
`Message` object per `MESSAGE_SCHEMA.md`'s exact shape, including the
Phase 13A identifiers (`conversation_id`, `task_id`, `event_id`,
`correlation_id`, `sequence_number`, `idempotency_key`) per
`INTER_AGENT_PROTOCOL.md`'s extension. `sequence_number` is assigned
by the sender at this step, monotonically increasing per
`conversation_id` — see `MESSAGE_ORDERING_IMPLEMENTATION_PLAN.md` for
exactly how that monotonicity is future-enforced.

### 2. Validate

Structural validation against `MESSAGE_SCHEMA.md`'s object shape (all
required fields present, `message_type` a valid enum value, `payload`
never containing raw SmartDoor customer data per that file's own
payload rule). A message failing structural validation never reaches
Authorize — it is rejected at this step, per `INTER_AGENT_PROTOCOL.md`'s
Validation Rules ("Every `Message` sent under this protocol must
validate against `MESSAGE_SCHEMA.md`'s object shape before it is
considered sent").

### 3. Authorize

Two checks, both already fully specified elsewhere and not redefined
here:

- **Session membership** — both `from_executive` and `to_executive`
  must share the `session_id` per `MESSAGE_SCHEMA.md` Rule 1 and
  `INTER_AGENT_PROTOCOL.md` Rule 1. A message to an executive outside
  the sender's session is rejected here as a
  `PERMISSION_ERROR`-adjacent case per `MESSAGE_SCHEMA.md`'s own
  Failure Modes.
- **No authority is granted or checked here beyond session
  membership** — per `MESSAGE_SCHEMA.md` Rule 3 and
  `SECURITY_BOUNDARIES.md` extension 1, a message never carries more
  access than either executive's own `PERMISSION_MODEL.md` outcome
  already allows. This step confirms the message is *sendable*, never
  that its eventual content is *actionable* — the receiving
  executive's own future response still passes its own
  `PERMISSION_MODEL.md` check independently, at Process (step 7).

### 4. Route

The `to_executive` role_id resolves to a currently-`ACTIVE` instance
within the shared session (`AGENT_LIFECYCLE.md`). If no such instance
is active, this is a `ROUTING_ERROR`-adjacent case per
`INTER_AGENT_PROTOCOL.md`'s Failure Modes — the message is not queued
indefinitely against a non-existent instance; it fails closed and
raises `error.raised` (`EVENT_BUS.md`).

### 5. Deliver

Using the recommended transport (`EVENT_BUS_IMPLEMENTATION_PLAN.md`):
the `Message` is written to the durable table as the record of send,
and a Realtime notification is published to alert the receiving
instance's process, mirroring exactly how `services/notifications.js`
already separates "durable write" from "live nudge" in production.
Delivery is considered complete once the durable write succeeds — the
Realtime publish is a convenience, not the authority for "was this
sent," consistent with `EVENT_BUS_IMPLEMENTATION_PLAN.md`'s Option E
reliability model.

### 6. Acknowledge

The receiving instance's runtime observes the delivered `Message`
(via Realtime nudge or, if that is missed, via the durable table)
and marks it received. This is distinct from Process (step 7) — an
acknowledgment confirms only that the message was seen, not that a
`RESPONSE` has yet been produced. A `Message` acknowledged but never
processed within its `timeout` is the unanswered-`REQUEST` case
`INTER_AGENT_PROTOCOL.md`'s Failure Modes already governs.

### 7. Process

`EXECUTION_FLOW.md`'s Phase 13A "Inter-Agent Message-Triggered
Reasoning" section governs this step in full — Context Evaluation
decides whether new Groq reasoning is required at all, per that
section's own Rules 1–3, before anything below is entered. If
reasoning is required, `TOKEN_BUDGETING.md` and `RATE_LIMITING.md`
checks apply exactly as they would for a task-triggered invocation.

### 8. Respond

Per `MESSAGE_SCHEMA.md`, a `REQUEST` resolves to a `RESPONSE` whose
`in_reply_to` matches the original `message_id` and whose
`idempotency_key`/`sequence_number` follow `INTER_AGENT_PROTOCOL.md`'s
Phase 13A rules. A `RESPONSE` is delivered through the same Create →
Validate → Authorize → Route → Deliver → Acknowledge sequence as the
original `REQUEST`, in the reverse direction — this lifecycle is
symmetric, not a separate one for responses.

### 9. Audit

Every step above is recorded to `AUDIT_TRAIL.md`'s durable record,
keyed by `conversation_id`/`correlation_id`, whether or not the
exchange resolved successfully — per `EXECUTION_FLOW.md`'s Phase 13A
Rule 13, a Context-Evaluation decision *not* to trigger reasoning is
itself auditable, not just the eventual `RESPONSE`.

## Retry, Timeout, Expiration

- **Retry** — per `INTER_AGENT_PROTOCOL.md`'s Phase 13A Rule 7, a
  retry before `timeout` reuses the original `idempotency_key` and
  `sequence_number`; it is not a new logical message. This plan
  implements that by having Deliver (step 5) treat a retry as a
  duplicate write attempt against the same durable-table row (an
  upsert keyed on `idempotency_key`, never a second row), so Process
  (step 7)'s duplicate-detection check (`MESSAGE_DEDUP_IMPLEMENTATION_PLAN.md`)
  sees exactly one logical message regardless of retry count.
- **Timeout** — a duration is not fixed by any contract document
  (`INTER_AGENT_PROTOCOL.md`'s own "Future Implementation Notes"
  explicitly defers this). This plan does not fix a number either,
  for the same reason — no SDOS message has ever been sent to measure
  against, and `RATE_LIMITING.md`'s own precedent (proposing a
  starting number explicitly marked "not a benchmarked number") is
  the model a future phase should follow here rather than this
  document guessing.
- **Expiration** — per `INTER_AGENT_PROTOCOL.md`'s Phase 13A Rule 5, a
  `Message` received after its own timeout has elapsed is expired and
  raises `error.raised` with an `expired_message` reason at Process
  (step 7), never silently processed.
- **Deduplication** — see `MESSAGE_DEDUP_IMPLEMENTATION_PLAN.md`.
- **Ordering** — see `MESSAGE_ORDERING_IMPLEMENTATION_PLAN.md`.
- **Failure** — any step 1–8 failure raises `error.raised`
  (`EVENT_BUS.md`), never a silent drop, per every referenced
  contract's own Failure Modes section.
- **Escalation** — a genuine disagreement discovered during Process
  (e.g. CTO and CFO `RESPONSE`s conflict) is never resolved inside
  this lifecycle; it escalates to `ceo` per `INTER_AGENT_PROTOCOL.md`
  Rule 5 and `DECISION_FRAMEWORK.md` / `MULTI_PARTY_CONFLICT.md` as
  applicable.
- **Cancellation** — a sender may withdraw an unanswered `REQUEST`
  before `timeout` by marking its durable-table row cancelled; this is
  additive future behavior no existing contract document specifies,
  so it is flagged here as a **Future SDOS Capability**, not asserted
  as already-decided.

## Dependencies

- `MESSAGE_SCHEMA.md`, `INTER_AGENT_PROTOCOL.md` (contract, unchanged)
- `EVENT_BUS_IMPLEMENTATION_PLAN.md` (this folder — the transport this
  plan sequences messages over)
- `EXECUTION_FLOW.md`'s Phase 13A extension (Process step)
- `MESSAGE_DEDUP_IMPLEMENTATION_PLAN.md`,
  `MESSAGE_ORDERING_IMPLEMENTATION_PLAN.md` (this folder)
- `TRACEABILITY_IMPLEMENTATION_PLAN.md` (this folder — how the Audit
  step's identifiers chain end to end)
