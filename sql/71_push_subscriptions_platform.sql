-- ============================================================
-- SmartDoor Migration 71 — push_subscriptions.platform (Phase 12E.15)
--
-- CONTEXT: sql/33_push_subscriptions.sql created push_subscriptions with
-- no platform discriminator, because until this phase the ONLY writer was
-- the web PWA (services/push.js). Phase 12E.15 adds a second, structurally
-- different writer — the native Android app, registering a real FCM
-- device token via the Firebase Android SDK rather than a browser Web Push
-- subscription. Both token types are stored in the same table (same FCM
-- v1 send API, same supabase/functions/send-push code path — no reason to
-- split into two tables), but with nothing to tell them apart, a future
-- change to one platform's payload assumptions could silently break the
-- other. This column is metadata only — it does not change send-push's
-- fan-out behavior (still sends to every row for an owner_id) and does not
-- gate any existing functionality.
--
-- SAFE: purely additive. NOT NULL with a DEFAULT backfills every existing
-- (web-only, pre-this-phase) row as 'web' with no manual data migration.
-- ============================================================

ALTER TABLE push_subscriptions
  ADD COLUMN IF NOT EXISTS platform TEXT NOT NULL DEFAULT 'web'
    CHECK (platform IN ('web', 'android', 'ios'));

COMMENT ON COLUMN push_subscriptions.platform IS
  'Which client registered this FCM token: web (PWA, services/push.js) or android (native app, core/data/PushTokenRepository.kt). ios reserved, unused today.';

-- ============================================================
-- END Migration 71
-- ============================================================
