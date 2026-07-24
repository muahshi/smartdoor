/**
 * My Smart Door — AI Owner Assistant UI
 * js/aiOwnerAssistantUI.js
 *
 * PHASE 5 — ADDITIVE ONLY. Mounts into the two existing
 * #ai-owner-assistant-card containers (mobile + desktop dashboard tabs,
 * same duplication pattern app.html already uses for #smart-analytics-card
 * / #ai-insights-card). Builds its own overlay panel via JS, exactly like
 * js/ownerPremium.js's op-timeline-overlay — no new markup required beyond
 * the two empty card divs.
 *
 * Never touches auth, RBAC, WebRTC, or any existing widget's DOM.
 */

import {
  getOwnerAssistantData,
  getDailyAISummary,
  detectSuspiciousVisitors,
  getVisitorHistoryCards,
  getAIRecommendations,
  searchVisitorActivity,
  submitOwnerFeedback,
  getFeedbackAccuracyByType,
} from '../services/aiOwnerAssistant.js';

const AIOwnerAssistant = (() => {
  let ownerId = null;
  let lastData = null;

  function _esc(s) {
    return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  function _fmtTime(ts) {
    try { return new Date(ts).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }); }
    catch (_) { return ts; }
  }

  // ────────── summary card (the small dashboard tile) ──────────
  async function refresh() {
    if (!ownerId) return;
    const data = await getOwnerAssistantData(ownerId);
    lastData = data;

    const cards = document.querySelectorAll('#ai-owner-assistant-card');
    if (!cards.length) return;

    const summary = getDailyAISummary(data);
    const suspicious = detectSuspiciousVisitors(data);
    const recs = getAIRecommendations(data);

    const html = `
      <div style="padding:2px 0;">
        <div style="font-size:0.78rem;color:rgba(255,255,255,0.85);line-height:1.5;margin-bottom:10px;">
          ${_esc(summary.text)}
        </div>
        ${suspicious.length ? `
          <div style="font-size:0.68rem;color:#F87171;margin-bottom:6px;">
            ⚠️ ${suspicious.length} visitor${suspicious.length === 1 ? '' : 's'} flagged for review
          </div>` : ''}
        ${recs.slice(0, 2).map((r) => `
          <div style="font-size:0.68rem;color:rgba(255,255,255,0.55);margin-bottom:4px;">
            💡 ${_esc(r.title)}
          </div>`).join('')}
        <button onclick="AIOwnerAssistant.open()" style="margin-top:8px;width:100%;padding:8px;border-radius:8px;border:none;background:rgba(201,162,75,0.14);color:#E8C874;font-weight:700;font-size:0.72rem;cursor:pointer;font-family:'Space Grotesk',sans-serif;">
          🧠 Open AI Assistant
        </button>
      </div>`;

    cards.forEach((c) => { c.innerHTML = html; });
  }

  // ────────── full overlay panel ──────────
  function _ensureOverlay() {
    if (document.getElementById('aoa-overlay')) return;
    const el = document.createElement('div');
    el.id = 'aoa-overlay';
    el.style.cssText = 'display:none;position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,0.72);backdrop-filter:blur(4px);align-items:flex-end;justify-content:center;';
    el.innerHTML = `
      <div style="width:100%;max-width:520px;max-height:88vh;overflow-y:auto;background:#141414;border-radius:18px 18px 0 0;padding:18px;">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;">
          <div style="font-family:'Space Grotesk',sans-serif;font-weight:800;font-size:1.05rem;color:#fff;">🧠 AI Assistant</div>
          <button onclick="AIOwnerAssistant.close()" style="background:none;border:none;color:rgba(255,255,255,0.5);font-size:1.2rem;cursor:pointer;">✕</button>
        </div>
        <input id="aoa-search-input" placeholder="Search visitor activity…" style="width:100%;padding:9px 12px;border-radius:9px;border:1px solid rgba(255,255,255,0.1);background:rgba(255,255,255,0.04);color:#fff;font-size:0.8rem;margin-bottom:10px;box-sizing:border-box;" />
        <div id="aoa-search-results"></div>
        <div id="aoa-tabs" style="display:flex;gap:6px;margin-bottom:10px;">
          <button class="aoa-tab active" data-tab="recs" style="flex:1;padding:7px;border-radius:7px;border:none;background:rgba(201,162,75,0.18);color:#E8C874;font-size:0.68rem;font-weight:700;cursor:pointer;">Recommendations</button>
          <button class="aoa-tab" data-tab="suspicious" style="flex:1;padding:7px;border-radius:7px;border:none;background:rgba(255,255,255,0.05);color:rgba(255,255,255,0.6);font-size:0.68rem;font-weight:700;cursor:pointer;">Suspicious</button>
          <button class="aoa-tab" data-tab="history" style="flex:1;padding:7px;border-radius:7px;border:none;background:rgba(255,255,255,0.05);color:rgba(255,255,255,0.6);font-size:0.68rem;font-weight:700;cursor:pointer;">Visitor History</button>
        </div>
        <div id="aoa-panel-body"></div>
      </div>`;
    document.body.appendChild(el);

    document.getElementById('aoa-search-input').addEventListener('input', (e) => _runSearch(e.target.value));
    el.querySelectorAll('.aoa-tab').forEach((btn) => {
      btn.addEventListener('click', () => {
        el.querySelectorAll('.aoa-tab').forEach((b) => {
          b.classList.remove('active');
          b.style.background = 'rgba(255,255,255,0.05)';
          b.style.color = 'rgba(255,255,255,0.6)';
        });
        btn.classList.add('active');
        btn.style.background = 'rgba(201,162,75,0.18)';
        btn.style.color = '#E8C874';
        _renderTab(btn.dataset.tab);
      });
    });
  }

  function _runSearch(q) {
    const box = document.getElementById('aoa-search-results');
    if (!box || !lastData) return;
    if (!q || !q.trim()) { box.innerHTML = ''; return; }
    const hits = searchVisitorActivity(lastData, q);
    box.innerHTML = hits.length
      ? `<div style="margin-bottom:10px;">${hits.map((h) => `
          <div style="padding:8px 10px;background:rgba(255,255,255,0.04);border-radius:8px;margin-bottom:6px;">
            <div style="font-size:0.72rem;color:#fff;">${_esc(h.text)}</div>
            <div style="font-size:0.62rem;color:rgba(255,255,255,0.4);margin-top:2px;">${_esc(h.source)} · ${_fmtTime(h.at)}</div>
          </div>`).join('')}</div>`
      : `<div style="font-size:0.7rem;color:rgba(255,255,255,0.35);margin-bottom:10px;">No matches.</div>`;
  }

  function _renderTab(tab) {
    const body = document.getElementById('aoa-panel-body');
    if (!body || !lastData) return;

    if (tab === 'recs') {
      const recs = getAIRecommendations(lastData);
      const acc = getFeedbackAccuracyByType(lastData);
      body.innerHTML = (recs.length ? recs.map((r) => `
        <div style="padding:10px;background:rgba(255,255,255,0.04);border-radius:10px;margin-bottom:8px;border-left:3px solid ${r.priority === 'high' ? '#F87171' : '#E8C874'};">
          <div style="font-size:0.78rem;font-weight:700;color:#fff;margin-bottom:3px;">${_esc(r.title)}</div>
          <div style="font-size:0.7rem;color:rgba(255,255,255,0.6);margin-bottom:5px;">${_esc(r.text)}</div>
          <div style="font-size:0.6rem;color:rgba(255,255,255,0.35);">Why: ${r.why.map(_esc).join(' · ')}</div>
        </div>`).join('') : `<div style="font-size:0.7rem;color:rgba(255,255,255,0.35);">No recommendations right now — everything looks routine.</div>`)
        + (acc.length ? `<div style="margin-top:10px;font-size:0.65rem;color:rgba(255,255,255,0.4);">AI accuracy from your feedback: ${acc.map((a) => `${_esc(a.visitorType)} ${a.accuracyPct}%`).join(' · ')}</div>` : '');
    }

    if (tab === 'suspicious') {
      const list = detectSuspiciousVisitors(lastData);
      body.innerHTML = list.length ? list.map((s) => `
        <div style="padding:10px;background:rgba(239,68,68,0.06);border-radius:10px;margin-bottom:8px;">
          <div style="font-size:0.78rem;font-weight:700;color:#fff;">${_esc(s.label)} — risk ${s.risk.score}/100 (${s.risk.level})</div>
          <div style="font-size:0.65rem;color:rgba(255,255,255,0.5);margin-top:3px;">${s.risk.factors.map((f) => _esc(f.label)).join(' · ')}</div>
        </div>`).join('') : `<div style="font-size:0.7rem;color:rgba(255,255,255,0.35);">No suspicious activity detected.</div>`;
    }

    if (tab === 'history') {
      const cards = getVisitorHistoryCards(lastData);
      body.innerHTML = cards.length ? cards.map((c) => `
        <div style="padding:10px;background:rgba(255,255,255,0.04);border-radius:10px;margin-bottom:8px;">
          <div style="display:flex;justify-content:space-between;align-items:center;">
            <div style="font-size:0.78rem;font-weight:700;color:#fff;">${_esc(c.label)}</div>
            <div style="font-size:0.62rem;color:rgba(255,255,255,0.4);">${c.visitCount} visits</div>
          </div>
          <div style="font-size:0.62rem;color:rgba(255,255,255,0.4);margin-top:2px;">Last seen ${_fmtTime(c.lastSeen)} · risk ${c.risk.score}/100</div>
          ${c.intelligence.hasPattern ? `<div style="font-size:0.62rem;color:rgba(255,255,255,0.4);">Trend: ${_esc(c.intelligence.trend)}${c.intelligence.mostCommonPurpose ? ` · usually: ${_esc(c.intelligence.mostCommonPurpose)}` : ''}</div>` : ''}
          <div style="font-size:0.6rem;color:rgba(255,255,255,0.3);margin-top:4px;">${c.timeline.slice(0, 3).map((t) => `${t.icon} ${_fmtTime(t.at)}`).join('  ')}</div>
        </div>`).join('') : `<div style="font-size:0.7rem;color:rgba(255,255,255,0.35);">No recognized visitors yet.</div>`;
    }
  }

  function open() {
    _ensureOverlay();
    document.getElementById('aoa-overlay').style.display = 'flex';
    _renderTab('recs');
  }

  function close() {
    const el = document.getElementById('aoa-overlay');
    if (el) el.style.display = 'none';
  }

  /**
   * Owner feedback (thumbs up/down) on a specific AI screening — meant to
   * be called from wherever a screening's ai_summary/confidence is already
   * displayed (e.g. js/webrtcCallUI.js's ring card), passing the
   * screening id it already has in hand.
   */
  async function giveFeedback(screeningId, feedback) {
    const res = await submitOwnerFeedback(screeningId, feedback);
    if (res.success && ownerId) await getOwnerAssistantData(ownerId, { force: true });
    return res;
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

  return { refresh, open, close, giveFeedback };
})();

window.AIOwnerAssistant = AIOwnerAssistant;
