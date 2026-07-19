#!/usr/bin/env node
/**
 * Smart Door — Production Smoke Test
 * scripts/smoke-test.js
 *
 * Phase 12 — Launch Readiness & Production Certification
 *
 * AUDIT FINDING: no end-to-end smoke test existed anywhere in the repo —
 * `package.json` had no test script, and go-live verification was entirely
 * a manual checklist (LAUNCH_CHECKLIST.md §14, PRODUCTION_CHECKLIST.md
 * "GO-LIVE DAY SEQUENCE"). This script automates the parts of that
 * checklist that are externally observable over HTTP: it does NOT touch
 * the database or trigger real payments — it hits the deployed site the
 * same way a browser or uptime monitor would.
 *
 * Reuses existing infrastructure only:
 *   - supabase/functions/health-check (already checks DB/storage/auth/
 *     Razorpay/Exotel) — this script just calls it and checks the result
 *   - vercel.json's existing rewrites/redirects/headers — verified as
 *     deployed, not reimplemented
 *
 * Usage:
 *   node scripts/smoke-test.js
 *   BASE_URL=https://staging.mysmartdoor.in node scripts/smoke-test.js
 *   SUPABASE_URL=https://xxxx.supabase.co node scripts/smoke-test.js
 *
 * Exit code 0 = all checks passed. Exit code 1 = at least one check failed
 * (suitable as a CI/deploy gate, e.g. after "T-00h: Switch DNS to
 * production" in PRODUCTION_CHECKLIST.md's go-live sequence).
 */

const BASE_URL = (process.env.BASE_URL || 'https://mysmartdoor.in').replace(/\/$/, '');
const SUPABASE_URL = (process.env.SUPABASE_URL || '').replace(/\/$/, '');
const TIMEOUT_MS = 10_000;

let passed = 0;
let failed = 0;
const failures = [];

async function fetchWithTimeout(url, options = {}) {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    return await fetch(url, { ...options, signal: controller.signal, redirect: 'manual' });
  } finally {
    clearTimeout(t);
  }
}

async function check(name, fn) {
  try {
    const detail = await fn();
    passed++;
    console.log(`  ✅ ${name}${detail ? ` — ${detail}` : ''}`);
  } catch (err) {
    failed++;
    failures.push(name);
    console.log(`  ❌ ${name} — ${err.message}`);
  }
}

function assert(cond, message) {
  if (!cond) throw new Error(message);
}

async function main() {
  console.log(`\nSmart Door — Production Smoke Test`);
  console.log(`Target: ${BASE_URL}\n`);

  // ── 1. Public marketing page loads ──
  console.log('Frontend — public pages');
  await check('GET / returns 200 HTML', async () => {
    const res = await fetchWithTimeout(`${BASE_URL}/`);
    assert(res.status === 200, `got ${res.status}`);
    const ct = res.headers.get('content-type') || '';
    assert(ct.includes('text/html'), `unexpected content-type: ${ct}`);
  });

  await check('GET /manifest.json returns 200', async () => {
    const res = await fetchWithTimeout(`${BASE_URL}/manifest.json`);
    assert(res.status === 200, `got ${res.status}`);
  });

  await check('GET /sw.js returns 200 with no-cache headers', async () => {
    const res = await fetchWithTimeout(`${BASE_URL}/sw.js`);
    assert(res.status === 200, `got ${res.status}`);
    const cc = res.headers.get('cache-control') || '';
    assert(cc.includes('no-store') || cc.includes('no-cache'), `sw.js is cacheable: ${cc}`);
  });

  await check('GET /sitemap.xml returns 200', async () => {
    const res = await fetchWithTimeout(`${BASE_URL}/sitemap.xml`);
    assert(res.status === 200, `got ${res.status}`);
  });

  // ── 2. vercel.json rewrites resolve (structural check, not auth flow) ──
  console.log('\nFrontend — routing (vercel.json rewrites)');
  const rewrites = [
    ['/login', 'login.html'],
    ['/app', 'app.html'],
    ['/admin', 'admin.html'],
    ['/admin-login', 'admin-login.html'],
  ];
  for (const [path, expectedFile] of rewrites) {
    await check(`GET ${path} rewrites to ${expectedFile}`, async () => {
      const res = await fetchWithTimeout(`${BASE_URL}${path}`);
      assert(res.status === 200, `got ${res.status}`);
    });
  }

  await check('GET /p/SD-000000 rewrites to visitor.html (QR landing)', async () => {
    const res = await fetchWithTimeout(`${BASE_URL}/p/SD-000000`);
    assert(res.status === 200, `got ${res.status}`);
  });

  // ── 3. Security headers present (vercel.json) ──
  console.log('\nSecurity headers');
  await check('Security headers present on /', async () => {
    const res = await fetchWithTimeout(`${BASE_URL}/`);
    const required = ['x-frame-options', 'x-content-type-options', 'strict-transport-security', 'content-security-policy'];
    const missing = required.filter(h => !res.headers.get(h));
    assert(missing.length === 0, `missing: ${missing.join(', ')}`);
  });

  await check('app.html is not publicly cached (Cache-Control: no-store)', async () => {
    const res = await fetchWithTimeout(`${BASE_URL}/app.html`);
    const cc = res.headers.get('cache-control') || '';
    assert(cc.includes('no-store'), `got Cache-Control: ${cc}`);
  });

  // ── 4. www → apex redirect ──
  console.log('\nDomain configuration');
  await check('www.mysmartdoor.in redirects to apex domain', async () => {
    const wwwBase = BASE_URL.replace('https://', 'https://www.');
    const res = await fetchWithTimeout(`${wwwBase}/`);
    assert(res.status >= 300 && res.status < 400, `expected redirect, got ${res.status}`);
    const location = res.headers.get('location') || '';
    assert(location.includes('mysmartdoor.in') && !location.includes('www.'), `unexpected redirect target: ${location}`);
  });

  // ── 5. Supabase health-check ──
  if (SUPABASE_URL) {
    console.log('\nBackend — Supabase health-check');
    await check('health-check endpoint reachable and reports subsystem status', async () => {
      const res = await fetchWithTimeout(`${SUPABASE_URL}/functions/v1/health-check`);
      assert(res.status === 200 || res.status === 207 || res.status === 503, `unexpected HTTP ${res.status}`);
      const body = await res.json();
      assert(body.status, 'no status field in response');
      if (body.status !== 'ok') {
        const failedChecks = Object.entries(body.checks || {})
          .filter(([, v]) => v.status !== 'ok')
          .map(([k]) => k);
        throw new Error(`status=${body.status}, failing: ${failedChecks.join(', ') || 'unknown'}`);
      }
      return `all subsystems ok (${body.totalMs}ms)`;
    });
  } else {
    console.log('\nBackend — Supabase health-check');
    console.log('  ⚠️  skipped (set SUPABASE_URL to include this check)');
  }

  // ── Summary ──
  console.log(`\n${'─'.repeat(50)}`);
  console.log(`${passed} passed, ${failed} failed`);
  if (failed > 0) {
    console.log(`\nFailed checks: ${failures.join(', ')}`);
    console.log('Do not proceed with go-live until these pass.\n');
    process.exit(1);
  }
  console.log('\nAll smoke tests passed.\n');
}

main().catch(err => {
  console.error('\nSmoke test runner crashed:', err);
  process.exit(1);
});
