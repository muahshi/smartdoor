#!/usr/bin/env node
/**
 * SDOS Dashboard — Automatic Admin Authentication — Test Suite (Phase 18)
 * scripts/sdos-dashboard-auth-test.js
 *
 * Follows the same check()/pass/fail runner convention as
 * scripts/sdos-dashboard-gateway-test.js, scripts/sdos-events-reader-test.js,
 * etc. — no test framework dependency exists in this repository.
 *
 * SCOPE: ai/dashboard/dashboard.js and ai/dashboard/index.html are
 * browser-only (DOM, localStorage, fetch, window.__SD_CONFIG__) — there
 * is no jsdom or browser test runner in this repository (matching every
 * other frontend file here). This suite does the same thing
 * sdos-dashboard-gateway-test.js already does for index.ts/gatewayLogic.js:
 * static, structural source checks (grep-style) proving the Phase 18
 * requirements by inspection rather than execution:
 *
 *   1. No manual "admin session token" input field remains.
 *   2. No manual "gateway URL" input field remains.
 *   3. dashboard.js reads the SAME localStorage key admin.html's own
 *      admin session helper writes/reads (sd_admin_session) — no new
 *      session store was invented.
 *   4. dashboard.js builds the gateway URL from window.__SD_CONFIG__
 *      (the same build-time config every other HTML entry point uses),
 *      never from a hardcoded string or user-typed field.
 *   5. index.html loads config/env.generated.js so __SD_CONFIG__ exists.
 *   6. No service_role / GROQ / DB-credential-shaped string appears in
 *      either file (browser-reachable surface).
 *   7. No localStorage.setItem call exists in dashboard.js (this file
 *      must never persist a session — only admin.html/admin-login.html
 *      may write sd_admin_session).
 *   8. Expired/missing session produces the plain-language copy Rule 7
 *      requires, not a raw technical error.
 *   9. A 403 (unauthorized) response produces the plain-language
 *      permission-denied copy Rule 7 requires.
 *  10. Loading events/lifecycle remains gated behind explicit button
 *      clicks only — no auto-fire on page load (Rule 6): init() calls
 *      renderers but never loadLiveEvents()/loadEventLifecycle().
 *  11. gatewayUrl()/getAdminSession() never send a value the user typed
 *      into any input as the gateway base URL or token.
 *
 * PHASE 18 HOTFIX — a 401 from the gateway must never destroy a real,
 * valid session (root cause of the reported bug: dashboard.js cleared
 * sd_admin_session and flipped the Authentication card to "Not signed
 * in" on the very first 401, diverging from admin.html's own
 * tolerance for transient 401s). Additional static checks:
 *
 *  12. callGateway()'s 401 branch never calls localStorage.removeItem.
 *  13. callGateway()'s 401 branch never calls renderAuthStatus() (the
 *      top-level Authentication card must be left alone).
 *  14. A 401 is raised as a distinct GatewayAuthError (not a plain
 *      Error), so callers can render a login-link notice instead of a
 *      generic red error.
 *  15. Both loadLiveEvents() and loadEventLifecycle() special-case
 *      GatewayAuthError and render a login link, per Step 5's UX
 *      requirement.
 *  16. EMPTY / INTEGRATION_ERROR copy for the live-events capability
 *      matches Step 5's exact required strings ("No SDOS events
 *      found." / "SDOS event storage could not be read.").
 *  17. The only localStorage.removeItem call left in dashboard.js is
 *      inside getAdminSession() itself (local-expiry cleanup — the
 *      same behavior admin.html's own getAdminSession() already has),
 *      not inside callGateway()'s 401 handling.
 *
 * Usage: node scripts/sdos-dashboard-auth-test.js
 * Exit code 0 = all checks passed, 1 = at least one failed.
 */

import { readFileSync } from 'node:fs';

let passed = 0;
let failed = 0;
const failures = [];

