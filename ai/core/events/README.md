# ai/core/events

## Purpose

The contract for SDOS's event bus — the append-only record of "what
happened" that every other runtime component reacts to or emits into.
This is the component `ai/executives/ceo/CROSS_EXECUTIVE_COMMUNICATION.md`
explicitly names as not existing yet ("Not a messaging protocol, API,
or event bus — `ai/core/` (the intended home for actual inter-executive
routing) is empty as of this phase").

## Status

SDOS Phase 9. Architecture and contract only — no event has ever been
published or consumed, because no bus exists to carry one.

## What Belongs Here

- The event schema (what every event contains, regardless of type)
- The event types this phase anticipates, and which runtime components
  publish/consume each
- Delivery and ordering guarantees a future implementation must satisfy

## What Does NOT Belong Here

- Any actual message broker, queue, or pub/sub implementation code
- Business-level notification logic (SMS/call/push to SmartDoor's real
  customers) — that remains entirely in `services/` and
  `supabase/functions/`, untouched and unduplicated
- Inter-executive *business* communication content — each executive's
  own `INTER_EXECUTIVE_COMMUNICATION.md` / `CROSS_EXECUTIVE_COMMUNICATION.md`
  defines what gets communicated; this folder defines the mechanism it
  would travel over

## Files in This Folder

| File | Purpose |
|---|---|
| `EVENT_BUS.md` | Event schema, event types, and delivery contract |
