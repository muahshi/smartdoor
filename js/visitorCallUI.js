/**
 * My Smart Door — WebRTC Tap to Talk, Visitor Call UI (Phase 2 UX)
 * js/visitorCallUI.js
 *
 * Self-contained UI layer for the visitor-side call screen (visitor.html).
 * Injects its own overlay markup + styles at runtime, exactly like
 * js/webrtcCallUI.js does for the owner dashboard — never edits
 * visitor.html's existing template/CSS, so it is additive and trivially
 * removable.
 *
 * Pure UI. Does not touch signaling, ICE, SDP, media negotiation,
 * reconnect logic, or the masked-call fallback — it only renders states
 * that services/webrtcCall.js already exposes via onStatus(), plus two
 * small additive hooks (onCallHandle for pre-connect cancel, and the
 * 'owner_answered' status) added to that same file for this purpose.
 *
 * Wired from visitor.html's existing btn-call click handler. Never
 * imported/instantiated unless that handler calls it, so there is zero
 * behavior change for the existing masked-call-only path.
 */

let _overlayEl = null;
let _timerInterval = null;
let _startedAt = null;
let _localStream = null;
let _muted = false;
let _speakerOn = true;
let _remoteAudioEl = null;
let _cancelFn = null;
let _endCallFn = null;
let _active = false; // duplicate-dialog guard — one call screen at a time

