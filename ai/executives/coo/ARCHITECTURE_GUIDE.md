# Architecture Guide

Architecture principles the AI CTO applies to both SmartDoor (production)
and SDOS (`ai/`) itself.

## Core Principles

1. **One source of truth per concern.** Supabase/PostgreSQL is the single
   source of truth for all business data. `pricing.ts` is the single
   source of truth for hardware prices. `ai/knowledge/` is a derived view,
   never a source of truth (see `ai/docs/COMPANY_BRAIN.md`). Every new
   feature should identify and respect the existing source of truth for
   whatever it touches rather than creating a second one.

2. **Additive over invasive.** New capability should be addable alongside
   what exists — new tables, new Edge Functions, new service modules, new
   SQL migrations — without rewriting working files. This is true for
   SmartDoor's product code and doubly true for SDOS, which must never
   modify SmartDoor's production code at all (see the dependency-direction
   rule below).

3. **One-way dependency: SDOS depends on SmartDoor, never the reverse.**
   `ai/` may read SmartDoor's data (via `ai/integrations/`, once built) and
   documentation. SmartDoor's `js/`, `services/`, and
   `supabase/functions/` never import from or depend on `ai/`. This
   boundary is load-bearing — violating it would mean SDOS could break
   production just by existing.

4. **Read-only before write-capable.** Any new integration or automation
   starts read-only. Write capability is a separate, explicitly-approved
   decision, never bundled into the initial build of a capability.

5. **RLS and auth are structural, not incidental.** Every new table
   handling owner- or visitor-scoped data gets RLS in its introducing
   migration. Every new Edge Function reuses the shared auth/CORS/rate-limit
   helpers rather than reimplementing them.

6. **Design for the stated scale target without over-engineering for it
   today.** SmartDoor's stated long-term goal is tens of thousands of
   active plates without a major redesign. New architecture should not
   foreclose that future (e.g. avoid patterns that only work at hundreds
   of rows), but should also not add speculative infrastructure
   (queues, microservices, new databases) that isn't justified by current
   scale.

## Reference Architecture (as it exists today)

- **Frontend**: Vanilla JS modules + some ES modules, static pages, Vercel
  deployment (`vercel.json` governs headers/permissions — see the
  microphone-permission incident in `services/webrtcCall.js` history as a
  reminder that platform-level config is part of the architecture too).
- **Backend**: Supabase — PostgreSQL (86+ migrations), Edge Functions
  (41+, Deno/TypeScript), Realtime (35+ realtime-enabled tables), Storage.
- **Payments**: Razorpay, with webhook-based reconciliation as a reliability
  safety net alongside client-confirmed flows.
- **Communication**: WebRTC for owner-visitor calling with a Twilio
  masked-call fallback; Groq-powered AI receptionist/consultant features;
  Web Push (VAPID/FCM) for notifications.
- **AI/SDOS layer**: `ai/` — additive, currently documentation-only
  (Phase 0/1/2), designed to read from Supabase in a future phase without
  ever being depended upon by production code.

## Evaluating a New Feature Proposal

Before recommending an approach, the CTO checks, in order:
1. Does something like this already exist? (Check `features/features.md`,
   `services/services.md` in the Company Brain first.)
2. Can it extend an existing table/service/Edge Function rather than
   create a parallel one?
3. What's the smallest additive change that fully solves the stated need?
4. Does it require any `AUTHORITY_MATRIX.md` approval gate (schema, RLS,
   pricing, auth, payments)?
5. Is there a realistic path to it being orphaned like the admin AI
   Insights dead code was — and if so, what's the one line (e.g. a
   `<script>` include) that must not be forgotten?

## Anti-Patterns

- A second ORM/query pattern alongside the existing Supabase client usage
- A new frontend framework introduced for a single feature
- Business logic duplicated between an Edge Function and client-side JS
  (creates drift risk — pricing.ts's role as sole source of truth exists
  specifically to prevent this)
- New infrastructure (queues, caches, separate databases) without a
  demonstrated need at current scale
