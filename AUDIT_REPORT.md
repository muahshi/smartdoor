# SmartDoor — Complete Production Recovery
**Date:** 2026-06-23  **Version:** ZIP #33 + Final Patch  **Status:** CRITICAL — All 10 failures mapped

---

## PHASE 1 — Production Audit Report

### Architecture Map

```
ADMIN LOGIN FLOW
  admin-login.html
    → services/admin.js adminLogin()        [supabase.functions.invoke — sdk injects anon key as Bearer]
    → Edge Fn: admin-login/index.ts         [bcryptjs compare, issues session_token]
    → localStorage: sd_admin_session        [token + admin object stored]
    → admin.html loads                      [requireAdminAuth() checks localStorage]

DASHBOARD METRICS FLOW
  admin.html → loadDashboard()
    → services/adminData.js getDashboardMetrics()
    → fetch() with Bearer: <session_token>
    → Edge Fn: admin-data/index.ts type=dashboard_metrics
    → service_role DB reads (bypasses RLS)
    → populates #m-customers, #m-subs, etc.

CUSTOMER PROVISIONING FLOW
  admin.html → Create Customer form submit
    → services/adminProvisioning.js createCustomer()
    → fetch() with Bearer: <session_token>
    → Edge Fn: admin-provision-customer/index.ts
    → 1. Unique plateId generated
    → 2. PIN bcrypt-hashed
    → 3. INSERT users row
    → 4. INSERT plates row
    → 5. QRCode generate → Supabase Storage qr-codes bucket
    → 6. UPDATE plates.qr_image_url / qr_svg_url
    → 7. INSERT subscriptions (optional)
    → 8. INSERT activation_events + admin_audit_logs

CUSTOMER LIST FLOW
  admin.html → loadCustomers()
    → services/adminData.js searchCustomers()
    → Edge Fn: admin-data/index.ts type=customer_list
    → SELECT users JOIN subscriptions, plates, orders
    → renders table

VISITOR ROUTE FLOW
  Browser scans QR → /p/SD-XXXXXX
  vercel.json rewrite → /visitor.html?plate=SD-XXXXXX
    → visitor.html (standalone, NO app.html nav)
    → services/visitorExperience.js resolveVisitorRoute()
    → services/plates.js getPlateBySlug()
    → supabase FROM plates WHERE qr_slug=slug
    → RPC get_owner_display_for_plate(slug)
    → renders owner name + visitor UI only

AI RECEPTIONIST FLOW
  visitor.html → handleAISend()
    → fetch groq-proxy Edge Fn
    → Groq LLaMA-3 → JSON intent
    → appendAIMsg() displays response
    → speak(hindi_response) if voiceEnabled
```

---

## PHASE 2 — Root Cause Matrix

