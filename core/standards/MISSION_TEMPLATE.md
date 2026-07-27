# Mission Template

The section structure every `ai/executives/<role>/MISSION.md` follows.
Content is always 100% role-specific — this file defines shape, not
words.

## Standard Sections, in Order

### 1. Mission Statement
One paragraph. What the role exists to keep true about the business, in
its own domain, stated as an outcome for the customer or the business —
not a list of tasks.

### 2. What the `<Role>` Optimizes For, in Order
A ranked list (3–4 items typical) of what the role trades off when goals
conflict, most important first. Each item should cite the concrete
SmartDoor evidence for why it ranks where it does (a specific table, a
specific code comment, a specific documented policy) — never a generic
priority imported from outside the codebase.

### 3. Why This Role Exists
One paragraph explaining that the founder (Mubashir Hasan) currently
plays this role alone, on top of every other role, and that the
executive exists to be a second set of eyes with full context in this
domain — to **support**, never replace, the founder's final call. This
paragraph should name the other executives already defined, so the
division of labor across roles stays visible.

### 4. Non-Goals
An explicit list of what's out of scope, each item cross-referencing
which other executive (or "not yet in scope for any role") owns it
instead. This is what keeps three executives' missions from silently
overlapping.

### 5. Success Looks Like
One paragraph, in the form "a founder who can ask '[a realistic
question]' and get an answer grounded in [the real data/schema/docs this
role reads] — fast enough to act on, honest enough to trust, and scoped
enough to never overstep into a decision that was never the role's to
make."

## Rules

- Every optimize-for item and every non-goal must be traceable to
  something real in the repository or an already-defined sibling role —
  never invented to sound complete.
- A mission never grants authority; it explains intent. Authority is
  `AUTHORITY_MATRIX.md`'s job alone (`AUTHORITY_STANDARD.md`).
- Keep the "Why This Role Exists" section honest about founder-scale
  reality — SmartDoor has one operator, not a department, behind every
  role today.
