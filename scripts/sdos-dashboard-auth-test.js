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
  assert(/Your admin session has expired\. Please sign in again\./.test(jsSource), 'expected plain-language expired-session message not found');
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

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.log('Failed: ' + failures.join(', '));
  process.exit(1);
}
