# SmartDoor — Phase 13 Security Audit Report
**Audited:** 2026-06-21  
**Scope:** Admin Edge Functions — `admin-login`, `admin-provision-customer`, `admin-reset-pin`, `admin-plate-status`, `admin-transfer-ownership`  
**Auditor:** Phase 13 Production Audit

---

## SUMMARY

| Area | Status | Severity |
|------|--------|----------|
| RBAC enforcement | ✅ PASS | — |
| Dealer cannot access super_admin actions | ✅ PASS | — |
| Support cannot transfer ownership | ✅ PASS | — |
| JWT/session validation on every call | ✅ PASS | — |
| service_role key never exposed to frontend | ✅ PASS | — |
| No direct DB writes from client | ✅ PASS | — |
| Brute-force lockout | ✅ PASS | — |
| CORS — admin functions restricted | ✅ PASS | — |
| 2FA on login | ✅ PASS (optional TOTP per user) | — |
| Token stored hashed in DB | ✅ PASS | — |
| Session revocation list | ✅ PASS | — |
| Constant-time auth on invalid user | ✅ PASS | — |
| CORS allows localhost in dev | ⚠️ WARN | Low |
| Admin session in localStorage | ⚠️ WARN | Low |
| `ownership_transfer` RBAC key not set for dealer | ✅ PASS (dealer has no ownership_transfer perm) | — |
| `admin_session_revocations` table may be missing | ⚠️ ACTION REQUIRED | Medium |

---

## FINDING 1 — RBAC IS NOT BYPASSABLE ✅

**File:** `supabase/functions/_shared/adminAuth.ts`

Every admin Edge Function calls `verifyAdminSession()` server-side using the `service_role` key. The raw Bearer token from the client is SHA-256 hashed before DB lookup — the stored value is the hash, never the raw token. `adminCan()` checks the `admin_roles.permissions` JSONB, enforcing resource+action granularity. The wildcard `"*"` is only granted to `super_admin`.

**Verdict:** Bypass is not possible. Client-side `requireAdminAuth()` in `services/admin.js` is clearly documented as UI-only gating.

---

## FINDING 2 — DEALER CANNOT ACCESS SUPER_ADMIN ACTIONS ✅

**Dealer permissions** (from `sql/15_admin_provisioning_schema.sql`):
```json
{"customers":["read","write"],"plates":["read","write"],"qr":["read","write"],"pin_reset":["write"],"activation_resend":["write"]}
```

**Super-admin-only actions checked:**
- `admin-transfer-ownership` → requires `adminCan(ctx, 'ownership_transfer', 'write')` — **Dealer does NOT have this. Returns 403.**
- `admin-plate-status` → requires `adminCan(ctx, 'plates', 'write')` — Dealer HAS `plates.write` so can suspend/reactivate plates. This matches the spec (dealers install plates).

**Verdict:** Dealer is correctly blocked from ownership transfer. Plate status access for dealers is intentional.

---

## FINDING 3 — SUPPORT CANNOT TRANSFER OWNERSHIP ✅

**Support permissions** (after Phase 15 migration):
```json
{"customers":["read"],"orders":["read"],"support":["read","write"],"communication":["read"],"plates":["read"],"pin_reset":["write"],"activation_resend":["write"]}
```

Support has `ownership_transfer` nowhere in their permissions. `admin-transfer-ownership` checks `adminCan(ctx, 'ownership_transfer', 'write')` → returns 403 for support role.

**Verdict:** Correctly blocked. ✅

---

## FINDING 4 — JWT/SESSION VALIDATION IS ENFORCED ✅

**`verifyAdminSession()` performs these checks in order:**
1. Extract Bearer token from Authorization header
2. SHA-256 hash the token
3. Look up `admin_users` where `session_token = hash`
4. Verify `is_active = true`
5. Verify `session_exp > NOW()` (8-hour window)
6. Check `admin_session_revocations` for mid-session disabling

All five layers must pass. If any fails, returns `null` → caller returns 401.

**Verdict:** Session validation is solid and layered. ✅

---

## FINDING 5 — SERVICE_ROLE NEVER EXPOSED TO FRONTEND ✅

`getServiceClient()` reads `SUPABASE_SERVICE_ROLE_KEY` from `Deno.env` — available only inside Edge Functions, never shipped to browser. The frontend (`services/adminProvisioning.js`) only calls `supabase.functions.invoke()` with the anon key. All service_role writes happen inside the Edge Function boundary.

**Verdict:** Clean separation. ✅

---

## FINDING 6 — NO DIRECT DB WRITES FROM CLIENT ✅

Reviewed `services/adminProvisioning.js`: every mutation (`createCustomer`, `resetPin`, `transferOwnership`, `suspendPlate`, `reactivatePlate`) routes through an Edge Function. The anon-key client is used only to invoke functions, never to call `.from('users').update(...)` or similar directly. RLS on all admin tables (`admin_users`, `admin_roles`, `admin_audit_logs`, `plates`) blocks anon + authenticated writes anyway.

