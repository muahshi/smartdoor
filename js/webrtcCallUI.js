/**
 * Smart Door — WebRTC Tap to Talk, Owner UI (Phase 2 UX upgrade)
 * js/webrtcCallUI.js
 *
 * Self-contained UI glue for the owner dashboard (app.html). Injects its
 * own overlay markup + styles at runtime rather than editing the 1600+
 * line app.html template or 40K css/styles.css — kept additive and
 * isolated so it cannot collide with any existing dashboard CSS class
 * name, and is trivially removable (Rule 3 / Rule 4 rollback).
 *
 * Wired from js/dashboard.js's existing _setupRealtime() (same place
 * joinOwnerPresence() is already called) via initOwnerCallUI(ownerId).
 * Does nothing until services/webrtcOwnerCall.js's guard resolves
 * WebRTC enabled for this owner (kill switch / global flag / per-owner
 * opt-in) — no overlay is ever injected into the DOM for an owner who
 * isn't opted in, so there is zero visual or behavioral change for
 * every existing owner today.
 *
 * UX UPGRADE (this revision): richer states — a caller card (door/plate
 * id, since no visitor name/phone crosses the signaling channel today),
 * a live call timer, and mute/speaker controls fed by the localStream
 * services/webrtcOwnerCall.js now hands back alongside hangUp. None of
 * the accept()/reject()/hangUp() call-handling logic below changed —
 * this file only renders what that service already reports.
 */

import { listenForIncomingCalls } from '../services/webrtcOwnerCall.js';
import { getRecentCallScreening } from '../services/aiReceptionist.js';

let _overlayEl = null;
let _remoteAudioEl = null;
let _timerInterval = null;
let _startedAt = null;
let _localStream = null;
let _muted = false;

