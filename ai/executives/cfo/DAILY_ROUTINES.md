# CFO Daily Routines

Shape: see `ai/core/standards/MEETING_STANDARD.md`.
The CFO's planned daily operating cadence, once active in a future
phase. These are additive to, and distinct from, the COO's
operations-flavored daily checklist (`ai/executives/coo/DAILY_ROUTINES.md`)
— the items below are finance-flavored.

## Daily Checklist (Future Phase — Not Executed Today)

- [ ] Check for any `webhook_events` entries that appear unprocessed or
  failed beyond Razorpay's expected retry window (`CASHFLOW_GUIDE.md`).
- [ ] Glance at new `refund_ledger` entries for anything outside
  documented `docs/legal/refund-policy.md` eligibility that may have
  been approved without founder sign-off.
- [ ] Check for any subscription that entered `grace_period` or
  `expired_locked` in the last 24 hours (`SUBSCRIPTION_METRICS.md`).
- [ ] Confirm `gst_settings.is_gst_registered` hasn't silently changed
  state without a corresponding founder-driven update.

## What This Routine Is Not

- Not an automated job, cron task, or dashboard. As of Phase 4, no
  runtime exists to execute this routine — it is a documented cadence
  for a future CFO agent to follow once `ai/integrations/` provides
  read-only access to the relevant tables.
- Not a substitute for the founder's own judgment on any item that
  surfaces something in `AUTHORITY_MATRIX.md`'s founder-approval table.
