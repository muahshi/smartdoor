# Tool Selection

## Status

SDOS Phase 12. Genuinely new. `TOOL_REGISTRY.md` (Phase 11) defines
how a tool is registered and validated but not how a specific set of
tools is chosen and presented to a specific Groq call for a specific
executive's turn. This file is that selection step, feeding
`EXECUTION_PIPELINE.md` step 3 (tool-call sub-loop).

## Purpose

Bound which registered tools are actually exposed to the model on any
one call — never the full `TOOL_REGISTRY.md`, always the subset one
executive is authorized to use for the task at hand.

## Inputs

The executive's `role_id`, its `AUTHORITY_MATRIX.md`, and the full
`TOOL_REGISTRY.md`.

## Outputs

```
SelectedTools:
  tool_ids:    list   # subset of TOOL_REGISTRY.md entries
  reason:      string # why each was included (authority match) — omitted entries are not listed, per least-privilege framing (absence, not a denial list)
```

## Dependencies

- `TOOL_REGISTRY.md` (this folder's parent — the full registry this
  file filters)
- `ai/executives/<role>/AUTHORITY_MATRIX.md` (the source of truth
  `allowed_executives` must already be derivable from, per
  `TOOL_REGISTRY.md` Validation Rule 3)
- `EXECUTION_PIPELINE.md` step 3 (where a selected tool actually gets
  called)

## Sequence

1. Filter `TOOL_REGISTRY.md` to entries where the current `role_id`
   appears in `allowed_executives`.
2. Filter further to entries whose `read_only` is `true` — per
   `TOOL_REGISTRY.md` Validation Rule 2, no other kind exists to
   select from in this phase.
3. Present the filtered set to the model as the available tool/function
   set for this call.
4. Any tool-call the model proposes outside this filtered set is
   rejected before reaching `EXECUTION_PIPELINE.md` step 3(a)'s
   validation — this file's filtering and that step's validation are
   two independent checks, neither substituting for the other.

## Failure Modes

- A tool proposal from the model naming a `tool_id` not in
  `SelectedTools` is a `PERMISSION_ERROR`, never silently executed —
  restated from `EXECUTION_PIPELINE.md` step 3(a).
- An executive with zero eligible tools for a given turn is not itself
  an error — an empty `SelectedTools.tool_ids` is a valid, expected
  state for a turn that needs no tool calls at all.

## Security

This file only ever narrows `TOOL_REGISTRY.md`'s existing
`allowed_executives` list — it cannot expand a tool's audience beyond
what that registry (and the authority matrix behind it) already
documents. Consistent with `SECURITY_BOUNDARIES.md` extension 2 (a
tool is a reference, never an independent access path).

## Future Implementation Notes

No specific function-calling schema (OpenAI-style `tools` array,
Groq's own function-calling support, etc.) is chosen in this phase —
`TOOL_REGISTRY.md`'s own deferral on invocation mechanism still
applies; this file only fixes which entries would populate whatever
schema a future phase adopts.

## Relationship to the Rest of SDOS

- Narrows `TOOL_REGISTRY.md` per-turn, per-executive.
- Feeds `EXECUTION_PIPELINE.md` step 3 and `REQUEST_PIPELINE.md`'s
  outbound shape.
