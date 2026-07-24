/**
 * My Smart Door — AI Voice Receptionist, Pre-Call Voice UI
 * js/aiVoiceReceptionistUI.js
 *
 * Production voice layer on top of the existing chip-based AI Call
 * Screening (js/aiCallScreeningUI.js) and its classifier
 * (services/aiReceptionist.js) — this module answers the visitor's Call
 * tap the way a real receptionist would: it speaks first, listens for
 * natural speech, asks only the minimum follow-up questions, then hands
 * off to the same classification/persistence code the chip flow already
 * used. It does not replace js/aiCallScreeningUI.js — it is tried first,
 * and falls back to it automatically and transparently whenever speech
 * APIs are unavailable, denied, or fail mid-conversation.
 *
 * Self-contained UI layer, injected/styled at runtime exactly like
 * js/aiCallScreeningUI.js and js/webrtcCallUI.js do — never edits
 * visitor.html's existing template or CSS. Wired from visitor.html's
 * existing btn-call click handler, in the same place runCallScreening()
 * was called — before attemptTapToTalk()/initiateMaskedCall(), neither of
 * which this file touches.
 *
 * Does not touch services/webrtcCall.js, services/webrtcOwnerCall.js,
 * services/webrtcSignaling.js, or any ICE/STUN/TURN/signaling code.
 */

import { conductVoiceTurn, finalizeVoiceScreening, MAX_VOICE_TURNS } from '../services/aiVoiceReceptionist.js';

const SILENCE_TIMEOUT_MS = 6500;   // how long to listen before treating the visitor as silent
const MAX_SILENT_RETRIES = 2;      // consecutive silent turns before giving up gracefully

let _overlayEl = null;
let _active = false;
let _resolveFn = null;
let _recognition = null;
let _speechSynth = null;
let _voiceCache = null;
let _aiVoiceGender = 'female';
let _speaking = false;
let _listening = false;
let _cancelledByUser = false;

// ────────── feature detection ──────────

/**
 * True only if both STT and TTS are present AND usable (some embedded
 * WebViews expose the constructors but throw on construction/permission).
 * Never throws — any doubt resolves to "unsupported" so the caller falls
 * back to the proven chip UI instead of guessing.
 */
export function isVoiceReceptionistSupported() {
  try {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR || !window.speechSynthesis || typeof window.SpeechSynthesisUtterance !== 'function') return false;
    return true;
  } catch (_) {
    return false;
  }
}

// ────────── TTS (self-contained — does not reuse visitor.html's internal speak()) ──────────

function _initVoiceCache() {
  if (!_speechSynth) return;
  const pick = () => {
    const voices = _speechSynth.getVoices();
    const wantMale = _aiVoiceGender === 'male';
    const genderWord = wantMale ? 'male' : 'female';
    _voiceCache =
      voices.find((v) => v.lang === 'hi-IN' && v.name.toLowerCase().includes(genderWord)) ||
      voices.find((v) => v.lang === 'hi-IN') ||
      voices.find((v) => v.lang.startsWith('hi')) ||
      voices.find((v) => v.lang === 'en-IN') ||
      null;
  };
  pick();
  _speechSynth.onvoiceschanged = pick;
}

function _speak(text, lang = 'hi-IN') {
  return new Promise((resolve) => {
    if (!_speechSynth || !text) { resolve(); return; }
    try {
      _speechSynth.cancel();
      const utt = new SpeechSynthesisUtterance(text);
      utt.lang = lang;
      utt.rate = 0.92;
      utt.pitch = _aiVoiceGender === 'male' ? 0.88 : 1.05;
      utt.volume = 1;
      if (_voiceCache) utt.voice = _voiceCache;
      _speaking = true;
      _setAvatarState('speaking');
      utt.onend = () => { _speaking = false; resolve(); };
      utt.onerror = () => { _speaking = false; resolve(); };
      _speechSynth.speak(utt);
    } catch (_) {
      _speaking = false;
      resolve();
    }
  });
}

function _stopSpeaking() {
  try { _speechSynth?.cancel(); } catch (_) {}
  _speaking = false;
}

// ────────── STT ──────────

/**
 * Listens once, racing against SILENCE_TIMEOUT_MS. Resolves with the
 * transcript ('' if silent/timeout/error) — never rejects, so a caller
 * can always proceed with whatever it got.
 */
