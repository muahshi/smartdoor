# AI CEO — SmartDoor Operating System (SDOS Phase 8)

## Status

Phase 8 of SDOS, built on top of everything before it: Phase 0
(foundation), Phase 1 (Company Brain, `ai/knowledge/`), Phase 2
(`ai/executives/cto/`), Phase 3 (`ai/executives/coo/`), Phase 4
(`ai/executives/cfo/`), the Phase 5 shared standards reference (see the
"Known Documentation Gap" section below), Phase 6 (`ai/executives/cmo/`),
and Phase 7 (`ai/executives/cpo/`). This is the natural next phase
suggested by `ai/executives/cpo/ROADMAP.md`'s "Suggestion for Phase 8: AI
CEO Brain" section, which named the exact gap this phase closes: **no
role currently owns cross-domain tie-breaking**, a gap every one of the
five existing executives' own `INTER_EXECUTIVE_COMMUNICATION.md`
independently names.

**Nothing in this phase executes.** There is no code, no agent runtime,
no dashboard, and no automation. Every file in this folder is a role
definition the CEO executive will be built from in a later phase, once
`ai/core/` (orchestration runtime) and `ai/integrations/` (a future,
read-only-first data layer) both exist.

## What Phase 8 Is

A complete, self-contained specification of one AI executive — the
CEO — covering: mission, scope, authority boundary, decision rules, and
the orchestration layer that sits above the five existing domain
executives: executive orchestration, cross-domain briefing structure, a
decision framework for genuine conflicts, strategic planning synthesis,
priority management across domains, a company health model, a
meeting/cadence guide, founder interaction, escalation routing for
issues that cross domain boundaries, and the cross-executive
communication contract every sibling executive's own documentation
already anticipated. Every claim in this folder traces to something
that already exists in the repository or in a sibling executive's own,
already-written documentation — nothing here invents a new business
fact, a new metric, or a new system.

## What Phase 8 Is Not

- Not an AI agent that runs, decides, or acts on SmartDoor's behalf.
- Not a dashboard, executive-summary tool, or automated reporting
  system.
- Not a workflow engine, task router, or scheduling system.
- Not a change to any production code, schema, business logic, or any
  of the five sibling executives' own documentation.
- **Not another department.** The CEO owns no domain data, tables, or
  services of its own — see `CEO_PROFILE.md`. Its entire function is
  reading and synthesizing what the CTO, COO, CFO, CMO, and CPO already
  define.
- Not authority over any of the five sibling executives — see
  `AUTHORITY_MATRIX.md`, which is deliberately the narrowest of the six
  roles' matrices.

## How to Read This Folder

Start with `CEO_PROFILE.md` and `MISSION.md` for who the CEO is and why
it exists, then `RESPONSIBILITIES.md` and `AUTHORITY_MATRIX.md` for what
it owns (very little, by design) and what always requires founder
approval. `DECISION_RULES.md` defines how it reasons under uncertainty,
and `DECISION_FRAMEWORK.md` is the specific structured tool it applies
when two domains' recommendations genuinely conflict.
`EXECUTIVE_ORCHESTRATION.md` defines the coordination patterns across
the five domains; `EXECUTIVE_BRIEFING_GUIDE.md` is the shape of any
single cross-domain briefing, while `EXECUTIVE_MEETING_GUIDE.md` is the
recurring weekly/monthly cadence version of the same idea.
`STRATEGIC_PLANNING.md` and `PRIORITY_MANAGEMENT.md` split the
longer-horizon business-direction view from the shorter-horizon
attention-ordering view — each file's opening line states how it
differs from its near-namesake. `COMPANY_HEALTH_MODEL.md` is the
side-by-side, never-blended view of business health across all five
domains. `FOUNDER_INTERACTION.md` covers how the CEO engages with
Mubashir Hasan specifically. `EXECUTIVE_ESCALATION.md` and
`CROSS_EXECUTIVE_COMMUNICATION.md` define, respectively, how a
cross-domain escalation reaches the founder and how the CEO relates to
each of the five sibling executives' own communication contracts.
`KPI.md`, `DAILY_ROUTINES.md`, `WEEKLY_ROUTINES.md`, and
`MONTHLY_ROUTINES.md` define its planned operating cadence and how its
own performance is measured. `PROMPT_TEMPLATE.md` is the system-prompt
skeleton a future runtime would assemble the CEO from. `ROADMAP.md` is
the CEO's own readiness roadmap (what has to exist before this role is
real), not SmartDoor's business roadmap.

## Files in This Folder

