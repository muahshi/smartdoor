# Event Bus Implementation Plan

## Status

Planning only. This document chooses a transport recommendation for a
future implementation of `ai/core/events/EVENT_BUS.md`. No event bus
exists. Nothing below has been built.

## Contract This Plan Implements

`EVENT_BUS.md`'s envelope, five foundational event types, and Delivery
Contract (at-least-once + ordered-within-`correlation_id`, append-only,
never-silently-dropped, no production side effects) are unchanged and
authoritative. `EVENT_BUS.md` Rule 3 explicitly defers the transport
choice: "No implementation technology is chosen in this phase... all
are legitimate future options." This document is where that deferral
gets resolved.

## Repository Evidence Consulted

- `supabase/functions/` contains 30+ deployed Edge Functions, none of
  which currently publish to or consume from anything resembling an
  event bus.
- Supabase Realtime is **already a heavily used production pattern** —
  `js/webrtcCallUI.js`, `services/webrtcSignaling.js`,
  `services/webrtcOwnerCall.js`, `services/presence.js`,
  `services/notifications.js`, `services/notificationDispatcher.js`,
  `services/activityCenter.js`, `js/activityCenter.js`,
  `js/notificationCenter.js`, and `services/messaging.js` all
  subscribe to or publish through Supabase Realtime channels today.
  The team has direct, current operational experience with this
  technology's failure modes (the WebRTC channel-teardown recursion
  bug is one example already fixed in production).
- `supabase/functions/groq-proxy/index.ts` and
  `supabase/functions/_shared/edgeRateLimit.ts` show the one existing
  in-process pattern in this codebase: an in-memory sliding-window
  `Map`, explicitly documented in its own header as "per-instance,
  resets on cold start... NOT a replacement for the DB-backed... pattern
  used elsewhere for security-critical paths; those remain
  server-authoritative because they persist across cold starts."
- `sql/` contains 87 sequentially numbered migrations
  (`01_schema.sql` through `64_launch_readiness_certification.sql` and
  beyond) with an established, enforced convention
  (`NAMING_STANDARD.md`, referenced throughout `ai/core/`): migrations
  are additive and never edited after landing.
- No `supabase/config.toml` exists in the repository (a separately
  known production gap, tracked outside this plan). No existing queue,
  outbox, or event-log table exists anywhere in `sql/`.
- Edge Functions run on Supabase's Deno runtime, which is stateless
  between cold starts — the same constraint `edgeRateLimit.ts`'s own
  header already documents for its in-memory bucket.

## Options Compared

### A. In-process event emitter

