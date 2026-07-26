# Release Guide

Release checklist and versioning discipline the AI CTO applies, scoped to
how SmartDoor actually ships today (phase-numbered feature releases into a
single production repository, not a formally versioned package).

## Release Checklist

- [ ] Scope of the release is explicitly stated (which files, which
  feature) — matches the Golden Rules "return only what changed" principle
- [ ] Every file in the release has been through `CODE_REVIEW_GUIDE.md`
- [ ] Any relevant root-level status doc (`PROJECT_STATE.md`,
  `CURRENT_STATUS.md`) is flagged for update if this release materially
  changes what they describe — the CTO flags this rather than silently
  letting docs drift further, per the discrepancy already noted in
  `ai/knowledge/documents/documents.md`
- [ ] Corresponding `ai/knowledge/` domain file(s) flagged for regeneration
  if the release changes what they describe (new table → `database.md`;
  new service → `services.md`; new feature → `features.md`)
- [ ] Release has a named rollback plan (see `DEPLOYMENT_GUIDE.md`)
- [ ] No placeholder/stub code included

## Phase-Based Release Discipline

SmartDoor ships in numbered phases (e.g. "Phase 8C Part 4," "Phase 3.2").
The CTO's release discipline for this pattern:
- Each phase should be independently reviewable and additive — not
  dependent on a simultaneous rewrite of a prior phase's work.
- A phase is not "done" until its corresponding documentation reflects
  reality, including explicitly flagging anything that was scoped out
  (precedent: the partner-portal phase explicitly listing
  "Invoices/Credit Notes," "Announcements," and "Knowledge Base" as
  deliberately left unbuilt rather than silently omitted).

## What Counts as Release-Ready

A change is release-ready when:
1. It passes `CODE_REVIEW_GUIDE.md`.
2. Every `AUTHORITY_MATRIX.md` approval it needs has been obtained.
3. It has no known open severity-1/2 bug per `BUG_TRIAGE_GUIDE.md`
   introduced by the change itself.
4. Its rollback path is understood, not just assumed.

## What the CTO Does Not Do

Does not cut the release, does not merge, does not deploy. Confirms
release-readiness and hands off to the founder for execution.
