# Integration: Firebase (Cloud Messaging)

## Status

Documentation only, SDOS Phase 10. No client, connection, or credential
exists. Extends an existing production integration — see below.

## Purpose

SmartDoor already uses Firebase Cloud Messaging (FCM) for real
background push notifications to owner devices — `services/push.js`
(owner-side device registration) and `supabase/functions/send-push/`
(the actual send). This integration would give a future COO/CTO-flavored
SDOS capability read-only visibility into push **delivery health**
(registration counts, token-expiry patterns, delivery failures) — never
sending a push itself.

## Supported Capabilities (Future, Documented Only)

- Read aggregate device-registration counts and token-refresh health
  (relevant given `services/push.js`'s own documented note that FCM
  tokens can expire or rotate and there is no push-based
  "token changed" callback — only periodic `getToken()` re-checks).
- Read delivery success/failure counts already logged by
  `send-push`/`services/notificationDispatcher.js`'s dispatch log
  (`getDispatchLog()`).

## Read-Only Access Policy

Governed by `ai/integrations/READONLY_POLICY.md`. A future SDOS
Firebase read never calls `send-push`, never triggers
`showNotification()`, and never touches an owner's registered device
token beyond confirming *that* a healthy token exists — it cannot read
the token value itself for reuse, only a health/status signal.

## Authentication Approach (Future)

`services/push.js` uses `firebase-app-compat.js` /
`firebase-messaging-compat.js` loaded client-side; `send-push` holds
FCM server credentials. A future SDOS read of aggregate delivery
metrics most plausibly routes through the `supabase/` integration
(reading whatever `notificationDispatcher.js`'s dispatch log already
persists) rather than a direct Firebase Admin SDK credential — a
direct credential is not assumed necessary by this phase.

## Inputs

`capability`, `requested_by`, `scope` (aggregate/date-range only).

## Outputs

Counts and health signals only (registered-device count, delivery
success rate, token-refresh failure rate) — never a device token, a
notification's actual title/body content, or which specific owner
received what.

## Data Contracts

Follows `ai/integrations/DATA_CONTRACTS.md`. No extension defined in
this phase.

## Error Handling

`INTEGRATION_ERROR` on any failed/timed-out read, per
`ERROR_HANDLING.md`.

## Security Considerations

- Device tokens (FCM registration tokens) are never exposed to SDOS in
  readable form, even in aggregate-read responses — only counts/health
  derived from them, per `SECURITY_GUIDELINES.md` guideline 3.
- No notification content (bell/QR/voice/text/SOS event details)
  enters this integration's scope — that data belongs to the
  `notifications/` integration's own, separately-scoped documentation,
  and even there is subject to the same minimum-necessary-data rule.

## Rate Limits

None defined (no client exists). Any future direct FCM Admin SDK usage
would be subject to Firebase's own quota; the Supabase-mediated
dispatch-log read path is preferred to avoid adding a second credential
surface for read-only purposes.

## Future SDOS Capability

A future COO capability could flag a rising token-refresh failure rate
as an operational risk (owners silently losing background notification
delivery) before it becomes a support-ticket pattern. Documented intent
only — not built in this phase.
