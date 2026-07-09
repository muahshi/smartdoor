/**
 * plateRenderer.js
 * ------------------------------------------------------------------
 * PHASE 4 — Professional Product Preview Engine (Renderer Layer)
 *
 * SVG-based (not a CSS/HTML mockup) so that:
 *   - text always scales perfectly regardless of plate size
 *   - every future size (8×12, 10×16, 18×12, 24×16, Custom…) renders
 *     accurately from the SAME layout, because every coordinate is a
 *     FRACTION of plate width/height, not a pixel
 *   - the same markup can later be reused for print/manufacturing
 *     preview generation or exported as PNG/PDF
 *
 * This module owns ZERO product knowledge — it only knows how to turn
 * { template, layout, aspect, customization } into an <svg>. Material
 * look-and-feel lives in js/plateTemplates.js; the shared vertical
 * "classic nameplate" layout (house icon → HOUSE NO. → number →
 * divider → Family Name → FAMILY → SCAN TO CONNECT → QR → brand
 * footer) also lives there so every material renders the exact same
 * proven structure.
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
    const angle = bg.angle || 155;
    const rad = (angle * Math.PI) / 180;
    const x1 = 50 - Math.cos(rad) * 50, y1 = 50 - Math.sin(rad) * 50;
    const x2 = 50 + Math.cos(rad) * 50, y2 = 50 + Math.sin(rad) * 50;
    const stops = bg.stops.map((s) => `<stop offset="${s.offset * 100}%" stop-color="${s.color}"/>`).join('');
    return `<linearGradient id="${ids.bg}" x1="${x1}%" y1="${y1}%" x2="${x2}%" y2="${y2}%">${stops}</linearGradient>`;
  }

  function buildTextureOverlay(tpl, ids) {
    const tex = tpl.texture || { type: 'none', opacity: 0 };
    if (tex.type === 'none' || !tex.opacity) return '';
    if (tex.type === 'gloss') {
      return `
        <linearGradient id="${ids.tex}" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#ffffff" stop-opacity="0"/>
          <stop offset="38%" stop-color="#ffffff" stop-opacity="${tex.opacity}"/>
          <stop offset="46%" stop-color="#ffffff" stop-opacity="0"/>
          <stop offset="100%" stop-color="#ffffff" stop-opacity="0"/>
        </linearGradient>`;
    }
    if (tex.type === 'grain') {
      return `
        <filter id="${ids.tex}">
          <feTurbulence type="fractalNoise" baseFrequency="0.012 0.09" numOctaves="2" seed="7" result="n"/>
          <feColorMatrix in="n" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 ${tex.opacity} 0"/>
        </filter>`;
    }
    if (tex.type === 'brushed') {
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
    if (tex.type === 'gloss') return `<rect x="0" y="0" width="${w}" height="${h}" rx="${rx}" fill="url(#${ids.tex})"/>`;
    if (tex.type === 'grain' || tex.type === 'brushed') return `<rect x="0" y="0" width="${w}" height="${h}" rx="${rx}" filter="url(#${ids.tex})"/>`;
    return '';
  }

  // ────────── text helpers ──────────

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
    return lines.slice(0, 2);
  }

  function textLine(x, y, content, opts) {
    if (content === '' || content == null) return '';
    const ls = opts.letterSpacing ? ` letter-spacing="${opts.letterSpacing.toFixed(2)}"` : '';
    return `<text x="${x.toFixed(2)}" y="${y.toFixed(2)}" text-anchor="${opts.align || 'middle'}"
      font-family="${opts.fontFamily}" font-weight="${opts.fontWeight || 400}" font-size="${opts.fontSize.toFixed(2)}"
      fill="${opts.color}"${ls}>${escapeXml(content)}</text>`;
  }

  /** Multi-line block, vertically centered around field.yFrac. */
  function textBlock(field, w, h, lines, fontFamily, fontWeight, color) {
    const fontSize = field.fontSizeFrac * h;
    const x = field.xFrac * w;
    const lineHeight = fontSize * 1.15;
    const totalBlockH = lineHeight * (lines.length - 1);
    const startY = field.yFrac * h - totalBlockH / 2;
    return lines.map((line, i) => textLine(x, startY + lineHeight * i, line, {
      align: field.align || 'middle', fontFamily, fontWeight, fontSize, color
    })).join('');
  }

  function captionLine(field, w, h, content, fontFamily, color) {
    if (!content) return '';
    const fontSize = field.fontSizeFrac * h;
    const x = field.xFrac * w, y = field.yFrac * h;
    const letterSpacing = (field.letterSpacingFrac || 0) * Math.min(w, h);
    return textLine(x, y, content, { align: 'middle', fontFamily, fontWeight: 600, fontSize, color, letterSpacing });
  }

  // ────────── house icon (simple roofline + window, vector, scales cleanly) ──────────

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

  // ────────── decorative QR placeholder (accent-toned, matches reference art direction) ──────────
  // NOT a scannable code — the real, production QR (H error-correction,
  // black-and-gold premium style) is generated server-side by the
  // generate-qr edge function and swapped in once a plate is provisioned.
  // This is a deterministic decorative stand-in so the live preview still
  // communicates "there is a QR here" without implying it's scannable.

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

  function buildQrPlaceholder(field, w, h, accentColor, seedKey) {
    const size = field.sizeFrac * Math.min(w, h);
    const x = field.xFrac * w - size / 2;
    const y = field.yFrac * h - size / 2;
    const finderSize = size * 0.24;
    const gridN = 11; // decorative module grid density
    const cell = size / gridN;
    const seed = (seedKey || 'sd').split('').reduce((a, c) => a + c.charCodeAt(0), 0) || 1;

    let modules = '';
    for (let i = 0; i < gridN; i++) {
      for (let j = 0; j < gridN; j++) {
        // Skip the three finder-pattern corners — they're drawn separately.
        const inTL = i < 3 && j < 3, inTR = i < 3 && j > gridN - 4, inBL = i > gridN - 4 && j < 3;
        if (inTL || inTR || inBL) continue;
        if (seededModule(seed, i, j)) {
          modules += `<rect x="${(x + j * cell).toFixed(2)}" y="${(y + i * cell).toFixed(2)}" width="${(cell * 0.82).toFixed(2)}" height="${(cell * 0.82).toFixed(2)}" fill="${accentColor}"/>`;
        }
      }
    }

    const finders = [
      buildFinderPattern(x, y, finderSize, accentColor),
      buildFinderPattern(x + size - finderSize, y, finderSize, accentColor),
      buildFinderPattern(x, y + size - finderSize, finderSize, accentColor)
    ].join('');

    // Small centered shield-lock glyph, matching the reference art direction.
    const shieldW = size * 0.16, shieldH = size * 0.19;
    const sx = x + size / 2 - shieldW / 2, sy = y + size / 2 - shieldH / 2;
    const shield = `
      <g>
        <path d="M ${sx.toFixed(2)} ${(sy + shieldH * 0.12).toFixed(2)}
                 L ${(sx + shieldW / 2).toFixed(2)} ${sy.toFixed(2)}
                 L ${(sx + shieldW).toFixed(2)} ${(sy + shieldH * 0.12).toFixed(2)}
                 L ${(sx + shieldW).toFixed(2)} ${(sy + shieldH * 0.55).toFixed(2)}
                 Q ${(sx + shieldW).toFixed(2)} ${(sy + shieldH).toFixed(2)} ${(sx + shieldW / 2).toFixed(2)} ${(sy + shieldH).toFixed(2)}
                 Q ${sx.toFixed(2)} ${(sy + shieldH).toFixed(2)} ${sx.toFixed(2)} ${(sy + shieldH * 0.55).toFixed(2)} Z"
              fill="${accentColor}"/>
      </g>`;

    return `<g>${finders}${modules}${shield}</g>`;
  }

  // ────────── SMART DOOR brand footer (static brand block, per-template accent) ──────────

  function buildBrandFooter(layout, w, h, color) {
    const iconField = layout.brandIcon;
    const cx = iconField.xFrac * w, cy = iconField.yFrac * h;
    const s = iconField.sizeFrac * Math.min(w, h);
    const shieldIcon = `
      <path d="M ${(cx - s / 2).toFixed(2)} ${(cy - s * 0.38).toFixed(2)}
               L ${cx.toFixed(2)} ${(cy - s * 0.5).toFixed(2)}
               L ${(cx + s / 2).toFixed(2)} ${(cy - s * 0.38).toFixed(2)}
               L ${(cx + s / 2).toFixed(2)} ${(cy + s * 0.12).toFixed(2)}
               Q ${(cx + s / 2).toFixed(2)} ${(cy + s * 0.5).toFixed(2)} ${cx.toFixed(2)} ${(cy + s * 0.5).toFixed(2)}
               Q ${(cx - s / 2).toFixed(2)} ${(cy + s * 0.5).toFixed(2)} ${(cx - s / 2).toFixed(2)} ${(cy + s * 0.12).toFixed(2)} Z"
        fill="none" stroke="${color}" stroke-width="${Math.max(s * 0.09, 1).toFixed(2)}"/>
      <rect x="${(cx - s * 0.16).toFixed(2)}" y="${(cy - s * 0.02).toFixed(2)}" width="${(s * 0.32).toFixed(2)}" height="${(s * 0.26).toFixed(2)}" rx="${(s * 0.04).toFixed(2)}" fill="${color}"/>`;

    const nameField = layout.brandName, tagField = layout.brandTagline;
    const brandName = textLine(nameField.xFrac * w, nameField.yFrac * h, 'SMART DOOR', {
      align: 'start', fontFamily: "'Syne',sans-serif", fontWeight: 800,
      fontSize: nameField.fontSizeFrac * h, color, letterSpacing: (nameField.letterSpacingFrac || 0) * Math.min(w, h)
    });
    const tagline = textLine(tagField.xFrac * w, tagField.yFrac * h, 'HOME PRIVACY. SMARTER LIVING.', {
      align: 'middle', fontFamily: "'Space Grotesk',sans-serif", fontWeight: 600,
      fontSize: tagField.fontSizeFrac * h, color, letterSpacing: (tagField.letterSpacingFrac || 0) * Math.min(w, h)
    });

    return `<g>${shieldIcon}</g>${brandName}${tagline}`;
  }

  // ────────── public render ──────────

  /**
   * @param {HTMLElement} container
   * @param {Object} opts
   * @param {string} opts.templateKey
   * @param {number} opts.aspect             - plate width/height ratio (e.g. 8/12 ≈ 0.667 portrait)
   * @param {string} opts.name               - family/house name
   * @param {string} [opts.subtitle]         - caption under the name (defaults to "FAMILY")
   * @param {string} [opts.houseNumber]
   * @param {string} opts.fontFamily
   * @param {number} opts.fontWeight
   * @param {string} [opts.symbolGlyph]
   * @param {string|null} [opts.logoDataUrl]
   */
  function renderInto(container, opts) {
    if (!container) return;
    const tpl = global.SD_PlateTemplates.get(opts.templateKey);
    const layout = global.SD_PlateTemplates.layout;
    const aspect = opts.aspect && opts.aspect > 0 ? opts.aspect : 0.667;
    const w = VB_W;
    const h = Math.round(VB_W / aspect);
    const ids = { bg: uid('bg'), tex: uid('tex'), shadow: uid('shadow') };

    const rx = tpl.cornerRadiusFrac * Math.min(w, h);
    const borderW = tpl.border.widthFrac * Math.min(w, h);
    const primary = tpl.primaryColor;
    const muted = tpl.mutedColor;

    const nameLines = wrapText(opts.name || 'Your Name Here', 14);
    const nameText = textBlock(layout.familyName, w, h, nameLines, opts.fontFamily, opts.fontWeight, primary);

    const familyLabelText = captionLine(layout.familyLabel, w, h, (opts.subtitle || '').toUpperCase() || 'FAMILY', "'Space Grotesk',sans-serif", muted);
    const scanLabelText = captionLine(layout.scanLabel, w, h, 'SCAN TO CONNECT', "'Space Grotesk',sans-serif", muted);
    const houseNoLabelText = captionLine(layout.houseNoLabel, w, h, 'HOUSE NO.', "'Space Grotesk',sans-serif", muted);
    const houseNumberText = opts.houseNumber
      ? textBlock(layout.houseNumber, w, h, [opts.houseNumber], opts.fontFamily, 800, primary)
      : '';

    const screws = (tpl.screws || []).map((s) =>
      `<circle cx="${(s.xFrac * w).toFixed(2)}" cy="${(s.yFrac * h).toFixed(2)}" r="${(s.rFrac * Math.min(w, h)).toFixed(2)}" fill="${s.color}"/>`
    ).join('');

    const houseIconEl = buildHouseIcon(layout.houseIcon, w, h, primary);
    const dividerTopEl = buildDivider(layout.dividerTop, w, h, primary);
    const dividerMidEl = buildDivider(layout.dividerMid, w, h, primary);

    const symbolGlyph = opts.symbolGlyph;
    const symbolField = layout.religionSymbol;
    const symbolEl = symbolGlyph
      ? `<text x="${(symbolField.xFrac * w).toFixed(2)}" y="${(symbolField.yFrac * h).toFixed(2)}" text-anchor="middle" dominant-baseline="middle" font-size="${(symbolField.sizeFrac * Math.min(w, h)).toFixed(2)}">${escapeXml(symbolGlyph)}</text>`
      : '';

    const logoField = layout.logo;
    const logoW = logoField.wFrac * w, logoH = logoField.hFrac * h;
    const logoX = logoField.xFrac * w - logoW / 2, logoY = logoField.yFrac * h - logoH / 2;
    // Customer logo replaces the house icon slot; falls back to the house
    // icon (drawn above) when no logo has been uploaded yet.
    const logoEl = opts.logoDataUrl
      ? `<rect x="${(logoX - logoW * 0.06).toFixed(2)}" y="${(logoY - logoH * 0.06).toFixed(2)}" width="${(logoW * 1.12).toFixed(2)}" height="${(logoH * 1.12).toFixed(2)}" rx="${(logoW * 0.12).toFixed(2)}" fill="#ffffff"/>
         <image href="${opts.logoDataUrl}" x="${logoX.toFixed(2)}" y="${logoY.toFixed(2)}" width="${logoW.toFixed(2)}" height="${logoH.toFixed(2)}" preserveAspectRatio="xMidYMid meet"/>`
      : '';

    const qrEl = buildQrPlaceholder(layout.qr, w, h, primary, opts.templateKey + (opts.name || ''));
    const brandFooterEl = buildBrandFooter(layout, w, h, primary);

    const textureDefs = buildTextureOverlay(tpl, ids);
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
        ${screws}
        ${opts.logoDataUrl ? logoEl : houseIconEl}
        ${symbolEl}
        ${dividerTopEl}
        ${houseNoLabelText}
        ${houseNumberText}
        ${dividerMidEl}
        ${nameText}
        ${familyLabelText}
        ${scanLabelText}
        ${qrEl}
        ${brandFooterEl}
      </svg>`;

    container.innerHTML = svg;
  }

  global.SD_PlateRenderer = { renderInto };
})(window);
