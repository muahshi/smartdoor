# Feature Catalogue — My Smart Door

> Grouped by business domain. Each feature lists the primary files
> involved (not exhaustive line-by-line), what it depends on, its
> business impact, and how a future AI executive might use it. Compiled
> from `services/`, `js/`, `supabase/functions/`, and `sql/`.

---

## 1. Visitor Communication

### Masked Calling (WebRTC Tap-to-Talk)
- **Purpose**: Let a visitor call the owner in real time without either
  party seeing the other's real phone number.
- **Files**: `services/webrtcCall.js`, `services/webrtcOwnerCall.js`,
  `services/webrtcSignaling.js`, `js/webrtcCallUI.js`,
  `js/visitorCallUI.js`, Edge Functions `get-turn-credentials`,
  `initiate-call`, `call-status-webhook`.
- **Dependencies**: Supabase Realtime (signaling), TURN/STUN credentials,
  `rtc_call_attempts` / `rtc_call_claims` / `rtc_presence_events` tables.
- **Business impact**: Core differentiator — the "premium digital
  intercom experience" promised in `llms.txt`. Directly gates the
  visitor's first impression.
- **Future AI usage**: Call-quality/reliability monitoring, anomaly
  detection on failed call rates (this is the subsystem `[[smartdoor]]`
  memory notes as under active debugging today).

### Masked Calling (Telephony fallback — Exotel/Twilio)
- **Purpose**: PSTN-based masked calling as primary/fallback provider
  when WebRTC isn't viable.
- **Files**: `services/exotel.js` (primary), `services/twilio.js`
  (secondary/fallback), `services/communication.js` (orchestrator).
- **Business impact**: Reliability safety net for the core calling
  feature across visitor device/network variance.

### Voice Notes
- **Purpose**: Visitor can leave a voice note instead of calling live.
- **Files**: `services/voiceNotes.js`, `voice_notes` table.
- **Business impact**: Lower-friction visitor engagement path,
  especially when the owner is unavailable.

### Text Messaging / Unified Messaging
- **Purpose**: Threaded messaging between visitor and owner.
- **Files**: `services/messaging.js`, `services/communicationCenter.js`,
  `conversations` / `messages` tables (Phase 4 unification per
  `sql/31_unified_messaging.sql`, `sql/32_conversation_unification_v2.sql`).
- **Business impact**: Primary async communication channel; feeds the
  owner's Inbox module.

### Visitor Memory
- **Purpose**: Recognize/remember repeat visitors (e.g. regular delivery
  agents) to personalize the experience.
- **Files**: `services/visitorMemory.js`, `visitor_memory`,
  `visitor_profiles`, `visitor_visits` tables.
- **Business impact**: Reduces repeat-visitor friction; feeds AI
  receptionist context.

### Emergency / SOS Alerts
- **Purpose**: Visitor-triggered emergency alert to the owner.
- **Files**: `emergency_events` table; surfaced via
  `services/communication.js` / notification pipeline.
- **Business impact**: Safety feature called out explicitly in
  `README.md`'s visitor feature list.

---

## 2. AI Receptionist Suite

### AI Receptionist (pre-call screening)
- **Purpose**: Screen/triage a visitor before ringing the owner.
- **Files**: `services/aiReceptionist.js`, `services/aiReceptionistRules.js`
  (owner-configurable rules engine), `services/aiReceptionistAnalytics.js`,
  `js/aiReceptionistRulesUI.js`, `js/aiReceptionistAnalyticsUI.js`,
  `ai_call_screenings`, `ai_receptionist_rules` tables, `groq-proxy`
  Edge Function.
