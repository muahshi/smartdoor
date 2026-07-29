# Decision Framework

The structured rubric the AI CEO applies when two or more sibling
executives' recommendations genuinely conflict (`EXECUTIVE_ORCHESTRATION.md`
Pattern 3). Distinct from `DECISION_RULES.md`, which is the CEO's general
reasoning discipline — this file is one specific tool that discipline
calls on (per `DECISION_RULES.md` Rule 8) when a trade-off needs to be
laid out structurally rather than argued informally.

## When to Use This Framework

Only when a real conflict exists — two sibling executives' own,
already-cited documentation would lead to opposite advice on the same
question. Not for every cross-domain briefing; most briefings
(`EXECUTIVE_BRIEFING_GUIDE.md`) find alignment or a simple gap, not a
conflict, and forcing this framework onto those cases would manufacture
false tension.

## The Four Dimensions

For each side of the conflict, state:

### 1. What Is at Stake

What actually changes depending on which way this goes — cite the
specific consequence from the relevant executive's own documentation
(e.g. "CTO's `RISK_FRAMEWORK.md` flags this as touching the same
webhook path as the confirmed 409-retry bug" vs. "CMO's `CAMPAIGN_GUIDE.md`
notes this month's paid-ads calendar is already committed").

### 2. Reversibility

Is this a decision that can be undone cheaply if it turns out wrong, or
a one-way door? A pricing change (CFO domain) and a schema change (CTO
domain) are not equally reversible — say so explicitly rather than
treating every conflict as equally weighty.

### 3. Who Bears the Cost of Being Wrong

Which domain absorbs the consequence if this goes badly — the answer is
not always the domain that raised the concern. A CTO-flagged technical
risk that goes wrong might cost the COO an operational incident
(`coo/INTER_EXECUTIVE_COMMUNICATION.md`'s COO↔CTO handoff pattern is the
existing precedent for this kind of cross-domain consequence).

### 4. What Existing Documentation Already Resolves vs. What's Genuinely Novel

Check whether any sibling executive's own `DECISION_RULES.md` or
`AUTHORITY_MATRIX.md` already implies an answer (e.g. if the conflict
touches something in a founder-approval-required table, the "conflict"
is actually already resolved — it goes to the founder regardless of
which domain argument is stronger). Only genuinely unresolved
trade-offs need the full four-dimension treatment.

## Output Shape

State each side's answer to all four dimensions side by side, then stop
— this framework produces a structured comparison for the founder to
decide from, never a CEO-generated final answer. Per `DECISION_RULES.md`
Rule 10, the output is never framed as if the decision has already been
made.

## What This Framework Does Not Do

- Does not assign a numeric score or weighted average across domains —
  that would manufacture false precision out of qualitative,
  domain-specific concerns that don't share a common unit.
- Does not resolve founder-approval-required matters faster than the
  founder actually deciding — it only makes the trade-off legible.
- Does not apply to single-domain decisions — those stay inside the
  relevant sibling executive's own `DECISION_RULES.md`.
