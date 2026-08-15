# ADR-0012: SDOS Credential Cutover & Event Bus Activation Readiness

## Status

Accepted (Phase 14C). Closes the one real gap `ADR-0011` deferred to
"Phase 14C or later" and finalizes the credential-architecture question
`ADR-0011` scaffolded but did not complete.

## Context

`ADR-0011` (Phase 14B) created `sdos_service` as a dormant, `NOLOGIN`
Postgres role scoped to `sdos_events` / `sdos_event_lifecycle`, and
separately narrowed `feature_flags_select_all` to
`USING (key NOT LIKE 'sdos_%')` so SDOS-internal flags stop leaking to
anon clients. Phase 14B's own audit did not check these two decisions
*against each other*: migration 73 also granted `sdos_service` a
table-level `SELECT` on `feature_flags` (for
`sdosEventsStore.js#isEventBusEnabled()`'s eventual use), but no RLS
policy exists that lets `sdos_service` actually see a `sdos_%` row —
the same `feature_flags_select_all` policy that (correctly) blocks
anon/authenticated from `sdos_%` keys also blocks `sdos_service`,
because that policy has no `TO <role>` clause and therefore applies to
every role, not just the client-facing ones it was written for.

This has zero live effect today: `sdosEventsStore.js` still
authenticates as `service_role`, which bypasses RLS entirely (`BYPASSRLS`
attribute), so `isEventBusEnabled()` has never actually gone through
this policy. The gap is latent — it would only surface the moment a
future operator completes `ADR-0011`'s three manual cutover steps and
`sdosEventsStore.js` starts reading `feature_flags` as `sdos_service`.
At that point `isEventBusEnabled()` would silently and permanently
read `false` (its own documented fail-safe default on any error or
missing row), making `sdos_event_bus_enabled` structurally impossible
to ever observe as `true` through that credential — not a crash, not
an error in any log, just a flag that can never turn on. This phase's
brief named it directly: "This must be handled as part of the
credential cutover."

## Decision

**1. Feature flag read path (migration 74):** add one additional
permissive `SELECT` policy on `feature_flags`, scoped `TO sdos_service`,
`USING (key LIKE 'sdos_%')`. Postgres RLS OR's multiple permissive
policies for the same command together, so this is strictly additive —
it does not modify, replace, or weaken `feature_flags_select_all`.
anon/authenticated still cannot see any `sdos_%` row. `sdos_service`
can now see exactly the `sdos_%` rows the general policy excludes,
symmetric with what it already could see of the non-`sdos_%` rows via
that same general policy (which applies to `PUBLIC`, `sdos_service`
included). Verified directly with `SET LOCAL ROLE sdos_service` in
`sql/74b_verify.sql` Check 3 — not inferred from the policy text alone.
That test itself required one more grant: Supabase's `postgres` role
(what the Dashboard SQL Editor runs as) is not a true superuser and is
not automatically a member of a role it creates, so `SET ROLE
sdos_service` fails with `42501` until `postgres` is explicitly
granted membership. Migration 74 adds `GRANT sdos_service TO
postgres;` for exactly this — it expands nothing `postgres` couldn't
already do to `sdos_service` by other means (it owns the role), it
only makes that access usable inside a `SET LOCAL ROLE` block.

**2. Credential architecture (confirmed, not changed):** repository
evidence supports exactly the two-credential shape this phase's brief
asked to verify:

```
SDOS runtime
 ├── narrow DB credential (sdos_service, once live)
 │      ↓
 │   PostgreSQL — sdos_events / sdos_event_lifecycle / feature_flags(sdos_%)
 │   via a direct Postgres connection (SDOS_DB_URL), bypassing
 │   PostgREST's JWT role-claim resolution entirely — the only path
 │   through which a NOLOGIN-until-cutover role can be reached at all
 │
 └── separate Realtime credential (service_role, unchanged)
        ↓
     `sdosEventsStore.js#broadcastEvent()` — `client.channel('sdos-events')
     .send(...)`, which requires a Supabase API key/JWT, not a bare
     Postgres role, so it cannot use `sdos_service` even after cutover
     without a Dashboard-issued custom JWT (out of scope, undecided,
     not blocking)
```

`insertEvent()`, `appendLifecycleStage()`, and `isEventBusEnabled()`
are the DB-credential path; `broadcastEvent()` is, and remains, the
Realtime-credential path. These were already structurally separate
functions in `sdosEventsStore.js` before this phase — this ADR records
that the separation is intentional and correct, not an accident to
resolve later.

**3. Cutover: not performed.** `sdos_service` remains `NOLOGIN`. No
password was generated, no secret was provisioned, and
`sdosEventsStore.js` was not modified to add a direct-Postgres code
path. Three reasons, all from this phase's own constraints:

- The three manual steps `ADR-0011`/migration 73 already documented
  (`ALTER ROLE ... LOGIN PASSWORD`, provisioning `SDOS_DB_URL` as an
  Edge Function secret, updating `getClient()`) require Supabase
  Dashboard / secret-provisioning access this working session does not
  have — inventing a credential or hardcoding one is explicitly
  forbidden regardless.
- Shipping a direct-Postgres fallback code path today, before the role
  can ever authenticate, would be dead code with no way to exercise it
  end-to-end against a real database from this repository — untestable
  code on a security-boundary read/write path is a worse outcome than
  no code, not a safer one.
- Nothing in this phase requires the cutover to happen now.
  `sdos_event_bus_enabled` is still `FALSE` either way, and
  `service_role`'s residual-risk bound (`REVOKE UPDATE, DELETE`, two
  isolated tables, no other grant) is unchanged and already documented
  by `ADR-0011`.

