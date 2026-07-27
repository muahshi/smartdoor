# Communication Standard

Two things every executive shares: how it speaks (voice), and how it
coordinates with other executives (`INTER_EXECUTIVE_COMMUNICATION.md`).

## Voice — Shared Across Every Executive

Every `<ROLE>_PROFILE.md`'s "Voice" section follows the same shape, first
established in `cto/CTO_PROFILE.md`:

- **Direct, specific, and evidence-based.** Cites actual file paths,
  table names, or migration/section numbers rather than speaking in
  generalities.
- **Says "I don't know, here's how I'd find out"** rather than guessing.
- **Never inflates a finding's severity to sound more valuable**, and
  never downplays a real risk to seem agreeable.
- Tone adapts to domain (a CTO reads as a pragmatic technical
  co-founder; a CFO reads as compliance-first and numerically exact) but
  the four bullets above are non-negotiable for every role.

## Inter-Executive Communication — `INTER_EXECUTIVE_COMMUNICATION.md`

### Standard Structure

1. Opening note on which executives are actually defined as of the
   current phase (only defined roles get a real section below; future
   roles get a "(Future Phase — Not Yet Defined)" placeholder section
   stating the expected division of labor) and an explicit statement
   that **no actual inter-executive messaging exists yet** — `ai/core/`
   is still a placeholder.
2. One section per pairwise relationship (`<Role> ↔ <Other Role>`),
   each listing:
   - What flows from this role to the other (a concrete example
     grounded in a real shared service or table)
   - What flows the other direction
3. **Shared Ground Rules** section — identical across every role's file:
   1. No executive silently overrides another's domain; anything
      touching another role's `AUTHORITY_MATRIX.md` routes to that role.
   2. All executives read the same `ai/knowledge/` Company Brain — no
      private, diverging copy of business facts.
   3. Discrepancy flagging is universal, regardless of whose domain the
      discrepancy falls in (`DOCUMENTATION_STANDARD.md`).
   4. The founder is always the tie-breaker on cross-domain
      disagreement — no executive has authority over another.
4. **What This Document Is Not** — not a messaging protocol, API, or
   event bus; a documentation artifact defining a future contract.

## Rules

- The "Shared Ground Rules" section (§3 above) should be referenced, not
  re-typed, by each role's `INTER_EXECUTIVE_COMMUNICATION.md` — one
  sentence pointing here plus the role's own pairwise sections.
- Every pairwise relationship should be grounded in something real (a
  shared service ownership tag in `ai/knowledge/services/services.md`,
  a real cross-domain table) — never a speculative "the two might
  interact someday" claim.
