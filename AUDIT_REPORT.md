# SmartDoor — End-to-End Stabilization Audit

**Honest scope note first:** this is a ~16,000 line app (45 services, 27 edge
functions, 29 SQL migrations). I traced Flows 1, 2, 3, 4, 6, 8 in full (every
click → service → table → realtime channel → UI handler), and Flows 5, 7, 9,
10 at service/wiring level. I did not line-by-line audit all 27 edge
functions or all 45 services — that's genuinely a multi-day job, not
something to fake. Below is what I actually found and verified by reading
the real code, with file/line evidence, not guesses.

Good news: this codebase is already well-engineered. Most of what looked
broken on paper turned out to be intentionally redesigned (e.g. visitor.html
bypasses `isPlateActive()` on purpose — there's a comment explaining the
"Activation Pending" bug it replaced). The real bugs found are narrow and
fixable.

---

## 1. Bug Report

### 🔴 BUG-1 — SOS dedicated alert never fires (Flow 6)
**File:** `services/logs.js` → `subscribeToSOS()`
Visitor SOS button logs `event_type: 'sos_triggered'` (confirmed in
`visitor.html` bindActions). `subscribeToSOS()` was filtering for
`event_type === 'sos'` — a string that is **never written anywhere** in the
visitor_logs table. Result: the dashboard's dedicated red-flash + "🚨 SOS
EMERGENCY ALERT!" toast never triggered. SOS still showed up as a generic
log line (because `subscribeToLogs` catches all event types), so it wasn't
fully silent, but the high-priority alert path was dead.
**Fixed.**

### 🔴 BUG-2 — No sound on Bell or SOS (Flow 3 & Flow 6)
**File:** `js/dashboard.js`
The only `Audio()` call in the whole dashboard was for voice-note playback.
Bell Ring and SOS had zero audio feedback despite being explicitly required
("Bell Sound" in Flow 3, "Sound alert" in Flow 6). Added a dependency-free
WebAudio beep generator (no new asset files needed) — two-tone chime on
bell, four-tone urgent beep on SOS/emergency message.
**Fixed.**

### 🔴 BUG-3 — `notifications` table is write-only; nothing ever reads it (Flow 9)
**File:** `services/notifications.js` (system), `js/dashboard.js` (consumer)
`createNotification()`/`dispatch()` correctly writes every lifecycle event
(order created, manufacturing started, packed, shipped, delivered,
activated, subscription expiry) into the `notifications` table with
title/body/payload/priority — exactly per the Flow 9 spec. But I grepped the
**entire repo** for `getNotifications`, `subscribeToNotifications`,
`markNotificationRead` — zero callers anywhere except the file that defines
them. The dashboard never subscribed to this table; it only listens to
`visitor_logs` and `call_logs`/`message_logs`. So every order/shipping/
activation/subscription-expiry notification was being created and then
never shown to the owner anywhere. The system was built, then accidentally
never wired into the UI.
**Fixed (minimally):** wired `subscribeToNotifications()` into dashboard's
realtime setup, surfacing `status_change` type notifications as toasts
(bell/call/voice/SOS already have their own surfaces, so only lifecycle
events are routed through this channel to avoid duplicate toasts). A full
notification inbox UI (read/unread list, bell icon dropdown) is the natural
next step but is new UI surface, not a "fix broken connection" — flagging
for your decision since you said don't redesign UI.