| # | Failure | File(s) | Root Cause | Severity |
|---|---------|---------|-----------|----------|
| 1 | Customer not visible in Customer Management | admin.html `loadCustomers()` → `searchCustomers()` → admin-data Edge Fn | **CORS**: `restrictedCors()` only allows `mysmartdoor.in`. In dev/staging/Vercel Preview the origin is different. Also: `admin-data` Edge Fn does `users JOIN plates!owner_id` — if `plates` row insert failed silently, join returns NULL and customer shows missing | HIGH |
| 2 | Dashboard metrics blank | admin.html `loadDashboard()` → `getDashboardMetrics()` | **Session token bug**: `adminLogin()` in `services/admin.js` uses `supabase.functions.invoke()` which injects the **anon key** as Bearer, overriding the session token. The Edge Fn receives anon key, `verifyAdminSession()` looks for it in `admin_users.session_token` — never found → 401 → blank metrics | CRITICAL |
| 3 | Customer Management "Connection Error" | admin.html → `searchCustomers()` | **Same root cause as #2**: admin-data Edge Fn returns 401 because the Bearer token sent by `_call()` in `adminData.js` IS correct (raw fetch, not SDK), but `getDashboardMetrics()` fires first with the bad SDK call, fails, and the UI shows a stale "Connection Error" state. ADDITIONALLY: if `admin_data_rls_fix.sql` (migration 19) was not run, `plates.qr_image_url` column doesn't exist, causing the customer_list join to throw a 500 | HIGH |
| 4 | Visitor page shows "Sharma Family" | visitor.html → `getPlateBySlug()` | **Migration 20 not deployed**: `get_owner_display_for_plate()` RPC does not exist in DB yet. `supabase.rpc()` returns error, `ownerName` falls back to `'Resident'`. The "Sharma Family" is stale data from the old embedded join that was replaced. If both the old and new code is mixed, or the RPC doesn't exist, owner name is wrong | CRITICAL |
| 5 | Visitor page shows Analytics + Settings + Owner toggle | visitor.html (patch) | **FALSE ALARM on visitor.html**: The patch `visitor.html` is a standalone page with NO Analytics/Settings tabs. The screenshot shows the user is actually on **`app.html`** (the Owner PWA), not `visitor.html`. The issue is that `/app` route (or cached `app.html`) is what opened when the owner typed the URL. This is a **UX/routing confusion**, not a code bug in visitor.html | MEDIUM |
| 6 | QR generation not working | admin-provision-customer/index.ts → QRCode → Storage | **Storage bucket RLS**: `qr-codes` bucket INSERT policy requires `auth.role() = 'service_role'`. When deployed, this policy may not exist. Also: migration 20 SQL `CREATE POLICY IF NOT EXISTS` syntax is not supported in older Postgres — needs `DO $$ BEGIN IF NOT EXISTS...` pattern | HIGH |
| 7 | qr_image_url / qr_svg_url NULL | sql/19_admin_data_rls_fix.sql not applied | `plates` table was created by `01_schema.sql` WITHOUT these columns. Migration 19 adds them with `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`. If migration 19 was not run, columns don't exist → insert fails silently in `admin-provision-customer` (non-fatal QR block) | HIGH |
| 8 | AI Receptionist unreliable | visitor.html `handleAISend()` | **TTS not auto-play**: `voiceEnabled` defaults to `false`. User must manually click "🔈 Voice" button. No auto-speak on page load. Language detection: greeting is in Hindi but AI response shows ENGLISH only in the chat bubble — `intentData.response` (English) is displayed while `hindi_response` is only spoken. Visitor sees English, hears Hindi — inconsistent | MEDIUM |
| 9 | Admin + Visitor experiences mixed | app.html vs visitor.html | The QR (`/p/SD-XXXXXX`) correctly routes to `visitor.html`. The `app.html` is the owner dashboard at `/app`. The confusion is when the **owner** is logged in and opens the app — they see the Visitor tab + Analytics + Settings, which is correct for the owner. **Visitor isolation IS correct** in visitor.html. The problem reported may be that the owner's browser has cached `app.html` open | MEDIUM |
| 10 | Records save but don't propagate | admin-provision-customer → customer_list | Provisioning saves user+plate but `searchCustomers()` fails to show them because the **admin session verification fails on the second call** (stale 401 from metrics load). Or: the `users JOIN plates!owner_id` in `customer_list` uses wrong foreign key hint and returns empty array for the join columns | HIGH |

---

## PHASE 3 — Database Fixes

**Migration 21** — Run this in Supabase SQL Editor:

