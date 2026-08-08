# Inter-Agent Protocol

## Status

SDOS Phase 11. Genuinely new. `ai/core/router/TASK_ROUTING.md` (Phase
9) defines how a *task* reaches an executive; every sibling executive's
own `INTER_EXECUTIVE_COMMUNICATION.md` and the CEO's
`CROSS_EXECUTIVE_COMMUNICATION.md` describe, in prose, that executives
sometimes need each other's input — but no phase before this one
specifies the actual protocol: when a message is sent, what triggers
one, and how a receiving executive is expected to behave. Architecture
and contract only; no message has ever been exchanged.

## Purpose

Define the rules governing when and how one executive instance sends a
`Message` (`MESSAGE_SCHEMA.md`) to another, so cross-executive
communication is a specified protocol rather than an implicit
assumption every executive's own documentation has carried since
Phase 2.

## Responsibilities

- Define the trigger conditions for sending a Message.
- Define the receiving executive's obligations.
- Keep this protocol strictly subordinate to `TASK_ROUTING.md`'s
  existing ownership table — it does not introduce a second way to
  decide "who handles this," only a mechanism for one executive to ask
  another for domain input mid-turn.

## Inputs

An `ACTIVE` executive instance (`AGENT_LIFECYCLE.md`) that, during its
own reasoning step, determines it needs another executive's domain
input to complete its current task — the same situation
`TASK_ROUTING.md`'s "multi-domain match" case already routes to `ceo`,
but at the sub-task, within-a-single-executive's-turn level (e.g. CTO
reasoning about a deployment risk that has a cost implication only CFO
data would clarify, without the whole task needing CEO-level
re-routing).

## Outputs

A `Message` per `MESSAGE_SCHEMA.md`, and, once implemented, the
receiving executive's `RESPONSE`.

## Protocol Rules

1. **A message is sent only within an open session
   (`SESSION_MODEL.md`).** No cross-session messaging in this phase
   (restated from `MESSAGE_SCHEMA.md` Rule 1 — not a new rule, a
   protocol-level consequence of it).
2. **Sending a message does not pause the sender's own lifecycle
   state indefinitely.** A sending executive either (a) waits for the
   `RESPONSE` within its current `ACTIVE` state if the turn's
   completion genuinely depends on it, or (b) proceeds and treats a
   late/absent response as a documented gap in its own output — an
   executive never silently blocks forever; a defined timeout (chosen
   by a future implementation phase, not this one) always applies.
3. **A message never substitutes for `TASK_ROUTING.md`'s ownership
   table.** If what's actually needed is full ownership transfer of the
   task (not just a data point), that is a re-routing decision per
   `TASK_ROUTING.md`, not a `Message` — this file governs point-to-point
   input requests only, never task reassignment.
4. **Every message obligates a receiving executive to answer within its
   own domain only.** A CFO receiving a `REQUEST` answers with
   CFO-domain information; it does not use the opportunity to also
   render a CTO-domain judgment — this mirrors `CONTEXT_LOADING.md`
   Rule 2's scope boundary applied to message responses.
5. **A genuine disagreement between two executives' responses (e.g.
   CTO and CFO giving conflicting read on the same proposed change) is
   not resolved by either executive alone.** It is escalated to `ceo`
   per `TASK_ROUTING.md`'s existing multi-domain-match handling — this
   protocol creates no new conflict-resolution mechanism of its own.

## Validation Rules

- Every `Message` sent under this protocol must validate against
  `MESSAGE_SCHEMA.md`'s object shape before it is considered sent.
- A message whose `domain_hint` doesn't correspond to the receiving
  executive's own `RESPONSIBILITIES.md` is a malformed request — the
  sender should have consulted `TASK_ROUTING.md`'s ownership table
  first.

## Failure Modes

- An unanswered `REQUEST` past its timeout is an `error.raised` event
  (`EVENT_BUS.md`) — not silently dropped, and not treated as an
  implicit "no" that changes the sender's own reasoning without
  flagging the gap.
- A message sent to a `role_id` not currently `ACTIVE` in the same
  session is a `ROUTING_ERROR`-adjacent case per
  `ai/core/runtime/ERROR_HANDLING.md`.

## Dependencies

- `MESSAGE_SCHEMA.md` (the envelope this protocol governs)
- `ai/core/router/TASK_ROUTING.md` (the ownership table this protocol
  never overrides)
- `ai/executives/ceo/DECISION_FRAMEWORK.md` (the escalation path for
  genuine cross-executive disagreement)
- `ai/core/session/SESSION_MODEL.md` (the multi-executive-capable
  container this protocol operates inside)

## Future Implementation Notes

No specific timeout duration, retry count, or transport mechanism is
chosen in this phase, for the same reason `EVENT_BUS.md` and
`LOGGING_STRATEGY.md` both defer their own implementation-technology
choices — deciding before any consuming component exists risks
designing around the wrong constraints.

## Ordering, Deduplication, and Traceability (SDOS Phase 13A Extension)

