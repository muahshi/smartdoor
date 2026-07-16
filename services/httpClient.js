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

export default { fetchWithTimeout, DEFAULT_TIMEOUT_MS };
