-- ════════════════════════════════════════════════════════════════════════════
-- SMART DOOR — PHASE 11: PERFORMANCE, SCALABILITY & LAUNCH CERTIFICATION
-- sql/63_admin_dashboard_aggregation.sql
--
-- PRODUCTION AUDIT FINDING (Database + API performance):
--   supabase/functions/admin-data/index.ts — the `dashboard_metrics`,
--   `financial_metrics`, and `revenue_chart` handlers fetch entire tables
--   (orders, subscriptions, manufacturing, support_tickets, plates — full
--   rows, no .limit()/head:true) into the edge function on every single
--   admin dashboard page load, then filter/reduce them in JS. This is the
--   one admin-data code path that was never migrated to server-side
--   aggregation (order_list/subscription_list/audit_logs/system_health
--   already use .range() + count correctly). As orders/subscriptions/
--   plates/support_tickets grow, this becomes an unbounded, ever-slower,
--   ever-larger payload on the most frequently hit admin endpoint.
--
--   Fix: move the aggregation into Postgres via three SECURITY DEFINER
--   RPC functions that return the exact same JSON shape the JS code
--   already builds, so admin-data/index.ts just calls db.rpc(...) instead
--   of fetching full tables. Zero frontend changes required.
--
-- Run AFTER sql/62_observability_reliability_phase10.sql.
-- Idempotent — safe to re-run (CREATE OR REPLACE FUNCTION, IF NOT EXISTS
-- indexes). Additive only, no destructive changes, no schema redesign.
-- ════════════════════════════════════════════════════════════════════════════