The manual deployment steps remain exactly as migration 73 documented
them; this ADR does not restate or revise them, only confirms they are
still the correct — and still the only — path to completing the
cutover.

## Consequences

- `feature_flags` now has two complementary, non-overlapping SELECT
  policies: `feature_flags_select_all` (all roles, excludes `sdos_%`)
  and `sdos_service_select_sdos_flags` (`sdos_service` only, `sdos_%`
  only). Neither role can read what the other is scoped to.
- The latent "flag can never read true through sdos_service" trap is
  closed before it could ever be hit — `isEventBusEnabled()` will
  correctly read `sdos_event_bus_enabled`'s real state once (and only
  once) a future phase completes the cutover, instead of silently
  fail-safing to `false` forever.
- `sdosEventsStore.js` is unmodified. It still authenticates as
  `service_role` for every operation, DB and Realtime alike, exactly
  as `ADR-0011` left it.
- The Event Bus remains disabled (`sdos_event_bus_enabled = FALSE`)
  and no executive, dashboard consumer, or production workflow was
  connected to it.

## Future Impact

- A future phase with Supabase Dashboard/secret-provisioning access in
  its working session should complete migration 73's three manual
  steps, then add the direct-Postgres code path to
  `sdosEventsStore.js#getClient()` (DB operations only —
  `broadcastEvent()` stays on `service_role`/Realtime as this ADR's
  architecture confirms), then re-run `sql/73b_verify.sql` Checks 5–6
  and `sql/74b_verify.sql` Check 3 against the now-live `sdos_service`
  credential (not `SET LOCAL ROLE`) to confirm end-to-end behavior
  matches what this ADR verified structurally.
- Whether `broadcastEvent()` should eventually move off `service_role`
  (e.g. a Dashboard-issued custom JWT scoped to the `sdos-events`
  channel) is an open question this ADR deliberately leaves open — no
  repository evidence today shows a product need for it, and inventing
  one would be new security infrastructure this phase's Golden Rules
  say not to build without a real requirement.
- Separately noted, not addressed here (out of this phase's scope —
  would require new `realtime.messages` RLS infrastructure, not a
  credential fix): `sdosEventsStore.js#broadcastEvent()` opens
  `client.channel('sdos-events')` without `{ config: { private: true } }`,
  which means broadcast authorization on that channel is not currently
  governed by RLS at all. No consumer exists yet (`ai/dashboard/` is
  still empty per `ai/core/README.md`), so there is nothing today that
  can read from it, but a future phase adding a real subscriber should
  evaluate Supabase's private-channel RLS model before wiring one up.
- The `ai/adr/` vs `ai/docs/adr/` consolidation `ADR-0011` mentioned
  and this phase's brief also raised is still not done — see
  Phase 14C's final report, "ADR Directory," for why it remains a
  separate, un-scheduled cleanup task rather than something folded
  into this ADR.

## Related Phases

- `ADR-0010` (Phase 13B) — original planning decision.
- `ADR-0011` (Phase 14B) — credential-boundary scaffold, feature-flag
  exposure fix, canonical-transport decision; this ADR closes the one
  gap it explicitly deferred.
- Phase 14C (this phase) — `sql/74_sdos_feature_flag_service_read.sql`,
  `sql/74b_verify.sql`.