```sql
-- ════════════════════════════════════════════════════════════════════════════
-- Migration 21: Production Recovery — Column + RLS + RPC Completeness Check
-- ════════════════════════════════════════════════════════════════════════════
BEGIN;

-- 1. Ensure qr columns exist (idempotent)
ALTER TABLE plates ADD COLUMN IF NOT EXISTS qr_image_url TEXT;
ALTER TABLE plates ADD COLUMN IF NOT EXISTS qr_svg_url   TEXT;
ALTER TABLE plates ADD COLUMN IF NOT EXISTS suspended_reason TEXT;
ALTER TABLE plates ADD COLUMN IF NOT EXISTS suspended_at TIMESTAMPTZ;
ALTER TABLE plates ADD COLUMN IF NOT EXISTS suspended_by TEXT;
ALTER TABLE plates ADD COLUMN IF NOT EXISTS provisioned_by TEXT;
ALTER TABLE plates ADD COLUMN IF NOT EXISTS provisioning_source TEXT;

-- 2. Ensure activation_date exists on plates
ALTER TABLE plates ADD COLUMN IF NOT EXISTS activation_date TIMESTAMPTZ;

-- 3. Backfill qr_slug
UPDATE plates SET qr_slug = plate_id WHERE qr_slug IS NULL AND plate_id IS NOT NULL;

-- 4. Unique index on qr_slug
CREATE UNIQUE INDEX IF NOT EXISTS idx_plates_qr_slug ON plates(qr_slug) WHERE qr_slug IS NOT NULL;

-- 5. Service-role bypass policies (idempotent)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='admin_users' AND policyname='admin_users_service_all') THEN
    CREATE POLICY admin_users_service_all ON admin_users FOR ALL USING (auth.role()='service_role'); END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='admin_audit_logs' AND policyname='audit_logs_service_all') THEN
    CREATE POLICY audit_logs_service_all ON admin_audit_logs FOR ALL USING (auth.role()='service_role'); END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='plates' AND policyname='plates_service_all') THEN
    CREATE POLICY plates_service_all ON plates FOR ALL USING (auth.role()='service_role'); END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='users' AND policyname='users_service_all') THEN
    CREATE POLICY users_service_all ON users FOR ALL USING (auth.role()='service_role'); END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='subscriptions' AND policyname='subscriptions_service_all') THEN
    CREATE POLICY subscriptions_service_all ON subscriptions FOR ALL USING (auth.role()='service_role'); END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='support_tickets' AND policyname='tickets_service_all') THEN
    CREATE POLICY tickets_service_all ON support_tickets FOR ALL USING (auth.role()='service_role'); END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='orders' AND policyname='orders_service_all') THEN
    CREATE POLICY orders_service_all ON orders FOR ALL USING (auth.role()='service_role'); END IF;
END $$;

-- 6. get_owner_display_for_plate RPC (visitor route fix)
CREATE OR REPLACE FUNCTION get_owner_display_for_plate(p_plate_id TEXT)
RETURNS TABLE(full_name TEXT)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  RETURN QUERY
    SELECT u.full_name FROM users u
    JOIN plates p ON p.owner_id = u.id
    WHERE (p.plate_id = p_plate_id OR p.qr_slug = p_plate_id) AND p.status = 'active'
    LIMIT 1;
END; $$;
GRANT EXECUTE ON FUNCTION get_owner_display_for_plate TO anon, authenticated, service_role;

-- 7. get_subscription_status_for_plate RPC
CREATE OR REPLACE FUNCTION get_subscription_status_for_plate(p_plate_id TEXT)
RETURNS TABLE(plan TEXT, status TEXT, expiry_date TIMESTAMPTZ)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  RETURN QUERY
    SELECT s.plan, s.status, s.expiry_date FROM subscriptions s
    JOIN plates p ON p.owner_id = s.owner_id
    WHERE (p.plate_id = p_plate_id OR p.qr_slug = p_plate_id) AND p.status = 'active'
    ORDER BY CASE s.status WHEN 'active' THEN 0 WHEN 'grace_period' THEN 1 ELSE 2 END, s.created_at DESC
    LIMIT 1;
END; $$;
GRANT EXECUTE ON FUNCTION get_subscription_status_for_plate TO anon, authenticated, service_role;

-- 8. Ensure activation_events table has needed columns
ALTER TABLE activation_events ADD COLUMN IF NOT EXISTS actor TEXT;
ALTER TABLE activation_events ADD COLUMN IF NOT EXISTS metadata JSONB;

-- 9. Performance indexes
CREATE INDEX IF NOT EXISTS idx_plates_owner_id       ON plates(owner_id);
CREATE INDEX IF NOT EXISTS idx_plates_plate_id       ON plates(plate_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_owner   ON subscriptions(owner_id);
CREATE INDEX IF NOT EXISTS idx_orders_owner          ON orders(owner_id);
CREATE INDEX IF NOT EXISTS idx_users_plate_id        ON users(plate_id);

-- 10. Storage bucket (run separately in Dashboard if this errors)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('qr-codes', 'qr-codes', true, 5242880, ARRAY['image/png','image/svg+xml'])
ON CONFLICT (id) DO UPDATE SET public = true;

COMMIT;
```

