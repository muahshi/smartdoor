/**
 * My Smart Door — AI Receptionist Pre-Call Screening UI
 * js/aiCallScreeningUI.js
 *
 * Self-contained UI layer for the visitor-side "AI answers first" screen,
 * injected/styled at runtime exactly like js/visitorCallUI.js and
 * js/webrtcCallUI.js do — never edits visitor.html's existing template
 * or CSS. Wired from visitor.html's existing btn-call click handler,
 * BEFORE it calls attemptTapToTalk()/initiateMaskedCall() — this module
 * does not touch either of those, or any signaling/ICE/media code. It
 * only collects a few structured answers and hands them back.
 *
 * Not a general chatbot: a fixed, minimal decision tree — one purpose
 * chip, then at most one short follow-up — matching the "ask only the
 * minimum questions" requirement.
 */

const PURPOSE_CHIPS = [
  { key: 'Delivery Partner', label: '📦 Delivery' },
  { key: 'Courier', label: '📬 Courier' },
  { key: 'Family', label: '👨‍👩‍👧 Family' },
  { key: 'Friend', label: '🤝 Friend' },
  { key: 'Guest', label: '🏠 Guest' },
  { key: 'Maid', label: '🧹 Domestic Help' },
  { key: 'Driver', label: '🚗 Driver' },
  { key: 'Technician', label: '🔧 Technician' },
  { key: 'Society Staff', label: '🏢 Society Staff' },
  { key: 'Sales Person', label: '💼 Sales' },
  { key: 'Unknown Visitor', label: '❓ Other' },
  { key: 'Emergency', label: '🚨 Emergency' },
];

const COMPANY_CHIPS = ['Amazon', 'Flipkart', 'Swiggy', 'Zomato'];

let _overlayEl = null;
let _active = false;
let _resolveFn = null;

