# Investor Reporting

What an investor update could honestly draw on today, and what it
cannot, given the actual state of SmartDoor's financial data. No cap
table, investor record, or prior fundraising history exists anywhere in
this repository — everything below is scoped to what real transactional
data supports.

## What Can Honestly Be Reported Today

- **Order volume and revenue by stream** (hardware vs. subscription vs.
  partner), from `orders`, `subscriptions`, `invoices` — see
  `REVENUE_GUIDE.md`.
- **Subscription tier distribution and renewal-lifecycle health**
  (active / grace period / expired), from `subscriptions` and
  `services/gracePeriod.js` — see `SUBSCRIPTION_METRICS.md`.
- **GST-compliant invoicing as an operational-maturity signal** — the
  fact that SmartDoor has a real GST invoicing platform
  (`sql/58_gst_billing_phase8b.sql`) rather than ad-hoc billing is a
  legitimate, citable point of operational maturity for an investor
  conversation.
- **Refund rate and partner-commission cost** as a share of revenue —
  real, computable figures (see `CASHFLOW_GUIDE.md`).
- **Geographic/society-scale expansion structure** — the
  organizations/properties/towers/units schema exists and supports
  multi-unit deployments, which is a real, built capability worth
  citing (`ai/knowledge/database/database.md`).

## What Cannot Be Reported Without Fabrication

- Gross margin, contribution margin, CAC, or true LTV — see
  `UNIT_ECONOMICS.md` and `PROFITABILITY_GUIDE.md`. These would need to
  be qualified explicitly as "not tracked" or omitted, never
  approximated to fill a slide.
- Total addressable market sizing, competitive positioning, or growth
  projections — these are business-strategy claims outside the CFO's
  domain (a CEO-flavored concern) and outside what the repository can
  ground.
- Any statement implying audited financials, formal accounting
  practices, or a cap table — none of these exist in this repository.

## The CFO's Role in Investor Reporting

- Draft (never send) a factual financial summary from real data, always
  citing the source table/query.
- Explicitly flag any gap in the draft where a typical investor update
  would expect a metric SmartDoor doesn't track (margin, CAC) rather
  than silently omitting it without comment — the founder should know
  the gap exists, even if the decision is to leave it out of the final
  version.
- Never characterize SmartDoor's financial position to a third party
  directly — per `AUTHORITY_MATRIX.md`, any investor-facing statement
  requires founder review and approval.

## Future SDOS Capability

- A recurring, auto-generated investor-update draft pulling live
  `orders`/`subscriptions`/`invoices` data — would require
  `ai/integrations/`, not built today.
- Formal financial statements (P&L, balance sheet) — would require the
  accounting infrastructure named in `FINANCIAL_MODEL.md` as not
  existing yet.
