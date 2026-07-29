# Session Model

The contract for the container a turn (or a related set of turns, e.g.
a CEO synthesis reading CTO and CFO context) runs inside. No session has
ever existed in SDOS; this is its first specification.

## Status

Architecture and contract only.

## Session Object Shape

```
Session:
  session_id:        string
  opened_by:         string    # "founder" or the triggering executive/workflow
  participants:       list      # role_ids of every executive instance that ran within this session
  opened_at:          datetime
  closed_at:          datetime  # null while open
  status:             enum      # OPEN | CLOSED
  task_ids:           list      # every TASK_MODEL.md task created or touched in this session
```

## What a Session Is (and Is Not)

A session is a single bounded, human-observable "run" — e.g. one
founder question that spawns a CTO turn, or one CEO synthesis that
reads two sibling executives' context. It is:

- **Bounded** — it opens for a specific reason and closes when that
  reason is resolved (a task reaches `RESOLVED`/`ESCALATED`, or the
  founder ends the interaction).
- **Multi-executive-capable** — one session may contain more than one
  executive's lifecycle (`AGENT_LIFECYCLE.md`), which is exactly the
  CEO's cross-domain synthesis pattern already documented in
  `ai/executives/ceo/EXECUTIVE_ORCHESTRATION.md`.
- **Not memory.** A session's content does not automatically persist
  into the next session — that is `ai/memory/`'s eventual, separate
  responsibility (not built in this phase). A session is the *unit that
  would be persisted*, not the persistence mechanism itself.
- **Not a lifecycle.** An individual executive instance's `SPAWNING` →
  `RETIRED` states happen inside a session; the session itself has only
  the two coarser states below.

## Session States

| State | Meaning | Exits to |
|---|---|---|
| `OPEN` | At least one executive lifecycle may still start or be in progress within it | `CLOSED` |
| `CLOSED` | All lifecycles within it have reached `RETIRED`; no new lifecycle may attach | (terminal) |

## Rules

1. **Every executive lifecycle belongs to exactly one session.** No
   `AGENT_LIFECYCLE.md` instance runs session-less — this is what makes
   `LOGGING_STRATEGY.md` Rule 1 ("every log entry is attributable to a
   session") satisfiable.
2. **A closed session cannot be reopened.** A follow-up interaction is a
   new session, even if it references the prior one's `task_ids` for
   continuity (once `ai/memory/` exists to supply that continuity).
3. **A session is observable in real time (future capability).**
   `ai/dashboard/`'s eventual role is to render open and recent sessions
   for the founder — no such view exists in this phase.
4. **A session never grants authority.** Being a `participant` in a
   session does not change what an executive may do — that remains
   governed entirely by `ai/core/permissions/PERMISSION_MODEL.md` and
   each role's own `AUTHORITY_MATRIX.md`.

## Relationship to the Rest of SDOS

- Every `Task` in `TASK_MODEL.md` carries a `session_id`.
- Every `Event` in `EVENT_BUS.md` carries a `session_id`.
- Feeds a future `ai/dashboard/` view and a future `ai/memory/`
  persistence mechanism — neither exists yet.
