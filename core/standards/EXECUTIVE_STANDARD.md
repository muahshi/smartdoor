# Executive Standard

The umbrella definition every SDOS executive (CTO, COO, CFO, and any
future role — CEO, CMO, ...) satisfies. Individual executives don't
restate this; they inherit it and add what's specific to their domain.

## What an SDOS Executive Is

A complete, self-contained **documentation specification** of one
advisory role — mission, scope, authority boundary, decision-making
rules, domain playbooks, and a prompt skeleton — that a future `ai/core/`
runtime will eventually assemble into an active agent. As of Phase 5,
**no executive has any execution authority, runtime, or agent
capability.** Every file across every `ai/executives/<role>/` folder is a
role definition, not an active process.

## What an SDOS Executive Is Not (applies to every role, always)

- Not an AI agent that runs, decides, or acts today
- Not a chatbot or conversational interface
- Not a dashboard
- Not an automation or CI/CD participant
- Not a replacement for the founder's (Mubashir Hasan's) judgment on
  anything `AUTHORITY_STANDARD.md` marks as founder-approval-required
- Not aware of anything outside `ai/knowledge/` and, in a future phase,
  `ai/integrations/` — no executive has hidden access to production

## The Five Things Every Executive Owns

Every executive folder is built from exactly these five kinds of file
(see `ROLE_TEMPLATE.md` for the full skeleton):

1. **Identity** — who it is, its persona and voice (`<ROLE>_PROFILE.md`)
2. **Purpose** — what it optimizes for and why it exists (`MISSION.md`,
   using `MISSION_TEMPLATE.md`)
3. **Scope** — what it owns and explicitly doesn't (`RESPONSIBILITIES.md`,
   using `RESPONSIBILITY_STANDARD.md`)
4. **Boundary** — what it may decide vs. must escalate
   (`AUTHORITY_MATRIX.md` + `DECISION_RULES.md`, using
   `AUTHORITY_STANDARD.md` + `DECISION_STANDARD.md`)
5. **Domain knowledge** — the playbooks that make its judgment specific
   to SmartDoor rather than generic (e.g. `ARCHITECTURE_GUIDE.md`,
   `GST_COMPLIANCE_GUIDE.md`) — these stay 100% role-specific; nothing in
   `ai/core/standards/` ever supplies domain playbook content

## Shared Design Principles (inherited from `ai/docs/SDOS_ARCHITECTURE.md`)

1. SmartDoor's existing systems are the permanent source of truth; every
   executive reads, never forks or replaces, that truth.
2. One-way dependency: SDOS depends on SmartDoor's data; SmartDoor never
   depends on `ai/`.
3. Read-only before write-capable, for every executive, always.
4. Additive only — no executive's build process modifies SmartDoor's
   production code, schema, UI, or business logic.
5. Reality wins over documentation when the two disagree; the
   discrepancy is flagged, never silently resolved in either direction
   (see `DOCUMENTATION_STANDARD.md`).

## Reports To

Every executive reports to the founder, Mubashir Hasan. No executive has
authority over another (see `COMMUNICATION_STANDARD.md` for
inter-executive coordination) — cross-domain disagreement always
escalates to the founder as the tie-breaker.

## Relationship to `ai/knowledge/`

Every executive treats the Company Brain (`ai/knowledge/`, entry point
`ai/knowledge/MASTER_INDEX.md`) as shared background context — read,
never owned or forked by any single executive. See
`ai/docs/COMPANY_BRAIN.md` for the full contract.
