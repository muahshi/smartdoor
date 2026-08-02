# Message Schema

## Status

SDOS Phase 11 (Agent Runtime Contracts). Genuinely new — no prior
phase defines a directed, one-to-one agent-to-agent message shape.
Architecture and contract only; no message has ever been sent, because
no runtime exists to send one.

## Purpose

Define the shape of a **Message**: a directed request or response
between two specific executive instances within the same session
(e.g. CEO requesting CFO's current unit-economics view during a
synthesis turn, per `ai/executives/ceo/CROSS_EXECUTIVE_COMMUNICATION.md`'s
existing prose contract). A Message is distinct from an `Event`
(`ai/core/events/EVENT_BUS.md`), which is a broadcast, one-to-many
"what happened" record; and distinct from a `Task`
(`ai/core/tasks/TASK_MODEL.md`), which is a unit of outstanding work,
not a single directed exchange.

## Responsibilities

- Give every future agent-to-agent exchange one consistent envelope.
- Make cross-executive communication (already assumed by five
  executives' own `INTER_EXECUTIVE_COMMUNICATION.md` files and the
  CEO's `CROSS_EXECUTIVE_COMMUNICATION.md`) mechanically specifiable,
  not just prose-described.

## Inputs

A sending executive instance, in `ACTIVE` state
(`ai/core/runtime/AGENT_LIFECYCLE.md`), that needs another executive's
input within the same session.

## Outputs — Message Object Shape

```
Message:
  message_id:       string    # unique, generated at send time
  session_id:        string    # must match SESSION_MODEL.md's session both executives share
  correlation_id:     string    # ties a request to its response
  from_executive:      string    # role_id
  to_executive:        string    # role_id
  message_type:        enum      # REQUEST | RESPONSE | NOTIFY
  domain_hint:         string    # what this message concerns, e.g. "unit_economics_snapshot"
  payload:             object    # message_type-specific; never raw SmartDoor customer data (see LOGGING_STRATEGY.md's same rule)
  in_reply_to:          string    # message_id, populated only for RESPONSE
  timestamp:           datetime
```

## Validation Rules

1. **Both executives must share a session.** A Message cannot be sent
   to an executive instance outside the sender's own
   `SESSION_MODEL.md` session — cross-session messaging does not exist
   in this phase (a future phase would need to define it explicitly,
   not have it fall out implicitly from this schema).
2. **A `REQUEST` must eventually resolve to a `RESPONSE` or a
   documented timeout.** A future implementation must not leave a
   `REQUEST` unanswered silently — an unanswered request after a
   defined timeout is an `error.raised` event
   (`ai/core/events/EVENT_BUS.md`), same as any other stuck operation.
3. **A message never grants authority.** Receiving a `REQUEST` from
   another executive does not change the receiving executive's own
   `PERMISSION_MODEL.md` outcome for any action it takes in response —
   this mirrors `SESSION_MODEL.md` Rule 4 ("a session never grants
   authority") applied to the message layer.
4. **`NOTIFY` messages require no response** and are the message-layer
   equivalent of a targeted (not broadcast) heads-up — e.g. CFO
   notifying CTO that a pricing change is about to touch a
   subscription table CTO owns migrations for.

## Failure Modes

- A message to an executive not in the same session is a
  `PERMISSION_ERROR`-adjacent case per
  `ai/core/runtime/ERROR_HANDLING.md` — treated as `AWAITING_APPROVAL`
  or rejected outright by a future implementation, never silently
  delivered cross-session.
- A `RESPONSE` whose `in_reply_to` does not match any prior `REQUEST`'s
  `message_id` is malformed and is dropped with an `error.raised` event,
  never guessed into a best-fit match.

## Dependencies

- `ai/core/session/SESSION_MODEL.md` (both executives must share a
  session)
- `ai/core/events/EVENT_BUS.md` (a message send/receive is expected to
  emit a corresponding event once the bus is implemented — see
  `EVENT_SCHEMA.md`'s relationship note)
- `ai/executives/ceo/CROSS_EXECUTIVE_COMMUNICATION.md` and every
  sibling executive's `INTER_EXECUTIVE_COMMUNICATION.md` (the existing
  prose contract this schema mechanizes)
- `INTER_AGENT_PROTOCOL.md` (this folder — the delivery/dispatch rules
  built on top of this schema)

## Future Implementation Notes

No transport (in-process call, queue, Supabase realtime channel) is
chosen in this phase — same deferral `EVENT_BUS.md` already applies to
its own delivery mechanism, for the same reason (choosing before any
consuming component exists risks designing around the wrong
constraints).

## Relationship to the Rest of SDOS

- A Message and an Event are not interchangeable: a `REQUEST`/`RESPONSE`
  pair is a private exchange between two executives; the `event.raised`
  side effects of that exchange (that it happened, not its payload) are
  what the Event Bus (`EVENT_BUS.md`) is expected to record.
- `INTER_AGENT_PROTOCOL.md` defines *when* and *why* a message is sent
  (the protocol); this file defines only its *shape*.
