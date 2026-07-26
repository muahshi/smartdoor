# ai/integrations

## Purpose
The boundary layer between SDOS and the outside world — most importantly,
the existing SmartDoor backend (Supabase database and Edge Functions),
which remains the single source of truth for all business data.

## Status
Empty. Phase 0 does not implement any integration, client, or connection.
No read or write access to SmartDoor's database exists yet.

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
