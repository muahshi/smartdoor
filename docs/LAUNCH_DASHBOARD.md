# Smart Door — Launch Dashboard
## Phase 10: Production Launch

Documents what launch metrics are available in the existing **Admin →
Analytics Center** (`admin.html`, wired to `services/analytics.js`,
already built in an earlier phase) and what is genuinely missing.

Per Phase 10 scope ("do not redesign UI, do not change business logic"),
this document does **not** add new dashboard UI or new metric-computation
functions — it maps requested metrics to what already exists and flags
real gaps honestly for a future phase.

---

## 1. WHAT ALREADY EXISTS

`admin.html` → Analytics Center tab, wired to these `services/analytics.js`
functions:

| Metric | Source Function | Status |
|---|---|---|
| Revenue (today / month / year) | `getFinancialMetrics()` | ✅ Live |
| MRR | `getFinancialMetrics()` | ✅ Live (computed as current-month revenue) |
| ARR | `getFinancialMetrics()` | ✅ Live (computed as MRR × 12) |
| Refunds total | `getFinancialMetrics()` | ✅ Live |
| Revenue by product type | `getFinancialMetrics()` | ✅ Live |
| Revenue trend (6 months) | `getOrderAnalytics()` | ✅ Live, charted |
| Orders | `getOrderAnalytics()` | ✅ Live |
| Subscriptions: active / expired / cancelled / expiring soon | `getSubscriptionAnalytics()` | ✅ Live |
| Subscription plan breakdown | `getSubscriptionAnalytics()` | ✅ Live |
| System health (DB, storage, etc.) | `getSystemHealth()` | ✅ Live |
| Audit logs | `getAuditLogs()` | ✅ Live |

**MRR/ARR accuracy note**: MRR is currently computed as "revenue captured
this calendar month," which conflates one-time hardware purchases with
recurring subscription revenue. For a more precise SaaS MRR (recurring
subscription value only, normalized to a monthly run-rate regardless of
calendar-month timing), `getFinancialMetrics()` would need to be extended
to compute MRR from active `subscriptions.plan` pricing rather than
captured `orders.total_amount` — flagged here as a data-accuracy
improvement, not implemented in Phase 10 since it changes calculation
logic (out of scope: "do not change business logic").

---

## 2. GENUINELY MISSING (not implemented anywhere yet)

These were requested in the Phase 10 prompt but have no existing
implementation to wire up — building them requires new schema/queries
and is a feature addition, not a deployment task:

### Activation Rate
Needs a definition first (e.g. "% of paid orders that complete first
QR scan within 7 days") and a query against `orders` joined with
`visitor_logs` or `plates` first-scan timestamp. Not implemented.

### Customer Retention
Needs a cohort-based query (subscribers grouped by signup month, tracked
for renewal vs. churn over time) against the `subscriptions` table.
Currently only point-in-time active/expired/cancelled counts exist —
not a retention curve. Not implemented.

### Support Load
Needs the ticket system referenced in `docs/BETA_LAUNCH_CHECKLIST.md`
("Ticket System" checklist) to actually have a `support_tickets` table
with volume/category/resolution-time queries. Confirm with the team
whether the ticket system itself exists in the schema — if it does,
`services/analytics.js` would need a new `getSupportMetrics()` function
following the same pattern as the existing functions. Not implemented
in Phase 10.

### Renewals (as a standalone trend, not just current counts)
`getSubscriptionAnalytics()` gives current active/expired/cancelled
counts but not a renewals-over-time trend (e.g. "renewals this month vs
last month," renewal success rate). Could be derived from existing data
with a new query function. Not implemented.

---

## 3. RECOMMENDATION

These four gaps (Activation Rate, Customer Retention, Support Load,
Renewals trend) are reasonable Phase 11 candidates — each is a focused,
additive function in `services/analytics.js` plus corresponding cards in
the existing Analytics Center UI (no redesign needed, just new cards in
the existing grid pattern already used for Revenue/MRR/ARR).

For launch day itself, the existing Revenue/MRR/ARR/Orders/Subscriptions
dashboard in `admin.html` is sufficient to monitor the metrics that
matter most in the first 24–48 hours (see `GO_LIVE_GUIDE.md` → Step 9).

---

## 4. RELATED DOCUMENTS

- `services/analytics.js` — existing metric implementations
- `admin.html` — Analytics Center UI (search for `case 'analytics'` and `case 'financial'`)
- `OPERATIONS_RUNBOOK.md` — weekly/monthly review cadence for these metrics
