/**
 * Smart Door — Admin Panel Error Capture (Phase 10)
 * js/adminErrorCapture.js
 *
 * WHY THIS FILE EXISTS INSTEAD OF js/monitoring-bootstrap.js:
 * admin.html has a comment — "monitoring-bootstrap removed: non-critical,
 * was causing ES module chain issues" — meaning the ONE page an admin
 * actually watches for problems has had zero frontend error capture since
 * that removal. That's the real gap this file closes.
 *
 * This is a plain classic <script> (no `type="module"`, no imports), so it
 * cannot participate in — or break — the ES module import chain that
 * caused the original removal. It has no dependency on services/monitoring.js
 * or any other module; it talks straight to the log-client-error Edge
 * Function over fetch(), the same endpoint monitoring.js now uses.
 *
 * Captures: window.onerror, unhandledrejection. Does NOT capture info/debug
 * noise, does NOT wrap every function call, does NOT replace console.* —
 * purely additive, same non-interference guarantee js/debugOverlay.js
 * documents for itself.
 *
 * Include on admin.html only, as a plain (non-module) script, AFTER
 * config/env.generated.js:
 *   <script src="js/adminErrorCapture.js"></script>
 */

(function () {
  'use strict';

  function ingestUrl() {
    var cfg = window.__SD_CONFIG__ || {};
    return cfg.supabaseUrl ? cfg.supabaseUrl + '/functions/v1/log-client-error' : null;
  }

  function sessionId() {
    try {
      var KEY = 'sd_admin_error_session';
      var id = sessionStorage.getItem(KEY);
      if (!id) {
        id = 'admin_sess_' + Math.random().toString(36).slice(2) + Date.now().toString(36);
        sessionStorage.setItem(KEY, id);
      }
      return id;
    } catch (_) { return null; }
  }

  // Small batching queue so a burst of errors (e.g. a broken render loop)
  // doesn't fire one HTTP request per event.
  var _queue = [];
  var _flushTimer = null;
  var MAX_QUEUE = 20;
  var FLUSH_DELAY_MS = 2000;

  function send() {
    _flushTimer = null;
    if (!_queue.length) return;
    var url = ingestUrl();
    if (!url) { _queue = []; return; }
    var events = _queue.splice(0, MAX_QUEUE);
    try {
      fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ events: events }),
        keepalive: true,
      }).catch(function () { /* best-effort — never surfaces to the admin */ });
    } catch (_) { /* fetch unsupported / blocked — silently drop */ }
  }

  function queue(level, message, meta) {
    _queue.push({
      level: level,
      category: 'system',
      message: String(message).slice(0, 2000),
      meta: meta || {},
      sessionId: sessionId(),
      userAgent: navigator.userAgent ? navigator.userAgent.slice(0, 200) : null,
      url: window.location.pathname,
      ts: new Date().toISOString(),
    });
    if (_queue.length >= MAX_QUEUE) { send(); return; }
    if (!_flushTimer) _flushTimer = setTimeout(send, FLUSH_DELAY_MS);
  }

  window.addEventListener('error', function (evt) {
    queue('error', evt.message || 'Uncaught error in admin panel', {
      filename: evt.filename, lineno: evt.lineno, colno: evt.colno,
    });
  });

  window.addEventListener('unhandledrejection', function (evt) {
    var reason = evt && evt.reason;
    var msg = (reason && reason.message) ? reason.message : String(reason);
    queue('error', 'Unhandled Promise rejection in admin panel: ' + msg, {});
  });

  window.addEventListener('beforeunload', function () {
    if (_queue.length) send();
  });
})();
