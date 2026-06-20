# Smart Door — Backup Strategy & Disaster Recovery Plan
## Phase 8: Production Hardening

---

## 1. BACKUP TIERS

### Daily Backups (Supabase Built-in)
- **What**: Full PostgreSQL logical backup (all tables, functions, policies)
- **Frequency**: Every day at 02:00 IST
- **Retention**: 7 days (Supabase Pro) / 30 days (Supabase Team)
- **How to restore**: Supabase Dashboard → Settings → Backups → Point-in-time Recovery
- **Recovery Time Objective (RTO)**: < 30 minutes
- **Recovery Point Objective (RPO)**: < 24 hours

### Weekly Backups (Manual Export)
- **What**: `pg_dump` via Supabase CLI → compressed SQL file
- **Frequency**: Every Sunday at 03:00 IST (pg_cron or GitHub Actions)
- **Retention**: 4 weeks
- **Storage**: AWS S3 / Cloudflare R2 (encrypted at rest)

```bash
# Weekly backup script — run via GitHub Actions cron
supabase db dump --db-url "$SUPABASE_DB_URL" -f backup_$(date +%Y%m%d).sql
gzip backup_$(date +%Y%m%d).sql
aws s3 cp backup_$(date +%Y%m%d).sql.gz s3://smartdoor-backups/weekly/
```

### Monthly Backups (Long-term Archive)
- **What**: Full dump + Supabase Storage export (voice notes, QR codes)
- **Frequency**: 1st of every month
- **Retention**: 12 months
- **Storage**: S3 Glacier / Backblaze B2 (cold storage — low cost)

---

## 2. WHAT IS BACKED UP

| Data                  | Daily | Weekly | Monthly | Notes                              |
|-----------------------|-------|--------|---------|-----------------------------------|
| users table           | ✅    | ✅     | ✅      | Critical — plate_id + pin_hash    |
| plates table          | ✅    | ✅     | ✅      | QR slugs                          |
| subscriptions         | ✅    | ✅     | ✅      | Revenue-critical                   |
| visitor_logs          | ✅    | ✅     | ✅      | 90-day retention in DB            |
| voice_notes (DB)      | ✅    | ✅     | ✅      | Storage paths only in DB          |
| voice_notes (files)   | ❌    | ✅     | ✅      | Supabase Storage sync             |
| orders + payments     | ✅    | ✅     | ✅      | Legal requirement (7 years)       |
| audit_logs            | ✅    | ✅     | ✅      | Compliance                        |
| admin_users           | ✅    | ✅     | ✅      | Admin access                      |
| qr-codes bucket       | ❌    | ✅     | ✅      | Regeneratable — low priority      |
| error_logs            | ✅    | ❌     | ❌      | 90-day retention only             |

---

## 3. SUPABASE STORAGE BACKUP

```bash
# Export all voice notes from Supabase Storage
# Run via GitHub Actions weekly job

supabase storage ls voice-notes/ --recursive | while read path; do
  supabase storage download "voice-notes/$path" --output "./storage-backup/voice-notes/$path"
done

# Sync to S3
aws s3 sync ./storage-backup/ s3://smartdoor-backups/storage/$(date +%Y%m%d)/
```

---

## 4. DISASTER RECOVERY SCENARIOS

### Scenario A: Single Table Data Loss
**Cause**: Accidental `DELETE` without WHERE clause, or migration gone wrong.
**RTO**: < 15 minutes
**Steps**:
1. Identify affected table + time of incident.
2. Use Supabase Point-in-Time Recovery (Dashboard → Settings → Backups).
3. Restore to last known good state.
4. Verify row counts match expected.

### Scenario B: Full Database Loss
**Cause**: Project deletion, account compromise, Supabase incident.
**RTO**: < 4 hours
**Steps**:
1. Create new Supabase project.
2. Run SQL migrations in order (01 → 10).
3. Restore latest `pg_dump` backup from S3.
4. Update `.env` / `__SD_CONFIG__` with new SUPABASE_URL + SUPABASE_ANON.
5. Redeploy Edge Functions.
6. Test with smoke test suite.

### Scenario C: Storage Loss (voice notes, QR codes)
**Cause**: Bucket deletion, accidental policy change.
**RTO**: < 2 hours
**Steps**:
1. Recreate Supabase Storage buckets with correct policies.
2. Restore from S3 weekly backup.
3. Verify `storage_path` values in `voice_notes` table match restored paths.
4. QR codes can be regenerated via `/admin` panel (lower priority).