function _ensureDom() {
  if (_overlayEl) return;

  const style = document.createElement('style');
  style.id = 'sd-ai-screen-styles';
  style.textContent = `
    #sd-ai-screen-overlay {
      position: fixed; inset: 0; z-index: 99997;
      display: none; align-items: center; justify-content: center;
      background: radial-gradient(circle at 50% 20%, rgba(0,162,232,0.10), rgba(5,6,10,0.94) 60%);
      backdrop-filter: blur(10px); -webkit-backdrop-filter: blur(10px);
      font-family: inherit;
    }
    #sd-ai-screen-overlay.sd-ai-screen-show { display: flex; }
    #sd-ai-screen-card {
      width: min(380px, 92vw); max-height: 86vh; overflow-y: auto;
      border-radius: 24px; padding: 26px 22px 22px;
      background: linear-gradient(165deg, #10151c 0%, #0a0b0f 100%);
      border: 1px solid rgba(0,162,232,0.28);
      color: #fff; text-align: center;
      box-shadow: 0 24px 70px rgba(0,0,0,0.55), inset 0 1px 0 rgba(255,255,255,0.04);
      animation: sd-ai-screen-pop 0.28s cubic-bezier(.2,.8,.2,1);
    }
    @keyframes sd-ai-screen-pop { from { transform: scale(0.94) translateY(8px); opacity: 0; } to { transform: scale(1) translateY(0); opacity: 1; } }

    #sd-ai-screen-avatar {
      width: 60px; height: 60px; margin: 0 auto 12px; border-radius: 50%;
      display: flex; align-items: center; justify-content: center;
      background: radial-gradient(circle, rgba(0,162,232,0.2), rgba(0,162,232,0.02));
      border: 1.5px solid rgba(0,162,232,0.4); font-size: 26px;
    }
    #sd-ai-screen-title { font-size: 17px; font-weight: 700; margin: 2px 0 4px; }
    #sd-ai-screen-sub { font-size: 13px; color: #9CA3AF; margin-bottom: 18px; line-height: 1.4; }

    #sd-ai-screen-close {
      position: absolute; top: 14px; right: 14px; background: none; border: none;
      color: rgba(255,255,255,0.4); font-size: 18px; cursor: pointer; line-height: 1;
    }

    .sd-ai-chip-grid { display: flex; flex-wrap: wrap; gap: 8px; justify-content: center; margin-bottom: 6px; }
    .sd-ai-chip {
      padding: 9px 14px; border-radius: 12px; font-size: 13px; font-weight: 600;
      background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.14);
      color: #E2ECF4; cursor: pointer; transition: all 0.15s ease;
    }
    .sd-ai-chip:hover { border-color: rgba(0,162,232,0.5); background: rgba(0,162,232,0.12); }
    .sd-ai-chip.sd-ai-chip-danger { border-color: rgba(239,68,68,0.35); color: #FCA5A5; }
    .sd-ai-chip.sd-ai-chip-danger:hover { border-color: rgba(239,68,68,0.6); background: rgba(239,68,68,0.14); }

    #sd-ai-screen-input {
      width: 100%; box-sizing: border-box; margin-top: 12px;
      background: rgba(255,255,255,0.07); border: 1px solid rgba(255,255,255,0.16);
      border-radius: 10px; padding: 10px 12px; color: #fff; font-size: 14px; outline: none;
    }
    #sd-ai-screen-input:focus { border-color: rgba(0,162,232,0.5); }

    #sd-ai-screen-actions { display: flex; gap: 10px; margin-top: 16px; }
    .sd-ai-screen-btn {
      flex: 1; padding: 11px 0; border-radius: 12px; border: none;
      font-size: 14px; font-weight: 600; cursor: pointer;
    }
    .sd-ai-screen-btn-primary { background: linear-gradient(135deg,#00A2E8,#0066cc); color: #fff; }
    .sd-ai-screen-btn-secondary { background: rgba(255,255,255,0.08); color: #cbd5e1; }

    #sd-ai-screen-dots { display: flex; justify-content: center; gap: 6px; margin: 6px 0 4px; }
    #sd-ai-screen-dots span { width: 6px; height: 6px; border-radius: 50%; background: rgba(0,162,232,0.35); animation: sd-ai-screen-blink 1.2s infinite; }
    #sd-ai-screen-dots span:nth-child(2) { animation-delay: 0.15s; }
    #sd-ai-screen-dots span:nth-child(3) { animation-delay: 0.3s; }
    @keyframes sd-ai-screen-blink { 0%,100%{opacity:0.3} 50%{opacity:1} }
  `;
  document.head.appendChild(style);

  const overlay = document.createElement('div');
  overlay.id = 'sd-ai-screen-overlay';
  overlay.innerHTML = `
    <div id="sd-ai-screen-card" style="position:relative;">
      <button type="button" id="sd-ai-screen-close">✕</button>
      <div id="sd-ai-screen-avatar">🤖</div>
      <div id="sd-ai-screen-title">AI Receptionist</div>
      <div id="sd-ai-screen-sub"></div>
      <div id="sd-ai-screen-body"></div>
    </div>
  `;
  document.body.appendChild(overlay);
  _overlayEl = overlay;
}

function _body() { return _overlayEl.querySelector('#sd-ai-screen-body'); }
function _title(t) { _overlayEl.querySelector('#sd-ai-screen-title').textContent = t; }
function _sub(t) { _overlayEl.querySelector('#sd-ai-screen-sub').textContent = t; }
function _show() { _overlayEl.classList.add('sd-ai-screen-show'); }
function _hide() { _overlayEl.classList.remove('sd-ai-screen-show'); }

function _finish(result) {
  if (!_active) return;
  _active = false;
  _hide();
  const r = _resolveFn;
  _resolveFn = null;
  r?.(result);
}

function _renderThinking(message) {
  _sub(message || 'One moment…');
  _body().innerHTML = `<div id="sd-ai-screen-dots"><span></span><span></span><span></span></div>`;
}

