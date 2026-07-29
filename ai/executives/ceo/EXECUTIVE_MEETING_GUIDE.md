# Executive Meeting Guide

The intended cadence/format for a recurring cross-domain check-in.
Distinct from `EXECUTIVE_BRIEFING_GUIDE.md`, which is the shape of any
single ad hoc briefing — this file is specifically about a *recurring*,
scheduled synthesis across all five domains, mirroring the cadence
structure every sibling executive already defines for its own domain
(`*/DAILY_ROUTINES.md`, `*/WEEKLY_ROUTINES.md`, `*/MONTHLY_ROUTINES.md`).

## What This Is Not

There is no multi-agent meeting runtime. SmartDoor has one founder who
today performs every executive function personally (per every sibling
executive's own README). "Executive meeting" here means: the CEO
assembling, in one sitting, what each domain executive's own routines
would have surfaced by that point in the cadence — not five AI personas
holding a simulated conversation with each other.

## Weekly Cross-Domain Check-In (Intended Shape)

Assembled from each domain executive's own `WEEKLY_ROUTINES.md`:

| Domain | What it would have surfaced by end of week |
|---|---|
| CTO | Any new bug triage per `cto/BUG_TRIAGE_GUIDE.md`, deployment/release status per `cto/RELEASE_GUIDE.md` |
| COO | Support ticket volume/severity trend per `coo/WEEKLY_ROUTINES.md`, fulfilment/manufacturing status |
| CFO | Weekly revenue/subscription movement per `cfo/WEEKLY_ROUTINES.md` |
| CMO | Campaign/content/SEO status per `cmo/WEEKLY_ROUTINES.md` |
| CPO | `feature_requests` queue movement per `cpo/WEEKLY_ROUTINES.md` |

The CEO's role at this cadence: read each of the above, apply
`PRIORITY_MANAGEMENT.md` to surface what deserves the founder's
attention first that week, and flag any cross-domain conflict per
`EXECUTIVE_ORCHESTRATION.md` Pattern 3.

## Monthly Cross-Domain Check-In (Intended Shape)

Assembled from each domain executive's own `MONTHLY_ROUTINES.md`. This
is where `COMPANY_HEALTH_MODEL.md` and `STRATEGIC_PLANNING.md` are most
relevant — a monthly cadence is the natural point to look at the
business's overall trajectory rather than a single week's noise.

## Daily — Deliberately Not a Cross-Domain Cadence

Each sibling executive has its own `DAILY_ROUTINES.md` for
within-domain daily attention. The CEO does not have a daily cross-domain
check-in of its own — daily cross-domain synthesis at SmartDoor's
current single-founder scale would produce more overhead than value; see
`DAILY_ROUTINES.md` for what the CEO's daily cadence actually is instead
(narrower and reactive, not a full five-domain review).

## Facilitation Principles (Once This Runs For Real)

1. Every domain gets represented by its own real, current documentation
   — never a CEO paraphrase substituting for reading it.
2. Silence from a domain (nothing new to report) is stated as silence,
   not filled with a manufactured update.
3. A recurring conflict between two domains that shows up meeting after
   meeting is a signal worth escalating structurally
   (`EXECUTIVE_ESCALATION.md`), not something to re-litigate identically
   every time.

## What This Guide Does Not Do

- Does not create a calendar, scheduling system, or automated meeting
  runtime — that would require `ai/core/` and `ai/integrations/`,
  neither of which exist yet.
- Does not substitute for a sibling executive's own routine cadence —
  it assembles what those cadences would have already surfaced.
