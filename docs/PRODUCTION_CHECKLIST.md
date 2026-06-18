# Smart Door — Production Launch Checklist
## Phase 8: Launch Readiness

**Complete every item before going live. Check ✅ when done.**

---

## 🔐 SECURITY CHECKLIST

### Database Security
- [ ] All 10 SQL migrations run in order (`01_schema.sql` → `10_security_hardening.sql`)
- [ ] RLS enabled on ALL tables — verify: `SELECT tablename FROM pg_tables t JOIN pg_class c ON c.relname = t.tablename WHERE c.relrowsecurity = true AND schemaname = 'public';`
- [ ] `users_insert_registration` anon policy **removed** (Phase 8 hardening applied)
- [ ] `security_rules_public_read` wildcard policy **removed**, replaced by `visitor_security_view`
- [ ] `visitor_logs_insert_anon` restricted to valid plate_id format
- [ ] `voice_notes_insert_anon` restricted (max 120s, valid storage path)
- [ ] Admin tables blocked from anon/authenticated: `admin_users`, `admin_roles`, `admin_permissions`, `support_tickets`, `ticket_comments`, `admin_audit_logs`
- [ ] PIN lockout system verified: `check_pin_lockout()`, `record_failed_pin()`, `reset_pin_lockout()` RPCs exist
- [ ] `pin_lockouts` table created and RLS blocking anon access
- [ ] Payment idempotency index created: `idx_payments_captured_unique`
- [ ] `chk_users_pin_hash_bcrypt` constraint: no plain-text PINs in DB

### Storage Security
- [ ] `voice-notes` bucket: **Private** (not public)
- [ ] `voice-notes` INSERT policy: anon uploads only to valid `SD-XXXXXX/` folders
- [ ] `voice-notes` SELECT policy: authenticated users can only read their own plate's folder
- [ ] `qr-codes` bucket: **Public read**, service_role only for write
- [ ] `user-uploads` bucket: **Private**, only authenticated user's own folder
- [ ] `plate-assets` bucket: **Public read**, service_role only for write
- [ ] Max file sizes set per bucket (10MB for voice notes)

