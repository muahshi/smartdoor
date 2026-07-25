# SmartDoor Phase 4A — Production Security Hardening — Final File Actions

SQL migration already run ✅ (sql/70_plates_public_lookup_hardening.sql — "Success. No rows returned" confirmed).

## 1. DELETE these files (confirmed obsolete/insecure — already removed in this delivery, not included in zip)
- `supabase/functions/index.ts` — obsolete insecure duplicate of set-owner-pin (no auth gate, old bcrypt). Delete from repo + redeploy edge functions.
- `fix-qr.html` — anonymously dumped the plates table on page load. Delete from repo root.
- `bulk-regenerate-qr.html` — same exposure, config-driven variant. Delete from repo root.

## 2. UPDATE these files (included in this zip, overwrite in your repo at the same path)
- `services/plates.js` — isPlateActive() / getPlateBySlug() now call the new `get_plate_public_lookup()` RPC instead of a direct table SELECT.
- `visitor.html` — inline init() (live visitor QR entry point) now calls the same RPC.
- `onboarding.html` — post-verifyOtp() plate lookup now calls the same RPC.

## 3. ALREADY APPLIED (by you, in Supabase SQL Editor)
- `sql/70_plates_public_lookup_hardening.sql` — included here for your repo/migrations history. Adds `get_plate_public_lookup()` RPC, drops the old blanket anon SELECT policy on `plates`.

## Nothing else changes
- No other files touched. Admin dashboard (admin-data Edge Function, service_role) is unaffected.
- Deploy order: (1) delete the 3 files above, (2) replace the 3 files with the versions in this zip, (3) redeploy Edge Functions + static site.
