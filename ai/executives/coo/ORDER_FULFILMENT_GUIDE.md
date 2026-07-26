# Order Fulfilment Guide

Grounded in `ai/knowledge/workflows/workflows.md` §3 (Checkout / Purchase
Workflow) and §6 (Subscription Workflow), and
`ai/knowledge/business/business_rules.md` (Orders, Pricing sections).

## The Fulfilment Chain, as It Actually Works

```
products.html / product.html (js/productCatalog.js, js/productConfigurator.js)
  → Add to cart / configure variant
  → create-razorpay-order Edge Function
    (server-authoritative pricing via supabase/functions/_shared/pricing.ts)
  → Razorpay checkout (customer pays)
  → verify-razorpay-payment Edge Function confirms payment
  → orders row created (services/orders.js)
  → plates row + QR generated (services/plates.js, generate-qr function)
  → 1-year privacy subscription auto-granted (services/subscriptions.js)
  → Shipping/dispatch begins (services/shipping.js)
  → razorpay-webhook reconciles payment state asynchronously
```

## What the COO Watches For

- **Paid but not fulfilled.** Per `SUPPORT_RUNBOOK.md` §3.1: if
  `payment_status` is `paid` but no plate is assigned, this is a
  fulfilment bug, not a payment bug — escalate to the CTO/Ops per
  `INTER_EXECUTIVE_COMMUNICATION.md`, don't treat it as a support-only
  issue.
- **Webhook vs. client-status mismatch.** `razorpay-webhook` is the
  authoritative reconciliation source (`business/business_rules.md`,
  Orders). If the client-reported status and webhook-reconciled status
  disagree, trust the webhook and flag the discrepancy rather than
  guessing which is right.
- **Refunds and duplicate charges.** Route through `docs/legal/refund-policy.md`
  for eligibility. A duplicate charge is always refund-eligible
  immediately, regardless of standard policy, per `SUPPORT_RUNBOOK.md`
  §3.1 — it's a billing error, not a change-of-mind refund.
- **The two-place pricing rule.** Hardware prices are fixed server-side
  in exactly one file (`supabase/functions/_shared/pricing.ts`) and must
  match `index.html`'s `data-price` attributes. The COO never proposes a
  pricing change itself (CFO/founder territory) but should recognize a
  price mismatch as a real bug if observed, not an operational quirk.

## Known Gap (documented, not invented)

- **House-number/customization persistence gap.** Per
  `ai/executives/cto/ROADMAP.md`, full nameplate customization typed
  into the configurator doesn't reliably persist to
  orders/manufacturing on the Razorpay checkout path
  (`shipping_address` has no `houseNumber` key; `orders.notes` is
  `TEXT`, not `JSONB`). This is a confirmed pre-existing bug, not a COO
  process failure — if a customer reports their custom nameplate detail
  went missing, this is the first thing to check, and it should be
  routed to the CTO, not treated as a one-off support miss.

## Coupons, Discounts, and Bulk Pricing

- `coupons`, `order_discounts`, and `bulk_pricing_tiers` are validated
  server-side via `validate-coupon` — the COO can observe these as part
  of an order's fulfilment record but does not create, approve, or
  override them (CFO/founder territory).

## Future SDOS Capability

- An automated "stalled order" flag (e.g. paid > N hours with no
  manufacturing queue entry) does not exist today. The COO can be asked
  to reason about a specific order manually once `ai/integrations/`
  exists; a systemic automated flag is a future capability, not built in
  this phase.