- **Architecture fit:** Poor for this system's actual shape. An
  in-process emitter (e.g. Node's `EventEmitter`) only propagates
  events within one running process. SDOS executives, per
  `SESSION_MODEL.md` and `RUNTIME_ARCHITECTURE.md`, are not one
  long-lived process — each turn is a bounded invocation, structurally
  closer to `groq-proxy`'s own stateless Edge Function model than to a
  persistent server.
- **Reliability:** None across invocations. Confirmed by this
  repository's own `edgeRateLimit.ts` precedent — the one in-memory
  pattern already in production is explicitly documented as
  non-authoritative for exactly this reason.
- **Persistence:** None. Violates `EVENT_BUS.md`'s append-only rule by
  construction — there is nothing to append to.
- **Scaling:** Does not scale across multiple Edge Function instances,
  which Supabase spins up independently per invocation.
- **Failure handling:** A dropped event is unrecoverable and
  undetectable — directly violates Delivery Contract Rule 3
  ("no event is silently dropped").
- **Security:** N/A — no persistence layer to secure, but also no
  audit trail, which `AUDIT_TRAIL.md` requires downstream.
- **Complexity:** Lowest to build.
- **Cost:** None.
- **Compatibility with existing SmartDoor:** Trivial, but only because
  it touches nothing.
- **Compatibility with future SDOS:** Fails `MEMORY_SCHEMA.md`'s and
  `AUDIT_TRAIL.md`'s requirement for durable, reviewable history.
- **Verdict:** Rejected. Fails the Delivery Contract's core
  reliability and append-only guarantees for the same documented
  reason `edgeRateLimit.ts` already flags its own in-memory pattern as
  insufficient for anything server-authoritative.

### B. Supabase Realtime (alone, no backing table)

- **Architecture fit:** Good for live propagation, incomplete alone.
  Realtime's `postgres_changes` and broadcast channels are exactly
  what this repository already uses for `webrtcSignaling.js`,
  `presence.js`, and `notificationDispatcher.js` — direct,
  demonstrated precedent for this problem shape (many small
  components needing to react to "something happened").
- **Reliability:** Realtime broadcast (channel-only, no table) does
  not guarantee delivery to a subscriber that is offline at
  publish time — no durable log to catch up from.
- **Persistence:** None, if used as broadcast-only. Violates
  Delivery Contract Rule 2 (append-only) on its own.
- **Scaling:** Proven at this repository's current production scale
  (multiple concurrent WebRTC/notification channels already run
  today).
- **Failure handling:** A subscriber that misses a broadcast has no
  way to discover or replay it — same gap as Option A, just at a
  different layer.
- **Security:** Realtime channels are subject to the same RLS
  discipline as the rest of the Supabase project — a known,
  already-audited pattern (`SECURITY_MODEL.md`, `READONLY_INTEGRATION_POLICY.md`).
- **Complexity:** Low, given existing team familiarity.
- **Cost:** Included in the existing Supabase plan already in use.
- **Compatibility with existing SmartDoor:** High — reuses a pattern
  already proven in this exact codebase.
- **Compatibility with future SDOS:** Fails the append-only /
  no-silent-drop requirements alone; needs a backing table to satisfy
  `EVENT_BUS.md` in full.
- **Verdict:** Necessary but not sufficient by itself — see Option E.

### C. Database-backed queue (dedicated SDOS event table)

- **Architecture fit:** Strong. A dedicated, append-only Postgres
  table (`sdos_events` or similar) maps directly onto `EVENT_BUS.md`'s
  Event object shape and Delivery Contract Rule 2 (append-only) with
  no impedance mismatch — an `INSERT`-only table with no `UPDATE` or
  `DELETE` grants is a structural enforcement of that rule, not a
  policy one.
- **Reliability:** High. Postgres durability guarantees survive Edge
  Function cold starts, unlike Option A.
- **Persistence:** Native — this is what the table is for.
- **Scaling:** Matches this repository's existing 87-migration
  Postgres schema; no new infrastructure provider.
- **Failure handling:** A write failure is a normal Postgres error,
  handled the same way every other write in `services/` and
  `supabase/functions/` already is — no new failure class to invent.
- **Security:** RLS-governed exactly like every other SmartDoor table
  — `SECURITY_MODEL.md`'s existing constraint 1 ("no direct
  network/DB access from `ai/`... a tool registry entry is a
  reference to an integration capability, never an independent access
  path") is satisfiable by routing all writes through a future
  `ai/integrations/` boundary, never `ai/` writing to Postgres
  directly.
- **Complexity:** Moderate — one new, isolated migration file,
  additive per this repository's own `NAMING_STANDARD.md` (next
  sequential number after the current highest in `sql/`), touching no
  existing table.
- **Cost:** Negligible — one small table, no new service.
- **Compatibility with existing SmartDoor:** High, if scoped to its
  own table and never joined against customer/order/payment tables in
  a way that would violate `EVENT_CATALOG.md`'s data-minimization
  rule (magnitude/identity banded, never raw).
- **Compatibility with future SDOS:** Strong — durable, queryable,
  and the natural backing store for `AUDIT_TRAIL.md`'s durable record
  requirement.
- **Verdict:** Satisfies persistence and append-only fully; alone,
  provides no live propagation (a consumer must poll).

### D. Existing SmartDoor infrastructure, unmodified

- **Architecture fit:** Not directly applicable as a single option —
  "existing infrastructure" in this repository *is* Supabase
  (Postgres + Realtime + Edge Functions + Storage), per
  `ai/docs/COMPANY_BRAIN.md`'s and `ai/knowledge/database/database.md`'s
  own description. This option is not a fourth independent choice; it
  is the umbrella Options B and C are both instances of. Evaluated
  here only to confirm no separate existing mechanism (e.g. an
  unused message queue, pub/sub service, or webhook relay) already
  exists in this repository that could be reused instead of building
  B/C. None was found in `supabase/functions/`, `sql/`, or
  `package.json`'s dependencies.
