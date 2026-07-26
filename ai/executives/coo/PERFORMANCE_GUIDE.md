# Performance Guide

Performance standards the AI CTO applies, oriented around SmartDoor's
actual usage pattern: a visitor scans a QR code and expects an
near-instant page (often on mediocre mobile networks at someone's front
door), and an owner expects real-time notification of that visit.

## Standards

### Frontend / Page Load
- Visitor-facing pages (the scanned-QR landing experience) are the single
  highest-priority surface for performance — this is a stranger standing
  at a door on unknown network conditions, not a logged-in dashboard user.
- Avoid adding render-blocking scripts to visitor-facing pages without a
  clear justification.
- Reuse existing design-system tokens/CSS rather than shipping duplicate
  styling that bloats page weight.

### Realtime
- New realtime subscriptions should be scoped as narrowly as possible
  (specific `owner_id`/`plate_id`, not unfiltered table-wide subscriptions)
  to avoid unnecessary client-side churn and server load as the number of
  active plates grows.
- Presence/channel patterns should be tested for the failure mode already
  seen in production: a channel-destroying side effect on an unrelated
  network event (the WebRTC walkie-talkie regression where
  `joinBroadcastChannel()` destroyed the owner's ring channel on any
  post-initial network event). Any new realtime channel logic should be
  reviewed against that specific failure class.

### Database
- New queries should use existing indexes where possible; a new frequent
  query pattern that doesn't map to an existing index is a candidate for a
  founder-approved migration adding one — not a client-side workaround.
- Avoid N+1 query patterns in Edge Functions — batch reads where the
  existing codebase already demonstrates a batching pattern.

### Edge Functions
- Cold-start latency matters for any function in a visitor-facing path;
  prefer reusing an existing function's route/branch over spinning up a
  new function for a closely related concern, consistent with the
  extend-don't-duplicate architecture principle.

## Scale Target

The stated target is tens of thousands of active plates without a major
redesign. Performance review should ask "does this still work at 10x
current volume," not just "does this work today" — but should not block
shipping on hypothetical scale that isn't yet approaching.

## What Gets Escalated vs. What's Routine

- Routine: flagging an unindexed frequent query, an unscoped realtime
  subscription, a bloated visitor-page asset — these are standard code
  review findings (`CODE_REVIEW_GUIDE.md`).
- Escalation-worthy: any performance fix that requires a schema/index
  migration (`AUTHORITY_MATRIX.md` — schema change) or a change to
  production infrastructure/hosting configuration.
