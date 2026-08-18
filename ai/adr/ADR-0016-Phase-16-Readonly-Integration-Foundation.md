# ADR-0016: Phase 16 — Read-Only Integration Foundation

## Status

Accepted (Phase 16). Builds the first executable read path against
`sdos_events` / `sdos_event_lifecycle`, on top of the write/broadcast
store `ADR-0011`/`ADR-0012` shipped (Phase 14A/14B/14E) and the
dormant permission/dashboard runtime `ADR-0014`/`ADR-0015` shipped
(Phase 15/15B).

## Problem

`permissionEngine.js` exists and is tested. The Event Bus
(`eventBus.js` + `sdosEventsStore.js`) exists and is tested and can
write events. The SDOS database boundary (`sdos_events`,
`sdos_event_lifecycle`) exists. `ai/dashboard/` exists as a fixture-
only foundation. But nothing in the repository can *read back* what
the Event Bus has written — there is no executable read path over
either table at all, only `insertEvent()`, `appendLifecycleStage()`,
and the narrow `isEventBusEnabled()` flag check.

## Existing Architecture

- `ai/integrations/supabase/sdosEventsStore.js` (Phase 14A/14E) — the
  one write/broadcast client, `service_role` with an optional
  `SDOS_DB_URL` / `sdos_service` direct-Postgres path for
  `insertEvent`, `appendLifecycleStage`, `isEventBusEnabled`.
  `broadcastEvent()` stays on `service_role` for Realtime,
  unconditionally.
- `sdos_events` / `sdos_event_lifecycle` (migration 72) — RLS enabled,
  zero anon/authenticated policies, `SELECT, INSERT` granted to
  `service_role` only, `UPDATE`/`DELETE` revoked from every role on
  both tables.
- `sdos_service` (migration 73) — a dormant, `NOLOGIN` Postgres role
  scoped to exactly these two tables via real RLS policies, pending a
  manual operator cutover `sdosEventsStore.js` already documents.
- `ai/integrations/DATA_CONTRACTS.md` — the `IntegrationResult`
  envelope (`outcome: OK | EMPTY | INTEGRATION_ERROR`, `data`,
  `source`, `fetched_at`, `error?`) every future integration read must
  produce.
- `feature_flags.sdos_event_bus_enabled` — `FALSE`, unrelated to
  reading (it gates `eventBus.js#emitEvent()`'s write pipeline, not
  any read).

## Real Gap

No function anywhere lets a caller read `sdos_events` or
`sdos_event_lifecycle` rows back. This blocks even the most basic
verification of what the Event Bus has actually persisted, and is a
prerequisite for any future dashboard live-data phase or executive
context read — neither of which this phase builds.

## Decision

**Option A — Isolated Reader.** Build a new, separate module,
`ai/integrations/supabase/sdosEventsReader.js`, with its own minimal
credential/bootstrap logic (`getClient()` / `getDbClient()`, structured
identically to `sdosEventsStore.js`'s own, but not shared code and not
an import from it).

It exposes exactly three capability-specific functions and nothing
else:

- `getRecentSdosEvents({ limit, event_type?, correlation_id? })` —
  capability `sdos_events.recent`
- `getSdosEventById({ event_id })` — capability `sdos_events.by_id`
- `getSdosEventLifecycle({ event_id })` — capability
  `sdos_event_lifecycle.by_event`

Every query is a hardcoded, parameterized statement against exactly
one of `sdos_events` or `sdos_event_lifecycle`. There is no
`query(table)` / `read(table)` / `select(table)` / `get(table)` /
`execute(sql)` or any table-name-as-parameter surface. No write method
of any kind exists in the file.

**Why `sdosEventsStore.js` was intentionally left untouched:** the
Phase 16 brief's own instruction is to preserve the existing Phase 14E
production write/broadcast store unchanged and avoid introducing a
dependency from the new read path into the existing write/broadcast
store. Concretely, that means:

- A bug, typo, or future change in the reader can never affect
  `insertEvent()`, `appendLifecycleStage()`, or `broadcastEvent()` —
  there is no shared module-level state (`_client`/`_dbClient` are
  reader-local, separate singletons) and no import edge between the
  two files in either direction.
