/**
 * My Smart Door — Premium Owner Experience
 * js/ownerPremium.js
 *
 * ADDITIVE ONLY.
 * ────────────────────────────────────────────────────────────────────────
 * This file does NOT modify dashboard.js, services/*, auth, RBAC, push,
 * QR, or visitor flows. It only:
 *   1. Reads owner context via window.DashboardModule.getState() — a
 *      read-only accessor dashboard.js already publicly exposes.
 *   2. Calls existing, already-shipped, already-tested service functions
 *      that had zero callers in production before this file:
 *        - services/logs.js          → getLogs(), formatLogForDisplay()
 *        - services/notifications.js → getNotifications(), markNotificationRead()
 *   3. Renders into new DOM containers that were added to app.html
 *      alongside this file (#smart-analytics-card) or that it creates
 *      itself at runtime (#op-timeline-overlay, #op-notif-overlay,
 *      #op-share-overlay) — none of these ids previously existed, so
 *      nothing here can collide with existing render paths.
 *
 * New surfaces:
 *   - Visitor Timeline    (Today / Week / Month / All + free-text search)
 *   - Notification Center (All / Unread + mark-as-read, using the
 *                           notifications table that was already being
 *                           written to but never read from on the owner side)
 *   - Share Access         (WhatsApp invite links for existing family
 *                           members — front-end only, no schema/RBAC change)
 *   - Smart Analytics       (peak visit hour, busiest day, 30-day total,
 *                           spam blocked — computed client-side from logs
 *                           already fetched via getLogs())
 *   - AI Insight Cards      (PHASE 7B — peak visiting window, visitor
 *                           trend, courier trend, repeat-visitor insight,
 *                           security observation, weekly summary, smart
 *                           recommendation. Rule-based, computed by
 *                           services/aiInsights.js from data already in
 *                           visitor_logs / visitor_memory / message_logs.
 *                           No LLM call, no schema change. Renders into
 *                           #ai-insights-card, a new container id that
 *                           previously did not exist.)
 * ────────────────────────────────────────────────────────────────────────
 */

import { getLogs, formatLogForDisplay } from '../services/logs.js';
import { getNotifications, markNotificationRead } from '../services/notifications.js';
import { getAIInsights } from '../services/aiInsights.js';
import { canUseFeature } from '../services/usageLimits.js';

