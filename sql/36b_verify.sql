-- Run AFTER 36_phase6_completion.sql completes successfully.
-- Run each SELECT separately.

-- Check 1: dealer has installations write, franchise has installation_jobs write + dealers read
SELECT name, permissions FROM admin_roles
WHERE name IN ('dealer', 'franchise');

-- Expected (subset — other existing keys must still be present too):
--   dealer   -> permissions->'installations' = ["read","write"]
--   franchise -> permissions->'installation_jobs' = ["read","write"]
--   franchise -> permissions->'dealers' = ["read"]

-- Check 2: no existing keys were dropped (spot-check a couple that predate this migration)
SELECT name,
       permissions ? 'customers' AS dealer_still_has_customers,
       permissions ? 'installers' AS franchise_still_has_installers
FROM admin_roles WHERE name IN ('dealer','franchise');
