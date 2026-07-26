# Workflows — My Smart Door

> Each workflow below is reconstructed from the pages, services, and
> Edge Functions involved. These are descriptive maps of what the code
> implements — no workflow engine, automation, or new business logic was
> created as part of this document.

## 1. Visitor Workflow

```
QR Scan
  → visitor.html (loads plate via qr_slug)
  → AI pre-screening (services/aiReceptionist.js, groq-proxy)
  → Communication choice:
      • Masked call (WebRTC: services/webrtcCall.js → services/webrtcSignaling.js
        → services/webrtcOwnerCall.js on owner side; or PSTN fallback via
        services/exotel.js / services/twilio.js)
      • Voice note (services/voiceNotes.js)
      • Text message (services/messaging.js)
      • SOS/emergency alert (emergency_events)
  → Owner notification (services/notificationDispatcher.js → services/push.js
    → send-push Edge Function → FCM)
  → Visit logged (visitor_logs, visitor_visits, visitor_memory updated
    for repeat-visitor recognition)
```

## 2. Owner Workflow

```
login.html (PIN auth via services/auth.js, verify-pin function)
  → app.html dashboard (js/dashboard.js)
  → Communication Center: view messages/calls/voice notes
    (services/communicationCenter.js, services/messaging.js)
  → Notifications (js/notificationCenter.js)
  → Family member management (family_members table)
  → Subscription management (js/subscriptionManager.js →
    services/subscriptions.js, services/plans.js)
  → AI Owner Assistant available throughout (services/aiOwnerAssistant.js)
```

## 3. Checkout / Purchase Workflow

```
products.html / product.html (js/productCatalog.js, js/productConfigurator.js)
  → Add to cart / configure variant
  → create-razorpay-order Edge Function (server-authoritative pricing via
    supabase/functions/_shared/pricing.ts)
  → Razorpay checkout (customer pays)
  → verify-razorpay-payment Edge Function confirms payment
  → orders row created (services/orders.js)
  → plates row + QR generated (services/plates.js, generate-qr function)
  → 1-year privacy subscription auto-granted (services/subscriptions.js)
  → Shipping/dispatch begins (services/shipping.js)
  → razorpay-webhook reconciles payment state asynchronously as a
    safety net independent of the client-side flow
```

## 4. Manufacturing Workflow

```
Order confirmed
  → Manufacturing queue (services/manufacturing.js, manufacturing table)
  → Inventory allocation (inventory_items, inventory_batches,
    inventory_movements)
  → Quality Control check (services/qualityControl.js, manufacturing_qc)
  → Packaging (services/packaging.js, packaging_records)
  → Print pack generation (admin-print-pack Edge Function) —
    per PROJECT_STATE.md, this step is still pending/incomplete in
    production
  → Handoff to Shipping workflow
```

## 5. Delivery Workflow

```
Packaged plate
  → Shipment created (services/shipping.js, shipments table)
  → Tracking events recorded (tracking_events, delivery_events,
    delivery_logs)
  → Delivered
  → Customer proceeds to Activation (onboarding.html,
    js/activationWizard.js, services/activation.js)
  → activation_events logged; plate status inactive → active
```

## 6. Subscription Workflow

```
Initial: 1-year Premium-equivalent privacy subscription bundled free
  with hardware purchase (separate flow from hardware pricing, per
  supabase/functions/_shared/pricing.ts comments)
  → Ongoing: owner can view/manage plan in app.html
    (js/subscriptionManager.js)
  → Upgrade/downgrade/renew: create-subscription-order →
    activate-subscription → manage-subscription Edge Functions
  → Approaching expiry: renewal-engine-cron triggers
    services/renewalEngine.js → renewal_notifications sent
  → If expired without renewal: grace_until window (services/gracePeriod.js)
    keeps features alive temporarily
  → After grace period: auto-downgrade to Free plan
  → GST invoice generated for each billed transaction
    (services/gstInvoicePdf.js, invoices table)
```

## 7. Support Workflow

```
Owner/visitor issue arises
  → Support ticket created (services/support.js, support_tickets)
  → Ticket comments/updates (ticket_comments)
  → Escalation per docs/SUPPORT_ESCALATION_GUIDE.md
  → Resolution tracked; feedback/bug reports captured separately
    (feedback_logs, bug_reports, feature_requests)
  → Customer health/NPS may be updated as a downstream signal
    (customer_health, nps_responses)
```

## 8. Partner/Dealer Workflow (Phase 8C)

```
partner-apply.html submission
  → partner_applications row created (partner-application Edge Function)
  → KYC document upload (partner_kyc_documents)
  → Internal review (partner-review.html, internal staff)
  → Approved partner gets access to partner-portal.html
    (partner-data Edge Function)
  → Partner-specific pricing applied (partner_price_lists,
    territory_price_lists)
  → Sales attributed to partner (plate_dealer_assignments)
  → Commission calculated (commission_rules, dealer_commissions)
  → Periodic settlement (commission_settlement_batches)
```

## 9. Society/Property Workflow

```
Organization onboarded (organizations, properties, towers, floors, units)
  → Residents linked (residents)
  → Society admin manages via society-admin.html
    (services/societyAdmin.js, services/propertyManagement.js)
  → Guards check in at gates (guard.html, services/guardPanel.js,
    guard_checkins)
  → Visitors use common-area QR codes (common_area_qr) or unit-specific
    plates depending on deployment
  → Society-level subscription applies (society_subscriptions)
```

## Notes for AI Executives

- These workflow maps are the current best understanding from reading
  the code; they are not guaranteed to be exhaustive for edge cases
  (retries, partial failures, admin overrides).
- Several steps above are explicitly flagged elsewhere as incomplete in
  production (manufacturing print packs, bulk provisioning, live
  Razorpay validation, forgot-PIN flow, `verify-pin` investigation) —
  see `documents/documents.md` and `business/business_rules.md`.
- No workflow, trigger, or automation was created in this phase — this
  is documentation only.
