# CEO Roadmap

This is the CEO's own **readiness** roadmap — what still needs to exist
before this role can do anything beyond documentation — distinct from
`STRATEGIC_PLANNING.md` (SmartDoor's business strategy) and distinct
from any sibling executive's own `ROADMAP.md` (their domain-specific
technical/operational/financial/marketing/product debt).

This is a **candidate list**, not a committed plan — every item requires
founder prioritization before any work begins, and nothing here implies
approval to execute, identical in framing to every sibling executive's
own roadmap.

## What Has to Exist Before the CEO Can Do Anything Real

1. **`ai/core/` — the shared runtime.** Still an empty placeholder per
   its own `README.md` ("Phase 0 only creates this folder as a
   placeholder. No orchestration code... exist yet"). Every one of the
   CEO's orchestration files (`EXECUTIVE_ORCHESTRATION.md`,
   `EXECUTIVE_MEETING_GUIDE.md`, etc.) describes an intended contract
   for once this exists — none of it runs today.
2. **`ai/integrations/`.** Still an empty placeholder per its own
   `README.md`. No executive, including the CEO, can read live
   production data until this layer exists.
3. **A real conflict-detection mechanism.** `DECISION_FRAMEWORK.md`
   currently describes a manual, judgment-based process for evaluating
   cross-domain trade-offs. A future phase could formalize this into a
   structured comparison tool, but that would itself be a **"Future
   SDOS Capability"** — nothing like it exists in the repository today.

## A Real, Confirmed Documentation Gap Found While Auditing This Phase

Per Golden Rule 5 (flag, don't silently resolve): `ai/executives/README.md`,
`ai/knowledge/MASTER_INDEX.md`, and every one of the five sibling
executives' own documentation (`cto/`, `coo/`, `cfo/`, `cmo/`, `cpo/`)
repeatedly reference a shared standards library at `ai/core/standards/`
— citing specific files like `ROLE_TEMPLATE.md`, `AUTHORITY_STANDARD.md`,
`DECISION_STANDARD.md`, `KPI_STANDARD.md`, `PROMPT_STANDARD.md`,
`COMMUNICATION_STANDARD.md`, `ESCALATION_STANDARD.md`,
`RESPONSIBILITY_STANDARD.md`, and `QUALITY_STANDARD.md` as if they were
built in "SDOS Phase 5." **None of these files exist anywhere in the
repository.** `ai/core/` contains only its own `README.md`, which itself
still describes the folder as "Phase 0... placeholder," directly
contradicting the Phase 5 claims made elsewhere. This is not something
this phase's task boundary permits fixing (additive-only within
`ai/executives/ceo/`, per this phase's own build brief), so it is
flagged here — and in `README.md` and the updated
`ai/knowledge/MASTER_INDEX.md` cross-reference — rather than silently
either building the missing library or pretending the references
resolve to something real. This folder's own files reference the same
paths for consistency with the five sibling folders' existing
convention, with this flag as the explicit caveat.

## Explicitly Not on This Roadmap

- Any change to a sibling executive's own folder or documentation —
  out of scope for this phase.
- Building `ai/core/standards/` itself — a real gap, but fixing it was
  not part of this phase's task boundary and would not be additive-only
  within `ai/executives/ceo/`.
- Any AI execution capability for the CEO or any other executive —
  contingent on `ai/core/` and `ai/integrations/` both being built
  first, exactly as every sibling executive's own roadmap already
  states about itself.

## How This Roadmap Gets Used

The founder reviews and re-prioritizes this list as needed; the CEO
updates it as new readiness gaps are discovered.

## Suggestion for the Next Phase: SDOS Runtime Foundation

With all six executives (CTO, COO, CFO, CMO, CPO, CEO) now fully defined
in documentation, the natural next phase is **not** a seventh executive
but the runtime these six have been designed against all along:

- **Real grounding already in the repository**: every one of the six
  executives' `PROMPT_TEMPLATE.md` files already specifies an assembly
  order that assumes `ai/core/` exists; every `AUTHORITY_MATRIX.md`
  already gates its "may decide unilaterally" column on `ai/core/` and
  `ai/integrations/` existing; every `INTER_EXECUTIVE_COMMUNICATION.md`/
  `CROSS_EXECUTIVE_COMMUNICATION.md` already states "no actual
  inter-executive messaging exists yet." The documentation-only phase
  of SDOS is now complete across all six roles; the next real gap is
  the runtime, not another role definition.
- **Real gap to resolve first, before any runtime work**: the
  `ai/core/standards/` discrepancy flagged above. A runtime foundation
  phase would need to decide whether to actually build that standards
  library (since six executives' worth of documentation already
  presumes it exists) or formally retire those references — this
  should be resolved before, not during, runtime construction, to avoid
  building orchestration logic on top of a citation that resolves to
  nothing.
- **Real boundary to define carefully**: `ai/core/`'s own README already
  states what belongs there (executive lifecycle, task/event routing,
  shared context, error handling) — a runtime foundation phase should
  audit whether that scope still holds now that all six executives'
  actual documentation exists to build against, rather than designing
  the runtime in the abstract.
- **Real overlap to check**: `ai/integrations/`'s current empty state
  means no executive can read live data — a runtime foundation phase
  likely needs to sequence `ai/integrations/` (read-only data access)
  before or alongside `ai/core/` (orchestration), since orchestration
  logic with no real data to orchestrate over has limited value.
- This is offered as a suggestion only, per this phase's own task
  boundary ("no implementation") — not a committed plan.
