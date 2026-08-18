# ai/dashboard

## Purpose
The future human-facing surface for SDOS — a place for Mubashir (or other
humans) to observe what the AI executives are doing, review their
decisions, and intervene if needed.

## Status
Phase 15B (foundation) + Phase 17 (live read gateway) implemented —
`index.html`, `dashboard.js`, `dashboard.css`. Standalone, no network
call on page load. The Permission Runtime panel is live (real
`ai/core/permissions/permissionEngine.js` calls, no network). The
Event Log panel defaults to fixture data, clearly labeled; real
`sdos_events` / `sdos_event_lifecycle` rows can be loaded on demand,
only after the founder pastes an admin session token, through the
new authenticated, read-only `sdos-dashboard-gateway` Edge Function
(see ADR-0017) — `sdos_events` / `sdos_event_lifecycle` still have no
client-readable RLS policy, so this page never queries them directly
(see ADR-0014, ADR-0015, ADR-0017). Nothing here is wired into
`admin.html`, `app.html`, or any other existing SmartDoor page.

## What will eventually go here
- A separate, standalone view (likely its own HTML/JS surface) for
  monitoring SDOS activity
- Executive status, decision logs, and workflow run history, rendered
  for human review

## What does NOT go here
- Any modification to SmartDoor's existing dashboards (`admin.html`,
  `app.html`, `society-admin.html`, `partner-portal.html`, etc.) — the
  SDOS dashboard, when built, will be additive and separate, not a
  replacement or edit of those files
