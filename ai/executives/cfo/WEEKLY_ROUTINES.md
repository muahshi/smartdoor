# CFO Weekly Routines

Shape: see `ai/core/standards/MEETING_STANDARD.md`.
The CFO's planned weekly operating cadence, once active in a future
phase. Additive to, and distinct from, the COO's weekly checklist
(`ai/executives/coo/WEEKLY_ROUTINES.md`).

## Weekly Checklist (Future Phase — Not Executed Today)

- [ ] Review revenue by stream for the week (hardware / subscription /
  partner commission) per `REVENUE_GUIDE.md`.
- [ ] Review the renewal-lifecycle funnel (90d/30d/7d/1d/expired) for
  the week, per `services/renewalEngine.js` and
  `SUBSCRIPTION_METRICS.md`, watching for an unusual spike in
  `expired`/`grace_period` counts.
- [ ] Review coupon and bulk-pricing-tier usage for the week for any
  unexpected margin impact (`PRICING_GUIDE.md`).
- [ ] Review partner commission accrual for the week against
  `commission_rules` to confirm figures look consistent with
  attributed order volume.
- [ ] Cross-check `invoices` GST breakup totals reconcile
  (`taxable_value` + tax amounts = `invoice_total`) for a sample of the
  week's invoices.

## What This Routine Is Not

- Not an automated job. As of Phase 4, no runtime exists to execute
  this routine.
- Not a substitute for the founder reviewing anything that surfaces a
  founder-approval-required item per `AUTHORITY_MATRIX.md`.
