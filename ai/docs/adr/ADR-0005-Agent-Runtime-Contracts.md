# ADR-0005: Agent Runtime Contracts

## Status

Accepted (Phase 11).

## Context

By Phase 10, SDOS had a fully specified runtime foundation
(registration, context, events, tasks, session, permissions, routing —
Phase 9, ADR-0003) and a fully specified integration boundary (eight
vendor read-only boundary points — Phase 10, ADR-0004). Neither phase
specified what happens *inside* an executive's `ACTIVE` reasoning step
once a future implementation actually invokes a model: how a prompt is
assembled and versioned, how a tool call is authorized, how one
executive asks another for input mid-turn, how a founder approval is
actually presented and decided, and what durably persists across
sessions. `RUNTIME_ARCHITECTURE.md`'s own step 6 ("Reasoning") was
explicit that this gap was intentional — "no such invocation exists —
this step is the entire reason Phases 2–8 exist as pure
documentation" — but by Phase 11 it needed its own specification to
give a future implementation phase something concrete to build.

## Decision

Specify eighteen implementation-ready contracts under
`ai/core/contracts/`, split deliberately into two kinds: **pointers**
for concepts Phase 9 already fully specified (agent registration,
lifecycle/state machine, event schema, task schema, error handling —
five files that redirect rather than restate), and **genuinely new
contracts** for concepts no prior phase specified (message schema,
memory schema, the assembled-context object shape, a prompt registry,
a tool registry, the execution pipeline's internals, the approval
workflow and its founder-facing flow, observability content, a durable
audit trail, and a content-versioning scheme — twelve files), plus one
**extension** (`SECURITY_BOUNDARIES.md`, which points to
`SECURITY_MODEL.md` and adds only two genuinely new surfaces this
phase introduces). No executable code, agent process, or scheduler is
built.

## Alternatives Considered

- **Write all nineteen requested filenames as full, independent
  documents.** Rejected: several of the requested filenames
  (`AGENT_LIFECYCLE.md`, `AGENT_STATE_MACHINE.md`, `ERROR_HANDLING.md`,
  `EVENT_SCHEMA.md`, `TASK_SCHEMA.md`) name concepts
  `ai/core/runtime/`, `ai/core/events/`, and `ai/core/tasks/` already
  specify completely. Writing full parallel documents would create
  exactly the "parallel or conflicting version" risk this build was
  explicitly told to avoid, and would immediately risk drift the first
  time either copy was edited — the same failure mode
  `ai/core/standards/README.md` already diagnosed and corrected for a
  different discrepancy in Phase 9.
- **Skip the five overlapping filenames entirely, since they already
  exist.** Rejected: the build brief explicitly requested all
  nineteen names under `ai/core/contracts/`, and a reader starting
  from that folder (rather than already knowing Phase 9's folder
  layout) deserves a complete index, not five silent gaps. Pointer
  files resolve this without duplicating content.
- **Merge the twelve genuinely new contracts into fewer, larger
  files** (e.g. one combined "Agent Communication" document covering
  both messages and the inter-agent protocol). Rejected for the two
  message-related files specifically — see ADR-0006, which covers that
  decision on its own terms, separately, since it is a distinct
  decision from this ADR's overall "what gets a pointer vs. what's
  new" scoping choice.

## Rationale

- Golden Rule 6 ("reuse before creating") and this build's own explicit
  "never duplicate work" instruction apply as much to a phase's own
  output as to prior phases' — the same discipline
  `ai/core/standards/README.md` already modeled.
- The five pointer files still give `ai/core/contracts/` a complete,
  discoverable index (see that folder's own `README.md`) — completeness
  of the index doesn't require completeness of independent content.
- The twelve genuinely new contracts fill a real, previously-
  unspecified gap: `RUNTIME_ARCHITECTURE.md` step 6 was left
  intentionally undefined through Phase 9 and 10; this phase is the
  first to specify it, using exactly the new artifacts (messages,
  tools, prompts) this phase itself introduces.

## Consequences

- Positive: `ai/core/runtime/AGENT_LIFECYCLE.md`,
  `ai/core/events/EVENT_BUS.md`, and `ai/core/tasks/TASK_MODEL.md`
  remain the single source of truth for their respective concepts —
  no risk of a future reader finding two different state tables for
  the same lifecycle.
- Positive: a future implementation building the reasoning step
  (`EXECUTION_PIPELINE.md`) has one complete, cross-referenced set of
  contracts (prompt registry, tool registry, message schema) to build
  against, rather than needing to synthesize them from prose scattered
  across executive files.
- Negative / accepted tradeoff: `ai/core/contracts/` is not
  self-contained — a reader must still open `ai/core/runtime/`,
  `events/`, and `tasks/` for five of the nineteen concepts. This is an
  accepted tradeoff of the "never duplicate" constraint, not an
  oversight.

## Future Impact

Any future phase building the actual agent runtime must satisfy every
contract across `ai/core/runtime/`, `registry/`, `context/`, `events/`,
`tasks/`, `session/`, `permissions/`, `router/` (Phase 9) and
`ai/core/contracts/`'s twelve new documents (Phase 11) before shipping
— `ai/docs/IMPLEMENTATION_READINESS_REPORT.md` (this phase) records
the recommended order and complexity estimate for doing so.

## Related Phases

Phase 9 (runtime foundation this phase extends without restating),
Phase 10 (integration layer `TOOL_REGISTRY.md` wraps), Phase 11 (this
decision). See ADR-0006 for the specific decision to model inter-agent
communication as two separate documents (schema + protocol) rather
than one.
