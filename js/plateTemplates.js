/**
 * plateTemplates.js
 * ------------------------------------------------------------------
 * PHASE 4 — Professional Product Preview Engine (Template Layer)
 * PHASE 5 — Preview Engine Finalization (this pass)
 *
 * Vertical "classic nameplate" layout — matches the reference SmartDoor
 * plate designs (top symbol slot → HOUSE NO. → big number → divider →
 * Family Name → FAMILY caption → SCAN TO CONNECT → QR → SMART DOOR
 * brand footer), stacked top-to-bottom on a portrait plate.
 *
 * The LAYOUT (positions/sizes of every element) is shared across every
 * material — only look-and-feel tokens (background, texture, border,
 * screws, shadow, engravingColor) differ per material. This is what
 * "reusable rendering engine" means here: a future material is just a
 * new set of style tokens via SD_PlateTemplates.register(); it
 * automatically gets the exact same proven layout.
 *
 * COORDINATE SYSTEM: every position/size below is a FRACTION (0–1) of
 * the plate's own width/height, not a pixel value. This is what makes
 * the renderer size-agnostic — 8×12, 10×16, 18×12, 24×16, Custom, or
 * any future size all reuse the exact same layout unchanged; only the
 * outer viewBox aspect ratio changes (driven by the product's `sizes`
 * catalog entry via widthIn/heightIn), and every element scales
 * proportionally with it.
 *
 * SINGLE TOP SYMBOL SLOT: there is exactly ONE slot at the top of the
 * plate (`topSymbol`). It renders, in priority order:
 *   1. Uploaded customer logo (if present)
 *   2. A gold religious/cultural symbol (if the customer picked one)
 *   3. The default Home icon (fallback, engraved in the plate's own
 *      engraving color)
 * Only one of these is ever drawn — see js/plateRenderer.js.
 * ------------------------------------------------------------------
 */
(function (global) {
  'use strict';

  const TEMPLATES = {};

  const tokens = global.SD_Tokens;
  if (!tokens || !tokens.spacing || !tokens.typography || !tokens.materials || !tokens.dimensions) {
    throw new Error(
      'SD_Tokens not found. design-system/tokens/*.js must be loaded before js/plateTemplates.js (see index.html script order).'
    );
  }

  /**
   * SHARED LAYOUT — identical structural positions for every material.
   * Only `js/plateRenderer.js` reads this; templates below never repeat it.
   * Built by merging design-system/tokens/spacing.js (position) with
   * design-system/tokens/typography.js (font size/tracking/align) field
   * by field — a pure recomposition of the two token sources, not a
   * behavior change from the pre-design-system inline LAYOUT constant.
   * @typedef {Object} PlateLayout
   */
  const LAYOUT = Object.keys(tokens.spacing.fields).reduce((acc, field) => {
    acc[field] = Object.assign({}, tokens.spacing.fields[field], tokens.typography.fields[field] || {});
    return acc;
  }, {});

  /**
   * Fixed gold accent used for religious/cultural symbols on every
   * material (this mirrors the real production process: symbols are a
   * separately-applied gold inlay regardless of the plate's own base
   * engraving color). Sourced from design-system/tokens/materials.js.
   */
  const SYMBOL_GOLD = tokens.materials.symbolGold;

  /**
   * @typedef {Object} PlateTemplate
   * @property {string} key
   * @property {string} engravingColor  - the ONE color used for every engraved element (icon/symbol fallback, dividers, labels, name, house number, QR accent). Customers cannot override this — it is fixed per material/product.
   * @property {string} mutedColor      - softer variant of engravingColor used for captions (FAMILY / SCAN TO CONNECT / tagline)
   * @property {'gold-shine'|'groove'} engraveStyle - visual finish applied to engraved elements: metallic gold gradient+sheen, or a cut/groove depth effect
   * @property {{type:'linear'|'radial', angle?:number, stops:{offset:number,color:string}[]}} background
   * @property {{type:'none'|'grain'|'brushed'|'gloss', opacity:number}} texture
   * @property {{type:'gloss'|'vignette', opacity:number}} [textureExtra] - optional secondary overlay layered on top of `texture`
   * @property {{color:string, widthFrac:number}} border
   * @property {number} cornerRadiusFrac
   * @property {{xFrac:number,yFrac:number,rFrac:number,color:string,style:'flat'|'phillips'}[]} screws
   * @property {{blurFrac:number, opacity:number, color:string, dyFrac:number}} shadow
   */

  function register(key, template) {
    TEMPLATES[key] = Object.assign({ key }, template);
    // Back-compat alias — earlier phases referred to this as primaryColor.
    TEMPLATES[key].primaryColor = TEMPLATES[key].engravingColor;
  }

  // ────────── build every material template from design-system tokens ──────────
  // Screw positions/radius are the universal dimension token; color+style are
  // the only per-material piece (tokens.materials[key].screwStyle), matching
  // exactly what used to be hand-written 4 times over per material below.
  const screwPositions = tokens.dimensions.screw.positions;
  const screwR = tokens.dimensions.screw.rFrac;

  ['acrylic', 'teakwood', 'stainless'].forEach((key) => {
    const mat = tokens.materials[key];
    register(key, {
      engravingColor: mat.engravingColor,
      mutedColor: mat.mutedColor,
      engraveStyle: mat.engraveStyle,
      background: mat.background,
      texture: mat.texture,
      textureExtra: mat.textureExtra,
      border: mat.border,
      cornerRadiusFrac: mat.cornerRadiusFrac,
      screws: screwPositions.map((p) => Object.assign({ rFrac: screwR }, p, mat.screwStyle)),
      shadow: mat.shadow
    });
  });

  /** Generic fallback template used only if a future product forgets to register one. */
  const FALLBACK = TEMPLATES.acrylic;

  function get(key) {
    return TEMPLATES[key] || FALLBACK;
  }

  global.SD_PlateTemplates = { register, get, layout: LAYOUT, symbolGold: SYMBOL_GOLD, _all: TEMPLATES };
})(window);