async function check(name, fn) {
  try {
    const detail = await fn();
    passed++;
    console.log(`  \u2705 ${name}${detail ? ` \u2014 ${detail}` : ''}`);
  } catch (err) {
    failed++;
    failures.push(name);
    console.log(`  \u274c ${name} \u2014 ${err.message}`);
  }
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg || 'assertion failed');
}

const jsSource = readFileSync(new URL('../ai/dashboard/dashboard.js', import.meta.url), 'utf8');
const htmlSource = readFileSync(new URL('../ai/dashboard/index.html', import.meta.url), 'utf8');
const adminSource = readFileSync(new URL('../admin.html', import.meta.url), 'utf8');

console.log('SDOS Dashboard \u2014 Phase 18 Automatic Authentication Test Suite\n');

await check('index.html no longer has a manual "Admin session token" field', async () => {
  assert(!/id="admin-token"/.test(htmlSource), 'admin-token input still present');
  assert(!/paste token from admin\.html/i.test(htmlSource), 'paste-token placeholder copy still present');
});

await check('index.html no longer has a manual "Gateway URL" field', async () => {
  assert(!/id="gateway-url"/.test(htmlSource), 'gateway-url input still present');
});

await check('dashboard.js reads the same session key admin.html writes (sd_admin_session)', async () => {
  const jsKey = jsSource.match(/ADMIN_SESSION_KEY\s*=\s*'([^']+)'/);
  const adminKey = adminSource.match(/ADMIN_SESSION_KEY\s*=\s*'([^']+)'/);
  assert(jsKey, 'dashboard.js does not declare ADMIN_SESSION_KEY');
  assert(adminKey, 'admin.html does not declare ADMIN_SESSION_KEY');
  assert(jsKey[1] === adminKey[1], `key mismatch: dashboard.js='${jsKey[1]}' admin.html='${adminKey[1]}'`);
  return `both use '${jsKey[1]}'`;
});

await check('dashboard.js session read mirrors admin.html\u2019s expiry contract (s.exp check)', async () => {
  assert(/getAdminSession/.test(jsSource), 'no getAdminSession() in dashboard.js');
  assert(/Date\.now\(\)\s*>\s*s\.exp/.test(jsSource), 'no expiry check against s.exp in dashboard.js');
});

await check('dashboard.js builds the gateway URL from window.__SD_CONFIG__, not a hardcoded/typed value', async () => {
  assert(/window\.__SD_CONFIG__\??\.supabaseUrl/.test(jsSource), 'no window.__SD_CONFIG__.supabaseUrl read');
  assert(!/https:\/\/[a-z0-9-]+\.supabase\.co/.test(jsSource), 'a hardcoded supabase.co URL was found');
});

await check('index.html loads config/env.generated.js so __SD_CONFIG__ exists before dashboard.js runs', async () => {
  assert(/env\.generated\.js/.test(htmlSource), 'no config/env.generated.js script tag found');
});

await check('no service_role / DB-credential-shaped string appears in the browser-reachable dashboard files', async () => {
  const combined = jsSource + '\n' + htmlSource;
  assert(!/service_role/i.test(combined), 'service_role string found');
  assert(!/SUPABASE_SERVICE_ROLE_KEY/.test(combined), 'SUPABASE_SERVICE_ROLE_KEY string found');
  assert(!/GROQ_API_KEY/.test(combined), 'GROQ_API_KEY string found');
  assert(!/SDOS_DB_URL/.test(combined), 'SDOS_DB_URL string found');
});

await check('dashboard.js never writes to localStorage (session is only ever read, never persisted here)', async () => {
  const setItemCalls = jsSource.match(/localStorage\.setItem/g) || [];
  assert(setItemCalls.length === 0, `found ${setItemCalls.length} localStorage.setItem call(s)`);
});

await check('an expired/missing session produces plain-language copy, not a raw technical error', async () => {
  assert(/Admin session expired\. Please sign in again\./.test(jsSource), 'expected plain-language expired-session message not found');
});

