SmartDoor Development Rules

Rule #1

Analyze the entire repository before making changes.

Never assume architecture.

Always inspect:

- SQL migrations
- Edge Functions
- Services
- HTML files
- Existing APIs

---

Rule #2

Do not create duplicate systems.

Examples:

Bad:

- Create second login system
- Create second QR system
- Create second dashboard

Good:

- Extend existing implementation

---

Rule #3

Respect Existing Database

Never rename:

- users
- plates
- subscriptions
- notifications
- message_logs
- call_logs
- audit_logs

without explicit migration planning.

---

Rule #4

Security First

All privileged operations must execute through:

- Edge Functions
- Service Role

Never expose:

- Service Role Key
- Payment Secrets
- Telephony Secrets

to the browser.

---

Rule #5

Communication Architecture

Visitor
→ SmartDoor
→ Provider
→ Owner

Never expose:

- Owner phone number
- Visitor phone number

Masked communication is mandatory.

---

Rule #6

Admin Operations

All actions must create audit logs:

- Customer Created
- PIN Reset
- Plate Suspended
- Plate Activated
- Ownership Transfer
- Subscription Changes

---

Rule #7

QR Rules

Plate IDs:

SD-XXXXXX

Must remain unique.

QR links must support:

/p/{plate_id}

and existing visitor routing.

---

Rule #8

UI Rules

Maintain SmartDoor design language:

- Dark theme
- Mobile-first
- Responsive
- Existing styling system

Do not redesign working screens unless requested.

---

Rule #9

Deployment Rules

Before finishing any task:

Verify:

- SQL migrations
- Edge Functions
- RLS compatibility
- Existing flows
- Backward compatibility

Provide:

- Files changed
- Files created
- Migration list
- Deployment checklist
- Testing checklist

---

Rule #10

SmartDoor Golden Rule

Fix wiring before creating features.

Prefer:

Extend Existing Code

over

Build New Code

at all times.
