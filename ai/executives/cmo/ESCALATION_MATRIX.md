# Escalation Matrix

Section shape and shared P0–P3 scale: see
`ai/core/standards/ESCALATION_STANDARD.md`. Adapts the severity
structure established in `ai/executives/coo/ESCALATION_MATRIX.md` and
`ai/executives/cfo/ESCALATION_MATRIX.md` to the marketing/brand domain.
This does not introduce a new escalation path — it defines routing
specifically for brand/marketing issues.

## Severity → Routing

| Severity | Examples | Routes To | Timing |
|---|---|---|---|
| P0 — Critical | Any published or about-to-publish copy that overstates the privacy/security promise; `robots.txt` accidentally blocking a previously-allowed crawler at scale; a public testimonial used without valid `public_consent` | Founder, immediately | Immediately, any hour |
| P1 — High | A campaign's `pricing_rules` stacking in an unintended, margin-damaging way; a sitemap/structured-data regression on a high-traffic page; a brand-inconsistent claim in founder-facing draft copy | Founder | Same business day |
| P2 — Medium | A stale `llms.txt` fact (price, feature) that no longer matches `js/productCatalog.js`; a missed `FAQPage`/structured-data opportunity | Founder, standard review | Within the week |
| P3 — Low | A documentation drift between `ai/knowledge/` and the live marketing surface; a cosmetic OG-image sizing issue | Backlog | Logged for review |

## Escalate Immediately (Same Hour)

- Any drafted or observed public copy that implies weaker number-masking,
  session security, or data handling than
  `ai/knowledge/business/business_rules.md` documents.
- Any use of a `customer_reviews.testimonial` publicly where
  `public_consent` is not `TRUE`, or where consent status is unclear.
- Any sign that `robots.txt` or `sitemap.xml` has changed in a way that
  would remove SmartDoor from a previously-allowed crawler's index
  entirely.

Action: surface to the founder directly with full evidence (the exact
copy/file/table row in question) — the CMO does not attempt to resolve
a P0 itself, matching the principle in
`ai/executives/coo/ESCALATION_MATRIX.md` and
`ai/executives/cfo/ESCALATION_MATRIX.md`.

## Escalate Within 24 Hours

- A live campaign's `pricing_rules` combination that appears to stack
  unintentionally with another active rule, suggesting real margin
  exposure (coordinate with the CFO, per
  `INTER_EXECUTIVE_COMMUNICATION.md`).
- A pattern of declining `customer_reviews` ratings that suggests a
  product/fulfilment issue rather than a marketing one (coordinate with
  the COO).

## What Is NOT an Escalation

- A single low `customer_reviews` rating from one owner — normal
  variance, routed to the COO's support process
  (`ai/executives/coo/CUSTOMER_SUPPORT_GUIDE.md`), not a marketing
  escalation.
- A hypothetical "what if we ran a campaign" question — that's
  `CAMPAIGN_GUIDE.md` analysis, not an escalation.
- A missing analytics number (e.g. "we don't track CAC by channel") —
  that's an honest gap per `ANALYTICS_GUIDE.md`, not an incident.

## The CMO's Role at Each Level

- **Routine level**: the CMO may draft an analysis or flag for founder
  review.
- **Founder level**: the CMO surfaces the situation with full context
  and evidence (specific copy, table rows, file references) — it never
  resolves a marketing/brand P0/P1 itself, per `AUTHORITY_MATRIX.md`.

## Cross-Reference

See `INTER_EXECUTIVE_COMMUNICATION.md` for when a marketing escalation
should also route to the CTO (implementation root cause, e.g. a
`robots.txt` regression), the CFO (margin/pricing root cause), or the
COO (product/fulfilment root cause behind a review-rating pattern) in
parallel.
