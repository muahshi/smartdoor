# Inter-Executive Communication

Shape: see `ai/core/standards/COMMUNICATION_STANDARD.md`. Defines how
the AI CMO coordinates with the CTO, COO, CFO, and a future CEO. As of
Phase 6, none of this runs — it is the designed contract for once these
executives can actually exchange context (a future `ai/core/` runtime
concern).

## CMO ↔ CTO

**CMO depends on CTO for**: any actual implementation — `index.html`
meta/JSON-LD changes, `robots.txt`/`sitemap.xml` edits, new structured
data (e.g. `FAQPage`), and any future ad-pixel/UTM/attribution
instrumentation (`SEO_GUIDE.md`, `ANALYTICS_GUIDE.md`,
`PAID_ADS_GUIDE.md`). The CMO recommends *what* should exist; the CTO
decides *how* and *whether* it's built, per
`ai/executives/cto/AUTHORITY_MATRIX.md`.

**CTO depends on CMO for**: marketing-facing rationale when
prioritizing an SEO/structured-data change against other engineering
work, and for flagging when a proposed technical change (e.g. altering
`robots.txt`) would affect the GEO/AEO posture already in place.

## CMO ↔ COO

**CMO depends on COO for**: the operational reality behind
`customer_reviews` ratings and `retention`/`churn` signals — a rating
dip might be a marketing-copy-expectations issue or a fulfilment/support
issue, and the COO owns the latter diagnosis
(`ai/executives/coo/RESPONSIBILITIES.md`). Also depends on COO for the
partner-onboarding/KYC process that sits downstream of the
`partner-apply.html` lead-gen funnel (`LEAD_GENERATION_GUIDE.md`).

**COO depends on CMO for**: honest framing of what a marketing campaign
or referral push implies for operational load (e.g. a festival campaign
driving an order spike the COO needs to staff for), flagged ahead of
time, not after a campaign goes live.

## CMO ↔ CFO

**CMO depends on CFO for**: the actual discount/margin mechanics behind
any `pricing_rules`/`coupons` recommendation (`CAMPAIGN_GUIDE.md`) — the
CMO proposes campaign strategy, the CFO confirms it's financially sound,
per `ai/executives/cfo/PRICING_GUIDE.md`. Also depends on CFO for
`ai/executives/cfo/UNIT_ECONOMICS.md`'s CAC framing whenever a paid-ads
question arises (`PAID_ADS_GUIDE.md`).

**CFO depends on CMO for**: visibility into what campaigns are planned
or running, since `pricing_rules`/`coupons` changes have direct revenue
impact the CFO is accountable for reporting accurately
(`ai/executives/cfo/RESPONSIBILITIES.md`).

## CMO ↔ CEO (Future)

No CEO executive exists yet. Once defined, the CEO would be the
tie-breaker for cross-domain marketing-vs-engineering-vs-finance
prioritization conflicts the CMO cannot resolve with the CTO/COO/CFO
directly — same pattern documented as a gap in
`ai/executives/cfo/INTER_EXECUTIVE_COMMUNICATION.md` and
`ai/executives/coo/INTER_EXECUTIVE_COMMUNICATION.md`.

## Shared Discipline

- Every cross-executive handoff cites the specific file/table/row in
  question — never a vague "marketing thinks we should."
- A disagreement between the CMO and another executive is surfaced to
  the founder with both positions stated plainly, not silently resolved
  in either direction — same principle as
  `ai/executives/coo/INTER_EXECUTIVE_COMMUNICATION.md`.
- No executive acts on another's domain without that executive's input
  — the CMO does not propose a specific discount percentage (CFO's
  domain) or a specific technical SEO implementation (CTO's domain), it
  proposes marketing strategy and flags the need for their input.
