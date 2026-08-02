# Tool Registry

## Status

SDOS Phase 11. Genuinely new. `ai/integrations/INTEGRATION_REGISTRY.md`
(Phase 10) indexes eight future *data-access* boundary points
(read-only, per-vendor); no phase before this one defines a **tool** —
a discrete, named, invokable capability an executive's reasoning step
could call mid-turn (e.g. "look up this order's status," "compute this
month's MRR"). Architecture and contract only; no tool has ever been
registered or invoked.

## Purpose

Define the registry that indexes future tools an executive may invoke
during its `ACTIVE` reasoning step, and the mechanical contract
between a tool call and `ai/integrations/`'s existing read-only
boundary — a tool is never an independent access path; it is always a
named wrapper around exactly one `ai/integrations/` capability (or, for
a non-data tool like a calculation, a pure function with no external
access at all).

## Responsibilities

- Give every future tool one consistent registration and invocation
  shape.
- Enforce that no tool registration bypasses
  `SECURITY_BOUNDARIES.md`'s extension 2 (a tool is a reference to an
  integration capability, never a new access path).

## Inputs

A future `ai/integrations/` capability (per that folder's own
per-vendor README, e.g. `ai/integrations/supabase/README.md`) or a
pure-computation need with no external access, proposed for direct
invocation by an executive's reasoning step.

## Outputs — Tool Registry Entry Shape

```
ToolRegistryEntry:
  tool_id:              string    # e.g. "supabase.read_order_status"
  tool_type:              enum      # INTEGRATION_WRAPPER | PURE_COMPUTATION
  integration_ref:         string    # e.g. "ai/integrations/supabase/README.md" — required if tool_type is INTEGRATION_WRAPPER, null otherwise
  input_schema:           object    # what an executive must supply to call this tool
  output_schema:          object    # what the tool returns
  allowed_executives:       list      # role_ids permitted to invoke this tool, per their own AUTHORITY_MATRIX.md
  read_only:              boolean   # must be true for any INTEGRATION_WRAPPER tool in this phase, per READONLY_INTEGRATION_POLICY.md
  status:                 enum      # "documented" (this phase) | "runtime_ready" (future)
```

## Validation Rules

1. **Every `INTEGRATION_WRAPPER` tool must cite a real
   `integration_ref`** — a tool cannot be registered against an
   integration that doesn't exist in `INTEGRATION_REGISTRY.md`.
2. **`read_only` must be `true` for every tool registered in this
   phase**, since `ai/integrations/`'s first (and only, as of Phase 10)
   capability is read-only — a write-capable tool cannot be registered
   until a future, separately-approved phase grants write capability
   per `READONLY_INTEGRATION_POLICY.md` rule 2.
3. **`allowed_executives` must be derivable from each listed
   executive's own `AUTHORITY_MATRIX.md`** — the registry does not
   grant a new permission; it records which executives' *existing*,
   already-documented authority covers this tool's use.
4. **A `PURE_COMPUTATION` tool never reads or writes SmartDoor data** —
   if it needs to, it is by definition an `INTEGRATION_WRAPPER`, not a
   pure computation; miscategorizing one as the other is itself a
   validation failure.

## Failure Modes

- A tool call by an executive not in `allowed_executives` is a
  `PERMISSION_ERROR` per `ai/core/runtime/ERROR_HANDLING.md` —
  `AWAITING_APPROVAL`, never silently denied or silently allowed, per
  that file's own default table.
- A tool call whose `integration_ref` has no live implementation yet
  (true of all eight integrations as of Phase 10) is an
  `INTEGRATION_ERROR` — fails closed, exactly as
  `CONTEXT_LOADING.md` step 5 already specifies for any context load
  that would require live data before it exists.

## Dependencies

- `ai/integrations/INTEGRATION_REGISTRY.md` (the data-access
  capabilities a tool may wrap)
- `ai/core/permissions/READONLY_INTEGRATION_POLICY.md` (governs rule 2
  above)
- `SECURITY_BOUNDARIES.md` (this folder — extension 2, which this
  registry is built to satisfy)
- `EXECUTION_PIPELINE.md` (this folder — where a tool call actually
  happens within a turn)

## Future Implementation Notes

No specific invocation mechanism (function-calling API, a fixed
dispatch table, etc.) is chosen in this phase. Write-capable tools are
explicitly out of scope until `READONLY_INTEGRATION_POLICY.md` rule 2's
separately-approved phase occurs.

## Relationship to the Rest of SDOS

- Every tool is either a thin wrapper over an existing
  `ai/integrations/` README's documented capability, or a pure
  computation with zero external access — there is no third category.
- Feeds `EXECUTION_PIPELINE.md`'s tool-call step.
- Constrained by `SECURITY_BOUNDARIES.md` extension 2.
