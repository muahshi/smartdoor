# AI CPO — SmartDoor Operating System (SDOS Phase 7)

## Status

Phase 7 of SDOS, built on top of Phase 5's shared standards
(`ai/core/standards/` — see `ai/core/standards/README.md`), Phase 6
(`ai/executives/cmo/`), and everything before it (Phases 0–4: foundation,
Company Brain, CTO, COO, CFO). This is the natural next phase suggested
by `ai/executives/cmo/ROADMAP.md`'s "Suggestion for Phase 7: AI CPO"
section, built the same way that folder was: from
`ai/core/standards/ROLE_TEMPLATE.md`, grounded in what already exists in
the repository rather than invented.

**Naming flag (per Golden Rule 5, `ai/core/standards/QUALITY_STANDARD.md`
— flag, don't silently resolve):** "Phase 7" is used twice in this
repository with two unrelated meanings. `js/productCatalog.js` already
documents a **"Phase 7 ecosystem"** — reserved, not-yet-built hardware
product categories (doorbells, cameras, locks, sensors; see
`products/products.md`'s "Future Product Lines" section). This SDOS
folder is a separate, unrelated **SDOS Phase 7** (an AI executive
documentation phase, continuing the SDOS phase count from Phase 6's
CMO). The two numbers are coincidental and refer to entirely different
things — one is a product-catalog roadmap marker, the other is an SDOS
build-phase marker. Neither is renamed or renumbered here; this note
exists so nobody conflates them later.

**Nothing in this phase executes.** There is no code, no agent runtime,
no dashboard, and no automation. Every file in this folder is a role
definition the CPO executive will be built from in a later phase, once
`ai/integrations/` (a future, read-only-first data layer) exists for it
to actually read production product data through.

## What Phase 7 Is

A complete, self-contained specification of one AI executive — the
CPO — covering: mission, scope, authority boundary, decision rules, and
domain playbooks for product strategy, roadmap stewardship, feature
prioritization, product discovery, customer feedback triage, user
research, product analytics, product metrics, release planning,
experimentation, and feature adoption — each grounded in what
SmartDoor's repository actually contains today (its real `feature_requests`
/ `bug_reports` triage functions in `services/customerGrowth.js`, its
real `customer_interviews` discovery table, its real `feature_usage_events`
/ `pmf_metrics_view` / `churn_analysis_view` / `customer_segment_breakdown_view`
analytics views, and its documented-but-unbuilt `design-system/future/`
extension points and `js/productCatalog.js` "Future Product Lines")
— plus its routines, KPIs, escalation matrix, inter-executive
communication contract, prompt template, and product-readiness roadmap.

## What Phase 7 Is Not

- Not an AI agent that runs, decides, or ships a feature on SmartDoor's
  behalf
- Not a product-management tool, roadmap board, or analytics dashboard
- Not a workflow engine or automation
- Not a change to any production code, schema, business logic, or the
  actual `SD_PRODUCTS` catalog
- Not the creation of any product capability that doesn't already exist
  in the repository (an A/B-testing/experimentation framework, a
  dedicated roadmap tool, a user-research panel, a release-versioning
  system beyond the existing `sql/NN_description.sql` migration
  sequence) — every such gap is named explicitly below and in the
  relevant guide, never assumed into existence

## How to Read This Folder

Start with `CPO_PROFILE.md` and `MISSION.md` for who the CPO is and why
it exists, then `RESPONSIBILITIES.md` and `AUTHORITY_MATRIX.md` for what
it owns and what always requires founder approval. `DECISION_RULES.md`
defines how it reasons under uncertainty. The `*_GUIDE.md`,
`*_STRATEGY.md`, `*_PLANNING.md`, `*_DISCOVERY.md`, `*_RESEARCH.md`,
`*_ANALYTICS.md`, `*_METRICS.md`, `*_ADOPTION.md`, `*_ROADMAP.md`, and
`*_FRAMEWORK.md` files are the CPO's operating playbooks, each grounded
in a real, cited part of the repository. Several file names are
deliberately adjacent in scope (`FEATURE_PRIORITIZATION.md` vs.
`PRIORITIZATION_FRAMEWORK.md`; `PRODUCT_ANALYTICS.md` vs.
`PRODUCT_METRICS.md`; `PRODUCT_ROADMAP.md` vs. this folder's own
`ROADMAP.md`) — each file's opening line states exactly how it differs
from its near-namesake so none of them duplicate content.
`DAILY_ROUTINES.md`, `WEEKLY_ROUTINES.md`, and `MONTHLY_ROUTINES.md`
define its planned operating cadence. `PROMPT_TEMPLATE.md` is the
system-prompt skeleton a future runtime (`ai/core/`) will assemble the
CPO from. `ROADMAP.md` is the CPO's own planning artifact, not
SmartDoor's product roadmap (that's `PRODUCT_ROADMAP.md`).

## Files in This Folder

