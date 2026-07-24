/**
 * My Smart Door — Beta Feedback Widget
 * js/betaFeedback.js
 *
 * Phase 9 — Beta Launch Operations
 *
 * Injects a floating feedback button into the dashboard (app.html).
 * Opens a modal with: Bug Report | Feature Request | Rate Experience
 *
 * Usage (add to bottom of app.js, after auth):
 *   import { initBetaFeedback } from './js/betaFeedback.js';
 *   initBetaFeedback(ownerId);
 *
 * Does NOT touch existing UI or Tailwind classes.
 */

import { submitBetaFeedback, submitNPS } from '../services/customerSuccess.js';

let _ownerId = null;

export function initBetaFeedback(ownerId) {
  _ownerId = ownerId;
  _injectFAB();
}

function _injectFAB() {
  const fab = document.createElement('div');
  fab.id = 'sd-beta-fab';
  fab.setAttribute('title', 'Beta Feedback');
  fab.style.cssText = `
    position: fixed; bottom: 5rem; right: 1.25rem; z-index: 999;
    width: 48px; height: 48px; border-radius: 50%;
    background: linear-gradient(135deg,#7c3aed,#4f46e5);
    box-shadow: 0 4px 16px rgba(124,58,237,0.45);
    display: flex; align-items: center; justify-content: center;
    cursor: pointer; font-size: 1.25rem;
    transition: transform 0.2s;
  `;
  fab.innerHTML = '💬';
  fab.addEventListener('click', _openModal);
  fab.addEventListener('mouseenter', () => fab.style.transform = 'scale(1.1)');
  fab.addEventListener('mouseleave', () => fab.style.transform = 'scale(1)');
  document.body.appendChild(fab);
}