- **Verdict:** Collapses into Option E — there is no third existing
  mechanism beyond Postgres and Realtime to draw on.

### E. Hybrid — Database-backed table (C) + Supabase Realtime (B)

- **Architecture fit:** Best fit found. The Postgres table is the
  durable, append-only, replayable source of truth `EVENT_BUS.md`
  requires; Realtime is layered on top purely as a live-propagation
  convenience for any future consumer (e.g. `ai/dashboard/`, still
  empty per `ai/core/README.md`) that wants to react without polling.
  This mirrors exactly how `services/notifications.js` and
  `services/activityCenter.js` already combine a durable table with a
  Realtime channel in production today — not a new pattern for this
  codebase, an existing one applied to a new table.
- **Reliability:** High — table is authoritative; Realtime is
  best-effort convenience only. A missed broadcast is recoverable by
  reading the table, closing Option B's gap without inheriting Option
  A's total-loss failure mode.
- **Persistence:** Full, via the table.
- **Scaling:** Matches current production patterns exactly; no new
  infrastructure provider or cost tier.
- **Failure handling:** Table write failure = normal Postgres error
  path (existing `ERROR_HANDLING.md` classes apply). Realtime
  broadcast failure = no data loss, since the table remains the
  source of truth; a consumer falls back to reading the table.
- **Security:** Same RLS/`ai/integrations/`-boundary discipline as
  Option C; Realtime channel access governed by the same policies as
  every other Realtime channel already in production.
- **Complexity:** Moderate — one migration (Option C's table) plus
  reuse of an already-proven Realtime pattern; no genuinely new
  technology introduced to this codebase.
- **Cost:** Negligible, same as Option C, with Realtime already
  included in the existing plan.
- **Compatibility with existing SmartDoor:** Highest of all options —
  composes two patterns this repository already runs in production,
  rather than introducing a third-party queue (e.g. a hosted message
  broker), which would be the only way to score higher on "pure"
  reliability and would cost meaningfully more in operational
  complexity for a system that, per every contract document's own
  Status line, has zero current call volume to justify it.
- **Compatibility with future SDOS:** Highest — durable for
  `AUDIT_TRAIL.md` and `MEMORY_SCHEMA.md`'s continuity needs, live for
  any future dashboard, and requires no new vendor relationship.
- **Verdict:** Recommended.

## Recommendation

**Option E — a dedicated, append-only Postgres table as the source of
truth, with a Supabase Realtime channel layered on top for live
propagation.**

This is not a new architectural decision invented by this document —
it is the same table+Realtime composition already running in
production for notifications and activity-center events, applied to a
new, isolated `sdos_events`-shaped table that never joins against
customer, order, or payment data directly (per `EVENT_CATALOG.md`'s
banding rule). No alternative surveyed above satisfies `EVENT_BUS.md`'s
Delivery Contract without either accepting Option A's/B-alone's
data-loss risk or introducing a new, unproven-in-this-codebase
technology dependency that the current zero-call-volume state (every
Phase 9–13A document's own "Status" line) does not yet justify.

## What This Recommendation Does Not Do

- Does not create the table. No migration file was written or
  proposed by number.
- Does not choose RLS policy text, column types, or an index strategy
  — those are implementation-phase decisions, not architecture
  decisions, consistent with how `EVENT_BUS.md` itself already defers
  technology choice from schema choice.
- Does not change how any existing Realtime channel in production
  (`webrtcSignaling.js`, `presence.js`, etc.) behaves — a new,
  separate channel for SDOS events, never a reuse of an existing
  channel already carrying customer-facing traffic.

## Dependencies

- `ai/core/events/EVENT_BUS.md` (the contract this plan implements)
- `ai/core/events/EVENT_CATALOG.md` (the event taxonomy this table
  would eventually carry)
- `PRODUCTION_BOUNDARY.md` (this folder — the read/write boundary this
  table's future migration must respect)
- `SECURITY_IMPLEMENTATION_PLAN.md` (this folder — how RLS and the
  `ai/integrations/` write boundary apply to this table)
