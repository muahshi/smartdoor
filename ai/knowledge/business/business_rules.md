# Business Rules — My Smart Door

> Extracted from the root `BUSINESS_RULES.md`, `README.md`, and,
> critically, the actual SQL migrations and service code — the root
> `BUSINESS_RULES.md` is thin (22 lines) and does not cover most of
> what's actually enforced in the codebase. Rules below are grouped by
> domain and cite their source.

## Identity & Plates

- Plate IDs follow the format `SD-XXXXXX` (e.g. `SD-ABX9K7`) —
  `BUSINESS_RULES.md`, `sql/01_schema.sql`.
- Only one active owner per plate — `BUSINESS_RULES.md`.
- A plate's `qr_slug` matches its `plate_id`, and the visitor-facing URL
  is `/p/SD-ABX9K7` — `sql/01_schema.sql`, `sql/03_realtime_seed.sql`.
- Plate status is one of: `inactive`, `active`, `suspended` —
  `BUSINESS_RULES.md`.

## Privacy (core product promise)

- A visitor can message, leave a voice note, or call the owner —
  `BUSINESS_RULES.md`.
- A visitor can **never** see the owner's real phone number; the
  owner's phone must always remain hidden — `BUSINESS_RULES.md`,
  reinforced throughout the calling/communication architecture
  (`services/exotel.js`, `services/webrtcCall.js` — masked-calling by
  design). This is the company's central value proposition per
  `llms.txt` ("100% phone number masking").

## Authentication / PIN

- Owner login uses a 4-digit PIN, stored as a bcrypt hash in
  `users.pin_hash` — `BUSINESS_RULES.md`, `sql/01_schema.sql`.
- Failed PIN attempts are tracked server-side (not client-side) via the
  `pin_lockouts` table, introduced specifically to hardern against
  brute-force PIN guessing — `sql/10_security_hardening.sql`.
- `pin_lockouts` has no public RLS access (`pin_lockouts_no_public`
  policy) — only server-side logic can read/write it.
- `verify-pin` is currently flagged as "under investigation" in
  `CURRENT_STATUS.md` — treat PIN-login reliability as an open
  operational risk, not settled.

## Pricing

- Hardware prices are fixed server-side in one file
  (`supabase/functions/_shared/pricing.ts`) and must exactly match the
  `data-price` attributes in `index.html` — changing a price is
  explicitly documented as a two-place, and only two-place, change
  (frontend + this file) — see `products/products.md`.
- Acrylic ₹1,499 · Teakwood ₹2,499 · Stainless ₹2,999 (base prices;
  size/finish variants add deltas — see `products/products.md`).
- Shipping is free on all hardware orders.
- Subscription pricing: Free ₹0, Premium ₹29/mo or ₹299/yr, Enterprise
  ₹999/mo or ₹9,999/yr — `sql/46_saas_billing_schema.sql`.
- Coupons, order-level discounts, and bulk pricing tiers exist as
  first-class entities (`coupons`, `order_discounts`,
  `bulk_pricing_tiers` tables) and are validated server-side via the
  `validate-coupon` Edge Function.
- Partner/dealer pricing is separately tiered by territory
  (`territory_price_lists`, `partner_price_lists`) rather than using
  consumer pricing — `sql/59_partner_pricing_engine_phase8c2.sql`.

## Orders

- Purchase flow: Customer → Razorpay → Plate Creation → QR Generation →
  Subscription → Activation — `README.md`.
- Payment verification happens server-side
  (`verify-razorpay-payment` Edge Function) — never trust a
  client-reported payment status alone.
- Razorpay webhooks are the authoritative reconciliation source for
  payment state (`services/webhooks.js`, `razorpay-webhook` function).
- Refunds go through `razorpay-refund` and are tracked in a dedicated
  `refund_ledger` table (auditable, not just a status flag).

## QR

- Every plate/QR pair is generated server-side
  (`generate-qr` Edge Function, `services/qr.js`) — not client-generated.
