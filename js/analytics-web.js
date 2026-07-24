/**
 * My Smart Door — Web Analytics Loader
 * js/analytics-web.js
 *
 * Phase 10 — Production Launch
 *
 * Loads Google Analytics 4, Microsoft Clarity, and Plausible Analytics
 * on the PUBLIC marketing site only (index.html). Each is entirely
 * config-driven via window.__SD_CONFIG__ (generated at Vercel build time
 * by scripts/build-env.js) and silently no-ops if its ID/domain isn't set
 * — so this is safe to include in every environment, including local dev.
 *
 * Does NOT run on app.html / login.html / admin.html / admin-login.html —
 * those are authenticated surfaces and are not included in this script.
 *
 * Required env vars (optional — each integration is independent):
 *   VITE_GA_MEASUREMENT_ID     e.g. G-XXXXXXXXXX
 *   VITE_CLARITY_PROJECT_ID    e.g. abc123xyz
 *   VITE_PLAUSIBLE_DOMAIN      e.g. mysmartdoor.in
 */

(function () {
  const cfg = window.__SD_CONFIG__ || {};

  // Respect explicit env flag if environment.js has already run and set it;
  // otherwise fall back to checking env directly (safe default: only load
  // analytics outside local development to avoid polluting dev data).
  const isProdOrStaging = cfg.env === 'production' || cfg.env === 'staging';
  if (!isProdOrStaging) return;

  // ────────── Google Analytics 4 ──────────
  if (cfg.gaId) {
    const gaScript = document.createElement('script');
    gaScript.async = true;
    gaScript.src = `https://www.googletagmanager.com/gtag/js?id=${cfg.gaId}`;
    document.head.appendChild(gaScript);

    window.dataLayer = window.dataLayer || [];
    function gtag() { window.dataLayer.push(arguments); }
    window.gtag = gtag;
    gtag('js', new Date());
    gtag('config', cfg.gaId, { anonymize_ip: true });
  }

  // ────────── Microsoft Clarity ──────────
  if (cfg.clarityId) {
    (function (c, l, a, r, i, t, y) {
      c[a] = c[a] || function () { (c[a].q = c[a].q || []).push(arguments); };
      t = l.createElement(r); t.async = 1; t.src = 'https://www.clarity.ms/tag/' + i;
      y = l.getElementsByTagName(r)[0]; y.parentNode.insertBefore(t, y);
    })(window, document, 'clarity', 'script', cfg.clarityId);
  }

  // ────────── Plausible Analytics ──────────
  if (cfg.plausibleDomain) {
    const plausibleScript = document.createElement('script');
    plausibleScript.defer = true;
    plausibleScript.setAttribute('data-domain', cfg.plausibleDomain);
    plausibleScript.src = 'https://plausible.io/js/script.js';
    document.head.appendChild(plausibleScript);
  }
})();
