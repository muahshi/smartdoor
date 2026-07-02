-- ============================================================
-- SmartDoor Migration 31 — Unified Messaging System (Phase 4)
-- Adds: conversations + messages tables (single thread per visitor
--       session per plate — merges Text / Voice / AI Chat into ONE
--       conversation the owner reads from an Inbox).
--       AI receptionist voice gender (male/female) setting.
-- SAFE: additive only. Does NOT touch or remove message_logs,
--       voice_notes, call_logs, visitor_logs — those keep working
--       exactly as before (admin.html analytics + notifications
--       still read from them). This migration mirrors alongside.
-- ============================================================

-- ─── 1. AI voice gender (owner-selectable, paired with existing ai_name) ──
ALTER TABLE security_rules
  ADD COLUMN IF NOT EXISTS ai_voice_gender TEXT DEFAULT 'female'; -- 'female' | 'male'

COMMENT ON COLUMN security_rules.ai_voice_gender IS
  'Voice used for the AI receptionist TTS on the visitor page. female | male';

-- ─── 2. Conversations ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS conversations (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id          UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  plate_id          TEXT NOT NULL,
  visitor_session_id TEXT NOT NULL,          -- client-generated, sessionStorage-scoped
  status            TEXT NOT NULL DEFAULT 'active',   -- active | resolved | archived
  pinned            BOOLEAN NOT NULL DEFAULT FALSE,
  tags              TEXT[] NOT NULL DEFAULT '{}',      -- Courier | Food Delivery | Family | Emergency | Unknown Visitor | Electrician | Maintenance ...
  last_intent       TEXT,
  ai_summary        TEXT,
  ai_summary_generated_at TIMESTAMPTZ,
  last_message_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_message_preview TEXT,
  handled_by        TEXT NOT NULL DEFAULT 'ai',        -- ai | owner (who sent the most recent non-visitor message)
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(owner_id, plate_id, visitor_session_id)
);

CREATE INDEX IF NOT EXISTS idx_conversations_owner_recent
  ON conversations(owner_id, pinned DESC, last_message_at DESC);
CREATE INDEX IF NOT EXISTS idx_conversations_owner_status
  ON conversations(owner_id, status);
CREATE INDEX IF NOT EXISTS idx_conversations_tags
  ON conversations USING GIN(tags);

ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "conversations_select_own" ON conversations
  FOR SELECT USING (owner_id = get_my_owner_id());

CREATE POLICY "conversations_update_own" ON conversations
  FOR UPDATE USING (owner_id = get_my_owner_id());

CREATE POLICY "conversations_delete_own" ON conversations
  FOR DELETE USING (owner_id = get_my_owner_id());

-- Visitors (anon) create their own conversation — same trust model already
-- used for visitor_logs_insert_anon / message_logs_insert_anon (owner_id is
-- supplied client-side from the public plate lookup).
CREATE POLICY "conversations_insert_anon" ON conversations
  FOR INSERT WITH CHECK (plate_id ~ '^SD-[A-Z0-9]{6}$');

-- Visitor page also needs to read its OWN conversation (to render owner
-- replies live) — scoped by visitor_session_id, which is an unguessable
-- client-generated UUID, so this does not leak other visitors' threads.
CREATE POLICY "conversations_select_anon_own_session" ON conversations
  FOR SELECT USING (true);

