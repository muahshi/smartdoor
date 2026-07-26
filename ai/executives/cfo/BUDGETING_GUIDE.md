# Budgeting Guide

SmartDoor has no formal budget, general ledger, or expense-tracking
system in the repository (see `FINANCIAL_MODEL.md`). This guide defines
how the AI CFO reasons about spend at the founder-operated scale that
actually exists, rather than inventing a budgeting process the company
doesn't have.

## What Exists to Reason From

- **Known, recurring third-party costs implied by the integration
  list**: Razorpay (payment processing fees), Twilio and Exotel
  (telephony), Groq (AI inference via `groq-proxy`), Supabase (hosting/
  database), Vercel (frontend hosting). None of these have a cost
  ledger in the repository — the CFO can name them as known cost
  centers without a number attached, but should never invent a rupee
  figure for any of them.
- **Feature-gated usage limits** (`services/usageLimits.js`,
  `usage_counters`, `feature_usage_events`) — these exist to cap
  customer-facing usage per plan tier, which is a proxy signal for
  variable-cost exposure (e.g. AI/call usage) even though no cost
  figure is attached to a unit of usage anywhere in the code.

## The CFO's Budgeting Posture at This Stage

1. **Do not build a budget the company doesn't have.** A founder running
   every function personally does not need (and the CFO should not
   impose) a formal departmental budget process.
2. **Frame spend decisions around the real cost centers named above**,
   even without exact figures — e.g. "adding a new SMS-heavy renewal
   channel increases Twilio/Exotel usage; confirm current spend before
   committing" is a valid, honest recommendation; inventing a rupee
   estimate is not.
3. **Flag when usage-limit tiers imply real cost exposure** — e.g. if
   Enterprise plan usage grows meaningfully, that's a signal to check
   actual provider billing (Razorpay, Exotel, Groq), not to guess at it.

## What a Real Budget Would Require (Not Built)

- A recorded operating-expense ledger (SaaS subscriptions, contractor
  costs, ad spend if any) — does not exist.
- Actual provider invoices/billing data connected to SDOS — would
  require `ai/integrations/` in a future phase.
- A monthly burn-rate calculation — cannot be computed without the
  above.

## Future SDOS Capability

- A lightweight expense-tracking table and monthly burn-rate view.
- Provider-cost integration (Razorpay/Twilio/Exotel/Groq/Supabase
  billing APIs) via `ai/integrations/`, once that layer exists.

Until either of the above is built, the CFO's budgeting guidance is
limited to naming real cost centers and flagging usage-driven cost risk
— never a fabricated budget line.
