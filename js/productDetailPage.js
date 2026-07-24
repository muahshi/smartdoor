/**
 * productDetailPage.js
 * ------------------------------------------------------------------
 * Controller for product.html (Phase 2B — Products Experience).
 *
 * Reads a single product from window.SD_Catalog by ?slug=<key> (also
 * accepts the legacy ?product=<key> param). Mounts the EXISTING
 * js/productConfigurator.js for live customization preview.
 *
 * Checkout handoff: the "Customize & Order" CTA never touches
 * Razorpay/Supabase/checkout logic directly. It navigates to
 * /#booking?product=<key>, and a small additive snippet already
 * living in index.html's own DOMContentLoaded reads that param and
 * calls the EXISTING selectProduct() to preselect the right card —
 * Phase 2A payment/backend code is untouched.
 * ------------------------------------------------------------------
 */
(function () {
  'use strict';

  function escapeHtml(str) {
    return String(str).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  function getRequestedKey() {
    const params = new URLSearchParams(window.location.search);
    return params.get('slug') || params.get('product') || null;
  }

  function setMeta(name, content, attr) {
    attr = attr || 'name';
    let el = document.querySelector(`meta[${attr}="${name}"]`);
    if (!el) {
      el = document.createElement('meta');
      el.setAttribute(attr, name);
      document.head.appendChild(el);
    }
    el.setAttribute('content', content);
  }

  function brandName() {
    return (window.SD_Brand && window.SD_Brand.name) || 'My Smart Door';
  }

  function updateSEO(p) {
    const title = `${p.name} Smart Nameplate — ₹${p.price.toLocaleString('en-IN')} | ${brandName()}`;
    const desc = p.desc;
    const url = `https://mysmartdoor.in/products/${p.key}`;
    const img = `https://mysmartdoor.in/${p.mainImg}`;

    document.title = title;
    setMeta('description', desc);
    let canonical = document.querySelector('link[rel="canonical"]');
    if (!canonical) {
      canonical = document.createElement('link');
      canonical.setAttribute('rel', 'canonical');
      document.head.appendChild(canonical);
    }
    canonical.setAttribute('href', url);

    setMeta('og:title', title, 'property');
    setMeta('og:description', desc, 'property');
    setMeta('og:url', url, 'property');
    setMeta('og:image', img, 'property');
    setMeta('og:type', 'product', 'property');
    setMeta('twitter:title', title);
    setMeta('twitter:description', desc);
    setMeta('twitter:image', img);

    const schema = document.createElement('script');
    schema.type = 'application/ld+json';
    schema.id = 'pd-product-schema';
    schema.textContent = JSON.stringify({
      '@context': 'https://schema.org',
      '@type': 'Product',
      name: p.name,
      description: p.desc,
      image: p.gallery.map((g) => `https://mysmartdoor.in/${g.src}`),
      brand: { '@type': 'Brand', name: brandName() },
      offers: {
        '@type': 'Offer',
        priceCurrency: 'INR',
        price: p.price,
        availability: 'https://schema.org/InStock',
        url
      }
    });
    const existing = document.getElementById('pd-product-schema');
    if (existing) existing.remove();
    document.head.appendChild(schema);

    const bcSchema = document.createElement('script');
    bcSchema.type = 'application/ld+json';
    bcSchema.id = 'pd-breadcrumb-schema';
    bcSchema.textContent = JSON.stringify({
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Home', item: 'https://mysmartdoor.in/' },
        { '@type': 'ListItem', position: 2, name: 'Products', item: 'https://mysmartdoor.in/products' },
        { '@type': 'ListItem', position: 3, name: p.name, item: url }
      ]
    });
    const existingBc = document.getElementById('pd-breadcrumb-schema');
    if (existingBc) existingBc.remove();
    document.head.appendChild(bcSchema);
  }

  function renderGallery(p) {
    const mainWrap = document.getElementById('pd-gallery-main');
    const mainImg = document.getElementById('pd-gallery-main-img');
    const thumbsEl = document.getElementById('pd-gallery-thumbs');
    if (!mainWrap || !mainImg || !thumbsEl) return;

    mainWrap.classList.toggle('img-contain', !!p.imgContain);

    function show(index) {
      const item = p.gallery[index];
      if (!item) return;
      mainImg.src = item.src;
      mainImg.alt = `${p.name} — ${item.label}`;
      thumbsEl.querySelectorAll('.pd-gallery-thumb').forEach((btn, i) => {
        btn.setAttribute('aria-current', String(i === index));
      });
    }

    thumbsEl.innerHTML = p.gallery.map((g, i) => `
      <button type="button" class="pd-gallery-thumb" data-index="${i}" aria-current="${i === 0}" aria-label="${escapeHtml(g.label)}">
        <img src="${g.src}" alt="" loading="lazy" width="68" height="68" onerror="this.closest('.pd-gallery-thumb').style.display='none'" />
      </button>`).join('');

    thumbsEl.querySelectorAll('.pd-gallery-thumb').forEach((btn) => {
      btn.addEventListener('click', () => show(Number(btn.dataset.index)));
    });

    // Keyboard support: left/right arrows move between gallery images
    // while focus is anywhere inside the thumbnail strip.
    thumbsEl.addEventListener('keydown', (e) => {
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
      const current = Number(thumbsEl.querySelector('[aria-current="true"]')?.dataset.index || 0);
      const next = e.key === 'ArrowRight'
        ? Math.min(current + 1, p.gallery.length - 1)
        : Math.max(current - 1, 0);
      show(next);
      thumbsEl.querySelectorAll('.pd-gallery-thumb')[next]?.focus();
      e.preventDefault();
    });

    // If the requested image 404s, fall back once to the product's main
    // card image; if that also fails, hide the <img> so the gallery
    // wrapper's background shows instead of a broken-image icon.
    mainImg.addEventListener('error', function onMainImgError() {
      if (mainImg.src.indexOf(p.mainImg) === -1) {
        mainImg.src = p.mainImg;
      } else {
        mainImg.removeEventListener('error', onMainImgError);
        mainImg.style.display = 'none';
      }
    });

    show(0);
  }

  function renderInfo(p) {
    const fmtPrice = `₹${p.price.toLocaleString('en-IN')}`;
    const tagEl = document.getElementById('pd-tag');
    const titleEl = document.getElementById('pd-title');
    const priceEl = document.getElementById('pd-price');
    const descEl = document.getElementById('pd-desc');
    const featsEl = document.getElementById('pd-feats');
    const crumbEl = document.getElementById('pd-crumb-current');

    if (tagEl) {
      tagEl.textContent = p.tag.label;
      tagEl.style.background = p.tag.bg;
      tagEl.style.border = `1px solid ${p.tag.border}`;
      tagEl.style.color = p.tag.color;
    }
    if (titleEl) titleEl.textContent = p.name;
    if (priceEl) priceEl.textContent = fmtPrice;
    if (descEl) descEl.textContent = p.desc;
    if (featsEl) featsEl.innerHTML = p.feats.map((f) => `<li>${escapeHtml(f)}</li>`).join('');
    if (crumbEl) crumbEl.textContent = p.name;
  }

  function renderRelated(p) {
    const wrap = document.getElementById('pd-related');
    const grid = document.getElementById('pd-related-grid');
    if (!wrap || !grid || !window.SD_Catalog) return;
    const others = window.SD_Catalog.products.filter((x) => x.category === 'nameplate' && x.key !== p.key);
    if (!others.length) { wrap.hidden = true; return; }
    grid.innerHTML = others.map((o) => `
      <li>
        <a class="pl-card" href="/products/${encodeURIComponent(o.key)}" aria-label="${escapeHtml(o.name)}">
          <div class="pcard product-card">
            <div class="${o.imgContain ? 'pcard-img-wrap img-contain' : 'pcard-img-wrap'}"><img src="${o.mainImg}" alt="${escapeHtml(o.name)} ${escapeHtml(brandName())} nameplate" loading="lazy" width="400" height="500" onerror="this.style.display='none'" /></div>
            <div class="pcard-body">
              <div class="pcard-name">${escapeHtml(o.name)}</div>
              <div class="pcard-footer"><div class="pcard-price">₹${o.price.toLocaleString('en-IN')}</div><span class="pcard-select" aria-hidden="true">VIEW →</span></div>
            </div>
          </div>
        </a>
      </li>`).join('');
    wrap.hidden = false;
  }

  function bindOrderCTA(p) {
    const cta = document.getElementById('pd-order-cta');
    if (!cta) return;
    cta.href = `/#booking?product=${encodeURIComponent(p.key)}`;
  }

  function mountConfigurator(p) {
    if (window.SD_Configurator && typeof window.SD_Configurator.mount === 'function') {
      window.SD_Configurator.mount(p.key);
    }
  }

  function showNotFound() {
    const wrap = document.getElementById('pd-wrap');
    const notFound = document.getElementById('pd-not-found');
    if (wrap) wrap.hidden = true;
    if (notFound) notFound.hidden = false;

    // SEO — an unknown slug still returns HTTP 200 on static hosting,
    // so without this the default index,follow meta + canonical would
    // let an invalid /products/:slug get indexed as if it were real
    // content. Flip to noindex and drop the misleading canonical.
    document.title = `Product Not Found — ${brandName()}`;
    setMeta('robots', 'noindex, follow');
    const canonical = document.querySelector('link[rel="canonical"]');
    if (canonical) canonical.remove();
  }

  function showLoadError() {
    const wrap = document.getElementById('pd-wrap');
    const notFound = document.getElementById('pd-not-found');
    if (wrap) wrap.hidden = true;
    if (notFound) {
      notFound.hidden = false;
      notFound.textContent = '';
      const msg = document.createElement('span');
      msg.textContent = "We couldn't load this product right now. ";
      const link = document.createElement('a');
      link.href = '/products';
      link.style.color = 'var(--accent)';
      link.textContent = 'Browse the full collection →';
      notFound.appendChild(msg);
      notFound.appendChild(link);
    }
    setMeta('robots', 'noindex, follow');
  }

  function init() {
    if (!window.SD_Catalog) {
      // productCatalog.js failed to load or hasn't parsed yet (slow
      // network, ad-blocker, CDN hiccup). Give it one short window
      // before giving up, rather than leaving the page stuck on
      // "Loading…" forever with no feedback.
      let attempts = 0;
      const wait = setInterval(() => {
        attempts += 1;
        if (window.SD_Catalog) {
          clearInterval(wait);
          init();
        } else if (attempts >= 20) {
          clearInterval(wait);
          showLoadError();
        }
      }, 150);
      return;
    }

    try {
      const key = getRequestedKey();
      const p = key ? window.SD_Catalog.getByKey(key) : null;

      if (!p) {
        showNotFound();
        return;
      }

      updateSEO(p);
      renderInfo(p);
      renderGallery(p);
      bindOrderCTA(p);
      mountConfigurator(p);
      renderRelated(p);
    } catch (err) {
      // Defensive — a malformed catalog entry or a DOM mismatch should
      // never leave the customer on a blank/frozen page.
      showLoadError();
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
