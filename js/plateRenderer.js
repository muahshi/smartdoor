/**
 * plateRenderer.js
 * ------------------------------------------------------------------
 * PHASE 4 — Professional Product Preview Engine (Renderer Layer)
 * PHASE 5 — Preview Engine Finalization (this pass)
 *
 * SVG-based (not a CSS/HTML mockup) so that:
 *   - text always scales perfectly regardless of plate size
 *   - every future size (8×12, 10×16, 18×12, 24×16, Custom…) renders
 *     accurately from the SAME layout, because every coordinate is a
 *     FRACTION of plate width/height, not a pixel
 *   - the same markup can later be reused for print/manufacturing
 *     preview generation or exported as PNG/PDF
 *   - the exact same <svg> string can later be composited over a
 *     house-wall photo / camera frame for an AR preview (see
 *     `renderMarkup()` in the public API below) without touching this
 *     module — the renderer has no knowledge of DOM containers baked
 *     into its core rendering logic.
 *
 * This module owns ZERO product knowledge — it only knows how to turn
 * { template, layout, aspect, customization } into an <svg>. Material
 * look-and-feel lives in js/plateTemplates.js; the shared vertical
 * "classic nameplate" layout also lives there so every material
 * renders the exact same proven structure.
 *
 * SINGLE TOP SYMBOL SLOT (see plateTemplates.js LAYOUT.topSymbol):
 *   uploaded logo  >  gold religious/cultural symbol  >  default Home icon
 * Exactly one of the three is ever drawn.
 *
 * Public API (window.SD_PlateRenderer):
 *   renderInto(containerEl, options) → void     - render + mount into a DOM node
 *   renderMarkup(options) → string              - render to a raw <svg> string
 *                                                  (reused by renderInto; also the
 *                                                  hook future AR/camera-preview
 *                                                  compositing will call directly)
 * ------------------------------------------------------------------
 */
