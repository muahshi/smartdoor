/**
 * Smart Door — Owner Activity Center
 * js/activityCenter.js
 *
 * ADDITIVE ONLY. Phase 2 of the Visitor History feature (Phase 1 backend:
 * services/visitorMemory.js + sql/41/42). This is the owner's communication
 * dashboard: searchable/filterable visitor timeline, stat cards, a visitor
 * details drawer with notes + colored labels, and CSV/PDF export.
 *
 * Does not modify dashboard.js, ownerPremium.js, auth, RBAC, WebRTC,
 * signaling, or any existing render path. It renders into brand-new
 * overlay ids (#activity-center-overlay, #ac-drawer-overlay) created at
 * runtime, the same pattern js/ownerPremium.js already uses for
 * #op-timeline-overlay / #op-notif-overlay / #op-share-overlay.
 *
 * Entry points (see app.html): the "Visitor Logs" quick-action tiles
 * (mobile + desktop) and the Inbox's "View Full Visitor Log" button now
 * call ActivityCenter.open() instead of the older OwnerPremium.openTimeline()
 * — that function is left in place, untouched, in case anything else
 * still references it.
 */

import {
  getActivityFeed, getActivityStats, getVisitorProfileSummary, saveVisitorNoteAndLabel, subscribeToActivityFeed,
  toggleVisitorFavorite, setVisitorBlocked, uploadVisitorPhoto, getVisitorInsights,
} from '../services/activityCenter.js';