function _listenOnce(lang = 'hi-IN') {
  return new Promise((resolve) => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) { resolve(''); return; }
    let settled = false;
    const finish = (val) => {
      if (settled) return;
      settled = true;
      _listening = false;
      _setAvatarState('idle');
      clearTimeout(timer);
      try { _recognition?.stop(); } catch (_) {}
      resolve(val);
    };

    try {
      _recognition = new SR();
      _recognition.lang = lang;
      _recognition.interimResults = false;
      _recognition.maxAlternatives = 1;
      _recognition.onresult = (e) => finish(e.results?.[0]?.[0]?.transcript || '');
      _recognition.onerror = () => finish('');
      _recognition.onend = () => finish('');
      _listening = true;
      _setAvatarState('listening');
      _recognition.start();
    } catch (_) {
      finish('');
      return;
    }

    const timer = setTimeout(() => finish(''), SILENCE_TIMEOUT_MS);
  });
}

function _stopListening() {
  try { _recognition?.stop(); } catch (_) {}
  _listening = false;
}

// ────────── language detection (mirrors visitor.html's detectLang, kept local — self-contained module) ──────────

function _detectLang(text) {
  if (!text) return 'hi-IN';
  if (/[\u0900-\u097F]/.test(text)) return 'hi-IN';
  const hinglishWords = /\b(kya|hai|hoon|aap|main|mujhe|yahan|thik|accha|nahi|abhi|bhai|didi|ji|kaisa|bahut|aana|jana|karo|mera|tera|humara|tumhara|ghar|bahar|andar|sahib|madam|paisa|kaam|shukriya|namaste|theek)\b/i;
  if (hinglishWords.test(text)) return 'hi-IN';
  return 'en-IN';
}

// ────────── DOM ──────────

function _ensureDom() {
  if (_overlayEl) return;

  const style = document.createElement('style');
  style.id = 'sd-ai-voice-styles';
  style.textContent = `
    #sd-ai-voice-overlay {
      position: fixed; inset: 0; z-index: 99998;
      display: none; align-items: center; justify-content: center;
      background: radial-gradient(circle at 50% 20%, rgba(0,162,232,0.10), rgba(5,6,10,0.95) 60%);
      backdrop-filter: blur(10px); -webkit-backdrop-filter: blur(10px);
      font-family: inherit;
    }
    #sd-ai-voice-overlay.sd-ai-voice-show { display: flex; }
    #sd-ai-voice-card {
      width: min(380px, 92vw); max-height: 86vh; overflow-y: auto;
      border-radius: 24px; padding: 30px 22px 22px;
      background: linear-gradient(165deg, #10151c 0%, #0a0b0f 100%);
      border: 1px solid rgba(0,162,232,0.28);
      color: #fff; text-align: center;
      box-shadow: 0 24px 70px rgba(0,0,0,0.55), inset 0 1px 0 rgba(255,255,255,0.04);
      animation: sd-ai-voice-pop 0.28s cubic-bezier(.2,.8,.2,1);
      position: relative;
    }
    @keyframes sd-ai-voice-pop { from { transform: scale(0.94) translateY(8px); opacity: 0; } to { transform: scale(1) translateY(0); opacity: 1; } }

    #sd-ai-voice-close {
      position: absolute; top: 14px; right: 14px; background: none; border: none;
      color: rgba(255,255,255,0.4); font-size: 18px; cursor: pointer; line-height: 1;
    }
    #sd-ai-voice-fallback {
      position: absolute; top: 14px; left: 14px; background: none; border: none;
      color: rgba(0,162,232,0.75); font-size: 11px; font-weight: 600; cursor: pointer;
      text-decoration: underline; text-underline-offset: 2px;
    }

    #sd-ai-voice-avatar {
      width: 84px; height: 84px; margin: 8px auto 14px; border-radius: 50%;
      display: flex; align-items: center; justify-content: center;
      background: radial-gradient(circle, rgba(0,162,232,0.2), rgba(0,162,232,0.02));
      border: 1.5px solid rgba(0,162,232,0.4); font-size: 34px; position: relative;
      cursor: pointer; transition: transform 0.15s ease;
    }
    #sd-ai-voice-avatar:active { transform: scale(0.94); }
    #sd-ai-voice-avatar.sd-av-speaking::before,
    #sd-ai-voice-avatar.sd-av-listening::before {
      content: ''; position: absolute; inset: -10px; border-radius: 50%;
      border: 1.5px solid rgba(0,162,232,0.4); animation: sd-av-ring 1.3s ease-out infinite;
    }
    #sd-ai-voice-avatar.sd-av-listening::before { border-color: rgba(34,197,94,0.5); }
    @keyframes sd-av-ring { 0% { transform: scale(0.9); opacity: 0.9; } 100% { transform: scale(1.55); opacity: 0; } }

    #sd-ai-voice-state { font-size: 12px; font-weight: 600; letter-spacing: 0.3px; color: #00A2E8; margin-bottom: 4px; text-transform: uppercase; }
    #sd-ai-voice-caption { font-size: 15px; font-weight: 600; color: #fff; min-height: 44px; line-height: 1.4; margin-bottom: 10px; }
    #sd-ai-voice-transcript-line { font-size: 13px; color: #9CA3AF; min-height: 20px; margin-bottom: 16px; font-style: italic; }

    #sd-ai-voice-hint { font-size: 11px; color: rgba(255,255,255,0.4); margin-bottom: 14px; }

    #sd-ai-voice-actions { display: flex; gap: 10px; justify-content: center; }
    .sd-ai-voice-btn {
      padding: 10px 18px; border-radius: 12px; border: none;
      font-size: 13px; font-weight: 600; cursor: pointer;
      background: rgba(255,255,255,0.08); color: #cbd5e1;
    }
    .sd-ai-voice-btn-primary { background: linear-gradient(135deg,#00A2E8,#0066cc); color: #fff; }
  `;
  document.head.appendChild(style);

  const overlay = document.createElement('div');
  overlay.id = 'sd-ai-voice-overlay';
  overlay.innerHTML = `
    <div id="sd-ai-voice-card">
      <button type="button" id="sd-ai-voice-close">✕</button>
      <button type="button" id="sd-ai-voice-fallback">Type instead</button>
      <div id="sd-ai-voice-avatar">🤖</div>
      <div id="sd-ai-voice-state">Connecting…</div>
      <div id="sd-ai-voice-caption"></div>
      <div id="sd-ai-voice-transcript-line"></div>
      <div id="sd-ai-voice-hint">Tap the mic to speak or interrupt</div>
      <div id="sd-ai-voice-actions"></div>
    </div>
  `;
  document.body.appendChild(overlay);
  _overlayEl = overlay;
}

