# ai/dashboard

## Purpose
The future human-facing surface for SDOS — a place for Mubashir (or other
humans) to observe what the AI executives are doing, review their
decisions, and intervene if needed.

## Status
Phase 15B (foundation) implemented — `index.html`, `dashboard.js`,
`dashboard.css`. Read-only, standalone, no credentials, no network
calls. The Permission Runtime panel is live (real
`ai/core/permissions/permissionEngine.js` calls); the Event Bus and
Event Log panels are fixture data, clearly labeled — no
`ai/integrations/` read client exists yet, and `sdos_events` /
`sdos_event_lifecycle` have no client-readable RLS policy (see
ADR-0014, ADR-0015). Nothing here is wired into `admin.html`,
`app.html`, or any other existing SmartDoor page.

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
