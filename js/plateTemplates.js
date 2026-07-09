/**
 * plateTemplates.js
 * ------------------------------------------------------------------
 * PHASE 4 — Professional Product Preview Engine (Template Layer)
 *
 * Every SmartDoor material (Acrylic / Teakwood / Stainless Steel /
 * any future material) declares ONE template object here. The
 * renderer (js/plateRenderer.js) never hardcodes a material's look —
 * it only reads these templates.
 *
 * COORDINATE SYSTEM: every position/size below is a FRACTION (0–1) of
 * the plate's own width/height, not a pixel value. This is what makes
 * the renderer size-agnostic — a 12×8, 16×10, 18×12, 24×16 or any
 * future/custom size all reuse the exact same template unchanged;
 * only the outer viewBox aspect ratio changes (driven by the product's
 * `sizes` catalog entry), and every element scales proportionally.
 *
 * To add a future product/material: call SD_PlateTemplates.register()
 * with a new key — no renderer code changes required.
 * ------------------------------------------------------------------
 */
(function (global) {
  'use strict';

  const TEMPLATES = {};

  /**
   * @typedef {Object} PlateTemplate
   * @property {string} key
   * @property {{type:'linear'|'radial', angle?:number, stops:{offset:number,color:string}[]}} background
   * @property {{type:'none'|'grain'|'brushed'|'gloss', opacity:number}} texture
   * @property {{color:string, widthFrac:number}} border
   * @property {number} cornerRadiusFrac   - fraction of the SHORTER plate side
   * @property {{xFrac:number,yFrac:number,rFrac:number,color:string}[]} screws
   * @property {{blurFrac:number, opacity:number, color:string, dyFrac:number}} shadow
   * @property {{x1Frac:number,y1Frac:number,x2Frac:number,y2Frac:number,color:string,widthFrac:number}[]} decorativeLines
   * @property {{xFrac:number,yFrac:number,wFrac:number,hFrac:number,defaultSrc:string|null}} logo
   * @property {{xFrac:number,yFrac:number,sizeFrac:number}} qr
   * @property {{xFrac:number,yFrac:number,maxWidthFrac:number,fontSizeFrac:number,color:string,align:'start'|'middle'|'end'}} familyName
   * @property {{xFrac:number,yFrac:number,fontSizeFrac:number,color:string,align:string}} houseNumber
   * @property {{xFrac:number,yFrac:number,fontSizeFrac:number,color:string,align:string}} subtitle
   * @property {{xFrac:number,yFrac:number,sizeFrac:number}} religionSymbol
   */

  function register(key, template) {
    TEMPLATES[key] = Object.assign({ key }, template);
  }

  // ────────── ACRYLIC — high-gloss black + metallic gold ──────────
  register('acrylic', {
    background: {
      type: 'linear', angle: 155,
      stops: [
        { offset: 0, color: '#0c0c0c' },
        { offset: 0.45, color: '#1c1c1c' },
        { offset: 1, color: '#0a0a0a' }
      ]
    },
    texture: { type: 'gloss', opacity: 0.10 },
    border: { color: 'rgba(212,175,55,0.35)', widthFrac: 0.006 },
    cornerRadiusFrac: 0.045,
    screws: [
      { xFrac: 0.055, yFrac: 0.09, rFrac: 0.012, color: 'rgba(212,175,55,0.55)' },
      { xFrac: 0.945, yFrac: 0.09, rFrac: 0.012, color: 'rgba(212,175,55,0.55)' },
      { xFrac: 0.055, yFrac: 0.91, rFrac: 0.012, color: 'rgba(212,175,55,0.55)' },
      { xFrac: 0.945, yFrac: 0.91, rFrac: 0.012, color: 'rgba(212,175,55,0.55)' }
    ],
    shadow: { blurFrac: 0.03, opacity: 0.55, color: '#000000', dyFrac: 0.02 },
    decorativeLines: [
      { x1Frac: 0.14, y1Frac: 0.60, x2Frac: 0.86, y2Frac: 0.60, color: 'rgba(212,175,55,0.4)', widthFrac: 0.0025 }
    ],
    logo: { xFrac: 0.5, yFrac: 0.20, wFrac: 0.16, hFrac: 0.16, defaultSrc: null },
    qr: { xFrac: 0.855, yFrac: 0.80, sizeFrac: 0.14 },
    religionSymbol: { xFrac: 0.10, yFrac: 0.15, sizeFrac: 0.09 },
    familyName: { xFrac: 0.5, yFrac: 0.44, maxWidthFrac: 0.8, fontSizeFrac: 0.095, color: '#D4AF37', align: 'middle' },
    subtitle: { xFrac: 0.5, yFrac: 0.535, fontSizeFrac: 0.038, color: 'rgba(212,175,55,0.7)', align: 'middle' },
    houseNumber: { xFrac: 0.5, yFrac: 0.70, fontSizeFrac: 0.058, color: '#D4AF37', align: 'middle' }
  });

  // ────────── TEAKWOOD — polished teak + brass ──────────
  register('teakwood', {
    background: {
      type: 'linear', angle: 155,
      stops: [
        { offset: 0, color: '#3b2413' },
        { offset: 0.45, color: '#5a3820' },
        { offset: 1, color: '#2a1a0d' }
      ]
    },
    texture: { type: 'grain', opacity: 0.16 },
    border: { color: 'rgba(181,147,82,0.4)', widthFrac: 0.008 },
    cornerRadiusFrac: 0.03,
    screws: [
      { xFrac: 0.06, yFrac: 0.08, rFrac: 0.013, color: 'rgba(181,147,82,0.65)' },
      { xFrac: 0.94, yFrac: 0.08, rFrac: 0.013, color: 'rgba(181,147,82,0.65)' },
      { xFrac: 0.06, yFrac: 0.92, rFrac: 0.013, color: 'rgba(181,147,82,0.65)' },
      { xFrac: 0.94, yFrac: 0.92, rFrac: 0.013, color: 'rgba(181,147,82,0.65)' }
    ],
    shadow: { blurFrac: 0.035, opacity: 0.6, color: '#000000', dyFrac: 0.022 },
    decorativeLines: [
      { x1Frac: 0.12, y1Frac: 0.615, x2Frac: 0.88, y2Frac: 0.615, color: 'rgba(181,147,82,0.5)', widthFrac: 0.003 }
    ],
    logo: { xFrac: 0.5, yFrac: 0.19, wFrac: 0.15, hFrac: 0.15, defaultSrc: null },
    qr: { xFrac: 0.85, yFrac: 0.805, sizeFrac: 0.145 },
    religionSymbol: { xFrac: 0.105, yFrac: 0.145, sizeFrac: 0.095 },
    familyName: { xFrac: 0.5, yFrac: 0.45, maxWidthFrac: 0.78, fontSizeFrac: 0.10, color: '#D9B26A', align: 'middle' },
    subtitle: { xFrac: 0.5, yFrac: 0.545, fontSizeFrac: 0.04, color: 'rgba(217,178,106,0.75)', align: 'middle' },
    houseNumber: { xFrac: 0.5, yFrac: 0.715, fontSizeFrac: 0.06, color: '#D9B26A', align: 'middle' }
  });

  // ────────── STAINLESS STEEL — brushed matte silver ──────────
  register('stainless', {
    background: {
      type: 'linear', angle: 155,
      stops: [
        { offset: 0, color: '#3a4550' },
        { offset: 0.45, color: '#8291a0' },
        { offset: 1, color: '#2b333c' }
      ]
    },
    texture: { type: 'brushed', opacity: 0.22 },
    border: { color: 'rgba(11,21,37,0.4)', widthFrac: 0.006 },
    cornerRadiusFrac: 0.02,
    screws: [
      { xFrac: 0.05, yFrac: 0.085, rFrac: 0.014, color: 'rgba(11,21,37,0.55)' },
      { xFrac: 0.95, yFrac: 0.085, rFrac: 0.014, color: 'rgba(11,21,37,0.55)' },
      { xFrac: 0.05, yFrac: 0.915, rFrac: 0.014, color: 'rgba(11,21,37,0.55)' },
      { xFrac: 0.95, yFrac: 0.915, rFrac: 0.014, color: 'rgba(11,21,37,0.55)' }
    ],
    shadow: { blurFrac: 0.025, opacity: 0.5, color: '#000000', dyFrac: 0.018 },
    decorativeLines: [
      { x1Frac: 0.14, y1Frac: 0.60, x2Frac: 0.86, y2Frac: 0.60, color: 'rgba(11,21,37,0.35)', widthFrac: 0.0025 }
    ],
    logo: { xFrac: 0.5, yFrac: 0.20, wFrac: 0.16, hFrac: 0.16, defaultSrc: null },
    qr: { xFrac: 0.855, yFrac: 0.80, sizeFrac: 0.14 },
    religionSymbol: { xFrac: 0.10, yFrac: 0.15, sizeFrac: 0.09 },
    familyName: { xFrac: 0.5, yFrac: 0.44, maxWidthFrac: 0.8, fontSizeFrac: 0.095, color: '#0B1525', align: 'middle' },
    subtitle: { xFrac: 0.5, yFrac: 0.535, fontSizeFrac: 0.038, color: 'rgba(11,21,37,0.7)', align: 'middle' },
    houseNumber: { xFrac: 0.5, yFrac: 0.70, fontSizeFrac: 0.058, color: '#0B1525', align: 'middle' }
  });

  /** Generic fallback template used only if a future product forgets to register one. */
  const FALLBACK = TEMPLATES.acrylic;

  function get(key) {
    return TEMPLATES[key] || FALLBACK;
  }

  global.SD_PlateTemplates = { register, get, _all: TEMPLATES };
})(window);
