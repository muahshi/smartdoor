# ai/dashboard

## Purpose
The future human-facing surface for SDOS — a place for Mubashir (or other
humans) to observe what the AI executives are doing, review their
decisions, and intervene if needed.

## Status
Phase 15 (read-only foundation). `index.html` + `dashboard.js` +
`dashboard.css` implement a standalone, read-only page with two
panels: sample Permission Engine checks (computed live, in-browser, by
the real `ai/core/permissions/permissionEngine.js`) and a static
fixture SDOS Event Log shaped to match `sdos_events` /
`sdos_event_lifecycle`. No production database connection, no
Supabase credential, no write control, no executive control, and no
Event Bus activation control exist on this page. Nothing here is
wired into `admin.html`, `app.html`, or any other existing SmartDoor
page, and no existing SmartDoor page links to it. See
`ai/adr/ADR-0014-Phase-15-Permission-Runtime-And-Dashboard-Foundation.md`
for full scope.

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
