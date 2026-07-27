# Risk Framework

Category/scoring shape: see `ai/core/standards/RISK_STANDARD.md`.
How the AI CTO classifies and manages technical risk across the codebase.
Complements `BUG_TRIAGE_GUIDE.md` (which classifies known, reported issues)
by covering forward-looking and structural risk — things that haven't
broken yet but could.

## Risk Categories

### 1. Data/Privacy Risk
Anything that could expose customer PII (phone numbers, addresses,
payment details) beyond its intended audience.
- Primary sources: RLS gaps, client-side data exposure, third-party
  integration scope creep (e.g. a service receiving more data than it
  needs).

### 2. Financial/Payment Risk
Anything that could cause incorrect charges, missed charges, duplicate
charges, or commission/settlement miscalculation.
- Primary sources: webhook idempotency gaps, pricing logic duplicated
  outside `pricing.ts`, race conditions in checkout flows (the 409
  payment-retry bug is the documented precedent here).

### 3. Availability Risk
Anything that could take a customer-facing flow down, especially the
core QR-scan-to-visitor-communication path.
- Primary sources: Edge Function failures with no fallback, realtime
  channel fragility (the WebRTC broadcast-channel regression is the
  documented precedent), service worker caching bugs affecting navigation.

### 4. Architectural Debt Risk
Accumulating drift between documented architecture and actual
implementation, or between parallel implementations of the same concern.
- Primary sources: orphaned/dead code that looks live (the admin AI
  Insights precedent), documentation lagging the schema (the
  10-table-vs-100+-table `DATABASE_SCHEMA.md` gap), un-synced
  `ai/knowledge/` files.

### 5. Scale Risk
Patterns that work today but degrade as active-plate count grows toward
the stated tens-of-thousands target.
- Primary sources: unscoped realtime subscriptions, missing indexes on
  increasingly-hot query paths, any O(n) client-side operation over a
  dataset expected to grow.

## Risk Scoring

Each identified risk gets scored on two axes:

- **Likelihood**: Low / Medium / High — how likely is this to manifest
  as an actual incident, based on how it's already trended (e.g. RLS
  mismatches have a High likelihood given documented recurrence)?
- **Impact**: Low / Medium / High — mapped to the same categories as
  `BUG_TRIAGE_GUIDE.md` severities (privacy/financial impact is treated as
  automatically High impact regardless of likelihood).

| Likelihood \ Impact | Low | Medium | High |
|---|---|---|---|
| **High** | Monitor | Prioritize | Escalate immediately |
| **Medium** | Log | Monitor | Prioritize |
| **Low** | Log | Log | Monitor |

Anything landing in "Escalate immediately" goes to the founder regardless
of what else is in progress — consistent with `AUTHORITY_MATRIX.md`'s
treatment of privacy/payment/auth issues as always founder-facing.

## Recurring Risk Patterns to Watch (from documented history)

1. RLS added after the fact rather than at table creation
2. A feature fully built but never wired into its parent UI (dead-but-live-
   looking code)
3. Realtime/presence channels torn down by an unrelated event handler
4. Silent failures (a stray `return`, a missing `clearTimeout`) that don't
   throw but do change behavior
5. Client-supplied data (e.g. customization fields) not reliably persisted
   through to a downstream system (manufacturing, in the house-number
   precedent)

## What the CTO Does With a Scored Risk

Documents it with category, likelihood, impact, and cited evidence; adds
it to `ROADMAP.md` if it's structural; escalates immediately if it lands
in the top-right of the scoring grid. Never remediates directly if the fix
falls under `AUTHORITY_MATRIX.md`'s approval-required table.
