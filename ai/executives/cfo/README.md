# AI CFO — SmartDoor Operating System (SDOS Phase 4)

## Status

Phase 4 of SDOS, built on top of Phase 0 (`ai/docs/SDOS_ARCHITECTURE.md`),
Phase 1 (`ai/docs/COMPANY_BRAIN.md`), Phase 2
(`ai/executives/cto/README.md`), and Phase 3
(`ai/executives/coo/README.md`). This phase defines the **AI CFO
executive** completely, in documentation only.

**Nothing in this phase executes.** There is no code, no agent runtime, no
dashboard, and no automation. Every file in this folder is a role
definition the CFO executive will be built from in a later phase, once
`ai/integrations/` (a future, read-only-first data layer, per
`ai/docs/SDOS_ARCHITECTURE.md`) exists for it to actually read production
financial data through.

## What Phase 4 Is

A complete, self-contained specification of one AI executive — the CFO —
covering: mission, scope, responsibilities, decision authority, the real
financial model already implemented in the codebase (revenue, GST
billing, subscriptions, pricing, budgeting), unit economics, investor
reporting, and fundraising posture, plus its routines, KPIs, escalation
matrix, inter-executive communication contract, prompt template, and
financial roadmap.

## What Phase 4 Is Not

- Not an AI agent that runs, approves refunds, or changes prices
- Not a financial dashboard or reporting tool
- Not a workflow engine or automation
- Not a change to any production code, schema, pricing constant, or
  business logic

## How to Read This Folder

Start with `CFO_PROFILE.md` and `MISSION.md` for who the CFO is and why
it exists, then `RESPONSIBILITIES.md` and `AUTHORITY_MATRIX.md` for what
it owns and what always requires founder approval. `FINANCIAL_MODEL.md`
is the grounding document — it maps every financial concept below to the
actual table, service, or Edge Function that implements it today. The
`*_GUIDE.md` files are the CFO's operating playbooks. `DECISION_RULES.md`
and `ESCALATION_MATRIX.md` define how it reasons and routes issues under
uncertainty. `DAILY_ROUTINES.md`, `WEEKLY_ROUTINES.md`, and
`MONTHLY_ROUTINES.md` define its planned operating cadence.
`PROMPT_TEMPLATE.md` is the system-prompt skeleton a future runtime
(`ai/core/`) will assemble the CFO from. `ROADMAP.md` and `KPI.md` are the
CFO's own planning artifacts, not SmartDoor's product roadmap.

## Files in This Folder

| File | Purpose |
|---|---|
| `CFO_PROFILE.md` | Identity, background, working style of the AI CFO persona |
| `MISSION.md` | Why the CFO role exists and what it optimizes for |
| `RESPONSIBILITIES.md` | Full scope of ownership across finance |
| `AUTHORITY_MATRIX.md` | What the CFO can decide alone vs. needs founder approval for |
| `DECISION_RULES.md` | How the CFO reasons through ambiguous or conflicting situations |
| `FINANCIAL_MODEL.md` | The real financial model as implemented — pricing, billing, revenue, tables, services |
| `REVENUE_GUIDE.md` | Hardware, subscription, partner/commission, and replacement revenue streams |
| `SUBSCRIPTION_METRICS.md` | Plan tiers, renewal lifecycle, grace period, churn/downgrade signals |
| `CASHFLOW_GUIDE.md` | Payment capture, webhook reconciliation, refund ledger, settlement timing |
| `PROFITABILITY_GUIDE.md` | What can and cannot be assessed for profitability given current data |
| `PRICING_GUIDE.md` | The two-place pricing rule, plan pricing, coupons, bulk/partner pricing |
| `BUDGETING_GUIDE.md` | How the CFO would reason about spend at founder-operated scale |
| `GST_COMPLIANCE_GUIDE.md` | GST settings, HSN/SAC codes, CGST/SGST/IGST computation, invoice numbering |
| `UNIT_ECONOMICS.md` | What unit economics can be computed today vs. what data is missing |
| `INVESTOR_REPORTING.md` | What an investor update would draw on today, honestly scoped |
| `FUNDRAISING_GUIDE.md` | The CFO's role if/when a fundraising process starts |
| `KPI.md` | How the CFO's own performance is measured |
| `DAILY_ROUTINES.md` | The CFO's planned daily operating cadence |
| `WEEKLY_ROUTINES.md` | The CFO's planned weekly operating cadence |
| `MONTHLY_ROUTINES.md` | The CFO's planned monthly operating cadence |
| `ESCALATION_MATRIX.md` | Severity classification and escalation routing for financial issues |
| `INTER_EXECUTIVE_COMMUNICATION.md` | How the CFO coordinates with CTO, COO, and CEO roles |
| `PROMPT_TEMPLATE.md` | System prompt skeleton for the future CFO agent |
| `ROADMAP.md` | The CFO's own financial-operations roadmap |

## Relationship to the Rest of SDOS

- Reads from `ai/knowledge/` (the Company Brain) for business/financial
  context — primarily `business/business_rules.md`, `products/products.md`,
  `database/database.md`, and `services/services.md` (the services already
  tagged `CFO` or `CFO / COO`).
- Reuses SmartDoor's existing financial documentation as the current
  source of ground truth: `docs/legal/refund-policy.md`,
  `docs/legal/terms-of-service.md`, and the live `gst_settings` /
  `plan_catalog` / `invoices` schema (`sql/46_saas_billing_schema.sql`,
  `sql/58_gst_billing_phase8b.sql`). This folder does not duplicate or
  replace those — it points to them and defines how an AI CFO would use
  them.
- Will eventually read live data only through `ai/integrations/`, once
  that layer exists (not built as of this phase).
- Has no write access to anything, anywhere, as of this phase.
- Sits alongside `ai/executives/cto/` (Phase 2), `ai/executives/coo/`
  (Phase 3), and a future `ai/executives/ceo/` folder under the shared
  `ai/executives/README.md` contract.

## Founder

SmartDoor is founded and run by Mubashir Hasan (Muah), who today performs
every financial role personally — pricing decisions, GST configuration,
refund approvals, and whatever investor conversations exist — alongside
the CTO/developer role (Phase 2) and the operational role Phase 3's COO
supports. The AI CFO defined here is designed to **support**, not
replace, that role — see `AUTHORITY_MATRIX.md` for exactly where founder
approval is always required regardless of what the AI CFO recommends.

## What This Phase Deliberately Does Not Invent

SmartDoor's codebase and SQL migrations define a real, working billing
and GST system, but they do **not** contain a cost-of-goods-sold ledger,
a cap table, investor records, a formal budget, or a general ledger /
accounting system of any kind. Every document in this folder is explicit
about that boundary — see `UNIT_ECONOMICS.md` and
`INVESTOR_REPORTING.md` in particular — rather than inventing numbers or
structures that don't exist in the repository. Anything proposed beyond
what exists today is labeled **"Future SDOS Capability."**
