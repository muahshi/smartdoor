# Executive Briefing Guide

The structure the AI CEO uses to present a cross-domain situation to the
founder. Distinct from `EXECUTIVE_MEETING_GUIDE.md`, which is the
cadence/format for a recurring multi-domain check-in — this file is the
shape of any single briefing, whenever it happens.

## The Structure

Every cross-domain briefing follows this shape, in order:

### 1. Situation

One or two sentences stating the actual question or event — no framing,
no recommendation yet.

### 2. Domains Touched

List which sibling executives' documentation is actually relevant, and
why. If only one domain is genuinely touched, say so and route there
instead of producing a full briefing (see `EXECUTIVE_ORCHESTRATION.md`
Pattern 1).

### 3. Each Executive's Actual Position, Cited

For each domain touched, state what that executive's real documentation
says — with a direct citation (file and, where applicable, table/service
name) — not a CEO paraphrase presented without attribution. If a
domain's documentation doesn't cover the specific question, say so
rather than inferring an answer on that executive's behalf.

### 4. Where They Agree, Conflict, or Leave a Gap

Explicitly state which of the three applies. Agreement should be stated
as agreement, not silently assumed. A real conflict (per
`EXECUTIVE_ORCHESTRATION.md` Pattern 3) gets named as a conflict, not
softened into "some nuance to consider." A gap (per Pattern 4) gets
named as unowned, not quietly assigned to whichever domain seems
closest.

### 5. Options, Not a Decision

Present the founder with the actual choices implied by the domains'
positions — never a single "recommended path" framed as if it were
already decided. Where `DECISION_FRAMEWORK.md`'s trade-off structure
applies (a genuine conflict, not just multiple relevant domains), use it
here.

### 6. What This Briefing Does Not Cover

State explicitly if a related question is out of scope for this
briefing (e.g. "this doesn't address whether the underlying feature is
technically ready — see CTO's `RISK_FRAMEWORK.md` directly for that"),
so the founder knows what to check next rather than assuming the
briefing was exhaustive.

## What Makes a Briefing Good

- Every domain position is traceable to a real file in that executive's
  folder — never a CEO-invented stance.
- The founder can disagree with the CEO's read of a conflict and go
  check the underlying executive documents themselves in under a
  minute, because the citations are specific.
- A briefing that finds no real conflict says so plainly — manufacturing
  disagreement where none exists is exactly as dishonest as hiding a
  real one.

## What a Briefing Is Not

- Not a meeting transcript or a simulated conversation between five AI
  personas — no such runtime exists (`ai/core/` is an empty placeholder).
  This is a document-assembly discipline for a single CEO response, not
  a multi-agent dialogue.
- Not a substitute for the founder reading a sibling executive's full
  documentation when the stakes justify it — the briefing is a fast,
  cited summary, not the final word.
