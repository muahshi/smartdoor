# Activation Flow Redesign — Change Notes

## Problem Summary

QR scans showed "Activation Pending" even on fully active plates.

**Root cause (3 bugs):**

1. **`plates.js` `getPlateBySlug()`** filtered `.eq('status', 'active')` in the query.
   If a plate's `status` column was anything other than `'active'` (or if the RLS policy
   blocked the read), the function returned `{ success: false }` — identical to "plate
   doesn't exist." Caller could not distinguish "inactive" from "not found."

2. **`visitorExperience.js` `resolveVisitorRoute()`** treated ANY `getPlateBySlug()` failure
   as "plate not active" and immediately returned `state: 'pending_activation'`.
   This was an implicit activation check scattered in the wrong place.

3. **`sql/02_rls_policies.sql` + migration 22** defined `plates_public_qr_lookup` as
   `FOR SELECT USING (status = 'active')`. Anonymous visitors could NOT read a plate row
   unless it was already `status = 'active'` — a circular dependency that made it
   impossible to check WHY a plate wasn't active.

**Secondary bugs fixed:**
- `plates.js` only searched `qr_slug` — old plates where `plate_id` was used directly
  as the URL slug (before the `qr_slug` column existed) would never resolve.
- `activation.js` `getActivationPendingInfo()` queried the `orders` table to generate
  a pending screen message, creating a dependency on orders/manufacturing for
  a pure activation state check.

---

## Files Modified

### `services/plates.js`

**Added:** `isPlateActive(slugOrPlateId)` — the single source of truth for activation.
  - Searches both `qr_slug` AND `plate_id` (old plates support).
  - Does NOT filter on `status` in the query — reads the row and evaluates the three conditions:
    1. `owner_id IS NOT NULL`
    2. `status = 'active'`
    3. `activation_date IS NOT NULL`
  - Returns `{ active: boolean, plate, reason }` — reason for debugging only.

**Modified:** `getPlateBySlug(slugOrPlateId)`
  - Changed from `.eq('qr_slug', normalized).eq('status', 'active').single()` to
    `.or('qr_slug.eq.X,plate_id.eq.X').maybeSingle()` — supports both old and new plates.
  - Removed the `status = 'active'` filter — activation gate is now `isPlateActive()` only.
  - Now called only AFTER `isPlateActive()` confirms the plate is active.

### `services/visitorExperience.js`

**Redesigned:** `resolveVisitorRoute(slug)`

Old flow (broken):
```
getPlateBySlug() → fails if status != active → getActivationPendingInfo() (queries orders!) → pending_activation
```

New flow:
```
isPlateActive() → single activation gate (owner_id + status + activation_date)
  ↓ not active  → state: 'pending_activation' (no order/subscription queries)
  ↓ active      → getPlateBySlug() (owner name + security rules)
                → _getSubscriptionForPlate() (grace period only, not activation gate)
                → state: 'ready'
```

**Removed duplicate activation checks:**
- Removed: `getActivationPendingInfo()` import and call (was querying `orders` table)
- Removed: Inline `!result.success` → `pending_activation` logic
- Removed: Implicit activation gate in `getPlateBySlug()` failure path

### `services/activation.js`

**Removed:** `getActivationPendingInfo()` function entirely.
  - This function queried `orders.payment_status` and `orders.manufacturing_status`
    to generate a pending-screen message. Wrong dependency — the visitor page must
    NEVER depend on orders to determine activation state.
  - The pending screen now shows a simple honest message (hardcoded in `visitor.html`).
  - All other functions preserved unchanged: `activatePlateAndLog()`, `recordRenewal()`,
    `recordExpiry()`, `deactivatePlateAndLog()`, `getPlateActivationHistory()`,
    `getActivationMetrics()`.

### `sql/27_activation_redesign.sql` *(new migration)*

1. **Drops** `plates_public_qr_lookup` policy (`FOR SELECT USING (status = 'active')`).
2. **Creates** `plates_public_activation_check` policy (`FOR SELECT USING (true)`).
   - Allows anon to read any plate row. Security maintained by: (a) column-level
     selection in JS (only activation fields), (b) RLS on users/subscriptions prevents
     join leaks, (c) SECURITY DEFINER RPCs expose only non-sensitive fields.
3. Updates `get_owner_display_for_plate()` to search `qr_slug OR plate_id`.
4. Updates `get_subscription_status_for_plate()` to search `qr_slug OR plate_id`.
5. Backfills `activation_date` on all active plates where it's NULL.
6. Syncs `qr_slug = plate_id` for all existing plates.
7. Replaces partial indexes (active-only) with full indexes on `qr_slug` and `plate_id`.

---

## Deployment Order

```
1. Run sql/27_activation_redesign.sql in Supabase SQL Editor
2. Deploy services/plates.js
3. Deploy services/visitorExperience.js
4. Deploy services/activation.js
5. Test: scan a known active plate QR → should open visitor.html immediately
6. Test: visit /p/NONEXISTENT → should show pending screen
7. Test: check activation_date backfill: SELECT plate_id, activation_date FROM plates WHERE status='active';
```

---

## Activation Conditions (Single Source of Truth)

A plate is **ACTIVE** if and only if (checked in `services/plates.js` → `isPlateActive()`):

```
plates.owner_id    IS NOT NULL    -- owner assigned
plates.status      = 'active'     -- system/admin confirmed active
plates.activation_date IS NOT NULL -- activation was recorded
```

Once these three are true:
- QR scan → `visitor.html` immediately
- No order check
- No subscription check
- No pending screen
- Activation never re-evaluated

Subscription/grace-period evaluation in `gracePeriod.js` is separate — it gates
features (voice notes, calls) but never gates the activation screen.

---

## Verification Checklist

- [ ] New plate provisioned → owner logs in → all three conditions met → QR opens visitor.html
- [ ] Existing active plate → QR opens visitor.html (no pending screen)
- [ ] Old plate (plate_id as slug, no qr_slug) → resolves correctly
- [ ] Inactive/suspended plate → shows pending screen
- [ ] Non-existent plate → shows pending screen
- [ ] No regressions on `getActivationMetrics()` (admin dashboard unchanged)
- [ ] `deactivatePlateAndLog()` still works (sets status=inactive → pending screen shown)
