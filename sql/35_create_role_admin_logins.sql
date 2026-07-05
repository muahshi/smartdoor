-- ============================================================
-- SMART DOOR — Create role-specific admin logins
-- File: sql/35_create_role_admin_logins.sql
--
-- HOW TO USE:
--   1. Replace the email / full_name / plain-text password for each row below.
--   2. Run ONE INSERT at a time in Supabase SQL Editor (not all pasted together —
--      matches the lesson from the earlier multi-statement rollback issue).
--   3. Share the email + password with that person, then ask them to log in
--      at your admin login page — password_hash is bcrypt (pgcrypto), same
--      format admin-login already verifies.
--   4. Delete/forget the plain-text password after creating the row — it is
--      never stored anywhere except inside crypt() at insert time.
--
-- There is currently NO "Add Admin" UI (the button in Team panel is a stub) —
-- this is the only way to create a new admin login today.
-- ============================================================

-- ── MANUFACTURER login ──
INSERT INTO admin_users (email, full_name, role_id, password_hash, is_active)
SELECT
  'manufacturer@yourdomain.com',        -- ← change this
  'Manufacturer Name',                   -- ← change this
  id,
  crypt('ChangeThisPassword123!', gen_salt('bf')),   -- ← change this password
  true
FROM admin_roles WHERE name = 'manufacturing';

-- ── DEALER login ──
INSERT INTO admin_users (email, full_name, role_id, password_hash, is_active)
SELECT
  'dealer@yourdomain.com',               -- ← change this
  'Dealer Name',                          -- ← change this
  id,
  crypt('ChangeThisPassword123!', gen_salt('bf')),   -- ← change this password
  true
FROM admin_roles WHERE name = 'dealer';

-- ── FRANCHISE login ──
INSERT INTO admin_users (email, full_name, role_id, password_hash, is_active)
SELECT
  'franchise@yourdomain.com',             -- ← change this
  'Franchise Name',                        -- ← change this
  id,
  crypt('ChangeThisPassword123!', gen_salt('bf')),   -- ← change this password
  true
FROM admin_roles WHERE name = 'franchise';

-- ── INSTALLER login ──
-- Optional: set parent_admin_id to a franchise admin_users.id so that
-- franchise's "Installers" panel shows this installer (Phase 5).
INSERT INTO admin_users (email, full_name, role_id, password_hash, is_active, region)
SELECT
  'installer@yourdomain.com',              -- ← change this
  'Installer Name',                         -- ← change this
  id,
  crypt('ChangeThisPassword123!', gen_salt('bf')),   -- ← change this password
  true,
  'Mumbai'                                   -- ← optional region label
FROM admin_roles WHERE name = 'installer';

-- To link this installer under a franchise, run separately after both exist:
-- UPDATE admin_users SET parent_admin_id = (SELECT id FROM admin_users WHERE email='franchise@yourdomain.com')
-- WHERE email = 'installer@yourdomain.com';

-- ── VERIFY: confirm all 4 logins created correctly ──
SELECT au.email, au.full_name, ar.name AS role, au.is_active
FROM admin_users au JOIN admin_roles ar ON ar.id = au.role_id
WHERE ar.name IN ('manufacturing','dealer','franchise','installer')
ORDER BY au.created_at DESC;
