# ai/workflows

## Purpose
Multi-step processes that AI executives will run — sequences of reasoning
and actions that span more than a single prompt/response (e.g. "review
last week's orders and draft a summary" or "check for stuck plate
activations and flag them").

## Status
Empty. Phase 0 does not implement any workflow. No business logic,
triggers, or automation exist yet.

## What will eventually go here
- Workflow definitions (steps, ordering, conditions)
- Triggers/schedules for when a workflow should run
- Links between a workflow and the executive(s)/integration(s) it uses

## What does NOT go here
- SmartDoor's actual operational workflows (visitor activation, billing,
  fulfilment, etc.) — those remain implemented in the existing
  `supabase/functions/`, `services/`, and `js/` directories and are never
  duplicated here
