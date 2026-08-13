# Rollback Strategy

## Status

Planning only. Nothing described below has ever been enabled, so
nothing has ever needed to be rolled back. This document defines how a
future implementation must be disableable before it is ever built,
consistent with `EVENT_BUS.md` Delivery Contract Rule 4 and
`PRODUCTION_BOUNDARY.md`'s "must never be modified automatically"
list.

## Guiding Principle

Every future SDOS component this Phase 13B plan describes is additive
and isolated by construction (per
`EVENT_BUS_IMPLEMENTATION_PLAN.md`'s Option E recommendation: a
dedicated table, never a join against or write to any existing
production table). This means rollback is structurally simple — disable
or remove the isolated additions, and every production system listed
below is provably unaffected because none of them were ever written
to.

## Systems Confirmed Unaffected by Enabling or Disabling SDOS

Per direct inspection of the repository, disabling any future SDOS
component must never affect:

- **SmartDoor customer flows** — nameplate commerce, subscription
  management, dashboard, owner premium features (all in `js/`,
  `services/`, `dashboard/`) — none of these read from or write to any
  SDOS table.
- **Existing AI Receptionist** — `supabase/functions/groq-proxy`,
  `js/groq.js`, and the AI Receptionist/Product Consultant prompts —
  these use production's own `groq-proxy` endpoint and credential,
  never SDOS's separately-budgeted future Groq path
  (`TOKEN_BUDGETING.md`'s explicit "never a request that reuses or
  competes with `groq-proxy`'s own numbers").
- **Existing Groq functionality generally** — same isolation as above.
- **Calling/WebRTC** — `services/webrtcSignaling.js`,
  `services/webrtcOwnerCall.js`, `js/webrtcCallUI.js` — these use their
  own existing Realtime channels; a future SDOS event channel is
  additive and separate, never a reuse of the WebRTC signaling
  channel.
- **Supabase** — the platform itself is unaffected; only a new,
  isolated table and channel are proposed, both fully droppable
  without touching any existing table, function, or channel.
- **Payments** — Razorpay integration (`create-razorpay-order`,
  `razorpay-webhook`, `razorpay-refund`, `verify-razorpay-payment`) —
  SDOS never reads or writes these paths per `PRODUCTION_BOUNDARY.md`.
- **Authentication** — `admin-login`, `verify-pin`, `set-owner-pin`,
  `owner-forgot-pin` and the broader auth bridge — untouched; SDOS has
  no authentication surface of its own in this phase.
- **Production database** — no existing table is ever written to; see
  `PRODUCTION_BOUNDARY.md`.

## How a Future Implementation Is Disabled

1. **Message/event production halted at the source.** Since every
   future SDOS write is additive (a new table, per
   `EVENT_BUS_IMPLEMENTATION_PLAN.md`), disabling SDOS is a matter of
   stopping new writes to that table — no production table's write
   path needs to change, because none was ever modified to accommodate
   SDOS in the first place.
2. **Realtime channel unsubscribed.** Any future SDOS-specific
   Realtime channel is separate from every existing production
   channel (per `ROLLBACK_STRATEGY.md`'s "Systems Confirmed
   Unaffected" list above); removing it removes only SDOS's own live
   propagation, never any customer-facing channel.
3. **Table left in place or dropped, founder's choice.** Because the
   table is isolated and append-only (never joined against production
   data), a future rollback may either leave it as a historical record
   (consistent with `EVENT_BUS.md`'s append-only rule — even disabling
   SDOS does not retroactively delete its own audit history unless the
   founder explicitly chooses to) or drop it entirely — both are safe,
   since no production system depends on its existence.
4. **No Edge Function to redeploy.** Since Phase 13B does not create
   the event bus or agent transport (per the brief's explicit
   constraint), there is no deployed SDOS-specific Edge Function to
   roll back in this phase — a future implementation phase that does
   deploy one should structure it so its removal is equally
   isolated, following the same principle.

## Rollback Verification

A future rollback is considered complete when:

1. No new rows are written to any SDOS-owned table.
2. Every production system in the "Systems Confirmed Unaffected" list
   continues operating exactly as it did before SDOS was ever enabled
   — verifiable because none of them were ever modified to depend on
   SDOS.
3. `PRODUCTION_BOUNDARY.md`'s "must never be modified automatically"
   list remains, after rollback, in the same state it was in before
   SDOS was ever enabled.

## What This Plan Does Not Do

- Does not describe a rollback for anything currently built, because
  nothing is currently built.
- Does not propose a feature-flag mechanism, deployment pipeline
  change, or specific migration-down script — those are
  implementation-phase decisions once an actual table and channel
  exist to roll back.

## Dependencies

- `PRODUCTION_BOUNDARY.md` (the boundary this strategy confirms stays
  intact through rollback)
- `EVENT_BUS_IMPLEMENTATION_PLAN.md` (the isolated table/channel this
  strategy assumes)
