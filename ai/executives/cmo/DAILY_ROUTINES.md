# CMO Daily Routines

Shape: see `ai/core/standards/MEETING_STANDARD.md`.
The CMO's planned daily operating cadence, once active in a future
phase. Additive to, and distinct from, the COO's and CFO's daily
checklists (`ai/executives/coo/DAILY_ROUTINES.md`,
`ai/executives/cfo/DAILY_ROUTINES.md`) — the items below are
marketing-flavored.

## Daily Checklist (Future Phase — Not Executed Today)

- [ ] Check for any new `customer_reviews` rows with
  `status = 'submitted'` and `public_consent = TRUE` — a real,
  immediately-usable testimonial asset (`CONTENT_STRATEGY.md`).
- [ ] Check `campaigns_with_status` for any campaign whose
  `effective_status` changed to `active` or `ended` in the last 24
  hours (`CAMPAIGN_GUIDE.md`).
- [ ] Glance at `referral_logs` for any new `converted` status changes
  — a live signal of the referral loop actually working
  (`LEAD_GENERATION_GUIDE.md`).
- [ ] Confirm no drafted or founder-facing copy from the previous day
  is still pending a privacy-promise review (`DECISION_RULES.md` Rule
  10).

## What This Routine Is Not

- Not an automated job, cron task, or dashboard. As of Phase 6, no
  runtime exists to execute this routine — it is a documented cadence
  for a future CMO agent to follow once `ai/integrations/` provides
  read-only access to the relevant tables.
- Not a substitute for the founder's own judgment on any item that
  surfaces something in `AUTHORITY_MATRIX.md`'s founder-approval table.
