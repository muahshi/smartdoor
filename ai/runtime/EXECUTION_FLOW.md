# Execution Flow

## Status

SDOS Phase 12. Extension, not a duplicate.
`ai/core/contracts/EXECUTION_PIPELINE.md` (Phase 11) already specifies
the five sub-steps inside `RUNTIME_ARCHITECTURE.md` step 6 (prompt
assembly, invocation, tool-call sub-loop, message sub-loop, result
production). This file is the concrete Groq-specific walkthrough of
sub-steps 1–2 (and the entry point back from sub-step 3), tying
together every other `ai/runtime/` document into one ordered sequence.
Sub-steps 4 (inter-agent messaging) and 5 (result production) are not
restated — they remain exactly as `EXECUTION_PIPELINE.md` specifies.

## Purpose

Give a future implementer one linear sequence to read, rather than
requiring them to manually stitch together eleven separate
`ai/runtime/` documents in the right order.

## Inputs

Everything `EXECUTION_PIPELINE.md` sub-step 1 already requires: a
resolved `PromptRegistryEntry` and an `AssembledContext`, for an
executive instance already in `ACTIVE` (per `AGENT_LIFECYCLE.md`) with
its permission check already passed (per `RUNTIME_ARCHITECTURE.md`
step 4).

## Outputs

A single result — `RESULT_PRODUCED` or an error — handed to
`EXECUTION_PIPELINE.md` sub-step 5 (unchanged) or
`ERROR_RECOVERY.md`.

## Dependencies

Every other document in `ai/runtime/`, plus
`ai/core/contracts/EXECUTION_PIPELINE.md`, `PROMPT_REGISTRY.md`,
`TOOL_REGISTRY.md`, `CONTEXT_SCHEMA.md`.

## Sequence

1. **Provider decision** — `AI_ROUTER.md` determines a model call is
   needed and selects Groq.
2. **Executive resolution** — `EXECUTIVE_ROUTER.md` resolves model,
   temperature, and token ceiling for the owning executive.
3. **Assembly** — `PROMPT_LOADER.md`, `CONTEXT_BUILDER.md` (reading
   `MEMORY_LOADER.md`'s output where applicable), and
   `TOOL_SELECTION.md` each produce their piece.
4. **Request** — `REQUEST_PIPELINE.md` merges all of the above,
   checked against `TOKEN_BUDGETING.md` and `RATE_LIMITING.md`.
5. **Invocation** — the (future, unspecified) network call happens.
   `CACHE_STRATEGY.md` and `PERFORMANCE_STRATEGY.md` govern whether and
   how this step is short-circuited or timed.
6. **Response** — `RESPONSE_PIPELINE.md` parses the result.
   - If a tool call is proposed: control returns to
     `EXECUTION_PIPELINE.md` sub-step 3 (its own tool-call sub-loop),
     and this flow re-enters at step 3 above once the tool result is
     available, per that sub-loop's own iteration rule.
   - If a result is produced: control passes to
     `EXECUTION_PIPELINE.md` sub-step 5, unchanged.
   - If failed: `FAILOVER_STRATEGY.md` and `ERROR_RECOVERY.md` apply.
7. **Observability** — regardless of outcome, `OBSERVABILITY.md`
   records usage/latency/outcome metadata.

## Failure Modes

Each numbered step's own document is authoritative for its failure
modes; this file does not introduce a new error class, only the
ordering in which existing ones can occur.

## Security

This file grants no authority and adds no access path of its own — it
is purely a sequencing document over documents that each already carry
their own security constraints.

## Future Implementation Notes

The re-entry at step 6→3 (tool-call loop) should be bounded by a
maximum-iteration count in a future implementation, to prevent an
unbounded tool-call cycle — no such count is fixed in this phase, since
`EXECUTION_PIPELINE.md` itself does not fix one either and this file
does not invent a constraint that document doesn't already impose.

## Relationship to the Rest of SDOS

- The single ordered index over every other `ai/runtime/` document.
- Extends `EXECUTION_PIPELINE.md` sub-steps 1–3 specifically for the
  Groq case; sub-steps 4–5 remain that file's own, unchanged.