- The store's own header comment already documents a careful,
  multi-phase credential history (14A → 14B → 14E). Adding read-only
  functions into that file would force every future reader of that
  header to separate write-path history from read-path history in the
  same block of prose — isolating the reader keeps both files legible
  on their own.
- The write store's fail-closed contract (`INTEGRATION_ERROR`, no
  silent `service_role` fallback once `SDOS_DB_URL` is configured) is
  reused *by convention*, not by shared code — this means a future
  change to one credential path's fail-closed behavior cannot
  accidentally alter the other's.

Option B (adding read methods directly to `sdosEventsStore.js`) was not
pursued — the repository contains no concrete security or technical
blocker that would have made Option A impossible, and the brief
directs Option A as the default absent such a blocker.

## Capabilities (exhaustive)

| Capability | Function | Table(s) | Filters |
|---|---|---|---|
| `sdos_events.recent` | `getRecentSdosEvents` | `sdos_events` | `limit` (required, 1–200, default 50), `event_type?`, `correlation_id?` |
| `sdos_events.by_id` | `getSdosEventById` | `sdos_events` | `event_id` (required, non-empty string) |
| `sdos_event_lifecycle.by_event` | `getSdosEventLifecycle` | `sdos_event_lifecycle` | `event_id` (required, non-empty string) |

## Security Boundary

- Reads only `sdos_events` and `sdos_event_lifecycle` — no other table
  name appears anywhere in the file (verified by the new test suite's
  scenario 15, which scans the source for every `.from('...')` and
  `FROM <table>` reference).
- No INSERT/UPDATE/DELETE/UPSERT/RPC of any kind — verified
  structurally by test scenario 11 and a literal grep during this
  phase's static audit (`.insert(`/`.update(`/`.delete(`/`.upsert(`
  all absent from executable code).
- Credential path fails closed exactly like `sdosEventsStore.js`: if
  `SDOS_DB_URL` is configured but the direct-Postgres query fails, the
  reader returns `INTEGRATION_ERROR` and does **not** fall back to
  `service_role`. It falls back to `service_role` only when
  `SDOS_DB_URL` is absent entirely — the same non-silent, documented
  fallback design the store already uses, applied to reads.
- No credential value, connection string, or password is ever included
  in a returned error (test scenario 14) or logged.
- Never imported by any SmartDoor production file, browser/frontend
  code, `eventBus.js`, `permissionEngine.js`, `authorityData.js`, or
  any executive runtime module (confirmed by grep during the static
  audit — zero matches).
- `sdos_event_bus_enabled` is unrelated to this phase and remains
  `FALSE`; this reader does not check or depend on it (reading history
  is meaningful whether or not new events are currently being
  written).

## Data Contract

Every function returns `ai/integrations/DATA_CONTRACTS.md`'s
`IntegrationResult` envelope exactly: `{ outcome: 'OK' | 'EMPTY' |
'INTEGRATION_ERROR', data, source, fetched_at, error? }`. `source` is
`'sdos_service'` when the direct-Postgres path answered the read,
`'supabase'` when the `service_role` PostgREST path did, and
`'validation'` when a request was rejected before any query ran
(invalid `limit` or `event_id`) — this distinguishes an input error
from a downstream integration failure without inventing a fourth
`outcome` value.

## Tests

`scripts/sdos-events-reader-test.js`, same hand-written
`check()`/`assert()` convention as the three existing SDOS test files
(no test framework dependency). 16 checks covering the brief's 15
required scenarios (two checks cover scenario 10 — DB failure and
client failure paths — for extra coverage), all using injected
`deps.db` / `deps.client` fakes; no network call, no `SDOS_DB_URL` set.

Regression re-run of all pre-existing suites (all unmodified by this
phase):

- `node scripts/sdos-permission-engine-test.js` — 15/15 passed.
- `node scripts/sdos-event-bus-test.js` — 15/15 passed.
- `node scripts/sdos-credential-path-test.js` — 10/10 passed.
- `node scripts/sdos-events-reader-test.js` — 16/16 passed (new).

`node --check` passed for both new JS files.

## Static Security Verification (this phase)

