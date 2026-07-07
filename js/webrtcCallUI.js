/**
 * Smart Door — WebRTC Tap to Talk, Owner UI (Phase 2)
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
 */

import { listenForIncomingCalls } from '../services/webrtcOwnerCall.js';

let _overlayEl = null;
let _remoteAudioEl = null;

function _ensureDom() {
  if (_overlayEl) return;

  const style = document.createElement('style');
  style.id = 'sd-rtc-call-ui-styles';
  style.textContent = `
    #sd-rtc-overlay {
      position: fixed; inset: 0; z-index: 99999;
      display: none; align-items: center; justify-content: center;
      background: rgba(15, 23, 42, 0.72); backdrop-filter: blur(4px);
      font-family: inherit;
    }
    #sd-rtc-overlay.sd-rtc-show { display: flex; }
    #sd-rtc-card {
      width: min(340px, 90vw); border-radius: 20px; padding: 28px 24px;
      background: #0F172A; color: #fff; text-align: center;
      box-shadow: 0 20px 60px rgba(0,0,0,0.45);
      animation: sd-rtc-pop 0.25s ease-out;
    }
    @keyframes sd-rtc-pop { from { transform: scale(0.92); opacity: 0; } to { transform: scale(1); opacity: 1; } }
    #sd-rtc-icon { font-size: 42px; margin-bottom: 8px; animation: sd-rtc-pulse 1.4s ease-in-out infinite; }
    @keyframes sd-rtc-pulse { 0%,100% { transform: scale(1); } 50% { transform: scale(1.12); } }
    #sd-rtc-title { font-size: 18px; font-weight: 700; margin: 4px 0 2px; }
    #sd-rtc-sub { font-size: 13px; color: #94A3B8; margin-bottom: 20px; }
    #sd-rtc-actions { display: flex; gap: 12px; }
    .sd-rtc-btn {
      flex: 1; padding: 13px 0; border-radius: 14px; border: none;
      font-size: 15px; font-weight: 600; cursor: pointer;
    }
    #sd-rtc-accept { background: #22C55E; color: #fff; }
    #sd-rtc-reject { background: #EF4444; color: #fff; }
    #sd-rtc-hangup { background: #EF4444; color: #fff; width: 100%; }
  `;
  document.head.appendChild(style);

  const overlay = document.createElement('div');
  overlay.id = 'sd-rtc-overlay';
  overlay.innerHTML = `
    <div id="sd-rtc-card">
      <div id="sd-rtc-icon">📞</div>
      <div id="sd-rtc-title">Someone's at the door</div>
      <div id="sd-rtc-sub">Incoming Tap to Talk call…</div>
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

function _setRinging(plateId) {
  _overlayEl.querySelector('#sd-rtc-icon').textContent = '📞';
  _overlayEl.querySelector('#sd-rtc-title').textContent = "Someone's at the door";
  _overlayEl.querySelector('#sd-rtc-sub').textContent = 'Incoming Tap to Talk call…';
  _overlayEl.querySelector('#sd-rtc-actions').innerHTML = `
    <button type="button" class="sd-rtc-btn" id="sd-rtc-reject">Decline</button>
    <button type="button" class="sd-rtc-btn" id="sd-rtc-accept">Accept</button>
  `;
}

function _setConnected() {
  _overlayEl.querySelector('#sd-rtc-icon').textContent = '🔊';
  _overlayEl.querySelector('#sd-rtc-title').textContent = 'Connected';
  _overlayEl.querySelector('#sd-rtc-sub').textContent = 'Talking with your visitor';
  _overlayEl.querySelector('#sd-rtc-actions').innerHTML = `
    <button type="button" class="sd-rtc-btn" id="sd-rtc-hangup">End Call</button>
  `;
}

// PRODUCTION HARDENING (Fix 4): shown during a transient post-connect ICE
// drop instead of leaving the "Connected" label up (misleading) or
// hiding the overlay (which would orphan the still-open peer
// connection/mic). The End Call button stays available throughout.
function _setReconnecting() {
  _overlayEl.querySelector('#sd-rtc-icon').textContent = '🔄';
  _overlayEl.querySelector('#sd-rtc-title').textContent = 'Reconnecting…';
  _overlayEl.querySelector('#sd-rtc-sub').textContent = 'Call may recover automatically';
  _overlayEl.querySelector('#sd-rtc-actions').innerHTML = `
    <button type="button" class="sd-rtc-btn" id="sd-rtc-hangup">End Call</button>
  `;
}

function _setConnecting() {
  _overlayEl.querySelector('#sd-rtc-icon').textContent = '⏳';
  _overlayEl.querySelector('#sd-rtc-title').textContent = 'Connecting…';
  _overlayEl.querySelector('#sd-rtc-sub').textContent = 'Setting up a secure voice call';
  _overlayEl.querySelector('#sd-rtc-actions').innerHTML = '';
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
      _hide();
    }, { once: true });
  };

  const unsubscribe = await listenForIncomingCalls(ownerId, {
    onIncomingCall: ({ callId, plateId, accept, reject }) => {
      _currentCallId = callId;
      _ensureDom();
      _setRinging(plateId);
      _show();

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

    onConnected: (remoteStream, { hangUp } = {}) => {
      _ensureDom();
      _remoteAudioEl.srcObject = remoteStream;
      _remoteAudioEl.play().catch(() => {});
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
      _hide();
    },
  });

  return unsubscribe || (() => {});
}

export default { initOwnerCallUI };
