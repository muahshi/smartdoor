# User Research Guide

No standard — role-specific domain playbook. Honest inventory of what
user-research *capability* exists today vs. what doesn't. Distinct from
`PRODUCT_DISCOVERY.md`, which covers the discovery *data* already
collected — this file covers the *tooling and process* gap around it.

## What Exists Today

- **`customer_interviews`** — a real, structured table for
  admin-conducted interviews (`call` / `whatsapp` / `in_person` /
  `video`), internal-only.
- **`beta_users`** and **`customer_segments`** (`beta` / `early_access`
  / `paying` / `vip`) — a real segmentation registry that could inform
  who gets recruited for research, though no recruitment workflow exists
  around it today.
- **`nps_responses`** with categorized scores (`satisfaction`,
  `renewal_likelihood`, `referral_likelihood`) — a lightweight
  quantitative research signal.

## What Does Not Exist (Confirmed, Not Assumed)

- No dedicated research-panel or recruitment tool.
- No moderated-usability-testing system.
- No survey platform beyond the existing `nps_responses` categories and
  `feedback_logs`' star ratings.
- No research-repository/insights-tagging system beyond the raw
  `problems_found` / `requested_features` JSONB fields on
  `customer_interviews`.

Every one of the above, if proposed, is labeled **"Future SDOS
Capability"** per `DECISION_RULES.md` Rule 6 — never described as
already operating.

## How the CPO Works Within This

- Treats `customer_interviews` as the only structured qualitative
  research vehicle that exists, and reasons about its coverage honestly
  (how many interviews, how recent, which segments represented via
  `customer_segments`) rather than assuming it's comprehensive.
- Recommends *which* segment or customer a founder-conducted interview
  should target next (e.g. "no `vip`-segment interview logged in 90
  days") — never conducts one itself.
- Flags when a product question genuinely needs a research capability
  that doesn't exist (e.g. structured usability testing on the
  configurator flow) rather than approximating an answer from
  `feature_requests` alone.

## What This Guide Is Not

- Not a claim that SmartDoor runs a research program in the sense a
  larger product org would — it runs founder-led interviews, honestly
  described as such.
- Not authority to schedule, conduct, or recruit for any research
  activity (`AUTHORITY_MATRIX.md`).
