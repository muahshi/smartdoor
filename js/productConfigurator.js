/**
 * productConfigurator.js
 * ------------------------------------------------------------------
 * PHASE 2 — Product Configurator (reusable, catalog-driven)
 * PHASE 3 — Live Product Preview (real-time, modular)
 *
 * This module is the ONLY place that knows how to render configurator
 * controls and the live preview. It reads everything it needs from
 * js/productCatalog.js (SD_Catalog.getConfiguratorSchema) — it never
 * hardcodes a product name, price or option. Dropping a new product
 * into SD_PRODUCTS (with its own `configurator` block) is enough for
 * it to automatically get a full configurator + preview here.
 *
 * Public API (window.SD_Configurator):
 *   mount(productKey)        - render controls + preview for a product
 *   getState()                - current customization selections
 *   getCustomizationPayload() - flat object safe to send to checkout
 *
 * Zero backend coupling: this file never calls Supabase or Razorpay.
 * index.html reads getCustomizationPayload() when building orderParams.
 * ------------------------------------------------------------------
 */
(function (global) {
  'use strict';

  const CONTROLS_ID = 'configurator-controls';
  const PREVIEW_ID = 'configurator-preview';

  /** @type {{productKey:string,size:string,color:string,finish:string,symbol:string,qrStyle:string,houseNumber:string,logoDataUrl:string|null,logoFileName:string|null}} */
  let state = {
    productKey: null,
    size: null,
    color: null,
    finish: null,
    symbol: 'none',
    qrStyle: 'classic',
    houseNumber: '',
    subtitle: 'FAMILY',
    logoDataUrl: null,
    logoFileName: null
  };

  let currentSchema = null;

  function escapeHtml(str) {
    return String(str).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  // ────────── CONTROL RENDERERS (each is generic — driven by schema arrays) ──────────

  function renderPillGroup(groupName, options, activeKey, extraAttr) {
    if (!options || !options.length) return '';
    return options.map((opt) => {
      const isActive = opt.key === activeKey;
      const delta = opt.priceDelta ? ` <span class="cfg-pill-delta">+₹${opt.priceDelta}</span>` : '';
      const disabled = opt.status === 'coming-soon';
      return `<button type="button" class="cfg-pill${isActive ? ' active' : ''}${disabled ? ' disabled' : ''}"
        data-group="${groupName}" data-key="${opt.key}" ${extraAttr || ''} ${disabled ? 'disabled' : ''}
        onclick="SD_Configurator._onPillClick(this)">${escapeHtml(opt.label)}${delta}${disabled ? ' <span class="cfg-pill-soon">Soon</span>' : ''}</button>`;
    }).join('');
  }

  function renderColorSwatches(colors, activeKey) {
    if (!colors || !colors.length) return '';
    return colors.map((c) => {
      const isActive = c.key === activeKey;
      return `<button type="button" class="cfg-swatch${isActive ? ' active' : ''}" title="${escapeHtml(c.label)}"
        style="background:${c.hex};" data-key="${c.key}" onclick="SD_Configurator._onColorClick(this)"></button>`;
    }).join('');
  }

  function renderSymbolGrid(symbols, activeKey) {
    if (!symbols || !symbols.length) return '';
    return symbols.map((s) => {
      const isActive = s.key === activeKey;
      return `<button type="button" class="cfg-symbol${isActive ? ' active' : ''}" title="${escapeHtml(s.label)}"
        data-key="${s.key}" onclick="SD_Configurator._onSymbolClick(this)">
        <span class="cfg-symbol-glyph">${s.glyph || '—'}</span>
        <span class="cfg-symbol-label">${escapeHtml(s.label)}</span>
      </button>`;
    }).join('');
  }

  function renderControls(schema) {
    const el = document.getElementById(CONTROLS_ID);
    if (!el) return;

    const sections = [];

    if (schema.sizes.length) {
      sections.push(`
        <div class="cfg-field">
          <label class="booking-form-label">Size</label>
          <div class="cfg-pill-row" data-group="size">${renderPillGroup('size', schema.sizes, state.size)}</div>
        </div>`);
    }

    if (schema.colors.length) {
      sections.push(`
        <div class="cfg-field">
          <label class="booking-form-label">Letter Color</label>
          <div class="cfg-swatch-row">${renderColorSwatches(schema.colors, state.color)}</div>
        </div>`);
    }

    if (schema.finishes.length) {
      sections.push(`
        <div class="cfg-field">
          <label class="booking-form-label">Finish / Material</label>
          <div class="cfg-pill-row" data-group="finish">${renderPillGroup('finish', schema.finishes, state.finish)}</div>
        </div>`);
    }

    sections.push(`
      <div class="cfg-field">
        <label class="booking-form-label">House / Flat Number</label>
        <input type="text" id="house-number" class="booking-input" placeholder="e.g. B-204" value="${escapeHtml(state.houseNumber)}"
          oninput="SD_Configurator._onHouseNumberInput(this.value)" />
      </div>`);

    sections.push(`
      <div class="cfg-field">
        <label class="booking-form-label">Subtitle <span class="cfg-optional">(optional, e.g. "Est. 2020")</span></label>
        <input type="text" id="plate-subtitle" class="booking-input" placeholder="e.g. Est. 2020" value="${escapeHtml(state.subtitle)}"
          oninput="SD_Configurator._onSubtitleInput(this.value)" />
      </div>`);

    sections.push(`
      <div class="cfg-field">
        <label class="booking-form-label">Religious Symbol <span class="cfg-optional">(optional)</span></label>
        <div class="cfg-symbol-grid">${renderSymbolGrid(schema.symbols, state.symbol)}</div>
      </div>`);

    sections.push(`
      <div class="cfg-field">
        <label class="booking-form-label">QR Style</label>
        <div class="cfg-pill-row" data-group="qrStyle">${renderPillGroup('qrStyle', schema.qrStyles, state.qrStyle)}</div>
      </div>`);

    sections.push(`
      <div class="cfg-field">
        <label class="booking-form-label">Custom Logo <span class="cfg-optional">(optional, subject to review)</span></label>
        <div class="cfg-logo-upload">
          <label class="cfg-logo-btn" for="cfg-logo-input">📁 Choose File</label>
          <input type="file" id="cfg-logo-input" accept="image/png,image/jpeg,image/svg+xml" style="display:none;" onchange="SD_Configurator._onLogoChange(this.files[0])" />
          <span class="cfg-logo-filename" id="cfg-logo-filename">${state.logoFileName ? escapeHtml(state.logoFileName) : 'No file chosen'}</span>
        </div>
        <div class="cfg-logo-hint">Logo upload is architecture-ready. Files are previewed locally now; production printing review is handled by our team after order confirmation.</div>
      </div>`);

    el.innerHTML = sections.join('');
  }

  // ────────── LIVE PREVIEW (Phase 3) ──────────

  function currentNameValue() {
    const el = document.getElementById('plate-name');
    return el ? el.value.trim() : '';
  }

  function currentFontKey() {
    const el = document.getElementById('font-style');
    return el ? el.value : 'modern';
  }

  /** Plate width/height (inches) → aspect ratio, with a sane fallback for any future size that omits it. */
  function aspectForSize(sizeOpt) {
    if (sizeOpt && sizeOpt.widthIn && sizeOpt.heightIn) return sizeOpt.widthIn / sizeOpt.heightIn;
    return 0.667; // ~8x12 portrait default
  }

  function renderPreview() {
    const el = document.getElementById(PREVIEW_ID);
    if (!el || !currentSchema) return;

    const font = currentSchema.fonts.find((f) => f.key === currentFontKey()) || currentSchema.fonts[0];
    const symbol = currentSchema.symbols.find((s) => s.key === state.symbol);
    const name = currentNameValue() || 'Your Name Here';
    const sizeOpt = currentSchema.sizes.find((s) => s.key === state.size);
    const sizeLabel = (sizeOpt || {}).label || '';

    // Ensure the SVG mount point + caption exist (created once, then reused
    // across re-renders so we're not tearing down/rebuilding the <svg> DOM
    // node on every keystroke).
    if (!el.querySelector('.cfg-plate-svg-wrap')) {
      el.innerHTML = `<div class="cfg-plate-svg-wrap" id="cfg-plate-svg-wrap"></div><div class="cfg-preview-caption" id="cfg-preview-caption"></div>`;
    }
    const svgWrap = document.getElementById('cfg-plate-svg-wrap');
    const captionEl = document.getElementById('cfg-preview-caption');

    global.SD_PlateRenderer.renderInto(svgWrap, {
      templateKey: currentSchema.templateKey,
      aspect: aspectForSize(sizeOpt),
      name,
      subtitle: state.subtitle || '',
      houseNumber: state.houseNumber || '',
      fontFamily: font.family,
      fontWeight: font.weight,
      symbolGlyph: symbol && symbol.glyph ? symbol.glyph : '',
      logoDataUrl: state.logoDataUrl || null
    });

    if (captionEl) {
      captionEl.textContent = `${sizeLabel ? sizeLabel + ' · ' : ''}Live preview — updates instantly as you customize`;
    }
  }

  function rerender() {
    renderPreview();
  }

  // ────────── EVENT HANDLERS (exposed for inline onclick, matches existing codebase pattern) ──────────

  function onPillClick(btn) {
    if (btn.disabled) return;
    const group = btn.dataset.group;
    const key = btn.dataset.key;
    state[group] = key;
    const row = btn.closest('.cfg-pill-row');
    if (row) row.querySelectorAll('.cfg-pill').forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');
    rerender();
  }

  function onColorClick(btn) {
    state.color = btn.dataset.key;
    const row = btn.closest('.cfg-swatch-row');
    if (row) row.querySelectorAll('.cfg-swatch').forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');
    rerender();
  }

  function onSymbolClick(btn) {
    state.symbol = btn.dataset.key;
    const grid = btn.closest('.cfg-symbol-grid');
    if (grid) grid.querySelectorAll('.cfg-symbol').forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');
    rerender();
  }

  function onHouseNumberInput(value) {
    state.houseNumber = value;
    rerender();
  }

  function onSubtitleInput(value) {
    state.subtitle = value;
    rerender();
  }

  function onLogoChange(file) {
    const filenameEl = document.getElementById('cfg-logo-filename');
    if (!file) {
      state.logoDataUrl = null;
      state.logoFileName = null;
      if (filenameEl) filenameEl.textContent = 'No file chosen';
      rerender();
      return;
    }
    // Architecture-ready placeholder: preview only, no upload backend yet.
    // When a Supabase storage bucket for custom logos exists, replace this
    // FileReader preview with a real upload call and store the returned
    // public URL in state.logoDataUrl instead of the local object URL.
    state.logoFileName = file.name;
    if (filenameEl) filenameEl.textContent = file.name;
    const reader = new FileReader();
    reader.onload = (e) => {
      state.logoDataUrl = e.target.result;
      rerender();
    };
    reader.readAsDataURL(file);
  }

  // ────────── PUBLIC API ──────────

  function mount(productKey) {
    const schema = global.SD_Catalog && global.SD_Catalog.getConfiguratorSchema(productKey);
    if (!schema) return;
    currentSchema = schema;

    // Reset variant-specific selections to the new product's defaults,
    // keep cross-product selections (symbol, qrStyle, houseNumber, logo) as-is.
    state.productKey = productKey;
    state.size = schema.sizes[0] ? schema.sizes[0].key : null;
    state.color = schema.colors[0] ? schema.colors[0].key : null;
    state.finish = schema.finishes[0] ? schema.finishes[0].key : null;

    renderControls(schema);
    renderPreview();

    // Keep preview in sync with the existing name/font-style inputs
    // (owned by index.html, not this module) without modifying them.
    const nameEl = document.getElementById('plate-name');
    const fontEl = document.getElementById('font-style');
    if (nameEl && !nameEl._sdConfiguratorBound) {
      nameEl.addEventListener('input', rerender);
      nameEl._sdConfiguratorBound = true;
    }
    if (fontEl && !fontEl._sdConfiguratorBound) {
      fontEl.addEventListener('change', rerender);
      fontEl._sdConfiguratorBound = true;
    }
  }

  function getState() {
    return { ...state };
  }

  /** Flat, checkout-safe customization payload merged into orderParams. */
  function getCustomizationPayload() {
    return {
      houseNumber: state.houseNumber || '',
      subtitle: state.subtitle || '',
      size: state.size || '',
      color: state.color || '',
      finish: state.finish || '',
      symbol: state.symbol || 'none',
      qrStyle: state.qrStyle || 'classic',
      logoFileName: state.logoFileName || null
    };
  }

  global.SD_Configurator = {
    mount,
    getState,
    getCustomizationPayload,
    // internal — exposed only for inline onclick handlers in rendered markup
    _onPillClick: onPillClick,
    _onColorClick: onColorClick,
    _onSymbolClick: onSymbolClick,
    _onHouseNumberInput: onHouseNumberInput,
    _onSubtitleInput: onSubtitleInput,
    _onLogoChange: onLogoChange
  };
})(window);

