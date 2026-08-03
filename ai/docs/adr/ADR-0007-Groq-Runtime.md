# ADR-0007: Groq Runtime

## Status

Proposed (Phase 12). Unlike ADR-0001 through ADR-0006, this ADR
records a decision that is **not yet accepted** — it specifies exactly
what would need founder sign-off, and why, rather than treating the
scope expansion below as already granted. Per `ai/docs/adr/README.md`
Rule 1, a not-yet-decided architectural question stays flagged, not
silently written up as settled.

## Context

`ai/integrations/groq/README.md` (Phase 10) scoped SDOS's relationship
to Groq narrowly: future read-only visibility into SmartDoor's own
production Groq usage metrics, explicitly **not** a way for SDOS to run
inference through Groq on the business's behalf. `EXECUTION_PIPELINE.md`
(Phase 11) left step 2 ("Invocation") entirely unspecified for exactly
this reason, and explicitly noted that Phase 10's boundary "continues
to apply in full to whatever invocation mechanism a future phase
chooses for step 2." Phase 12's own brief asks SDOS to design "how
SDOS will use the existing Groq integration" for its own runtime
reasoning — which is a materially different capability than either
prior phase approved: an SDOS executive actually invoking an LLM to
reason, not SDOS reading metrics about a SmartDoor product feature.

## Decision

Specify, in full, the architecture a future SDOS Groq-backed reasoning
capability would take (`ai/runtime/`, this phase) — **without**
declaring that capability approved. The decision this ADR actually
records is narrower and already safe to make now:

1. **If** a future founder decision approves SDOS invoking Groq for its
   own reasoning, it **must** use a new, separately-scoped Edge
   Function and credential — never the production `groq-proxy`
   endpoint, its `GROQ_API_KEY`, its AI-session-token issuance, or its
   per-IP rate-limit bucket.
2. **Until** that founder decision is made, `ai/integrations/groq/README.md`'s
   existing read-only-metrics boundary remains the entirety of SDOS's
   approved relationship to Groq — `ai/runtime/`'s specification is
   preparatory documentation, not a standing authorization.
3. The architectural pattern (hardened proxy, session-token gate, model
   whitelist, request-shape caps, fail-closed on error) is reused in
   full; the specific endpoint, credential, and traffic budget are
   never shared with production.

## Alternatives Considered

- **Treat Phase 12's brief as implicit approval and design the
  capability as already granted.** Rejected: `AUTHORITY_STANDARD.md`'s
  closing rule — "no executive is ever granted authority by omission"
  — applies as much to SDOS's own capability boundary as to any
  individual executive's. A documentation phase does not have standing
  to grant itself a new integration capability Phase 10 explicitly
  scoped narrower; only a founder decision can widen it.
- **Reuse `groq-proxy` directly for a future SDOS call**, since it
  already exists and is hardened. Rejected: its rate-limit bucket,
  origin allow-list, and request-shape caps (`MAX_MESSAGE_CHARS`,
  `max_tokens` ceiling of 800) were sized for short visitor/owner
  widget calls; sharing the endpoint would either starve production
  traffic during an executive session or force artificial truncation of
  Company-Brain-scale context — see `TOKEN_BUDGETING.md` and
  `RATE_LIMITING.md` for the detailed reasoning.
- **Decline to design anything until founder approval exists.**
  Rejected: the brief explicitly asked for architecture-only design
  ("This is NOT implementation... NOT executable runtime"), and having
  the design ready in advance is exactly what lets a founder evaluate
  the actual shape of what they'd be approving, rather than approving
  an abstract idea sight-unseen.

## Rationale

- Preserves Golden Rule 6 ("reuse before creating") at the pattern
  level, while preserving `AUTHORITY_STANDARD.md`'s "no authority by
  omission" rule at the scope level — the two are not in tension once
  "reuse the pattern" and "reuse the credential/endpoint" are kept
  explicitly distinct, which is this ADR's core move.
- Keeps `ai/integrations/groq/README.md`'s existing, already-accepted
  boundary intact and un-contradicted — this ADR extends the readiness
  picture around it, never edits or silently supersedes it.
- Gives a founder a concrete, reviewable "yes/no" decision
  (`ADR-0007`'s own status) rather than an ambiguous, half-implemented
  capability that crept in through a documentation phase.

## Consequences

- Positive: a future founder reviewing this ADR sees exactly what
  would change (a new, isolated Edge Function and credential) and
  exactly what would not (production's `groq-proxy`, its budget, its
  rate limit) — a clean, low-risk decision to evaluate.
- Positive: `ai/runtime/`'s eighteen documents are immediately useful
  to whichever future phase implements this, with no rework needed
  once approval is granted.
- Negative / accepted tradeoff: SDOS's executive reasoning capability
  remains entirely undecided and unbuilt after this phase — Phase 12
  produces readiness, not capability. This is the correct tradeoff
  given `AUTHORITY_STANDARD.md`'s existing discipline, not a gap to
  close by this phase itself.

## Future Impact

Any future phase that builds the SDOS-scoped Groq proxy must (1) point
to this ADR as its approval record once a founder accepts it, updating
this ADR's Status line per Rule 4 of `ai/docs/adr/README.md` (a new
ADR recording acceptance, this one's Status corrected to reference it —
never silently edited to say "Accepted" without that trail), and (2)
satisfy every contract in `ai/runtime/` and `ai/core/contracts/` first,
per `IMPLEMENTATION_READINESS_REPORT.md` and
`GROQ_RUNTIME_READINESS.md`'s suggested order.

## Related Phases

Phase 10 (`ai/integrations/groq/README.md`, the boundary this ADR
narrows around rather than replaces), Phase 11
(`EXECUTION_PIPELINE.md`, whose step 2 this ADR's subject fills),
Phase 12 (this decision; see `ADR-0008` for the paired decision on
prompt routing).
