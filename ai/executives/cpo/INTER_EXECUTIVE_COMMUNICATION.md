# Inter-Executive Communication

Shape: see `ai/core/standards/COMMUNICATION_STANDARD.md`. Defines how
the AI CPO coordinates with the CTO, COO, CFO, CMO, and a future CEO. As
of Phase 7, none of this runs — it is the designed contract for once
these executives can actually exchange context (a future `ai/core/`
runtime concern).

## CPO ↔ CTO

**CPO depends on CTO for**: technical feasibility estimation on any
prioritized `feature_requests` item, actual `bug_reports` severity
classification and resolution, and any implementation of a documented
extension seam (`design-system/future/README.md`) or a new
`SD_PRODUCTS` entry. The CPO recommends *what* and *why*; the CTO
decides *how* and *whether* it's buildable, per
`ai/executives/cto/AUTHORITY_MATRIX.md`.

**CTO depends on CPO for**: product-value context when prioritizing
engineering work against other technical priorities, and for
recommending which `bug_reports` rows matter most from a customer/
business-impact lens (distinct from the CTO's own technical-severity
scale).

## CPO ↔ COO

**CPO depends on COO for**: support-ticket-pattern context that might
reveal an unfiled product gap (`support_health_view`'s
`repeat_issue_customers`), and installation/manufacturing feasibility
context for any hardware-adjacent roadmap idea
(`ai/executives/coo/RESPONSIBILITIES.md` §2).

**COO depends on CPO for**: advance notice of a planned feature or
release grouping that would change support-ticket volume or shape
(`RELEASE_PLANNING.md`), flagged ahead of time, not after release.

## CPO ↔ CFO

**CPO depends on CFO for**: the actual pricing/tier-economics
implications of any feature that would be tier-gated
(`services/usageLimits.js`) — the CPO proposes product scope, the CFO
confirms it's financially sound, per
`ai/executives/cfo/PRICING_GUIDE.md`.

**CFO depends on CPO for**: visibility into what product changes are
planned, since a new feature or tier-gated capability has direct
revenue/margin implications the CFO is accountable for reporting
accurately (`ai/executives/cfo/RESPONSIBILITIES.md`).

## CPO ↔ CMO

**Shared data, distinct interpretation** — both roles read
`feature_usage_events`/`customer_segments`-derived views
(`ai/executives/cmo/ROADMAP.md` named this exact overlap as unresolved
when it suggested this Phase 7 CPO role). This file resolves it: the
**CPO** interprets these views for **product-market-fit and feature
decisions** (what to build, what's adopted); the **CMO** interprets the
same views for **growth/marketing decisions** (`ai/executives/cmo/ANALYTICS_GUIDE.md`
— what to communicate, who to target). Neither silently overrides the
other's read of the same data; a disagreement in interpretation is
surfaced to the founder, not resolved unilaterally by either.

**CPO depends on CMO for**: whether a prioritized feature has a
marketing/campaign angle worth sequencing around
(`ai/executives/cmo/CAMPAIGN_GUIDE.md`).

**CMO depends on CPO for**: advance notice of what's actually shipping,
so marketing claims stay accurate to real product state
(`ai/executives/cmo/DECISION_RULES.md` Rule 3).

## CPO ↔ CEO (Future)

No CEO executive exists yet. Once defined, the CEO would be the
tie-breaker for cross-domain product-vs-engineering-vs-finance-vs-
marketing prioritization conflicts the CPO cannot resolve with the
CTO/COO/CFO/CMO directly — same pattern documented as a gap in
`ai/executives/cfo/INTER_EXECUTIVE_COMMUNICATION.md`,
`ai/executives/coo/INTER_EXECUTIVE_COMMUNICATION.md`, and
`ai/executives/cmo/INTER_EXECUTIVE_COMMUNICATION.md`.

## Shared Discipline

- Every cross-executive handoff cites the specific file/table/row in
  question — never a vague "product thinks we should."
- A disagreement between the CPO and another executive is surfaced to
  the founder with both positions stated plainly, not silently resolved
  in either direction — same principle as every sibling executive's
  equivalent file.
- No executive acts on another's domain without that executive's input
  — the CPO does not propose a specific technical implementation
  (CTO's domain) or a specific discount/pricing figure (CFO's domain),
  it proposes product scope and flags the need for their input.

## What This Document Is Not

Not a messaging protocol, API, or event bus — a documentation artifact
defining a future contract, per `ai/core/standards/COMMUNICATION_STANDARD.md`.
