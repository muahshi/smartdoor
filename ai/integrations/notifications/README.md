# Integration: Notifications

## Status

Documentation only, SDOS Phase 10. No client, connection, or credential
exists. Extends an existing production integration — see below.

## Purpose

SmartDoor already runs a real-time notification pipeline —
`services/notificationDispatcher.js` (the single source of truth for
dispatching bell/QR/voice/text/SOS notifications, with its own
dispatch log: created → delivered/failed → clicked),
`services/notifications.js`, and `services/communicationCenter.js`.
This integration would give a future COO/CPO-flavored SDOS capability
read-only visibility into dispatch/delivery health — never dispatching
a notification itself.

## Supported Capabilities (Future, Documented Only)

- Read dispatch-log aggregates already produced by
  `notificationDispatcher.js`'s `getDispatchLog()` — counts by event
  type (qr_scan, bell_ring, voice, text, sos) and status
  (created/delivered/failed/clicked).
- Read failure-rate trends per event type, as an operational health
  signal.

## Read-Only Access Policy

Governed by `ai/integrations/READONLY_POLICY.md`. A future SDOS
Notifications read never calls `showNotification()` or any function
that would create, deliver, or mark a notification as clicked — it
reads the existing log only, exactly as it stands, after the fact.

## Authentication Approach (Future)

No separate credential anticipated, for the same reason as
`analytics/`: the dispatch log lives in data
`notificationDispatcher.js` already persists, most plausibly read via
the `supabase/` integration rather than a standalone auth path.

## Inputs

`capability`, `requested_by`, `scope` (event type, date range).

## Outputs

Aggregate counts and rates only — never a specific notification's full
content or the specific visitor/owner it was addressed to, matching
`SECURITY_GUIDELINES.md` guideline 3.

## Data Contracts

Follows `ai/integrations/DATA_CONTRACTS.md`.

## Error Handling

`INTEGRATION_ERROR` on any failed/timed-out read, per
`ERROR_HANDLING.md`.

## Security Considerations

- No notification content or recipient identity exposed — aggregates
  only, per guideline 3.
- `notificationDispatcher.js` remains the **only** place that calls
  `showNotification()` in production, per its own existing "single
  source of truth" design — this integration does not introduce a
  second caller, ever, even a read-triggered one.

## Rate Limits

None defined (no client exists).

## Future SDOS Capability

A future COO capability could flag a rising SOS-notification failure
rate as an urgent operational risk, surfaced through
`ai/executives/coo/`'s existing incident-response playbook, faster than
a human noticing the same pattern in raw logs. Documented intent
only — not built in this phase.
