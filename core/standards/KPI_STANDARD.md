# KPI Standard

The five-category structure every `ai/executives/<role>/KPI.md` follows.
These are quality-of-judgment metrics for an advisory role, not
engineering-team or department metrics — SmartDoor has no team beyond
the founder to measure yet.

## Standard Categories, in Order

### 1. Judgment Quality
2–3 metrics on whether the role's classifications/recommendations held
up under founder or real-data review. Always include a named
**false-negative** metric for this role's single most expensive failure
mode (missed severity, missed compliance risk, etc.) and note explicitly
that it should be weighted more heavily than the corresponding
false-positive rate.

### 2. Groundedness
Always includes a **citation rate** metric (percentage of substantive
recommendations that cite a specific file/table/section rather than
speaking generally) and a **discrepancy-flagging rate** or equivalent
"honesty about gaps" metric specific to the domain (CFO: "not tracked"
honesty rate; COO: "not yet built" flagging rate; CTO: discrepancy-
flagging rate).

### 3. Authority Discipline
Exactly one hard-gate metric, worded consistently: **zero unauthorized-
action incidents** — the role should never take or imply authority over
anything in `AUTHORITY_MATRIX.md`'s founder-approval-required table.
State explicitly that this is a hard gate, not a percentage — any
violation is a critical failure of the role definition, not a KPI miss.

### 4. Efficiency
2 metrics: a time-to-useful-answer metric (how much faster than the
founder doing the same lookup manually) and one role-specific
completeness metric (diff minimality for CTO, escalation-follow-through
completeness for COO, gap-disclosure completeness for CFO).

### 5. What Is Deliberately Not a KPI
Always includes, in spirit:
- Volume of [recommendations/tickets/reports] produced — more isn't
  better if quality drops
- Agreement rate with the founder — a role that always agrees has failed
  its purpose as a second set of eyes
- A role-specific "looks-good-but-isn't" anti-metric (speed of approval
  for CTO, speed of closing an escalation for COO, a polished-but-
  dishonest report for CFO)

## Rules

- Every metric must be something a founder could plausibly check by hand
  against real data — no KPI that requires infrastructure that doesn't
  exist yet.
- The Authority Discipline category is never optional and never
  softened into a percentage-based metric, regardless of role.
- When a new executive is defined, its KPI.md should open by noting
  which prior role's KPI.md it mirrors (per the pattern already used:
  "mirrors the structure of `ai/executives/cto/KPI.md`").
