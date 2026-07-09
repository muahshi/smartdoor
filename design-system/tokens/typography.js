/**
 * design-system/tokens/typography.js
 * ------------------------------------------------------------------
 * Type scale for every text field on the plate. Positions (xFrac/yFrac)
 * live in tokens/spacing.js — this file only owns size, letter-spacing
 * and alignment, so a typography-only change (e.g. tightening tracking
 * on captions) never risks touching layout math.
 *
 * fontSizeFrac / letterSpacingFrac are fractions of plate height / of
 * min(width,height) respectively, matching the renderer's existing
 * convention (js/plateRenderer.js).
 * ------------------------------------------------------------------
 */
(function (global) {
  'use strict';

  const typography = {
    /** Body/caption font used everywhere except the big engraved house number, which uses opts.fontFamily (customer-selected). */
    fontFamily: "'Space Grotesk',sans-serif",

    fields: {
      houseNoLabel: { fontSizeFrac: 0.028, letterSpacingFrac: 0.006 },
      houseNumber: { fontSizeFrac: 0.125, align: 'middle' },
      familyName: { fontSizeFrac: 0.078, align: 'middle' },
      familyLabel: { fontSizeFrac: 0.032, letterSpacingFrac: 0.01 },
      scanLabel: { fontSizeFrac: 0.024, letterSpacingFrac: 0.007 },
      brandName: { fontSizeFrac: 0.03, letterSpacingFrac: 0.004 },
      brandTagline: { fontSizeFrac: 0.016, letterSpacingFrac: 0.006 }
    }
  };

  global.SD_Tokens = global.SD_Tokens || {};
  global.SD_Tokens.typography = typography;
})(window);
