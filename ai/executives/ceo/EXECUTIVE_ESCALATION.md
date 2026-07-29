# Executive Escalation

How a cross-domain or ambiguous escalation reaches the founder through
the CEO, and how this relates to each sibling executive's own, already-
defined escalation path. This file does **not** replace any sibling
executive's `ESCALATION_MATRIX.md` — every domain-specific escalation
(a P0 support incident, a security concern, a cash-flow crisis) still
routes exactly the way that domain's own matrix already defines.

## When an Escalation Stays Entirely Within a Domain

If an issue is clearly owned by one domain, it never reaches the CEO at
all — it follows that domain's own path directly:

- Support/operations: `coo/ESCALATION_MATRIX.md`'s existing path
  (Support Agent → Ops Manager → Super Admin/Founder, per
  `SUPPORT_RUNBOOK.md` §2).
- Financial: `cfo/ESCALATION_MATRIX.md`.
- Marketing/brand: `cmo/ESCALATION_MATRIX.md`.
- Product: `cpo/ESCALATION_MATRIX.md`.
- Technical: the CTO's severity classification per
  `cto/BUG_TRIAGE_GUIDE.md` (the CTO folder does not yet have a
  standalone `ESCALATION_MATRIX.md` file as of Phase 2 — bug/technical
  severity routing is documented there instead).

The CEO's escalation role only begins where one of these paths runs into
a boundary its own domain can't resolve alone.

## When an Escalation Reaches the CEO

1. **Cross-domain root cause.** An issue reported in one domain's
   escalation path turns out to have a root cause or consequence in
   another domain — e.g. a COO-reported fulfilment stall
   (`coo/ESCALATION_MATRIX.md`) that traces to a CFO billing
   reconciliation gap rather than a pure operations issue. Every
   sibling executive's own `INTER_EXECUTIVE_COMMUNICATION.md` already
   defines the specific domain-to-domain handoffs (e.g. COO→CTO,
   CFO→CTO); the CEO's role is only needed when the handoff spans more
   than the two directly-communicating domains those documents already
   cover.
2. **No domain's matrix clearly owns it.** A situation that doesn't
   cleanly fit any single sibling's `ESCALATION_MATRIX.md` severity
   table — see `EXECUTIVE_ORCHESTRATION.md` Pattern 4.
3. **Two domains' escalation paths disagree on severity or routing.**
   E.g. the CMO's `ESCALATION_MATRIX.md` treats a brand-reputation issue
   as urgent while the CTO's technical assessment treats the underlying
   cause as low-severity — the CEO surfaces the mismatch rather than
   picking a side.

## The CEO's Role at Each Level

- **Detection**: notice that an escalation has crossed a domain
  boundary or fits no domain's matrix, by reading each relevant
  domain's own escalation criteria — never inventing a new severity
  scale of its own.
- **Framing**: present the cross-domain escalation using
  `EXECUTIVE_BRIEFING_GUIDE.md`'s structure, citing each domain's real
  position.
- **Routing**: the CEO never resolves the escalation itself — per
  `AUTHORITY_MATRIX.md`, it always routes to the founder, exactly the
  same terminal point every sibling executive's own escalation path
  already ends at (`SUPPORT_RUNBOOK.md` §2's "Super Admin/Founder,"
  mirrored across every domain).

## What This File Does Not Do

- Does not create a new severity scale (P0–P3 or otherwise) — each
  domain's own scale (e.g. `coo/ESCALATION_MATRIX.md`'s P0–P3) stays
  authoritative within that domain; this file only addresses what
  happens when an issue crosses domain lines.
- Does not give the CEO authority to declare or close an escalation —
  see `coo/AUTHORITY_MATRIX.md`'s existing rule that only the founder
  declares/closes a P0/P1, which this file does not change or extend to
  the CEO.
- Does not build an actual escalation-routing system — no such runtime
  exists (`ai/core/` is an empty placeholder); this is a documentation
  contract for how routing *would* work once one exists.
