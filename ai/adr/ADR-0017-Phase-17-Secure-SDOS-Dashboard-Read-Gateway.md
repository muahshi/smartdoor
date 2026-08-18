# ADR-0017: Phase 17 — Secure SDOS Dashboard Read Gateway

## Status

Accepted (Phase 17). Builds the first browser-reachable, authenticated
read path onto the Phase 16 isolated reader
(`ai/integrations/supabase/sdosEventsReader.js`), and connects
`ai/dashboard/`'s Event Log panel to it. Does not activate the Event
Bus, does not implement any executive runtime, does not touch Groq.

## Problem

`sdosEventsReader.js` (Phase 16) can read `sdos_events` /
`sdos_event_lifecycle`, but only from a trusted server context that
already holds a `service_role` or `sdos_service` credential — it is
never safe to import into a browser bundle. `ai/dashboard/`'s Event
Log panel (Phase 15B) has therefore been fixture-only since it was
built; ADR-0014/ADR-0015 explicitly deferred a live version to "a
future, separately-approved phase."

## Audit (this phase, before any code was written)

Inspected per the Phase 17 brief: `ai/dashboard/**`,
`sdosEventsReader.js`, `sdosEventsStore.js`, `DATA_CONTRACTS.md`,
`READONLY_POLICY.md`, `ai/core/permissions/**`, `ai/core/events/**`,
`sql/72–74`, every `supabase/functions/**` Edge Function for its
auth/CORS convention, and ADR-0014/0015/0016.

**Findings:**
- `sdosEventsReader.js` (Phase 16) is unmodified-safe to import
  directly: three named capabilities only, no table/SQL parameter, no
  write method, fails closed. No change needed or made.
- `supabase/functions/_shared/adminAuth.ts` (`verifyAdminSession()`,
  `adminCan()`) + `_shared/cors.ts` (`restrictedCors()`) is a real,
  already-in-production authentication/authorization/CORS pattern used
  by every sensitive admin Edge Function (`admin-data`,
  `admin-analytics`, etc.) — clear evidence, no new mechanism needed.
- No `AUTHORITY_MATRIX.md`, `authorityData.js` row, or SQL migration
  defines who is authorized to view SDOS event data specifically. The
  closest existing convention is the RBAC `'system'` resource key
  (`adminCan(ctx, 'system', 'read')`), already used to gate
  `admin-data`'s `operations_health` handler — but no migration grants
  the literal `'system'` key to any role other than `super_admin`
  (via its `'*'` wildcard), and no document ties it to SDOS
  specifically. This was a real ambiguity, not a place to guess.

**Founder decision (recorded, not inferred):** reuse the existing
`adminCan(ctx, 'system', 'read')` resource/action pair, rather than
hard-coding `role_name === 'super_admin'` or inventing a new `'sdos'`
resource key. Today this resolves to super_admin-only (no other role
has been granted `'system'`), but it is future-proof: if a later,
separately-approved RBAC change ever grants `'system':'read'` to
another role (e.g. to let a broader ops/support tier see
`operations_health` too), that same role gains SDOS visibility with
zero code change here — which is the intended shape of the existing
`'system'` convention, not a new one invented for this phase.

## Architecture

```
Browser (ai/dashboard/)
      |  Authorization: Bearer <admin session token>
      v
supabase/functions/sdos-dashboard-gateway/index.ts   (Deno/HTTP/auth wrapper)
      v
supabase/functions/sdos-dashboard-gateway/gatewayLogic.js
      (pure: capability allow-list, field validation, dispatch, error sanitization)
      v
ai/integrations/supabase/sdosEventsReader.js   (Phase 16, UNMODIFIED)
      v
sdos_events / sdos_event_lifecycle
```

**Why the logic was split into `gatewayLogic.js`:** the brief's own
Test Requirements section calls for unit coverage of validation/
dispatch/error-handling scenarios that don't require a live Supabase
session. `index.ts`'s `verifyAdminSession()`/`adminCan()` wrapper is
inherently Deno + database-session shaped — exactly like every other
authenticated admin Edge Function in this repo, none of which have a
Node unit test today. Rather than either (a) leaving the
security-relevant capability/validation logic untested, or (b)
inventing a new test-runner/mocking approach this repo doesn't use,
the capability allow-list, field validation, dispatch, and error
sanitization were factored into `gatewayLogic.js` — a plain,
dependency-injectable ESM module with no Deno-only import, exactly
matching how `sdosEventsReader.js` itself is already structured and
tested. `index.ts` is now a thin wrapper: CORS, auth, method/JSON
parsing, and three calls into `gatewayLogic.js`.

