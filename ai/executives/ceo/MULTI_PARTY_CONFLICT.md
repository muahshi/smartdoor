# Multi-Party Conflict Resolution

## Status

SDOS Phase 13A. **Extension, not a duplicate.** `DECISION_FRAMEWORK.md`
already fully specifies the four-dimension rubric the CEO applies when
**two** sibling executives' documentation-backed recommendations
conflict (`EXECUTIVE_ORCHESTRATION.md` Pattern 3). Neither file
addresses what happens when three or more executives hold genuinely
different positions on the same question. This file closes that gap
only — it does not restate the four dimensions, the "when to use this
framework" scoping, or the "what this framework does not do" limits;
all of that remains exactly as `DECISION_FRAMEWORK.md` specifies and
applies unchanged to each pairwise comparison inside a multi-party
conflict.

## When This Applies

Only when three or more executives' own, already-cited documentation
would lead to genuinely different recommendations on the same
question — not merely different emphases. Two executives agreeing with
each other against a third is still, mechanically, resolved by applying
`DECISION_FRAMEWORK.md` to each pairwise disagreement (see "Relationship
to `DECISION_FRAMEWORK.md`" below) — this file adds only what changes
when there is no single pairwise comparison that captures the whole
disagreement, e.g. CTO + CPO favor one path, CFO favors another, and
COO's own evidence partially supports each side on different grounds.

## Conflict Detection

1. A multi-party conflict is detected the same way a two-party conflict
   is (`EXECUTIVE_ORCHESTRATION.md` Pattern 3): the CEO, synthesizing
   more than two executives' input on one question, finds that no
   single position commands agreement from all contributing domains.
2. Detection is never inferred from tone or framing — only from an
   actual citable conflict between each executive's own governing
   documentation (`DECISION_RULES.md`, `RISK_FRAMEWORK.md`,
   `PRIORITIZATION_FRAMEWORK.md`, etc.), per `DECISION_FRAMEWORK.md`'s
   existing standard.

## Stakeholder Identification

3. Every executive whose domain the question materially touches is a
   stakeholder, whether or not that executive volunteered a position —
   silence from a domain that `TASK_ROUTING.md`'s ownership table
   would clearly implicate is itself a gap to surface, not to treat as
   tacit agreement.
4. A stakeholder's position is what its own governing documentation
   would produce, cited the same way `DECISION_FRAMEWORK.md` Dimension
   1 already requires for two-party conflicts.

## Position Preservation

5. Every stakeholder's position is recorded in full, in that
   executive's own terms, before any comparison begins — the CEO does
   not paraphrase one executive's position through another's framing.
6. **Minority position preservation:** if three stakeholders converge
   on one answer and one does not, the fourth's position is preserved
   in the output with the same weight of documentation as the
   majority's — this section exists specifically because a 3-to-1 split
   is the case most likely to be treated as effectively resolved when
   it is not. `DECISION_FRAMEWORK.md` already rejects "numeric score or
   weighted average" reasoning; a headcount majority is exactly that
   kind of false precision applied to qualitative domain judgment, and
   is rejected on the same grounds.

## Evidence Collection and Quality Assessment

7. For each stakeholder's position, cite the specific document and
   passage it derives from, per `DECISION_FRAMEWORK.md` Dimension 1.
8. Evidence quality is assessed on the same terms `DECISION_FRAMEWORK.md`
   already uses per pairwise dimension — reversibility (Dimension 2),
   who bears the cost of being wrong (Dimension 3), and what's already
   resolved vs. genuinely novel (Dimension 4) — applied to *each*
   stakeholder's position, not averaged across them.
9. Evidence that is asserted without a specific citation to the
   asserting executive's own documentation is flagged as unsupported,
   not silently weighted equally with cited evidence.

## Business Impact Comparison

For each stakeholder position, the CEO states, where the evidence
supports it:

10. **Customer impact** — cite the domain document this derives from
    (typically COO's `CUSTOMER_SUPPORT_GUIDE.md`, CPO's
    `CUSTOMER_FEEDBACK_GUIDE.md`, or CMO's domain guides).
11. **Revenue impact** — cite CFO's `FINANCIAL_MODEL.md` or
    `REVENUE_GUIDE.md` where applicable; never a number invented for
    this comparison that isn't already grounded in CFO's own domain
    documentation.
12. **Risk impact** — cite CTO's `RISK_FRAMEWORK.md` where technical
    risk is implicated.
13. **Technical impact** — cite CTO's `ARCHITECTURE_GUIDE.md` or
    relevant domain guide.
14. **Operational impact** — cite COO's `OPERATIONS_GUIDE.md` or
    relevant domain guide.
15. **Strategic impact** — cite CEO's own `STRATEGIC_PLANNING.md` only
    where it directly bears; the CEO does not use its own strategic
    framing to break a tie among the other five domains' own evidence,
    consistent with `DECISION_RULES.md` Rule 10 (never presenting a
    decision as already made).
16. **Time sensitivity** — whether the underlying question has a
    deadline that makes deferring to founder review itself a decision
    with consequences (e.g. a launch window), cited from whichever
    domain's documentation establishes the deadline.

Any dimension without supporting documentation is marked "not
established" rather than filled with CEO judgment presented as fact.

## Trade-off Analysis

17. Trade-offs are presented as a structured comparison across all
    stakeholder positions and all applicable dimensions above — a
    matrix, not a narrative that implicitly favors one side by the
    order it's discussed in.
18. Per `DECISION_FRAMEWORK.md`'s existing "Output Shape" rule, this
    comparison is produced for the founder to decide from. It is never
    a CEO-generated ranking, score, or recommendation of which position
    should win.

## CEO Mediation vs. Founder Escalation

19. The CEO may mediate only in the same narrow sense
    `EXECUTIVE_ORCHESTRATION.md` already permits for two-party
    conflicts: clarifying which existing documentation resolves part of
    the disagreement, and identifying where genuine trade-off remains.
    Mediation never means the CEO choosing a winner among domain
    positions — `DECISION_RULES.md` Rule 4 and every sibling
    executive's "founder is always the tie-breaker" principle apply
    identically whether two or five executives disagree.
20. **CEO must not manufacture consensus.** If mediation narrows the
    apparent disagreement but a genuine difference in professional
    judgment remains after every citable fact is accounted for, that
    remaining disagreement is reported as unresolved, not smoothed into
    an apparent agreement that doesn't reflect any stakeholder's actual
    position.
21. Founder approval is mandatory wherever any one stakeholder's own
    `AUTHORITY_MATRIX.md` would already require it for that stakeholder's
    domain — a multi-party conflict does not lower the approval bar any
    single domain would already impose; if any one domain's threshold is
    crossed, founder approval is required for the whole decision, per
    `FOUNDER_APPROVAL_FLOW.md`.

## Decision Recording

22. The full comparison (positions, evidence, dimensions, unresolved
    disagreement if any) is written to `AUDIT_TRAIL.md`'s durable record
    before the founder decides, not reconstructed after the fact.
23. The founder's actual decision, once made, is recorded per
    `APPROVAL_WORKFLOW.md` / `FOUNDER_APPROVAL_FLOW.md`'s existing
    approval-capture mechanism — this file does not add a second
    decision-recording path.

## Post-Decision Review

24. Once the founder decides, the outcome is linked (same
    `conversation_id` / `correlation_id`, per `INTER_AGENT_PROTOCOL.md`'s
    Phase 13A extension) back to every stakeholder position it resolved
    or overrode, so a future review can see not just what was decided
    but what alternatives — including the preserved minority position
    — were on the table.
25. A minority position that turns out, in hindsight, to have been
    correct is not retroactively edited into the record as having been
    the majority view — `AUDIT_TRAIL.md`'s append-only discipline
    applies here exactly as it does everywhere else in SDOS.

## Relationship to `DECISION_FRAMEWORK.md`

- Every individual stakeholder-pair comparison inside a multi-party
  conflict still uses `DECISION_FRAMEWORK.md`'s four dimensions
  unchanged — this file adds the aggregation and minority-preservation
  layer on top, it does not replace the underlying comparison tool.
- `DECISION_FRAMEWORK.md`'s own scope limits ("only when a real
  conflict exists," "does not assign a numeric score," "does not apply
  to single-domain decisions") apply identically here.

## Dependencies

- `DECISION_FRAMEWORK.md` (the pairwise comparison tool this file
  extends to three-or-more parties)
- `EXECUTIVE_ORCHESTRATION.md` Pattern 3 (the two-party case this
  generalizes)
- `DECISION_RULES.md` (general CEO reasoning discipline, unchanged)
- Each executive's own `AUTHORITY_MATRIX.md` and `AUTHORITY_STANDARD.md`
  (founder-approval thresholds, unchanged)
- `AUDIT_TRAIL.md`, `FOUNDER_APPROVAL_FLOW.md`, `APPROVAL_WORKFLOW.md`
  (decision recording, unchanged)
- `INTER_AGENT_PROTOCOL.md`'s Phase 13A extension (conversation
  traceability across the multi-party exchange)

## Relationship to the Rest of SDOS

- Sits directly on top of `DECISION_FRAMEWORK.md`, the same way that
  file sits on top of `DECISION_RULES.md`.
- Is the CEO-layer counterpart to `EVENT_CATALOG.md`'s
  `revenue.anomaly` / `cashflow.risk` / `support.escalation` entries,
  several of which name this file as their expected escalation path
  when the underlying cause is contested across more than two domains.
