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
 *   VITE_APP_BASE_URL         e.g. https://smartdoor.in
 *
 * Local dev: copy .env.example -> .env.local and run `node scripts/build-env.js`
 * manually (or `npm run build` if you add one) before opening any HTML file.
 */

const fs = require('fs');
const path = require('path');

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

const required = {
  VITE_SUPABASE_URL: process.env.VITE_SUPABASE_URL || '',
  VITE_SUPABASE_ANON_KEY: process.env.VITE_SUPABASE_ANON_KEY || '',
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

const config = {
  env: ENV,
  appUrl: process.env.VITE_APP_BASE_URL || (ENV === 'production' ? 'https://smartdoor.in' : ENV === 'staging' ? 'https://staging.smartdoor.in' : 'http://localhost:3000'),
  baseUrl: process.env.VITE_APP_BASE_URL || (ENV === 'production' ? 'https://smartdoor.in' : ENV === 'staging' ? 'https://staging.smartdoor.in' : 'http://localhost:3000'),
  supabaseUrl: process.env.VITE_SUPABASE_URL || '',
  supabaseAnon: process.env.VITE_SUPABASE_ANON_KEY || '',
  razorpayKeyId: process.env.VITE_RAZORPAY_KEY_ID || '',
  groqApiKey: process.env.VITE_GROQ_API_KEY || '',
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
