-- ════════════════════════════════════════════════════════════════════════════
-- Migration 23: Login Fix + Admin Customers Fix
-- Fixes: Owner login "Invalid PIN", Admin customers list empty
-- Idempotent — safe to run multiple times.
-- ════════════════════════════════════════════════════════════════════════════

BEGIN;

-- ── 1. DIAGNOSTIC: Check what's actually in the DB ──────────────────────────
-- Run these SELECT statements to verify data exists before debugging further:
-- SELECT id, full_name, phone, plate_id, pin_hash IS NOT NULL as has_pin, auth_user_id FROM users ORDER BY created_at DESC LIMIT 10;
-- SELECT plate_id, qr_slug, status, owner_id FROM plates ORDER BY created_at DESC LIMIT 10;

-- ── 2. check_pin_lockout RPC (must exist for verify-pin Edge Function) ───────
-- verify-pin calls this RPC. If missing → Edge Function crashes → login fails.
CREATE OR REPLACE FUNCTION check_pin_lockout(p_plate_id TEXT)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_record RECORD;
  v_window_start TIMESTAMPTZ := now() - INTERVAL '15 minutes';
BEGIN
  SELECT * INTO v_record
  FROM pin_lockouts
  WHERE plate_id = upper(trim(p_plate_id))
    AND locked_until > now()
  LIMIT 1;

  IF FOUND THEN
    RETURN json_build_object(
      'locked', true,
      'seconds_remaining', EXTRACT(EPOCH FROM (v_record.locked_until - now()))::int
    );
  END IF;

  RETURN json_build_object('locked', false);
EXCEPTION WHEN undefined_table THEN
  -- pin_lockouts table doesn't exist yet — return unlocked
  RETURN json_build_object('locked', false);
END;
$$;

GRANT EXECUTE ON FUNCTION check_pin_lockout TO service_role;

-- ── 3. record_failed_pin RPC ─────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION record_failed_pin(p_plate_id TEXT)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_normalized TEXT := upper(trim(p_plate_id));
  v_count INT;
  v_max_attempts INT := 5;
  v_lockout_mins INT := 15;
BEGIN
  -- Try to insert/update lockout record
  BEGIN
    INSERT INTO pin_lockouts (plate_id, failed_count, last_attempt, locked_until)
    VALUES (v_normalized, 1, now(), NULL)
    ON CONFLICT (plate_id) DO UPDATE
    SET failed_count = pin_lockouts.failed_count + 1,
        last_attempt = now(),
        locked_until = CASE
          WHEN pin_lockouts.failed_count + 1 >= v_max_attempts
          THEN now() + (v_lockout_mins || ' minutes')::interval
          ELSE NULL
        END;

    SELECT failed_count INTO v_count FROM pin_lockouts WHERE plate_id = v_normalized;

    RETURN json_build_object(
      'failed_count', v_count,
      'locked', v_count >= v_max_attempts,
      'attempts_remaining', GREATEST(0, v_max_attempts - v_count),
      'retry_after_minutes', v_lockout_mins
    );
  EXCEPTION WHEN undefined_table THEN
    -- pin_lockouts table doesn't exist — non-fatal
    RETURN json_build_object('failed_count', 1, 'locked', false, 'attempts_remaining', 4);
  END;
END;
$$;

GRANT EXECUTE ON FUNCTION record_failed_pin TO service_role;

-- ── 4. reset_pin_lockout RPC ─────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION reset_pin_lockout(p_plate_id TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM pin_lockouts WHERE plate_id = upper(trim(p_plate_id));
EXCEPTION WHEN undefined_table THEN
  NULL; -- table doesn't exist — no-op
END;
$$;

GRANT EXECUTE ON FUNCTION reset_pin_lockout TO service_role;

-- ── 5. pin_lockouts table (if not exists) ────────────────────────────────────
CREATE TABLE IF NOT EXISTS pin_lockouts (
  plate_id      TEXT PRIMARY KEY,
  failed_count  INT NOT NULL DEFAULT 0,
  last_attempt  TIMESTAMPTZ NOT NULL DEFAULT now(),
  locked_until  TIMESTAMPTZ
);

-- Service role only — not owner-accessible
ALTER TABLE pin_lockouts ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'pin_lockouts' AND policyname = 'pin_lockouts_service_all') THEN
    CREATE POLICY pin_lockouts_service_all ON pin_lockouts FOR ALL USING (auth.role() = 'service_role');
  END IF;
END $$;

-- ── 6. Ensure users_service_all policy exists ────────────────────────────────
-- Required for admin-data Edge Function (service_role) to read users table.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'users' AND policyname = 'users_service_all') THEN
    CREATE POLICY users_service_all ON users FOR ALL USING (auth.role() = 'service_role');
  END IF;
END $$;

-- ── 7. Ensure subscriptions_service_all policy exists ───────────────────────
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'subscriptions' AND policyname = 'subscriptions_service_all') THEN
    CREATE POLICY subscriptions_service_all ON subscriptions FOR ALL USING (auth.role() = 'service_role');
  END IF;
END $$;

-- ── 8. Ensure orders_service_all policy exists ──────────────────────────────
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'orders' AND policyname = 'orders_service_all') THEN
    CREATE POLICY orders_service_all ON orders FOR ALL USING (auth.role() = 'service_role');
  END IF;
END $$;

-- ── 9. Unlock any stuck pin lockouts (for testing) ──────────────────────────
-- Safe to run — only clears lockouts, doesn't affect user data
DELETE FROM pin_lockouts WHERE locked_until < now();

COMMIT;
