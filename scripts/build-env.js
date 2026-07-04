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
// ROOT-CAUSE FIX (production InvalidAccessError on PushManager.subscribe):
// Env values were passed through verbatim from process.env. Both the local
// .env.local parser above (which never strips quotes) and a value pasted
// into the Vercel dashboard with surrounding quotes/trailing newline/space
// (a very common copy-paste mistake for the Firebase VAPID key, which is a
// long base64url string) would ship literal quote characters, a newline, or
// spaces inside window.__SD_CONFIG__.firebase.vapidKey. That corrupted
// string is still "truthy" (so every earlier presence check passes) but is
// no longer valid base64url — atob() inside Firebase's getToken() decodes
// it to the wrong byte length, and the browser rejects it at
// pushManager.subscribe({ applicationServerKey }) with exactly:
//   InvalidAccessError: The provided applicationServerKey is not valid.
// _sanitize() strips wrapping quotes and all leading/trailing whitespace
// from EVERY resolved var, regardless of source (.env.local or Vercel),
// so this class of corruption can't reach the browser again.
function _sanitize(v) {
  if (typeof v !== 'string') return v;
  let out = v.trim();
  if (
    (out.startsWith('"') && out.endsWith('"')) ||
    (out.startsWith("'") && out.endsWith("'"))
  ) {
    out = out.slice(1, -1).trim();
  }
  return out;
}

function resolveVar(...names) {
  for (const name of names) {
    if (process.env[name]) return _sanitize(process.env[name]);
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

// Firebase — CLIENT-SAFE config only (Phase 4c, background push via FCM).
// These are the public web app keys, meant to ship to the browser — that's
// how Firebase Web push always works, the token exchange is what's secret.
// FIREBASE_PRIVATE_KEY and FIREBASE_CLIENT_EMAIL are NOT read here and must
// NEVER be added to this list — those two are the service-account secret
// half and belong ONLY in Supabase Edge Function secrets (see
// supabase/functions/send-push/index.ts), never in a Vercel env var that
// this script bakes into window.__SD_CONFIG__.
const firebase = {
  apiKey:            resolveVar('VITE_FIREBASE_API_KEY', 'FIREBASE_API_KEY'),
  authDomain:        resolveVar('VITE_FIREBASE_AUTH_DOMAIN', 'FIREBASE_AUTH_DOMAIN'),
  projectId:         resolveVar('VITE_FIREBASE_PROJECT_ID', 'FIREBASE_PROJECT_ID'),
  storageBucket:     resolveVar('VITE_FIREBASE_STORAGE_BUCKET', 'FIREBASE_STORAGE_BUCKET'),
  messagingSenderId: resolveVar('VITE_FIREBASE_MESSAGING_SENDER_ID', 'FIREBASE_MESSAGING_SENDER_ID'),
  appId:             resolveVar('VITE_FIREBASE_APP_ID', 'FIREBASE_APP_ID'),
  measurementId:     resolveVar('VITE_FIREBASE_MEASUREMENT_ID', 'FIREBASE_MEASUREMENT_ID'),
  vapidKey:          resolveVar('VITE_FIREBASE_VAPID_KEY', 'FIREBASE_VAPID_KEY'),
};
if (!firebase.apiKey || !firebase.vapidKey) {
  console.warn(
    `\n⚠️  [build-env] Firebase push config incomplete — background push notifications will be disabled.\n` +
    `   (Foreground notifications via services/notificationDispatcher.js are unaffected.)\n`
  );
}

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
  firebase,
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

// ── ROOT-CAUSE FIX (404 on /firebase-messaging-sw.js, Installations 403) ──
// The repo never shipped a firebase-messaging-sw.js at the domain root, so
// https://mysmartdoor.in/firebase-messaging-sw.js 404'd — the well-known
// path the Firebase Installations/Messaging backend (and Firebase
// Console's own "Send test message" tool) expects to exist. services/push.js
// itself doesn't need this file (it hands getToken() the existing /sw.js
// registration instead, on purpose — see sw.js's comment on why a second
// 'push' listener here would double-fire notifications), but the file must
// still exist at that exact URL for FCM's own backend checks to pass.
// Generated here (like env.generated.js) so the real, non-secret Firebase
// Web config is baked in at build time instead of being duplicated/hand-
// maintained in a second place. A Firebase project is only "fully wired"
// (Installations create() stops 403'ing) once apiKey + projectId + appId +
// messagingSenderId are ALL present and from the SAME Firebase Web App —
// a partial config (e.g. only apiKey/vapidKey were rotated) is the most
// common cause of "everything looks configured but Installations still
// rejects with 403 PERMISSION_DENIED".
const firebaseFullyConfigured = !!(firebase.apiKey && firebase.projectId && firebase.appId && firebase.messagingSenderId);

const swOutput = firebaseFullyConfigured
  ? `// AUTO-GENERATED at build time by scripts/build-env.js
// DO NOT EDIT DIRECTLY — DO NOT COMMIT TO GIT
// Generated: ${config.buildTime}  |  Environment: ${ENV}
//
// Standard Firebase Web Push service worker
// (https://firebase.google.com/docs/cloud-messaging/js/receive).
//
// NOTE: Smart Door does NOT register this file as its active service
// worker — services/push.js passes getToken() the existing /sw.js
// registration instead, so sw.js's own 'push' listener (which already
// renders every notification type this app sends, with actions/vibration/
// tags) stays the ONLY code path that displays a notification. Adding a
// second listener here would race it and could double-fire an alert.
// onBackgroundMessage below is a defensive fallback only — it runs if the
// SDK ever falls back to registering this default file itself (e.g. a
// future getToken() call that omits serviceWorkerRegistration), or if
// Firebase Console's "Send test message" delivers a classic
// notification-payload message straight to the default SW.
importScripts('https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.12.2/firebase-messaging-compat.js');

firebase.initializeApp(${JSON.stringify(firebase, null, 2)});

const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
  const data  = payload.data || {};
  const title = payload.notification?.title || data.title || '🔔 Smart Door Alert';
  const body  = payload.notification?.body  || data.body  || 'Someone is at your door!';
  self.registration.showNotification(title, {
    body,
    icon:  '/images/favicon-192x192.png',
    badge: '/images/favicon-192x192.png',
    data:  { url: data.url || '/app.html' },
  });
});
`
  : `// AUTO-GENERATED at build time by scripts/build-env.js
// DO NOT EDIT DIRECTLY — DO NOT COMMIT TO GIT
// Generated: ${config.buildTime}  |  Environment: ${ENV}
//
// Firebase is not fully configured for this deployment (one or more of
// VITE_FIREBASE_API_KEY / _PROJECT_ID / _APP_ID / _MESSAGING_SENDER_ID is
// missing in this environment's Vercel env vars). This is an intentionally
// inert placeholder so /firebase-messaging-sw.js returns 200 instead of
// 404 — it registers no listeners and does nothing. Background push in
// this deployment runs entirely through /sw.js (see services/push.js,
// which no-ops safely when Firebase isn't configured).
`;

const swFile = path.join(__dirname, '..', 'firebase-messaging-sw.js');
fs.writeFileSync(swFile, swOutput, 'utf8');
console.log(`✅ [build-env] Wrote ${swFile} (firebase fully configured: ${firebaseFullyConfigured})`);
