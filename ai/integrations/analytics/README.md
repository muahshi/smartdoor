# Integration: Analytics

## Status

Documentation only, SDOS Phase 10. No client, connection, or credential
exists. Extends an existing production integration — see below.

## Purpose

SmartDoor already computes its own business analytics in production —
`services/analytics.js` (financial/revenue metrics), `services/adminAnalytics.js`
(admin-facing rollups), and `services/societyAnalytics.js`
(society/community-level metrics), all reading from Supabase directly.
This integration would give SDOS executives (primarily CFO, CMO, CPO)
read-only access to those **same already-computed** aggregates, rather
than SDOS re-deriving its own parallel analytics logic — avoiding a
second, potentially-drifting source of the same numbers.

## Supported Capabilities (Future, Documented Only)

- Read financial metrics already computed by `getFinancialMetrics()`
  and similar functions in `services/analytics.js` (revenue today/
  month/year, MRR, ARR, refunds).
- Read admin-facing operational rollups from `services/adminAnalytics.js`.
- Read society/community-level engagement metrics from
  `services/societyAnalytics.js`.

## Read-Only Access Policy

Governed by `ai/integrations/READONLY_POLICY.md`. This integration
never re-implements `services/analytics.js`'s own computation logic —
it reads the **output** of that existing logic (via the `supabase/`
integration reading the same underlying tables, or a future dedicated
read path) rather than duplicating the aggregation, per
`ai/docs/COMPANY_BRAIN.md` Rule 3 ("additive, in-place... don't fork
parallel copies").

## Authentication Approach (Future)

No separate credential is anticipated — this integration most likely
never needs its own authentication at all, since it reads the same
Supabase tables `services/analytics.js` already reads, via the
`supabase/` integration's own scoped access. Documented here as its own
entry per the requested folder structure, not because it needs an
independent auth path.

## Inputs

`capability`, `requested_by`, `scope` (date range, metric name).

## Outputs

The same shape `services/analytics.js`'s existing functions already
return (e.g. `{revenueToday, revenueMonth, revenueYear, mrr, arr,
refunds}`) — SDOS does not invent a new metrics vocabulary alongside
the one production already uses.

## Data Contracts

Follows `ai/integrations/DATA_CONTRACTS.md`, with `data` mirroring
`services/analytics.js`'s existing return shapes rather than a
SDOS-invented schema.

## Error Handling

`INTEGRATION_ERROR` on any failed/timed-out read, per
`ERROR_HANDLING.md`.

## Security Considerations

- No row-level customer data (individual visitor/owner records) is
  exposed through this integration — only the aggregates
  `services/analytics.js` already computes for admin consumption.
- Aggregation logic itself is never modified or reimplemented by SDOS —
  restated from Read-Only Access Policy above.

## Rate Limits

None defined (no client exists). Any future read should be cached or
throttled at the SDOS side rather than recomputing expensive aggregates
on every executive turn — a specific caching strategy is not decided in
this phase.

## Future SDOS Capability

A future CFO capability could read `getFinancialMetrics()`-equivalent
data directly into its financial-model reasoning instead of relying
solely on the Company Brain's `business_rules.md` snapshot. A future
CMO capability could similarly read growth/engagement metrics for
campaign analysis. Documented intent only — not built in this phase.
