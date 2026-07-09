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

  /**
   * SHARED LAYOUT — identical structural positions for every material.
   * Only `js/plateRenderer.js` reads this; templates below never repeat it.
   * @typedef {Object} PlateLayout
   */
  const LAYOUT = {
    // Single top symbol slot — house icon (default) / religious symbol / logo.
    // sizeFrac drives vector icon/symbol rendering; wFrac/hFrac give the
    // (wider) bounding box used to scale-and-center an uploaded logo.
    topSymbol:   { xFrac: 0.5, yFrac: 0.125, sizeFrac: 0.17, wFrac: 0.22, hFrac: 0.19 },
    dividerTop:  { xFrac: 0.5, yFrac: 0.222, widthFrac: 0.34 },
    houseNoLabel:{ xFrac: 0.5, yFrac: 0.263, fontSizeFrac: 0.028, letterSpacingFrac: 0.006 },
    houseNumber: { xFrac: 0.5, yFrac: 0.365, fontSizeFrac: 0.125, maxWidthFrac: 0.7, align: 'middle' },
    dividerMid:  { xFrac: 0.5, yFrac: 0.452, widthFrac: 0.34 },
    familyName:  { xFrac: 0.5, yFrac: 0.522, maxWidthFrac: 0.86, fontSizeFrac: 0.078, align: 'middle' },
    familyLabel: { xFrac: 0.5, yFrac: 0.575, fontSizeFrac: 0.032, letterSpacingFrac: 0.01 },
    scanLabel:   { xFrac: 0.5, yFrac: 0.630, fontSizeFrac: 0.024, letterSpacingFrac: 0.007 },
    qr:          { xFrac: 0.5, yFrac: 0.775, sizeFrac: 0.30 },
    brandIcon:   { xFrac: 0.40, yFrac: 0.935, sizeFrac: 0.032 },
    brandName:   { xFrac: 0.53, yFrac: 0.935, fontSizeFrac: 0.03, letterSpacingFrac: 0.004 },
    brandTagline:{ xFrac: 0.5, yFrac: 0.965, fontSizeFrac: 0.016, letterSpacingFrac: 0.006 }
  };

  /**
   * Fixed gold accent used for religious/cultural symbols on every
   * material (this mirrors the real production process: symbols are a
   * separately-applied gold inlay regardless of the plate's own base
   * engraving color).
   */
  const SYMBOL_GOLD = '#D4AF37';

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

  // ────────── ACRYLIC — high-gloss black + metallic gold engraving ──────────
  register('acrylic', {
    engravingColor: '#D4AF37',
    mutedColor: 'rgba(212,175,55,0.72)',
    engraveStyle: 'gold-shine',
    background: {
      type: 'linear', angle: 155,
      stops: [
        { offset: 0, color: '#111111' },
        { offset: 0.30, color: '#1c1c1c' },
        { offset: 0.55, color: '#151515' },
        { offset: 1, color: '#080808' }
      ]
    },
    texture: { type: 'gloss', opacity: 0.12 },
    textureExtra: { type: 'gloss', opacity: 0.05 },
    border: { color: 'rgba(212,175,55,0.45)', widthFrac: 0.006 },
    cornerRadiusFrac: 0.035,
    screws: [
      { xFrac: 0.10, yFrac: 0.045, rFrac: 0.018, color: '#D4AF37', style: 'flat' },
      { xFrac: 0.90, yFrac: 0.045, rFrac: 0.018, color: '#D4AF37', style: 'flat' },
      { xFrac: 0.10, yFrac: 0.955, rFrac: 0.018, color: '#D4AF37', style: 'flat' },
      { xFrac: 0.90, yFrac: 0.955, rFrac: 0.018, color: '#D4AF37', style: 'flat' }
    ],
    shadow: { blurFrac: 0.045, nearBlurFrac: 0.012, opacity: 0.5, nearOpacity: 0.38, color: '#000000', dyFrac: 0.028, nearDyFrac: 0.008 }
  });

  // ────────── TEAKWOOD — polished teak, black engraved text (groove cut) ──────────
  register('teakwood', {
    engravingColor: '#1A0D04',
    mutedColor: 'rgba(26,13,4,0.72)',
    engraveStyle: 'groove',
    background: {
      type: 'linear', angle: 155,
      stops: [
        { offset: 0, color: '#8a6438' },
        { offset: 0.32, color: '#a9814f' },
        { offset: 0.6, color: '#946c3d' },
        { offset: 1, color: '#6f512c' }
      ]
    },
    texture: { type: 'grain', opacity: 0.20 },
    textureExtra: { type: 'vignette', opacity: 0.22 },
    border: { color: 'rgba(26,13,4,0.4)', widthFrac: 0.007 },
    cornerRadiusFrac: 0.025,
    screws: [
      { xFrac: 0.10, yFrac: 0.045, rFrac: 0.018, color: 'rgba(26,13,4,0.75)', style: 'phillips' },
      { xFrac: 0.90, yFrac: 0.045, rFrac: 0.018, color: 'rgba(26,13,4,0.75)', style: 'phillips' },
      { xFrac: 0.10, yFrac: 0.955, rFrac: 0.018, color: 'rgba(26,13,4,0.75)', style: 'phillips' },
      { xFrac: 0.90, yFrac: 0.955, rFrac: 0.018, color: 'rgba(26,13,4,0.75)', style: 'phillips' }
    ],
    shadow: { blurFrac: 0.05, nearBlurFrac: 0.014, opacity: 0.45, nearOpacity: 0.35, color: '#000000', dyFrac: 0.03, nearDyFrac: 0.009 }
  });

  // ────────── STAINLESS STEEL — brushed matte silver, black engraved text ──────────
  register('stainless', {
    engravingColor: '#0B1525',
    mutedColor: 'rgba(11,21,37,0.72)',
    engraveStyle: 'groove',
    background: {
      type: 'linear', angle: 155,
      stops: [
        { offset: 0, color: '#bfc9d1' },
        { offset: 0.28, color: '#e4e9ed' },
        { offset: 0.52, color: '#cdd5db' },
        { offset: 1, color: '#a3adb6' }
      ]
    },
    texture: { type: 'brushed', opacity: 0.18 },
    textureExtra: { type: 'gloss', opacity: 0.07 },
    border: { color: 'rgba(11,21,37,0.32)', widthFrac: 0.005 },
    cornerRadiusFrac: 0.02,
    screws: [
      { xFrac: 0.10, yFrac: 0.045, rFrac: 0.018, color: 'rgba(11,21,37,0.65)', style: 'flat' },
      { xFrac: 0.90, yFrac: 0.045, rFrac: 0.018, color: 'rgba(11,21,37,0.65)', style: 'flat' },
      { xFrac: 0.10, yFrac: 0.955, rFrac: 0.018, color: 'rgba(11,21,37,0.65)', style: 'flat' },
      { xFrac: 0.90, yFrac: 0.955, rFrac: 0.018, color: 'rgba(11,21,37,0.65)', style: 'flat' }
    ],
    shadow: { blurFrac: 0.035, nearBlurFrac: 0.01, opacity: 0.35, nearOpacity: 0.3, color: '#000000', dyFrac: 0.022, nearDyFrac: 0.007 }
  });

  /** Generic fallback template used only if a future product forgets to register one. */
  const FALLBACK = TEMPLATES.acrylic;

  function get(key) {
    return TEMPLATES[key] || FALLBACK;
  }

  global.SD_PlateTemplates = { register, get, layout: LAYOUT, symbolGold: SYMBOL_GOLD, _all: TEMPLATES };
})(window);
