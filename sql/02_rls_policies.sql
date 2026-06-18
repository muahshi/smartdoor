-- ============================================================
-- SMART DOOR — ROW LEVEL SECURITY POLICIES
-- Run AFTER 01_schema.sql
-- ============================================================

-- ────────── ENABLE RLS ON ALL TABLES ──────────
ALTER TABLE users          ENABLE ROW LEVEL SECURITY;
ALTER TABLE plates         ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscriptions  ENABLE ROW LEVEL SECURITY;
ALTER TABLE visitor_logs   ENABLE ROW LEVEL SECURITY;
ALTER TABLE voice_notes    ENABLE ROW LEVEL SECURITY;
ALTER TABLE family_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE security_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE status_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications  ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs     ENABLE ROW LEVEL SECURITY;

-- ────────── HELPER: get current user's owner ID ──────────
-- We store auth_user_id in users table to link Supabase Auth → our users table
CREATE OR REPLACE FUNCTION get_my_owner_id()
RETURNS UUID AS $$
  SELECT id FROM users WHERE auth_user_id = auth.uid() LIMIT 1;
$$ LANGUAGE SQL SECURITY DEFINER STABLE;

-- ────────── USERS ──────────
-- Owner can only read/update their own record
CREATE POLICY "users_select_own" ON users
  FOR SELECT USING (auth_user_id = auth.uid());

CREATE POLICY "users_update_own" ON users
  FOR UPDATE USING (auth_user_id = auth.uid());

-- Insert allowed during registration (anon)
CREATE POLICY "users_insert_registration" ON users
  FOR INSERT WITH CHECK (true);

-- ────────── PLATES ──────────
-- Owner sees only their plate
CREATE POLICY "plates_select_own" ON plates
  FOR SELECT USING (owner_id = get_my_owner_id());

CREATE POLICY "plates_update_own" ON plates
  FOR UPDATE USING (owner_id = get_my_owner_id());

-- IMPORTANT: Visitor QR scan needs to read plate by qr_slug (public read for active plates only)
CREATE POLICY "plates_public_qr_lookup" ON plates
  FOR SELECT USING (status = 'active');
-- Note: This allows any anon to lookup an active plate by qr_slug for the visitor PWA.
-- Security_rules and owner status are also read by visitors — see security_rules policy below.

-- ────────── SUBSCRIPTIONS ──────────
CREATE POLICY "subscriptions_select_own" ON subscriptions
  FOR SELECT USING (owner_id = get_my_owner_id());

CREATE POLICY "subscriptions_update_own" ON subscriptions
  FOR UPDATE USING (owner_id = get_my_owner_id());

CREATE POLICY "subscriptions_insert_own" ON subscriptions
  FOR INSERT WITH CHECK (owner_id = get_my_owner_id());

-- ────────── VISITOR LOGS ──────────
-- Owner reads their own logs
CREATE POLICY "visitor_logs_select_own" ON visitor_logs
  FOR SELECT USING (owner_id = get_my_owner_id());

-- Visitors (anon) can INSERT logs when scanning QR
CREATE POLICY "visitor_logs_insert_anon" ON visitor_logs
  FOR INSERT WITH CHECK (true);

-- ────────── VOICE NOTES ──────────
-- Owner sees their own voice notes
CREATE POLICY "voice_notes_select_own" ON voice_notes
  FOR SELECT USING (owner_id = get_my_owner_id());

CREATE POLICY "voice_notes_update_own" ON voice_notes
  FOR UPDATE USING (owner_id = get_my_owner_id());

-- Visitors (anon) can insert voice note records
CREATE POLICY "voice_notes_insert_anon" ON voice_notes
  FOR INSERT WITH CHECK (true);

-- ────────── FAMILY MEMBERS ──────────
CREATE POLICY "family_select_own" ON family_members
  FOR SELECT USING (owner_id = get_my_owner_id());

CREATE POLICY "family_insert_own" ON family_members
  FOR INSERT WITH CHECK (owner_id = get_my_owner_id());

CREATE POLICY "family_update_own" ON family_members
  FOR UPDATE USING (owner_id = get_my_owner_id());

CREATE POLICY "family_delete_own" ON family_members
  FOR DELETE USING (owner_id = get_my_owner_id());

-- ────────── SECURITY RULES ──────────
-- Owner CRUD
CREATE POLICY "security_rules_select_own" ON security_rules
  FOR SELECT USING (owner_id = get_my_owner_id());

CREATE POLICY "security_rules_update_own" ON security_rules
  FOR UPDATE USING (owner_id = get_my_owner_id());

CREATE POLICY "security_rules_insert_own" ON security_rules
  FOR INSERT WITH CHECK (owner_id = get_my_owner_id());

-- Visitors (anon) need to read security_rules to show night mode / status on visitor PWA
-- We allow SELECT on specific columns only via a view (see 03_views.sql)
-- For simplicity, allow public read of security_rules (non-sensitive fields)
CREATE POLICY "security_rules_public_read" ON security_rules
  FOR SELECT USING (true);
-- Production tip: Restrict to a VIEW that exposes only: night_mode_on, current_status, custom_message, allow_sos, allow_voice, allow_calls

-- ────────── STATUS HISTORY ──────────
CREATE POLICY "status_history_select_own" ON status_history
  FOR SELECT USING (owner_id = get_my_owner_id());

CREATE POLICY "status_history_insert_own" ON status_history
  FOR INSERT WITH CHECK (owner_id = get_my_owner_id());

-- ────────── NOTIFICATIONS ──────────
CREATE POLICY "notifications_select_own" ON notifications
  FOR SELECT USING (owner_id = get_my_owner_id());

CREATE POLICY "notifications_update_own" ON notifications
  FOR UPDATE USING (owner_id = get_my_owner_id());

-- System can insert notifications (service role bypasses RLS)
CREATE POLICY "notifications_insert_own" ON notifications
  FOR INSERT WITH CHECK (owner_id = get_my_owner_id());

-- ────────── AUDIT LOGS ──────────
CREATE POLICY "audit_select_own" ON audit_logs
  FOR SELECT USING (owner_id = get_my_owner_id());

-- Insert via service role only (no user policy needed — use service key from backend)

-- ────────── STORAGE BUCKETS (run via Supabase Dashboard > Storage) ──────────
-- Create these buckets manually in Supabase Dashboard:
-- 
-- Bucket: voice-notes     | Private | 10MB limit per file
-- Bucket: plate-assets    | Public  | Images, QR codes
-- Bucket: user-uploads    | Private | Profile photos etc.
--
-- Storage RLS for voice-notes bucket:
-- Allow owner to SELECT: bucket_id = 'voice-notes' AND (storage.foldername(name))[1] = get_my_owner_id()::text
-- Allow anon INSERT into voice-notes (visitors uploading)
