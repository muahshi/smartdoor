# Smart Door — GO-LIVE GUIDE
## Phase 10: Production Launch — Cutover Sequence

This is the step-by-step execution guide for launch day. Complete
`LAUNCH_CHECKLIST.md` fully before starting this sequence.

---

## TIMELINE OVERVIEW

```
T-7 days   Final staging QA pass, freeze new feature work
T-3 days   Razorpay live mode approved, Exotel production numbers active
T-1 day    DNS records prepared (not yet switched), legal pages dated, final backup taken
T-4h       Deploy to Vercel Production with production env vars
T-2h       Smoke test production deployment on the *.vercel.app URL
T-1h       Switch DNS to point at Vercel
T-0        Go live — monitor actively
T+1h       First health check review
T+24h      Day-1 retro and metrics review
```

---

## STEP 1 — Freeze & Final Staging Pass (T-7 days)

1. Stop merging new features to `main`. Only launch-blocking fixes allowed.
2. Run through the entire `LAUNCH_CHECKLIST.md` on staging.
3. Run a full manual QA pass: signup → order → payment → plate assignment →
   QR scan → masked call → SOS → voice note → renewal reminder.
4. Fix any P0/P1 bugs found; re-test.

---

## STEP 2 — Vendor Go-Live Prep (T-3 days)

1. **Razorpay**: confirm KYC approved, generate live keys, do **not** set them in Vercel yet.
2. **Exotel**: confirm production numbers are active and call masking tested in a sandbox call.
3. **Resend**: confirm domain verification (SPF/DKIM/DMARC) shows "Verified" in Resend dashboard — this can take up to 48h to propagate, so start this early.
4. **Sentry**: create production project, grab DSN.
5. **GA4 / Clarity**: create production properties, grab measurement IDs.

---

## STEP 3 — Pre-Cutover Prep (T-1 day)

1. Replace `[INSERT GO-LIVE DATE]` in all 6 files under `docs/legal/*.md`
   with the actual go-live date, then regenerate the HTML pages:
   ```bash
   python3 docs/legal/generate_legal_pages.py
   ```
2. Take a final manual Supabase backup as a pre-launch snapshot:
   ```bash
   supabase db dump --db-url "$SUPABASE_DB_URL" -f pre_launch_backup_$(date +%Y%m%d).sql
   ```
3. Prepare DNS records (see `docs/DOMAIN_SETUP.md`) at your domain registrar —
   you can stage these without activating if your registrar supports it,
   otherwise have the exact records ready to paste in Step 6.
4. Confirm all production environment variables are entered in Vercel
   (Project → Settings → Environment Variables → Production scope) per
   `.env.example`, including live Razorpay keys.
5. Double-check `RAZORPAY_KEY_SECRET`, `EXOTEL_*`, `RESEND_API_KEY` are set
   as **Supabase Edge Function secrets**, not Vercel frontend env vars
   (they must never reach the browser).

---

## STEP 4 — Deploy to Production (T-4h)

1. Merge final `main` branch state.
2. Trigger Vercel Production deployment (push to `main` or manual deploy).
3. Confirm build log shows:
   ```
   ✅ [build-env] Wrote .../config/env.generated.js for environment: production
   ```
4. Open the Vercel-assigned `*.vercel.app` production URL (before DNS
   cutover, this already serves the real production build).

---

## STEP 5 — Smoke Test on Vercel URL (T-2h)

Using the `*.vercel.app` production URL (domains aren't switched yet):

1. Open DevTools console, confirm `window.__SD_CONFIG__.env === "production"`
2. Place a real ₹1 order with a live Razorpay payment, confirm it completes
   and appears in the admin dashboard
3. Refund that ₹1 order, confirm refund completes
4. Log in as an owner, test masked call with a real phone (use Exotel
   production number — this is a real call, costs apply)
5. Confirm Sentry receives a test error (trigger one manually, then remove)
6. Confirm GA4 Realtime shows your test session
7. Check `/robots.txt`, `/sitemap.xml` are reachable
8. Check all 6 `/legal/*.html` pages render correctly
9. **If anything fails: stop here, fix, redeploy, repeat this step.**

---

## STEP 6 — DNS Cutover (T-1h)

Follow `docs/DOMAIN_SETUP.md` exactly. Summary:

1. In Vercel: Project → Settings → Domains → add `mysmartdoor.in`,
   `www.mysmartdoor.in`, `app.mysmartdoor.in`, `admin.mysmartdoor.in`
2. Vercel will show the exact DNS records required (A/ALIAS for apex,
   CNAME for subdomains) — copy these precisely, they may differ from
   generic examples
3. Update records at your domain registrar
4. Wait for DNS propagation (`dig mysmartdoor.in` — can take minutes to a
   few hours depending on registrar/TTL)
5. Confirm SSL certificate auto-provisions (Vercel handles this once DNS
   resolves correctly — usually within minutes)

---

## STEP 7 — Go Live (T-0)

1. Confirm `https://mysmartdoor.in` loads the production build with a valid
   SSL certificate (padlock, no warnings)
2. Confirm `https://www.mysmartdoor.in` redirects correctly
3. Post the announcement / open signups to real customers
4. Keep the team on standby in a shared channel for the next 2 hours

---

## STEP 8 — Active Monitoring (T+1h)

1. Watch Sentry for new error spikes
2. Watch `error_logs` / monitoring dashboard (`services/monitoring.js`
   alert thresholds) for payment, communication, database, storage, or
   subscription alerts
3. Watch Razorpay live dashboard for transaction success rate
4. Confirm `supabase/functions/health-check` continues returning 200 on
   the UptimeRobot (or equivalent) dashboard
5. Spot-check the first 3–5 real customer orders manually end-to-end

---

## STEP 9 — Day-1 Review (T+24h)

1. Review total orders, revenue, and any failed payments from the launch
   dashboard (see `docs/LAUNCH_DASHBOARD.md`)
2. Review Sentry for recurring (non-one-off) errors
3. Review support ticket volume and categories
4. Document any issues and follow-up items in a launch retro note

---

## ROLLBACK

If a critical issue is discovered after DNS cutover, see
`OPERATIONS_RUNBOOK.md` → "Rollback Procedures" for the exact steps to
revert to the previous Vercel deployment without re-pointing DNS.

---

*This guide assumes `LAUNCH_CHECKLIST.md` is fully complete. Do not skip
steps under time pressure — a 1-hour delay in launch is cheaper than a
production incident with live customer payments.*
