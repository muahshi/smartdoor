# ADR-0009: Communication Extensions

## Status

Accepted (Phase 13A).

## Context

Phase 13A was originally scoped as a full "Multi-Agent Communication
Framework" — a new `ai/communication/` folder with fifteen new
documents (message bus, executive handoff, task delegation, approval
routing, founder override, conflict resolution, observability, etc.)
plus two new ADRs, treating inter-agent communication as if it did not
yet exist in SDOS.

A mandatory audit of the existing repository, performed before any file
was created, found that it already does. Phase 11
(`ADR-0005-Agent-Runtime-Contracts.md`, `ADR-0006-Agent-Communication.md`)
already specifies `MESSAGE_SCHEMA.md`, `INTER_AGENT_PROTOCOL.md`,
`TASK_ROUTING.md`, `EVENT_BUS.md`, `FOUNDER_APPROVAL_FLOW.md`,
`APPROVAL_WORKFLOW.md`, `SECURITY_BOUNDARIES.md`, `MEMORY_SCHEMA.md`,
`CONTEXT_SCHEMA.md`, `AUDIT_TRAIL.md`, `OBSERVABILITY.md`, and
`ERROR_HANDLING.md`. Each of the six executives already has its own
`INTER_EXECUTIVE_COMMUNICATION.md` and `ESCALATION_MATRIX.md`. The CEO
already has `EXECUTIVE_ORCHESTRATION.md`, `CROSS_EXECUTIVE_COMMUNICATION.md`,
`DECISION_FRAMEWORK.md`, and `AUTHORITY_MATRIX.md`.

## Problem

Building the originally scoped fifteen-file `ai/communication/` folder
would have violated SDOS's own founding non-duplication principle
(`ADR-0001-SDOS-Architecture.md`) in at least the following concrete
ways:

- A new `MESSAGE_BUS.md` alongside the existing `MESSAGE_SCHEMA.md` +
  `INTER_AGENT_PROTOCOL.md` pair would restate, and risk contradicting,
  a decision `ADR-0006` already made and recorded.
- A new `APPROVAL_ROUTING.md` and `FOUNDER_OVERRIDE.md` would restate
  `FOUNDER_APPROVAL_FLOW.md` and `APPROVAL_WORKFLOW.md`.
- A new `CONFLICT_RESOLUTION.md` would restate
  `DECISION_FRAMEWORK.md` and `EXECUTIVE_ORCHESTRATION.md` Pattern 3.
- A new `OBSERVABILITY.md` would collide by filename with the two that
  already exist (`ai/core/contracts/OBSERVABILITY.md`,
  `ai/runtime/OBSERVABILITY.md`).
- A new `ADR-0009` re-deciding message architecture and a new
  `ADR-0010` re-deciding executive handoff would both re-litigate
  decisions `ADR-0006` already made, without either superseding it
  explicitly — the exact failure mode `ai/docs/adr/README.md`'s own
  Rule 4 (superseding decisions get a new ADR that says so, not a
  silent restatement) exists to prevent.

Meanwhile, three genuine gaps existed in the current architecture:
message ordering/deduplication/traceability was never specified;
`EVENT_BUS.md` named a concrete event taxonomy as a future extension
point but never enumerated one; and no document specified how a
three-or-more-way executive disagreement should be handled (only the
two-party case was specified). A fourth, narrower gap: no document
specified how an inter-agent `Message` connects to the Groq reasoning
sequence `EXECUTION_FLOW.md` already defines for task-triggered
invocations.

## Existing Architecture

See Context above. In summary, as of Phase 12, SDOS's communication
architecture is: `MESSAGE_SCHEMA.md` + `INTER_AGENT_PROTOCOL.md`
(Phase 11, per `ADR-0006`) for the message contract itself;
`TASK_ROUTING.md` (Phase 9) for delegation ownership;
`EVENT_BUS.md` (Phase 9) for event propagation;
`FOUNDER_APPROVAL_FLOW.md` + `APPROVAL_WORKFLOW.md` (Phase 11) for
founder authority; `SECURITY_BOUNDARIES.md` + `PERMISSION_MODEL.md`
for inter-agent security; `EXECUTIVE_ORCHESTRATION.md` +
`DECISION_FRAMEWORK.md` (CEO) for conflict handling; `EXECUTION_FLOW.md`
(Phase 12, per `ADR-0008`) for the Groq-specific reasoning sequence.

## Decision

Reject the fifteen-file `ai/communication/` folder and the two
originally proposed ADRs. Instead, extend four existing documents and
add exactly one new document, recorded in this single ADR:

1. **`INTER_AGENT_PROTOCOL.md`** — extended with a new, clearly marked
   "Ordering, Deduplication, and Traceability" section: conversation
   IDs, sequence numbers, idempotency keys, duplicate detection,
   stale/expired-message handling, replay protection, and traceability
   across CEO → executive → response chains. All prior rules in the
   file are unchanged.
2. **`ai/core/events/EVENT_CATALOG.md`** (new) — a concrete event
   taxonomy (commerce, customer/support, operations, product,
   marketing/revenue, security/system) built strictly on
   `EVENT_BUS.md`'s existing envelope, with every entry marked as a
   Future SDOS Capability.
3. **`ai/executives/ceo/MULTI_PARTY_CONFLICT.md`** (new) — extends
   `DECISION_FRAMEWORK.md` to three-or-more-executive disagreements:
   stakeholder identification, minority-position preservation, and the
   explicit rule that the CEO must not manufacture consensus.
