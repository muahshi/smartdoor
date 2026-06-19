# Smart Door — First 100 Customers Playbook

Goal: go from "the product works" to "100 real households have paid, activated, and would renew." This is a learning exercise as much as a sales one — every customer in this batch is a data point on whether Smart Door is worth paying for.

---

## 1. Who counts as "the first 100"

Use `customer_segments` (sql/13_customer_growth_schema.sql) to tag every account:

| Segment | Meaning | Pricing |
|---|---|---|
| `beta` | Free/discounted, pre-launch testers | Free or token amount |
| `early_access` | First paying cohort, knows it's early | Discounted, locked-in price |
| `paying` | Standard customer, post-launch | Full price |
| `vip` | High engagement, referrers, or manually flagged | Full price + priority support |

Assign a segment the moment an order is placed (`assignSegment()` in `services/customerGrowth.js`). Don't leave anyone unsegmented — `getSegmentBreakdown()` is the first thing you check each morning.

## 2. Daily operating rhythm

Open `getFirst100Dashboard()` every morning. It is the single source of truth for:

- Total customers vs. activated customers — the gap is your operations backlog, not a metrics problem
- Pending activations — anyone sitting here more than 5 days needs a phone call, not another WhatsApp message
- Open support tickets — if this number is rising while total customers is flat, something is broken in the product, not in support
- Renewals due in 30 days — this is your retention pipeline, plan outreach a month ahead

## 3. The activation bottleneck is the real KPI

Most "first 100" failures aren't acquisition failures — they're activation failures. A customer who paid but never set up family routing or never got a visitor scan is not a customer, they're a refund risk. Track `pending_activations` daily and call (not message) anyone stuck for more than 5 days.

## 4. Talk to every customer, not just the unhappy ones

Run at least 15–20 structured interviews across this batch using `customer_interviews` (template: `CUSTOMER_INTERVIEW_TEMPLATE.md`). Interview a mix of:

- Customers who activated fast and use it daily (what worked)
- Customers stuck in onboarding (where they got lost)
- Customers who cancelled or didn't renew (why)

Don't only interview people who complain. Silent churn is more dangerous than loud complaints — at least the complainers tell you what's wrong.

## 5. Feedback engine — collect everything, triage weekly

Four feedback channels feed into `getFeedbackEngineSummary()`:

- **Bug reports** — triage severity within 24 hours; assign critical bugs same day
- **Feature requests** — set priority, don't just let upvotes decide; some high-upvote requests are nice-to-haves, some low-upvote requests block activation
- **Confusion points** — these are UX bugs, not feature requests. Treat them with the same urgency as crashes
- **Product / manufacturing / delivery ratings** — these are separate signals. A customer can love the product and hate the delivery experience. Don't average them into one number and lose the signal

## 6. Reviews and referrals — only ask after activation

Request a review (`requestReview()`) only after `account_activated = true`. Asking before activation gets you noise, not signal. The referral program (`getReferralCode()`, `buildReferralLink()`) should be offered at the same point — a customer who hasn't activated has nothing real to refer.

## 7. Churn signals to watch weekly

`getChurnAnalysis()` tracks four numbers. None of them are vanity metrics:

- **Inactive customers (30d)** — no activity at all, the earliest churn warning
- **Expired subscriptions** — already lost, find out why before writing them off
- **Failed renewals** — a renewal that was attempted and didn't convert; different problem than expiry, usually pricing or trust
- **Low engagement (`customer_health` tier = churning)** — still subscribed, already disengaged; this is your save-able population

## 8. Customer health score must actually run

`recalculateHealthScore()` and `bulkRecalculateHealthScores()` exist because the live health calculation in `customerSuccess.js` was never being written to the `customer_health` table — the ops dashboard was reading an empty table. Schedule `bulkRecalculateHealthScores()` to run daily (cron / Edge Function). Without this, every health-based dashboard number is zero and the dashboard is lying to you.

## 9. Support quality, not just support volume

`getSupportHealthMetrics()` tracks average resolution time, escalations, and repeat-issue customers. A repeat-issue customer (more than one ticket in 90 days) is telling you the first fix didn't work. Don't close tickets — close problems.

## 10. What "done" looks like for this phase

- 100 paying customers, segmented
- Activation rate above 80% within 5 days of order
- At least 15 structured interviews logged
- Feedback engine has triaged, prioritized backlogs for bugs and features — not just open lists
- Referral program has at least one real conversion
- Churn dashboard checked weekly, not just built and ignored
