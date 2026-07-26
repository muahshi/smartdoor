# Unit Economics

What can honestly be computed about SmartDoor's unit economics from the
repository today, and what cannot. This document exists specifically to
prevent the AI CFO from ever presenting an invented CAC, LTV, or margin
figure — per `DECISION_RULES.md` Rule 5.

## Can Compute Today

| Metric | Basis |
|---|---|
| Average order value (hardware) | `orders.total_amount`, real data |
| Revenue per active subscriber, by plan | `subscriptions` × `plan_catalog` price |
| GST-exclusive (taxable) value per transaction | `compute_gst_breakup()` output |
| Refund rate (% of orders/invoices refunded) | `refund_ledger` vs. `orders`/`invoices` volume |
| Commission cost as % of partner-attributed revenue | `dealer_commissions` vs. attributed `orders` |
| Revenue-only "lifetime value" (sum of hardware + subscription revenue per customer, no cost netted out) | `orders` + `subscriptions` joined on `owner_id` — must always be labeled "revenue, not profit" |

## Cannot Compute Today (No Data in Repository)

| Metric | Why not |
|---|---|
| **CAC (Customer Acquisition Cost)** | No marketing/ad-spend ledger exists anywhere in the codebase or schema |
| **True LTV (profit-based)** | Requires COGS and operating-cost allocation, neither of which is tracked |
| **Gross margin per unit** | Requires manufacturing/material cost per unit — not tracked (see `PROFITABILITY_GUIDE.md`) |
| **Payback period** | Requires CAC, which doesn't exist |
| **Contribution margin per subscriber** | Requires per-subscriber infra cost allocation (Supabase, Groq, Exotel/Twilio) — not tracked |

## The CFO's Standard Response When Asked for a Cost-Based Metric

State clearly which inputs are missing and where they'd need to come
from (a new cost ledger, a marketing-spend record, provider billing
integration) rather than substituting an assumption. A revenue-only
version of the metric can be offered instead, explicitly labeled as
such — e.g. "revenue-only LTV: ₹X — this does not net out any cost, so
it is not a substitute for true LTV."

## If the Founder Wants Real Unit Economics

That requires new tracking SmartDoor doesn't have today:
1. A `manufacturing_cost_per_unit` or similar field (COGS).
2. A lightweight marketing/acquisition-spend record (CAC).
3. Provider billing data connected via `ai/integrations/` (variable
   infra cost per subscriber).

Building any of this is a schema/tooling change out of scope for Phase 4
(documentation only) and would require CTO involvement and founder
approval. List as **Future SDOS Capability** on `ROADMAP.md`.

## Future SDOS Capability

- COGS tracking, CAC tracking, true LTV, gross/contribution margin — all
  of the above, once the missing inputs exist.
