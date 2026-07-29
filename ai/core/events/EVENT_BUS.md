# Event Bus

The contract every future runtime implementation must satisfy for
recording and propagating "what happened" across SDOS's components.
Named but explicitly not built by five of the six existing executives'
own communication docs; this file is its first concrete specification.

## Status

Architecture and contract only. No publish, subscribe, or delivery
described below has ever occurred.

## Event Schema (Every Event, Regardless of Type)

```
Event:
  event_id:        string    # unique, generated at emission time
  event_type:      enum      # see Event Types below
  source:          string    # which component or executive emitted it
  session_id:      string    # ties the event to a SESSION_MODEL.md session
  correlation_id:  string    # ties related events (e.g. a task's full lifecycle) together
  timestamp:       datetime
  payload:         object    # event-type-specific; see below
```

## Event Types (This Phase's Anticipated Set)

| Type | Emitted by | Consumed by | Payload highlights |
|---|---|---|---|
| `lifecycle.transition` | Runtime (`AGENT_LIFECYCLE.md`) | Logging, future dashboard | executive, from-state, to-state |
| `task.created` / `task.assigned` / `task.resolved` | Tasks (`TASK_MODEL.md`), Router (`TASK_ROUTING.md`) | Router, logging, future dashboard | task id, target executive, status |
| `permission.checked` | Permissions (`PERMISSION_MODEL.md`) | Logging, future dashboard | action, outcome, rule cited |
| `error.raised` | Any component | Logging, future dashboard, future escalation routing | error class, context |
| `approval.requested` / `approval.decided` | Permissions, runtime | Logging, future dashboard | what was requested, founder decision |

This set covers exactly the components this phase defines. It is not
exhaustive of every event a future phase might add (e.g. an
`integration.read` event once `ai/integrations/` exists) — new event
types are additive and should follow this same schema shape rather than
inventing a new one.

## Delivery Contract (Intended, Future Behavior)

1. **At-least-once, ordered within a `correlation_id`.** Events sharing
   a correlation id (e.g. all events for one task's lifecycle) are
   delivered in emission order; events across different correlation ids
   have no ordering guarantee relative to each other.
2. **Append-only.** No event is ever mutated or deleted after emission —
   a correction is a new event referencing the original's `event_id`,
   never an edit in place. This mirrors the production SQL migration
   convention (`NAMING_STANDARD.md`: "never edited after landing")
   applied to the event log.
3. **No event is silently dropped.** A consumer failure to process an
   event is itself an `error.raised` event, not a swallowed exception.
4. **The bus has no side effects on SmartDoor's production systems.**
   Emitting or consuming an event never itself writes to Supabase,
   sends an SMS, or triggers a call — those remain exclusively
   SmartDoor's existing production paths (`services/`,
   `supabase/functions/`), which SDOS does not duplicate or trigger.

## Rules

1. **Every runtime state change described elsewhere in `ai/core/` should
   correspond to exactly one event type here** — if
   `AGENT_LIFECYCLE.md`, `TASK_MODEL.md`, or `PERMISSION_MODEL.md`
   describes a transition with no matching event type, that is a gap to
   flag, not an event to skip.
2. **Payloads never carry SmartDoor customer/business data directly** —
   per `LOGGING_STRATEGY.md`'s same rule, an event references *that*
   something was read or decided, not the underlying data itself, once
   `ai/integrations/` exists.
3. **No implementation technology is chosen in this phase** (in-process
   emitter vs. a real queue vs. a Supabase table with realtime — all
   are legitimate future options). Choosing prematurely, before any
   consuming component exists, risks the same "designed around the
   wrong constraints" problem `LOGGING_STRATEGY.md` already flags for
   its own storage choice.

## Relationship to the Rest of SDOS

- Every transition in `ai/core/runtime/AGENT_LIFECYCLE.md` is expected
  to emit a `lifecycle.transition` event.
- `TASK_MODEL.md` and `TASK_ROUTING.md` both publish and consume task
  events.
- `LOGGING_STRATEGY.md` is a consumer of every event type — logging is
  the durable, human-readable record; the bus is the live propagation
  mechanism.
