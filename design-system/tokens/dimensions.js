/**
 * design-system/tokens/dimensions.js
 * ------------------------------------------------------------------
 * Universal plate geometry — the numbers that are true for every
 * SmartDoor plate regardless of material or product. Material-specific
 * geometry (corner radius "feel", border thickness "feel") lives in
 * tokens/materials.js instead, since a wood edge and a glass edge are
 * proportioned differently on purpose.
 *
 * Every fraction here is relative to plate width/height (0–1), the
 * same size-agnostic coordinate system used throughout the renderer.
 * This file has no dependencies and no DOM/window requirements beyond
 * exposing itself on `window.SD_Tokens`.
 * ------------------------------------------------------------------
 */
(function (global) {
  'use strict';

  const dimensions = {
    /** Fixed SVG viewBox width; height is derived from the product's aspect ratio. */
    viewBoxWidth: 1000,

    /** Screw geometry + the 4-corner mounting layout shared by every material. */
    screw: {
      rFrac: 0.018,
      positions: [
        { xFrac: 0.10, yFrac: 0.045 },
        { xFrac: 0.90, yFrac: 0.045 },
        { xFrac: 0.10, yFrac: 0.955 },
        { xFrac: 0.90, yFrac: 0.955 }
      ]
    },

    /**
     * Safe area inset — the margin from the plate edge inside which all
     * engraving/print content must stay. Not yet consumed by the SVG
     * renderer (every field is already hand-positioned within it), but
     * this is the number future manufacturing/print/PDF export and
     * Master SVG templates must respect so nothing gets trimmed at
     * production time. See design-system/future/README.md.
     */
    safeAreaInsetFrac: 0.06
  };

  global.SD_Tokens = global.SD_Tokens || {};
  global.SD_Tokens.dimensions = dimensions;
})(window);
