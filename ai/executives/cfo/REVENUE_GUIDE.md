# Revenue Guide

How the AI CFO reasons about each of SmartDoor's real revenue streams,
per `FINANCIAL_MODEL.md`. This is a playbook for interpreting existing
data, not a new revenue system.

## 1. Hardware Revenue

- One-time purchase per plate: Acrylic ₹1,499 / Teakwood ₹2,499 /
  Stainless ₹2,999 base, plus size/finish deltas
  (`products/products.md`). Free shipping.
- Recognized at `orders.payment_status = 'paid'`, confirmed via
  `verify-razorpay-payment` and reconciled by `razorpay-webhook`
  (`payment.captured`).
- Coupons/discounts (`coupons`, `order_discounts`,
  `bulk_pricing_tiers`) reduce the recognized amount per order — always
  read the discounted `orders.total_amount`, never the catalog list
  price, when reporting actual revenue.
- Partner/dealer sales are still hardware revenue at the point of sale;
  the commission owed to the partner is a separate outflow
  (`dealer_commissions`), not a revenue reduction.

## 2. Subscription Revenue

- Free ₹0, Premium ₹29/mo or ₹299/yr, Enterprise ₹999/mo or ₹9,999/yr
  (`plan_catalog`).
- Every hardware purchase bundles 1 year of Premium-equivalent access
  free — this is a real revenue-deferral consideration (a customer
  "pays" for a plate but the bundled subscription's ₹299 value is not a
  separate charge), though SmartDoor's schema does not currently
  implement formal deferred-revenue accounting for it (see
  `FINANCIAL_MODEL.md`). Report it as included, not as ₹0 recognized
  revenue with no cost.
- Legacy plan keys `hardware_only` / `smartdoor_care` persist as
  inactive aliases — do not exclude their historical subscribers from
  revenue history, but do not project future revenue from them either.

## 3. Partner / Commission Revenue

- Territory and partner-tier pricing (`territory_price_lists`,
  `partner_price_lists`) is separate from consumer pricing.
- Commission owed to partners is tracked as a ledger
  (`dealer_commissions`, extended by `commission_rules` for
  auto-calculation) and periodically settled
  (`commission_settlement_batches`).
- When reporting partner-channel revenue, report gross sale value and
  commission payable as two separate lines — never net them silently.

## 4. Replacement / Warranty-Adjacent Revenue

- `services/replacementTransfer.js` handles replacement and
  ownership-transfer flows, which may carry their own commercial terms
  per `ai/knowledge/business/business_rules.md`. Treat any revenue here
  as a distinct, smaller line item rather than folding it into standard
  hardware sales without noting the difference.

## Reporting Discipline

- Always distinguish **gross** (before discounts/commission) from
  **net** (after) revenue, and state which one is being reported.
- Always cite the actual table/query used (`orders`, `invoices`,
  `subscriptions`) rather than presenting a number without its source.
- Never present partner commission as a cost reduction to gross revenue
  in the same figure — keep them as separate, clearly labeled lines.

## Future SDOS Capability

- Automated revenue-by-stream dashboarding (hardware vs. subscription
  vs. partner) does not exist today and would require
  `ai/integrations/` plus a read-only reporting layer — not built as of
  this phase.
- Deferred-revenue accounting for the bundled free subscription year is
  not implemented in the schema; a future phase could add it if the
  founder wants formal accrual-basis reporting.
