# Agent Lifecycle (Contract Layer)

## Status

SDOS Phase 11. **Pointer, not a duplicate.** The full lifecycle state
machine (`REGISTERED → SPAWNING → ACTIVE → AWAITING_APPROVAL/EMITTING/
FAILED → RETIRED`) is already fully specified in
`ai/core/runtime/AGENT_LIFECYCLE.md` (Phase 9), including the state
table, five governing rules, and the health-check non-goal. This
document does not restate that content.

## Purpose

To let `ai/core/contracts/` serve as one complete index of every
contract a future agent runtime must satisfy, without a reader having
to already know the lifecycle lives one folder over, in `runtime/`
rather than `contracts/`.

## Responsibilities

Point to `ai/core/runtime/AGENT_LIFECYCLE.md` as the single source of
truth for lifecycle states and transitions.

## Inputs / Outputs

N/A — see the referenced file's own state table.

## Validation Rules

N/A — see `ai/core/runtime/AGENT_LIFECYCLE.md` Rules 1–5.

## Failure Modes

A `FAILED` lifecycle state routes to `ai/core/runtime/ERROR_HANDLING.md`
— see that file, not a restatement here.

## Dependencies

- `ai/core/runtime/AGENT_LIFECYCLE.md` (authoritative)
- `ai/core/session/SESSION_MODEL.md` (the container a lifecycle runs
  inside)

## Future Implementation Notes

A future runtime implementation builds directly against
`ai/core/runtime/AGENT_LIFECYCLE.md`. This contracts-folder file exists
only so the Phase 11 contract index is complete without duplicating
Phase 9's work.