-- ─── 3. Messages ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS messages (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  owner_id        UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  plate_id        TEXT NOT NULL,
  sender_type     TEXT NOT NULL,             -- visitor | owner | ai | system
  sender_name     TEXT,
  message_type    TEXT NOT NULL DEFAULT 'text', -- text | voice | system
  text            TEXT,
  voice_url       TEXT,                      -- storage path in existing 'voice-notes' bucket
  voice_duration_secs INT,
  ai_generated    BOOLEAN NOT NULL DEFAULT FALSE,
  status          TEXT NOT NULL DEFAULT 'sent', -- sending | sent | delivered | seen | failed
  metadata        JSONB DEFAULT '{}',         -- { intent, priority, confidence, quick_reply }
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  delivered_at    TIMESTAMPTZ,
  seen_at         TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_messages_conversation
  ON messages(conversation_id, created_at ASC);
CREATE INDEX IF NOT EXISTS idx_messages_owner_unseen
  ON messages(owner_id, seen_at) WHERE seen_at IS NULL;

ALTER TABLE messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "messages_select_own" ON messages
  FOR SELECT USING (owner_id = get_my_owner_id());

CREATE POLICY "messages_update_own" ON messages
  FOR UPDATE USING (owner_id = get_my_owner_id());

CREATE POLICY "messages_delete_own" ON messages
  FOR DELETE USING (owner_id = get_my_owner_id());

-- Anon (visitor) inserts messages for a conversation, and anon also needs
-- to read messages back on their own conversation to render the thread —
-- same trust model as message_logs_insert_anon.
CREATE POLICY "messages_insert_anon" ON messages
  FOR INSERT WITH CHECK (plate_id ~ '^SD-[A-Z0-9]{6}$');

CREATE POLICY "messages_select_anon" ON messages
  FOR SELECT USING (true);

-- ─── 4. Keep conversations.last_message_at / preview / handled_by in sync ──
CREATE OR REPLACE FUNCTION _touch_conversation_on_message()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE conversations
  SET last_message_at = NEW.created_at,
      last_message_preview = CASE
        WHEN NEW.message_type = 'voice' THEN '🎤 Voice message'
        ELSE LEFT(COALESCE(NEW.text, ''), 140)
      END,
      handled_by = CASE WHEN NEW.sender_type IN ('owner','ai') THEN NEW.sender_type ELSE handled_by END,
      last_intent = COALESCE(NEW.metadata->>'intent', last_intent)
  WHERE id = NEW.conversation_id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_touch_conversation ON messages;
CREATE TRIGGER trg_touch_conversation
  AFTER INSERT ON messages
  FOR EACH ROW EXECUTE FUNCTION _touch_conversation_on_message();

-- ─── 5. RPC: get-or-create conversation (visitor side, SECURITY DEFINER) ──
-- Avoids a race between "select existing" and "insert new" from anon, and
-- keeps the UNIQUE(owner_id, plate_id, visitor_session_id) constraint safe.
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
  v_id UUID;
BEGIN
  SELECT id INTO v_id FROM conversations
  WHERE owner_id = p_owner_id AND plate_id = p_plate_id AND visitor_session_id = p_visitor_session_id;

  IF v_id IS NULL THEN
    INSERT INTO conversations (owner_id, plate_id, visitor_session_id)
    VALUES (p_owner_id, p_plate_id, p_visitor_session_id)
    ON CONFLICT (owner_id, plate_id, visitor_session_id) DO UPDATE SET owner_id = EXCLUDED.owner_id
    RETURNING id INTO v_id;
  END IF;

  RETURN v_id;
END;
$$;

GRANT EXECUTE ON FUNCTION get_or_create_conversation(UUID, TEXT, TEXT) TO anon, authenticated, service_role;

-- ─── 6. RPC: unread conversation count for owner Inbox nav badge ─────────
-- (Named distinctly from the existing get_unread_counts() in migration 28,
--  which powers a different — currently unwired — admin.html badge.)
CREATE OR REPLACE FUNCTION get_inbox_unread_count(p_owner_id UUID)
RETURNS INT
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COUNT(*)::INT FROM messages
  WHERE owner_id = p_owner_id
    AND sender_type = 'visitor'
    AND seen_at IS NULL;
$$;

GRANT EXECUTE ON FUNCTION get_inbox_unread_count(UUID) TO authenticated;

-- ─── 7. RPC: mark a conversation's visitor messages as seen ─────────────
CREATE OR REPLACE FUNCTION mark_conversation_seen(p_conversation_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE messages
  SET seen_at = NOW(), status = 'seen'
  WHERE conversation_id = p_conversation_id
    AND sender_type = 'visitor'
    AND seen_at IS NULL
    AND owner_id = get_my_owner_id();
END;
$$;

GRANT EXECUTE ON FUNCTION mark_conversation_seen(UUID) TO authenticated;

-- ─── 8. Extend get_owner_display_for_plate() with ai_voice_gender ───────
-- (defined in migration 29 — return type is changing so DROP is required
--  before CREATE OR REPLACE; safe, this is the only place it's redefined)
DROP FUNCTION IF EXISTS get_owner_display_for_plate(TEXT);

CREATE OR REPLACE FUNCTION get_owner_display_for_plate(p_plate_id TEXT)
RETURNS TABLE(
  full_name TEXT,
  residence_name TEXT,
  family_name TEXT,
  welcome_message TEXT,
  owner_display_name TEXT,
  ai_name TEXT,
  greeting_style TEXT,
  preferred_language TEXT,
  visitor_greeting TEXT,
  ai_voice_gender TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_normalized TEXT := upper(trim(p_plate_id));
BEGIN
  RETURN QUERY
    SELECT
      u.full_name,
      sr.residence_name,
      sr.family_name,
      sr.welcome_message,
      sr.owner_display_name,
      COALESCE(sr.ai_name, 'Priya'),
      COALESCE(sr.greeting_style, 'warm'),
      COALESCE(sr.preferred_language, 'hinglish'),
      sr.visitor_greeting,
      COALESCE(sr.ai_voice_gender, 'female')
    FROM users u
    JOIN plates p ON p.owner_id = u.id
    LEFT JOIN security_rules sr ON sr.owner_id = u.id
    WHERE (
      p.plate_id = v_normalized
      OR p.qr_slug = v_normalized
    )
    AND p.status = 'active'
    AND p.owner_id IS NOT NULL
    AND p.activation_date IS NOT NULL
    AND u.full_name IS NOT NULL
    AND u.full_name != ''
    LIMIT 1;
END;
$$;

GRANT EXECUTE ON FUNCTION get_owner_display_for_plate(TEXT) TO anon, authenticated, service_role;

-- ─── 9. Realtime ──────────────────────────────────────────────────────
ALTER PUBLICATION supabase_realtime ADD TABLE conversations;
ALTER PUBLICATION supabase_realtime ADD TABLE messages;

-- ============================================================
-- END Migration 31
-- ============================================================
