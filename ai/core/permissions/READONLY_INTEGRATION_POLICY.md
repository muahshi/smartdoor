# Read-Only Integration Policy

The formal gate a future `ai/integrations/` capability must pass before
any write access is even considered. This restates and hardens
`ai/docs/SDOS_ARCHITECTURE.md`'s existing "Read before write" design
principle and `ai/integrations/README.md`'s own "Phase 0 is read-nothing,
write-nothing" statement into an explicit runtime policy, rather than
leaving it as a prose intention only.

## Status

Architecture and contract only. `ai/integrations/` remains empty as of
this phase; this policy governs whatever is built there next, whenever
that phase happens.

## The Policy

1. **`ai/integrations/`'s first capability, without exception, is
   read-only.** No write path (insert, update, delete, or any Edge
   Function invocation with a side effect) may ship in the same phase
   that introduces read access.
2. **Write capability requires its own, separate, explicitly-approved
   phase.** Per `AUTHORITY_STANDARD.md`'s universal row "Any change to
   `ai/integrations/` scope... governs SDOS's own blast radius" — moving
   from read-only to any write capability is itself a founder-approval
   event, not a natural extension a builder phase assumes.
3. **Read access itself is scoped, not blanket.** A future
   `ai/integrations/` client reads only the specific tables/views a
   specific executive's own documented context needs (per
   `CONTEXT_LOADING.md` step 5) — it is not granted unrestricted
   `SELECT *` access to the entire Supabase schema by default.
4. **RLS is never bypassed.** Any future SDOS read goes through the same
   Row-Level Security policies SmartDoor's production code already
   respects — SDOS gets no service-role or elevated-privilege shortcut
   an ordinary authenticated read wouldn't also have, unless a specific,
   separately-approved exception documents otherwise.
5. **A read never has a side effect.** Even "read-only" access must not
   trigger a webhook, increment a counter, or otherwise mutate state as
   a side effect of being read — if a genuinely read-only query would
   have such a side effect (rare, but possible via a poorly-isolated
   view or function), that is flagged and addressed before the read
   ships, not accepted as an acceptable side cost.

## What "Read-Only" Does Not Mean

- It does not mean unlimited or unscoped — see rule 3.
- It does not mean permanent — a future, separately-approved phase may
  add write capability; this policy governs the gate to get there, not
  a permanent prohibition.
- It does not mean SDOS may read the actual customer/business data into
  a log or event payload wholesale — `LOGGING_STRATEGY.md` and
  `EVENT_BUS.md`'s own rules about not logging raw production data still
  apply to whatever `ai/integrations/` eventually reads.

## Relationship to the Rest of SDOS

- Enforced at the `INTEGRATION_ERROR` check in
  `ai/core/runtime/ERROR_HANDLING.md` and the context-load step 5 in
  `ai/core/context/CONTEXT_LOADING.md`.
- A structural instance of `SECURITY_MODEL.md`'s "least privilege by
  default" constraint, specific to `ai/integrations/`.
- Directly extends `ai/integrations/README.md`'s own existing statement
  rather than replacing it — that file remains the folder's own
  authority on its purpose; this file is the runtime-enforcement
  contract over it.
