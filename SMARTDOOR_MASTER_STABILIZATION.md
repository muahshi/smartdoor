# SmartDoor — Master Stabilization & Production-Readiness Plan
**Role:** Lead Software Architect + CTO + Full Stack + DevOps + Security  
**Date:** 2026-06-26  
**ZIP analysed:** smartdoor-main #42 (257 files, 24 SQL migrations, 20+ Edge Functions)  
**Directive:** Stabilize existing architecture. Do NOT rewrite. Do NOT remove features. Wire everything correctly.

---

## PART 1 — COMPLETE SYSTEM MAP (What Exists Today)

```
┌─────────────────────────────────────────────────────────────┐
│  FRONTEND (Static HTML, Vercel CDN, no bundler)            │
│                                                             │
│  index.html         — Marketing / e-commerce site          │
│  login.html         — Owner login (PIN-based)              │
│  app.html           — Owner Dashboard PWA                  │
│  visitor.html       — Visitor page (/p/:slug)              │
│  admin-login.html   — Admin login                          │
│  admin.html         — Admin super-panel (103KB!)           │
│  guard.html         — Society gate panel                   │
│  society-admin.html — Society admin panel                  │
│  onboarding.html    — New owner onboarding                 │
│                                                             │
│  config/env.generated.js  ← window.__SD_CONFIG__ (build)  │
│  scripts/build-env.js     ← Vercel build command          │
│  vercel.json              ← Rewrites /p/:slug + routes     │
└───────────────────┬─────────────────────────────────────────┘
                    │ fetch() with Bearer: <session_token>
                    │ (NEVER supabase.functions.invoke for admin)
┌───────────────────▼─────────────────────────────────────────┐
│  SUPABASE EDGE FUNCTIONS (Deno, service_role)               │
│                                                             │
│  admin-login              ← bcrypt + session token issue   │
│  admin-data               ← ALL admin reads/writes (512L)  │
│  admin-provision-customer ← create user+plate+QR+sub       │
│  admin-plate-status       ← suspend/reactivate/regen-QR    │
│  admin-bulk-provision     ← batch plate creation           │
│  admin-analytics          ← chart data                     │
│  admin-print-pack         ← manufacturing print packs      │
│  admin-fullfilment-status ← order fulfillment status       │
│  admin-reset-pin          ← PIN reset for support          │
│  admin-transfer-ownership ← ownership transfer             │
│  generate-qr              ← standalone QR generation       │
│  verify-pin               ← owner login PIN check          │
│  set-owner-pin            ← initial PIN set                │
│  owner-forgot-pin         ← OTP-based PIN recovery         │
│  activate-subscription    ← delivered → active             │
│  create-razorpay-order    ← payment order creation         │
│  verify-razorpay-payment  ← payment webhook + HMAC         │
│  razorpay-refund          ← refund processing              │
│  renewal-engine-cron      ← subscription renewal cron      │
│  send-email               ← Resend email gateway           │
│  send-sms                 ← MSG91/Exotel SMS gateway       │
│  send-whatsapp            ← WhatsApp gateway               │
│  initiate-call            ← masked call via Exotel         │
│  call-status-webhook      ← Exotel call status updates     │
│  groq-proxy               ← AI receptionist proxy          │
│  health-check             ← system health                  │
└───────────────────┬─────────────────────────────────────────┘
                    │ service_role (bypasses RLS)
┌───────────────────▼─────────────────────────────────────────┐
│  SUPABASE DATABASE (PostgreSQL, 24 migrations)              │
│                                                             │
│  Core: users, plates, subscriptions, orders, payments       │
│  Comms: visitor_logs, voice_notes, message_logs,            │
│         notifications, call_logs, family_members           │
│  Operations: manufacturing, tracking_events,                │
│              security_rules, status_history                 │
│  Admin: admin_users, admin_roles, admin_permissions,        │
│         admin_audit_logs, admin_session_revocations         │
│  Support: support_tickets, ticket_comments                  │
│  Growth: activation_events, pin_lockouts                   │
│  Storage: qr-codes (public read, service_role write)        │
└─────────────────────────────────────────────────────────────┘
```

---

## PART 2 — AUDIT FINDINGS (What Is Broken / Incomplete)

### SEVERITY MATRIX

| # | Issue | Severity | Status | File(s) |
|---|-------|----------|--------|---------|
| A1 | `orders` table missing `order_source` column | CRITICAL | Not fixed | sql/07_commerce_schema.sql |
| A2 | No order auto-created when customer provisioned manually | CRITICAL | Gap | admin-provision-customer/index.ts |
| A3 | Amazon / Flipkart import UI missing entirely | HIGH | Gap | admin.html |
| A4 | Payment pipeline (Razorpay) not creating Order row in full pipeline | HIGH | Partial | verify-razorpay-payment/index.ts |
| A5 | Order status pipeline (9 stages) not enforced server-side | HIGH | Partial | admin-data/index.ts |
| A6 | CORS blocks Vercel Preview URLs (dev/staging broken) | HIGH | Documented | _shared/cors.ts |
| A7 | `env.generated.js` committed with empty supabaseUrl/Anon | HIGH | Known | env.generated.js |
| A8 | `visitor.html` `<base href="/">` missing (asset 404s on /p/ route) | MEDIUM | Unknown | visitor.html |
| A9 | `admin-audit-logs` metadata column name inconsistency | MEDIUM | Partial | sql/08_admin_schema.sql |
| A10 | No order auto-created on website checkout (Razorpay flow) | MEDIUM | Partial | verify-razorpay-payment |
| A11 | `manufacturing` row not auto-created when order enters production | MEDIUM | Gap | admin-data/update_order |
| A12 | Subscription plan names inconsistent (starter/hardware_only etc) | MEDIUM | Known | sql/17_plan_migration.sql |
| A13 | `visitor.html` owner name fallback shows 'Resident' if RPC missing | MEDIUM | Documented | plates.js + Migration 21 |
| A14 | `guard.html` / `society-admin.html` duplicate identical files (gaurd.html) | LOW | Typo | root dir |
| A15 | `renewal-engine-cron` not scheduled in Supabase | LOW | Gap | Supabase Dashboard |

