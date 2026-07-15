/**
 * Smart Door — Visitor-Side Forensic Debug Overlay
 * js/debugOverlay.js
 *
 * TEMPORARY diagnostic tool for the third-party-visitor-phone WebRTC
 * signaling investigation. This file is purely observational:
 *
 *   - It MIRRORS console.log / console.warn / console.error into an
 *     on-screen panel. It never suppresses, replaces the behavior of,
 *     or changes the arguments passed to the original console methods.
 *   - It listens to window.onerror / window.onunhandledrejection in
 *     ADDITION to whatever handlers already exist (chains, never
 *     overwrites).
 *   - It does not import, call, or touch webrtcCall.js,
 *     webrtcSignaling.js, webrtcOwnerCall.js, or presence.js in any way.
 *     It only reads text that those modules already print to console.
 *
 * ENABLE ONLY WHEN:
 *   - URL has ?debug=1, OR
 *   - localStorage.getItem('sd_debug') === '1'
 *
 * Otherwise this file does nothing and renders nothing.
 *
 * Include ONLY on visitor.html:
 *   <script src="js/debugOverlay.js"></script>
 *
 * Safe to delete this single file at any time to fully remove the
 * overlay — nothing else in the codebase depends on it.
 */

(function () {
  'use strict';

  function isEnabled() {
    try {
      const params = new URLSearchParams(window.location.search);
      if (params.get('debug') === '1') return true;
    } catch (_) { /* ignore */ }
    try {
      if (window.localStorage && window.localStorage.getItem('sd_debug') === '1') return true;
    } catch (_) { /* ignore */ }
    return false;
  }

  if (!isEnabled()) return;

  // ── Keyword → severity map (drives color highlighting only) ──
  const KEYWORD_RULES = [
    { re: /\b(SUBSCRIBED)\b/i, level: 'success' },
    { re: /\b(answer)\b/i, level: 'success' },
    { re: /\b(incoming-call)\b/i, level: 'success' },
    { re: /\b(offer)\b/i, level: 'success' },
    { re: /\b(ice-candidate)\b/i, level: 'success' },
    { re: /\b(presence)\b/i, level: 'success' },
    { re: /\b(RTC-TRACE)\b/i, level: 'info' },
    { re: /\b(TIMED_OUT)\b/i, level: 'warn' },
    { re: /\b(mic_denied)\b/i, level: 'warn' },
    { re: /\b(unsupported)\b/i, level: 'warn' },
    { re: /\b(CHANNEL_ERROR)\b/i, level: 'error' },
    { re: /\b(CLOSED)\b/i, level: 'warn' },
    { re: /\b(offer_failed)\b/i, level: 'error' },
    { re: /\b(signaling_unavailable)\b/i, level: 'error' },
  ];

  function classify(text, baseLevel) {
    // console.error/warn already imply a severity; keyword rules can
    // upgrade an otherwise plain console.log line, but a console.error
    // call always renders red and a console.warn always renders orange
    // regardless of keyword matches.
    if (baseLevel === 'error') return 'error';
    if (baseLevel === 'warn') return 'warn';
    for (const rule of KEYWORD_RULES) {
      if (rule.re.test(text)) {
        if (rule.level === 'error') return 'error';
      }
    }
    for (const rule of KEYWORD_RULES) {
      if (rule.re.test(text)) {
        if (rule.level === 'warn') return 'warn';
      }
    }
    for (const rule of KEYWORD_RULES) {
      if (rule.re.test(text)) {
        if (rule.level === 'success' || rule.level === 'info') return 'success';
      }
    }
    return 'plain';
  }

  function safeStringify(arg) {
    if (typeof arg === 'string') return arg;
    if (arg instanceof Error) {
      return (arg.stack || (arg.name + ': ' + arg.message));
    }
    try {
      return JSON.stringify(arg, (key, val) => {
        if (val instanceof Error) return { name: val.name, message: val.message, stack: val.stack };
        return val;
      }, 2);
    } catch (_) {
      try { return String(arg); } catch (__) { return '[unserializable]'; }
    }
  }

  function formatArgs(args) {
    return Array.prototype.map.call(args, safeStringify).join(' ');
  }

  // ── In-memory log store ──
  const MAX_ENTRIES = 2000;
  const entries = [];
  let entryCounter = 0;

  function pad(n) { return n < 10 ? '0' + n : '' + n; }
  function timestamp() {
    const d = new Date();
    return pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':' + pad(d.getSeconds()) + '.' +
      (d.getMilliseconds() < 100 ? '0' : '') + (d.getMilliseconds() < 10 ? '0' : '') + d.getMilliseconds();
  }

  function addEntry(baseLevel, text) {
    const level = classify(text, baseLevel);
    entries.push({
      id: ++entryCounter,
      ts: timestamp(),
      level: level,
      baseLevel: baseLevel,
      text: text,
    });
    if (entries.length > MAX_ENTRIES) entries.shift();
    renderIfOpen();
  }

  // ── Mirror console.* WITHOUT changing existing behavior ──
  const origLog = console.log.bind(console);
  const origWarn = console.warn.bind(console);
  const origError = console.error.bind(console);

  console.log = function () {
    origLog.apply(console, arguments);
    try { addEntry('log', formatArgs(arguments)); } catch (_) { /* never break the page */ }
  };
  console.warn = function () {
    origWarn.apply(console, arguments);
    try { addEntry('warn', formatArgs(arguments)); } catch (_) { /* never break the page */ }
  };
  console.error = function () {
    origError.apply(console, arguments);
    try { addEntry('error', formatArgs(arguments)); } catch (_) { /* never break the page */ }
  };

  // ── Capture uncaught errors / unhandled rejections (chain, don't replace) ──
  const prevOnError = window.onerror;
  window.onerror = function (message, source, lineno, colno, error) {
    try {
      const stack = error && error.stack ? error.stack : (message + ' @ ' + source + ':' + lineno + ':' + colno);
      addEntry('error', '[window.onerror] ' + stack);
    } catch (_) { /* ignore */ }
    if (typeof prevOnError === 'function') {
      return prevOnError.apply(this, arguments);
    }
    return false;
  };

  window.addEventListener('unhandledrejection', function (event) {
    try {
      const reason = event && event.reason;
      const text = reason instanceof Error ? (reason.stack || reason.message) : safeStringify(reason);
      addEntry('error', '[unhandledrejection] ' + text);
    } catch (_) { /* ignore */ }
    // Do not call preventDefault — leave default browser behavior intact.
  });

  // ── UI: floating button + full-screen bottom sheet ──
  let sheetOpen = false;
  let listEl = null;

  function injectStyles() {
    const style = document.createElement('style');
    style.textContent = `
      #sd-debug-fab {
        position: fixed; right: 16px; bottom: 16px; z-index: 999999;
        background: #111827; color: #fff; border: 1px solid rgba(255,255,255,0.15);
        border-radius: 999px; padding: 10px 16px; font-size: 13px; font-weight: 700;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        box-shadow: 0 4px 14px rgba(0,0,0,0.4); cursor: pointer; user-select: none;
        display: flex; align-items: center; gap: 6px; opacity: 0.92;
      }
      #sd-debug-fab:active { opacity: 1; transform: scale(0.97); }
      #sd-debug-sheet {
        position: fixed; inset: 0; z-index: 1000000; display: none;
        background: #0b0f14; color: #e5e7eb;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        flex-direction: column;
      }
      #sd-debug-sheet.open { display: flex; }
      #sd-debug-header {
        display: flex; align-items: center; justify-content: space-between;
        padding: 12px 14px; border-bottom: 1px solid rgba(255,255,255,0.1);
        flex-shrink: 0;
      }
      #sd-debug-title { font-size: 14px; font-weight: 700; color: #fff; }
      #sd-debug-actions { display: flex; gap: 8px; }
      .sd-debug-btn {
        background: rgba(255,255,255,0.08); color: #e5e7eb; border: 1px solid rgba(255,255,255,0.15);
        border-radius: 8px; padding: 8px 12px; font-size: 12px; font-weight: 600; cursor: pointer;
      }
      .sd-debug-btn:active { background: rgba(255,255,255,0.16); }
      .sd-debug-btn.danger { color: #fca5a5; border-color: rgba(239,68,68,0.35); }
      #sd-debug-list {
        flex: 1; overflow-y: auto; padding: 8px 10px; -webkit-overflow-scrolling: touch;
      }
      .sd-debug-entry {
        font-family: 'SF Mono', 'Menlo', 'Consolas', monospace; font-size: 11.5px; line-height: 1.45;
        white-space: pre-wrap; word-break: break-word;
        padding: 7px 8px; margin-bottom: 5px; border-radius: 6px;
        border-left: 3px solid rgba(255,255,255,0.15);
        background: rgba(255,255,255,0.03);
      }
      .sd-debug-entry.success { border-left-color: #22c55e; background: rgba(34,197,94,0.08); color: #bbf7d0; }
      .sd-debug-entry.warn    { border-left-color: #f59e0b; background: rgba(245,158,11,0.08); color: #fde68a; }
      .sd-debug-entry.error   { border-left-color: #ef4444; background: rgba(239,68,68,0.1);  color: #fecaca; }
      .sd-debug-entry.plain   { color: #d1d5db; }
      .sd-debug-ts {
        opacity: 0.55; font-size: 10.5px; margin-right: 6px;
      }
      #sd-debug-empty {
        text-align: center; color: rgba(255,255,255,0.35); font-size: 12px; padding: 30px 10px;
      }
      #sd-debug-copy-toast {
        position: fixed; bottom: 20px; left: 50%; transform: translateX(-50%);
        background: rgba(34,197,94,0.92); color: #fff; padding: 8px 16px; border-radius: 10px;
        font-size: 12px; font-weight: 700; z-index: 1000001; display: none;
      }
    `;
    document.head.appendChild(style);
  }

  function levelLabel(entry) {
    return entry.baseLevel === 'log' ? 'LOG' : entry.baseLevel.toUpperCase();
  }

  function render() {
    if (!listEl) return;
    if (entries.length === 0) {
      listEl.innerHTML = '<div id="sd-debug-empty">No logs captured yet.<br>Trigger a call to start capturing.</div>';
      return;
    }
    // Newest first.
    let html = '';
    for (let i = entries.length - 1; i >= 0; i--) {
      const e = entries[i];
      const safeText = e.text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
      html += '<div class="sd-debug-entry ' + e.level + '">' +
        '<span class="sd-debug-ts">' + e.ts + ' · ' + levelLabel(e) + '</span>' +
        safeText +
        '</div>';
    }
    listEl.innerHTML = html;
  }

  function renderIfOpen() {
    if (sheetOpen) render();
  }

  function copyLogs() {
    const lines = entries.map(function (e) {
      return '[' + e.ts + '] [' + levelLabel(e) + '] ' + e.text;
    });
    const text = lines.join('\n');
    const showToast = function () {
      const toast = document.getElementById('sd-debug-copy-toast');
      if (!toast) return;
      toast.style.display = 'block';
      setTimeout(function () { toast.style.display = 'none'; }, 1500);
    };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(showToast).catch(function () {
        fallbackCopy(text, showToast);
      });
    } else {
      fallbackCopy(text, showToast);
    }
  }

  function fallbackCopy(text, cb) {
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.focus();
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      if (cb) cb();
    } catch (_) { /* clipboard unavailable — silently ignore */ }
  }

  function clearLogs() {
    entries.length = 0;
    render();
  }

  function openSheet() {
    sheetOpen = true;
    document.getElementById('sd-debug-sheet').classList.add('open');
    render();
  }

  function closeSheet() {
    sheetOpen = false;
    document.getElementById('sd-debug-sheet').classList.remove('open');
  }

  function buildUI() {
    injectStyles();

    const fab = document.createElement('div');
    fab.id = 'sd-debug-fab';
    fab.innerHTML = '🐞 DEBUG';
    fab.addEventListener('click', openSheet);
    document.body.appendChild(fab);

    const sheet = document.createElement('div');
    sheet.id = 'sd-debug-sheet';
    sheet.innerHTML =
      '<div id="sd-debug-header">' +
        '<div id="sd-debug-title">🐞 Call Debug Log</div>' +
        '<div id="sd-debug-actions">' +
          '<button class="sd-debug-btn" id="sd-debug-copy-btn">Copy Logs</button>' +
          '<button class="sd-debug-btn danger" id="sd-debug-clear-btn">Clear</button>' +
          '<button class="sd-debug-btn" id="sd-debug-close-btn">Close</button>' +
        '</div>' +
      '</div>' +
      '<div id="sd-debug-list"></div>' +
      '<div id="sd-debug-copy-toast">✅ Logs copied</div>';
    document.body.appendChild(sheet);

    listEl = document.getElementById('sd-debug-list');
    document.getElementById('sd-debug-copy-btn').addEventListener('click', copyLogs);
    document.getElementById('sd-debug-clear-btn').addEventListener('click', clearLogs);
    document.getElementById('sd-debug-close-btn').addEventListener('click', closeSheet);
  }

  function boot() {
    buildUI();
    addEntry('log', '[debugOverlay] Debug overlay active. Capturing console + window errors.');
  }

  if (document.body) {
    boot();
  } else {
    document.addEventListener('DOMContentLoaded', boot);
  }
})();
