/**
 * plateRenderer.js
 * ------------------------------------------------------------------
 * PHASE 4 — Professional Product Preview Engine (Renderer Layer)
 *
 * SVG-based (not a CSS/HTML mockup) so that:
 *   - text always scales perfectly regardless of plate size
 *   - every future size (12×8, 16×10, 18×12, 24×16, Custom…) renders
 *     accurately from the SAME template, because every coordinate in
 *     the template is a FRACTION of plate width/height, not a pixel
 *   - the same markup can later be reused for print/manufacturing
 *     preview generation or exported as PNG/PDF
 *
 * This module owns ZERO product knowledge — it only knows how to turn
 * { template, aspect, customization } into an <svg>. All look-and-feel
 * differences between Acrylic / Teakwood / Stainless / future
 * materials live in js/plateTemplates.js.
 *
 * Public API (window.SD_PlateRenderer):
 *   renderInto(containerEl, options) → void
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

  // ────────── background / texture defs ──────────

  function buildBackgroundDefs(tpl, ids) {
    const bg = tpl.background;
    if (bg.type === 'radial') {
      const stops = bg.stops.map((s) => `<stop offset="${s.offset * 100}%" stop-color="${s.color}"/>`).join('');
      return `<radialGradient id="${ids.bg}" cx="50%" cy="50%" r="75%">${stops}</radialGradient>`;
    }
    // linear (default) — angle rotates the gradient vector
    const angle = bg.angle || 155;
    const rad = (angle * Math.PI) / 180;
    const x1 = 50 - Math.cos(rad) * 50, y1 = 50 - Math.sin(rad) * 50;
    const x2 = 50 + Math.cos(rad) * 50, y2 = 50 + Math.sin(rad) * 50;
    const stops = bg.stops.map((s) => `<stop offset="${s.offset * 100}%" stop-color="${s.color}"/>`).join('');
    return `<linearGradient id="${ids.bg}" x1="${x1}%" y1="${y1}%" x2="${x2}%" y2="${y2}%">${stops}</linearGradient>`;
  }

  /** Returns an SVG fragment (rect/pattern overlay) for the material's surface texture. */
  function buildTextureOverlay(tpl, ids, w, h) {
    const tex = tpl.texture || { type: 'none', opacity: 0 };
    if (tex.type === 'none' || !tex.opacity) return '';

    if (tex.type === 'gloss') {
      // Acrylic: soft diagonal glossy highlight band
      return `
        <linearGradient id="${ids.tex}" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#ffffff" stop-opacity="0"/>
          <stop offset="38%" stop-color="#ffffff" stop-opacity="${tex.opacity}"/>
          <stop offset="46%" stop-color="#ffffff" stop-opacity="0"/>
          <stop offset="100%" stop-color="#ffffff" stop-opacity="0"/>
        </linearGradient>`;
    }
    if (tex.type === 'grain') {
      // Teakwood: subtle turbulence-based wood grain filter
      return `
        <filter id="${ids.tex}">
          <feTurbulence type="fractalNoise" baseFrequency="0.012 0.09" numOctaves="2" seed="7" result="n"/>
          <feColorMatrix in="n" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 ${tex.opacity} 0"/>
        </filter>`;
    }
    if (tex.type === 'brushed') {
      // Stainless: fine horizontal brushed-metal lines
      return `
        <filter id="${ids.tex}">
          <feTurbulence type="fractalNoise" baseFrequency="0.9 0.01" numOctaves="1" seed="3" result="n"/>
          <feColorMatrix in="n" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 ${tex.opacity} 0"/>
        </filter>`;
    }
    return '';
  }

  function buildTextureRect(tpl, ids, w, h, rx) {
    const tex = tpl.texture || { type: 'none' };
    if (tex.type === 'gloss') {
      return `<rect x="0" y="0" width="${w}" height="${h}" rx="${rx}" fill="url(#${ids.tex})"/>`;
    }
    if (tex.type === 'grain' || tex.type === 'brushed') {
      return `<rect x="0" y="0" width="${w}" height="${h}" rx="${rx}" filter="url(#${ids.tex})"/>`;
    }
    return '';
  }

  // ────────── text helpers ──────────

  /** Very small greedy word-wrap so long names don't overflow the plate. Returns array of lines. */
  function wrapText(text, maxChars) {
    const words = String(text || '').split(/\s+/).filter(Boolean);
    if (!words.length) return [''];
    const lines = [];
    let line = '';
    words.forEach((word) => {
      const candidate = line ? `${line} ${word}` : word;
      if (candidate.length > maxChars && line) {
        lines.push(line);
        line = word;
      } else {
        line = candidate;
      }
    });
    if (line) lines.push(line);
    return lines.slice(0, 2); // never more than 2 lines on a plate
  }

  function textEl(field, w, h, content, fontFamily, fontWeight, extraLineIndex, lineCount) {
    if (!content) return '';
    const fontSize = field.fontSizeFrac * h;
    const x = field.xFrac * w;
    // If multi-line, vertically center the whole block around yFrac.
    const lineHeight = fontSize * 1.15; // standard ~1.15 line-height, same units as fontSize
    const totalBlockH = lineHeight * (lineCount - 1);
    const startY = field.yFrac * h - totalBlockH / 2;
    const y = startY + lineHeight * extraLineIndex;
    return `<text x="${x.toFixed(2)}" y="${y.toFixed(2)}" text-anchor="${field.align || 'middle'}"
      font-family="${fontFamily}" font-weight="${fontWeight}" font-size="${fontSize.toFixed(2)}"
      fill="${field.color}">${escapeXml(content)}</text>`;
  }

  function buildQrPlaceholder(field, w, h) {
    const size = field.sizeFrac * Math.min(w, h);
    const x = field.xFrac * w - size / 2;
    const y = field.yFrac * h - size / 2;
    const pad = size * 0.1;
    const inner = size - pad * 2;
    // Lightweight finder-pattern-style placeholder (not a scannable code —
    // the real QR is generated server-side by generate-qr and swapped in
    // once the customer's plate is provisioned).
    return `
      <g>
        <rect x="${x}" y="${y}" width="${size}" height="${size}" rx="${size * 0.08}" fill="#ffffff"/>
        <rect x="${x + pad}" y="${y + pad}" width="${inner * 0.32}" height="${inner * 0.32}" fill="#0a0a0a"/>
        <rect x="${x + size - pad - inner * 0.32}" y="${y + pad}" width="${inner * 0.32}" height="${inner * 0.32}" fill="#0a0a0a"/>
        <rect x="${x + pad}" y="${y + size - pad - inner * 0.32}" width="${inner * 0.32}" height="${inner * 0.32}" fill="#0a0a0a"/>
        <rect x="${x + size / 2 - inner * 0.09}" y="${y + size / 2 - inner * 0.09}" width="${inner * 0.18}" height="${inner * 0.18}" fill="#0a0a0a"/>
      </g>`;
  }

  // ────────── public render ──────────

  /**
   * @param {HTMLElement} container
   * @param {Object} opts
   * @param {string} opts.templateKey        - key into SD_PlateTemplates
   * @param {number} opts.aspect             - plate width/height ratio (e.g. 12/8 = 1.5)
   * @param {string} opts.name               - family/house name
   * @param {string} [opts.subtitle]         - optional secondary line
   * @param {string} [opts.houseNumber]
   * @param {string} opts.fontFamily
   * @param {number} opts.fontWeight
   * @param {string} [opts.color]            - overrides template letter color when a color swatch is chosen
   * @param {string} [opts.symbolGlyph]      - religious/cultural symbol emoji glyph
   * @param {string|null} [opts.logoDataUrl] - customer-uploaded logo (data URL) or null → falls back to template default
   */
  function renderInto(container, opts) {
    if (!container) return;
    const tpl = global.SD_PlateTemplates.get(opts.templateKey);
    const aspect = opts.aspect && opts.aspect > 0 ? opts.aspect : 1.5;
    const w = VB_W;
    const h = Math.round(VB_W / aspect);
    const ids = { bg: uid('bg'), tex: uid('tex'), shadow: uid('shadow') };

    const rx = tpl.cornerRadiusFrac * Math.min(w, h);
    const borderW = tpl.border.widthFrac * Math.min(w, h);

    const letterColor = opts.color || null; // null → each field uses its own template color

    const lines = wrapText(opts.name || 'Your Name Here', 20);
    const nameText = lines.map((line, i) =>
      textEl(tpl.familyName, w, h, line, opts.fontFamily, opts.fontWeight, i, lines.length)
        .replace(/fill="[^"]*"/, `fill="${letterColor || tpl.familyName.color}"`)
    ).join('');

    const subtitleText = opts.subtitle
      ? textEl(tpl.subtitle, w, h, opts.subtitle, opts.fontFamily, 500, 0, 1)
      : '';

    const houseNoText = opts.houseNumber
      ? textEl(tpl.houseNumber, w, h, opts.houseNumber, opts.fontFamily, opts.fontWeight, 0, 1)
          .replace(/fill="[^"]*"/, `fill="${letterColor || tpl.houseNumber.color}"`)
      : '';

    const screws = (tpl.screws || []).map((s) =>
      `<circle cx="${(s.xFrac * w).toFixed(2)}" cy="${(s.yFrac * h).toFixed(2)}" r="${(s.rFrac * Math.min(w, h)).toFixed(2)}" fill="${s.color}"/>`
    ).join('');

    const decorLines = (tpl.decorativeLines || []).map((l) =>
      `<line x1="${(l.x1Frac * w).toFixed(2)}" y1="${(l.y1Frac * h).toFixed(2)}" x2="${(l.x2Frac * w).toFixed(2)}" y2="${(l.y2Frac * h).toFixed(2)}" stroke="${l.color}" stroke-width="${(l.widthFrac * Math.min(w, h)).toFixed(2)}"/>`
    ).join('');

    const symbolGlyph = opts.symbolGlyph;
    const symbolField = tpl.religionSymbol;
    const symbolEl = symbolGlyph
      ? `<text x="${(symbolField.xFrac * w).toFixed(2)}" y="${(symbolField.yFrac * h).toFixed(2)}" text-anchor="middle" dominant-baseline="middle" font-size="${(symbolField.sizeFrac * Math.min(w, h)).toFixed(2)}">${escapeXml(symbolGlyph)}</text>`
      : '';

    const logoField = tpl.logo;
    const logoW = logoField.wFrac * w, logoH = logoField.hFrac * h;
    const logoX = logoField.xFrac * w - logoW / 2, logoY = logoField.yFrac * h - logoH / 2;
    const logoSrc = opts.logoDataUrl || logoField.defaultSrc;
    const logoEl = logoSrc
      ? `<image href="${logoSrc}" x="${logoX.toFixed(2)}" y="${logoY.toFixed(2)}" width="${logoW.toFixed(2)}" height="${logoH.toFixed(2)}" preserveAspectRatio="xMidYMid meet"/>`
      : '';

    const qrEl = buildQrPlaceholder(tpl.qr, w, h);

    const textureDefs = buildTextureOverlay(tpl, ids, w, h);
    const textureRect = buildTextureRect(tpl, ids, w, h, rx);

    const svg = `
      <svg viewBox="0 0 ${w} ${h}" width="100%" height="100%" preserveAspectRatio="xMidYMid meet" role="img" aria-label="SmartDoor nameplate preview">
        <defs>
          ${buildBackgroundDefs(tpl, ids)}
          ${textureDefs}
          <filter id="${ids.shadow}" x="-30%" y="-30%" width="160%" height="160%">
            <feDropShadow dx="0" dy="${(tpl.shadow.dyFrac * h).toFixed(2)}" stdDeviation="${(tpl.shadow.blurFrac * Math.min(w, h)).toFixed(2)}" flood-color="${tpl.shadow.color}" flood-opacity="${tpl.shadow.opacity}"/>
          </filter>
        </defs>
        <g filter="url(#${ids.shadow})">
          <rect x="${(borderW / 2).toFixed(2)}" y="${(borderW / 2).toFixed(2)}" width="${(w - borderW).toFixed(2)}" height="${(h - borderW).toFixed(2)}"
            rx="${rx.toFixed(2)}" fill="url(#${ids.bg})" stroke="${tpl.border.color}" stroke-width="${borderW.toFixed(2)}"/>
        </g>
        ${textureRect}
        ${decorLines}
        ${screws}
        ${symbolEl}
        ${logoEl}
        ${nameText}
        ${subtitleText}
        ${houseNoText}
        ${qrEl}
      </svg>`;

    container.innerHTML = svg;
  }

  global.SD_PlateRenderer = { renderInto };
})(window);
