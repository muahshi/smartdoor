# Prompt Standard

The shape every `ai/executives/<role>/PROMPT_TEMPLATE.md` follows. Every
existing one opens with the same disclaimer, for good reason: **this is
a documentation artifact, not a live prompt** — nothing wires it into an
executable agent as of this phase.

## Standard Structure

### 1. Assembly Order
A numbered list of the files a future `ai/core/` runtime would assemble
the role's system prompt from, in this fixed relative order:

```
1. <ROLE>_PROFILE.md         (identity, persona, voice)
2. MISSION.md                (what it optimizes for)
3. RESPONSIBILITIES.md       (scope)
4. AUTHORITY_MATRIX.md       (what requires approval)
5. DECISION_RULES.md         (how it reasons)
6. [any role-specific grounding file, e.g. FINANCIAL_MODEL.md]
7. ESCALATION_MATRIX.md      (how it routes issues, if the role has one)
8. [task-relevant *_GUIDE.md, selected by task type — see routing table]
9. ai/knowledge/MASTER_INDEX.md          (Company Brain entry point)
10. [task-relevant Company Brain domain file(s)]
11. The actual task/question from the founder
```

### 2. Task-Type → Guide Routing Table
A table of `Task type | Guide(s) to include`, mapping realistic task
categories to which of the role's own `*_GUIDE.md` files apply. This is
where the role's domain expertise becomes selectively loaded rather than
dumped in full every time.

### 3. Skeleton Prompt Text
A fenced code block with the literal draft system-prompt text, always
including:
- "You are the AI `<Role>` of SmartDoor, defined by [the 5 core files]."
- "Ground every claim in the Company Brain... and, where available, live
  data via `ai/integrations/` — never in assumption or general
  [domain] convention."
- "Never take or recommend an action that `AUTHORITY_MATRIX.md` marks as
  requiring founder approval without flagging that requirement
  explicitly."
- "When documentation and live reality disagree, trust reality and say
  so."
- "Founder: Mubashir Hasan (Muah). Task: {task}"

### 4. Guardrails Every Assembled Prompt Must Include
A bulleted list restating, as non-negotiable reminders, the role's
highest-stakes `AUTHORITY_MATRIX.md` items and `DECISION_RULES.md`
non-downgrade rules, plus always the final item: **explicit reminder
that this is [current phase] documentation — no execution capability
exists to invoke, even if a future runtime asks.**

## Rules

- The Assembly Order's relative sequencing (identity → mission → scope →
  authority → reasoning → domain grounding → knowledge base → task) is
  fixed across every role; only the specific file list at steps 6–8
  varies.
- Every guardrail listed must map to something that already exists in
  that role's `AUTHORITY_MATRIX.md` or `DECISION_RULES.md` — a prompt
  template never introduces a new rule that isn't defined elsewhere.
