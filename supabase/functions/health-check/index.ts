/**
 * Smart Door — Supabase Edge Function: health-check
 * supabase/functions/health-check/index.ts
 *
 * Returns system health status for all critical dependencies.
 * Called by: monitoring dashboard, uptime services (UptimeRobot, BetterUptime)
 *
 * Public endpoint — returns only pass/fail, no sensitive data.
 *
 * DEPLOY: supabase functions deploy health-check --no-verify-jwt
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getOrCreateRequestId, withRequestIdHeader } from '../_shared/requestId.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Cache-Control':                'no-cache, no-store',
};

interface CheckResult {
  status:    'ok' | 'error' | 'degraded';
  latencyMs: number;
  error?:    string;
}

async function runCheck(fn: () => Promise<void>): Promise<CheckResult> {
  const t0 = Date.now();
  try {
    await fn();
    return { status: 'ok', latencyMs: Date.now() - t0 };
  } catch (err) {
    return { status: 'error', latencyMs: Date.now() - t0, error: String(err) };
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const requestId = getOrCreateRequestId(req);
  const responseHeaders = withRequestIdHeader(corsHeaders, requestId);
  const startMs = Date.now();

  const supabaseAdmin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  );

  // Run all checks in parallel
  const [database, storage, auth, razorpay, exotel] = await Promise.all([

    // 1. Database — simple row fetch
    runCheck(async () => {
      const { error } = await supabaseAdmin
        .from('users')
        .select('id')
        .limit(1);
      if (error) throw new Error(error.message);
    }),

    // 2. Storage — list buckets
    runCheck(async () => {
      const { error } = await supabaseAdmin.storage.listBuckets();
      if (error) throw new Error(error.message);
    }),

    // 3. Auth — validate service role key works
    runCheck(async () => {
      const { error } = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 1 });
      if (error) throw new Error(error.message);
    }),

    // 4. Razorpay — check API key is configured
    runCheck(async () => {
      const keyId = Deno.env.get('RAZORPAY_KEY_ID');
      if (!keyId || !keyId.startsWith('rzp_')) throw new Error('RAZORPAY_KEY_ID missing or invalid');
      // Lightweight Razorpay API ping
      const auth = btoa(`${keyId}:${Deno.env.get('RAZORPAY_KEY_SECRET')}`);
      const res  = await fetch('https://api.razorpay.com/v1/payments?count=1', {
        headers: { 'Authorization': `Basic ${auth}` },
        signal: AbortSignal.timeout(4000),
      });
      if (!res.ok && res.status !== 200) throw new Error(`Razorpay HTTP ${res.status}`);
    }),

    // 5. Exotel — check API key configured
    runCheck(async () => {
      const sid = Deno.env.get('EXOTEL_SID');
      const key = Deno.env.get('EXOTEL_API_KEY');
      if (!sid || !key) throw new Error('EXOTEL_SID or EXOTEL_API_KEY missing');
      // Don't make a real call — just validate secrets are set
    }),
  ]);

  const checks = { database, storage, auth, razorpay, exotel };

  const allOk      = Object.values(checks).every(c => c.status === 'ok');
  const anyError   = Object.values(checks).some(c => c.status === 'error');
  const overallStatus = allOk ? 'ok' : anyError ? 'error' : 'degraded';
  const httpStatus    = allOk ? 200 : anyError ? 503 : 207;

  const body = {
    status:    overallStatus,
    timestamp: new Date().toISOString(),
    totalMs:   Date.now() - startMs,
    version:   'phase8',
    checks,
  };

  // Log degraded/error states to error_logs
  if (!allOk) {
    const failedChecks = Object.entries(checks)
      .filter(([, v]) => v.status !== 'ok')
      .map(([k, v]) => ({ check: k, ...v }));

    await supabaseAdmin.from('error_logs').insert({
      level:      anyError ? 'error' : 'warn',
      category:   'system',
      message:    `Health check failed: ${failedChecks.map(c => c.check).join(', ')}`,
      meta:       { failedChecks },
      request_id: requestId,
    });
  }

  return Response.json({ ...body, requestId }, {
    status:  httpStatus,
    headers: responseHeaders,
  });
});
