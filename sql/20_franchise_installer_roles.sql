-- ============================================================
-- SMART DOOR — PHASE 2 (RBAC EXPANSION): FRANCHISE + INSTALLER ROLES
-- Migration: 20_franchise_installer_roles.sql
-- Run AFTER all previous migrations (01–19)
--
-- Adds:
--   - 'franchise' admin role (regional partner: create/view customers +
--     plates for their territory, view orders/subscriptions, NO revenue)
--   - 'installer' admin role (field technician: commission/activate
--     plates on-site, reset PINs, resend activation — no customer PII
--     write access, no revenue)
--
-- Additive only — does NOT touch existing tables, columns, policies,
-- roles, or data. Safe to run multiple times (ON CONFLICT DO UPDATE).
-- ============================================================

INSERT INTO admin_roles (name, label, color, permissions) VALUES
  ('franchise', 'Franchise Partner', '#0EA5E9',
    '{"customers":["read","write"],"plates":["read","write"],"qr":["read","write"],"orders":["read"],"subscriptions":["read"],"support":["read"]}'
  ),
  ('installer', 'Installer', '#14B8A6',
    '{"plates":["read","write"],"qr":["read","write"],"pin_reset":["write"],"activation_resend":["write"],"support":["read"]}'
  )
ON CONFLICT (name) DO UPDATE SET
  permissions = EXCLUDED.permissions,
  label       = EXCLUDED.label,
  color       = EXCLUDED.color;

-- Neither role gets "analytics", "audit", "system", "team", or the
-- customers/orders/subscriptions financial fields — canAccessRevenue()
-- in services/admin.js and admin.html explicitly excludes them too
-- (defense in depth: DB permissions + client-side check both agree).
