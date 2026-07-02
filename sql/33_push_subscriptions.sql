-- ============================================================
-- SmartDoor Migration 33 — Background Push Subscriptions (Phase 4c, FCM)
--
-- Closes the one gap services/notificationDispatcher.js documents itself
-- as unable to fix: real delivery when the owner's dashboard/PWA is fully
-- closed (screen off, tab killed), not just backgrounded.
--
-- Uses Firebase Cloud Messaging (Firebase project + web push certificate
-- already provisioned — FIREBASE_* vars in Vercel + Supabase secrets), not
-- raw Web Push/VAPID. Each row is one device's FCM registration token.
--
-- Companion pieces (not SQL): supabase/functions/send-push, services/push.js,
-- sw.js (Firebase Messaging compat integration), scripts/build-env.js.
-- SAFE: purely additive, new table only.
-- ============================================================

CREATE TABLE IF NOT EXISTS push_subscriptions (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  fcm_token    TEXT NOT NULL,       -- from firebase.messaging().getToken()
  user_agent   TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(owner_id, fcm_token)       -- re-subscribing the same device updates, never duplicates
);

CREATE INDEX IF NOT EXISTS idx_push_subscriptions_owner ON push_subscriptions(owner_id);

ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;

-- Owner manages their own devices. supabase/functions/send-push reads
-- across ALL owners using the service_role key, which bypasses RLS
-- entirely — no anon/authenticated SELECT policy is needed for that path.
CREATE POLICY "push_subscriptions_select_own" ON push_subscriptions
  FOR SELECT USING (owner_id = get_my_owner_id());

CREATE POLICY "push_subscriptions_insert_own" ON push_subscriptions
  FOR INSERT WITH CHECK (owner_id = get_my_owner_id());

CREATE POLICY "push_subscriptions_update_own" ON push_subscriptions
  FOR UPDATE USING (owner_id = get_my_owner_id());

CREATE POLICY "push_subscriptions_delete_own" ON push_subscriptions
  FOR DELETE USING (owner_id = get_my_owner_id());

-- ============================================================
-- END Migration 33
-- ============================================================
