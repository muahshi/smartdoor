# Integration Registry

The single index of every boundary point SDOS has documented between
itself and the outside world. Mirrors `ai/knowledge/MASTER_INDEX.md`'s
role as an entry point, scoped to `ai/integrations/` only.

## Status

SDOS Phase 10 (Read-Only Integration Layer + ADRs). Documentation only.
No entry in this registry has a working client, a credential, or a
network path today — see each integration's own README `Status`
section and `READONLY_POLICY.md` for the gate every one of them must
pass before that changes.

## Registry

| Integration | Real Production Home Today | SDOS Access (Documented, Not Built) | Type |
|---|---|---|---|
| `github/` | `.github/workflows/deploy-functions.yml` (CI/CD only — no runtime API usage in production code) | Future SDOS Capability only — no existing SmartDoor read path to extend | Future-only |
| `supabase/` | `services/supabase.js` (vendored client), `sql/`, `supabase/functions/` | Read-only future client into the same Postgres database, RLS-scoped | Extends existing |
| `groq/` | `supabase/functions/groq-proxy/`, `services/aiOwnerAssistant.js`, `services/aiReceptionist.js` | Read-only future access to usage/session metadata, never a proxy for live inference on SDOS's behalf | Extends existing |
| `razorpay/` | `services/payments.js`, `supabase/functions/create-razorpay-order/`, `razorpay-webhook/`, `razorpay-refund/`, `verify-razorpay-payment/` | Read-only future access to payment/subscription status, never order creation, capture, or refund | Extends existing |
| `firebase/` | `services/push.js` (FCM), `supabase/functions/send-push/` | Read-only future access to delivery/subscription health, never sending a push | Extends existing |
| `analytics/` | `services/analytics.js`, `services/adminAnalytics.js`, `services/societyAnalytics.js` | Read-only future access to the same aggregate metrics these services already compute | Extends existing |
| `notifications/` | `services/notificationDispatcher.js`, `services/notifications.js`, `services/communicationCenter.js` | Read-only future access to dispatch/delivery logs, never triggering a notification | Extends existing |
| `storage/` | Supabase Storage buckets referenced by `services/qr.js`, `services/messaging.js`, `services/activityCenter.js` | Read-only future access to bucket metadata/signed-read URLs, never upload/delete | Extends existing |

## Reading This Table

- **"Real Production Home Today"** is where the actual, working
  integration already lives in the SmartDoor codebase — SDOS does not
  duplicate, wrap, or re-implement any of it (`ai/integrations/README.md`'s
  existing "What does NOT go here" rule, restated per-integration here).
- **"SDOS Access (Documented, Not Built)"** describes the future,
  read-only capability this phase documents — not something that exists
  today. Every row is subject to `READONLY_POLICY.md` and
  `ai/core/permissions/READONLY_INTEGRATION_POLICY.md` without exception.
- **"Extends existing"** means SmartDoor already has a real,
  production integration with this vendor, and SDOS's future access
  would read a narrow, scoped slice of the same underlying system —
  never a second, competing integration.
- **"Future-only"** (currently only `github/`) means no existing
  SmartDoor production code talks to this vendor at all; documenting it
  here is purely forward-looking, for a capability (e.g. the AI CTO
  reading commit/PR history) that has no present-day counterpart to
  extend.

## Addendum — SDOS Phase 16: first built, read-only capability

The table above indexes the eight vendor folders' *documented-only,
future* capabilities against real SmartDoor production data — none of
those rows have working code yet. Phase 16 is a different kind of
entry: `ai/integrations/supabase/sdosEventsReader.js` is the first
capability in this entire registry that is actually **built and
executable** today, but it reads only two SDOS-internal tables
(`sdos_events`, `sdos_event_lifecycle` — see
`ai/docs/implementation/PRODUCTION_BOUNDARY.md`), never any production
table. It does not fit the table's columns (there is no vendor row to
extend — `supabase/`'s row above still describes an undocumented,
different future capability), so it is recorded here as a note rather
than a table row:

- **Module:** `ai/integrations/supabase/sdosEventsReader.js`
- **Capabilities:** `sdos_events.recent`, `sdos_events.by_id`,
  `sdos_event_lifecycle.by_event` — exhaustive, capability-specific,
  no generic query surface.
- **Access:** read-only, two SDOS-owned tables only, never a
  SmartDoor production table.
- **Governed by:** `ai/adr/ADR-0016-Phase-16-Readonly-Integration-Foundation.md`.

## Adding a Future Integration

A ninth (or later) integration folder is added the same way these eight
were: a README documenting purpose, capabilities, read-only policy,
authentication approach, inputs, outputs, data contracts, error
handling, security considerations, rate limits, and future capability —
then an entry added to this table. Adding a *row* to this registry is
documentation and does not itself grant any access; per
`ai/core/permissions/PERMISSION_MODEL.md`'s default table, granting
actual read capability against any row above is a universal
founder-approval event under `AUTHORITY_STANDARD.md` ("Any change to
`ai/integrations/` scope").

## Relationship to the Rest of SDOS

- Each row's linked folder is the authoritative detail; this table is
  an index, not a substitute for reading it.
- `DATA_CONTRACTS.md` defines the shared request/response shape every
  integration's own "Data Contracts" section follows.
- `READONLY_POLICY.md` and `SECURITY_GUIDELINES.md` apply uniformly to
  every row above — neither is restated per-integration beyond a link.