| File | Purpose |
|---|---|
| `CEO_PROFILE.md` | Identity, background, working style of the AI CEO persona |
| `MISSION.md` | Why the CEO role exists and what it optimizes for |
| `RESPONSIBILITIES.md` | Full scope of ownership across orchestration, health synthesis, planning, and briefing |
| `AUTHORITY_MATRIX.md` | What the CEO can decide alone (very little) vs. needs founder approval for |
| `DECISION_RULES.md` | How the CEO reasons through cross-domain, ambiguous, or high-stakes situations |
| `EXECUTIVE_ORCHESTRATION.md` | How the CEO coordinates across the five existing domain executives |
| `EXECUTIVE_BRIEFING_GUIDE.md` | The structure for presenting any single cross-domain situation to the founder |
| `DECISION_FRAMEWORK.md` | The structured rubric applied when two executives' recommendations genuinely conflict |
| `STRATEGIC_PLANNING.md` | Cross-domain synthesis of SmartDoor's longer-horizon business direction |
| `PRIORITY_MANAGEMENT.md` | Shorter-horizon, cross-domain attention-ordering process |
| `COMPANY_HEALTH_MODEL.md` | Side-by-side, never-blended view of business health across all five domains |
| `EXECUTIVE_MEETING_GUIDE.md` | The recurring weekly/monthly cross-domain check-in cadence |
| `FOUNDER_INTERACTION.md` | How the CEO engages with Mubashir Hasan specifically |
| `EXECUTIVE_ESCALATION.md` | How a cross-domain or ambiguous escalation reaches the founder |
| `CROSS_EXECUTIVE_COMMUNICATION.md` | The CEO's side of the contract every sibling executive's own communication doc anticipated |
| `KPI.md` | How the CEO's own performance is measured |
| `DAILY_ROUTINES.md` | The CEO's planned (deliberately thin) daily cadence |
| `WEEKLY_ROUTINES.md` | The CEO's planned weekly cadence — its primary recurring cadence |
| `MONTHLY_ROUTINES.md` | The CEO's planned monthly cadence — health/strategy focused |
| `PROMPT_TEMPLATE.md` | System prompt skeleton for the future CEO agent |
| `ROADMAP.md` | The CEO's own readiness roadmap, plus the next-phase suggestion |

## Relationship to the Rest of SDOS

- Follows the shared skeleton and rules referenced in
  `ai/core/standards/` for consistency with every sibling executive's
  own convention — see "Known Documentation Gap" below for why that
  reference currently resolves to nothing on disk.
- Reads from `ai/knowledge/` (the Company Brain) for shared business
  context, and from all five sibling executives' own
  `ai/executives/<role>/` folders as its primary domain-level input —
  the CEO is the one role for which sibling documentation is as central
  an input as the Company Brain itself.
- Will eventually read live data only through `ai/integrations/`, once
  that layer exists (not built as of this phase).
- Has no write access to anything, anywhere, as of this phase — and,
  unlike every sibling executive, has no future domain of its own to
  eventually gain narrow write/decision authority within (see
  `AUTHORITY_MATRIX.md`).
- Sits alongside `ai/executives/cto/` (Phase 2), `ai/executives/coo/`
  (Phase 3), `ai/executives/cfo/` (Phase 4), `ai/executives/cmo/`
  (Phase 6), and `ai/executives/cpo/` (Phase 7) under the shared
  `ai/executives/README.md` contract — which, as of this phase, no
  longer lists the CEO folder as empty.

## Founder

SmartDoor is founded and run by Mubashir Hasan (Muah), who today
performs every executive function personally — engineering, operations,
finance, marketing, and product — on top of building the product
itself. The AI CEO defined here is designed to make the cross-domain
version of that reality easier to reason about, not to replace any part
of it — see `AUTHORITY_MATRIX.md` for exactly where founder approval is
always required, and `FOUNDER_INTERACTION.md` for how the CEO is meant
to engage with him directly.

## Known Documentation Gap (Flagged, Not Fixed — Inherited, Not Created by This Phase)

Per Golden Rule 5 (flag, don't silently resolve): `ai/executives/README.md`,
`ai/knowledge/MASTER_INDEX.md`, and all five sibling executives'
documentation reference a shared standards library at
`ai/core/standards/` (`ROLE_TEMPLATE.md` and nine `*_STANDARD.md`
files), described as built in "SDOS Phase 5." **This folder does not
exist anywhere in the repository** — `ai/core/` contains only its own
`README.md`, which still describes the directory as an empty Phase 0
placeholder. This discrepancy predates this phase, spans all five
existing executives equally, and was confirmed by direct inspection of
the repository (`find ai/core -iname "*standard*"` returns nothing), not
assumed. Fixing it is out of this phase's task boundary (additive-only
within `ai/executives/ceo/`); it is flagged here, in `ROADMAP.md`, and
named as a prerequisite question for the suggested next phase (SDOS
Runtime Foundation) rather than silently resolved in either direction.
This folder's own files still reference `ai/core/standards/*` paths, for
consistency with the established convention across all five sibling
folders — the gap is in that shared convention, not something unique to
this folder.

## What This Phase Deliberately Does Not Invent

There is no cross-domain conflict-resolution engine, no unified
executive dashboard, no automated company-health scoring system, and no
inter-executive messaging runtime anywhere in this repository. Every
guide in this folder is explicit about that boundary. Anything proposed
beyond what exists today — a persisted priority-tracking system, an
automated conflict detector, a blended health score — is labeled
**"Future SDOS Capability."**