| File | Purpose |
|---|---|
| `CPO_PROFILE.md` | Identity, background, working style of the AI CPO persona |
| `MISSION.md` | Why the CPO role exists and what it optimizes for |
| `RESPONSIBILITIES.md` | Full scope of ownership across product strategy/discovery/analytics |
| `AUTHORITY_MATRIX.md` | What the CPO can decide alone vs. needs founder approval for |
| `DECISION_RULES.md` | How the CPO reasons through ambiguous or unmeasurable product situations |
| `PRODUCT_STRATEGY.md` | SmartDoor's product strategy grounded in the real catalog, subscription tiers, and documented future extension points |
| `PRODUCT_ROADMAP.md` | The real, documented product roadmap surface (Future Product Lines, `design-system/future/`) vs. what's invented |
| `FEATURE_PRIORITIZATION.md` | The operational process for working the real `feature_requests` queue |
| `PRIORITIZATION_FRAMEWORK.md` | The underlying scoring rubric that process applies (value/effort/segment weighting) |
| `PRODUCT_DISCOVERY.md` | How the CPO reasons from `customer_interviews` and adjacent qualitative signals |
| `CUSTOMER_FEEDBACK_GUIDE.md` | Triage playbook for `feature_requests` / `bug_reports` / `feedback_logs`, and the boundary with CTO/COO |
| `USER_RESEARCH.md` | What research capability exists today (`customer_interviews`) vs. what doesn't (a panel, a research tool) |
| `PRODUCT_ANALYTICS.md` | What product data sources exist today (`feature_usage_events`, `pmf_metrics_view`, etc.) vs. what's missing |
| `PRODUCT_METRICS.md` | Which specific product-health metrics the CPO tracks and reports, computed from those sources |
| `RELEASE_PLANNING.md` | How the CPO sequences `feature_requests` into a release narrative without touching deployment |
| `EXPERIMENTATION_GUIDE.md` | Honest that no A/B-testing/experimentation framework exists in the repository today |
| `FEATURE_ADOPTION.md` | Per-feature adoption reasoning from `feature_usage_events` / `feature_usage_summary_view` |
| `KPI.md` | How the CPO's own performance is measured |
| `DAILY_ROUTINES.md` | The CPO's planned daily operating cadence |
| `WEEKLY_ROUTINES.md` | The CPO's planned weekly operating cadence |
| `MONTHLY_ROUTINES.md` | The CPO's planned monthly operating cadence |
| `ESCALATION_MATRIX.md` | Severity classification and escalation routing for product issues |
| `INTER_EXECUTIVE_COMMUNICATION.md` | How the CPO coordinates with CTO, COO, CFO, CMO, and a future CEO |
| `PROMPT_TEMPLATE.md` | System prompt skeleton for the future CPO agent |
| `ROADMAP.md` | The CPO's own product-readiness roadmap (not SmartDoor's product roadmap) |

## Relationship to the Rest of SDOS

- Follows the shared skeleton and rules in `ai/core/standards/`
  (`ROLE_TEMPLATE.md`, and every `*_STANDARD.md`/`*_TEMPLATE.md` it
  references) rather than restating them — see each file's opening
  line for which standard it follows.
- Reads from `ai/knowledge/` (the Company Brain) for business context —
  primarily `products/products.md`, `features/features.md`,
  `database/database.md`, `services/services.md`, and
  `company/company_profile.md`.
- Reuses SmartDoor's existing, real product-adjacent implementation as
  ground truth: `feature_requests` / `bug_reports` (`sql/11_beta_launch_schema.sql`,
  extended by `sql/13_customer_growth_schema.sql`), the real triage
  functions in `services/customerGrowth.js` (`assignBug()`,
  `resolveBug()`, `setFeaturePriority()`, `upvoteFeature()`) and
  `services/customerSuccess.js`, `customer_interviews`
  (`sql/13_customer_growth_schema.sql`), `feature_usage_events` /
  `feature_usage_summary_view` / `pmf_metrics_view` /
  `churn_analysis_view` / `customer_segment_breakdown_view` (same
  migration), `js/productCatalog.js`'s reserved "Future Product Lines"
  categories, and `design-system/future/README.md`'s five documented,
  not-yet-built extension seams. This folder does not duplicate or
  replace any of these — it points to them and defines how an AI CPO
  would use them.
- Will eventually read live data only through `ai/integrations/`, once
  that layer exists (not built as of this phase).
- Has no write access to anything, anywhere, as of this phase.
- Sits alongside `ai/executives/cto/` (Phase 2), `ai/executives/coo/`
  (Phase 3), `ai/executives/cfo/` (Phase 4), `ai/executives/cmo/`
  (Phase 6), and a future `ai/executives/ceo/` folder under the shared
  `ai/executives/README.md` contract.

## Founder

SmartDoor is founded and run by Mubashir Hasan (Muah), who today performs
every product-management role personally on top of every other role —
triaging `feature_requests` and `bug_reports` himself via
`services/customerGrowth.js`, conducting `customer_interviews` himself,
and deciding what ships next without a dedicated product function. The
AI CPO defined here is designed to **support**, not replace, that role —
see `AUTHORITY_MATRIX.md` for exactly where founder approval is always
required regardless of what the AI CPO recommends.

## What This Phase Deliberately Does Not Invent

SmartDoor's codebase already implements a real feature-request/bug-report
triage system and a real (if manual) customer-interview discovery
process — but it does **not** contain any A/B-testing or experimentation
framework, any dedicated roadmap-planning tool, any user-research panel
system, or any per-user feature-adoption funnel (confirmed: `feature_flags.js`
is a WebRTC kill-switch service, not an experiment engine — checked
directly, not assumed). Every guide in this folder is explicit about
that boundary. Anything proposed beyond what exists today is labeled
**"Future SDOS Capability."**

## A Real Company-Brain Gap Found While Auditing This Phase

Per Golden Rule 5 (flag, don't silently resolve): the repository contains
a substantial native Android app (`android/`, 114 Kotlin files,
`applicationId "in.mysmartdoor.app"`) that is not referenced anywhere in
`ai/knowledge/` — not in `features/features.md`, `pages/pages.md`, nor
`database/database.md`. This folder does not regenerate those Company
Brain files (out of scope for this phase — see the task boundary this
phase was built under), but flags the drift here and in `ROADMAP.md` so
it's visible rather than silently missed.
