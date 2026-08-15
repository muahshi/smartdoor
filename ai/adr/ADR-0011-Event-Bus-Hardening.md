# ADR-0011: Event Bus Hardening

## Status

Accepted (Phase 14B). Extends `ADR-0010`'s planning-only recommendation
into the first real runtime code and SQL that implements it
(`ai/core/events/eventBus.js`, `ai/integrations/supabase/
sdosEventsStore.js`, `sql/72_sdos_event_bus_foundation.sql` — all
Phase 14A), then hardens two decisions Phase 14A shipped but flagged
as open, and resolves one architectural question Phase 14A's own code
left ambiguous (explicit broadcast vs. `postgres_changes`).

## Context

Phase 14A built the first working instance of `ADR-0010`'s recommended
Option E (dedicated append-only table + Supabase Realtime): the
`sdos_events` / `sdos_event_lifecycle` tables, `eventBus.js`'s
Validate → Authorize → Persist → Broadcast → Audit pipeline, and a
feature-flag kill switch reusing the existing `feature_flags` table.
Phase 14A's own migration and store-module comments explicitly named
two decisions as deferred rather than resolved:

1. `sdosEventsStore.js` uses `service_role` — the same broad,
   RLS-bypassing credential every other Edge Function in this
   repository uses — rather than a role scoped to only its own two
   tables, because "Supabase does not offer a simple SQL-only path to
   provision a new PostgREST-exposed role."
2. Migration 72 puts `sdos_events` in the `supabase_realtime`
   publication (enabling a future `postgres_changes` consumer) *and*
   `sdosEventsStore.js#broadcastEvent()` sends an explicit
   `channel.send({ type: 'broadcast', ... })` — two Realtime
   mechanisms present in the same phase, with no document stating
   which one, if either, is authoritative.

Separately, Phase 14B's own audit (this phase) found a third issue
neither Phase 14A document flagged: `feature_flags`' existing
`feature_flags_select_all` policy (`USING (true)`, from
`sql/38_webrtc_phase0_phase1.sql`, built for the two client-facing
WebRTC flags) also exposes `sdos_event_bus_enabled`'s key, boolean
state, and internal-architecture description to any anon client —
information disclosure with no corresponding product need, inherited
by migration 72 simply reusing the table as instructed.

## Decision

**1. Credential boundary:** create a dormant, narrowly-scoped
`sdos_service` Postgres role now (migration 73) — `NOLOGIN`, granted
`SELECT`/`INSERT` on exactly `sdos_events` and `sdos_event_lifecycle`
via real RLS policies, no grant anywhere else. It cannot authenticate
until an operator manually completes three documented deployment steps
(set a password, provision a direct Postgres connection secret,
update `sdosEventsStore.js#getClient()` to use it) — steps that
require Supabase Dashboard / secret-provisioning access this migration
cannot perform from repository SQL alone. `sdosEventsStore.js`
continues authenticating as `service_role` until that manual cutover
happens. This is a credential-boundary *scaffold*, not a completed
narrowing.

**2. Feature flag exposure:** narrow `feature_flags_select_all` from
`USING (true)` to `USING (key NOT LIKE 'sdos_%')` (migration 73).
`feature_flags` remains the one, reused flag table (no second flag
system created); `webrtc_global_enabled` and `webrtc_kill_switch`
keep their existing client-readable behavior unchanged. This closes
the one real information-disclosure finding without touching the
table's intended purpose.

**3. Canonical transport:** explicit Realtime broadcast
(`sdosEventsStore.js#broadcastEvent()`) is SDOS's one canonical
event-delivery mechanism. `sdos_events`' `supabase_realtime`
publication membership remains, unchanged, as a documented,
non-canonical standing path for a future polling/CDC-style dashboard
consumer — it is not a second thing `emitEvent()`'s pipeline writes
through or depends on, and no caller in this repository subscribes to
it via `postgres_changes` today.

**4. Controlled runtime caller:** `ai/core/runtime/runtimeCaller.js`
is the one legitimate caller of `emitEvent()` this phase adds. It
emits exactly one fixed, non-input-derived infrastructure event
(`lifecycle.transition`, source `sdos-system`, payload naming no
order/customer/payment/PII/credential), performs no Groq call, spawns
no executive, and writes to no production table. It is invoked either
by a test's injected `deps` or manually via
`scripts/sdos-runtime-caller-verify.js` — never automatically, never
from a request path.

## Alternatives Considered

**Credential — mint the narrower role's JWT now, in SQL.** Rejected:
Supabase resolves the acting Postgres role from the `role` claim
embedded in the API key's JWT, fixed at key-generation time. No SQL
statement can make PostgREST start honoring a new `role` claim; doing
this for real requires the Dashboard's key/JWT tooling. Building the
role now but leaving it `NOLOGIN` gets the schema-level narrowing
ready without pretending a code-only change can finish the job.

**Credential — revoke broad grants directly from `service_role`.**
Rejected outright, not just deferred: `service_role` is shared by
every existing Edge Function (`admin-login`, `razorpay-webhook`,
`groq-proxy`, etc.). Narrowing it would break all of them, not just
scope SDOS — this is the one option that fails
`PRODUCTION_BOUNDARY.md`'s "must never be modified automatically"
constraint by construction, so it was never seriously in play.

