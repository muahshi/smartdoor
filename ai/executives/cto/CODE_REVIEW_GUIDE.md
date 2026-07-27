# Code Review Guide

Review-gate structure: see `ai/core/standards/REVIEW_STANDARD.md`.
Coding standards and review checklist the AI CTO applies when reviewing
proposed changes to the SmartDoor codebase, grounded in the stack actually
in use: Supabase (PostgreSQL, Edge Functions in Deno/TypeScript, Realtime,
Storage), vanilla JS frontend modules, and a Vercel-deployed static/serverless
frontend.

## Pre-Review: The Golden Rules Gate

Before reviewing style or correctness, confirm the change itself follows
the house methodology:

- [ ] Was the existing system audited before this change was proposed?
- [ ] Does this extend existing architecture rather than introduce a
      parallel or competing pattern?
- [ ] Is there any placeholder code, TODO, or stub left in?
- [ ] Does the diff touch only what actually needed to change?

A change that fails any of these gets sent back before line-level review
even starts.

## Frontend (Vanilla JS Modules)

- Match the existing module style already in `js/` and `services/` — most
  are plain (non-module) classic scripts included directly, some are ES
  modules; match whichever pattern the file being touched already uses
  rather than introducing a third style.
- No new frontend framework or bundler introduced without founder approval
  (`AUTHORITY_MATRIX.md` — new dependency).
- Reuse existing CSS classes/design tokens (`design-system/tokens/*.js`)
  rather than inventing new ones for a one-off feature.
- Anything touching visitor-facing pages must preserve the existing
  privacy guarantee (no real phone numbers ever exposed client-side).

## Backend (Supabase Edge Functions)

- New Edge Functions should reuse `_shared/` helpers (`adminAuth.ts`,
  `cors.ts`, `edgeRateLimit.ts`, `requestId.ts`, etc.) rather than
  reimplementing auth, CORS, or rate limiting inline.
- Never hardcode a price — `pricing.ts` is the documented single source of
  truth for hardware prices; any pricing logic must route through it.
- Webhook handlers must verify signatures (see the existing Razorpay
  webhook's HMAC-SHA256 verification and idempotency pattern as the
  reference implementation).

## SQL / Migrations

- New tables/columns are proposed as new, sequentially-numbered migration
  files (following the `NN_description.sql` convention), never as edits to
  historical migration files.
- Every new table handling owner- or visitor-scoped data needs an
  accompanying RLS policy in the same migration, not a follow-up "fix"
  migration — SmartDoor's history shows RLS-fix migrations are a recurring
  and costly pattern to avoid repeating.
- **The CTO reviews and flags schema/RLS proposals; it does not execute
  them.** Execution is always founder-approved (`AUTHORITY_MATRIX.md`).

## General Review Checklist

- [ ] Naming consistent with the surrounding file/module
- [ ] No dead code or unreachable branches introduced
- [ ] No secrets, API keys, or credentials in the diff
- [ ] Error handling present for any new external call (Razorpay, FCM,
      Twilio, Groq, etc.)
- [ ] No new script/module left un-included (the admin AI Insights
      dead-code incident — a fully-built feature never `<script>`-included
      into `admin.html` — is the canonical cautionary example)
- [ ] If the change references a table/column, it was verified to exist in
      the actual schema, not assumed from a similar-sounding one
- [ ] Documentation (`ai/knowledge/` and/or root-level docs) updated if the
      change materially affects what those docs describe

## Anti-Patterns to Reject on Sight

- Rewriting a working file "for cleanliness" without a functional reason
- Introducing a second way to do something the codebase already does one
  way (e.g. a second pricing calculation path)
- Silent scope creep beyond the stated task
- Copying a pattern from one domain into another without checking it fits
  (e.g. applying B2C visitor logic to a B2B partner flow without checking
  partner-specific rules)
