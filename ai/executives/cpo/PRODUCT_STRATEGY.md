# Product Strategy Guide

No standard — role-specific domain playbook (`ai/core/standards/ROLE_TEMPLATE.md`).
Distinct from `PRODUCT_ROADMAP.md`: this file is the CPO's strategic
lens on *what SmartDoor's product is and why*; `PRODUCT_ROADMAP.md` is
the CPO's guide to the real, documented *what's next* surface.

## The Product Today (Two Connected Layers)

1. **Hardware**: three nameplate SKUs (`acrylic` ₹1,499, `wood`/teakwood
   ₹2,499, `steel`/stainless ₹2,999 — `js/productCatalog.js`, prices
   mirrored in `supabase/functions/_shared/pricing.ts`), each with a
   configurator (size, finish, font, optional religious/cultural symbol,
   QR style).
2. **SaaS**: three subscription tiers (`free`, `premium` ₹29/mo or
   ₹299/yr, `enterprise` ₹999/mo or ₹9,999/yr — `plan_catalog`,
   `sql/46_saas_billing_schema.sql`), where every hardware purchase
   bundles one year of Premium-equivalent access free.

These are not two separate product lines — every hardware purchase
creates the SaaS relationship (`products/products.md`'s "Dependencies
Between Product and Feature Layers"). The CPO's strategic reasoning
treats them as one connected product, not a hardware business with an
attached SaaS add-on.

## Strategic Pillars (grounded, not invented)

1. **The privacy promise is the product.** Per
   `ai/knowledge/business/business_rules.md` and `llms.txt`, "100% phone
   number masking" is the core differentiator. Any product-strategy
   direction (a new feature, a new hardware category) is evaluated first
   against whether it strengthens or dilutes that promise — the same
   discipline the CMO applies to marketing copy
   (`ai/executives/cmo/DECISION_RULES.md` Rule 10), applied here to
   feature-level product decisions.
2. **Grow within the documented extension seams before inventing new
   ones.** `design-system/future/README.md` already documents five
   concrete extension points (Master SVG/Figma export, PDF export, a
   manufacturing export format, a mobile port, and AR/camera preview),
   and `js/productCatalog.js` reserves categories for a future hardware
   line (doorbells, cameras, locks, sensors). These are real,
   already-designed seams — the CPO's strategy work extends them rather
   than proposing an unrelated product direction.
3. **The Property/Society layer is a distinct customer segment, not a
   feature.** `organizations`/`properties`/`towers`/`floors`/`units`/
   `residents` (`sql/14_property_management_schema.sql`) already serve
   multi-unit buildings as a parallel structure over the same
   plate/subscription primitives (`features/features.md` §8) — product
   strategy for this segment is evaluated on its own terms, not folded
   into single-home-owner reasoning.
4. **An undocumented Android app already exists.** `android/`
   (`applicationId "in.mysmartdoor.app"`, 114 Kotlin files) is real,
   built product surface with no equivalent entry in `ai/knowledge/`.
   Strategic reasoning about "the product" is incomplete until this is
   accounted for — flagged here and in `ROADMAP.md`, not resolved by
   this phase.

## What This Guide Does Not Do

- Does not set pricing or tier economics — that's `ai/executives/cfo/PRICING_GUIDE.md`.
- Does not decide manufacturing capacity or timelines — that's
  `ai/executives/coo/RESPONSIBILITIES.md` §2.
- Does not propose a product direction with no basis in the existing
  catalog, schema, or documented extension points — anything without
  that grounding is labeled **"Future SDOS Capability"**, per
  `DECISION_RULES.md` Rule 6.
