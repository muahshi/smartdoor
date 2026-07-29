# Feature Adoption Guide

No standard — role-specific domain playbook. How the CPO reasons about
which features are actually used, from the one real adoption signal
that exists: `feature_usage_events`.

## The Real Signal

`feature_usage_events` (`owner_id`, `feature_key`, `used_at`) is a
generic ping any part of the app can call for any `feature_key`, with
no schema change needed to add a new one. `feature_usage_summary_view`
aggregates this into a `feature_key` → `usage_count` ranking over a
rolling **30-day window** (`WHERE used_at >= NOW() - INTERVAL '30 days'`).

## How the CPO Reads It

1. **Rank, don't overinterpret.** The view gives a relative usage
   ranking across whichever `feature_key` values the app happens to
   ping today — it says nothing about features that exist but aren't
   instrumented with a ping at all. Before concluding a feature is
   "unused," confirm it's actually instrumented (check the calling code
   for `feature_usage_events` inserts), not just absent from the view.
2. **Combine with `pmf_metrics_view.avg_usage_events_per_owner_30d`**
   for a per-owner engagement-depth baseline to compare a specific
   `feature_key`'s count against.
3. **Cross-reference low adoption against `feature_requests`.** A
   low-usage feature with active `feature_requests` complaining about
   it is a different situation (a discoverability or usability problem)
   than a low-usage feature with no related requests (possibly genuinely
   low-value) — the CPO states which case applies rather than treating
   "low usage" as a single verdict.

## What's Not Tracked (Confirmed, Not Assumed)

- No per-user "first used" timestamp separate from the raw event log
  (time-to-first-use would require a query the CPO can construct
  read-only in a future `ai/integrations/` phase, but no dedicated field
  or view computes it today).
- No adoption-over-time trend beyond the current 30-day window — a
  month-over-month adoption *trend* requires comparing two
  `feature_usage_summary_view` snapshots taken at different times, not
  a single query.
- No funnel between related features (e.g. "used feature A then B") —
  each `feature_key` is independent in the current schema.

## What This Guide Is Not

- Not a claim that every shipped feature is instrumented — that's a
  CTO/engineering decision made per feature, not guaranteed by this
  guide.
- Not authority to add new instrumentation — a new `feature_key` ping
  is a code change, the CTO's domain.
