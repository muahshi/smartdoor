# Observability Plan

## Status

Planning only. No metric, log line, or dashboard described below has
ever been produced, because no runtime exists to produce one.

## Contract This Plan Implements

`ai/runtime/OBSERVABILITY.md` (per-invocation usage/latency/outcome
metadata, already specified for the Groq execution sequence) and
`ai/core/contracts/OBSERVABILITY.md` (referenced by `ADR-0009` as one
of the two existing files a duplicate `OBSERVABILITY.md` would have
collided with — confirming both already exist and are authoritative).
`EVENT_BUS.md`'s own relationship note ("`LOGGING_STRATEGY.md` is a
consumer of every event type") is the model this plan follows for
message/event observability specifically. None of these are
redefined below.

## What Must Be Observable

1. **Every step of `MESSAGE_TRANSPORT_IMPLEMENTATION_PLAN.md`'s
   lifecycle** (Create → Validate → Authorize → Route → Deliver →
   Acknowledge → Process → Respond → Audit) — per that plan's own Audit
   step, every stage is already required to write to `AUDIT_TRAIL.md`;
   this plan's addition is that the same stages should also be
   observable in near-real-time (latency between stages, not just
   eventual presence in the durable record), consistent with
   `OBSERVABILITY.md`'s existing "usage/latency/outcome" scope for the
   Groq sequence, applied here to the message sequence.
2. **Every Context-Evaluation outcome** (`EXECUTION_FLOW.md` Phase 13A
   Rule 13) — whether a `Message` triggered new Groq reasoning or was
   answered from existing context, per that rule's own instruction
   that this decision is "as reviewable as what the model call
   returned."
3. **Every deduplication and ordering-anomaly event**
   (`MESSAGE_DEDUP_IMPLEMENTATION_PLAN.md`,
   `MESSAGE_ORDERING_IMPLEMENTATION_PLAN.md`) — a duplicate or stale
   message is logged as a non-fatal anomaly per
   `INTER_AGENT_PROTOCOL.md` Phase 13A Rule 3, and a future
   implementation should make the *rate* of these anomalies visible,
   since a rising rate would itself be a signal worth a future
   `system.incident` event (`EVENT_CATALOG.md`).
4. **Every `error.raised` event**, already fully specified by
   `EVENT_BUS.md` as the universal failure signal every component
   emits — this plan adds no new error-reporting mechanism, only
   confirms that message-layer failures use this same channel rather
   than a parallel one.
5. **Rate-limit and token-budget rejections**
   (`RATE_LIMITING.md`, `TOKEN_BUDGETING.md`) — both files already
   specify their own output shapes (`RateLimitCheck`, budget-exceeded
   `EXECUTION_ERROR`); this plan's addition is that these should be
   visible in aggregate (rejection rate per executive per session),
   not only as individual failure events, so a future implementer can
   tell whether `RATE_LIMITING.md`'s proposed `max_per_window: 20`
   figure needs the retuning that file's own "Future Implementation
   Notes" already anticipates.

## Relationship to Existing Production Observability

Production already has its own observability surface —
`services/logs.js`, `services/monitoring.js`, and
`sql/62_observability_reliability_phase10.sql` (confirmed present in
the repository). Per `PRODUCTION_BOUNDARY.md`, a future SDOS
implementation's observability must be additive and separate from
this existing surface, never writing into production's own logging
tables directly — mirroring the same isolated-table principle
`EVENT_BUS_IMPLEMENTATION_PLAN.md` already applies to the event bus
itself. A future implementer building SDOS observability should reuse
the same architectural pattern (isolated table, optionally
Realtime-fed) production's own observability already uses, without
sharing the underlying table.

## What Must Never Be Exposed in Observability Data

Per `EVENT_BUS.md` Rule 2, `EVENT_CATALOG.md` Rule 3, and
`SECURITY_BOUNDARIES.md`'s data-minimization principle: no metric,
log line, or dashboard produced by a future SDOS observability
implementation may carry raw SmartDoor customer/business data,
exact financial figures (bands only, per `EVENT_CATALOG.md`'s existing
convention), or technical secrets (stack traces, credentials, raw log
lines) — this restates, and does not loosen, rules already established
elsewhere.

## Dashboard

`ai/dashboard/` remains empty as of this phase (per `ai/core/README.md`'s
own subfolder table). This plan does not build it — observability data
described above is defined as a future *input* to that eventual
dashboard, not a UI decision made here.

## Dependencies

- `ai/runtime/OBSERVABILITY.md`, `ai/core/contracts/OBSERVABILITY.md`
  (authoritative, both already exist)
- `EVENT_BUS.md`, `EVENT_CATALOG.md`
- `EXECUTION_FLOW.md` Phase 13A extension
- `MESSAGE_DEDUP_IMPLEMENTATION_PLAN.md`,
  `MESSAGE_ORDERING_IMPLEMENTATION_PLAN.md` (this folder)
- `RATE_LIMITING.md`, `TOKEN_BUDGETING.md`
- `PRODUCTION_BOUNDARY.md` (this folder — the isolation principle this
  plan follows for its own data)
