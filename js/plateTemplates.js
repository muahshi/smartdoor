/**
 * plateTemplates.js
 * ------------------------------------------------------------------
 * PHASE 4 — Professional Product Preview Engine (Template Layer)
 *
 * Vertical "classic nameplate" layout — matches the reference SmartDoor
 * plate designs (house icon → HOUSE NO. → big number → divider →
 * Family Name → FAMILY caption → SCAN TO CONNECT → QR → SMART DOOR
 * brand footer), stacked top-to-bottom on a portrait plate.
 *
 * The LAYOUT (positions/sizes of every element) is shared across every
 * material — only look-and-feel tokens (background, texture, border,
 * screws, shadow, primaryColor) differ per material. This is what
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
    houseIcon:   { xFrac: 0.5, yFrac: 0.125, sizeFrac: 0.16 },
    dividerTop:  { xFrac: 0.5, yFrac: 0.205, widthFrac: 0.34 },
    houseNoLabel:{ xFrac: 0.5, yFrac: 0.248, fontSizeFrac: 0.028, letterSpacingFrac: 0.006 },
    houseNumber: { xFrac: 0.5, yFrac: 0.355, fontSizeFrac: 0.125, align: 'middle' },
    dividerMid:  { xFrac: 0.5, yFrac: 0.445, widthFrac: 0.34 },
    familyName:  { xFrac: 0.5, yFrac: 0.515, maxWidthFrac: 0.86, fontSizeFrac: 0.078, align: 'middle' },
    familyLabel: { xFrac: 0.5, yFrac: 0.568, fontSizeFrac: 0.032, letterSpacingFrac: 0.01 },
    scanLabel:   { xFrac: 0.5, yFrac: 0.625, fontSizeFrac: 0.024, letterSpacingFrac: 0.007 },
    qr:          { xFrac: 0.5, yFrac: 0.775, sizeFrac: 0.30 },
    logo:        { xFrac: 0.5, yFrac: 0.125, wFrac: 0.15, hFrac: 0.15, defaultSrc: null },
    religionSymbol: { xFrac: 0.115, yFrac: 0.11, sizeFrac: 0.09 },
    brandIcon:   { xFrac: 0.40, yFrac: 0.935, sizeFrac: 0.032 },
    brandName:   { xFrac: 0.53, yFrac: 0.935, fontSizeFrac: 0.03, letterSpacingFrac: 0.004 },
    brandTagline:{ xFrac: 0.5, yFrac: 0.965, fontSizeFrac: 0.016, letterSpacingFrac: 0.006 }
  };

  /**
   * @typedef {Object} PlateTemplate
   * @property {string} key
   * @property {string} primaryColor    - single accent used for icon/dividers/labels/name/QR (matches reference: one consistent ink color per plate)
   * @property {string} mutedColor      - softer variant used for captions (FAMILY / SCAN TO CONNECT / tagline)
   * @property {{type:'linear'|'radial', angle?:number, stops:{offset:number,color:string}[]}} background
   * @property {{type:'none'|'grain'|'brushed'|'gloss', opacity:number}} texture
   * @property {{color:string, widthFrac:number}} border
   * @property {number} cornerRadiusFrac
   * @property {{xFrac:number,yFrac:number,rFrac:number,color:string}[]} screws
   * @property {{blurFrac:number, opacity:number, color:string, dyFrac:number}} shadow
   */

  function register(key, template) {
    TEMPLATES[key] = Object.assign({ key }, template);
  }

  // ────────── ACRYLIC — high-gloss black + metallic gold ──────────
  register('acrylic', {
    primaryColor: '#D4AF37',
    mutedColor: 'rgba(212,175,55,0.72)',
    background: {
      type: 'linear', angle: 155,
      stops: [
        { offset: 0, color: '#0c0c0c' },
        { offset: 0.45, color: '#1c1c1c' },
        { offset: 1, color: '#0a0a0a' }
      ]
    },
    texture: { type: 'gloss', opacity: 0.10 },
    border: { color: 'rgba(212,175,55,0.4)', widthFrac: 0.006 },
    cornerRadiusFrac: 0.035,
    screws: [
      { xFrac: 0.10, yFrac: 0.045, rFrac: 0.018, color: '#D4AF37' },
      { xFrac: 0.90, yFrac: 0.045, rFrac: 0.018, color: '#D4AF37' },
      { xFrac: 0.10, yFrac: 0.955, rFrac: 0.018, color: '#D4AF37' },
      { xFrac: 0.90, yFrac: 0.955, rFrac: 0.018, color: '#D4AF37' }
    ],
    shadow: { blurFrac: 0.025, opacity: 0.55, color: '#000000', dyFrac: 0.015 }
  });

  // ────────── TEAKWOOD — polished teak, dark engraved text ──────────
  register('teakwood', {
    primaryColor: '#2A1608',
    mutedColor: 'rgba(42,22,8,0.72)',
    background: {
      type: 'linear', angle: 155,
      stops: [
        { offset: 0, color: '#8a6438' },
        { offset: 0.45, color: '#a9814f' },
        { offset: 1, color: '#7a5a33' }
      ]
    },
    texture: { type: 'grain', opacity: 0.18 },
    border: { color: 'rgba(42,22,8,0.35)', widthFrac: 0.007 },
    cornerRadiusFrac: 0.025,
    screws: [
      { xFrac: 0.10, yFrac: 0.045, rFrac: 0.018, color: 'rgba(42,22,8,0.7)' },
      { xFrac: 0.90, yFrac: 0.045, rFrac: 0.018, color: 'rgba(42,22,8,0.7)' },
      { xFrac: 0.10, yFrac: 0.955, rFrac: 0.018, color: 'rgba(42,22,8,0.7)' },
      { xFrac: 0.90, yFrac: 0.955, rFrac: 0.018, color: 'rgba(42,22,8,0.7)' }
    ],
    shadow: { blurFrac: 0.03, opacity: 0.5, color: '#000000', dyFrac: 0.018 }
  });

  // ────────── STAINLESS STEEL — brushed matte silver, dark text ──────────
  register('stainless', {
    primaryColor: '#0B1525',
    mutedColor: 'rgba(11,21,37,0.72)',
    background: {
      type: 'linear', angle: 155,
      stops: [
        { offset: 0, color: '#c3ccd4' },
        { offset: 0.45, color: '#e4e9ed' },
        { offset: 1, color: '#aab3bc' }
      ]
    },
    texture: { type: 'brushed', opacity: 0.16 },
    border: { color: 'rgba(11,21,37,0.3)', widthFrac: 0.005 },
    cornerRadiusFrac: 0.02,
    screws: [
      { xFrac: 0.10, yFrac: 0.045, rFrac: 0.018, color: 'rgba(11,21,37,0.6)' },
      { xFrac: 0.90, yFrac: 0.045, rFrac: 0.018, color: 'rgba(11,21,37,0.6)' },
      { xFrac: 0.10, yFrac: 0.955, rFrac: 0.018, color: 'rgba(11,21,37,0.6)' },
      { xFrac: 0.90, yFrac: 0.955, rFrac: 0.018, color: 'rgba(11,21,37,0.6)' }
    ],
    shadow: { blurFrac: 0.02, opacity: 0.4, color: '#000000', dyFrac: 0.012 }
  });

  /** Generic fallback template used only if a future product forgets to register one. */
  const FALLBACK = TEMPLATES.acrylic;

  function get(key) {
    return TEMPLATES[key] || FALLBACK;
  }

  global.SD_PlateTemplates = { register, get, layout: LAYOUT, _all: TEMPLATES };
})(window);
