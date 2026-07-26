# CFO Financial-Operations Roadmap

This is the CFO's own **financial-operations** roadmap — billing, GST,
pricing, cash reconciliation, and reporting process health. It is
distinct from SmartDoor's product roadmap
(`ai/knowledge/company/company_profile.md`), the AI CTO's technical
roadmap (`ai/executives/cto/ROADMAP.md`), the AI COO's operations
roadmap (`ai/executives/coo/ROADMAP.md`), and SDOS's own phase roadmap
(`ai/docs/SDOS_ARCHITECTURE.md`).

This is a **candidate list**, not a committed plan — every item requires
founder prioritization before any work begins, and nothing here implies
approval to execute.

## Known Financial Gaps (from documented history)

1. **No cost-of-goods-sold (COGS) or manufacturing-cost-per-unit
   tracking** exists — blocks any real gross-margin calculation (see
   `PROFITABILITY_GUIDE.md`, `UNIT_ECONOMICS.md`).
2. **No customer acquisition cost (CAC) or marketing-spend ledger**
   exists — blocks any real LTV/payback calculation.
3. **No general ledger, chart of accounts, or formal budget** exists —
   the founder currently manages spend directly with no ledger (see
   `BUDGETING_GUIDE.md`).
4. **`gst_settings.is_gst_registered` defaults to `FALSE`** — an
   operational risk to confirm is set correctly before/if GST-bearing
   transactions are live at scale (`GST_COMPLIANCE_GUIDE.md`).
5. **No cap table or investor-record system** exists — relevant only if
   a fundraising process starts (`FUNDRAISING_GUIDE.md`).
6. **No automated reconciliation report** exists — reconciliation today
   depends on the CFO's manual daily/weekly routines rather than a
   system signal (`CASHFLOW_GUIDE.md`).

## Financial Readiness Candidates

- A read-only `ai/integrations/` view over `invoices`, `subscriptions`,
  `orders`, `refund_ledger`, and `dealer_commissions` — the prerequisite
  for most of the "Future SDOS Capability" items named throughout this
  folder's guides.
- A lightweight COGS field tied to `inventory_batches` to unlock real
  gross-margin reporting.
- A lightweight operating-expense ledger to unlock real budgeting.
- An automated daily payment/webhook/refund reconciliation check.
- A GST return-ready (GSTR-1/3B format) export from `invoices`.

## Explicitly Not on This Roadmap

- Any pricing change itself (that's a founder decision, executed by the
  CTO — `PRICING_GUIDE.md`).
- Any operational process change (COO/founder territory —
  `ai/executives/coo/ROADMAP.md`).
- Any new customer-facing feature (a product/CEO-flavored roadmap item).
- Any actual fundraising activity (the founder's call, per
  `FUNDRAISING_GUIDE.md`).

## How This Roadmap Gets Used

The founder reviews and re-prioritizes this list as needed; the CFO
updates it as new financial risk or data gap is discovered during
routine review, reconciliation checks, or a specific founder question
that the current data can't fully answer.
