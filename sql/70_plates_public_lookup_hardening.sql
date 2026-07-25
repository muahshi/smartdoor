-- ════════════════════════════════════════════════════════════════════════════
-- Migration 70: Plates Public Lookup Hardening (Phase 4A — Production Security)
--
-- CONFIRMED VULNERABILITY (see PHASE4A_SECURITY_AUDIT.md for full proof):
--   Migration 27 (sql/27_activation_redesign.sql) replaced the old
--   `plates_public_qr_lookup` policy (USING (status = 'active')) with:
--
--     CREATE POLICY plates_public_activation_check ON plates
--       FOR SELECT USING (true);
--
--   This policy has no `TO` clause, so it applies to BOTH the `anon` and
--   `authenticated` Postgres roles, and RLS in Postgres is ROW-level only —
--   it cannot see or restrict which columns a PostgREST client asks for.
--   The migration's own comment ("PostgREST column-level select filtering is
--   enforced via the JS select() call ... A user cannot SELECT columns not
--   specified in the query") is incorrect: any client holding the public
--   anon key can call
--     GET /rest/v1/plates?select=*
--   directly (bypassing the app's JS entirely) and receive every row and
--   every column of the table — plate_id, owner_id, status, suspended_reason,
--   tracking_number, provisioned_by, fulfillment_status, qr_image_url, etc. —
--   with PostgREST's default pagination (Range headers) covering the whole
--   table. fix-qr.html and bulk-regenerate-qr.html (removed in this same
--   phase) are proof this exact request pattern was already in use.
--
-- WHY THIS WASN'T DROPPED OUTRIGHT:
--   Three live call sites depend on this policy being permissive:
--     1. services/plates.js — isPlateActive() / getPlateBySlug()
--        (visitor QR scan → activation check)
--     2. visitor.html inline init() — a parallel implementation of the same
--        qr_slug/plate_id lookup used directly by the visitor PWA
--     3. onboarding.html — looks up { owner_id, plate_id } by plate_id
--        immediately after supabase.auth.verifyOtp(), before the users row's
--        auth_user_id is necessarily linked yet, so plates_select_own
--        (owner_id = get_my_owner_id()) cannot be relied on to cover it.
--   All three only ever need a SINGLE row, by exact qr_slug/plate_id match,
--   restricted to the 7 non-sensitive columns already selected by the app
--   today (id, plate_id, qr_slug, product_type, status, owner_id,
--   activation_date). None of them ever list/scan the table.
--
-- FIX (additive, smallest change that closes the hole):
--   1. Add get_plate_public_lookup(p_identifier) — a SECURITY DEFINER RPC,
--      following the exact pattern already used by get_owner_display_for_plate
--      and get_subscription_status_for_plate in migration 27. It performs the
--      identical single-row OR(qr_slug, plate_id) match server-side and
--      returns only the 7 columns above. It cannot be used to list/scan rows.
--   2. Drop plates_public_activation_check. Anon/authenticated no longer
--      have blanket table-level SELECT on plates; the RPC is the only public
--      path now. plates_select_own / plates_update_own / plates_service_all
--      are untouched.
--
-- NOT CHANGED:
--   - Admin dashboard reads plates via the admin-data Edge Function
--     (service_role, bypasses RLS entirely) — confirmed in
--     supabase/functions/admin-data/index.ts. It is unaffected by this
--     migration. (services/admin.js, services/customers.js,
--     services/manufacturing.js, services/qualityControl.js, and
--     services/replacementTransfer.js — which do direct anon-key
--     `.from('plates')` bulk/`select('*')` reads — are legacy modules
--     superseded by admin-data and are not imported by admin.html or any
--     other live page; see PHASE4A_SECURITY_AUDIT.md. They are left
--     untouched per "no unrelated refactoring", but will lose the ability
--     to bulk-read plates as anon once this migration lands. This is a
--     dead-code-only regression risk, called out explicitly in the audit.)
--
-- Idempotent — safe to run multiple times.
-- Run in: Supabase Dashboard > SQL Editor > New Query
-- ════════════════════════════════════════════════════════════════════════════

BEGIN;

-- ── 1. Additive: single-row public lookup RPC ───────────────────────────────
CREATE OR REPLACE FUNCTION get_plate_public_lookup(p_identifier TEXT)
RETURNS TABLE(
  id              UUID,
  plate_id        TEXT,
  qr_slug         TEXT,
  product_type    TEXT,
  status          TEXT,
  owner_id        UUID,
  activation_date TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_normalized TEXT := upper(trim(p_identifier));
BEGIN
  IF v_normalized IS NULL OR v_normalized = '' THEN
    RETURN;
  END IF;

  RETURN QUERY
    SELECT p.id, p.plate_id, p.qr_slug, p.product_type, p.status,
           p.owner_id, p.activation_date
    FROM plates p
    WHERE p.qr_slug = v_normalized OR p.plate_id = v_normalized
    LIMIT 1;
END;
$$;

GRANT EXECUTE ON FUNCTION get_plate_public_lookup(TEXT) TO anon, authenticated, service_role;

-- ── 2. Remove the blanket anon/authenticated table-level SELECT ────────────
-- The RPC above is now the only public/anon path to plate lookup by
-- identifier. plates_select_own (owner) and plates_service_all
-- (service_role) are unaffected.
DROP POLICY IF EXISTS plates_public_activation_check ON plates;

COMMIT;

-- ── Verify after applying ───────────────────────────────────────────────────
-- 1. Confirm the blanket policy is gone:
--      SELECT policyname, qual FROM pg_policies WHERE tablename = 'plates';
-- 2. Confirm a direct anon table dump is now empty/blocked:
--      curl "$SUPABASE_URL/rest/v1/plates?select=*" -H "apikey: $ANON_KEY" -H "Authorization: Bearer $ANON_KEY"
--      → should return [] (RLS: no matching rows for anon), not a full table dump.
-- 3. Confirm the RPC still resolves a known plate:
--      curl -X POST "$SUPABASE_URL/rest/v1/rpc/get_plate_public_lookup" \
--        -H "apikey: $ANON_KEY" -H "Authorization: Bearer $ANON_KEY" -H "Content-Type: application/json" \
--        -d '{"p_identifier":"SD-XXXXXX"}'
--      → should return the single matching plate row.