function _fmt(totalSeconds) {
  const m = Math.floor(totalSeconds / 60).toString().padStart(2, '0');
  const s = Math.floor(totalSeconds % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}

function _ensureDom() {
  if (_overlayEl) return;

  const style = document.createElement('style');
  style.id = 'sd-visitor-call-styles';
  style.textContent = `
    #sd-vcall-overlay {
      position: fixed; inset: 0; z-index: 99998;
      display: none; align-items: center; justify-content: center;
      background: radial-gradient(circle at 50% 20%, rgba(212,175,55,0.08), rgba(5,6,10,0.94) 60%);
      backdrop-filter: blur(10px); -webkit-backdrop-filter: blur(10px);
      font-family: inherit;
    }
    #sd-vcall-overlay.sd-vcall-show { display: flex; }
    #sd-vcall-card {
      width: min(360px, 92vw); border-radius: 26px; padding: 36px 26px 28px;
      background: linear-gradient(165deg, #14161c 0%, #0a0b0f 100%);
      border: 1px solid rgba(212,175,55,0.22);
      color: #fff; text-align: center;
      box-shadow: 0 24px 70px rgba(0,0,0,0.55), inset 0 1px 0 rgba(255,255,255,0.04);
      animation: sd-vcall-pop 0.28s cubic-bezier(.2,.8,.2,1);
    }
    @keyframes sd-vcall-pop { from { transform: scale(0.94) translateY(8px); opacity: 0; } to { transform: scale(1) translateY(0); opacity: 1; } }

    #sd-vcall-avatar {
      width: 84px; height: 84px; margin: 0 auto 18px; border-radius: 50%;
      display: flex; align-items: center; justify-content: center;
      background: radial-gradient(circle, rgba(212,175,55,0.16), rgba(212,175,55,0.02));
      border: 1.5px solid rgba(212,175,55,0.4); font-size: 34px;
      position: relative;
    }
    #sd-vcall-avatar.sd-vcall-pulse::before {
      content: ''; position: absolute; inset: -8px; border-radius: 50%;
      border: 1.5px solid rgba(212,175,55,0.35);
      animation: sd-vcall-ring 1.6s ease-out infinite;
    }
    @keyframes sd-vcall-ring { 0% { transform: scale(0.9); opacity: 0.9; } 100% { transform: scale(1.5); opacity: 0; } }
    #sd-vcall-avatar.sd-vcall-check { color: #22C55E; border-color: rgba(34,197,94,0.55); animation: sd-vcall-checkpop 0.4s ease-out; }
    @keyframes sd-vcall-checkpop { 0% { transform: scale(0.6); } 60% { transform: scale(1.15); } 100% { transform: scale(1); } }

    #sd-vcall-title { font-size: 19px; font-weight: 700; margin: 2px 0 4px; letter-spacing: 0.2px; }
    #sd-vcall-sub { font-size: 13px; color: #9CA3AF; margin-bottom: 6px; min-height: 16px; }
    #sd-vcall-timer { font-size: 13px; color: #D4AF37; font-variant-numeric: tabular-nums; margin-bottom: 22px; letter-spacing: 0.5px; }
    #sd-vcall-dots { display: flex; justify-content: center; gap: 6px; margin-bottom: 22px; }
    #sd-vcall-dots span { width: 6px; height: 6px; border-radius: 50%; background: rgba(212,175,55,0.35); }
    #sd-vcall-dots span.sd-vcall-dot-active { background: #D4AF37; }

    #sd-vcall-wave { display: flex; align-items: flex-end; justify-content: center; gap: 3px; height: 26px; margin-bottom: 22px; }
    #sd-vcall-wave span { width: 3px; border-radius: 2px; background: #D4AF37; animation: sd-vcall-bar 1s ease-in-out infinite; opacity: 0.85; }
    #sd-vcall-wave span:nth-child(1){height:40%;animation-delay:0s}
    #sd-vcall-wave span:nth-child(2){height:80%;animation-delay:.1s}
    #sd-vcall-wave span:nth-child(3){height:55%;animation-delay:.2s}
    #sd-vcall-wave span:nth-child(4){height:95%;animation-delay:.3s}
    #sd-vcall-wave span:nth-child(5){height:65%;animation-delay:.4s}
    #sd-vcall-wave span:nth-child(6){height:35%;animation-delay:.5s}
    @keyframes sd-vcall-bar { 0%,100% { transform: scaleY(0.5); } 50% { transform: scaleY(1); } }

    #sd-vcall-banner {
      display: none; align-items: center; justify-content: center; gap: 6px;
      font-size: 12px; color: #FBBF24; background: rgba(251,191,36,0.1);
      border: 1px solid rgba(251,191,36,0.28); border-radius: 10px;
      padding: 6px 10px; margin: -10px 0 18px;
    }
    #sd-vcall-banner.sd-vcall-banner-show { display: flex; }

    #sd-vcall-actions { display: flex; gap: 14px; justify-content: center; }
    .sd-vcall-round-btn {
      width: 54px; height: 54px; border-radius: 50%; border: none; cursor: pointer;
      display: flex; align-items: center; justify-content: center; font-size: 20px;
      transition: transform 0.15s ease, background 0.15s ease;
    }
    .sd-vcall-round-btn:active { transform: scale(0.92); }
    .sd-vcall-btn-secondary { background: rgba(255,255,255,0.08); color: #fff; }
    .sd-vcall-btn-secondary.sd-vcall-toggled { background: rgba(212,175,55,0.9); color: #0a0b0f; }
    .sd-vcall-btn-end { background: #EF4444; color: #fff; }
    .sd-vcall-btn-cancel { background: rgba(239,68,68,0.14); color: #F87171; border: 1px solid rgba(239,68,68,0.4); width: 100%; border-radius: 14px; height: 46px; font-size: 14px; font-weight: 600; }

    #sd-vcall-summary { font-size: 13px; color: #9CA3AF; margin-top: -8px; margin-bottom: 4px; }
  `;
  document.head.appendChild(style);

  const overlay = document.createElement('div');
  overlay.id = 'sd-vcall-overlay';
  overlay.innerHTML = `
    <div id="sd-vcall-card">
      <div id="sd-vcall-avatar">🚪</div>
      <div id="sd-vcall-title">Calling…</div>
      <div id="sd-vcall-sub"></div>
      <div id="sd-vcall-banner">🌐 Weak network — reconnecting…</div>
      <div id="sd-vcall-body"></div>
    </div>
  `;
  document.body.appendChild(overlay);
  _overlayEl = overlay;
}

function _body() { return _overlayEl.querySelector('#sd-vcall-body'); }
function _avatar() { return _overlayEl.querySelector('#sd-vcall-avatar'); }
function _title(t) { _overlayEl.querySelector('#sd-vcall-title').textContent = t; }
function _sub(t) { _overlayEl.querySelector('#sd-vcall-sub').textContent = t; }
function _banner(show) { _overlayEl.querySelector('#sd-vcall-banner').classList.toggle('sd-vcall-banner-show', !!show); }

function _stopTimer() {
  if (_timerInterval) { clearInterval(_timerInterval); _timerInterval = null; }
}

function _show() { _overlayEl.classList.add('sd-vcall-show'); }
function _hideEl() { _overlayEl.classList.remove('sd-vcall-show'); }

/**
 * Starts a new visitor call screen. Guards against a duplicate overlay
 * if this is somehow called twice for one call (the button itself is
 * already disabled during a call, this is defense in depth only).
 *
 * @param {object} opts
 * @param {string} [opts.label]  what to show under the door icon (e.g. plate/door label)
 * @param {() => void} [opts.onCancel]  called when the visitor taps Cancel while ringing
 */
function start({ label = 'the resident', onCancel } = {}) {
  if (_active) return;
  _active = true;
  _muted = false;
  _speakerOn = true;
  _startedAt = null;
  _cancelFn = onCancel || null;
  _endCallFn = null;
  _stopTimer();

  _ensureDom();
  _avatar().textContent = '🚪';
  _avatar().className = '';
  _title('Calling…');
  _sub(label);
  _banner(false);
  _body().innerHTML = `<div id="sd-vcall-dots"><span></span><span></span><span></span></div>`;
  _show();
}

/** Drives the visible state from services/webrtcCall.js's onStatus() values. */
function status(name) {
  if (!_active) return;
  _ensureDom();

  if (name === 'connecting') {
    _avatar().className = '';
    _title('Connecting…');
    _sub('Setting up a secure voice call');
    _body().innerHTML = `<div id="sd-vcall-dots"><span></span><span></span><span></span></div>`;
    return;
  }

  if (name === 'ringing') {
    _avatar().className = 'sd-vcall-pulse';
    _title('Ringing…');
    _sub('Waiting for the resident to answer');
    _body().innerHTML = `<button type="button" class="sd-vcall-btn-cancel" id="sd-vcall-cancel-btn">Cancel</button>`;
    document.getElementById('sd-vcall-cancel-btn')?.addEventListener('click', () => {
      document.getElementById('sd-vcall-cancel-btn').disabled = true;
      _cancelFn?.();
    }, { once: true });
    return;
  }

  if (name === 'owner_answered') {
    _avatar().className = 'sd-vcall-check';
    _avatar().textContent = '✓';
    _title('Owner Answered');
    _sub('Connecting voice…');
    _body().innerHTML = `<div id="sd-vcall-dots"><span></span><span></span><span></span></div>`;
    return;
  }

  if (name === 'reconnecting') {
    _banner(true);
    return;
  }

  // 'connected' (without the richer connected() call below reaching us
  // first) or a recovery back to connected after 'reconnecting'.
  if (name === 'connected') {
    _banner(false);
  }
}

/** Switches to the live "Connected" screen — timer, mute, speaker, end call. */
function connected({ localStream, endCall } = {}) {
  if (!_active) return;
  _ensureDom();
  _localStream = localStream || null;
  _endCallFn = endCall || null;
  _startedAt = Date.now();
  _banner(false);

  _avatar().className = '';
  _avatar().textContent = '🔊';
  _title('Connected');
  _sub('Talking with the resident');

  _body().innerHTML = `
    <div id="sd-vcall-wave"><span></span><span></span><span></span><span></span><span></span><span></span></div>
    <div id="sd-vcall-timer">00:00</div>
    <div id="sd-vcall-actions">
      <button type="button" class="sd-vcall-round-btn sd-vcall-btn-secondary" id="sd-vcall-mute" title="Mute">🎤</button>
      <button type="button" class="sd-vcall-round-btn sd-vcall-btn-end" id="sd-vcall-end" title="End call">📞</button>
      <button type="button" class="sd-vcall-round-btn sd-vcall-btn-secondary sd-vcall-toggled" id="sd-vcall-speaker" title="Speaker">🔈</button>
    </div>
  `;

  const timerEl = document.getElementById('sd-vcall-timer');
  _stopTimer();
  _timerInterval = setInterval(() => {
    if (!_startedAt || !timerEl) return;
    timerEl.textContent = _fmt((Date.now() - _startedAt) / 1000);
  }, 250);

  document.getElementById('sd-vcall-mute')?.addEventListener('click', (e) => {
    if (!_localStream) return;
    _muted = !_muted;
    _localStream.getAudioTracks().forEach((t) => { t.enabled = !_muted; });
    e.currentTarget.classList.toggle('sd-vcall-toggled', _muted);
    e.currentTarget.textContent = _muted ? '🔇' : '🎤';
  });

  document.getElementById('sd-vcall-speaker')?.addEventListener('click', (e) => {
    if (!_remoteAudioEl) return;
    _speakerOn = !_speakerOn;
    _remoteAudioEl.muted = !_speakerOn;
    e.currentTarget.classList.toggle('sd-vcall-toggled', _speakerOn);
    e.currentTarget.textContent = _speakerOn ? '🔈' : '🔇';
  });

  document.getElementById('sd-vcall-end')?.addEventListener('click', () => {
    _endCallFn?.();
  }, { once: true });
}

/** Shows the brief "Call Ended" summary, then auto-dismisses. */
function ended({ durationSec = 0 } = {}) {
  if (!_active) { return; }
  _ensureDom();
  _stopTimer();
  _banner(false);
  _avatar().className = '';
  _avatar().textContent = '👋';
  _title('Call Ended');
  _sub(durationSec > 0 ? `Duration ${_fmt(durationSec)}` : '');
  _body().innerHTML = durationSec > 0 ? `<div id="sd-vcall-summary">Thank you!</div>` : '';
  setTimeout(() => close(), durationSec > 0 ? 2200 : 900);
}

/** Immediate dismiss with no summary screen — used for silent-fallback paths (mic denied, offline, rejected, timeout). */
function close() {
  _stopTimer();
  _active = false;
  _startedAt = null;
  _localStream = null;
  _endCallFn = null;
  _cancelFn = null;
  if (_overlayEl) _hideEl();
}

/** One-time wiring of the shared <audio> element the engine plays the remote stream into, so the speaker toggle can mute/unmute it. */
function attachRemoteAudio(el) {
  _remoteAudioEl = el || null;
}

/** Registers (or replaces) the Cancel handler for the current call, independent of start(). */
function setCancelHandle(fn) {
  _cancelFn = fn || null;
}

export const visitorCallUI = { start, status, connected, ended, close, attachRemoteAudio, setCancelHandle };
export default visitorCallUI;
