# PHASE 18 MOBILE DEBUG — CHANGED FILES (changed-files-only ZIP)

## CONTEXT
Prior session's report of an existing `phase18-mobile-debug-v2` diagnostic
was verified against this ZIP and found NOT to exist — see REAL GAP below.
This ZIP adds it, additively, on top of the already-verified Phase 18 +
Phase 18 hotfix behavior (unchanged).

## MODIFY
- ai/dashboard/dashboard.js
  - Added DEBUG_BUILD_TAG = 'phase18-mobile-debug-v2'.
  - Added redactDebugText() — strips Bearer tokens, credential-shaped
    key:value pairs (token/authorization/secret/password/api_key/
    apikey/key/cookie), JWT-shaped strings, and long hex tokens from
    any text before it can be attached to an error or rendered. Caps
    output at 800 chars.
  - Added renderMobileDebugBlock(debugInfo) — renders "DEBUG — HTTP
    <status>", Build, Status, Gateway URL, Server response, plus a
    Copy Debug Info button (navigator.clipboard). Receives only
    { status, url, body } — never a session object or token.
  - appendAuthExpiredNotice() now takes an optional 3rd arg
    (debugInfo) and renders the debug block under the existing
    "Admin session expired..." message when present.
  - callGateway()'s 401 branch now reads res.text() exactly once,
    passes it through redactDebugText(), and attaches the result as
    err.debugInfo before throwing — session.token is not read again
    past the original fetch() call.
  - callGateway()'s "no local session" branch also attaches a
    debugInfo object (status: null) so the debug block still renders
    when there was no session to send in the first place.
  - loadLiveEvents() / loadEventLifecycle() now pass err.debugInfo to
    appendAuthExpiredNotice().
  - No change to: 401 branch still does NOT call
    localStorage.removeItem() or renderAuthStatus() (hotfix behavior
    preserved verbatim).

- ai/dashboard/index.html
  - dashboard.js script tag now loads with a cache-busting query
    string (?v=phase18-mobile-debug-v2), since neither vercel.json nor
    sw.js has an explicit no-cache rule for /ai/dashboard/*.js — this
    was a real, previously-flagged risk that the phone could be
    running stale JS regardless of any dashboard.js change.

- scripts/sdos-dashboard-auth-test.js
  - Fixed 3 pre-existing regex extractions that stopped at the first
    "}" inside the 401 branch — they now correctly matched only up to
    the nested try/catch's inner brace, truncating before the new
    code. Widened to match through the outer if-block's own closing
    brace instead. This affected: the "never clears sd_admin_session"
    check, the "never touches the Authentication card" check (both
    were checking for absence, so they passed trivially either way —
    fixed for correctness, not because they were failing), and the
    "raised as a distinct GatewayAuthError" check (this one WAS
    failing, since the throw now happens after the assignment,
    outside the truncated match).
  - Widened the appendAuthExpiredNotice() call-shape check to accept
    the new optional 3rd argument (err.debugInfo).
  - Added 5 new [MOBILE-DEBUG] checks: build tag present and wired
    into the renderer; 401 branch reads the body exactly once and
    attaches redacted debugInfo without touching session.token; 
    redactDebugText() targets Bearer/credential-keys/JWT-shapes;
    the renderer itself never references session.token or
    Authorization; and the debug block only ever targets
    #live-events-status / #lifecycle-result (no new page/modal).

## NOT TOUCHED
- supabase/functions/sdos-dashboard-gateway/index.ts
- supabase/functions/sdos-dashboard-gateway/gatewayLogic.js
- supabase/functions/_shared/adminAuth.ts
- supabase/functions/admin-login/index.ts
- admin.html, admin-login.html
- sql/**, RLS policies, feature_flags, Event Bus (still OFF)
- ai/dashboard/dashboard.css
- Android code, payment code, production calling code, WebRTC, Groq,
  executives

## SECURITY CHECK
- session.token: read exactly once, in the pre-existing fetch() call,
  same as before this change. Not read anywhere in the new diagnostic
  code path.
- Authorization header: never read back from the response, never
  rendered, never copied.
- Response body: read exactly once (res.text()), redacted before
  being attached to any object or rendered, capped at 800 chars.
- No backend file changed. No RLS/schema change. No new auth
  mechanism.

## TEST RESULTS (actually run — see terminal output this session)
node --check ai/dashboard/dashboard.js: PASS
node --check scripts/sdos-dashboard-auth-test.js: PASS
auth test: 23/23
gateway test: 23/23
reader test: 16/16
permission test: 15/15
event bus test: 15/15
credential test: 10/10
runtime verification: fails with "Missing SUPABASE_URL /
  SUPABASE_SERVICE_ROLE_KEY" — expected, this script needs live env
  creds not present in this sandbox; not a regression, same failure
  mode as before this change.
Total automated: 102/102, zero regressions.

## ROLLBACK
Revert ai/dashboard/dashboard.js, ai/dashboard/index.html, and
scripts/sdos-dashboard-auth-test.js to their pre-mobile-debug
versions. No backend or database change was made.