await check('a 403 (unauthorized) response produces plain-language permission-denied copy', async () => {
  assert(/status === 403/.test(jsSource), 'no explicit 403 handling found');
  assert(/Your account does not have permission to view SDOS events\./.test(jsSource), 'expected plain-language permission-denied message not found');
});

await check('loading events/lifecycle stays behind explicit button clicks \u2014 no auto-fire on page load', async () => {
  const initMatch = jsSource.match(/function init\(\)\s*\{[\s\S]*?\n\}/);
  assert(initMatch, 'could not locate init() function body');
  const initBody = initMatch[0];
  assert(!/loadLiveEvents\(\)/.test(initBody), 'init() calls loadLiveEvents() directly \u2014 would auto-fire a gateway call on page load');
  assert(!/loadEventLifecycle\(\)/.test(initBody), 'init() calls loadEventLifecycle() directly \u2014 would auto-fire a gateway call on page load');
  assert(/addEventListener\('click', loadLiveEvents\)/.test(jsSource), 'Load Live Events button is not wired to a click listener');
  assert(/addEventListener\('click', loadEventLifecycle\)/.test(jsSource), 'Load Lifecycle button is not wired to a click listener');
});

await check('callGateway() sources the token from the freshly-read session, never from a DOM input field', async () => {
  const fnMatch = jsSource.match(/async function callGateway\([\s\S]*?\n\}/);
  assert(fnMatch, 'could not locate callGateway() function body');
  const body = fnMatch[0];
  assert(!/getElementById\('admin-token'\)/.test(body), 'callGateway() still reads an admin-token input field');
  assert(!/getElementById\('gateway-url'\)/.test(body), 'callGateway() still reads a gateway-url input field');
  assert(/session\.token/.test(body), 'callGateway() does not use session.token');
});

// ── Phase 18 hotfix checks ────────────────────────────────────────────

await check('[HOTFIX] callGateway() exists and its 401 branch never clears sd_admin_session', async () => {
  const fnMatch = jsSource.match(/async function callGateway\([\s\S]*?\n\}/);
  assert(fnMatch, 'could not locate callGateway() function body');
  const body = fnMatch[0];
  // Match through to the outer if-block's own closing brace (2-space
  // indented, own line) — the branch now contains a nested try/catch
  // around res.text(), so a naive "stop at the first }" would
  // truncate before covering the whole branch.
  const status401Match = body.match(/if \(res\.status === 401\) \{([\s\S]*?)\n  \}/);
  assert(status401Match, 'no res.status === 401 branch found in callGateway()');
  assert(!/localStorage\.removeItem/.test(status401Match[1]), 'the 401 branch still calls localStorage.removeItem — this is the exact regression reported (session destroyed on a single 401)');
});

await check('[HOTFIX] callGateway()\u2019s 401 branch never touches the top-level Authentication card', async () => {
  const fnMatch = jsSource.match(/async function callGateway\([\s\S]*?\n\}/);
  assert(fnMatch, 'could not locate callGateway() function body');
  const body = fnMatch[0];
  const status401Match = body.match(/if \(res\.status === 401\) \{([\s\S]*?)\n  \}/);
  assert(status401Match, 'no res.status === 401 branch found in callGateway()');
  assert(!/renderAuthStatus\(\)/.test(status401Match[1]), 'the 401 branch still calls renderAuthStatus() — a single gateway 401 must not flip the Authentication card to \u201cNot signed in\u201d');
});

