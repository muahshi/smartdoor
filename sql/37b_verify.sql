-- Run AFTER 37_dealer_order_visibility.sql completes successfully.
-- Run each SELECT separately.

-- Check 1: new column exists
SELECT column_name, data_type FROM information_schema.columns
WHERE table_name = 'orders' AND column_name = 'created_by_admin_id';

-- Check 2: dealer role has orders:["read"] and nothing else changed
SELECT name, permissions FROM admin_roles WHERE name = 'dealer';

-- Check 3: index exists
SELECT indexname FROM pg_indexes WHERE tablename = 'orders' AND indexname = 'idx_orders_created_by_admin';

-- Check 4 (manual, after a dealer provisions a test customer):
-- confirm the new order row has created_by_admin_id set to that dealer's admin_users.id
-- SELECT order_number, created_by_admin_id FROM orders ORDER BY created_at DESC LIMIT 1;