**Storage RLS** — Run separately in Supabase Dashboard > SQL Editor:
```sql
-- Storage RLS for qr-codes bucket
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='objects' AND schemaname='storage' AND policyname='qr_codes_public_read') THEN
    CREATE POLICY qr_codes_public_read ON storage.objects FOR SELECT USING (bucket_id = 'qr-codes');
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='objects' AND schemaname='storage' AND policyname='qr_codes_service_upload') THEN
    CREATE POLICY qr_codes_service_upload ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'qr-codes' AND auth.role() = 'service_role');
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='objects' AND schemaname='storage' AND policyname='qr_codes_service_update') THEN
    CREATE POLICY qr_codes_service_update ON storage.objects FOR UPDATE USING (bucket_id = 'qr-codes' AND auth.role() = 'service_role');
  END IF;
END $$;
```

---

## PHASE 4 — Edge Function Fixes

### 4.1 — `services/admin.js` — `adminLogin()` CRITICAL BUG FIX

**Problem:** `supabase.functions.invoke('admin-login', ...)` injects the **anon key** as `Authorization: Bearer`, overriding the intended credential flow. The `admin-login` function doesn't care (it reads email+password from the body), but every subsequent `supabase.functions.invoke()` call would send the anon key as Bearer — causing `verifyAdminSession()` to fail with 401.

**Fix:** The `adminLogin` function in `services/admin.js` must use raw `fetch()`, not `supabase.functions.invoke()`. **See PHASE 5 for the patched file.**

### 4.2 — CORS Whitelist

`restrictedCors()` in `_shared/cors.ts` only allows `mysmartdoor.in`. If you deploy to a Vercel Preview URL, all admin Edge Function calls will be blocked by CORS with a confusing "Connection Error" (the response body never arrives because the browser blocks it pre-flight).

**Fix:** Add your Vercel preview domain pattern OR use the permissive `corsHeaders` (with `*`) for admin-data during development. For production, the current whitelist is correct.

### 4.3 — `admin-data` customer_list join fix

The join `subscriptions!owner_id` and `plates!owner_id` uses PostgREST foreign key hints. If the FK is named differently in your schema, this silently returns null arrays. The fix is to use explicit FK names from `01_schema.sql`. **The current code in the patch is correct** — if you still see empty joins, check `\d plates` in psql to confirm FK name.

---

## PHASE 5 — Frontend Fixes

### FILE 1: `services/admin.js` — Fix adminLogin() to use raw fetch

**Change:** Replace `supabase.functions.invoke` with `fetch()` in `adminLogin()`.

### FILE 2: `visitor.html` — AI Receptionist auto-speak + Hinglish + language auto-detect

**Changes:**
1. Auto-speak greeting on page load (regardless of voiceEnabled — ask once)
2. AI response shows BOTH Hindi + English in chat bubble  
3. Language auto-detect from user input (Hindi/Hinglish/English)
4. Voice enabled by default (but respects browser autoplay policy via user gesture on first interaction)
5. System prompt updated to return Hinglish (Roman script) + Hindi (Devanagari) + English

