# Security Guide

Security standards the AI CTO applies. SmartDoor's entire value proposition
is privacy (visitors never see an owner's real phone number), so security
here is not generic best-practice — it is the product's core promise.

## Non-Negotiable Red Lines

These are never traded off for speed or convenience:

1. **Real phone numbers never reach the client for visitor-facing flows.**
   All calling is masked (WebRTC with Twilio fallback). Any proposed change
   that would expose a real number client-side is rejected outright.
2. **PINs are never stored or logged in plaintext.** `pin_hash` (bcrypt) is
   the only acceptable representation. PIN recovery flows must not create a
   side channel that leaks the PIN or a guessable equivalent.
3. **RLS is mandatory on every table with owner- or visitor-scoped data.**
   No table ships without it in the same migration that creates it.
4. **Webhook signature verification is mandatory** for any inbound webhook
   (Razorpay and any future provider) — HMAC verification plus idempotency,
   matching the existing Razorpay webhook receiver pattern.
5. **No secrets in client-side code, logs, or the repository.** API keys
   and credentials live in environment configuration only.
6. **Admin/RBAC boundaries are enforced server-side, not just hidden in the
   UI.** A panel being absent from navigation is not access control — the
   underlying Edge Function or RLS policy must enforce it.

## Standard Review Areas

- **Authentication & session handling**: `auth_user_id` linkage, PIN
  lockouts (`pin_lockouts`), OTP handling (`pin_recovery_otps`), admin
  session revocation (`admin_session_revocations`).
- **Authorization**: RLS policies (39+ across migrations) and the 8-role
  admin RBAC system (`admin_roles`, `admin_permissions`,
  `PANEL_RBAC`/`switchPanel()` pattern in `admin.html`).
- **Rate limiting**: `rate_limit_events`, `edgeRateLimit.ts` shared helper —
  new public-facing Edge Functions should use it by default.
- **Audit trail**: `admin_audit_logs`, `audit_logs` — privileged actions
  should be logged, not silent.
- **Data minimization**: new features should collect and store only what's
  needed; visitor/owner PII should not be duplicated across tables without
  a clear reason.
- **Third-party integrations**: Razorpay, Twilio, Groq, FCM/Web Push —
  each is a trust boundary; verify signatures/tokens on every inbound call.

## Known Historical Risk Patterns (from SmartDoor's own history)

- RLS mismatches have recurred enough to warrant dedicated "fix" migrations
  (`sql/19_admin_data_rls_fix.sql`, `sql/65_fix_owner_id_rls_mismatch.sql`,
  `sql/70_plates_public_lookup_hardening.sql`). Any new table touching
  `owner_id`-scoped data should be checked against this pattern specifically.
- Server-level platform config (e.g. `Permissions-Policy: microphone=()` in
  `vercel.json`) has silently blocked a feature in production before —
  security review should include platform/deployment config, not just
  application code.
- A stray unconditional `return` once silenced multiple admin actions
  without raising any error — a reminder that silent failure is itself a
  security-relevant bug class (masks whether an authorization check ran).

## What the CTO Does With a Security Finding

Per `AUTHORITY_MATRIX.md`, the CTO never applies a security fix directly if
it touches schema, RLS, auth, or payments — it documents the finding with
severity (`RISK_FRAMEWORK.md`, `BUG_TRIAGE_GUIDE.md`) and escalates to the
founder for approval before any change is made.
