# Founder Approval Flow

## Status

SDOS Phase 11. Genuinely new, built directly on
`APPROVAL_WORKFLOW.md`'s mechanical contract. No phase before this one
specifies the founder-facing side of an approval: how the founder is
notified, what they see, and how their decision gets back into the
system.

## Purpose

Define the human-facing flow around `APPROVAL_WORKFLOW.md`'s
`ApprovalRequest` object — what a founder needs to see to make an
informed approve/decline decision, and how that decision is captured,
without inventing any new authorization logic (that remains
`PERMISSION_MODEL.md`'s and `AUTHORITY_STANDARD.md`'s exclusively).

## Responsibilities

- Define the minimum information a founder must see before deciding.
- Define that a decision, once made, is final and attributable.
- Remain a presentation/capture layer only — this file has zero
  authority-granting logic of its own.

## Inputs

An `ApprovalRequest` (`APPROVAL_WORKFLOW.md`) in `PENDING` state.

## Outputs

A founder-readable presentation of that request, and, once decided, an
updated `ApprovalRequest` with `decision`, `decided_at`, and optionally
`decision_note` populated.

## Minimum Information Shown to the Founder

1. **What is being proposed** (`proposed_action`), in plain language —
   per `core/standards/REPORT_STANDARD.md`'s founder-facing clarity
   bar, not raw internal identifiers alone.
2. **Which rule triggered the approval requirement**
   (`rule_cited`) — so the founder can see *why* this needs their
   input, not just that it does.
3. **Which executive is requesting it**, and the session/task context
   it belongs to, so a founder can trace it back to
   `ai/dashboard/`'s (future) session view if they want more detail.
4. **Any cross-executive input already gathered** — if the request
   followed one or more `Message` exchanges
   (`MESSAGE_SCHEMA.md`/`INTER_AGENT_PROTOCOL.md`) before reaching
   `AWAITING_APPROVAL`, those are surfaced too, not hidden behind the
   final proposal alone.

## Validation Rules

1. **A decision is captured exactly once and is immutable
   thereafter** — restated from `APPROVAL_WORKFLOW.md` Rule 4, this
   file's founder-facing UI (whenever built) must not allow a
   "re-decide" action on an already-`APPROVED`/`DECLINED` request; a
   changed mind on a resolved matter is a new, distinct approval
   request for a new proposed action.
2. **No batch/blanket approval mechanism exists in this phase.** Each
   `ApprovalRequest` is presented and decided individually — a future
   phase may let a founder pre-approve a *class* of action explicitly
   (`PERMISSION_MODEL.md` Rule 3 already anticipates this), but that
   would itself be recorded as a new rule in `AUTHORITY_STANDARD.md` or
   a role's own matrix, not a shortcut invented in this flow.
3. **The founder is the only party this flow presents requests to.**
   No executive reviews or pre-filters another executive's pending
   approval before the founder sees it — that would functionally grant
   the reviewing executive a veto or gate `AUTHORITY_STANDARD.md`
   reserves for the founder alone.

## Failure Modes

- A request the founder never sees (e.g. a notification delivery
  failure in a future implementation) leaves the `ApprovalRequest`
  correctly `PENDING`, per `APPROVAL_WORKFLOW.md` Rule 4 — a delivery
  failure is an `error.raised` event, not a reason to assume implicit
  approval or decline.
- A malformed or incomplete presentation (missing `rule_cited`, e.g.)
  is a `CONTEXT_ERROR`-adjacent defect in a future implementation, not
  something the founder is expected to approve around.

## Dependencies

- `APPROVAL_WORKFLOW.md` (this folder — the mechanical contract this
  flow presents)
- `core/standards/REPORT_STANDARD.md` (via
  `ai/core/standards/README.md` — founder-facing clarity conventions)
- `core/standards/AUTHORITY_STANDARD.md` (the founder-as-sole-decider
  principle this flow implements, never redefines)
- A future `ai/dashboard/` (not built in this phase) as the eventual
  presentation surface

## Future Implementation Notes

No specific notification channel (push, email, in-app) or UI is chosen
in this phase — that is `ai/dashboard/`'s eventual implementation
decision, once that folder is built (it remains empty as of this
phase, per `ai/core/README.md`'s own subfolder table referencing it
only as a future consumer).

## Relationship to the Rest of SDOS

- The human-facing layer over `APPROVAL_WORKFLOW.md`'s mechanical
  contract — every rule here is downstream of, and subordinate to,
  that file and, ultimately, `AUTHORITY_STANDARD.md`.
