# Task Model

The contract for the unit of work a future runtime routes to an
executive. No task has ever existed in SDOS; this is its first
specification.

## Status

Architecture and contract only.

## Task Object Shape

```
Task:
  task_id:          string
  requested_by:     string    # "founder" or an executive's role_id (cross-executive request)
  target_executive:  string    # a role_id, or null if not yet routed
  domain_hint:       string    # free text — what the requester believes this is about
  status:            enum      # see Lifecycle States
  priority:          enum      # low | medium | high — maps to Decision Standard Rule 8's confidence-bar tiers
  session_id:        string    # the session this task belongs to
  created_at:        datetime
  resolved_at:       datetime  # null until resolved
  escalation_ref:     string    # populated only if the task's resolution required founder approval or hit ESCALATION_MATRIX.md
```

## Lifecycle States

| State | Meaning | Entered from | Exits to |
|---|---|---|---|
| `CREATED` | Task exists; not yet routed | (task creation) | `ROUTED` |
| `ROUTED` | Router (`TASK_ROUTING.md`) has assigned a `target_executive` | `CREATED` | `IN_PROGRESS` or `UNROUTABLE` |
| `UNROUTABLE` | No executive's domain matches; see `TASK_ROUTING.md`'s `ROUTING_ERROR` | `ROUTED` (routing attempt) | `ESCALATED` |
| `IN_PROGRESS` | Target executive's instance is `ACTIVE` (`AGENT_LIFECYCLE.md`) working the task | `ROUTED` | `AWAITING_APPROVAL`, `RESOLVED`, or `ESCALATED` |
| `AWAITING_APPROVAL` | Task's proposed resolution needs founder sign-off | `IN_PROGRESS` | `RESOLVED` (approved) or `ESCALATED` (declined, needs rework) |
| `ESCALATED` | Routed to the founder directly — either unroutable, ambiguous, or declined | `UNROUTABLE`, `IN_PROGRESS`, `AWAITING_APPROVAL` | `RESOLVED` (founder decides) |
| `RESOLVED` | Task is complete | `IN_PROGRESS`, `AWAITING_APPROVAL`, `ESCALATED` | (terminal) |

## Rules

1. **A task is never silently dropped.** Every task reaches `RESOLVED`
   or remains visibly `ESCALATED` — there is no "quietly expired" state,
   per Decision Standard Rule 4 (ambiguity is escalated, never guessed
   past).
2. **`priority` does not grant authority.** A `high`-priority task still
   passes every permission check in `PERMISSION_MODEL.md` — urgency
   never substitutes for founder approval where one is required (this
   mirrors Decision Standard Rule 10's "never softened by... urgency
   framing" for roles that have that rule, generalized to the task
   model itself).
3. **Cross-executive tasks follow the CEO pattern.** A task whose
   resolution genuinely needs more than one executive's domain is not
   force-fit into a single `target_executive` — it follows
   `ai/executives/ceo/DECISION_FRAMEWORK.md`'s existing conflict-handling
   contract once a CEO instance exists to apply it.
4. **Every state transition is an event**, per `EVENT_BUS.md`'s
   `task.created` / `task.assigned` / `task.resolved` types.

## Relationship to the Rest of SDOS

- Consumed by `ai/core/router/TASK_ROUTING.md` to determine
  `target_executive`.
- Drives an executive instance's `ACTIVE` state in
  `ai/core/runtime/AGENT_LIFECYCLE.md`.
- `AWAITING_APPROVAL` and `ESCALATED` are the task-level expression of
  `ai/core/permissions/PERMISSION_MODEL.md` and each executive's own
  `AUTHORITY_MATRIX.md` / `ESCALATION_MATRIX.md`.
