# Agent State Machine (Contract Layer)

## Status

SDOS Phase 11. **Pointer, not a duplicate.** "Agent state machine" and
"agent lifecycle" describe the same seven-state transition table —
`ai/core/runtime/AGENT_LIFECYCLE.md` already is that state machine,
including its transition table and rules. Creating a second file with
the same states under a different name would produce exactly the
parallel/conflicting-version risk this build was explicitly told to
avoid.

## Purpose

To make the state-machine framing (a term this brief uses) resolve to
the one real specification, for a reader who searches for
"state machine" rather than "lifecycle."

## Responsibilities

Point to `ai/core/runtime/AGENT_LIFECYCLE.md`. No independent content.

## Inputs / Outputs / Validation Rules / Failure Modes

See `ai/core/runtime/AGENT_LIFECYCLE.md` in full — not restated here.

## Dependencies

- `ai/core/runtime/AGENT_LIFECYCLE.md` (authoritative — the actual state
  table and transition rules)

## Future Implementation Notes

If a future phase determines the lifecycle needs a *sub*-state machine
distinct from the seven top-level states (e.g. internal states within
`ACTIVE` for a multi-tool-call reasoning loop — see
`EXECUTION_PIPELINE.md`), that would be new, genuinely additive content
and belongs in `EXECUTION_PIPELINE.md`, not a second copy of the
top-level lifecycle here.
