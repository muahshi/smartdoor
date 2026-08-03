# Memory Loader

## Status

SDOS Phase 12. Genuinely new. `MEMORY_SCHEMA.md` (Phase 11) defines the
`MemoryRecord` shape but has no reader — `CONTEXT_SCHEMA.md`'s own
`memory` field is documented as "populated only once `ai/memory/`
exists" and is empty today. This file specifies how that field would
be populated, once it exists, ahead of a Groq call.

## Purpose

Define how a bounded, relevant subset of an executive's prior
`MemoryRecord`s would be selected and handed to `CONTEXT_BUILDER.md` —
never the entire memory history, and never a raw dump of every past
session.

## Inputs

The executive's `role_id`, the current `task_id` (if any, per
`TASK_MODEL.md`), and the full set of that executive's non-superseded
`MemoryRecord`s (`MEMORY_SCHEMA.md`).

## Outputs

```
LoadedMemory:
  records:      list    # bounded subset of MemoryRecord, current (non-superseded) only
  omitted_count: integer # how many eligible records were excluded for budget reasons, never silently dropped without this count
```

## Dependencies

- `MEMORY_SCHEMA.md` (this folder's parent — the record shape this
  loader reads)
- `CONTEXT_SCHEMA.md` (the `memory` field this loader populates)
- `TOKEN_BUDGETING.md` (the budget constraining how many records fit)

## Sequence

1. Filter to records where `superseded_by` is null — only the current
   version of any decision chain is ever loaded, per `MEMORY_SCHEMA.md`
   Failure Modes' data-integrity rule.
2. Filter to the requesting executive (or `ceo` records relevant to a
   cross-executive synthesis turn).
3. Prioritize `OPEN_THREAD` records tied to the current `task_id`, then
   recency, until `TOKEN_BUDGETING.md`'s memory-section allotment is
   reached.
4. Set `omitted_count` to whatever did not fit — this count itself is
   visible to the executive's context (per `CONTEXT_BUILDER.md`'s
   conflict-surfacing precedent), not silently absent.

## Failure Modes

- A memory store that cannot be read at all (once one exists) is a
  `CONTEXT_ERROR`-adjacent case, exactly as `MEMORY_SCHEMA.md`'s own
  Failure Modes already specify — fails closed only when the current
  task genuinely requires prior continuity; otherwise the turn
  proceeds with `memory: []` and a flagged omission, per
  `CONTEXT_SCHEMA.md` Rule 3.
- Loading a superseded record instead of its current successor is a
  data-integrity bug, not an acceptable ambiguity — restated from
  `MEMORY_SCHEMA.md`.

## Security

The loader never writes to memory — write-time record creation is a
different, later step in `EXECUTION_PIPELINE.md` (step 5, result
production), out of this file's scope. This loader is read-only over
an internal SDOS store, never SmartDoor production data.

## Future Implementation Notes

No storage backend is chosen here, matching `MEMORY_SCHEMA.md`'s own
deferral. Prioritization logic (recency vs. relevance scoring) is
illustrative; a future phase may refine it once real usage patterns
exist to design against.

## Relationship to the Rest of SDOS

- Populates `CONTEXT_SCHEMA.md`'s `memory` field for
  `CONTEXT_BUILDER.md` to serialize.
- Reads exclusively from `MEMORY_SCHEMA.md`'s record shape; writes
  nothing.
