# Escalation Matrix

Section shape and shared P0–P3 scale: see `ai/core/standards/ESCALATION_STANDARD.md`.
Defines how the AI CFO classifies and routes financial issues, adapting
the severity structure already established in
`ai/executives/coo/ESCALATION_MATRIX.md` (itself drawn from
`SUPPORT_RUNBOOK.md`) to the finance domain. It does not introduce a new
support-ticket path — it defines routing specifically for
financial/billing/compliance issues.

## Severity → Routing

| Severity | Examples | Routes To | Timing |
|---|---|---|---|
| P0 — Critical | Payment/webhook reconciliation completely broken; `is_gst_registered` found `FALSE` while GST is actively being charged; a refund double-processed | Founder, immediately | Immediately, any hour |
| P1 — High | A specific order's price mismatched between `pricing.ts` and the frontend catalog; a commission calculation error affecting a partner payout; a GST breakup that doesn't reconcile on a live invoice | Founder | Same business day |
| P2 — Medium | A coupon behaving unexpectedly (e.g. stacking with bulk pricing in an unintended way); a subscription stuck in an ambiguous lifecycle state | Founder, standard review | Within the week |
| P3 — Low | A documentation drift between `ai/knowledge/` and the live schema; a cosmetic invoice-PDF formatting issue | Backlog | Logged for review |

## Escalate Immediately (Same Hour)

- Any sign that GST is being charged while `is_gst_registered = FALSE`.
- Any payment captured by Razorpay with no corresponding `orders`/
  `subscriptions` state update (money taken, nothing recorded).
- Any duplicate refund or duplicate commission payout.
- Any indication that a price a customer was charged does not match
  `pricing.ts`/`plan_catalog` (over- or under-charging).

Action: surface to the founder directly with full evidence (table rows,
webhook event IDs, timestamps) — the CFO does not attempt to resolve a
P0 itself, matching the principle in
`ai/executives/coo/ESCALATION_MATRIX.md`.

## Escalate Within 24 Hours

- A GST breakup that fails to reconcile (`taxable_value` + tax ≠
  `invoice_total`) on more than one invoice, suggesting a systemic issue
  rather than a one-off.
- A pattern of refund requests outside policy eligibility, suggesting a
  product or fulfilment issue (coordinate with the COO, per
  `INTER_EXECUTIVE_COMMUNICATION.md`) rather than isolated customer
  requests.
- A partner commission dispute.

## What Is NOT an Escalation

- A single customer asking about their invoice or subscription renewal
  date — that's a normal support question, routed to the COO's support
  process (`ai/executives/coo/CUSTOMER_SUPPORT_GUIDE.md`), not a
  financial escalation.
- A hypothetical "what if we changed pricing" question — that's
  `PRICING_GUIDE.md` analysis, not an escalation.

## The CFO's Role at Each Level

- **Routine level**: the CFO may draft an analysis or flag for founder
  review.
- **Founder level**: the CFO surfaces the situation with full context
  and evidence (specific table rows, function output, file references)
  — it never resolves a financial P0/P1 itself, per
  `AUTHORITY_MATRIX.md`.

## Cross-Reference

See `INTER_EXECUTIVE_COMMUNICATION.md` for when a financial escalation
should also route to the CTO (infrastructure root cause, e.g. a webhook
handler bug) or the COO (fulfilment root cause, e.g. a refund pattern
tied to a manufacturing defect) in parallel.
