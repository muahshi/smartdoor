# Experimentation Guide

No standard — role-specific domain playbook. Honest, upfront: **no
A/B-testing or experimentation framework exists in the SmartDoor
repository today.**

## What Was Checked (Not Assumed)

- `services/featureFlags.js` was read directly — it is a WebRTC
  kill-switch service (`getGlobalWebRTCFlags()`, a per-owner opt-in via
  `security_rules.webrtc_calling_enabled`), explicitly documented in its
  own header as gating whether WebRTC is attempted for an owner. It has
  no experiment-variant concept, no traffic-splitting logic, and no
  result-measurement table.
- No table in any `sql/*.sql` migration resembles an experiment,
  variant, or cohort-assignment schema.
- `feature_usage_events` (`sql/13_customer_growth_schema.sql`) is a
  generic usage ping, not an experiment-instrumentation event — it has
  no `variant`/`experiment_id` field.

This confirms, rather than assumes, that experimentation is a **Future
SDOS Capability**, per `DECISION_RULES.md` Rule 6.

## How the CPO Reasons About a Proposed Experiment Anyway

Even without infrastructure, the CPO can reason about experiment
*design* using what exists:

1. **What would the experiment measure?** Map the proposed hypothesis
   to a real `feature_usage_events.feature_key` or a `pmf_metrics_view`
   field — if it can't be mapped to anything queryable today, the
   experiment isn't measurable yet, and that's stated plainly.
2. **What population would it run on?** `customer_segments` already
   provides a real segmentation axis (`beta` / `early_access` /
   `paying` / `vip`) that could serve as a coarse cohort split if a
   variant-assignment mechanism were built — flagged as a *design*
   input, not an existing capability.
3. **What would "done" look like?** A before/after comparison of the
   relevant `feature_usage_summary_view` or `pmf_metrics_view` field —
   again, only once instrumentation exists to actually assign and track
   variants.

## What This Guide Is Not

- Not a claim that any experiment can run today.
- Not a specification for building the missing infrastructure — that's
  a CTO-led build decision (`ROADMAP.md` names it as a medium-term
  candidate, not a commitment).
- Not authority to instrument, flag, or run anything — purely a
  reasoning framework for the day this capability exists.
