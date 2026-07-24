-- ════════════════════════════════════════════════════════════════════════════
-- SMART DOOR — PHASE 3.1B: AI ANALYTICS & CONVERSATION INTELLIGENCE
-- sql/68_ai_consultant_analytics.sql
--
-- Adds an anonymous, append-only event log for the AI Product Consultant
-- (products.html / product.html — js/aiProductConsultant.js) plus a
-- SECURITY DEFINER aggregation RPC that returns the owner/admin funnel
-- view, following the exact pattern already used by
-- get_admin_dashboard_metrics() in sql/63_admin_dashboard_aggregation.sql.
--
-- Scope: ADDITIVE ONLY.
--   - No existing table is touched.
--   - No existing RPC, policy, or index is modified.
--   - The AI Consultant, AI Receptionist, Checkout, Razorpay, Android,
--     Product Catalog, and Configurator are untouched.
--
-- Design notes:
--   - This widget is deliberately anonymous/pre-login (same as the
--     groq-proxy / ai-session-token functions it calls), so there is no
--     owner_id or auth.uid() to scope rows to. It is a platform-wide log,
--     same shape as renewal_engine_logs in sql/61 — service role writes/
--     reads everything, admins get read-only access, no owner-facing
--     policy exists because no owner owns this data.
--   - Only the fields needed for funnel/latency/error-rate math are
--     stored. No visitor identity, phone, email, or IP is captured here
--     (that would be a privacy regression on an anonymous surface).
--   - question_text is capped at 300 chars client-side and 500 chars by
--     CHECK here as defense in depth — it is stored only to compute a
--     "top questions" list from exact repeats (chip clicks + common
--     phrasing), not for transcript replay.
--
-- Idempotent — safe to re-run (CREATE TABLE IF NOT EXISTS, CREATE OR
-- REPLACE FUNCTION, DROP POLICY IF EXISTS).
-- ════════════════════════════════════════════════════════════════════════════

