/**
 * design-system/tokens/materials.js
 * ------------------------------------------------------------------
 * Per-material look-and-feel tokens — the ONLY thing that differs
 * between acrylic / teakwood / stainless (and any future material).
 * Structural layout is shared (tokens/spacing.js + tokens/typography.js);
 * these are the finish tokens: background, texture, border, screws,
 * shadow, engraving color/style.
 *
 * Corner radius and border thickness are intentionally material-specific
 * here (not in tokens/dimensions.js) — a glass edge, a wood edge and a
 * brushed-steel edge read as different "weights" by design, matching
 * the approved master reference images in design-system/master-reference/.
 *
 * Values below are byte-for-byte identical to the pre-refactor template
 * definitions in js/plateTemplates.js — this is a token extraction, not
 * a visual change. Any visual accuracy improvement must be made here
 * (or in shadow/texture tuning) and checked against the master
 * reference images, never by hand-editing js/plateRenderer.js.
 * ------------------------------------------------------------------
 */
(function (global) {
  'use strict';

  /** Fixed gold accent for religious/cultural symbols, regardless of material. */
  const symbolGold = '#D4AF37';

  const materials = {
    symbolGold,

    // ────────── ACRYLIC — high-gloss black + metallic gold engraving ──────────
    acrylic: {
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
      screwStyle: { color: '#D4AF37', style: 'flat' },
      shadow: { blurFrac: 0.045, nearBlurFrac: 0.012, opacity: 0.5, nearOpacity: 0.38, color: '#000000', dyFrac: 0.028, nearDyFrac: 0.008 }
    },

    // ────────── TEAKWOOD — dark polished mahogany, gold engraved text (matches master reference) ──────────
    teakwood: {
      engravingColor: '#D4AF37',
      mutedColor: 'rgba(212,175,55,0.75)',
      engraveStyle: 'gold-shine',
      background: {
        type: 'linear', angle: 155,
        stops: [
          { offset: 0, color: '#6b4023' },
          { offset: 0.30, color: '#7a4c2a' },
          { offset: 0.6, color: '#4a2c15' },
          { offset: 1, color: '#2c1608' }
        ]
      },
      texture: { type: 'grain', opacity: 0.24 },
      textureExtra: { type: 'vignette', opacity: 0.24 },
      border: { color: '#D4AF37', widthFrac: 0.014 },
      cornerRadiusFrac: 0.018,
      screwStyle: { color: '#D4AF37', style: 'flat' },
      shadow: { blurFrac: 0.05, nearBlurFrac: 0.014, opacity: 0.45, nearOpacity: 0.35, color: '#000000', dyFrac: 0.03, nearDyFrac: 0.009 }
    },

    // ────────── STAINLESS STEEL — brushed matte silver, black engraved text ──────────
    stainless: {
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
      screwStyle: { color: 'rgba(11,21,37,0.65)', style: 'flat' },
      shadow: { blurFrac: 0.035, nearBlurFrac: 0.01, opacity: 0.35, nearOpacity: 0.3, color: '#000000', dyFrac: 0.022, nearDyFrac: 0.007 }
    }
  };

  global.SD_Tokens = global.SD_Tokens || {};
  global.SD_Tokens.materials = materials;
})(window);
