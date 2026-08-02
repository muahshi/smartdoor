# Error Handling (Contract Layer)

## Status

SDOS Phase 11. **Pointer, not a duplicate.** The full error
classification table (`REGISTRY_ERROR`, `CONTEXT_ERROR`,
`PERMISSION_ERROR`, `ROUTING_ERROR`, `EXECUTION_ERROR`,
`INTEGRATION_ERROR`), the fail-closed default, and all five governing
rules are already fully specified in
`ai/core/runtime/ERROR_HANDLING.md` (Phase 9).

## Purpose

Complete the Phase 11 contract index without restating Phase 9 work.

## Responsibilities

Point to `ai/core/runtime/ERROR_HANDLING.md` as the single source of
truth for runtime error classes and their default behavior.

## Inputs / Outputs

N/A — see the referenced file's error-class table.

## Validation Rules

N/A — see `ERROR_HANDLING.md` Rule 1 (fail closed, never fail open).

## Failure Modes

This file has none of its own — it is a pointer.

## Dependencies

- `ai/core/runtime/ERROR_HANDLING.md` (authoritative)
- This phase's genuinely new documents that reference it without
  restating it: `EXECUTION_PIPELINE.md` (a future `EXECUTION_ERROR`'s
  concrete trigger points), `AUDIT_TRAIL.md` (every error is an audited
  event), `INTER_AGENT_PROTOCOL.md` (a message delivery failure is a
  `ROUTING_ERROR`-adjacent case, not a new class)

## Future Implementation Notes

Any new error condition this phase's genuinely new contracts surface
(e.g. a malformed `Message` per `MESSAGE_SCHEMA.md`, or a missing tool
per `TOOL_REGISTRY.md`) should map to one of `ERROR_HANDLING.md`'s six
existing classes wherever it genuinely fits (most map to
`CONTEXT_ERROR` or `EXECUTION_ERROR`) rather than a new class invented
per new contract — proliferating error taxonomies is itself a form of
duplication.
