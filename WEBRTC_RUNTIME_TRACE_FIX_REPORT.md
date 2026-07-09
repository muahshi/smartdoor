# SmartDoor — WebRTC Tap-to-Talk Runtime Trace & Production Fix

## 1. Root Cause Report

**Trace path walked:** visitor.html → services/webrtcCall.js → services/featureFlags.js →
services/presence.js → services/webrtcSignaling.js → Supabase Broadcast →
js/dashboard.js → services/webrtcOwnerCall.js → js/webrtcCallUI.js

**First place execution stops:** `services/webrtcSignaling.js`, inside
`joinBroadcastChannel()`'s `channel.subscribe((status, err) => {...})` callback.

**Proof:**

1. `js/dashboard.js` calls `initOwnerCallUI(ownerId)` → `listenForIncomingCalls(ownerId)`
   in `services/webrtcOwnerCall.js` **exactly once**, at dashboard mount. There is no
   retry, poll, or reconnect wrapper around that single call anywhere in the codebase.
2. `listenForIncomingCalls` awaited `joinBroadcastChannel(ringChannelName(ownerId), {timeoutMs:8000})`
   **once** and kept the resolved `channel` reference for the entire dashboard session.
3. `joinBroadcastChannel`'s `channel.subscribe(...)` callback is registered once but
   **fires for the entire lifetime of the channel**, not just at the initial join —
   this is normal Supabase Realtime behavior (status changes are pushed to the same
   callback for as long as the channel exists.
4. That callback's handling of `CHANNEL_ERROR` / `TIMED_OUT` / `CLOSED` unconditionally
   ran `supabase.removeChannel(channel)` and then called `reject(...)`. The `reject()`
   call is a **silent no-op** the moment the promise has already resolved (which it had,
   from the original successful subscribe) — so nothing downstream is ever notified.
   `removeChannel()`, however, is **not** a no-op: it permanently destroys the channel
   and prevents Supabase's normal auto-rejoin-on-reconnect behavior from ever running.
5. Any ordinary Realtime disconnect — a websocket reconnect after a network blip, a
   backgrounded/throttled browser tab, a long-idle dashboard session — pushes the ring
   channel through `CLOSED`/`CHANNEL_ERROR` at least once. The moment that happens, the
   owner's ring-channel listener is **permanently and silently dead** for the rest of
   the session. Only a single `console.error` is emitted; there is no user-visible
   signal and no automatic recovery.
6. Meanwhile `services/presence.js`'s `joinOwnerPresence()` already has its own
   independent exponential-backoff reconnect loop, so **presence keeps reporting the
   owner as online** the whole time. The visitor's `getOwnerPresenceSnapshot()` check
   passes, the mic-permission prompt appears exactly as reported, the visitor's offer
   is broadcast into the ring channel — into a channel nobody is listening on anymore —
   `WEBRTC_CONNECT_TIMEOUT_MS` (15,000 ms, matching the reported "15 sec") elapses, and
   the existing Twilio Trial masked-call fallback fires. This exactly reproduces the
   reported symptom, including why it can happen even with the dashboard already open
   and every flag already `true`.

This is also precisely what Task 1 ("stale-owner-listener fix") describes: a listener
established before some later change (flag flip, or here, any transient disconnect)
that never recovers without a full page refresh.

A second, narrower instance of the same root pattern: if `isWebRTCEnabledForOwner()`
happened to return `false` at the exact moment the dashboard mounted (flags not yet
flipped on, or a transient `feature_flags` read failure), `listenForIncomingCalls()`
and `joinOwnerPresence()` both returned a **permanent** no-op cleanup with no retry —
also requiring a refresh to recover once flags did turn on.

No other bug was found in channel names, broadcast topics, event names, offer/answer/
ICE handling, or RLS policies — those were all verified against the schema and are
internally consistent on both the visitor and owner sides.

## 2. Files Changed

| File | Change |
|---|---|
| `services/webrtcSignaling.js` | Added `joinPersistentBroadcastChannel()` — a long-lived channel join with reconnect-with-backoff (mirrors `presence.js`'s existing pattern) instead of self-destructing on the first drop. Added `[RTC-TRACE]` logging to `joinBroadcastChannel` and `sendSignal`. `joinBroadcastChannel` itself is unchanged in behavior (still correct for the short-lived/one-shot channels it's used for). |
| `services/webrtcOwnerCall.js` | Ring channel now uses `joinPersistentBroadcastChannel` instead of `joinBroadcastChannel` — this is the actual fix. Also wrapped `listenForIncomingCalls` in a flag-recheck loop (task 1) so it auto-starts if flags turn on after mount, with no refresh needed. Added `[RTC-TRACE]` checkpoints 2, 6, 7, 9, 10, 12, 13 and failure logs. |
| `services/presence.js` | Same flag-recheck wrapper added to `joinOwnerPresence` for consistency (same guard pattern, same "stale listener" class of issue). The existing presence reconnect logic (`_startPresence`, formerly the body of `joinOwnerPresence`) is untouched — byte-for-byte identical. |
| `services/webrtcCall.js` (visitor side) | Added `[RTC-TRACE]` checkpoints 1, 2, 3, 4, 5, 11, 12, 13, 14, plus failure logs (owner offline, mic denied, ring channel unreachable, answer/ICE failure). No behavioral change. |
| `js/webrtcCallUI.js` | Added `[RTC-TRACE]` checkpoint 8 (popup shown) and 9 (accept clicked, logged from the owner-side `accept()` in `webrtcOwnerCall.js`). No behavioral change. |
| `visitor.html` | One line added: `[RTC-TRACE] 15 Fallback` log immediately before the existing, unmodified `initiateMaskedCall(...)` call. No behavioral change. |

Nothing else was touched. Masked Calling, Twilio, Exotel, SOS, Doorbell, AI
Receptionist, Visitor Chat, Dashboard, RLS, Edge Functions, and the database schema
are all untouched.

## 3. Why Each File Changed

- **webrtcSignaling.js** — this is where the actual defect lives (see Root Cause). The
  fix has to live here so every long-lived caller benefits, not just a one-off patch in
  the caller.
- **webrtcOwnerCall.js** — the only caller of the ring channel for the owner's entire
  dashboard session; switched to the new persistent-join primitive, and handler
  registration was moved into a `registerHandlers(channel)` callback so it re-attaches
  correctly to the new channel object created on every reconnect.
- **presence.js** — same class of bug (a one-time flag check with no recheck), fixed
  the same way for consistency and to fully satisfy Task 1 as written ("owner dashboard
  already open before flags changed").
- **webrtcCall.js, webrtcCallUI.js, visitor.html** — Task 2 requires full `[RTC-TRACE]`
  coverage of all 15 checkpoints across the whole chain; these are the remaining files
  in that chain that needed logging added.

## 4. Risk Analysis

- **Behavioral risk: very low.** `joinBroadcastChannel()` (used by every short-lived
  caller: the visitor's ring send, the visitor's/owner's call channels, `reject()`) is
  untouched in logic — only a log line was added to each branch. `joinPersistentBroadcastChannel`
  is new code, isolated to a new export; it is only wired into one call site
  (`webrtcOwnerCall.js`'s ring channel).
- **Reconnect storms:** bounded by capped exponential backoff (1s → 15s max), identical
  in shape to `presence.js`'s existing, already-proven-in-production pattern.
- **Double-claim risk on reconnect:** none — a reconnect only re-establishes the
  *listener*; `_claimCall()`'s `rtc_call_claims` unique-constraint check (Fix 3,
  pre-existing) is still the single source of truth for who answers a given call, so a
  ring channel reconnecting mid-flight cannot cause a duplicate answer.
- **Memory/listener leaks:** the returned `cleanup()` from `joinPersistentBroadcastChannel`
  clears both the reconnect timer and the initial-join timer and removes the current
  channel — verified no dangling timers on teardown.
- **Flag-recheck polling (Task 1):** a 20s interval, only while disabled; stops
  immediately once enabled or once `cleanup()` runs. Negligible load — one extra
  `feature_flags` read per interval per open dashboard tab, same as `featureFlags.js`'s
  existing cache-refresh cadence.
- **Console log volume:** `[RTC-TRACE]` and `[RTC-TRACE][FAIL]` lines are additive only;
  none are error-throwing, and all are contained by existing `try/catch` boundaries.

## 5. Rollback Plan

Each changed file is a drop-in replacement with no schema/config changes involved:

1. Restore the previous versions of the six files from git/backup:
   `services/webrtcSignaling.js`, `services/webrtcOwnerCall.js`, `services/presence.js`,
   `services/webrtcCall.js`, `js/webrtcCallUI.js`, `visitor.html`.
2. No SQL migration was added or altered — no database rollback needed.
3. No feature flag values were changed — `webrtc_global_enabled`, `webrtc_kill_switch`,
   and per-owner opt-in remain exactly as they are today.
4. Redeploy. No cache purge, no Edge Function redeploy, no Twilio/Exotel config touch
   required.

## 6. Deployment Order

1. `services/webrtcSignaling.js` (new export, no breaking change to existing exports)
2. `services/presence.js`
3. `services/webrtcOwnerCall.js`
4. `services/webrtcCall.js`
5. `js/webrtcCallUI.js`
6. `visitor.html`

(Order is low-risk either way since nothing here is a breaking API change, but
deploying the shared `webrtcSignaling.js` first avoids a brief window where a stale
cached `webrtcOwnerCall.js` might reference a not-yet-deployed export.)

## 7. Verification Checklist

- [ ] Open owner dashboard, confirm console shows `[RTC-TRACE] 6 Owner subscribed`.
- [ ] From a visitor tab, tap Call Owner — confirm the full `1` → `13` trace sequence
      appears across both consoles with no `[RTC-TRACE][FAIL]` line in between.
- [ ] Simulate a drop: in owner devtools, throttle network to "Offline" for ~5s then
      restore — confirm a `[RTC-TRACE][FAIL] persistent channel dropped, reconnecting`
      followed by a fresh `[RTC-TRACE] persistent channel SUBSCRIBED` / `6 Owner subscribed`,
      with NO page refresh.
- [ ] Repeat a Tap-to-Talk call attempt after that simulated drop — confirm it now
      connects (previously this would have silently fallen back to Twilio forever).
- [ ] Confirm Masked Calling fallback still works when WebRTC is intentionally skipped
      (e.g. owner offline) — should see `[RTC-TRACE] 15 Fallback` and a normal Twilio
      Trial call, unchanged.
- [ ] Confirm SOS, Doorbell, AI Receptionist, Visitor Chat flows are visually and
      functionally unchanged (none of their files were touched).