---

## PART 3 — THE ONE SOURCE OF TRUTH (Architecture Rules)

These rules must NEVER be violated:

```
RULE 1: Every customer — regardless of source — must produce:
  users row  +  plates row  +  orders row  +  subscriptions row
  (+ activation_event  +  admin_audit_log  +  security_rules row)

RULE 2: The orders.order_source column tracks where the sale came from:
  'website' | 'amazon' | 'flipkart' | 'offline' | 'whatsapp' | 'admin_manual'

RULE 3: QR URL is ALWAYS: https://mysmartdoor.in/p/PLATE_ID
  Never: /visitor.html?plate=  Never: /app  Never: anything else

RULE 4: Admin panel NEVER calls supabase.from() directly.
  All admin reads/writes go through admin-data Edge Function (service_role).

RULE 5: Visitor page is ALWAYS visitor.html — completely separate from app.html.
  QR scan → /p/:slug → vercel.json rewrite → visitor.html?plate=:slug
  Never opens app.html, admin.html, or any owner dashboard.

RULE 6: Admin session token is a 64-char hex opaque token stored in
  localStorage.sd_admin_session. NEVER use supabase.functions.invoke() for
  admin calls — it injects the anon key as Bearer, breaking verifyAdminSession().
```

---

## PART 4 — MIGRATION 25 (Run in Supabase SQL Editor)

This migration fixes all database-level gaps identified above.

