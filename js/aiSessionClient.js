/**
 * My Smart Door — AI Session Client
 * js/aiSessionClient.js
 *
 * PHASE 3.1A — GROQ PROXY SECURITY HARDENING.
 *
 * Mints and caches a short-lived signed AI session token from the new
 * ai-session-token Edge Function, and provides ready-to-use fetch headers
 * for groq-proxy. This does not log anyone in — the AI Product Consultant
 * and AI Receptionist are intentionally anonymous, pre-login flows — it
 * authenticates the *call site*: only a browser that first loaded an
 * allow-listed origin and asked for a token can produce one groq-proxy
 * will accept, closing the "curl the public URL directly" bypass.
 *
 * Classic script (window global, not an ES module) so it can be included
 * with a plain <script src> before both js/*.js IIFE files (groq.js,
 * aiProductConsultant.js) and the ES module scripts on visitor.html
 * (services/aiReceptionist.js, services/aiVoiceReceptionist.js — those
 * read window.AISessionClient directly rather than importing it).
 *
 * Every existing groq-proxy caller attaches this token; none of them
 * change their own prompts, models, or UX as a result.
 */
(function (global) {
  'use strict';

  let _cached = null; // { token, expiresAt }
  let _pending = null;

  function proxyBase() {
    return global.__SD_CONFIG__?.supabaseUrl || '';
  }
  function anonKey() {
    return global.__SD_CONFIG__?.supabaseAnon || '';
  }

  async function _fetchToken() {
    const url = proxyBase();
    const key = anonKey();
    if (!url || !key) return null;
    try {
      const res = await fetch(url + '/functions/v1/ai-session-token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', apikey: key, Authorization: `Bearer ${key}` },
      });
      if (!res.ok) return null;
      const data = await res.json();
      if (!data || !data.token) return null;
      _cached = { token: data.token, expiresAt: Date.now() + (Number(data.expiresIn) || 300) * 1000 };
      return _cached.token;
    } catch (err) {
      console.warn('[AISessionClient] token mint failed:', err);
      return null;
    }
  }

  /** Returns a valid token, minting/refreshing one if needed (30s safety margin before expiry). */
  async function getToken() {
    if (_cached && _cached.expiresAt - Date.now() > 30000) return _cached.token;
    if (_pending) return _pending;
    _pending = _fetchToken().finally(() => { _pending = null; });
    return _pending;
  }

  /** Convenience: full header set for a groq-proxy call, including the session token when available. */
  async function groqHeaders() {
    const token = await getToken();
    const headers = {
      'Content-Type': 'application/json',
      apikey: anonKey(),
      Authorization: `Bearer ${anonKey()}`,
    };
    if (token) headers['x-ai-session-token'] = token;
    return headers;
  }

  global.AISessionClient = { getToken, groqHeaders };
})(window);
