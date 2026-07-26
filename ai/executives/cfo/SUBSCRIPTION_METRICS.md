# Subscription Metrics

How the AI CFO reasons about SmartDoor's subscription base, grounded in
`services/subscriptions.js`, `services/renewalEngine.js`,
`services/gracePeriod.js`, and `plan_catalog`.

## Plan Tiers (Real)

| Plan key | Name | Monthly | Yearly | Support tier |
|---|---|---|---|---|
| `free` | Free | ₹0 | ₹0 | standard |
| `premium` | Premium | ₹29 | ₹299 | priority |
| `enterprise` | Enterprise | ₹999 | ₹9,999 | dedicated |
| `hardware_only` (legacy) | Premium Included | ₹0 (bundled) | — | priority-equivalent |
| `smartdoor_care` (legacy) | SmartDoor Care | — | ₹299 | priority-equivalent |

## Renewal Lifecycle (Real — `services/renewalEngine.js`)

```
90d before expiry → Early-bird nudge (email, low priority)
30d before expiry → Reminder (email + WhatsApp, medium priority)
7d before expiry  → Urgent reminder (email/SMS/WhatsApp/push, high priority)
1d before expiry  → Final warning (all channels, critical priority)
0d (expiry day)   → Expired notification + grace period starts
```

Triggered by `runDailyRenewalCheck()`, intended to run via cron
(currently: daily at 9 AM IST per the file's own comment, or manual
admin trigger).

## Grace Period (Real — `services/gracePeriod.js`)

- 15 days (`GRACE_PERIOD_DAYS`) after expiry before an owner is
  auto-downgraded to Free.
- Lifecycle states: `no_subscription`, `active`, `grace_period`,
  `expired_locked`.
- Pure read-only computation over `plates`/`subscriptions` data —
  consumed by the visitor route to decide what a visitor can do, and by
  the owner dashboard for renewal-urgency banners.

## Metrics the CFO Can Actually Compute Today

- Active subscription count per plan tier (`subscriptions` +
  `plan_catalog`, filtered by `status`).
- Subscriptions currently in `grace_period` vs. `expired_locked` — a
  real leading indicator of near-term churn.
- `cancel_at_period_end = true` count — subscriptions that will lapse at
  their next expiry without further action.
- Legacy-plan subscriber count (`hardware_only`, `smartdoor_care`) as a
  migration/retention consideration.

## Metrics the CFO Cannot Compute From Existing Data

- **Churn rate** in a formal sense requires a consistent historical
  snapshot methodology not currently implemented — a raw count of
  `expired_locked` subscriptions is a proxy, not a true churn rate.
- **LTV (lifetime value)** requires cost data that does not exist (see
  `UNIT_ECONOMICS.md`) — a revenue-only LTV can be computed but should
  always be labeled "revenue-only, not profit-based."
- **Renewal conversion rate** by channel (email vs. WhatsApp vs. SMS) is
  not tracked in a queryable form beyond `renewal_notifications` logs —
  computing a true conversion rate would require joining notification
  logs to actual renewal events, which is possible but not pre-built.

## Future SDOS Capability

- A subscription cohort/retention dashboard.
- Automated churn-rate calculation from a proper time-series snapshot.
- A renewal-channel effectiveness report.

None of the above exist today; any figure presented for them without
first building the underlying tracking would be an invented number, per
`DECISION_RULES.md` Rule 5.
