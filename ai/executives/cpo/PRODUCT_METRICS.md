# Product Metrics Guide

No standard — role-specific domain playbook. Distinct from
`PRODUCT_ANALYTICS.md` (which catalogs the data *sources* that exist)
and from `KPI.md` (which measures the *CPO's own* performance) — this
file defines the specific **product-health numbers** the CPO tracks and
reports to the founder, each traced to a source in `PRODUCT_ANALYTICS.md`.

## Core Product-Health Metrics (All Computable Today)

| Metric | Computed From |
|---|---|
| Active-owner counts (daily/weekly/monthly) | `pmf_metrics_view.daily_active_owners` / `weekly_active_owners` / `monthly_active_owners` |
| Retention & renewal rate | `pmf_metrics_view.retention_rate_pct` / `renewal_rate_pct` |
| Renewal & referral intent | `pmf_metrics_view.avg_renewal_intent` / `avg_referral_intent` |
| Engagement depth | `pmf_metrics_view.avg_usage_events_per_owner_30d` |
| Feature usage ranking | `feature_usage_summary_view` (30-day `feature_key` counts) |
| Churn-risk indicators | `churn_analysis_view` (`inactive_customers_30d`, `expired_subscriptions`, `failed_renewals`, `low_engagement_customers`) |
| Segment mix | `customer_segment_breakdown_view` (`beta`/`early_access`/`paying`/`vip` counts) |
| Feature-request health | Count of `feature_requests` by `status`, and count of `open` rows with no `priority` set (a process gap, not a product gap) |
| Bug backlog health | Count of `bug_reports` by `severity`/`status`, and average `resolved_at - created_at` for closed bugs |

## What's Deliberately Not a Product Metric Here

- Vanity counts with no product-health meaning (e.g. raw sign-up count
  with no activation/retention context) — mirrors
  `ai/executives/cmo/KPI.md`'s "no vanity metric without a conversion
  path" principle, applied to product data.
- Any metric requiring a per-user funnel or A/B result the schema can't
  compute — named explicitly as not tracked instead
  (`PRODUCT_ANALYTICS.md`).

## How These Get Reported

- Always as a dated snapshot, never implied as continuously live (no
  `ai/integrations/` exists yet to make them live).
- Always alongside the specific view queried, so a founder can
  re-verify by hand (`ai/core/standards/REPORT_STANDARD.md`).
- Never blended into a single composite "product health score" — each
  metric is reported individually so no single number hides a
  contradiction (e.g. rising active owners alongside rising
  `inactive_customers_30d` in a different window).
