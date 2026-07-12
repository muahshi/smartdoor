-- ============================================================
-- SMART DOOR — PHASE 4: PRODUCTION HARDENING
-- sql/45_production_hardening_phase4.sql
--
-- Run AFTER sql/44_visitor_management_upgrade.sql.
-- Additive only — no destructive changes, no business-logic changes.
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- SECTION 1: FIX audit_logs CHECK CONSTRAINT GAP
--
-- sql/10_security_hardening.sql added chk_audit_action as an allow-list,
-- but several action values that were already shipping in application
-- code were never added to it:
--   'notification_sent'  (services/notifications.js)
--   'voice_note_uploaded' (services/voiceNotes.js)
--   'plate_reactivated'   (admin-plate-status/index.ts)
--   'pin_reset_admin'     (admin-reset-pin/index.ts)
--   'pin_set'             (set-owner-pin/index.ts)
-- Every one of those insert() calls is wrapped in a fail-silent
-- try/catch (by design, so audit logging never breaks the user-facing
-- action) — which means the CHECK violation was being swallowed and
-- these events were NOT being recorded at all. This is a real gap in
-- the audit trail, not just a cosmetic one.
--
-- Also adding the two new action types introduced in Section 2 below
-- (visitor_blocked / visitor_unblocked / visitor_label_changed /
-- visitor_label_cleared) up front so that section can rely on them.
-- ────────────────────────────────────────────────────────────

ALTER TABLE audit_logs DROP CONSTRAINT IF EXISTS chk_audit_action;

ALTER TABLE audit_logs ADD CONSTRAINT chk_audit_action
  CHECK (action IN (
    'login', 'logout',
    'pin_changed', 'pin_failed', 'pin_locked', 'pin_set', 'pin_reset_admin',
    'qr_regenerated', 'qr_viewed',
    'subscription_activated', 'subscription_renewed', 'subscription_cancelled',
    'order_placed', 'order_cancelled',
    'payment_initiated', 'payment_verified', 'payment_failed', 'refund_issued',
    'family_member_added', 'family_member_removed', 'family_member_updated',
    'security_rules_updated', 'status_changed',
    'voice_note_heard', 'voice_note_deleted', 'voice_note_uploaded',
    'call_ended', 'call_initiated',
    'support_ticket_created', 'support_ticket_resolved',
    'admin_action', 'admin_login', 'admin_logout',
    'plate_activated', 'plate_suspended', 'plate_reactivated',
    'data_export_requested', 'account_deleted',
    'notification_sent',
    'visitor_blocked', 'visitor_unblocked',
    'visitor_label_changed', 'visitor_label_cleared'
  ));

-- ────────────────────────────────────────────────────────────
-- SECTION 2: AUDIT TRAIL FOR VISITOR BLOCK / LABEL CHANGES
--
-- Requirement: "Visitor blocked/unblocked" and "Visitor label changes"
-- must be audit-logged. These write paths (set_visitor_blocked,
-- update_visitor_notes_and_label — sql/44) previously made the change
-- but recorded nothing. Logging is added INSIDE the SECURITY DEFINER
-- functions themselves (not in client JS) so it is server-authoritative
-- and can't be skipped by a client that calls the RPC directly. Both
-- functions are CREATE OR REPLACE — signatures are unchanged, so
-- services/activityCenter.js needs no changes.
-- ────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION set_visitor_blocked(
  p_owner_id           UUID,
  p_visitor_profile_id UUID,
  p_blocked            BOOLEAN
)
RETURNS JSON AS $$
DECLARE
  v_was_blocked BOOLEAN;