- QR/plate public lookup was specifically hardened in the most recent
  migration in the repository (`sql/70_plates_public_lookup_hardening.sql`),
  indicating this is an actively-scrutinized security surface.
- A "Premium Gold Shield QR" style is defined but marked
  `coming-soon` in the product catalog — not yet a real purchasable
  option.

## Calling

- Masked calling has two independent transport paths: WebRTC
  (`services/webrtcCall.js` / `webrtcOwnerCall.js` /
  `webrtcSignaling.js`) and PSTN telephony via Exotel (primary) with
  Twilio as secondary/fallback (`services/exotel.js`,
  `services/twilio.js`) — redundancy is a deliberate design choice, not
  an accident.
- Owner phone number is never exposed to the visitor on any transport
  path, per the core privacy rule above.
- Owner "presence" (available/unavailable) affects call routing —
  `services/presence.js`.

## Subscriptions

- Three commercial tiers: Free, Premium, Enterprise — see
  `products/products.md` for pricing.
- Every hardware purchase includes 1 year of privacy subscription free
  — `llms.txt`.
- If a subscription expires, a `grace_until` timestamp on the
  `subscriptions` row can keep feature access alive past expiry before
  auto-downgrading the owner to Free — `sql/46_saas_billing_schema.sql`.
- A subscription can be set to `cancel_at_period_end`, meaning it stays
  active until `expiry_date` and then auto-downgrades to Free instead of
  renewing — `sql/46_saas_billing_schema.sql`.
- Legacy plan keys (`hardware_only`, `smartdoor_care`) remain in the
  plan catalog as inactive aliases — existing legacy subscribers are
  preserved, not migrated destructively.

## Security

- Rate limiting is enforced at the Edge Function layer
  (`supabase/functions/_shared/edgeRateLimit.ts`,
  `services/rateLimiter.js`), with events logged to
  `rate_limit_events`.
- All admin actions are subject to role-based access control
  (`admin_roles`, `admin_permissions`) — `sql/34_enterprise_rbac_phase5.sql`.
- Admin sessions can be explicitly revoked
  (`admin_session_revocations` table).
- 39 tables have Row Level Security enabled; several migrations exist
  solely to *fix* previously-shipped RLS gaps — RLS correctness is a
  recurring, actively-monitored concern, not a one-time setup step.
- AI features (see below) are gated behind short-lived signed session
  tokens, not open access.

## Manufacturing

- Plates go through a Quality Control step
  (`services/qualityControl.js`, `manufacturing_qc` table) before
  shipping.
- Inventory is tracked at item/batch/movement granularity
  (`inventory_items`, `inventory_batches`, `inventory_movements`) —
  not just a single stock count.
- "Manufacturing print packs" and a dedicated manufacturing dashboard
  are explicitly listed as **not yet built**
  (`PROJECT_STATE.md`, `CURRENT_STATUS.md`).

## AI

- All AI features (receptionist, voice receptionist, owner assistant,
  sales consultant, insight cards) route through a single shared proxy,
  `groq-proxy` — there is no direct client-to-LLM call anywhere in the
  production code.
- AI calls require a short-lived, signed AI session token
  (`ai-session-token` function +
  `supabase/functions/_shared/aiSessionAuth.ts`), plus server-side
  origin allow-listing and request-shape validation (message count,
  role, length caps) — per the Phase 3.1A hardening work.
- AI receptionist behavior is owner-configurable via a rules engine
  (`services/aiReceptionistRules.js`, `ai_receptionist_rules` table) —
  it is not a fixed, one-size-fits-all script.

## Notes for AI Executives

- This document consolidates rules found across code and docs; it does
  not introduce any new rule and does not change enforcement anywhere.
- Where a rule is stated only in a comment or table constraint rather
  than a top-level doc, that is called out so a future executive knows
  to verify against the live schema/code before relying on it.
