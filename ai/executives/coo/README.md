# AI COO — SmartDoor Operating System (SDOS Phase 3)

## Status

Phase 3 of SDOS, built on top of Phase 0 (`ai/docs/SDOS_ARCHITECTURE.md`),
Phase 1 (`ai/docs/COMPANY_BRAIN.md`), and Phase 2
(`ai/executives/cto/README.md`). This phase defines the **AI COO
executive** completely, in documentation only.

**Nothing in this phase executes.** There is no code, no agent runtime, no
chatbot, no dashboard, and no automation. Every file in this folder is a
role definition the COO executive will be built from in a later phase,
once `ai/integrations/` (a future, read-only-first data layer, per
`ai/docs/SDOS_ARCHITECTURE.md`) exists for it to actually read production
data through.

## What Phase 3 Is

A complete, self-contained specification of one AI executive — the COO —
covering: mission, scope, responsibilities, decision authority, order
fulfilment, manufacturing, inventory, customer support, installation,
logistics, and incident-response standards, plus its routines, KPIs,
escalation matrix, inter-executive communication contract, prompt
template, and operations roadmap.

## What Phase 3 Is Not

- Not an AI agent that runs, dispatches tickets, or makes operational
  decisions
- Not a chatbot or conversational interface
- Not a dashboard
- Not a workflow engine or automation
- Not a change to any production code, schema, or business logic

## How to Read This Folder

Start with `COO_PROFILE.md` and `MISSION.md` for who the COO is and why
it exists, then `RESPONSIBILITIES.md` and `AUTHORITY_MATRIX.md` for what
it owns and what it may decide unilaterally versus escalate. The
`*_GUIDE.md` files are the COO's operating playbooks — what "good" looks
like across order fulfilment, manufacturing, inventory, customer support,
installation, logistics, and incident response. `DECISION_RULES.md` and
`ESCALATION_MATRIX.md` define how it reasons and routes issues under
uncertainty. `DAILY_ROUTINES.md`, `WEEKLY_ROUTINES.md`, and
`MONTHLY_ROUTINES.md` define its planned operating cadence.
`PROMPT_TEMPLATE.md` is the system-prompt skeleton a future runtime
(`ai/core/`) will assemble the COO from. `ROADMAP.md` and `KPI.md` are the
COO's own planning artifacts, not SmartDoor's product roadmap.

## Files in This Folder

| File | Purpose |
|---|---|
| `COO_PROFILE.md` | Identity, background, working style of the AI COO persona |
| `MISSION.md` | Why the COO role exists and what it optimizes for |
| `RESPONSIBILITIES.md` | Full scope of ownership across operations |
| `AUTHORITY_MATRIX.md` | What the COO can decide alone vs. needs founder approval for |
| `DECISION_RULES.md` | How the COO reasons through ambiguous or conflicting situations |
| `OPERATIONS_GUIDE.md` | Overarching operations standards, system overview, rollback awareness |
| `ORDER_FULFILMENT_GUIDE.md` | Checkout → payment → plate/QR → subscription → dispatch chain |
| `MANUFACTURING_GUIDE.md` | Manufacturing queue, quality control, print packs |
| `INVENTORY_GUIDE.md` | Item/batch/movement inventory discipline |
| `CUSTOMER_SUPPORT_GUIDE.md` | Ticket handling, channels, SLAs, categories |
| `INSTALLATION_GUIDE.md` | Delivery-to-activation handoff and installation jobs |
| `LOGISTICS_GUIDE.md` | Shipping, tracking, delivery events |
| `INCIDENT_RESPONSE_GUIDE.md` | Operational incident handling and documentation |
| `KPI.md` | How the COO's own performance is measured |
| `DAILY_ROUTINES.md` | The COO's planned daily operating cadence |
| `WEEKLY_ROUTINES.md` | The COO's planned weekly operating cadence |
| `MONTHLY_ROUTINES.md` | The COO's planned monthly operating cadence |
| `ESCALATION_MATRIX.md` | Severity classification and escalation routing |
| `INTER_EXECUTIVE_COMMUNICATION.md` | How the COO coordinates with CTO, CFO, and CEO roles |
| `PROMPT_TEMPLATE.md` | System prompt skeleton for the future COO agent |
| `ROADMAP.md` | The COO's own operations roadmap (distinct from SmartDoor's product roadmap) |

## Relationship to the Rest of SDOS

- Reads from `ai/knowledge/` (the Company Brain) for business/operational
  context — primarily `workflows/workflows.md`, `business/business_rules.md`,
  `services/services.md`, and `database/database.md`.
- Reuses SmartDoor's existing operational documentation as the current
  source of ground truth: `OPERATIONS_RUNBOOK.md`, `SUPPORT_RUNBOOK.md`,
  and `docs/SUPPORT_ESCALATION_GUIDE.md` (all at repository root/`docs/`).
  This folder does not duplicate or replace those documents — it points
  to them and defines how an AI COO would use them.
- Will eventually read live data only through `ai/integrations/`, once
  that layer exists (not built as of this phase).
- Has no write access to anything, anywhere, as of this phase. Every
  guide in this folder describes standards to apply, not permission to
  apply them.
- Sits alongside `ai/executives/cto/` (Phase 2, fully defined) and future
  `ai/executives/ceo/`, `ai/executives/cfo/` folders under the shared
  `ai/executives/README.md` contract.

## Founder

SmartDoor is founded and run by Mubashir Hasan (Muah), who today performs
every operational role personally — fulfilment, support, manufacturing
coordination, and escalation handling — alongside the CTO/developer role
covered in Phase 2. The AI COO defined here is designed to **support**,
not replace, that role — see `AUTHORITY_MATRIX.md` for exactly where
founder approval is always required regardless of what the AI COO
recommends.
