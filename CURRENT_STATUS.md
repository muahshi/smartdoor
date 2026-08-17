# SmartDoor Current Status

Completed:

✓ QR Flow
✓ Messaging
✓ Notifications
✓ Voice Notes
✓ Admin Portal
✓ Provisioning

Known Issues:

- verify-pin under investigation
- Razorpay live testing pending

Next Phase:

Phase 13
- Dealer onboarding
- Bulk plate creation
- Manufacturing dashboard

SDOS (Internal AI Ops Layer) — separate phase track, see ai/adr/:

✓ Phase 14E — Event Bus foundation + credential hardening (CLOSED)
✓ Phase 15A — Permission Runtime (permissionEngine.js, 15/15 tests)
✓ Phase 15B — Read-Only Dashboard Foundation (ai/dashboard/, Permission
  Runtime panel live, Event Log panel fixture-only)

Still OFF/not built:
- Event Bus (sdos_event_bus_enabled = FALSE)
- Executive Runtime (no executive has execution authority)
- Groq-SDOS integration
