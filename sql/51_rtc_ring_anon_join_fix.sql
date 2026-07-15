-- ════════════════════════════════════════════════════════════════════════════
-- Migration 51: RTC Ring Channel — anon join-authorization fix
--
-- ROOT CAUSE
--   sql/40_webrtc_phase2_hardening.sql added `rtc_ring_receive_owner_only`,
--   a SELECT policy on realtime.messages for topic `rtc:ring:{ownerId}`,
--   scoped `TO authenticated` only. That migration's INSERT policy
--   (`rtc_ring_send_visitor_and_owner`) already lets `anon` (the visitor)
--   broadcast onto that topic — but Supabase Realtime Authorization
--   evaluates a SELECT policy to authorize the *subscribe/join handshake*
--   on a `{ private: true }` channel for whichever role is joining, not
--   only for roles that will actually receive messages. Since no SELECT
--   policy ever granted `anon` anything on `rtc:ring:*`, every visitor
--   (always anon, never signs in) failed the join handshake outright:
--   `channel.subscribe()` never reaches SUBSCRIBED, and instead times out
--   → CLOSED → the client's existing signaling_unavailable fallback.
--   This is why `rtc:call:{callId}` (whose FOR ALL policy already covers
--   anon) subscribes fine while `rtc:ring:{ownerId}` never does, and why
--   it reproduces only on real third-party visitor devices (owner's own
--   sessions are authenticated and already matched the existing policy).
--
-- FIX
--   Add one SELECT policy granting `anon` join-authorization on
--   `rtc:ring:*`, using the exact same well-formed-UUID topic check the
--   existing INSERT policy already uses (sql/40, `rtc_ring_send_
--   visitor_and_owner`). This does not widen anon's write access, does
--   not change the owner-only policy, and does not touch rtc:call.
--
-- WHAT THIS DOES NOT DO
--   - Does NOT modify or replace rtc_ring_receive_owner_only.
--   - Does NOT modify rtc_ring_send_visitor_and_owner or
--     rtc_call_channel_participants.
--   - Does NOT touch rtc_call_claims, presence, TURN/ICE, or any other
--     table/policy.
--
-- NOTE (documented trade-off, not a new design decision — matches the
--   trust model sql/40 already establishes for the INSERT policy): any
--   anon client that already knows/guesses a well-formed ownerId UUID can
--   now also *join* that owner's ring topic, not just send to it. ownerId
--   is not secret (already exposed via the public plate lookup), and the
--   ring channel only ever carries the visitor's own outgoing
--   'incoming-call' broadcast (self:false means a joiner won't even see
--   their own send echoed back) — but a third party could theoretically
--   join and observe another visitor's incoming-call broadcast on the
--   same owner's ring topic. This is an accepted continuation of the
--   existing trust model, not a new hole opened by this migration.
--
-- SAFE / IDEMPOTENT — uses DROP POLICY IF EXISTS. Safe to re-run.
--
-- Run in: Supabase Dashboard > SQL Editor > New Query
-- Run AFTER: sql/40_webrtc_phase2_hardening.sql
-- ════════════════════════════════════════════════════════════════════════════

BEGIN;

DROP POLICY IF EXISTS "rtc_ring_anon_join_authorization" ON realtime.messages;
CREATE POLICY "rtc_ring_anon_join_authorization" ON realtime.messages
  FOR SELECT
  TO anon
  USING (
    realtime.messages.extension = 'broadcast'
    AND realtime.topic() ~ '^rtc:ring:[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
  );

COMMIT;

-- ════════════════════════════════════════════════════════════════════════════
-- VERIFY
--   Confirm the policy exists:
--     SELECT policyname, roles, cmd FROM pg_policies
--       WHERE tablename = 'messages' AND schemaname = 'realtime'
--       AND policyname = 'rtc_ring_anon_join_authorization';
--
--   From a real visitor device (or any anon/incognito client), open
--   visitor.html, tap to call, and confirm in the console (or via the
--   debug overlay's Copy Logs):
--     [RTC-TRACE] channel SUBSCRIBED | ... Channel=rtc:ring:{ownerId}
--   instead of the previous TIMED_OUT / CLOSED / signaling_unavailable.
-- ════════════════════════════════════════════════════════════════════════════
