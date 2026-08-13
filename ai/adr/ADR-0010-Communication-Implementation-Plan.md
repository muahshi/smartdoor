# ADR-0010: Communication Implementation Plan

## Status

Accepted (Phase 13B). Planning-only — records a set of implementation
*choices*, not an implementation. No code, SQL, Supabase function, or
Groq configuration changed as a result of this ADR.

## Context

`ADR-0006` (Phase 11) decided the shape of inter-agent communication:
`MESSAGE_SCHEMA.md` + `INTER_AGENT_PROTOCOL.md`. `ADR-0009` (Phase
13A) closed four specification gaps (ordering/dedup/traceability,
event taxonomy, multi-party conflict, message-triggered reasoning) by
extending existing documents rather than building a new
`ai/communication/` folder. Both ADRs deliberately deferred every
implementation-technology choice — transport, persistence, specific
timeout durations — per each underlying contract document's own
"Future Implementation Notes" section. Phase 13B was scoped
specifically to make those deferred choices, on paper, against real
repository evidence, without writing the implementation itself.

## Problem

Before this phase, a future implementer of `EVENT_BUS.md` or
`MESSAGE_SCHEMA.md`/`INTER_AGENT_PROTOCOL.md` would have had to choose
a transport, a persistence approach, and a concrete message lifecycle
from scratch, with no documented evidence-based recommendation and no
guarantee their choice wouldn't duplicate an existing production
pattern this repository already runs (Supabase Realtime is already
used for five distinct production purposes; a naive implementer might
not discover this without the audit this phase performed). A second,
narrower problem: the original request that triggered this phase
initially risked scope creep into either writing runtime code directly
or re-deciding the Phase 11/13A architecture — both of which this ADR
explicitly rejects, consistent with `ADR-0009`'s own precedent for
catching scope creep before it produces duplicate or contradictory
documentation.

## Existing Architecture

Unchanged and authoritative, per `ADR-0006` and `ADR-0009`:
`MESSAGE_SCHEMA.md`, `INTER_AGENT_PROTOCOL.md` (incl. Phase 13A
extension), `EVENT_BUS.md`, `EVENT_CATALOG.md`, `TASK_ROUTING.md`,
`APPROVAL_WORKFLOW.md`, `FOUNDER_APPROVAL_FLOW.md`,
`SECURITY_BOUNDARIES.md`, `MEMORY_SCHEMA.md`, `EXECUTION_PIPELINE.md`,
`EXECUTION_FLOW.md` (incl. Phase 13A extension), `RATE_LIMITING.md`,
`TOKEN_BUDGETING.md`, `DECISION_FRAMEWORK.md`, `MULTI_PARTY_CONFLICT.md`.
This ADR does not modify, restate, or supersede any rule in any of
these documents.

## Options Considered

### Scope option A: Implement the runtime directly in this phase

