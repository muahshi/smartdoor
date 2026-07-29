# CPO Daily Routines

Shape: see `ai/core/standards/MEETING_STANDARD.md`. The CPO's planned
daily operating cadence, once active in a future phase. Additive to,
and distinct from, the COO's, CFO's, and CMO's daily checklists
(`ai/executives/coo/DAILY_ROUTINES.md`, `ai/executives/cfo/DAILY_ROUTINES.md`,
`ai/executives/cmo/DAILY_ROUTINES.md`) — the items below are
product-flavored.

## Daily Checklist (Future Phase — Not Executed Today)

- [ ] Check `feature_requests` for any new rows with `status = 'open'`
  and no `priority` set (`FEATURE_PRIORITIZATION.md`).
- [ ] Check `bug_reports` for any new `severity = 'critical'` row
  (`CUSTOMER_FEEDBACK_GUIDE.md`) — flag to the CTO immediately per
  `ESCALATION_MATRIX.md`, do not attempt to triage severity itself.
- [ ] Glance at `feature_usage_summary_view` for any sharp day-over-day
  change in a `feature_key`'s usage count (`FEATURE_ADOPTION.md`).
- [ ] Confirm no drafted roadmap note or prioritization recommendation
  from the previous day is still pending founder review
  (`DECISION_RULES.md` Rule 10).

## What This Routine Is Not

- Not an automated job, cron task, or dashboard. As of Phase 7, no
  runtime exists to execute this routine — it is a documented cadence
  for a future CPO agent to follow once `ai/integrations/` provides
  read-only access to the relevant tables.
- Not a substitute for the founder's own judgment on any item that
  surfaces something in `AUTHORITY_MATRIX.md`'s founder-approval table.
