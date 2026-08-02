# ai/docs/adr — Architecture Decision Records

## Purpose

A record of the significant architectural decisions made across SDOS's
build, in the standard ADR format (Context, Decision, Alternatives
Considered, Rationale, Consequences, Future Impact, Related Phases).
Where the rest of `ai/docs/` and each phase's own folder README explain
*what* was built, this folder explains *why*, in a format that stays
readable even after the folder it describes has moved on to a later
phase.

## Status

SDOS Phase 10. This is the first phase to formalize decisions already
made across Phases 0–9 into ADR format — none of the underlying
decisions are new; this folder captures them retroactively, in the
same spirit `ai/core/standards/README.md` used to correct (not
rebuild) a prior finding.

## Index

| ADR | Title | Covers |
|---|---|---|
| `ADR-0001-SDOS-Architecture.md` | SDOS Architecture | The foundational decision to build SDOS at all, as a read-then-act, additive, non-duplicating internal AI operating system (Phase 0) |
| `ADR-0002-Executive-Model.md` | Executive Model | The decision to model SDOS as six named executive roles (CTO/COO/CFO/CMO/CPO/CEO) built from a shared standards skeleton, rather than one monolithic agent (Phases 2–9) |
| `ADR-0003-Runtime-Foundation.md` | Runtime Foundation | The decision to fully specify a nine-part runtime architecture (registry, context, events, tasks, session, permissions, router, runtime, standards) as documentation before any executive gains execution authority (Phase 9) |
| `ADR-0004-Integration-Layer.md` | Integration Layer | The decision to document eight future integrations and their read-only gate before writing any integration code (Phase 10) |
| `ADR-0005-Agent-Runtime-Contracts.md` | Agent Runtime Contracts | The decision to specify implementation-ready contracts under `ai/core/contracts/`, split into pointers (for concepts Phase 9 already specifies) and genuinely new documents (messaging, memory, prompts, tools, execution pipeline, approvals, observability, audit, versioning) (Phase 11) |
| `ADR-0006-Agent-Communication.md` | Agent Communication | The decision to model inter-agent communication as two separate documents — a message schema and a protocol — kept subordinate to the existing task-routing ownership table (Phase 11) |

## How to Read an ADR

Each ADR is a standalone record of one decision — read the one relevant
to the phase or component you're investigating; you don't need to read
all four to understand any one of them, though later ADRs reference
earlier ones where a decision built directly on a prior one.

## Rules for Future ADRs

1. **An ADR records a decision already made**, not a proposal under
   discussion — a not-yet-decided architectural question belongs in the
   relevant phase's own "Real Gap" or "Real Gap Carried Forward"
   section (e.g. `ai/core/standards/README.md`'s standards-path
   discrepancy) until it is actually resolved, at which point it earns
   its own ADR.
2. **Numbered sequentially, never renumbered or reused**, matching the
   discipline `NAMING_STANDARD.md` already applies to SQL migrations
   (`NN_description.sql`) — an ADR that is later superseded gets a new
   ADR that says so in its own "Related Phases" section; the old one is
   never edited to pretend it said something else.
3. **Every ADR uses the same seven-section shape** (Context, Decision,
   Alternatives Considered, Rationale, Consequences, Future Impact,
   Related Phases) — see the four existing ADRs for the pattern.
4. **An ADR is additive-only once written** — if a later phase
   materially changes a prior decision, that is a new ADR referencing
   the old one, not an edit to the old one, per the same discipline
   `ai/docs/COMPANY_BRAIN.md` Rule 3 already applies to knowledge files.

## Relationship to the Rest of SDOS

- Complements, rather than duplicates, each phase's own status
  documentation (`ai/docs/SDOS_ARCHITECTURE.md`,
  `ai/core/README.md`, `ai/executives/README.md`,
  `ai/integrations/README.md`) — those describe current state; ADRs
  describe why that state was chosen over the alternatives.
- `ADR-0004-Integration-Layer.md` in particular should be read alongside
  `ai/integrations/INTEGRATION_REGISTRY.md`, `READONLY_POLICY.md`, and
  `SECURITY_GUIDELINES.md` for the full Phase 10 picture.
- `ADR-0005` and `ADR-0006` should be read alongside
  `ai/core/contracts/README.md` and
  `ai/docs/IMPLEMENTATION_READINESS_REPORT.md` for the full Phase 11
  picture.
