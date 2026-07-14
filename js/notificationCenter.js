/**
 * Smart Door — Production Notification Center
 * js/notificationCenter.js
 *
 * ADDITIVE ONLY. Does not modify WebRTC, dashboard.js, or any existing
 * service. Reuses:
 *   - services/notifications.js  → all reads/writes/pagination/prefs
 *   - services/push.js           → subscribeOwnerToPush/unsubscribeOwnerFromPush
 *                                   for the "push notifications" preference toggle
 *   - window.DashboardModule.getState()/.showToast() → owner context + toasts,
 *     same read-only accessor pattern already used by js/ownerPremium.js
 *
 * Renders one full-height drawer (slides in from the right on desktop,
 * full-screen sheet on mobile) into a container this file creates itself
 * at runtime (#nc-drawer-overlay) — this id does not exist anywhere else,
 * so nothing here can collide with existing markup. Wired to the existing
 * header bell buttons (#sd-bell-btn-m / #sd-bell-btn-d in app.html) which
 * previously opened a small SDHeader dropdown; app.html now points them at
 * NotificationCenter.toggle() instead.
 */

import {
  NOTIFICATION_CATEGORIES,
  getNotifications,
  getUnreadCountsByCategory,
  markNotificationRead,
  markAllNotificationsRead,
  deleteNotification,
  subscribeToNotificationCenter,
  getNotificationPreferences,
  saveNotificationPreferences,
  isWithinQuietHours,
  isCategoryEnabled,
} from '../services/notifications.js';
import { unsubscribeOwnerFromPush } from '../services/push.js';

const PAGE_SIZE = 20;

