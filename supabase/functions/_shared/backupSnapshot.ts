/**
 * Smart Door — Shared Backup Snapshot Logic
 * supabase/functions/_shared/backupSnapshot.ts
 *
 * Phase 12 — Launch Readiness & Production Certification
 *
 * Extracted from admin-data's `backup_trigger` handler (Phase 7) so the
 * exact same snapshot logic can be reused by:
 *   - admin-data `backup_trigger` (manual, admin-initiated, unchanged behavior)
 *   - scheduled-backup (new — automated weekly run via Supabase Cron Trigger)
 *
 * Also adds `verifyBackupSnapshot()` — closes the "backup & restore
 * verification" launch gap. backup_snapshots.row_counts already recorded
 * what SHOULD be in a completed snapshot; this reads the stored JSON back
 * from Storage and confirms it actually parses and the row counts still
 * match, so a completed snapshot is a *confirmed-restorable* snapshot, not
 * just a trusted status flag.
 *
 * Not a substitute for Supabase's own infra-level Postgres backups (not
 * reachable from an Edge Function) — this is the existing app-data export
 * layer (Phase 7), unchanged, now reusable and verifiable.
 */

// deno-lint-ignore no-explicit-any
type ServiceClient = any;

export const BACKUP_TABLES = [
  'users', 'plates', 'orders', 'subscriptions', 'manufacturing',
  'inventory_items', 'support_tickets', 'admin_users', 'product_skus', 'warranties',
];

export interface BackupRunResult {
  success: boolean;
  backupId?: string;
  rowCounts?: Record<string, number>;
  message?: string;
}

/**
 * Runs a full backup snapshot: creates the tracking row, exports each
 * BACKUP_TABLES table (capped at 5000 rows/table, same limit as the
 * original manual path), uploads the JSON to the private
 * 'backup-snapshots' bucket, and marks the run completed/failed.
 *
 * @param db           Service-role Supabase client
 * @param snapshotType 'manual' (admin-triggered) or 'scheduled' (cron)
 * @param triggeredBy  admin_users.id, or null for scheduled/cron runs
 *                      (backup_snapshots.triggered_by is nullable — see sql/56)
 */
export async function runBackupSnapshot(
  db: ServiceClient,
  snapshotType: 'manual' | 'scheduled',
  triggeredBy: string | null,
): Promise<BackupRunResult> {
  const { data: run, error: runErr } = await db.from('backup_snapshots').insert({
    snapshot_type: snapshotType, tables_included: BACKUP_TABLES, status: 'running', triggered_by: triggeredBy,
  }).select().maybeSingle();

  if (runErr || !run) {
    return { success: false, message: runErr?.message || 'Could not start backup' };
  }

  try {
    const snapshot: Record<string, unknown> = {};
    const rowCounts: Record<string, number> = {};
    for (const table of BACKUP_TABLES) {
      const { data: rows, error: tblErr } = await db.from(table).select('*').limit(5000);
      if (tblErr) throw new Error(`${table}: ${tblErr.message}`);
      snapshot[table] = rows || [];
      rowCounts[table] = (rows || []).length;
    }

    const path = `snapshots/${run.id}.json`;
    const { error: uploadErr } = await db.storage.from('backup-snapshots').upload(
      path, new Blob([JSON.stringify(snapshot)], { type: 'application/json' }), { upsert: true },
    );
    if (uploadErr) throw new Error(uploadErr.message);

    await db.from('backup_snapshots').update({
      status: 'completed', storage_path: path, row_counts: rowCounts, completed_at: new Date().toISOString(),
    }).eq('id', run.id);

    if (triggeredBy) {
      const { data: admin } = await db.from('admin_users').select('email').eq('id', triggeredBy).maybeSingle();
      await db.from('admin_audit_logs').insert({
        admin_id: triggeredBy, admin_email: admin?.email || null, action: 'backup_triggered',
        resource: 'backup', resource_id: run.id, metadata: { tables: BACKUP_TABLES, rowCounts, snapshotType },
        created_at: new Date().toISOString(),
      });
    }

    return { success: true, backupId: run.id, rowCounts };
  } catch (backupErr) {
    await db.from('backup_snapshots').update({
      status: 'failed', error_message: String(backupErr), completed_at: new Date().toISOString(),
    }).eq('id', run.id);
    return { success: false, backupId: run.id, message: `Backup failed: ${String(backupErr)}` };
  }
}

export interface BackupVerifyResult {
  success: boolean;
  ok?: boolean;
  message?: string;
  mismatches?: Record<string, { recorded: number; actual: number }>;
}

/**
 * Restore verification: downloads the stored snapshot JSON for a completed
 * backup and confirms it parses and its row counts still match what was
 * recorded at backup time. Marks backup_snapshots.verified_at / verified_ok
 * (added in sql/64) so the admin panel can show "confirmed restorable"
 * instead of only "completed".
 */
export async function verifyBackupSnapshot(db: ServiceClient, backupId: string): Promise<BackupVerifyResult> {
  const { data: run, error: runErr } = await db.from('backup_snapshots').select('*').eq('id', backupId).maybeSingle();
  if (runErr || !run) return { success: false, message: runErr?.message || 'Backup record not found' };
  if (run.status !== 'completed' || !run.storage_path) {
    return { success: false, message: `Backup is '${run.status}', nothing to verify` };
  }

  try {
    const { data: file, error: dlErr } = await db.storage.from('backup-snapshots').download(run.storage_path);
    if (dlErr || !file) throw new Error(dlErr?.message || 'Snapshot file missing from storage');

    const text = await file.text();
    const parsed = JSON.parse(text) as Record<string, unknown[]>;

    const recordedCounts: Record<string, number> = run.row_counts || {};
    const mismatches: Record<string, { recorded: number; actual: number }> = {};
    for (const table of Object.keys(recordedCounts)) {
      const actual = Array.isArray(parsed[table]) ? parsed[table].length : -1;
      if (actual !== recordedCounts[table]) mismatches[table] = { recorded: recordedCounts[table], actual };
    }

    const ok = Object.keys(mismatches).length === 0;
    await db.from('backup_snapshots').update({
      verified_at: new Date().toISOString(), verified_ok: ok,
    }).eq('id', backupId);

    return { success: true, ok, mismatches: ok ? undefined : mismatches };
  } catch (verifyErr) {
    await db.from('backup_snapshots').update({
      verified_at: new Date().toISOString(), verified_ok: false,
    }).eq('id', backupId);
    return { success: false, message: `Verification failed: ${String(verifyErr)}` };
  }
}
