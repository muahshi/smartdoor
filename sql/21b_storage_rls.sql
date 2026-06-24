-- SmartDoor: Storage RLS for qr-codes bucket
-- Step 1: Create bucket in Supabase Dashboard > Storage > New Bucket
--   Name: qr-codes  |  Public: YES  |  File size limit: 5MB
-- Step 2: Run this SQL

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='objects' AND schemaname='storage' AND policyname='qr_codes_public_read') THEN
    CREATE POLICY qr_codes_public_read ON storage.objects FOR SELECT USING (bucket_id = 'qr-codes');
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='objects' AND schemaname='storage' AND policyname='qr_codes_service_upload') THEN
    CREATE POLICY qr_codes_service_upload ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'qr-codes' AND auth.role() = 'service_role');
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='objects' AND schemaname='storage' AND policyname='qr_codes_service_update') THEN
    CREATE POLICY qr_codes_service_update ON storage.objects FOR UPDATE USING (bucket_id = 'qr-codes' AND auth.role() = 'service_role');
  END IF;
END $$;
