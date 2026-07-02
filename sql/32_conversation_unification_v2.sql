-- ============================================================
-- SmartDoor Migration 32 — Conversation System Completion (Phase 4b)
--
-- Fixes three specific gaps left after migration 31:
--
--  (A) get_or_create_conversation() keyed purely on a sessionStorage id,
--      which resets every browser tab session — so a visitor rescanning
--      the same QR 5 minutes later in a new tab got a brand new
--      conversation instead of reusing one. There was also no time
--      window or resolved-status handling at all.
--      FIX: visitor identity now uses the SAME persistent localStorage
--      fingerprint already used by remember_visitor() (services layer
--      change, see visitor.html / messaging.js). This migration changes
--      the RPC so that for a given (owner, plate, visitor fingerprint):
--        - an ACTIVE conversation last active within 24h is reused
--        - an ACTIVE conversation idle > 24h is auto-archived and a new
--          conversation is created
--        - a conversation that is already 'resolved' is never reused;
--          a new one is created
--
--  (B) Doorbell rings / QR scans / SOS never appeared in the unified
--      conversation timeline — only text/voice/AI turns did. They also
--      carried no conversation_id, so tapping their OS notification
--      could not deep-link to a thread.
--      FIX: additive `conversation_id` column on visitor_logs and
--      message_logs (both nullable, both ON DELETE SET NULL — legacy
--      tables and their RLS/consumers are completely unaffected if the
--      column is left NULL).
--
--  (C) UNIQUE(owner_id, plate_id, visitor_session_id) on conversations
--      made it impossible to ever have a second (new) conversation for
--      the same visitor once the first existed — which is exactly what
--      (A) requires once a thread is resolved or stale.
--      FIX: replace with a partial unique index that only applies to
--      'active' conversations.
--
-- SAFE: additive + one constraint swap. Does not drop/rename any
-- existing column, does not touch RLS on visitor_logs/message_logs.
-- ============================================================

-- ─── 1. conversations: relax uniqueness to "one ACTIVE thread per visitor" ──
ALTER TABLE conversations DROP CONSTRAINT IF EXISTS conversations_owner_id_plate_id_visitor_session_id_key;

CREATE UNIQUE INDEX IF NOT EXISTS uq_conversations_active_visitor
  ON conversations(owner_id, plate_id, visitor_session_id)
  WHERE status = 'active';

-- ─── 2. Thread doorbell / QR scan / SOS into the unified timeline ──────
ALTER TABLE visitor_logs
  ADD COLUMN IF NOT EXISTS conversation_id UUID REFERENCES conversations(id) ON DELETE SET NULL;

ALTER TABLE message_logs
  ADD COLUMN IF NOT EXISTS conversation_id UUID REFERENCES conversations(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_visitor_logs_conversation ON visitor_logs(conversation_id) WHERE conversation_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_message_logs_conversation ON message_logs(conversation_id) WHERE conversation_id IS NOT NULL;

-- ─── 3. get_or_create_conversation() — 24h window + resolved handling ──
-- p_visitor_session_id is now expected to be the PERSISTENT per-device
-- fingerprint (services/messaging.js#getVisitorSessionId reads it from
-- localStorage 'sd_visitor_fp' — the same key remember_visitor() already
-- uses, so visitor identity is derived from a single source, not
-- duplicated). The parameter name is left unchanged to avoid touching
-- every call site — only what's stored in it changed.
CREATE OR REPLACE FUNCTION get_or_create_conversation(
  p_owner_id UUID,
  p_plate_id TEXT,
  p_visitor_session_id TEXT
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id      UUID;
  v_last    TIMESTAMPTZ;
BEGIN
  -- Most recent ACTIVE conversation for this exact visitor+plate+owner.
  SELECT id, last_message_at INTO v_id, v_last
  FROM conversations
  WHERE owner_id = p_owner_id
    AND plate_id = p_plate_id
    AND visitor_session_id = p_visitor_session_id
    AND status = 'active'
  ORDER BY last_message_at DESC
  LIMIT 1;

  IF v_id IS NOT NULL AND v_last < NOW() - INTERVAL '24 hours' THEN
    -- Stale — archive it so the partial unique index frees up, then fall
    -- through to create a fresh conversation below.
    UPDATE conversations SET status = 'archived' WHERE id = v_id;
    v_id := NULL;
  END IF;

  IF v_id IS NULL THEN
    INSERT INTO conversations (owner_id, plate_id, visitor_session_id)
    VALUES (p_owner_id, p_plate_id, p_visitor_session_id)
    ON CONFLICT (owner_id, plate_id, visitor_session_id) WHERE status = 'active'
    DO UPDATE SET owner_id = EXCLUDED.owner_id
    RETURNING id INTO v_id;
  END IF;

  RETURN v_id;
END;
$$;

GRANT EXECUTE ON FUNCTION get_or_create_conversation(UUID, TEXT, TEXT) TO anon, authenticated, service_role;

-- ============================================================
-- END Migration 32
-- ============================================================
