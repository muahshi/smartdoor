# ADR-0001: SDOS Architecture

## Status

Accepted (Phase 0). Recorded retroactively in Phase 10.

## Context

SmartDoor is a production SaaS business (QR-code nameplate/visitor
management, masked calling, commerce, subscriptions) running on a
Supabase + Vercel-hosted static frontend + Android app stack. As the
business grew, the founder needed a way for AI to help run parts of the
business (engineering oversight, operations, finance, marketing,
product, executive synthesis) without that AI capability living inside,
forking, or destabilizing the existing production repository, which
already serves real customers and real payments.

## Decision

Build SDOS (SmartDoor Operating System) as a **separate, additive-only
`ai/` directory** inside the same repository, with a strict one-way
dependency: SDOS may eventually read SmartDoor's data and code, but
SmartDoor's production code never imports from, calls, or depends on
`ai/`. SDOS is explicitly not a replacement for SmartDoor and not a
customer-facing product — it exists to give future AI executives a
shared, structured place to observe, reason, and (with explicit
approval gates) eventually act.

## Alternatives Considered

- **A separate repository entirely.** Rejected: would require its own
  deployment/access model and would make "read SmartDoor's real
  context" structurally harder, not easier, than a same-repo,
  clearly-bounded subdirectory.
- **Embedding AI logic directly inside existing `services/`.** Rejected
  immediately and permanently: this would violate the one-way-
  dependency principle from the start, risking exactly the kind of
  production instability (per the `services/supabase.js` CDN-outage
  incident and the forensic-audit-documented broken import paths
  elsewhere in this repository's history) SDOS is meant to reason about
  and help prevent, not risk causing itself.
- **Building one monolithic "business AI" rather than a structured
  operating system.** Rejected in Phase 0 in favor of a phased,
  folder-by-folder foundation (`core/`, `executives/`, `knowledge/`,
  `memory/`, `workflows/`, `integrations/`, `dashboard/`, `prompts/`,
  `docs/`) — see ADR-0002 for why this became an executive-role model
  specifically.

## Rationale

- **SmartDoor's existing systems are the permanent source of truth.**
  SDOS reads from them; it never forks or replaces them.
- **Additive only.** Every phase adds alongside the existing
  repository, never modifying existing production files.
- **Read before write.** Integrations start read-only; write capability
  requires an explicit, separate, later decision (formalized further in
  ADR-0004).
- **Observable by default.** Anything an AI executive does should be
  visible to a human, not opaque.
- **Incremental phases.** No phase assumes or silently includes work
  from a later phase — a discipline every phase since Phase 0 has held
  to, including this one.

## Consequences

- Positive: SmartDoor's production stability is structurally protected
  from SDOS's own build process — nine phases in, zero production files
  have been modified by any SDOS phase.
  Positive: every future SDOS component has one, consistent place to
  live, discoverable via `ai/docs/SDOS_ARCHITECTURE.md`.
- Negative / accepted tradeoff: SDOS necessarily lags production —
  since it reads rather than owns the data, any Company Brain snapshot
  can go stale until either it's regenerated (Phase 1's own documented
  discipline) or a future live-read integration exists (Phase 10,
  documentation only).

## Future Impact

Every subsequent phase (1 through 10 and beyond) inherits this
decision's constraints unconditionally — no later ADR revisits whether
`ai/` should stay separate and additive; that question is closed.
Later ADRs address *how* SDOS is structured within that boundary, not
*whether* the boundary holds.

## Related Phases

Phase 0 (this decision). Referenced by every subsequent phase's own
"Design Principles" restatement, most explicitly
`ai/docs/SDOS_ARCHITECTURE.md` itself.
