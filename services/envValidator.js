/**
 * My Smart Door — Startup Environment Validator
 * services/envValidator.js
 *
 * Run at app boot (before any service initializes) to catch:
 *   - Missing config keys
 *   - Invalid formats (URL, key prefix checks)
 *   - Provider connectivity (Supabase reachability)
 *
 * Usage (in app.js / index.html inline script):
 *   import { validateEnv } from './services/envValidator.js';
 *   const envStatus = await validateEnv();
 *   if (!envStatus.ok) {
 *     showFatalError(envStatus.errors);
 *     return;
 *   }
 */

// ─── REQUIRED CONFIG KEYS ─────────────────────────────────────────────────────
const REQUIRED_CONFIG = [
  {
    key: 'supabaseUrl',
    label: 'Supabase Project URL',
    validate: (v) => v?.startsWith('https://') && v.includes('.supabase.co'),
    hint: 'Should be https://xxxx.supabase.co',
  },
  {
    key: 'supabaseAnon',
    label: 'Supabase Anon Key',
    validate: (v) => typeof v === 'string' && v.length > 40,
    hint: 'JWT string from Supabase project settings → API',
  },
  {
    key: 'razorpayKeyId',
    label: 'Razorpay Key ID',
    validate: (v) => v?.startsWith('rzp_'),
    hint: 'Should start with rzp_live_ or rzp_test_',
  },
];

// ─── OPTIONAL CONFIG (warn but don't block) ───────────────────────────────────
const OPTIONAL_CONFIG = [
  { key: 'sentryDsn',      label: 'Sentry DSN (error tracking)' },
  { key: 'logtailToken',   label: 'Logtail token (log drain)' },
  { key: 'vapidPublicKey', label: 'VAPID Public Key (push notifications)' },
];

// ─── MAIN VALIDATOR ───────────────────────────────────────────────────────────
export async function validateEnv() {
  const errors   = [];
  const warnings = [];
  const checks   = {};
  const config   = window.__SD_CONFIG__ || {};

  // 1. Required keys
  for (const item of REQUIRED_CONFIG) {
    const val = config[item.key];
    if (!val) {
      errors.push(`Missing required config: ${item.key} (${item.label})`);
      checks[item.key] = { status: 'missing', label: item.label };
    } else if (item.validate && !item.validate(val)) {
      errors.push(`Invalid format for ${item.key}: ${item.hint}`);
      checks[item.key] = { status: 'invalid', label: item.label, hint: item.hint };
    } else {
      checks[item.key] = { status: 'ok', label: item.label };
    }
  }

  // 2. Optional keys
  for (const item of OPTIONAL_CONFIG) {
    if (!config[item.key]) {
      warnings.push(`Optional config missing: ${item.key} (${item.label})`);
      checks[item.key] = { status: 'missing_optional', label: item.label };
    } else {
      checks[item.key] = { status: 'ok', label: item.label };
    }
  }

  // 3. Razorpay mode check
  if (config.razorpayKeyId) {
    const isLive = config.razorpayKeyId.startsWith('rzp_live_');
    const isTest = config.razorpayKeyId.startsWith('rzp_test_');
    checks.razorpay_mode = {
      status: isLive ? 'live' : isTest ? 'test' : 'unknown',
      label: 'Razorpay Mode',
    };
    if (isTest) {
      warnings.push('⚠️  Razorpay is in TEST mode. Use rzp_live_ key for production.');
    }
  }

  // 4. Supabase connectivity check (only if URL + Anon are valid)
  if (checks.supabaseUrl?.status === 'ok' && checks.supabaseAnon?.status === 'ok') {
    checks.supabase_connectivity = await _checkSupabaseConnectivity(config.supabaseUrl, config.supabaseAnon);
    if (checks.supabase_connectivity.status === 'error') {
      errors.push(`Supabase unreachable: ${checks.supabase_connectivity.error}`);
    }
  }

  // 5. HTTPS enforcement in production
  if (location.protocol !== 'https:' && location.hostname !== 'localhost') {
    errors.push('App must be served over HTTPS in production.');
    checks.https = { status: 'error', label: 'HTTPS' };
  } else {
    checks.https = { status: 'ok', label: 'HTTPS' };
  }

  // 6. Service Worker support check
  checks.service_worker = {
    status: 'serviceWorker' in navigator ? 'ok' : 'unsupported',
    label: 'Service Worker (PWA)',
  };

  // 7. LocalStorage availability
  checks.local_storage = _checkLocalStorage();

  // Final result
  const ok = errors.length === 0;

  if (!ok) {
    console.error('[EnvValidator] STARTUP ERRORS — App may not function correctly:');
    errors.forEach(e => console.error('  ❌', e));
  }
  if (warnings.length > 0) {
    console.warn('[EnvValidator] Warnings:');
    warnings.forEach(w => console.warn('  ⚠️', w));
  }
  if (ok) {
    console.log('%c[EnvValidator] ✅ All required env checks passed.', 'color:#22C55E;font-weight:bold');
  }

  return { ok, errors, warnings, checks, timestamp: new Date().toISOString() };
}

