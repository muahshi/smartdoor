# Data Contracts

The shared request/response shape every `ai/integrations/<name>/`
folder's own "Data Contracts" section follows, so a future implementer
building the second or third integration doesn't re-derive this
structure from scratch, and so every executive consuming integration
data can rely on one consistent envelope regardless of which vendor is
behind it.

## Status

Architecture and contract only, per every other file in this phase. No
integration described in this folder has a real request or response
today — this defines the shape a future implementation must produce.

## The Envelope

Every future SDOS integration read, regardless of vendor, resolves to
the same two-part shape already established by
`ai/core/permissions/PERMISSION_MODEL.md`'s `PermissionCheck` /
`PermissionResult` pattern and `ai/core/runtime/ERROR_HANDLING.md`'s
fail-closed convention:

```
IntegrationRead (input):
  integration:        string   # registry key, e.g. "supabase", "razorpay"
  capability:          string   # one specific documented capability from
                                 # that integration's own README, never a
                                 # free-form query
  requested_by:        string   # executive role_id making the request
  scope:                object  # the minimum fields/rows/date-range needed,
                                 # per READONLY_POLICY.md rule 3 (scoped,
                                 # not blanket, access)

IntegrationResult (output):
  outcome:              enum     # OK | EMPTY | INTEGRATION_ERROR
  data:                  object?  # present only when outcome = OK, shaped
                                    # per that integration's own documented
                                    # "Outputs" section
  source:                string   # which underlying system this came from,
                                    # for `CONTEXT_LOADING.md`'s "live data
                                    # wins, and is attributed" rule
  fetched_at:            string   # ISO 8601 timestamp of the read itself
  error:                  string?  # present only when outcome = INTEGRATION_ERROR
```

## Rules

1. **`capability` is always one of the specific, named capabilities
   listed in that integration's own README "Supported Capabilities"
   section** — never an arbitrary query string, raw SQL, or open-ended
   API call. This is the mechanical enforcement of
   `READONLY_INTEGRATION_POLICY.md` rule 3 ("scoped, not blanket").
2. **`outcome` has exactly three values, matching
   `ERROR_HANDLING.md`'s existing fail-closed convention** — there is no
   partial-success or best-effort state. A read that can't be fully and
   correctly satisfied is `INTEGRATION_ERROR`, not a guess.
3. **`data` never contains a raw credential, secret, or full webhook
   payload** — only the specific fields that integration's own "Outputs"
   section documents, matching `SECURITY_GUIDELINES.md`'s minimum-
   necessary-data rule.
4. **`source` and `fetched_at` are mandatory on every `OK` result** —
   this is what lets `CONTEXT_LOADING.md` step 5 ("live data wins over
   Company Brain, and the conflict is flagged, not silently resolved")
   actually attribute and timestamp a live read against a Company Brain
   snapshot.
5. **No result is cached or reused across a different `requested_by`
   without a fresh `IntegrationRead`** — this restates
   `PERMISSION_MODEL.md` rule 3's "no check result is cached across
   sessions" for reads specifically, not just permission checks.

## Relationship to the Rest of SDOS

- This envelope is what a future `INTEGRATION_ERROR` (already named in
  `ai/core/runtime/ERROR_HANDLING.md`) and a future `integration.read`
  event (already named in `ai/core/events/EVENT_BUS.md`) will carry.
- Each integration's own "Data Contracts" section in its README
  specializes `data`'s shape for that vendor; none of them redefine the
  envelope around it.
- `READONLY_POLICY.md` governs what `capability` and `scope` are
  allowed to request in the first place; this file governs the shape of
  the request and result once that's already been decided.