BEGIN
  IF p_owner_id IS NULL OR p_owner_id != get_my_owner_id() THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  SELECT blocked INTO v_was_blocked
    FROM visitor_profiles
   WHERE id = p_visitor_profile_id AND owner_id = p_owner_id;

  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'Not found');
  END IF;

  UPDATE visitor_profiles
     SET blocked = p_blocked
   WHERE id = p_visitor_profile_id AND owner_id = p_owner_id;

  -- Only log an actual state change (idempotent re-calls don't spam the log).
  IF v_was_blocked IS DISTINCT FROM p_blocked THEN
    INSERT INTO audit_logs (owner_id, action, details)
    VALUES (
      p_owner_id,
      CASE WHEN p_blocked THEN 'visitor_blocked' ELSE 'visitor_unblocked' END,
      jsonb_build_object('visitor_profile_id', p_visitor_profile_id)
    );
  END IF;

  RETURN json_build_object('success', true, 'blocked', p_blocked);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION update_visitor_notes_and_label(
  p_owner_id           UUID,
  p_visitor_profile_id UUID,
  p_notes              TEXT DEFAULT NULL,
  p_label              TEXT DEFAULT NULL,
  p_label_color        TEXT DEFAULT NULL,
  p_clear_label        BOOLEAN DEFAULT FALSE,
  p_photo_url          TEXT DEFAULT NULL
)
RETURNS JSON AS $$
DECLARE
  v_old_label TEXT;
  v_new_label TEXT;
BEGIN
  IF p_owner_id IS NULL OR p_owner_id != get_my_owner_id() THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  SELECT label INTO v_old_label
    FROM visitor_profiles
   WHERE id = p_visitor_profile_id AND owner_id = p_owner_id;

  UPDATE visitor_profiles
     SET notes       = COALESCE(NULLIF(TRIM(p_notes), ''), notes),
         label       = CASE WHEN p_clear_label THEN NULL ELSE COALESCE(NULLIF(TRIM(p_label), ''), label) END,
         label_color = CASE WHEN p_clear_label THEN NULL ELSE COALESCE(NULLIF(TRIM(p_label_color), ''), label_color) END,
         photo_url   = COALESCE(NULLIF(TRIM(p_photo_url), ''), photo_url)
   WHERE id = p_visitor_profile_id AND owner_id = p_owner_id
  RETURNING label INTO v_new_label;

  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'Not found');
  END IF;

  -- Only log when the label itself actually changed — a notes-only or
  -- photo-only save shouldn't produce a "label changed" audit entry.
  IF v_old_label IS DISTINCT FROM v_new_label THEN
    INSERT INTO audit_logs (owner_id, action, details)
    VALUES (
      p_owner_id,
      CASE WHEN v_new_label IS NULL THEN 'visitor_label_cleared' ELSE 'visitor_label_changed' END,
      jsonb_build_object('visitor_profile_id', p_visitor_profile_id, 'from', v_old_label, 'to', v_new_label)
    );
  END IF;

  RETURN json_build_object('success', true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ────────────────────────────────────────────────────────────
-- SECTION 3: MISSING INDEXES FOR VISITOR MANAGEMENT QUERIES
--
-- get_owner_activity_feed (sql/44) filters on p.blocked = TRUE and
-- p.label = <value>, and searches p.name via ILIKE — none of which had
-- supporting indexes. idx_visitor_profiles_favorite (sql/44) already
-- covers the favorites filter; these three fill the remaining gaps.
-- ────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_visitor_profiles_blocked
  ON visitor_profiles(owner_id, blocked) WHERE blocked = TRUE;

CREATE INDEX IF NOT EXISTS idx_visitor_profiles_label
  ON visitor_profiles(owner_id, label) WHERE label IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_visitor_profiles_name_trgm
  ON visitor_profiles USING GIN (name gin_trgm_ops);

-- ════════════════════════════════════════════════════════════════════════════
-- VERIFY
--   -- Should now succeed (previously silently dropped by the CHECK constraint):
--   INSERT INTO audit_logs (action) VALUES ('pin_set');
--   INSERT INTO audit_logs (action) VALUES ('notification_sent');
--
--   -- Block/label changes now produce an audit row:
--   SELECT set_visitor_blocked('<owner-uuid>'::uuid, '<profile-uuid>'::uuid, true);
--   SELECT action, details FROM audit_logs WHERE action = 'visitor_blocked' ORDER BY created_at DESC LIMIT 1;
--
--   SELECT policyname FROM pg_indexes WHERE tablename = 'visitor_profiles';
-- ════════════════════════════════════════════════════════════════════════════
