# ADR-0003: Runtime Foundation

## Status

Accepted (Phase 9). Recorded retroactively in Phase 10.

## Context

By Phase 8, six executives existed as fully-documented roles (mission,
responsibilities, authority, decision rules) but every one of their own
`PROMPT_TEMPLATE.md` and `AUTHORITY_MATRIX.md` files already assumed
runtime mechanics — executive registration, context loading, an event
bus, task/session models, permission checks, task routing — that had
never actually been specified anywhere. Without specifying these, "the
CFO executive" remained a description of a role with no defined
mechanism for how a task actually reaches it, what context it loads, or
how a permission check resolves.

## Decision

Fully specify a **nine-part runtime architecture** inside `ai/core/` —
`runtime/` (lifecycle, error handling, logging), `registry/`
(executive registration), `context/` (context loading order), `events/`
(event bus), `tasks/` (task model), `session/` (session model),
`permissions/` (permission model, security model, read-only integration
policy), `router/` (task routing), and `standards/` (the resolution
note for the pre-existing shared standards library) — as
**architecture and contracts only**. No executable runtime code, agent
process, or scheduler is built in this phase; every file is a
specification a future implementation phase must satisfy without
redesigning it.

## Alternatives Considered

- **Build a minimal working runtime immediately** (even a stub agent
  loop) rather than pure documentation. Rejected: every SDOS phase
  before this one held to documentation-only, and no executive has
  execution authority yet (`PERMISSION_MODEL.md`'s own finding — every
  check in this phase resolves to `AWAITING_APPROVAL`, never
  `ALLOWED`) — building runtime code ahead of that authority existing
  would front-run a decision (granting execution authority) that
  hasn't been made.
- **Defer runtime specification until the first real integration is
  built.** Rejected: every existing executive's documentation already
  assumed this architecture existed (per Context above); deferring
  further would leave that assumption unresolved indefinitely, the
  same kind of documentation-drift risk Phase 9's own audit caught
  when investigating the standards-path discrepancy.
- **Silently relocate `core/standards/` to `ai/core/standards/`** while
  building the rest of the runtime, resolving the path discrepancy by
  fiat. Rejected: per `DECISION_STANDARD.md` Rule 4 (escalate on
  ambiguity, don't guess) — moving vs. re-pointing ~40 references is a
  founder-level call neither option should make silently. Phase 9
  instead left an authoritative pointer and flagged the decision
  forward.

## Rationale

- A fail-closed error model (`ERROR_HANDLING.md`) and a strict context-
  loading order (`CONTEXT_LOADING.md`) are prerequisites for any future
  executive behavior to be trustworthy, not features to retrofit later.
- Formalizing `PERMISSION_MODEL.md` before any executive has real
  authority means the very first permission check a future
  implementation runs is already spec-compliant, not built against a
  moving target.
- Correcting (not duplicating or silently relocating) the
  `core/standards/` location finding respects Golden Rule 6 ("reuse
  before creating") at the meta-level — the standards library about
  reuse discipline is itself handled with that same discipline.

## Consequences

- Positive: `ai/integrations/` (Phase 10) could be specified against an
  already-defined `INTEGRATION_ERROR` state and `integration.read`
  event shape, rather than inventing its own error/event model.
- Positive: any future implementation phase has a single, internally
  consistent architecture to build against across all nine subfolders.
- Negative / accepted tradeoff: the `core/standards/` vs.
  `ai/core/standards/` path discrepancy remains unresolved — a real
  gap explicitly carried forward, not fixed by this ADR (see
  `ai/core/standards/README.md`'s own "Real Gap Carried Forward"
  section).

## Future Impact

Any phase building executable SDOS runtime code must satisfy every
contract in `ai/core/runtime/`, `registry/`, `context/`, `events/`,
`tasks/`, `session/`, `permissions/`, and `router/` before shipping —
this ADR is the record of why those contracts exist and were written
before any code, not the other way around. The unresolved standards-
path question remains a prerequisite founder decision for a future
phase, not something Phase 10 or later may silently resolve.

## Related Phases

Phase 9 (this decision). Phase 10 builds `ai/integrations/` directly
against this runtime's `INTEGRATION_ERROR` and `integration.read`
contracts (see ADR-0004).
