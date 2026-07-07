# SmartDoor — Phase 2 WebRTC "Tap to Talk" — Audit + Implementation Report

## 1. Pre-Implementation Audit

### Already Exists (Phase 0/1 — untouched, reused as-is)
| Component | File | What it does |
|---|---|---|
| Feature flags | `services/featureFlags.js`, `sql/38_webrtc_phase0_phase1.sql` | `feature_flags` table (`webrtc_global_enabled`, `webrtc_kill_switch`) + per-owner `security_rules.webrtc_calling_enabled`. `isWebRTCEnabledForOwner()` combines all three, fail-safe to `false`. |
| Presence | `services/presence.js` | Supabase Realtime **Presence** channel `presence:owner:{ownerId}`. `joinOwnerPresence()` already wired into `js/dashboard.js`. `getOwnerPresenceSnapshot()` built but had zero callers before this phase. |
| RTC config | `config/rtcConfig.js` | `getIceServers()` (STUN-only placeholder), `WEBRTC_CONNECT_TIMEOUT_MS = 15000`, `RTC_MONITORING_EVENTS` vocabulary. All previously unused. |
| Masked calling | `services/communication.js` (`initiateMaskedCall`), `services/exotel.js`, `services/twilio.js`, `supabase/functions/initiate-call`, `supabase/functions/call-status-webhook`, `supabase/functions/_shared/providers/{exotel,twilio}.ts` | Provider-fallback masked calling. **Not modified.** |

### Real Gap (what Phase 2 had to build)
- No signaling transport existed (no way to exchange SDP/ICE between visitor and owner).
- `getOwnerPresenceSnapshot()` and `getIceServers()` had no caller — Phase 2 is the first thing that calls them.
- No visitor-facing "Tap to Talk" UI/logic.
- No owner-facing "Incoming Call" UI.
- No automatic 15s-timeout-or-failure → masked-call fallback wiring.
- No observability table for WebRTC attempt outcomes (distinct from `call_logs`, which is masked-call-only).

### Files Created
- `services/webrtcSignaling.js` — ephemeral Supabase Realtime **Broadcast** transport (offer/answer/ICE). No DB writes.
- `services/webrtcCall.js` — visitor-side orchestration: flag check → presence check → mic → `RTCPeerConnection` → offer → 15s timeout race → resolves connected or a fallback reason.
- `services/webrtcOwnerCall.js` — owner-side orchestration: listens for offers, exposes `accept()`/`reject()`, builds the answer side of the peer connection.
- `js/webrtcCallUI.js` — owner-side Incoming Call overlay (Accept/Reject/Connected/Hang up). Injects its own DOM/CSS at runtime; does not touch `app.html`'s template or `css/styles.css`.
- `sql/39_webrtc_phase2_call_attempts.sql` + `sql/39b_verify.sql` — new `rtc_call_attempts` observability table (outcome-only, no SDP/ICE, no PII beyond `owner_id`/`plate_id` already used elsewhere).

### Files Modified (surgical, additive only)
| File | Change |
|---|---|
| `config/rtcConfig.js` | Added one new key, `RTC_OWNER_REJECTED`, to the already-reserved `RTC_MONITORING_EVENTS` object. Nothing renamed/removed. |
| `visitor.html` | `btn-call` handler now calls `attemptTapToTalk()` first; falls back to the **existing, unmodified** `initiateMaskedCall()` call exactly as before if WebRTC isn't attempted, fails, times out, or is rejected. Added one hidden `<audio>` element (created in JS, not the template) for remote playback. |
| `js/dashboard.js` | Added one import + one guarded `initOwnerCallUI(ownerId)` call, in the same place and same no-op pattern as the existing `joinOwnerPresence(ownerId)` call. |

### Not Touched (Rule 3 compliance, verified by reading each file)
Authentication, Payments, Razorpay, PIN Verification, QR Generation, existing Visitor Flow logic (bell/message/voice/SOS handlers untouched), Manufacturing, Communication Center, Messaging/Inbox/Timeline, Analytics, Notifications, existing Masked Calling (`initiate-call`, `call-status-webhook`, Exotel, Twilio, Family Routing, Call Logs).

---

## 2. Architecture Summary

```
Visitor taps "Call"
  │
  ▼
attemptTapToTalk(ownerId, plateId)          [services/webrtcCall.js]
  │  1. isWebRTCEnabledForOwner? ── false ──► return {attempted:false}
  │  2. owner presence snapshot? ── offline ──► return {attempted:false}, log owner_offline_skip
  │  3. getUserMedia(audio) ── denied ──► return {attempted:false}, log mic_denied
  │  4. RTCPeerConnection + offer, join rtc:call:{callId}, broadcast on rtc:ring:{ownerId}
  │  5. race: pc.connectionState==='connected'  vs  15s timeout  vs  'reject' signal
  ▼
 ┌───────────────┬───────────────────────────────┐
 connected:true    connected:false (any reason)
 │                 │
 ▼                 ▼
Live P2P audio    initiateMaskedCall()  ← EXISTING, UNMODIFIED
(hang up ends      (Exotel → Twilio fallback, call_logs, owner notify —
 via 'hangup'       all exactly as today)
 broadcast)
```

