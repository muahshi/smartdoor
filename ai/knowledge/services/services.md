# Services — My Smart Door (`services/` module catalogue)

> 67 modules in `services/`. Purpose is taken from each file's own
> header comment (ground truth, not inferred). "Future executive owner"
> is a **proposed, non-binding** mapping for when SDOS eventually stands
> up AI executives (Phase 2+) — no executive exists yet, and nothing
> here wires any executive to any service.

| Service | Purpose (from file header) | Used by (typical caller) | Future executive owner (proposed) |
|---|---|---|---|
| `activation.js` | Activation Engine | `js/activationWizard.js`, `onboarding.html` | COO (Operations) |
| `activityCenter.js` | Owner Activity Center | `js/dashboard.js` | COO |
| `admin.js` | Admin Core Service | `admin.html` | COO |
| `adminAnalytics.js` | Admin Analytics Service | `admin.html` | CFO / COO |
| `adminData.js` | Admin Data Service | `admin.html` | COO |
| `adminProvisioning.js` | Admin Provisioning Service | `admin.html` | COO |
| `aiInsights.js` | AI Insight Cards Service | `js/adminAIInsights.js` | CTO (AI) |
| `aiOwnerAssistant.js` | AI Owner Assistant | `js/aiOwnerAssistantUI.js` | CTO (AI) |
| `aiReceptionist.js` | AI Receptionist (pre-call screening) | `visitor.html` | CTO (AI) |
| `aiReceptionistAnalytics.js` | AI Receptionist Analytics | `js/aiReceptionistAnalyticsUI.js` | CTO (AI) |
| `aiReceptionistRules.js` | AI Voice Receptionist, Owner Rules Engine | `js/aiReceptionistRulesUI.js` | CTO (AI) |
| `aiVoiceReceptionist.js` | AI Voice Receptionist, Conversation Engine | `visitor.html` | CTO (AI) |
| `analytics.js` | Admin Analytics Service | `admin.html` | CFO / COO |
| `auth.js` | Auth Service | `login.html`, `app.html` | CTO |
| `commerce.js` | Commerce Service (Phase 8A) | `products.html`, `product.html` | CFO |
| `communication.js` | Communication Engine (Orchestrator) | `visitor.html` | CTO |
| `communicationCenter.js` | Communication Center (Phase 7C) | `app.html` | CTO |
| `customerGrowth.js` | Customer Growth Service | `admin.html` | COO / Growth |
| `customerSuccess.js` | Customer Success Service | `admin.html` | COO / Support |
| `customers.js` | Admin Customers Service | `admin.html` | COO |
| `email.js` | Email Service | `send-email` Edge Function callers | CTO (infra) |
| `envValidator.js` | Startup Environment Validator | app bootstrap | CTO (infra) |
| `exotel.js` | Exotel Provider (Primary) | `services/communication.js` | CTO |
| `featureFlags.js` | Feature Flags Service (Phase 1) | multiple | CTO |
| `gracePeriod.js` | Grace Period Engine | `services/subscriptions.js` | CFO |
| `gstInvoicePdf.js` | GST Invoice PDF Service | `services/invoices.js` | CFO |
| `guardPanel.js` | Guard Panel Service | `guard.html` | COO |
| `httpClient.js` | Shared HTTP Client (Production Hardening — Phase 6) | most services | CTO (infra) |
| `invoices.js` | Invoices Service | `app.html` billing views | CFO |
| `logs.js` | Logs Service | `admin.html` | CTO (infra) |
| `manufacturing.js` | Admin Manufacturing Service | `admin.html` | COO |
| `messaging.js` | Unified Messaging Service (Phase 4) | `app.html`, `visitor.html` | CTO |
| `monitoring.js` | Monitoring & Observability Layer | app bootstrap | CTO (infra) |
| `notificationDispatcher.js` | Notification Dispatcher (Production) | backend triggers | CTO |
| `notifications.js` | Notification Engine | `app.html` | CTO |
| `orders.js` | Orders Service | `products.html` checkout | CFO |
| `packaging.js` | Packaging System | `admin.html` | COO |
| `partnerOnboarding.js` | Partner Onboarding Service | `partner-apply.html`, `partner-portal.html` | COO / Partnerships |
| `payments.js` | Payments Service (Razorpay) | checkout flows | CFO |
| `plans.js` | Plan Catalog Service | `js/subscriptionManager.js` | CFO |
| `plates.js` | Plates Service | `admin.html`, `app.html` | COO |
| `presence.js` | Owner Presence Service (Phase 1) | `visitor.html` call routing | CTO |
| `propertyManagement.js` | Property Management Service | `society-admin.html` | COO |
| `push.js` | Owner Push Subscription Service (Phase 4c, FCM) | `app.html` | CTO |
| `qr.js` | QR Generation Service | `admin-provision-customer` flow | COO |
| `qualityControl.js` | Quality Control & QR Validation | `admin.html` manufacturing | COO |
| `rateLimiter.js` | Rate Limiting Service | Edge Functions | CTO (security) |
| `renewalEngine.js` | Renewal Engine | `renewal-engine-cron` | CFO |
| `replacementTransfer.js` | Replacement & Ownership Transfer | `admin.html` | COO |
| `retention.js` | Retention Engine | `admin.html` | COO / Growth |
| `sanitize.js` | Input Sanitization & Validation | most services | CTO (security) |
| `security.js` | Security Rules Service | `admin.html` | CTO (security) |
| `shipping.js` | Shipping Integration | `admin.html` fulfilment | COO |
| `sms.js` | SMS Service (Architecture) | notification flows | CTO |
| `societyAdmin.js` | Society Admin Service | `society-admin.html` | COO |
| `societyAnalytics.js` | Society Analytics Service | `society-admin.html` | COO |
| `subscriptions.js` | Subscription Activation Service (Extended) | checkout, `app.html` | CFO |
| `supabase.js` | Supabase Client | virtually all services | CTO (infra) |
| `support.js` | Admin Support Service | `admin.html` | COO / Support |
| `twilio.js` | Twilio Provider (Secondary / Fallback) | `services/communication.js` | CTO |
| `usageLimits.js` | Usage Limits & Feature Gating Service | plan-gated features | CFO / CTO |
| `visitorExperience.js` | Visitor Experience Orchestrator | `visitor.html` | CTO |
| `visitorMemory.js` | Visitor Memory System | `visitor.html` | CTO |
| `visitorPass.js` | Visitor Pass Service | `society-admin.html`, `guard.html` | COO |
| `voiceNotes.js` | Voice Notes Service | `visitor.html` | CTO |
| `webhooks.js` | Razorpay Webhook Service Architecture | `razorpay-webhook` Edge Function | CFO |
| `webrtcCall.js` | WebRTC Tap to Talk (Phase 2, Visitor Side) | `visitor.html` | CTO |
| `webrtcOwnerCall.js` | WebRTC Tap to Talk (Phase 2, Owner Side) | `app.html` | CTO |
| `webrtcSignaling.js` | WebRTC Signaling Relay (Phase 2) | both call sides | CTO |
| `whatsapp.js` | WhatsApp Provider Abstraction | notification flows | CTO |

## Notes for AI Executives

- "Used by" is the typical/primary caller inferred from naming and
  directory conventions, not a full call-graph trace — verify against
  actual imports before relying on it for a change.
- The "future executive owner" column is advisory scaffolding for
  Phase 2+ planning only. No AI executive exists yet (per this phase's
  scope), and this mapping does not grant any executive access to any
  service.
- No service file was modified while compiling this document.
