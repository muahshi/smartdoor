# Profitability Guide

An honest accounting of what the AI CFO can and cannot say about
SmartDoor's profitability, given what actually exists in the repository.
See `FINANCIAL_MODEL.md` and `UNIT_ECONOMICS.md` for the full data
inventory this is built on.

## What Can Be Assessed Today

- **Gross hardware revenue per unit sold** — known exactly, from
  `pricing.ts` / `orders`.
- **Subscription revenue per active plan** — known exactly, from
  `plan_catalog` / `subscriptions`.
- **GST liability per transaction** — known exactly, via
  `compute_gst_breakup()`.
- **Refund rate (count and value)** — computable from `refund_ledger`
  against total `orders`/`invoices` volume.
- **Commission payout as a percentage of partner-attributed revenue** —
  computable from `dealer_commissions` against attributed `orders`.

## What Cannot Be Assessed Today (and Why)

- **Gross margin on hardware** — requires manufacturing/material cost
  per unit, which is not tracked anywhere in the codebase or SQL
  (`services/manufacturing.js`, `manufacturing_qc`, and the inventory
  tables track quantity/QC status, not per-unit cost).
- **Contribution margin on subscriptions** — requires infrastructure
  cost allocation (Supabase, Razorpay fees, Exotel/Twilio/Groq usage
  costs) which is not tracked per-subscriber anywhere.
- **Overall net profitability** — requires the above plus operating
  expenses (which, per `FINANCIAL_MODEL.md`, have no ledger in this
  repository at all).

## The CFO's Standard Response When Asked "Are We Profitable?"

State plainly: SmartDoor's repository does not contain the cost data
needed to answer that question. What can be shown instead is gross
revenue by stream (`REVENUE_GUIDE.md`), GST-inclusive vs. taxable value
per transaction, and refund/commission rates as a percentage of revenue
— all real, all citable. Never substitute an assumed cost structure
(e.g. "nameplates probably cost X to make") to produce a margin figure
that looks complete but isn't grounded in anything in the repository.

## If the Founder Wants This Assessable

That requires new tracking that does not exist today — for example, a
`manufacturing_cost_per_unit` field tied to `inventory_batches`, or a
lightweight operating-expense ledger. Building any of that is out of
scope for Phase 4 (documentation only) and would itself be a schema
change requiring the AI CTO and founder approval, per
`ai/executives/cto/AUTHORITY_MATRIX.md`. List it on `ROADMAP.md` as a
**Future SDOS Capability**, not something the CFO can approximate around.

## Future SDOS Capability

- Per-unit COGS tracking tied to `inventory_batches`/`manufacturing_qc`.
- Infrastructure cost allocation per subscriber tier.
- A real gross-margin and contribution-margin report once the above
  exist.