### FILE 3: `visitor.html` — Owner UI separation (already correct, needs UX fix)

`visitor.html` is already completely separate from `app.html`. The "Analytics/Settings/Owner→" shown in the screenshot is `app.html` (the owner dashboard). The fix needed is:
- Add a clear "🏠 Owner Login" link at the BOTTOM of visitor.html (not top)
- Ensure the QR-scanned URL (`/p/SD-xxx`) never opens `app.html`

**See generated files below for all patches.**

---

## PHASE 6 — Visitor/Owner Separation (Architecture Confirmation)

```
CORRECT SEPARATION (already in codebase):
  /p/:slug      → visitor.html   (NO owner tabs, NO analytics, NO settings)
  /app          → app.html       (Owner PWA: Visitor + Analytics + Settings tabs)
  /admin        → admin.html     (Internal admin portal)

THE REPORTED BUG:
  The screenshot shows app.html, NOT visitor.html.
  The "Owner →" button, "Analytics" tab, "Settings" tab are in app.html ONLY.
  visitor.html has NONE of these.

WHY IT HAPPENED:
  1. Owner opened /app on their phone (correct)
  2. Owner shared that tab/screenshot mistakenly labelled as "visitor page"
  OR
  3. The vercel.json rewrite for /p/:slug wasn't deployed yet, so
     mysmartdoor.in/p/SD-XXXXX was falling through to app.html

VERCEL FIX:
  Confirm vercel.json is deployed with the /p/:slug rewrite.
  Check: curl -I https://mysmartdoor.in/p/SD-TEST123
  → Should respond 200 with visitor.html content, NOT redirect to app.html

OWNER UI SHOWN TO VISITOR — PERMANENT FIX:
  visitor.html already has NO owner tabs.
  The only "owner" element is "Owner? Login to activate →" link at the bottom
  of the activation-pending screen (correct behavior — pending plates need it).
```

---

## PHASE 7 — Final Deployment Checklist

```
DATABASE (Supabase SQL Editor)
□ Run Migration 21 SQL (Phase 3 above)
□ Run Storage RLS SQL (Phase 3 above)
□ Verify: SELECT column_name FROM information_schema.columns WHERE table_name='plates' AND column_name IN ('qr_image_url','qr_svg_url');
□ Verify: SELECT routine_name FROM information_schema.routines WHERE routine_name='get_owner_display_for_plate';
□ Verify: SELECT policyname FROM pg_policies WHERE tablename='users' AND policyname='users_service_all';

STORAGE (Supabase Dashboard → Storage)
□ Bucket 'qr-codes' exists
□ Bucket 'qr-codes' is set to PUBLIC
□ RLS policies: public read + service_role upload/update exist

EDGE FUNCTIONS (supabase CLI)
□ supabase functions deploy admin-login
□ supabase functions deploy admin-data
□ supabase functions deploy admin-provision-customer
□ supabase functions deploy generate-qr
□ supabase functions deploy groq-proxy
□ Verify SUPABASE_SERVICE_ROLE_KEY is set in Edge Function secrets
□ Verify APP_URL is set to https://mysmartdoor.in in Edge Function secrets

FRONTEND (Vercel)
□ Deploy patched services/admin.js (adminLogin raw fetch fix)
□ Deploy patched visitor.html (AI Hinglish + auto-speak)
□ Verify vercel.json has /p/:slug → visitor.html rewrite
□ Verify env.generated.js is produced at build time with correct supabaseUrl + supabaseAnon
□ Clear Vercel cache / trigger fresh deploy

BACKFILL (for existing customers with NULL qr_image_url)
□ In Admin panel → QR Management → click "Regenerate QR" for each affected customer
□ OR: call generate-qr Edge Function directly for each plate_id:
  curl -X POST https://your-project.supabase.co/functions/v1/generate-qr \
    -H "Authorization: Bearer <SERVICE_ROLE_KEY>" \
    -H "Content-Type: application/json" \
    -d '{"plate_id":"SD-XXXXXX"}'
```

