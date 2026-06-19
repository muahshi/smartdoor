# Smart Door — OPERATIONS RUNBOOK
## Phase 10: Production Launch

This is the day-to-day operations reference for running Smart Door in
production. For the initial launch sequence, see `GO_LIVE_GUIDE.md`. For
backup tiers and detailed disaster-recovery restore steps, see
`docs/BACKUP_STRATEGY.md` (Phase 8) — this document references those
RTO/RPO targets rather than redefining them.

---

## 1. SYSTEM OVERVIEW

| Layer | Provider | Notes |
|---|---|---|
| Hosting | Vercel | Static site, no build framework — `node scripts/build-env.js` is the only build step |
| Database | Supabase (Postgres) | RLS on all tables |
| Storage | Supabase Storage | `qr-codes` (public), `voice-notes` (private) |
| Payments | Razorpay | Live keys in production only |
| Calling | Exotel (primary) / Twilio (fallback) | Call masking + routing |
| Email | Resend | Transactional only |
| AI | Groq | Visitor message summarization, AI receptionist |
| Error tracking | Sentry | Wired via `js/monitoring-bootstrap.js` |
| Web analytics | GA4 / Clarity / Plausible | `js/analytics-web.js`, public site only |
| Internal logging | `services/monitoring.js` | Ring buffer + DB persistence + alert thresholds |

---

## 2. ROLLBACK PROCEDURES

### 2.1 Rolling back a bad Vercel deployment

This is the fastest mitigation for a frontend issue (broken page, JS
error, bad config) and does **not** touch the database:

1. Go to Vercel Dashboard → Project → Deployments
2. Find the last known-good deployment (before the bad one)
3. Click the **⋯** menu on that deployment → **Promote to Production**
4. Confirm `https://smartdoor.in` now serves the rolled-back version
   (hard-refresh / check in incognito to bypass cache)
5. No DNS changes needed — Vercel handles this instantly

### 2.2 Rolling back a bad database migration

1. **Stop.** Do not run further migrations.
2. Check Supabase Dashboard → Database → Migrations to see what was applied
3. If the migration only added (didn't drop) columns/tables: write a new
   forward migration to revert the change — safer than a destructive rollback
4. If the migration dropped or destructively altered data: restore from
   the most recent backup per `docs/BACKUP_STRATEGY.md` (Point-in-time
   Recovery, RTO < 30 min) into a **separate test database first**, verify,
   then plan the cutback with the team — do not blindly restore over
   production without a verified backup copy
5. Document the incident (see Section 5)

### 2.3 Rolling back Edge Function deployments

1. Supabase CLI keeps deployment history: `supabase functions list`
2. Redeploy the previous known-good version of the function from git history:
   ```bash
   git checkout <last-good-commit> -- supabase/functions/<function-name>
   supabase functions deploy <function-name>
   ```
3. Confirm via `supabase/functions/health-check` that the system reports healthy

### 2.4 Disabling a failing third-party integration

If Razorpay, Exotel, Resend, or Groq is down/misbehaving and causing
cascading failures, the fastest stable state is to **disable the
integration gracefully** rather than let it fail repeatedly:

- **Razorpay down**: temporarily disable new order checkout (show a
  maintenance banner) — do not attempt to "queue" payments
- **Exotel down**: confirm Twilio fallback is engaging automatically
  (already implemented per `docs/PRODUCTION_CHECKLIST.md` known risks
  table); if both are down, calls fail gracefully but visitor logging
  (QR scan, photo, voice note) continues working
- **Resend down**: transactional emails queue/fail silently — check
  `error_logs` for accumulation; not launch-blocking to fix immediately,
  but renewal reminders depend on it
- **Groq down**: AI receptionist / message summarization should
  degrade to a non-AI fallback (manual visitor message) — confirm this
  fallback path before launch if not already verified

---

## 3. DAILY / WEEKLY / MONTHLY OPERATIONS

### Daily
- [ ] Glance at Sentry for new error types
- [ ] Glance at the admin launch dashboard for order/payment anomalies
- [ ] Confirm health-check is green (automated via UptimeRobot, but spot-check)

### Weekly
- [ ] Review `docs/BACKUP_STRATEGY.md` weekly backup ran successfully
- [ ] Review support ticket backlog and categories
- [ ] Review subscription renewal success rate

### Monthly
- [ ] Review monthly archive backup completed (`docs/BACKUP_STRATEGY.md`)
- [ ] Rotate any API keys due for rotation per security policy
- [ ] Review Sentry/Clarity for UX friction points (rage clicks, repeated errors)
- [ ] Review MRR/ARR/churn trend from launch dashboard

---

## 4. SCALING NOTES

See `docs/LOAD_TEST_PREPARATION.md` for the full breakdown by user count.
Quick reference for when to act:

| Signal | Action |
|---|---|
| Supabase connection pool near limit | Upgrade Supabase plan tier or add PgBouncer pooling mode |
| Edge Function cold-start complaints | Consider keeping functions warm via scheduled pings (health-check ping doubles as this) |
| Vercel bandwidth approaching plan limit | Review image sizes in `images/` (already WebP, but check largest assets), consider Vercel plan upgrade |
| Voice note storage approaching bucket cap | Review 90-day retention is actually purging old files (cron job) |
| Razorpay rate limits hit | Contact Razorpay to raise limits ahead of a known traffic spike (e.g. marketing campaign) |

---

## 5. INCIDENT DOCUMENTATION

For any P0/P1 incident (payment failures, data issues, extended outage):

1. Note: what happened, when detected, when resolved, root cause, fix applied
2. Add to a running incident log (`docs/INCIDENT_LOG.md` — create on first incident)
3. If customer-impacting, prepare a brief customer communication via Resend/WhatsApp
4. Add a regression test or monitoring alert to catch it earlier next time

---

## 6. KEY CONTACTS

See `docs/PRODUCTION_CHECKLIST.md` → Emergency Contacts for vendor support
channels (Supabase, Razorpay, Exotel, Twilio).

---

## 7. RELATED DOCUMENTS

- `GO_LIVE_GUIDE.md` — initial launch cutover sequence
- `SUPPORT_RUNBOOK.md` — customer-facing support procedures
- `LAUNCH_CHECKLIST.md` — pre-launch go/no-go checklist
- `docs/BACKUP_STRATEGY.md` — backup tiers, RTO/RPO, restore steps
- `docs/SECURITY_AUDIT_REPORT.md` — security findings and status
- `docs/DOMAIN_SETUP.md` — DNS configuration reference
- `docs/MONITORING_SETUP.md` — Sentry/Logtail/OpenTelemetry wiring details
- `docs/LOAD_TEST_PREPARATION.md` — scaling tiers and readiness notes
