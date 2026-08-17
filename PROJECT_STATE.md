# SmartDoor Project State

## Current Phase
Phase 12 - Internal Admin Portal

## Production Domain
https://mysmartdoor.in

## Core Working Systems
- QR Flow
- Visitor Page
- Messaging
- Notifications
- Voice Notes
- Owner Login
- Admin Portal
- Plate Provisioning

## Pending
- Live Razorpay validation
- Forgot PIN flow
- Bulk Provisioning
- Manufacturing print packs

## Known Issues
- verify-pin investigation ongoing
- production payment testing pending

## Next Target
Phase 13

## SDOS (Internal AI Ops Layer) Status
Separate phase track from the SmartDoor product phases above — see
`ai/adr/` for full history.
- Phase 14E (Event Bus, credential hardening) — CLOSED.
- Phase 15A (Permission Runtime) — COMPLETE. `ai/core/permissions/permissionEngine.js`
  live, 15/15 tests passing.
- Phase 15B (Read-Only Dashboard Foundation) — COMPLETE. `ai/dashboard/`
  now contains `index.html`/`dashboard.js`/`dashboard.css`; Permission
  Runtime panel is live, Event Log panel is fixture data (see
  `ai/adr/ADR-0015-Phase-15B-Dashboard-Foundation-Correction.md`).
- Event Bus: `sdos_event_bus_enabled` remains FALSE.
- Executive Runtime: does not exist — no executive has execution authority.
- Groq-SDOS integration: does not exist.