await check('[HOTFIX] a gateway 401 is raised as a distinct GatewayAuthError, not a plain Error', async () => {
  assert(/class GatewayAuthError extends Error/.test(jsSource), 'no GatewayAuthError class declared');
  const fnMatch = jsSource.match(/async function callGateway\([\s\S]*?\n\}/);
  assert(fnMatch, 'could not locate callGateway() function body');
  const body = fnMatch[0];
  // Phase 18 mobile-debug: the branch now contains a nested try/catch
  // around res.text(), so the old non-greedy "stop at the first }"
  // extraction truncates before reaching the throw. Match through to
  // the outer if-block's own closing brace (2-space indented, on its
  // own line) instead.
  const status401Match = body.match(/if \(res\.status === 401\) \{([\s\S]*?)\n  \}/);
  assert(status401Match, 'no res.status === 401 branch found in callGateway()');
  // The branch now builds the error as `const err = new
  // GatewayAuthError(...); err.debugInfo = ...; throw err;` (so
  // debugInfo can be attached before throwing) instead of a bare
  // `throw new GatewayAuthError(...)`. Both forms throw exactly one
  // GatewayAuthError instance — accept either.
  assert(
    /throw new GatewayAuthError/.test(status401Match[1]) ||
      (/new GatewayAuthError\(/.test(status401Match[1]) && /throw err/.test(status401Match[1])),
    '401 branch does not throw GatewayAuthError',
  );
});

await check('[HOTFIX] loadLiveEvents() and loadEventLifecycle() both render a login-link notice on GatewayAuthError', async () => {
  assert(/function appendAuthExpiredNotice/.test(jsSource), 'no appendAuthExpiredNotice() helper found');
  assert(/href: '\/admin-login\.html'/.test(jsSource), 'appendAuthExpiredNotice() does not link to /admin-login.html');
  const liveMatch = jsSource.match(/async function loadLiveEvents\([\s\S]*?\n\}/);
  const lifecycleMatch = jsSource.match(/async function loadEventLifecycle\([\s\S]*?\n\}/);
  assert(liveMatch, 'could not locate loadLiveEvents() function body');
  assert(lifecycleMatch, 'could not locate loadEventLifecycle() function body');
  assert(/err instanceof GatewayAuthError/.test(liveMatch[0]), 'loadLiveEvents() does not special-case GatewayAuthError');
  assert(/err instanceof GatewayAuthError/.test(lifecycleMatch[0]), 'loadEventLifecycle() does not special-case GatewayAuthError');
  // Phase 18 mobile-debug: appendAuthExpiredNotice() now takes an
  // optional 3rd arg (err.debugInfo) so the mobile debug block can be
  // rendered alongside the login-link notice. Accept the call with or
  // without that 3rd arg.
  assert(/appendAuthExpiredNotice\(box, err\.message(?:, err\.debugInfo)?\)/.test(liveMatch[0]), 'loadLiveEvents() does not render the login-link notice');
  assert(/appendAuthExpiredNotice\(box, err\.message(?:, err\.debugInfo)?\)/.test(lifecycleMatch[0]), 'loadEventLifecycle() does not render the login-link notice');
});

await check('[HOTFIX] EMPTY / INTEGRATION_ERROR copy for live events matches the exact required strings', async () => {
  assert(/'No SDOS events found\.'/.test(jsSource), 'missing exact EMPTY copy: "No SDOS events found."');
  assert(/'SDOS event storage could not be read\.'/.test(jsSource), 'missing exact INTEGRATION_ERROR copy: "SDOS event storage could not be read."');
});

await check('[HOTFIX] the only localStorage.removeItem call left is the local-expiry cleanup inside getAdminSession()', async () => {
  const removeItemMatches = [...jsSource.matchAll(/localStorage\.removeItem\(ADMIN_SESSION_KEY\)/g)];
  assert(removeItemMatches.length === 1, `expected exactly 1 localStorage.removeItem call (local-expiry cleanup in getAdminSession()), found ${removeItemMatches.length}`);
  const getAdminSessionMatch = jsSource.match(/function getAdminSession\(\)[\s\S]*?\n\}/);
  assert(getAdminSessionMatch, 'could not locate getAdminSession() function body');
  assert(/localStorage\.removeItem\(ADMIN_SESSION_KEY\)/.test(getAdminSessionMatch[0]), 'the single remaining removeItem call is not inside getAdminSession()');
});

