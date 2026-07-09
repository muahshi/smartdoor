/**
 * productCatalog.js
 * ------------------------------------------------------------------
 * SINGLE SOURCE OF TRUTH for all SmartDoor products shown on the
 * homepage collection grid, gallery modal, comparison table, booking
 * summary and checkout payload.
 *
 * Phase 1 goal: remove hardcoded product markup from index.html and
 * make the homepage catalog data-driven WITHOUT changing any existing
 * DOM ids/classes/data-attributes that other scripts (selectProduct,
 * openGallery, checkout, PRODUCT_TYPE_MAP consumers) depend on.
 *
 * To add a future product (Phase 7 ecosystem: doorbells, cameras,
 * locks, sensors, etc.) simply push a new entry to SD_PRODUCTS below —
 * no other file needs to change as long as the product belongs to the
 * "nameplate" category and uses the same booking/checkout flow.
 * Non-nameplate categories are reserved for future product lines and
 * are intentionally excluded from the current booking flow render.
 * ------------------------------------------------------------------
 */
(function (global) {
  'use strict';

  /** @typedef {{src:string,label:string}} GalleryImage */

  /**
   * @typedef {Object} SDProduct
   * @property {string} key            - UI key used in data-product / selectProduct (STABLE, do not rename existing keys)
   * @property {string} typeKey        - Key sent to Edge Functions / Razorpay (matches legacy PRODUCT_TYPE_MAP values)
   * @property {string} galleryKey     - Key used to look up gallery images (legacy galleryImages object keys)
   * @property {string} name           - Display name
   * @property {number} price          - Price in INR (whole rupees)
   * @property {string} category       - Product category (drives Phase 7 homepage sections)
   * @property {boolean} best          - Whether to show the "BEST SELLER" ribbon
   * @property {{label:string,bg:string,border:string,color:string}} tag - Small pill tag shown at top of card
   * @property {string} desc           - Short marketing description
   * @property {string[]} feats        - Feature checklist bullets (without the ✓ prefix)
   * @property {string} mainImg        - Path to the main card image
   * @property {string} mainImgId      - Legacy element id kept for backward compatibility with any code/CSS targeting it
   * @property {boolean} imgContain    - Whether the image wrapper needs the "img-contain" class
   * @property {GalleryImage[]} gallery - Gallery modal images
   */

  /**
   * ------------------------------------------------------------------
   * PHASE 2 ADDITION — Product Configurator schema
   * ------------------------------------------------------------------
   * Every product may carry an optional `configurator` object describing
   * the variant axes (sizes/colors/finishes) available for THAT product.
   * The Configurator UI (js/productConfigurator.js) reads this schema at
   * runtime and renders controls automatically — nothing here is wired
   * to product-specific code. A future product simply declares its own
   * `configurator` block (or omits axes it doesn't support) and the UI,
   * pricing and live preview all pick it up with zero code changes.
   *
   * `previewBg` / `previewTextColor` drive the Phase 3 live preview
   * mockup (a CSS-only stand-in nameplate, not a photo) so any future
   * material renders a sensible plate preview automatically.
   * ------------------------------------------------------------------
   */

  /** @type {SDProduct[]} */
  const SD_PRODUCTS = [
    {
      key: 'acrylic',
      typeKey: 'acrylic',
      galleryKey: 'acrylic',
      name: 'Minimalist Acrylic',
      price: 1499,
      category: 'nameplate',
      best: false,
      tag: { label: 'HIGH GLOSS', bg: 'rgba(212,175,55,0.1)', border: 'rgba(212,175,55,0.25)', color: '#D4AF37' },
      desc: "High-gloss black acrylic with gold laser-cut lettering. Sleek, modern, weather-resistant. The purist's choice.",
      feats: ['High-Gloss Acrylic', 'Gold Letters', 'Weatherproof', '1 Yr Privacy'],
      mainImg: 'images/acrylic-front.webp',
      mainImgId: 'acrylic-main-img',
      imgContain: false,
      gallery: [
        { src: 'images/acrylic-front.webp', label: 'Front View' },
        { src: 'images/acrylic-angle.webp', label: 'Angle View' },
        { src: 'images/acrylic-wall-mounted.webp', label: 'Wall Mounted' },
        { src: 'images/acrylic-qr-closeup.webp', label: 'QR Close-up' }
      ],
      previewBg: 'linear-gradient(155deg,#0c0c0c 0%,#1c1c1c 45%,#0a0a0a 100%)',
      previewTextColor: '#D4AF37',
      configurator: {
        sizes: [
          { key: 'standard', label: 'Standard · 8×12 in', priceDelta: 0, widthIn: 8, heightIn: 12 },
          { key: 'large', label: 'Large · 10×16 in', priceDelta: 400, widthIn: 10, heightIn: 16 }
        ],
        colors: [
          { key: 'gold', label: 'Gold', hex: '#D4AF37' },
          { key: 'silver', label: 'Silver', hex: '#C8D6E0' },
          { key: 'white', label: 'White', hex: '#F5F5F5' }
        ],
        finishes: [
          { key: 'high-gloss', label: 'High Gloss', priceDelta: 0 },
          { key: 'matte', label: 'Matte', priceDelta: 150 }
        ]
      }
    },
    {
      key: 'wood',
      typeKey: 'teakwood',
      galleryKey: 'teakwood',
      name: 'Royal Teakwood',
      price: 2499,
      category: 'nameplate',
      best: true,
      tag: { label: 'PREMIUM WOOD', bg: 'rgba(181,147,82,0.1)', border: 'rgba(181,147,82,0.25)', color: '#B5935C' },
      desc: 'Waterproof polished teak with laser-cut brass digital fonts. A statement of timeless luxury at your gate.',
      feats: ['Premium Teakwood', 'Brass Letters', 'Waterproof', '1 Yr Privacy'],
      mainImg: 'images/teakwood-front.webp',
      mainImgId: 'teakwood-main-img',
      imgContain: true,
      gallery: [
        { src: 'images/teakwood-front.webp', label: 'Front View' },
        { src: 'images/teakwood-angle.webp', label: 'Angle View' },
        { src: 'images/teakwood-wall-mounted.webp', label: 'Wall Mounted' },
        { src: 'images/teakwood-qr-closeup.webp', label: 'QR Close-up' }
      ],
      previewBg: 'linear-gradient(155deg,#3b2413 0%,#5a3820 45%,#2a1a0d 100%)',
      previewTextColor: '#D9B26A',
      configurator: {
        sizes: [
          { key: 'standard', label: 'Standard · 8×12 in', priceDelta: 0, widthIn: 8, heightIn: 12 },
          { key: 'large', label: 'Large · 10×16 in', priceDelta: 500, widthIn: 10, heightIn: 16 }
        ],
        colors: [
          { key: 'brass', label: 'Brass', hex: '#B5935C' },
          { key: 'gold', label: 'Gold', hex: '#D4AF37' },
          { key: 'copper', label: 'Copper', hex: '#B87333' }
        ],
        finishes: [
          { key: 'polished', label: 'Polished Teak', priceDelta: 0 },
          { key: 'natural', label: 'Natural Grain', priceDelta: 0 }
        ]
      }
    },
    {
      key: 'steel',
      typeKey: 'stainless',
      galleryKey: 'stainless',
      name: 'Stainless Matte',
      price: 2999,
      category: 'nameplate',
      best: false,
      tag: { label: 'INDUSTRIAL', bg: 'rgba(150,170,190,0.1)', border: 'rgba(150,170,190,0.25)', color: '#96AABE' },
      desc: 'Rust-proof industrial matte silver steel. Scratch-resistant. Lifetime durability guaranteed. Built for forever.',
      feats: ['Stainless Steel', 'Matte Finish', 'Rust-Proof', '1 Yr Privacy'],
      mainImg: 'images/stainless-front.webp',
      mainImgId: 'stainless-main-img',
      imgContain: false,
      gallery: [
        { src: 'images/stainless-front.webp', label: 'Front View' },
        { src: 'images/stainless-angle.webp', label: 'Angle View' },
        { src: 'images/stainless-wall-mounted.webp', label: 'Wall Mounted' },
        { src: 'images/stainless-qr-closeup.webp', label: 'QR Close-up' }
      ],
      previewBg: 'linear-gradient(155deg,#3a4550 0%,#8291a0 45%,#2b333c 100%)',
      previewTextColor: '#0B1525',
      configurator: {
        sizes: [
          { key: 'standard', label: 'Standard · 8×12 in', priceDelta: 0, widthIn: 8, heightIn: 12 },
          { key: 'large', label: 'Large · 10×16 in', priceDelta: 500, widthIn: 10, heightIn: 16 }
        ],
        colors: [
          { key: 'silver', label: 'Silver', hex: '#96AABE' },
          { key: 'black', label: 'Matte Black', hex: '#1A1A1A' }
        ],
        finishes: [
          { key: 'matte', label: 'Matte Steel', priceDelta: 0 },
          { key: 'brushed', label: 'Brushed Steel', priceDelta: 200 }
        ]
      }
    }
  ];

  /**
   * ------------------------------------------------------------------
   * Shared configurator option sets — these axes are the SAME choice
   * list regardless of which product is selected (font, religious
   * symbol and QR style are print/production choices, not material
   * choices), so they live once here instead of being duplicated
   * inside every SD_PRODUCTS entry.
   * ------------------------------------------------------------------
   */

  /** @type {{key:string,label:string,family:string,weight:number}[]} */
  const SD_FONTS = [
    { key: 'modern', label: 'Modern Sans', family: "'Space Grotesk', sans-serif", weight: 700 },
    { key: 'classic', label: 'Classic Serif', family: "Georgia, 'Times New Roman', serif", weight: 700 },
    { key: 'bold', label: 'Bold Block', family: "'Arial Black', Impact, sans-serif", weight: 900 },
    { key: 'script', label: 'Elegant Script', family: "'Brush Script MT', cursive", weight: 400 }
  ];

  /**
   * Religious / cultural symbol options for the nameplate. Purely
   * decorative print choices — "none" is the default so nothing is
   * ever added unless the customer explicitly picks one.
   * @type {{key:string,label:string,glyph:string}[]}
   */
  const SD_SYMBOLS = [
    { key: 'none', label: 'None', glyph: '' },
    { key: 'om', label: 'Om', glyph: '🕉️' },
    { key: 'ganesha', label: 'Ganesha', glyph: '🐘' },
    { key: 'cross', label: 'Cross', glyph: '✝️' },
    { key: 'crescent', label: 'Crescent & Star', glyph: '☪️' },
    { key: 'khanda', label: 'Khanda', glyph: '🔱' },
    { key: 'lotus', label: 'Lotus', glyph: '🪷' }
  ];

  /**
   * QR style is intentionally future-ready: only "classic" is available
   * for checkout today, additional styles can be flipped from
   * status:'coming-soon' to 'available' the moment production supports
   * them — no UI code changes required.
   * @type {{key:string,label:string,status:'available'|'coming-soon'}[]}
   */
  const SD_QR_STYLES = [
    { key: 'classic', label: 'Classic Black QR', status: 'available' },
    { key: 'premium-shield', label: 'Premium Gold Shield QR', status: 'coming-soon' }
  ];

  /** Returns the full configurator schema (product-specific + shared axes) for a product key. */
  function getConfiguratorSchema(key) {
    const p = SD_PRODUCTS.find((prod) => prod.key === key);
    if (!p) return null;
    return {
      productKey: p.key,
      // Phase 4 — the SVG renderer template to use for this product.
      // Reuses galleryKey ('acrylic'/'teakwood'/'stainless') since it
      // already matches the template keys registered in
      // js/plateTemplates.js 1:1; a future product can override this by
      // adding an explicit `previewTemplate` field instead.
      templateKey: p.previewTemplate || p.galleryKey,
      previewBg: p.previewBg,
      previewTextColor: p.previewTextColor,
      sizes: (p.configurator && p.configurator.sizes) || [],
      colors: (p.configurator && p.configurator.colors) || [],
      finishes: (p.configurator && p.configurator.finishes) || [],
      fonts: SD_FONTS,
      symbols: SD_SYMBOLS,
      qrStyles: SD_QR_STYLES
    };
  }

  function escapeHtml(str) {
    return String(str).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  /**
   * Renders a single product card. Markup intentionally matches the
   * legacy hand-written cards 1:1 (same classes/ids/onclick handlers)
   * so no other script needs to change.
   */
  function renderCard(p) {
    const fmtPrice = `₹${p.price.toLocaleString('en-IN')}`;
    const bestBadge = p.best ? '<div class="pcard-best-badge">⭐ BEST SELLER</div>' : '';
    const imgWrapClass = p.imgContain ? 'pcard-img-wrap img-contain' : 'pcard-img-wrap';
    const cardClass = p.best ? 'pcard best product-card' : 'pcard product-card';
    const feats = p.feats.map((f) => `<span class="pcard-feat">✓ ${escapeHtml(f)}</span>`).join('');

    return `
      <div class="${cardClass}" data-product="${p.key}" data-price="${p.price}" onclick="selectProduct(this)">
        ${bestBadge}
        <div class="${imgWrapClass}"><img src="${p.mainImg}" alt="${escapeHtml(p.name)} Smart Door" id="${p.mainImgId}" /><button class="pcard-gallery-btn" onclick="event.stopPropagation();openGallery('${p.galleryKey}','${escapeHtml(p.name)}')">📸 View Gallery</button></div>
        <div class="pcard-body">
          <div class="pcard-tag" style="background:${p.tag.bg};border:1px solid ${p.tag.border};color:${p.tag.color};">${escapeHtml(p.tag.label)}</div>
          <div class="pcard-name">${escapeHtml(p.name)}</div>
          <div class="pcard-desc">${escapeHtml(p.desc)}</div>
          <div class="pcard-feats">${feats}</div>
          <div class="pcard-footer"><div><div class="pcard-price">${fmtPrice}</div><div style="font-size:0.7rem;color:#22C55E;margin-top:2px;">FREE Shipping</div></div><button class="pcard-select" onclick="event.stopPropagation();selectProduct(this.closest('.pcard'))">SELECT</button></div>
        </div>
      </div>`;
  }

  /**
   * Renders the full nameplate collection grid into the given container.
   * Only products in the "nameplate" category render into this grid —
   * future categories (Phase 7) get their own sections/renderers.
   */
  function renderProductGrid(containerId) {
    const el = document.getElementById(containerId);
    if (!el) return;
    el.innerHTML = SD_PRODUCTS.filter((p) => p.category === 'nameplate').map(renderCard).join('');
  }

  /** Derived legacy lookup maps — generated so there is exactly ONE place (SD_PRODUCTS) that owns this data. */
  function buildProductNames() {
    return Object.fromEntries(SD_PRODUCTS.map((p) => [p.key, p.name]));
  }
  function buildProductTypeMap() {
    return Object.fromEntries(SD_PRODUCTS.map((p) => [p.key, p.typeKey]));
  }
  function buildGalleryImages() {
    return Object.fromEntries(SD_PRODUCTS.map((p) => [p.galleryKey, p.gallery]));
  }
  function buildPriceMap() {
    return Object.fromEntries(SD_PRODUCTS.map((p) => [p.key, p.price]));
  }
  function getByKey(key) {
    return SD_PRODUCTS.find((p) => p.key === key) || null;
  }

  global.SD_PRODUCTS = SD_PRODUCTS;
  global.SD_Catalog = {
    products: SD_PRODUCTS,
    renderProductGrid,
    buildProductNames,
    buildProductTypeMap,
    buildGalleryImages,
    buildPriceMap,
    getByKey,
    // Phase 2/3 — Product Configurator + Live Preview data source
    fonts: SD_FONTS,
    symbols: SD_SYMBOLS,
    qrStyles: SD_QR_STYLES,
    getConfiguratorSchema
  };
})(window);