### Edge Function Security
- [ ] `verify-pin`: domain-restricted CORS (`smartdoor.in` only in ALLOWED_ORIGINS)
- [ ] `verify-pin`: PIN lockout integrated (checks `check_pin_lockout` before bcrypt)
- [ ] `verify-razorpay-payment`: HMAC signature verification confirmed working
- [ ] `verify-razorpay-payment`: Idempotency check (`provider_payment_id` uniqueness)
- [ ] `create-razorpay-order`: Duplicate order check (same email + day)
- [ ] `call-status-webhook`: Deployed with `--no-verify-jwt` (telephony providers can't send JWT)
- [ ] `health-check`: Deployed and returns 200 at `[project].supabase.co/functions/v1/health-check`
- [ ] All secrets set via `supabase secrets set` (never hardcoded in code)

### API Keys & Secrets
- [ ] `SUPABASE_SERVICE_ROLE_KEY` — set in Supabase secrets, NOT in frontend code
- [ ] `RAZORPAY_KEY_SECRET` — set in Supabase secrets, NOT in frontend code
- [ ] `RAZORPAY_KEY_ID` — public (safe in `__SD_CONFIG__`), but use **LIVE** key (`rzp_live_`)
- [ ] `EXOTEL_API_KEY`, `EXOTEL_API_TOKEN`, `EXOTEL_SID` — set in Supabase secrets
- [ ] `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN` — set in Supabase secrets
- [ ] No `.env` file committed to Git (confirm `.gitignore` covers it)

---

## 💳 PAYMENT CHECKLIST

- [ ] Razorpay account in **LIVE mode** (not test mode)
- [ ] Razorpay webhook URL configured: `[project].supabase.co/functions/v1/verify-razorpay-payment`
- [ ] Razorpay webhook secret matches what Edge Function expects
- [ ] Test a real ₹1 payment end-to-end in production
- [ ] Refund flow tested via admin panel
- [ ] GST/TAX settings configured in Razorpay dashboard
- [ ] Payment failure email configured in Razorpay

---

## 📞 COMMUNICATION CHECKLIST

- [ ] Exotel account active with sufficient balance (recharge)
- [ ] Exotel caller ID / virtual number configured
- [ ] Call masking tested: visitor calls → masked number → owner receives
- [ ] Family fallback routing tested (owner doesn't answer → routes to family member)
- [ ] Call status webhook verified (Exotel dashboard points to `call-status-webhook`)
- [ ] Twilio fallback configured (if Exotel fails)
- [ ] Voice note recording tested: upload to `voice-notes` bucket, playback in dashboard
- [ ] SOS emergency broadcast tested (push notification + call)

---

## 🌐 FRONTEND & INFRA CHECKLIST

- [ ] `window.__SD_CONFIG__` populated in all HTML files (app.html, login.html, admin.html)
- [ ] `supabaseUrl`, `supabaseAnon`, `razorpayKeyId` all set correctly in `__SD_CONFIG__`
- [ ] HTTPS enforced — all pages load on `https://`
- [ ] Service Worker (`sw.js`) registered and caching correctly
- [ ] PWA manifest tested (Add to Home Screen works on Android)
- [ ] `validateEnv()` called at app boot — no errors on startup
- [ ] `initMonitoring()` called at app boot
- [ ] Inactivity auto-logout working (30 minutes)
- [ ] QR code URLs resolve correctly (`https://smartdoor.in/p/SD-XXXXXX`)
- [ ] OG meta tags populated in `index.html` for social sharing
- [ ] Favicon and app icons present (`192x192`, `512x512`)

---

## 📊 MONITORING CHECKLIST

- [ ] `services/monitoring.js` imported and `initMonitoring()` called in app.js
- [ ] `error_logs` table created (Migration 09)
- [ ] Health check endpoint responds: `GET /functions/v1/health-check` → 200
- [ ] UptimeRobot (or similar) configured to ping health-check every 5 minutes
- [ ] Alert email configured (admin@smartdoor.in gets notified on health failures)
- [ ] Supabase Dashboard alerts enabled: database size, connection count
- [ ] Razorpay alerts enabled: failed payments email

---

## 💾 BACKUP CHECKLIST

- [ ] Supabase Project on **Pro plan** (7-day backup retention minimum)
- [ ] GitHub Actions weekly backup workflow created (`.github/workflows/weekly-backup.yml`)
- [ ] S3 bucket `smartdoor-backups` created with versioning enabled
- [ ] AWS IAM user with S3-only write permissions for backup workflow
- [ ] First manual backup completed and verified restorable
- [ ] Disaster recovery doc reviewed by team (`docs/BACKUP_STRATEGY.md`)

---

## 🏎️ PERFORMANCE CHECKLIST

- [ ] Migration 09 (`09_performance_indexes.sql`) applied — all indexes created
- [ ] `ANALYZE` run on high-traffic tables
- [ ] Supabase Realtime: `eventsPerSecond: 10` cap confirmed in `supabase.js`
- [ ] Large images compressed (WebP format, < 200KB each)
- [ ] Lighthouse score > 90 on mobile (PWA audit)
- [ ] Database connection pooling enabled (Supabase → Settings → Database → Connection Pooler)

---

## 🔧 OPERATIONS CHECKLIST

- [ ] Admin panel login tested (admin.html)
- [ ] Super admin account created in `admin_users` table
- [ ] Support ticket system working
- [ ] Manufacturing queue visible to manufacturing team
- [ ] Order tracking visible to customer (order confirmation email)
- [ ] Customer onboarding flow tested end-to-end (Order → Pay → Plate ID assigned)
- [ ] PIN change flow tested from dashboard
- [ ] Subscription renewal reminder tested

---

## 📋 GO-LIVE DAY SEQUENCE

```
T-24h: Run final SQL migrations (09, 10)
T-24h: Deploy all Edge Functions
T-24h: Verify health-check returns 200
T-12h: Run full end-to-end payment test
T-12h: Confirm all secrets set in Supabase
T-06h: Enable UptimeRobot monitoring
T-01h: Final Lighthouse audit
T-00h: Switch DNS to production
T+01h: Monitor error_logs table for spikes
T+24h: Review first-day audit_logs and monitoring data
```

---

## ⚠️ KNOWN RISKS & MITIGATIONS

| Risk                        | Likelihood | Impact | Mitigation                              |
|-----------------------------|-----------|--------|-----------------------------------------|
| Razorpay webhook replay     | Low       | High   | HMAC verification + idempotency index   |
| PIN brute force             | Medium    | High   | 5-attempt lockout (Phase 8)             |
| Voice note storage flooding | Medium    | Medium | Rate limit + 120s max + 10MB bucket cap |
| Supabase Realtime disconnect | Low      | Medium | Auto-reconnect in supabase.js           |
| Admin account compromise    | Low       | Critical | 2FA via TOTP, session revocation table |
| Exotel API failure          | Medium    | High   | Twilio fallback in PROVIDERS array      |
| Database PITR unavailable   | Low       | High   | Weekly pg_dump backup to S3             |

---

## 📞 EMERGENCY CONTACTS

```
Supabase Support:    support@supabase.com / Discord #help
Razorpay Support:    support@razorpay.com / 1800-123-1243
Exotel Support:      support@exotel.com / +91-80-67482020
Twilio Support:      support@twilio.com / Console Help Center
```

---

*Last updated: Phase 8 — Production Hardening*
*Version: 1.0*