### 🔴 BUG-4 — AI Receptionist silently never used Groq (Flow 7)
**File:** `visitor.html` (chat call), `supabase/functions/groq-proxy/index.ts`
Hardcoded `model: 'llama3-70b-8192'` — this model id was decommissioned by
Groq. Every real AI chat call has been failing against Groq's API and
falling back to `mockClassify()` (the offline keyword-matching fallback)
**silently**, with no visible error to you or the visitor — the UI still
says "Powered by GROQ AI" and the fallback responses are good enough that
this wasn't obviously broken, but the actual LLM-personalized, context-aware
behavior described in Flow 7 (memory, conversation history, varied phrasing
via temperature) was never running.
**Fixed:** switched to `llama-3.3-70b-versatile` (current supported Groq
model, already in the function's own whitelist) in both the visitor chat
call and the edge function's default fallback.
**Action needed from you:** confirm `GROQ_API_KEY` is actually set in
Supabase secrets — if it's missing, this will keep silently falling back to
mock with no visible error. I added that as a verification step below.

### 🟡 BUG-5 — Custom status falls back to wrong badge color (Flow 2)
**File:** `visitor.html` (both `statusMap` definitions)
Dashboard's quick "set custom message" action sets `current_status: 'custom'`
(`updateOwnerStatus(ownerId, 'custom', msg)`). Visitor page's `statusMap`
had no `custom` key, so it silently fell back to `statusMap.available`,
showing a **green "Available"** badge even though the owner set a custom
status. The custom message text itself still rendered correctly (separate
field), but the badge color/class was misleading.
**Fixed:** added a `custom` entry (busy/amber styling) to both the initial
render and the realtime `updateStatusBadge()` map — they must be kept in
sync; that's worth a future refactor (see recommendations).

---

## 2. What I checked and found correctly wired (no fix needed)

- **Flow 1 (QR scan → visitor page):** `visitor.html init()` does its own
  direct plate lookup (intentionally bypasses `services/plates.js
  isPlateActive()` — documented decision, replacing a prior "always shows
  Activation Pending" bug). QR scan is logged to `visitor_logs`, picked up
  by the dashboard's `subscribeToLogs` realtime channel, shown as a toast
  and bumps the scan counter. Works end-to-end.
- **Flow 2 (Status Manager):** `updateOwnerStatus()` → `security_rules`
  table → visitor.html's `subscribeToStatusChanges` (postgres_changes on
  `security_rules` UPDATE) → badge + AI status note update instantly, no
  refresh. Verified working.
- **Flow 4 (Call):** `initiateMaskedCall` → provider fallback chain
  (Exotel → Twilio) → `call_logs` row → `call-status-webhook` edge function
  normalizes provider callbacks, updates `call_status`/`duration`, and
  implements automatic family-tier routing fallback on no-answer/busy.
  Verified the full chain reads consistently.
- **Flow 5 (Text/Voice message):** `sendTextMessage`/`uploadVoiceNote` →
  `message_logs`/`voice_notes` → realtime via `subscribeToCommunicationLogs`
  → unread badge via `get_unread_counts` RPC. Verified working.
- **Flow 6 (SOS bypass logic):** Emergency path correctly never checks
  `current_status`/DND/night mode anywhere in `triggerEmergency` →
  `triggerEmergencyBroadcast` — bypass is real, not just a comment.
- **Realtime architecture (Flow 8):** every channel I traced
  (`logs:`, `sos:`, `call_logs:`, `message_logs:`, `status:`,
  `notifications:`, `voice_notes:`) uses Supabase `postgres_changes`
  correctly scoped with `filter: owner_id=eq.{ownerId}` — no polling
  anywhere in the flows I checked.

## 3. Not fully audited at line-level (be aware)

- All 27 edge functions except `groq-proxy` and `call-status-webhook` were
  only spot-read at signature/import level, not fully traced.
- Analytics (Flow 10): `_bumpStat()` in dashboard.js only updates
  `todayScans`, `callsRouted`, `voiceMessages`, `bellRings`, `blockedSpam`
  live — "AI Conversations" and "Popular Hours"/"Visitor Types" appear to be
  computed separately (likely in `services/analytics.js` /
  `getWeeklyData`/`getMonthlyData`/heatmap functions) on page load, not
  pushed live. I did not verify whether those re-query after every relevant
  insert or only on dashboard load/refresh — recommend a follow-up pass
  specifically on `services/analytics.js` if live analytics matters to you
  beyond the 5 counters above.
- `services/exotel.js` / `services/twilio.js` provider implementations
  (actual masking number logic) not read in this pass.

---

## 4. Files changed (in this delivery zip)

| File | Change |
|---|---|
| `services/logs.js` | Fix SOS event_type filter mismatch |
| `js/dashboard.js` | Add bell/SOS WebAudio sound; wire orphaned `notifications` table into realtime + toasts |
| `visitor.html` | Fix decommissioned Groq model id; add `custom` status badge mapping (x2) |
| `supabase/functions/groq-proxy/index.ts` | Update default model fallback to match |

No SQL migrations were needed for these fixes — all were app-layer logic
bugs, not schema issues.

## 5. Verification checklist

1. **SOS sound/flash:** open dashboard in one tab, visitor.html (with a real
   plate slug) in another. Hold SOS 2s → confirm red flash, "🚨 SOS
   EMERGENCY ALERT!" toast, and 4-beep alert sound all fire together.
2. **Bell sound:** tap Ring Doorbell on visitor page → confirm dashboard
   plays the 2-tone chime alongside the existing toast.
3. **Groq AI:** confirm `GROQ_API_KEY` is set in Supabase Edge Function
   secrets (Dashboard → Edge Functions → groq-proxy → Secrets). Send a chat
   message on visitor.html, check Supabase function logs for the
   `groq-proxy` invocation — should return 200, not silently fall to
   `mockClassify`. If it's still falling back, the key is missing/invalid.
4. **Lifecycle notifications:** trigger an admin action that calls
   `notifyShipped`/`notifyActivated`/etc. (or test via
   `supabase.rpc`/direct insert) → confirm a toast appears on the owner
   dashboard without refresh.
5. **Custom status badge:** dashboard → set a custom status message →
   visitor page should show an amber "busy"-style badge with your custom
   text, not green "Available".

## 6. Production readiness

Core visitor → owner real-time loop (scan, status, bell, call, voice, text,
SOS) is solid and was already close to production-ready before this pass —
the 5 bugs above were real but narrow, not architectural rot. The biggest
remaining gap is the orphaned `notifications` table: it's a fully-built
multi-channel (in-app/whatsapp/sms/push/email) notification engine that's
only ~20% wired into UI. I patched the minimum to stop silently dropping
lifecycle events; a proper "Notifications inbox" screen is a real feature
addition you should scope separately, not a stabilization fix.
