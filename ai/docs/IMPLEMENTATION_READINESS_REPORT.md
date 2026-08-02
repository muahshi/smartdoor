# Implementation Readiness Report

## Status

SDOS Phase 11 (Agent Runtime Contracts). This report assesses how
close SDOS is to being buildable as an actual running agent runtime,
after eleven phases of architecture, executive, and contract
documentation — zero of which include executable code.

## Architecture Maturity

| Layer | Phase(s) | Maturity |
|---|---|---|
| Foundation (`ai/docs/SDOS_ARCHITECTURE.md`, Company Brain) | 0–1 | Complete |
| Six executive roles (mission, authority, decision rules, playbooks) | 2–8 | Complete for all six; a seventh role (e.g. future CISO) would follow `ROLE_TEMPLATE.md` unchanged |
| Shared standards library | 5 | Complete (18 files), but at an unresolved path (`core/standards/` vs. `ai/core/standards/` — see below) |
| Runtime foundation (registry, context, events, tasks, session, permissions, router, runtime) | 9 | Complete as architecture; zero runtime code |
| Integration layer (8 vendor boundary points, registry, data contracts, read-only policy) | 10 | Complete as architecture; zero clients, zero credentials |
| ADR record | 10 | Four ADRs covering Phases 0, 2–9, 9, 10 |
| Agent runtime contracts (messaging, memory, prompts, tools, execution pipeline, approvals, observability, audit, versioning) | 11 (this phase) | Complete as architecture; zero runtime code |

**Overall**: SDOS has a fully specified, internally consistent
architecture across every layer a future implementation needs —
executive definitions, runtime mechanics, integration boundaries, and
now agent-to-agent/tool/approval contracts. **No phase has built
anything executable.** This is by design (every phase's own stated
constraint), not an oversight.

## Missing Engineering Work (What Actually Has to Be Built)

Ordered roughly by dependency, not by importance:

1. **Resolve the `core/standards/` vs. `ai/core/standards/` path.**
   Flagged in Phase 9, carried forward through Phase 10 and this
   phase, still unresolved. This is the one founder-level decision
   blocking a clean start — every executive and this phase's own
   contracts reference the `ai/core/standards/` path, which does not
   physically exist.
2. **A registration/discovery process** implementing
   `EXECUTIVE_REGISTRY.md`'s five-step flow against the real six
   executive folders.
3. **A context-assembly implementation** producing an actual
   `AssembledContext` (`CONTEXT_SCHEMA.md`) per
   `CONTEXT_LOADING.md`'s load order — the first piece that needs a
   real storage/retrieval choice.
4. **A model-invocation client** for `EXECUTION_PIPELINE.md` step 2 —
   the first piece requiring an actual external call (almost certainly
   via the existing `groq-proxy` pattern, per
   `ai/integrations/groq/README.md`'s own boundary, or a new,
   separately-approved provider).
5. **A permission-check engine** implementing `PERMISSION_MODEL.md`
   mechanically against `AUTHORITY_STANDARD.md` and each role's matrix.
6. **An approval-request store and founder-facing surface**
   implementing `APPROVAL_WORKFLOW.md` and `FOUNDER_APPROVAL_FLOW.md` —
   the first genuinely user-facing (founder-facing) component.
7. **A read-only `ai/integrations/` client for at least one vendor**
   (Supabase is the natural first, since it's the most-referenced
   across all eight) — gated entirely behind
   `READONLY_INTEGRATION_POLICY.md`.
8. **A tool registry implementation** (`TOOL_REGISTRY.md`) wrapping
   that first integration client.
9. **An event bus and logging backend** — the storage choice every
   Phase 9–11 document has deferred (`EVENT_BUS.md`,
   `LOGGING_STRATEGY.md`, `AUDIT_TRAIL.md`, `MEMORY_SCHEMA.md` all
   name this as an open, not-yet-decided question).
10. **`ai/dashboard/`** implementing `OBSERVABILITY.md`'s minimum
    content.

## Remaining Risks

