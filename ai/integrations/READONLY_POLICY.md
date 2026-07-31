# Read-Only Policy (ai/integrations)

This folder's own copy of the read-only gate, written at the point
where a future implementer will actually be looking when building the
first real integration client. It does not redefine the policy —
`ai/core/permissions/READONLY_INTEGRATION_POLICY.md` remains the single
authoritative source, enforced at the runtime layer
(`ERROR_HANDLING.md`'s `INTEGRATION_ERROR` check and
`CONTEXT_LOADING.md` step 5). This file restates it here, applied
specifically to the eight integrations this phase documents, so it
can't be missed by only reading `ai/core/`.

## Status

Architecture and policy only. Every integration in this folder is
documentation-only as of Phase 10; nothing below has ever executed.

## The Policy, Applied to Every Integration in This Folder

1. **Every one of `github/`, `supabase/`, `groq/`, `razorpay/`,
   `firebase/`, `analytics/`, `notifications/`, and `storage/` is
   read-only, without exception, in whatever phase first implements
   it.** No integration in this registry ships a write path (insert,
   update, delete, send, trigger, capture, refund) in the same phase
   that introduces its first read.
2. **Write capability for any one of the eight is its own,
   separately-approved future phase** — per
   `READONLY_INTEGRATION_POLICY.md` rule 2, this is a founder-approval
   event under `AUTHORITY_STANDARD.md`'s "Any change to
   `ai/integrations/` scope" row, not something a builder phase can
   assume by extension. Concretely: a future phase implementing
   `razorpay/`'s documented read capability does **not** thereby gain
   authority to also implement `razorpay/`'s "Future SDOS Capability"
   note about refund visibility escalation, or any write action —
   those remain separate decisions.
3. **Read access is scoped per capability, not blanket, for every
   integration** — see each integration's own "Supported Capabilities"
   section for the specific, named reads it may eventually offer.
   `supabase/` in particular never gets unrestricted `SELECT *` — see
   its own README for the specific tables/views a specific executive's
   documented context needs.
4. **RLS and vendor-side scoping are never bypassed for any
   integration** — a future `supabase/` read goes through the same Row-
   Level Security policies SmartDoor's own production code already
   respects; a future `razorpay/` read uses read-scoped API keys, never
   the same secret key `services/payments.js`'s Edge Functions use to
   create or capture orders.
5. **A read never has a side effect, for any of the eight** — including
   ones that might seem harmless, like a `groq/` "read the last session's
   token usage" call that would otherwise increment a counter, or an
   `analytics/` read that would otherwise warm a cache with a write. If
   a genuinely read-only capability would have such a side effect, that
   is flagged and redesigned before it ships, not accepted.

## What "Read-Only" Does Not Mean (restated, per `READONLY_INTEGRATION_POLICY.md`)

- Not unscoped — see rule 3.
- Not permanent — a future, separately-approved phase may add write
  capability to any one integration; this policy governs the gate to
  get there.
- Not permission to log or persist raw vendor payloads wholesale —
  `LOGGING_STRATEGY.md` and `EVENT_BUS.md`'s existing rules about not
  logging raw production data apply to every one of these eight the
  same way they apply to SmartDoor's own database reads.

## Relationship to the Rest of SDOS

- Authoritative source: `ai/core/permissions/READONLY_INTEGRATION_POLICY.md`.
- Enforced by: `ai/core/runtime/ERROR_HANDLING.md`'s `INTEGRATION_ERROR`
  check, `ai/core/context/CONTEXT_LOADING.md` step 5.
- Specialized per-vendor in each integration's own "Read-Only Access
  Policy" section.
- Complemented by `SECURITY_GUIDELINES.md` (credential handling, blast
  radius) and `DATA_CONTRACTS.md` (the shape a compliant read takes).
