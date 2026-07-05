-- Run AFTER 34_enterprise_rbac_phase5.sql completes successfully.
-- Run each SELECT separately (Supabase SQL editor multi-statement pastes
-- have previously caused silent rollbacks — see sql/29b/29c history).

-- Check 1: all 7 new tables exist
SELECT to_regclass('public.inventory_items') AS inventory_items,
       to_regclass('public.inventory_movements') AS inventory_movements,
       to_regclass('public.inventory_batches') AS inventory_batches,
       to_regclass('public.plate_dealer_assignments') AS plate_dealer_assignments,
       to_regclass('public.installation_jobs') AS installation_jobs,
       to_regclass('public.installation_job_photos') AS installation_job_photos,
       to_regclass('public.dealer_commissions') AS dealer_commissions;

-- Check 2: new columns exist
SELECT table_name, column_name FROM information_schema.columns
WHERE (table_name = 'admin_users' AND column_name IN ('parent_admin_id','region'))
   OR (table_name = 'orders' AND column_name = 'installation_status')
   OR (table_name = 'manufacturing' AND column_name = 'batch_id');

-- Check 3: trigger exists
SELECT tgname FROM pg_trigger WHERE tgname = 'trg_orders_installation_pending';

-- Check 4: role permissions updated (should show new keys per role)
SELECT name, permissions FROM admin_roles
WHERE name IN ('manufacturing','dealer','franchise','installer');

-- Check 5: storage bucket exists
SELECT id, public FROM storage.buckets WHERE id = 'installation-photos';
