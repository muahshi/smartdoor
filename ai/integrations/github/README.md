# Integration: GitHub

## Status

Documentation only, SDOS Phase 10. No client, connection, or credential
exists. **Future-only** — unlike the other seven integrations in this
registry, SmartDoor's production code has no existing runtime GitHub
integration to extend. The only present-day GitHub usage is CI/CD:
`.github/workflows/deploy-functions.yml` deploys Supabase Edge
Functions on push. This integration is documented purely as forward-
looking intent for a future SDOS capability, per `INTEGRATION_REGISTRY.md`.

## Purpose

A future AI CTO capability could benefit from read-only visibility into
the repository itself — commit history, open pull requests, CI/CD run
status — to reason about engineering velocity, deployment health, or
recent changes, without a human manually summarizing `git log` for it.

## Supported Capabilities (Future, Documented Only)

- Read commit history metadata (author, timestamp, message) for a
  bounded range — never full diffs by default.
- Read open pull request counts/status.
- Read `deploy-functions.yml` workflow run status/history (success/
  failure trend for Edge Function deploys).

## Read-Only Access Policy

Governed by `ai/integrations/READONLY_POLICY.md`. A future SDOS GitHub
read never creates a commit, comment, pull request, issue, or workflow
dispatch. Given there is no existing production write path here to
accidentally extend (unlike `razorpay/` or `supabase/`), this
integration's read-only boundary is the *entire* boundary — there is no
"existing write path this must avoid," only "no write path, ever,
without a wholly separate future decision."

## Authentication Approach (Future)

A GitHub App or fine-grained personal access token scoped to
**read-only** repository permissions (contents: read, pull requests:
read, actions: read) — never a token with `contents: write` or
`workflow: write` scope. Held in environment configuration, never
checked into `ai/`, per `SECURITY_GUIDELINES.md` guideline 1.

## Inputs

`capability`, `requested_by`, `scope` (date range or PR/commit
identifier).

## Outputs

Metadata only (commit SHA, author, timestamp, message; PR number,
title, status; workflow run status) — never full file contents or
diffs by default, keeping scope minimal per
`READONLY_INTEGRATION_POLICY.md` rule 3.

## Data Contracts

Follows `ai/integrations/DATA_CONTRACTS.md`. No extension defined in
this phase.

## Error Handling

`INTEGRATION_ERROR` on any failed/timed-out read, per
`ERROR_HANDLING.md`.

## Security Considerations

- Read-only-scoped token exclusively — no write, admin, or org-level
  scope, ever, for any future implementation of this integration.
- No secrets, `.env` values, or credential-bearing files are ever read
  through this integration even though they technically live in the
  same repository — SDOS's own read scope excludes anything matching
  SmartDoor's existing secret-handling conventions
  (`config/env.generated.js` and equivalents stay out of scope).

## Rate Limits

None defined (no client exists). A future implementation should respect
GitHub's standard REST/GraphQL API rate limits and should not poll more
frequently than a CTO-flavored daily/weekly cadence
(`ai/core/standards/MEETING_STANDARD.md`-style routines) requires.

## Future SDOS Capability

A future CTO capability could summarize weekly commit/PR/deploy
activity as part of its own recurring routine, and flag a rising
Edge-Function deploy failure rate as an operational risk. This is the
only integration in the registry with no present-day production
counterpart — its entire documented capability is future-facing, and
building it is a strictly lower-priority candidate than the seven
integrations that extend something already live in production.