Owner side (`services/webrtcOwnerCall.js`, guarded identically):
```
listenForIncomingCalls(ownerId) joins rtc:ring:{ownerId} once per dashboard session
  │
  ▼ 'incoming-call' received → js/webrtcCallUI.js shows Accept/Reject overlay
  │
  ├─ Reject → broadcast 'reject' on rtc:call:{callId} → visitor falls back immediately
  └─ Accept → getUserMedia → RTCPeerConnection(answer) → 'answer' + ICE exchange
              → connected → live audio; hangup/disconnect → overlay closes
```

Signaling is **transport-only, ephemeral, peer-to-peer metadata** relayed via Supabase Realtime Broadcast (`rtc:ring:{ownerId}`, `rtc:call:{callId}`) — never written to Postgres. This reuses the same Supabase Realtime infrastructure already used by presence and `postgres_changes` channels elsewhere; no new realtime system, no duplicate feature-flag mechanism, no duplicate presence layer.

---

## 3. Security Review
- **Owner phone number**: never touched by this phase — WebRTC audio never routes through Exotel/Twilio, and the fallback path is the existing masked-calling code, unchanged.
- **Twilio/Exotel credentials**: not read or referenced by any new file.
- **TURN credentials**: N/A this phase — `getIceServers()` is STUN-only (see Known Limitation below). No TURN secret exists anywhere in this codebase yet, so none can leak.
- **SDP/ICE payloads**: relayed via Broadcast only, never persisted, never logged (the DB table logs only an `outcome` string + `call_id` correlation UUID).
- **Internal identifiers**: `owner_id`/`plate_id` are the same identifiers already exposed to the visitor client today via the public plate lookup — no new exposure.
- **RLS**: `rtc_call_attempts` mirrors the existing `messages_insert_anon` / `message_logs_insert_anon` trust model exactly — anon insert constrained by the same `plate_id ~ '^SD-[A-Z0-9]{6}$'` pattern already used in `sql/31_unified_messaging.sql`.

## 4. Database Impact
One new table (`rtc_call_attempts`), additive, RLS-enabled, indexed, with a purge helper mirroring the existing `purge_old_rtc_presence_events()` pattern. No existing table, column, policy, or function is altered.

