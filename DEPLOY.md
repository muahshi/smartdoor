# SmartDoor — Patch 26: Admin Auth Stabilization

## ROOT CAUSE (Confirmed)

**Primary:** `verifyAdminSession()` in `adminAuth.ts` returns `null` because
`admin_users.session_token` in the DB became stale (nulled or mismatched)
after the Migration 25 schema changes. Even though the client has a valid
localStorage token, the DB lookup finds no matching row → returns null →
`admin-data` returns 401 → `admin.html` line 1363 clears session + redirects.

**Secondary (contributing):** `admin.html` `adminCall()` had zero tolerance —
a single 401 from ANY call immediately redirected. Now requires 3 consecutive
401s before redirecting (prevents false positives from transient errors).

**Tertiary:** `admin-data` was missing 14 type handlers called by `admin.html`
(ticket_list, manufacturing_queue, etc.) — these returned status 400 which
doesn't redirect, but are now fixed for full panel functionality.

---

## DEPLOYMENT ORDER (STRICT)

### STEP 1 — Run SQL Migration 26 (Supabase SQL Editor)
File: `26_auth_stabilization.sql`
- Clears all stale session tokens (forces fresh login)
- Adds performance indexes
- Verify output shows `with_active_session = 0` after running

### STEP 2 — Deploy Edge Functions
```bash
supabase functions deploy admin-data --project-ref YOUR_PROJECT_REF
```
File to deploy: `admin-data__index.ts` → goes to `supabase/functions/admin-data/index.ts`

Also deploy updated shared auth:
```bash
# adminAuth.ts goes to supabase/functions/_shared/adminAuth.ts
# (re-deploy any function that imports it)
supabase functions deploy admin-login --project-ref YOUR_PROJECT_REF
supabase functions deploy admin-data --project-ref YOUR_PROJECT_REF
supabase functions deploy admin-provision-customer --project-ref YOUR_PROJECT_REF
```

### STEP 3 — Deploy Frontend to Vercel
Files changed:
- `admin.html` → root of project
- `config/env.generated.js` → config/env.generated.js (create this file in repo)

**CRITICAL — Verify Vercel env vars are set:**
Go to Vercel → Project → Settings → Environment Variables
Required:
- `SUPABASE_URL` (or `VITE_SUPABASE_URL`)
- `SUPABASE_ANON_KEY` (or `VITE_SUPABASE_ANON_KEY`)

If these are missing, the build will produce empty `supabaseUrl` and ALL
API calls will fail silently.

Push to git → Vercel auto-deploys → build runs `node scripts/build-env.js`
→ writes real values to `config/env.generated.js`.

### STEP 4 — Clear browser localStorage
After deploy, open browser console on admin-login page and run:
```js
localStorage.removeItem('sd_admin_session');
```
Then do a fresh login.

---

## VERIFICATION CHECKLIST

- [ ] SQL ran successfully, `with_active_session = 0`
- [ ] Edge functions deployed
- [ ] Vercel deploy is green (Ready)
- [ ] Vercel build logs show: `supabaseUrl: ***` (NOT `(empty)`)
- [ ] Fresh login on `/admin-login.html` succeeds
- [ ] Dashboard loads and stays (no redirect loop)
- [ ] Dashboard metrics show real numbers (not —)
- [ ] Network tab: `admin-data` POST returns 200 (not 401)
- [ ] Manufacturing panel loads
- [ ] Support tickets panel loads
- [ ] QR management panel loads
- [ ] No redirect after 5+ minutes on dashboard

---

## ROLLBACK

If regression introduced:
1. Revert `admin.html` to previous version
2. Revert `admin-data/index.ts` to previous version
3. No SQL rollback needed (Migration 26 is additive — only cleared tokens)
4. Admins will need to re-login regardless (tokens were stale anyway)

---

## FILES CHANGED

| File | Change |
|------|--------|
| `admin.html` | `adminCall()` — 3-strike 401 guard, config check |
| `supabase/functions/admin-data/index.ts` | +14 missing type handlers |
| `supabase/functions/_shared/adminAuth.ts` | +debug logging on null returns |
| `config/env.generated.js` | NEW — proper placeholder (build overwrites) |
| `sql/26_auth_stabilization.sql` | Clear stale tokens + indexes |

---

## DO NOT TOUCH (Unchanged)
- `admin-login.html` — login logic correct, no change
- `services/admin.js` — not used by admin.html directly
- `services/adminData.js` — not used by admin.html directly  
- `vercel.json` — routing correct, no change
- `visitor.html` / `app.html` — not affected
- All other Edge Functions — not affected
