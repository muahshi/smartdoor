-- ============================================================
-- SMART DOOR — PHASE 5: COMMUNICATION ENGINE RLS POLICIES
-- Run AFTER 04_communication_schema.sql
-- ============================================================

-- ────────── ENABLE RLS ──────────
ALTER TABLE call_logs         ENABLE ROW LEVEL SECURITY;
ALTER TABLE message_logs      ENABLE ROW LEVEL SECURITY;
ALTER TABLE rate_limit_events ENABLE ROW LEVEL SECURITY;

-- ────────── CALL LOGS ──────────
-- Owner reads their own call history
CREATE POLICY "call_logs_select_own" ON call_logs
  FOR SELECT USING (owner_id = get_my_owner_id());

-- Inserts/updates happen via Edge Function using the SERVICE ROLE key
-- (call masking requires provider secrets, never exposed to anon/browser).
-- No anon INSERT/UPDATE policy is created on purpose — this table is
-- only ever written to from supabase/functions/initiate-call and
-- supabase/functions/call-status-webhook.

-- ────────── MESSAGE LOGS ──────────
-- Owner reads their own messages
CREATE POLICY "message_logs_select_own" ON message_logs
  FOR SELECT USING (owner_id = get_my_owner_id());

-- Owner can mark messages as read
CREATE POLICY "message_logs_update_own" ON message_logs
  FOR UPDATE USING (owner_id = get_my_owner_id());

-- Visitors (anon) can insert messages — same trust model as visitor_logs/voice_notes:
-- owner_id is supplied by the client from the public plate lookup (getPlateBySlug),
-- exactly like the existing visitor_logs_insert_anon / voice_notes_insert_anon policies.
CREATE POLICY "message_logs_insert_anon" ON message_logs
  FOR INSERT WITH CHECK (true);

-- ────────── RATE LIMIT EVENTS ──────────
-- No one needs to SELECT this from the client — checks happen via the
-- check_rate_limit() RPC (SECURITY DEFINER), so no select policy is added.

-- Visitors (anon) can log their own attempts via log_rate_limit_event() RPC,
-- but we also allow direct insert as a fallback for non-RPC callers.
CREATE POLICY "rate_limit_insert_anon" ON rate_limit_events
  FOR INSERT WITH CHECK (true);

-- Owner can view rate-limit/abuse history for their own plate (optional, for dashboard abuse panel)
CREATE POLICY "rate_limit_select_owner" ON rate_limit_events
  FOR SELECT USING (
    plate_id IN (SELECT plate_id FROM plates WHERE owner_id = get_my_owner_id())
  );

-- ────────── NOTIFICATIONS: ALLOW VISITOR-TRIGGERED INSERTS ──────────
-- Phase 4 only allowed the authenticated owner to insert notifications.
-- Phase 5 needs visitors (anon) to create notifications for bell rings,
-- voice notes, call requests, and emergency alerts. This mirrors the
-- existing visitor_logs_insert_anon / voice_notes_insert_anon pattern.
CREATE POLICY "notifications_insert_anon" ON notifications
  FOR INSERT WITH CHECK (true);

-- ────────── AUDIT LOGS: MISSING INSERT POLICY FIX ──────────
-- audit_logs had RLS enabled (sql/02_rls_policies.sql) with a SELECT policy
-- but no INSERT policy, so every audit_logs insert — including the
-- pre-existing services/auth.js login/logout calls — was silently rejected
-- by RLS. Phase 5's audit requirements (call started/ended, voice note
-- uploaded, emergency triggered, notification sent) need this to actually work.
CREATE POLICY "audit_insert_own" ON audit_logs
  FOR INSERT WITH CHECK (true);

-- ────────── STORAGE: VOICE NOTES BUCKET POLICIES ──────────
-- Run via Supabase Dashboard > Storage, or as SQL against storage.objects.
-- Bucket "voice-notes" must already exist (see sql/02_rls_policies.sql notes).
--
-- Owner can read/listen to their own voice notes (foldered by owner_id):
-- CREATE POLICY "voice_notes_storage_owner_read" ON storage.objects
--   FOR SELECT USING (
--     bucket_id = 'voice-notes'
--     AND (storage.foldername(name))[1] = get_my_owner_id()::text
--   );
--
-- Visitors (anon) can upload into any owner's folder (folder name = owner_id,
-- supplied by the client after the public plate lookup):
-- CREATE POLICY "voice_notes_storage_anon_upload" ON storage.objects
--   FOR INSERT WITH CHECK (bucket_id = 'voice-notes');
