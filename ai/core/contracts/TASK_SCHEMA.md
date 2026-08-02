# Task Schema (Contract Layer)

## Status

SDOS Phase 11. **Pointer, not a duplicate.** The `Task` object shape
(`task_id`, `requested_by`, `target_executive`, `domain_hint`,
`status`, `priority`, `session_id`, `created_at`, `resolved_at`,
`escalation_ref`) and its full seven-state lifecycle
(`CREATED → ROUTED → IN_PROGRESS → ...`) are already fully specified in
`ai/core/tasks/TASK_MODEL.md` (Phase 9).

## Purpose

Complete the Phase 11 contract index without restating Phase 9 work.

## Responsibilities

Point to `ai/core/tasks/TASK_MODEL.md` as the single source of truth
for the task object and its states.

## Inputs / Outputs

N/A — see the referenced file's `Task` object shape.

## Validation Rules

N/A — see `TASK_MODEL.md` Rules 1–4, especially Rule 2: `priority`
never substitutes for a required founder approval.

## Failure Modes

An unroutable task moves to `UNROUTABLE` then `ESCALATED`
(`TASK_MODEL.md`, `ai/core/router/TASK_ROUTING.md`) — not a new
failure mode invented here.

## Dependencies

- `ai/core/tasks/TASK_MODEL.md` (authoritative)
- `ai/core/router/TASK_ROUTING.md` (consumes the task schema to set
  `target_executive`)

## Future Implementation Notes

A future implementation building task intake/storage builds directly
against `TASK_MODEL.md`'s shape. If a future phase needs task-schema
fields this brief's contract layer would add (e.g. a `tool_calls`
sub-list once `TOOL_REGISTRY.md` is implemented), that is a proposed
**extension** to `TASK_MODEL.md` itself — flagged here, not
silently added to a shadow copy — and should be raised as a founder-
level change to the existing schema, per Golden Rule 5 (flag, don't
silently resolve).
