# Inter-Agent Protocol

## Status

SDOS Phase 11. Genuinely new. `ai/core/router/TASK_ROUTING.md` (Phase
9) defines how a *task* reaches an executive; every sibling executive's
own `INTER_EXECUTIVE_COMMUNICATION.md` and the CEO's
`CROSS_EXECUTIVE_COMMUNICATION.md` describe, in prose, that executives
sometimes need each other's input — but no phase before this one
specifies the actual protocol: when a message is sent, what triggers
one, and how a receiving executive is expected to behave. Architecture
and contract only; no message has ever been exchanged.

## Purpose

Define the rules governing when and how one executive instance sends a
`Message` (`MESSAGE_SCHEMA.md`) to another, so cross-executive
communication is a specified protocol rather than an implicit
assumption every executive's own documentation has carried since
Phase 2.

## Responsibilities

- Define the trigger conditions for sending a Message.
- Define the receiving executive's obligations.
- Keep this protocol strictly subordinate to `TASK_ROUTING.md`'s
  existing ownership table — it does not introduce a second way to
  decide "who handles this," only a mechanism for one executive to ask
  another for domain input mid-turn.

## Inputs

An `ACTIVE` executive instance (`AGENT_LIFECYCLE.md`) that, during its
own reasoning step, determines it needs another executive's domain
input to complete its current task — the same situation
`TASK_ROUTING.md`'s "multi-domain match" case already routes to `ceo`,
but at the sub-task, within-a-single-executive's-turn level (e.g. CTO
reasoning about a deployment risk that has a cost implication only CFO
data would clarify, without the whole task needing CEO-level
re-routing).

## Outputs

A `Message` per `MESSAGE_SCHEMA.md`, and, once implemented, the
receiving executive's `RESPONSE`.

## Protocol Rules

1. **A message is sent only within an open session
   (`SESSION_MODEL.md`).** No cross-session messaging in this phase
   (restated from `MESSAGE_SCHEMA.md` Rule 1 — not a new rule, a
   protocol-level consequence of it).
2. **Sending a message does not pause the sender's own lifecycle
   state indefinitely.** A sending executive either (a) waits for the
   `RESPONSE` within its current `ACTIVE` state if the turn's
   completion genuinely depends on it, or (b) proceeds and treats a
   late/absent response as a documented gap in its own output — an
   executive never silently blocks forever; a defined timeout (chosen
   by a future implementation phase, not this one) always applies.
3. **A message never substitutes for `TASK_ROUTING.md`'s ownership
   table.** If what's actually needed is full ownership transfer of the
   task (not just a data point), that is a re-routing decision per
   `TASK_ROUTING.md`, not a `Message` — this file governs point-to-point
   input requests only, never task reassignment.
4. **Every message obligates a receiving executive to answer within its
   own domain only.** A CFO receiving a `REQUEST` answers with
   CFO-domain information; it does not use the opportunity to also
   render a CTO-domain judgment — this mirrors `CONTEXT_LOADING.md`
   Rule 2's scope boundary applied to message responses.
5. **A genuine disagreement between two executives' responses (e.g.
   CTO and CFO giving conflicting read on the same proposed change) is
   not resolved by either executive alone.** It is escalated to `ceo`
   per `TASK_ROUTING.md`'s existing multi-domain-match handling — this
   protocol creates no new conflict-resolution mechanism of its own.

## Validation Rules

- Every `Message` sent under this protocol must validate against
  `MESSAGE_SCHEMA.md`'s object shape before it is considered sent.
- A message whose `domain_hint` doesn't correspond to the receiving
  executive's own `RESPONSIBILITIES.md` is a malformed request — the
  sender should have consulted `TASK_ROUTING.md`'s ownership table
  first.

## Failure Modes

- An unanswered `REQUEST` past its timeout is an `error.raised` event
  (`EVENT_BUS.md`) — not silently dropped, and not treated as an
  implicit "no" that changes the sender's own reasoning without
  flagging the gap.
- A message sent to a `role_id` not currently `ACTIVE` in the same
  session is a `ROUTING_ERROR`-adjacent case per
  `ai/core/runtime/ERROR_HANDLING.md`.

## Dependencies

- `MESSAGE_SCHEMA.md` (the envelope this protocol governs)
- `ai/core/router/TASK_ROUTING.md` (the ownership table this protocol
  never overrides)
- `ai/executives/ceo/DECISION_FRAMEWORK.md` (the escalation path for
  genuine cross-executive disagreement)
- `ai/core/session/SESSION_MODEL.md` (the multi-executive-capable
  container this protocol operates inside)

## Future Implementation Notes

No specific timeout duration, retry count, or transport mechanism is
chosen in this phase, for the same reason `EVENT_BUS.md` and
`LOGGING_STRATEGY.md` both defer their own implementation-technology
choices — deciding before any consuming component exists risks
designing around the wrong constraints.

## Relationship to the Rest of SDOS

- Sits directly on top of `MESSAGE_SCHEMA.md`.
- Is the concrete mechanism every sibling executive's own
  `INTER_EXECUTIVE_COMMUNICATION.md` and the CEO's
  `CROSS_EXECUTIVE_COMMUNICATION.md` already assumed exists.
- Explicitly subordinate to, never a replacement for,
  `ai/core/router/TASK_ROUTING.md`.
