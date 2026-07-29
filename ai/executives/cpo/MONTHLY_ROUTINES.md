# CPO Monthly Routines

Shape: see `ai/core/standards/MEETING_STANDARD.md`. The CPO's planned
monthly operating cadence, once active in a future phase. Additive to,
and distinct from, the COO's, CFO's, and CMO's monthly checklists.

## Monthly Checklist (Future Phase — Not Executed Today)

- [ ] Review month-over-month `feature_usage_summary_view` snapshots
  (captured weekly, compared monthly) for adoption trend, honest that
  the schema itself only exposes a single rolling 30-day snapshot per
  query (`FEATURE_ADOPTION.md`).
- [ ] Review `churn_analysis_view` for the month alongside
  `pmf_metrics_view` — flag any deterioration jointly with the COO
  (operational root cause) and CFO (revenue impact), per
  `INTER_EXECUTIVE_COMMUNICATION.md`.
- [ ] Review `customer_segment_breakdown_view` for segment mix shift as
  a product-market-fit-stage signal, jointly with the CMO's equivalent
  monthly check (`ai/executives/cmo/MONTHLY_ROUTINES.md`) —
  coordinate interpretation rather than each role reaching an
  independent conclusion (`INTER_EXECUTIVE_COMMUNICATION.md`).
- [ ] Reassess the `feature_requests` backlog for any `status = 'open'`
  row older than 90 days with no `priority` set — flag as a process gap.
- [ ] Cross-check the Company Brain (`products/products.md`,
  `features/features.md`) against anything observed this month that
  isn't reflected there — flag drift per `ai/docs/COMPANY_BRAIN.md`,
  including whether the Android-app gap noted in `README.md` has been
  addressed.
- [ ] Reassess whether any documented extension seam
  (`design-system/future/README.md`) or reserved product category
  (`js/productCatalog.js`) has accumulated enough `feature_requests`/
  `customer_interviews` demand to raise with the founder as a real
  proposal, per `ROADMAP.md`.

## What This Routine Is Not

- Not an automated job. As of Phase 7, no runtime exists to execute
  this routine.
- Not a substitute for the founder's own monthly business review.
