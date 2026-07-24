# Phase 2A — Checkout Persistence Fix — Deployment Runbook

## What this patch does
Adds columns to `orders` and `manufacturing` so the customization data the
configurator/checkout already sends (house name, house number, font style,
size, finish, symbol, QR style, logo filename) is actually stored and read
back correctly, instead of being silently dropped or read from the wrong
(always-empty) fields. See `sql/67_phase2a_persistence_fix.sql` for the
full root-cause writeup.

No existing column is renamed, dropped, or retyped. No frontend changes.
No business logic changes.

## ⚠️ Deployment order is not optional

`create-razorpay-order`, `verify-razorpay-payment`, and `razorpay-webhook`
are auto-deployed by `.github/workflows/deploy-functions.yml` on push — but
that workflow does **not** run SQL migrations. The updated functions insert
into columns that only exist after `67_phase2a_persistence_fix.sql` has run.

If the functions are deployed before the migration:
- `create-razorpay-order` will fail on every checkout attempt (visible —
  customers get "Order creation failed", no orders are lost, just blocked).
- `verify-razorpay-payment` / `razorpay-webhook` will fail to create the
  `manufacturing` record for a **paid** order. With this patch's hardening,
  that failure is now logged (console + `error_logs` table) instead of
  silently vanishing, but it is still a real fulfillment gap — the order is
  paid and stuck with no plate queued for production until someone acts on
  the log.

**Follow this exact sequence:**

1. **Run the migration.**
   In the Supabase SQL editor (or your migration runner), execute
   `sql/67_phase2a_persistence_fix.sql` against the production database.
   It is additive-only and idempotent — safe to re-run if you're ever
   unsure whether it already applied.

2. **Reload the PostgREST schema cache.**
   Supabase's REST layer caches the schema and may not immediately see the
   new columns. In the Supabase dashboard: **Settings → API → "Reload
   schema"**. (Equivalent SQL: `NOTIFY pgrst, 'reload schema';`)

3. **Verify the columns are live.**
   Run a quick `select house_name, house_number, font_style, customization
   from orders limit 1;` and the equivalent for `manufacturing` — confirm
   no "column does not exist" error before proceeding.

4. **Deploy the Edge Functions.**
   Push/merge as normal — the GitHub Actions workflow deploys
   `create-razorpay-order`, `verify-razorpay-payment`, and
   `razorpay-webhook`.

5. **Smoke test end-to-end.**
   Place one real (or sandbox/test-mode) order through the full
   configurator → checkout → payment flow. Confirm:
   - The resulting `orders` row has `house_name`, `house_number`,
     `font_style`, and a populated `customization` JSONB.
   - The resulting `manufacturing` row has `plate_size`, `finish`,
     `symbol`, `qr_style`, and (if a logo was uploaded) `logo_file_name`
     populated — not just `plate_name`/`house_number` as before.
   - `error_logs` has no new `fatal`/`payment` rows from this test order.

## Rollback

Safe at any point. The new columns are additive and nullable — nothing
else in the schema references them yet, so they can be left in place or
dropped without side effects. Reverting the three Edge Functions to their
pre-Phase-2A versions is also safe; it simply resumes the old behavior of
storing empty `house_number`/`font_style` (the original bug this patch
fixes), not a new failure mode.

## Monitoring after rollout

Both `verify-razorpay-payment` and `razorpay-webhook` now write a `fatal`,
`category: "payment"` row to `error_logs` if the `manufacturing` insert
fails after a payment has already been captured. Since this represents a
paid order with nothing queued for production, treat any such row as
requiring same-day manual follow-up (create the missing `manufacturing`
row by hand from the corresponding `orders` row) until/unless this is
wired into active alerting.
