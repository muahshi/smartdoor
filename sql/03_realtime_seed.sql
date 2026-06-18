-- ============================================================
-- SMART DOOR — REALTIME + SEED CONFIG
-- Run AFTER 02_rls_policies.sql
-- ============================================================

-- ────────── ENABLE REALTIME ON KEY TABLES ──────────
-- Run these in Supabase Dashboard > Database > Replication
-- OR via SQL:

ALTER PUBLICATION supabase_realtime ADD TABLE visitor_logs;
ALTER PUBLICATION supabase_realtime ADD TABLE notifications;
ALTER PUBLICATION supabase_realtime ADD TABLE security_rules;
ALTER PUBLICATION supabase_realtime ADD TABLE voice_notes;
ALTER PUBLICATION supabase_realtime ADD TABLE status_history;

-- ────────── DEMO SEED DATA (for testing — delete before production) ──────────
-- Step 1: Create an auth user first in Supabase Dashboard > Authentication
-- Then run this with the actual auth UUID:

-- INSERT INTO users (full_name, phone, plate_id, pin_hash, auth_user_id)
-- VALUES (
--   'Sharma Family',
--   '+91 98765 43210',
--   'SD-ABX9K7',
--   crypt('4827', gen_salt('bf')),   -- PIN: 4827, bcrypt hashed
--   'YOUR-AUTH-USER-UUID-HERE'
-- );

-- INSERT INTO plates (plate_id, qr_slug, product_type, owner_id)
-- SELECT 'SD-ABX9K7', 'SD-ABX9K7', 'acrylic', id FROM users WHERE plate_id = 'SD-ABX9K7';

-- INSERT INTO subscriptions (owner_id, plan, expiry_date, renewal_price)
-- SELECT id, 'starter', NOW() + INTERVAL '1 year', 999
-- FROM users WHERE plate_id = 'SD-ABX9K7';

-- INSERT INTO security_rules (owner_id) 
-- SELECT id FROM users WHERE plate_id = 'SD-ABX9K7';

-- INSERT INTO family_members (owner_id, name, phone, relationship, priority)
-- SELECT id, 'Father', '+91 98765 43210', 'family', 1 FROM users WHERE plate_id = 'SD-ABX9K7'
-- UNION ALL
-- SELECT id, 'Mother', '+91 98765 43211', 'family', 2 FROM users WHERE plate_id = 'SD-ABX9K7'
-- UNION ALL
-- SELECT id, 'Son', '+91 98765 43212', 'family', 3 FROM users WHERE plate_id = 'SD-ABX9K7';

-- ────────── VERIFY SETUP ──────────
-- SELECT tablename, rowsecurity FROM pg_tables WHERE schemaname = 'public';
-- Should show rowsecurity = true for all Smart Door tables.
