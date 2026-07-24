/**
 * My Smart Door — Environment Configuration
 * config/environment.js
 *
 * Phase 9 — Beta Launch Operations
 *
 * Production / Staging / Development environment separation.
 *
 * Usage:
 *   import { ENV, getConfig, isProduction } from '../config/environment.js';
 *
 * Set VITE_APP_ENV in Vercel dashboard per deployment:
 *   Production  branch → VITE_APP_ENV=production
 *   Staging     branch → VITE_APP_ENV=staging
 *   Dev/local          → VITE_APP_ENV=development  (or unset)
 *
 * NOTE (Phase 12 audit): this file is not currently imported for its
 * config/appUrl values anywhere in the app — scripts/build-env.js +
 * config/env.generated.js (window.__SD_CONFIG__) is the actual source of
 * truth for what ships to the browser, and already resolves appUrl
 * correctly per environment. Keep the two in sync if this file is wired
 * up for real use later.
 */

// ────────── DETECT ENVIRONMENT ──────────

const RAW_ENV = (
  (typeof import.meta !== 'undefined' && import.meta.env?.VITE_APP_ENV) ||
  (typeof process !== 'undefined' && process.env?.VITE_APP_ENV) ||
  'development'
).toLowerCase();

export const ENV = ['production', 'staging', 'development'].includes(RAW_ENV)
  ? RAW_ENV
  : 'development';

export const isProduction  = ENV === 'production';
export const isStaging     = ENV === 'staging';
export const isDevelopment = ENV === 'development';

// ────────── PER-ENVIRONMENT CONFIG ──────────

const CONFIGS = {
  production: {
    env:              'production',
    label:            '🟢 Production',
    appUrl:           'https://mysmartdoor.in',
    supabaseUrl:      import.meta?.env?.VITE_SUPABASE_URL        || '',
    supabaseAnonKey:  import.meta?.env?.VITE_SUPABASE_ANON_KEY   || '',
    razorpayKeyId:    import.meta?.env?.VITE_RAZORPAY_KEY_ID     || '',
    groqApiKey:       import.meta?.env?.VITE_GROQ_API_KEY        || '',
    debugMode:        false,
    logLevel:         'error',
    sentryEnabled:    true,
    analyticsEnabled: true,
    betaBadge:        false,
    maintenanceMode:  false,
    featureFlags: {
      referralSystem:   true,
      npsWidget:        true,
      betaFeedback:     false,
      activationWizard: true,
      renewalEngine:    true,
      shippingIntegration: true,
    },
  },

  staging: {
    env:              'staging',
    label:            '🟡 Staging',
    appUrl:           'https://staging.mysmartdoor.in',
    supabaseUrl:      import.meta?.env?.VITE_SUPABASE_URL        || '',
    supabaseAnonKey:  import.meta?.env?.VITE_SUPABASE_ANON_KEY   || '',
    razorpayKeyId:    import.meta?.env?.VITE_RAZORPAY_KEY_ID     || '',
    groqApiKey:       import.meta?.env?.VITE_GROQ_API_KEY        || '',
    debugMode:        true,
    logLevel:         'warn',
    sentryEnabled:    true,
    analyticsEnabled: true,
    betaBadge:        true,
    maintenanceMode:  false,
    featureFlags: {
      referralSystem:   true,
      npsWidget:        true,
      betaFeedback:     true,
      activationWizard: true,
      renewalEngine:    true,
      shippingIntegration: true,
    },
  },

  development: {
    env:              'development',
    label:            '🔵 Development',
    appUrl:           'http://localhost:5173',
    supabaseUrl:      import.meta?.env?.VITE_SUPABASE_URL        || '',
    supabaseAnonKey:  import.meta?.env?.VITE_SUPABASE_ANON_KEY   || '',
    razorpayKeyId:    import.meta?.env?.VITE_RAZORPAY_KEY_ID     || '',
    groqApiKey:       import.meta?.env?.VITE_GROQ_API_KEY        || '',
    debugMode:        true,
    logLevel:         'debug',
    sentryEnabled:    false,
    analyticsEnabled: false,
    betaBadge:        true,
    maintenanceMode:  false,
    featureFlags: {
      referralSystem:   true,
      npsWidget:        true,
      betaFeedback:     true,
      activationWizard: true,
      renewalEngine:    false,   // Don't run renewal cron in dev
      shippingIntegration: false,
    },
  },
};

// ────────── EXPORT CONFIG ──────────

export const config = CONFIGS[ENV];

export function getConfig() { return config; }

export function isFeatureEnabled(flagName) {
  return config.featureFlags?.[flagName] === true;
}

// ────────── ENVIRONMENT LOGGER ──────────

const LOG_LEVELS = { debug: 0, info: 1, warn: 2, error: 3 };
const currentLevel = LOG_LEVELS[config.logLevel] ?? 1;

export const logger = {
  debug: (...args) => { if (currentLevel <= 0) console.debug('[SD]', ...args); },
  info:  (...args) => { if (currentLevel <= 1) console.info('[SD]',  ...args); },
  warn:  (...args) => { if (currentLevel <= 2) console.warn('[SD]',  ...args); },
  error: (...args) => { if (currentLevel <= 3) console.error('[SD]', ...args); },
};

// ────────── ENV BADGE (injects visible badge in non-production) ──────────

export function injectEnvBadge() {
  if (!config.betaBadge) return;

  const badge = document.createElement('div');
  badge.id = 'sd-env-badge';
  badge.style.cssText = `
    position: fixed; top: 0; left: 50%; transform: translateX(-50%);
    background: ${isStaging ? '#f59e0b' : '#3b82f6'};
    color: #000; font-size: 0.7rem; font-weight: 700;
    padding: 2px 12px; border-radius: 0 0 6px 6px;
    z-index: 99999; letter-spacing: 0.05em;
    pointer-events: none;
  `;
  badge.textContent = config.label;
  document.body.appendChild(badge);
}

// ────────── VALIDATION ──────────

export function validateEnv() {
  const required = ['supabaseUrl', 'supabaseAnonKey'];
  const missing = required.filter(key => !config[key]);
  if (missing.length > 0) {
    logger.error('Missing required env vars:', missing.map(k => k.toUpperCase().replace(/([A-Z])/g, '_$1')));
    return false;
  }
  return true;
}