- **Business impact**: Flagship Premium-tier feature ("AI receptionist +
  full visibility" per the plan catalog description).
- **Future AI usage**: This is the most direct precedent for how a
  future SDOS "AI executive" would call Groq via `groq-proxy` and honor
  `ai-session-token` auth — the pattern is proven in production here.

### AI Voice Receptionist (conversation engine)
- **Purpose**: Full conversational AI answering for the owner, not just
  screening.
- **Files**: `services/aiVoiceReceptionist.js`, `js/aiVoiceReceptionistUI.js`,
  `sql/53_ai_voice_receptionist.sql`, `sql/54_ai_receptionist_intelligence.sql`.
- **Business impact**: Higher-tier differentiator; deeper AI investment
  than screening alone.

### AI Owner Assistant
- **Purpose**: AI assistant surface for the owner (not the visitor side).
- **Files**: `services/aiOwnerAssistant.js`, `js/aiOwnerAssistantUI.js`,
  `sql/55_ai_owner_assistant.sql`.
- **Business impact**: Owner-facing AI value-add, separate product
  surface from the visitor-facing receptionist.

### AI Insight Cards
- **Purpose**: Summarized, AI-generated insights (likely for
  admin/owner dashboards).
- **Files**: `services/aiInsights.js`, `js/adminAIInsights.js`.

### AI Sales Consultant
- **Purpose**: AI chat widget that helps prospective customers on the
  product pages choose a plate.
- **Files**: `js/aiProductConsultant.js`, `js/aiConsultantKnowledge.js`,
  `js/aiConsultantAnalytics.js`, `ai_consultant_events` table,
  `sql/68_ai_consultant_analytics.sql`, `sql/69_ai_consultant_insights.sql`.
- **Business impact**: Pre-sales conversion tool; reuses `groq-proxy`
  (per project memory: "AI sales chat widget reusing `groq-proxy`").

### Shared AI Infrastructure
- **Files**: `groq-proxy` Edge Function (all AI features route through
  this single proxy), `ai-session-token` Edge Function +
  `supabase/functions/_shared/aiSessionAuth.ts` (short-lived signed
  session tokens), `js/aiSessionClient.js` (client helper), `js/groq.js`.
- **Business impact**: This is the *only* AI-to-LLM boundary in
  production today. SDOS's future `ai/integrations/` layer should treat
  this as prior art, not something to duplicate.

---

## 3. QR & Plate Lifecycle

### QR Generation
- **Purpose**: Generate the unique QR code linking a physical plate to
  its digital visitor page.
- **Files**: `services/qr.js`, `generate-qr` Edge Function,
  `vendor/qrcode/`.

### Plate Activation
- **Purpose**: Owner claims/activates a plate after delivery, binding it
  to their account and PIN.
- **Files**: `services/activation.js`, `js/activationWizard.js`,
  `onboarding.html`, `activation_events` table.
- **Business impact**: Critical conversion step between "delivered
  hardware" and "active paying customer"; memory notes this pipeline
  has previously had wiring breaks that were fixed.

### Plate Status Management
- **Purpose**: Track plate lifecycle: inactive → active → suspended.
- **Files**: `services/plates.js`, `plates` table,
  `admin-plate-status` Edge Function.

### Quality Control
- **Purpose**: Validate a plate/QR before it ships.
- **Files**: `services/qualityControl.js`, `manufacturing_qc` table.

### Replacement & Ownership Transfer
- **Purpose**: Handle lost/damaged plate replacement and transferring a
  plate to a new owner (e.g. property sold).
- **Files**: `services/replacementTransfer.js`, `ownership_transfers`,
  `replacement_requests` tables, `admin-transfer-ownership` Edge Function.

---

## 4. Owner Experience

### Owner Dashboard
- **Purpose**: Central owner surface — communications, notifications,
  plate/family/subscription management.
- **Files**: `js/dashboard.js`, `app.html`.

### Notifications (in-app + push)
- **Purpose**: Notify owners of visitor activity in real time.
- **Files**: `services/notifications.js`, `services/notificationDispatcher.js`,
  `services/push.js`, `js/notificationCenter.js`, `send-push` Edge
  Function, `notifications`, `push_subscriptions`,
  `push_delivery_logs` tables. FCM-based per project memory.

### Owner Presence
- **Purpose**: Track whether the owner is currently available (affects
  call routing/receptionist behavior).
- **Files**: `services/presence.js`, `rtc_presence_events`,
  `owner_devices` tables.

### Family Members
- **Purpose**: Multiple household members can be linked to one plate.
- **Files**: `family_members` table; server-side limit enforcement per
  `sql/66_family_member_server_side_limit.sql`.

### Forgot PIN / Auth
- **Purpose**: PIN-based owner login and self-service recovery.
- **Files**: `services/auth.js`, `js/forgotPin.js`,
  `owner-forgot-pin` / `set-owner-pin` / `verify-pin` Edge Functions,
  `pin_lockouts`, `pin_recovery_otps` tables. `verify-pin` is flagged as
  "under investigation" in `CURRENT_STATUS.md`.

---

## 5. Subscriptions & Billing

### Plan Catalog & Subscriptions
- **Purpose**: The three-tier SaaS system (Free/Premium/Enterprise) and
  per-owner subscription state.
- **Files**: `services/plans.js`, `services/subscriptions.js`,
  `js/subscriptionManager.js`, `subscriptions`, `plan_catalog` tables,
  `sql/46_saas_billing_schema.sql`, `activate-subscription`,
  `create-subscription-order`, `manage-subscription`,
  `verify-subscription-payment` Edge Functions.

### Grace Period & Renewal
- **Purpose**: Soft-landing when a subscription expires (grace window)
  before auto-downgrade to Free; automated renewal reminders/engine.
- **Files**: `services/gracePeriod.js`, `services/renewalEngine.js`,
  `renewal_engine_logs`, `renewal_notifications` tables,
  `renewal-engine-cron` Edge Function.

### Usage Limits & Feature Flags
- **Purpose**: Gate feature access by plan tier; toggle features
  independent of plan (e.g. staged rollouts).
- **Files**: `services/usageLimits.js`, `services/featureFlags.js`,
  `usage_counters`, `feature_flags`, `feature_usage_events` tables.

### GST Invoicing & Payments
- **Purpose**: Compliant Indian GST invoicing; Razorpay payment
  processing and refunds.
- **Files**: `services/gstInvoicePdf.js`, `services/payments.js`,
  `services/invoices.js`, `services/webhooks.js`,
  `create-razorpay-order`, `verify-razorpay-payment`,
  `razorpay-webhook`, `razorpay-refund` Edge Functions,
  `sql/58_gst_billing_phase8b.sql`, `gst_settings`,
  `gst_state_codes`, `invoices`, `invoice_number_counters`,
  `refund_ledger` tables.
- **Business impact**: Legal/financial compliance surface — highest
  scrutiny area; explicitly out of scope for any SDOS modification.

### Coupons & Discounts
- **Purpose**: Promotional pricing.
- **Files**: `coupons`, `order_discounts`, `bulk_pricing_tiers` tables,
  `validate-coupon` Edge Function.

---

## 6. Admin & Provisioning

### Admin Portal Core
- **Purpose**: Internal staff tooling for customer/plate/order
  management.
- **Files**: `services/admin.js`, `services/adminData.js`,
  `services/adminAnalytics.js`, `admin.html`, `admin-login.html`,
  `admin-data`, `admin-login`, `admin-analytics` Edge Functions.

### Provisioning
- **Purpose**: Create customer + plate records (single and bulk).
- **Files**: `services/adminProvisioning.js`,
  `admin-provision-customer`, `admin-bulk-provision` Edge Functions.
- **Business impact**: `PROJECT_STATE.md` lists "Bulk Provisioning" as
  still pending — a real, current gap.

### Admin RBAC
- **Purpose**: Role-based permissions for internal staff.
- **Files**: `admin_roles`, `admin_permissions`, `admin_users`,
  `admin_session_revocations` tables, per
  `sql/34_enterprise_rbac_phase5.sql`.

### Audit Logging
- **Purpose**: Record sensitive admin actions for accountability.
- **Files**: `services/logs.js`, `audit_logs`, `admin_audit_logs` tables.

### Manufacturing & Packaging
- **Purpose**: Track physical production — inventory, batches, print
  packs, packaging records.
- **Files**: `services/manufacturing.js`, `services/packaging.js`,
  `manufacturing`, `inventory_items`, `inventory_batches`,
  `inventory_movements`, `packaging_records` tables,
  `admin-print-pack` Edge Function. "Manufacturing print packs" and
  "Manufacturing dashboard" are listed as pending/upcoming in
  `PROJECT_STATE.md` / `CURRENT_STATUS.md`.

### Shipping & Delivery
- **Purpose**: Track a plate from dispatch to doorstep.
- **Files**: `services/shipping.js`, `shipments`, `tracking_events`,
  `delivery_events`, `delivery_logs` tables.

---

## 7. Partner / Dealer Platform (Phase 8C)

- **Purpose**: Let third-party dealers/franchises onboard, get KYC'd,
  see partner-specific pricing, sell plates, and earn commission.
- **Files**: `services/partnerOnboarding.js`, `partner-apply.html`,
  `partner-portal.html`, `partner-review.html`, `partner-application`,
  `partner-data` Edge Functions, `partner_applications`,
  `partner_kyc_documents`, `partner_price_lists`,
  `partner_product_visibility`, `commission_rules`,
  `dealer_commissions`, `commission_settlement_batches`,
  `territory_price_lists`, `plate_dealer_assignments` tables
  (`sql/58_partner_onboarding_kyc.sql` through
  `sql/60_partner_commission_settlement_engine_phase8c3.sql`).
- **Business impact**: The company's channel-expansion mechanism beyond
  direct-to-consumer.

---

## 8. Property / Society Management

- **Purpose**: Multi-unit buildings (apartments, societies, offices) as
  a distinct customer type from single-home owners.
- **Files**: `services/propertyManagement.js`, `services/societyAdmin.js`,
  `services/societyAnalytics.js`, `society-admin.html`,
  `organizations`, `properties`, `towers`, `floors`, `units`,
  `residents`, `society_admins`, `society_subscriptions`,
  `common_area_qr` tables (`sql/14_property_management_schema.sql`).

### Guard Panel
- **Purpose**: On-site security guard interface for society/office
  gates.
- **Files**: `services/guardPanel.js`, `guard.html`, `guards`,
  `guard_checkins` tables.

### Visitor Pass
- **Purpose**: Pre-authorized visitor passes (e.g. expected guest).
- **Files**: `services/visitorPass.js`, `visitor_passes` table.

---

## 9. Customer Growth, Success & Retention

- **Files**: `services/customerGrowth.js`, `services/customerSuccess.js`,
  `services/retention.js`, `customer_health`, `customer_segments`,
  `customer_interviews`, `customer_onboarding`, `nps_responses`,
  `retention_events`, `referrals`, `referral_logs`, `campaigns` tables.
- **Business impact**: Post-purchase lifecycle management — health
  scoring, NPS, referral loops, win-back campaigns.

### Support
- **Files**: `services/support.js`, `support_tickets`,
  `ticket_comments`, `feedback_logs`, `bug_reports`,
  `feature_requests` tables.

---

## 10. Security, Monitoring & Compliance

- **Rate limiting**: `services/rateLimiter.js`, `rate_limit_events`,
  `supabase/functions/_shared/edgeRateLimit.ts`.
- **Input sanitization**: `services/sanitize.js`.
- **Security rules engine**: `services/security.js`, `security_rules`
  table.
- **Monitoring/observability**: `services/monitoring.js`,
  `js/monitoring-bootstrap.js`, `js/debugOverlay.js`,
  `js/adminErrorCapture.js`, `error_logs`, `system_alerts`,
  `log-client-error` Edge Function
  (`sql/62_observability_reliability_phase10.sql`).
- **Backups**: `scheduled-backup` Edge Function,
  `supabase/functions/_shared/backupSnapshot.ts`, `backup_snapshots`
  table.
- **Environment validation**: `services/envValidator.js`, `env_config`
  table.
- **Legal documents**: `legal/*.html`, generated from
  `docs/legal/*.md` via `docs/legal/generate_legal_pages.py`.

---

## Notes for AI Executives

- This catalogue reflects what the code actually implements as of this
  read. Cross-check against `documents/documents.md` for known
  discrepancies between top-level status docs and the real codebase.
- No feature listed here was modified, extended, or reimplemented as
  part of producing this document.
