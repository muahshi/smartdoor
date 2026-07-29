# Context Loading

The contract for assembling an executive's context for a single turn.
Every one of the six existing executives' `PROMPT_TEMPLATE.md` files
already lists an assembly order (e.g. CEO's: "1.
`ai/core/standards/EXECUTIVE_STANDARD.md` (shared executive contract)");
this file is the shared mechanism those lists all assume exists.

## Status

Architecture and contract only. No context has ever actually been
assembled by a runtime.

## Load Order (Standard, Every Executive)

1. **Standards** — `ai/core/standards/EXECUTIVE_STANDARD.md` and any
   other standard the requested action touches (e.g.
   `AUTHORITY_STANDARD.md` for anything decision-adjacent). Loaded
   first because every other source is interpreted through this shared
   contract.
2. **Role definition** — the requested executive's own
   `ai/executives/<role>/` folder: profile, mission, responsibilities,
   authority matrix, decision rules, and the specific domain playbook(s)
   relevant to the task.
3. **Company Brain** — `ai/knowledge/MASTER_INDEX.md` and the specific
   knowledge-domain files it links to that are relevant to the task
   (per each executive's own "reads primarily..." note in
   `ai/knowledge/MASTER_INDEX.md`'s "AI Executives Built On This
   Knowledge" section).
4. **Cross-executive input** (CEO-pattern only, or any future role that
   synthesizes across domains) — sibling executives' own
   `ai/executives/<role>/` files, per
   `ai/executives/ceo/CROSS_EXECUTIVE_COMMUNICATION.md`'s existing
   contract.
5. **Live data** (future phase only) — via `ai/integrations/`, once that
   layer exists. As of this phase, this step never executes; any
   context load that would require it fails per
   `ai/core/runtime/ERROR_HANDLING.md`'s `INTEGRATION_ERROR` class
   rather than silently proceeding without it.
6. **Memory** (future phase only) — via `ai/memory/`, once a persistence
   mechanism exists. Same fail-closed behavior as step 5 if a turn
   genuinely requires prior-session continuity that isn't yet available.

## Precedence Rule

If two loaded sources disagree, the **more concrete, more current**
source wins in this order: live data (step 5) > Company Brain (step 3)
> role definition's own domain playbooks (step 2) > standards (step 1,
which describes shape, not facts, so a factual conflict against it
should not usually arise). This mirrors Decision Standard Rule 3 ("when
documentation and reality disagree, reality wins") applied to the
context-assembly step specifically, rather than left as a downstream
reasoning concern only.

## Rules

1. **A conflict is flagged, never silently resolved.** If step 3
   (Company Brain) contradicts step 5 (live data, future phase), the
   context load surfaces both and marks the discrepancy — per
   `DOCUMENTATION_STANDARD.md` — rather than picking one and discarding
   the other.
2. **Scope is bounded by the requested executive's own domain**, per its
   `RESPONSIBILITIES.md`. A CTO turn does not load `cfo/` content unless
   the task is explicitly cross-domain (in which case it follows the
   CEO pattern in step 4).
3. **No context load silently substitutes missing data.** A missing
   required Company Brain file is a `CONTEXT_ERROR` (see
   `ai/core/runtime/ERROR_HANDLING.md`), not an invitation to reason
   from general knowledge instead — this is Decision Standard Rule 5/6's
   "if it doesn't map to anything real, say so" applied at the loading
   step.
4. **Size/scope discipline.** A future implementation should load only
   what steps 1–4 (and, later, 5–6) actually require for the specific
   task — not every file in every domain "to be safe." This is
   unspecified in exact mechanism (e.g. retrieval vs. full-file load) in
   this phase, since that is an implementation decision, not an
   architecture one.

## Relationship to the Rest of SDOS

- Feeds the `SPAWNING` state in `ai/core/runtime/AGENT_LIFECYCLE.md`.
- A failed load raises `CONTEXT_ERROR` or `INTEGRATION_ERROR`, handled
  per `ai/core/runtime/ERROR_HANDLING.md`.
- Depends on `ai/knowledge/MASTER_INDEX.md`'s existing reading-order
  guidance, which this file extends into a runtime contract rather than
  replacing.
