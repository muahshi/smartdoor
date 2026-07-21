# Vendored @supabase/supabase-js

`supabase-js.v2.110.7.min.js` is a self-contained, single-file ESM bundle of
`@supabase/supabase-js` (pinned version in the filename). It has no external
imports — everything (auth-js, postgrest-js, realtime-js, storage-js,
functions-js) is inlined.

## Why this exists

`services/supabase.js` used to import the SDK live from
`https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm`. That is a
static top-level `import`, so any jsdelivr outage or a CSP `connect-src`
block made the module fail to load entirely, before any of the app's own
try/catch could run — taking down login, the owner dashboard, and the
visitor page at once. This directory removes that single point of failure:
the SDK now ships same-origin with the rest of the site.

## How it was built

No bundler is part of this project's normal build (`npm run build` only
generates env config), so the bundle here was produced once, out-of-band,
with esbuild, and the output is checked into the repo like any other static
asset:

```bash
mkdir /tmp/sd-vendor && cd /tmp/sd-vendor
npm install @supabase/supabase-js@2 esbuild --no-save
echo "export { createClient } from '@supabase/supabase-js';" > entry.js
npx esbuild entry.js --bundle --format=esm --minify --target=es2020 \
  --outfile=supabase-js.min.js
```

## Updating the pinned version

1. Repeat the build steps above with the newer `@supabase/supabase-js@2.x.y`.
2. Save the output as `vendor/supabase-js/supabase-js.v<X.Y.Z>.min.js`.
3. Update the import path in `services/supabase.js` to the new filename.
4. Delete the old versioned file.
5. Smoke-test login, dashboard load, and the visitor page before deploying —
   this file is on the critical path for every page in the app.

Do not point this import back at a CDN URL.
