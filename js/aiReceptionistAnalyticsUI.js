/**
 * Smart Door — AI Receptionist Analytics UI
 * js/aiReceptionistAnalyticsUI.js
 *
 * PHASE 4 — ADDITIVE ONLY. Renders visitor-category analytics, weekly
 * category insights, and AI quality metrics (services/aiReceptionistAnalytics.js)
 * into new container ids added alongside this file in app.html
 * (#ai-category-insights-card). Does not modify dashboard.js,
 * js/ownerPremium.js, or either of their #ai-insights-card /
 * #smart-analytics-card render paths — this is a separate card with a
 * separate id, following the same pattern js/ownerPremium.js itself
 * documents for why its own new containers never collide with existing
 * render paths.
 *
 * Reads window.DashboardModule.getState() for the signed-in owner id,
 * same read-only accessor js/ownerPremium.js already uses — no new auth
 * logic, no writes.
 */

import { getAIReceptionistInsights } from '../services/aiReceptionistAnalytics.js';
import { canUseFeature } from '../services/usageLimits.js';

const AIReceptionistAnalyticsUI = (() => {
  let ownerId = null;

  function _esc(str) {
    return String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function _ownerId() {
    return ownerId || window.DashboardModule?.getState?.()?.owner?.id || null;
  }

  const _TYPE_ICON = {
    'Delivery Partner': '📦', Courier: '📬', Family: '👨‍👩‍👧', Relative: '🧑‍🤝‍🧑',
    Friend: '🤝', Guest: '🏠', Neighbour: '🏘️', Maid: '🧹', 'House Help': '🧹',
    Driver: '🚗', Technician: '🔧', Maintenance: '🛠️', 'Society Staff': '🏢',
    Government: '🏛️', Utility: '💡', 'Business Visitor': '💼', Medical: '⚕️',
    'Sales Person': '📢', Emergency: '🚨', 'Unknown Visitor': '❓',
  };

  const _PRIORITY_COLOR = {
    Critical: '#EF4444', High: '#F59E0B', Normal: '#00A2E8', Low: 'rgba(255,255,255,0.4)',
  };

  function _bar(pct, color) {
    return `<div style="height:5px;border-radius:3px;background:rgba(255,255,255,0.08);overflow:hidden;margin-top:4px;">
      <div style="height:100%;width:${Math.max(2, Math.min(100, pct))}%;background:${color};border-radius:3px;"></div>
    </div>`;
  }

  function _renderCategoryRow(c) {
    const icon = _TYPE_ICON[c.visitorType] || '👤';
    return `
      <div style="padding:8px 0;">
        <div style="display:flex;align-items:center;justify-content:space-between;font-size:0.76rem;">
          <span style="color:#E2ECF4;">${icon} ${_esc(c.visitorType)}</span>
          <span style="color:rgba(255,255,255,0.5);">${c.count} · ${c.pct}%</span>
        </div>
        ${_bar(c.pct, '#00A2E8')}
      </div>`;
  }

  function _renderTrendRow(t) {
    const up = t.changePct > 0;
    const flat = t.changePct === 0;
    const color = flat ? 'rgba(255,255,255,0.5)' : up ? '#22C55E' : '#F59E0B';
    const arrow = flat ? '→' : up ? '↑' : '↓';
    const icon = _TYPE_ICON[t.visitorType] || '👤';
    return `
      <div style="display:flex;align-items:center;justify-content:space-between;padding:6px 0;font-size:0.74rem;">
        <span style="color:#E2ECF4;">${icon} ${_esc(t.visitorType)}</span>
        <span style="color:${color};font-weight:700;">${arrow} ${Math.abs(t.changePct)}% <span style="color:rgba(255,255,255,0.35);font-weight:500;">(${t.thisWeek} vs ${t.lastWeek})</span></span>
      </div>`;
  }

  function _renderQualityGrid(q) {
    const overridePct = q.totalScreenings ? Math.round((q.ruleMatchedCount / q.totalScreenings) * 100) : 0;
    const voicePct = q.totalScreenings ? Math.round((q.voiceCount / q.totalScreenings) * 100) : 0;
    return `
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:4px;">
        <div class="op-mini-stat">
          <div class="op-mini-stat-label">🎯 Avg. Confidence</div>
          <div class="op-mini-stat-value">${Math.round(q.avgConfidence * 100)}%</div>
        </div>
        <div class="op-mini-stat">
          <div class="op-mini-stat-label">🎙️ Voice AI Usage</div>
          <div class="op-mini-stat-value">${voicePct}%</div>
        </div>
        <div class="op-mini-stat">
          <div class="op-mini-stat-label">⚙️ Owner Rules Applied</div>
          <div class="op-mini-stat-value">${overridePct}%</div>
        </div>
        <div class="op-mini-stat">
          <div class="op-mini-stat-label">🚫 Spam / Sales Flagged</div>
          <div class="op-mini-stat-value" style="color:${q.spamFlaggedCount ? '#EF4444' : '#fff'};">${q.spamFlaggedCount}</div>
        </div>
      </div>
      ${q.duplicateCount > 0 ? `
        <div style="margin-top:10px;font-size:0.72rem;color:#F59E0B;background:rgba(245,158,11,0.08);border-radius:8px;padding:8px 10px;">
          🔁 ${q.duplicateCount} duplicate/rapid-repeat conversation${q.duplicateCount === 1 ? '' : 's'} detected in this window (same visitor type calling again within 15 minutes).
        </div>` : ''}
      ${q.lowConfidenceCount > 0 ? `
        <div style="margin-top:8px;font-size:0.68rem;color:rgba(255,255,255,0.4);">${q.lowConfidenceCount} screening${q.lowConfidenceCount === 1 ? '' : 's'} had low AI confidence (&lt;60%) — worth a quick review in Activity Center.</div>` : ''}
    `;
  }

  function _renderUrgencyChips(urgency) {
    if (!urgency.length) return '';
    return `<div style="display:flex;flex-wrap:wrap;gap:6px;margin-top:10px;">
      ${urgency.map((u) => `
        <span style="font-size:0.66rem;font-weight:700;padding:3px 9px;border-radius:20px;background:${_PRIORITY_COLOR[u.priority] || '#00A2E8'}22;color:${_PRIORITY_COLOR[u.priority] || '#00A2E8'};border:1px solid ${_PRIORITY_COLOR[u.priority] || '#00A2E8'}44;">
          ${_esc(u.priority)} · ${u.count}
        </span>`).join('')}
    </div>`;
  }

  async function refresh() {
    const oid = _ownerId();
    const cards = document.querySelectorAll('#ai-category-insights-card');
    if (!oid || !cards.length) return;
    ownerId = oid;

    let allowed = true;
    try { allowed = await canUseFeature(oid, 'aiFeaturesEnabled'); } catch (_e) { allowed = true; }
    if (!allowed) {
      const upgradeHtml = `
        <div style="text-align:center;padding:18px 12px;border:1px dashed rgba(201,162,75,0.4);border-radius:10px;">
          <div style="font-size:0.8rem;color:rgba(255,255,255,0.7);margin-bottom:10px;">🔒 Visitor Intelligence is a Premium feature.</div>
          <button class="btn-primary" style="font-size:0.75rem;padding:8px 16px;" onclick="window.SubscriptionManager?.open()">Upgrade to unlock</button>
        </div>`;
      cards.forEach((c) => { c.innerHTML = upgradeHtml; });
      return;
    }

    const res = await getAIReceptionistInsights(oid, 30);
    if (!res.success || res.quality.totalScreenings === 0) {
      const emptyHtml = `<div style="font-size:0.72rem;color:rgba(255,255,255,0.35);text-align:center;padding:14px 0;">Not enough AI Receptionist activity yet. Categories and quality metrics will appear here after a few visitor calls are screened.</div>`;
      cards.forEach((c) => { c.innerHTML = emptyHtml; });
      return;
    }

    const categoryHtml = res.categoryBreakdown.length
      ? res.categoryBreakdown.slice(0, 8).map(_renderCategoryRow).join('')
      : `<div style="font-size:0.72rem;color:rgba(255,255,255,0.35);">No categorized visits yet.</div>`;

    const trendHtml = res.weeklyTrend.length
      ? res.weeklyTrend.slice(0, 6).map(_renderTrendRow).join('')
      : `<div style="font-size:0.72rem;color:rgba(255,255,255,0.35);">Not enough week-over-week data yet.</div>`;

    const html = `
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;">
        <div style="font-size:0.68rem;color:rgba(255,255,255,0.35);">Last ${res.windowDays} days · ${res.quality.totalScreenings} screening${res.quality.totalScreenings === 1 ? '' : 's'}</div>
      </div>

      <div style="font-family:'Space Grotesk',sans-serif;font-weight:700;font-size:0.78rem;color:#fff;margin-bottom:2px;">Visitor Categories</div>
      <div>${categoryHtml}</div>
      ${_renderUrgencyChips(res.urgencyBreakdown)}

      <div style="font-family:'Space Grotesk',sans-serif;font-weight:700;font-size:0.78rem;color:#fff;margin:16px 0 2px;">Weekly Trend</div>
      <div>${trendHtml}</div>

      <div style="font-family:'Space Grotesk',sans-serif;font-weight:700;font-size:0.78rem;color:#fff;margin:16px 0 2px;">AI Quality Metrics</div>
      ${_renderQualityGrid(res.quality)}
    `;
    cards.forEach((c) => { c.innerHTML = html; });
  }

  function init() {
    let attempts = 0;
    const tryInit = () => {
      attempts++;
      const s = window.DashboardModule?.getState?.();
      if (s?.owner?.id) {
        ownerId = s.owner.id;
        refresh();
      } else if (attempts < 40) {
        setTimeout(tryInit, 500);
      }
    };
    tryInit();
  }

  document.addEventListener('DOMContentLoaded', init);

  return { refresh };
})();

window.AIReceptionistAnalyticsUI = AIReceptionistAnalyticsUI;
export default AIReceptionistAnalyticsUI;