## 5. Edge Function Impact
**None.** No Edge Function was created or modified. Signaling deliberately avoids needing one (Realtime Broadcast is client-to-client via Supabase's existing Realtime service, no new server component).

## 6. Frontend Impact
- `visitor.html`: one handler rewritten to try WebRTC first, fall back automatically; one hidden audio element added via JS.
- `app.html`: **no direct edit** — the owner-side overlay is injected by `js/webrtcCallUI.js` at runtime, only when an owner is actually opted in.
- `js/dashboard.js`: two-line addition (import + guarded init call), identical pattern to the existing Phase 1 presence wiring.

---

## 7. Twilio Production Audit (parallel task, as requested)

| Check | Finding |
|---|---|
| Env var usage | `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_CALLER_NUMBER` read server-side only (`supabase/functions/_shared/providers/twilio.ts`), never exposed to the client. ✅ |
| Edge Function integration | `initiate-call` correctly dispatches to `twilio.ts` when `provider==='twilio'`; `call-status-webhook` correctly parses Twilio's callback shape. ✅ |
| Existing Twilio service | `services/twilio.js` (client) never talks to Twilio directly, only invokes `initiate-call`. ✅ Correct security model. |
| **Trial account handling** | ❌ **Gap found.** No code anywhere checks for or gracefully handles Twilio **trial-mode** restrictions (calls to unverified numbers are rejected by Twilio with error codes like 21211/21608/21610, and trial calls play an upsell message before connecting). `twilio.ts#placeCall()` only checks for missing credentials/missing `visitorPhone` — a trial-mode rejection from Twilio's API surfaces only as a generic `data?.message` string, with no owner-facing distinction between "Twilio is down" and "this number isn't verified because the account is still on Trial." |
| Error handling | Non-2xx Twilio responses are caught and returned as `{success:false, error}` — this does *not* crash, but the error message is opaque to support staff triaging `call_logs.call_status = 'failed'`. |
| Graceful fallback | Twilio is already the *last* provider in `communication.js`'s `PROVIDERS` array (Exotel → Twilio). If Exotel is healthy, a Twilio trial restriction never surfaces to the visitor. If Exotel *also* fails, the visitor sees a generic "all call providers are currently unavailable" message — technically graceful (no crash), but not diagnosable from the dashboard/logs alone today. |
| Production readiness | **Not blocking Phase 2** (WebRTC bypasses Twilio/Exotel entirely when it connects). **Is a pre-existing gap in the masked-call fallback path** that should be fixed before Twilio is relied upon as a real production fallback. |

**Per Rule 5, this finding is reported here rather than silently patched into the existing masked-calling provider code**, since `twilio.ts` is explicitly listed under "Existing Masked Calling — never redesign." Recommended minimal, additive fix for a future ticket (not implemented in this phase): map Twilio's known trial-mode error codes (21211/21608/21610) to a clearer `call_logs`-visible message inside `twilio.ts#placeCall()`'s existing error branch — a one-function, no-schema-change patch, left for explicit approval since it touches a file under the "never redesign" list.

---

## 8. Known Limitation (not a blocker)

`config/rtcConfig.js#getIceServers()` is **STUN-only** — the TURN credential-issuing Edge Function is explicitly out of scope until Phase 4 (documented in that file's own header before this phase started). Visitors or owners behind symmetric NATs / restrictive corporate Wi-Fi may fail ICE connectivity even when both are online and opted in. This is safe by design: an ICE failure is just another `connected:false` outcome, and the existing masked-call fallback fires automatically — identical UX to a timeout. No visitor-facing dead end is possible.

---

## 9. Deployment Order
1. Run `sql/39_webrtc_phase2_call_attempts.sql` in Supabase SQL Editor (after confirming `sql/38_webrtc_phase0_phase1.sql` is already applied — it is, per the existing `feature_flags`/`security_rules.webrtc_calling_enabled` columns already in the repo).
2. Run `sql/39b_verify.sql` and confirm all checks pass.
3. Deploy frontend (Vercel) — no Edge Function deploy needed for this phase.
4. Confirm in production that, with all flags still at their defaults (`webrtc_global_enabled=false`), the visitor call button and owner dashboard behave **exactly as before** (this is the critical zero-regression check).
5. To actually turn Phase 2 on for a pilot owner: set `feature_flags.webrtc_global_enabled = true`, then set that one owner's `security_rules.webrtc_calling_enabled = true`. Every other owner remains unaffected.

## 10. Verification Checklist
- [ ] `sql/39b_verify.sql` — table/policies/index/purge function all present.
- [ ] With flags OFF (default): visitor call button behaves identically to pre-Phase-2 (masked call only, no mic prompt, no console errors from the new imports).
- [ ] With flags ON for one test owner + that owner's dashboard open (online): visitor taps Call → owner sees Incoming Call overlay within ~1–2s → Accept → both sides hear audio → either side ends → clean teardown (no lingering `RTCPeerConnection`, no orphaned Realtime channel — check via browser dev tools `chrome://webrtc-internals`).
- [ ] Same setup, owner **rejects** → visitor's UI falls back to masked call automatically, no manual retry needed.
- [ ] Same setup, owner dashboard **closed** (offline) → visitor's Call button skips straight to masked call, no 15s wait.
- [ ] Same setup, visitor **denies microphone permission** → falls back to masked call.
- [ ] Simulate ICE failure (e.g. block STUN via network throttling) → after ~15s, falls back to masked call.
- [ ] `rtc_call_attempts` rows appear with the expected `outcome` values for each scenario above.
- [ ] Existing masked-call-only regression pass: bell, text message, voice note, SOS all still work unchanged (none of these paths were touched).

## 11. Rollback Plan
- **Fastest rollback (no deploy needed):** flip `feature_flags.webrtc_kill_switch = true` in the Supabase dashboard. Every guard (`isWebRTCEnabledForOwner`) checks this first and immediately disables all Phase 2 behavior for all owners within the flag's ~30s cache TTL — no code change, no redeploy.
- **Full rollback:** revert the three modified files (`config/rtcConfig.js`, `visitor.html`, `js/dashboard.js`) to their pre-Phase-2 versions and delete the four new files (`services/webrtcSignaling.js`, `services/webrtcCall.js`, `services/webrtcOwnerCall.js`, `js/webrtcCallUI.js`). The `rtc_call_attempts` table can be left in place harmlessly (it's write-only from the app's perspective) or dropped with `DROP TABLE IF EXISTS rtc_call_attempts;`.
- No data migration, no existing table alteration, and no Edge Function change means rollback carries no risk to Payments/Auth/PIN/QR/Masked-Calling.

## 12. Risk Assessment
| Risk | Severity | Mitigation |
|---|---|---|
| WebRTC breaks masked calling for existing owners | None expected | Every new code path is additive and flag-gated to `false` by default; masked-call code itself is byte-for-byte unmodified except the one caller site in `visitor.html`, which falls through to the exact same `initiateMaskedCall()` call as before. |
| ICE/TURN connectivity failures in the field | Medium (UX), Low (safety) | Automatic, silent fallback to masked calling — see §8. |
| Repeated Tap-to-Talk taps bypass the existing `call_attempt` rate limiter (which only fires inside `initiateMaskedCall`) | Low today | Zero owners are opted in at ship time; the Call button is disabled for the duration of each attempt. Recommend adding a dedicated server-side rate-limit action type in a future phase if abuse is observed — not implemented here to avoid touching the shared rate-limiter table without explicit sign-off. |
| Twilio trial-mode masked-call fallback opacity | Low (pre-existing) | See §7 — documented, not patched into the protected "never redesign" file without approval. |

---

## 13. Summary
Phase 2 is implemented completely, additively, and is fully inert by default. No blocker was found that should stop deployment; one pre-existing, non-blocking gap (Twilio trial-mode error clarity) is reported per Rule 5 rather than silently patched.