(function (global) {
  'use strict';

  const VB_W = 1000; // fixed viewBox width; height derives from aspect ratio

  function escapeXml(str) {
    return String(str == null ? '' : str).replace(/[&<>"']/g, (c) => (
      { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[c]
    ));
  }

  function uid(prefix) {
    return `${prefix}-${Math.random().toString(36).slice(2, 9)}`;
  }

  // ────────── text measurement (real canvas metrics when available) ──────────
  // Runs client-side in the browser, so we can measure actual glyph widths
  // instead of guessing — this is what lets typography auto-shrink/auto-wrap
  // accurately instead of relying on a fixed "characters per line" heuristic.

  let _measureCtx;
  function getMeasureCtx() {
    if (_measureCtx !== undefined) return _measureCtx;
    try {
      const c = (global.document || {}).createElement && global.document.createElement('canvas');
      _measureCtx = c ? c.getContext('2d') : null;
    } catch (e) {
      _measureCtx = null;
    }
    return _measureCtx;
  }

  function measureWidth(text, fontFamily, fontWeight, fontSize) {
    const ctx = getMeasureCtx();
    if (!ctx || !text) return String(text || '').length * fontSize * 0.55;
    ctx.font = `${fontWeight || 400} ${fontSize}px ${fontFamily}`;
    return ctx.measureText(text).width;
  }

  // ────────── background / texture / finish defs ──────────

  function buildBackgroundDefs(tpl, ids) {
    const bg = tpl.background;
    if (bg.type === 'radial') {
      const stops = bg.stops.map((s) => `<stop offset="${s.offset * 100}%" stop-color="${s.color}"/>`).join('');
      return `<radialGradient id="${ids.bg}" cx="50%" cy="50%" r="75%">${stops}</radialGradient>`;
    }
    const angle = bg.angle || 155;
    const rad = (angle * Math.PI) / 180;
    const x1 = 50 - Math.cos(rad) * 50, y1 = 50 - Math.sin(rad) * 50;
    const x2 = 50 + Math.cos(rad) * 50, y2 = 50 + Math.sin(rad) * 50;
    const stops = bg.stops.map((s) => `<stop offset="${s.offset * 100}%" stop-color="${s.color}"/>`).join('');
    return `<linearGradient id="${ids.bg}" x1="${x1}%" y1="${y1}%" x2="${x2}%" y2="${y2}%">${stops}</linearGradient>`;
  }

  function buildTextureFilterOrGradient(type, opacity, id) {
    if (type === 'gloss') {
      return { kind: 'gradient', id, markup: `
        <linearGradient id="${id}" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#ffffff" stop-opacity="0"/>
          <stop offset="38%" stop-color="#ffffff" stop-opacity="${opacity}"/>
          <stop offset="46%" stop-color="#ffffff" stop-opacity="0"/>
          <stop offset="100%" stop-color="#ffffff" stop-opacity="0"/>
        </linearGradient>` };
    }
    if (type === 'grain') {
      return { kind: 'filter', id, markup: `
        <filter id="${id}">
          <feTurbulence type="fractalNoise" baseFrequency="0.012 0.09" numOctaves="2" seed="7" result="n"/>
          <feColorMatrix in="n" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 ${opacity} 0"/>
        </filter>` };
    }
    if (type === 'brushed') {
      return { kind: 'filter', id, markup: `
        <filter id="${id}">
          <feTurbulence type="fractalNoise" baseFrequency="0.9 0.01" numOctaves="1" seed="3" result="n"/>
          <feColorMatrix in="n" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 ${opacity} 0"/>
        </filter>` };
    }
    if (type === 'vignette') {
      return { kind: 'radial', id, markup: `
        <radialGradient id="${id}" cx="50%" cy="45%" r="72%">
          <stop offset="0%" stop-color="#000000" stop-opacity="0"/>
          <stop offset="72%" stop-color="#000000" stop-opacity="0"/>
          <stop offset="100%" stop-color="#000000" stop-opacity="${opacity}"/>
        </radialGradient>` };
    }
    return null;
  }

  function buildTextureLayer(def, w, h, rx) {
    if (!def) return '';
    if (def.kind === 'gradient' || def.kind === 'radial') return `<rect x="0" y="0" width="${w}" height="${h}" rx="${rx}" fill="url(#${def.id})"/>`;
    if (def.kind === 'filter') return `<rect x="0" y="0" width="${w}" height="${h}" rx="${rx}" filter="url(#${def.id})"/>`;
    return '';
  }

  /** Metallic gold gradient used for gold-shine engraving (acrylic) + all religious symbols. */
  function buildGoldGradient(id, baseColor) {
    return `<linearGradient id="${id}" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="#F7E7A6"/>
      <stop offset="45%" stop-color="${baseColor}"/>
      <stop offset="100%" stop-color="#8F6C22"/>
    </linearGradient>`;
  }

  /** Groove/engrave depth filter for dark-on-light materials (teakwood, stainless). */
  function buildEngraveFilter(id, w, h) {
    const dy = Math.max(h * 0.004, 1.2);
    const blur = Math.max(Math.min(w, h) * 0.003, 0.8);
    return `<filter id="${id}" x="-25%" y="-25%" width="150%" height="150%">
      <feDropShadow dx="0" dy="${dy.toFixed(2)}" stdDeviation="${blur.toFixed(2)}" flood-color="#000000" flood-opacity="0.4"/>
      <feDropShadow dx="0" dy="${(-dy * 0.6).toFixed(2)}" stdDeviation="${blur.toFixed(2)}" flood-color="#ffffff" flood-opacity="0.3"/>
    </filter>`;
  }

  // ────────── text helpers ──────────

  function textLine(x, y, content, opts) {
    if (content === '' || content == null) return '';
    const ls = opts.letterSpacing ? ` letter-spacing="${opts.letterSpacing.toFixed(2)}"` : '';
    const tl = opts.textLength ? ` textLength="${opts.textLength.toFixed(2)}" lengthAdjust="spacingAndGlyphs"` : '';
    return `<text x="${x.toFixed(2)}" y="${y.toFixed(2)}" text-anchor="${opts.align || 'middle'}"
      font-family="${opts.fontFamily}" font-weight="${opts.fontWeight || 400}" font-size="${opts.fontSize.toFixed(2)}"
      fill="${opts.color}"${ls}${tl}>${escapeXml(content)}</text>`;
  }

  /**
   * Fits `text` into 1–2 lines inside `maxWidth`, shrinking font-size as
   * needed (down to a sane floor), using real glyph measurement. Large
   * names shrink automatically; short names stay large; nothing overflows
   * the plate — as a last-resort safety net a single unbroken word that
   * still doesn't fit at the floor size gets compressed via textLength.
   */
  function fitText(text, maxWidth, baseFontSize, fontFamily, fontWeight, opts) {
    const minScale = (opts && opts.minScale) || 0.5;
    const allowWrap = !opts || opts.allowWrap !== false;
    const minFontSize = baseFontSize * minScale;
    const clean = String(text || '').trim() || (opts && opts.placeholder) || '';

    const oneLineWidth = measureWidth(clean, fontFamily, fontWeight, baseFontSize);
    if (oneLineWidth <= maxWidth) {
      return { lines: [clean], fontSize: baseFontSize };
    }

    const singleScale = maxWidth / oneLineWidth;
    if (!allowWrap || singleScale >= 0.72) {
      const fontSize = Math.max(baseFontSize * singleScale, minFontSize);
      const width = measureWidth(clean, fontFamily, fontWeight, fontSize);
      return { lines: [clean], fontSize, forceWidth: width > maxWidth ? maxWidth : null };
    }

    const words = clean.split(/\s+/).filter(Boolean);
    if (words.length < 2) {
      const fontSize = Math.max(baseFontSize * singleScale, minFontSize);
      const width = measureWidth(clean, fontFamily, fontWeight, fontSize);
      return { lines: [clean], fontSize, forceWidth: width > maxWidth ? maxWidth : null };
    }

    // Choose the split point that balances the two resulting line widths.
    let bestSplit = 1, bestDiff = Infinity;
    for (let i = 1; i < words.length; i++) {
      const l1 = words.slice(0, i).join(' ');
      const l2 = words.slice(i).join(' ');
      const w1 = measureWidth(l1, fontFamily, fontWeight, baseFontSize);
      const w2 = measureWidth(l2, fontFamily, fontWeight, baseFontSize);
      const diff = Math.abs(w1 - w2);
      if (diff < bestDiff) { bestDiff = diff; bestSplit = i; }
    }
    const line1 = words.slice(0, bestSplit).join(' ');
    const line2 = words.slice(bestSplit).join(' ');
    const widest = Math.max(
      measureWidth(line1, fontFamily, fontWeight, baseFontSize),
      measureWidth(line2, fontFamily, fontWeight, baseFontSize)
    );
    const fontSize = widest > maxWidth ? Math.max(baseFontSize * (maxWidth / widest), minFontSize) : baseFontSize;
    return { lines: [line1, line2], fontSize };
  }

  /** Multi-line block, vertically centered around field.yFrac, using a pre-fitted font size. */
  function textBlockFit(field, w, h, fit, fontFamily, fontWeight, color) {
    const { lines, fontSize } = fit;
    const x = field.xFrac * w;
    const lineHeight = fontSize * 1.15;
    const totalBlockH = lineHeight * (lines.length - 1);
    const startY = field.yFrac * h - totalBlockH / 2;
    return lines.map((line, i) => textLine(x, startY + lineHeight * i, line, {
      align: field.align || 'middle', fontFamily, fontWeight, fontSize, color,
      textLength: fit.forceWidth && lines.length === 1 ? fit.forceWidth : null
    })).join('');
  }

  function captionLine(field, w, h, content, fontFamily, color) {
    if (!content) return '';
    const fontSize = field.fontSizeFrac * h;
    const x = field.xFrac * w, y = field.yFrac * h;
    const letterSpacing = (field.letterSpacingFrac || 0) * Math.min(w, h);
    return textLine(x, y, content, { align: 'middle', fontFamily, fontWeight: 600, fontSize, color, letterSpacing });
  }

  // ────────── TOP SYMBOL SLOT — house icon / gold religious symbol / logo (mutually exclusive) ──────────

  function buildHouseIcon(field, w, h, color) {
    const cx = field.xFrac * w, cy = field.yFrac * h;
    const s = field.sizeFrac * Math.min(w, h);
    const halfW = s * 0.55, roofTopY = cy - s * 0.55, baseY = cy + s * 0.42;
    const wallTopY = cy - s * 0.05;
    const winSize = s * 0.34, winX = cx - winSize / 2, winY = wallTopY + (baseY - wallTopY - winSize) / 2 + s * 0.03;
    const strokeW = Math.max(s * 0.045, 1.5);
    return `
      <g fill="none" stroke="${color}" stroke-width="${strokeW.toFixed(2)}" stroke-linejoin="round" stroke-linecap="round">
        <path d="M ${(cx - halfW).toFixed(2)} ${wallTopY.toFixed(2)} L ${cx.toFixed(2)} ${roofTopY.toFixed(2)} L ${(cx + halfW).toFixed(2)} ${wallTopY.toFixed(2)}"/>
        <path d="M ${(cx - halfW * 0.72).toFixed(2)} ${wallTopY.toFixed(2)} L ${(cx - halfW * 0.72).toFixed(2)} ${baseY.toFixed(2)} L ${(cx + halfW * 0.72).toFixed(2)} ${baseY.toFixed(2)} L ${(cx + halfW * 0.72).toFixed(2)} ${wallTopY.toFixed(2)}"/>
        <rect x="${winX.toFixed(2)}" y="${winY.toFixed(2)}" width="${winSize.toFixed(2)}" height="${winSize.toFixed(2)}"/>
        <line x1="${cx.toFixed(2)}" y1="${winY.toFixed(2)}" x2="${cx.toFixed(2)}" y2="${(winY + winSize).toFixed(2)}"/>
        <line x1="${winX.toFixed(2)}" y1="${(winY + winSize / 2).toFixed(2)}" x2="${(winX + winSize).toFixed(2)}" y2="${(winY + winSize / 2).toFixed(2)}"/>
      </g>`;
  }

  /** Om (ॐ) — real Devanagari glyph so it renders crisply at any size, filled with the gold gradient/color. */
  function buildOmSymbol(field, w, h, color) {
    const cx = field.xFrac * w, cy = field.yFrac * h;
    const s = field.sizeFrac * Math.min(w, h);
    return `<text x="${cx.toFixed(2)}" y="${cy.toFixed(2)}" text-anchor="middle" dominant-baseline="central"
      font-family="'Noto Sans Devanagari','Mangal','Kohinoor Devanagari',sans-serif" font-size="${(s * 1.35).toFixed(2)}"
      fill="${color}">\u0950</text>`;
  }

  /** Latin cross — pure vector, no font dependency. */
  function buildCrossSymbol(field, w, h, color) {
    const cx = field.xFrac * w, cy = field.yFrac * h;
    const s = field.sizeFrac * Math.min(w, h);
    const vw = s * 0.17, vh = s * 1.0;
    const hw = s * 0.64, hh = s * 0.17;
    const vx = cx - vw / 2, vy = cy - s * 0.52;
    const hx = cx - hw / 2, hy = cy - s * 0.14 - hh / 2;
    const rx = Math.min(vw, hh) * 0.25;
    return `<g fill="${color}">
      <rect x="${vx.toFixed(2)}" y="${vy.toFixed(2)}" width="${vw.toFixed(2)}" height="${vh.toFixed(2)}" rx="${rx.toFixed(2)}"/>
      <rect x="${hx.toFixed(2)}" y="${hy.toFixed(2)}" width="${hw.toFixed(2)}" height="${hh.toFixed(2)}" rx="${rx.toFixed(2)}"/>
    </g>`;
  }

  /** Khanda — simplified: central double-edged sword, chakra ring, two crossed kirpans. */
  function buildKhandaSymbol(field, w, h, color) {
    const cx = field.xFrac * w, cy = field.yFrac * h;
    const s = field.sizeFrac * Math.min(w, h);
    const swordW = s * 0.16, swordH = s * 1.05;
    const swordY = cy - s * 0.5;
    const chakraR = s * 0.34;
    const strokeW = Math.max(s * 0.045, 1.2);
    const kirpan = (angleDeg, flip) => {
      const len = s * 0.62;
      const rad = (angleDeg * Math.PI) / 180;
      const dx = Math.sin(rad) * len * (flip ? -1 : 1);
      const dy = Math.cos(rad) * len;
      const bx = cx, by = cy + s * 0.28;
      const tx = bx + dx, ty = by - dy;
      const curveX = bx + dx * 0.5 + (flip ? -1 : 1) * s * 0.12;
      const curveY = by - dy * 0.5;
      return `<path d="M ${bx.toFixed(2)} ${by.toFixed(2)} Q ${curveX.toFixed(2)} ${curveY.toFixed(2)} ${tx.toFixed(2)} ${ty.toFixed(2)}"
        fill="none" stroke="${color}" stroke-width="${strokeW.toFixed(2)}" stroke-linecap="round"/>`;
    };
    return `<g>
      ${kirpan(52, false)}
      ${kirpan(52, true)}
      <circle cx="${cx.toFixed(2)}" cy="${cy.toFixed(2)}" r="${chakraR.toFixed(2)}" fill="none" stroke="${color}" stroke-width="${strokeW.toFixed(2)}"/>
      <path d="M ${cx.toFixed(2)} ${swordY.toFixed(2)} L ${(cx + swordW / 2).toFixed(2)} ${(swordY + swordH * 0.18).toFixed(2)} L ${(cx + swordW / 2).toFixed(2)} ${(swordY + swordH * 0.86).toFixed(2)} L ${cx.toFixed(2)} ${(swordY + swordH).toFixed(2)} L ${(cx - swordW / 2).toFixed(2)} ${(swordY + swordH * 0.86).toFixed(2)} L ${(cx - swordW / 2).toFixed(2)} ${(swordY + swordH * 0.18).toFixed(2)} Z"
        fill="${color}"/>
    </g>`;
  }

  /** Crescent & star — pure vector arc crescent + 5-point star. */
  function buildCrescentSymbol(field, w, h, color) {
    const cx = field.xFrac * w, cy = field.yFrac * h;
    const s = field.sizeFrac * Math.min(w, h);
    const r = s * 0.48;
    const innerOffsetX = s * 0.22;
    const starCx = cx + r * 0.78, starCy = cy - r * 0.62, starR = s * 0.13;
    let starPts = '';
    for (let i = 0; i < 10; i++) {
      const ang = (Math.PI / 5) * i - Math.PI / 2;
      const rad = i % 2 === 0 ? starR : starR * 0.42;
      starPts += `${(starCx + Math.cos(ang) * rad).toFixed(2)},${(starCy + Math.sin(ang) * rad).toFixed(2)} `;
    }
    return `<g fill="${color}">
      <path fill-rule="evenodd" d="
        M ${(cx - r).toFixed(2)} ${cy.toFixed(2)}
        A ${r.toFixed(2)} ${r.toFixed(2)} 0 1 0 ${(cx + r).toFixed(2)} ${cy.toFixed(2)}
        A ${r.toFixed(2)} ${r.toFixed(2)} 0 1 0 ${(cx - r).toFixed(2)} ${cy.toFixed(2)} Z
        M ${(cx - r + innerOffsetX).toFixed(2)} ${cy.toFixed(2)}
        A ${(r * 0.82).toFixed(2)} ${(r * 0.82).toFixed(2)} 0 1 1 ${(cx + r * 0.64 + innerOffsetX).toFixed(2)} ${cy.toFixed(2)}
        A ${(r * 0.82).toFixed(2)} ${(r * 0.82).toFixed(2)} 0 1 1 ${(cx - r + innerOffsetX).toFixed(2)} ${cy.toFixed(2)} Z"/>
      <polygon points="${starPts.trim()}"/>
    </g>`;
  }

  /** Lotus — radial fan of simple petals. */
  function buildLotusSymbol(field, w, h, color) {
    const s = field.sizeFrac * Math.min(w, h);
    const cx = field.xFrac * w, cy = field.yFrac * h + s * 0.22;
    const petalCount = 5;
    const petals = [];
    for (let i = 0; i < petalCount; i++) {
      const angleDeg = -90 + (i - (petalCount - 1) / 2) * 32;
      petals.push(`<ellipse cx="${cx.toFixed(2)}" cy="${(cy - s * 0.34).toFixed(2)}" rx="${(s * 0.15).toFixed(2)}" ry="${(s * 0.42).toFixed(2)}"
        fill="${color}" transform="rotate(${angleDeg.toFixed(1)} ${cx.toFixed(2)} ${cy.toFixed(2)})"/>`);
    }
    return `<g>${petals.join('')}<ellipse cx="${cx.toFixed(2)}" cy="${(cy + s * 0.04).toFixed(2)}" rx="${(s * 0.22).toFixed(2)}" ry="${(s * 0.09).toFixed(2)}" fill="${color}" opacity="0.85"/></g>`;
  }

  /** Ganesha — simplified elephant-head silhouette (head, ears, trunk). */
  function buildGaneshaSymbol(field, w, h, color) {
    const cx = field.xFrac * w, cy = field.yFrac * h;
    const s = field.sizeFrac * Math.min(w, h);
    const headR = s * 0.34;
    return `<g fill="${color}">
      <ellipse cx="${(cx - s * 0.42).toFixed(2)}" cy="${(cy - s * 0.06).toFixed(2)}" rx="${(s * 0.22).toFixed(2)}" ry="${(s * 0.28).toFixed(2)}"/>
      <ellipse cx="${(cx + s * 0.42).toFixed(2)}" cy="${(cy - s * 0.06).toFixed(2)}" rx="${(s * 0.22).toFixed(2)}" ry="${(s * 0.28).toFixed(2)}"/>
      <circle cx="${cx.toFixed(2)}" cy="${(cy - s * 0.08).toFixed(2)}" r="${headR.toFixed(2)}"/>
      <path d="M ${(cx - headR * 0.3).toFixed(2)} ${(cy + headR * 0.55).toFixed(2)}
               Q ${(cx - headR * 0.55).toFixed(2)} ${(cy + s * 0.62).toFixed(2)} ${(cx + headR * 0.05).toFixed(2)} ${(cy + s * 0.7).toFixed(2)}
               Q ${(cx + headR * 0.5).toFixed(2)} ${(cy + s * 0.76).toFixed(2)} ${(cx + headR * 0.15).toFixed(2)} ${(cy + s * 0.5).toFixed(2)} Z"/>
    </g>`;
  }

  const SYMBOL_BUILDERS = {
    om: buildOmSymbol,
    cross: buildCrossSymbol,
    khanda: buildKhandaSymbol,
    crescent: buildCrescentSymbol,
    lotus: buildLotusSymbol,
    ganesha: buildGaneshaSymbol
  };

  /** Uploaded logo: scaled + centered inside the topSymbol bounding box, aspect preserved, never stretched, clipped. */
  function buildLogo(field, w, h, dataUrl, ids) {
    const boxW = field.wFrac * w, boxH = field.hFrac * h;
    const cx = field.xFrac * w, cy = field.yFrac * h;
    const x = cx - boxW / 2, y = cy - boxH / 2;
    const pad = Math.min(boxW, boxH) * 0.1;
    const clipId = ids.logoClip;
    return `
      <defs>
        <clipPath id="${clipId}"><rect x="${x.toFixed(2)}" y="${y.toFixed(2)}" width="${boxW.toFixed(2)}" height="${boxH.toFixed(2)}" rx="${(Math.min(boxW, boxH) * 0.14).toFixed(2)}"/></clipPath>
      </defs>
      <rect x="${x.toFixed(2)}" y="${y.toFixed(2)}" width="${boxW.toFixed(2)}" height="${boxH.toFixed(2)}" rx="${(Math.min(boxW, boxH) * 0.14).toFixed(2)}"
        fill="#ffffff" fill-opacity="0.94" stroke="rgba(0,0,0,0.08)" stroke-width="1"/>
      <g clip-path="url(#${clipId})">
        <image href="${dataUrl}" x="${(x + pad).toFixed(2)}" y="${(y + pad).toFixed(2)}" width="${(boxW - pad * 2).toFixed(2)}" height="${(boxH - pad * 2).toFixed(2)}"
          preserveAspectRatio="xMidYMid meet"/>
      </g>`;
  }

  function buildTopSymbol(field, w, h, engravingColor, goldColor, opts, ids) {
    if (opts.logoDataUrl) return buildLogo(field, w, h, opts.logoDataUrl, ids);
    const key = opts.symbolKey;
    const builder = key && key !== 'none' ? SYMBOL_BUILDERS[key] : null;
    if (builder) return builder(field, w, h, goldColor);
    return buildHouseIcon(field, w, h, engravingColor);
  }

  // ────────── decorative dividers ──────────

  function buildDivider(field, w, h, color) {
    const cx = field.xFrac * w, y = field.yFrac * h;
    const halfLine = (field.widthFrac * w) / 2;
    const dotGap = halfLine * 0.16;
    const strokeW = Math.max(h * 0.0022, 1);
    const dotR = Math.max(h * 0.006, 1.5);
    return `
      <g stroke="${color}" stroke-width="${strokeW.toFixed(2)}">
        <line x1="${(cx - halfLine).toFixed(2)}" y1="${y.toFixed(2)}" x2="${(cx - dotGap).toFixed(2)}" y2="${y.toFixed(2)}"/>
        <line x1="${(cx + dotGap).toFixed(2)}" y1="${y.toFixed(2)}" x2="${(cx + halfLine).toFixed(2)}" y2="${y.toFixed(2)}"/>
      </g>
      <circle cx="${cx.toFixed(2)}" cy="${y.toFixed(2)}" r="${dotR.toFixed(2)}" fill="${color}"/>`;
  }

  // ────────── QR RENDERING ──────────
  // Real-QR-ready architecture: if `opts.qrImageDataUrl` is supplied (the
  // actual scannable QR produced server-side by the generate-qr / premiumQr
  // Edge Function once a plate is provisioned), it is rendered directly as
  // an <image>, aligned/sized by the same `qr` layout field as everything
  // else. Until a plate has a real QR, a deterministic, QR-shaped decorative
  // placeholder (correct finder/alignment/timing pattern geometry, quiet
  // zone, module grid) renders in its place so the live preview always
  // "reads" as a QR without implying it's scannable.

  function seededModule(seed, i, j) {
    const n = Math.sin(seed * 999 + i * 37.13 + j * 91.7) * 43758.5453;
    return (n - Math.floor(n)) > 0.5;
  }

  function buildFinderPattern(x, y, size, color) {
    const t = size * 0.14;
    return `
      <g>
        <rect x="${x.toFixed(2)}" y="${y.toFixed(2)}" width="${size.toFixed(2)}" height="${size.toFixed(2)}" fill="none" stroke="${color}" stroke-width="${t.toFixed(2)}"/>
        <rect x="${(x + size * 0.32).toFixed(2)}" y="${(y + size * 0.32).toFixed(2)}" width="${(size * 0.36).toFixed(2)}" height="${(size * 0.36).toFixed(2)}" fill="${color}"/>
      </g>`;
  }

  function buildQrPlaceholder(field, w, h, accentColor, plateBg, seedKey) {
    const size = field.sizeFrac * Math.min(w, h);
    const quiet = size * 0.06;
    const outerSize = size + quiet * 2;
    const x = field.xFrac * w - outerSize / 2;
    const y = field.yFrac * h - outerSize / 2;
    const qx = x + quiet, qy = y + quiet;
    const finderSize = size * 0.22;
    const gridN = 13;
    const cell = size / gridN;
    const seed = (seedKey || 'sd').split('').reduce((a, c) => a + c.charCodeAt(0), 0) || 1;

    let modules = '';
    for (let i = 0; i < gridN; i++) {
      for (let j = 0; j < gridN; j++) {
        const inTL = i < 3 && j < 3, inTR = i < 3 && j > gridN - 4, inBL = i > gridN - 4 && j < 3;
        const inAlign = i > gridN - 5 && i < gridN - 1 && j > gridN - 5 && j < gridN - 1; // bottom-right alignment cluster
        const onTiming = i === 3 || j === 3;
        if (inTL || inTR || inBL) continue;
        if (onTiming) {
          if ((i + j) % 2 === 0) modules += `<rect x="${(qx + j * cell).toFixed(2)}" y="${(qy + i * cell).toFixed(2)}" width="${(cell * 0.82).toFixed(2)}" height="${(cell * 0.82).toFixed(2)}" fill="${accentColor}"/>`;
          continue;
        }
        if (inAlign) continue;
        if (seededModule(seed, i, j)) {
          modules += `<rect x="${(qx + j * cell).toFixed(2)}" y="${(qy + i * cell).toFixed(2)}" width="${(cell * 0.82).toFixed(2)}" height="${(cell * 0.82).toFixed(2)}" fill="${accentColor}"/>`;
        }
      }
    }

    const finders = [
      buildFinderPattern(qx, qy, finderSize, accentColor),
      buildFinderPattern(qx + size - finderSize, qy, finderSize, accentColor),
      buildFinderPattern(qx, qy + size - finderSize, finderSize, accentColor)
    ].join('');

    // Small alignment pattern (bottom-right), matching real QR geometry.
    const alignSize = finderSize * 0.42;
    const alignX = qx + size - finderSize * 0.7 - alignSize / 2;
    const alignY = qy + size - finderSize * 0.7 - alignSize / 2;
    const align = `<rect x="${alignX.toFixed(2)}" y="${alignY.toFixed(2)}" width="${alignSize.toFixed(2)}" height="${alignSize.toFixed(2)}" fill="none" stroke="${accentColor}" stroke-width="${(alignSize * 0.22).toFixed(2)}"/>`;

    // Shield-lock glyph, centered — matches SmartDoor's security brand mark.
    const shieldW = size * 0.15, shieldH = size * 0.18;
    const sx = field.xFrac * w - shieldW / 2, sy = field.yFrac * h - shieldH / 2;
    const shield = `
      <rect x="${(sx - shieldW * 0.18).toFixed(2)}" y="${(sy - shieldH * 0.18).toFixed(2)}" width="${(shieldW * 1.36).toFixed(2)}" height="${(shieldH * 1.36).toFixed(2)}" fill="${plateBg}"/>
      <path d="M ${sx.toFixed(2)} ${(sy + shieldH * 0.12).toFixed(2)}
               L ${(sx + shieldW / 2).toFixed(2)} ${sy.toFixed(2)}
               L ${(sx + shieldW).toFixed(2)} ${(sy + shieldH * 0.12).toFixed(2)}
               L ${(sx + shieldW).toFixed(2)} ${(sy + shieldH * 0.55).toFixed(2)}
               Q ${(sx + shieldW).toFixed(2)} ${(sy + shieldH).toFixed(2)} ${(sx + shieldW / 2).toFixed(2)} ${(sy + shieldH).toFixed(2)}
               Q ${sx.toFixed(2)} ${(sy + shieldH).toFixed(2)} ${sx.toFixed(2)} ${(sy + shieldH * 0.55).toFixed(2)} Z"
            fill="${accentColor}"/>`;

    // Quiet-zone backing card so the QR reads cleanly against any material/texture.
    const backing = `<rect x="${x.toFixed(2)}" y="${y.toFixed(2)}" width="${outerSize.toFixed(2)}" height="${outerSize.toFixed(2)}" rx="${(outerSize * 0.06).toFixed(2)}" fill="${plateBg}" fill-opacity="0.06"/>`;

    return `<g>${backing}${finders}${align}${modules}${shield}</g>`;
  }

  /** Real, production-generated QR (from generate-qr / premiumQr Edge Function) — drop-in replacement for the placeholder. */
  function buildQrImage(field, w, h, imageDataUrl) {
    const size = field.sizeFrac * Math.min(w, h);
    const x = field.xFrac * w - size / 2;
    const y = field.yFrac * h - size / 2;
    return `<image href="${imageDataUrl}" x="${x.toFixed(2)}" y="${y.toFixed(2)}" width="${size.toFixed(2)}" height="${size.toFixed(2)}" preserveAspectRatio="xMidYMid meet"/>`;
  }

  function buildQr(field, w, h, accentColor, plateBg, opts) {
    if (opts.qrImageDataUrl) return buildQrImage(field, w, h, opts.qrImageDataUrl);
    return buildQrPlaceholder(field, w, h, accentColor, plateBg, opts.templateKey + (opts.name || ''));
  }

  // ────────── SMART DOOR brand footer (static brand block, per-template accent) ──────────

  function buildBrandFooter(layout, w, h, color) {
    const iconField = layout.brandIcon;
    const s = iconField.sizeFrac * Math.min(w, h);
    const nameField = layout.brandName;
    const fontSize = nameField.fontSizeFrac * h;
    const letterSpacing = (nameField.letterSpacingFrac || 0) * Math.min(w, h);
    const brandLabel = 'SMART DOOR';
    const textWidth = measureWidth(brandLabel, "'Syne',sans-serif", 800, fontSize) + letterSpacing * (brandLabel.length - 1);
    const gap = s * 0.55;
    const blockWidth = s + gap + textWidth;
    const blockLeft = (w - blockWidth) / 2; // whole icon+text block is centered — can never slide off either edge
    const cx = blockLeft + s / 2, cy = iconField.yFrac * h;
    const textX = blockLeft + s + gap;

    const shieldIcon = `
      <path d="M ${(cx - s / 2).toFixed(2)} ${(cy - s * 0.38).toFixed(2)}
               L ${cx.toFixed(2)} ${(cy - s * 0.5).toFixed(2)}
               L ${(cx + s / 2).toFixed(2)} ${(cy - s * 0.38).toFixed(2)}
               L ${(cx + s / 2).toFixed(2)} ${(cy + s * 0.12).toFixed(2)}
               Q ${(cx + s / 2).toFixed(2)} ${(cy + s * 0.5).toFixed(2)} ${cx.toFixed(2)} ${(cy + s * 0.5).toFixed(2)}
               Q ${(cx - s / 2).toFixed(2)} ${(cy + s * 0.5).toFixed(2)} ${(cx - s / 2).toFixed(2)} ${(cy + s * 0.12).toFixed(2)} Z"
        fill="none" stroke="${color}" stroke-width="${Math.max(s * 0.09, 1).toFixed(2)}"/>
      <rect x="${(cx - s * 0.16).toFixed(2)}" y="${(cy - s * 0.02).toFixed(2)}" width="${(s * 0.32).toFixed(2)}" height="${(s * 0.26).toFixed(2)}" rx="${(s * 0.04).toFixed(2)}" fill="${color}"/>`;

    const brandName = textLine(textX, cy, brandLabel, {
      align: 'start', fontFamily: "'Syne',sans-serif", fontWeight: 800, fontSize, color, letterSpacing
    });

    const tagField = layout.brandTagline;
    const tagline = textLine(tagField.xFrac * w, tagField.yFrac * h, 'HOME PRIVACY. SMARTER LIVING.', {
      align: 'middle', fontFamily: "'Space Grotesk',sans-serif", fontWeight: 600,
      fontSize: tagField.fontSizeFrac * h, color, letterSpacing: (tagField.letterSpacingFrac || 0) * Math.min(w, h)
    });

    return `<g>${shieldIcon}</g>${brandName}${tagline}`;
  }

  // ────────── screws (per-template style: flat slot vs phillips cross) ──────────

  function buildScrews(screws, w, h) {
    return (screws || []).map((s) => {
      const cx = s.xFrac * w, cy = s.yFrac * h, r = s.rFrac * Math.min(w, h);
      const slot = s.style === 'phillips'
        ? `<line x1="${(cx - r * 0.55).toFixed(2)}" y1="${cy.toFixed(2)}" x2="${(cx + r * 0.55).toFixed(2)}" y2="${cy.toFixed(2)}" stroke="rgba(0,0,0,0.35)" stroke-width="${(r * 0.16).toFixed(2)}"/>
           <line x1="${cx.toFixed(2)}" y1="${(cy - r * 0.55).toFixed(2)}" x2="${cx.toFixed(2)}" y2="${(cy + r * 0.55).toFixed(2)}" stroke="rgba(0,0,0,0.35)" stroke-width="${(r * 0.16).toFixed(2)}"/>`
        : `<line x1="${(cx - r * 0.6).toFixed(2)}" y1="${cy.toFixed(2)}" x2="${(cx + r * 0.6).toFixed(2)}" y2="${cy.toFixed(2)}" stroke="rgba(0,0,0,0.35)" stroke-width="${(r * 0.18).toFixed(2)}"/>`;
      // small offset specular dot — gives the flat fill a metallic, domed-bolt read
      // instead of a flat sticker look, without needing a per-screw gradient def.
      const hlR = r * 0.28, hlCx = cx - r * 0.32, hlCy = cy - r * 0.32;
      return `<circle cx="${cx.toFixed(2)}" cy="${cy.toFixed(2)}" r="${r.toFixed(2)}" fill="${s.color}"/>
        <circle cx="${cx.toFixed(2)}" cy="${cy.toFixed(2)}" r="${r.toFixed(2)}" fill="none" stroke="rgba(0,0,0,0.25)" stroke-width="${(r * 0.12).toFixed(2)}"/>
        <circle cx="${hlCx.toFixed(2)}" cy="${hlCy.toFixed(2)}" r="${hlR.toFixed(2)}" fill="rgba(255,255,255,0.45)"/>
        ${slot}`;
    }).join('');
  }

  // ────────── public render ──────────

  /**
   * @param {Object} opts
   * @param {string} opts.templateKey
   * @param {number} opts.aspect             - plate width/height ratio (e.g. 8/12 ≈ 0.667 portrait)
   * @param {string} opts.name               - family/house name
   * @param {string} [opts.subtitle]         - caption under the name (defaults to "FAMILY")
   * @param {string} [opts.houseNumber]
   * @param {string} opts.fontFamily
   * @param {number} opts.fontWeight
   * @param {string} [opts.symbolKey]        - 'none' | 'om' | 'ganesha' | 'cross' | 'crescent' | 'khanda' | 'lotus'
   * @param {string|null} [opts.logoDataUrl] - uploaded customer logo (data URL); takes priority over symbolKey
   * @param {string|null} [opts.qrImageDataUrl] - real production QR image (data URL), once available; falls back to decorative placeholder
   * @returns {string} raw <svg>...</svg> markup — reusable outside a DOM container (future AR/camera compositing hook)
   */
  function renderMarkup(opts) {
    const tpl = global.SD_PlateTemplates.get(opts.templateKey);
    const layout = global.SD_PlateTemplates.layout;
    const goldColor = global.SD_PlateTemplates.symbolGold;
    const aspect = opts.aspect && opts.aspect > 0 ? opts.aspect : 0.667;
    const w = VB_W;
    const h = Math.round(VB_W / aspect);
    const ids = {
      bg: uid('bg'), tex: uid('tex'), texExtra: uid('texx'), shadow: uid('shadow'),
      gold: uid('gold'), engrave: uid('engrave'), logoClip: uid('clip')
    };

    const rx = tpl.cornerRadiusFrac * Math.min(w, h);
    const borderW = tpl.border.widthFrac * Math.min(w, h);

    // ── engraving finish: gold-shine (acrylic) uses a metallic gradient fill;
    // groove (teakwood/stainless) keeps the flat engraving color but gets a
    // cut/depth filter applied to the whole engraved content group.
    const isGoldShine = tpl.engraveStyle === 'gold-shine';
    const engravingFill = isGoldShine ? `url(#${ids.gold})` : tpl.engravingColor;
    const muted = tpl.mutedColor;
    const engraveFilterAttr = !isGoldShine ? ` filter="url(#${ids.engrave})"` : '';

    // ── typography: auto-fit name + house number so long text shrinks and
    // short text stays large, never overflowing the plate.
    const nameFit = fitText(opts.name, layout.familyName.maxWidthFrac * w, layout.familyName.fontSizeFrac * h,
      opts.fontFamily, opts.fontWeight, { placeholder: 'Your Name Here' });
    const nameText = textBlockFit(layout.familyName, w, h, nameFit, opts.fontFamily, opts.fontWeight, engravingFill);

    const familyLabelText = captionLine(layout.familyLabel, w, h, (opts.subtitle || '').toUpperCase() || 'FAMILY', "'Space Grotesk',sans-serif", muted);
    const scanLabelText = captionLine(layout.scanLabel, w, h, 'SCAN TO CONNECT', "'Space Grotesk',sans-serif", muted);
    const houseNoLabelText = captionLine(layout.houseNoLabel, w, h, 'HOUSE NO.', "'Space Grotesk',sans-serif", muted);

    let houseNumberText = '';
    if (opts.houseNumber) {
      const hnFit = fitText(opts.houseNumber, layout.houseNumber.maxWidthFrac * w, layout.houseNumber.fontSizeFrac * h,
        opts.fontFamily, 800, { allowWrap: false, minScale: 0.55 });
      houseNumberText = textBlockFit(layout.houseNumber, w, h, hnFit, opts.fontFamily, 800, engravingFill);
    }

    const screws = buildScrews(tpl.screws, w, h);

    const topSymbolEl = buildTopSymbol(layout.topSymbol, w, h, engravingFill, goldColor, opts, ids);
    const dividerTopEl = buildDivider(layout.dividerTop, w, h, engravingFill);
    const dividerMidEl = buildDivider(layout.dividerMid, w, h, engravingFill);

    const qrEl = buildQr(layout.qr, w, h, engravingFill, tpl.background.stops[0].color, opts);
    const brandFooterEl = buildBrandFooter(layout, w, h, engravingFill);

    // texture stack: primary + optional secondary overlay (gloss sweep / vignette)
    const primaryTexDef = buildTextureFilterOrGradient((tpl.texture || {}).type, (tpl.texture || {}).opacity, ids.tex);
    const extraTexDef = tpl.textureExtra ? buildTextureFilterOrGradient(tpl.textureExtra.type, tpl.textureExtra.opacity, ids.texExtra) : null;
    const texDefsMarkup = [primaryTexDef, extraTexDef].filter(Boolean).map((d) => d.markup).join('');
    const texLayerMarkup = [
      primaryTexDef ? buildTextureLayer(primaryTexDef, w, h, rx) : '',
      extraTexDef ? buildTextureLayer(extraTexDef, w, h, rx) : ''
    ].join('');

    const shadow = tpl.shadow;
    const farBlur = shadow.blurFrac * Math.min(w, h), farDy = shadow.dyFrac * h;
    const nearBlur = (shadow.nearBlurFrac || shadow.blurFrac * 0.3) * Math.min(w, h);
    const nearDy = (shadow.nearDyFrac || shadow.dyFrac * 0.3) * h;

    const svg = `
      <svg viewBox="0 0 ${w} ${h}" width="100%" height="100%" preserveAspectRatio="xMidYMid meet" role="img" aria-label="SmartDoor nameplate preview">
        <defs>
          ${buildBackgroundDefs(tpl, ids)}
          ${texDefsMarkup}
          ${isGoldShine ? buildGoldGradient(ids.gold, tpl.engravingColor) : buildEngraveFilter(ids.engrave, w, h)}
          <filter id="${ids.shadow}" x="-35%" y="-35%" width="170%" height="170%">
            <feDropShadow in="SourceGraphic" dx="0" dy="${farDy.toFixed(2)}" stdDeviation="${farBlur.toFixed(2)}" flood-color="${shadow.color}" flood-opacity="${shadow.opacity}" result="s1"/>
            <feDropShadow in="SourceGraphic" dx="0" dy="${nearDy.toFixed(2)}" stdDeviation="${nearBlur.toFixed(2)}" flood-color="${shadow.color}" flood-opacity="${shadow.nearOpacity || shadow.opacity}" result="s2"/>
            <feMerge>
              <feMergeNode in="s1"/>
              <feMergeNode in="s2"/>
              <feMergeNode in="SourceGraphic"/>
            </feMerge>
          </filter>
        </defs>
        <g filter="url(#${ids.shadow})">
          <rect x="${(borderW / 2).toFixed(2)}" y="${(borderW / 2).toFixed(2)}" width="${(w - borderW).toFixed(2)}" height="${(h - borderW).toFixed(2)}"
            rx="${rx.toFixed(2)}" fill="url(#${ids.bg})" stroke="${tpl.border.color}" stroke-width="${borderW.toFixed(2)}"/>
          <rect x="${(borderW + 2).toFixed(2)}" y="${(borderW + 2).toFixed(2)}" width="${(w - borderW * 2 - 4).toFixed(2)}" height="${(h - borderW * 2 - 4).toFixed(2)}"
            rx="${(rx * 0.9).toFixed(2)}" fill="none" stroke="rgba(255,255,255,0.12)" stroke-width="1"/>
        </g>
        ${texLayerMarkup}
        ${screws}
        <g${engraveFilterAttr}>
          ${topSymbolEl}
          ${dividerTopEl}
          ${houseNoLabelText}
          ${houseNumberText}
          ${dividerMidEl}
          ${nameText}
          ${qrEl}
        </g>
        ${familyLabelText}
        ${scanLabelText}
        ${brandFooterEl}
      </svg>`;

    return svg;
  }

  /**
   * @param {HTMLElement} container
   * @param {Object} opts  - see renderMarkup() for the full option list
   */
  function renderInto(container, opts) {
    if (!container) return;
    container.innerHTML = renderMarkup(opts);
  }

  global.SD_PlateRenderer = { renderInto, renderMarkup };
})(window);
