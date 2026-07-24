#!/usr/bin/env node
/**
 * My Smart Door — Production Config Validator
 * scripts/validate-production-config.js
 *
 * Phase 12 — Launch Readiness & Production Certification
 *
 * AUDIT FINDING: scripts/build-env.js already resolves and sanitizes env
 * vars at build time, but it only ever console.warn()s on problems — by
 * design, so a broken/incomplete local or staging build doesn't hard-fail.
 * That means a production deploy with a missing key, a test-mode Razorpay
 * key, or a wrong domain can still succeed and ship silently broken. This
 * script is the missing hard gate: same env vars, same resolution rules
 * as build-env.js, but it exits 1 (fails the build/CI step) when a
 * PRODUCTION deployment is misconfigured. It does not replace build-env.js
 * — run it alongside/before it as a pre-deploy check.
 *
 * Usage:
 *   VITE_APP_ENV=production node scripts/validate-production-config.js
 *
 * Intended as an optional Vercel "Build Command" prefix for the Production
 * scope only, e.g.:
 *   node scripts/validate-production-config.js && node scripts/build-env.js
 * or run manually as part of LAUNCH_CHECKLIST.md §14 (Pre-Launch Audit).
 *
 * Exit code 0 = safe to deploy. Exit code 1 = do not deploy.
 */

const fs = require('fs');
const path = require('path');

// Reuse the same .env.local loading behavior as build-env.js so this
// script gives identical answers when run locally.
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
    if (!process.env[key]) process.env[key] = val;
  });
}

function sanitize(v) {
  if (typeof v !== 'string') return v;
  let out = v.trim();
  if ((out.startsWith('"') && out.endsWith('"')) || (out.startsWith("'") && out.endsWith("'"))) {
    out = out.slice(1, -1).trim();
  }
  return out;
}

function resolveVar(...names) {
  for (const name of names) {
    if (process.env[name]) return sanitize(process.env[name]);
  }
  return '';
}

function resolveEnv() {
  const explicit = (process.env.VITE_APP_ENV || '').toLowerCase();
  if (['production', 'staging', 'development'].includes(explicit)) return explicit;
  const vercelEnv = (process.env.VERCEL_ENV || '').toLowerCase();
  if (vercelEnv === 'production') return 'production';
  if (vercelEnv === 'preview') return 'staging';
  return 'development';
}

const ENV = resolveEnv();
const errors = [];
const warnings = [];

console.log(`\nSmart Door — Production Config Validator`);
console.log(`Resolved environment: ${ENV}\n`);

if (ENV !== 'production') {
  console.log(`Not a production build (VITE_APP_ENV=${ENV}) — nothing to gate. Exiting 0.\n`);
  process.exit(0);
}

const supabaseUrl = resolveVar('VITE_SUPABASE_URL', 'SUPABASE_URL');
const supabaseAnon = resolveVar('VITE_SUPABASE_ANON_KEY', 'SUPABASE_ANON_KEY');
const razorpayKeyId = resolveVar('VITE_RAZORPAY_KEY_ID', 'RAZORPAY_KEY_ID');
const appBaseUrl = resolveVar('VITE_APP_BASE_URL');
const sentryDsn = resolveVar('VITE_SENTRY_DSN');

// ── Supabase ──
if (!supabaseUrl) {
  errors.push('VITE_SUPABASE_URL / SUPABASE_URL is not set');
} else if (!/^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(supabaseUrl)) {
  errors.push(`VITE_SUPABASE_URL does not look like a real Supabase project URL: "${supabaseUrl}"`);
}

if (!supabaseAnon) {
  errors.push('VITE_SUPABASE_ANON_KEY / SUPABASE_ANON_KEY is not set');
} else if (supabaseAnon.split('.').length !== 3) {
  errors.push('VITE_SUPABASE_ANON_KEY does not look like a JWT (expected 3 dot-separated segments)');
}

// ── Razorpay — must be a LIVE key in production, not test ──
if (!razorpayKeyId) {
  errors.push('VITE_RAZORPAY_KEY_ID / RAZORPAY_KEY_ID is not set — checkout will silently fall back to the WhatsApp order flow (see LAUNCH_CHECKLIST.md §5)');
} else if (razorpayKeyId.startsWith('rzp_test_')) {
  errors.push(`VITE_RAZORPAY_KEY_ID is a TEST key (${razorpayKeyId.slice(0, 12)}…) in a production build — real customers cannot pay`);
} else if (!razorpayKeyId.startsWith('rzp_live_')) {
  errors.push(`VITE_RAZORPAY_KEY_ID does not match the expected rzp_live_... format: "${razorpayKeyId.slice(0, 12)}…"`);
}

// ── Domain ──
if (appBaseUrl && appBaseUrl !== 'https://mysmartdoor.in') {
  errors.push(`VITE_APP_BASE_URL is set to "${appBaseUrl}", expected "https://mysmartdoor.in" in production (LAUNCH_CHECKLIST.md §4)`);
}

// ── Monitoring — warning only, not a hard blocker ──
if (!sentryDsn) {
  warnings.push('VITE_SENTRY_DSN is not set — production errors will not reach Sentry (LAUNCH_CHECKLIST.md §8)');
}

// ── Secrets that can never appear in a frontend build ──
const leakedServerSecrets = ['SUPABASE_SERVICE_ROLE_KEY', 'RAZORPAY_KEY_SECRET', 'EXOTEL_API_TOKEN', 'TWILIO_AUTH_TOKEN', 'CRON_SECRET']
  .filter(name => resolveVar(name) && process.env[`VITE_${name}`]);
if (leakedServerSecrets.length > 0) {
  errors.push(`Server-only secrets are set with a VITE_ prefix, which means they would ship to the browser: ${leakedServerSecrets.join(', ')}`);
}

// ── Report ──
if (warnings.length > 0) {
  console.log('Warnings (non-blocking):');
  warnings.forEach(w => console.log(`  ⚠️  ${w}`));
  console.log('');
}

if (errors.length > 0) {
  console.log('Errors (blocking production deploy):');
  errors.forEach(e => console.log(`  ❌ ${e}`));
  console.log(`\n${errors.length} error(s) found. Fix these in Vercel → Project → Settings → Environment Variables (Production scope) before deploying.\n`);
  process.exit(1);
}

console.log('✅ Production config looks valid. Safe to build/deploy.\n');
process.exit(0);