// ─── CONNECTIVITY CHECK ───────────────────────────────────────────────────────
async function _checkSupabaseConnectivity(url, anon) {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);

    const res = await fetch(`${url}/rest/v1/`, {
      headers: { apikey: anon, Authorization: `Bearer ${anon}` },
      signal: controller.signal,
    });
    clearTimeout(timer);

    if (res.ok || res.status === 200 || res.status === 404) {
      // 404 is fine — just means no table "." exists, but the server is up
      return { status: 'ok', label: 'Supabase Connectivity', latencyMs: null };
    }
    return { status: 'error', label: 'Supabase Connectivity', error: `HTTP ${res.status}` };
  } catch (err) {
    if (err.name === 'AbortError') {
      return { status: 'error', label: 'Supabase Connectivity', error: 'Timeout after 5s' };
    }
    return { status: 'error', label: 'Supabase Connectivity', error: err.message };
  }
}

// ─── LOCAL STORAGE CHECK ──────────────────────────────────────────────────────
function _checkLocalStorage() {
  try {
    const TEST_KEY = '__sd_env_test__';
    localStorage.setItem(TEST_KEY, '1');
    localStorage.removeItem(TEST_KEY);
    return { status: 'ok', label: 'LocalStorage' };
  } catch {
    return { status: 'error', label: 'LocalStorage', error: 'Access denied (private mode?)' };
  }
}

// ─── DISPLAY HELPER ───────────────────────────────────────────────────────────
/**
 * Optional: Show a blocking error banner if env is broken.
 * Call from app.js when validateEnv() returns ok === false.
 */
export function showEnvError(validationResult) {
  const existing = document.getElementById('sd-env-error-banner');
  if (existing) existing.remove();

  const banner = document.createElement('div');
  banner.id = 'sd-env-error-banner';
  banner.style.cssText = `
    position:fixed;top:0;left:0;right:0;z-index:99999;
    background:#1A1A1A;border-bottom:2px solid #EF4444;
    color:#FFF;padding:16px 24px;font-family:monospace;font-size:13px;
  `;
  banner.innerHTML = `
    <div style="color:#EF4444;font-weight:bold;margin-bottom:8px">
      ⚠️ My Smart Door — Configuration Error
    </div>
    ${validationResult.errors.map(e => `<div>❌ ${e}</div>`).join('')}
    ${validationResult.warnings.map(w => `<div style="color:#F59E0B">⚠️ ${w}</div>`).join('')}
    <div style="margin-top:8px;color:#9CA3AF;font-size:11px">
      Check window.__SD_CONFIG__ in your HTML. See docs/PRODUCTION_CHECKLIST.md.
    </div>
  `;
  document.body.prepend(banner);
}