function _show() { _overlayEl.classList.add('sd-ai-voice-show'); }
function _hide() { _overlayEl.classList.remove('sd-ai-voice-show'); }

function _setAvatarState(mode) {
  const el = document.getElementById('sd-ai-voice-avatar');
  const stateEl = document.getElementById('sd-ai-voice-state');
  if (!el) return;
  el.classList.remove('sd-av-speaking', 'sd-av-listening');
  if (mode === 'speaking') { el.classList.add('sd-av-speaking'); el.textContent = '🔊'; if (stateEl) stateEl.textContent = 'Speaking'; }
  else if (mode === 'listening') { el.classList.add('sd-av-listening'); el.textContent = '🎙️'; if (stateEl) stateEl.textContent = 'Listening…'; }
  else { el.textContent = '🤖'; if (stateEl) stateEl.textContent = 'AI Receptionist'; }
}

function _setCaption(aiText, visitorText = '') {
  const capEl = document.getElementById('sd-ai-voice-caption');
  const lineEl = document.getElementById('sd-ai-voice-transcript-line');
  if (capEl) capEl.textContent = aiText || '';
  if (lineEl) lineEl.textContent = visitorText ? `“${visitorText}”` : '';
}

// Tapping the avatar interrupts AI speech and starts listening immediately
// (interrupt handling), or, while idle/listening, is a no-op tap target.
function _wireAvatarInterrupt(onInterrupt) {
  const el = document.getElementById('sd-ai-voice-avatar');
  if (!el) return;
  el.onclick = () => {
    if (_speaking) {
      _stopSpeaking();
      onInterrupt?.();
    }
  };
}

function _finish(result) {
  if (!_active) return;
  _active = false;
  _stopSpeaking();
  _stopListening();
  _hide();
  const r = _resolveFn;
  _resolveFn = null;
  r?.(result);
}

/**
 * Runs the full voice pre-call screening flow. Never rejects.
 *
 * @param {object} opts
 * @param {string} [opts.aiName]
 * @param {string} [opts.ownerLabel]
 * @param {string} [opts.ownerStatus]
 * @param {string} [opts.aiVoiceGender]  'male' | 'female'
 * @returns {Promise<{cancelled:boolean, useFallback:boolean, answers?:object, classification?:object, transcript?:Array<{question,answer}>, mode:string}>}
 */
