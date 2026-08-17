# ADR-0014: Phase 15 — Permission/Authority Runtime + Read-Only SDOS Dashboard Foundation

## Status

Accepted (Phase 15). Closes Phase 15 Parts A and B. Does not open,
define, scope, or authorize Phase 16 or any executive runtime.

## Context

`ADR-0013` closed Phase 14E with the SDOS Event Bus live-verified but
intentionally left `sdos_event_bus_enabled = FALSE`. Everything built
in Phase 14A–14E moves *events*; nothing yet checks whether an
*action* is authorized in the first place. `ai/core/permissions/`
already documented the mechanical contract for that check
(`PERMISSION_MODEL.md`, `SECURITY_MODEL.md`,
`READONLY_INTEGRATION_POLICY.md`) but contained zero runtime code —
"architecture and contract only... no check described below has ever
run." Separately, `ai/dashboard/` contained only a README describing
intent; no file existed.

Phase 15's brief scoped exactly two additive deliverables: (A) a real,
pure implementation of the permission contract, and (B) a read-only
foundation for the dashboard. Explicitly out of scope: executive
runtime, Groq↔SDOS wiring, Event Bus activation, any production-table
write path, and any autonomous behavior.

## Already Exists (Phase 15 Audit)

- `ai/core/events/eventBus.js`, `ai/core/runtime/runtimeCaller.js`,
  `ai/integrations/supabase/sdosEventsStore.js` — Phase 14 runtime,
  unmodified by this phase.
- `core/standards/AUTHORITY_STANDARD.md` and every
  `ai/executives/<role>/AUTHORITY_MATRIX.md` — real, substantive rule
  tables (not placeholders). `ai/core/standards/README.md` documents
  that the physical standards library lives at repo-root
  `core/standards/`, not `ai/core/standards/`, and treats this as a
  deliberately-unresolved path gap for a future founder decision. This
  phase resolves every `ai/core/standards/<n>.md` reference the same
  way that README already does — by redirecting to `core/standards/<n>.md`
  — and does not touch that gap.
- `ai/dashboard/README.md` — described intent (standalone, additive,
  never wired into `admin.html`/`app.html`) but no dashboard file
  existed until this phase.

## Real Gap Closed by This Phase

- `ai/core/permissions/permissionEngine.js` + `authorityData.js` — the
  first runtime implementation of the `PermissionCheck` →
  `PermissionResult` contract.
- `scripts/sdos-permission-engine-test.js` — the first test coverage
  for it.
- `ai/dashboard/index.html`, `dashboard.js`, `dashboard.css` — the
  first files in `ai/dashboard/`.

## Authority-Data Source Mapping

`authorityData.js` is a static transcription, not a reinterpretation:

| Data in `authorityData.js` | Source |
|---|---|
| `UNIVERSAL_APPROVAL_ROWS` (10 rows) | `core/standards/AUTHORITY_STANDARD.md` — "Universal Founder-Approval Rows" table, verbatim-in-meaning |
| `EXECUTIVES.<role>.approvalRows` | Each role's own `ai/executives/<role>/AUTHORITY_MATRIX.md` — "Founder Approval Rules — Always Required, No Exceptions" table |
| `EXECUTIVES.<role>.unilateralRows` | Each role's own `AUTHORITY_MATRIX.md` — "May Decide Unilaterally (Future Phase...)" table |
| `EXECUTIVES.<role>.deniedRows` | Intentionally empty for every role — see "DENIED Ambiguity" below |

Every row carries a `source` string built from the file it was
transcribed from, so `permissionEngine.js`'s `rule_cited` output is
traceable to an actual file, per `PERMISSION_MODEL.md` Rule 4.

## DENIED Ambiguity and Founder Decision

**Finding (Phase 15 audit):** `PERMISSION_MODEL.md` requires the
engine to support a `DENIED` outcome, reserved for "actions a role's
own `AUTHORITY_MATRIX.md` explicitly rules out." A full read of all
six `ai/executives/<role>/AUTHORITY_MATRIX.md` files found **no row
structurally distinct from "Founder Approval Rules" or "May Decide
Unilaterally."** The one row that reads most like a denial — the
CEO's "no override authority over CTO/COO/CFO/CMO/CPO" — is itself
listed under CEO's *Founder Approval Rules* table, i.e. it resolves to
`AWAITING_APPROVAL`, not a separate prohibited category.

**Founder decision (recorded, not inferred):**
1. Do not invent or infer a new DENIED rule.
2. Implement `DENIED` as a real, mechanically-reachable outcome in
   `permissionEngine.js`, because the contract requires it.
3. Ship every real executive in `authorityData.js` with
   `deniedRows: []` — `DENIED` is therefore mechanically supported but
   **currently unreachable from real, documented authority data.**
4. The CEO "no override authority" row is tested as `AWAITING_APPROVAL`
   (matching where the matrix actually places it), not reclassified
   as `DENIED`.
5. The required "explicitly denied" test scenario is covered by
   injecting a synthetic, clearly-labeled authority-data override into
   `checkPermission()`'s second argument — never by adding anything to
   `authorityData.js`. This mirrors the existing repo convention of
   dependency-injecting a fake store (`sdos-event-bus-test.js`'s
   `makeFakeStore()`) to test a code path in isolation.

This preserves the contract's `ALLOWED` / `AWAITING_APPROVAL` /
`DENIED` distinction exactly as documented — nothing is collapsed —
while not fabricating a rule no matrix currently states. A future
phase that adds an explicit DENIED row to any
`ai/executives/<role>/AUTHORITY_MATRIX.md` (a founder-approved matrix
edit, not a runtime change) would make `DENIED` reachable from real
data with zero changes to `permissionEngine.js`.

