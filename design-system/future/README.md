# Future Extension Points (not implemented yet)

This file documents where a future capability plugs in, so it can be
added without an architectural rewrite. None of this is implemented —
it's the seam left open on purpose.

## Master SVG Templates / Figma Export

Today `js/plateRenderer.js` builds the `<svg>` string procedurally from
`js/plateTemplates.js` tokens. A future Master SVG (hand-built in
Figma/Illustrator, exported per material) would replace the *generation*
step, not the data model:

- The template-data JSON (`design-system/template-data/*.json`) already
  describes every field's position/size as a fraction of plate
  width/height — the same coordinate system an SVG `viewBox` uses. A
  Figma export at any fixed size can be re-expressed in this fractional
  system without new math.
- Extension point: `renderMarkup()` in `js/plateRenderer.js` would grow
  a second code path — `renderFromMasterSvg(templateKey, opts)` — that
  loads a static SVG asset and does text/QR substitution into named
  placeholder nodes (e.g. `id="familyName"`) instead of drawing
  everything from scratch. The per-field layout tokens stay the single
  source of truth for where those placeholder nodes must sit.

## PDF Template (manufacturing / customer proof)

- `design-system/tokens/dimensions.js` already defines `safeAreaInsetFrac`
  for exactly this: a PDF export needs bleed/safe-area margins that the
  on-screen SVG preview doesn't strictly enforce today.
- Extension point: a `services/pdfExport.js` consuming the same
  `template-data/*.json` + the actual customer customization payload,
  rendering to a print-ready PDF (likely via the existing renderer's
  `renderMarkup()` output converted server-side, so layout never drifts
  from the live preview).

## Manufacturing Template

- `template-data/*.json` is the intended machine-readable handoff format
  for a laser/CNC job ticket (material, engraving color, safe area,
  exact field coordinates). A `services/manufacturingExport.js` would
  map this JSON + order customization into whatever format the
  fabrication vendor needs, without touching the renderer.

## Mobile Apps

- Because `js/plateRenderer.js` only depends on `template-data`-shaped
  tokens + a canvas 2D context for text measurement (with a
  non-browser fallback already in `measureWidth()`), the same
  fractional layout model is portable to React Native / native SVG
  rendering. The token files are already framework-agnostic plain
  objects — a mobile client would port `js/plateRenderer.js`'s drawing
  logic, not the data.

## AR / Camera Preview

- `js/cameraPreview.js` already exists and `renderMarkup()` is
  explicitly documented as reusable outside a DOM container for this
  reason (see its file header). No changes needed here beyond keeping
  that contract intact as the renderer evolves.

## Ground rule for whoever implements any of the above

Do not fork the layout numbers. Every new consumer must read from
`design-system/tokens/*.js` (browser) or `design-system/template-data/*.json`
(everything else) — never hardcode a second copy of a coordinate,
color, or font size.
