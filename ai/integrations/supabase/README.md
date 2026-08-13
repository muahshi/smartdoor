# Integration: Supabase

## Status

Documentation only, SDOS Phase 10. No client, connection, or credential
exists. Extends an existing production integration — see below.

## Purpose

SmartDoor's entire backend (Postgres database, Auth, Storage, Realtime,
Edge Functions) already runs on Supabase — `services/supabase.js` is
the single vendored client every other production service imports. This
integration would give future SDOS executives a **read-only, RLS-scoped**
window into that same database, so they can reason about real business
state (orders, activations, plates, subscriptions) instead of only the
static Company Brain snapshot in `ai/knowledge/`.

## Supported Capabilities (Future, Documented Only)

- Read aggregate/row-level data from specific tables an executive's own
  documented context needs (e.g. CFO reading `orders`/`subscriptions`
  status; COO reading `manufacturing`/`shipping` state) — never a
  general-purpose query surface.
- Read Edge Function *metadata* (invocation counts, error rates via
  `services/monitoring.js`'s existing surfaces) — never invoking a
  function with a side effect.
- Confirm existence/status of a specific row (e.g. "does plate X have
  an active subscription") without exposing unrelated columns.

## Read-Only Access Policy

Governed in full by `ai/integrations/READONLY_POLICY.md` and
`ai/core/permissions/READONLY_INTEGRATION_POLICY.md`. Specifically for
Supabase: any future client authenticates as a role subject to the
**same Row-Level Security policies** SmartDoor's own frontend already
respects. It never uses the `service_role` key that bypasses RLS (the
key several `supabase/functions/admin-*` Edge Functions use
server-side today) — that would grant SDOS more access than an ordinary
authenticated user has, violating least-privilege.

## Authentication Approach (Future)

Same pattern as `services/supabase.js`: credentials read from
environment configuration at call time, never hardcoded or checked into
`ai/`. A future SDOS Supabase client would use a distinct,
narrowly-scoped API key/role — not SmartDoor's existing anon key or
service-role key — so its access can be audited and revoked
independently of the production app.

## Inputs

Per `DATA_CONTRACTS.md`'s `IntegrationRead` envelope: `capability` (one
of the items above), `requested_by` (executive role), `scope` (specific
table/columns/row filter, e.g. `{table: "orders", filter: {status:
"paid"}, columns: ["id","total_amount","created_at"]}`).

## Outputs

Per `DATA_CONTRACTS.md`'s `IntegrationResult` envelope: `data` shaped
as the requested rows/aggregate only, `source: "supabase"`,
`fetched_at`. Never a raw table dump or full-schema introspection
result.

## Data Contracts

Follows `ai/integrations/DATA_CONTRACTS.md` exactly. No
Supabase-specific extension to the envelope is defined in this phase.

## Error Handling

Any failed or timed-out read resolves to `INTEGRATION_ERROR` per
`ai/core/runtime/ERROR_HANDLING.md` — fails closed, never substitutes
stale Company Brain data silently in its place (that substitution, if
it happens, is a `CONTEXT_LOADING.md`-governed fallback the calling
executive chooses explicitly, not something this integration decides).

## Security Considerations

- RLS never bypassed (see Read-Only Access Policy above).
- No PII beyond what the requesting executive's documented context
  actually needs — e.g. a CFO revenue read never needs visitor phone
  numbers.
- Distinct credential from SmartDoor's production app, per
  `SECURITY_GUIDELINES.md` guideline 2.

## Rate Limits

None defined in this phase (no client exists to rate-limit). A future
implementation should stay well under Supabase's own project-level
connection/request limits and should never compete with production
traffic for the same connection pool — a dedicated read-replica or
pooled connection is a reasonable future design point, not decided
here.

## Future SDOS Capability

A future phase may let CFO/COO/CTO executives query live operational
state directly (e.g. "how many orders are pending fulfilment right
now") rather than relying solely on the Company Brain's periodic
snapshots. This is explicitly **not** built in Phase 10 — see
`ai/core/context/CONTEXT_LOADING.md` step 5 for how a future live read
would rank against Company Brain context once it exists.

## Addendum — SDOS Phase 14A: a second, narrower, write-capable client

The read-only posture above governs any future SDOS read of *SmartDoor
production* data and remains unchanged. Phase 14A adds one distinct,
much narrower capability that this section documents so the two are
never confused: `sdosEventsStore.js` (this folder) writes to exactly
two SDOS-owned tables — `sdos_events` and `sdos_event_lifecycle`
(`sql/72_sdos_event_bus_foundation.sql`) — and nothing else. It uses
`service_role` (unlike the read-only client described above, which
explicitly never does), because those two tables are not SmartDoor
production data; see `ai/docs/implementation/SECURITY_IMPLEMENTATION_PLAN.md`
"Write Operations" for why this is scoped and why a narrower,
purpose-built DB role remains a documented Phase 14B improvement over
reusing `service_role`.