## Capabilities (exhaustive — same three as Phase 16, no new one added)

| Capability | Reader function | Allowed body fields |
|---|---|---|
| `sdos_events.recent` | `getRecentSdosEvents` | `capability`, `limit` (1–200), `event_type?`, `correlation_id?` |
| `sdos_events.by_id` | `getSdosEventById` | `capability`, `event_id` |
| `sdos_event_lifecycle.by_event` | `getSdosEventLifecycle` | `capability`, `event_id` |

Any other `capability` value, or any field not on that capability's
own allow-list, is rejected with `400` before `sdosEventsReader.js` is
ever called. There is no `/query`, `/table`, `/sql`, `/select-any`, or
generic reader anywhere in either new file.

## Security Boundary

- **Auth**: `verifyAdminSession(req, db)` (existing, unmodified
  `_shared/adminAuth.ts`) — rejects missing/expired/revoked/inactive
  sessions with the existing `adminAuthError()` 401 response, before
  any request body is even parsed.
- **Authz**: `adminCan(ctx, 'system', 'read')` — see Founder Decision
  above. Runs before `validateCapabilityRequest()`/dispatch.
- **Method**: POST only; every other method (including GET) is
  rejected before auth or body parsing run at all.
- **CORS**: `restrictedCors()` (existing, unmodified) — production
  domains + dev origins + `*.vercel.app` previews only. No wildcard
  `*` anywhere in this gateway.
