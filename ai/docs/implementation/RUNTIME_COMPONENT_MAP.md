# Runtime Component Map

## Status

Planning only. Maps each future runtime component this Phase 13B plan
implies to the existing contract document that already governs it.
Built from the mandatory audit performed before any file in this
folder was written (see `README.md`).

## Already Exists (Contract Layer — Documentation Only)

Confirmed present and read in full before writing this folder:

- `ai/core/contracts/MESSAGE_SCHEMA.md`
- `ai/core/contracts/INTER_AGENT_PROTOCOL.md` (incl. Phase 13A extension)
- `ai/core/contracts/EVENT_SCHEMA.md`
- `ai/core/contracts/EXECUTION_PIPELINE.md`
- `ai/core/contracts/APPROVAL_WORKFLOW.md`
- `ai/core/contracts/FOUNDER_APPROVAL_FLOW.md`
- `ai/core/contracts/SECURITY_BOUNDARIES.md`
- `ai/core/contracts/MEMORY_SCHEMA.md`
- `ai/core/events/EVENT_BUS.md`
- `ai/core/events/EVENT_CATALOG.md`
- `ai/core/router/TASK_ROUTING.md`
- `ai/runtime/EXECUTION_FLOW.md` (incl. Phase 13A extension)
- `ai/runtime/RATE_LIMITING.md`
- `ai/runtime/TOKEN_BUDGETING.md`
- `ai/executives/ceo/DECISION_FRAMEWORK.md`
- `ai/executives/ceo/MULTI_PARTY_CONFLICT.md`
- `ai/docs/adr/ADR-0006-Agent-Communication.md`
- `ai/docs/adr/ADR-0009-Communication-Extensions.md`

## Already Exists (Production — Live Code)

Confirmed present by direct repository inspection:

- 30+ deployed Supabase Edge Functions (`supabase/functions/*`),
  including `groq-proxy` (the only existing AI-invocation path, scoped
  to production's AI Receptionist/Product Consultant — not SDOS)
- `supabase/functions/_shared/edgeRateLimit.ts` — an in-memory,
  per-instance sliding-window limiter pattern, explicitly documented
  in its own header as non-authoritative for anything server-critical
- Supabase Realtime in active production use across
  `services/webrtcSignaling.js`, `services/presence.js`,
  `services/notifications.js`, `services/notificationDispatcher.js`,
  `services/activityCenter.js`, `services/messaging.js`,
  `js/webrtcCallUI.js`, `js/notificationCenter.js`,
  `js/activityCenter.js`
- 87 sequentially numbered SQL migrations (`sql/01_...` through
  `sql/64_...` and beyond) with an enforced additive-only convention
- No `supabase/config.toml`
- No existing queue, outbox, or event-log table anywhere in `sql/`

## Real Gaps (What Phase 11–13A Left for Implementation to Decide)

1. Transport for `EVENT_BUS.md` — resolved by
   `EVENT_BUS_IMPLEMENTATION_PLAN.md`.
2. Concrete `Message` lifecycle states (Create → ... → Audit) — resolved
   by `MESSAGE_TRANSPORT_IMPLEMENTATION_PLAN.md`.
3. How `idempotency_key` deduplication is actually enforced — resolved
   by `MESSAGE_DEDUP_IMPLEMENTATION_PLAN.md`.
4. How `sequence_number` ordering is actually enforced — resolved by
   `MESSAGE_ORDERING_IMPLEMENTATION_PLAN.md`.
5. How a founder request is traced end-to-end across every identifier
   — resolved by `TRACEABILITY_IMPLEMENTATION_PLAN.md`.
6. What may ever be read/written and what requires approval — resolved
   by `PRODUCTION_BOUNDARY.md`.
7. What a future implementation must be tested against — resolved by
   `TEST_STRATEGY.md`.
8. How to safely disable this without touching production — resolved
   by `ROLLBACK_STRATEGY.md`.
9. What must be observable — resolved by `OBSERVABILITY_PLAN.md`.
10. How the two `SECURITY_BOUNDARIES.md` extensions get enforced in
    code — resolved by `SECURITY_IMPLEMENTATION_PLAN.md`.

No gap above required inventing new architecture — each is an
implementation choice explicitly deferred by an existing contract
document's own "Future Implementation Notes" section.

## Architecture-to-Implementation Mapping

| Existing contract | Future runtime component | This folder's plan |
|---|---|---|
| `EVENT_BUS.md` | Event table + Realtime channel | `EVENT_BUS_IMPLEMENTATION_PLAN.md` |
| `EVENT_CATALOG.md` | Event-type payload validators | (consumes the table above; no new plan needed — the catalog already fully specifies payload shape per type) |
| `MESSAGE_SCHEMA.md` + `INTER_AGENT_PROTOCOL.md` | Message lifecycle handler | `MESSAGE_TRANSPORT_IMPLEMENTATION_PLAN.md` |
| `INTER_AGENT_PROTOCOL.md` Phase 13A (dedup) | Idempotency-key check | `MESSAGE_DEDUP_IMPLEMENTATION_PLAN.md` |
| `INTER_AGENT_PROTOCOL.md` Phase 13A (ordering) | Sequence-number check | `MESSAGE_ORDERING_IMPLEMENTATION_PLAN.md` |
| `TASK_ROUTING.md` | Unchanged — routing table, not a new component | N/A — this phase does not touch routing |
| `APPROVAL_WORKFLOW.md` + `FOUNDER_APPROVAL_FLOW.md` | Approval-request persistence + founder UI | Out of scope for Phase 13B (no `ai/dashboard/` work requested) |
| `SECURITY_BOUNDARIES.md` | RLS + `ai/integrations/`-only write boundary | `SECURITY_IMPLEMENTATION_PLAN.md` |
| `MEMORY_SCHEMA.md` | Memory record persistence | Out of scope for Phase 13B (not named in the brief's `CREATE` list) |
| `RATE_LIMITING.md` / `TOKEN_BUDGETING.md` | Per-executive request throttling | Already fully specified; no new plan needed — this phase does not revise those numbers |

## What Was Explicitly Not Duplicated

Per the mandatory-audit discipline `ADR-0009` already established:
this folder adds no second event schema, no second message envelope,
no second routing table, and no second approval workflow. Every
document in this folder either (a) chooses an implementation
technology a contract document explicitly deferred, or (b) sequences
steps a contract document already specified in isolated form (e.g.
`MESSAGE_TRANSPORT_IMPLEMENTATION_PLAN.md`'s lifecycle is a
sequencing of rules already present across `MESSAGE_SCHEMA.md` and
`INTER_AGENT_PROTOCOL.md`, not a new rule set).

## Dependencies

Every document listed in "Already Exists" above, plus every other
document in this folder.
