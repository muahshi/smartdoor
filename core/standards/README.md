# ai/core/standards — SDOS Shared Executive Framework

## Status

SDOS Phase 5. Built on top of Phase 0 (`ai/docs/SDOS_ARCHITECTURE.md`),
Phase 1 (`ai/docs/COMPANY_BRAIN.md`), Phase 2 (AI CTO), Phase 3 (AI COO),
and Phase 4 (AI CFO). **This phase creates no new executive, no AI, no
dashboard, and no workflow.** It is documentation-only, exactly like the
phases before it: it standardizes the *shape* that every current and
future SDOS executive is built from, so the pattern that CTO/COO/CFO
already converged on independently doesn't have to be reinvented (and
subtly redrifted) for every future role — CEO, CMO, and beyond.

## Why This Exists

Phases 2–4 built three executives independently, each mirroring the one
before it by hand ("structured to mirror `ai/executives/cto/...`,
adapted for operations"). That worked, but it means the *shared* rules —
what counts as founder-approval-required, how a decision rule is
structured, what a KPI category looks like, how a prompt gets assembled —
were copy-pasted and lightly reworded three times instead of defined
once. `ai/core/standards/` is that single definition. Each executive
folder now states its role-specific content and points here for the
generic mechanics, instead of restating them.

## What Belongs Here vs. What Doesn't

**Belongs here (generic, role-agnostic):**
- The universal founder-approval rules every executive inherits
  (schema/RLS, payments, auth, deployment, deletion, `ai/integrations/`
  scope, new vendors, customer communication)
- The shape of a decision rule, a KPI category, an escalation matrix, a
  prompt assembly order
- File-naming, folder-layout, documentation, and review conventions
- The "Golden Rules" engineering discipline (audit before touching,
  extend don't rebuild, no placeholders, minimal diffs, flag don't
  silently resolve) that CTO originated and every later executive reused

**Does not belong here (role-specific, stays in `ai/executives/<role>/`):**
- Any individual executive's actual mission, persona, or voice content
- Domain playbooks (`ARCHITECTURE_GUIDE.md`, `MANUFACTURING_GUIDE.md`,
  `GST_COMPLIANCE_GUIDE.md`, etc.)
- The specific tables in an Authority Matrix, the specific rules in a
  Decision Rules file, the specific KPIs in a KPI file — only their
  *shape* is standardized; their content is always role-grounded in that
  executive's actual domain and the real SmartDoor codebase/schema

## Standards Index

| File | Defines the shared shape of... |
|---|---|
| `EXECUTIVE_STANDARD.md` | What an "SDOS executive" is, at all — the umbrella every other standard sits under |
| `ROLE_TEMPLATE.md` | The folder/file skeleton every executive is built from |
| `MISSION_TEMPLATE.md` | An executive's `MISSION.md` |
| `RESPONSIBILITY_STANDARD.md` | An executive's `RESPONSIBILITIES.md` |
| `AUTHORITY_STANDARD.md` | An executive's `AUTHORITY_MATRIX.md`, plus the universal always-founder-approval rules |
| `DECISION_STANDARD.md` | An executive's `DECISION_RULES.md` |
| `KPI_STANDARD.md` | An executive's `KPI.md` |
| `ESCALATION_STANDARD.md` | An executive's `ESCALATION_MATRIX.md` |
| `COMMUNICATION_STANDARD.md` | Voice/tone, and inter-executive communication (`INTER_EXECUTIVE_COMMUNICATION.md`) |
| `MEETING_STANDARD.md` | Recurring routines (`DAILY_ROUTINES.md` / `WEEKLY_ROUTINES.md` / `MONTHLY_ROUTINES.md`) |
| `REPORT_STANDARD.md` | Any founder-facing or external-facing report (investor updates, summaries) |
| `PROMPT_STANDARD.md` | An executive's `PROMPT_TEMPLATE.md` |
| `RISK_STANDARD.md` | An executive's risk-classification framework |
| `DOCUMENTATION_STANDARD.md` | How executives write, cite, and keep documentation honest (inherits `ai/docs/COMPANY_BRAIN.md`) |
| `NAMING_STANDARD.md` | File and folder naming conventions across `ai/` |
| `FOLDER_STANDARD.md` | Where things live in `ai/` and in an executive folder specifically |
| `QUALITY_STANDARD.md` | The Golden Rules engineering discipline applied to any SDOS work |
| `REVIEW_STANDARD.md` | How any proposed change (code, doc, or standard) gets reviewed |

## How an Executive Uses This Folder

An executive's own `README.md` and role files should **reference**, not
duplicate, the relevant standard — e.g. `AUTHORITY_MATRIX.md` opens with
"Structure and universal rules: see
`ai/core/standards/AUTHORITY_STANDARD.md`. This file adds the
[role]-specific approval table below." rather than restating the
universal rules and boilerplate that standard already defines.

## Ground Rules

- **Standards describe shape, not decisions.** Nothing here grants
  execution authority to any executive — see `AUTHORITY_STANDARD.md`,
  which is itself still documentation-only as of Phase 5.
- **A standard is single-sourced.** If a rule genuinely applies to every
  executive, it is written once, here — never copy-pasted per role again.
  If a future executive needs a variant, the variant lives in that
  executive's own file with an explicit note of how it differs from the
  standard, not a silent fork.
- **Nothing here modifies SmartDoor's production code, schema, or
  business logic.** Same boundary as every prior SDOS phase.