4. **`EXECUTION_FLOW.md`** — extended with a new "Inter-Agent
   Message-Triggered Reasoning" section connecting
   `EXECUTION_PIPELINE.md` sub-step 4 (inter-agent message sub-loop) to
   this file's existing Groq sequence: when a `Message` should and
   should not trigger reasoning, token-budget and rate-limit
   interaction, and audit requirements. All prior sequence steps are
   unchanged.

## Why Duplication Was Rejected

Each of the four extensions above sits strictly on top of an existing,
already-decided contract, adding only what that contract's own text
already flagged as unspecified (`EVENT_BUS.md`'s "new event types are
additive," `DECISION_FRAMEWORK.md`'s silence on three-or-more-party
conflicts, `INTER_AGENT_PROTOCOL.md`'s absence of any ordering/dedup
rule, `EXECUTION_FLOW.md`'s silence on a message-triggered entry path).
None of the four restates a rule, schema field, or lifecycle state that
already exists elsewhere — each was checked against its parent
document's full content before writing, per the mandatory audit this
phase opened with.

## Alternatives Considered

- **Build the originally scoped fifteen-file folder anyway,** treating
  it as a clean-slate framework superseding Phase 11. Rejected: no
  founder decision authorized superseding `ADR-0006`, and the technical
  content of the original scope did not actually differ from what
  Phase 11 already specifies — it would have been duplication, not a
  genuine architectural revision.
- **Do nothing,** leaving the four identified gaps unaddressed.
  Rejected: the gaps are real (confirmed by re-reading every
  Phase 9–12 document that would plausibly cover them and finding none
  do) and each has concrete future consequences (undetected duplicate
  message processing, an unspecified event taxonomy blocking any future
  integration work, no CEO-level process for the most complex class of
  disagreement, and no specified connection between messaging and
  reasoning).
- **One combined document for all four extensions,** rather than
  extending each parent file in place. Rejected: `EVENT_CATALOG.md` and
  `MULTI_PARTY_CONFLICT.md` are genuinely new artifacts (no existing
  file to extend) and belong in their natural locations
  (`ai/core/events/`, `ai/executives/ceo/`) per SDOS's existing
  folder-by-domain convention; the `INTER_AGENT_PROTOCOL.md` and
  `EXECUTION_FLOW.md` changes are true extensions of files that already
  exist and were extended in place rather than forked into new files.

## Rationale

SDOS's founding principle (`ADR-0001`) is additive, non-duplicating
documentation built on a read-then-act discipline. Phase 13A's original
scope, applied literally, would have violated that principle inside the
very phase meant to advance it. Extending existing contracts in place —
and creating new files only where the artifact (an event taxonomy, a
multi-party conflict process) genuinely did not exist before — keeps
every SDOS document a single source of truth for its subject.

## Consequences

- Anyone reading `INTER_AGENT_PROTOCOL.md` or `EXECUTION_FLOW.md` sees
  the Phase 13A extension in place, in context, rather than needing to
  cross-reference a separate folder to find the current rules for
  message ordering or message-triggered reasoning.
- `EVENT_CATALOG.md` and `MULTI_PARTY_CONFLICT.md` are genuinely new
  documents with no prior version to reconcile against.
- Future phases inherit a slightly stricter bar: before proposing a new
  top-level folder or document, the audit this ADR performed (full-text
  read of every plausibly related existing file) is now the demonstrated
  standard, not merely the stated one.

## Security Impact

None of the four extensions grants new authority, new access, or a new
data-sharing path. `EVENT_CATALOG.md` explicitly bands or omits
magnitude/identity data in every event payload, consistent with
`SECURITY_BOUNDARIES.md`. `MULTI_PARTY_CONFLICT.md` explicitly restates
(does not loosen) the founder-approval-required threshold from the
strictest single stakeholder's own `AUTHORITY_MATRIX.md`. The
`EXECUTION_FLOW.md` extension explicitly restates that founder-approval
boundaries apply identically to message-triggered and task-triggered
reasoning.

## Operational Impact

None — no runtime, no code, no execution exists as a result of this
phase. All four artifacts remain architecture and contract only, per
every existing document's own "Status" convention.

## Future Impact

A future implementation phase building the actual message bus,
event bus, or CEO orchestration runtime now has: a concrete
ordering/dedup contract to implement against (rather than inventing one
ad hoc), a concrete event taxonomy to wire integrations to, a specified
multi-party conflict process, and a specified message-to-reasoning
trigger boundary. None of these were implementation-ready before this
phase; all four are now specified, none are built.

## Related Phases

- Phase 9 (Runtime Foundation) — `TASK_ROUTING.md`, `EVENT_BUS.md`
- Phase 11 (Agent Runtime Contracts) — `MESSAGE_SCHEMA.md`,
  `INTER_AGENT_PROTOCOL.md`, `FOUNDER_APPROVAL_FLOW.md`,
  `APPROVAL_WORKFLOW.md`, `AUDIT_TRAIL.md` (`ADR-0005`, `ADR-0006`)
- Phase 12 (Groq Runtime Foundation) — `EXECUTION_FLOW.md` (`ADR-0007`,
  `ADR-0008`)
- Phase 13A (this ADR) — the extensions described above