- **Standards-path ambiguity (carried forward, unresolved).** Every
  future implementation phase inherits ~40 references to a path that
  doesn't physically exist until a founder decides move-vs-repoint.
- **No storage backend chosen anywhere.** Events, logs, audit entries,
  memory records, and approval requests all currently defer this
  choice — a future phase choosing inconsistent backends per
  component (e.g. logs in flat files, memory in Supabase, audit
  entries nowhere) would fragment observability exactly where
  `OBSERVABILITY.md` assumes one coherent view.
- **First real integration client is a genuine new risk surface.**
  Every constraint in `SECURITY_MODEL.md` and
  `READONLY_INTEGRATION_POLICY.md` is currently a documentation
  promise, untested against a real Supabase RLS-scoped read.
- **Prompt/tool authorization is mechanically specified but untested.**
  `PERMISSION_MODEL.md`'s own finding stands: every check in every
  phase through this one resolves to `AWAITING_APPROVAL` or `DENIED`,
  never `ALLOWED` — the first implementation to make `ALLOWED`
  reachable is a meaningful authority-expansion decision, not a routine
  build step.
- **Inter-agent messaging (this phase's addition) has no chosen
  transport.** A poor first choice (e.g. synchronous blocking calls
  between executives) could silently violate `INTER_AGENT_PROTOCOL.md`
  Rule 2's "never blocks forever" requirement if timeouts aren't
  designed in from the first implementation.

## Recommended Implementation Order

1. Resolve the standards-path decision (blocking, cheap, founder-only).
2. Registration/discovery (registry) — smallest, most mechanical piece.
3. Context assembly + one storage backend decision, made once and
   applied consistently to events/logs/audit/memory rather than
   per-component.
4. Permission-check engine (still returns only `AWAITING_APPROVAL`/
   `DENIED` at this point — expected and correct).
5. Approval workflow + founder-facing surface (first user-visible
   component; unlocks meaningful founder interaction even before any
   executive has real authority).
6. Model invocation (`EXECUTION_PIPELINE.md` step 2) for one executive
   only (CTO is the most-referenced, best-documented candidate).
7. First read-only integration client (Supabase) + first tool registry
   entry wrapping it.
8. Event bus + `ai/dashboard/` observability view.
9. Inter-agent messaging (`MESSAGE_SCHEMA.md`/`INTER_AGENT_PROTOCOL.md`)
   — deliberately last among core mechanics, since it's only valuable
   once at least two executives can independently reach `ACTIVE`.
10. Memory (`MEMORY_SCHEMA.md`) — deliberately last overall, since
    continuity across sessions matters least until single-session
    behavior is proven correct.

## Estimated Implementation Complexity

| Component | Relative complexity | Why |
|---|---|---|
| Registration/discovery | Low | Pure filesystem/metadata check against an already-stable folder shape |
| Standards-path fix | Low (mechanical) / High (decision cost) | The fix itself is trivial; the founder decision it's gated behind is not |
| Context assembly | Medium | Requires the first storage-backend decision |
| Permission-check engine | Medium | Mechanical, but must correctly cite rules across 6+18 files without drift |
| Approval workflow + founder UI | Medium | First user-facing surface; UX quality matters, not just correctness |
| Model invocation | High | First real external dependency; must respect `groq-proxy`'s existing boundary exactly |
| First integration client | High | Highest-risk surface — RLS correctness, read-only enforcement, no side effects |
| Event bus + dashboard | High | Cross-cuts every other component; hardest to retrofit if the storage choice is wrong |
| Inter-agent messaging | Medium-High | Needs correct timeout/non-blocking behavior from the start |
| Memory | Medium | Schema is defined; mainly a storage-backend and retrieval-strategy decision |

## Dependencies

Every row above traces back to a specific Phase 9–11 document already
written; this report invents no new architecture, only sequences and
risk-rates what already exists.

## Future Implementation Notes

This report is itself not an implementation plan with dates or owners
— it is a readiness assessment. A future phase turning this into an
actual project plan should treat item 1 (standards-path resolution) as
a hard prerequisite, since every other item's file references assume
it's resolved.