Grepped both new files for: `GROQ_API_KEY` (none), `SUPABASE_SERVICE_ROLE_KEY`
usage (present only in the same documented fallback-credential pattern
`sdosEventsStore.js` already uses, never logged), `SDOS_DB_URL` logging
(none — referenced only as an env var name, never printed),
`console.log` of any credential (none), `fetch(` (none — the Supabase
client import is the same dynamic `esm.sh` pattern the store uses, not
a raw `fetch`), `.insert(`/`.update(`/`.delete(`/`.upsert(` (none in
executable code), `eventBus`/`permissionEngine`/executive imports
(none), and a repo-wide grep confirming `sdosEventsReader` is not
referenced from any `.html` file or any file outside
`ai/integrations/supabase/sdosEventsReader.js`,
`scripts/sdos-events-reader-test.js`, this ADR, and the two README/
registry doc updates.

## What Was NOT Implemented

Per the Phase 16 brief, explicitly:

- Event Bus was not activated. `sdos_event_bus_enabled` remains
  `FALSE`, unchanged.
- No feature flag changed.
- No RLS policy changed. No grant changed. Migrations 72–74 untouched.
- No Groq connection of any kind — `supabase/functions/groq-proxy/`
  and `ai/integrations/groq/` untouched.
- No executive runtime — no executive was created, wired, or given
  access to this reader.
- Dashboard was not made live — `ai/dashboard/` is not connected to
  `sdosEventsReader.js`; it remains fixture/read-only foundation mode,
  unchanged from `ADR-0015`.
- No production write path of any kind was created.
- No emitter was added; the reader never calls `eventBus.js`.

## Files Touched

**Created:**
- `ai/integrations/supabase/sdosEventsReader.js`
- `scripts/sdos-events-reader-test.js`
- `ai/adr/ADR-0016-Phase-16-Readonly-Integration-Foundation.md` (this file)

**Modified:**
- `ai/integrations/supabase/README.md` — added an "Addendum — SDOS
  Phase 16" section documenting the reader as a third, isolated client,
  distinct from both the existing write store and the still-
  undocumented-only future production-data read client.
- `ai/integrations/INTEGRATION_REGISTRY.md` — added an addendum note
  (not a table row, since the existing table's columns are shaped for
  the eight vendor folders' undocumented-only future capabilities,
  which this is not).

**Not modified (`package.json`):** the two most recent existing SDOS
test files (`sdos-credential-path-test.js`,
`sdos-permission-engine-test.js`) are not registered as `package.json`
scripts, so the existing convention is inconsistent/optional. This
phase follows the same non-mandatory pattern and does not add a new
script entry, per the brief's own "only add ... if the repository's
existing package convention requires it."

**Not touched:** everything in the brief's "Files That Must Not Be
Touched" list — `sdosEventsStore.js`, `eventBus.js`, `runtimeCaller.js`,
`permissionEngine.js`, `authorityData.js`, `sql/**`, migrations 72–74,
RLS policies, `feature_flags`, `supabase/functions/groq-proxy/**`, any
other `supabase/functions/**`, `js/**`, `services/**`, `android/**`,
`admin.html`, `app.html`, society-admin pages, partner portal,
dashboard production code, executive documentation, `AUTHORITY_MATRIX`
files, `ADR-0014`, `ADR-0015`.

## Rollback

Additive-only. Rollback is deleting the three new files and reverting
the two doc-section additions — no migration, no flag, no credential,
and no production code path is affected either way. `sdosEventsStore.js`
and every existing test suite are untouched and continue to pass with
or without this phase's files present.

Files to remove for a full rollback of this phase:
- `ai/integrations/supabase/sdosEventsReader.js`
- `scripts/sdos-events-reader-test.js`
- This ADR
- Revert the addendum sections in `ai/integrations/supabase/README.md`
  and `ai/integrations/INTEGRATION_REGISTRY.md`

## Next Dependency

A future, separately-approved phase could wire `ai/dashboard/` to this
reader for live (not fixture) event history display — that phase would
need its own founder approval per `AUTHORITY_STANDARD.md`'s "Any
change to `ai/integrations/` scope" row and per `READONLY_POLICY.md`'s
existing gate, and is explicitly not started by this phase.
