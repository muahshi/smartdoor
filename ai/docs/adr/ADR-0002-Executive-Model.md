# ADR-0002: Executive Model

## Status

Accepted (Phases 2–9). Recorded retroactively in Phase 10.

## Context

Having established SDOS as a separate, additive `ai/` layer (ADR-0001),
the next question was how to structure the actual reasoning capability
inside it. SmartDoor's business spans clearly distinct concerns —
engineering (CTO), operations (COO), finance (CFO), marketing (CMO),
product (CPO) — each needing different context, authority boundaries,
and decision rules. A single undifferentiated "business AI" would blur
those boundaries and make authority (what it may decide unilaterally
vs. what needs founder approval) impossible to define cleanly.

## Decision

Model SDOS as **six named executive roles** — CTO (Phase 2), COO
(Phase 3), CFO (Phase 4), CMO (Phase 6), CPO (Phase 7), and CEO
(Phase 8) — each with its own folder under `ai/executives/<role>/`,
built from a **shared standards skeleton** (`core/standards/`,
resolved to its actual repository-root location in Phase 9) covering
mission, responsibilities, authority matrix, decision rules, KPIs,
escalation matrix, and prompt template. The CEO is architecturally
distinct: it owns no domain data of its own and exists solely to read
and synthesize the other five executives' documentation — a
cross-executive orchestration role, not a seventh domain.

## Alternatives Considered

- **One monolithic agent covering all domains.** Rejected: makes
  per-domain authority boundaries (a CFO-scale pricing decision vs. a
  CTO-scale schema decision) impossible to express cleanly in a single
  `AUTHORITY_MATRIX.md`, and makes "which executive should handle this"
  routing (later formalized in `ai/core/router/TASK_ROUTING.md`)
  undefined by construction.
- **Ad hoc, differently-shaped executives per role**, each hand-built
  without a shared skeleton. This was the actual approach for CTO/COO/
  CFO (Phases 2–4) before the duplication cost became visible; Phase 5
  corrected it by extracting the shared skeleton into
  `core/standards/`, and CMO/CPO (Phases 6–7) were the first built from
  it directly.
- **A CEO role defined from Phase 2 alongside CTO.** Rejected at the
  time: the CEO's entire function is synthesizing the other five
  executives' own documentation, so building it before those five
  existed would have had nothing real to synthesize. The gap was
  independently named by all five sibling executives' own
  `INTER_EXECUTIVE_COMMUNICATION.md` files before Phase 8 closed it.

## Rationale

- Domain separation lets each executive's authority matrix be narrow
  and specific (`AUTHORITY_STANDARD.md`'s ten universal founder-
  approval rows apply to all six; each role's own matrix adds
  role-specific rows on top).
- A shared skeleton (Phase 5) eliminates the copy-paste drift risk that
  ad hoc per-role construction (Phases 2–4) already exhibited before it
  was corrected.
- A synthesis-only CEO avoids duplicating domain ownership — it reads,
  it doesn't own, keeping "who owns this data" unambiguous per
  executive.

## Consequences

- Positive: adding a future seventh executive is now a known, bounded
  process (follow `ROLE_TEMPLATE.md`), not a fresh design exercise.
- Positive: `ai/core/permissions/PERMISSION_MODEL.md`'s mechanical
  authority check has a clean input space — six well-defined roles,
  each with an explicit matrix — rather than an ambiguous "the AI"
  making a judgment call.
- Negative / accepted tradeoff: cross-domain questions that don't map
  cleanly to one executive (e.g. a pricing change with both CFO and CPO
  implications) require the CEO's synthesis step rather than a single
  executive answering directly — an intentional design choice, not an
  oversight, per the CEO's own narrowest-of-six authority matrix.

## Future Impact

Any future domain-specific executive (e.g. a future CISO or Head of
Partnerships role) is expected to follow the same shared-skeleton
pattern rather than reintroducing ad hoc construction. The CEO's
synthesis-only model is expected to scale to additional sibling
executives without redesign, since its own function never assumed
exactly six.

## Related Phases

Phases 2, 3, 4, 6, 7, 8 (the six executives), Phase 5 (shared skeleton
extraction), Phase 9 (standards-path resolution — see
`ai/core/standards/README.md`).
