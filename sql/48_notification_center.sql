-- ════════════════════════════════════════════════════════════════════════════
-- Migration 48: Production Notification Center
--
-- Purpose:
--   1. Add a `category` column to `notifications` (Visitor Calls, Missed
--      Visitors, Visitor Activity, Subscription, Payments, Admin, Security)
--      so the owner-facing Notification Center can filter/tab by category
--      without touching any existing caller of services/notifications.js.
--   2. Backfill category for existing rows + auto-fill it on future INSERTs
--      via a BEFORE INSERT trigger, so no existing call site (dispatch(),
--      notifyBellRing(), notifyStatusChange(), etc.) needs to change.
--   3. Add `notification_preferences` (one row per owner) — quiet hours,
--      sound toggle, per-category enable/disable. Owner-scoped, RLS secured.
--   4. Add the missing DELETE policy on notifications (owner can delete
--      their own notification — was never granted before this).
--   5. Additive, non-WebRTC-code triggers that populate categories that
--      previously had no writer at all:
--        - "Missed Visitors" from rtc_call_attempts (Tap to Talk outcomes
--          that mean nobody answered) — read-only observer, does not
--          touch any WebRTC JS/service file.
--        - "Payments" from payments table status transitions.
--        - "Admin" from activation_events rows written by an admin actor.
--   6. Pagination-friendly indexes on (owner_id, category, created_at).
--
-- Idempotent — safe to run multiple times. Does not modify WebRTC call
-- flow, signaling, or presence code in any way — only reads
-- rtc_call_attempts after the (unmodified) WebRTC code already wrote it.
--
-- Run in: Supabase Dashboard > SQL Editor > New Query
-- Run AFTER: sql/47_premium_included_migration.sql
-- ════════════════════════════════════════════════════════════════════════════

BEGIN;

-- ── 1. Category column on notifications ──────────────────────────────────────
ALTER TABLE notifications
  ADD COLUMN IF NOT EXISTS category TEXT;

-- Canonical category vocabulary (enforced at the app layer + this CHECK):
--   'visitor_calls' | 'missed_visitors' | 'visitor_activity' | 'subscription'
--   | 'payments' | 'admin' | 'security'
ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_category_check;
ALTER TABLE notifications
  ADD CONSTRAINT notifications_category_check
  CHECK (category IS NULL OR category IN (
    'visitor_calls', 'missed_visitors', 'visitor_activity',
    'subscription', 'payments', 'admin', 'security'
  ));

