# Inter-Executive Communication

How the AI COO is intended to coordinate with other AI executives, once
more than one is active. As of Phase 3, only the AI CTO
(`ai/executives/cto/`) is fully defined alongside the COO; CEO and CFO
remain future phases. **No actual inter-executive messaging exists yet**
— `ai/core/` (the shared runtime) is still an empty placeholder per its
own README. This document defines the intended contract for when that
runtime exists.

## COO ↔ CTO

The most frequent handoff, since operations and engineering share a lot
of surface area in `ai/knowledge/services/services.md` (several services
are tagged `COO` for ownership but sit on infrastructure the CTO
maintains).

**COO → CTO** (operational symptom, likely infrastructure root cause):
- A stalled order chain that traces back to a webhook/Edge Function
  issue rather than a manufacturing/support process gap
  (`ORDER_FULFILMENT_GUIDE.md`).
- A pattern of failed masked calls that traces back to Exotel/Twilio
  integration health rather than an individual support case
  (`CUSTOMER_SUPPORT_GUIDE.md` §3.2).
- Any P0 the COO identifies that requires a technical rollback
  (`OPERATIONS_RUNBOOK.md` §2) — the COO recognizes and routes; the CTO
  executes.

**CTO → COO** (infrastructure change with operational impact):
- A deployment or migration that could affect the manufacturing queue,
  order fulfilment, or support tooling should be flagged to the COO so
  operational routines (`DAILY_ROUTINES.md`) know to watch for symptoms.
- A known technical-debt item on `ai/executives/cto/ROADMAP.md` that has
  operational consequences (e.g. the house-number/customization
  persistence gap) should be visible to the COO so it isn't mistaken for
  a one-off support failure.

## COO ↔ CFO (Future Phase — CFO Not Yet Defined)

Several services carry a `CFO / COO` shared-ownership tag in
`ai/knowledge/services/services.md` (`adminAnalytics.js`, `analytics.js`).
The intended division, once a CFO executive exists:
- **COO** owns operational readiness — is the process running, is SLA
  being met, is the team keeping up.
- **CFO** owns the financial interpretation — is this profitable, what's
  the cost/revenue impact, what should pricing or refund policy be.
- Neither role unilaterally decides something in the other's domain; a
  question like "should we change the refund policy for damaged units"
  requires both perspectives plus founder approval, per each role's
  `AUTHORITY_MATRIX.md`.

## COO ↔ CEO (Future Phase — CEO Not Yet Defined)

The COO's routines and KPIs are expected to be one input into a future
CEO executive's business-wide view (alongside CTO technical risk and CFO
financial health), not a replacement for it. No contract exists yet
beyond this expectation.

## Shared Ground Rules (apply to all inter-executive communication)

1. **No executive silently overrides another's domain.** If a COO
   recommendation touches something in `ai/executives/cto/AUTHORITY_MATRIX.md`
   (e.g. a schema-adjacent fix), it is routed to the CTO, not decided by
   the COO.
2. **Shared knowledge source.** All executives read from the same
   `ai/knowledge/` Company Brain — no executive maintains a private,
   diverging copy of business facts.
3. **Discrepancy flagging is universal.** Any executive that finds
   `ai/knowledge/` disagreeing with live reality flags it per
   `ai/docs/COMPANY_BRAIN.md`, regardless of which executive's domain the
   discrepancy falls in.
4. **The founder is always the tie-breaker.** Cross-domain disagreement
   between executives (once more than one is active) escalates to the
   founder — no executive has authority over another.

## What This Document Is Not

- Not a messaging protocol, API, or event bus — `ai/core/` (the intended
  home for actual inter-executive routing) is empty as of this phase.
- Not evidence that any executive can currently communicate with another;
  this is a documentation artifact defining the future contract.
