# Smart Door — LAUNCH CHECKLIST
## Phase 10: Production Launch

This is the master go/no-go checklist for taking Smart Door live on
**mysmartdoor.in**. It consolidates and extends the checklists already
completed in earlier phases:
- `docs/PRODUCTION_CHECKLIST.md` (Phase 8 — security, payments, comms, infra, monitoring, backup, performance)
- `docs/BETA_LAUNCH_CHECKLIST.md` (Phase 9 — operations, customer success, manufacturing, support)
- `docs/SECURITY_AUDIT_REPORT.md` (Phase 8 — security audit findings)
- `docs/BACKUP_STRATEGY.md` (Phase 8 — backup tiers & disaster recovery)

Do not skip those — this document assumes they are already ✅ and adds the
final production-launch layer: environments, domains, live vendor keys,
SEO, legal, analytics, and alerting.

---

## 0. PRE-REQUISITES (confirm Phase 8 & 9 are complete)

- [ ] All items in `docs/PRODUCTION_CHECKLIST.md` are checked
- [ ] All items in `docs/BETA_LAUNCH_CHECKLIST.md` are checked
- [ ] `docs/SECURITY_AUDIT_REPORT.md` has no open Critical/High findings
- [ ] Beta testers have used the product for at least 1–2 weeks with no P0 bugs

---

## 1. ENVIRONMENT STRATEGY

- [ ] **Development**: local machine, `.env.local` from `.env.example`, `VITE_APP_ENV=development`
- [ ] **Staging**: Vercel Preview deployments (every PR), `VITE_APP_ENV=staging`, separate Supabase project (or schema), Razorpay **test** keys, Exotel **test** numbers
- [ ] **Production**: Vercel Production deployment on `main` branch, `VITE_APP_ENV=production`, production Supabase project, Razorpay **live** keys, Exotel **production** numbers
- [ ] Vercel environment variables set correctly per-scope (Production / Preview / Development) — see `.env.example` for the full list
- [ ] Confirm `node scripts/build-env.js` runs as the Vercel Build Command (already set in `vercel.json`)

---

## 2. VERCEL DEPLOYMENT

- [ ] `vercel.json` reviewed and deployed (build command, headers, caching, rewrites)
- [ ] Build succeeds with zero errors in Vercel deployment logs
- [ ] `config/env.generated.js` is generated correctly per environment (check via browser devtools `window.__SD_CONFIG__` — **never** check this file into git)
- [ ] Security headers present on response (HSTS, X-Frame-Options, X-Content-Type-Options) — verify via `curl -I https://mysmartdoor.in`
- [ ] `/app.html`, `/login.html`, `/admin.html`, `/admin-login.html` all return `X-Robots-Tag: noindex`
- [ ] Static asset caching verified (`images/`, `css/`, `js/` return long `Cache-Control` headers)
- [ ] `/p/:plateId` QR rewrite resolves to `login.html?plate=:plateId` — **see Known Gap #1 below**

---

## 3. SUPABASE PRODUCTION

- [ ] Production Supabase project created (separate from staging/dev)
- [ ] All migrations from `supabase/migrations/` applied in order
- [ ] RLS enabled and verified on every table (re-run checks from `docs/SECURITY_AUDIT_REPORT.md`)
- [ ] Storage buckets created with correct public/private access (qr-codes public, voice-notes private)
- [ ] Realtime enabled on tables that need it (visitor_logs, notifications)
- [ ] All Edge Functions deployed: `health-check` and others from `supabase/functions/`
- [ ] Edge Function secrets set (Razorpay, Exotel/Twilio, Resend, Groq — server-side only, never in frontend env)
- [ ] Point-in-time recovery (PITR) enabled on the production project
- [ ] Weekly backup GitHub Action confirmed running (see `docs/BACKUP_STRATEGY.md`)
- [ ] Super admin account created in `admin_users` table

---

## 4. DOMAIN CONFIGURATION

See `docs/DOMAIN_SETUP.md` for full DNS records. Summary:

