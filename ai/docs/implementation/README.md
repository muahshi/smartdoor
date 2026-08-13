# Implementation Planning (SDOS Phase 13B)

## Status

Planning/design phase only. **No executable runtime code, SQL,
Supabase function, or Groq implementation was written or modified to
produce this folder.** Every document here is a blueprint for a future
implementation phase — none of them is that implementation.

## Purpose

Phase 11 (`ADR-0006`) and Phase 13A (`ADR-0009`) specified *what*
inter-agent communication is (`MESSAGE_SCHEMA.md`,
`INTER_AGENT_PROTOCOL.md`, `EVENT_BUS.md`, `EVENT_CATALOG.md`,
`TASK_ROUTING.md`, `APPROVAL_WORKFLOW.md`, `FOUNDER_APPROVAL_FLOW.md`,
`SECURITY_BOUNDARIES.md`, `MEMORY_SCHEMA.md`) as architecture and
contract. Nothing in that layer chooses a transport, a persistence
technology, or a concrete rollout sequence — each of those documents
says so explicitly in its own "Future Implementation Notes." This
folder is where that choice gets made, on paper, against real
repository evidence, before any of it is built.

## Relationship to the Contract Layer

Every document below is downstream of, and never a redefinition of,
the contracts listed above. Where this folder proposes something the
contract layer left open (a transport, a retry count, a persistence
table), it is marked **Future SDOS Capability** and cites the
contract clause it fills in. Where this folder would need to
contradict a contract to make an implementation choice work, that is
treated as a discovered gap to flag back to the contract layer, not a
license to override it silently — no such contradiction was found
while writing this folder.

## Documents

| File | Answers |
|---|---|
| `EVENT_BUS_IMPLEMENTATION_PLAN.md` | Which transport implements `EVENT_BUS.md`, and why |
| `MESSAGE_TRANSPORT_IMPLEMENTATION_PLAN.md` | The concrete lifecycle a `Message` (`MESSAGE_SCHEMA.md`) moves through |
| `MESSAGE_DEDUP_IMPLEMENTATION_PLAN.md` | How the Phase 13A identifiers (`INTER_AGENT_PROTOCOL.md`) get enforced |
| `MESSAGE_ORDERING_IMPLEMENTATION_PLAN.md` | How `sequence_number` ordering is actually kept |
| `TRACEABILITY_IMPLEMENTATION_PLAN.md` | How a founder request is traced end-to-end |
| `RUNTIME_COMPONENT_MAP.md` | Which contract maps to which future runtime component, one-to-one |
| `PRODUCTION_BOUNDARY.md` | What SDOS may ever read, write, or never touch |
| `TEST_STRATEGY.md` | What a future implementation must be tested against |
| `ROLLBACK_STRATEGY.md` | How to disable this without touching SmartDoor production |
| `OBSERVABILITY_PLAN.md` | What a future implementation must be observable through |
| `SECURITY_IMPLEMENTATION_PLAN.md` | How `SECURITY_BOUNDARIES.md`'s two extensions get enforced in code, once written |

## Mandatory Audit Performed Before Writing This Folder

Before creating any file in this folder, the full text of every
document listed under "Source of Truth" in the Phase 13B brief was
read (`MESSAGE_SCHEMA.md`, `INTER_AGENT_PROTOCOL.md`, `EVENT_SCHEMA.md`,
`EXECUTION_PIPELINE.md`, `EVENT_BUS.md`, `EVENT_CATALOG.md`,
`TASK_ROUTING.md`, `APPROVAL_WORKFLOW.md`, `FOUNDER_APPROVAL_FLOW.md`,
`SECURITY_BOUNDARIES.md`, `MEMORY_SCHEMA.md`, `EXECUTION_FLOW.md`,
`RATE_LIMITING.md`, `TOKEN_BUDGETING.md`, `DECISION_FRAMEWORK.md`,
`MULTI_PARTY_CONFLICT.md`, `ADR-0006`, `ADR-0009`), along with a direct
inspection of the production repository (`supabase/functions/`,
`sql/`, `js/`, `services/`, `package.json`) to ground every option
comparison in what actually exists today rather than in assumption.
See `RUNTIME_COMPONENT_MAP.md`'s "Already Exists" section for the
findings.

## What This Folder Does Not Do

- Does not create `ai/core/events/`'s event bus.
- Does not create an agent transport.
- Does not modify `supabase/`, `sql/`, or any `.js`/`.ts` file.
- Does not redefine anything `MESSAGE_SCHEMA.md`, `INTER_AGENT_PROTOCOL.md`,
  `EVENT_BUS.md`, `EVENT_CATALOG.md`, `TASK_ROUTING.md`,
  `APPROVAL_WORKFLOW.md`, `FOUNDER_APPROVAL_FLOW.md`,
  `SECURITY_BOUNDARIES.md`, or `MEMORY_SCHEMA.md` already specifies.

## Related

- `ai/docs/adr/ADR-0010-Communication-Implementation-Plan.md` — the
  ADR recording the decisions this folder documents in detail.
- `ai/knowledge/MASTER_INDEX.md` — updated to point here.