-- ── 2. Category mapping function (used by trigger + backfill) ────────────────
-- Maps the existing `type` values (already produced by every current caller
-- of services/notifications.js) to one of the 7 categories. Nothing here
-- requires any call site to pass a new field — this is a pure derivation.
CREATE OR REPLACE FUNCTION sd_notification_category(p_type TEXT, p_payload JSONB)
RETURNS TEXT AS $$
BEGIN
  CASE p_type
    WHEN 'call'            THEN RETURN 'visitor_calls';
    WHEN 'missed_call'      THEN RETURN 'missed_visitors';
    WHEN 'bell'             THEN RETURN 'visitor_activity';
    WHEN 'voice'            THEN RETURN 'visitor_activity';
    WHEN 'inbox_message'    THEN RETURN 'visitor_activity';
    WHEN 'sos'              THEN RETURN 'security';
    WHEN 'security_alert'   THEN RETURN 'security';
    WHEN 'payment'          THEN RETURN 'payments';
    WHEN 'admin_action'     THEN RETURN 'admin';
    WHEN 'status_change' THEN
      -- Subscription-expiry notifications (notifySubscriptionExpiry) always
      -- carry a numeric daysLeft in payload; every other status_change
      -- caller (order/QR/manufacturing/shipping/activation lifecycle) does
      -- not, so this distinguishes them without any call-site change.
      IF p_payload ? 'daysLeft' THEN
        RETURN 'subscription';
      ELSE
        RETURN 'admin';
      END IF;
    ELSE
      RETURN 'admin';
  END CASE;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- ── 3. Auto-fill category on insert (only when caller didn't set one) ────────
CREATE OR REPLACE FUNCTION sd_notifications_set_category()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.category IS NULL THEN
    NEW.category := sd_notification_category(NEW.type, COALESCE(NEW.payload, '{}'::jsonb));
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_notifications_set_category ON notifications;
CREATE TRIGGER trg_notifications_set_category
  BEFORE INSERT ON notifications
  FOR EACH ROW EXECUTE FUNCTION sd_notifications_set_category();

-- Backfill existing rows once.
UPDATE notifications
SET category = sd_notification_category(type, COALESCE(payload, '{}'::jsonb))
WHERE category IS NULL;

-- ── 4. Pagination-friendly indexes ────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_notifications_owner_category_created
  ON notifications(owner_id, category, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_notifications_owner_unread_created
  ON notifications(owner_id, is_read, created_at DESC);

-- ── 5. Missing DELETE policy (owner can delete their own notification) ───────
DROP POLICY IF EXISTS "notifications_delete_own" ON notifications;
CREATE POLICY "notifications_delete_own" ON notifications
  FOR DELETE USING (owner_id = get_my_owner_id());

-- ── 6. NOTIFICATION PREFERENCES ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS notification_preferences (
  owner_id              UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  sound_enabled         BOOLEAN NOT NULL DEFAULT TRUE,
  quiet_hours_enabled   BOOLEAN NOT NULL DEFAULT FALSE,
  quiet_hours_start     TIME NOT NULL DEFAULT '22:00',
  quiet_hours_end       TIME NOT NULL DEFAULT '07:00',
  -- { "<category>": { "in_app": true, "push": true } } — defaults applied
  -- client-side (services/notifications.js#DEFAULT_CATEGORY_PREFS) when a
  -- category key is absent, so this can start as an empty object.
  category_prefs        JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE notification_preferences ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "notification_preferences_select_own" ON notification_preferences;
CREATE POLICY "notification_preferences_select_own" ON notification_preferences
  FOR SELECT USING (owner_id = get_my_owner_id());

DROP POLICY IF EXISTS "notification_preferences_upsert_own" ON notification_preferences;
CREATE POLICY "notification_preferences_upsert_own" ON notification_preferences
  FOR INSERT WITH CHECK (owner_id = get_my_owner_id());

DROP POLICY IF EXISTS "notification_preferences_update_own" ON notification_preferences;
CREATE POLICY "notification_preferences_update_own" ON notification_preferences
  FOR UPDATE USING (owner_id = get_my_owner_id());

CREATE OR REPLACE FUNCTION sd_notification_preferences_touch_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_notification_preferences_updated_at ON notification_preferences;
CREATE TRIGGER trg_notification_preferences_updated_at
  BEFORE UPDATE ON notification_preferences
  FOR EACH ROW EXECUTE FUNCTION sd_notification_preferences_touch_updated_at();

-- Service role (Edge Functions, e.g. send-push quiet-hours check) needs read
-- access regardless of RLS — service_role already bypasses RLS by default,
-- no extra grant required, but make it explicit for clarity/audit:
GRANT ALL ON notification_preferences TO service_role;

-- ── 7. "Missed Visitors" — additive observer trigger on rtc_call_attempts ─────
-- Read-only with respect to WebRTC: this only reacts AFTER the existing,
-- unmodified WebRTC code (services/webrtcOwnerCall.js / presence.js) writes
-- an outcome row to rtc_call_attempts (sql/39). It does not change what
-- gets written there, when, or how — it only creates a normal in-app
-- notification row when the outcome means the visitor's call went
-- unanswered, so it shows up under the "Missed Visitors" category.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'rtc_call_attempts') THEN
    CREATE OR REPLACE FUNCTION sd_notify_missed_visitor()
    RETURNS TRIGGER AS $fn$
    BEGIN
      IF NEW.outcome IN ('rtc_timeout_fallback', 'rtc_owner_offline_skip', 'rtc_owner_rejected', 'rtc_visitor_cancelled') THEN
        INSERT INTO notifications (id, owner_id, type, title, body, payload, priority, channels, category)
        VALUES (
          gen_random_uuid(),
          NEW.owner_id,
          'missed_call',
          '📵 Missed visitor call',
          'A visitor tried to reach you and the call wasn''t answered.',
          jsonb_build_object('plateId', NEW.plate_id, 'callId', NEW.call_id, 'outcome', NEW.outcome),
          'normal',
          ARRAY['in_app'],
          'missed_visitors'
        );
      END IF;
      RETURN NEW;
    END;
    $fn$ LANGUAGE plpgsql SECURITY DEFINER;

    DROP TRIGGER IF EXISTS trg_rtc_call_attempts_missed_notify ON rtc_call_attempts;
    CREATE TRIGGER trg_rtc_call_attempts_missed_notify
      AFTER INSERT ON rtc_call_attempts
      FOR EACH ROW EXECUTE FUNCTION sd_notify_missed_visitor();
  END IF;
END $$;

-- ── 8. "Payments" — additive observer trigger on payments ─────────────────────
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'payments')
     AND EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'orders') THEN
    CREATE OR REPLACE FUNCTION sd_notify_payment_event()
    RETURNS TRIGGER AS $fn$
    DECLARE
      v_owner_id UUID;
      v_title TEXT;
      v_body TEXT;
    BEGIN
      IF NEW.status = OLD.status THEN
        RETURN NEW;
      END IF;
      IF NEW.status NOT IN ('captured', 'failed', 'refunded') THEN
        RETURN NEW;
      END IF;

      SELECT owner_id INTO v_owner_id FROM orders WHERE id = NEW.order_id;
      IF v_owner_id IS NULL THEN
        RETURN NEW;
      END IF;

      IF NEW.status = 'captured' THEN
        v_title := '✅ Payment received';
        v_body  := 'Payment of ' || NEW.currency || ' ' || NEW.amount || ' was received successfully.';
      ELSIF NEW.status = 'failed' THEN
        v_title := '❌ Payment failed';
        v_body  := 'A payment attempt of ' || NEW.currency || ' ' || NEW.amount || ' did not go through.';
      ELSE
        v_title := '↩️ Payment refunded';
        v_body  := 'A refund of ' || COALESCE(NEW.refund_amount, NEW.amount) || ' ' || NEW.currency || ' was processed.';
      END IF;

      INSERT INTO notifications (id, owner_id, type, title, body, payload, priority, channels, category)
      VALUES (
        gen_random_uuid(), v_owner_id, 'payment', v_title, v_body,
        jsonb_build_object('orderId', NEW.order_id, 'paymentId', NEW.id, 'status', NEW.status, 'amount', NEW.amount),
        CASE WHEN NEW.status = 'failed' THEN 'high' ELSE 'normal' END,
        ARRAY['in_app'], 'payments'
      );
      RETURN NEW;
    END;
    $fn$ LANGUAGE plpgsql SECURITY DEFINER;

    DROP TRIGGER IF EXISTS trg_payments_notify ON payments;
    CREATE TRIGGER trg_payments_notify
      AFTER INSERT OR UPDATE OF status ON payments
      FOR EACH ROW EXECUTE FUNCTION sd_notify_payment_event();
  END IF;
END $$;

-- ── 9. "Admin" / "Security" — additive observer trigger on activation_events ──
-- Only fires for actor = 'admin' (an actual admin-side action taken on the
-- owner's plate) — owner-initiated activation already gets its own
-- notification via notifyActivated()/services/notifications.js, so this
-- does not create a duplicate for the normal owner-driven path.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'activation_events') THEN
    CREATE OR REPLACE FUNCTION sd_notify_admin_activation_event()
    RETURNS TRIGGER AS $fn$
    DECLARE
      v_title TEXT;
      v_body TEXT;
      v_category TEXT;
    BEGIN
      IF NEW.actor <> 'admin' OR NEW.owner_id IS NULL THEN
        RETURN NEW;
      END IF;

      IF NEW.event_type = 'deactivated' THEN
        v_title := '🔒 Plate deactivated by admin';
        v_body  := 'Your Smart Door plate ' || NEW.plate_id || ' was deactivated by an administrator.';
        v_category := 'security';
      ELSIF NEW.event_type = 'reactivated' THEN
        v_title := '🔓 Plate reactivated by admin';
        v_body  := 'Your Smart Door plate ' || NEW.plate_id || ' was reactivated by an administrator.';
        v_category := 'admin';
      ELSE
        v_title := 'Admin update';
        v_body  := 'An administrator updated plate ' || NEW.plate_id || '.';
        v_category := 'admin';
      END IF;

      INSERT INTO notifications (id, owner_id, type, title, body, payload, priority, channels, category)
      VALUES (
        gen_random_uuid(), NEW.owner_id, 'admin_action', v_title, v_body,
        jsonb_build_object('plateId', NEW.plate_id, 'eventType', NEW.event_type),
        CASE WHEN v_category = 'security' THEN 'high' ELSE 'normal' END,
        ARRAY['in_app'], v_category
      );
      RETURN NEW;
    END;
    $fn$ LANGUAGE plpgsql SECURITY DEFINER;

    DROP TRIGGER IF EXISTS trg_activation_events_admin_notify ON activation_events;
    CREATE TRIGGER trg_activation_events_admin_notify
      AFTER INSERT ON activation_events
      FOR EACH ROW EXECUTE FUNCTION sd_notify_admin_activation_event();
  END IF;
END $$;

COMMIT;
