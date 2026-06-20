# Smart Door — SUPPORT RUNBOOK
## Phase 10: Production Launch

Customer-facing support procedures for live operations. This fulfills the
`docs/SUPPORT_PLAYBOOK.md` reference in `docs/BETA_LAUNCH_CHECKLIST.md`
(Phase 9), which was checklisted but never written — this is that
document, expanded for full production launch.

---

## 1. SUPPORT CHANNELS

| Channel | Use For | SLA Target |
|---|---|---|
| In-app ticket system | All issue types (primary channel) | First response < 4h business hours |
| support@mysmartdoor.in | Email fallback, written records | First response < 24h |
| WhatsApp | Urgent/active issues (e.g. SOS misfire, payment stuck) | First response < 1h |
| Phone (+91 89898 98989) | Critical escalations only | Immediate during business hours |

---

## 2. ESCALATION PATH

```
Support Agent
    ↓ (cannot resolve in 30 min, or customer-impacting bug)
Ops Manager
    ↓ (requires code/infra change, security concern, or payment dispute > ₹5,000)
Super Admin / Founder
```

Severity-based routing:
- **P0 (Critical)** — payment lost, security breach, total outage → Super Admin immediately, any hour
- **P1 (High)** — single customer payment issue, masked call not working → Ops Manager same business day
- **P2 (Medium)** — UI bug, slow response, minor confusion → Support Agent, standard SLA
- **P3 (Low)** — feature request, cosmetic issue → Logged for backlog review

---

## 3. ISSUE CATEGORY WORKFLOWS

### 3.1 Billing / Payment Issues

**"I was charged but didn't get my plate / subscription didn't activate"**
1. Look up the order in admin panel by phone number or order ID
2. Check `payment_status` in the `orders` table — if `paid` but plate not
   assigned, this is a fulfillment bug, not a payment bug → escalate to Ops
3. If `payment_status` is `failed` or `pending` but Razorpay shows captured,
   this is a webhook delivery issue → check Razorpay dashboard webhook logs,
   manually trigger reconciliation, escalate to Ops if it recurs
4. Never ask the customer to "just pay again" without first confirming the
   first payment's true status in Razorpay

**"I want a refund"**
1. Refer to `docs/legal/refund-policy.md` for eligibility
2. If eligible: process via admin panel refund tool (already wired to
   Razorpay refund API per `docs/PRODUCTION_CHECKLIST.md`)
3. If not eligible per policy but customer has a compelling case (e.g.
   defective unit past the stated window): escalate to Ops Manager for
   a discretionary call — do not unilaterally override policy

**"Duplicate charge"**
1. Confirm both charges in Razorpay dashboard
2. Refund the duplicate immediately — this is always eligible regardless
   of standard refund policy, since it's a billing error, not a change of mind

### 3.2 Communication / Call Issues

**"Masked calls aren't connecting"**
1. Check Exotel dashboard for the relevant number's call logs
2. If Exotel shows failures: confirm Twilio fallback engaged
   (`PROVIDERS` fallback array per `docs/PRODUCTION_CHECKLIST.md`)
3. If both failed: this is a P1, escalate to Ops Manager same-day
4. Ask the customer to confirm their own phone isn't blocking unknown
   numbers or has DND active — common false-positive

**"Visitor photos/voice notes not showing up"**
1. Check Supabase Storage `voice-notes` bucket for the file directly
2. Check RLS — confirm the logged-in owner's `plate_id` matches the
   visitor log's `plate_id` (most common cause of "missing" data is a
   plate ID mismatch, not actual data loss)
3. If file genuinely missing: check upload error logs in
   `services/monitoring.js` ring buffer / DB for that timeframe

**"SOS button didn't notify me"**
- Treat as P0 always, regardless of root cause. Escalate to Ops Manager
  immediately and investigate the full chain (trigger → Edge Function →
  Exotel/Twilio → WhatsApp/SMS) same day.

### 3.3 Account / Access Issues

**"I forgot my PIN" / "I'm locked out"**
1. Verify identity (registered phone number + order details)
2. Use admin panel to trigger a PIN reset flow (do not read out or set a
   PIN over the phone — always route through the secure reset flow)
3. If account shows repeated lockout attempts not from the real owner,
   flag for security review (possible brute-force attempt)

**"Someone else is accessing my account"**
- Treat as P0/P1 security issue. Force-expire all active sessions for
  that account immediately (per `docs/PRODUCTION_CHECKLIST.md` session
  revocation), then walk the customer through a secure PIN reset.

### 3.4 Shipping / Manufacturing Issues

**"My order hasn't shipped"**
1. Check manufacturing queue status in admin panel
2. Compare against SLA from `docs/BETA_LAUNCH_CHECKLIST.md` Manufacturing
   Checklist and `docs/legal/shipping-policy.md` timelines
3. If past SLA: escalate to manufacturing/ops, proactively message the customer

**"Wrong item / damaged on arrival"**
1. Request photo/video evidence per `docs/legal/refund-policy.md`
2. If valid: offer replacement or refund per policy, ship replacement on priority

### 3.5 Technical / App Issues

**"App won't load" / "Dashboard is blank"**
1. Ask for browser/device, check Sentry for matching errors in that
   timeframe (search by customer's user ID if available)
2. Check `supabase/functions/health-check` for any subsystem outage at
   the reported time
3. Common fix: clear PWA cache / reinstall — service worker (`sw.js`)
   sometimes serves stale assets after a deploy; this is a known
   trade-off of offline-first PWAs, not usually a bug

**"AI receptionist gave a weird/wrong response"**
1. Check if Groq was reachable at that time (monitoring logs)
2. If Groq was down, the mock/fallback response should have been used —
   confirm fallback path engaged correctly
3. Log the specific bad response for review — not urgent unless offensive
   or factually harmful content was generated

---

## 4. RESPONSE TEMPLATES (tone reference)

Keep responses warm, direct, and in Hinglish where the customer writes in
Hinglish — match their language. A few starting points:

**Acknowledging a payment issue:**
> "Hi [Name], maaf kijiye is inconvenience ke liye. Aapka order [ID] check kar rahe hain — 30 minute mein update milega."

**Confirming a refund:**
> "Aapka refund process ho gaya hai — ₹[amount] aapke original payment method mein 7-10 business days mein aa jayega."

**Escalation acknowledgment to customer:**
> "Yeh issue thoda technical hai, humari team isse priority par dekh rahi hai. Main aapko [timeframe] mein update dunga."

Do not promise specific timelines you can't guarantee for engineering fixes — promise *update* timelines, not *fix* timelines, unless Ops has confirmed the fix ETA.

---

## 5. WHEN TO LOOP IN ENGINEERING / OPS

Always escalate immediately (don't try to resolve solo) for:
- Any suspected security issue (unauthorized access, data exposure)
- Any payment discrepancy you can't explain from the dashboards alone
- Any pattern across multiple customers (e.g. 3+ tickets about the same
  symptom in a short window — likely a systemic issue, not individual cases)
- Anything involving a minor or safety-related SOS misfire

---

## 6. RELATED DOCUMENTS

- `OPERATIONS_RUNBOOK.md` — infra-level incident response and rollback
- `docs/legal/refund-policy.md` / `shipping-policy.md` — policy reference for customer-facing answers
- `docs/BETA_LAUNCH_CHECKLIST.md` — ticket system setup checklist
- `docs/PRODUCTION_CHECKLIST.md` — known risks and mitigations reference
