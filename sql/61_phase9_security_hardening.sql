-- ══════════════════════════════════════════════════════════════════════
-- SmartDoor — Phase 9: Security & Compliance Hardening
-- sql/61_phase9_security_hardening.sql
--
-- Scope: real, verified gaps only. No architecture changes, no new
-- features. Every statement below is idempotent (safe to re-run).
-- ══════════════════════════════════════════════════════════════════════

-- ──────────────────────────────────────────────────────────────────────
-- 1. RLS was never enabled on 4 tables from sql/11_beta_launch_schema.sql
--    ("env_config" is the most severe: it lists which infra secrets are
--    configured — key names + is_set flags — with zero access control,
--    readable by anon/authenticated. "delivery_events" and
--    "referral_logs" allowed order/referral enumeration and tampering.
--    "renewal_engine_logs" is a lower-sensitivity internal cron log but
--    was equally wide open.)
-- ──────────────────────────────────────────────────────────────────────

ALTER TABLE env_config          ENABLE ROW LEVEL SECURITY;
ALTER TABLE delivery_events     ENABLE ROW LEVEL SECURITY;
ALTER TABLE referral_logs       ENABLE ROW LEVEL SECURITY;
ALTER TABLE renewal_engine_logs ENABLE ROW LEVEL SECURITY;

-- env_config: infra/secrets metadata — service role (Edge Functions) and
-- super_admin only. No owner-facing use case exists for this table.
DROP POLICY IF EXISTS "env_config_service_all" ON env_config;
CREATE POLICY "env_config_service_all" ON env_config
  FOR ALL USING (auth.role() = 'service_role');

DROP POLICY IF EXISTS "env_config_admin_read" ON env_config;
CREATE POLICY "env_config_admin_read" ON env_config
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM admin_users WHERE id::text = auth.uid()::text)
  );

-- delivery_events: owners may read events for their own orders; all
-- writes are service-role only (Shiprocket/Delhivery/etc. webhooks write
-- via Edge Functions, never directly from the client).
DROP POLICY IF EXISTS "delivery_events_service_all" ON delivery_events;
CREATE POLICY "delivery_events_service_all" ON delivery_events
  FOR ALL USING (auth.role() = 'service_role');

DROP POLICY IF EXISTS "delivery_events_owner_read" ON delivery_events;
CREATE POLICY "delivery_events_owner_read" ON delivery_events
  FOR SELECT USING (
    order_id IN (
      SELECT id FROM orders
      WHERE owner_id IN (SELECT id FROM users WHERE auth_user_id = auth.uid())
    )
  );

DROP POLICY IF EXISTS "delivery_events_admin_all" ON delivery_events;
CREATE POLICY "delivery_events_admin_all" ON delivery_events
  FOR ALL USING (
    EXISTS (SELECT 1 FROM admin_users WHERE id::text = auth.uid()::text)
  );

-- referral_logs: the referrer may read rows tied to their own referral
-- code; the referred owner may read their own row; everything else
-- (creation/status transitions) is service-role only.
DROP POLICY IF EXISTS "referral_logs_service_all" ON referral_logs;
CREATE POLICY "referral_logs_service_all" ON referral_logs
  FOR ALL USING (auth.role() = 'service_role');

DROP POLICY IF EXISTS "referral_logs_referrer_read" ON referral_logs;
CREATE POLICY "referral_logs_referrer_read" ON referral_logs
  FOR SELECT USING (
    referral_id IN (
      SELECT id FROM referrals
      WHERE owner_id IN (SELECT id FROM users WHERE auth_user_id = auth.uid())
    )
  );

DROP POLICY IF EXISTS "referral_logs_referred_read" ON referral_logs;
CREATE POLICY "referral_logs_referred_read" ON referral_logs
  FOR SELECT USING (
    referred_owner_id IN (SELECT id FROM users WHERE auth_user_id = auth.uid())
  );

