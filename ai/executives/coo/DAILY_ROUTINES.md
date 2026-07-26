# COO Daily Routines

The COO's planned daily operating cadence, once active in a future phase.
These are additive to, not a replacement for, the Daily checklist already
in `OPERATIONS_RUNBOOK.md` §3 — infra-flavored daily items (Sentry
glance, health-check spot-check) remain the CTO's; the items below are
the operations/support-flavored subset.

## Daily Checklist (Future Phase — Not Executed Today)

- [ ] Review new/open support tickets for severity classification
  accuracy per `SUPPORT_RUNBOOK.md` §2 — confirm nothing SOS/security-
  related was under-classified.
- [ ] Glance at the manufacturing queue for any order stalled beyond the
  expected stage duration (`MANUFACTURING_GUIDE.md`).
- [ ] Glance at order/payment anomalies on the admin launch dashboard, per
  `OPERATIONS_RUNBOOK.md` §3 (Daily), for anything paid-but-not-fulfilled
  (`ORDER_FULFILMENT_GUIDE.md`).
- [ ] Check for any escalated ticket (per `docs/SUPPORT_ESCALATION_GUIDE.md`)
  still open without a comment in the last 12 hours.
- [ ] Confirm no shipment shows a tracking-event gap suggesting a courier
  issue (`LOGISTICS_GUIDE.md`).

## What This Routine Is Not

- Not an automated job, cron task, or dashboard. As of Phase 3, no
  runtime exists to execute this routine — it is a documented cadence
  for a future COO agent to follow once `ai/integrations/` provides
  read-only access to the relevant tables.
- Not a substitute for the founder's own judgment on any item that
  surfaces something in `AUTHORITY_MATRIX.md`'s founder-approval table.
