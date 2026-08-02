# Approval Workflow

## Status

SDOS Phase 11. **Extension, not a duplicate.**
`ai/core/permissions/PERMISSION_MODEL.md` (Phase 9) already fully
specifies *when* a check resolves to `AWAITING_APPROVAL` and cites
`AUTHORITY_STANDARD.md`'s universal founder-approval rows. What it does
not specify — and what this file adds — is the end-to-end workflow
once that outcome is reached: how the founder is actually presented
the request, how a decision is recorded, and what happens on timeout.
Architecture and contract only; no approval has ever been requested or
granted.

## Purpose

Define the workflow an `AWAITING_APPROVAL` outcome
(`PERMISSION_MODEL.md`) or lifecycle state (`AGENT_LIFECYCLE.md`)
triggers, from the moment it's reached to the moment the instance
resumes (`ACTIVE`) or retires (`RETIRED`, declined).

## Responsibilities

- Define what a founder sees when reviewing a pending approval.
- Define how a decision (approve/decline) is recorded and propagated
  back to the waiting executive instance.
- Remain strictly downstream of `PERMISSION_MODEL.md` — this file
  never changes which actions require approval; it only defines what
  happens once one does.

## Inputs

An `AWAITING_APPROVAL` `PermissionResult` (`PERMISSION_MODEL.md`) or
task state (`TASK_MODEL.md`), carrying: the requesting executive, the
proposed action, the `rule_cited`, and the session/task it belongs to.

## Outputs — Approval Request Shape

```
ApprovalRequest:
  approval_id:          string
  session_id:            string
  task_id:               string
  executive:              string    # role_id requesting
  proposed_action:         string
  rule_cited:             string    # from PERMISSION_MODEL.md's PermissionResult
  requested_at:           datetime
  decided_at:             datetime  # null while pending
  decision:               enum      # PENDING | APPROVED | DECLINED
  decided_by:              string    # "founder" — no other party may decide, per AUTHORITY_STANDARD.md
  decision_note:           string    # optional founder rationale
```

## Validation Rules

1. **Only the founder may set `decision`.** Per every executive's own
   authority matrix and `AUTHORITY_STANDARD.md`'s universal rows, no
   executive — including CEO, whose matrix is "deliberately the
   narrowest of the six" — may approve its own or another executive's
   pending request.
2. **A `DECLINED` decision routes to `RETIRED`
   (`AGENT_LIFECYCLE.md`)**, not to a silent retry — the task itself
   moves to `ESCALATED` (`TASK_MODEL.md`), available for rework in a
   new instance/turn, never resubmitted automatically as-is.
3. **An `APPROVED` decision resumes the exact instance that requested
   it**, at the exact point it paused — per `AGENT_LIFECYCLE.md`'s own
   transition (`AWAITING_APPROVAL` → `ACTIVE`, resumes), not a fresh
   instance re-deriving the same proposal from scratch.
4. **No approval request has an implicit expiry that defaults to
   approval.** Absence of a founder decision is `PENDING` indefinitely,
   never treated as tacit approval — this is
   `AUTHORITY_STANDARD.md`'s closing rule ("no executive is ever
   granted authority by omission") applied to the workflow's own
   timeout behavior. A future implementation may define an explicit
   pending-too-long *escalation* (e.g. a reminder), but never an
   auto-approval.

## Failure Modes

- A request whose `session_id`/`task_id` no longer exists (e.g. the
  session was force-closed) is a `CONTEXT_ERROR`-adjacent case per
  `ai/core/runtime/ERROR_HANDLING.md` — the request is voided, not
  silently orphaned.
- Two conflicting decisions recorded for the same `approval_id` (a
  data-integrity bug in a future implementation, not an intended state)
  must be impossible by construction — `decided_at`/`decision` are set
  exactly once.

## Dependencies

- `ai/core/permissions/PERMISSION_MODEL.md` (the source of every
  `AWAITING_APPROVAL` outcome this workflow processes)
- `ai/core/runtime/AGENT_LIFECYCLE.md` (the `AWAITING_APPROVAL` state
  this workflow governs the exit from)
- `ai/core/tasks/TASK_MODEL.md` (the parallel `AWAITING_APPROVAL` task
  state)
- `FOUNDER_APPROVAL_FLOW.md` (this folder — the founder-facing
  presentation/notification layer built on top of this workflow)
- `core/standards/AUTHORITY_STANDARD.md` (via
  `ai/core/standards/README.md`)

## Future Implementation Notes

No specific UI, notification channel, or storage for `ApprovalRequest`
records is chosen in this phase — `FOUNDER_APPROVAL_FLOW.md` addresses
the founder-facing side of that question; the underlying persistence
mechanism follows whatever a future `ai/dashboard/` phase chooses.

## Relationship to the Rest of SDOS

- Downstream of, and never a redefinition of, `PERMISSION_MODEL.md`'s
  own rules for *when* approval is required.
- The mechanical half of what `FOUNDER_APPROVAL_FLOW.md` presents to a
  human.
