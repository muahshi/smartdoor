# Database — My Smart Door (Supabase / PostgreSQL)

> Compiled by reading `sql/01_schema.sql` through `sql/70_plates_public_lookup_hardening.sql`
> (86 migration files). This document describes the schema as built by
> those migrations. **No schema changes were made or proposed as part of
> producing this document.** `DATABASE_SCHEMA.md` at the repo root lists
> only 10 tables and is stale — see `documents/documents.md` for the
> discrepancy note.

## Migration History

86 SQL files in `sql/`, numbered sequentially (`01_schema.sql` through
`70_plates_public_lookup_hardening.sql`, plus lettered verification/fix
files like `29b_owner_settings_columns_fix.sql`). This is the real,
authoritative build history of the database — more current and detailed
than any top-level markdown status doc.

## Core Identity & Plate Tables (`01_schema.sql`)

- **`users`** — the owner record. Key fields: `full_name`, `phone`
  (unique), `email` (unique), `plate_id` (unique, format `SD-XXXXXX`),
  `pin_hash` (bcrypt hash of the 4-digit login PIN), `auth_user_id`
  (links to Supabase `auth.users`). This is the root entity almost
  everything else hangs off of via `owner_id`.
- **`plates`** — the physical/digital nameplate record, one per unit
  sold, linked to `users`.
- Multiple other Phase-1 tables reference `users.id` as `owner_id`
  (mostly `NOT NULL ... ON DELETE CASCADE`, meaning most owner-scoped
  data is deleted if the owner is deleted; a few are `ON DELETE SET NULL`
  for softer relationships like plate/admin references).

## Table Inventory by Domain

(Full list of ~100+ tables found via `CREATE TABLE` across all
migrations, grouped by the business domain that owns them — see
`features/features.md` for the feature each domain supports.)

**Identity & Plates**: `users`, `plates`, `activation_events`,
`ownership_transfers`, `replacement_requests`, `status_history`.

**Communication**: `conversations`, `messages`, `message_logs`,
`call_logs`, `voice_notes`, `visitor_logs`, `visitor_memory`,
`visitor_profiles`, `visitor_visits`, `visitor_passes`,
`emergency_events`.

**Real-time Calling (WebRTC)**: `rtc_call_attempts`, `rtc_call_claims`,
`rtc_presence_events`, `owner_devices`.

**Notifications**: `notifications`, `notification_preferences`,
`push_subscriptions`, `push_delivery_logs`.

**Billing & Subscriptions**: `subscriptions`, `plan_catalog`,
`usage_counters`, `feature_flags`, `feature_usage_events`, `invoices`,
`invoice_number_counters`, `gst_settings`, `gst_state_codes`,
`refund_ledger`, `renewal_engine_logs`, `renewal_notifications`,
`coupons`, `order_discounts`, `bulk_pricing_tiers`,
`pricing_change_history`, `pricing_rules`.

**Commerce/Orders**: `orders`, `payments`, `product_skus`,
`webhook_events`.

**AI**: `ai_call_screenings`, `ai_receptionist_rules`,
`ai_consultant_events`.

**Admin/Security**: `admin_users`, `admin_roles`, `admin_permissions`,
`admin_audit_logs`, `admin_session_revocations`, `audit_logs`,
`security_rules`, `rate_limit_events`, `pin_lockouts`,
`pin_recovery_otps`, `env_config`, `system_config`,
`schema_migrations`.

**Manufacturing/Fulfilment**: `manufacturing`, `manufacturing_qc`,
`inventory_items`, `inventory_batches`, `inventory_movements`,
`packaging_records`, `installation_jobs`, `installation_job_photos`,
`shipments`, `tracking_events`, `delivery_events`, `delivery_logs`,
`warranties`, `warranty_claims`.

**Partner/Dealer**: `partner_applications`, `partner_kyc_documents`,
`partner_price_lists`, `partner_product_visibility`,
`commission_rules`, `dealer_commissions`,
`commission_settlement_batches`, `territory_price_lists`,
`plate_dealer_assignments`.

**Property/Society**: `organizations`, `properties`, `towers`,
`floors`, `units`, `residents`, `society_admins`,
`society_subscriptions`, `common_area_qr`, `guards`, `guard_checkins`.

**Customer Growth/Success**: `customer_health`, `customer_segments`,
`customer_interviews`, `customer_onboarding`, `nps_responses`,
`retention_events`, `referrals`, `referral_logs`, `campaigns`,
`customer_reviews`, `beta_users`.

**Support**: `support_tickets`, `ticket_comments`, `feedback_logs`,
`bug_reports`, `feature_requests`.

**Observability**: `error_logs`, `system_alerts`, `backup_snapshots`.

## Row Level Security (RLS)

39 `ENABLE ROW LEVEL SECURITY` statements found across the migrations
(starting with `sql/02_rls_policies.sql` and reinforced/fixed in later
migrations, e.g. `sql/10_security_hardening.sql`,
`sql/19_admin_data_rls_fix.sql`, `sql/21b_storage_rls.sql`,
`sql/61_phase9_security_hardening.sql`,
`sql/65_fix_owner_id_rls_mismatch.sql`,
`sql/70_plates_public_lookup_hardening.sql`). RLS is a recurring,
actively-maintained concern — several migrations exist specifically to
*fix* prior RLS mismatches, not just add new policies.

## Realtime

35 references to Supabase's `supabase_realtime` publication across the
migrations. Tables explicitly added to realtime include (non-exhaustive):
`visitor_logs`, `notifications`, `security_rules`, `voice_notes`,
`status_history` (`sql/03_realtime_seed.sql`), `conversations`,
`messages` (`sql/31_unified_messaging.sql`), `customer_onboarding`,
`customer_health` (`sql/11_beta_launch_schema.sql`), among others. This
is the backbone of live visitor-notification and messaging features.

## Edge Functions (business logic boundary)

41 Edge Functions in `supabase/functions/` (see
`services/services.md` and `features/features.md` for how each is used
by frontend services). Shared helpers live in
`supabase/functions/_shared/`: `adminAuth.ts`, `aiSessionAuth.ts`,
`backupSnapshot.ts`, `callbackAuth.ts`, `commercePricing.ts`, `cors.ts`,
`edgeRateLimit.ts`, `premiumQr.ts`, `pricing.ts`, `requestId.ts`,
`totp.ts`, plus a `providers/` subfolder. `pricing.ts` is explicitly
documented in-code as the single server-side source of truth for
hardware prices (see `products/products.md`).

## Business Ownership Summary

| Domain | Primary owning department (functional) |
|---|---|
| Identity/Plates, Communication, WebRTC | Engineering |
| AI tables | AI/Receptionist |
| Billing/Subscriptions, Commerce | Finance/Billing |
| Admin/Security | Admin/Compliance |
| Manufacturing/Fulfilment | Operations/Fulfilment |
| Partner/Dealer | Partnerships |
| Property/Society | Property/Society Management |
| Customer Growth/Success, Support | Customer Success |
| Observability | Engineering |

## Notes for AI Executives

- Treat this document as a map, not the map's territory — always defer
  to the actual `sql/` migrations and live Supabase schema for anything
  a decision depends on.
- No schema change, RLS change, or data write of any kind was performed
  while compiling this document.
- The gap between the ~10-table `DATABASE_SCHEMA.md` and the ~100+
  actual tables is itself a useful signal: top-level docs here lag the
  codebase significantly and should not be trusted for current state
  without cross-checking `sql/`.
