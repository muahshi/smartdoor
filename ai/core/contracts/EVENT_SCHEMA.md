# Event Schema (Contract Layer)

## Status

SDOS Phase 11. **Pointer, not a duplicate.** The event schema
(`event_id`, `event_type`, `source`, `session_id`, `correlation_id`,
`timestamp`, `payload`), the anticipated event-type table, and the
full delivery contract (at-least-once/ordered-within-correlation,
append-only, never-silently-dropped, no-production-side-effects) are
already fully specified in `ai/core/events/EVENT_BUS.md` (Phase 9).

## Purpose

Complete the Phase 11 contract index without restating Phase 9 work.

## Responsibilities

Point to `ai/core/events/EVENT_BUS.md` as the single source of truth
for event shape and delivery semantics.

## Inputs / Outputs

N/A — see the referenced file's `Event` object shape.

## Validation Rules

N/A — see `EVENT_BUS.md` Rules 1–3, especially Rule 1: every runtime
state change described elsewhere in `ai/core/` should correspond to
exactly one event type there.

## Failure Modes

An event that cannot be delivered is itself an `error.raised` event
(`EVENT_BUS.md` Delivery Contract, rule 3) — not a new failure mode
this file invents.

## Dependencies

- `ai/core/events/EVENT_BUS.md` (authoritative)
- `MESSAGE_SCHEMA.md` (this folder) — a **distinct** concept: an Event
  is a broadcast, one-to-many "what happened" record on the bus; a
  Message (this phase's genuine addition) is a directed, one-to-one
  request/response between two specific executive instances. See
  `MESSAGE_SCHEMA.md`'s own "Relationship to the Rest of SDOS" section
  for exactly how the two differ and interoperate.

## Future Implementation Notes

New event types are additive and should follow `EVENT_BUS.md`'s
existing schema shape (per that file's own Rule 1) rather than a new
shape defined here.
