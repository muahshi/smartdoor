# Logging Strategy

What a future runtime implementation must record, where, and in what
shape, so every executive's activity stays observable per
`ai/docs/SDOS_ARCHITECTURE.md`'s Design Principle 4 ("Observable by
default").

## Status

Architecture only. Nothing is logged today, because nothing runs today.

## What Must Be Logged

| Event | Minimum fields |
|---|---|
| Lifecycle transition (`AGENT_LIFECYCLE.md`) | timestamp, executive, session id, from-state, to-state |
| Task created / routed / resolved (`TASK_MODEL.md`, `TASK_ROUTING.md`) | timestamp, task id, requester, target executive, status |
| Event emitted (`EVENT_BUS.md`) | timestamp, event type, source, correlation id |
| Permission check (`PERMISSION_MODEL.md`) | timestamp, executive, action requested, outcome (allowed / `AWAITING_APPROVAL` / denied), rule cited |
| Any error (`ERROR_HANDLING.md`) | timestamp, error class, executive/task/session involved, human-readable reason |
| Founder approval / decline | timestamp, what was approved/declined, who recorded it |

## What Must Never Be Logged

- SmartDoor's actual customer/business data (owner names, phone numbers,
  PINs, payment details) — logs record *that* an executive read
  something via `ai/integrations/`, never the data itself, once that
  layer exists.
- Secrets, API keys, or credentials of any kind.
- Anything that would let a log substitute for `ai/memory/`'s intended
  role — logs are an operational/audit trail; `ai/memory/` (not built
  in this phase) is the intended home for durable decision history.

## Shape

Logs are structured (not free-text) so they are machine-readable for a
future `ai/dashboard/` view, at minimum: `timestamp`, `session_id`,
`executive` (nullable, for runtime-only events like registry
validation), `event_class`, `payload` (event-class-specific, following
each field table above). No specific storage format (flat file vs.
Supabase table vs. something else) is chosen in this phase — per
`ai/memory/README.md`'s own note that "this may end up being a Supabase
table... deferred to a later phase," this file inherits the same
deferral for the same reason: choosing a storage backend before any
component that would write to it exists risks designing around the
wrong constraints.

## Rules

1. **Every log entry is attributable to a session** (`SESSION_MODEL.md`)
   — no orphaned, session-less log lines, so a founder reviewing
   `ai/dashboard/` (future) can always reconstruct "what happened during
   this run" as one coherent unit.
2. **Logging failures never silently swallow the underlying operation's
   own error.** If logging itself fails, the original error/event is
   still surfaced per `ERROR_HANDLING.md` — logging is an observability
   concern, not a gate on correctness.
3. **No log is a substitute for an event.** Anything logged that other
   components need to react to must also be emitted on the event bus
   (`EVENT_BUS.md`) — logging is write-only/for-humans; events are the
   mechanism other runtime components actually consume.

## Relationship to the Rest of SDOS

- Directly implements `ai/docs/SDOS_ARCHITECTURE.md` Design Principle 4.
- Feeds a future `ai/dashboard/` view (not built in this phase) and,
  eventually, `ai/memory/`'s decision-log concept, without being
  identical to either.
