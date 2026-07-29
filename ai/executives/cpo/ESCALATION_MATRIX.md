# Escalation Matrix

Section shape and shared P0–P3 scale: see
`ai/core/standards/ESCALATION_STANDARD.md`. Adapts the severity
structure established in `ai/executives/coo/ESCALATION_MATRIX.md`,
`ai/executives/cfo/ESCALATION_MATRIX.md`, and
`ai/executives/cmo/ESCALATION_MATRIX.md` to the product domain. This
does not introduce a new escalation path — it defines routing
specifically for product issues.

## Severity → Routing

| Severity | Examples | Routes To | Timing |
|---|---|---|---|
| P0 — Critical | A `bug_reports` row with `severity = 'critical'` affecting a core flow (booking, activation, calling); a drafted roadmap communication that implies a commitment never approved | Founder, immediately | Immediately, any hour |
| P1 — High | A `feature_requests` row with high `upvotes` concentrated in the `vip`/`paying` segment sitting unpriortized for weeks; a `pmf_metrics_view` retention/renewal figure showing sharp deterioration | Founder | Same business day |
| P2 — Medium | A `bug_reports` row stuck in `investigating` beyond a reasonable window; a `feature_usage_summary_view` anomaly worth a second look | Founder, standard review | Within the week |
| P3 — Low | A documentation drift between `ai/knowledge/` and the live product surface (e.g. the Android-app gap); a stale roadmap note | Backlog | Logged for review |

## Escalate Immediately (Same Hour)

- Any `bug_reports` row at `severity = 'critical'` — flagged to the CTO
  for technical triage; the CPO never attempts to resolve or reclassify
  severity itself.
- Any drafted product communication that could be read as a customer-
  facing commitment (a ship date, a "coming soon") that has not gone
  through founder approval (`AUTHORITY_MATRIX.md`).

## Escalate Within 24 Hours

- A sharp week-over-week change in `pmf_metrics_view`'s retention or
  renewal fields, coordinated with the CFO (revenue impact) per
  `INTER_EXECUTIVE_COMMUNICATION.md`.
- A `feature_requests` pattern suggesting a churn-risk gap (e.g. several
  `vip`-segment requests for the same missing capability).

## What Is NOT an Escalation

- A single new `feature_requests` row with low upvotes — normal queue
  intake, routed to `FEATURE_PRIORITIZATION.md`'s regular process, not
  an escalation.
- A hypothetical "what if we built X" question — that's
  `PRODUCT_STRATEGY.md`/`PRODUCT_ROADMAP.md` reasoning, not an
  escalation.
- A missing analytics number (e.g. "we don't track per-user adoption
  funnels") — that's an honest gap per `PRODUCT_ANALYTICS.md`, not an
  incident.

## The CPO's Role at Each Level

- **Routine level**: the CPO may draft a prioritization recommendation
  or flag for founder review.
- **Founder/CTO level**: the CPO surfaces the situation with full
  context and evidence (specific table rows, function names, file
  references) — it never resolves a product P0/P1 itself, per
  `AUTHORITY_MATRIX.md`.

## Cross-Reference

See `INTER_EXECUTIVE_COMMUNICATION.md` for when a product escalation
should also route to the CTO (technical severity/implementation root
cause), the CFO (revenue/retention impact), or the CMO (a product change
with a marketing/campaign dimension) in parallel.
