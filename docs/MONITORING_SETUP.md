# Smart Door — Monitoring Setup
## Phase 10: Production Launch

Explains how the production monitoring stack wires into the existing
`services/monitoring.js` system (built in Phase 9) and what was added in
Phase 10 to actually activate it.

---

## 1. WHAT ALREADY EXISTED (Phase 9)

`services/monitoring.js` implements:
- An in-memory ring buffer of recent log events
- Periodic flush of logs to a Supabase table
- Alert thresholds by category (payment, communication, database, storage, subscription)
- Provider stubs: `_providers.sentry`, `_providers.logtail`, `_providers.otel`
- `initMonitoring({ sentry, logtail, otel })` to wire real SDK instances into those stubs

This was solid groundwork, but `initMonitoring()` was never actually
called anywhere in the app — so Sentry/Logtail/OTel were always `null` in
production, even if their dashboards existed.

---

## 2. WHAT PHASE 10 ADDED

**`js/monitoring-bootstrap.js`** — loads the Sentry Browser SDK from CDN
(only if `VITE_SENTRY_DSN` is configured) and calls `initMonitoring({ sentry })`.
Loaded via `<script type="module">` on all 4 authenticated pages
(`app.html`, `login.html`, `admin.html`, `admin-login.html`) — not on the
public marketing site, which doesn't need full app-level error tracking.

This is intentionally minimal: it does not change any logic inside
`services/monitoring.js` itself, only activates the existing hook.

---

## 3. SENTRY

1. Create a project in Sentry (Platform: Browser JavaScript)
2. Copy the DSN
3. Set `VITE_SENTRY_DSN` in Vercel → Production environment variables
4. Redeploy — `scripts/build-env.js` will inject it into `config/env.generated.js`
5. Verify: trigger a test error in production (e.g. temporarily call
   `throw new Error('test')` in browser devtools console on a live page),
   confirm it appears in the Sentry dashboard within ~1 minute, then
   remove the test trigger

**Sample rate**: configured at 10% trace sampling in production
(`tracesSampleRate: 0.1`) vs 100% in staging/dev, to control cost at
scale. Adjust in `js/monitoring-bootstrap.js` if needed.

---

## 4. LOGTAIL

Logtail (or any structured log shipper) is intended for **server-side**
logging — i.e. from Supabase Edge Functions, not the browser. This was
not wired in Phase 10 because:
- Edge Function logging is a backend concern, separate from the frontend
  bootstrap this phase covers
- `services/monitoring.js`'s `_providers.logtail` stub remains available
  for a future Edge Function context if/when that's built out

**To add later**: install Logtail's Node SDK in the relevant Edge
Function, initialize it with a Logtail source token (Edge Function
secret), and have it call `monitoring.js`-equivalent logic server-side,
or simply ship Edge Function `console.log`/`console.error` output
directly via Supabase's log drains feature if available on your plan.

---

## 5. OPENTELEMETRY

Same status as Logtail — the `_providers.otel` stub exists for future
distributed tracing across Edge Functions, but is not required for v1
launch and was not activated in Phase 10. Revisit once there are
multiple services/functions where request tracing across boundaries
becomes valuable (i.e. once the system is more complex than the current
monolithic Edge Functions).

---

## 6. HEALTH CHECKS

`supabase/functions/health-check/index.ts` already exists from an
earlier phase and should be checked by an external uptime monitor:

1. Sign up for UptimeRobot (or Better Uptime, Pingdom, etc.)
2. Add an HTTP(S) monitor pointing at the deployed health-check Edge
   Function URL
3. Set check interval to 1–5 minutes
4. Configure alert contacts (email, SMS, WhatsApp via webhook if supported)
5. Also add a simple monitor for `https://smartdoor.in` itself (the
   marketing page) to catch full-site outages, not just backend issues

---

## 7. WEB ANALYTICS (separate from error monitoring)

See `js/analytics-web.js` — covers GA4, Microsoft Clarity, and Plausible,
loaded only on the public marketing page (`index.html`). These are
product/marketing analytics, not error/performance monitoring, and are
documented separately in `LAUNCH_CHECKLIST.md` → Section 11.

---

## 8. RELATED DOCUMENTS

- `services/monitoring.js` — the underlying logging/alerting implementation
- `js/monitoring-bootstrap.js` — Phase 10 activation of Sentry hook
- `docs/PRODUCTION_CHECKLIST.md` — original monitoring checklist (Phase 8)
- `OPERATIONS_RUNBOOK.md` — what to do when an alert fires
