# ai/dashboard

## Purpose
The future human-facing surface for SDOS — a place for Mubashir (or other
humans) to observe what the AI executives are doing, review their
decisions, and intervene if needed.

## Status
Empty. Phase 0 does not implement any UI, page, or component. Nothing
here is wired into `admin.html`, `app.html`, or any other existing
SmartDoor page.

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
