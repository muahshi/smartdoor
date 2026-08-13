# Message Deduplication Implementation Plan

## Status

Planning only. No deduplication logic has ever run, because no message
has ever been sent.

## Contract This Plan Implements

`INTER_AGENT_PROTOCOL.md`'s Phase 13A "Ordering, Deduplication, and
Traceability" section, specifically Rules 1, 2, 6, and 7. Not restated
below except where needed to describe the future implementation
behavior on top of it. No database schema is proposed here — per the
brief's own instruction, any persistence implication is marked **Future
SDOS Capability** rather than designed in detail.

## Identifiers in Scope

| Identifier | Defined in | Scope |
|---|---|---|
| `message_id` | `MESSAGE_SCHEMA.md` | Unique per message, generated at send |
| `correlation_id` | `MESSAGE_SCHEMA.md` / `EVENT_BUS.md` | Ties a request to its response and to related events |
| `conversation_id` | `INTER_AGENT_PROTOCOL.md` Phase 13A | Stable for one founder- or CEO-initiated exchange, possibly multi-hop |
| `task_id` | `INTER_AGENT_PROTOCOL.md` Phase 13A | Set only if the exchange supports a `TASK_MODEL.md` task |
| `event_id` | `INTER_AGENT_PROTOCOL.md` Phase 13A | Set only if the exchange was triggered by an event |
| `idempotency_key` | `INTER_AGENT_PROTOCOL.md` Phase 13A | Deterministic from `(conversation_id, sequence_number, sender)` |
| `sequence_number` | `INTER_AGENT_PROTOCOL.md` Phase 13A | Monotonic per `conversation_id`, sender-assigned |

## Duplicate Detection

A receiving executive instance checks an incoming `Message`'s
`idempotency_key` against the set of keys it has already processed
within the same `conversation_id`, per Rule 1. Future implementation
behavior:

1. The check happens at the Process step of
   `MESSAGE_TRANSPORT_IMPLEMENTATION_PLAN.md`'s lifecycle, before
   Context Evaluation (`EXECUTION_FLOW.md` Phase 13A section) begins —
   a duplicate never reaches reasoning at all, per that section's own
   Rule 3.
2. If matched, the receiver re-emits its original `RESPONSE`
   (looked up by the same `idempotency_key`) rather than reprocessing
   — this requires the original `RESPONSE` to remain retrievable for
   the life of the `conversation_id`, which is a **Future SDOS
   Capability** persistence requirement, not a schema this plan
   designs.
3. Scoping is strictly per-`conversation_id`, never global, per Rule 2
   — this mirrors `MEMORY_SCHEMA.md`'s existing session-scoping
   discipline and is not a new scoping principle invented here.

## Retry Safety

Per Rule 7, a retry before `timeout` reuses the same `idempotency_key`
and `sequence_number` — it is the same logical message. Future
implementation consequence: whatever future persistence layer stores
processed `idempotency_key`s must treat a second write with the same
key as a no-op or upsert, never a second row — this is the same
constraint `MESSAGE_TRANSPORT_IMPLEMENTATION_PLAN.md`'s Deliver step
already describes for the durable-table write. Concretely, this means
duplicate detection must be idempotent by construction (a unique
constraint on `idempotency_key` scoped to `conversation_id`, if a
Future SDOS Capability table is ever built) rather than idempotent by
application-code discipline alone.

## Replay Protection

Per Rule 6, a resent message after its original has already expired is
never automatically revived — the sender must issue a genuinely new
`Message` with a new `sequence_number` and `idempotency_key`. Future
implementation consequence: an expired `idempotency_key` is never
reused, closing the replay vector structurally (there is no valid key
to replay against) rather than by a runtime check that could be
bypassed — the same "structural, not policy" enforcement principle
`SECURITY_BOUNDARIES.md`'s own Validation Rules section already applies
to its two extensions.

## Out-of-Order Handling

Handled in full by `MESSAGE_ORDERING_IMPLEMENTATION_PLAN.md` — this
plan does not duplicate that document's stale-message rules, since
Rule 3 of `INTER_AGENT_PROTOCOL.md`'s Phase 13A section explicitly ties
staleness to `sequence_number` ordering, not to `idempotency_key`
matching, which is this document's concern.

## Stale Message Handling

Also `MESSAGE_ORDERING_IMPLEMENTATION_PLAN.md`'s concern (Rule 3 of the
same section governs both staleness and ordering together). Referenced
here only to confirm the two documents are not duplicating each other's
scope: this file governs "have we seen this exact message before,"
that file governs "is this message's position in the sequence still
current."

## Expiration

Per Rule 5, a `Message` received after its own `timeout` has elapsed
(relative to its `timestamp`) is expired and raises `error.raised`
with an `expired_message` reason — never processed as if newly sent.
No specific `timeout` duration is fixed here, for the same reason
`MESSAGE_TRANSPORT_IMPLEMENTATION_PLAN.md`'s Retry/Timeout section
already defers it.

## What This Plan Does Not Invent

- No database schema, table name, or index is proposed. Any statement
  above implying persistence (e.g. "processed `idempotency_key`s must
  remain retrievable") is explicitly a **Future SDOS Capability**, to
  be designed when a future implementation phase actually builds the
  table recommended in `EVENT_BUS_IMPLEMENTATION_PLAN.md`.
- No new failure class — every failure mode above already maps to an
  existing `error.raised` event or `ERROR_HANDLING.md` category.

## Dependencies

- `INTER_AGENT_PROTOCOL.md` Phase 13A extension (authoritative rules)
- `MESSAGE_TRANSPORT_IMPLEMENTATION_PLAN.md` (where duplicate detection
  sits in the overall lifecycle)
- `MESSAGE_ORDERING_IMPLEMENTATION_PLAN.md` (the adjacent, non-
  overlapping concern of sequence position)
- `EVENT_BUS_IMPLEMENTATION_PLAN.md` (the eventual persistence layer
  any future dedup table would be built on)