- **No write surface**: `gatewayLogic.js` imports exactly
  `getRecentSdosEvents`, `getSdosEventById`, `getSdosEventLifecycle`
  from `sdosEventsReader.js` and nothing else from it; neither new
  file contains `.insert(`/`.update(`/`.delete(`/`.upsert(`/an RPC
  call of any kind (verified by test suite scenario "no write-shaped
  call" and a static grep during this phase's audit).
  Deliberately no audit-log write either — writing to
  `admin_audit_logs` for a pure read was considered and left out of
  this phase's scope (see Remaining Gaps) rather than added by
  assumption.
- **No arbitrary table/SQL/credential-shaped input**: every capability
  has its own fixed, hand-written field allow-list; an unrecognized
  field (whatever it's named — `table`, `sql`, `query`, etc.) is
  rejected before dispatch. Verified structurally (allow-list
  contents) and behaviorally (rejection tests) by the new suite.
- **Error sanitization**: `sanitizeResult()` replaces a reader
  `INTEGRATION_ERROR`'s raw `error` string with a fixed, generic
  message before it can reach the browser — defense in depth on top of
  `sdosEventsReader.js`'s own guarantee (Phase 16) that it never puts
  a credential in that string to begin with. The real error is logged
  server-side only (`console.error`, Edge Function logs).
- **Credentials**: no `SUPABASE_SERVICE_ROLE_KEY`, `SDOS_DB_URL`, or
  any credential value appears in `ai/dashboard/**` (grepped, this
  phase's static audit). The one credential the dashboard ever holds
  — an admin session token — is pasted in by the founder, held in a
  single in-memory JS variable, never written to
  localStorage/sessionStorage, never logged, sent only as the
  `Authorization` header on the gateway call itself.
- **Event Bus**: not read, not checked, not touched.
  `sdos_event_bus_enabled` remains `FALSE`; neither new file
  references the flag or imports `eventBus.js` in executable code
  (doc-comment prose explaining this is not executable code — verified
  by the test suite with comments stripped before the check runs).
- **Groq / executives**: neither new file imports anything from
  `ai/integrations/groq/`, `supabase/functions/groq-proxy/`, or
  `ai/executives/**`.

## Data Contract

The gateway's HTTP response is `{ success: true, result: <IntegrationResult> }`
on a request that passed auth + validation, where `<IntegrationResult>`
is exactly `ai/integrations/DATA_CONTRACTS.md`'s envelope (`outcome`,
`data?`, `source`, `fetched_at`, `error?`), post-sanitization. Auth/
validation failures before that point use the existing
`{ success: false, message }` shape every other admin Edge Function
already returns (matching `admin-data`'s convention, not a new shape).

## Dashboard

`ai/dashboard/index.html` / `dashboard.js` gained one new section,
"Live SDOS Events," with:
- A Gateway URL field and an admin-session-token field (both entered
  by the founder; the page has no login flow of its own and never
  will — see file header comment in `dashboard.js` for why).
- "Load Live Events" → `sdos_events.recent`, with optional `limit`/
  `event_type` filters — renders OK (LIVE-labeled rows, replacing the
  Event Overview badge from FIXTURE to LIVE DATA), EMPTY, and
  INTEGRATION_ERROR states distinctly.
- "Load Lifecycle" → `sdos_event_lifecycle.by_event` for a pasted
  `event_id` — same three-state handling.

Nothing on this page makes a network call on page load; the gateway is
only ever called after an explicit click. The page remains standalone
— not linked into `admin.html`, `app.html`, or any production
navigation — and `dashboard.css` needed no changes (every class used
already existed from the Phase 15B foundation).

## Tests

`scripts/sdos-dashboard-gateway-test.js` — same hand-written
`check()`/`assert()` convention as the four existing SDOS test files.
23 checks covering all 20 scenarios named in the Phase 17 brief (see
the file's own header comment for the mapping and for why
`index.ts`'s Deno-only auth wrapper is verified structurally, not by a
live HTTP call — matching this repo's existing convention that no
Edge Function's `verifyAdminSession()` wrapper is Node-unit-tested).

```
node scripts/sdos-dashboard-gateway-test.js   → 23/23 passed (new)
```

Regression (all pre-existing suites, unmodified):

```
node scripts/sdos-permission-engine-test.js   → 15/15 passed
node scripts/sdos-event-bus-test.js           → 15/15 passed
node scripts/sdos-credential-path-test.js     → 10/10 passed
node scripts/sdos-events-reader-test.js       → 16/16 passed
```

Total: **79/79 passing** (56 baseline + 23 new).

`node --check` passed for `gatewayLogic.js` and
`scripts/sdos-dashboard-gateway-test.js`. `index.ts` cannot be
`node --check`ed (Deno-only imports); syntax was verified by careful
manual review and by the fact that it is now a thin wrapper around the
already-checked `gatewayLogic.js`.

## Static Security Verification (this phase)

- No `SUPABASE_SERVICE_ROLE_KEY`/`service_role` literal in
  `ai/dashboard/*.js`/`*.html`.
- No `SDOS_DB_URL` in `ai/dashboard/*.js`/`*.html`.
- No `.insert(`/`.update(`/`.delete(`/`.upsert(` in either new gateway
  file (executable code, comments excluded).
- No wildcard `Access-Control-Allow-Origin: *` — the gateway uses only
  the existing `restrictedCors()` helper.
- `sdosEventsReader.js` byte-identical to its Phase 16 state (SHA-256
  compared before/after this phase — unchanged).
- `sdos-dashboard-gateway` is referenced only from
  `ai/dashboard/index.html`/`dashboard.js`, its own function
  directory, its test file, and this ADR — grepped repo-wide,
  confirmed not wired into any unrelated production file.

## What Was NOT Implemented

Per the Phase 17 brief, explicitly:
- Event Bus was not activated; `sdos_event_bus_enabled` remains
  `FALSE`, unchanged.
- No feature flag changed. No RLS policy changed. No grant changed.
  Migrations 72–74 untouched.
- No Groq connection of any kind.
- No executive runtime.
- `sdosEventsReader.js` was not modified.
- No new RLS policy was added — the preferred (and used)
  architecture is Edge Function → existing reader → existing
  credential boundary, exactly as the brief directed.
- No admin_audit_logs write for gateway reads (see Remaining Gaps).
- No rate limiting was added to this gateway — it is authenticated
  (`system:read`, effectively super_admin-only today), matching
  `admin-data`'s own precedent of not rate-limiting authenticated
  admin endpoints (only the unauthenticated `--no-verify-jwt`
  notification-dispatch functions use `_shared/edgeRateLimit.ts`).

## Files Touched

**Created:**
- `supabase/functions/sdos-dashboard-gateway/index.ts`
- `supabase/functions/sdos-dashboard-gateway/gatewayLogic.js`
- `scripts/sdos-dashboard-gateway-test.js`
- `ai/adr/ADR-0017-Phase-17-Secure-SDOS-Dashboard-Read-Gateway.md` (this file)

**Modified:**
- `ai/dashboard/index.html` — added the "Live SDOS Events" section
  (gateway URL / token / filter fields, Load buttons, status/lifecycle
  result panels); updated the header badge, banner copy, and footer to
  describe Phase 17; added an `id` to the Event Overview badge so it
  can flip from FIXTURE to LIVE DATA.
- `ai/dashboard/dashboard.js` — added the live-fetch module
  (`callGateway`, `loadLiveEvents`, `loadEventLifecycle`,
  `renderLiveEventRows`, `liveStatus`), wired their buttons in `init()`,
  updated the file header comment and the Event Bus card's detail text.
  `FIXTURE_EVENTS`, `renderEventLog()` (fixture path), and every
  Permission Runtime function are unmodified.
- `ai/dashboard/README.md` — updated the Status section to describe
  the live gateway path alongside the still-present fixture default.

**Not modified (`ai/dashboard/dashboard.css`):** every CSS class the
new UI needed (`.panel`, `.panel-head`, `.tester`, `.field input`,
`button.run`, `.badge.allowed/inactive/denied/fixture`, `.result`,
`.mono`) already existed from the Phase 15B foundation.

**Not touched:** everything in the brief's "Files That Must Not Be
Touched" list — `sdosEventsStore.js`, `eventBus.js`,
`runtimeCaller.js`, `permissionEngine.js`, `authorityData.js`,
`sql/**`, migrations 72–74, RLS policies, `feature_flags`,
`supabase/functions/groq-proxy/**`, every other pre-existing
`supabase/functions/**`, `js/**`, `services/**`, `android/**`,
`admin.html`, `app.html`, society-admin, partner portal, ADR-0014,
ADR-0015.

## Rollback

Additive-only for every file except the three `ai/dashboard/` edits,
which are additive within those files (no existing fixture code path,
export, or function was removed or renamed). Rollback:
1. Delete `supabase/functions/sdos-dashboard-gateway/` (both files).
2. Delete `scripts/sdos-dashboard-gateway-test.js`.
3. Delete this ADR.
4. In `ai/dashboard/index.html`: remove the "Live SDOS Events"
   section; revert the header badge/banner/footer text.
5. In `ai/dashboard/dashboard.js`: remove the live-fetch module and
   its two `init()` listener registrations; revert the file header
   comment and the Event Bus card detail text.
6. Revert `ai/dashboard/README.md`'s Status section.

No migration, no flag, no credential path, and no production code
outside `ai/dashboard/` and the new function directory is affected
either way. `sdosEventsReader.js` and every pre-existing test suite
are untouched and continue to pass with or without this phase's files
present.

## Remaining Gaps (recorded, not resolved by this phase)

- **No audit trail for gateway reads.** Every write path in
  `admin-data` logs to `admin_audit_logs`; this gateway does not, so
  there is currently no durable record of who viewed SDOS event
  history and when (Edge Function logs are the only trace, and are
  not queryable the way `admin_audit_logs` is). Adding a
  `admin_audit_logs` insert here would be a small, additive follow-up
  but was not assumed by this phase — it's a new write this specific
  brief didn't ask for, and logging *reads* (as opposed to the writes
  every existing `admin_audit_logs` row already records) is a slightly
  different precedent worth a founder call, not a default.
- **Cross-boundary import path.** `gatewayLogic.js` imports
  `../../../ai/integrations/supabase/sdosEventsReader.js` — the first
  time any `supabase/functions/**` file has imported something outside
  `supabase/functions/` in this repository (every existing Edge
  Function only imports from `_shared/`, `npm:`, `esm.sh`, or
  `deno.land`). This is what the brief's "Reuse Phase 16 Reader"
  section directs, and Supabase's Edge Runtime is expected to follow
  local relative imports through its module graph the same way it
  already follows `_shared/*.ts` — but this specific cross-directory
  pattern hasn't been exercised in this repo before. Recommend the
  operator do one `supabase functions deploy sdos-dashboard-gateway`
  dry run / staging deploy to confirm the bundler picks up
  `sdosEventsReader.js` before relying on this in production.
- **No rate limiting on the gateway itself.** Acceptable today because
  it's authenticated and effectively super_admin-only (see Founder
  Decision), but if `system:read` is ever granted more broadly, revisit
  whether `_shared/edgeRateLimit.ts` should be added.

## Next Dependency

None opened by this phase. Per the brief's Stop Condition, Phase 18 is
explicitly not started — no Groq, no executive runtime, no Event Bus
activation, no production business-data integration.
