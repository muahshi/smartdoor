/**
 * My Smart Door — AI Consultant Analytics
 * js/aiConsultantAnalytics.js
 *
 * PHASE 3.1B — AI ANALYTICS & CONVERSATION INTELLIGENCE. ADDITIVE ONLY,
 * new file.
 *
 * Fire-and-forget event beacon for the AI Product Consultant
 * (js/aiProductConsultant.js). Every call here is:
 *   - never awaited by the caller (chat flow never blocks on this)
 *   - wrapped in try/catch (a failed beacon never surfaces to the visitor)
 *   - sent with `keepalive: true` so it still lands if the page is
 *     navigating away right after the call (e.g. Configure click)
 *
 * REUSE, NOT DUPLICATION:
 *   - Talks directly to PostgREST (`${supabaseUrl}/rest/v1/...`) with the
 *     anon key, the same low-level fetch style js/groq.js and
 *     js/aiProductConsultant.js already use on these pages — no Supabase
 *     JS SDK import is introduced, no new build step, no owner/auth
 *     context (this widget is intentionally anonymous/pre-login).
 *   - Reads window.__SD_CONFIG__ the same way every other file here does.
 *
 * Table: ai_consultant_events (sql/68_ai_consultant_analytics.sql).
 * Anonymous INSERT-only RLS — this file can never read anything back.
 *
 * Does not touch Checkout, Razorpay, Android, Product Catalog, or the
 * Configurator.
 */
(function (global) {
  'use strict';

  const SESSION_KEY = 'sd_ai_consultant_session_id';
  const MAX_QUESTION_CHARS = 300; // server-side CHECK caps at 500; trim early

  let _sessionStarted = false;

  function supabaseUrl() { return global.__SD_CONFIG__?.supabaseUrl || ''; }
  function anonKey() { return global.__SD_CONFIG__?.supabaseAnon || ''; }

  function currentPage() {
    const path = (global.location && global.location.pathname) || '';
    return path.includes('/product') && !path.includes('/products') ? 'product'
      : 'products';
  }

  /** One session id per tab for the lifetime of the consultant widget — persists across
   * product.html <-> products.html navigation within the same funnel, cleared on new tab. */
  function sessionId() {
    try {
      let id = global.sessionStorage.getItem(SESSION_KEY);
      if (!id) {
        id = (global.crypto && global.crypto.randomUUID) ? global.crypto.randomUUID() : _fallbackUuid();
        global.sessionStorage.setItem(SESSION_KEY, id);
      }
      return id;
    } catch (err) {
      // Storage unavailable (private mode etc.) — fall back to an
      // in-memory id for this page load only; funnel still counts the
      // session, just won't persist across a navigation.
      if (!global.__sdAiSessionIdMem__) global.__sdAiSessionIdMem__ = _fallbackUuid();
      return global.__sdAiSessionIdMem__;
    }
  }

  function _fallbackUuid() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0;
      const v = c === 'x' ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  }

  /** Sends one event row. Never throws, never awaited by callers. */
  function _send(row) {
    const url = supabaseUrl();
    const key = anonKey();
    if (!url || !key) return; // no config on this page — silently no-op

    try {
      fetch(`${url}/rest/v1/ai_consultant_events`, {
        method: 'POST',
        keepalive: true,
        headers: {
          'Content-Type': 'application/json',
          apikey: key,
          Authorization: `Bearer ${key}`,
          Prefer: 'return=minimal',
        },
        body: JSON.stringify({ session_id: sessionId(), page: currentPage(), ...row }),
      }).catch(() => { /* analytics is best-effort — never surface to the visitor */ });
    } catch (err) {
      // Synchronous failure (e.g. fetch not available) — swallow.
    }
  }

  // ────────── PUBLIC API ──────────

  /** Call once when the visitor first opens the consultant chat panel. */
  function trackSessionStart() {
    if (_sessionStarted) return;
    _sessionStarted = true;
    _send({ event_type: 'session_start' });
  }

  /**
   * Call after a successful (or fallback/error) reply to a visitor message.
   * @param {number} latencyMs   Wall-clock time from send to reply.
   * @param {string} questionText Visitor's message (trimmed/capped, no other PII).
   */
  function trackMessageSent(latencyMs, questionText) {
    const capped = typeof questionText === 'string' ? questionText.slice(0, MAX_QUESTION_CHARS) : null;
    _send({
      event_type: 'message_sent',
      latency_ms: Number.isFinite(latencyMs) ? Math.round(latencyMs) : null,
      question_text: capped,
    });
  }

  /** Call when a reply failed and the widget fell back to an error/rate-limit message. */
  function trackMessageError() {
    _send({ event_type: 'message_error' });
  }

  /** Call when the assistant's reply names a specific product (recommendation). */
  function trackRecommendationShown(productKey) {
    _send({ event_type: 'recommendation_shown', product_key: productKey || null });
  }

  /** Call when the visitor clicks a "Configure <Product>" CTA. */
  function trackConfigureClick(productKey) {
    _send({ event_type: 'configure_click', product_key: productKey || null });
  }

  global.AIConsultantAnalytics = {
    trackSessionStart,
    trackMessageSent,
    trackMessageError,
    trackRecommendationShown,
    trackConfigureClick,
  };
})(window);