const ActivityCenter = (() => {
  const PAGE_SIZE = 20;

  let ownerId = null;
  let unsubscribeRealtime = null;

  // Feed state
  let search = '';
  let dateRange = 'all';
  let status = 'all';
  let labelFilter = 'all';
  let page = 1;
  let rows = [];
  let totalCount = 0;
  let loading = false;
  let searchDebounceTimer = null;

  // Visitor Insights (dashboard card) state
  let insightsInitTries = 0;
  let insightsRealtimeUnsub = null;

  // Drawer state
  let drawerProfileId = null;
  let drawerData = null;

  const STATUS_STYLE = {
    connected: { color: '#22C55E', label: 'Connected', icon: '✅' },
    missed:    { color: '#EF4444', label: 'Missed',    icon: '📵' },
    rejected:  { color: '#F59E0B', label: 'Rejected',  icon: '🚫' },
    cancelled: { color: 'rgba(255,255,255,0.45)', label: 'Cancelled', icon: '⏹️' },
    incoming:  { color: '#00A2E8', label: 'Ringing',   icon: '📞' },
    failed:    { color: '#EF4444', label: 'Failed',    icon: '⚠️' },
  };
  const DEFAULT_STATUS_STYLE = { color: 'rgba(255,255,255,0.35)', label: 'Visit', icon: '🔔' };

  const LABEL_PRESETS = [
    { name: 'Trusted',  color: '#22C55E' },
    { name: 'Family',   color: '#22C55E' },
    { name: 'Delivery', color: '#00A2E8' },
    { name: 'Courier',  color: '#A855F7' },
    { name: 'Guest',    color: '#C9A24B' },
    { name: 'Office',   color: '#F59E0B' },
    { name: 'Unknown',  color: 'rgba(255,255,255,0.4)' },
  ];

  // Quick "Type" filter chips shown in the feed — reuses the same label
  // values as LABEL_PRESETS, plus two virtual filters (Favorites/Blocked)
  // resolved server-side in get_owner_activity_feed's p_label param.
  const TYPE_FILTER_CHIPS = [
    ['all', 'All'], ['favorites', '★ Favorites'], ['Trusted', 'Trusted'], ['Family', 'Family'],
    ['Delivery', 'Delivery'], ['Office', 'Office'], ['blocked', '🚫 Blocked'],
  ];

  // ────────── helpers ──────────

  function _esc(str) {
    return String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function _ownerId() {
    if (ownerId) return ownerId;
    const s = window.DashboardModule?.getState?.();
    ownerId = s?.owner?.id || null;
    return ownerId;
  }

  function _toast(msg, type = 'info') {
    if (window.DashboardModule?.showToast) window.DashboardModule.showToast(msg, type);
  }

  function _formatDuration(seconds) {
    const s = Math.max(0, Math.round(Number(seconds) || 0));
    const m = Math.floor(s / 60);
    const r = s % 60;
    return `${m}:${String(r).padStart(2, '0')}`;
  }

  function _formatDate(iso) {
    const d = new Date(iso);
    return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
  }

  function _formatTime(iso) {
    const d = new Date(iso);
    return d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
  }

  function _statusStyle(callStatus) {
    return STATUS_STYLE[callStatus] || DEFAULT_STATUS_STYLE;
  }

  function _labelChip(label, color) {
    if (!label) return '';
    const c = color || (LABEL_PRESETS.find((p) => p.name === label)?.color) || 'rgba(255,255,255,0.4)';
    return `<span class="ac-label-chip" style="background:${c}22;border-color:${c}55;color:${c};">${_esc(label)}</span>`;
  }

  function _networkChip(networkType) {
    if (!networkType) return '';
    const icon = /wifi/i.test(networkType) ? '📶' : '📱';
    return `<span class="ac-network-chip">${icon} ${_esc(networkType)}</span>`;
  }

  const _AVATAR_PALETTE = ['#00A2E8', '#22C55E', '#A855F7', '#F59E0B', '#EF4444', '#C9A24B', '#0078D7'];

  function _initials(name) {
    const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
    if (!parts.length) return '?';
    return (parts[0][0] + (parts[1]?.[0] || '')).toUpperCase();
  }

  function _avatarColor(seed) {
    let h = 0;
    const s = String(seed || '');
    for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
    return _AVATAR_PALETTE[h % _AVATAR_PALETTE.length];
  }

  function _avatarHtml(name, photoUrl, size = 40) {
    if (photoUrl) {
      return `<img src="${_esc(photoUrl)}" alt="${_esc(name || 'Visitor')}" class="ac-avatar" style="width:${size}px;height:${size}px;" loading="lazy" />`;
    }
    const color = _avatarColor(name || 'Unknown');
    return `<div class="ac-avatar ac-avatar-fallback" style="width:${size}px;height:${size}px;font-size:${Math.round(size * 0.38)}px;background:${color}26;color:${color};">${_esc(_initials(name))}</div>`;
  }

  function _favStarHtml(profileId, isFavorite, size = 'sm') {
    if (!profileId) return '';
    return `<button type="button" class="ac-fav-star ${isFavorite ? 'ac-fav-star-active' : ''} ac-fav-star-${size}"
      aria-label="${isFavorite ? 'Remove from favorites' : 'Add to favorites'}"
      onclick="event.stopPropagation();ActivityCenter.toggleFavoriteFromRow('${profileId}', ${!isFavorite})">${isFavorite ? '★' : '☆'}</button>`;
  }

  function _visitBadgeHtml(visitCount) {
    const n = Number(visitCount) || 1;
    if (n <= 1) return `<span class="ac-mini-badge ac-mini-badge-new">🆕 New</span>`;
    if (n >= 5) return `<span class="ac-mini-badge ac-mini-badge-regular">🔁 Regular · ${n}×</span>`;
    return `<span class="ac-mini-badge ac-mini-badge-repeat">🔁 Repeat · ${n}×</span>`;
  }

  function _blockedBadgeHtml(blocked) {
    return blocked ? `<span class="ac-mini-badge ac-mini-badge-blocked">🚫 Blocked</span>` : '';
  }

  function _skeletonRows(count = 5) {
    return Array.from({ length: count }).map(() => `
      <div class="ac-row" style="cursor:default;">
        <div class="skeleton" style="width:40px;height:40px;border-radius:50%;flex-shrink:0;"></div>
        <div style="flex:1;min-width:0;">
          <div class="skeleton skeleton-text" style="width:55%;"></div>
          <div class="skeleton skeleton-text" style="width:75%;height:9px;"></div>
          <div class="skeleton skeleton-text" style="width:40%;height:9px;margin-bottom:0;"></div>
        </div>
      </div>
    `).join('');
  }

  // ────────── shell ──────────

  function _renderShell() {
    if (document.getElementById('activity-center-overlay')) return;
    const el = document.createElement('div');
    el.id = 'activity-center-overlay';
    el.style.cssText = 'display:none;position:fixed;inset:0;z-index:450;background:#081321;flex-direction:column;';
    el.innerHTML = `
      <div style="display:flex;align-items:center;gap:10px;padding:16px;border-bottom:1px solid rgba(255,255,255,0.08);flex-shrink:0;">
        <button onclick="ActivityCenter.close()" aria-label="Back" style="background:none;border:none;color:#fff;font-size:1.2rem;cursor:pointer;">←</button>
        <div style="font-family:'Space Grotesk',sans-serif;font-weight:700;font-size:0.95rem;color:#fff;flex:1;">Activity Center</div>
        <div class="ac-export-wrap">
          <button class="ac-export-btn" onclick="ActivityCenter.toggleExportMenu()" aria-label="Export">⇩ Export</button>
          <div id="ac-export-menu" class="ac-export-menu" style="display:none;">
            <div class="ac-export-menu-item" onclick="ActivityCenter.exportCSV()">📄 Export CSV</div>
            <div class="ac-export-menu-item" onclick="ActivityCenter.exportPDF()">🖨️ Export PDF</div>
          </div>
        </div>
      </div>

      <div style="flex:1;overflow-y:auto;padding:12px 16px 24px;">
        <div id="ac-stats-grid" class="ac-stat-grid"></div>

        <input type="text" id="ac-search" class="settings-input" placeholder="🔍 Search name, phone, or plate ID…" style="margin:12px 0 10px;" oninput="ActivityCenter.onSearchInput(this.value)" />

        <div class="os-eyebrow" style="margin:2px 0 6px;">Date</div>
        <div id="ac-date-chips" class="ac-chip-row"></div>

        <div class="os-eyebrow" style="margin:10px 0 6px;">Status</div>
        <div id="ac-status-chips" class="ac-chip-row"></div>

        <div class="os-eyebrow" style="margin:10px 0 6px;">Type</div>
        <div id="ac-label-chips" class="ac-chip-row"></div>

        <div id="ac-result-count" style="font-size:0.68rem;color:rgba(255,255,255,0.35);margin:12px 0 6px;"></div>
        <div id="ac-feed-list"></div>
        <div id="ac-load-more-wrap" style="text-align:center;margin-top:10px;"></div>
      </div>
    `;
    document.body.appendChild(el);

    _renderChips();
  }

  function _renderChips() {
    const dateChips = [
      ['all', 'All Time'], ['today', 'Today'], ['yesterday', 'Yesterday'],
      ['last7', 'Last 7 Days'], ['last30', 'Last 30 Days'],
    ];
    const statusChips = [
      ['all', 'All'], ['connected', 'Connected'], ['missed', 'Missed'],
      ['rejected', 'Rejected'], ['cancelled', 'Cancelled'],
    ];
    const dateEl = document.getElementById('ac-date-chips');
    const statusEl = document.getElementById('ac-status-chips');
    const labelEl = document.getElementById('ac-label-chips');
    if (dateEl) {
      dateEl.innerHTML = dateChips.map(([val, label]) => `
        <div class="op-chip ${dateRange === val ? 'op-chip-active' : ''}" data-date-range="${val}" onclick="ActivityCenter.setDateRange('${val}')">${label}</div>
      `).join('');
    }
    if (statusEl) {
      statusEl.innerHTML = statusChips.map(([val, label]) => `
        <div class="op-chip ${status === val ? 'op-chip-active' : ''}" data-status="${val}" onclick="ActivityCenter.setStatus('${val}')">${label}</div>
      `).join('');
    }
    if (labelEl) {
      labelEl.innerHTML = TYPE_FILTER_CHIPS.map(([val, label]) => `
        <div class="op-chip ${labelFilter === val ? 'op-chip-active' : ''}" data-label-filter="${val}" onclick="ActivityCenter.setLabelFilter('${val}')">${label}</div>
      `).join('');
    }
  }

  // ────────── open / close ──────────

  async function open() {
    const oid = _ownerId();
    if (!oid) {
      _toast('Still loading your dashboard — try again in a moment.', 'info');
      return;
    }
    _renderShell();
    document.getElementById('activity-center-overlay').style.display = 'flex';

    if (!unsubscribeRealtime) {
      unsubscribeRealtime = subscribeToActivityFeed(oid, () => {
        // A new visit landed — refresh stats + (if on page 1) the feed,
        // without yanking the owner away from whatever page they're on.
        _loadStats();
        if (page === 1) _loadFeed(false);
      });
    }

    await Promise.all([_loadStats(), _loadFeed(true)]);
  }

  function close() {
    const el = document.getElementById('activity-center-overlay');
    if (el) el.style.display = 'none';
    const menu = document.getElementById('ac-export-menu');
    if (menu) menu.style.display = 'none';
  }

  // ────────── stats ──────────

  async function _loadStats() {
    const oid = _ownerId();
    const grid = document.getElementById('ac-stats-grid');
    if (!grid) return;
    const stats = await getActivityStats(oid);
    grid.innerHTML = `
      <div class="op-mini-stat">
        <div class="op-mini-stat-label">👥 Today's Visitors</div>
        <div class="op-mini-stat-value">${stats.todayVisitors}</div>
      </div>
      <div class="op-mini-stat">
        <div class="op-mini-stat-label">✅ Connected Calls</div>
        <div class="op-mini-stat-value" style="color:#22C55E;">${stats.todayConnected}</div>
      </div>
      <div class="op-mini-stat">
        <div class="op-mini-stat-label">📵 Missed Calls</div>
        <div class="op-mini-stat-value" style="color:#EF4444;">${stats.todayMissed}</div>
      </div>
      <div class="op-mini-stat">
        <div class="op-mini-stat-label">⏱️ Avg. Duration</div>
        <div class="op-mini-stat-value">${_formatDuration(stats.avgDuration)}</div>
      </div>
    `;
  }

  // ────────── feed ──────────

  function onSearchInput(value) {
    clearTimeout(searchDebounceTimer);
    searchDebounceTimer = setTimeout(() => {
      search = (value || '').trim();
      _loadFeed(true);
    }, 350);
  }

  function setDateRange(range) {
    dateRange = range;
    _renderChips();
    _loadFeed(true);
  }

  function setStatus(val) {
    status = val;
    _renderChips();
    _loadFeed(true);
  }

  function setLabelFilter(val) {
    labelFilter = val;
    _renderChips();
    _loadFeed(true);
  }

  async function _loadFeed(reset) {
    if (reset) page = 1;
    const oid = _ownerId();
    if (!oid || loading) return;
    loading = true;

    const listEl = document.getElementById('ac-feed-list');
    if (reset && listEl) {
      listEl.innerHTML = _skeletonRows(5);
    }

    const res = await getActivityFeed({ ownerId: oid, search: search || null, dateRange, status, page, pageSize: PAGE_SIZE, label: labelFilter });
    loading = false;

    if (!res.success) {
      if (listEl) listEl.innerHTML = `<div style="text-align:center;padding:30px 12px;color:rgba(255,255,255,0.35);font-size:0.85rem;">Couldn't load activity right now. Pull to refresh in a moment.</div>`;
      return;
    }

    rows = reset ? res.rows : rows.concat(res.rows);
    totalCount = res.totalCount;
    _renderFeedList();
  }

  function _renderFeedList() {
    const listEl = document.getElementById('ac-feed-list');
    const countEl = document.getElementById('ac-result-count');
    const moreWrap = document.getElementById('ac-load-more-wrap');
    if (!listEl) return;

    if (countEl) countEl.textContent = totalCount ? `${totalCount} visit${totalCount === 1 ? '' : 's'} found` : '';

    if (!rows.length) {
      const hasFilters = !!search || dateRange !== 'all' || status !== 'all' || labelFilter !== 'all';
      listEl.innerHTML = `
        <div style="text-align:center;padding:44px 16px;color:rgba(255,255,255,0.3);">
          <div style="font-size:1.8rem;margin-bottom:8px;">${hasFilters ? '🔍' : '📭'}</div>
          <div style="font-size:0.85rem;color:rgba(255,255,255,0.4);">${hasFilters ? `No visits match these filters${search ? ` for "${_esc(search)}"` : ''}.` : 'No visitor activity yet.'}</div>
          ${hasFilters ? `<div style="font-size:0.72rem;margin-top:6px;color:rgba(255,255,255,0.25);">Try clearing a filter above.</div>` : `<div style="font-size:0.72rem;margin-top:6px;color:rgba(255,255,255,0.25);">Visits will appear here as soon as someone taps your Smart Door.</div>`}
        </div>`;
      if (moreWrap) moreWrap.innerHTML = '';
      return;
    }

    listEl.innerHTML = rows.map((r) => {
      const st = _statusStyle(r.call_status);
      const name = r.visitor_name || 'Unknown Visitor';
      const blocked = !!r.blocked;
      return `
        <div class="ac-row ${blocked ? 'ac-row-blocked' : ''}" onclick="ActivityCenter.openDrawer('${r.visitor_profile_id}')">
          ${_avatarHtml(name, r.photo_url, 40)}
          <div style="flex:1;min-width:0;">
            <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;">
              <span class="ac-row-name">${_esc(name)}</span>
              ${_favStarHtml(r.visitor_profile_id, r.is_favorite)}
              ${_labelChip(r.label, r.label_color)}
              ${_blockedBadgeHtml(blocked)}
            </div>
            <div class="ac-row-meta">
              ${r.phone ? `📞 ${_esc(r.phone)}` : ''}${r.plate_id ? ` · 🏷️ ${_esc(r.plate_id)}` : ''}
            </div>
            <div class="ac-row-meta" style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;">
              <span>${_formatDate(r.created_at)} · ${_formatTime(r.created_at)}${r.duration ? ` · ${_formatDuration(r.duration)}` : ''}</span>
              ${_visitBadgeHtml(r.visit_count)}
            </div>
          </div>
          <div style="display:flex;flex-direction:column;align-items:flex-end;gap:4px;flex-shrink:0;">
            <span class="ac-badge" style="background:${st.color}1c;border-color:${st.color}55;color:${st.color};">${st.icon} ${st.label}</span>
            ${_networkChip(r.network_type)}
          </div>
        </div>`;
    }).join('');

    if (moreWrap) {
      const hasMore = rows.length < totalCount;
      moreWrap.innerHTML = hasMore
        ? `<button class="ac-load-more-btn" onclick="ActivityCenter.loadMore()">${loading ? 'Loading…' : 'Load More'}</button>`
        : '';
    }
  }

  function loadMore() {
    if (rows.length >= totalCount || loading) return;
    page += 1;
    _loadFeed(false);
  }

  // ────────── drawer ──────────

  function _renderDrawerShell() {
    if (document.getElementById('ac-drawer-overlay')) return;
    const el = document.createElement('div');
    el.id = 'ac-drawer-overlay';
    el.className = 'ac-drawer-overlay';
    el.innerHTML = `
      <div class="ac-drawer-backdrop" onclick="ActivityCenter.closeDrawer()"></div>
      <div class="ac-drawer-panel">
        <div style="display:flex;align-items:center;gap:10px;padding:16px;border-bottom:1px solid rgba(255,255,255,0.08);flex-shrink:0;">
          <div style="font-family:'Space Grotesk',sans-serif;font-weight:700;font-size:0.95rem;color:#fff;flex:1;">Visitor Details</div>
          <button onclick="ActivityCenter.closeDrawer()" aria-label="Close" style="background:none;border:none;color:#fff;font-size:1.2rem;cursor:pointer;">✕</button>
        </div>
        <div id="ac-drawer-body" style="flex:1;overflow-y:auto;padding:16px;"></div>
      </div>
    `;
    document.body.appendChild(el);
  }

  async function openDrawer(visitorProfileId) {
    if (!visitorProfileId || visitorProfileId === 'null') return;
    const oid = _ownerId();
    drawerProfileId = visitorProfileId;
    _renderDrawerShell();
    const overlay = document.getElementById('ac-drawer-overlay');
    overlay.classList.add('ac-drawer-open');
    const body = document.getElementById('ac-drawer-body');
    body.innerHTML = `
      <div style="text-align:center;margin-bottom:14px;">
        <div class="skeleton" style="width:64px;height:64px;border-radius:50%;margin:0 auto 10px;"></div>
        <div class="skeleton skeleton-text" style="width:50%;margin:0 auto 6px;"></div>
        <div class="skeleton skeleton-text" style="width:35%;margin:0 auto;"></div>
      </div>
      <div class="skeleton skeleton-card" style="margin-bottom:14px;"></div>
      <div class="skeleton skeleton-card"></div>`;

    drawerData = await getVisitorProfileSummary(oid, visitorProfileId);
    _renderDrawerBody();
  }

  function closeDrawer() {
    const overlay = document.getElementById('ac-drawer-overlay');
    if (overlay) overlay.classList.remove('ac-drawer-open');
    drawerProfileId = null;
    drawerData = null;
  }

  function _renderDrawerBody() {
    const body = document.getElementById('ac-drawer-body');
    if (!body) return;

    if (!drawerData || !drawerData.found) {
      body.innerHTML = `<div style="text-align:center;padding:30px 12px;color:rgba(255,255,255,0.35);font-size:0.85rem;">Couldn't load this visitor's history.</div>`;
      return;
    }

    const d = drawerData;
    const currentLabel = d.label;
    const currentColor = d.label_color;

    const labelPickerHtml = LABEL_PRESETS.map((p) => `
      <div class="ac-label-option ${currentLabel === p.name ? 'ac-label-option-active' : ''}"
           style="background:${p.color}22;border-color:${p.color}55;color:${p.color};"
           onclick="ActivityCenter.setLabel('${p.name}','${p.color}')">${p.name}</div>
    `).join('');

    const timelineHtml = (d.visits || []).map((v) => {
      const st = _statusStyle(v.call_status);
      return `
        <div class="log-item">
          <span class="log-dot" style="background:${st.color};box-shadow:0 0 6px ${st.color}80;"></span>
          <div style="flex:1;min-width:0;">
            <div style="color:rgba(255,255,255,0.85);font-size:0.82rem;">${st.icon} ${st.label}${v.duration ? ` · ${_formatDuration(v.duration)}` : ''}</div>
            <div style="color:rgba(255,255,255,0.35);font-size:0.68rem;margin-top:2px;">${_formatDate(v.created_at)} · ${_formatTime(v.created_at)} · 🏷️ ${_esc(v.plate_id)}</div>
          </div>
        </div>`;
    }).join('') || `<div style="text-align:center;padding:20px 0;color:rgba(255,255,255,0.3);font-size:0.8rem;">No visits recorded yet.</div>`;

    const phoneDigits = String(d.phone || '').replace(/\D/g, '');
    const waHref = phoneDigits ? `https://wa.me/91${phoneDigits.slice(-10)}` : null;
    const telHref = phoneDigits ? `tel:${phoneDigits.slice(-10)}` : null;

    body.innerHTML = `
      <div style="text-align:center;margin-bottom:14px;">
        <div style="position:relative;display:inline-block;">
          ${_avatarHtml(d.name, d.photo_url, 72)}
          <button type="button" class="ac-avatar-edit-btn" title="Change photo" onclick="ActivityCenter.triggerPhotoUpload()">📷</button>
          <input type="file" id="ac-photo-input" accept="image/png,image/jpeg,image/webp" style="display:none;" onchange="ActivityCenter.onPhotoSelected(event)" />
        </div>
        <div style="display:flex;align-items:center;justify-content:center;gap:6px;margin-top:10px;">
          <div style="font-family:'Space Grotesk',sans-serif;font-weight:800;font-size:1.1rem;color:#fff;">${_esc(d.name || 'Unknown Visitor')}</div>
          ${_favStarHtml(d.id, !!d.is_favorite, 'lg')}
        </div>
        <div style="font-size:0.78rem;color:rgba(255,255,255,0.4);margin-top:2px;">📞 ${_esc(d.phone || '—')}</div>
        <div style="margin-top:8px;display:flex;align-items:center;justify-content:center;gap:6px;flex-wrap:wrap;">
          ${currentLabel ? _labelChip(currentLabel, currentColor) : ''}
          ${_visitBadgeHtml(d.visit_count)}
          ${_blockedBadgeHtml(!!d.blocked)}
        </div>

        <div class="ac-quick-actions">
          <button type="button" class="ac-quick-action-btn" ${telHref ? `onclick="window.location.href='${telHref}'"` : 'disabled'}>📞<span>Call</span></button>
          <button type="button" class="ac-quick-action-btn" ${waHref ? `onclick="window.open('${waHref}','_blank')"` : 'disabled'}>💬<span>WhatsApp</span></button>
          <button type="button" class="ac-quick-action-btn" ${phoneDigits ? `onclick="ActivityCenter.copyVisitorPhone('${phoneDigits.slice(-10)}')"` : 'disabled'}>📋<span>Copy</span></button>
          <button type="button" class="ac-quick-action-btn ${d.blocked ? 'ac-quick-action-danger-active' : 'ac-quick-action-danger'}" onclick="ActivityCenter.toggleBlockedDrawer(${!d.blocked})">${d.blocked ? '✅' : '🚫'}<span>${d.blocked ? 'Unblock' : 'Block'}</span></button>
        </div>
      </div>

      <div class="ac-stat-grid" style="grid-template-columns:1fr 1fr;margin-bottom:14px;">
        <div class="op-mini-stat"><div class="op-mini-stat-label">First Visit</div><div class="op-mini-stat-value" style="font-size:0.82rem;">${_formatDate(d.first_seen)}</div></div>
        <div class="op-mini-stat"><div class="op-mini-stat-label">Last Visit</div><div class="op-mini-stat-value" style="font-size:0.82rem;">${_formatDate(d.last_seen)}</div></div>
        <div class="op-mini-stat"><div class="op-mini-stat-label">Total Visits</div><div class="op-mini-stat-value">${d.visit_count || 0}</div></div>
        <div class="op-mini-stat"><div class="op-mini-stat-label">Connected Calls</div><div class="op-mini-stat-value" style="color:#22C55E;">${d.connected_count || 0}</div></div>
      </div>
      <div class="op-mini-stat" style="margin-bottom:14px;">
        <div class="op-mini-stat-label">⏱️ Average Call Duration</div>
        <div class="op-mini-stat-value">${_formatDuration(d.avg_duration)}</div>
      </div>

      <div class="os-eyebrow" style="margin-bottom:8px;">Label</div>
      <div class="ac-label-picker">
        ${labelPickerHtml}
        <div class="ac-label-option" onclick="ActivityCenter.promptCustomLabel()">✏️ Custom</div>
        ${currentLabel ? `<div class="ac-label-option" style="color:rgba(255,255,255,0.4);" onclick="ActivityCenter.clearLabel()">✕ Clear</div>` : ''}
      </div>

      <div class="os-eyebrow" style="margin:14px 0 8px;">Notes</div>
      <textarea id="ac-notes-input" class="settings-input" style="width:100%;min-height:70px;resize:vertical;font-family:inherit;" placeholder="e.g. Amazon delivery, Milkman, Electrician…">${_esc(d.notes || '')}</textarea>
      <button class="btn-primary" style="width:100%;margin-top:8px;padding:10px;font-size:0.82rem;" onclick="ActivityCenter.saveNotes()">Save Notes</button>

      <div class="os-eyebrow" style="margin:18px 0 8px;">Full Timeline</div>
      <div>${timelineHtml}</div>
    `;
  }

  // ────────── favorites / blocked / photo ──────────

  async function toggleFavoriteFromRow(profileId, nextFavorite) {
    const oid = _ownerId();
    if (!oid || !profileId) return;
    const row = rows.find((r) => String(r.visitor_profile_id) === String(profileId));
    if (row) row.is_favorite = nextFavorite; // optimistic
    _renderFeedList();
    const res = await toggleVisitorFavorite(oid, profileId, nextFavorite);
    if (!res.success) {
      if (row) row.is_favorite = !nextFavorite;
      _renderFeedList();
      _toast('Could not update favorite — try again.', 'danger');
    } else {
      _toast(nextFavorite ? 'Added to favorites' : 'Removed from favorites', 'success');
    }
  }

  async function toggleFavoriteDrawer(nextFavorite) {
    const oid = _ownerId();
    if (!oid || !drawerProfileId) return;
    const res = await toggleVisitorFavorite(oid, drawerProfileId, nextFavorite);
    if (res.success) {
      if (drawerData) drawerData.is_favorite = nextFavorite;
      _renderDrawerBody();
      const row = rows.find((r) => String(r.visitor_profile_id) === String(drawerProfileId));
      if (row) { row.is_favorite = nextFavorite; _renderFeedList(); }
    } else {
      _toast('Could not update favorite — try again.', 'danger');
    }
  }

  async function toggleBlockedDrawer(nextBlocked) {
    const oid = _ownerId();
    if (!oid || !drawerProfileId) return;
    if (nextBlocked && !confirm('Block this visitor? You can unblock them anytime from their profile.')) return;
    const res = await setVisitorBlocked(oid, drawerProfileId, nextBlocked);
    if (res.success) {
      if (drawerData) drawerData.blocked = nextBlocked;
      _renderDrawerBody();
      const row = rows.find((r) => String(r.visitor_profile_id) === String(drawerProfileId));
      if (row) { row.blocked = nextBlocked; _renderFeedList(); }
      _toast(nextBlocked ? 'Visitor blocked' : 'Visitor unblocked', nextBlocked ? 'warning' : 'success');
    } else {
      _toast('Could not update — try again.', 'danger');
    }
  }

  function copyVisitorPhone(phone) {
    if (!phone) return;
    const done = () => _toast('Phone number copied', 'success');
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(phone).then(done).catch(() => _toast('Could not copy number', 'danger'));
    } else {
      const ta = document.createElement('textarea');
      ta.value = phone;
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand('copy'); done(); } catch { _toast('Could not copy number', 'danger'); }
      ta.remove();
    }
  }

  function triggerPhotoUpload() {
    document.getElementById('ac-photo-input')?.click();
  }

  async function onPhotoSelected(event) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    const oid = _ownerId();
    if (!oid || !drawerProfileId) return;
    if (file.size > 5 * 1024 * 1024) { _toast('Photo must be under 5 MB', 'danger'); return; }
    _toast('Uploading photo…', 'info');
    const res = await uploadVisitorPhoto({ ownerId: oid, visitorProfileId: drawerProfileId, file });
    if (res.success) {
      if (drawerData) drawerData.photo_url = res.photoUrl;
      _renderDrawerBody();
      const row = rows.find((r) => String(r.visitor_profile_id) === String(drawerProfileId));
      if (row) { row.photo_url = res.photoUrl; _renderFeedList(); }
      _toast('Photo updated', 'success');
    } else {
      _toast('Could not upload photo — try again.', 'danger');
    }
  }

  async function saveNotes() {
    const oid = _ownerId();
    const input = document.getElementById('ac-notes-input');
    if (!oid || !drawerProfileId || !input) return;
    const res = await saveVisitorNoteAndLabel({ ownerId: oid, visitorProfileId: drawerProfileId, notes: input.value });
    if (res.success) {
      _toast('Note saved', 'success');
      if (drawerData) drawerData.notes = input.value;
    } else {
      _toast('Could not save note — try again.', 'danger');
    }
  }

  async function setLabel(label, color) {
    const oid = _ownerId();
    if (!oid || !drawerProfileId) return;
    const res = await saveVisitorNoteAndLabel({ ownerId: oid, visitorProfileId: drawerProfileId, label, labelColor: color });
    if (res.success) {
      if (drawerData) { drawerData.label = label; drawerData.label_color = color; }
      _renderDrawerBody();
      _loadFeed(true);
      _toast(`Labeled as ${label}`, 'success');
    } else {
      _toast('Could not save label — try again.', 'danger');
    }
  }

  function promptCustomLabel() {
    const custom = window.prompt('Custom label (e.g. "Neighbor", "Plumber"):');
    if (!custom || !custom.trim()) return;
    setLabel(custom.trim().slice(0, 30), '#00A2E8');
  }

  async function clearLabel() {
    const oid = _ownerId();
    if (!oid || !drawerProfileId) return;
    const res = await saveVisitorNoteAndLabel({ ownerId: oid, visitorProfileId: drawerProfileId, clearLabel: true });
    if (res.success) {
      if (drawerData) { drawerData.label = null; drawerData.label_color = null; }
      _renderDrawerBody();
      _loadFeed(true);
    }
  }

  // ────────── export ──────────

  function toggleExportMenu() {
    const menu = document.getElementById('ac-export-menu');
    if (menu) menu.style.display = menu.style.display === 'none' ? 'block' : 'none';
  }

  async function _fetchAllForExport() {
    const oid = _ownerId();
    const res = await getActivityFeed({ ownerId: oid, search: search || null, dateRange, status, page: 1, pageSize: 5000 });
    return res.success ? res.rows : [];
  }

  function _csvEscape(val) {
    const s = String(val ?? '');
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  }

  async function exportCSV() {
    toggleExportMenu();
    _toast('Preparing CSV export…', 'info');
    const data = await _fetchAllForExport();
    if (!data.length) { _toast('No visits match the current filters.', 'info'); return; }

    const headers = ['Date', 'Time', 'Visitor Name', 'Phone', 'Plate ID', 'Status', 'Duration (s)', 'Network', 'Label'];
    const lines = [headers.join(',')];
    data.forEach((r) => {
      lines.push([
        _formatDate(r.created_at), _formatTime(r.created_at),
        _csvEscape(r.visitor_name || 'Unknown'), _csvEscape(r.phone || ''),
        _csvEscape(r.plate_id || ''), _statusStyle(r.call_status).label,
        r.duration || 0, _csvEscape(r.network_type || ''), _csvEscape(r.label || ''),
      ].join(','));
    });

    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `smartdoor-activity-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    _toast('CSV export ready', 'success');
  }

  async function exportPDF() {
    toggleExportMenu();
    _toast('Preparing PDF export…', 'info');
    const data = await _fetchAllForExport();
    if (!data.length) { _toast('No visits match the current filters.', 'info'); return; }

    const rowsHtml = data.map((r) => `
      <tr>
        <td>${_esc(_formatDate(r.created_at))} ${_esc(_formatTime(r.created_at))}</td>
        <td>${_esc(r.visitor_name || 'Unknown')}</td>
        <td>${_esc(r.phone || '')}</td>
        <td>${_esc(r.plate_id || '')}</td>
        <td>${_esc(_statusStyle(r.call_status).label)}</td>
        <td>${r.duration ? _formatDuration(r.duration) : '—'}</td>
        <td>${_esc(r.label || '')}</td>
      </tr>`).join('');

    const html = `
      <html><head><title>SmartDoor Activity Export</title>
      <style>
        body{font-family:Arial,sans-serif;padding:24px;color:#111;}
        h1{font-size:18px;margin-bottom:2px;}
        p{color:#555;font-size:12px;margin-top:0;}
        table{width:100%;border-collapse:collapse;margin-top:16px;}
        th,td{border:1px solid #ddd;padding:6px 8px;font-size:11px;text-align:left;}
        th{background:#f3f3f3;}
      </style></head>
      <body>
        <h1>SmartDoor — Visitor Activity Report</h1>
        <p>Generated ${new Date().toLocaleString('en-IN')} · ${data.length} record(s)</p>
        <table><thead><tr><th>Date/Time</th><th>Visitor</th><th>Phone</th><th>Plate ID</th><th>Status</th><th>Duration</th><th>Label</th></tr></thead>
        <tbody>${rowsHtml}</tbody></table>
        <script>window.onload = () => window.print();<\/script>
      </body></html>`;

    const win = window.open('', '_blank');
    if (!win) { _toast('Please allow pop-ups to export a PDF.', 'warning'); return; }
    win.document.write(html);
    win.document.close();
  }

  // ────────── Visitor Insights (dashboard card) ──────────

  function _insightsSkeleton() {
    return `
      <div style="display:flex;gap:8px;margin-bottom:12px;">
        <div class="skeleton" style="flex:1;height:52px;border-radius:10px;"></div>
        <div class="skeleton" style="flex:1;height:52px;border-radius:10px;"></div>
        <div class="skeleton" style="flex:1;height:52px;border-radius:10px;"></div>
      </div>
      <div class="skeleton skeleton-text" style="width:40%;"></div>
      <div class="skeleton" style="height:60px;border-radius:8px;margin-bottom:10px;"></div>
      <div class="skeleton skeleton-text" style="width:50%;"></div>
      <div class="skeleton skeleton-card" style="height:52px;margin-bottom:6px;"></div>
      <div class="skeleton skeleton-card" style="height:52px;"></div>`;
  }

  function _peakHoursHtml(hourly) {
    const max = Math.max(...hourly, 1);
    // Collapse 24 hourly buckets into 12 two-hour bars for a compact, legible chart.
    const bars = [];
    for (let i = 0; i < 24; i += 2) bars.push((hourly[i] || 0) + (hourly[i + 1] || 0));
    const barMax = Math.max(...bars, 1);
    const peakIdx = bars.indexOf(Math.max(...bars));
    const peakLabel = bars[peakIdx] > 0 ? `${peakIdx * 2}:00–${peakIdx * 2 + 2}:00` : null;
    return `
      <div style="display:flex;align-items:flex-end;gap:3px;height:56px;margin-bottom:6px;">
        ${bars.map((v, i) => {
          const h = Math.max(4, (v / barMax) * 100);
          const isPeak = i === peakIdx && v > 0;
          return `<div class="tooltip" style="flex:1;height:100%;display:flex;align-items:flex-end;">
            <div style="width:100%;height:${h}%;min-height:4px;border-radius:3px 3px 1px 1px;
              background:${isPeak ? 'linear-gradient(180deg,#00D4FF,#0078D7)' : 'rgba(0,162,232,0.22)'};"></div>
            <span class="tooltip-text">${i * 2}:00 · ${v} visits</span>
          </div>`;
        }).join('')}
      </div>
      <div style="font-size:0.68rem;color:rgba(255,255,255,0.4);">${peakLabel ? `⏰ Peak hours: <strong style="color:#fff;">${peakLabel}</strong>` : 'Not enough activity yet to spot a peak.'}</div>`;
  }

  function _topVisitorsHtml(topVisitors) {
    if (!topVisitors.length) {
      return `<div style="text-align:center;padding:14px 0;color:rgba(255,255,255,0.3);font-size:0.78rem;">No repeat visitors yet — they'll show up here once someone visits twice.</div>`;
    }
    return topVisitors.map((v) => `
      <div class="ac-row" style="padding:8px 6px;" onclick="ActivityCenter.open();setTimeout(()=>ActivityCenter.openDrawer('${v.visitor_profile_id}'),150);">
        ${_avatarHtml(v.name, v.photo_url, 32)}
        <div style="flex:1;min-width:0;">
          <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;">
            <span class="ac-row-name" style="font-size:0.8rem;">${_esc(v.name)}</span>
            ${v.is_favorite ? '<span style="color:#F5C518;font-size:0.75rem;">★</span>' : ''}
            ${_labelChip(v.label, v.label_color)}
          </div>
          <div class="ac-row-meta">${v.phone ? `📞 ${_esc(v.phone)}` : ''}</div>
        </div>
        <span class="ac-mini-badge ac-mini-badge-repeat" style="flex-shrink:0;">${v.visit_count}× visits</span>
      </div>`).join('');
  }

  async function _renderInsightsInto(oid) {
    const els = document.querySelectorAll('#visitor-insights-card');
    if (!els.length) return;
    els.forEach((el) => { if (!el.dataset.acLoaded) el.innerHTML = _insightsSkeleton(); });

    const data = await getVisitorInsights(oid);
    const html = `
      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-bottom:14px;">
        <div class="op-mini-stat"><div class="op-mini-stat-label">👥 Unique Visitors</div><div class="op-mini-stat-value">${data.totalUnique}</div></div>
        <div class="op-mini-stat"><div class="op-mini-stat-label">🔁 Repeat Rate</div><div class="op-mini-stat-value" style="color:#22C55E;">${data.repeatPct}%</div></div>
        <div class="op-mini-stat"><div class="op-mini-stat-label">🆕 New (7d)</div><div class="op-mini-stat-value" style="color:#00A2E8;">${data.newThisWeek}</div></div>
      </div>
      <div class="os-eyebrow" style="margin-bottom:6px;">Peak Visitor Hours <span style="font-weight:400;color:rgba(255,255,255,0.3);">· Last 30 days</span></div>
      ${_peakHoursHtml(data.hourlyHistogram)}
      <div class="os-eyebrow" style="margin:14px 0 6px;">Most Frequent Visitors</div>
      ${_topVisitorsHtml(data.topVisitors)}
    `;
    els.forEach((el) => { el.innerHTML = html; el.dataset.acLoaded = '1'; });
  }

  function renderDashboardInsights() {
    const oid = _ownerId();
    if (!oid) return;
    _renderInsightsInto(oid);
    if (!insightsRealtimeUnsub) {
      insightsRealtimeUnsub = subscribeToActivityFeed(oid, () => _renderInsightsInto(oid));
    }
  }

  function _pollForInsightsInit() {
    const els = document.querySelectorAll('#visitor-insights-card');
    if (!els.length) return; // no such card on this page — nothing to do
    const oid = _ownerId();
    if (oid) { renderDashboardInsights(); return; }
    insightsInitTries += 1;
    if (insightsInitTries > 40) return; // ~20s of polling, then give up quietly
    setTimeout(_pollForInsightsInit, 500);
  }

  // ────────── init ──────────

  function init() {
    document.addEventListener('click', (e) => {
      const menu = document.getElementById('ac-export-menu');
      const wrap = e.target.closest?.('.ac-export-wrap');
      if (menu && !wrap) menu.style.display = 'none';
    });
    _pollForInsightsInit();
  }

  document.addEventListener('DOMContentLoaded', init);

  return {
    open, close,
    onSearchInput, setDateRange, setStatus, setLabelFilter, loadMore,
    openDrawer, closeDrawer, saveNotes, setLabel, promptCustomLabel, clearLabel,
    toggleExportMenu, exportCSV, exportPDF,
    toggleFavoriteFromRow, toggleFavoriteDrawer, toggleBlockedDrawer, copyVisitorPhone,
    triggerPhotoUpload, onPhotoSelected,
    renderDashboardInsights,
  };
})();

window.ActivityCenter = ActivityCenter;