---

## PHASE 8 — Verification Tests

### Test 1: Admin Login
```
1. Open /admin-login.html
2. Enter admin credentials
3. Open DevTools → Network → filter "admin-login"
4. PASS: Response has {success:true, token:"..."}
5. PASS: localStorage has sd_admin_session with token field
6. PASS: Redirected to /admin.html
7. PASS: Admin name shows in top bar
```

### Test 2: Dashboard Metrics
```
1. Logged into admin
2. Open DevTools → Network → filter "admin-data"
3. PASS: Request has Authorization: Bearer <64-char-hex-token> (NOT "Bearer eyJ...")
4. PASS: Response has {success:true, metrics:{totalCustomers:N}}
5. PASS: #m-customers shows number (not blank/0)
```

### Test 3: Create Customer
```
1. Admin → Customers → Create Customer
2. Fill: Name=Test User, Phone=9876543210, PIN=1234, Product=Acrylic
3. Submit
4. PASS: Toast shows "Customer provisioned successfully"
5. PASS: Customer appears in Customer Management table immediately
6. PASS: Customer row has plate_id like SD-XXXXXX
7. PASS: QR image shown in customer profile (not broken link)
```

### Test 4: Visitor Route
```
1. Take the plate_id from Test 3 (e.g. SD-AB3CD5)
2. Open browser: https://mysmartdoor.in/p/SD-AB3CD5
3. PASS: Page loads visitor.html (NOT app.html)
4. PASS: Owner name shows "Test User" (NOT "Sharma Family" / "Resident")
5. PASS: NO Analytics tab, NO Settings tab, NO "Owner →" button
6. PASS: Call Owner, Ring Bell, Leave Message, SOS buttons visible
7. PASS: AI Receptionist shows "Namaste! Main Priya hoon..." greeting
```

### Test 5: AI Receptionist
```
1. On visitor page, type "I am delivering a parcel"
2. PASS: AI responds in under 5 seconds
3. PASS: Chat bubble shows English response
4. PASS: A Hindi/Hinglish subtitle appears below the English response
5. Click "🔈 Voice" button
6. PASS: Button changes to "🔊 Voice On"
7. Type another message
8. PASS: Hindi audio plays automatically after response
```

### Test 6: QR Code
```
1. Admin → Customer profile for Test 3 customer
2. PASS: QR image loads (not broken)
3. PASS: Scanning QR opens https://mysmartdoor.in/p/SD-XXXXXX
4. Check DB: SELECT qr_image_url, qr_svg_url FROM plates WHERE plate_id='SD-XXXXXX';
5. PASS: Both columns are non-NULL URLs pointing to Supabase Storage
```


---

## ADDENDUM — Migration 21 Supplement (run after main Migration 21)

```sql
-- Create admin_session_revocations if missing (prevents verifyAdminSession crash)
CREATE TABLE IF NOT EXISTS admin_session_revocations (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id   UUID NOT NULL,
  revoked_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  reason     TEXT
);

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='admin_session_revocations' AND policyname='revocations_service_all') THEN
    CREATE POLICY revocations_service_all ON admin_session_revocations FOR ALL USING (auth.role()='service_role');
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_revocations_admin ON admin_session_revocations(admin_id, revoked_at);

-- Ensure users.plate_id column exists (referenced by customer_list join)
ALTER TABLE users ADD COLUMN IF NOT EXISTS plate_id TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS pin_hash TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS address TEXT;

-- Index for faster customer_list searches
CREATE INDEX IF NOT EXISTS idx_users_full_name ON users USING GIN (full_name gin_trgm_ops);
CREATE EXTENSION IF NOT EXISTS pg_trgm;
```
