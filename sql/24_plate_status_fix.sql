-- ════════════════════════════════════════════════════════════════════════════
-- Migration 24: Plate Status Diagnostic + Fix
-- Run in Supabase Dashboard > SQL Editor
-- FIRST: Run the SELECT statements to diagnose, THEN run the UPDATE/INSERT.
-- ════════════════════════════════════════════════════════════════════════════

-- ── STEP 1: DIAGNOSTIC — Run this first to see what's wrong ─────────────────
-- Paste this in SQL Editor and run to see plate status:

/*
SELECT 
  p.plate_id,
  p.qr_slug,
  p.status,
  p.owner_id,
  u.full_name,
  u.pin_hash IS NOT NULL as has_pin,
  sr.owner_id IS NOT NULL as has_security_rules
FROM plates p
LEFT JOIN users u ON u.id = p.owner_id
LEFT JOIN security_rules sr ON sr.owner_id = p.owner_id
ORDER BY p.created_at DESC
LIMIT 20;
*/

-- ── STEP 2: Fix all plates where qr_slug != plate_id ────────────────────────
BEGIN;

UPDATE plates
SET qr_slug = plate_id
WHERE (qr_slug IS NULL OR qr_slug != plate_id)
  AND plate_id IS NOT NULL;

-- ── STEP 3: Fix specific plate SD-AFULN8 if needed ──────────────────────────
-- If the plate exists but shows Activation Pending, force-activate it:
UPDATE plates
SET status = 'active',
    qr_slug = plate_id,
    activation_date = COALESCE(activation_date, now())
WHERE plate_id IN ('SD-AFULN8', 'SD-KH9RXU')
  AND owner_id IS NOT NULL;

-- ── STEP 4: Backfill security_rules for ALL active plates ───────────────────
INSERT INTO security_rules (
  owner_id,
  night_mode_on,
  night_mode_start,
  night_mode_end,
  allow_sos,
  allow_voice,
  allow_calls,
  call_forwarding,
  current_status,
  custom_message
)
SELECT
  p.owner_id,
  false,
  '22:00:00'::time,
  '07:00:00'::time,
  true,
  true,
  true,
  true,
  'available',
  NULL
FROM plates p
WHERE p.owner_id IS NOT NULL
  AND p.status = 'active'
  AND NOT EXISTS (
    SELECT 1 FROM security_rules sr WHERE sr.owner_id = p.owner_id
  )
ON CONFLICT DO NOTHING;

-- ── STEP 5: Verify result ────────────────────────────────────────────────────
-- After running, check:
-- SELECT plate_id, qr_slug, status FROM plates WHERE plate_id IN ('SD-AFULN8', 'SD-KH9RXU');

COMMIT;
