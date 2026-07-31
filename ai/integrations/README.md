# ai/integrations

## Purpose
The boundary layer between SDOS and the outside world — most importantly,
the existing SmartDoor backend (Supabase database and Edge Functions),
which remains the single source of truth for all business data.

## Status
**SDOS Phase 10 (Read-Only Integration Layer + ADRs).** This phase
documents, for the first time, what each future SDOS integration would
be — its purpose, capabilities, read-only access policy, authentication
approach, data contracts, error handling, security considerations, rate
limits, and future capability — for eight boundary points: `github/`,
`supabase/`, `groq/`, `razorpay/`, `firebase/`, `analytics/`,
`notifications/`, and `storage/`.

**This remains an architecture and documentation phase only.** Per
`READONLY_POLICY.md` and `ai/core/permissions/READONLY_INTEGRATION_POLICY.md`
(which this phase extends, not replaces), Phase 10 ships **zero**
executable integration code, **zero** external network calls, and
**zero** connections to any real service. No read or write access to
SmartDoor's database, Razorpay, Groq, Firebase, or any other external
system exists after this phase, exactly as it did not exist before it.
Every file below describes future intent — clearly labeled "Future SDOS
Capability" where relevant — not current behavior.

See `INTEGRATION_REGISTRY.md` for the full list of documented
integrations and their status, `DATA_CONTRACTS.md` for the shared
input/output contract shape every integration follows,
`READONLY_POLICY.md` for this folder's own read-only gate, and
`SECURITY_GUIDELINES.md` for the security posture every future
integration must satisfy before any code is written against it.

## What will eventually go here
- A read-only (initially) client for querying SmartDoor's Supabase data
  for AI executives to reason over
- Any future integrations SDOS needs (e.g. calendar, messaging, external
  APIs) that are separate from SmartDoor's own existing integrations
  (Razorpay, Twilio/Exotel, FCM, Groq, etc., which stay exactly where
  they are in `services/` and `supabase/functions/`)

## What does NOT go here
- SmartDoor's own existing integrations — these are not duplicated,
  wrapped, or reimplemented here in Phase 0 or any future phase unless
  explicitly requested
- Any code that writes to production data without an explicit, separate
  decision to allow it — Phase 0 is read-nothing, write-nothing
