# Observability

## Status

SDOS Phase 11. **Extension, not a duplicate.**
`ai/core/runtime/LOGGING_STRATEGY.md` (Phase 9) already fully specifies
what must be logged, what must never be logged, and the shape logs
take. This file does not restate that — it adds the one thing Phase 9
explicitly deferred: what a founder-facing observability *view* (the
eventual `ai/dashboard/`) actually needs to surface, now that this
phase's new artifacts (`Message`, tool calls, approval requests) exist
as documented concepts to make observable.

## Purpose

Define what "observable" (per
`ai/docs/SDOS_ARCHITECTURE.md`'s Design Principle 4) concretely means
for a founder looking at the system, across everything Phase 9–11 have
now defined — without inventing a new logging mechanism
`LOGGING_STRATEGY.md` already owns.

## Responsibilities

- Define the founder-facing observability surface's minimum content,
  as a specification a future `ai/dashboard/` phase builds against.
- Tie together `LOGGING_STRATEGY.md` (the write side) and
  `EVENT_BUS.md` (the live side) into one coherent "what can a founder
  actually see" answer.

## Inputs

Every event type in `ai/core/events/EVENT_BUS.md`'s table, every log
entry per `LOGGING_STRATEGY.md`, plus this phase's new
`ApprovalRequest` (`APPROVAL_WORKFLOW.md`) and `Message`
(`MESSAGE_SCHEMA.md`) records.

## Outputs — Minimum Observability Surface

1. **Live session view** — every `OPEN` session
   (`SESSION_MODEL.md`), its participants, and their current lifecycle
   state (`AGENT_LIFECYCLE.md`).
2. **Pending approvals** — every `PENDING` `ApprovalRequest`
   (`APPROVAL_WORKFLOW.md`), feeding directly into
   `FOUNDER_APPROVAL_FLOW.md`'s presentation.
3. **Recent errors** — every `error.raised` event
   (`EVENT_BUS.md`)/`ERROR_HANDLING.md` error class, with enough
   context to distinguish a genuine ownership gap
   (`ROUTING_ERROR`-as-Company-Brain-gap) from a data-quality issue,
   per `ERROR_HANDLING.md` Rule 4.
4. **Task status board** — every task's current state
   (`TASK_MODEL.md`), grouped by `target_executive`.
5. **Inter-agent activity (this phase's new surface)** — recent
   `Message` exchanges (`MESSAGE_SCHEMA.md`) between executives, so a
   founder can see *why* one executive's output reflects another's
   input, not just the final result.

## Validation Rules

1. **This file adds no new logging or eventing mechanism.** Every item
   above is a *view* over data `LOGGING_STRATEGY.md` and `EVENT_BUS.md`
   already specify how to produce — if something above isn't already
   loggable/emittable per those two files, that is a gap in *them*,
   flagged there, not silently patched here.
2. **No raw production/customer data appears in any view** — restated
   from `LOGGING_STRATEGY.md`'s "what must never be logged" list,
   applied identically to what may never be *displayed*.
3. **A founder-facing view never implies an action was taken when it
   was only proposed** — `AWAITING_APPROVAL` must render visibly
   distinct from `RESOLVED`, mirroring `AGENT_LIFECYCLE.md` Rule 2's
   own "`AWAITING_APPROVAL` is not a failure" distinction, extended
   here to "and is not a completion either."

## Failure Modes

A view that silently fails to update (e.g. a stale session list) is an
observability defect, not a runtime error in the sense
`ERROR_HANDLING.md` defines — but if the underlying cause is an event
delivery failure, that failure is still an `error.raised` event per
`EVENT_BUS.md`'s own rule (no event silently dropped).

## Dependencies

- `ai/core/runtime/LOGGING_STRATEGY.md` (authoritative on what's
  logged)
- `ai/core/events/EVENT_BUS.md` (authoritative on live propagation)
- `APPROVAL_WORKFLOW.md`, `MESSAGE_SCHEMA.md` (this folder — the two
  new surfaces this view adds)
- A future `ai/dashboard/` (not built in this phase)

## Future Implementation Notes

No UI framework, refresh mechanism, or access control for the
dashboard itself is chosen in this phase — this file specifies
*content*, not implementation.

## Relationship to the Rest of SDOS

- Sits directly on top of `LOGGING_STRATEGY.md` and `EVENT_BUS.md`
  without restating either.
- Is the specification `ai/dashboard/` (still empty) will eventually be
  built against.
