# PHASE 18 HOTFIX — CHANGED FILES (changed-files-only ZIP)

## ROOT CAUSE
ai/dashboard/dashboard.js's callGateway() cleared localStorage's
sd_admin_session AND re-rendered the Authentication card to "Not
signed in" on the very FIRST 401 from sdos-dashboard-gateway. This
diverged from admin.html's own adminCall() convention (which tolerates
transient 401s and only treats a session as dead after 3 consecutive
failures) and is what produced the reported symptom: a valid session
being thrown away by the dashboard itself after one Load click.

## MODIFY
- ai/dashboard/dashboard.js
  - Added GatewayAuthError (distinct from a plain Error) for 401s.
  - callGateway()'s 401 branch no longer calls
    localStorage.removeItem() or renderAuthStatus() — a single 401
    never destroys sd_admin_session or touches the top-level
    Authentication card.
  - loadLiveEvents() / loadEventLifecycle() now special-case
    GatewayAuthError and render a per-action notice with a
    "Sign in again" link to /admin-login.html, instead of a generic
    red error and instead of a global sign-out.
  - EMPTY / INTEGRATION_ERROR copy for sdos_events.recent updated to
    the exact required strings: "No SDOS events found." /
    "SDOS event storage could not be read." (lifecycle mirrors this).

- scripts/sdos-dashboard-auth-test.js
  - Added 6 new [HOTFIX] checks proving: no localStorage.removeItem
    in the 401 branch, no renderAuthStatus() in the 401 branch, 401 is
    raised as GatewayAuthError, both load functions render the
    login-link notice, exact EMPTY/INTEGRATION_ERROR copy, and that
    the only remaining removeItem call is the pre-existing
    local-expiry cleanup inside getAdminSession() (same as
    admin.html's own).
  - Updated the pre-existing "expired/missing session" check's
    expected string to match the corrected copy.

## NOT TOUCHED
- ai/dashboard/index.html, ai/dashboard/dashboard.css (unchanged since Phase 18)
- supabase/functions/sdos-dashboard-gateway/index.ts
- supabase/functions/sdos-dashboard-gateway/gatewayLogic.js
- supabase/functions/_shared/adminAuth.ts
- supabase/functions/admin-login/index.ts
- admin.html, admin-login.html
- sql/**, RLS policies, feature_flags, Event Bus (still OFF)
- Android code, payment code, production calling code

## TEST RESULTS
permission engine 15/15, event bus 15/15, credential path 10/10,
reader 16/16, Phase 17 gateway 23/23, Phase 18 auth (hotfixed) 18/18.
Total: 97/97, zero regressions. node --check clean on both files.

## MANUAL TEST
1. Login to SmartDoor Admin.
2. Open SDOS Dashboard — see "Signed in as ..." (unchanged).
3. Click Load Live Events.
4. If it succeeds: real rows, or "No SDOS events found.", or
   "SDOS event storage could not be read." — Authentication card
   still shows "Signed in as ...".
5. If the gateway ever returns 401: the Live Events panel shows
   "Admin session expired. Please sign in again." with a
   "Sign in again" link — the Authentication card at the top is
   UNCHANGED (still shows the prior signed-in state), and
   sd_admin_session is still present in localStorage.
6. Click Load Lifecycle with an event_id — same behavior.

## ROLLBACK
Revert ai/dashboard/dashboard.js and scripts/sdos-dashboard-auth-test.js
to their prior (post-Phase-18, pre-hotfix) versions. No backend or
database change was made, so nothing else needs rolling back.