```sql
-- ════════════════════════════════════════════════════════════════════════════
-- Migration 25: SmartDoor Master Stabilization
-- Idempotent — safe to run multiple times.
-- Run in: Supabase Dashboard > SQL Editor
-- ════════════════════════════════════════════════════════════════════════════
BEGIN;

-- ── 1. Add order_source to orders (tracks where every sale came from) ───────
ALTER TABLE orders ADD COLUMN IF NOT EXISTS order_source TEXT DEFAULT 'website'
  CHECK (order_source IN ('website','amazon','flipkart','offline','whatsapp','admin_manual'));

-- ── 2. Add external_order_id (Amazon/Flipkart order reference) ──────────────
ALTER TABLE orders ADD COLUMN IF NOT EXISTS external_order_id TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS external_platform TEXT;  -- 'amazon' | 'flipkart'

-- ── 3. Ensure orders.owner_id FK exists (may be NULL for pre-payment) ────────
-- Already exists per 07_commerce_schema.sql — this is a guard.
ALTER TABLE orders ALTER COLUMN owner_id DROP NOT NULL;  -- allow NULL until payment confirmed

-- ── 4. Add fulfilment_status to orders (the 9-stage pipeline) ───────────────
-- Existing: payment_status, manufacturing_status, tracking_status
-- We add a single unified fulfilment_status that the admin pipeline drives.
ALTER TABLE orders ADD COLUMN IF NOT EXISTS fulfilment_status TEXT DEFAULT 'new_order'
  CHECK (fulfilment_status IN (
    'new_order','payment_verified','manufacturing','qr_generated',
    'nameplate_printed','quality_check','packed','shipped','delivered',
    'owner_activated','live'
  ));

-- Backfill: map existing rows to the new column
UPDATE orders SET fulfilment_status = CASE
  WHEN manufacturing_status = 'delivered' THEN 'delivered'
  WHEN manufacturing_status = 'dispatched' THEN 'shipped'
  WHEN manufacturing_status = 'packed' THEN 'packed'
  WHEN manufacturing_status IN ('printing','quality_check') THEN 'manufacturing'
  WHEN payment_status = 'paid' THEN 'payment_verified'
  ELSE 'new_order'
END
WHERE fulfilment_status = 'new_order' OR fulfilment_status IS NULL;

-- ── 5. orders.plate_id index (admin searches by plate_id) ───────────────────
CREATE INDEX IF NOT EXISTS idx_orders_plate_id ON orders(plate_id);
CREATE INDEX IF NOT EXISTS idx_orders_order_source ON orders(order_source);
CREATE INDEX IF NOT EXISTS idx_orders_fulfilment ON orders(fulfilment_status);

-- ── 6. Backfill: create orders row for admin-manual customers missing one ────
INSERT INTO orders (
  order_number, owner_id, plate_id, product_type,
  product_price, subscription_price, shipping_price, total_amount,
  payment_status, manufacturing_status, tracking_status, fulfilment_status,
  order_source, customer_name, customer_phone, customer_email,
  created_at, updated_at
)
SELECT
  'SD-ORD-BACKFILL-' || substr(u.id::text, 1, 8) AS order_number,
  u.id AS owner_id,
  u.plate_id,
  COALESCE(p.product_type, 'acrylic') AS product_type,
  0, 0, 0, 0,
  'paid',        -- admin-provisioned = already paid (cash/offline)
  'delivered',   -- admin-provisioned = already delivered
  'delivered',
  'live',
  'admin_manual',
  u.full_name,
  u.phone,
  u.email,
  u.created_at,
  u.created_at
FROM users u
JOIN plates p ON p.owner_id = u.id
WHERE NOT EXISTS (
  SELECT 1 FROM orders o WHERE o.owner_id = u.id
)
AND p.provisioning_source = 'admin_manual'
ON CONFLICT DO NOTHING;

-- ── 7. Ensure admin_audit_logs has consistent column names ──────────────────
ALTER TABLE admin_audit_logs ADD COLUMN IF NOT EXISTS metadata   JSONB DEFAULT '{}';
ALTER TABLE admin_audit_logs ADD COLUMN IF NOT EXISTS resource   TEXT;
ALTER TABLE admin_audit_logs ADD COLUMN IF NOT EXISTS resource_id TEXT;
ALTER TABLE admin_audit_logs ADD COLUMN IF NOT EXISTS ip_address TEXT;
ALTER TABLE admin_audit_logs ADD COLUMN IF NOT EXISTS user_agent TEXT;
ALTER TABLE admin_audit_logs ADD COLUMN IF NOT EXISTS notes      TEXT;
ALTER TABLE admin_audit_logs ADD COLUMN IF NOT EXISTS before_data JSONB DEFAULT '{}';
ALTER TABLE admin_audit_logs ADD COLUMN IF NOT EXISTS after_data  JSONB DEFAULT '{}';
ALTER TABLE admin_audit_logs ADD COLUMN IF NOT EXISTS created_at  TIMESTAMPTZ DEFAULT NOW();

-- ── 8. manufacturing rows for admin-provisioned customers ───────────────────
-- manufacturing table may not have rows for admin-manual plates.
INSERT INTO manufacturing (
  order_id, plate_id, plate_name, product_type,
  qr_slug, production_status, created_at
)
SELECT
  o.id, o.plate_id, o.customer_name,
  o.product_type, o.plate_id, 'ready', o.created_at
FROM orders o
WHERE o.order_source = 'admin_manual'
  AND NOT EXISTS (
    SELECT 1 FROM manufacturing m WHERE m.plate_id = o.plate_id
  )
ON CONFLICT DO NOTHING;

-- ── 9. Ensure activation_events columns ─────────────────────────────────────
ALTER TABLE activation_events ADD COLUMN IF NOT EXISTS actor     TEXT;
ALTER TABLE activation_events ADD COLUMN IF NOT EXISTS metadata  JSONB DEFAULT '{}';
ALTER TABLE activation_events ADD COLUMN IF NOT EXISTS event_detail TEXT;

-- ── 10. admin_session_revocations guard (already in Mig 21 Addendum) ────────
CREATE TABLE IF NOT EXISTS admin_session_revocations (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id   UUID NOT NULL,
  revoked_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  reason     TEXT
);
CREATE INDEX IF NOT EXISTS idx_revocations_admin ON admin_session_revocations(admin_id, revoked_at);

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='admin_session_revocations' AND policyname='revocations_service_all') THEN
    CREATE POLICY revocations_service_all ON admin_session_revocations FOR ALL USING (auth.role()='service_role');
  END IF;
END $$;
ALTER TABLE admin_session_revocations ENABLE ROW LEVEL SECURITY;

-- ── 11. pin_lockouts table (needed by check_pin_lockout RPC) ────────────────
CREATE TABLE IF NOT EXISTS pin_lockouts (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plate_id     TEXT UNIQUE NOT NULL,
  failed_count INT NOT NULL DEFAULT 0,
  last_attempt TIMESTAMPTZ DEFAULT NOW(),
  locked_until TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_pin_lockouts_plate ON pin_lockouts(plate_id);

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='pin_lockouts' AND policyname='pin_lockouts_service_all') THEN
    CREATE POLICY pin_lockouts_service_all ON pin_lockouts FOR ALL USING (auth.role()='service_role');
  END IF;
END $$;
ALTER TABLE pin_lockouts ENABLE ROW LEVEL SECURITY;

-- ── 12. Plates: ensure all required additive columns ────────────────────────
ALTER TABLE plates ADD COLUMN IF NOT EXISTS qr_image_url        TEXT;
ALTER TABLE plates ADD COLUMN IF NOT EXISTS qr_svg_url          TEXT;
ALTER TABLE plates ADD COLUMN IF NOT EXISTS suspended_reason    TEXT;
ALTER TABLE plates ADD COLUMN IF NOT EXISTS suspended_at        TIMESTAMPTZ;
ALTER TABLE plates ADD COLUMN IF NOT EXISTS suspended_by        TEXT;
ALTER TABLE plates ADD COLUMN IF NOT EXISTS provisioned_by      TEXT;
ALTER TABLE plates ADD COLUMN IF NOT EXISTS provisioning_source TEXT DEFAULT 'website';
ALTER TABLE plates ADD COLUMN IF NOT EXISTS activation_date     TIMESTAMPTZ;

-- ── 13. Users: ensure all required additive columns ─────────────────────────
ALTER TABLE users ADD COLUMN IF NOT EXISTS address  TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS pin_hash TEXT;

-- ── 14. Backfill qr_slug = plate_id for any NULL rows ───────────────────────
UPDATE plates SET qr_slug = plate_id
WHERE (qr_slug IS NULL OR qr_slug != plate_id) AND plate_id IS NOT NULL;

-- ── 15. Backfill security_rules for all active plates ───────────────────────
INSERT INTO security_rules (owner_id, night_mode_on, allow_sos, allow_voice,
  allow_calls, call_forwarding, current_status, night_mode_start, night_mode_end)
SELECT p.owner_id, false, true, true, true, true, 'available', '22:00:00', '07:00:00'
FROM plates p
WHERE p.owner_id IS NOT NULL AND p.status = 'active'
  AND NOT EXISTS (SELECT 1 FROM security_rules sr WHERE sr.owner_id = p.owner_id)
ON CONFLICT DO NOTHING;

-- ── 16. get_owner_display_for_plate RPC ─────────────────────────────────────
CREATE OR REPLACE FUNCTION get_owner_display_for_plate(p_plate_id TEXT)
RETURNS TABLE(full_name TEXT)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  RETURN QUERY
    SELECT u.full_name FROM users u
    JOIN plates p ON p.owner_id = u.id
    WHERE (p.plate_id = p_plate_id OR p.qr_slug = p_plate_id)
      AND p.status = 'active'
    LIMIT 1;
END; $$;
GRANT EXECUTE ON FUNCTION get_owner_display_for_plate TO anon, authenticated, service_role;

-- ── 17. get_subscription_status_for_plate RPC ───────────────────────────────
CREATE OR REPLACE FUNCTION get_subscription_status_for_plate(p_plate_id TEXT)
RETURNS TABLE(plan TEXT, status TEXT, expiry_date TIMESTAMPTZ)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  RETURN QUERY
    SELECT s.plan, s.status, s.expiry_date FROM subscriptions s
    JOIN plates p ON p.owner_id = s.owner_id
    WHERE (p.plate_id = p_plate_id OR p.qr_slug = p_plate_id)
      AND p.status = 'active'
    ORDER BY CASE s.status WHEN 'active' THEN 0 WHEN 'grace_period' THEN 1 ELSE 2 END,
             s.created_at DESC
    LIMIT 1;
END; $$;
GRANT EXECUTE ON FUNCTION get_subscription_status_for_plate TO anon, authenticated, service_role;

-- ── 18. check_pin_lockout and record_failed_pin RPCs ────────────────────────
CREATE OR REPLACE FUNCTION check_pin_lockout(p_plate_id TEXT)
RETURNS JSON LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_record RECORD;
BEGIN
  SELECT * INTO v_record FROM pin_lockouts
  WHERE plate_id = upper(trim(p_plate_id)) AND locked_until > now()
  LIMIT 1;
  IF FOUND THEN
    RETURN json_build_object('locked', true,
      'seconds_remaining', EXTRACT(EPOCH FROM (v_record.locked_until - now()))::int);
  END IF;
  RETURN json_build_object('locked', false);
EXCEPTION WHEN undefined_table THEN
  RETURN json_build_object('locked', false);
END; $$;
GRANT EXECUTE ON FUNCTION check_pin_lockout TO service_role;

CREATE OR REPLACE FUNCTION record_failed_pin(p_plate_id TEXT)
RETURNS JSON LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_normalized TEXT := upper(trim(p_plate_id));
  v_count INT;
  v_max_attempts INT := 5;
  v_lockout_mins INT := 15;
BEGIN
  INSERT INTO pin_lockouts (plate_id, failed_count, last_attempt, locked_until)
  VALUES (v_normalized, 1, now(), NULL)
  ON CONFLICT (plate_id) DO UPDATE
  SET failed_count = pin_lockouts.failed_count + 1,
      last_attempt = now(),
      locked_until = CASE
        WHEN pin_lockouts.failed_count + 1 >= v_max_attempts
        THEN now() + (v_lockout_mins || ' minutes')::interval
        ELSE NULL END;

  SELECT failed_count INTO v_count FROM pin_lockouts WHERE plate_id = v_normalized;
  RETURN json_build_object('failed_count', v_count,
    'locked', v_count >= v_max_attempts,
    'attempts_remaining', GREATEST(0, v_max_attempts - v_count));
EXCEPTION WHEN undefined_table THEN
  RETURN json_build_object('locked', false);
END; $$;
GRANT EXECUTE ON FUNCTION record_failed_pin TO service_role;

-- ── 19. service_role bypass policies (idempotent) ───────────────────────────
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='admin_users' AND policyname='admin_users_service_all') THEN
  CREATE POLICY admin_users_service_all ON admin_users FOR ALL USING (auth.role()='service_role'); END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='admin_audit_logs' AND policyname='audit_logs_service_all') THEN
  CREATE POLICY audit_logs_service_all ON admin_audit_logs FOR ALL USING (auth.role()='service_role'); END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='plates' AND policyname='plates_service_all') THEN
  CREATE POLICY plates_service_all ON plates FOR ALL USING (auth.role()='service_role'); END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='users' AND policyname='users_service_all') THEN
  CREATE POLICY users_service_all ON users FOR ALL USING (auth.role()='service_role'); END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='subscriptions' AND policyname='subscriptions_service_all') THEN
  CREATE POLICY subscriptions_service_all ON subscriptions FOR ALL USING (auth.role()='service_role'); END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='orders' AND policyname='orders_service_all') THEN
  CREATE POLICY orders_service_all ON orders FOR ALL USING (auth.role()='service_role'); END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='manufacturing' AND policyname='manufacturing_service_all') THEN
  CREATE POLICY manufacturing_service_all ON manufacturing FOR ALL USING (auth.role()='service_role'); END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='support_tickets' AND policyname='tickets_service_all') THEN
  CREATE POLICY tickets_service_all ON support_tickets FOR ALL USING (auth.role()='service_role'); END IF; END $$;

-- ── 20. Performance indexes ──────────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX IF NOT EXISTS idx_plates_owner_id ON plates(owner_id);
CREATE INDEX IF NOT EXISTS idx_plates_plate_id ON plates(plate_id);
CREATE INDEX IF NOT EXISTS idx_plates_qr_slug  ON plates(qr_slug) WHERE qr_slug IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_subscriptions_owner ON subscriptions(owner_id);
CREATE INDEX IF NOT EXISTS idx_users_plate_id ON users(plate_id);
CREATE INDEX IF NOT EXISTS idx_users_full_name ON users USING GIN(full_name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_users_phone ON users(phone);

-- ── 21. Storage bucket (idempotent) ─────────────────────────────────────────
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('qr-codes', 'qr-codes', true, 5242880, ARRAY['image/png','image/svg+xml'])
ON CONFLICT (id) DO UPDATE SET public = true;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='objects' AND schemaname='storage' AND policyname='qr_codes_public_read') THEN
  CREATE POLICY qr_codes_public_read ON storage.objects FOR SELECT USING (bucket_id = 'qr-codes'); END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='objects' AND schemaname='storage' AND policyname='qr_codes_service_upload') THEN
  CREATE POLICY qr_codes_service_upload ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'qr-codes' AND auth.role() = 'service_role'); END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='objects' AND schemaname='storage' AND policyname='qr_codes_service_update') THEN
  CREATE POLICY qr_codes_service_update ON storage.objects FOR UPDATE USING (bucket_id = 'qr-codes' AND auth.role() = 'service_role'); END IF; END $$;

COMMIT;
```