export function runVoiceScreening({ aiName = 'Priya', ownerLabel = 'the resident', ownerStatus = 'available', aiVoiceGender = 'female' } = {}) {
  if (_active) return Promise.resolve({ cancelled: true, useFallback: false, mode: 'voice' });

  if (!isVoiceReceptionistSupported()) {
    return Promise.resolve({ cancelled: false, useFallback: true, mode: 'voice_unsupported' });
  }

  _active = true;
  _cancelledByUser = false;
  _aiVoiceGender = aiVoiceGender === 'male' ? 'male' : 'female';
  _speechSynth = window.speechSynthesis;
  _initVoiceCache();
  _ensureDom();
  _setAvatarState('idle');
  _setCaption('');
  _show();

  const actionsEl = document.getElementById('sd-ai-voice-actions');
  if (actionsEl) actionsEl.innerHTML = '';

  document.getElementById('sd-ai-voice-close')?.addEventListener('click', () => {
    _cancelledByUser = true;
    _finish({ cancelled: true, useFallback: false, mode: 'voice' });
  });
  document.getElementById('sd-ai-voice-fallback')?.addEventListener('click', () => {
    _finish({ cancelled: false, useFallback: true, mode: 'voice_manual_fallback' });
  });

  const promise = new Promise((resolve) => { _resolveFn = resolve; });
  _runConversation({ aiName, ownerLabel, ownerStatus }).catch(() => {
    // Any unexpected error anywhere in the loop must never trap the
    // visitor — fall back to the proven chip UI instead of hanging.
    if (_active) _finish({ cancelled: false, useFallback: true, mode: 'voice_error' });
  });
  return promise;
}

async function _runConversation({ aiName, ownerLabel, ownerStatus }) {
  const history = [];
  let answers = {};
  let langHint = 'hi-IN';
  let silentStreak = 0;
  const transcript = [];

  const greeting = `Namaste! Main ${aiName} bol rahi hoon. Aap ${ownerLabel} se milne aaye hain — bataiye, kis kaam se aaye hain?`;
  _setCaption(greeting);
  history.push({ role: 'assistant', content: greeting });
  await _speak(greeting, 'hi-IN');
  if (_cancelledByUser || !_active) return;

  for (let turn = 0; turn < MAX_VOICE_TURNS; turn++) {
    if (!_active) return;
    _wireAvatarInterrupt(() => { /* interrupt just stops TTS early; listening starts below regardless */ });

    const heard = await _listenOnce(langHint);
    if (!_active) return;
    _setCaption(document.getElementById('sd-ai-voice-caption')?.textContent || '', heard);

    if (!heard) {
      silentStreak += 1;
      transcript.push({ question: history[history.length - 1]?.content || 'Purpose of visit', answer: null });
      if (silentStreak > MAX_SILENT_RETRIES) {
        // Silent visitor handling — never trap them; proceed with whatever
        // we know (possibly nothing) rather than looping forever.
        const closing = langHint === 'en-IN'
          ? "I'll notify them right away — one moment."
          : 'Koi baat nahi — main unhe soochit kar rahi hoon.';
        _setCaption(closing);
        await _speak(closing, langHint);
        break;
      }
      const retryPrompt = langHint === 'en-IN'
        ? "Sorry, I didn't hear you — could you say that again?"
        : 'Maaf kijiye, sunai nahi diya — kripya dobara boliye.';
      _setCaption(retryPrompt);
      history.push({ role: 'assistant', content: retryPrompt });
      await _speak(retryPrompt, langHint);
      continue;
    }

    silentStreak = 0;
    langHint = _detectLang(heard);
    history.push({ role: 'visitor', content: heard });

    const result = await conductVoiceTurn({
      history, visitorUtterance: heard, turnIndex: turn, answers,
      context: { aiName, ownerLabel, ownerStatus, langHint },
    });
    if (!_active) return;

    answers = result.answers || answers;
    langHint = result.langHint || langHint;
    transcript.push({ question: history[history.length - 2]?.content || 'Purpose of visit', answer: heard });

    _setCaption(result.spokenReply);
    history.push({ role: 'assistant', content: result.spokenReply });
    await _speak(result.spokenReply, langHint);
    if (!_active) return;

    if (result.done) break;
  }

  if (!_active) return;
  const classification = await finalizeVoiceScreening(answers, { aiName, ownerLabel, ownerStatus }).catch(() => null) || {
    visitorType: 'Unknown Visitor', confidence: 0.6, suggestedAction: 'Notify Owner',
    aiSummary: 'Visitor at the door', priority: 'Normal',
  };

  _finish({ cancelled: false, useFallback: false, answers, classification, transcript, mode: 'voice', languageDetected: langHint });
}

export default { runVoiceScreening, isVoiceReceptionistSupported };
