/**
 * My Smart Door — Monitoring Bootstrap
 * js/monitoring-bootstrap.js
 *
 * Phase 10 — Production Launch
 *
 * services/monitoring.js already implements the full ring-buffer logging
 * system, alert thresholds, and DB persistence (Phase 9), with stubs for
 * external providers (Sentry / Logtail / OpenTelemetry) — but
 * initMonitoring() was never actually called anywhere, so those stubs
 * stayed empty in production.
 *
 * This module:
 *   1. Loads the Sentry Browser SDK from CDN ONLY if VITE_SENTRY_DSN is set
 *   2. Calls initMonitoring({ sentry }) to wire it into the existing
 *      logging pipeline in services/monitoring.js
 *
 * Logtail and OpenTelemetry remain available as stubs in monitoring.js for
 * a backend/edge-function context (they are server-side log shippers, not
 * typically loaded in-browser) — see docs/MONITORING_SETUP.md.
 *
 * Usage: load this as an ES module AFTER config/env.generated.js on any
 * authenticated page (app.html, login.html, admin.html, admin-login.html):
 *   <script type="module" src="js/monitoring-bootstrap.js"></script>
 */

import { initMonitoring } from '../services/monitoring.js';

const cfg = window.__SD_CONFIG__ || {};

async function bootstrap() {
  let sentryInstance = null;

  if (cfg.sentryDsn) {
    try {
      await loadScript('https://browser.sentry-cdn.com/7.120.0/bundle.tracing.min.js');
      if (window.Sentry) {
        window.Sentry.init({
          dsn: cfg.sentryDsn,
          environment: cfg.env || 'development',
          tracesSampleRate: cfg.env === 'production' ? 0.1 : 1.0,
          release: cfg.buildTime ? `smartdoor@${cfg.buildTime}` : undefined,
        });
        sentryInstance = window.Sentry;
      }
    } catch (err) {
      console.warn('[Monitoring] Sentry failed to load, continuing without it:', err);
    }
  }

  initMonitoring({ sentry: sentryInstance });
}

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = src;
    s.crossOrigin = 'anonymous';
    s.onload = resolve;
    s.onerror = reject;
    document.head.appendChild(s);
  });
}

bootstrap();