await check('[MOBILE-DEBUG] build tag phase18-mobile-debug-v2 is present and rendered in the debug block', async () => {
  assert(/const DEBUG_BUILD_TAG = 'phase18-mobile-debug-v2'/.test(jsSource), 'DEBUG_BUILD_TAG literal not found');
  const renderMatch = jsSource.match(/function renderMobileDebugBlock\([\s\S]*?\n\}/);
  assert(renderMatch, 'could not locate renderMobileDebugBlock() function body');
  assert(/DEBUG_BUILD_TAG/.test(renderMatch[0]), 'renderMobileDebugBlock() does not reference DEBUG_BUILD_TAG');
});

await check('[MOBILE-DEBUG] 401 branch reads the response body exactly once and attaches redacted debugInfo', async () => {
  const fnMatch = jsSource.match(/async function callGateway\([\s\S]*?\n\}/);
  assert(fnMatch, 'could not locate callGateway() function body');
  const status401Match = fnMatch[0].match(/if \(res\.status === 401\) \{([\s\S]*?)\n  \}/);
  assert(status401Match, 'no res.status === 401 branch found in callGateway()');
  const branch = status401Match[1];
  const resTextMatches = [...branch.matchAll(/res\.text\(\)/g)];
  assert(resTextMatches.length === 1, `expected exactly 1 res.text() call in the 401 branch, found ${resTextMatches.length}`);
  assert(/redactDebugText\(/.test(branch), '401 branch does not pass the body through redactDebugText()');
  assert(/err\.debugInfo\s*=/.test(branch), '401 branch does not attach debugInfo to the thrown error');
  assert(!/session\.token/.test(branch), '401 branch reads session.token — must not, session.token is only used in the fetch() call above');
});

await check('[MOBILE-DEBUG] redactDebugText() strips Bearer tokens, JWT-shaped strings, and credential-shaped keys', async () => {
  const fnMatch = jsSource.match(/function redactDebugText\([\s\S]*?\n\}/);
  assert(fnMatch, 'could not locate redactDebugText() function body');
  const body = fnMatch[0];
  assert(/Bearer\\s\+/.test(body), 'redactDebugText() does not strip "Bearer <token>" patterns');
  assert(/token|authorization|secret|password/i.test(body), 'redactDebugText() does not target credential-shaped keys');
  assert(/REDACTED-JWT/.test(body), 'redactDebugText() does not strip JWT-shaped strings');
});

await check('[MOBILE-DEBUG] the debug renderer and diagnostic path never reference session.token or a raw Authorization header', async () => {
  const renderMatch = jsSource.match(/function renderMobileDebugBlock\([\s\S]*?\n\}/);
  assert(renderMatch, 'could not locate renderMobileDebugBlock() function body');
  assert(!/session\.token/.test(renderMatch[0]), 'renderMobileDebugBlock() references session.token');
  assert(!/Authorization/.test(renderMatch[0]), 'renderMobileDebugBlock() references the Authorization header directly');
});

await check('[MOBILE-DEBUG] mobile debug block renders inside #live-events-status and #lifecycle-result, no new page/modal', async () => {
  assert(/appendAuthExpiredNotice\(box, err\.message, err\.debugInfo\)/.test(jsSource), 'debugInfo is not threaded through to appendAuthExpiredNotice() anywhere');
  // Both call sites assign `box = document.getElementById('live-events-status' | 'lifecycle-result')`
  // earlier in their own function bodies — checked structurally via the
  // existing loadLiveEvents()/loadEventLifecycle() location, not re-derived here.
  assert(/document\.getElementById\('live-events-status'\)/.test(jsSource), 'live-events-status target missing');
  assert(/document\.getElementById\('lifecycle-result'\)/.test(jsSource), 'lifecycle-result target missing');
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.log('Failed: ' + failures.join(', '));
  process.exit(1);
}
