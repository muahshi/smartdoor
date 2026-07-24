/**
 * Smart Door — Shared CORS Headers
 * supabase/functions/_shared/cors.ts
 *
 * PATCHED (Migration 25 / Master Stabilization):
 *   — Added Vercel preview URL pattern (*.vercel.app) so admin panel
 *     works on staging/preview deployments without CORS errors.
 *   — restrictedCors() now handles both string and RegExp entries.
 */

const PRODUCTION_ORIGINS = [
  'https://mysmartdoor.in',
  'https://www.mysmartdoor.in',
];

const DEV_ORIGINS = Deno.env.get('ENVIRONMENT') === 'development'
  ? [
      'http://localhost:3000',
      'http://127.0.0.1:5500',
      'http://localhost:5500',
      'http://localhost:8080',
    ]
  : [];

// Vercel preview URL pattern — matches all *.vercel.app origins for staging
const VERCEL_PREVIEW_PATTERN = /^https:\/\/[a-z0-9-]+-[a-zA-Z0-9-]+\.vercel\.app$/;

/** Permissive CORS — webhooks, health checks, third-party callbacks */
export const corsHeaders = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};

/**
 * Whether `origin` is one of our known frontends (production, dev, or a
 * Vercel preview URL). Factored out of restrictedCors() (Phase 3.1A) so
 * functions that need to actually REJECT a disallowed origin — not just
 * pick response headers — can reuse the same allow-list instead of
 * re-implementing it. restrictedCors() below is unchanged in behavior.
 */
export function isAllowedOrigin(origin: string | null): boolean {
  if (!origin) return false;
  if ([...PRODUCTION_ORIGINS, ...DEV_ORIGINS].includes(origin)) return true;
  return VERCEL_PREVIEW_PATTERN.test(origin);
}

/**
 * Restricted CORS — auth, payment, admin functions.
 * Allows production domains + dev origins + Vercel preview URLs.
 */
export function restrictedCors(origin: string | null): Record<string, string> {
  const isAllowed = isAllowedOrigin(origin);
  const allowedOrigin = isAllowed ? origin! : PRODUCTION_ORIGINS[0];

  return {
    'Access-Control-Allow-Origin':  allowedOrigin,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Vary': 'Origin',
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options':        'DENY',
  };
}

/** Security headers for all Edge Function responses */
export const securityHeaders: Record<string, string> = {
  'X-Content-Type-Options':    'nosniff',
  'X-Frame-Options':           'DENY',
  'Referrer-Policy':           'strict-origin-when-cross-origin',
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
};