DROP POLICY IF EXISTS "referral_logs_admin_all" ON referral_logs;
CREATE POLICY "referral_logs_admin_all" ON referral_logs
  FOR ALL USING (
    EXISTS (SELECT 1 FROM admin_users WHERE id::text = auth.uid()::text)
  );

-- renewal_engine_logs: internal cron run log, no owner reference at all
-- — service role + admin only.
DROP POLICY IF EXISTS "renewal_engine_logs_service_all" ON renewal_engine_logs;
CREATE POLICY "renewal_engine_logs_service_all" ON renewal_engine_logs
  FOR ALL USING (auth.role() = 'service_role');

DROP POLICY IF EXISTS "renewal_engine_logs_admin_read" ON renewal_engine_logs;
CREATE POLICY "renewal_engine_logs_admin_read" ON renewal_engine_logs
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM admin_users WHERE id::text = auth.uid()::text)
  );

-- ──────────────────────────────────────────────────────────────────────
-- 2. Storage IDOR: "voice-notes" and "user-uploads" buckets (created in
--    sql/18_storage_buckets.sql) had authenticated SELECT/INSERT policies
--    guarded only by `auth.uid() IS NOT NULL` — i.e. any logged-in user
--    could read or write any other user's files, since the folder
--    ownership check that ships on every other private bucket in this
--    project (e.g. visitor-photos in sql/44) was never actually applied
--    here. Storage layout is `{owner_id}/{plate_id}/{file}` per
--    services/voiceNotes.js — replacing the broad policies with
--    folder-scoped ones below closes that without changing the upload
--    path convention.
-- ──────────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "voice_notes_owner_select" ON storage.objects;
CREATE POLICY "voice_notes_owner_select" ON storage.objects
  FOR SELECT USING (
    bucket_id = 'voice-notes'
    AND (storage.foldername(name))[1] = (
      SELECT id::text FROM users WHERE auth_user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "voice_notes_owner_insert" ON storage.objects;
CREATE POLICY "voice_notes_owner_insert" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'voice-notes'
    AND (storage.foldername(name))[1] = (
      SELECT id::text FROM users WHERE auth_user_id = auth.uid()
    )
  );

-- Visitors (anon) leaving a voice note for a door owner keep working —
-- they're never logged in, so they can't be scoped by uid. The path
-- format itself is still validated (owner_id/plate_id/file.ext) so anon
-- writes can't land outside the expected bucket layout.
DROP POLICY IF EXISTS "voice_notes_anon_insert" ON storage.objects;
CREATE POLICY "voice_notes_anon_insert" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'voice-notes'
    AND (storage.foldername(name))[1] IN (SELECT id::text FROM users)
    AND (storage.foldername(name))[2] IN (SELECT plate_id FROM plates)
  );

DROP POLICY IF EXISTS "voice_notes_service_all" ON storage.objects;
CREATE POLICY "voice_notes_service_all" ON storage.objects
  FOR ALL USING (bucket_id = 'voice-notes' AND auth.role() = 'service_role');

DROP POLICY IF EXISTS "user_uploads_owner_select" ON storage.objects;
CREATE POLICY "user_uploads_owner_select" ON storage.objects
  FOR SELECT USING (
    bucket_id = 'user-uploads'
    AND (storage.foldername(name))[1] = (
      SELECT id::text FROM users WHERE auth_user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "user_uploads_owner_insert" ON storage.objects;
CREATE POLICY "user_uploads_owner_insert" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'user-uploads'
    AND (storage.foldername(name))[1] = (
      SELECT id::text FROM users WHERE auth_user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "user_uploads_service_all" ON storage.objects;
CREATE POLICY "user_uploads_service_all" ON storage.objects
  FOR ALL USING (bucket_id = 'user-uploads' AND auth.role() = 'service_role');

-- ══════════════════════════════════════════════════════════════════════
-- END sql/61_phase9_security_hardening.sql
-- ══════════════════════════════════════════════════════════════════════