**Status:** Phase 13A. Additive. Every rule above (1–5) and every
validation/failure mode already specified remains unchanged and
authoritative. This section only closes a gap the original Phase 11
specification left open: it never defined how a `Message` is identified
across retries, out-of-order delivery, or a multi-hop CEO → executive →
response chain. Architecture and contract only — no message has ever
been exchanged, so nothing below has ever executed.

### Identifiers Every Message Carries

Extends `MESSAGE_SCHEMA.md`'s object shape (this section does not
restate or redefine that schema's existing fields — it adds the
following, all required):

```
conversation_id:  string   # stable for the life of one founder-initiated
                            # or CEO-initiated exchange; shared by every
                            # Message and RESPONSE within it
task_id:          string | null   # set only if this exchange exists to
                                   # support a TASK_MODEL.md task; null
                                   # for a standalone consultation
event_id:         string | null   # set only if this exchange was
                                   # triggered by an EVENT_BUS.md event
correlation_id:   string   # reuses EVENT_BUS.md's existing field
                            # meaning: ties this Message to every event
                            # and message in the same causal chain
sequence_number:  integer  # monotonically increasing per conversation_id,
                            # assigned by the sender at send time
idempotency_key:  string   # deterministic from (conversation_id,
                            # sequence_number, sender); a resend of the
                            # same logical message reuses the same key
```

### Duplicate Detection and Duplicate Delivery

1. A receiving executive that observes a `Message` whose
   `idempotency_key` matches one it has already processed within the
   same `conversation_id` treats it as a duplicate delivery, not a new
   message — it re-emits its original `RESPONSE` (if one exists) rather
   than reprocessing.
2. Duplicate detection is scoped to `conversation_id`, never global —
   this mirrors `MEMORY_SCHEMA.md`'s existing session-scoping discipline
   rather than inventing a new scope.

### Out-of-Order and Stale Messages

3. A `Message` arriving with a `sequence_number` lower than one already
   processed for that `conversation_id` is stale. It is not silently
   discarded — per Rule 3 of the failure modes already established
   below, it is logged as a non-fatal ordering anomaly and answered only
   if still actionable; otherwise it is answered with a pointer to the
   conversation's current state.
4. `EVENT_BUS.md`'s existing ordering guarantee ("ordered within a
   `correlation_id`") is the model this rule follows for messages —
   this section does not invent a second ordering scheme, it applies
   the same discipline to `Message` that `EVENT_BUS.md` already applies
   to `Event`.

### Expiration and Replay Protection

5. Every `Message` carries the `timeout` value already required by
   Protocol Rule 2 above. A `Message` received after its own `timeout`
   has elapsed (relative to its `timestamp`) is expired — the receiver
   must not process it as if newly sent; it raises `error.raised`
   (`EVENT_BUS.md`) with an `expired_message` reason, same as an
   unanswered `REQUEST` past timeout already does under the existing
   Failure Modes section above.
6. A resent `Message` (same `idempotency_key`) after its original has
   already expired is not automatically revived — the sender must issue
   a new `Message` with a new `sequence_number` and `idempotency_key`,
   making replay of a stale message indistinguishable from sending a
   genuinely new one, which closes the replay vector without adding a
   new authorization mechanism.

### Retry Behavior

7. A sender may retry an unanswered `REQUEST` before its `timeout`
   elapses, but a retry reuses the same `idempotency_key` and
   `sequence_number` as the original — it is the same logical message,
   not a new one, so Rule 1 above (duplicate detection) applies at the
   receiver regardless of how many times the network layer redelivered
   it. This section does not fix a specific retry count or backoff
   curve, for the same reason `INTER_AGENT_PROTOCOL.md`'s own "Future
   Implementation Notes" already defers timeout duration.

### Traceability Across CEO → Executive → Response Chains

8. Every `Message` in a CEO-orchestrated exchange (`EXECUTIVE_ORCHESTRATION.md`)
   shares one `conversation_id` for the full chain, even when it spans
   more than one executive (e.g. CEO → CTO, then CTO → CFO for a
   sub-question, then CFO → CTO's `RESPONSE`, then CTO → CEO's final
   `RESPONSE`). The `correlation_id` ties this chain to any `Event` that
   triggered it; the `conversation_id` ties every `Message` and
   `RESPONSE` within the chain to each other. Neither identifier grants
   any additional authority — this restates, and does not loosen,
   Protocol Rule 3's existing prohibition on messages substituting for
   `TASK_ROUTING.md` ownership.
9. `AUDIT_TRAIL.md` remains the durable record of the decisions this
   traceability supports; this section adds the identifiers `AUDIT_TRAIL.md`
   needs to reconstruct a full chain, it does not duplicate that file's
   own retention or founder-review rules.

## Relationship to the Rest of SDOS

- Sits directly on top of `MESSAGE_SCHEMA.md`.
- Is the concrete mechanism every sibling executive's own
  `INTER_EXECUTIVE_COMMUNICATION.md` and the CEO's
  `CROSS_EXECUTIVE_COMMUNICATION.md` already assumed exists.
- Explicitly subordinate to, never a replacement for,
  `ai/core/router/TASK_ROUTING.md`.
