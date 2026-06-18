-- ============================================================
-- SMART DOOR — PHASE 7: ADMIN SUPER PANEL SCHEMA
-- Run AFTER all previous migrations (01–07)
-- Adds: admin_users, admin_roles, admin_permissions,
--       support_tickets, ticket_comments, admin_audit_logs
-- Additive only — does NOT touch existing tables.
-- ============================================================

-- ────────── 1. ADMIN ROLES ──────────
CREATE TABLE IF NOT EXISTS admin_roles (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT UNIQUE NOT NULL,   -- 'super_admin' | 'ops_manager' | 'manufacturing' | 'support' | 'analyst'
  label       TEXT NOT NULL,          -- Display name
  color       TEXT DEFAULT '#6B7280', -- Hex color for UI badge
  permissions JSONB DEFAULT '{}',     -- { section: ['read','write','delete'] }
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Seed default roles
INSERT INTO admin_roles (name, label, color, permissions) VALUES
  ('super_admin', 'Super Admin', '#EF4444', '{"*": ["read","write","delete","manage"]}'),
  ('ops_manager', 'Operations Manager', '#F59E0B', '{"customers":["read","write"],"orders":["read","write","delete"],"subscriptions":["read","write"],"manufacturing":["read","write"],"analytics":["read"],"support":["read","write"],"audit":["read"]}'),
  ('manufacturing', 'Manufacturing Team', '#10B981', '{"manufacturing":["read","write"],"orders":["read","write"],"qr":["read","write"]}'),
  ('support', 'Support Team', '#3B82F6', '{"customers":["read"],"orders":["read"],"support":["read","write"],"communication":["read"]}'),
  ('analyst', 'Read Only Analyst', '#8B5CF6', '{"customers":["read"],"orders":["read"],"analytics":["read"],"subscriptions":["read"],"manufacturing":["read"]}')
ON CONFLICT (name) DO NOTHING;

-- ────────── 2. ADMIN USERS ──────────
CREATE TABLE IF NOT EXISTS admin_users (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email         TEXT UNIQUE NOT NULL,
  full_name     TEXT NOT NULL,
  role_id       UUID NOT NULL REFERENCES admin_roles(id) ON DELETE RESTRICT,
  password_hash TEXT NOT NULL,             -- bcrypt hash
  totp_secret   TEXT,                      -- For 2FA (TOTP)
  totp_enabled  BOOLEAN DEFAULT FALSE,
  is_active     BOOLEAN DEFAULT TRUE,
  last_login_at TIMESTAMPTZ,
  last_login_ip TEXT,
  session_token TEXT,                      -- Current session token (hashed)
  session_exp   TIMESTAMPTZ,              -- Session expiry
  created_by    UUID REFERENCES admin_users(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

-- ────────── 3. ADMIN PERMISSIONS (granular override) ──────────
CREATE TABLE IF NOT EXISTS admin_permissions (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id    UUID NOT NULL REFERENCES admin_users(id) ON DELETE CASCADE,
  resource    TEXT NOT NULL,               -- e.g. 'customers', 'orders', 'qr'
  actions     TEXT[] DEFAULT '{}',         -- ['read','write','delete']
  granted_by  UUID REFERENCES admin_users(id) ON DELETE SET NULL,
  granted_at  TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(admin_id, resource)
);

-- ────────── 4. SUPPORT TICKETS ──────────
CREATE TABLE IF NOT EXISTS support_tickets (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_number TEXT UNIQUE NOT NULL,      -- e.g. TKT-20260618-0001
  owner_id      UUID REFERENCES users(id) ON DELETE SET NULL,
  subject       TEXT NOT NULL,
  description   TEXT,
  category      TEXT DEFAULT 'general',    -- 'general' | 'billing' | 'technical' | 'delivery' | 'qr' | 'account'
  priority      TEXT DEFAULT 'medium',     -- 'low' | 'medium' | 'high' | 'critical'
  status        TEXT DEFAULT 'open',       -- 'open' | 'pending' | 'resolved' | 'closed'
  assigned_to   UUID REFERENCES admin_users(id) ON DELETE SET NULL,
  customer_name TEXT,
  customer_email TEXT,
  customer_phone TEXT,
  order_id      UUID REFERENCES orders(id) ON DELETE SET NULL,
  plate_id      TEXT,
  resolved_at   TIMESTAMPTZ,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

-- ────────── 5. TICKET COMMENTS ──────────
CREATE TABLE IF NOT EXISTS ticket_comments (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id   UUID NOT NULL REFERENCES support_tickets(id) ON DELETE CASCADE,
  admin_id    UUID REFERENCES admin_users(id) ON DELETE SET NULL,
  content     TEXT NOT NULL,
  is_internal BOOLEAN DEFAULT TRUE,        -- TRUE = internal note, FALSE = visible to customer
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ────────── 6. ADMIN AUDIT LOGS ──────────
CREATE TABLE IF NOT EXISTS admin_audit_logs (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id    UUID REFERENCES admin_users(id) ON DELETE SET NULL,
  admin_email TEXT,                        -- Denormalized for log permanence
  action      TEXT NOT NULL,               -- 'login' | 'order_update' | 'qr_regenerate' | 'sub_extend' etc.
  resource    TEXT,                        -- 'orders' | 'customers' | 'qr' | 'subscriptions' etc.
  resource_id TEXT,                        -- UUID or ID of affected record
  before_data JSONB DEFAULT '{}',          -- Snapshot before change
  after_data  JSONB DEFAULT '{}',          -- Snapshot after change
  ip_address  TEXT,
  user_agent  TEXT,
  notes       TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ────────── INDEXES ──────────
CREATE INDEX IF NOT EXISTS idx_admin_audit_logs_admin_id ON admin_audit_logs(admin_id);
CREATE INDEX IF NOT EXISTS idx_admin_audit_logs_action ON admin_audit_logs(action);
CREATE INDEX IF NOT EXISTS idx_admin_audit_logs_created_at ON admin_audit_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_support_tickets_status ON support_tickets(status);
CREATE INDEX IF NOT EXISTS idx_support_tickets_assigned_to ON support_tickets(assigned_to);
CREATE INDEX IF NOT EXISTS idx_support_tickets_owner_id ON support_tickets(owner_id);
CREATE INDEX IF NOT EXISTS idx_admin_users_email ON admin_users(email);

-- ────────── RLS: ADMIN TABLES ARE SERVICE-ROLE ONLY ──────────
-- These tables must ONLY be accessed via service_role key or Edge Functions
-- Never expose them to anon/user roles

ALTER TABLE admin_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE support_tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE ticket_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin_audit_logs ENABLE ROW LEVEL SECURITY;

-- Service role bypasses RLS by default in Supabase — no policies needed
-- But explicitly block anon + authenticated (user-role) access:
CREATE POLICY "admin_users_no_public_access" ON admin_users FOR ALL TO anon, authenticated USING (false);
CREATE POLICY "admin_roles_no_public_access" ON admin_roles FOR ALL TO anon, authenticated USING (false);
CREATE POLICY "admin_permissions_no_public_access" ON admin_permissions FOR ALL TO anon, authenticated USING (false);
CREATE POLICY "support_tickets_no_public_access" ON support_tickets FOR ALL TO anon, authenticated USING (false);
CREATE POLICY "ticket_comments_no_public_access" ON ticket_comments FOR ALL TO anon, authenticated USING (false);
CREATE POLICY "admin_audit_logs_no_public_access" ON admin_audit_logs FOR ALL TO anon, authenticated USING (false);

-- ────────── HELPER FUNCTION: ticket number generator ──────────
CREATE OR REPLACE FUNCTION generate_ticket_number()
RETURNS TEXT AS $$
DECLARE
  seq INT;
  today TEXT;
BEGIN
  today := TO_CHAR(NOW(), 'YYYYMMDD');
  SELECT COUNT(*) + 1 INTO seq
    FROM support_tickets
    WHERE DATE(created_at) = CURRENT_DATE;
  RETURN 'TKT-' || today || '-' || LPAD(seq::TEXT, 4, '0');
END;
$$ LANGUAGE plpgsql;

-- ────────── UPDATED_AT TRIGGER (reuse pattern from schema) ──────────
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER admin_users_updated_at BEFORE UPDATE ON admin_users
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER support_tickets_updated_at BEFORE UPDATE ON support_tickets
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
