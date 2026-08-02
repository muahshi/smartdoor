# Context Schema

## Status

SDOS Phase 11. **Extension, not a duplicate.**
`ai/core/context/CONTEXT_LOADING.md` (Phase 9) already fully specifies
the *process* of assembling context — the six-step load order,
precedence rule, and four governing rules. What it does not specify
(and what this file adds) is the *object shape* of the assembled
result a runtime actually hands to an executive's reasoning step.
Architecture and contract only; no context has ever been assembled.

## Purpose

Define the shape of an **Assembled Context**: the concrete, in-memory
(or equivalent) structure `CONTEXT_LOADING.md`'s six load steps produce
together, so a future runtime implementation has one object to build
and an executive's reasoning step has one object to consume.

## Responsibilities

- Give `CONTEXT_LOADING.md`'s load order a concrete output shape.
- Make the precedence rule (`CONTEXT_LOADING.md`: live data > Company
  Brain > role playbooks > standards) checkable against an actual
  field, not just a documented ordering.

## Inputs

The six load steps in `ai/core/context/CONTEXT_LOADING.md`, for one
specific executive and one specific task/turn.

## Outputs — Assembled Context Shape

```
AssembledContext:
  executive:            string    # role_id this context was assembled for
  session_id:            string
  task_id:               string    # null if triggered by an event rather than a task
  standards:              list      # resolved core/standards/ files loaded (step 1)
  role_definition:         object    # the executive's own folder content loaded (step 2)
  company_brain:           list      # ai/knowledge/ files loaded, with source path (step 3)
  cross_executive_input:    list      # populated only for CEO-pattern turns (step 4), else empty
  live_data:              list      # populated only once ai/integrations/ exists (step 5); empty in this phase
  memory:                 list      # populated only once ai/memory/ exists (step 6); empty in this phase
  conflicts_flagged:        list      # any precedence-rule disagreements surfaced, per CONTEXT_LOADING.md Rule 1
  assembled_at:            datetime
```

## Validation Rules

1. **Every field from a step that did not run is empty, never
   omitted or null-by-absence.** An `AssembledContext` for a non-CEO
   turn has `cross_executive_input: []`, not a missing key — so a
   future consumer can always check "did this context include X" the
   same way regardless of executive.
2. **`conflicts_flagged` is populated whenever
   `CONTEXT_LOADING.md` Rule 1 fires** — a conflict between two loaded
   sources is never silently absorbed into whichever field loaded
   later; it must appear here as its own entry.
3. **`live_data` and `memory` remaining empty is not itself an
   error** in this phase, since `ai/integrations/` and `ai/memory/`'s
   storage mechanism don't exist yet — but a task whose resolution
   *genuinely requires* either is still a `CONTEXT_ERROR` /
   `INTEGRATION_ERROR` per `ERROR_HANDLING.md`, regardless of what this
   shape allows structurally.

## Failure Modes

- A context load that cannot complete any of the required steps
  (1–3, always; 4 for CEO-pattern turns) never produces a partial
  `AssembledContext` — per `CONTEXT_LOADING.md` Rule 3 ("no context
  load silently substitutes missing data"), the whole load fails as a
  `CONTEXT_ERROR`, and no `AssembledContext` object is returned at all.

## Dependencies

- `ai/core/context/CONTEXT_LOADING.md` (authoritative — the process
  this schema is the output shape of)
- `ai/core/session/SESSION_MODEL.md`, `ai/core/tasks/TASK_MODEL.md`
  (the `session_id`/`task_id` this shape carries)
- `ai/core/runtime/ERROR_HANDLING.md` (`CONTEXT_ERROR`,
  `INTEGRATION_ERROR`)

## Future Implementation Notes

Once `ai/integrations/` and `ai/memory/` exist, `live_data` and
`memory`'s own internal shapes should be defined by those
implementation phases directly (following whatever
`DATA_CONTRACTS.md` and `MEMORY_SCHEMA.md`, respectively, specify by
then) — this file only reserves their place in the overall envelope,
it does not pre-design their internals.

## Relationship to the Rest of SDOS

- Is the concrete object `CONTEXT_LOADING.md`'s six-step process is
  expected to produce — extends that file, does not replace it.
- Feeds the `ACTIVE` state in `ai/core/runtime/AGENT_LIFECYCLE.md`.