**Verdict:** Clean. No client-side DB mutations. ✅

---

## FINDING 7 — BRUTE FORCE PROTECTION ✅

`admin-login` has two layers:
1. **Edge-local in-memory rate limit**: 8 attempts per 60 seconds per email (covers distributed attacks within one Edge Function instance)
2. **DB-backed `pin_lockouts` table**: keyed `ADMIN:<email>` — 5 failures → 15-minute lockout, shared across Edge instances

Constant-time dummy bcrypt compare on unknown email prevents user enumeration.

**Verdict:** Solid. ✅

---

## FINDING 8 ⚠️ — `admin_session_revocations` TABLE MAY BE MISSING

**Severity: Medium**

`verifyAdminSession()` queries `admin_session_revocations` but this table is not created in any migration file (01–15). If the table doesn't exist, every admin session verification will throw a PostgreSQL error and return `null`, **locking out all admin users**.

**Fix — run this migration before deployment:**

```sql
CREATE TABLE IF NOT EXISTS admin_session_revocations (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id    UUID NOT NULL REFERENCES admin_users(id) ON DELETE CASCADE,
  revoked_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reason      TEXT -- 'password_changed' | 'admin_disabled' | 'manual_logout' | 'security'
);
CREATE INDEX IF NOT EXISTS idx_session_revocations_admin ON admin_session_revocations(admin_id, revoked_at DESC);
ALTER TABLE admin_session_revocations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin_session_revocations_no_public_access"
  ON admin_session_revocations FOR ALL TO anon, authenticated USING (false);
```

**Included in `sql/16_phase13_schema.sql`.**

---

## FINDING 9 ⚠️ — LOCALHOST IN CORS WHITELIST (Low)

**Severity: Low**

`_shared/cors.ts` includes `http://localhost:3000` and `http://127.0.0.1:5500` in `ALL_ALLOWED`. On production Vercel these are irrelevant (requests from these origins won't reach the prod Supabase project), but it's good hygiene to remove them or gate behind `Deno.env.get('ENVIRONMENT') === 'development'`.

**Recommendation:** Remove dev origins from `cors.ts` before go-live, or use an env variable.

---

## FINDING 10 ⚠️ — ADMIN SESSION IN LOCALSTORAGE (Low)

**Severity: Low**

The admin session token is stored in `localStorage` (`sd_admin_session`). This is standard for SPAs but vulnerable to XSS. The existing `X-Frame-Options: DENY` and `X-Content-Type-Options: nosniff` headers reduce risk. The more hardened approach is a short-lived token in `sessionStorage` (tab-scoped) but that breaks multi-tab workflow.

**Recommendation:** Keep as-is for now. Enforce a strict CSP on `admin.html` and `admin-login.html` (add `Content-Security-Policy` header in `vercel.json`).

---

## FINDING 11 — `admin-provision-customer` RBAC RESOURCE KEY ⚠️

**Severity: Low**

The function checks `adminCan(ctx, 'customers', 'write')`. Dealer has `customers.write` ✅. But the `AdminContext` type in `adminAuth.ts` doesn't expose `role_name` — it was later referenced as `ctx.role_name` inside the `admin_audit_logs.insert` metadata. This causes a TypeScript compile error (ignored with `// @ts-ignore` or loses type safety). Not a runtime security issue since `ctx.role_name` gracefully returns `undefined` rather than failing, but should be fixed.

**Fix:** Add `role_name` to `AdminContext` interface in `_shared/adminAuth.ts` (included in this phase's patch).

---

## RBAC MATRIX VERIFICATION

| Action | super_admin | ops_manager | manufacturing | support | analyst | dealer |
|--------|-------------|-------------|---------------|---------|---------|--------|
| Create customer/plate | ✅ | ✅ | ❌ | ❌ | ❌ | ✅ |
| Reset PIN | ✅ | ✅ | ❌ | ✅ | ❌ | ✅ |
| Suspend/Reactivate plate | ✅ | ✅ | ❌ | ❌ | ❌ | ✅ |
| Transfer ownership | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| View analytics | ✅ | ✅ | ❌ | ❌ | ✅ | ❌ |
| Bulk provision | ✅ | ✅ | ❌ | ❌ | ❌ | ✅ |

---

## ACTION ITEMS BEFORE DEPLOYMENT

1. **[REQUIRED]** Run `sql/16_phase13_schema.sql` — creates `admin_session_revocations` + other Phase 13 tables
2. **[RECOMMENDED]** Remove localhost from `cors.ts` or gate on env variable
3. **[RECOMMENDED]** Add CSP header for admin pages in `vercel.json`
4. **[LOW]** Fix `AdminContext` TypeScript type to include `role_name`

---

*Audit complete. No critical security vulnerabilities found. One medium issue (missing table) must be resolved before deployment.*