### Scenario D: Admin Account Compromise
**Cause**: Admin password breach, session hijack.
**RTO**: < 30 minutes
**Steps**:
1. Immediately revoke all admin sessions via SQL:
   ```sql
   UPDATE admin_users SET session_token = NULL, session_exp = NOW()
   WHERE true;
   INSERT INTO admin_session_revocations (admin_id, reason)
   SELECT id, 'emergency_revocation' FROM admin_users;
   ```
2. Reset all admin passwords.
3. Enable TOTP 2FA for all admin accounts.
4. Review `admin_audit_logs` for unauthorized actions.
5. Notify affected users if any customer data was accessed.

### Scenario E: Payment Data Issue
**Cause**: Duplicate payments, webhook replay, Razorpay outage.
**RTO**: < 1 hour
**Steps**:
1. Check `payments` table for `status = 'captured'` duplicates.
2. Cross-verify with Razorpay dashboard.
3. Issue refunds via `razorpay-refund` Edge Function for duplicates.
4. The idempotency check in `verify-razorpay-payment` prevents most cases.

---

## 5. BACKUP VERIFICATION

Run monthly to confirm backups are restorable:

```bash
# Restore weekly backup to a test Supabase project and verify
pg_restore --clean --if-exists -d "$TEST_DB_URL" backup_latest.sql.gz

# Verify critical table row counts
psql "$TEST_DB_URL" -c "
  SELECT
    (SELECT COUNT(*) FROM users)         AS users,
    (SELECT COUNT(*) FROM plates)        AS plates,
    (SELECT COUNT(*) FROM subscriptions) AS subscriptions,
    (SELECT COUNT(*) FROM orders)        AS orders;
"
```

---

## 6. GITHUB ACTIONS — WEEKLY BACKUP WORKFLOW

Create `.github/workflows/weekly-backup.yml`:

```yaml
name: Weekly DB Backup
on:
  schedule:
    - cron: '0 21 * * 0'  # Sunday 21:00 UTC = Monday 02:30 IST
  workflow_dispatch:

jobs:
  backup:
    runs-on: ubuntu-latest
    steps:
      - name: Install Supabase CLI
        run: npm install -g supabase

      - name: Export Database
        env:
          SUPABASE_DB_URL: ${{ secrets.SUPABASE_DB_URL }}
        run: |
          supabase db dump --db-url "$SUPABASE_DB_URL" -f backup.sql
          gzip backup.sql
          mv backup.sql.gz "smartdoor_backup_$(date +%Y%m%d).sql.gz"

      - name: Upload to S3
        env:
          AWS_ACCESS_KEY_ID:     ${{ secrets.AWS_ACCESS_KEY_ID }}
          AWS_SECRET_ACCESS_KEY: ${{ secrets.AWS_SECRET_ACCESS_KEY }}
          AWS_DEFAULT_REGION:    ap-south-1
        run: |
          aws s3 cp "smartdoor_backup_$(date +%Y%m%d).sql.gz" \
            s3://smartdoor-backups/weekly/
          # Keep only last 4 weeks
          aws s3 ls s3://smartdoor-backups/weekly/ \
            | sort | head -n -4 \
            | awk '{print $4}' \
            | xargs -I{} aws s3 rm s3://smartdoor-backups/weekly/{}
```

---

## 7. DATA RETENTION POLICY (Privacy Compliance)

| Data Type         | Retention Period | Legal Basis           | Deletion Method      |
|-------------------|------------------|-----------------------|----------------------|
| visitor_logs      | 90 days          | Legitimate interest   | `purge_old_data()` fn|
| voice notes       | Until owner deletes | Consent            | Owner action + Storage|
| call_logs         | 180 days         | Legitimate interest   | Scheduled purge      |
| audit_logs        | 365 days         | Legal compliance      | Scheduled purge      |
| payment records   | 7 years          | GST legal requirement | Never auto-deleted   |
| user profiles     | Until deletion request | Contract        | Manual + cascade     |
| error_logs        | 90 days          | Operational           | Scheduled purge      |

**Customer data deletion request**: Admin panel → Customer → Delete Account
- Triggers cascade delete on users table (visitor_logs, voice_notes, family_members all cascade)
- Payments and orders: anonymized (name → "Deleted User", phone → null)
- Voice notes in Storage: must be manually deleted via admin Storage browser

---

## 8. MONITORING BACKUP STATUS

Add to Supabase Edge Function `health-check`:
- Check `error_logs` for recent backup failures
- Alert if last weekly backup is > 8 days old
- Verify S3 bucket accessibility

**Alert channels**:
- Email: admin@mysmartdoor.in (critical failures)
- Dashboard badge (health-check endpoint returns backup_status)