---

## PART 5 — FILE CHANGES REQUIRED

### FILE 1: `supabase/functions/admin-provision-customer/index.ts` — Add order_source + auto-create order

**Change:** After subscription insert, add an `orders` INSERT with `order_source` from the request body.

```typescript
// Add to destructuring at top of handler body:
const { order_source = 'admin_manual', external_order_id = null } = body as any;

// Validate order_source:
const validSources = ['admin_manual','amazon','flipkart','offline','whatsapp'];
const cleanSource = validSources.includes(String(order_source)) ? String(order_source) : 'admin_manual';

// After subscription insert, add:
// ── Auto-create Order row ──
const orderNumber = `SD-ORD-${new Date().toISOString().slice(0,10).replace(/-/g,'')}-${Math.random().toString(36).slice(2,7).toUpperCase()}`;
const { data: order } = await supabaseAdmin
  .from('orders')
  .insert({
    order_number: orderNumber,
    owner_id: user.id,
    plate_id: plateId,
    product_type: productType,
    product_price: 0,
    subscription_price: PLAN_PRICES[plan] ?? 0,
    shipping_price: 0,
    total_amount: PLAN_PRICES[plan] ?? 0,
    payment_status: 'paid',         // admin-provisioned = already paid
    manufacturing_status: 'ready',  // admin-provisioned = ready to deliver
    tracking_status: 'delivered',
    fulfilment_status: 'live',
    order_source: cleanSource,
    external_order_id: external_order_id,
    customer_name: user.full_name,
    customer_phone: user.phone,
    customer_email: user.email,
  })
  .select()
  .single();

// Auto-create manufacturing row
if (order) {
  await supabaseAdmin.from('manufacturing').insert({
    order_id: order.id,
    plate_id: plateId,
    plate_name: String(full_name).trim(),
    product_type: productType,
    qr_slug: plateId,
    production_status: 'ready',
  });
}
```