function _fmt(totalSeconds) {
  const m = Math.floor(totalSeconds / 60).toString().padStart(2, '0');
  const s = Math.floor(totalSeconds % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}

function _stopTimer() {
  if (_timerInterval) { clearInterval(_timerInterval); _timerInterval = null; }
}

function _ensureDom() {
  if (_overlayEl) return;

  const style = document.createElement('style');
  style.id = 'sd-rtc-call-ui-styles';
  style.textContent = `
    #sd-rtc-overlay {
      position: fixed; inset: 0; z-index: 99999;
      display: none; align-items: center; justify-content: center;
      background: radial-gradient(circle at 50% 20%, rgba(212,175,55,0.08), rgba(5,6,10,0.94) 60%);
      backdrop-filter: blur(10px); -webkit-backdrop-filter: blur(10px);
      font-family: inherit;
    }
    #sd-rtc-overlay.sd-rtc-show { display: flex; }
    #sd-rtc-card {
      width: min(360px, 92vw); border-radius: 26px; padding: 30px 26px 26px;
      background: linear-gradient(165deg, #14161c 0%, #0a0b0f 100%);
      border: 1px solid rgba(212,175,55,0.22);
      color: #fff; text-align: center;
      box-shadow: 0 24px 70px rgba(0,0,0,0.55), inset 0 1px 0 rgba(255,255,255,0.04);
      animation: sd-rtc-pop 0.28s cubic-bezier(.2,.8,.2,1);
    }
    @keyframes sd-rtc-pop { from { transform: scale(0.94) translateY(8px); opacity: 0; } to { transform: scale(1) translateY(0); opacity: 1; } }

    #sd-rtc-avatar {
      width: 72px; height: 72px; margin: 0 auto 14px; border-radius: 50%;
      display: flex; align-items: center; justify-content: center;
      background: radial-gradient(circle, rgba(212,175,55,0.16), rgba(212,175,55,0.02));
      border: 1.5px solid rgba(212,175,55,0.4); font-size: 30px; position: relative;
    }
    #sd-rtc-avatar.sd-rtc-pulse::before {
      content: ''; position: absolute; inset: -8px; border-radius: 50%;
      border: 1.5px solid rgba(212,175,55,0.35);
      animation: sd-rtc-ring 1.6s ease-out infinite;
    }
    @keyframes sd-rtc-ring { 0% { transform: scale(0.9); opacity: 0.9; } 100% { transform: scale(1.5); opacity: 0; } }

    #sd-rtc-card-box {
      background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.06);
      border-radius: 14px; padding: 10px 14px; margin-bottom: 18px; text-align: left;
    }
    #sd-rtc-card-plate { font-size: 15px; font-weight: 700; color: #fff; }
    #sd-rtc-card-purpose { font-size: 12px; color: #9CA3AF; margin-top: 2px; }
    #sd-rtc-transcript-toggle {
      display: none; margin-top: 8px; background: none; border: none;
      color: #00A2E8; font-size: 11px; font-weight: 600; cursor: pointer; padding: 0;
    }
    #sd-rtc-transcript-panel {
      display: none; margin-top: 8px; max-height: 140px; overflow-y: auto;
      border-top: 1px solid rgba(255,255,255,0.08); padding-top: 8px;
    }
    #sd-rtc-transcript-panel.sd-rtc-tp-show { display: block; }
    .sd-rtc-tp-row { font-size: 11px; margin-bottom: 6px; line-height: 1.4; }
    .sd-rtc-tp-q { color: #9CA3AF; }
    .sd-rtc-tp-a { color: #E2ECF4; font-style: italic; }

    #sd-rtc-title { font-size: 19px; font-weight: 700; margin: 4px 0 2px; }
    #sd-rtc-sub { font-size: 13px; color: #9CA3AF; margin-bottom: 18px; }
    #sd-rtc-timer { font-size: 13px; color: #D4AF37; font-variant-numeric: tabular-nums; margin: -10px 0 18px; letter-spacing: 0.5px; }

    #sd-rtc-banner {
      display: none; align-items: center; justify-content: center; gap: 6px;
      font-size: 12px; color: #FBBF24; background: rgba(251,191,36,0.1);
      border: 1px solid rgba(251,191,36,0.28); border-radius: 10px;
      padding: 6px 10px; margin: -10px 0 18px;
    }
    #sd-rtc-banner.sd-rtc-banner-show { display: flex; }

    #sd-rtc-actions { display: flex; gap: 12px; justify-content: center; }
    .sd-rtc-btn {
      flex: 1; padding: 13px 0; border-radius: 14px; border: none;
      font-size: 15px; font-weight: 600; cursor: pointer;
    }
    #sd-rtc-accept { background: #22C55E; color: #fff; }
    #sd-rtc-reject { background: #EF4444; color: #fff; }
    #sd-rtc-hangup { background: #EF4444; color: #fff; width: 100%; }

    .sd-rtc-round-btn {
      width: 52px; height: 52px; border-radius: 50%; border: none; cursor: pointer;
      display: flex; align-items: center; justify-content: center; font-size: 19px;
      transition: transform 0.15s ease, background 0.15s ease; flex: none;
    }
    .sd-rtc-round-btn:active { transform: scale(0.92); }
    .sd-rtc-btn-secondary { background: rgba(255,255,255,0.08); color: #fff; }
    .sd-rtc-btn-secondary.sd-rtc-toggled { background: rgba(212,175,55,0.9); color: #0a0b0f; }
  `;
  document.head.appendChild(style);

  const overlay = document.createElement('div');
  overlay.id = 'sd-rtc-overlay';
  overlay.innerHTML = `
    <div id="sd-rtc-card">
      <div id="sd-rtc-avatar">📞</div>
      <div id="sd-rtc-card-box">
        <div id="sd-rtc-card-plate">Someone's at the door</div>
        <div id="sd-rtc-card-purpose">Incoming Tap to Talk call</div>
        <button type="button" id="sd-rtc-transcript-toggle">🗒️ View conversation</button>
        <div id="sd-rtc-transcript-panel"></div>
      </div>
      <div id="sd-rtc-title">Ringing…</div>
      <div id="sd-rtc-sub"></div>
      <div id="sd-rtc-banner">🌐 Weak network — reconnecting…</div>
      <div id="sd-rtc-actions">
        <button type="button" class="sd-rtc-btn" id="sd-rtc-reject">Decline</button>
        <button type="button" class="sd-rtc-btn" id="sd-rtc-accept">Accept</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);
  _overlayEl = overlay;

  const audio = document.createElement('audio');
  audio.id = 'sd-rtc-remote-audio';
  audio.autoplay = true;
  audio.setAttribute('playsinline', '');
  audio.style.display = 'none';
  document.body.appendChild(audio);
  _remoteAudioEl = audio;
}

function _show() { _overlayEl.classList.add('sd-rtc-show'); }
function _hide() { _overlayEl.classList.remove('sd-rtc-show'); }
function _banner(on) { _overlayEl.querySelector('#sd-rtc-banner').classList.toggle('sd-rtc-banner-show', !!on); }

function _setRinging(plateId) {
  _overlayEl.querySelector('#sd-rtc-avatar').className = 'sd-rtc-pulse';
  _overlayEl.querySelector('#sd-rtc-avatar').textContent = '📞';
  _overlayEl.querySelector('#sd-rtc-card-plate').textContent = plateId ? `Door ${plateId}` : "Someone's at the door";
  _overlayEl.querySelector('#sd-rtc-card-purpose').textContent = 'Incoming Tap to Talk call';
  const toggleEl = _overlayEl.querySelector('#sd-rtc-transcript-toggle');
  const panelEl = _overlayEl.querySelector('#sd-rtc-transcript-panel');
  if (toggleEl) { toggleEl.style.display = 'none'; toggleEl.onclick = null; }
  if (panelEl) { panelEl.classList.remove('sd-rtc-tp-show'); panelEl.innerHTML = ''; }
  _overlayEl.querySelector('#sd-rtc-title').textContent = "Someone's at the door";
  _overlayEl.querySelector('#sd-rtc-sub').textContent = 'Incoming Tap to Talk call…';
  _banner(false);
  _overlayEl.querySelector('#sd-rtc-actions').innerHTML = `
    <button type="button" class="sd-rtc-btn" id="sd-rtc-reject">Decline</button>
    <button type="button" class="sd-rtc-btn" id="sd-rtc-accept">Accept</button>
  `;
}

// AI Receptionist enrichment — purely additive. Called after _setRinging()
// once (if) a fresh pre-call screening is found for this owner+plate
// (services/aiReceptionist.js). Never touches accept()/reject()/hangUp()
// or any signaling — it only replaces the static "Incoming Tap to Talk
// call" line with the structured summary the visitor's screening produced.
const _ACTION_BADGE = {
  Accept: '✅ Recommended: Accept',
  Decline: '🚫 Recommended: Decline',
  Blocked: '🚫 Likely spam',
  'Ask Owner': '❓ Ask before accepting',
  'Notify Owner': 'ℹ️ For your awareness',
};

function _renderScreeningOnCard(callId, getCurrentCallId, screening) {
  // Guard against a stale async response landing after this call ended
  // or a different call started ringing.
  if (!_overlayEl || getCurrentCallId() !== callId || !screening) return;
  const plateLine = _overlayEl.querySelector('#sd-rtc-card-plate');
  const purposeLine = _overlayEl.querySelector('#sd-rtc-card-purpose');
  if (!plateLine || !purposeLine) return;

  if (screening.visitorName) {
    plateLine.textContent = screening.visitorName;
  } else if (screening.company) {
    plateLine.textContent = `${screening.visitorType} (${screening.company})`;
  } else {
    plateLine.textContent = screening.visitorType;
  }

  const confidencePct = Number.isFinite(screening.confidence) ? `${Math.round(screening.confidence * 100)}%` : null;
  const actionBadge = _ACTION_BADGE[screening.suggestedAction] || '';
  const modeBadge = screening.conversationMode === 'voice' ? '🎙️ Voice AI' : screening.conversationMode === 'voice_manual_fallback' ? '🎙️→⌨️ Voice (typed)' : '⌨️ Quick-select';
  purposeLine.innerHTML = `
    ${screening.aiSummary || screening.visitorType}
    <br/><span style="opacity:0.6;">${modeBadge}</span>
    ${confidencePct ? `<br/><span style="opacity:0.75;">Confidence ${confidencePct}</span>` : ''}
    ${actionBadge ? `<br/><span style="color:#D4AF37;">${actionBadge}</span>` : ''}
    ${screening.ruleMatched ? `<br/><span style="color:#7DD3FC;">⚙️ Rule: ${screening.ruleMatched}</span>` : ''}
  `;

  // Full conversation transcript — collapsed by default, expandable.
  // Purely additive: if there's no transcript (or an older row predating
  // migration 53), the toggle simply stays hidden.
  const toggleEl = _overlayEl.querySelector('#sd-rtc-transcript-toggle');
  const panelEl = _overlayEl.querySelector('#sd-rtc-transcript-panel');
  const transcript = Array.isArray(screening.transcript) ? screening.transcript.filter((t) => t && (t.question || t.answer)) : [];
  if (toggleEl && panelEl && transcript.length) {
    toggleEl.style.display = 'inline-block';
    panelEl.innerHTML = transcript.map((t) => `
      <div class="sd-rtc-tp-row">
        <div class="sd-rtc-tp-q">${t.question ? `🤖 ${_escHtml(t.question)}` : ''}</div>
        <div class="sd-rtc-tp-a">${t.answer ? `🙋 ${_escHtml(t.answer)}` : '🙋 (no response)'}</div>
      </div>
    `).join('');
    toggleEl.onclick = () => {
      const show = !panelEl.classList.contains('sd-rtc-tp-show');
      panelEl.classList.toggle('sd-rtc-tp-show', show);
      toggleEl.textContent = show ? '🗒️ Hide conversation' : '🗒️ View conversation';
    };
  }
}

function _escHtml(str) {
  return String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function _setConnected() {
  _stopTimer();
  _startedAt = Date.now();
  _overlayEl.querySelector('#sd-rtc-avatar').className = '';
  _overlayEl.querySelector('#sd-rtc-avatar').textContent = '🔊';
  _overlayEl.querySelector('#sd-rtc-title').textContent = 'Connected';
  _overlayEl.querySelector('#sd-rtc-sub').textContent = 'Talking with your visitor';
  _banner(false);
  _overlayEl.querySelector('#sd-rtc-actions').innerHTML = `
    <button type="button" class="sd-rtc-round-btn sd-rtc-btn-secondary" id="sd-rtc-mute" title="Mute">🎤</button>
    <button type="button" class="sd-rtc-btn" id="sd-rtc-hangup">End Call</button>
    <button type="button" class="sd-rtc-round-btn sd-rtc-btn-secondary sd-rtc-toggled" id="sd-rtc-speaker" title="Speaker">🔈</button>
  `;
  let timerEl = document.getElementById('sd-rtc-timer');
  if (!timerEl) {
    timerEl = document.createElement('div');
    timerEl.id = 'sd-rtc-timer';
    _overlayEl.querySelector('#sd-rtc-sub').insertAdjacentElement('afterend', timerEl);
  }
  timerEl.textContent = '00:00';
  _timerInterval = setInterval(() => {
    if (!_startedAt) return;
    timerEl.textContent = _fmt((Date.now() - _startedAt) / 1000);
  }, 250);

  document.getElementById('sd-rtc-mute')?.addEventListener('click', (e) => {
    if (!_localStream) return;
    _muted = !_muted;
    _localStream.getAudioTracks().forEach((t) => { t.enabled = !_muted; });
    e.currentTarget.classList.toggle('sd-rtc-toggled', _muted);
    e.currentTarget.textContent = _muted ? '🔇' : '🎤';
  });
  document.getElementById('sd-rtc-speaker')?.addEventListener('click', (e) => {
    if (!_remoteAudioEl) return;
    _remoteAudioEl.muted = !_remoteAudioEl.muted;
    e.currentTarget.classList.toggle('sd-rtc-toggled', !_remoteAudioEl.muted);
    e.currentTarget.textContent = _remoteAudioEl.muted ? '🔇' : '🔈';
  });
}

// PRODUCTION HARDENING (Fix 4): shown during a transient post-connect ICE
// drop instead of leaving the "Connected" label up (misleading) or
// hiding the overlay (which would orphan the still-open peer
// connection/mic). The End Call button stays available throughout.
function _setReconnecting() {
  _banner(true);
  _overlayEl.querySelector('#sd-rtc-title').textContent = 'Reconnecting…';
  _overlayEl.querySelector('#sd-rtc-sub').textContent = 'Call may recover automatically';
  if (!document.getElementById('sd-rtc-hangup')) {
    _overlayEl.querySelector('#sd-rtc-actions').innerHTML = `
      <button type="button" class="sd-rtc-btn" id="sd-rtc-hangup">End Call</button>
    `;
  }
}

function _setConnecting() {
  _overlayEl.querySelector('#sd-rtc-avatar').className = '';
  _overlayEl.querySelector('#sd-rtc-avatar').textContent = '⏳';
  _overlayEl.querySelector('#sd-rtc-title').textContent = 'Connecting…';
  _overlayEl.querySelector('#sd-rtc-sub').textContent = 'Setting up a secure voice call';
  _banner(false);
  _overlayEl.querySelector('#sd-rtc-actions').innerHTML = '';
}

function _resetLocalState() {
  _stopTimer();
  _startedAt = null;
  _localStream = null;
  _muted = false;
  const timerEl = document.getElementById('sd-rtc-timer');
  timerEl?.remove();
}

/**
 * Wires the Incoming Call overlay into the owner dashboard for one owner.
 * Safe to call unconditionally from dashboard.js — resolves to a no-op
 * cleanup and injects nothing into the DOM if WebRTC isn't enabled for
 * this owner.
 *
 * @param {string} ownerId
 * @returns {Promise<() => void>}
 */
export async function initOwnerCallUI(ownerId) {
  // PRODUCTION HARDENING (Fix 3): tracks the callId currently shown in
  // the overlay so an onCallClaimedElsewhere() for a DIFFERENT (stale)
  // callId is correctly ignored, and a matching one dismisses this tab's
  // overlay cleanly.
  let _currentCallId = null;
  // PRODUCTION HARDENING (Fix 2): the real hang-up control for whatever
  // call is currently connected on this tab — set once onConnected()
  // fires, cleared on end. Replaces the old handler that only hid the
  // overlay without closing the peer connection or releasing the mic.
  let _activeHangUp = null;

  // PRODUCTION HARDENING (Fix 2): the button now actually ends the call
  // — sends the hangup signal, closes the peer connection, and releases
  // the microphone — instead of only hiding the overlay while the call/
  // mic stayed open underneath it. Shared by both the "connected" and
  // "reconnecting" states since #sd-rtc-actions' markup (and therefore
  // the button element) is replaced each time either renders.
  const _wireHangupButton = () => {
    document.getElementById('sd-rtc-hangup')?.addEventListener('click', () => {
      _activeHangUp?.();
      _activeHangUp = null;
      _currentCallId = null;
      _resetLocalState();
      _hide();
    }, { once: true });
  };

  const unsubscribe = await listenForIncomingCalls(ownerId, {
    onIncomingCall: ({ callId, plateId, accept, reject }) => {
      _currentCallId = callId;
      console.log(`[RTC-TRACE] 8 Popup shown | File=js/webrtcCallUI.js ownerId=${ownerId} callId=${callId}`);
      _ensureDom();
      _setRinging(plateId);
      _show();

      // AI Receptionist enrichment — best-effort, never delays the ring
      // itself (overlay is already shown above with the generic card).
      // Looks up the freshest pre-call screening for this owner+plate;
      // a stale/missing result silently leaves the generic card as-is.
      getRecentCallScreening(ownerId, plateId).then((screening) => {
        _renderScreeningOnCard(callId, () => _currentCallId, screening);
      }).catch(() => {});

      const acceptBtn = document.getElementById('sd-rtc-accept');
      const rejectBtn = document.getElementById('sd-rtc-reject');

      const onAccept = async () => {
        _setConnecting();
        await accept();
      };
      const onReject = () => {
        reject();
        _currentCallId = null;
        _hide();
      };

      acceptBtn?.addEventListener('click', onAccept, { once: true });
      rejectBtn?.addEventListener('click', onReject, { once: true });
    },

    // PRODUCTION HARDENING (Fix 3): another tab/device of this owner
    // answered first. If this tab is still showing the ringing overlay
    // for the SAME call, dismiss it quietly — no error, just "handled
    // elsewhere." If this tab shows a different/older call, ignore.
    onCallClaimedElsewhere: (callId) => {
      if (callId !== _currentCallId) return;
      _currentCallId = null;
      _hide();
    },

    onConnected: (remoteStream, { hangUp, localStream } = {}) => {
      _ensureDom();
      _remoteAudioEl.srcObject = remoteStream;
      _remoteAudioEl.play().catch(() => {});
      _localStream = localStream || null;
      _setConnected();
      _activeHangUp = hangUp || null;
      _wireHangupButton();
    },

    // PRODUCTION HARDENING (Fix 4): transient post-connect ICE drop —
    // update the label but keep the overlay (and the working hangup
    // button) up; do not treat this as the call ending.
    onStatus: (status) => {
      _ensureDom();
      if (status === 'reconnecting') {
        _setReconnecting();
        _wireHangupButton();
      } else if (status === 'connected') {
        _setConnected();
        _wireHangupButton();
      }
    },

    onEnded: () => {
      _activeHangUp = null;
      _currentCallId = null;
      _resetLocalState();
      _hide();
    },
  });

  return unsubscribe || (() => {});
}

export default { initOwnerCallUI };
