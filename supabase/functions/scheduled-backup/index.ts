/**
 * Smart Door — Scheduled Backup Cron
 * supabase/functions/scheduled-backup/index.ts
 *
 * Phase 12 — Launch Readiness & Production Certification
 *
 * AUDIT FINDING closed by this function: docs/BACKUP_STRATEGY.md and
 * docs/PRODUCTION_CHECKLIST.md both required an automated weekly backup,
 * and sql/56_phase7_operations_platform.sql already defined
 * backup_snapshots.snapshot_type CHECK (... IN ('manual','scheduled')) —
 * but nothing ever ran a 'scheduled' backup. The only working path was the
 * admin panel's manual "Trigger Backup" button (admin-data `backup_trigger`).
 * This function is the missing automated path, reusing the exact same
 * snapshot logic (see _shared/backupSnapshot.ts) — no new backup mechanism,
 * no new storage bucket, no new tracking table.
 *
 * Follows the same cron-secret pattern already used by
 * renewal-engine-cron/index.ts (see that file for the established
 * convention this mirrors).
 *
 * Triggered weekly via Supabase Dashboard → Edge Functions → Schedule
 * (Cron Trigger UI) — e.g. `0 21 * * 0` (Sunday 21:00 UTC ≈ Monday 02:30 IST,
 * matching the cadence already documented in docs/BACKUP_STRATEGY.md §1).
 * Also callable manually (with an admin bearer token) as a one-off trigger,
 * same as renewal-engine-cron.
 *
 * DEPLOY: supabase functions deploy scheduled-backup --no-verify-jwt
 * Required secret: CRON_SECRET (already used by renewal-engine-cron —
 * reuse the same value, no new secret to provision).
 */

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';
import { runBackupSnapshot } from '../_shared/backupSnapshot.ts';

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const authHeader = req.headers.get('Authorization') || '';
  const cronSecret = Deno.env.get('CRON_SECRET') || '';
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';

  const isCron  = authHeader === `Bearer ${cronSecret}`;
  const isAdmin = authHeader.startsWith('Bearer ') && authHeader !== `Bearer ${cronSecret}`;

  if (!isCron && !isAdmin) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    supabaseServiceKey,
  );

  const result = await runBackupSnapshot(supabase, 'scheduled', null);

  // Surface a persistent alert if the automated backup fails, so it isn't
  // silently missed until someone happens to check the admin panel — same
  // system_alerts table sql/62 already added for other reliability signals.
  if (!result.success) {
    await supabase.from('system_alerts').insert({
      alert_key: 'scheduled_backup_failure', level: 'critical', source: 'cron',
      message: result.message || 'Scheduled backup failed with an unknown error',
      meta: { backupId: result.backupId || null }, status: 'open',
      created_at: new Date().toISOString(),
    }).select().maybeSingle().then(() => {}, () => {});
    // .then(noop, noop): system_alerts schema is owned by sql/62, not this
    // function — if that table/columns ever change shape, a failed insert
    // here must never mask the backup failure response below.

    return Response.json({ success: false, message: result.message }, { status: 500, headers: corsHeaders });
  }

  return Response.json({ success: true, backup_id: result.backupId, rowCounts: result.rowCounts }, { headers: corsHeaders });
});
