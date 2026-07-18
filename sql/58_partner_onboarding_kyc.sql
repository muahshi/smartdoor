-- ============================================================
-- SMART DOOR — PHASE 8C (PART 1): PARTNER ONBOARDING + KYC
-- Migration: 58_partner_onboarding_kyc.sql
-- Run AFTER all previous migrations (01–57)
--
-- CONTEXT: An audit of the production codebase found that "dealer",
-- "franchise", and "installer" already exist as admin_users roles
-- (migrations 20, 34, 36, 37) with working plate-assignment,
-- installation-job, and commission-ledger tables/handlers. What does
-- NOT exist anywhere in the codebase: a way for a prospective partner
-- to apply, a KYC review workflow, or a "distributor" role. This
-- migration adds exactly those three things — nothing already built
-- is touched or recreated.
--
-- Adds (all additive):
--   1. admin_roles: 'distributor' role (parallel to dealer/franchise,
--      did not exist before this migration)
--   2. partner_applications                 (application + business/KYC fields)
--   3. partner_kyc_documents                (per-document review trail)
--   4. generate_partner_application_number()
--   5. Storage bucket: partner-documents (private)
--   6. RLS: same "no_public_access, service_role only" pattern as every
--      other admin table in this schema — all public writes go through
--      the partner-application Edge Function (service_role), matching
--      how create-razorpay-order/verify-pin/send-sms etc. already work.
--
-- Nothing here changes: existing admin_users/admin_roles rows,
-- dealer/franchise/installer permissions, plate_dealer_assignments,
-- installation_jobs, dealer_commissions, or any other table.
-- Safe to run multiple times (IF NOT EXISTS / ON CONFLICT everywhere).
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- 1. DISTRIBUTOR ROLE — did not exist. Mirrors 'dealer' permissions
--    for v1 (distributor-specific scoping, e.g. multi-dealer territory
--    roll-up, is a documented future enhancement, not guessed at here).
-- ────────────────────────────────────────────────────────────
INSERT INTO admin_roles (name, label, color, permissions) VALUES
  ('distributor', 'Distributor', '#8B5CF6',
    '{"customers":["read","write"],"plates":["read","write"],"qr":["read","write"],"orders":["read"],"installations":["read"],"commissions":["read"],"support":["read"]}'
  )
ON CONFLICT (name) DO UPDATE SET
  permissions = EXCLUDED.permissions,
  label       = EXCLUDED.label,
  color       = EXCLUDED.color;