function _openModal() {
  const existing = document.getElementById('sd-beta-modal');
  if (existing) { existing.remove(); return; }

  const modal = document.createElement('div');
  modal.id = 'sd-beta-modal';
  modal.style.cssText = `
    position: fixed; inset: 0; z-index: 9998;
    background: rgba(0,0,0,0.7); backdrop-filter: blur(3px);
    display: flex; align-items: flex-end; justify-content: center;
    padding: 0 0 5.5rem;
  `;

  modal.innerHTML = `
    <div style="
      background: #1a1a2e; border: 1px solid rgba(124,58,237,0.4);
      border-radius: 1.25rem 1.25rem 0 0; padding: 1.5rem;
      width: 100%; max-width: 480px; color: #fff;
    ">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:1.25rem;">
        <h3 style="margin:0;font-size:1.1rem;font-weight:600;color:#a78bfa;">Beta Feedback</h3>
        <button id="sd-beta-close" style="background:none;border:none;color:rgba(255,255,255,0.5);font-size:1.25rem;cursor:pointer;">✕</button>
      </div>

      <!-- Tabs -->
      <div style="display:flex;gap:0.5rem;margin-bottom:1.25rem;">
        <button class="sd-fb-tab" data-tab="bug"     style="${_tabStyle(true)}">🐛 Bug</button>
        <button class="sd-fb-tab" data-tab="feature" style="${_tabStyle()}">💡 Feature</button>
        <button class="sd-fb-tab" data-tab="rate"    style="${_tabStyle()}">⭐ Rate</button>
      </div>

      <!-- Bug Panel -->
      <div id="sd-fb-bug" class="sd-fb-panel">
        <input id="sd-bug-title" placeholder="Bug title..." style="${_inputStyle()}" maxlength="100">
        <textarea id="sd-bug-desc" placeholder="Describe what happened..." style="${_inputStyle(true)}" maxlength="1000"></textarea>
        <select id="sd-bug-severity" style="${_inputStyle()}">
          <option value="low">Low — Minor issue</option>
          <option value="medium" selected>Medium — Affects usage</option>
          <option value="high">High — Major problem</option>
          <option value="critical">Critical — App broken</option>
        </select>
        <button class="sd-fb-submit" data-type="bug" style="${_btnStyle()}">Submit Bug Report</button>
      </div>

      <!-- Feature Panel -->
      <div id="sd-fb-feature" class="sd-fb-panel" style="display:none;">
        <input id="sd-feat-title" placeholder="Feature name..." style="${_inputStyle()}" maxlength="100">
        <textarea id="sd-feat-desc" placeholder="Why would this help?" style="${_inputStyle(true)}" maxlength="1000"></textarea>
        <button class="sd-fb-submit" data-type="feature" style="${_btnStyle()}">Submit Request</button>
      </div>

      <!-- Rate Panel -->
      <div id="sd-fb-rate" class="sd-fb-panel" style="display:none;">
        <p style="margin:0 0 1rem;font-size:0.9rem;color:rgba(255,255,255,0.6);">How would you rate My Smart Door?</p>
        <div id="sd-stars" style="display:flex;gap:0.5rem;justify-content:center;margin-bottom:1rem;">
          ${[1,2,3,4,5].map(n=>`<span data-star="${n}" style="font-size:2rem;cursor:pointer;opacity:0.4;transition:opacity 0.15s;">⭐</span>`).join('')}
        </div>
        <textarea id="sd-rate-comment" placeholder="Tell us more (optional)..." style="${_inputStyle(true)}" maxlength="500"></textarea>
        <button class="sd-fb-submit" data-type="rate" style="${_btnStyle()}">Submit Rating</button>
      </div>

      <!-- Success message (hidden) -->
      <div id="sd-fb-success" style="display:none;text-align:center;padding:1rem;">
        <div style="font-size:2.5rem;margin-bottom:0.5rem;">✅</div>
        <p style="color:#10b981;font-weight:600;">Thank you for your feedback!</p>
      </div>
    </div>
  `;

  document.body.appendChild(modal);

  // Bind close
  document.getElementById('sd-beta-close').addEventListener('click', () => modal.remove());
  modal.addEventListener('click', (e) => { if (e.target === modal) modal.remove(); });

  // Bind tabs
  modal.querySelectorAll('.sd-fb-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      modal.querySelectorAll('.sd-fb-tab').forEach(t => t.style.cssText = _tabStyle());
      tab.style.cssText = _tabStyle(true);
      modal.querySelectorAll('.sd-fb-panel').forEach(p => p.style.display = 'none');
      document.getElementById(`sd-fb-${tab.dataset.tab}`).style.display = '';
    });
  });

  // Bind stars
  let selectedStars = 0;
  modal.querySelectorAll('[data-star]').forEach(star => {
    star.addEventListener('click', () => {
      selectedStars = parseInt(star.dataset.star);
      modal.querySelectorAll('[data-star]').forEach((s, i) => {
        s.style.opacity = i < selectedStars ? '1' : '0.4';
      });
    });
  });

  // Bind submit
  modal.querySelectorAll('.sd-fb-submit').forEach(btn => {
    btn.addEventListener('click', async () => {
      btn.disabled = true;
      btn.textContent = 'Sending...';

      let result;
      const type = btn.dataset.type;

      if (type === 'bug') {
        result = await submitBetaFeedback(_ownerId, {
          type: 'bug',
          title:       document.getElementById('sd-bug-title').value.trim(),
          description: document.getElementById('sd-bug-desc').value.trim(),
          severity:    document.getElementById('sd-bug-severity').value,
        });
      } else if (type === 'feature') {
        result = await submitBetaFeedback(_ownerId, {
          type: 'feature',
          title:       document.getElementById('sd-feat-title').value.trim(),
          description: document.getElementById('sd-feat-desc').value.trim(),
        });
      } else if (type === 'rate') {
        result = await submitBetaFeedback(_ownerId, {
          type: 'feedback',
          title:       `${selectedStars}-star rating`,
          description: document.getElementById('sd-rate-comment').value.trim(),
          severity:    'low',
        });
        // Also submit NPS
        if (selectedStars > 0) {
          const npsScore = Math.round((selectedStars / 5) * 10);
          await submitNPS(_ownerId, { score: npsScore, category: 'satisfaction' });
        }
      }

      if (result?.success) {
        modal.querySelectorAll('.sd-fb-panel').forEach(p => p.style.display = 'none');
        document.getElementById('sd-fb-success').style.display = '';
        setTimeout(() => modal.remove(), 2500);
      } else {
        btn.disabled = false;
        btn.textContent = 'Try Again';
      }
    });
  });
}

function _tabStyle(active = false) {
  return `
    flex:1; padding:0.5rem; border-radius:0.5rem; border:none; cursor:pointer;
    font-size:0.8rem; font-weight:600; transition: background 0.2s;
    background:${active ? 'rgba(124,58,237,0.4)' : 'rgba(255,255,255,0.07)'};
    color:${active ? '#a78bfa' : 'rgba(255,255,255,0.5)'};
  `;
}
function _inputStyle(textarea = false) {
  const base = `
    width:100%; box-sizing:border-box; margin-bottom:0.75rem;
    background:rgba(255,255,255,0.07); border:1px solid rgba(255,255,255,0.15);
    border-radius:0.5rem; padding:0.625rem 0.75rem; color:#fff; font-size:0.9rem;
    outline:none; font-family:inherit;
  `;
  return textarea ? base + 'display:block;min-height:90px;resize:vertical;' : base;
}
function _btnStyle() {
  return `
    width:100%; padding:0.75rem; border:none; border-radius:0.625rem;
    background:linear-gradient(135deg,#7c3aed,#4f46e5); color:#fff;
    font-size:0.95rem; font-weight:600; cursor:pointer;
  `;
}