-- ────────────────────────────────────────────────────────────
-- SECTION 1: EVENT LOG TABLE
-- ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS ai_consultant_events (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id    UUID NOT NULL,
  event_type    TEXT NOT NULL CHECK (event_type IN (
                  'session_start',
                  'message_sent',
                  'message_error',
                  'recommendation_shown',
                  'configure_click',
                  'session_end'
                )),
  page          TEXT CHECK (page IN ('product', 'products')),
  product_key   TEXT CHECK (product_key IS NULL OR length(product_key) <= 100),
  latency_ms    INTEGER CHECK (latency_ms IS NULL OR (latency_ms >= 0 AND latency_ms <= 60000)),
  question_text TEXT CHECK (question_text IS NULL OR length(question_text) <= 500),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Existing access patterns on this table: admin funnel aggregation scans
-- a date range grouped by session_id/event_type — these three cover it.
CREATE INDEX IF NOT EXISTS idx_ai_consultant_events_created_at
  ON ai_consultant_events(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_ai_consultant_events_session_id
  ON ai_consultant_events(session_id);

CREATE INDEX IF NOT EXISTS idx_ai_consultant_events_type_created_at
  ON ai_consultant_events(event_type, created_at DESC);

-- ────────────────────────────────────────────────────────────
-- SECTION 2: RLS
-- Same shape as renewal_engine_logs (sql/61) — no owner reference
-- exists on this table, so there is no owner-read policy to add.
-- ────────────────────────────────────────────────────────────

ALTER TABLE ai_consultant_events ENABLE ROW LEVEL SECURITY;

-- Anonymous visitors (anon key, no auth.uid()) may only INSERT their own
-- beacon events — never read, update, or delete anyone's rows, including
-- their own. This is the one new access pattern here: the widget runs
-- pre-login by design (same as groq-proxy's callers), so the write side
-- has to accept the anon role rather than an authenticated owner.
DROP POLICY IF EXISTS "ai_consultant_events_anon_insert" ON ai_consultant_events;
CREATE POLICY "ai_consultant_events_anon_insert" ON ai_consultant_events
  FOR INSERT
  WITH CHECK (auth.role() IN ('anon', 'authenticated', 'service_role'));

DROP POLICY IF EXISTS "ai_consultant_events_service_all" ON ai_consultant_events;
CREATE POLICY "ai_consultant_events_service_all" ON ai_consultant_events
  FOR ALL USING (auth.role() = 'service_role');

DROP POLICY IF EXISTS "ai_consultant_events_admin_read" ON ai_consultant_events;
CREATE POLICY "ai_consultant_events_admin_read" ON ai_consultant_events
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM admin_users WHERE id::text = auth.uid()::text)
  );

-- ────────────────────────────────────────────────────────────
-- SECTION 3: get_ai_consultant_funnel(p_days)
-- Aggregation only — mirrors get_admin_dashboard_metrics()'s style
-- (single SECURITY DEFINER round trip, JSON out, admin-analytics/
-- index.ts just calls db.rpc()). No per-event PII is ever returned here,
-- only counts/averages and short exact-repeat question strings.
-- ────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION get_ai_consultant_funnel(p_days INT DEFAULT 30)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_since             TIMESTAMPTZ := now() - (LEAST(GREATEST(p_days, 1), 90) || ' days')::INTERVAL;
  v_sessions_started   BIGINT;
  v_sessions_messaged  BIGINT;
  v_sessions_recommended BIGINT;
  v_sessions_configured BIGINT;
  v_configure_clicks    BIGINT;
  v_recommendations_shown BIGINT;
  v_messages_sent       BIGINT;
  v_messages_errored    BIGINT;
  v_avg_latency_ms      NUMERIC;
  v_avg_conversation_len NUMERIC;
  v_top_questions        JSON;
BEGIN
  SELECT COUNT(DISTINCT session_id) INTO v_sessions_started
    FROM ai_consultant_events WHERE event_type = 'session_start' AND created_at >= v_since;

  SELECT COUNT(DISTINCT session_id) INTO v_sessions_messaged
    FROM ai_consultant_events WHERE event_type = 'message_sent' AND created_at >= v_since;

  SELECT COUNT(DISTINCT session_id) INTO v_sessions_recommended
    FROM ai_consultant_events WHERE event_type = 'recommendation_shown' AND created_at >= v_since;

  SELECT COUNT(DISTINCT session_id) INTO v_sessions_configured
    FROM ai_consultant_events WHERE event_type = 'configure_click' AND created_at >= v_since;

  SELECT COUNT(*) INTO v_configure_clicks
    FROM ai_consultant_events WHERE event_type = 'configure_click' AND created_at >= v_since;

  SELECT COUNT(*) INTO v_recommendations_shown
    FROM ai_consultant_events WHERE event_type = 'recommendation_shown' AND created_at >= v_since;

  SELECT COUNT(*) INTO v_messages_sent
    FROM ai_consultant_events WHERE event_type = 'message_sent' AND created_at >= v_since;

  SELECT COUNT(*) INTO v_messages_errored
    FROM ai_consultant_events WHERE event_type = 'message_error' AND created_at >= v_since;

  SELECT ROUND(AVG(latency_ms)) INTO v_avg_latency_ms
    FROM ai_consultant_events
    WHERE event_type = 'message_sent' AND latency_ms IS NOT NULL AND created_at >= v_since;

  -- Average conversation length = avg # of message_sent events per session
  -- that sent at least one message (sessions that opened but never typed
  -- anything are counted separately, under abandonment).
  SELECT ROUND(AVG(cnt), 1) INTO v_avg_conversation_len
    FROM (
      SELECT session_id, COUNT(*) AS cnt
      FROM ai_consultant_events
      WHERE event_type = 'message_sent' AND created_at >= v_since
      GROUP BY session_id
    ) per_session;

  -- Top questions: exact-repeat grouping only (suggestion chips + common
  -- short queries repeat verbatim; long free-text rarely does, so this
  -- under-counts unique paraphrases by design rather than fuzzy-matching
  -- visitor text).
  SELECT json_agg(t) INTO v_top_questions
  FROM (
    SELECT question_text, COUNT(*) AS times_asked
    FROM ai_consultant_events
    WHERE event_type = 'message_sent'
      AND question_text IS NOT NULL
      AND created_at >= v_since
    GROUP BY question_text
    ORDER BY COUNT(*) DESC, question_text ASC
    LIMIT 10
  ) t;

  RETURN json_build_object(
    'since', v_since,
    'days', LEAST(GREATEST(p_days, 1), 90),
    'funnel', json_build_object(
      'opened', v_sessions_started,
      'messaged', v_sessions_messaged,
      'recommended', v_sessions_recommended,
      'configured', v_sessions_configured
    ),
    'sessions_started', v_sessions_started,
    'sessions_completed', v_sessions_configured,
    'abandonment_rate', CASE WHEN v_sessions_started > 0
      THEN ROUND(1.0 - (v_sessions_messaged::NUMERIC / v_sessions_started), 3)
      ELSE 0 END,
    'avg_conversation_length', COALESCE(v_avg_conversation_len, 0),
    'recommendations_shown', v_recommendations_shown,
    'configure_clicks', v_configure_clicks,
    'avg_latency_ms', COALESCE(v_avg_latency_ms, 0),
    'error_rate', CASE WHEN (v_messages_sent + v_messages_errored) > 0
      THEN ROUND(v_messages_errored::NUMERIC / (v_messages_sent + v_messages_errored), 3)
      ELSE 0 END,
    'top_questions', COALESCE(v_top_questions, '[]'::JSON)
  );
END;
$$;

-- ════════════════════════════════════════════════════════════════════════════
-- MANUAL VERIFICATION (run after migrating, before deploying the edge
-- function change):
--
--   SELECT get_ai_consultant_funnel(30);
--   -- Expect a JSON object with all-zero counts on a fresh table.
--
--   INSERT INTO ai_consultant_events (session_id, event_type, page)
--     VALUES (gen_random_uuid(), 'session_start', 'products');
--   SELECT get_ai_consultant_funnel(30);
--   -- sessions_started should now be 1.
-- ════════════════════════════════════════════════════════════════════════════