const OwnerPremium = (() => {
  let ownerId = null;

  let timelineRange = 'today';
  let timelineSearch = '';
  let timelineLogs = [];

  let notifFilter = 'all';
  let notifItems = [];

  let shareMembersCache = [];

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

  function _requireOwner() {
    const oid = _ownerId();
    if (!oid) {
      window.DashboardModule?.showToast?.('Still loading your dashboard — try again in a moment.', 'info');
      return null;
    }
    return oid;
  }

  function _formatHour(h) {
    const period = h >= 12 ? 'PM' : 'AM';
    const h12 = h % 12 === 0 ? 12 : h % 12;
    return `${h12} ${period}`;
  }

  // ────────── Visitor Timeline ──────────

  function _rangeFrom(range) {
    const now = new Date();
    if (range === 'today') { now.setHours(0, 0, 0, 0); return now.toISOString(); }
    if (range === 'week')  { now.setDate(now.getDate() - 7);  return now.toISOString(); }
    if (range === 'month') { now.setDate(now.getDate() - 30); return now.toISOString(); }
    return null; // 'all'
  }

  function _renderTimelineShell() {
    if (document.getElementById('op-timeline-overlay')) return;
    const el = document.createElement('div');
    el.id = 'op-timeline-overlay';
    el.style.cssText = 'display:none;position:fixed;inset:0;z-index:400;background:#081321;flex-direction:column;';
    el.innerHTML = `
      <div style="display:flex;align-items:center;gap:10px;padding:16px;border-bottom:1px solid rgba(255,255,255,0.08);flex-shrink:0;">
        <button onclick="OwnerPremium.closeTimeline()" aria-label="Back" style="background:none;border:none;color:#fff;font-size:1.2rem;cursor:pointer;">←</button>
        <div style="font-family:'Space Grotesk',sans-serif;font-weight:700;font-size:0.95rem;color:#fff;">Visitor Timeline</div>
      </div>
      <div style="padding:12px 16px 4px;flex-shrink:0;">
        <input type="text" id="op-timeline-search" class="settings-input" placeholder="🔍 Search visits…" style="margin-bottom:10px;" oninput="OwnerPremium.searchTimeline(this.value)" />
        <div id="op-timeline-tabs" style="display:flex;gap:6px;overflow-x:auto;padding-bottom:2px;">
          <div class="op-chip op-chip-active" data-range="today" onclick="OwnerPremium.setTimelineRange('today')">Today</div>
          <div class="op-chip" data-range="week" onclick="OwnerPremium.setTimelineRange('week')">This Week</div>
          <div class="op-chip" data-range="month" onclick="OwnerPremium.setTimelineRange('month')">This Month</div>
          <div class="op-chip" data-range="all" onclick="OwnerPremium.setTimelineRange('all')">All Time</div>
        </div>
      </div>
      <div id="op-timeline-list" style="flex:1;overflow-y:auto;padding:8px 16px 16px;"></div>
    `;
    document.body.appendChild(el);
  }

  async function openTimeline() {
    const oid = _requireOwner();
    if (!oid) return;
    _renderTimelineShell();
    document.getElementById('op-timeline-overlay').style.display = 'flex';
    await _loadTimeline();
  }

  function closeTimeline() {
    const el = document.getElementById('op-timeline-overlay');
    if (el) el.style.display = 'none';
  }

  async function _loadTimeline() {
    const oid = _ownerId();
    const listEl = document.getElementById('op-timeline-list');
    if (listEl) listEl.innerHTML = `<div style="text-align:center;padding:30px 0;color:rgba(255,255,255,0.35);font-size:0.82rem;">Loading…</div>`;
    const res = await getLogs(oid, { limit: 200, from: _rangeFrom(timelineRange) });
    timelineLogs = (res.success ? res.logs : []).map(formatLogForDisplay);
    _renderTimelineList();
  }

  function setTimelineRange(range) {
    timelineRange = range;
    document.querySelectorAll('#op-timeline-tabs .op-chip').forEach((c) => {
      c.classList.toggle('op-chip-active', c.dataset.range === range);
    });
    _loadTimeline();
  }

  function searchTimeline(value) {
    timelineSearch = (value || '').toLowerCase();
    _renderTimelineList();
  }

  function _renderTimelineList() {
    const listEl = document.getElementById('op-timeline-list');
    if (!listEl) return;
    const q = timelineSearch;
    const filtered = q
      ? timelineLogs.filter((l) => (l.event + ' ' + (l.intent || '')).toLowerCase().includes(q))
      : timelineLogs;

    if (!filtered.length) {
      listEl.innerHTML = `<div style="text-align:center;padding:40px 12px;color:rgba(255,255,255,0.3);font-size:0.85rem;">No visitor activity found${q ? ` for "${_esc(q)}"` : ''}.</div>`;
      return;
    }

    listEl.innerHTML = filtered.map((l) => {
      const d = new Date(l.raw.created_at);
      const dateLabel = d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
      return `
        <div class="log-item" style="padding:10px 0;border-bottom:1px solid rgba(255,255,255,0.05);">
          <span class="log-dot" style="background:${l.color};box-shadow:0 0 6px ${l.color}80;"></span>
          <div style="flex:1;min-width:0;">
            <div style="color:rgba(255,255,255,0.85);font-size:0.85rem;">${_esc(l.event)}</div>
            <div style="color:rgba(255,255,255,0.35);font-size:0.68rem;margin-top:2px;">${dateLabel} · ${l.time}</div>
          </div>
        </div>`;
    }).join('');
  }

  // ────────── Notification Center ──────────

  function _renderNotifShell() {
    if (document.getElementById('op-notif-overlay')) return;
    const el = document.createElement('div');
    el.id = 'op-notif-overlay';
    el.style.cssText = 'display:none;position:fixed;inset:0;z-index:400;background:#081321;flex-direction:column;';
    el.innerHTML = `
      <div style="display:flex;align-items:center;gap:10px;padding:16px;border-bottom:1px solid rgba(255,255,255,0.08);flex-shrink:0;">
        <button onclick="OwnerPremium.closeNotifications()" aria-label="Back" style="background:none;border:none;color:#fff;font-size:1.2rem;cursor:pointer;">←</button>
        <div style="font-family:'Space Grotesk',sans-serif;font-weight:700;font-size:0.95rem;color:#fff;">Notifications</div>
      </div>
      <div style="padding:12px 16px 0;flex-shrink:0;">
        <div id="op-notif-tabs" style="display:flex;gap:6px;">
          <div class="op-chip op-chip-active" data-filter="all" onclick="OwnerPremium.setNotifFilter('all')">All</div>
          <div class="op-chip" data-filter="unread" onclick="OwnerPremium.setNotifFilter('unread')">Unread</div>
        </div>
      </div>
      <div id="op-notif-list" style="flex:1;overflow-y:auto;padding:4px 16px 16px;"></div>
    `;
    document.body.appendChild(el);
  }

  async function openNotifications() {
    const oid = _requireOwner();
    if (!oid) return;
    _renderNotifShell();
    document.getElementById('op-notif-overlay').style.display = 'flex';
    await _loadNotifications();
  }

  function closeNotifications() {
    const el = document.getElementById('op-notif-overlay');
    if (el) el.style.display = 'none';
  }

  async function _loadNotifications() {
    const oid = _ownerId();
    const listEl = document.getElementById('op-notif-list');
    if (listEl) listEl.innerHTML = `<div style="text-align:center;padding:30px 0;color:rgba(255,255,255,0.35);font-size:0.82rem;">Loading…</div>`;
    const res = await getNotifications(oid, { limit: 50, unreadOnly: notifFilter === 'unread' });
    notifItems = res.success ? (res.notifications || []) : [];
    _renderNotifList();
  }

  function setNotifFilter(filter) {
    notifFilter = filter;
    document.querySelectorAll('#op-notif-tabs .op-chip').forEach((c) => {
      c.classList.toggle('op-chip-active', c.dataset.filter === filter);
    });
    _loadNotifications();
  }

  async function markRead(id) {
    const oid = _ownerId();
    await markNotificationRead(id, oid);
    notifItems = notifItems.map((n) => (n.id === id ? { ...n, is_read: true } : n));
    _renderNotifList();
  }

  function _renderNotifList() {
    const listEl = document.getElementById('op-notif-list');
    if (!listEl) return;
    if (!notifItems.length) {
      listEl.innerHTML = `<div style="text-align:center;padding:40px 12px;color:rgba(255,255,255,0.3);font-size:0.85rem;">No notifications yet.</div>`;
      return;
    }
    listEl.innerHTML = notifItems.map((n) => {
      const d = new Date(n.created_at);
      const dateLabel = `${d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })} · ${d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}`;
      const unread = !n.is_read;
      return `
        <div style="display:flex;gap:10px;padding:12px 0;border-bottom:1px solid rgba(255,255,255,0.05);${unread ? 'cursor:pointer;' : ''}" ${unread ? `onclick="OwnerPremium.markRead('${n.id}')"` : ''}>
          <div style="width:8px;height:8px;border-radius:50%;margin-top:6px;flex-shrink:0;background:${unread ? '#00A2E8' : 'transparent'};"></div>
          <div style="flex:1;min-width:0;">
            <div style="color:#fff;font-size:0.84rem;font-weight:${unread ? '700' : '500'};">${_esc(n.title || 'Notification')}</div>
            ${n.body ? `<div style="color:rgba(255,255,255,0.5);font-size:0.76rem;margin-top:2px;">${_esc(n.body)}</div>` : ''}
            <div style="color:rgba(255,255,255,0.3);font-size:0.68rem;margin-top:4px;">${dateLabel}${unread ? ' · tap to mark read' : ''}</div>
          </div>
        </div>`;
    }).join('');
  }

  // ────────── Share Access ──────────

  function _shareLink(member) {
    const nameEl = document.getElementById('owner-greeting-name') || document.getElementById('owner-panel-name');
    const ownerName = (nameEl && nameEl.textContent.trim() !== '…') ? nameEl.textContent.trim() : 'the owner';
    const msg = `Hi ${member.name}, you've been added as a family contact on ${ownerName}'s My Smart Door. You'll receive calls and alerts when visitors arrive.`;
    const phone = (member.phone || '').replace(/[^0-9]/g, '');
    const waUrl = `https://wa.me/${phone}?text=${encodeURIComponent(msg)}`;
    window.open(waUrl, '_blank', 'noopener');
  }

  function _shareLinkFor(id) {
    const m = shareMembersCache.find((x) => String(x.id) === String(id));
    if (m) _shareLink(m);
  }

  function _renderShareShell(members) {
    let el = document.getElementById('op-share-overlay');
    if (!el) {
      el = document.createElement('div');
      el.id = 'op-share-overlay';
      el.style.cssText = 'display:none;position:fixed;inset:0;z-index:400;background:#081321;flex-direction:column;';
      document.body.appendChild(el);
    }

    const rows = members.length
      ? members.map((m) => `
          <div class="priority-card" style="display:flex;align-items:center;gap:10px;">
            <div style="flex:1;min-width:0;">
              <div style="font-family:'Space Grotesk',sans-serif;font-weight:700;font-size:0.85rem;color:#fff;">${_esc(m.name)}</div>
              <div style="font-size:0.72rem;color:rgba(255,255,255,0.4);">${_esc(m.phone)}</div>
            </div>
            <button class="btn-primary" style="padding:8px 12px;font-size:0.75rem;flex-shrink:0;" onclick="OwnerPremium._shareLinkFor('${_esc(m.id)}')">📲 Invite</button>
          </div>
        `).join('')
      : `<div style="text-align:center;padding:30px 12px;color:rgba(255,255,255,0.35);font-size:0.85rem;">Add a family member first (Settings → Family) to share access with them.</div>`;

    el.innerHTML = `
      <div style="display:flex;align-items:center;gap:10px;padding:16px;border-bottom:1px solid rgba(255,255,255,0.08);flex-shrink:0;">
        <button onclick="OwnerPremium.closeShareAccess()" aria-label="Back" style="background:none;border:none;color:#fff;font-size:1.2rem;cursor:pointer;">←</button>
        <div style="font-family:'Space Grotesk',sans-serif;font-weight:700;font-size:0.95rem;color:#fff;">Share Access</div>
      </div>
      <div style="padding:16px;flex:1;overflow-y:auto;display:flex;flex-direction:column;gap:8px;">
        <div style="font-size:0.76rem;color:rgba(255,255,255,0.4);margin-bottom:6px;">Send a family member a WhatsApp message so they know they're on your My Smart Door alert &amp; call-routing list.</div>
        ${rows}
      </div>
    `;
  }

  function openShareAccess() {
    const oid = _requireOwner();
    if (!oid) return;
    const s = window.DashboardModule.getState();
    shareMembersCache = s.familyMembers || [];
    _renderShareShell(shareMembersCache);
    document.getElementById('op-share-overlay').style.display = 'flex';
  }

  function closeShareAccess() {
    const el = document.getElementById('op-share-overlay');
    if (el) el.style.display = 'none';
  }

  // ────────── Smart Analytics ──────────

  async function refreshSmartAnalytics() {
    const oid = _ownerId();
    const cards = document.querySelectorAll('#smart-analytics-card');
    if (!oid || !cards.length) return;

    const from = new Date();
    from.setDate(from.getDate() - 30);
    const res = await getLogs(oid, { limit: 500, from: from.toISOString() });
    const logs = res.success ? (res.logs || []) : [];

    const scanLikeTypes = new Set(['qr_scan', 'bell_ring', 'voice_message', 'call_attempt', 'ai_intent', 'ai_conversation']);
    const visits = logs.filter((l) => scanLikeTypes.has(l.event_type));
    const spamBlocked = logs.filter((l) => l.event_type === 'spam_blocked').length;

    const hourCounts = new Array(24).fill(0);
    const dayCounts = new Array(7).fill(0);
    visits.forEach((l) => {
      const d = new Date(l.created_at);
      hourCounts[d.getHours()]++;
      dayCounts[d.getDay()]++;
    });

    const hasData = visits.length > 0;
    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const peakHourLabel = hasData ? _formatHour(hourCounts.indexOf(Math.max(...hourCounts))) : '—';
    const peakDayLabel = hasData ? dayNames[dayCounts.indexOf(Math.max(...dayCounts))] : '—';

    const html = `
      <div style="font-size:0.68rem;color:rgba(255,255,255,0.35);margin-bottom:10px;">Based on activity from the last 30 days</div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">
        <div class="op-mini-stat">
          <div class="op-mini-stat-label">📈 Peak Visit Time</div>
          <div class="op-mini-stat-value">${peakHourLabel}</div>
        </div>
        <div class="op-mini-stat">
          <div class="op-mini-stat-label">📅 Busiest Day</div>
          <div class="op-mini-stat-value">${peakDayLabel}</div>
        </div>
        <div class="op-mini-stat">
          <div class="op-mini-stat-label">👥 Total Visits</div>
          <div class="op-mini-stat-value">${visits.length}</div>
        </div>
        <div class="op-mini-stat">
          <div class="op-mini-stat-label">🛡️ Spam Blocked</div>
          <div class="op-mini-stat-value" style="color:#EF4444;">${spamBlocked}</div>
        </div>
      </div>
    `;
    cards.forEach((c) => { c.innerHTML = html; });
  }

  // ────────── AI Insight Cards (Phase 7B) ──────────

  const _TONE_COLOR = {
    positive:   '#22C55E',
    warning:    '#F59E0B',
    info:       '#00A2E8',
    neutral:    'rgba(255,255,255,0.5)',
    suggestion: '#C9A24B', // brass — matches owner-OS accent for "recommendation" surfaces
  };

  function _renderInsightCard(insight) {
    const color = _TONE_COLOR[insight.tone] || _TONE_COLOR.info;
    return `
      <div class="op-insight-card" style="border-left:3px solid ${color};">
        <div class="op-insight-card-head">
          <span class="op-insight-card-icon">${insight.icon}</span>
          <span class="op-insight-card-title">${_esc(insight.title)}</span>
        </div>
        <div class="op-insight-card-text">${_esc(insight.text)}</div>
      </div>
    `;
  }

  async function refreshAIInsights() {
    const oid = _ownerId();
    const cards = document.querySelectorAll('#ai-insights-card');
    if (!oid || !cards.length) return;

    // ── SaaS Launch: Feature Gating — AI Insights is a Premium/Enterprise
    // feature. Free-plan owners see an upgrade prompt instead of the cards.
    // Fails open (shows insights) if the plan lookup itself errors out, so
    // a billing-infra hiccup never silently removes a feature someone paid for.
    let aiAllowed = true;
    try { aiAllowed = await canUseFeature(oid, 'aiFeaturesEnabled'); } catch (_e) { aiAllowed = true; }

    if (!aiAllowed) {
      const upgradeHtml = `
        <div style="text-align:center;padding:18px 12px;border:1px dashed var(--brass-border,rgba(201,162,75,0.4));border-radius:10px;">
          <div style="font-size:0.8rem;color:rgba(255,255,255,0.7);margin-bottom:10px;">🔒 AI Insights is a Premium feature.</div>
          <button class="btn-primary" style="font-size:0.75rem;padding:8px 16px;" onclick="window.SubscriptionManager?.open()">Upgrade to unlock</button>
        </div>`;
      cards.forEach((c) => { c.innerHTML = upgradeHtml; });
      return;
    }

    const res = await getAIInsights(oid);
    const insights = res.success ? (res.insights || []) : [];

    const html = insights.length
      ? insights.map(_renderInsightCard).join('')
      : `<div style="font-size:0.72rem;color:rgba(255,255,255,0.35);text-align:center;padding:10px 0;">Not enough activity yet to generate insights. Check back after a few visitor scans.</div>`;

    cards.forEach((c) => { c.innerHTML = html; });
  }

  // ────────── init ──────────

  function init() {
    // Poll (lightweight, capped) for DashboardModule to finish its own
    // auth-gated init before pulling analytics — never races the owner
    // auth check that lives in dashboard.js, never calls any auth logic
    // itself.
    let attempts = 0;
    const tryInit = () => {
      attempts++;
      const s = window.DashboardModule?.getState?.();
      if (s?.owner?.id) {
        ownerId = s.owner.id;
        refreshSmartAnalytics();
        refreshAIInsights();
      } else if (attempts < 40) {
        setTimeout(tryInit, 500);
      }
    };
    tryInit();
  }

  document.addEventListener('DOMContentLoaded', init);

  return {
    openTimeline, closeTimeline, setTimelineRange, searchTimeline,
    openNotifications, closeNotifications, setNotifFilter, markRead,
    openShareAccess, closeShareAccess, _shareLinkFor,
    refreshSmartAnalytics,
    refreshAIInsights,
  };
})();

window.OwnerPremium = OwnerPremium;
