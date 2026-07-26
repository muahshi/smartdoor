# Financial Model — As Implemented

This document maps every financial concept the AI CFO reasons about to
the actual table, service, or Edge Function that implements it today.
**No financial system, table, or number in this document is invented —**
everything below is traceable to the repository. Where SmartDoor has no
implementation for a common finance concept, that is stated explicitly
rather than filled in.

## Revenue Sources (Real)

| Source | Mechanism | Source of truth |
|---|---|---|
| Hardware sales | One-time purchase, Razorpay checkout | `orders`, `payments`, `supabase/functions/_shared/pricing.ts` |
| Subscription revenue | Recurring Free/Premium/Enterprise billing | `subscriptions`, `plan_catalog` (`sql/46_saas_billing_schema.sql`) |
| Partner/dealer commission | Commission-based revenue share on partner-attributed sales | `dealer_commissions`, `commission_rules`, `commission_settlement_batches` (`sql/34`, `sql/60`) |
| Coupons / discounts | Reduces recognized revenue per order | `coupons`, `order_discounts`, `bulk_pricing_tiers` (`sql/57_commerce_engine_phase8a.sql`) |

## Pricing (Real, Server-Authoritative)

- Hardware: Acrylic ₹1,499, Teakwood ₹2,499, Stainless ₹2,999 (base
  prices; size/finish deltas per `products/products.md`), fixed in
  `supabase/functions/_shared/pricing.ts` and mirrored in
  `js/productCatalog.js`/`index.html` — a deliberate two-place,
  no-more-no-less pricing rule.
- Shipping: free on all hardware orders (`SHIPPING_PRICE_PAISE = 0`).
- Subscriptions: Free ₹0, Premium ₹29/mo or ₹299/yr, Enterprise ₹999/mo
  or ₹9,999/yr (`plan_catalog`). Legacy plan keys `hardware_only` and
  `smartdoor_care` remain as inactive aliases for existing subscribers.
- Every hardware purchase bundles 1 year of Premium-equivalent privacy
  subscription free (₹299 value, per `llms.txt`) — a separate flow from
  hardware pricing, not unified with it by design.

## Billing & GST (Real)

- `gst_settings` (singleton row, `sql/58_gst_billing_phase8b.sql`) is
  the single configurable source of truth: seller GSTIN/PAN/address,
  `hardware_hsn_code` (default `8310`), `hardware_gst_rate` (default
  18.00%), `saas_sac_code` (default `998319`), `saas_gst_rate` (default
  18.00%), invoice/credit-note/debit-note prefixes, and
  `is_gst_registered` (defaults `FALSE` until a real GSTIN is set).
- `compute_gst_breakup()` (Postgres function) computes taxable value,
  CGST+SGST (intrastate) or IGST (interstate) from a GST-inclusive
  amount and the applicable rate — reused for both hardware orders and
  SaaS invoices.
- `invoices` table carries the full GST-invoice shape: `hsn_sac`,
  `cgst_rate`/`cgst_amount`, `sgst_rate`/`sgst_amount`,
  `igst_rate`/`igst_amount`, `taxable_value`, `round_off`,
  `invoice_total`, `place_of_supply_state/code`, `is_interstate`,
  `invoice_type` (tax invoice / credit note / debit note),
  `reference_invoice_id`, `approval_status`.
- `services/invoices.js` reads owner-scoped invoices (RLS-protected);
  `services/gstInvoicePdf.js` renders a printable GST invoice/credit/
  debit note client-side as a PDF, using the same `invoices` row +
  `gst_settings`.
- `gst_state_codes` maps Indian states to their GST state codes, used to
  determine `is_interstate` for CGST+SGST vs. IGST routing.

## Cash Flow & Reconciliation (Real)

- Payment capture: `create-razorpay-order` → Razorpay checkout →
  `verify-razorpay-payment` (server-side verification, never trust
  client-reported status).
- Reconciliation: `razorpay-webhook` / `services/webhooks.js` is the
  authoritative source for payment state — handles
  `payment.captured`, `subscription.charged`, `refund.created`,
  `payment.failed`, `subscription.cancelled`, logged to
  `webhook_events` for replay/audit and required to be idempotent
  (checked via `razorpay_event_id`) and respond within 5 seconds.
- Refunds: `razorpay-refund` Edge Function, tracked in an auditable
  `refund_ledger` table (not just a status flag).
- Partner settlement: `commission_settlement_batches` groups
  `dealer_commissions` entries (`pending` → `approved` → `paid`, with
  `cancelled`/`reversed` for refund-driven reversals) for periodic
  payout.

## Subscription Lifecycle (Real)

- Renewal reminders: `services/renewalEngine.js` runs a daily check
  across five windows — 90d (early-bird, email), 30d (email+WhatsApp),
  7d (email/SMS/WhatsApp/push, urgent), 1d (all channels, final
  warning), 0d (expired notification + grace period start).
- Grace period: `services/gracePeriod.js` — 15 days
  (`GRACE_PERIOD_DAYS`), read-only computed lifecycle status
  (`no_subscription` / `active` / `grace_period` / `expired_locked`)
  consumed by the visitor route and owner dashboard.
- `subscriptions.grace_until` can keep feature access alive past expiry
  before auto-downgrading to Free; `cancel_at_period_end` keeps access
  until `expiry_date` then downgrades instead of renewing.

## What Does NOT Exist in the Repository (Explicitly Not Invented Here)

- **No cost-of-goods-sold (COGS) or manufacturing-cost-per-unit ledger.**
  Hardware list prices are known; the cost to produce each nameplate is
  not tracked anywhere in the codebase or SQL.
- **No customer acquisition cost (CAC) tracking or marketing-spend
  ledger.**
- **No general ledger, chart of accounts, or double-entry accounting
  system.** `invoices`, `orders`, `payments`, and `refund_ledger` are
  transactional records, not an accounting system.
- **No cap table, equity register, or investor records** of any kind.
- **No formal budget** — spend appears to be founder-managed directly,
  with no `budgets` table or equivalent in the schema.
- **No revenue recognition logic** beyond the transactional tables
  above (e.g. no deferred-revenue schedule for the bundled 1-year
  subscription).

Any document in this folder that references one of the above frames it
explicitly as a **"Future SDOS Capability"** — never as something that
currently operates.

## Notes for the CFO

- Treat this document as a map, not the map's territory — always defer
  to the actual `sql/` migrations and live Supabase schema for anything
  a decision depends on, per the same discipline
  `ai/knowledge/database/database.md` applies.
- No schema change, pricing change, or GST setting was modified while
  compiling this document.
