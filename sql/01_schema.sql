-- ============================================================
-- SMART DOOR — SUPABASE COMPLETE SCHEMA
-- Run this in Supabase SQL Editor (in order)
-- ============================================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ────────── 1. USERS ──────────
CREATE TABLE IF NOT EXISTS users (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name       TEXT NOT NULL,
  phone           TEXT UNIQUE NOT NULL,
  email           TEXT UNIQUE,
  plate_id        TEXT UNIQUE NOT NULL,        -- e.g. SD-ABX9K7
  pin_hash        TEXT NOT NULL,               -- bcrypt hash of 4-digit PIN
  auth_user_id    UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ────────── 2. PLATES ──────────
CREATE TABLE IF NOT EXISTS plates (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plate_id        TEXT UNIQUE NOT NULL,        -- SD-ABX9K7
  qr_slug         TEXT UNIQUE NOT NULL,        -- same as plate_id (URL: /p/SD-ABX9K7)
  product_type    TEXT DEFAULT 'acrylic',      -- 'acrylic' | 'stainless' | 'teakwood'
  status          TEXT DEFAULT 'active',       -- 'active' | 'inactive' | 'suspended'
  activation_date TIMESTAMPTZ DEFAULT NOW(),
  expiry_date     TIMESTAMPTZ,
  owner_id        UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ────────── 3. SUBSCRIPTIONS ──────────
CREATE TABLE IF NOT EXISTS subscriptions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id        UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  plan            TEXT DEFAULT 'starter',      -- 'starter' | 'standard' | 'scale'
  status          TEXT DEFAULT 'active',       -- 'active' | 'expired' | 'cancelled'
  start_date      TIMESTAMPTZ DEFAULT NOW(),
  expiry_date     TIMESTAMPTZ NOT NULL,
  renewal_price   NUMERIC(10,2),
  razorpay_sub_id TEXT,                        -- Razorpay subscription ID
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ────────── 4. VISITOR LOGS ──────────
CREATE TABLE IF NOT EXISTS visitor_logs (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id        UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  plate_id        TEXT NOT NULL,
  event_type      TEXT NOT NULL,               -- 'qr_scan' | 'bell_ring' | 'voice_message' | 'call_attempt' | 'spam_blocked' | 'sos' | 'ai_intent'
  event_data      JSONB DEFAULT '{}',          -- flexible payload (intent, duration, etc.)
  ip_address      TEXT,
  user_agent      TEXT,
  ai_intent       TEXT,                        -- 'Delivery' | 'Guest' | 'Spam' | 'Emergency' | 'Unknown'
  ai_confidence   NUMERIC(4,3),
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ────────── 5. VOICE NOTES ──────────
CREATE TABLE IF NOT EXISTS voice_notes (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id        UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  plate_id        TEXT NOT NULL,
  storage_path    TEXT NOT NULL,               -- Supabase Storage path
  duration_secs   INTEGER,
  transcript      TEXT,                        -- AI transcription (optional)
  is_heard        BOOLEAN DEFAULT FALSE,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ────────── 6. FAMILY MEMBERS ──────────
CREATE TABLE IF NOT EXISTS family_members (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id        UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  phone           TEXT NOT NULL,
  relationship    TEXT DEFAULT 'family',       -- 'family' | 'friend' | 'staff' | 'other'
  priority        INTEGER DEFAULT 1,           -- 1 = highest priority
  is_active       BOOLEAN DEFAULT TRUE,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ────────── 7. SECURITY RULES ──────────
CREATE TABLE IF NOT EXISTS security_rules (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id        UUID UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  night_mode_start TIME DEFAULT '22:00',
  night_mode_end   TIME DEFAULT '06:00',
  night_mode_on    BOOLEAN DEFAULT TRUE,
  allow_sos        BOOLEAN DEFAULT TRUE,
  allow_voice      BOOLEAN DEFAULT TRUE,
  allow_calls      BOOLEAN DEFAULT TRUE,
  call_forwarding  BOOLEAN DEFAULT TRUE,
  current_status   TEXT DEFAULT 'available',   -- 'available' | 'busy' | 'sleeping' | 'away' | 'custom'
  custom_message   TEXT,
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  updated_at       TIMESTAMPTZ DEFAULT NOW()
);

-- ────────── 8. STATUS HISTORY ──────────
CREATE TABLE IF NOT EXISTS status_history (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id        UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status          TEXT NOT NULL,
  custom_message  TEXT,
  set_at          TIMESTAMPTZ DEFAULT NOW()
);

-- ────────── 9. NOTIFICATIONS ──────────
CREATE TABLE IF NOT EXISTS notifications (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id        UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type            TEXT NOT NULL,               -- 'bell' | 'voice' | 'call' | 'sos' | 'ai'
  title           TEXT NOT NULL,
  body            TEXT,
  is_read         BOOLEAN DEFAULT FALSE,
  payload         JSONB DEFAULT '{}',
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ────────── 10. AUDIT LOGS ──────────
CREATE TABLE IF NOT EXISTS audit_logs (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id        UUID REFERENCES users(id) ON DELETE SET NULL,
  action          TEXT NOT NULL,               -- 'login' | 'logout' | 'pin_change' | 'settings_update' etc.
  details         JSONB DEFAULT '{}',
  ip_address      TEXT,
  user_agent      TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ────────── INDEXES ──────────
CREATE INDEX IF NOT EXISTS idx_visitor_logs_owner   ON visitor_logs(owner_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_visitor_logs_plate   ON visitor_logs(plate_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_visitor_logs_type    ON visitor_logs(event_type);
CREATE INDEX IF NOT EXISTS idx_voice_notes_owner    ON voice_notes(owner_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_family_priority      ON family_members(owner_id, priority ASC);
CREATE INDEX IF NOT EXISTS idx_notifications_owner  ON notifications(owner_id, is_read, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_plates_slug          ON plates(qr_slug);
CREATE INDEX IF NOT EXISTS idx_audit_owner          ON audit_logs(owner_id, created_at DESC);

-- ────────── AUTO-UPDATE updated_at TRIGGER ──────────
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_users_updated_at
  BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_plates_updated_at
  BEFORE UPDATE ON plates
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_subscriptions_updated_at
  BEFORE UPDATE ON subscriptions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_security_rules_updated_at
  BEFORE UPDATE ON security_rules
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_family_updated_at
  BEFORE UPDATE ON family_members
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