function _renderPurposeStep(aiName, ownerLabel) {
  _title(`${aiName} — AI Receptionist`);
  _sub(`Hi! Before I connect you to ${ownerLabel}, what's the purpose of your visit?`);
  const grid = PURPOSE_CHIPS.map((c) => (
    `<button type="button" class="sd-ai-chip${c.key === 'Emergency' ? ' sd-ai-chip-danger' : ''}" data-key="${c.key}">${c.label}</button>`
  )).join('');
  _body().innerHTML = `<div class="sd-ai-chip-grid">${grid}</div>`;

  _overlayEl.querySelectorAll('.sd-ai-chip').forEach((btn) => {
    btn.addEventListener('click', () => _onPurposeSelected(btn.dataset.key, aiName, ownerLabel), { once: true });
  });
}

function _onPurposeSelected(purposeKey, aiName, ownerLabel) {
  if (purposeKey === 'Emergency') {
    _renderThinking('🚨 Understood — connecting you immediately…');
    setTimeout(() => _finish({ cancelled: false, answers: { purposeChip: 'Emergency' } }), 400);
    return;
  }

  const deliveryLike = purposeKey === 'Delivery Partner' || purposeKey === 'Courier';
  const socialLike = purposeKey === 'Family' || purposeKey === 'Friend' || purposeKey === 'Guest';
  const expectedLike = purposeKey === 'Maid' || purposeKey === 'Driver' || purposeKey === 'Technician' || purposeKey === 'Society Staff';

  if (purposeKey === 'Sales Person') {
    _renderThinking('Thanks — connecting you now…');
    setTimeout(() => _finish({ cancelled: false, answers: { purposeChip: purposeKey } }), 350);
    return;
  }

  if (deliveryLike) {
    _sub(`Which company are you from? (optional)`);
    const chips = COMPANY_CHIPS.map((c) => `<button type="button" class="sd-ai-chip" data-company="${c}">${c}</button>`).join('');
    _body().innerHTML = `
      <div class="sd-ai-chip-grid">${chips}</div>
      <input type="text" id="sd-ai-screen-input" maxlength="40" placeholder="Or type company name…" />
      <div id="sd-ai-screen-actions">
        <button type="button" class="sd-ai-screen-btn sd-ai-screen-btn-secondary" id="sd-ai-skip">Skip</button>
        <button type="button" class="sd-ai-screen-btn sd-ai-screen-btn-primary" id="sd-ai-continue">Continue →</button>
      </div>
    `;
    _overlayEl.querySelectorAll('[data-company]').forEach((btn) => {
      btn.addEventListener('click', () => {
        document.getElementById('sd-ai-screen-input').value = btn.dataset.company;
      });
    });
    const finishDelivery = (company) => {
      _renderThinking('Thanks! Connecting you now…');
      setTimeout(() => _finish({ cancelled: false, answers: { purposeChip: purposeKey, company, hasPackage: true } }), 350);
    };
    document.getElementById('sd-ai-continue')?.addEventListener('click', () => {
      finishDelivery(document.getElementById('sd-ai-screen-input')?.value?.trim() || null);
    }, { once: true });
    document.getElementById('sd-ai-skip')?.addEventListener('click', () => finishDelivery(null), { once: true });
    return;
  }

  if (socialLike) {
    _sub(`Who are you here to see? (optional)`);
    _body().innerHTML = `
      <input type="text" id="sd-ai-screen-input" maxlength="60" placeholder="Name (optional)" />
      <div class="sd-ai-chip-grid" style="margin-top:10px;">
        <button type="button" class="sd-ai-chip" data-expected="yes">✅ I'm expected</button>
        <button type="button" class="sd-ai-chip" data-expected="no">🤷 Not expected</button>
      </div>
      <div id="sd-ai-screen-actions">
        <button type="button" class="sd-ai-screen-btn sd-ai-screen-btn-primary" id="sd-ai-continue" style="flex:1;">Continue →</button>
      </div>
    `;
    let expected = null;
    _overlayEl.querySelectorAll('[data-expected]').forEach((btn) => {
      btn.addEventListener('click', () => {
        expected = btn.dataset.expected === 'yes';
        _overlayEl.querySelectorAll('[data-expected]').forEach((b) => b.style.borderColor = 'rgba(255,255,255,0.14)');
        btn.style.borderColor = 'rgba(0,162,232,0.6)';
      });
    });
    document.getElementById('sd-ai-continue')?.addEventListener('click', () => {
      const visitingWhom = document.getElementById('sd-ai-screen-input')?.value?.trim() || null;
      _renderThinking('Thanks! Connecting you now…');
      setTimeout(() => _finish({ cancelled: false, answers: { purposeChip: purposeKey, visitingWhom, expected } }), 350);
    }, { once: true });
    return;
  }

  if (expectedLike) {
    _sub(`Are you expected by ${ownerLabel} today?`);
    _body().innerHTML = `
      <div class="sd-ai-chip-grid">
        <button type="button" class="sd-ai-chip" data-expected="yes">✅ Yes, expected</button>
        <button type="button" class="sd-ai-chip" data-expected="no">🤷 Not sure / No</button>
      </div>
    `;
    _overlayEl.querySelectorAll('[data-expected]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const expected = btn.dataset.expected === 'yes';
        _renderThinking('Thanks! Connecting you now…');
        setTimeout(() => _finish({ cancelled: false, answers: { purposeChip: purposeKey, expected } }), 350);
      }, { once: true });
    });
    return;
  }

  // Unknown Visitor / Other — one free-text question only.
  _sub(`Briefly, why are you here today?`);
  _body().innerHTML = `
    <input type="text" id="sd-ai-screen-input" maxlength="120" placeholder="e.g. Here to drop off documents" />
    <div id="sd-ai-screen-actions">
      <button type="button" class="sd-ai-screen-btn sd-ai-screen-btn-secondary" id="sd-ai-skip">Skip</button>
      <button type="button" class="sd-ai-screen-btn sd-ai-screen-btn-primary" id="sd-ai-continue">Continue →</button>
    </div>
  `;
  const finishOther = (freeText) => {
    _renderThinking('Thanks! Connecting you now…');
    setTimeout(() => _finish({ cancelled: false, answers: { purposeChip: purposeKey, freeText } }), 350);
  };
  document.getElementById('sd-ai-continue')?.addEventListener('click', () => {
    finishOther(document.getElementById('sd-ai-screen-input')?.value?.trim() || null);
  }, { once: true });
  document.getElementById('sd-ai-skip')?.addEventListener('click', () => finishOther(null), { once: true });
}

/**
 * Runs the pre-call screening flow. Resolves with the visitor's raw
 * answers (never blocks longer than the visitor takes to tap through
 * a couple of chips) — classification happens separately via
 * services/aiReceptionist.js#classifyCallPurpose so this file stays
 * pure UI, like js/visitorCallUI.js and js/webrtcCallUI.js.
 *
 * @param {object} opts
 * @param {string} [opts.aiName]
 * @param {string} [opts.ownerLabel]
 * @returns {Promise<{cancelled:boolean, answers?:object}>}
 */
export function runCallScreening({ aiName = 'Priya', ownerLabel = 'the resident' } = {}) {
  if (_active) return Promise.resolve({ cancelled: true });
  _active = true;
  _ensureDom();
  _show();
  _renderPurposeStep(aiName, ownerLabel);

  document.getElementById('sd-ai-screen-close')?.addEventListener('click', () => {
    _finish({ cancelled: true });
  }, { once: true });

  return new Promise((resolve) => { _resolveFn = resolve; });
}

export default { runCallScreening };
