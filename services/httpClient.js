/**
 * Smart Door — Shared HTTP Client (Production Hardening — Phase 6)
 * services/httpClient.js
 *
 * PRODUCTION GAP FIXED: js/groq.js and services/envValidator.js already
 * wrap fetch() with an AbortController-based timeout (10s / 5s). Every
 * other raw fetch() call to a Supabase Edge Function across the codebase
 * (services/admin.js, services/adminData.js, services/adminProvisioning.js,
 * js/adminPhase13.js, services/messaging.js, services/aiReceptionist.js,
 * services/aiVoiceReceptionist.js, services/visitorPass.js) had NO
 * timeout at all. On a stalled mobile connection (common on Indian
 * carriers, exactly this product's environment) those calls hang
 * indefinitely — the button spinner never resolves, the admin session
 * check never completes, the AI receptionist turn never falls back.
 *
 * This is a single, reusable wrapper — not a new architecture, not a new
 * network layer, just the same AbortController pattern already proven in
 * this repo, factored out so it isn't re-implemented 8 different ways.
 *
 * Usage (drop-in replacement for `fetch`):
 *   const res = await fetchWithTimeout(url, options, 12000);
 *
 * On timeout, the returned/thrown error has `.name === 'AbortError'` and
 * `.isTimeout === true`, so callers can distinguish "server said no" from
 * "server never answered" if they want to (existing callers don't need
 * to — their existing catch blocks already treat any thrown error as a
 * connection failure, which a timeout now correctly is).
 */

// Sensible default — matches js/groq.js's existing 10s convention for AI
// calls; admin/data calls get a slightly longer default since some (bulk
// provisioning, print-pack generation) legitimately take longer.
export const DEFAULT_TIMEOUT_MS = 15000;

export async function fetchWithTimeout(url, options = {}, timeoutMs = DEFAULT_TIMEOUT_MS) {
  const controller = new AbortController();
  // If the caller already passed a signal (rare in this codebase today),
  // respect it too — abort on whichever fires first.
  const externalSignal = options.signal;
  if (externalSignal) {
    if (externalSignal.aborted) controller.abort();
    else externalSignal.addEventListener('abort', () => controller.abort(), { once: true });
  }

  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } catch (err) {
    if (err?.name === 'AbortError') {
      const timeoutErr = new Error(`Request timed out after ${timeoutMs}ms`);
      timeoutErr.name = 'AbortError';
      timeoutErr.isTimeout = true;
      throw timeoutErr;
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

// ─── CIRCUIT BREAKER (Phase 10 — Reliability) ─────────────────────────────────
// PRODUCTION GAP: every outbound call in this codebase (to Razorpay, Exotel,
// Groq, etc., via their respective Edge Functions) retries/timeouts
// individually per-call, but nothing remembers "this dependency has been
// failing repeatedly" across calls — a stalled downstream provider means
// every single caller pays the full timeout, one at a time, instead of
// failing fast once the pattern is clear. This is a small, in-memory,
// per-key breaker: after `failureThreshold` consecutive failures for a key,
// further calls fail fast (no network attempt) for `cooldownMs`, then allow
// one trial call through (half-open) before fully resetting.
//
// Opt-in — existing fetchWithTimeout() callers are completely unaffected
// unless they switch to fetchWithCircuitBreaker(). Not a redesign of any
// existing call site; nothing currently uses this except where explicitly
// wired in this Phase 10 pass.
const _breakers = new Map(); // key -> { failures, state: 'closed'|'open'|'half_open', openedAt }

const CIRCUIT_DEFAULTS = {
  failureThreshold: 5,     // consecutive failures before opening
  cooldownMs: 30_000,      // stay open this long before a half-open trial
};

export class CircuitOpenError extends Error {
  constructor(key) {
    super(`Circuit open for '${key}' — failing fast without a network attempt`);
    this.name = 'CircuitOpenError';
    this.isCircuitOpen = true;
    this.key = key;
  }
}

function _getBreaker(key) {
  if (!_breakers.has(key)) _breakers.set(key, { failures: 0, state: 'closed', openedAt: 0 });
  return _breakers.get(key);
}

/**
 * Wraps fetchWithTimeout with a per-key circuit breaker.
 * @param {string} key         Stable identifier for the dependency, e.g. 'razorpay', 'groq', 'exotel'.
 * @param {string} url
 * @param {object} [options]
 * @param {number} [timeoutMs]
 * @param {object} [circuitOpts]  { failureThreshold, cooldownMs }
 */
export async function fetchWithCircuitBreaker(key, url, options = {}, timeoutMs = DEFAULT_TIMEOUT_MS, circuitOpts = {}) {
  const cfg = { ...CIRCUIT_DEFAULTS, ...circuitOpts };
  const breaker = _getBreaker(key);
  const now = Date.now();

  if (breaker.state === 'open') {
    if (now - breaker.openedAt < cfg.cooldownMs) {
      throw new CircuitOpenError(key);
    }
    breaker.state = 'half_open'; // allow exactly one trial call through
  }

  try {
    const res = await fetchWithTimeout(url, options, timeoutMs);
    // Treat any 5xx as a failure for breaker purposes (network succeeded,
    // dependency didn't) — 4xx are the caller's/request's problem, not the
    // dependency being down, so they don't count against the breaker.
    if (res.status >= 500) {
      _recordFailure(breaker, cfg);
    } else {
      _recordSuccess(breaker);
    }
    return res;
  } catch (err) {
    _recordFailure(breaker, cfg);
    throw err;
  }
}

function _recordSuccess(breaker) {
  breaker.failures = 0;
  breaker.state = 'closed';
}

function _recordFailure(breaker, cfg) {
  breaker.failures += 1;
  if (breaker.state === 'half_open' || breaker.failures >= cfg.failureThreshold) {
    breaker.state = 'open';
    breaker.openedAt = Date.now();
  }
}

/** Read-only breaker status, e.g. for a diagnostics page. */
export function getCircuitStatus(key) {
  const b = _breakers.get(key);
  if (!b) return { key, state: 'closed', failures: 0 };
  return { key, state: b.state, failures: b.failures };
}

export default {
  fetchWithTimeout,
  fetchWithCircuitBreaker,
  getCircuitStatus,
  CircuitOpenError,
  DEFAULT_TIMEOUT_MS,
};
