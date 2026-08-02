# Memory Schema

## Status

SDOS Phase 11. Genuinely new. `ai/memory/README.md` has named its
intended purpose (decision logs, session/run summaries, continuity
between invocations) since Phase 0, but explicitly deferred any schema
or persistence mechanism ("Empty. Phase 0 defines the folder only").
This file is that schema's first specification — architecture and
contract only; nothing has ever been written to memory, because no
runtime exists to write it.

## Purpose

Define the shape of a **Memory Record**: a durable, cross-session unit
of continuity for one executive (or, for CEO-pattern synthesis, one
cross-executive decision), distinct from a `Session`
(`SESSION_MODEL.md`, which is a single bounded run and explicitly "not
memory") and distinct from a log line (`LOGGING_STRATEGY.md`, which is
an operational/audit trail, explicitly "never a substitute for
`ai/memory/`'s intended role").

## Responsibilities

- Give a future `ai/memory/` implementation one consistent record
  shape to write and read.
- Preserve `SESSION_MODEL.md`'s existing statement that a session is
  "the unit that would be persisted, not the persistence mechanism
  itself" — this file defines what persisting it actually produces.

## Inputs

A `RETIRED` executive lifecycle instance (`AGENT_LIFECYCLE.md`) whose
decision, recommendation, or escalation outcome is worth carrying into
a future session — per that file's own Rule 4 ("`RETIRED` discards
instance state, not session or memory state").

## Outputs — Memory Record Shape

```
MemoryRecord:
  memory_id:         string
  executive:          string    # role_id this record belongs to (or "ceo" for cross-executive synthesis)
  session_id:         string    # the SESSION_MODEL.md session this record was produced in
  task_id:            string    # the TASK_MODEL.md task this record resolves or informs, if any
  record_type:         enum      # DECISION | RECOMMENDATION | ESCALATION_OUTCOME | OPEN_THREAD
  summary:            string    # human-and-AI-readable, per DOCUMENTATION_STANDARD.md's honesty rules
  reference_ids:        list      # related message_ids, event_ids, or prior memory_ids
  created_at:          datetime
  superseded_by:        string    # memory_id of a later record that revises this one, null if current
```

## Validation Rules

1. **A Memory Record is never mutated after creation.** A correction or
   update is a new record whose `superseded_by` chain points back to
   it — this mirrors `EVENT_BUS.md`'s own append-only rule and the
   production SQL migration convention (`NAMING_STANDARD.md`) applied
   to durable decision history.
2. **A record must reference a real session and, where applicable, a
   real task** — it is never created detached from the run that
   produced it, so a founder reviewing memory later can always trace a
   record back to `ai/dashboard/`'s (future) session view.
3. **A record never stores SmartDoor's raw customer/business data.**
   Same rule `LOGGING_STRATEGY.md` and `EVENT_BUS.md` already apply to
   their own payloads — `summary` describes what was decided and why,
   never a copy of underlying production rows.
4. **`OPEN_THREAD` records are the mechanism for genuine continuity**
   (e.g. "CFO flagged a pricing question still awaiting founder
   input") — they are not a catch-all for anything unresolved; an
   `OPEN_THREAD` must itself resolve to a `DECISION` or
   `ESCALATION_OUTCOME` record in a future session, or remain visibly
   open, never silently forgotten.

## Failure Modes

- A memory write that fails is a `CONTEXT_ERROR`-adjacent case per
  `ai/core/runtime/ERROR_HANDLING.md` when a future context load
  (`CONTEXT_LOADING.md` step 6) genuinely requires prior continuity
  that failed to persist — fails closed, never silently proceeds as if
  no prior history existed.
- A read against a `superseded_by` record that returns the stale
  version instead of the current one is a data-integrity bug in a
  future implementation, not an acceptable ambiguity — exactly one
  record in any `superseded_by` chain is ever "current."

## Dependencies

- `ai/memory/README.md` (the folder this schema will eventually live
  under, once a storage backend is chosen)
- `ai/core/session/SESSION_MODEL.md` (every record's `session_id`)
- `ai/core/tasks/TASK_MODEL.md` (a record's optional `task_id`)
- `ai/core/context/CONTEXT_LOADING.md` step 6 (the future context-load
  step this schema would eventually feed)

## Future Implementation Notes

No storage backend (flat file, Supabase table, vector store) is chosen
in this phase — `ai/memory/README.md` itself already defers this
("this may end up being a Supabase table... deferred to a later
phase") and `LOGGING_STRATEGY.md` applies the identical deferral for
its own storage choice; this schema inherits that same discipline for
the same reason.

## Relationship to the Rest of SDOS

- Directly implements `ai/memory/README.md`'s long-deferred schema gap.
- Feeds `CONTEXT_LOADING.md` step 6 once built.
- Distinct from, and never a substitute for, `LOGGING_STRATEGY.md`
  (operational/audit trail) or `EVENT_BUS.md` (live propagation).
