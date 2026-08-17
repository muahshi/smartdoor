# ADR-0015: Phase 15B — Dashboard Foundation, Correcting ADR-0014's File Claim

## Status

Accepted (Phase 15B). Corrects one factual claim in `ADR-0014` without
editing it, per this folder's Rule 4 (additive-only; a later phase
that materially changes a prior decision gets a new ADR, not an edit
to the old one). Does not open, define, scope, or authorize Phase 16,
an executive runtime, Event Bus activation, or Groq↔SDOS wiring.

## Context

`ADR-0014` ("Phase 15: Permission/Authority Runtime + Read-Only SDOS
Dashboard Foundation") states, under "Real Gap Closed by This Phase,"
that `ai/dashboard/index.html`, `dashboard.js`, and `dashboard.css`
were created in that phase, and its Rollback section lists them as
files to remove.

A repository audit at the start of Phase 15B found this was
inaccurate: `ai/dashboard/` contained only `README.md`. No
`index.html`, `dashboard.js`, or `dashboard.css` existed anywhere in
the repository. `ai/core/permissions/permissionEngine.js`,
`authorityData.js`, and their test suite — the other half of
ADR-0014's claimed scope — **did** exist exactly as described and
passed 15/15 tests unmodified.

Per this phase's own Golden Rules ("do not hide this discrepancy" /
"treat actual code/files as source of truth"), this is recorded here
rather than silently patched into ADR-0014.

## Decision

1. Do not edit `ADR-0014`. Its Permission Engine content (Authority-
   Data Source Mapping, DENIED Ambiguity, ALLOWED Phase-Gating,
   Security Boundary for `permissionEngine.js`) remains accurate and
   authoritative for that component.
2. Treat ADR-0014's dashboard-file claim as describing intent that had
   not yet been executed, not a fabricated decision — the *design*
   ADR-0014 documents for the dashboard (read-only, standalone,
   Permission Engine panel live / Event panels fixture, no
   credentials) is what Phase 15B actually built. Phase 15B implements
   that design; it does not redesign it.
3. This phase creates the three files ADR-0014 described:
   `ai/dashboard/index.html`, `ai/dashboard/dashboard.js`,
   `ai/dashboard/dashboard.css`.

## What Was Built

- A standalone, vanilla HTML/CSS/JS dashboard. Its only import is the
  real `ai/core/permissions/permissionEngine.js` (and
  `authorityData.js`, which that module already depends on) — no
  build step, no framework, no other dependency.
- **Permission Runtime panel — live.** A dropdown lets a human pick any
  real executive and any real action category drawn directly from
  `authorityData.js` (including a synthetic "uncategorized" option)
  and calls the real `checkPermission()` in-browser. The
  `integrationsReady` gate defaults to `false`, matching every real
  invocation in this repository today.
- **System Status panel.** Five hand-declared cards (Permission
  Runtime / Event Bus / Executive Runtime / Groq-SDOS / Realtime
  Subscriber) stating current, verified reality: Permission Runtime
  live; Event Bus OFF; the other three do not exist. Values are not
  fetched from anywhere — they reflect this phase's own repository
  audit, the same one recorded in ADR-0014 and here.
- **Event Bus / Event Log panels — fixture.** `sdos_events` and
  `sdos_event_lifecycle` carry no anon/authenticated RLS policy
  (`sql/72`), and `sdos_event_bus_enabled` is explicitly excluded from
  the client-readable `feature_flags` policy (`sql/73`). No
  `ai/integrations/` read client exists — `READONLY_INTEGRATION_POLICY.md`
  gates that behind its own, separately-approved phase, which has not
  happened. With no approved read path, this phase ships static
  fixture rows, each visibly tagged `FIXTURE` in the UI, shaped to
  match the real table columns so a future live version can reuse the
  same layout without a redesign.

## Data Access Decision (unchanged from ADR-0014, re-confirmed)

No direct browser/Supabase read was added. No RLS was weakened. No
credential (`service_role`, `SDOS_DB_URL`, `SUPABASE_SERVICE_ROLE_KEY`,
or any other) appears anywhere under `ai/dashboard/` — confirmed by a
literal grep of the new files as part of this phase's test pass, in
addition to manual review. No Edge Function was invented. This remains
the one real, documented gap: a future, separately-approved
`ai/integrations/` phase is the only sanctioned path to a live Event
Log panel.

## Security Boundary

- No file under `ai/dashboard/` performs a `fetch()`, opens a database
  connection, or calls `createClient()`.
- Not linked from, and does not link to, `admin.html`, `app.html`,
  `society-admin.html`, `partner-portal.html`, or any other existing
  SmartDoor page.
- `sql/*`, migrations 72–74, RLS, grants, `feature_flags.sdos_event_bus_enabled`,
  `supabase/functions/groq-proxy/*`, `.github/workflows/deploy-functions.yml`,
  `ai/executives/**`, `js/**`, and `services/**` were not touched.
- `permissionEngine.js` and `authorityData.js` were not modified —
  reused exactly as ADR-0014 shipped them.

## Tests and Results

Re-ran all three pre-existing suites first (regression check, all
unmodified by this phase):

- `node scripts/sdos-permission-engine-test.js` — 15/15 passed.
- `node scripts/sdos-event-bus-test.js` — 15/15 passed.
- `node scripts/sdos-credential-path-test.js` — 10/10 passed.

`node --check` passed for `ai/dashboard/dashboard.js`. No lint/build
tooling exists for this plain HTML/CSS/JS folder (same as ADR-0014's
own note); verified instead by a manual import-resolution check (the
dashboard's relative import of `permissionEngine.js` loads and returns
a correct result) and a literal grep confirming no privileged
credential string or network/write call appears anywhere under
`ai/dashboard/`.

## What Was Deliberately NOT Implemented

Identical to ADR-0014's list — none of it changed in this phase:

- No `ai/integrations/` client of any kind.
- No `permission.checked` / `approval.requested` event emission.
- No wiring of any executive to this permission engine or to Groq.
- No Realtime subscriber.
- No write, approval-mutation, or executive control on the dashboard.
- No change to `sdos_event_bus_enabled` (still `FALSE`).
- No new DENIED authority rule.

## Rollback Approach

Additive-only; nothing pre-existing was modified except two
documentation files (`ai/dashboard/README.md`'s Status section,
`PROJECT_STATE.md`, `CURRENT_STATUS.md`). Rollback is deleting this
phase's new files and reverting those doc sections — no migration, no
flag, no production code path is affected either way.

Files to remove for a full rollback of this phase specifically:
- `ai/dashboard/index.html`
- `ai/dashboard/dashboard.js`
- `ai/dashboard/dashboard.css`
- This ADR

## Related Phases

Read alongside `ADR-0014`, which remains authoritative for the
Permission Engine's design and the dashboard's intended shape — this
ADR records only that the dashboard files themselves did not exist
until this phase, and that this phase built them to ADR-0014's
existing design.
