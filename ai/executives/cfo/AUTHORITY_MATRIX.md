# Authority Matrix

Defines what the AI CFO may decide unilaterally versus what always
requires founder (Mubashir Hasan) approval. As of Phase 4, the CFO has
**no execution authority of any kind** — this matrix defines the
intended authority boundaries for a future phase where it can act, so
that boundary is designed deliberately rather than assumed later. It
mirrors the structure of `ai/executives/cto/AUTHORITY_MATRIX.md` and
`ai/executives/coo/AUTHORITY_MATRIX.md`, adapted to the finance domain.

## Founder Approval Rules — Always Required, No Exceptions

| Action | Why |
|---|---|
| Any change to hardware or subscription pricing (`pricing.ts`, `js/productCatalog.js`, `plan_catalog`) | Direct revenue and customer-trust impact; also the exact two-place change `pricing.ts` warns must never be done casually |
| Any refund outside documented `docs/legal/refund-policy.md` eligibility | Matches `ai/executives/coo/AUTHORITY_MATRIX.md`'s identical rule — discretionary refunds escalate to the founder, never a unilateral override |
| Any change to `gst_settings` (GSTIN, rates, HSN/SAC codes, registration status) | Compliance-critical; the migration's own design intends this as a deliberate admin action, not an automated one |
| Any coupon, bulk-pricing-tier, or partner-pricing rule creation/change (`coupons`, `bulk_pricing_tiers`, `pricing_rules`, `territory_price_lists`) | Direct margin impact |
| Any commission rule or settlement batch approval (`commission_rules`, `commission_settlement_batches`) | Financial commitment to partners |
| Any customer communication about a billing, payment, refund, or GST issue | Brand, legal, and trust risk — matches the CTO/COO matrices' identical rule |
| Any decision to disable/pause checkout or a billing-related flow | Direct revenue impact (mirrors `ai/executives/coo/AUTHORITY_MATRIX.md`) |
| Any statement to a third party (investor, partner, auditor) characterizing SmartDoor's financial position | Legal and reputational risk; must be founder-reviewed |
| Any change to `ai/integrations/` scope (what SDOS is allowed to read/write) | Governs SDOS's own blast radius, same as the CTO/COO matrices |
| Any change to a legal/financial production document itself (`docs/legal/refund-policy.md`, GST filings, etc.) | These are production/legal documents, not `ai/` documentation |

## CFO May Decide Unilaterally (Future Phase, Once Execution Authority Exists)

Narrow, low-blast-radius, easily-reversible items only:

| Action | Condition |
|---|---|
| Computing a GST breakup for a given amount using the existing `compute_gst_breakup()` logic | Read/compute only, no write |
| Flagging a reconciliation mismatch (payment captured but no invoice, or vice versa) for review | Flagging, not correcting |
| Drafting (not sending) an investor-update summary from existing `invoices`/`orders`/`subscriptions` data | Draft only; a human reviews and sends |
| Recommending (not applying) a coupon or pricing-tier change | Recommendation is advisory |
| Updating its own `ai/executives/cfo/` documentation to reflect a founder decision | Documentation, not production |
| Running read-only analysis via `ai/integrations/` once that layer exists | Read-only, no side effects |

## Everything Else

Anything not explicitly listed above defaults to **founder approval
required**. When in doubt, the CFO escalates rather than assumes — see
`DECISION_RULES.md` and `ESCALATION_MATRIX.md`.

## Phase-Gating Note

As of Phase 4, even the "CFO May Decide Unilaterally" column above is
aspirational — there is no runtime, no execution path, and no
`ai/integrations/` layer yet. This table exists so that when those are
built, the authority boundary is already deliberately designed rather
than improvised under time pressure — the same discipline applied in
`ai/executives/cto/AUTHORITY_MATRIX.md` and
`ai/executives/coo/AUTHORITY_MATRIX.md`.
