# ADR-0006: Agent Communication

## Status

Accepted (Phase 11).

## Context

Since Phase 2, every executive's own `INTER_EXECUTIVE_COMMUNICATION.md`
(or, for CEO, `CROSS_EXECUTIVE_COMMUNICATION.md`) has described, in
prose, that executives sometimes need each other's domain input —
e.g. a CTO deployment decision with cost implications only CFO data
clarifies. `ai/core/router/TASK_ROUTING.md` (Phase 9) already
specifies *task*-level routing, including the multi-domain-match case
that escalates to CEO synthesis. Neither specifies the finer-grained
case: one executive, mid-turn, asking a sibling executive a specific
question without transferring ownership of the whole task. Phase 11
needed to decide how to specify this.

## Decision

Model agent-to-agent communication as **two separate documents**: a
schema (`MESSAGE_SCHEMA.md`) defining the shape of a directed,
one-to-one exchange between two executive instances, and a protocol
(`INTER_AGENT_PROTOCOL.md`) defining when such a message is sent and
what it obligates the sender and receiver to do — kept explicitly
distinct from, and subordinate to, `TASK_ROUTING.md`'s existing
ownership table, which remains the only mechanism for reassigning
*ownership* of a task.

## Alternatives Considered

- **One combined document covering both shape and protocol.**
  Rejected: `ai/core/events/EVENT_BUS.md` and
  `ai/core/router/TASK_ROUTING.md` already establish the pattern of
  separating "what is the object" from "what triggers it and how is it
  handled" as two concerns, even when related (an `Event`'s shape vs.
  its delivery contract are both in `EVENT_BUS.md`, but a `Task`'s
  shape lives in `TASK_MODEL.md` while its dispatch lives in a
  *separate* `TASK_ROUTING.md`). Following the `Task`/`TASK_ROUTING.md`
  precedent rather than the `Event`/`EVENT_BUS.md` one keeps the
  protocol's future-evolution surface (timeouts, retry, escalation
  handoff) separable from the schema's much more stable shape.
- **Route all cross-executive needs through `TASK_ROUTING.md`'s
  existing multi-domain-match path (i.e., always escalate to CEO
  rather than message directly).** Rejected: this would force every
  small, single-fact cross-domain question through a full CEO
  synthesis turn, which every sibling executive's own
  `INTER_EXECUTIVE_COMMUNICATION.md` file already implicitly argued
  against by describing lighter-weight, direct peer consultation as
  something that happens *before* a conflict rises to CEO-level
  synthesis — this ADR's decision makes that existing, already-assumed
  distinction mechanically real rather than leaving it as an
  unspecified escape hatch.
- **Let messages carry implicit authority** (e.g. a CFO `RESPONSE`
  automatically authorizing a CTO action). Rejected outright and
  immediately, per `MESSAGE_SCHEMA.md` Rule 3 and
  `SECURITY_BOUNDARIES.md` extension 1 — this would create a second,
  undocumented path to authority alongside `PERMISSION_MODEL.md`,
  directly contradicting `AUTHORITY_STANDARD.md`'s closing rule.

## Rationale

- Keeping messages strictly subordinate to `TASK_ROUTING.md` (never a
  parallel way to reassign ownership) preserves ADR-0002's executive-
  model decision that each domain's ownership stays unambiguous.
- Splitting schema from protocol lets a future implementation version
  the wire shape (`MESSAGE_SCHEMA.md`) independently of behavioral
  rules like timeout handling (`INTER_AGENT_PROTOCOL.md`), which are
  far more likely to need revision once a real transport is chosen.
- Explicitly forbidding implicit-authority-via-message closes off the
  one realistic way this phase's new capability could otherwise erode
  `AUTHORITY_STANDARD.md`'s existing, hard-won discipline.

## Consequences

- Positive: cross-executive consultation now has a concrete mechanism
  lighter-weight than full CEO-pattern escalation, matching what every
  sibling executive's documentation already assumed was possible.
- Positive: no existing routing, permission, or authority contract
  needed to change to accommodate this — messaging is additive.
- Negative / accepted tradeoff: a future implementation must build two
  coordinated pieces (schema + protocol) rather than one, and must
  choose a transport neither document specifies — deferred
  deliberately, per the same reasoning `EVENT_BUS.md` and
  `LOGGING_STRATEGY.md` already applied to their own storage choices.

## Future Impact

Any future phase implementing inter-agent messaging must satisfy both
`MESSAGE_SCHEMA.md` and `INTER_AGENT_PROTOCOL.md`, and must never let a
message create authority `PERMISSION_MODEL.md` didn't already grant.
`EXECUTION_PIPELINE.md`'s step 4 is the concrete integration point
where a future implementation invokes this capability from within an
executive's reasoning step.

## Related Phases

Phase 2–9 (the six executives' existing prose assumption this decision
mechanizes), Phase 9 (`TASK_ROUTING.md`, which this decision remains
subordinate to), Phase 11 (this decision; see ADR-0005 for the broader
Phase 11 scoping decision this ADR is one specific instance of).
