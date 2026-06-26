-- ════════════════════════════════════════════════════════════════
-- Migration 26: Admin Auth Stabilization
-- Run in: Supabase Dashboard > SQL Editor
-- Safe to run multiple times (idempotent)
-- ════════════════════════════════════════════════════════════════

-- 1. Clear all stale session tokens
--    Forces all admins to re-login with fresh tokens after schema changes.
--    This is the fix for the redirect loop caused by token mismatch.
UPDATE admin_users
SET session_token = NULL,
    session_exp = NULL
WHERE session_token IS NOT NULL;

-- 2. Ensure index exists for fast token lookup
CREATE INDEX IF NOT EXISTS idx_admin_users_session_token
  ON admin_users(session_token)
  WHERE session_token IS NOT NULL;

-- 3. Ensure admin_session_revocations has proper index
CREATE INDEX IF NOT EXISTS idx_admin_session_revocations_admin_id
  ON admin_session_revocations(admin_id, revoked_at);

-- 4. Verify
SELECT
  COUNT(*) AS total_admins,
  COUNT(session_token) AS with_active_session,
  COUNT(*) FILTER (WHERE is_active = true) AS active_admins
FROM admin_users;
