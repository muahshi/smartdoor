# Message Ordering Implementation Plan

## Status

Planning only. No message has ever been sequenced, because no message
has ever been sent.

## Contract This Plan Implements

`INTER_AGENT_PROTOCOL.md`'s Phase 13A "Ordering, Deduplication, and
Traceability" section, specifically Rules 3 and 4, and `EVENT_BUS.md`'s
existing Delivery Contract Rule 1 ("ordered within a `correlation_id`")
— which Rule 4 of the Phase 13A section explicitly names as the model
this file's message-ordering behavior follows, rather than a second
scheme invented independently. Neither is redefined below.

## What "Ordering" Means Here

Ordering applies to `sequence_number`, assigned by the sender at
Create time (`MESSAGE_TRANSPORT_IMPLEMENTATION_PLAN.md` step 1),
monotonically increasing per `conversation_id`. It does not apply
across different `conversation_id`s — same scoping discipline
`MESSAGE_DEDUP_IMPLEMENTATION_PLAN.md` already applies to
`idempotency_key`, and for the same reason (`MEMORY_SCHEMA.md`'s
existing session-scoping precedent).

## Future Enforcement Mechanism

1. **Sender-side monotonicity.** The sending executive instance
   tracks the highest `sequence_number` it has issued for a given
   `conversation_id` and issues the next integer for each new
   `Message` in that conversation, including responses in the same
   chain. This tracking is scoped to the instance's own session
   state, not a separate global counter — consistent with
   `SESSION_MODEL.md`'s session-scoped state model.
2. **Receiver-side high-water mark.** The receiving executive instance
   tracks the highest `sequence_number` it has successfully processed
   per `conversation_id`. This high-water mark is what a stale-message
   check (below) compares against.
3. **No central sequencer.** Ordering is enforced by each participant
   tracking its own view of the conversation's sequence, not by a
   single arbiter service — this keeps the ordering mechanism as
   lightweight as `EVENT_BUS.md`'s own "ordered within a
   `correlation_id`" guarantee, which likewise does not require
   describing a central sequencer to state the guarantee.

## Out-of-Order and Stale Messages

Per Rule 3: a `Message` arriving with a `sequence_number` lower than
one already processed for that `conversation_id` is stale. Future
implementation behavior, following Rule 3's own instruction exactly:

1. It is **not silently discarded.**
2. It is logged as a non-fatal ordering anomaly (an `error.raised`
   event with an `ordering_anomaly` — not `expired_message` — reason,
   distinguishing a stale-but-received message from a genuinely
   expired one per `MESSAGE_DEDUP_IMPLEMENTATION_PLAN.md`'s separate
   expiration handling).
3. It is answered only if still actionable (e.g. a stale `REQUEST`
   whose underlying question the receiver can still usefully answer);
   otherwise it is answered with a pointer to the conversation's
   current state (i.e. its current high-water mark and, where
   available, the `RESPONSE` already produced for the
   conversation's latest processed message) — never with silence.

## Relationship to `EVENT_BUS.md`'s Existing Ordering Guarantee

Rule 4 states this section "does not invent a second ordering scheme,
it applies the same discipline to `Message` that `EVENT_BUS.md`
already applies to `Event`." Concretely: `EVENT_BUS.md`'s guarantee is
ordered delivery within one `correlation_id`; this plan's guarantee is
ordered `sequence_number` within one `conversation_id`. Since every
`Message` in a chain shares one `conversation_id` and the
`correlation_id` that ties it to any triggering `Event`
(`INTER_AGENT_PROTOCOL.md`'s Phase 13A Rule 8), the two ordering
guarantees compose rather than conflict: an event and the messages it
triggers are each internally ordered on their own identifier, and the
identifiers themselves are linked for traceability
(`TRACEABILITY_IMPLEMENTATION_PLAN.md`).

## Multi-Hop Chains

Per Rule 8, a CEO-orchestrated exchange spanning more than one
executive (CEO → CTO, then CTO → CFO for a sub-question, then CFO →
CTO's `RESPONSE`, then CTO → CEO's final `RESPONSE`) shares one
`conversation_id` for the full chain. Future implementation
consequence: the sequence-number space for that `conversation_id`
is shared across every participant in the chain, not per-hop-local —
CTO's message to CFO and CEO's original message to CTO both draw
`sequence_number`s from the same monotonic sequence, so a future
implementation reconstructing the chain's order does not need to
merge separate per-hop sequences.

## What This Plan Does Not Invent

- No specific counter implementation (e.g. a database sequence vs. a
  per-session in-memory counter) is chosen — that is an implementation
  detail of whatever future persistence layer
  `EVENT_BUS_IMPLEMENTATION_PLAN.md` recommends, not an architecture
  decision this plan makes.
- No new ordering guarantee beyond what `EVENT_BUS.md` Rule 1 already
  establishes for events, applied to messages per
  `INTER_AGENT_PROTOCOL.md` Rule 4.

## Dependencies

- `INTER_AGENT_PROTOCOL.md` Phase 13A extension (authoritative rules)
- `EVENT_BUS.md` Delivery Contract Rule 1 (the model this ordering
  discipline follows)
- `MESSAGE_TRANSPORT_IMPLEMENTATION_PLAN.md` (Create step, where
  `sequence_number` is assigned)
- `MESSAGE_DEDUP_IMPLEMENTATION_PLAN.md` (the adjacent, non-
  overlapping concern of exact-duplicate detection)
- `TRACEABILITY_IMPLEMENTATION_PLAN.md` (how `conversation_id` and
  `correlation_id` compose across a multi-hop chain)
