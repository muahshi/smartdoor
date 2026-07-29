# Cross-Executive Communication

Structure and shared ground rules: see
`ai/core/standards/COMMUNICATION_STANDARD.md` (see `README.md` for this
file's current existence status). This is the CEO's side of the contract
every one of the five sibling executives' own
`INTER_EXECUTIVE_COMMUNICATION.md` already names as a gap — each one
has a "↔ CEO (Future Phase — CEO Not Yet Defined)" section stating the
same expectation in almost identical words. This file closes that loop
from the CEO's side. **No actual inter-executive messaging exists yet**
— `ai/core/` (the shared runtime) is still an empty placeholder per its
own README, same status every sibling document already notes. This
defines the intended contract for when that runtime exists.

## CEO ↔ CTO

Per `cto/MISSION.md`'s own non-goals, the CTO explicitly does not own
"product/business strategy (that's a CEO-flavored concern)." The CEO
reads `cto/RISK_FRAMEWORK.md` and `cto/ROADMAP.md` as its primary
technical-health input, and routes any technical implementation question
back to the CTO rather than answering it independently
(`DECISION_RULES.md` Rule 2).

## CEO ↔ COO

Per `coo/INTER_EXECUTIVE_COMMUNICATION.md`'s own "COO ↔ CEO (Future
Phase)" section: "The COO's routines and KPIs are expected to be one
input into a future CEO executive's business-wide view... not a
replacement for it." The CEO reads `coo/KPI.md` and any open
`coo/ESCALATION_MATRIX.md` P0/P1 items as its operational-health input.

## CEO ↔ CFO

Per `cfo/INTER_EXECUTIVE_COMMUNICATION.md`'s own "CFO ↔ CEO (Future
Phase)" section: the CFO's financial reporting and KPIs are "one input
into a future CEO executive's business-wide view (alongside CTO
technical risk and COO operational health)." The CEO reads `cfo/KPI.md`
and `cfo/UNIT_ECONOMICS.md` as its financial-health input, and never
recommends a pricing or spend decision independently of the CFO's own
`AUTHORITY_MATRIX.md`.

## CEO ↔ CMO

Per `cmo/INTER_EXECUTIVE_COMMUNICATION.md`'s own "CMO ↔ CEO (Future)"
section: "the CEO would be the tie-breaker for cross-domain
marketing-vs-engineering-vs-finance prioritization conflicts the CMO
cannot resolve with the CTO/COO/CFO directly." The CEO applies exactly
this — using `DECISION_FRAMEWORK.md` when such a conflict is real, and
routing to the founder per every sibling's "founder is always the
tie-breaker" principle rather than the CEO deciding itself.

## CEO ↔ CPO

Per `cpo/INTER_EXECUTIVE_COMMUNICATION.md`'s own "CPO ↔ CEO (Future)"
section — the same tie-breaker expectation as CMO's, extended to
"product-vs-engineering-vs-finance-vs-marketing prioritization
conflicts." This is also the origin of this entire phase: `cpo/ROADMAP.md`'s
"Suggestion for Phase 8: AI CEO Brain" explicitly named this exact gap
as the reason a CEO role should be built next.

## Shared Ground Rules (Apply to All Six Executives, Not Just the CEO)

Restated here for completeness, identical to every sibling's own
statement of these same rules:

1. **No executive silently overrides another's domain.** The CEO
   included — if a CEO synthesis touches something in any sibling's
   `AUTHORITY_MATRIX.md`, it is routed there, never decided by the CEO.
2. **Shared knowledge source.** All six executives read from the same
   `ai/knowledge/` Company Brain — no executive, including the CEO,
   maintains a private, diverging copy of business facts.
3. **Discrepancy flagging is universal.** Any executive that finds
   `ai/knowledge/` disagreeing with live reality flags it per
   `ai/docs/COMPANY_BRAIN.md`, regardless of domain.
4. **The founder is always the tie-breaker.** This is the one rule the
   CEO's existence does not change — the CEO makes the tie-break
   easier to make well, it does not make the tie-break itself.

## What This Document Is Not

- Not a messaging protocol, API, or event bus — `ai/core/` (the
  intended home for actual inter-executive routing) is empty as of this
  phase.
- Not evidence that any executive can currently communicate with
  another — this is a documentation artifact defining the future
  contract, exactly as every sibling executive's own equivalent file
  already states about itself.
