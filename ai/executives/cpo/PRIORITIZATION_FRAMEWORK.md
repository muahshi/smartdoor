# Prioritization Framework

No standard — role-specific domain playbook. Distinct from
`FEATURE_PRIORITIZATION.md` (the operational process for the
`feature_requests` queue specifically) — this file is the underlying
**scoring rubric**, which can also apply to a `customer_interviews`
requested feature or a documented roadmap seam
(`PRODUCT_ROADMAP.md`) that never went through the public queue at all.

## The Rubric (Value vs. Effort, Grounded in Real Fields)

**Value signals (each cited from a real source, never invented):**
- `feature_requests.upvotes` — raw demand count.
- Segment concentration — cross-reference the requester(s) against
  `customer_segment_breakdown_view` (`beta` / `early_access` / `paying`
  / `vip`); a request concentrated among `vip`/`paying` segments carries
  more weight than the same upvote count spread across `beta` users,
  since the former is closer to the retained, paying customer.
- Corroboration in `customer_interviews.requested_features` or
  `problems_found` — independent confirmation outside the public queue.
- Relevance to `pmf_metrics_view`'s `avg_renewal_intent` /
  `avg_referral_intent` — does this plausibly move a retention/referral
  signal, or is it cosmetic?

**Effort signals (grounded, not invented):**
- Does it map to an already-documented extension seam
  (`design-system/future/README.md`) or reserved category
  (`js/productCatalog.js`)? If yes, effort is likely lower — the design
  work is already done.
- Does it require a new Supabase table/column/RLS policy? If yes, it's
  automatically founder-approval-gated regardless of value score
  (`ai/core/standards/AUTHORITY_STANDARD.md`'s universal schema rule) —
  flag this explicitly rather than scoring around it.

## Scoring Output

A recommended `priority` value (`low` / `medium` / `high` / `critical`,
matching `feature_requests.priority`'s actual `CHECK` constraint) with
the cited value/effort reasoning attached — never a bare number with no
traceable source.

## What This Framework Deliberately Does Not Do

- Does not produce a numeric score with false precision (e.g. "7.3/10")
  — SmartDoor's own schema uses a four-value enum; the CPO's output
  matches that granularity rather than inventing finer precision the
  data doesn't support.
- Does not treat effort estimation as a technical commitment — effort
  signals here are directional inputs to prioritization, not a
  CTO-approved estimate (`ai/executives/cto/RESPONSIBILITIES.md` owns
  actual technical estimation).
