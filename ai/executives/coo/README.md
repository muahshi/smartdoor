# AI CTO — SmartDoor Operating System (SDOS Phase 2)

## Status

Phase 2 of SDOS, built on top of Phase 0 (`ai/docs/SDOS_ARCHITECTURE.md`) and
Phase 1 (`ai/docs/COMPANY_BRAIN.md`). This phase defines the **AI CTO
executive** completely, in documentation only.

**Nothing in this phase executes.** There is no code, no agent runtime, no
chatbot, no dashboard, and no automation. Every file in this folder is a
role definition the CTO executive will be built from in a later phase, once
Phase 0's planned read-only integration layer (`ai/integrations/`) exists for
it to actually read production data through.

## What Phase 2 Is

A complete, self-contained specification of one AI executive — the CTO —
covering: mission, scope, responsibilities, decision authority, approval
matrix, coding/security/performance/architecture standards, release and
deployment process, bug triage rules, technical roadmap, prompt template,
KPIs, and risk framework.

## What Phase 2 Is Not

- Not an AI agent that runs, reviews code, or makes decisions
- Not a chatbot or conversational interface
- Not a dashboard
- Not an automation or CI/CD pipeline
- Not a change to any production code, schema, or business logic

## How to Read This Folder

Start with `CTO_PROFILE.md` and `MISSION.md` for who the CTO is and why it
exists, then `RESPONSIBILITIES.md` and `AUTHORITY_MATRIX.md` for what it
owns and what it may decide unilaterally versus escalate. The `*_GUIDE.md`
files are the CTO's standards library — what "good" looks like when it
eventually reviews code, architecture, security, performance, deployments,
and releases. `BUG_TRIAGE_GUIDE.md`, `DECISION_RULES.md`, and
`RISK_FRAMEWORK.md` define how it reasons under uncertainty.
`PROMPT_TEMPLATE.md` is the system-prompt skeleton a future runtime
(`ai/core/`) will assemble the CTO from. `ROADMAP.md` and `KPI.md` are the
CTO's own planning artifacts, not SmartDoor's product roadmap.

## Files in This Folder

| File | Purpose |
|---|---|
| `CTO_PROFILE.md` | Identity, background, working style of the AI CTO persona |
| `MISSION.md` | Why the CTO role exists and what it optimizes for |
| `RESPONSIBILITIES.md` | Full scope of ownership across engineering |
| `AUTHORITY_MATRIX.md` | What the CTO can decide alone vs. needs founder approval for |
| `DECISION_RULES.md` | How the CTO reasons through ambiguous or conflicting situations |
| `CODE_REVIEW_GUIDE.md` | Coding standards and review checklist |
| `ARCHITECTURE_GUIDE.md` | Architecture principles for SDOS and SmartDoor alike |
| `SECURITY_GUIDE.md` | Security standards and red lines |
| `PERFORMANCE_GUIDE.md` | Performance standards and budgets |
| `DEPLOYMENT_GUIDE.md` | Deployment process and safety checks |
| `RELEASE_GUIDE.md` | Release checklist and versioning discipline |
| `BUG_TRIAGE_GUIDE.md` | Severity classification and response SLAs |
| `ROADMAP.md` | The CTO's own technical roadmap (distinct from SmartDoor's product roadmap) |
| `PROMPT_TEMPLATE.md` | System prompt skeleton for the future CTO agent |
| `KPI.md` | How the CTO's own performance is measured |
| `RISK_FRAMEWORK.md` | How the CTO classifies and manages technical risk |

## Relationship to the Rest of SDOS

- Reads from `ai/knowledge/` (the Company Brain) for business/technical
  context — primarily `database.md`, `services.md`, `features.md`,
  `pages.md`, and `documents.md`.
- Will eventually read live data only through `ai/integrations/`, once that
  layer exists (not built as of this phase).
- Has no write access to anything, anywhere, as of this phase. Every guide
  in this folder describes standards to apply, not permission to apply them.
- Sits alongside future `ai/executives/ceo/`, `ai/executives/coo/`,
  `ai/executives/cfo/` folders under the shared `ai/executives/README.md`
  contract.

## Founder

SmartDoor is founded and run by Mubashir Hasan (Muah), who is also the
acting CTO/primary developer today. The AI CTO defined here is designed to
**support**, not replace, that role — see `AUTHORITY_MATRIX.md` for exactly
where founder approval is always required regardless of what the AI CTO
recommends.
