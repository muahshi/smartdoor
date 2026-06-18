-- ============================================================
-- SMART DOOR — PHASE 5: COMMUNICATION ENGINE REALTIME
-- Run AFTER 05_communication_rls.sql
-- ============================================================

ALTER PUBLICATION supabase_realtime ADD TABLE call_logs;
ALTER PUBLICATION supabase_realtime ADD TABLE message_logs;

-- notifications and voice_notes are already added to the publication
-- in sql/03_realtime_seed.sql — no change needed there.

-- ────────── VERIFY ──────────
-- SELECT tablename FROM pg_publication_tables WHERE pubname = 'supabase_realtime';
-- Should include: visitor_logs, notifications, security_rules, voice_notes,
-- status_history, call_logs, message_logs.