## `ALLOWED` Phase-Gating

`PERMISSION_MODEL.md`'s Default Behavior table states a matched "may
decide unilaterally" row only resolves to `ALLOWED` once
`ai/core/` + `ai/integrations/` both exist as real, runtime-ready
components — a condition this repository does not meet today
(`ai/integrations/` remains empty). This is modeled as an explicit
`integrationsReady` parameter to `checkPermission()`, defaulting to
`false` (matching current reality) rather than hard-coded as
permanently impossible. No caller in this phase passes `true`; the
default is what every real invocation in this repository uses today.

## Security Boundary

- `permissionEngine.js` and `authorityData.js` import nothing outside
  `ai/core/permissions/`. No database client, no network call, no
  credential, no LLM call, no dependency on
  `ai/integrations/supabase/sdosEventsStore.js` or
  `ai/core/events/eventBus.js`.
- `checkPermission()` has no side effects — it reads its arguments and
  the static data and returns a plain frozen object. It does not emit
  a `permission.checked` / `approval.requested` event; wiring a future
  caller to do that is explicitly deferred (see the note at the bottom
  of `permissionEngine.js`) because it would require a database
  dependency this phase must not add.
- The dashboard (`ai/dashboard/`) makes zero network calls, holds zero
  credentials, and its only import is the same pure
  `permissionEngine.js`. It is not linked from, and does not link to,
  any existing SmartDoor page.
- `sdos_event_bus_enabled` was not touched (still `FALSE`).
  `groq-proxy`, all `supabase/functions/`, all RLS policies, and
  migrations 72–74 were not touched.

## Why the Dashboard Is Fixture/Read-Only

`ai/dashboard/README.md` already stated the dashboard's first
capability must be additive and isolated, and
`READONLY_INTEGRATION_POLICY.md` gates any future `ai/integrations/`
read access behind its own, separately-approved phase — which has not
happened. With no approved read path into production data yet, the
only safe options were "nothing" or "fixture/foundation." This phase
chose the latter: the Permission Engine panel is genuinely live
(computed by real code, in-browser), while the Event Log panel is
static fixture data explicitly labeled as such, shaped to match
`sdos_events`/`sdos_event_lifecycle` so a future, separately-approved
live version can reuse the same layout.

## What Was Deliberately NOT Implemented

- No `ai/integrations/` client of any kind (still empty, per its own
  Phase 0 statement).
- No `permission.checked`/`approval.requested` event emission.
- No wiring of any executive to this permission engine or to Groq.
- No Realtime subscriber.
- No write, approval-mutation, or executive control on the dashboard.
- No change to `sdos_event_bus_enabled`.
- No new DENIED authority rule (see above).

## Tests and Results

Re-ran unmodified, pre-existing suites first (regression check):

- `node scripts/sdos-event-bus-test.js` — **15/15 passed.**
- `node scripts/sdos-credential-path-test.js` — **10/10 passed.**

New suite:

- `node scripts/sdos-permission-engine-test.js` — **15/15 passed.**
  Covers: universal founder-approval category; role-specific
  founder-approval category; phase-gated unilateral row staying
  `AWAITING_APPROVAL` by default and resolving to `ALLOWED` only when
  `integrationsReady: true` is explicitly passed; the DENIED mechanism
  via a synthetic fixture; confirmation that `DENIED` is unreachable
  from the real `authorityData.js` (all six executives'
  `deniedRows: []`); uncategorized and arbitrary-unmatched categories;
  unknown executive; three malformed-request shapes (non-object,
  missing fields, wrong types) all throwing `TypeError`; rule-citation
  traceability across five representative cases; and an exhaustive
  sweep of every real executive × every known category confirming
  `ALLOWED` never appears with the integrations gate closed.

Syntax validation (`node --check`) passed for all three new `.js`
files. No lint/build tooling exists for `ai/dashboard/` (plain HTML/JS/
CSS, no bundler in this repo) — visually reviewed instead; its one
import (`permissionEngine.js`) was confirmed via `node --check` and
via the test suite that exercises the same function.

## Rollback Approach

Every artifact in this phase is new and additive; nothing existing was
modified except two documentation files
(`ai/core/standards/README.md` was *not* touched; only
`ai/dashboard/README.md`'s Status section, to stop describing the
folder as empty). Rollback is deleting the phase's new files and
reverting that one README section — no migration, no flag, no
production code path is affected either way.

Files to remove for a full rollback:
- `ai/core/permissions/permissionEngine.js`
- `ai/core/permissions/authorityData.js`
- `scripts/sdos-permission-engine-test.js`
- `ai/dashboard/index.html`
- `ai/dashboard/dashboard.js`
- `ai/dashboard/dashboard.css`
- This ADR

## Next Dependency Before Executive Runtime

Per `PERMISSION_MODEL.md`'s own Default Behavior table and
`READONLY_INTEGRATION_POLICY.md`, an executive cannot gain real
execution authority until, at minimum: (1) `ai/integrations/` exists
as a real, scoped, read-only client (its own separately-approved
phase, per `READONLY_INTEGRATION_POLICY.md` rule 2); and (2) a caller
wires `permissionEngine.js`'s output into
`ai/core/runtime/AGENT_LIFECYCLE.md`'s `AWAITING_APPROVAL` state and
into `ai/core/events/eventBus.js` as `permission.checked` /
`approval.requested` / `approval.decided` events (deferred in this
phase specifically because it would require a database dependency).
Both remain founder-approved future phases, not assumed here.