-- ────────────────────────────────────────────────────────────
-- 2. PARTNER APPLICATIONS — dealer/franchise/distributor application,
--    business info, GST/PAN, bank details, status + approval workflow.
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS partner_applications (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  application_number    TEXT UNIQUE NOT NULL,
  partner_type          TEXT NOT NULL DEFAULT 'dealer',   -- 'dealer' | 'franchise' | 'distributor'

  -- Business information
  business_name         TEXT NOT NULL,
  business_type         TEXT,                              -- 'proprietorship' | 'partnership' | 'pvt_ltd' | 'llp' | 'other'
  gst_number             TEXT,
  gst_verified           BOOLEAN NOT NULL DEFAULT FALSE,     -- flipped by reviewer after checking gst_certificate doc
  gst_verified_at        TIMESTAMPTZ,
  pan_number             TEXT,
  pan_verified            BOOLEAN NOT NULL DEFAULT FALSE,     -- flipped by reviewer after checking pan_card doc
  pan_verified_at         TIMESTAMPTZ,

  -- Bank details (for commission payouts — settlement itself is a later phase)
  bank_account_name      TEXT,
  bank_account_number    TEXT,
  bank_ifsc              TEXT,
  bank_name              TEXT,

  -- Contact person
  contact_name           TEXT NOT NULL,
  contact_phone          TEXT NOT NULL,
  contact_email          TEXT,

  -- Address + territory
  address                JSONB DEFAULT '{}',
  requested_territory    TEXT,

  -- Status / workflow
  status                 TEXT NOT NULL DEFAULT 'submitted', -- 'submitted' | 'under_review' | 'approved' | 'rejected'
  rejection_reason       TEXT,
  reviewed_by            UUID REFERENCES admin_users(id) ON DELETE SET NULL,
  reviewed_at            TIMESTAMPTZ,

  -- Reapply chain — a rejected applicant can reapply; the new row links back
  previous_application_id UUID REFERENCES partner_applications(id) ON DELETE SET NULL,

  -- Set once approved and the resulting admin_users row is created
  resulting_admin_id     UUID REFERENCES admin_users(id) ON DELETE SET NULL,

  created_at             TIMESTAMPTZ DEFAULT NOW(),
  updated_at             TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_partner_applications_status ON partner_applications(status);
CREATE INDEX IF NOT EXISTS idx_partner_applications_type ON partner_applications(partner_type);
CREATE INDEX IF NOT EXISTS idx_partner_applications_phone ON partner_applications(contact_phone);

-- ────────────────────────────────────────────────────────────
-- 3. PARTNER KYC DOCUMENTS — per-document upload + manual review trail.
--    NOTE: gst_number/pan_number format is checked at submission time
--    (Edge Function, regex — GSTIN/PAN have fixed checksum-style
--    formats). Authenticity verification against a government/GSP API
--    is deliberately NOT wired here — no such credentials exist in
--    this codebase today, and faking a "verified" response would be
--    worse than not having it. gst_verified/pan_verified are the real
--    hook point: a reviewer flips them after checking the uploaded
--    document, and a future migration can point an API integration at
--    the exact same two columns without any schema change.
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS partner_kyc_documents (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id  UUID NOT NULL REFERENCES partner_applications(id) ON DELETE CASCADE,
  doc_type        TEXT NOT NULL,                    -- 'gst_certificate' | 'pan_card' | 'address_proof' | 'bank_proof' | 'other'
  file_url        TEXT NOT NULL,
  status          TEXT NOT NULL DEFAULT 'pending',  -- 'pending' | 'approved' | 'rejected'
  review_notes    TEXT,
  expiry_date     DATE,
  reviewed_by     UUID REFERENCES admin_users(id) ON DELETE SET NULL,
  reviewed_at     TIMESTAMPTZ,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_partner_kyc_documents_application ON partner_kyc_documents(application_id);

-- ────────────────────────────────────────────────────────────
-- 4. APPLICATION NUMBER GENERATOR (mirrors generate_batch_number() /
--    generate_ticket_number() pattern already used elsewhere)
-- ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION generate_partner_application_number()
RETURNS TEXT AS $$
DECLARE
  seq INT;
  today TEXT;
BEGIN
  today := TO_CHAR(NOW(), 'YYYYMMDD');
  SELECT COUNT(*) + 1 INTO seq FROM partner_applications WHERE DATE(created_at) = CURRENT_DATE;
  RETURN 'PA-' || today || '-' || LPAD(seq::TEXT, 4, '0');
END;
$$ LANGUAGE plpgsql;

-- ────────────────────────────────────────────────────────────
-- 5. updated_at trigger (mirrors the pattern used on every other table
--    in this schema that has an updated_at column)
-- ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION set_partner_application_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_partner_applications_updated_at ON partner_applications;
CREATE TRIGGER trg_partner_applications_updated_at
  BEFORE UPDATE ON partner_applications
  FOR EACH ROW EXECUTE FUNCTION set_partner_application_updated_at();

-- ────────────────────────────────────────────────────────────
-- 6. STORAGE BUCKET — partner-documents (private; uploaded + served
--    via signed URL through Edge Functions, same pattern as
--    installation-photos / voice-notes)
-- ────────────────────────────────────────────────────────────
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('partner-documents', 'partner-documents', false, 10485760, ARRAY['image/png','image/jpeg','image/webp','application/pdf'])
ON CONFLICT (id) DO NOTHING;

-- ────────────────────────────────────────────────────────────
-- 7. RLS — same "service_role only" pattern as every other admin/
--    application table. Public submission/upload/status-check goes
--    through the partner-application Edge Function (service_role,
--    rate-limited), never direct anon table access.
-- ────────────────────────────────────────────────────────────
ALTER TABLE partner_applications  ENABLE ROW LEVEL SECURITY;
ALTER TABLE partner_kyc_documents ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='partner_applications' AND policyname='partner_applications_no_public_access') THEN
    CREATE POLICY partner_applications_no_public_access ON partner_applications FOR ALL TO anon, authenticated USING (false);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='partner_kyc_documents' AND policyname='partner_kyc_documents_no_public_access') THEN
    CREATE POLICY partner_kyc_documents_no_public_access ON partner_kyc_documents FOR ALL TO anon, authenticated USING (false);
  END IF;
END $$;

-- ────────────────────────────────────────────────────────────
-- 8. ROLE PERMISSIONS — additive JSONB merge, grants review access.
--    Kept to super_admin for v1 (super_admin's '*' wildcard already
--    covers this — no row needed). Region-scoped franchise visibility
--    into applications is a documented future enhancement, not built
--    now (would require guessing at territory-matching rules that
--    don't exist yet anywhere else in the schema).
-- ────────────────────────────────────────────────────────────
-- (No admin_roles UPDATE needed here — super_admin wildcard covers
-- the new 'partner_applications' resource key used by admin-data.)

-- ============================================================
-- END OF MIGRATION 58
-- New: distributor role, partner_applications, partner_kyc_documents,
-- partner-documents storage bucket. Existing dealer/franchise/
-- installer roles, plate_dealer_assignments, installation_jobs,
-- dealer_commissions — all untouched.
-- ============================================================