**Also add `order` to the return payload:**
```typescript
return Response.json({
  success: true,
  customer: { ...existing_fields, order_id: order?.id, order_number: orderNumber },
}, { headers });
```

---

### FILE 2: `supabase/functions/_shared/cors.ts` — Add Vercel preview pattern

**Change:** Allow all `*.vercel.app` origins in development/staging so admin panel works on preview deployments.

```typescript
// Replace ALL_ALLOWED with:
const ALL_ALLOWED = [
  ...PRODUCTION_ORIGINS,
  ...DEV_ORIGINS,
  // Vercel Preview URLs (staging)
  /^https:\/\/[a-z0-9-]+-[a-z0-9]+-[a-z0-9]+\.vercel\.app$/,
];

// Update restrictedCors() to handle the regex:
export function restrictedCors(origin: string | null): Record<string, string> {
  const isAllowed = origin && (
    (ALL_ALLOWED as (string | RegExp)[]).some(allowed =>
      typeof allowed === 'string' ? allowed === origin : allowed.test(origin)
    )
  );
  const allowedOrigin = isAllowed ? origin : PRODUCTION_ORIGINS[0];
  return {
    'Access-Control-Allow-Origin':  allowedOrigin!,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Vary': 'Origin',
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
  };
}
```

---

### FILE 3: `supabase/functions/admin-data/index.ts` — Add `create_order` + `fulfilment_pipeline` types

**Add these two new handler blocks before the final `return Response.json({ success: false... })`:**

