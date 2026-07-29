# Company Health Model

A single, cited view of "how is SmartDoor doing," assembled entirely
from each domain executive's own already-defined health signals — never
a CEO-invented composite score. This is a documentation artifact
describing how such a view *would* be assembled once each domain
executive is active and reading live data via `ai/integrations/` (not
yet built) — it is not a live or historical dashboard, and no numbers in
this file are real measurements.

## The Five Health Dimensions, As Each Domain Already Defines Them

| Dimension | Owned by | Real signal sources (already documented, not invented) |
|---|---|---|
| Technical health | CTO | `cto/RISK_FRAMEWORK.md`, `cto/PERFORMANCE_GUIDE.md`, `bug_reports`/`error_logs` (per `cto/BUG_TRIAGE_GUIDE.md`), known technical debt in `cto/ROADMAP.md` |
| Operational health | COO | `coo/KPI.md`, open escalations per `coo/ESCALATION_MATRIX.md`, fulfilment/manufacturing/support state per `coo/OPERATIONS_RUNBOOK.md`/`SUPPORT_RUNBOOK.md` |
| Financial health | CFO | `cfo/KPI.md`, `cfo/UNIT_ECONOMICS.md`, `cfo/CASHFLOW_GUIDE.md`, `cfo/SUBSCRIPTION_METRICS.md`, real billing data in `sql/46_saas_billing_schema.sql`/`sql/58_gst_billing_phase8b.sql` |
| Marketing/growth health | CMO | `cmo/KPI.md`, `cmo/ANALYTICS_GUIDE.md`, real campaign/growth schema (`sql/57_commerce_engine_phase8a.sql`, `sql/11_beta_launch_schema.sql`, `sql/13_customer_growth_schema.sql`) |
| Product health | CPO | `cpo/KPI.md`, `cpo/PRODUCT_METRICS.md`, real `feature_usage_events`/`pmf_metrics_view`/`churn_analysis_view` (`sql/13_customer_growth_schema.sql`) |

## How This Model Is Meant to Be Used

Once each domain executive is active and can read live data, a "company
health" question would be answered by pulling each dimension's own
already-defined signals — not by the CEO computing a new number. The
CEO's role is limited to:

1. Confirming which of the five dimensions actually has fresh,
   citable data behind the current answer, and which doesn't.
2. Presenting all five side by side, so the founder sees the whole
   picture at once rather than five separate answers on five separate
   occasions.
3. Flagging any dimension where the underlying domain executive itself
   would say "not tracked" (per each sibling's own Rule 5 in its
   `DECISION_RULES.md`) rather than silently filling that gap with an
   estimate.

## What Would Make a Blended Score Dishonest

A single "company health = 82/100" style figure would necessarily
average across dimensions that don't share a common unit (a technical
risk classification is not a currency; a churn percentage is not a bug
count) and would obscure exactly the kind of domain-specific detail the
founder needs to act on any one dimension. Per `DECISION_RULES.md` Rule
5, this model deliberately does not produce that number. It produces a
side-by-side view instead.

## Current State of This Model (Phase 8)

No dimension currently has live data behind it: `ai/integrations/` does
not exist yet, so no domain executive is reading production data as of
this phase (each domain executive's own `README.md`/profile already
states this). This file therefore documents the intended *shape* of a
future company health view, grounded entirely in real, already-existing
sibling-executive documentation — it does not, and cannot yet, produce
an actual health reading.

## What This Model Is Not

- Not a live dashboard, chart, or automated report — building one is
  explicitly out of scope for this phase (see the task boundary in
  `README.md`).
- Not a replacement for reading any one domain's own KPI file directly
  when the founder needs depth on a single dimension.
- Not a scoring system that could be gamed by one domain executive
  over-reporting good news — every figure this model would ever surface
  must trace to a cited, real source.
