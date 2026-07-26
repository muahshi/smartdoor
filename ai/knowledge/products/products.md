# Products — My Smart Door

> Compiled from `js/productCatalog.js` (frontend single source of truth
> for catalog data), `supabase/functions/_shared/pricing.ts` (server-side
> single source of truth for prices), `design-system/`, and
> `sql/46_saas_billing_schema.sql` (subscription tiers).

## Hardware Products (Smart Nameplates)

All hardware products share one booking/checkout flow and are defined in
a single array (`SD_PRODUCTS`) in `js/productCatalog.js`, with prices
mirrored server-side in `PRODUCT_PRICES_PAISE`
(`supabase/functions/_shared/pricing.ts`). Both files must agree — the
pricing.ts header explicitly documents this as the one deliberate
two-place exception.

| Product key (UI) | Server type key | Name | Base Price (INR) | Category |
|---|---|---|---|---|
| `acrylic` | `acrylic` | Minimalist Acrylic | ₹1,499 | nameplate |
| `wood` | `teakwood` | Royal Teakwood | ₹2,499 | nameplate |
| `steel` | `stainless` | Stainless Matte | ₹2,999 | nameplate |

Shipping is free on all hardware orders (`SHIPPING_PRICE_PAISE = 0`).

### Variants (per product, via the Configurator schema)

Each product declares its own `configurator` block (`js/productCatalog.js`)
describing available axes. Observed axes across all three products:

- **Size**: Standard (8×12 in, no extra cost) or Large (10×16 in,
  +₹400 acrylic / +₹500 teakwood / +₹500 steel)
- **Finish**: product-specific (e.g. High Gloss / Matte for acrylic,
  Polished / Natural Grain for teakwood, Matte / Brushed for steel —
  brushed steel carries a +₹200 delta)
- **Font**: Modern Sans, Classic Serif, Bold Block, Elegant Script
- **Religious/cultural symbol** (optional): None, Om, Ganesha, Cross,
  Crescent & Star, Khanda, Lotus
- **QR style**: Classic Black QR (available), Premium Gold Shield QR
  (coming soon)

Engraving color is intentionally **not** a customer-selectable axis —
it's fixed per product template (`js/plateTemplates.js`), by design.

### What's bundled with every hardware purchase

Every plate purchase includes **1 year of Premium-equivalent privacy
subscription free** (per `llms.txt`: "includes 1-year privacy
subscription (₹299 value) free"). This is a separate flow from the
recurring subscription system — see `services/subscriptions.js` and the
`activate-subscription` Edge Function — and is not unified with the
hardware pricing file by design (per that file's own comments).

## Subscription Plans (SaaS layer)

Defined in `plan_catalog` (`sql/46_saas_billing_schema.sql`), three
commercial tiers:

| Plan key | Name | Monthly | Yearly | Support tier |
|---|---|---|---|---|
| `free` | Free | ₹0 | ₹0 | standard |
| `premium` | Premium | ₹29 | ₹299 | priority |
| `enterprise` | Enterprise | ₹999 | ₹9,999 | dedicated |

Two legacy plan keys (`hardware_only`, `smartdoor_care`) exist in the
same table as inactive/legacy aliases of free/premium, preserved for
historical subscriptions rather than removed.

Plan differences described in the schema's marketing copy: Premium adds
"AI receptionist + full visibility"; Enterprise adds "unlimited scale,
dedicated support."

## Dependencies Between Product and Feature Layers

- Hardware purchase → `orders` → `create-razorpay-order` /
  `verify-razorpay-payment` Edge Functions → `plates` row created →
  `generate-qr` → shipping/delivery → `onboarding.html` activation.
- Subscription tier gates feature access via
  `services/usageLimits.js` / `services/featureFlags.js` (e.g. AI
  receptionist availability, priority support tier).
- Society/enterprise customers use a parallel structure (`organizations`,
  `properties`, `towers`, `floors`, `units`, `residents`) layered on top
  of the same plate/subscription primitives rather than a separate
  product line.

## Future Product Lines (documented intent, not implemented)

`js/productCatalog.js` explicitly reserves non-`nameplate` categories
for a future "Phase 7 ecosystem" — doorbells, cameras, locks, sensors —
designed so a new entry can be pushed into `SD_PRODUCTS` without
touching other files, as long as it reuses the nameplate booking/checkout
flow. No such products exist in the repository today.

## Notes for AI Executives

- Never treat `js/productCatalog.js` and `pricing.ts` as independently
  authoritative — they must match; a mismatch is a bug, not a feature.
- Plan/pricing changes are a two-file (frontend + Edge Function) or
  schema-migration change in the real codebase — this knowledge doc
  does not change either.
