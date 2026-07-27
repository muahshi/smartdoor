# Escalation Standard

The section structure every `ai/executives/<role>/ESCALATION_MATRIX.md`
follows. COO's matrix is the original (adapting `SUPPORT_RUNBOOK.md` §2's
real escalation path); CFO's matrix explicitly adapts COO's structure to
finance. Both note the same thing this standard now states once: **this
document does not introduce a new escalation path — it applies an
existing one (or the shared severity model below) consistently within
one domain.**

## Standard Sections, in Order

1. **Opening line** — which real, already-existing escalation path or
   severity model this matrix is applying (for COO:
   `SUPPORT_RUNBOOK.md` §2; for a future role without an existing
   runbook to adapt, define the path here explicitly and say so).
2. **Severity → Routing table** — `Severity | Examples | Routes To |
   Timing`, using the shared P0–P3 scale below, populated with
   domain-specific examples.
3. **Escalate Immediately (Same Hour)** — a bulleted list of concrete,
   domain-specific triggers, each grounded in a real table/field/signal
   — never a vague "if it seems urgent."
4. **Escalate Within 24 Hours** — the same, for the next tier down.
5. **What Is NOT an Escalation** — explicit negative examples, so the
   role doesn't over-escalate; always includes the principle that a
   customer's tone or urgency is not itself a severity signal (see
   `DECISION_STANDARD.md` Rule 10).
6. **The `<Role>`'s Role at Each Level** — what the role may do at each
   rung (draft/flag/surface) vs. what only a human does (execute/decide)
   — always ends at "surfaces with full context and evidence; never
   attempts to resolve a P0/P1 itself."
7. **Cross-Reference** — which sibling executive's domain this
   escalation might also route to in parallel, and where that contract
   is defined (`COMMUNICATION_STANDARD.md` /
   `INTER_EXECUTIVE_COMMUNICATION.md`).

## Shared Severity Scale (P0–P3)

| Severity | Meaning | Routes To | Timing |
|---|---|---|---|
| P0 — Critical | Money, security, or safety at risk; production broken for a meaningful share of users | Founder, immediately | Immediately, any hour |
| P1 — High | A significant, specific-instance failure with no active data/money leak | Founder or the role's designated escalation point | Same business day |
| P2 — Medium | Degraded but workable; not urgent | Standard review | Within the week |
| P3 — Low | Cosmetic, a feature request, or a documentation drift | Backlog | Logged for review |

A role's own matrix populates this table with its real examples; it
should not need to change the four severity labels or their general
meaning, since a consistent P0–P3 scale across executives is what lets
the founder read any role's matrix without relearning a scale.

## Rules

- Every escalation trigger must be a concrete, checkable signal (a
  specific field value, a specific table pattern) — never a subjective
  description.
- SOS/safety, security, and compliance triggers are always P0 and are
  never adjustable downward by any role, per `DECISION_STANDARD.md`
  Rule 10.
- A role only needs `ESCALATION_MATRIX.md` if it has an operational,
  customer-facing, or compliance-facing escalation surface — see
  `ROLE_TEMPLATE.md`.