**Feature flag — move `sdos_event_bus_enabled` to a new, SDOS-only
table.** Rejected per Phase 14B's own brief ("Do NOT create another
feature flag system... If existing `feature_flags` is the correct
infrastructure, keep it") and per Golden Rule 17. A policy narrowing
achieves the same confidentiality outcome without a second table, a
second read path in `sdosEventsStore.js`, or a second thing future
flags must remember to check.

**Feature flag — leave `USING (true)` unchanged, rely on "nothing
reads it today."** Rejected: "nothing reads it today" is a fact about
current client code, not a security boundary — any future anon-key
holder (including outside this repository, since the anon key is
public by design) could enumerate it today without this change.

**Transport — pick `postgres_changes` as canonical, drop explicit
broadcast.** Rejected: `postgres_changes` has no observable per-call
delivery status from the writer's side, which is exactly what
`broadcast_attempted → broadcast_succeeded|failed` in
`sdos_event_lifecycle` needs to be meaningful (`EVENT_BUS.md`'s audit
requirement). Explicit broadcast is the only one of the two that can
honestly report a broadcast outcome at all.

**Transport — drop the `supabase_realtime` publication membership
entirely, keep only explicit broadcast.** Considered, not chosen:
Phase 14A's own migration-72 comment already gives a concrete,
still-valid reason to keep it (a future dashboard consumer that
prefers polling/CDC over subscribing to a specific channel) — removing
it would be discarding working, documented, zero-cost infrastructure
to resolve an ambiguity that a canonicality *statement* (this ADR)
already resolves without any code change.

**Runtime caller — give it its own event type.** Rejected: `EVENT_
CATALOG.md` Rule 1 treats new types as additive but requires each to
be documented before use; reusing `lifecycle.transition` (already a
`KNOWN_EVENT_TYPES` entry with a clear, catalog-defined meaning close
enough to this caller's purpose) avoids adding an undocumented type
for a single-purpose verification tool. A future phase with a real,
recurring need can still add a dedicated type then.

## Rationale

Every decision above follows the same shape: implement what is
genuinely SQL/code-safe today, and where the *ideal* (Objective 1's
fully narrowed credential) requires a step outside repository code
entirely, build the inert scaffold and document the exact manual steps
rather than either (a) silently shipping nothing, or (b) inventing a
workaround (a hardcoded credential, a second flag system, a dropped
Realtime path) that would violate this phase's own explicit
constraints. This mirrors Phase 14A's own precedent for the same
credential question — this ADR resolves it one step further, not
differently.

## Consequences

- `sdosEventsStore.js` still authenticates as `service_role` today;
  the residual risk Phase 14A already documented (bounded by `REVOKE
  UPDATE, DELETE`, two isolated tables, no other grant) is unchanged
  until the three manual deployment steps this ADR documents are
  completed by an operator.
- `sdos_event_bus_enabled`'s existence and state are no longer
  enumerable via the anon key; `webrtc_global_enabled` and
  `webrtc_kill_switch` are unaffected.
- Any future SDOS Realtime consumer should subscribe to the
  `'sdos-events'` broadcast channel, not `postgres_changes` on
  `sdos_events`, unless a future ADR states a concrete reason to add a
  second consumer using the standing publication path.
- `ai/core/runtime/runtimeCaller.js` is now the first executable file
  under `ai/core/runtime/` — that folder's own `README.md` ("This
  phase contains no executable code") was already stale before this
  ADR, in the same way `ai/core/events/README.md` was left unrevised
  when `eventBus.js` landed in Phase 14A; neither README is corrected
  by this ADR (out of Phase 14B's scope), but a future phase touching
  either folder's documentation should reconcile both at once.

## Future Impact

- Phase 14C or later should complete the credential cutover this ADR
  scaffolds (`sdos_service` role) once Dashboard/secret-provisioning
  access is available in that phase's working session, and update
  `sql/73b_verify.sql` Check 5/6 results into that phase's final
  report.
- A future SDOS dashboard (`ai/dashboard/`, still empty) that needs a
  polling/CDC-style read path may use the standing `supabase_realtime`
  publication membership without re-opening the canonical-transport
  question this ADR closes — that path was kept exactly so a future
  phase would not need to.
- Any future event type beyond `lifecycle.transition`, `task.*`,
  `permission.checked`, `error.raised`, `approval.*` still requires
  its own `EVENT_CATALOG.md` entry before use, per that document's
  Rule 1 — this ADR does not relax that requirement for
  `runtimeCaller.js` or anything else.

## Related Phases

- `ADR-0010` (Phase 13B) — the planning decision this phase's Phase
  14A implementation and this ADR's hardening both build on.
- Phase 14A (`sql/72_sdos_event_bus_foundation.sql`,
  `ai/core/events/eventBus.js`,
  `ai/integrations/supabase/sdosEventsStore.js`,
  `scripts/sdos-event-bus-test.js`) — the implementation this ADR
  hardens, not rebuilds.
- Phase 14B (this phase) — `sql/73_sdos_credential_and_flag_
  hardening.sql`, `sql/73b_verify.sql`,
  `ai/core/runtime/runtimeCaller.js`,
  `scripts/sdos-runtime-caller-verify.js`, and the three test
  scenarios added to `scripts/sdos-event-bus-test.js`.
