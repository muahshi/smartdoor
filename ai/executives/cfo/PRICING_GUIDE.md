# Pricing Guide

How the AI CFO reasons about SmartDoor's real pricing mechanisms.
Grounded in `supabase/functions/_shared/pricing.ts`,
`js/productCatalog.js`, `plan_catalog`, and
`sql/57_commerce_engine_phase8a.sql`.

## The Two-Place Rule (Hardware Pricing)

`pricing.ts`'s own header comment is explicit: a hardware price change
must happen in exactly two places — the `data-price` attribute in
`index.html` and `PRODUCT_PRICES_PAISE` in `pricing.ts` — and nowhere
else. The CFO treats this as a hard constraint: any pricing
recommendation that would leave these two out of sync is flagged as
incomplete, never presented as done. This is also why `pricing.ts` is
the single source of truth for what Razorpay actually charges — the
frontend catalog is a display copy, not the authority.

## Current Real Prices

| Item | Price |
|---|---|
| Acrylic nameplate (base) | ₹1,499 |
| Teakwood nameplate (base) | ₹2,499 |
| Stainless nameplate (base) | ₹2,999 |
| Large size upgrade | +₹400 (acrylic) / +₹500 (teakwood, steel) |
| Brushed steel finish | +₹200 |
| Shipping | Free |
| Premium subscription | ₹29/mo or ₹299/yr |
| Enterprise subscription | ₹999/mo or ₹9,999/yr |

Prices above are GST-inclusive listed prices per
`gst_settings`/`compute_gst_breakup()` convention — the taxable value is
derived downward from these, not added on top at checkout.

## Discount Mechanisms (Real — Phase 8A Commerce Engine)

- **Coupons** (`coupons` table) — validated server-side via the
  `validate-coupon` Edge Function; `services/commerce.js`'s
  `validateCoupon()` is the public checkout-facing dry-run check (does
  not reserve the coupon).
- **Bulk pricing tiers** (`bulk_pricing_tiers`) — quantity-based
  discount tiers.
- **Order-level discounts** (`order_discounts`) — applied and recorded
  per order.
- **Partner/territory pricing** (`territory_price_lists`,
  `partner_price_lists`) — separately tiered from consumer pricing,
  per `sql/59_partner_pricing_engine_phase8c2.sql`.

## Pricing Change History

`pricing_change_history` and `pricing_rules` tables exist in the schema
— the CFO should read from these when asked "when did we last change
pricing and why," rather than relying on memory or assumption.

## The CFO's Role in Any Pricing Conversation

- Compute the effect of a proposed price change (revenue impact given
  current volume, GST impact, coupon-stacking interaction) — as
  analysis, never as an applied change.
- Flag if a proposed change would violate the two-place rule or bypass
  `pricing.ts` as the source of truth.
- Never recommend a price change without noting it requires founder
  approval per `AUTHORITY_MATRIX.md`, and coordination with the CTO for
  the actual code/config change, per
  `INTER_EXECUTIVE_COMMUNICATION.md`.

## Future SDOS Capability

- Automated price-change impact modeling against real order-volume
  history — not built today; would require `ai/integrations/` read
  access to `orders`.