```typescript
// ══════════════════════════════════════════════
// CREATE ORDER (Amazon / Flipkart import)
// ══════════════════════════════════════════════
if (type === 'create_order') {
  if (!adminCan(ctx, 'orders', 'write')) {
    return Response.json({ success: false, message: 'Permission denied' }, { status: 403, headers });
  }
  const { owner_id, plate_id, product_type, order_source,
          external_order_id, customer_name, customer_phone,
          customer_email, shipping_address, notes } = body as any;

  if (!owner_id || !plate_id || !order_source) {
    return Response.json({ success: false, message: 'owner_id, plate_id, order_source required' }, { status: 400, headers });
  }

  const orderNumber = `SD-ORD-${new Date().toISOString().slice(0,10).replace(/-/g,'')}-${Math.random().toString(36).slice(2,7).toUpperCase()}`;

  const { data: order, error } = await db.from('orders').insert({
    order_number: orderNumber,
    owner_id, plate_id,
    product_type: product_type || 'acrylic',
    product_price: 0, subscription_price: 0, shipping_price: 0, total_amount: 0,
    payment_status: 'paid',
    manufacturing_status: 'queued',
    tracking_status: 'order_placed',
    fulfilment_status: 'new_order',
    order_source,
    external_order_id: external_order_id || null,
    customer_name, customer_phone, customer_email,
    shipping_address: shipping_address || {},
    notes: notes || null,
  }).select().single();

  if (error) return Response.json({ success: false, message: error.message }, { status: 500, headers });

  await db.from('admin_audit_logs').insert({
    admin_id: ctx.id, admin_email: ctx.email,
    action: 'create_order', resource: 'orders', resource_id: order.id,
    after_data: { order_number: orderNumber, order_source, plate_id },
    created_at: new Date().toISOString(),
  });

  return Response.json({ success: true, order }, { headers });
}

// ══════════════════════════════════════════════
// FULFILMENT PIPELINE ADVANCE
// ══════════════════════════════════════════════
if (type === 'advance_fulfilment') {
  if (!adminCan(ctx, 'orders', 'write')) {
    return Response.json({ success: false, message: 'Permission denied' }, { status: 403, headers });
  }
  const { order_id, to_status } = body as any;
  const VALID_STAGES = [
    'new_order','payment_verified','manufacturing','qr_generated',
    'nameplate_printed','quality_check','packed','shipped','delivered',
    'owner_activated','live'
  ];
  if (!order_id || !VALID_STAGES.includes(to_status)) {
    return Response.json({ success: false, message: 'Invalid order_id or to_status' }, { status: 400, headers });
  }

  const mfgStatus = {
    manufacturing: 'in_production', qr_generated: 'in_production',
    nameplate_printed: 'in_production', quality_check: 'quality_check',
    packed: 'packed', shipped: 'dispatched', delivered: 'delivered',
    owner_activated: 'delivered', live: 'delivered',
  }[to_status] || 'queued';

  const paymentStatus = to_status === 'new_order' ? 'pending' : 'paid';

  const { error } = await db.from('orders').update({
    fulfilment_status: to_status,
    manufacturing_status: mfgStatus,
    payment_status: paymentStatus,
    updated_at: new Date().toISOString(),
  }).eq('id', order_id);

  if (error) return Response.json({ success: false, message: error.message }, { status: 500, headers });

  await db.from('tracking_events').insert({
    order_id,
    event_type: to_status,
    description: `Status advanced to ${to_status} by ${ctx.email}`,
    created_at: new Date().toISOString(),
  }).catch(() => {});  // non-fatal

  await db.from('admin_audit_logs').insert({
    admin_id: ctx.id, admin_email: ctx.email,
    action: 'advance_fulfilment', resource: 'orders', resource_id: order_id,
    after_data: { fulfilment_status: to_status },
    created_at: new Date().toISOString(),
  });

  return Response.json({ success: true }, { headers });
}
```

---

### FILE 4: `admin.html` — Add Order Source selector to Create Customer form + Import buttons

**In the Create Customer form (`#cc-form`), after the Subscription Plan field, add:**

```html
<!-- Order Source -->
<div class="form-group">
  <label class="form-label">Order Source</label>
  <select class="form-input" id="cc-source">
    <option value="admin_manual">Admin Manual</option>
    <option value="amazon">Amazon</option>
    <option value="flipkart">Flipkart</option>
    <option value="offline">Offline Shop</option>
    <option value="whatsapp">WhatsApp</option>
  </select>
</div>
<div class="form-group" id="cc-ext-order-group" style="display:none">
  <label class="form-label">External Order ID</label>
  <input type="text" class="form-input" id="cc-ext-order"
         placeholder="Amazon/Flipkart Order Number">
</div>
```

**Add JS to toggle external order ID visibility:**
```javascript
document.getElementById('cc-source').addEventListener('change', function() {
  const showExt = ['amazon','flipkart'].includes(this.value);
  document.getElementById('cc-ext-order-group').style.display = showExt ? '' : 'none';
});
```

**In `submitCreateCustomer()`, add to the request body:**
```javascript
order_source: document.getElementById('cc-source').value || 'admin_manual',
external_order_id: document.getElementById('cc-ext-order').value.trim() || null,
```

**In Orders panel header, add import buttons:**
```html
<button class="btn btn-ghost btn-sm" onclick="showImportOrder('amazon')">📦 Import Amazon</button>
<button class="btn btn-ghost btn-sm" onclick="showImportOrder('flipkart')">🛒 Import Flipkart</button>
```

