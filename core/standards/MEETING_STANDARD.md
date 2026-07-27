# Meeting Standard

"Meeting" here means any recurring operating cadence an executive
plans to run once active — there are no literal meetings in a
single-founder company. This governs `DAILY_ROUTINES.md`,
`WEEKLY_ROUTINES.md`, and `MONTHLY_ROUTINES.md`.

## Standard Structure (per cadence file)

1. **Opening note** naming which existing production runbook, if any,
   this routine is additive to rather than a replacement for (e.g. COO's
   daily routine is explicitly additive to `OPERATIONS_RUNBOOK.md` §3's
   own daily checklist — infra-flavored items stay the CTO's, the
   operations-flavored subset is the COO's).
2. **Checklist**, formatted as literal Markdown checkboxes (`- [ ]`), one
   item per concrete, checkable thing — never a vague "review
   operations."  Each item cites the real table, service, or dashboard
   it checks.
3. **What This Routine Is Not** — closing section, worded consistently:
   not an automated job, cron task, or dashboard; no runtime exists yet
   to execute it; not a substitute for founder judgment on anything
   `AUTHORITY_MATRIX.md` marks as requiring approval.

## Rules

- Every checklist item must be independently verifiable against real
  data once `ai/integrations/` exists — no item that only makes sense
  once some other unbuilt system exists.
- A routine never duplicates an item already owned by a sibling
  executive's routine or an existing production runbook — cross-
  reference instead (per `COMMUNICATION_STANDARD.md`).
- Cadence files are planning artifacts for a future phase, not
  documentation of anything currently executing — say so plainly rather
  than implying an active schedule.
