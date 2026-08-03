# ADR-0008: Prompt Routing

## Status

Accepted (Phase 12). Unlike ADR-0007, this decision does not require
founder approval to record as accepted — it is purely an internal
SDOS documentation-architecture choice about how routing responsibility
is split across files, not a capability or authority decision.

## Context

Phase 12 needed to route a resolved task through three distinct
questions before a Groq call could even be assembled: "does this need
a model call at all?" (provider-level), "which executive's
configuration applies?" (executive-level), and "which registered
prompt template does that executive use?" (already answered by
`PROMPT_REGISTRY.md`, Phase 11). A single combined "router" document
covering all three would either duplicate `TASK_ROUTING.md`'s existing
executive-ownership routing (Phase 9) or `PROMPT_REGISTRY.md`'s
existing template-indexing (Phase 11).

## Decision

Split prompt-and-provider routing into **two new, narrow documents**
(`AI_ROUTER.md`, `EXECUTIVE_ROUTER.md`), each answering exactly one
question, both strictly downstream of and non-duplicating
`TASK_ROUTING.md`'s (Phase 9) executive-ownership decision and
`PROMPT_REGISTRY.md`'s (Phase 11) template index:

- `AI_ROUTER.md` — provider-level only: model call vs. pure
  computation, and (today) Groq as the only provider.
- `EXECUTIVE_ROUTER.md` — resolves the already-assigned executive's
  own model/temperature/token configuration
  (`MODEL_CONFIGURATION.md`), never re-deciding *which* executive owns
  the task.

## Alternatives Considered

- **One combined "AI Router" covering provider selection and
  executive configuration.** Rejected: the two questions have
  different stability profiles — provider selection would change
  rarely (only when a second LLM provider is ever added), while
  per-executive configuration (`MODEL_CONFIGURATION.md`) is exactly
  the kind of table a founder/CTO might tune far more often. Following
  `ADR-0006`'s own precedent (splitting `MESSAGE_SCHEMA.md` from
  `INTER_AGENT_PROTOCOL.md` because they have different
  future-evolution surfaces) keeps the more volatile piece
  (`EXECUTIVE_ROUTER.md` + `MODEL_CONFIGURATION.md`) separable from the
  more stable one (`AI_ROUTER.md`).
- **Fold executive-level routing into `TASK_ROUTING.md` itself.**
  Rejected outright: `TASK_ROUTING.md` (Phase 9) answers "who owns
  this task," a domain-ownership question already complete and
  unrelated to model configuration. Extending it with Groq-specific
  concerns would violate the same "never duplicate or drift a prior
  phase's own file" discipline `ADR-0005` already established for
  `ai/core/contracts/`'s pointer files.
- **Fold provider/executive routing into `PROMPT_REGISTRY.md`.**
  Rejected: that file's own Validation Rule 1 ("a registry entry never
  contains the prompt text itself... a lightweight index") is a
  deliberately narrow scope; routing logic is a behavioral concern,
  not an indexing one, and belongs in `ai/runtime/` (this phase's
  folder) rather than retroactively widening a Phase 11 contract.

## Rationale

- Mirrors `ADR-0006`'s already-accepted precedent: split by
  future-volatility and by concern (what vs. how), not by convenience
  of fewer files.
- Keeps `TASK_ROUTING.md` and `PROMPT_REGISTRY.md` exactly as Phase 9
  and Phase 11 left them — this phase adds two new, narrow files
  rather than editing either.
- Two single-purpose files are each independently easy to verify
  against their one job, versus one combined file whose scope could
  drift as either concern evolves.

## Consequences

- Positive: `TASK_ROUTING.md` and `PROMPT_REGISTRY.md` remain
  untouched and authoritative for their existing concerns.
- Positive: `MODEL_CONFIGURATION.md`'s per-role table (the most likely
  thing a founder/CTO would want to tune) is isolated behind
  `EXECUTIVE_ROUTER.md` alone, not entangled with provider-selection
  logic that would rarely change.
- Negative / accepted tradeoff: a future reader must open two files
  (`AI_ROUTER.md`, `EXECUTIVE_ROUTER.md`) plus `MODEL_CONFIGURATION.md`
  to understand the full routing path, rather than one — an accepted
  cost of the same kind `ADR-0006`'s own Consequences section already
  accepted for messaging.

## Future Impact

A future second LLM provider would extend `AI_ROUTER.md`'s `provider`
enum and add selection criteria there — never require touching
`EXECUTIVE_ROUTER.md` or `TASK_ROUTING.md`. A future per-task (not just
per-role) configuration override would extend `MODEL_CONFIGURATION.md`
and `EXECUTIVE_ROUTER.md` only.

## Related Phases

Phase 9 (`TASK_ROUTING.md`, the ownership decision this ADR's routers
remain subordinate to), Phase 11 (`PROMPT_REGISTRY.md`, the index this
ADR's routers consume without editing; `ADR-0006`, the precedent this
decision follows), Phase 12 (this decision; see `ADR-0007` for the
paired decision on the underlying capability this routing serves).
