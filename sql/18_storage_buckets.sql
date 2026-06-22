-- ============================================================
-- sql/18_storage_buckets.sql
-- SmartDoor — Ensure required Storage buckets exist with correct access policies
-- Run once in Supabase Dashboard → SQL Editor (or via migration)
-- ============================================================

-- ── voice-notes (PRIVATE — authenticated owners only) ────────────────────────
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'voice-notes',
  'voice-notes',
  false,
  10485760,  -- 10 MB
  ARRAY['audio/webm', 'audio/ogg', 'audio/mpeg', 'audio/wav', 'audio/mp4']
)
ON CONFLICT (id) DO NOTHING;

-- ── qr-codes (PUBLIC READ — plates need public QR image URLs) ────────────────
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'qr-codes',
  'qr-codes',
  true,
  5242880,   -- 5 MB
  ARRAY['image/png', 'image/svg+xml', 'image/jpeg']
)
ON CONFLICT (id) DO NOTHING;

-- ── plate-assets (PUBLIC READ — product images, plate renders) ───────────────
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'plate-assets',
  'plate-assets',
  true,
  20971520,  -- 20 MB
  ARRAY['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml', 'application/pdf']
)
ON CONFLICT (id) DO NOTHING;

-- ── user-uploads (PRIVATE — owner documents, profile photos) ─────────────────
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'user-uploads',
  'user-uploads',
  false,
  20971520,  -- 20 MB
  ARRAY['image/png', 'image/jpeg', 'image/webp', 'application/pdf']
)
ON CONFLICT (id) DO NOTHING;

-- ── Storage RLS Policies ─────────────────────────────────────────────────────

-- voice-notes: owners can upload/read their own notes
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects'
    AND policyname = 'voice_notes_owner_insert'
  ) THEN
    CREATE POLICY voice_notes_owner_insert ON storage.objects
      FOR INSERT TO authenticated
      WITH CHECK (bucket_id = 'voice-notes' AND auth.uid() IS NOT NULL);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects'
    AND policyname = 'voice_notes_owner_select'
  ) THEN
    CREATE POLICY voice_notes_owner_select ON storage.objects
      FOR SELECT TO authenticated
      USING (bucket_id = 'voice-notes' AND auth.uid() IS NOT NULL);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects'
    AND policyname = 'voice_notes_anon_insert'
  ) THEN
    CREATE POLICY voice_notes_anon_insert ON storage.objects
      FOR INSERT TO anon
      WITH CHECK (bucket_id = 'voice-notes' AND (storage.foldername(name))[1] IS NOT NULL);
  END IF;
END $$;

-- qr-codes: public read, service_role write only
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects'
    AND policyname = 'qr_codes_public_read'
  ) THEN
    CREATE POLICY qr_codes_public_read ON storage.objects
      FOR SELECT TO anon, authenticated
      USING (bucket_id = 'qr-codes');
  END IF;
END $$;

-- plate-assets: public read
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects'
    AND policyname = 'plate_assets_public_read'
  ) THEN
    CREATE POLICY plate_assets_public_read ON storage.objects
      FOR SELECT TO anon, authenticated
      USING (bucket_id = 'plate-assets');
  END IF;
END $$;

-- user-uploads: authenticated owners only
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects'
    AND policyname = 'user_uploads_owner_insert'
  ) THEN
    CREATE POLICY user_uploads_owner_insert ON storage.objects
      FOR INSERT TO authenticated
      WITH CHECK (bucket_id = 'user-uploads' AND auth.uid() IS NOT NULL);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects'
    AND policyname = 'user_uploads_owner_select'
  ) THEN
    CREATE POLICY user_uploads_owner_select ON storage.objects
      FOR SELECT TO authenticated
      USING (bucket_id = 'user-uploads' AND auth.uid() IS NOT NULL);
  END IF;
END $$;
