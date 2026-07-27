# COO Weekly Routines

Shape: see `ai/core/standards/MEETING_STANDARD.md`.
The COO's planned weekly operating cadence, once active in a future
phase. Additive to, not a replacement for, `OPERATIONS_RUNBOOK.md` §3
(Weekly) — infra-flavored items (backup verification) remain the CTO's.

## Weekly Checklist (Future Phase — Not Executed Today)

- [ ] Pull `getSupportHealthMetrics()` and review `avgResolutionHours`,
  `escalatedTickets`, and `repeatIssueCustomers`, per
  `docs/SUPPORT_ESCALATION_GUIDE.md` §"Weekly review."
- [ ] Review the support ticket backlog and categories, per
  `OPERATIONS_RUNBOOK.md` §3 (Weekly).
- [ ] Review subscription renewal success rate for operational
  (not billing) friction — e.g. is `services/renewalEngine.js` reaching
  customers reliably.
- [ ] Review manufacturing throughput for the week: batches completed vs.
  batches still in QC/packaging, watching for a growing backlog.
- [ ] Review any partner/dealer KYC applications pending review beyond a
  reasonable turnaround (`services/partnerOnboarding.js`).
- [ ] Cross-check any escalated pattern (3+ tickets, same symptom) against
  `bug_reports` to confirm it was logged as a product issue, not just a
  support one, per `SUPPORT_RUNBOOK.md` §5.

## What This Routine Is Not

- Not an automated job. As of Phase 3, no runtime exists to execute this
  routine.
- Not a substitute for the founder reviewing anything that surfaces a
  founder-approval-required item per `AUTHORITY_MATRIX.md`.
