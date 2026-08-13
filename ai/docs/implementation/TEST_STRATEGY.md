# Test Strategy

## Status

Planning only. No test code is written here, per the Phase 13B brief.
This document defines what a future implementation must be tested
against, derived from the contract layer's own validation and failure
mode sections — it does not invent new test criteria beyond what those
documents already imply.

## Scope

Covers the fifteen scenarios named in the Phase 13B brief. Each maps
to a specific contract rule already established, so a future test
suite has a traceable source for every assertion rather than an
arbitrary test list.

| Scenario | Traces to |
|---|---|
| Normal message | `MESSAGE_SCHEMA.md` object shape; `MESSAGE_TRANSPORT_IMPLEMENTATION_PLAN.md` full lifecycle completes Create→Audit with a matching `RESPONSE` |
| Duplicate message | `INTER_AGENT_PROTOCOL.md` Phase 13A Rule 1; original `RESPONSE` re-emitted, no reprocessing, per `MESSAGE_DEDUP_IMPLEMENTATION_PLAN.md` |
| Retry | `INTER_AGENT_PROTOCOL.md` Phase 13A Rule 7; same `idempotency_key`/`sequence_number` reused, treated as duplicate at receiver regardless of redelivery count |
| Timeout | `INTER_AGENT_PROTOCOL.md` Protocol Rule 2 + Failure Modes; unanswered `REQUEST` past timeout raises `error.raised`, never silently treated as implicit "no" |
| Expired message | `INTER_AGENT_PROTOCOL.md` Phase 13A Rule 5; raises `error.raised` with `expired_message` reason, never processed as newly sent |
| Out-of-order message | `INTER_AGENT_PROTOCOL.md` Phase 13A Rule 3; logged as non-fatal ordering anomaly, answered only if still actionable, per `MESSAGE_ORDERING_IMPLEMENTATION_PLAN.md` |
| Unauthorized message | `MESSAGE_SCHEMA.md` Rule 1 + Failure Modes; message to executive outside sender's session is `PERMISSION_ERROR`-adjacent, rejected at Authorize step |
| Malformed message | `MESSAGE_SCHEMA.md` object shape validation; rejected at Validate step, never reaches Authorize |
| Failed recipient | `INTER_AGENT_PROTOCOL.md` Failure Modes; message to a `role_id` not currently `ACTIVE` is `ROUTING_ERROR`-adjacent, rejected at Route step |
| Conflicting message | `INTER_AGENT_PROTOCOL.md` Protocol Rule 5; escalates to `ceo` per `TASK_ROUTING.md`'s multi-domain handling, never resolved by either executive alone |
| Event fan-out | `EVENT_CATALOG.md`'s "Intended recipients" / "Optional recipients" columns per event type; every intended recipient receives the event, optional recipients only when stated criteria are met |
| Correlation tracking | `TRACEABILITY_IMPLEMENTATION_PLAN.md`'s full chain; a `correlation_id` and `conversation_id` established at CEO/Founder stage must reach every later Message/Event unchanged |
| Groq reasoning failure | `EXECUTION_FLOW.md` Phase 13A Rule 7; produces a `RESPONSE` with a `Failed` status, never a silently dropped `Message`; also raises `error.raised` |
| Partial executive failure | `AGENT_LIFECYCLE.md`'s `FAILED` state (referenced by `EXECUTION_PIPELINE.md`); one executive's failure within a multi-hop chain does not silently complete the chain as if it succeeded |
| Founder approval rejection | `APPROVAL_WORKFLOW.md` Rule 2; `DECLINED` routes the instance to `RETIRED` and the task to `ESCALATED`, never a silent retry |

## Test Categories

### Contract Conformance

For each scenario above, a future test suite must assert the exact
outcome the cited contract rule specifies — not merely "no crash." A
duplicate message that is silently dropped instead of having its
original `RESPONSE` re-emitted is a contract violation even though
nothing crashed.

### Boundary Tests

Per `PRODUCTION_BOUNDARY.md`: every test scenario above must be
verifiable without touching a real SmartDoor production table, Edge
Function, or credential. A future test environment should run against
an isolated SDOS-owned table (per
`EVENT_BUS_IMPLEMENTATION_PLAN.md`'s Option E), never against
production directly, mirroring the same read-only/isolated-write
discipline `PRODUCTION_BOUNDARY.md` already documents.

### Security Tests

- A message that would grant implicit authority (per `MESSAGE_SCHEMA.md`
  Rule 3 / `SECURITY_BOUNDARIES.md` extension 1) must be provably
  rejected — the receiving executive's own `PERMISSION_MODEL.md`
  outcome for any resulting action must be unaffected by having
  received the message.
- A tool call attempted through a message-triggered reasoning path
  must still pass `TOOL_REGISTRY.md`'s `allowed_executives` and
  `input_schema` validation (`EXECUTION_FLOW.md` Phase 13A Rule 11).
- An event payload must never contain raw customer/business data
  (`EVENT_BUS.md` Rule 2, `EVENT_CATALOG.md` Rule 3) — a future test
  should assert payload shape against each event type's documented
  "Minimum payload," not just presence of a payload.

### Audit Tests

Every scenario above, regardless of outcome (including the "Groq
reasoning failure" and "founder approval rejection" cases), must
produce an `AUDIT_TRAIL.md` record — per `EXECUTION_FLOW.md` Phase
13A Rule 13, a decision *not* to invoke reasoning is itself auditable,
so a future test suite must assert audit-record presence even for
scenarios that never reach a model call.

## What This Plan Does Not Do

- Does not write test code, fixtures, or a testing framework choice —
  explicitly out of scope per the Phase 13B brief.
- Does not fix specific timeout durations, retry counts, or rate
  limits to test against — those remain deferred per
  `MESSAGE_TRANSPORT_IMPLEMENTATION_PLAN.md`'s own Retry/Timeout
  section, consistent with every contract document's identical
  deferral.

## Dependencies

Every document in `ai/docs/implementation/` plus the contract-layer
documents each scenario above traces to.