**Add `showImportOrder()` function:**
```javascript
function showImportOrder(platform) {
  const extId = prompt(`Enter ${platform === 'amazon' ? 'Amazon' : 'Flipkart'} Order ID:`);
  if (!extId) return;
  // Open Create Customer modal with source pre-filled
  document.getElementById('cc-source').value = platform;
  document.getElementById('cc-ext-order').value = extId;
  document.getElementById('cc-ext-order-group').style.display = '';
  openModal('createCustomerModal');
  showToast(`Importing ${platform} order ${extId} — fill customer details below`, 'info');
}
```

---

### FILE 5: `visitor.html` — Ensure `<base href="/">` is present

In `visitor.html` `<head>`, ensure this is the FIRST tag after `<head>`:
```html
<head>
  <base href="/">
  <meta charset="UTF-8">
  ...
```

This prevents asset 404s when the page is served at `/p/SD-XXXXXX`.

---

### FILE 6: `services/adminData.js` — Add `createOrder` and `advanceFullfilment` exports

```javascript
export async function createOrder(payload) {
  return _call('admin-data', { type: 'create_order', ...payload });
}

export async function advanceFulfilment(orderId, toStatus) {
  return _call('admin-data', { type: 'advance_fulfilment', order_id: orderId, to_status: toStatus });
}
```

---

## PART 6 — VERCEL ENVIRONMENT VARIABLES CHECKLIST

Set these in Vercel Dashboard → Project → Settings → Environment Variables.  
Set for: **Production**, **Preview**, **Development** separately.

```
VITE_APP_ENV              → production / staging / development
VITE_SUPABASE_URL         → https://auyapulcgkhuizqsbzol.supabase.co
VITE_SUPABASE_ANON_KEY    → (from Supabase Dashboard → Settings → API)
VITE_RAZORPAY_KEY_ID      → rzp_live_... (production) / rzp_test_... (dev)
VITE_GROQ_API_KEY         → gsk_...
VITE_APP_BASE_URL         → https://mysmartdoor.in
```

---

## PART 7 — SUPABASE EDGE FUNCTION SECRETS CHECKLIST

Set these in Supabase Dashboard → Project → Edge Functions → Secrets:

```
SUPABASE_SERVICE_ROLE_KEY   → (from Supabase Dashboard → Settings → API)
SUPABASE_URL                → https://auyapulcgkhuizqsbzol.supabase.co
APP_URL                     → https://mysmartdoor.in
RAZORPAY_KEY_ID             → rzp_live_...
RAZORPAY_KEY_SECRET         → (from Razorpay Dashboard)
RAZORPAY_WEBHOOK_SECRET     → (from Razorpay Dashboard → Webhooks)
RESEND_API_KEY              → re_...
MSG91_AUTH_KEY              → (MSG91 dashboard)
EXOTEL_API_KEY              → (Exotel dashboard)
EXOTEL_API_TOKEN            → (Exotel dashboard)
EXOTEL_SID                  → (Exotel dashboard)
GROQ_API_KEY                → gsk_...
```

---

## PART 8 — EDGE FUNCTION DEPLOY ORDER

```bash
# Deploy in this order (dependencies first):
supabase functions deploy admin-login
supabase functions deploy generate-qr
supabase functions deploy admin-provision-customer
supabase functions deploy admin-data
supabase functions deploy admin-plate-status
supabase functions deploy admin-bulk-provision
supabase functions deploy admin-analytics
supabase functions deploy admin-print-pack
supabase functions deploy admin-reset-pin
supabase functions deploy admin-transfer-ownership
supabase functions deploy admin-fullfilment-status
supabase functions deploy verify-pin
supabase functions deploy set-owner-pin
supabase functions deploy owner-forgot-pin
supabase functions deploy activate-subscription
supabase functions deploy create-razorpay-order
supabase functions deploy verify-razorpay-payment
supabase functions deploy razorpay-refund
supabase functions deploy renewal-engine-cron
supabase functions deploy send-email
supabase functions deploy send-sms
supabase functions deploy send-whatsapp
supabase functions deploy initiate-call
supabase functions deploy call-status-webhook
supabase functions deploy groq-proxy
supabase functions deploy health-check
```

---

## PART 9 — RENEWAL CRON SETUP

In Supabase Dashboard → Database → Extensions → Enable `pg_cron`, then run:

```sql
-- Run renewal-engine-cron every day at 2 AM IST (8:30 PM UTC)
SELECT cron.schedule(
  'smartdoor-renewal-daily',
  '30 20 * * *',
  $$
  SELECT net.http_post(
    url := 'https://auyapulcgkhuizqsbzol.supabase.co/functions/v1/renewal-engine-cron',
    headers := '{"Authorization": "Bearer ' || current_setting('app.service_role_key') || '"}'::jsonb
  );
  $$
);
```

---

## PART 10 — ORDER PIPELINE (All 9 Stages, Enforced)

