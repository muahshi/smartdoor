-- ============================================================
-- SMART DOOR — PHASE 6: BUSINESS OPERATIONS ENGINE (COMPLETION)
-- Migration: 36_phase6_completion.sql
-- Run AFTER all previous migrations (01–35)
--
-- CONTEXT: An audit of the production codebase (source of truth, not the
-- markdown docs) found that Phase 6 is already ~85% built — migration 34
-- already created inventory_items, inventory_batches, plate_dealer_assignments,
-- installation_jobs, installation_job_photos, dealer_commissions, and the
-- admin-data Edge Function already has working handlers for all of them
-- (inventory_list/upsert/adjust, batch_list/create/update, dealer_assignment_*,
-- installation_job_*, franchise_installers, franchise_overview, commission_list).
--
-- This migration fixes the three concrete permission gaps found during the
-- audit — no new tables, no rewritten logic, no financial calculation added.
--
-- Additive only — does NOT touch existing tables, columns, roles, or data.
-- Safe to run multiple times.
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- 1. DEALER — upgrade "installations" from read-only to read+write.
--    GAP: Dealer Module requires "Schedule installations", but dealer could
--    only ever view jobs, never call installation_request. The
--    installation_request handler is updated (admin-data/index.ts) to accept
--    adminCan(ctx,'installations','write') OR adminCan(ctx,'orders','write'),
--    so dealer gets exactly this one new capability — not full order edit
--    rights (payment/manufacturing status stay untouchable by dealer).
-- ────────────────────────────────────────────────────────────
UPDATE admin_roles
SET permissions = permissions || '{"installations":["read","write"]}'::jsonb
WHERE name = 'dealer';

-- ────────────────────────────────────────────────────────────
-- 2. FRANCHISE — grant installation_jobs read+write.
--    GAP/BUG: The existing installation_job_update handler already has a
--    code comment "Installers may only update their own claimed job;
--    super_admin/franchise can override" but no migration ever granted
--    franchise this permission, so franchise overrides silently 403'd.
--    This migration makes the permission model match the existing,
--    already-deployed handler logic.
-- ────────────────────────────────────────────────────────────
UPDATE admin_roles
SET permissions = permissions || '{"installation_jobs":["read","write"]}'::jsonb
WHERE name = 'franchise';

-- ────────────────────────────────────────────────────────────
-- 3. FRANCHISE — add "dealers" read permission.
--    GAP: Franchise Module requires "Dealer management" alongside installer
--    management. franchise_installers already exists in admin-data; a new
--    franchise_dealers handler (mirrors it exactly, filtered to role=dealer)
--    is gated on this permission key.
-- ────────────────────────────────────────────────────────────
UPDATE admin_roles
SET permissions = permissions || '{"dealers":["read"]}'::jsonb
WHERE name = 'franchise';

-- ============================================================
-- END OF MIGRATION 36
-- Nothing here changes: table structures, RLS policies, triggers,
-- commission calculation (still placeholder-only, per Phase 6 brief),
-- or any existing role's previously granted permissions.
-- ============================================================