Rejected outright — explicitly out of scope per the Phase 13B brief
("DO NOT write executable runtime code... DO NOT create the event bus
yet... DO NOT create agent transport yet").

### Scope option B: Re-scope or re-decide the Phase 11/13A architecture

Rejected — no gap was found in the existing contract layer that would
justify revisiting `ADR-0006`'s or `ADR-0009`'s decisions; every
implementation question this phase needed to answer was already
flagged as deferred, not as unresolved architecture, in the documents
that raised it.

### Scope option C (chosen): Produce implementation-planning documents only

Chosen. See `ai/docs/implementation/` for the eleven resulting
documents. Each answers exactly one deferred implementation question
by citing repository evidence, without writing code or revising
architecture.

### Event bus transport: five options evaluated

In-process emitter, Supabase Realtime alone, database-backed queue
alone, existing-infrastructure-as-a-fourth-option (found to collapse
into the Realtime/table pair, since Supabase Postgres + Realtime *is*
this repository's existing infrastructure), and a table+Realtime
hybrid. Full comparison in
`ai/docs/implementation/EVENT_BUS_IMPLEMENTATION_PLAN.md`.

## Decision

1. Reject direct implementation and reject re-deciding Phase 11/13A
   architecture (Scope options A and B above).
2. Produce exactly eleven implementation-planning documents plus this
   ADR, under `ai/docs/implementation/`, each extending or sequencing
   an existing contract document's explicitly deferred implementation
   question — never restating or contradicting that document's already
   -decided rules.
3. Recommend, for the event bus specifically, a dedicated append-only
   Postgres table as source of truth with a Supabase Realtime channel
   layered on top for live propagation — the same table+Realtime
   composition already running in production for notifications and
   activity-center events, applied to a new, isolated table.

## Rationale

- Every implementation question this phase resolves was explicitly
  named as deferred by an existing contract document — resolving it
  here, on paper, gives a future implementer a documented, evidence-
  based starting point instead of an unexamined blank slate.
- The event bus recommendation reuses a pattern this exact codebase
  already runs in production five times over, rather than proposing
  new technology the team has no operational experience with in this
  repository — directly addressing `EVENT_BUS.md`'s own concern about
  choosing a technology "before any consuming component exists" by
  grounding the choice in components that already exist and already
  consume a materially identical pattern.
- Keeping this phase strictly planning-only, per the brief's own
  constraint, avoids the same duplication risk `ADR-0009` already
  identified and rejected — an implementation phase that also
  re-litigated architecture would risk silently contradicting `ADR-0006`
  or `ADR-0009` the way the originally-scoped fifteen-file
  `ai/communication/` folder would have.

## Rejected Alternatives

- **Implementing the runtime now** — rejected per the brief's explicit
  constraint and because no founder approval for actual Groq
  invocation exists yet (`ADR-0007` remains `Proposed`, not
  `Accepted`) — building message/event infrastructure ahead of that
  approval would create working code with no approved reasoning
  engine to drive it.
- **A third-party message queue or event-streaming service** —
  considered as part of the event-bus option comparison and rejected;
  see `EVENT_BUS_IMPLEMENTATION_PLAN.md`'s Option E rationale for why
  a hosted broker's marginal reliability gain does not justify its
  operational and cost overhead against a system with zero current
  call volume.
- **A single combined "implementation plan" document instead of
  eleven** — rejected for the same reason `ADR-0009` split its own
  four extensions by natural subject area rather than one combined
  file: each of the eleven documents answers a distinct, independently
  citable question (transport, lifecycle, dedup, ordering,
  traceability, component mapping, production boundary, testing,
  rollback, observability, security), and a future implementer
  referencing "how does retry interact with dedup" should not need to
  read an event-taxonomy discussion to find it.

## Consequences

- Positive: a future implementer of the event bus or message transport
  now has an evidence-based recommendation and a full lifecycle
  sequence to build against, rather than an unexamined choice among
  `EVENT_BUS.md`'s five named "legitimate future options."
- Positive: the mandatory audit performed for this phase (documented
  in `RUNTIME_COMPONENT_MAP.md`) confirms no existing contract
  document needed correction — the Phase 11/13A architecture holds up
  against a concrete implementation-planning exercise.
- Negative / accepted tradeoff: eleven new documents increase
  `ai/docs/`'s total surface area; mitigated by each being tightly
  scoped to one question and cross-referencing rather than restating
  the others.

## Security Impact

None of the eleven documents grants new authority, new access, or a
new data-sharing path. `SECURITY_IMPLEMENTATION_PLAN.md` and
`PRODUCTION_BOUNDARY.md` both explicitly restate (never loosen)
`SECURITY_MODEL.md`, `READONLY_INTEGRATION_POLICY.md`, and
`SECURITY_BOUNDARIES.md`'s existing constraints, applied to the
concrete future components this phase names.

## Operational Impact

None. No runtime, code, SQL, Supabase function, or Groq configuration
exists as a result of this phase. All eleven documents remain
architecture-and-planning only, per this ADR's own Status line.

## Implementation Boundary

Per `PRODUCTION_BOUNDARY.md` (this phase's own output): SDOS may
eventually read production data exclusively through
`ai/integrations/`'s existing read-only gate, and may eventually write
only to its own isolated event/message table — never any existing
SmartDoor production table, Edge Function, credential, or Realtime
channel currently carrying customer-facing traffic.

## Rollback Strategy

Per `ROLLBACK_STRATEGY.md` (this phase's own output): because every
future SDOS write path this plan describes is additive and isolated
(a new, separate table and Realtime channel, never a modification to
an existing one), disabling or removing it at any future point
requires no change to any existing production system — confirmed by
direct inspection of every system it must never affect (commerce,
AI Receptionist, WebRTC, payments, authentication, production
database).

## Future Impact

A future implementation phase building the actual event bus, message
transport, or CEO orchestration runtime inherits: a recommended
transport with cited rationale, a full nine-step message lifecycle, a
dedup/ordering enforcement approach, an end-to-end traceability chain,
a component-to-contract map, a read/write/approval boundary, a
test-scenario list traced to contract rules, a rollback plan, an
observability scope, and a security-implementation checklist. None of
these were implementation-ready before this phase; none are built as a
result of it.

## Related ADRs

- `ADR-0006-Agent-Communication.md` — the base message architecture
  this phase implements against, not supersedes.
- `ADR-0009-Communication-Extensions.md` — the Phase 13A gap-closing
  precedent this phase's own scope-discipline follows.

## Related Phases

- Phase 9 (Runtime Foundation) — `TASK_ROUTING.md`, `EVENT_BUS.md`
- Phase 11 (Agent Runtime Contracts) — `MESSAGE_SCHEMA.md`,
  `INTER_AGENT_PROTOCOL.md`, `APPROVAL_WORKFLOW.md`,
  `FOUNDER_APPROVAL_FLOW.md` (`ADR-0005`, `ADR-0006`)
- Phase 12 (Groq Runtime Foundation) — `EXECUTION_FLOW.md` (`ADR-0007`,
  `ADR-0008`)
- Phase 13A (Communication Extensions) — `ADR-0009`
- Phase 13B (this ADR) — `ai/docs/implementation/*`
