/**
 * design-system/tokens/spacing.js
 * ------------------------------------------------------------------
 * The shared "classic nameplate" layout — WHERE every element sits on
 * the plate, as a fraction (0–1) of plate width/height. This is what
 * makes the renderer size-agnostic: 8×12, 10×16, 18×12, 24×16, Custom
 * all reuse this exact positional map; only the outer viewBox aspect
 * ratio changes.
 *
 * This is identical to the pre-refactor `LAYOUT` constant that used to
 * live inline in js/plateTemplates.js — moved here so it's a reusable,
 * independently-versioned token module. js/plateTemplates.js merges
 * this with tokens/typography.js field-by-field to reconstruct the
 * same LAYOUT object the renderer already consumes, so no renderer
 * changes were required.
 * ------------------------------------------------------------------
 */
(function (global) {
  'use strict';

  const spacing = {
    fields: {
      topSymbol: { xFrac: 0.5, yFrac: 0.125, sizeFrac: 0.17, wFrac: 0.22, hFrac: 0.19 },
      dividerTop: { xFrac: 0.5, yFrac: 0.222, widthFrac: 0.34 },
      houseNoLabel: { xFrac: 0.5, yFrac: 0.263 },
      houseNumber: { xFrac: 0.5, yFrac: 0.365, maxWidthFrac: 0.7 },
      dividerMid: { xFrac: 0.5, yFrac: 0.452, widthFrac: 0.34 },
      familyName: { xFrac: 0.5, yFrac: 0.522, maxWidthFrac: 0.86 },
      familyLabel: { xFrac: 0.5, yFrac: 0.575 },
      scanLabel: { xFrac: 0.5, yFrac: 0.630 },
      qr: { xFrac: 0.5, yFrac: 0.775, sizeFrac: 0.30 },
      brandIcon: { xFrac: 0.40, yFrac: 0.935, sizeFrac: 0.032 },
      brandName: { xFrac: 0.53, yFrac: 0.935 },
      brandTagline: { xFrac: 0.5, yFrac: 0.965 }
    }
  };

  global.SD_Tokens = global.SD_Tokens || {};
  global.SD_Tokens.spacing = spacing;
})(window);
