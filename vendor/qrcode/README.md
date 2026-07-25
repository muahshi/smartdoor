# Vendored `qrcode`

`qrcode.v1.5.4.min.js` is a self-contained, single-file ESM bundle of the
`qrcode` npm package (pinned version in the filename). No external imports —
same pattern as `vendor/supabase-js/`.

## Why this exists

`services/qr.js` (the premium black+gold QR renderer used across the whole
platform) and `services/gstInvoicePdf.js` (invoice verification QR) used to
import this library live from `https://esm.sh/qrcode@1.5.4` at call time.
That is exactly the same class of problem `vendor/supabase-js/` was created
to fix: a CSP `script-src`/`connect-src` block on the CDN origin, a CDN
outage, or a flaky mobile network all make the dynamic `import()` reject
with "Failed to fetch dynamically imported module" — which is what surfaced
in production ("QR generation failed: Failed to fetch dynamically imported
module: https://esm.sh/qrcode@1.5.4"). Vendoring removes the third-party
network dependency entirely; the library now ships same-origin.

(`vercel.json`'s CSP was also updated to allow `esm.sh` as a defense-in-depth
measure, but that alone doesn't help if the CDN itself is unreachable — this
vendored copy is the actual fix, matching how `supabase-js` was handled.)

## How it was built

```bash
mkdir /tmp/sd-vendor && cd /tmp/sd-vendor
npm install qrcode@1.5.4 esbuild --no-save
echo "export { default } from 'qrcode';" > entry.js
npx esbuild entry.js --bundle --format=esm --minify --target=es2020 \
  --platform=browser --outfile=qrcode.min.js
```

## Updating the pinned version

1. Repeat the build steps above with the newer `qrcode@x.y.z`.
2. Save the output as `vendor/qrcode/qrcode.v<x.y.z>.min.js`.
3. Update the import path in `services/qr.js` and `services/gstInvoicePdf.js`
   to the new filename.
4. Delete the old versioned file.
5. Smoke-test: Admin → Download QR (PNG + SVG), Admin → new customer QR
   preview, and Billing → download a GST invoice PDF (has a small
   verification QR) before deploying.

Do not point either import back at a CDN URL.