- [ ] `mysmartdoor.in` → Vercel (apex/root domain via ALIAS/ANAME or Vercel's recommended A record)
- [ ] `www.mysmartdoor.in` → redirects to `mysmartdoor.in` (or vice versa — pick one canonical, configure in Vercel domain settings)
- [ ] `app.mysmartdoor.in` → Vercel (optional: dedicated subdomain pointing at `app.html`, or keep app under main domain at `/app`)
- [ ] `admin.mysmartdoor.in` → Vercel (optional: dedicated subdomain for `admin.html`, recommended for easier IP allowlisting later)
- [ ] SSL certificates auto-provisioned by Vercel for all 4 domains
- [ ] DNS propagation verified (`dig mysmartdoor.in`, `dig app.mysmartdoor.in`, `dig admin.mysmartdoor.in`)

---

## 5. RAZORPAY LIVE

- [ ] Razorpay account KYC approved for live mode
- [ ] Live API keys (`rzp_live_...`) generated and set as `VITE_RAZORPAY_KEY_ID` (frontend) + `RAZORPAY_KEY_SECRET` (Edge Function secret, production scope only)
- [ ] Webhook URL configured in Razorpay dashboard → pointing to production Edge Function URL
- [ ] Webhook signature verification tested with a real test transaction in live mode (₹1 test order, then refund)
- [ ] Refund workflow tested end-to-end (admin-initiated refund → Razorpay → webhook → order status update)
- [ ] Payment failure handling tested (declined card, insufficient funds, timeout)
- [ ] Razorpay live dashboard alerts/email configured for failed payments

---

## 6. EXOTEL LIVE

- [ ] Production Exotel numbers purchased and activated
- [ ] Call masking tested with real phone numbers (owner ↔ visitor, number stays masked both directions)
- [ ] Webhook handling verified for call status events (initiated, ringing, answered, completed, failed)
- [ ] Fallback routing to Twilio tested (simulate Exotel outage / API error)
- [ ] Exotel production credentials set as Edge Function secrets only (never in frontend)

---

## 7. RESEND LIVE

- [ ] Domain `mysmartdoor.in` verified in Resend
- [ ] SPF record added (`v=spf1 include:_spf.resend.com ~all` — adjust if combined with other senders)
- [ ] DKIM records added (provided by Resend dashboard, 3x CNAME typically)
- [ ] DMARC record added (`v=DMARC1; p=quarantine; rua=mailto:dmarc@mysmartdoor.in`)
- [ ] Test email sent and checked for deliverability to Gmail, Outlook, and a spam-score tool (e.g. mail-tester.com)
- [ ] Transactional email templates tested: order confirmation, renewal reminder, OTP, password reset

See `docs/EMAIL_DNS_SETUP.md` for exact record values.

---

## 8. MONITORING STACK

- [ ] `js/monitoring-bootstrap.js` loaded on all authenticated pages (app/login/admin/admin-login) — wires `services/monitoring.js` to Sentry
- [ ] `VITE_SENTRY_DSN` set in Vercel production env → confirm errors appear in Sentry dashboard (trigger a test error)
- [ ] Logtail / log shipping configured at the Edge Function level (server-side — see `docs/MONITORING_SETUP.md`)
- [ ] `supabase/functions/health-check` returns 200 with all subsystems green
- [ ] UptimeRobot (or equivalent) monitoring `https://mysmartdoor.in` and the health-check endpoint, alerting to WhatsApp/email/SMS
- [ ] OpenTelemetry hooks reviewed — stub remains for future backend tracing (not required for v1 launch)

---

## 9. SEO LAUNCH

- [ ] Meta description, title, canonical URL present on `index.html`
- [ ] Open Graph tags present and `og:image` (`images/og-smartdoor.webp`) renders correctly in link preview testers
- [ ] Twitter Card tags present and validated
- [ ] JSON-LD structured data (Organization + Product) present and validates with zero errors (Google Rich Results Test)
- [ ] `sitemap.xml` live at `https://mysmartdoor.in/sitemap.xml`
- [ ] `robots.txt` live at `https://mysmartdoor.in/robots.txt`, blocking `/app`, `/admin`, `/login`, `/p/`
- [ ] Canonical URLs set on all public pages (index + 6 legal pages)
- [ ] Google Search Console property verified and sitemap submitted

---

## 10. LEGAL PAGES

- [ ] All 6 legal pages live and linked from footer: Privacy Policy, Terms of Service, Refund Policy, Shipping Policy, Cookie Policy, Acceptable Use Policy
- [x] `[INSERT GO-LIVE DATE]` placeholders in all `docs/legal/*.md` replaced with actual effective date (17 June 2026), then regenerated via `python3 docs/legal/generate_legal_pages.py`
- [ ] Legal pages reviewed by a lawyer familiar with Indian IT Act / Consumer Protection (E-Commerce) Rules, 2020 (strongly recommended before accepting real payments)
- [ ] Company registration details (CIN/GST, if applicable) added to footer or Terms of Service if operating as a registered entity

---

## 11. ANALYTICS

- [ ] `VITE_GA_MEASUREMENT_ID` set → GA4 confirmed receiving events (Realtime report)
- [ ] `VITE_CLARITY_PROJECT_ID` set → Clarity confirmed recording sessions
- [ ] `VITE_PLAUSIBLE_DOMAIN` set (optional, privacy-friendly alternative)
- [ ] Google Search Console verified (separate from GA4)
- [ ] Confirm `js/analytics-web.js` only loads on `index.html` (public marketing page) — **not** on authenticated app/admin pages

---

## 12. PRODUCTION ALERTING

Confirm alerts fire (test each, then revert test condition) for:

- [ ] Payment failures (Razorpay webhook failure or declined-payment spike)
- [ ] Communication failures (Exotel + Twilio fallback both fail)
- [ ] Database failures (Supabase connection errors via health-check)
- [ ] Storage failures (upload errors to voice-notes / qr-codes buckets)
- [ ] Subscription failures (renewal payment failures, expired-but-active subscriptions)

Alert routing already defined in `services/monitoring.js` alert thresholds — confirm the notification channel (WhatsApp/email/SMS) is connected to a real recipient, not a placeholder.

---

## 13. LOAD READINESS

See `docs/LOAD_TEST_PREPARATION.md` for the full breakdown by user tier
(100 / 1,000 / 10,000 / 100,000 users). Minimum for launch:

- [ ] Supabase plan sized appropriately for expected launch traffic (start on Pro, monitor connection pool usage)
- [ ] Vercel plan supports expected bandwidth (static assets are CDN-cached — should scale well by default)
- [ ] Database indexes confirmed on high-traffic query paths (plate lookups, visitor log inserts)

---

## 14. PRE-LAUNCH AUDIT

- [ ] Security: re-confirm `docs/SECURITY_AUDIT_REPORT.md` findings closed
- [ ] Payments: live ₹1 test order placed and refunded successfully end-to-end
- [ ] Authentication: owner login, PIN lockout, session expiry all tested
- [ ] Authorization: RLS confirmed — one owner cannot see another owner's data (manual test with 2 accounts)
- [ ] Communication: masked call + SOS + voice note tested on real devices
- [ ] Orders: full order → payment → plate assignment → manufacturing flow tested
- [ ] Manufacturing: manufacturing queue dashboard tested with a real order
- [ ] Admin Panel: super admin login, analytics dashboard, refund tool all tested

---

## 15. KNOWN GAPS (read before go-live)

These are flagged honestly rather than silently patched, since fixing them
touches business logic / UI which is out of scope for Phase 10:

1. **QR scan landing flow**: `vercel.json` now rewrites `/p/:plateId` →
   `login.html?plate=:plateId` at the infrastructure level, but no
   client-side code in `login.html` currently reads the `?plate=` query
   parameter to pre-fill or auto-route the visitor. Confirm with the team
   whether visitor-side QR landing was meant to be a separate page/flow
   before launch — if visitors are expected to scan and immediately see a
   visitor-facing page (not the owner login form), this needs a small
   follow-up phase.
2. **Legal page dates**: All 6 legal documents contain
   `[INSERT GO-LIVE DATE]` placeholders — must be replaced before
   accepting real customer payments.
3. **Lawyer review**: Legal pages were drafted to be comprehensive and
   India-appropriate but have not been reviewed by a licensed lawyer —
   recommended before processing live payments at scale.

---

## SIGN-OFF

| Area | Owner | Status | Date |
|---|---|---|---|
| Security & Infra | | ☐ | |
| Payments | | ☐ | |
| Communications | | ☐ | |
| Legal | | ☐ | |
| SEO/Marketing | | ☐ | |
| Final Go-Live Approval | | ☐ | |

Once all boxes are checked, proceed to `GO_LIVE_GUIDE.md` for the step-by-step cutover sequence.
