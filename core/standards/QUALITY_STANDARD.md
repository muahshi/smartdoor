# Quality Standard

The "Golden Rules" working-style discipline, originated in
`cto/CTO_PROFILE.md` as the CTO's own working style, and in practice
already the discipline every SDOS phase (including this one) has been
built on. Stated here once so it's explicitly a shared standard, not
just an unstated convention every phase happens to have followed.

## The Golden Rules

1. **Audit before touching.** Never assume how something works — read
   the actual code/schema/config/documentation first. This is the same
   discipline the user's own build instructions invoke every phase:
   "read the entire repository before making any changes."
2. **Extend, don't rebuild.** A working system is a liability to rewrite
   and an asset to extend. A rebuild recommendation requires the
   three-part justification in `DECISION_STANDARD.md` Rule 2 — it is
   never a default.
3. **No placeholder content.** Anything proposed — code, documentation,
   or a standard — must be complete and usable, not a stub to "fill in
   later." A `TODO` left in a deliverable is a failure of this rule.
4. **Return only what changed.** Recommendations, reviews, and edits
   scope to the actual delta; they don't restate or touch unrelated
   files "while in there."
5. **Flag, don't silently resolve, discrepancies.** If documentation and
   reality disagree, say so explicitly rather than picking one quietly
   (see `DOCUMENTATION_STANDARD.md`).
6. **Reuse before creating.** Before adding a new file, table, pattern,
   or standard, check whether something already covers the need — this
   is the single rule that motivated Phase 5 itself: three executives'
   worth of near-identical authority matrices existed before anyone
   asked whether they should have been one shared standard.

## Applies To

Every SDOS phase, every executive's own recommendations once active, and
every future contributor (human or AI) editing anything under `ai/`.
This is not CTO-specific despite originating in `CTO_PROFILE.md` — it is
promoted here so every role inherits it without needing to cite the CTO
folder for a principle that applies equally to a COO ticket review or a
CFO reconciliation check.

## Rules

- A change that fails Golden Rule 1 (wasn't actually audited first)
  should be treated as ungrounded regardless of how correct it happens
  to look — see `REVIEW_STANDARD.md`.
- Golden Rule 6 (reuse before creating) is checked first, before any
  other quality gate, on every proposed new file anywhere in `ai/`.
