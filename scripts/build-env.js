#!/usr/bin/env node
/**
 * Smart Door — Build-Time Environment Injection
 * scripts/build-env.js
 *
 * Phase 10 — Production Launch
 *
 * Smart Door has NO bundler (no Vite/Webpack/Next). All HTML pages load
 * plain ES modules directly. That means `import.meta.env` in
 * config/environment.js NEVER resolves in the browser — it silently fell
 * back to development config in production.
 *
 * This script runs as the Vercel "Build Command". It reads real env vars
 * from the Vercel dashboard (Production / Preview / Development scopes)
 * and writes a single generated file: config/env.generated.js
 * which sets window.__SD_CONFIG__ before any other script runs.
 *
 * All HTML entry points (index.html, app.html, login.html, admin.html,
 * admin-login.html) load this ONE file instead of each hardcoding
 * inline <script> config blocks with placeholder strings.
 *
 * Required Vercel env vars (set per-environment in Vercel dashboard):
 *   VITE_APP_ENV              production | staging | development
 *   VITE_SUPABASE_URL
 *   VITE_SUPABASE_ANON_KEY
 *   VITE_RAZORPAY_KEY_ID      (rzp_live_... in production, rzp_test_... elsewhere)
 *   VITE_GROQ_API_KEY
 *   VITE_APP_BASE_URL         e.g. https://mysmartdoor.in
 *
 * Local dev: copy .env.example -> .env.local and run `node scripts/build-env.js`
 * manually (or `npm run build` if you add one) before opening any HTML file.
 */

const fs   = require('fs');
const path = require('path');

// ── Load .env.local for local development (not available on Vercel) ──
const envLocalPath = path.join(__dirname, '..', '.env.local');
if (fs.existsSync(envLocalPath)) {
  const lines = fs.readFileSync(envLocalPath, 'utf8').split('\n');
  lines.forEach(line => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) return;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx < 0) return;
    const key = trimmed.slice(0, eqIdx).trim();
    const val = trimmed.slice(eqIdx + 1).trim();
    if (!process.env[key]) process.env[key] = val; // don't override real env
  });
}

// Vercel auto-sets VERCEL_ENV to 'production' | 'preview' | 'development'.
// We map that to our app's three-tier model unless VITE_APP_ENV is explicit.
function resolveEnv() {
  const explicit = (process.env.VITE_APP_ENV || '').toLowerCase();
  if (['production', 'staging', 'development'].includes(explicit)) return explicit;

  const vercelEnv = (process.env.VERCEL_ENV || '').toLowerCase();
  if (vercelEnv === 'production') return 'production';
  if (vercelEnv === 'preview') return 'staging';
  return 'development';
}

const ENV = resolveEnv();

// Vercel project env vars were set WITHOUT the VITE_ prefix (SUPABASE_URL,
// SUPABASE_ANON_KEY) instead of the VITE_-prefixed names this script
// originally looked for (VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY). That
// mismatch is the root cause of window.__SD_CONFIG__ shipping with empty
// Supabase values. Each var is now resolved against BOTH naming
// conventions so the build works regardless of which one is set in Vercel.
function resolveVar(...names) {
  for (const name of names) {
    if (process.env[name]) return process.env[name];
  }
  return '';
}

const supabaseUrl  = resolveVar('VITE_SUPABASE_URL', 'SUPABASE_URL');
const supabaseAnon = resolveVar('VITE_SUPABASE_ANON_KEY', 'SUPABASE_ANON_KEY');
// Same dual-naming issue as Supabase above: Vercel may have this set as
// RAZORPAY_KEY_ID (no VITE_ prefix) instead of VITE_RAZORPAY_KEY_ID.
// This is the PUBLIC key id only — RAZORPAY_KEY_SECRET is never read here
// and never ships to the browser; it stays Edge-Function-only.
const razorpayKeyId = resolveVar('VITE_RAZORPAY_KEY_ID', 'RAZORPAY_KEY_ID');

const required = {
  'VITE_SUPABASE_URL / SUPABASE_URL': supabaseUrl,
  'VITE_SUPABASE_ANON_KEY / SUPABASE_ANON_KEY': supabaseAnon,
};

const missing = Object.entries(required)
  .filter(([, v]) => !v)
  .map(([k]) => k);

if (missing.length > 0) {
  // Don't hard-fail local/dev builds, but make it loud. Production deploys
  // without these will result in a broken app, which the missing-var
  // warning at the top of the deployed page will also surface.
  console.warn(
    `\n⚠️  [build-env] Missing env vars: ${missing.join(', ')}\n` +
    `   The deployed app will run with empty Supabase config.\n` +
    `   Set these in Vercel → Project → Settings → Environment Variables.\n`
  );
}

// Razorpay key is not in `required` above (checkout has a WhatsApp fallback
// for dev/staging while keys are being set up — see index.html submitBooking()).
// But in PRODUCTION specifically, a missing key means real customers hit the
// WhatsApp fallback instead of actually paying. Fail loudly at build time.
if (!razorpayKeyId && ENV === 'production') {
  console.warn(
    `\n🚨 [build-env] PRODUCTION BUILD with no Razorpay key set!\n` +
    `   VITE_RAZORPAY_KEY_ID / RAZORPAY_KEY_ID is empty in the production scope.\n` +
    `   Checkout will silently fall back to the WhatsApp order flow —\n` +
    `   no real orders, payments, or plates will be created.\n` +
    `   Set the live key in Vercel → Project → Settings → Environment Variables (Production scope).\n`
  );
}

const config = {
  env: ENV,
  appUrl: process.env.VITE_APP_BASE_URL || (ENV === 'production' ? 'https://mysmartdoor.in' : ENV === 'staging' ? 'https://staging.mysmartdoor.in' : 'http://localhost:3000'),
  baseUrl: process.env.VITE_APP_BASE_URL || (ENV === 'production' ? 'https://mysmartdoor.in' : ENV === 'staging' ? 'https://staging.mysmartdoor.in' : 'http://localhost:3000'),
  supabaseUrl,
  supabaseAnon,
  razorpayKeyId,
  groqApiKey: '', // Removed: GROQ_API_KEY is server-side only (groq-proxy Edge Function)
  sentryDsn: process.env.VITE_SENTRY_DSN || '',
  gaId: process.env.VITE_GA_MEASUREMENT_ID || '',
  clarityId: process.env.VITE_CLARITY_PROJECT_ID || '',
  plausibleDomain: process.env.VITE_PLAUSIBLE_DOMAIN || '',
  buildTime: new Date().toISOString(),
  buildEnv: ENV,
};

const output = `/**
 * AUTO-GENERATED at build time by scripts/build-env.js
 * DO NOT EDIT DIRECTLY — DO NOT COMMIT TO GIT
 * Generated: ${config.buildTime}  |  Environment: ${ENV}
 */
window.__SD_CONFIG__ = ${JSON.stringify(config, null, 2)};
`;

const outDir = path.join(__dirname, '..', 'config');
const outFile = path.join(outDir, 'env.generated.js');

if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(outFile, output, 'utf8');

console.log(`✅ [build-env] Wrote ${outFile} for environment: ${ENV}`);
console.log(`   appUrl: ${config.appUrl}`);
console.log(`   supabaseUrl: ${config.supabaseUrl ? config.supabaseUrl.replace(/(:\/\/)([^.]+)/, '$1***') : '(empty)'}`);
console.log(`   razorpayKeyId: ${config.razorpayKeyId ? config.razorpayKeyId.slice(0, 12) + '…' : '(empty)'}`);
