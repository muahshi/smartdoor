-- ════════════════════════════════════════════════════════════════════════════
-- SMART DOOR — PHASE 3.2: OWNER/ADMIN AI INSIGHTS DASHBOARD
-- sql/69_ai_consultant_insights.sql
--
-- Adds ONE new SECURITY DEFINER aggregation RPC that extends the AI Product
-- Consultant analytics already shipped in sql/68_ai_consultant_analytics.sql.
--
-- Scope: ADDITIVE ONLY.
--   - No existing table, column, RPC, policy, or index is touched.
--   - get_ai_consultant_funnel() (sql/68) is untouched and keeps working
--     exactly as-is — this file only adds a second, independent RPC that
--     reads the same table for the metrics the funnel RPC does not cover
--     (per-product performance, intent categories, daily trend). Keeping
--     these as two separate RPCs (rather than editing #68) means a bug in
--     the new one can never break the funnel widget that already works.
--   - ai_consultant_events already has RLS enabled with an admin-read
--     policy (sql/68) — SECURITY DEFINER here reuses that same table and
--     the same admin_users membership check, no new policy required.
--   - Still zero visitor identity: only session_id (random UUID, no PII),
--     product_key, and question_text (already capped at 500 chars, no
--     other free text) ever leave this function.
--
-- Design notes:
--   - Intent categories are computed with a deterministic keyword match
--     over question_text at query time (same "rule-based, no LLM call"
--     philosophy as services/aiInsights.js) — no new column, no stored
--     classification, nothing that could hallucinate a category.
--   - product_performance and daily_trend both cap at the same 1–90 day
--     window as get_ai_consultant_funnel() for consistency.
--
-- Idempotent — safe to re-run (CREATE OR REPLACE FUNCTION).
-- ════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION get_ai_consultant_insights(p_days INT DEFAULT 30)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_since                TIMESTAMPTZ := now() - (LEAST(GREATEST(p_days, 1), 90) || ' days')::INTERVAL;
  v_days                 INT := LEAST(GREATEST(p_days, 1), 90);
  v_total_conversations   BIGINT;  -- distinct sessions that sent >=1 message
  v_sessions_configured   BIGINT;
  v_recommendations_shown BIGINT;
  v_configure_clicks      BIGINT;
  v_conversion_rate       NUMERIC;
  v_completion_rate       NUMERIC;
  v_cta_ctr               NUMERIC;
  v_product_performance   JSON;
  v_intent_categories     JSON;
  v_daily_trend           JSON;
BEGIN
  -- ── 1. Total AI conversations (a "conversation" = a session that
  --       actually exchanged a message, not just opened the widget —
  --       that "opened" count already exists as `funnel.opened`) ──
  SELECT COUNT(DISTINCT session_id) INTO v_total_conversations
    FROM ai_consultant_events
    WHERE event_type = 'message_sent' AND created_at >= v_since;

  SELECT COUNT(DISTINCT session_id) INTO v_sessions_configured
    FROM ai_consultant_events
    WHERE event_type = 'configure_click' AND created_at >= v_since;

  SELECT COUNT(*) INTO v_recommendations_shown
    FROM ai_consultant_events
    WHERE event_type = 'recommendation_shown' AND created_at >= v_since;

  SELECT COUNT(*) INTO v_configure_clicks
    FROM ai_consultant_events
    WHERE event_type = 'configure_click' AND created_at >= v_since;

  -- AI conversion rate: of everyone who actually talked to the AI, how
  -- many ended by clicking Configure.
  v_conversion_rate := CASE WHEN v_total_conversations > 0
    THEN ROUND(v_sessions_configured::NUMERIC / v_total_conversations, 3) ELSE 0 END;

  -- Conversation completion rate: of everyone who talked to the AI, how
  -- many got all the way to a product recommendation (vs. dropping off
  -- mid-conversation with no recommendation ever shown).
  SELECT CASE WHEN v_total_conversations > 0
    THEN ROUND(COUNT(DISTINCT session_id)::NUMERIC / v_total_conversations, 3) ELSE 0 END
    INTO v_completion_rate
    FROM ai_consultant_events
    WHERE event_type = 'recommendation_shown' AND created_at >= v_since;

  -- Configure button CTR: of recommendations shown, how many led to a
  -- Configure click (event-level, not session-level, since one session
  -- can see several recommendations before clicking).
  v_cta_ctr := CASE WHEN v_recommendations_shown > 0
    THEN ROUND(v_configure_clicks::NUMERIC / v_recommendations_shown, 3) ELSE 0 END;

  -- ── 2. Product recommendation performance ──
  -- NOTE (real gap, documented — not solved here): this table is
  -- anonymous/pre-login by design (sql/68) and orders has no session_id
  -- to join against, so "configured" below means "clicked Configure for
  -- this product", NOT "this product was actually purchased". True
  -- AI-attributed sales would need a new session_id column on orders —
  -- an intentional, out-of-scope schema decision left for the business
  -- to opt into, not assumed here.
  SELECT json_agg(row_to_json(t)) INTO v_product_performance
  FROM (
    SELECT
      product_key,
      COUNT(*) FILTER (WHERE event_type = 'recommendation_shown') AS recommended,
      COUNT(*) FILTER (WHERE event_type = 'configure_click')      AS configured,
      CASE WHEN COUNT(*) FILTER (WHERE event_type = 'recommendation_shown') > 0
        THEN ROUND(
          COUNT(*) FILTER (WHERE event_type = 'configure_click')::NUMERIC
          / COUNT(*) FILTER (WHERE event_type = 'recommendation_shown'), 3)
        ELSE 0 END AS selection_rate
    FROM ai_consultant_events
    WHERE event_type IN ('recommendation_shown', 'configure_click')
      AND product_key IS NOT NULL
      AND created_at >= v_since
    GROUP BY product_key
    ORDER BY configured DESC, recommended DESC
  ) t;

  -- ── 3. Visitor intent categories ──
  -- Deterministic keyword bucketing over question_text — same "no LLM
  -- call" rule as services/aiInsights.js. Under-counts nuance by design
  -- rather than guessing; anything that matches nothing falls to General.
  SELECT json_agg(row_to_json(t)) INTO v_intent_categories
  FROM (
    SELECT category, COUNT(*) AS times_asked
    FROM (
      SELECT
        CASE
          WHEN question_text ~* 'price|cost|cheap|expensive|discount|offer|emi|rupee|₹'
            THEN 'Pricing'
          WHEN question_text ~* 'material|steel|wood|teak|acrylic|durable|quality|waterproof|weather|rust'
            THEN 'Materials & Durability'
          WHEN question_text ~* 'custom|engrav|font|colou?r|design|name plate|text|logo'
            THEN 'Customization'
          WHEN question_text ~* 'install|mount|fix|drill|setup|wiring|battery|charge'
            THEN 'Installation'
          WHEN question_text ~* 'deliver|ship|dispatch|arrive|when will|pincode|track'
            THEN 'Delivery & Shipping'
          WHEN question_text ~* '\mvs\M|versus|compare|difference|better|which one'
            THEN 'Comparison'
          ELSE 'General'
        END AS category
      FROM ai_consultant_events
      WHERE event_type = 'message_sent'
        AND question_text IS NOT NULL
        AND created_at >= v_since
    ) categorized
    GROUP BY category
    ORDER BY times_asked DESC
  ) t;

  -- ── 4. Daily trend (event counts per day — powers the trend chart;
  --       Daily/Weekly/Monthly views are all derived client-side by
  --       summing these daily buckets, so only one query is needed) ──
  SELECT json_agg(row_to_json(t)) INTO v_daily_trend
  FROM (
    SELECT
      d::date AS date,
      COALESCE(SUM(CASE WHEN e.event_type = 'message_sent' THEN 1 ELSE 0 END), 0) AS conversations,
      COALESCE(SUM(CASE WHEN e.event_type = 'configure_click' THEN 1 ELSE 0 END), 0) AS configured
    FROM generate_series(v_since::date, now()::date, '1 day'::interval) d
    LEFT JOIN ai_consultant_events e
      ON e.created_at::date = d::date
      AND e.event_type IN ('message_sent', 'configure_click')
      AND e.created_at >= v_since
    GROUP BY d
    ORDER BY d
  ) t;

  RETURN json_build_object(
    'since', v_since,
    'days', v_days,
    'total_conversations', v_total_conversations,
    'conversion_rate', v_conversion_rate,
    'completion_rate', v_completion_rate,
    'cta_ctr', v_cta_ctr,
    'product_performance', COALESCE(v_product_performance, '[]'::JSON),
    'intent_categories', COALESCE(v_intent_categories, '[]'::JSON),
    'daily_trend', COALESCE(v_daily_trend, '[]'::JSON)
  );
END;
$$;

-- ════════════════════════════════════════════════════════════════════════════
-- MANUAL VERIFICATION (run after migrating, before deploying the edge
-- function change):
--
--   SELECT get_ai_consultant_insights(30);
--   -- Expect a JSON object; all counts 0 and arrays [] on a fresh table.
--
--   INSERT INTO ai_consultant_events (session_id, event_type, page, product_key)
--     VALUES (gen_random_uuid(), 'recommendation_shown', 'products', 'acrylic');
--   SELECT get_ai_consultant_insights(30);
--   -- product_performance should now show one row: acrylic, recommended=1.
-- ════════════════════════════════════════════════════════════════════════════