const NotificationCenter = (() => {
  let ownerId = null;
  let activeCategory = 'all';
  let view = 'list'; // 'list' | 'preferences'
  let items = [];
  let offset = 0;
  let hasMore = false;
  let loading = false;
  let unreadCounts = {};
  let totalUnread = 0;
  let preferences = null;
  let unsubscribeRealtime = null;
  let audioCtx = null;
  let isOpen = false;

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

  function _toast(msg, kind = 'info') {
    window.DashboardModule?.showToast?.(msg, kind);
  }

  function _timeAgo(iso) {
    const d = new Date(iso);
    const diffMs = Date.now() - d.getTime();
    const mins = Math.floor(diffMs / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    const days = Math.floor(hrs / 24);
    if (days < 7) return `${days}d ago`;
    return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
  }

  // ────────── sound (self-contained WebAudio chime — no shared state with dashboard.js) ──────────
  async function _getAudioCtx() {
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === 'suspended') {
      try { await audioCtx.resume(); } catch (_) {}
    }
    return audioCtx;
  }

  async function _playChime() {
    try {
      const ctx = await _getAudioCtx();
      const now = ctx.currentTime;
      [[880, 0], [1108, 0.09]].forEach(([freq, offsetT]) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, now + offsetT);
        gain.gain.setValueAtTime(0, now + offsetT);
        gain.gain.linearRampToValueAtTime(0.3, now + offsetT + 0.01);
        gain.gain.exponentialRampToValueAtTime(0.001, now + offsetT + 0.3);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now + offsetT);
        osc.stop(now + offsetT + 0.3);
      });
    } catch (_) { /* no-op — audio not available/allowed yet */ }
  }

  // ────────── badge (bell icon unread count) ──────────
  function _renderBadges() {
    ['nc-bell-badge-m', 'nc-bell-badge-d'].forEach((id) => {
      const el = document.getElementById(id);
      if (!el) return;
      if (totalUnread > 0) {
        el.textContent = totalUnread > 99 ? '99+' : String(totalUnread);
        el.style.display = 'flex';
      } else {
        el.style.display = 'none';
      }
    });
  }

  async function _refreshUnreadCounts() {
    const oid = _ownerId();
    if (!oid) return;
    const res = await getUnreadCountsByCategory(oid);
    if (res.success) {
      unreadCounts = res.counts;
      totalUnread = res.total;
      _renderBadges();
      if (isOpen && view === 'list') _renderTabs();
    }
  }

  // ────────── shell ──────────
  function _ensureShell() {
    if (document.getElementById('nc-drawer-overlay')) return;
    const el = document.createElement('div');
    el.id = 'nc-drawer-overlay';
    el.className = 'nc-overlay';
    el.innerHTML = `
      <div class="nc-scrim" id="nc-scrim"></div>
      <div class="nc-drawer" role="dialog" aria-label="Notifications">
        <div class="nc-drawer-header">
          <div class="nc-drawer-title">Notifications</div>
          <div style="display:flex;align-items:center;gap:6px;">
            <button class="nc-icon-btn" id="nc-prefs-btn" aria-label="Notification preferences" title="Preferences">⚙️</button>
            <button class="nc-icon-btn" id="nc-close-btn" aria-label="Close">✕</button>
          </div>
        </div>
        <div id="nc-drawer-body" class="nc-drawer-body"></div>
      </div>`;
    document.body.appendChild(el);

    document.getElementById('nc-scrim').addEventListener('click', close);
    document.getElementById('nc-close-btn').addEventListener('click', close);
    document.getElementById('nc-prefs-btn').addEventListener('click', openPreferences);
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && isOpen) close(); });
  }

  // ────────── list view ──────────
  function _renderTabs() {
    const body = document.getElementById('nc-drawer-body');
    const tabsEl = body?.querySelector('#nc-tabs');
    if (!tabsEl) return;
    tabsEl.innerHTML = _tabsHtml();
  }

  function _tabsHtml() {
    const allChip = `
      <div class="nc-chip ${activeCategory === 'all' ? 'nc-chip-active' : ''}" data-cat="all">
        All${totalUnread > 0 ? ` <span class="nc-chip-count">${totalUnread}</span>` : ''}
      </div>`;
    const cats = NOTIFICATION_CATEGORIES.map((c) => {
      const n = unreadCounts[c.id] || 0;
      return `
        <div class="nc-chip ${activeCategory === c.id ? 'nc-chip-active' : ''}" data-cat="${c.id}">
          ${c.icon} ${_esc(c.label)}${n > 0 ? ` <span class="nc-chip-count">${n}</span>` : ''}
        </div>`;
    }).join('');
    return allChip + cats;
  }

  function _renderListShell() {
    const body = document.getElementById('nc-drawer-body');
    body.innerHTML = `
      <div class="nc-tabs-row"><div id="nc-tabs" class="nc-tabs">${_tabsHtml()}</div></div>
      <div class="nc-actions-row">
        <button class="nc-link-btn" id="nc-mark-all-btn">✓ Mark all read</button>
      </div>
      <div id="nc-list" class="nc-list"></div>
      <div id="nc-list-footer" class="nc-list-footer"></div>
    `;
    body.querySelectorAll('.nc-chip').forEach((chip) => {
      chip.addEventListener('click', () => setCategory(chip.dataset.cat));
    });
    document.getElementById('nc-mark-all-btn').addEventListener('click', markAllRead);
  }

  function _rowHtml(n) {
    const unread = !n.is_read;
    const cat = NOTIFICATION_CATEGORIES.find((c) => c.id === n.category);
    const icon = cat?.icon || '🔔';
    return `
      <div class="nc-row ${unread ? 'nc-row-unread' : ''}" data-id="${n.id}">
        <div class="nc-row-icon">${icon}</div>
        <div class="nc-row-main" data-action="read">
          <div class="nc-row-title">${_esc(n.title || 'Notification')}</div>
          ${n.body ? `<div class="nc-row-body">${_esc(n.body)}</div>` : ''}
          <div class="nc-row-meta">${_timeAgo(n.created_at)}${cat ? ` · ${_esc(cat.label)}` : ''}</div>
        </div>
        <button class="nc-row-delete" data-action="delete" aria-label="Delete notification">🗑️</button>
      </div>`;
  }

  function _renderList(append = false) {
    const listEl = document.getElementById('nc-list');
    const footerEl = document.getElementById('nc-list-footer');
    if (!listEl) return;

    if (!items.length) {
      listEl.innerHTML = `<div class="nc-empty">🎉 No notifications here — you're all caught up.</div>`;
      if (footerEl) footerEl.innerHTML = '';
      return;
    }

    const html = items.map(_rowHtml).join('');
    listEl.innerHTML = html;

    listEl.querySelectorAll('.nc-row').forEach((rowEl) => {
      const id = rowEl.dataset.id;
      rowEl.querySelector('[data-action="read"]').addEventListener('click', () => _onRowTap(id));
      rowEl.querySelector('[data-action="delete"]').addEventListener('click', (e) => {
        e.stopPropagation();
        _onDelete(id);
      });
    });

    if (footerEl) {
      footerEl.innerHTML = hasMore
        ? `<button class="nc-load-more-btn" id="nc-load-more">${loading ? 'Loading…' : 'Load more'}</button>`
        : '';
      const btn = document.getElementById('nc-load-more');
      if (btn) btn.addEventListener('click', loadMore);
    }
  }

  async function _onRowTap(id) {
    const n = items.find((x) => x.id === id);
    if (!n || n.is_read) return;
    const oid = _ownerId();
    const res = await markNotificationRead(id, oid);
    if (res.success) {
      n.is_read = true;
      _renderList();
      await _refreshUnreadCounts();
    }
  }

  async function _onDelete(id) {
    const oid = _ownerId();
    const res = await deleteNotification(id, oid);
    if (res.success) {
      items = items.filter((x) => x.id !== id);
      _renderList();
      await _refreshUnreadCounts();
    } else {
      _toast('Could not delete notification — try again.', 'danger');
    }
  }

  async function markAllRead() {
    const oid = _ownerId();
    if (!oid) return;
    const res = await markAllNotificationsRead(oid, activeCategory);
    if (res.success) {
      items = items.map((n) => ({ ...n, is_read: true }));
      _renderList();
      await _refreshUnreadCounts();
      _toast('All caught up 👍', 'success');
    }
  }

  async function setCategory(cat) {
    if (cat === activeCategory) return;
    activeCategory = cat;
    offset = 0;
    items = [];
    _renderListShell();
    await _loadPage();
  }

  async function _loadPage(append = false) {
    const oid = _ownerId();
    if (!oid) return;
    loading = true;
    if (!append) {
      const listEl = document.getElementById('nc-list');
      if (listEl) listEl.innerHTML = `<div class="nc-loading">Loading…</div>`;
    }
    const res = await getNotifications(oid, { limit: PAGE_SIZE, offset, category: activeCategory });
    loading = false;
    if (!res.success) {
      const listEl = document.getElementById('nc-list');
      if (listEl) listEl.innerHTML = `<div class="nc-empty">Couldn't load notifications. Pull down to retry.</div>`;
      return;
    }
    items = append ? items.concat(res.notifications) : res.notifications;
    hasMore = res.hasMore;
    _renderList(append);
  }

  async function loadMore() {
    if (loading || !hasMore) return;
    offset += PAGE_SIZE;
    await _loadPage(true);
  }

  // ────────── preferences view ──────────
  function _prefRowHtml(cat) {
    const p = preferences.category_prefs?.[cat.id] || { in_app: true, push: true };
    return `
      <div class="nc-pref-row" data-cat="${cat.id}">
        <div class="nc-pref-row-label">${cat.icon} ${_esc(cat.label)}</div>
        <label class="toggle-switch nc-mini-toggle">
          <input type="checkbox" class="nc-cat-toggle" data-cat="${cat.id}" ${p.in_app !== false ? 'checked' : ''} />
          <div class="toggle-track"></div>
          <div class="toggle-thumb"></div>
        </label>
      </div>`;
  }

  function _renderPreferences() {
    const body = document.getElementById('nc-drawer-body');
    const p = preferences;
    body.innerHTML = `
      <div class="nc-prefs-back-row">
        <button class="nc-link-btn" id="nc-back-to-list">← Back to notifications</button>
      </div>

      <div class="nc-pref-section">
        <div class="nc-pref-section-title">Sound</div>
        <div class="nc-pref-row">
          <div class="nc-pref-row-label">🔊 Play a sound for new alerts</div>
          <label class="toggle-switch nc-mini-toggle">
            <input type="checkbox" id="nc-sound-toggle" ${p.sound_enabled ? 'checked' : ''} />
            <div class="toggle-track"></div>
            <div class="toggle-thumb"></div>
          </label>
        </div>
      </div>

      <div class="nc-pref-section">
        <div class="nc-pref-section-title">Quiet Hours</div>
        <div class="nc-pref-row">
          <div class="nc-pref-row-label">🌙 Mute sound during quiet hours</div>
          <label class="toggle-switch nc-mini-toggle">
            <input type="checkbox" id="nc-quiet-toggle" ${p.quiet_hours_enabled ? 'checked' : ''} />
            <div class="toggle-track"></div>
            <div class="toggle-thumb"></div>
          </label>
        </div>
        <div class="nc-quiet-times" id="nc-quiet-times" style="${p.quiet_hours_enabled ? '' : 'display:none;'}">
          <div class="nc-quiet-time-field">
            <label>From</label>
            <input type="time" id="nc-quiet-start" class="settings-input" value="${_esc(p.quiet_hours_start || '22:00')}" />
          </div>
          <div class="nc-quiet-time-field">
            <label>To</label>
            <input type="time" id="nc-quiet-end" class="settings-input" value="${_esc(p.quiet_hours_end || '07:00')}" />
          </div>
        </div>
        <div class="nc-pref-hint">Subscription reminder push notifications are also held back during quiet hours. Visitor alerts (bell, calls, SOS) always come through.</div>
      </div>

      <div class="nc-pref-section">
        <div class="nc-pref-section-title">Push Notifications</div>
        <div class="nc-pref-row">
          <div class="nc-pref-row-label">📲 Background push (${_pushStateLabel()})</div>
          <button class="nc-link-btn" id="nc-push-toggle-btn">${Notification?.permission === 'granted' ? 'Turn off' : 'Turn on'}</button>
        </div>
      </div>

      <div class="nc-pref-section">
        <div class="nc-pref-section-title">Categories shown in-app</div>
        ${NOTIFICATION_CATEGORIES.map(_prefRowHtml).join('')}
      </div>

      <button class="btn-primary nc-save-btn" id="nc-save-prefs-btn" style="width:100%;justify-content:center;">Save Preferences</button>
    `;

    document.getElementById('nc-back-to-list').addEventListener('click', openList);
    document.getElementById('nc-quiet-toggle').addEventListener('change', (e) => {
      document.getElementById('nc-quiet-times').style.display = e.target.checked ? '' : 'none';
    });
    document.getElementById('nc-push-toggle-btn').addEventListener('click', _togglePush);
    document.getElementById('nc-save-prefs-btn').addEventListener('click', _savePreferences);
  }

  function _pushStateLabel() {
    if (typeof Notification === 'undefined') return 'unsupported';
    if (Notification.permission === 'granted') return 'on';
    if (Notification.permission === 'denied') return 'blocked in browser settings';
    return 'off';
  }

  async function _togglePush() {
    const oid = _ownerId();
    if (typeof Notification === 'undefined') return;
    if (Notification.permission === 'granted') {
      if (oid) await unsubscribeOwnerFromPush(oid).catch(() => {});
      _toast('Push notifications turned off on this device.', 'info');
    } else if (Notification.permission === 'default') {
      // Reuse the existing tap-driven enable flow wired in dashboard.js
      // (iOS Safari requires requestPermission() from a real user gesture).
      const yesBtn = document.querySelector('#sd-enable-push-yes');
      if (yesBtn) { yesBtn.click(); }
      else { try { await Notification.requestPermission(); } catch (_) {} }
    } else {
      _toast('Notifications are blocked — enable them from your browser site settings.', 'info');
    }
    _renderPreferences();
  }

  async function _savePreferences() {
    const oid = _ownerId();
    if (!oid) return;

    const categoryPrefs = { ...preferences.category_prefs };
    document.querySelectorAll('.nc-cat-toggle').forEach((input) => {
      const cat = input.dataset.cat;
      categoryPrefs[cat] = { ...(categoryPrefs[cat] || {}), in_app: input.checked, push: input.checked };
    });

    const updates = {
      sound_enabled: document.getElementById('nc-sound-toggle').checked,
      quiet_hours_enabled: document.getElementById('nc-quiet-toggle').checked,
      quiet_hours_start: document.getElementById('nc-quiet-start').value || '22:00',
      quiet_hours_end: document.getElementById('nc-quiet-end').value || '07:00',
      category_prefs: categoryPrefs,
    };

    const res = await saveNotificationPreferences(oid, updates);
    if (res.success) {
      preferences = { ...preferences, ...updates };
      _toast('Notification preferences saved ✅', 'success');
    } else {
      _toast('Could not save preferences — try again.', 'danger');
    }
  }

  async function openPreferences() {
    view = 'preferences';
    const oid = _ownerId();
    if (oid && !preferences) {
      const res = await getNotificationPreferences(oid);
      preferences = res.success ? res.preferences : null;
    }
    if (!preferences) preferences = { sound_enabled: true, quiet_hours_enabled: false, quiet_hours_start: '22:00', quiet_hours_end: '07:00', category_prefs: {} };
    _renderPreferences();
  }

  async function openList() {
    view = 'list';
    _renderListShell();
    await _loadPage();
    await _refreshUnreadCounts();
  }

  // ────────── realtime ──────────
  function _wireRealtime() {
    const oid = _ownerId();
    if (!oid || unsubscribeRealtime) return;
    unsubscribeRealtime = subscribeToNotificationCenter(oid, {
      onInsert: async (row) => {
        totalUnread += row.is_read ? 0 : 1;
        unreadCounts[row.category] = (unreadCounts[row.category] || 0) + (row.is_read ? 0 : 1);
        _renderBadges();
        if (isOpen && view === 'list' && (activeCategory === 'all' || activeCategory === row.category)) {
          items = [row, ...items];
          _renderList();
        }
        if (isOpen && view === 'list') _renderTabs();

        if (!preferences) {
          const res = await getNotificationPreferences(oid);
          preferences = res.success ? res.preferences : null;
        }
        const enabled = isCategoryEnabled(preferences, row.category, 'in_app');
        const quiet = isWithinQuietHours(preferences);
        if (enabled && preferences?.sound_enabled && !quiet) {
          _playChime();
        }
        if (enabled) {
          _toast(`${row.title}${row.body ? ' — ' + row.body : ''}`, row.priority === 'high' || row.priority === 'critical' ? 'warning' : 'info');
        }
      },
      onUpdate: (row) => {
        const idx = items.findIndex((n) => n.id === row.id);
        if (idx >= 0) { items[idx] = row; if (isOpen && view === 'list') _renderList(); }
        _refreshUnreadCounts();
      },
      onDelete: (row) => {
        items = items.filter((n) => n.id !== row.id);
        if (isOpen && view === 'list') _renderList();
        _refreshUnreadCounts();
      },
    });
  }

  // ────────── open / close / toggle ──────────
  async function open() {
    const oid = _ownerId();
    if (!oid) { _toast('Still loading your dashboard — try again in a moment.', 'info'); return; }
    _ensureShell();
    document.getElementById('nc-drawer-overlay').classList.add('nc-open');
    isOpen = true;
    view = 'list';
    _renderListShell();
    await Promise.all([_loadPage(), _refreshUnreadCounts()]);
    _wireRealtime();
  }

  function close() {
    const el = document.getElementById('nc-drawer-overlay');
    if (el) el.classList.remove('nc-open');
    isOpen = false;
  }

  function toggle() {
    if (isOpen) close();
    else open();
  }

  // ────────── init (badge on load, without opening the drawer) ──────────
  function init() {
    const poll = setInterval(() => {
      if (_ownerId()) {
        clearInterval(poll);
        _refreshUnreadCounts();
        _wireRealtime();
      }
    }, 800);
    // Give up politely after ~30s if the owner never resolves (e.g. logged out).
    setTimeout(() => clearInterval(poll), 30000);
  }

  document.addEventListener('DOMContentLoaded', init);
  if (document.readyState !== 'loading') init();

  return { open, close, toggle, openPreferences, openList, markAllRead, setCategory, loadMore };
})();

window.NotificationCenter = NotificationCenter;
export default NotificationCenter;
