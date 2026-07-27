# Authority Matrix

Structure and universal rules: see `ai/core/standards/AUTHORITY_STANDARD.md`.
Defines what the AI CFO may decide unilaterally versus what always
requires founder (Mubashir Hasan) approval. As of Phase 4, the CFO has
**no execution authority of any kind** — this matrix defines the
intended authority boundaries for a future phase where it can act, so
that boundary is designed deliberately rather than assumed later. It
follows the standard's structure, adapted to the finance domain.

## Founder Approval Rules — Always Required, No Exceptions

The CFO inherits the universal approval-required set from
`ai/core/standards/AUTHORITY_STANDARD.md` in full. The table below adds
the finance-domain rules beyond that universal set:

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

## Everything Else / Phase-Gating Note

See `ai/core/standards/AUTHORITY_STANDARD.md` — anything not listed above
defaults to founder-approval-required (escalate per `DECISION_RULES.md`
and `ESCALATION_MATRIX.md`), and the "may decide unilaterally" column
remains aspirational until `ai/core/` and `ai/integrations/` exist.