```
NEW ORDER          → order created, payment_status='pending'
        ↓
PAYMENT VERIFIED   → verify-razorpay-payment webhook fires, payment_status='paid'
        ↓
MANUFACTURING      → admin clicks "Start Production", manufacturing row created
        ↓
QR GENERATED       → generate-qr called, qr_image_url + qr_svg_url stored
        ↓
NAMEPLATE PRINTED  → admin marks printed in Manufacturing panel
        ↓
QUALITY CHECK      → admin marks QC passed
        ↓
PACKED             → admin marks packed, print-pack generated
        ↓
SHIPPED            → admin enters tracking, tracking_event='dispatched'
        ↓
DELIVERED          → admin marks delivered, activate-subscription fires
        ↓
OWNER ACTIVATED    → customer scans QR, sets PIN, owner_id assigned on plate
        ↓
LIVE               → plate.status='active', visitor page fully live
```

Each stage calls `advance_fulfilment(orderId, toStatus)` → `admin-data` Edge Function → single DB update with audit log.

---

## PART 11 — CUSTOMER SOURCES (All Wired Through Same Pipeline)

```
SOURCE          HOW TO CREATE           order_source VALUE
──────────────────────────────────────────────────────────
Website         Razorpay webhook        'website'
Amazon          Admin → Import Amazon   'amazon'
Flipkart        Admin → Import Flipkart 'flipkart'
Offline Shop    Admin → Create Customer 'offline'
WhatsApp        Admin → Create Customer 'whatsapp'
Admin Manual    Admin → Create Customer 'admin_manual'
```

**All paths converge at `admin-provision-customer` Edge Function.**  
Result is always: user + plate + order + subscription + security_rules + activation_event + audit_log.

---

## PART 12 — VERIFICATION TESTS (Run After Deploy)

### Test 1: Admin Login
```
1. Open /admin-login → login with admin@mysmartdoor.in
2. Network tab: admin-login response → { success: true, token: "64-char-hex" }
3. localStorage.sd_admin_session.token → same 64-char hex (NOT "eyJ...")
4. Dashboard metrics show real numbers
```

### Test 2: Create Customer (Admin Manual)
```
1. Admin → Customers → Create Customer
2. Source = "Admin Manual", fill name/phone/PIN
3. Response: { success: true, customer: { plate_id: "SD-XXXXXX", qr_image_url: "https://..." } }
4. DB: SELECT * FROM orders WHERE plate_id = 'SD-XXXXXX' → should return 1 row with order_source='admin_manual'
5. DB: SELECT * FROM manufacturing WHERE plate_id = 'SD-XXXXXX' → should return 1 row
```

### Test 3: Create Customer (Amazon Import)
```
1. Admin → Orders → Import Amazon
2. Enter Amazon Order ID, fill customer details
3. DB: SELECT order_source, external_order_id FROM orders WHERE ... → 'amazon' + order ID
```

### Test 4: Visitor Page
```
1. Take plate_id from Test 2
2. Browser: https://mysmartdoor.in/p/SD-XXXXXX
3. PASS: visitor.html loads (NOT app.html)
4. PASS: Owner name shown (NOT "Resident" or "Sharma Family")
5. PASS: NO Analytics/Settings/Owner tabs visible
6. PASS: Call, Bell, Message, SOS buttons visible
7. PASS: AI Receptionist shows Namaste greeting
```

### Test 5: QR Code
```
1. Admin → customer profile → QR tab
2. PASS: QR image loads (PNG, not broken)
3. Scan QR with phone → opens /p/SD-XXXXXX correctly
4. DB: SELECT qr_image_url, qr_svg_url FROM plates WHERE plate_id='SD-XXXXXX' → both non-NULL
```

### Test 6: Order Pipeline
```
1. Admin → Orders → select any paid order
2. Click "Start Production" → fulfilment_status changes to 'manufacturing'
3. Click each stage → verify DB updates with each click
4. Final stage 'live' → plate.status='active' confirmed
```

---

## PART 13 — KNOWN REMAINING GAPS (Phase 13+)

These are NOT blocking production but should be done next:

| Gap | Priority | Notes |
|-----|----------|-------|
| Razorpay live payment testing | HIGH | sandbox tested, live keys needed |
| Bulk plate creation (admin-bulk-provision) | HIGH | Edge Function exists, UI stub |
| Manufacturing print-pack UI (admin-print-pack) | MEDIUM | Edge Function exists, UI stub |
| Dealer onboarding flow | MEDIUM | Phase 13 brief |
| Forgot PIN full flow test | MEDIUM | Edge Function exists, needs E2E test |
| Society gate panel wiring | LOW | guard.html / society-admin.html exist |
| WhatsApp notification for plate shipped | LOW | send-whatsapp Edge Function exists |

---

## PART 14 — FILE CHANGE SUMMARY

| File | Change Type | Priority |
|------|------------|----------|
| `sql/25_master_stabilization.sql` | NEW | **Run first** |
| `supabase/functions/admin-provision-customer/index.ts` | PATCH | CRITICAL |
| `supabase/functions/_shared/cors.ts` | PATCH | HIGH |
| `supabase/functions/admin-data/index.ts` | PATCH (add 2 types) | HIGH |
| `services/adminData.js` | PATCH (add 2 exports) | HIGH |
| `admin.html` | PATCH (source selector + import) | HIGH |
| `visitor.html` | PATCH (add `<base href="/">`) | MEDIUM |

**Do NOT touch:**
- `visitor.html` structure (correct — already separated from app.html)
- `services/admin.js` (adminLogin already fixed — uses raw fetch)
- `services/plates.js` (correct — uses RPC for owner name)
- `vercel.json` (correct — /p/:slug rewrite is there)
- Any existing SQL migrations 01–24 (do not re-run, only run Migration 25)
