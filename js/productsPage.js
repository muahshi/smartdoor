/**
 * productsPage.js
 * ------------------------------------------------------------------
 * Controller for products.html (Phase 2B — Products Experience).
 *
 * Reads exclusively from window.SD_Catalog (js/productCatalog.js) —
 * the same single source of truth used by the homepage grid and the
 * checkout flow. Does NOT touch selectProduct/checkout logic; cards
 * here are plain links to product.html?slug=<key> so Phase 2A's
 * booking/payment code in index.html is never modified.
 * ------------------------------------------------------------------
 */
(function () {
  'use strict';

  const GRID_ID = 'pl-grid';
  const COUNT_ID = 'pl-count';
  const FILTER_LIST_ID = 'pl-filters';
  const SORT_ID = 'pl-sort-select';

  let activeMaterial = 'all';
  let activeSort = 'featured';

  function escapeHtml(str) {
    return String(str).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  function brandName() {
    return (window.SD_Brand && window.SD_Brand.name) || 'My Smart Door';
  }

  function materialLabel(p) {
    // Derive a friendly material filter label from the existing tag/galleryKey
    // without adding new fields to the catalog schema.
    return p.tag && p.tag.label ? p.tag.label : p.galleryKey;
  }

  function getProducts() {
    const all = (window.SD_Catalog && window.SD_Catalog.products) || [];
    return all.filter((p) => p.category === 'nameplate');
  }

  function applyFiltersAndSort(products) {
    let list = products.slice();
    if (activeMaterial !== 'all') {
      list = list.filter((p) => p.galleryKey === activeMaterial);
    }
    switch (activeSort) {
      case 'price-asc':
        list.sort((a, b) => a.price - b.price);
        break;
      case 'price-desc':
        list.sort((a, b) => b.price - a.price);
        break;
      case 'name-asc':
        list.sort((a, b) => a.name.localeCompare(b.name));
        break;
      default:
        // 'featured' — best sellers first, preserving catalog order otherwise
        list.sort((a, b) => (b.best === true) - (a.best === true));
    }
    return list;
  }

  function renderCard(p) {
    const fmtPrice = `₹${p.price.toLocaleString('en-IN')}`;
    const bestBadge = p.best ? '<div class="pcard-best-badge">⭐ BEST SELLER</div>' : '';
    const imgWrapClass = p.imgContain ? 'pcard-img-wrap img-contain' : 'pcard-img-wrap';
    const cardClass = p.best ? 'pcard best product-card' : 'pcard product-card';
    const feats = p.feats.slice(0, 4).map((f) => `<span class="pcard-feat">✓ ${escapeHtml(f)}</span>`).join('');

    return `
      <li>
        <a class="pl-card" href="/products/${encodeURIComponent(p.key)}" data-product="${p.key}" aria-label="${escapeHtml(p.name)} — ${fmtPrice}">
          <div class="${cardClass}">
            ${bestBadge}
            <div class="${imgWrapClass}"><img src="${p.mainImg}" alt="${escapeHtml(p.name)} ${escapeHtml(brandName())} nameplate" loading="lazy" width="400" height="500" onerror="this.style.display='none'" /></div>
            <div class="pcard-body">
              <div class="pcard-tag" style="background:${p.tag.bg};border:1px solid ${p.tag.border};color:${p.tag.color};">${escapeHtml(p.tag.label)}</div>
              <div class="pcard-name">${escapeHtml(p.name)}</div>
              <div class="pcard-desc">${escapeHtml(p.desc)}</div>
              <div class="pcard-feats">${feats}</div>
              <div class="pcard-footer"><div><div class="pcard-price">${fmtPrice}</div><div style="font-size:0.7rem;color:#22C55E;margin-top:2px;">FREE Shipping</div></div><span class="pcard-select" aria-hidden="true">VIEW →</span></div>
            </div>
          </div>
        </a>
      </li>`;
  }

  function render() {
    const gridEl = document.getElementById(GRID_ID);
    const countEl = document.getElementById(COUNT_ID);
    if (!gridEl) return;

    const all = getProducts();
    const list = applyFiltersAndSort(all);

    if (!list.length) {
      gridEl.innerHTML = '';
      gridEl.setAttribute('aria-hidden', 'true');
      const empty = document.getElementById('pl-empty');
      if (empty) empty.hidden = false;
      if (countEl) countEl.textContent = 'No nameplates match this filter.';
      return;
    }

    const empty = document.getElementById('pl-empty');
    if (empty) empty.hidden = true;
    gridEl.removeAttribute('aria-hidden');
    gridEl.innerHTML = list.map(renderCard).join('');
    if (countEl) countEl.textContent = `Showing ${list.length} of ${all.length} nameplate${all.length === 1 ? '' : 's'}`;

    injectItemListSchema(list);
  }

  function renderFilters() {
    const filterEl = document.getElementById(FILTER_LIST_ID);
    if (!filterEl) return;
    const all = getProducts();
    const materials = [{ key: 'all', label: 'All Materials' }].concat(
      all.map((p) => ({ key: p.galleryKey, label: materialLabel(p) }))
    );
    // De-duplicate while preserving order
    const seen = new Set();
    const unique = materials.filter((m) => (seen.has(m.key) ? false : (seen.add(m.key), true)));

    filterEl.innerHTML = unique.map((m) => `
      <li>
        <button type="button" class="pl-filter-btn" data-material="${m.key}" aria-pressed="${m.key === activeMaterial}">${escapeHtml(m.label)}</button>
      </li>`).join('');

    filterEl.querySelectorAll('.pl-filter-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        activeMaterial = btn.dataset.material;
        filterEl.querySelectorAll('.pl-filter-btn').forEach((b) => b.setAttribute('aria-pressed', String(b === btn)));
        render();
      });
    });
  }

  function bindSort() {
    const sortEl = document.getElementById(SORT_ID);
    if (!sortEl) return;
    sortEl.addEventListener('change', () => {
      activeSort = sortEl.value;
      render();
    });
  }

  /** Injects a fresh ItemList JSON-LD block reflecting the currently visible products (SEO). */
  function injectItemListSchema(list) {
    const existing = document.getElementById('pl-itemlist-schema');
    if (existing) existing.remove();
    const script = document.createElement('script');
    script.type = 'application/ld+json';
    script.id = 'pl-itemlist-schema';
    script.textContent = JSON.stringify({
      '@context': 'https://schema.org',
      '@type': 'ItemList',
      itemListElement: list.map((p, i) => ({
        '@type': 'ListItem',
        position: i + 1,
        url: `https://mysmartdoor.in/products/${p.key}`,
        name: p.name
      }))
    });
    document.head.appendChild(script);
  }

  function showLoadError() {
    const gridEl = document.getElementById(GRID_ID);
    const countEl = document.getElementById(COUNT_ID);
    if (gridEl) {
      gridEl.innerHTML = '';
      gridEl.setAttribute('aria-hidden', 'true');
    }
    const empty = document.getElementById('pl-empty');
    if (empty) {
      empty.hidden = false;
      empty.textContent = "We couldn't load the product catalog right now. Please refresh, or ";
      const link = document.createElement('a');
      link.href = '/#pricing';
      link.style.color = 'var(--accent)';
      link.textContent = 'see pricing on the homepage →';
      empty.appendChild(link);
    }
    if (countEl) countEl.textContent = '';
  }

  function init() {
    if (!window.SD_Catalog) {
      // productCatalog.js failed to load or hasn't parsed yet — give it
      // a short window before showing a visible error instead of
      // leaving the skeleton cards spinning forever.
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
      renderFilters();
      bindSort();
      render();
    } catch (err) {
      showLoadError();
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
