# Analytics Guide

What marketing-relevant data actually exists in SmartDoor's schema today
versus what's missing — the single most important honesty document in
this folder, since most marketing-analytics questions a founder might
ask cannot currently be answered from real data.

## 1. What Exists and Is Real

- **`pmf_metrics_view`** (`sql/13_customer_growth_schema.sql`):
  `daily_active_owners`, `weekly_active_owners`, `monthly_active_owners`,
  `retention_rate_pct`, `renewal_rate_pct`, `avg_renewal_intent`,
  `avg_referral_intent` (both from `nps_responses`), and
  `avg_usage_events_per_owner_30d`.
- **`churn_analysis_view`**: `inactive_customers_30d`,
  `expired_subscriptions`, `failed_renewals`,
  `low_engagement_customers`.
- **`customer_segment_breakdown_view`**: count of owners per
  `customer_segments.segment` (`beta` / `early_access` / `paying` /
  `vip`).
- **`feature_usage_summary_view`**: 30-day usage count per
  `feature_usage_events.feature_key`.
- **`getReferralLeaderboard()`** (`services/customerGrowth.js`): real
  top-referrer ranking from `referrals`.
- **`getReviewsSummary()`**: real aggregate of `customer_reviews` rating
  data.
- All of the above are tagged `CFO / COO` in `services/services.md`
  (`adminAnalytics.js`, `analytics.js`) — no `CMO` tag exists yet; the
  CMO reads this data as a consumer, it does not own the underlying
  service (see `RESPONSIBILITIES.md` §9 and `ROADMAP.md`).

## 2. What Does NOT Exist (Confirmed by Direct Search)

- **No channel attribution of any kind.** No `utm_source`,
  `utm_campaign`, `referral_source`, `acquisition_source`, or
  `traffic_source` field exists in any table in `sql/` or is written by
  any file in `services/` — checked directly across the full
  schema/service tree, not inferred from absence of mention.
- **No ad-spend ledger** — see `PAID_ADS_GUIDE.md`.
- **No page-level traffic/visit analytics** (no pageview table, no
  session-source tracking) beyond `visitor_visits` /
  `visitor_logs`/`visitor_profiles`, which track *visitor-to-a-specific-
  plate* QR-scan activity (a post-purchase, per-owner metric), not
  pre-purchase marketing-site traffic.
- **No conversion-funnel instrumentation** for the marketing site itself
  (`index.html` → `products.html` → checkout) — order completion is
  tracked (`orders.payment_status`), but nothing upstream of "an order
  was placed" (page views, add-to-configurator events, drop-off points)
  is captured.

## 3. What the CMO Can Responsibly Report

- Trend-level reads of the real views above (e.g. "referral intent per
  NPS has moved from X to Y") — always citing the source view/table.
- Segment composition and churn-risk counts from real data.
- Anything beyond this — channel performance, campaign ROI, funnel
  conversion rate, CAC — must be answered with what's missing and what
  would need to be built, per `DECISION_RULES.md` Rule 5, never with an
  estimated number.

## 4. Discipline

- Every marketing-analytics answer states its source view/table by name.
- A "not tracked" answer is treated as a complete, correct answer — not
  a failure to find the number.

## Future SDOS Capability

- Channel-attribution tracking (UTM capture, referral-source field on
  `orders`) does not exist — the single highest-leverage marketing data
  gap; see `ROADMAP.md`.
- Marketing-site funnel/pageview analytics does not exist.
- A `CMO`-tagged service in `services/services.md` does not exist yet —
  proposed as a documentation update in `ROADMAP.md`, not made here.
