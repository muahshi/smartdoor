# Security Guidelines (ai/integrations)

The security posture every one of the eight integrations documented in
this folder must satisfy before any real code is written against it.
This specializes `ai/core/permissions/SECURITY_MODEL.md`'s structural
constraints for `ai/integrations/` specifically; it does not replace
that file as the overall authority.

## Status

Architecture only, exactly like `SECURITY_MODEL.md` itself. No
component with any actual access exists yet.

## Guidelines

1. **No secrets in `ai/`.** None of `github/README.md`,
   `supabase/README.md`, `groq/README.md`, `razorpay/README.md`,
   `firebase/README.md`, `analytics/README.md`,
   `notifications/README.md`, or `storage/README.md` contains, or will
   ever contain, a real API key, token, webhook secret, or connection
   string — real or placeholder-formatted-to-look-real. Each
   integration's "Authentication Approach" section describes *how*
   credentials would be obtained (environment configuration, matching
   SmartDoor's existing `config/` pattern), never the credential
   itself.
2. **Least privilege per integration, not per SDOS as a whole.** A
   future `razorpay/` client requests read-scoped API access; it does
   not reuse SmartDoor's existing Razorpay key that
   `create-razorpay-order` and `razorpay-refund` use to create charges
   and issue refunds. A future `supabase/` client authenticates as a
   role subject to RLS, not the `service_role` key that Edge Functions
   like `admin-provision-customer` use to bypass it. Every integration's
   own README states this explicitly in its "Security Considerations"
   section.
3. **No PII or payment data leaves its documented boundary.** A future
   `razorpay/` or `storage/` read may confirm *that* a payment or file
   exists and its status/metadata; it does not surface card numbers,
   UPI VPAs, full visitor phone numbers, or file contents into any log,
   event payload, or executive-facing report by default — matching
   `LOGGING_STRATEGY.md`'s existing rule against logging raw production
   data.
4. **One-way dependency holds for every integration.** None of the
   eight vendor SDKs, proxy functions, or services SmartDoor already
   depends on (`services/supabase.js`, `services/payments.js`,
   `services/push.js`, `supabase/functions/groq-proxy/`, etc.) will
   ever import from, call, or depend on anything in `ai/integrations/`
   — restating `SECURITY_MODEL.md` constraint 2 per-vendor.
5. **Every future read is attributable to a specific executive and
   task.** Per `DATA_CONTRACTS.md`'s `IntegrationRead.requested_by`
   field and `SECURITY_MODEL.md` constraint 5 — no integration in this
   folder will ever support an anonymous or unattributed read.
6. **Vendor-specific hardening already present in production is a
   floor, not something SDOS works around.** For example,
   `groq-proxy`'s existing AI-session-token + origin allow-list
   hardening (see `groq/README.md`) is not something a future
   `groq/` SDOS client bypasses by calling Groq directly with its own
   key — if SDOS ever needs Groq access, it goes through the same
   hardened proxy path, or a documented, equally-hardened equivalent,
   not around it.

## Incident Posture

If a future implementation phase discovers that a credential, token, or
data path documented here was implemented in a way that violates any
guideline above, that is treated as a security incident under
whatever incident-response process governs SmartDoor's production
systems generally — not something silently patched in a later SDOS
phase without disclosure, per `QUALITY_STANDARD.md`'s "flag, don't
silently resolve" Golden Rule.

## Relationship to the Rest of SDOS

- Specializes `ai/core/permissions/SECURITY_MODEL.md` for
  `ai/integrations/` specifically.
- Complements `READONLY_POLICY.md` (access scope) and
  `DATA_CONTRACTS.md` (result shape) — together the three cover *what*
  can be read, *how little* of it, and *how safely*.
- Each integration's own "Security Considerations" section applies
  these guidelines to that specific vendor's real production footprint.
