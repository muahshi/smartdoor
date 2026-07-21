-- ============================================================
-- SMART DOOR — PRODUCTION HARDENING
-- Migration: 66_family_member_server_side_limit.sql
--
-- ROOT CAUSE (Sprint 5 validation, P1-1):
--   services/security.js#addFamilyMember() enforces the owner's plan
--   limit (Free=2 / Premium=5 / Enterprise=20) entirely client-side,
--   by reading getUsageSummary() before calling .insert(). The RLS
--   policy on family_members ("family_insert_own",
--   sql/02_rls_policies.sql) only checks `owner_id = get_my_owner_id()`
--   — there is no row-count predicate. Any authenticated owner can call
--   supabase.from('family_members').insert(...) directly (devtools /
--   a modified client) and add unlimited family members regardless of
--   plan, completely bypassing the cap.
--
-- FIX: a BEFORE INSERT trigger on family_members that re-derives the
-- SAME limit the rest of the codebase already uses — no new plan
-- table, no hardcoded numbers. It reads:
--   1. the owner's current plan from `subscriptions`
--      (latest active row, default 'free' if none) — the exact
--      resolution already used by check_and_increment_usage() and
--      get_usage_summary() in sql/46_saas_billing_schema.sql.
--   2. that plan's `family_members_limit` from `plan_catalog`
--      (sql/46) — the single source of truth already seeded with
--      Free=2 / Premium=5 / Enterprise=20 and already what
--      getUsageSummary()'s "family" usage bar reads from.
--
-- No plan limits are duplicated or hardcoded here (beyond the same
-- "2" fail-safe already used client-side in services/security.js for
-- the case a plan_catalog row is somehow missing).
--
-- SCOPE — exactly what was asked for, nothing else:
--   - Only gates INSERT. UPDATE/DELETE on family_members are
--     untouched (there is no code path anywhere in this repo that
--     reactivates a member via UPDATE — removeFamilyMember() does a
--     hard DELETE — so INSERT is the only place a new "slot" is ever
--     created).
--   - Does not touch subscriptions, plan_catalog, WebRTC, payments,
--     AI, or any existing RLS policy. family_insert_own is untouched;
--     this trigger runs alongside it as a second, independent gate.
--   - Grandfathering is automatic and requires no extra logic: the
--     trigger only fires on the INSERT statement for a NEW row. Rows
--     that already exist (e.g. an owner who had 5 members on Premium
--     and downgraded to Free) are never re-evaluated, re-counted
--     against, or touched — they simply are not part of what a BEFORE
--     INSERT trigger looks at. That owner keeps all 5 existing
--     members; the trigger only blocks a 6th.
--
-- Idempotent — safe to re-run (CREATE OR REPLACE FUNCTION,
-- DROP TRIGGER IF EXISTS + CREATE TRIGGER).
--
-- SEARCH_PATH: pinned to `public, pg_temp`, matching every other
-- SECURITY DEFINER function in this project (sql/50_production_
-- readiness_hardening.sql's Part 1). sql/50's pinning pass is a
-- one-time DO block over a hardcoded function-name list, so it can
-- never retroactively cover a function created after it ran — this
-- function pins its own search_path at creation time instead, closing
-- the same caller-controlled search_path hijack risk sql/50 already
-- closed for every function that existed before it.
-- ============================================================

CREATE OR REPLACE FUNCTION enforce_family_member_limit()
RETURNS TRIGGER AS $$
DECLARE
  v_plan  TEXT;
  v_limit INTEGER;
  v_used  INTEGER;
BEGIN
  -- Inserts of an already-inactive row (soft-added-but-disabled, if a
  -- future caller ever does that) don't consume a slot — mirrors
  -- get_usage_summary()'s v_family_used, which only counts
  -- is_active = TRUE rows.
  IF NEW.is_active IS DISTINCT FROM TRUE THEN
    RETURN NEW;
  END IF;

  -- Same plan resolution as check_and_increment_usage() / get_usage_summary()
  -- (sql/46_saas_billing_schema.sql): latest active subscription row,
  -- default 'free' if the owner has none (hardware_only owners, etc.).
  SELECT plan INTO v_plan FROM subscriptions
    WHERE owner_id = NEW.owner_id AND status = 'active'
    ORDER BY created_at DESC LIMIT 1;
  IF v_plan IS NULL THEN
    v_plan := 'free';
  END IF;

  -- Single source of truth: plan_catalog.family_members_limit
  -- (sql/46 — already what services/security.js's client-side check
  -- and the "family" usage bar on the dashboard both read, via
  -- getUsageSummary()). -1 = unlimited, same sentinel used everywhere
  -- else in this schema.
  SELECT family_members_limit INTO v_limit
    FROM plan_catalog WHERE plan_key = v_plan;

  IF v_limit IS NULL THEN
    -- plan_catalog row missing for this plan key — fail safe to the
    -- Free-tier limit, same fallback services/security.js already
    -- uses client-side when getUsageSummary() itself fails.
    v_limit := 2;
  END IF;

  IF v_limit = -1 THEN
    RETURN NEW; -- unlimited plan
  END IF;

  -- Count this owner's current active family members. Because this is
  -- a BEFORE INSERT trigger, NEW has not been written yet, so this
  -- count is exactly "how many slots are already used" — no off-by-one
  -- handling needed.
  SELECT COUNT(*) INTO v_used
    FROM family_members
    WHERE owner_id = NEW.owner_id AND is_active = TRUE;

  IF v_used >= v_limit THEN
    -- Message text matches services/security.js's existing client-side
    -- copy exactly, so the existing UI (js/dashboard.js#_addMember,
    -- which already does `showToast(result.error || ..., 'danger')`)
    -- displays this cleanly with no UI changes required.
    RAISE EXCEPTION 'Maximum % family member% allowed on your current plan. Upgrade to add more.',
      v_limit, (CASE WHEN v_limit = 1 THEN '' ELSE 's' END)
      USING ERRCODE = 'P0001';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

DROP TRIGGER IF EXISTS trg_family_members_enforce_limit ON family_members;
CREATE TRIGGER trg_family_members_enforce_limit
  BEFORE INSERT ON family_members
  FOR EACH ROW EXECUTE FUNCTION enforce_family_member_limit();

-- ── Run these after migration to verify ──────────────────────────────
-- 1. Confirm the trigger is attached:
--    SELECT tgname, tgenabled FROM pg_trigger
--      WHERE tgrelid = 'family_members'::regclass AND tgname = 'trg_family_members_enforce_limit';
--
-- 2. Pick a real Free-plan owner_id with < 2 active family members and
--    confirm inserts up to the limit succeed, and the next one fails:
--    INSERT INTO family_members (owner_id, name, phone) VALUES ('<owner_id>', 'Test 1', '+919999900001');
--    INSERT INTO family_members (owner_id, name, phone) VALUES ('<owner_id>', 'Test 2', '+919999900002');
--    INSERT INTO family_members (owner_id, name, phone) VALUES ('<owner_id>', 'Test 3', '+919999900003');
--    -- ^ expected to raise: "Maximum 2 family members allowed on your current plan. Upgrade to add more."
--
-- 3. Grandfathering check — an owner who already exceeds their current
--    plan's limit (e.g. downgraded) still has full read/update/delete
--    access to their existing rows; only a further INSERT is blocked:
--    SELECT owner_id, COUNT(*) FROM family_members WHERE is_active = TRUE
--      GROUP BY owner_id HAVING COUNT(*) > 2; -- pre-existing over-limit owners, untouched by this migration

