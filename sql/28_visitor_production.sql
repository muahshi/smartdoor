-- ============================================================
-- SmartDoor Migration 28 — Visitor Production Upgrade
-- Adds: unread message counts RPC, bell ring history view,
--       sos_events tracking, and notification realtime policy
-- SAFE: additive only, no schema changes to existing tables
-- ============================================================

-- ─── 1. RPC: unread message + voice note counts for owner dashboard badge ───
CREATE OR REPLACE FUNCTION get_unread_counts(p_owner_id UUID)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_unread_messages  INT;
  v_unread_voices    INT;
  v_unread_sos       INT;
BEGIN
  -- Unread text messages
  SELECT COUNT(*) INTO v_unread_messages
  FROM message_logs
  WHERE owner_id = p_owner_id
    AND is_read = FALSE
    AND message_type = 'text';

  -- Unheard voice notes
  SELECT COUNT(*) INTO v_unread_voices
  FROM voice_notes
  WHERE owner_id = p_owner_id
    AND is_heard = FALSE;

  -- Unread SOS / emergency messages
  SELECT COUNT(*) INTO v_unread_sos
  FROM message_logs
  WHERE owner_id = p_owner_id
    AND is_read = FALSE
    AND message_type = 'emergency';

  RETURN json_build_object(
    'unread_messages', v_unread_messages,
    'unread_voices',   v_unread_voices,
    'unread_sos',      v_unread_sos,
    'total',           v_unread_messages + v_unread_voices + v_unread_sos
  );
END;
$$;

GRANT EXECUTE ON FUNCTION get_unread_counts(UUID) TO authenticated;

-- ─── 2. RPC: mark all text messages as read for an owner ────────────────────
CREATE OR REPLACE FUNCTION mark_messages_read(p_owner_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE message_logs
  SET is_read = TRUE
  WHERE owner_id = p_owner_id
    AND is_read = FALSE;
END;
$$;

GRANT EXECUTE ON FUNCTION mark_messages_read(UUID) TO authenticated;

-- ─── 3. Bell ring history view (for owner dashboard) ────────────────────────
CREATE OR REPLACE VIEW bell_ring_history AS
SELECT
  vl.id,
  vl.owner_id,
  vl.plate_id,
  vl.created_at,
  vl.user_agent,
  p.qr_slug,
  p.product_type
FROM visitor_logs vl
JOIN plates p ON p.plate_id = vl.plate_id
WHERE vl.event_type = 'bell_ring';

-- ─── 4. SOS events view (for owner dashboard emergency timeline) ─────────────
CREATE OR REPLACE VIEW sos_events AS
SELECT
  ml.id,
  ml.owner_id,
  ml.plate_id,
  ml.created_at,
  ml.content,
  ml.is_read,
  p.qr_slug
FROM message_logs ml
JOIN plates p ON p.plate_id = ml.plate_id
WHERE ml.message_type = 'emergency';

-- ─── 5. Notification realtime — ensure notifications table is in realtime ────
-- If already enabled this is a no-op
ALTER TABLE notifications REPLICA IDENTITY FULL;

-- message_logs realtime (for unread badge live updates)
ALTER TABLE message_logs REPLICA IDENTITY FULL;

-- voice_notes realtime (for unread badge live updates)
ALTER TABLE voice_notes REPLICA IDENTITY FULL;

-- ─── 6. Index: unread messages lookup (dashboard badge) ─────────────────────
CREATE INDEX IF NOT EXISTS idx_message_logs_unread
  ON message_logs(owner_id, is_read, message_type)
  WHERE is_read = FALSE;

CREATE INDEX IF NOT EXISTS idx_voice_notes_unheard
  ON voice_notes(owner_id, is_heard)
  WHERE is_heard = FALSE;

-- ─── 7. Visitor call_attempt log in visitor_logs event_type ─────────────────
-- Ensure call_attempt is an accepted event type (no enum constraint exists,
-- but documenting the values used by the visitor page)
-- event_type values: qr_scan, bell_ring, call_attempt, sos_triggered

COMMENT ON COLUMN visitor_logs.event_type IS
  'qr_scan | bell_ring | call_attempt | sos_triggered';
