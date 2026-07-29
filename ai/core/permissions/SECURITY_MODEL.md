# Security Model

SDOS's overall security posture. Distinct from `PERMISSION_MODEL.md`
(which checks a specific proposed action against documented authority)
— this file covers the structural constraints that hold regardless of
any single permission check: what SDOS can reach, what it stores, and
what blast radius it has if something goes wrong.

## Status

Architecture only. No component with any actual access exists yet — this
describes the posture a future implementation must maintain.

## Structural Constraints

1. **No direct network or database access from `ai/`.** Every one of
   `ai/core/`, `ai/executives/`, `ai/knowledge/`, `ai/memory/`,
   `ai/workflows/`, `ai/prompts/`, and `ai/dashboard/` is documentation
   or (in a future phase) orchestration logic that calls out to exactly
   one boundary: `ai/integrations/`. No other path to SmartDoor's
   Supabase database, Edge Functions, Razorpay, or Twilio/Exotel exists
   or is ever added directly inside any other `ai/` subfolder.
2. **One-way dependency, always.** SmartDoor's production code
   (`services/`, `supabase/functions/`, `js/`, `android/`) never
   imports from, calls, or depends on anything in `ai/`. This is
   restated from `ai/docs/SDOS_ARCHITECTURE.md`'s own design principle
   and is a security boundary as much as an architectural one — a
   compromised or misbehaving SDOS component cannot affect production
   through a dependency SmartDoor's own code doesn't have.
3. **No secrets or credentials live in `ai/`.** Any future
   `ai/integrations/` client obtains credentials the same way
   SmartDoor's existing services do (environment configuration,
   `config/`), never a value checked into an `ai/` file.
4. **Least privilege by default.** `ai/integrations/`'s first
   capability, when built, is read-only (see
   `READONLY_INTEGRATION_POLICY.md`) — write capability is a separate,
   explicitly-approved future decision, never bundled in by default.
5. **Every action is attributable.** Per `LOGGING_STRATEGY.md` and
   `EVENT_BUS.md`, no permission check, task, or session exists without
   an attributable log/event trail — there is no "quiet" execution path.

## Blast Radius (Today, Explicitly)

As of this phase, SDOS's blast radius on SmartDoor's production systems
is **zero** — no code path connects `ai/` to any production system, no
credential exists for one to be misused, and no executive has execution
authority. This is the same statement `ai/docs/SDOS_ARCHITECTURE.md`
made in Phase 0 ("Today (Phase 0): it doesn't [communicate]") and
remains true through this phase; Phase 9 defines the *architecture* a
future connected phase must satisfy, it does not itself connect
anything.

## Rules

1. **A future phase that adds real `ai/integrations/` access must
   satisfy every constraint above before any read capability ships** —
   this file is a pre-condition checklist for that phase, not a
   retroactive audit of one.
2. **Any proposed exception to constraint 1 or 2 above (a direct
   access path bypassing `ai/integrations/`) is itself an
   `AUTHORITY_STANDARD.md`-scale decision** — "Any change to
   `ai/integrations/` scope" is already a universal founder-approval
   row; this file makes explicit that *not* using
   `ai/integrations/` at all for some future component would be an even
   larger version of that same decision.
3. **This model does not grant SDOS any access it doesn't have today.**
   It is a constraint document, not a capability grant.

## Relationship to the Rest of SDOS

- Constraint 1 and 4 are formalized further in
  `READONLY_INTEGRATION_POLICY.md`.
- Constraint 5 is implemented by `LOGGING_STRATEGY.md` and
  `EVENT_BUS.md`.
- This file's "one-way dependency" restates
  `ai/docs/SDOS_ARCHITECTURE.md`'s own Design Principle 1 rather than
  redefining it.
