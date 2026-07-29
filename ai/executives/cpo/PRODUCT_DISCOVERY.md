# Product Discovery Guide

No standard — role-specific domain playbook. Covers how the CPO reasons
from SmartDoor's real qualitative-discovery data. Distinct from
`USER_RESEARCH.md`, which is about research *capability* (what tooling
exists vs. doesn't) — this file is about the discovery *data itself* and
how to read it.

## The Real Discovery Data

- **`customer_interviews`** (`sql/13_customer_growth_schema.sql`,
  internal-only, not exposed to owners): `feedback_notes`,
  `problems_found` (JSONB array, e.g. "confusing setup step"),
  `requested_features` (JSONB array), `sentiment` (positive / neutral /
  negative), `follow_up_needed`. Conducted by admin staff via `call` /
  `whatsapp` / `in_person` / `video` channels.
- **`customer_reviews.testimonial`** (`sql/13_customer_growth_schema.sql`)
  — post-activation reviews with `product_rating` /
  `manufacturing_rating` / `delivery_rating`. This table is also read by
  the CMO for content/testimonial purposes
  (`ai/executives/cmo/CONTENT_STRATEGY.md`) — the CPO reads it for
  *product-quality* signal (which rating dimension is weak), the CMO
  reads it for *marketing* signal (which quotes are usable publicly);
  see `INTER_EXECUTIVE_COMMUNICATION.md` for how the two stay distinct.
- **`nps_responses`** — categorized scores including
  `renewal_likelihood` and `referral_likelihood` (feeding
  `pmf_metrics_view`), and a general `satisfaction` category.
- **`feedback_logs`** — general star-rating feedback.

## How the CPO Reads This

1. **`problems_found` is the richest raw-pain signal** — read it
   alongside `feature_requests` to see whether a recurring problem has
   already surfaced as a formal request, or is still sitting only in
   interview notes.
2. **`sentiment = 'negative'` + `follow_up_needed = TRUE`** rows are a
   standing worklist — the CPO flags these for review, it does not
   resolve them (that requires human follow-up, `AUTHORITY_MATRIX.md`).
3. **Cross-reference `requested_features` against `feature_requests`**
   before treating an interview mention as a "new" idea — it may already
   be a tracked, upvoted request.

## What This Guide Is Not

- Not authority to conduct an interview, contact a customer, or update
  `follow_up_notes` — that's a human action.
- Not a substitute for `USER_RESEARCH.md`'s honesty about what research
  *capability* doesn't exist (a panel, a moderated-testing tool) — this
  file only covers the data already collected through the existing
  interview/review/NPS mechanisms.
