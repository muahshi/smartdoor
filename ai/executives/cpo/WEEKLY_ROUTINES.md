# CPO Weekly Routines

Shape: see `ai/core/standards/MEETING_STANDARD.md`. The CPO's planned
weekly operating cadence, once active in a future phase. Additive to,
and distinct from, the COO's, CFO's, and CMO's weekly checklists.

## Weekly Checklist (Future Phase — Not Executed Today)

- [ ] Review `feature_requests` ordered by `upvotes DESC`, cross-checked
  against `customer_segment_breakdown_view` for segment concentration
  (`PRIORITIZATION_FRAMEWORK.md`).
- [ ] Review any new `customer_interviews` rows logged during the week —
  `problems_found` and `requested_features` cross-referenced against
  the existing `feature_requests` queue (`PRODUCT_DISCOVERY.md`).
- [ ] Review `pmf_metrics_view`'s `retention_rate_pct`, `renewal_rate_pct`,
  `avg_renewal_intent`, and `avg_referral_intent` trend for the week
  (`PRODUCT_METRICS.md`).
- [ ] Review `bug_reports` where `status = 'investigating'` for how long
  they've been open (via `created_at`) — flag any aging row to the CTO,
  don't resolve it (`CUSTOMER_FEEDBACK_GUIDE.md`).
- [ ] Cross-check any release grouping in progress against
  `RELEASE_PLANNING.md`'s themed sequencing for drift.

## What This Routine Is Not

- Not an automated job. As of Phase 7, no runtime exists to execute
  this routine.
- Not a substitute for the founder reviewing anything that surfaces a
  founder-approval-required item per `AUTHORITY_MATRIX.md`.
