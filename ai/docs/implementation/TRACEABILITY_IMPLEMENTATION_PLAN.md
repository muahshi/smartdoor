# Traceability Implementation Plan

## Status

Planning only. No founder request has ever traced through any of the
stages below, because no runtime exists to trace.

## Contract This Plan Implements

`INTER_AGENT_PROTOCOL.md`'s Phase 13A Rules 8–9 (conversation-level
traceability), `EVENT_BUS.md`'s `correlation_id` (event-level
traceability), `EXECUTION_FLOW.md`'s Phase 13A Rule 13 (audit of the
full message-triggered reasoning chain), and `AUDIT_TRAIL.md` as the
durable record every stage below ultimately writes to. None of these
are redefined below — this plan only lays out the single chain they
already imply, end to end.

## The Chain

```
Founder
  → CEO
  → Executive
  → Task
  → Message
  → Event
  → Groq reasoning
  → Response
  → Audit
```

### Founder

The originating human action — a founder-initiated session
(`SESSION_MODEL.md`) or a founder decision on a prior
`ApprovalRequest` (`APPROVAL_WORKFLOW.md`). No identifier is generated
here beyond `session_id`, since a founder action is not itself a
`Task`, `Message`, or `Event` — it is what those are eventually
rooted in.

### CEO

If the founder's request is cross-domain or ambiguous in ownership,
`TASK_ROUTING.md`'s multi-domain-match path routes it to `ceo` first.
The CEO instance's own `session_id` is the same one the founder's
action opened. A `conversation_id` is generated here if the request
will span more than one executive turn — per
`INTER_AGENT_PROTOCOL.md` Rule 8, this `conversation_id` is shared by
every `Message` in the resulting chain, however many hops it takes.

### Executive

`TASK_ROUTING.md` resolves `target_executive` (single-domain match) or
the CEO delegates per its own `DECISION_FRAMEWORK.md` /
`MULTI_PARTY_CONFLICT.md` reasoning (multi-domain). The receiving
executive instance inherits the `session_id` and, if one exists, the
`conversation_id` from the prior stage.

### Task

`TASK_MODEL.md`'s `task_id` is generated at task creation
(`task.created` event, `EVENT_BUS.md`) and is the identifier that
threads through every later `Message`'s optional `task_id` field
(`INTER_AGENT_PROTOCOL.md` Phase 13A) when the exchange exists to
support that task, distinguishing it from a standalone consultation
(`task_id: null`).

### Message

Per `MESSAGE_TRANSPORT_IMPLEMENTATION_PLAN.md`'s full lifecycle. Every
`Message` in the chain carries: `session_id` (inherited),
`conversation_id` (inherited or newly generated at CEO stage),
`task_id` (if applicable), `correlation_id` (ties this message to the
`Event`, if any, that triggered it), `sequence_number` and
`idempotency_key` (per `MESSAGE_ORDERING_IMPLEMENTATION_PLAN.md` /
`MESSAGE_DEDUP_IMPLEMENTATION_PLAN.md`).

### Event

Where the exchange was itself triggered by something happening
(rather than a direct founder request), `EVENT_BUS.md`'s
`correlation_id` is what ties the triggering `Event` to every
`Message` in the resulting chain — per `INTER_AGENT_PROTOCOL.md`
Phase 13A: "The `correlation_id` ties this chain to any `Event` that
triggered it." `event_id` (if applicable) is carried on the `Message`
per the same section's identifier list.

### Groq Reasoning

Governed in full by `EXECUTION_FLOW.md`'s Phase 13A "Inter-Agent
Message-Triggered Reasoning" section — including the case where
Context Evaluation determines reasoning is *not* required. Per that
section's own Rule 13, this decision is itself part of the auditable
chain, not a gap in it: "why didn't this trigger a model call" is as
reviewable as "what did the model call return." No new identifier is
introduced at this stage — the reasoning call, if it occurs, is
scoped to the same `session_id`/`conversation_id`/`correlation_id`
already established.

### Response

The `RESPONSE` `Message`, per `MESSAGE_SCHEMA.md`, whose
`in_reply_to` field closes the loop back to the originating
`REQUEST`'s `message_id`. Delivered through the same lifecycle as the
original message (`MESSAGE_TRANSPORT_IMPLEMENTATION_PLAN.md` step 8).

### Audit

`AUDIT_TRAIL.md`'s durable record, keyed by
`conversation_id`/`correlation_id`, is the terminal stage every prior
identifier feeds into — this is not a separate identifier scheme, it
is the retrieval key a future founder review would use to reconstruct
the whole chain shown above in one query.

## Identifiers Required at Each Stage (Summary Table)

| Stage | Identifiers present |
|---|---|
| Founder | `session_id` |
| CEO | `session_id`, `conversation_id` (if multi-hop) |
| Executive | `session_id`, `conversation_id` |
| Task | `session_id`, `conversation_id`, `task_id` |
| Message | `session_id`, `conversation_id`, `task_id` (opt.), `event_id` (opt.), `correlation_id`, `sequence_number`, `idempotency_key` |
| Event | `event_id`, `correlation_id`, `session_id` |
| Groq reasoning | (inherits Message/Task stage identifiers; none new) |
| Response | Same as Message, plus `in_reply_to` |
| Audit | Retrieval key: `conversation_id` / `correlation_id` |

## What Full Traceability Requires From a Future Implementation

1. Every stage above must persist its identifiers together, not
   reconstructible only by cross-referencing separate logs — this is
   the concrete requirement `AUDIT_TRAIL.md`'s durable-record principle
   implies once an actual runtime exists to write one.
2. No stage may drop or regenerate an inherited identifier — a
   `conversation_id` established at the CEO stage must reach every
   later `Message` in the same chain unchanged, per
   `INTER_AGENT_PROTOCOL.md` Rule 8.
3. A Context-Evaluation decision *not* to invoke Groq reasoning is
   still recorded against the same chain identifiers, per
   `EXECUTION_FLOW.md` Phase 13A Rule 13 — traceability is not only
   for chains that reach a model call.

## What This Plan Does Not Invent

- No new identifier beyond the ones `MESSAGE_SCHEMA.md`,
  `EVENT_BUS.md`, `TASK_MODEL.md`, and `INTER_AGENT_PROTOCOL.md`'s
  Phase 13A extension already define.
- No storage schema — the same deferral
  `EVENT_BUS_IMPLEMENTATION_PLAN.md` and
  `MESSAGE_DEDUP_IMPLEMENTATION_PLAN.md` already apply.

## Dependencies

- `INTER_AGENT_PROTOCOL.md` Phase 13A extension
- `EVENT_BUS.md`, `TASK_MODEL.md`, `MESSAGE_SCHEMA.md`
- `EXECUTION_FLOW.md` Phase 13A extension
- `AUDIT_TRAIL.md`
- `MESSAGE_TRANSPORT_IMPLEMENTATION_PLAN.md`,
  `MESSAGE_ORDERING_IMPLEMENTATION_PLAN.md`,
  `MESSAGE_DEDUP_IMPLEMENTATION_PLAN.md` (this folder)
