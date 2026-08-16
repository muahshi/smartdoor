# ADR-0013: Phase 14E Credential Cutover & Live Verification Closure

## Status

Accepted (Phase 14E closure). Closes Phase 14E. Does not open, define,
scope, or authorize any subsequent phase.

## Context

`ADR-0012` (Phase 14C) left the `sdos_service` credential cutover
**not performed** — the role existed as `NOLOGIN`, and completing it
required Supabase Dashboard / secret-provisioning access outside that
working session. `sdosEventsStore.js`'s direct-Postgres branch
(`getDbClient()` / `SDOS_DB_URL`) was subsequently added in Phase 14E
as dead-but-tested code, exercised only by
`scripts/sdos-credential-path-test.js` against a fake injected
`deps.db` — never a real database.

This ADR records that the manual cutover has now been performed
outside this repository, and that a one-time, temporary Edge Function
(`supabase/functions/sdos-verify-14e-temp/index.ts`) was used to
capture live proof of it, since no existing repository test can reach
a real Supabase Postgres instance from this working session.

## What Was Verified — LIVE (via `sdos-verify-14e-temp`, operator-run in the Supabase Dashboard)

These results were reported by the operator after invoking the deployed
temporary function, and match, check-for-check, what that function's
code (inspected in this session) is structurally capable of proving:

- `sdos_service` is `LOGIN`-enabled.
- `SDOS_DB_URL` is provisioned as a Supabase Edge Function secret.
- `current_user = sdos_service` (direct-Postgres connection, not
  `SET LOCAL ROLE` impersonation).
- `sdos_event_bus_enabled = FALSE`.
- `sdos_events`: `SELECT = true`, `INSERT = true`, `UPDATE = false`,
  `DELETE = false`.
- `sdos_event_lifecycle`: privileges confirmed within the same
  intended scope (SELECT/INSERT only).
- `sdos_%`-prefixed `feature_flags` rows are readable by `sdos_service`.
- Out-of-scope grants check passed (no grant beyond the documented
  two-table + `sdos_%`-flags surface).
- Migration 74 confirmed already applied.

This ADR did not independently re-run the live check — this working
session has no network path to the Supabase project. The record above
is the operator-reported result of a function whose source this ADR
did verify is structurally capable of producing it (see "Temporary
Verifier Audit" below).

## What Was Verified — MOCKED / STRUCTURAL (re-run in this session, real output below)

- `scripts/sdos-event-bus-test.js`: **15/15 passed.** Exercises
  `eventBus.js`'s Validate → Authorize → Persist → Broadcast → Audit
  pipeline entirely against an injected `deps.store` — no network.
- `scripts/sdos-credential-path-test.js`: **10/10 passed.** Exercises
  `sdosEventsStore.js`'s direct-Postgres branch logic (success,
  duplicate, fail-closed-on-error) against a fake tagged-template
  `deps.db` — no network, no real `SDOS_DB_URL`.

## What Was Verified — REPOSITORY INSPECTION (this session)

- `sdosEventsStore.js`'s Phase 14E direct-Postgres branch
  (`insertEvent`, `appendLifecycleStage`, `isEventBusEnabled`) fails
  closed on error and never falls back to `service_role` mid-request,
  matching its own header claims.
- `broadcastEvent()` is unchanged — still authenticates via
  `getClient()` / `service_role` for Realtime, exactly as `ADR-0012`
  specifies it must remain.
- `supabase/functions/sdos-verify-14e-temp/index.ts` issues only
  `SELECT` statements (no `INSERT`/`UPDATE`/`DELETE` anywhere in the
  file), never logs or returns `SDOS_DB_URL`, and requires JWT
  verification (not deployed with `--no-verify-jwt`).
- No `ai/executives/**` or Groq import exists in `eventBus.js`,
  `runtimeCaller.js`, or `sdosEventsStore.js`.
- No RLS policy or grant was altered by this closure — no migration
  was written or modified as part of Phase 14E closure.
- `SDOS_DB_URL` is read only inside Deno Edge Function code
  (`sdosEventsStore.js`'s `getDbClient()`, and the now-removed temp
  verifier); no frontend, Vercel, or client-side file references it.

## Decision

Phase 14E is formally **closed**. The credential cutover documented as
outstanding in `ADR-0012` is complete, live-verified by the operator
via the temporary function, and the evidence is now permanently
captured in this ADR. The temporary verifier
(`supabase/functions/sdos-verify-14e-temp`) is removed following this
ADR's acceptance, per its own header's stated lifecycle ("delete after
use") and Golden Rule 8 of the Phase 14E audit brief.

## Consequences

- `sdosEventsStore.js`'s direct-Postgres path is now live-capable, not
  merely structurally tested — but remains **unreachable in
  production**, since `sdos_event_bus_enabled` stays `FALSE` and no
  caller besides the manual `runtimeCaller.js` / test scripts exists.
- No executive, dashboard, or production workflow was connected to the
  Event Bus by this closure.
- `sdos-verify-14e-temp` no longer exists in `supabase/functions/` or
  in `.github/workflows/deploy-functions.yml` after this ADR is
  accepted.

## What This ADR Does Not Do

- Does not activate `sdos_event_bus_enabled`.
- Does not connect Groq or any executive.
- Does not build `ai/dashboard/` or any Realtime subscriber.
- Does not define, number, or scope a next phase.

## Related Phases

- `ADR-0011` (Phase 14B) — credential-boundary scaffold, canonical
  transport decision.
- `ADR-0012` (Phase 14C) — feature-flag RLS gap closure; deferred the
  cutover this ADR closes.
- Phase 14E (this ADR) — direct-Postgres code path, live credential
  cutover, temporary verifier, closure.
