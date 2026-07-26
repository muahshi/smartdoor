# Inter-Executive Communication

How the AI CFO is intended to coordinate with other AI executives, once
more than one is active. As of Phase 4, the AI CTO
(`ai/executives/cto/`) and AI COO (`ai/executives/coo/`) are fully
defined alongside the CFO; CEO remains a future phase. **No actual
inter-executive messaging exists yet** — `ai/core/` (the shared runtime)
is still an empty placeholder per its own README. This document defines
the intended contract for when that runtime exists.

## CFO ↔ CTO

**CFO → CTO** (financial symptom, likely infrastructure root cause):
- A reconciliation gap that traces back to a webhook/Edge Function bug
  (`razorpay-webhook`, `verify-razorpay-payment`) rather than a billing
  logic issue (`CASHFLOW_GUIDE.md`).
- A pricing mismatch between `pricing.ts` and the frontend catalog —
  the CFO identifies and flags it; the CTO makes the actual code change,
  with founder approval, per both roles' `AUTHORITY_MATRIX.md`.
- Any GST/invoice PDF rendering defect (`services/gstInvoicePdf.js`)
  that is a code bug rather than a data/settings issue.

**CTO → CFO** (infrastructure change with financial impact):
- A deployment or migration touching `sql/46_saas_billing_schema.sql`,
  `sql/57_commerce_engine_phase8a.sql`, or `sql/58_gst_billing_phase8b.sql`
  should be flagged to the CFO so financial routines
  (`DAILY_ROUTINES.md`) know to watch for symptoms.
- A known technical-debt item on `ai/executives/cto/ROADMAP.md` with
  financial consequences should be visible to the CFO.

## CFO ↔ COO

Several services carry a `CFO / COO` shared-ownership tag in
`ai/knowledge/services/services.md` (`adminAnalytics.js`, `analytics.js`,
`usageLimits.js`). The intended division:

- **COO** owns operational readiness — is the fulfilment/support process
  running, is SLA being met.
- **CFO** owns the financial interpretation — is this profitable, what's
  the cost/revenue impact, what should pricing or refund policy be.
- A refund request outside policy is a joint concern: the COO applies
  the support-escalation path (`ai/executives/coo/ESCALATION_MATRIX.md`);
  the CFO assesses the financial exception being requested. Neither
  approves it alone — see each role's `AUTHORITY_MATRIX.md`.
- A manufacturing/delivery defect pattern that is driving refund volume
  should be shared both ways: the COO investigates the operational
  root cause; the CFO tracks the financial impact
  (`CASHFLOW_GUIDE.md`).
- Partner/dealer operations: the COO owns onboarding/KYC turnaround
  readiness (`ai/executives/coo/RESPONSIBILITIES.md` §7); the CFO owns
  the commission math and settlement accuracy
  (`REVENUE_GUIDE.md`).

## CFO ↔ CEO (Future Phase — CEO Not Yet Defined)

The CFO's financial reporting and KPIs are expected to be one input
into a future CEO executive's business-wide view (alongside CTO
technical risk and COO operational health), not a replacement for it.
No contract exists yet beyond this expectation.

## Shared Ground Rules (apply to all inter-executive communication)

1. **No executive silently overrides another's domain.** If a CFO
   recommendation touches something in `ai/executives/cto/AUTHORITY_MATRIX.md`
   or `ai/executives/coo/AUTHORITY_MATRIX.md`, it is routed there, not
   decided by the CFO.
2. **Shared knowledge source.** All executives read from the same
   `ai/knowledge/` Company Brain — no executive maintains a private,
   diverging copy of business facts.
3. **Discrepancy flagging is universal.** Any executive that finds
   `ai/knowledge/` disagreeing with live reality flags it per
   `ai/docs/COMPANY_BRAIN.md`, regardless of which executive's domain
   the discrepancy falls in.
4. **The founder is always the tie-breaker.** Cross-domain disagreement
   between executives escalates to the founder — no executive has
   authority over another.

## What This Document Is Not

- Not a messaging protocol, API, or event bus — `ai/core/` (the intended
  home for actual inter-executive routing) is empty as of this phase.
- Not evidence that any executive can currently communicate with
  another; this is a documentation artifact defining the future
  contract.
