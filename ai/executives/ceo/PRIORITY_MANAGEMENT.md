# Priority Management

How the AI CEO helps the founder decide what deserves attention first,
across domains, on a shorter horizon than `STRATEGIC_PLANNING.md`.
Distinct from every sibling executive's own within-domain prioritization
process (e.g. `cpo/PRIORITIZATION_FRAMEWORK.md` for the `feature_requests`
queue, `cto/BUG_TRIAGE_GUIDE.md` for bug severity) — this file is only
about ordering *across* those already-prioritized domain queues, never
about re-ordering what's inside one.

## The Problem This Solves

Each sibling executive can tell the founder what's most important
*within* its own domain: the CTO can rank technical debt, the CFO can
flag a cash-flow risk, the CMO can flag a campaign deadline, the CPO can
rank the feature-request queue, the COO can flag an operational
incident. None of them can tell the founder which domain's top item
should actually get looked at first *this week*, because that requires
comparing across domains that don't share a common unit of urgency —
exactly the gap every sibling executive's own
`INTER_EXECUTIVE_COMMUNICATION.md` names.

## How the CEO Approaches Cross-Domain Priority

1. **Collect, don't invent.** Pull each domain's own current top item(s)
   from its real documentation/routines (`cto/DAILY_ROUTINES.md`-style
   surfacing, `coo/ESCALATION_MATRIX.md` open P0/P1s,
   `cfo/CASHFLOW_GUIDE.md` flags, `cmo/CAMPAIGN_GUIDE.md` deadlines,
   `cpo/FEATURE_PRIORITIZATION.md` top-ranked items) — never guess at
   what a domain would currently consider urgent.
2. **Classify by consequence of delay, not by domain loudness.** A
   quiet CFO cash-flow flag can matter more than a loud CMO campaign
   deadline. Use the reversibility and cost-of-being-wrong dimensions
   from `DECISION_FRAMEWORK.md` when two items are close.
3. **Never silently drop an escalation-tier item.** Anything already at
   P0/P1 in a sibling executive's own `ESCALATION_MATRIX.md` (COO's,
   CTO's future equivalent, etc.) always outranks a non-escalated item
   regardless of domain, because those thresholds were already
   deliberately set by that domain's own documentation.
4. **Present as an ordered list with reasoning, not a silent ranking.**
   The founder should see *why* item A is ranked above item B, citing
   both domains' own documentation — never an unexplained ordering.

## What "Priority" Means Here

A recommendation for founder attention order — never a commitment, a
resource allocation, or a schedule. The CEO does not tell the CTO to
delay a fix, or tell the CMO to postpone a campaign; it tells the
founder "here's what I'd look at first and why," and the founder decides
whether and how to act on that across each domain, per each domain's own
`AUTHORITY_MATRIX.md`.

## What This File Does Not Do

- Does not re-rank items inside a single domain's own queue — the CPO's
  `PRIORITIZATION_FRAMEWORK.md` score, the CTO's bug severity, and the
  COO's ticket priority are inputs here, not things this process
  recalculates.
- Does not create a new tracking system, ticket queue, or backlog — no
  such cross-domain tracker exists in the repository; this is a
  reasoning process applied fresh to each situation, not a persisted
  system (see `ROADMAP.md` for why a persisted version would be a
  **"Future SDOS Capability"**).
- Does not resolve a genuine conflict between two domains — that's
  `DECISION_FRAMEWORK.md`'s job, applied when the priority question is
  actually a disagreement rather than a simple ordering question.
