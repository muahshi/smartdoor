-- ════════════════════════════════════════════════════════════════════════════
-- Migration 40: WebRTC Phase 2 — Production Hardening
--   (Realtime Broadcast Authorization + Atomic Call Claiming)
--
-- PURPOSE
--   Fixes two of the four blocking issues in the Phase 2 hardening pass:
--
--   Fix 1 — Secure Realtime Broadcast authorization
--     Today, services/webrtcSignaling.js opens PUBLIC broadcast channels
--     (`rtc:ring:{ownerId}`, `rtc:call:{callId}`) with no RLS check at all
--     — any client holding the anon key can join ANY owner's ring channel
--     and read/inject signaling messages. This migration adds RLS policies
--     on realtime.messages, scoped ONLY to the `rtc:ring:*` / `rtc:call:*`
--     topic patterns, and the client is changed (services/webrtcSignaling.js)
--     to open these two channels with `{ private: true }`. Because a
--     channel only gets RLS-checked when the CLIENT asks for a private
--     channel, and no other channel in this codebase does that, this
--     migration has ZERO effect on any of the other public broadcast /
--     postgres_changes channels already in production (call_logs:*,
--     message_logs:*, notifications:*, guard_checkins:*, emergencies:*,
--     order-tracking:*, status:*, typing:*, voice_notes:*, presence:owner:*).
--     Those all remain fully public and unmodified — verified by grep
--     across services/*.js and js/*.js before writing this migration.
--
--     IMPORTANT — deployment note (cannot be done in SQL): do NOT disable
--     the project-wide "Allow public access" toggle in Supabase Dashboard
--     → Realtime → Settings. That toggle gates whether ANY non-private
--     channel may be opened at all; disabling it would break every other
--     channel listed above. This migration intentionally does not need it
--     disabled — private-channel RLS is enforced per-channel by the
--     client's own `{ private: true }` flag, independent of that setting.
--
--   Fix 3 — Proper call claiming (no duplicate answers)
--     If an owner has the dashboard open in multiple tabs/devices, today
--     every tab receives the same 'incoming-call' broadcast and each can
--     independently call accept() — producing two RTCPeerConnections
--     answering the same offer (duplicate audio, undefined behavior).
--     rtc_call_claims gives a single authoritative, atomic answer via a
--     UNIQUE (call_id) INSERT: whichever tab's INSERT lands first wins;
--     every other tab's INSERT fails with a unique_violation (23505) and
--     that tab aborts accept() before ever touching getUserMedia or
--     opening a peer connection. This is enforced by Postgres, not by a
--     racy broadcast message, so it holds even under near-simultaneous
--     taps on two devices.
--
-- WHAT THIS DOES NOT DO
--   - Does NOT touch call_logs, message_logs, or any existing
--     communication/payment/RBAC table, policy, or function.
--   - Does NOT change initiate-call, call-status-webhook, Exotel, or
--     Twilio in any way.
--   - Does NOT store SDP or ICE candidates — rtc_call_claims stores only
--     call_id/owner_id/device_id/timestamp, exactly like rtc_call_attempts.
--   - Does NOT alter feature_flags, security_rules, or any Phase 0/1 table.
--
-- SAFE / IDEMPOTENT — uses IF NOT EXISTS / DROP POLICY IF EXISTS throughout.
-- Safe to re-run.
--
-- Run in: Supabase Dashboard > SQL Editor > New Query
-- Run AFTER: sql/38_webrtc_phase0_phase1.sql, sql/39_webrtc_phase2_call_attempts.sql
-- ════════════════════════════════════════════════════════════════════════════

BEGIN;

-- ────────────────────────────────────────────────────────────────────────
-- PART A: Realtime Broadcast Authorization (Fix 1)
-- ────────────────────────────────────────────────────────────────────────

-- RING channel — receive (SELECT): only the authenticated owner who owns
-- this ring channel may listen. A visitor (anon) never needs to receive
-- on this channel — only send the one-shot 'incoming-call' notification —
-- so anon deliberately has no SELECT policy here at all.
DROP POLICY IF EXISTS "rtc_ring_receive_owner_only" ON realtime.messages;
CREATE POLICY "rtc_ring_receive_owner_only" ON realtime.messages
  FOR SELECT
  TO authenticated
  USING (
    realtime.messages.extension = 'broadcast'
    AND realtime.topic() = 'rtc:ring:' || get_my_owner_id()::text
  );

-- RING channel — send (INSERT): both the visitor (anon, placing the call)
-- and the owner (authenticated, e.g. a future "call back" feature) may
-- broadcast onto a well-formed rtc:ring:{uuid} topic. The UUID shape check
-- blocks garbage/malformed topics; ownerId itself is not secret (already
-- exposed via the public plate lookup the visitor already completed),
-- matching the existing trust model documented in sql/39's
-- rtc_call_attempts_insert_anon policy.
DROP POLICY IF EXISTS "rtc_ring_send_visitor_and_owner" ON realtime.messages;
CREATE POLICY "rtc_ring_send_visitor_and_owner" ON realtime.messages
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (
    realtime.messages.extension = 'broadcast'
    AND realtime.topic() ~ '^rtc:ring:[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
  );

-- CALL channel — send + receive: scoped to a well-formed rtc:call:{uuid}
-- topic. callId is a fresh crypto.randomUUID() per attempt (122 bits of
-- entropy) generated client-side and never persisted anywhere queryable
-- pre-call, so knowledge of the exact callId is itself the capability —
-- the same "unguessable token" trust model already used for
-- plate_id-scoped anon inserts elsewhere in this schema. Both anon
-- (visitor) and authenticated (owner) need symmetric read+write here.
DROP POLICY IF EXISTS "rtc_call_channel_participants" ON realtime.messages;
CREATE POLICY "rtc_call_channel_participants" ON realtime.messages
  FOR ALL
  TO anon, authenticated
  USING (
    realtime.messages.extension = 'broadcast'
    AND realtime.topic() ~ '^rtc:call:[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
  )
  WITH CHECK (
    realtime.messages.extension = 'broadcast'
    AND realtime.topic() ~ '^rtc:call:[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
  );

-- ────────────────────────────────────────────────────────────────────────
-- PART B: Atomic Call Claiming (Fix 3)
-- ────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS rtc_call_claims (
  call_id     UUID PRIMARY KEY,                       -- the offer's callId; PK enforces "first writer wins"
  owner_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  device_id   TEXT NOT NULL,                           -- which owner tab/device claimed it
  claimed_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_rtc_call_claims_owner
  ON rtc_call_claims(owner_id, claimed_at DESC);

ALTER TABLE rtc_call_claims ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "rtc_call_claims_insert_own" ON rtc_call_claims;
CREATE POLICY "rtc_call_claims_insert_own" ON rtc_call_claims
  FOR INSERT
  WITH CHECK (owner_id = get_my_owner_id());

DROP POLICY IF EXISTS "rtc_call_claims_select_own" ON rtc_call_claims;
CREATE POLICY "rtc_call_claims_select_own" ON rtc_call_claims
  FOR SELECT USING (owner_id = get_my_owner_id());

COMMENT ON TABLE rtc_call_claims IS
  'Phase 2 hardening: atomic first-writer-wins claim per call_id (PK) so only one owner device/tab can accept a given Tap to Talk call. A second INSERT for the same call_id fails with unique_violation (23505) — the client treats that as "answered on another device" and aborts before requesting the microphone.';

CREATE OR REPLACE FUNCTION purge_old_rtc_call_claims()
RETURNS VOID AS $$
BEGIN
  DELETE FROM rtc_call_claims WHERE claimed_at < NOW() - INTERVAL '1 day';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMIT;

-- ════════════════════════════════════════════════════════════════════════════
-- VERIFY (see sql/40b_verify.sql)
-- ════════════════════════════════════════════════════════════════════════════