-- ────────────────────────────────────────────────────────────
-- SECTION 1: SUPPORTING INDEXES
--
-- The admin dashboard queries below are platform-wide (no owner_id
-- filter), unlike almost every other query in this codebase which is
-- owner-scoped. The existing indexes on message_logs/voice_notes/users
-- all lead with owner_id, so they can't serve a plain date-range count
-- across all owners. These three are genuinely new access patterns.
-- ────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_users_created_at
  ON users(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_message_logs_created_at
  ON message_logs(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_voice_notes_created_at
  ON voice_notes(created_at DESC);

-- ────────────────────────────────────────────────────────────
-- SECTION 2: get_admin_dashboard_metrics()
-- Replaces the 11-way Promise.all() full-table-fetch in
-- admin-data/index.ts `dashboard_metrics`. Single round trip, all
-- counts/sums computed in Postgres.
-- ────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION get_admin_dashboard_metrics()
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_today_start   TIMESTAMPTZ := date_trunc('day', now());
  v_month_start   TIMESTAMPTZ := date_trunc('month', now());
  v_last_month    TIMESTAMPTZ := date_trunc('month', now()) - INTERVAL '1 month';
  v_thirty_out    TIMESTAMPTZ := now() + INTERVAL '30 days';
  v_new_this      INTEGER;
  v_new_last      INTEGER;
  v_growth_pct    NUMERIC;
  result JSON;
BEGIN
  SELECT count(*) FILTER (WHERE created_at >= v_month_start),
         count(*) FILTER (WHERE created_at >= v_last_month AND created_at < v_month_start)
    INTO v_new_this, v_new_last
    FROM users;

  v_growth_pct := CASE WHEN v_new_last > 0
    THEN round((((v_new_this - v_new_last)::NUMERIC / v_new_last) * 100), 1)
    ELSE NULL END;

  SELECT json_build_object(
    'totalCustomers',        (SELECT count(*) FROM users),
    'newCustomersThisMonth', v_new_this,
    'customerGrowthPct',     v_growth_pct,
    'activeSubscriptions',   (SELECT count(*) FROM subscriptions WHERE status = 'active'),
    'expiringSoon',          (SELECT count(*) FROM subscriptions
                                 WHERE status = 'active'
                                   AND expiry_date >= now()
                                   AND expiry_date <= v_thirty_out),
    'revenueThisMonth',      (SELECT COALESCE(sum(total_amount), 0) FROM orders
                                 WHERE payment_status = 'paid' AND created_at >= v_month_start),
    'pendingOrders',         (SELECT count(*) FROM orders WHERE payment_status = 'pending'),
    'paidOrders',            (SELECT count(*) FROM orders WHERE payment_status = 'paid'),
    'manufacturingQueue',    (SELECT count(*) FROM manufacturing
                                 WHERE production_status IN ('queued', 'printing', 'quality_check')),
    'openTickets',           (SELECT count(*) FROM support_tickets WHERE status = 'open'),
    'pendingTickets',        (SELECT count(*) FROM support_tickets WHERE status = 'pending'),
    'totalPlates',           (SELECT count(*) FROM plates),
    'activePlates',          (SELECT count(*) FROM plates WHERE status = 'active'),
    'inactivePlates',        (SELECT count(*) FROM plates WHERE status IN ('inactive', 'suspended')),
    'messagesToday',         (SELECT count(*) FROM message_logs WHERE created_at >= v_today_start),
    'voiceNotesToday',       (SELECT count(*) FROM voice_notes WHERE created_at >= v_today_start)
  ) INTO result;

  RETURN result;
END;
$$;

REVOKE ALL ON FUNCTION get_admin_dashboard_metrics() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION get_admin_dashboard_metrics() TO service_role;

-- ────────────────────────────────────────────────────────────
-- SECTION 3: get_admin_financial_metrics()
-- Replaces the full paid-orders + subscriptions fetch in
-- admin-data/index.ts `financial_metrics`.
-- ────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION get_admin_financial_metrics()
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_today_start TIMESTAMPTZ := date_trunc('day', now());
  v_month_start TIMESTAMPTZ := date_trunc('month', now());
  v_year_start  TIMESTAMPTZ := date_trunc('year', now());
  v_mrr NUMERIC;
  result JSON;
BEGIN
  -- Same plan-price fallback map the JS code used: renewal_price if set,
  -- else 299 for smartdoor_care, else 0 (hardware_only / unknown plans).
  SELECT COALESCE(sum(
           COALESCE(renewal_price, CASE WHEN plan = 'smartdoor_care' THEN 299 ELSE 0 END)
         ), 0) / 12
    INTO v_mrr
    FROM subscriptions
    WHERE status = 'active';

  SELECT json_build_object(
    'revenueToday',    (SELECT COALESCE(sum(total_amount), 0) FROM orders
                           WHERE payment_status = 'paid' AND created_at >= v_today_start),
    'revenueMonth',    (SELECT COALESCE(sum(total_amount), 0) FROM orders
                           WHERE payment_status = 'paid' AND created_at >= v_month_start),
    'revenueYear',     (SELECT COALESCE(sum(total_amount), 0) FROM orders
                           WHERE payment_status = 'paid' AND created_at >= v_year_start),
    'mrr',             round(v_mrr),
    'arr',             round(v_mrr) * 12,
    'totalRefunds',    (SELECT COALESCE(sum(total_amount), 0) FROM orders WHERE payment_status = 'refunded'),
    'productRevenue',  (SELECT json_build_object(
                            'acrylic',   COALESCE(sum(total_amount) FILTER (WHERE product_type = 'acrylic'), 0),
                            'stainless', COALESCE(sum(total_amount) FILTER (WHERE product_type = 'stainless'), 0),
                            'teakwood',  COALESCE(sum(total_amount) FILTER (WHERE product_type = 'teakwood'), 0)
                          ) FROM orders WHERE payment_status = 'paid'),
    'totalPaidOrders', (SELECT count(*) FROM orders WHERE payment_status = 'paid')
  ) INTO result;

  RETURN result;
END;
$$;

REVOKE ALL ON FUNCTION get_admin_financial_metrics() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION get_admin_financial_metrics() TO service_role;

-- ────────────────────────────────────────────────────────────
-- SECTION 4: get_admin_revenue_by_month(p_months)
-- Replaces the full paid-orders-in-range fetch + JS group-by-month in
-- admin-data/index.ts `revenue_chart`. Returns raw (month_key, total)
-- rows; the edge function keeps its existing (cheap, presentational)
-- logic for filling in zero-revenue months and building chart labels.
-- ────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION get_admin_revenue_by_month(p_months INTEGER DEFAULT 6)
RETURNS TABLE(month_key TEXT, total NUMERIC)
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT to_char(date_trunc('month', created_at), 'YYYY-MM') AS month_key,
         sum(total_amount) AS total
  FROM orders
  WHERE payment_status = 'paid'
    AND created_at >= date_trunc('month', now()) - (make_interval(months => GREATEST(p_months, 0)))
  GROUP BY 1
  ORDER BY 1;
$$;

REVOKE ALL ON FUNCTION get_admin_revenue_by_month(INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION get_admin_revenue_by_month(INTEGER) TO service_role;

-- ────────────────────────────────────────────────────────────
-- SECTION 5: STATISTICS REFRESH
-- ────────────────────────────────────────────────────────────

ANALYZE users;
ANALYZE orders;
ANALYZE subscriptions;
ANALYZE manufacturing;
ANALYZE support_tickets;
ANALYZE plates;
ANALYZE message_logs;
ANALYZE voice_notes;

-- ════════════════════════════════════════════════════════════════════════════
-- VERIFICATION QUERIES (run after applying)
--
--   SELECT get_admin_dashboard_metrics();
--   SELECT get_admin_financial_metrics();
--   SELECT * FROM get_admin_revenue_by_month(6);
--
--   -- Confirm anon/authenticated cannot call these (should error/deny):
--   -- SET ROLE authenticated; SELECT get_admin_dashboard_metrics(); RESET ROLE;
--
--   SELECT indexname FROM pg_indexes
--   WHERE indexname IN ('idx_users_created_at','idx_message_logs_created_at','idx_voice_notes_created_at');
-- ════════════════════════════════════════════════════════════════════════════
