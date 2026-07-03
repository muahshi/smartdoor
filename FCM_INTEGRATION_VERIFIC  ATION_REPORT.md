# SmartDoor — FCM Production Integration: Verification Report

## Files changed (10)

| File | What changed |
|---|---|
| `supabase/functions/send-push/index.ts` | New event types `ai_escalation` + `status_reminder`; collapsible-tag logic for repeated bell/QR presses; optional `plateId` for subscription reminders; per-owner throttle generalized; `android.priority` hint added |
| `sw.js` | Uses the server-computed `tag` for collapsible types; added **Reply** action for conversational notifications; refined action sets per type; documented the Android-channel/custom-sound platform limits; cache bumped to v7 |
| `services/notificationDispatcher.js` | Mirrors the same collapsible-tag rule + action buttons for the foreground path; added `ai_escalation`/`status_reminder` configs; fixed stale header comment |
| `services/push.js` | Added `wireTokenRefresh()` — automatic FCM token refresh (interval + foreground-regain) |
| `js/dashboard.js` | Wires token refresh; adds a tap-driven "Enable notifications" banner (graceful fallback / iOS-safe permission request); widened realtime filter to surface `subscription_renewal`; Reply-action now focuses the reply box |
| `services/auth.js` | **Bug fix** — logout was cleaning up the wrong table (`owner_devices` via orphaned `pushRegistration.js`) instead of the real `push_subscriptions` table; now fixed |
| `visitor.html` | Wires the new `ai_escalation` push trigger into the AI turn handler |
| `supabase/functions/renewal-engine-cron/index.ts` | Adds a real `push` channel (Status Reminder) to the 7d/1d/expired windows |
| `services/renewalEngine.js` | Same push wiring for the admin-triggered manual run, kept consistent with the cron |
| `services/notifications.js` | Fixed a **broken/inert** push comment (claimed delegation to a DB trigger that doesn't match `send-push`'s payload contract and isn't even enabled) |

## Requirement-by-requirement

**1. Register every device + store FCM token** — already existed (`services/push.js` + migration `33_push_subscriptions.sql`), confirmed wired from `js/dashboard.js` on login. ✅

**2. Auto-refresh expired tokens** — `wireTokenRefresh()` re-calls `getToken()` on every tab foreground plus a 6h interval; upsert is idempotent so this is safe to call repeatedly. There's no client push-based "token changed" event in modern Firebase — periodic re-registration is the documented pattern. ✅

**3. Trigger send-push for all 7 event types** — Doorbell/QR/Text/Voice/SOS already worked; added the two missing ones:
   - **AI Escalation**: fires when the AI's reply is `High` priority or suggests call/text/voice (Critical/Emergency already has its own SOS path).
   - **Status Reminder**: fires from the renewal cron (and the admin manual-run equivalent) at the 7-day/1-day/expired windows. ✅

**4. Works when PWA closed/backgrounded** — unchanged, already correct: `sw.js`'s raw `'push'` listener reads the FCM data-only payload directly, no separate `firebase-messaging-sw.js` needed. ✅

**5. Notification click → correct screen** — already worked for `open`; **Reply** now deep-links into the Inbox thread and focuses the actual reply textbox. ✅

**6. Actions: Open / Reply / Dismiss** — added. Chromium renders these; Safari/iOS ignores `actions` per spec and falls back to tap-to-open (documented in `sw.js`, not a bug). ✅

**7. Tags — repeated bell presses replace, not duplicate** — this was actually the **opposite** of the existing behavior (a prior pass had deliberately made every event's tag unique to stop *different* events merging). Re-scoped: only `bell_ring`/`qr_scan` now collapse (keyed on plate, not row), with `renotify:true` so each press still re-alerts. Voice/text/SOS keep unique tags — distinct content shouldn't be silently replaced. ✅

**8. Android channel: high importance, custom sound, vibration, badge** — vibration pattern and badge count were already implemented and are unchanged. **Important caveat**: a plain installed PWA (no TWA/native wrapper) cannot create or configure an OS-level Android notification channel — Chrome owns one shared "Site notifications" channel per origin; channel importance is a person's OS setting, not something a website can set. `Urgency: high` (Web Push's equivalent lever) and `android.priority: high` are set on every message; `requireInteraction` keeps it on-screen. A true custom **sound** on a background/OS-delivered notification isn't exposed by the Web Notifications spec in any browser — the foreground synthesized doorbell chime (already in `js/dashboard.js`) is the closest achievable equivalent. Flagged rather than overclaimed. ⚠️ (platform limit, not a bug)

**9. iOS Safari Web Push** — works via the same standard Push API path (iOS 16.4+, PWA must be added to Home Screen). The one iOS-specific requirement — permission must be requested from a real user gesture — is now covered by the new "Enable notifications" banner instead of relying only on the automatic on-load prompt, which iOS silently ignores. ✅

**10. Graceful fallback on denied permission** — foreground toasts/in-tab notifications already worked regardless; the app no longer just gives up silently — it now shows a dismissible banner when permission is `default`, and does nothing further (no repeated nagging) once `denied`. ✅

## Bugs found and fixed along the way

- **Logout was cleaning up the wrong table.** `services/auth.js` imported `unregisterDevice` from the orphaned `services/pushRegistration.js` (an unused parallel registration scheme against an `owner_devices` table). The table actually used in production is `push_subscriptions`. Fixed to call `unsubscribeOwnerFromPush` from the real `services/push.js`.
- **A "delegated to DB trigger" push comment was fiction.** `sql/33_push_notifications.sql`'s trigger is dormant by its own setup comment, and even if enabled, posts a payload shape `send-push` has never accepted. Comment corrected to describe what actually delivers push today.

## Left alone (out of scope / not redesigned)

`services/pushRegistration.js`, `sql/33_push_notifications.sql` (`owner_devices` table + `fn_dispatch_push`) are an earlier, unused parallel push architecture. They're inert and harmless as-is; recommend removing them in a future cleanup pass, but deleting/rewriting them wasn't part of "work within the existing architecture."

## Not verifiable from static review — needs a live check after deploy

- Actual FCM delivery end-to-end (requires the real Firebase project + a physical/emulated device).
- `supabase functions deploy send-push` and `renewal-engine-cron` need to be redeployed for these changes to take effect (both are edge functions).
- Confirm `manifest.json`'s Android install banner and icons still validate after the `sw.js` cache-version bump (v6 → v7) — clients will pick up the new service worker on next visit/reload as usual.

