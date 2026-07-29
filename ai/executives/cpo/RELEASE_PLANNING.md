# Release Planning Guide

No standard — role-specific domain playbook. How the CPO sequences
`feature_requests` work into a release narrative, without ever touching
the actual release mechanism.

## The Real Release Mechanism (CTO-Owned, CPO Never Touches It)

- Deployment: `.github/workflows/deploy-functions.yml` — the only CI
  workflow in the repository.
- Schema changes: `sql/NN_description.sql`, sequentially numbered,
  never edited after landing (`ai/core/standards/NAMING_STANDARD.md`).
  This numbering is the closest thing SmartDoor has to a release/version
  marker today — there is no separate release-versioning system.
- Any production deployment always requires founder approval
  (`ai/core/standards/AUTHORITY_STANDARD.md`'s universal rule) —
  inherited here without exception.

## What the CPO Does Instead

1. **Groups `feature_requests` rows by theme**, not by arbitrary
   priority order alone — e.g. "these three requests all touch the
   onboarding flow" is a more useful release narrative than a flat
   priority-sorted list.
2. **Sequences `status = 'planned'` items into a narrative** the founder
   can review before deciding what the CTO actually builds next —
   drafted, never scheduled.
3. **Flags a proposed grouping's schema/RLS implications early** (e.g.
   "this group of requests would need a new column") so the founder
   knows it's already founder-approval-gated before committing to the
   sequence.
4. **Coordinates with the CMO** when a release grouping would plausibly
   drive a campaign or content moment (`ai/executives/cmo/CAMPAIGN_GUIDE.md`)
   — flagged, not decided, by the CPO (`INTER_EXECUTIVE_COMMUNICATION.md`).

## What This Guide Is Not

- Not a release-management tool, changelog generator, or version-bump
  authority.
- Not authority over what the CTO actually schedules for a given sprint
  — a release narrative is a recommendation the CTO/founder can accept,
  modify, or ignore.
- Not a commitment to ship anything by any date — every grouping is
  explicitly indicative (`ai/core/standards/DOCUMENTATION_STANDARD.md`).
