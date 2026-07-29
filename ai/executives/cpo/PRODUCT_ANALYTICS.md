# Product Analytics Guide

No standard — role-specific domain playbook. Catalogs what product data
*sources* exist today. Distinct from `PRODUCT_METRICS.md`, which defines
the specific *numbers* the CPO tracks and reports from these sources.

## Real Data Sources (`sql/13_customer_growth_schema.sql`)

| Source | What It Actually Contains |
|---|---|
| `feature_usage_events` | Generic per-owner "feature was used" ping (`feature_key`, `used_at`) — app-instrumented, extensible without a schema change |
| `feature_usage_summary_view` | `feature_key` usage counts over the last 30 days, ordered by `usage_count DESC` |
| `pmf_metrics_view` | `daily_active_owners`, `weekly_active_owners`, `monthly_active_owners`, `retention_rate_pct`, `renewal_rate_pct` (from `retention_metrics_view`), plus `avg_renewal_intent`, `avg_referral_intent` (from `nps_responses`), and `avg_usage_events_per_owner_30d` |
| `churn_analysis_view` | `inactive_customers_30d`, `expired_subscriptions`, `failed_renewals`, `low_engagement_customers` |
| `customer_segment_breakdown_view` | Count of owners per `customer_segments.segment` |
| `first_100_dashboard_view` | Aggregate operational snapshot (total/activated/active customers, pending activations, open tickets, 30-day renewals due, satisfaction/NPS averages) |
| `support_health_view` | `avg_resolution_hours`, `escalated_tickets`, `repeat_issue_customers` — support-quality signal, COO-primary but relevant product context |

## What's Genuinely Not Tracked (Confirmed, Not Assumed)

- No per-user feature-adoption funnel (only aggregate `feature_key`
  counts, not "which owners used X then Y").
- No time-to-first-use metric.
- No cohort retention curve (only point-in-time aggregate
  `retention_rate_pct`/`renewal_rate_pct`).
- No A/B-test or experiment-result data (see `EXPERIMENTATION_GUIDE.md`).
- No channel-attribution data connecting product usage back to
  acquisition source (the same gap `ai/executives/cmo/ANALYTICS_GUIDE.md`
  names for marketing).

## How the CPO Uses These Sources

- Always names the specific view/table behind any product-analytics
  claim (`DECISION_RULES.md` Rule 9).
- Treats `feature_usage_summary_view`'s 30-day window as exactly that —
  never extrapolates a longer trend from it without saying so.
- Cross-references `pmf_metrics_view` and `churn_analysis_view` together
  when reasoning about product health, since a high `retention_rate_pct`
  alongside rising `inactive_customers_30d` is worth flagging as a
  possible measurement-window mismatch, not silently reconciling one
  against the other.

## What This Guide Is Not

- Not a data pipeline or dashboard — a catalog of what's queryable
  today, to be read through `ai/integrations/` once that layer exists.
- Not authority to add a new event type or view — that's a schema
  change, always founder-approval-gated.
