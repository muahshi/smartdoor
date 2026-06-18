/**
 * Smart Door — Shared CORS Headers (Phase 8 Hardened)
 * supabase/functions/_shared/cors.ts
 */

const PRODUCTION_ORIGINS = [
  'https://smartdoor.in',
  'https://www.smartdoor.in',
];

const DEV_ORIGINS = [
  'http://localhost:3000',
  'http://127.0.0.1:5500',
  'http://localhost:5500',
];

const ALL_ALLOWED = [...PRODUCTION_ORIGINS, ...DEV_ORIGINS];

/** Permissive CORS — webhooks, health checks, third-party callbacks */
export const corsHeaders = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};

/** Restricted CORS — auth, payment, admin functions */
export function restrictedCors(origin: string | null): Record<string, string> {
  const allowed = origin && ALL_ALLOWED.includes(origin) ? origin : PRODUCTION_ORIGINS[0];
  return {
    'Access-Control-Allow-Origin':  allowed,
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
