-- Run this AFTER 29b_owner_settings_columns_fix.sql completes successfully.
-- All 4 checks should return non-empty / expected results.

-- Check 1: security_rules should now have 25 columns (13 original + 12 new)
SELECT column_name FROM information_schema.columns
WHERE table_name = 'security_rules'
ORDER BY ordinal_position;

-- Check 2: visitor_logs should have ai_confidence + ai_priority
SELECT column_name FROM information_schema.columns
WHERE table_name = 'visitor_logs' AND column_name IN ('ai_confidence','ai_priority');

-- Check 3: both RPC functions should exist
SELECT proname FROM pg_proc
WHERE proname IN ('remember_visitor','get_owner_display_for_plate');

-- Check 4: visitor_memory table should exist (returns a non-null OID)
SELECT to_regclass('public.visitor_memory');
