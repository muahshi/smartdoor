/**
 * Smart Door — Monitoring & Observability Layer
 * services/monitoring.js
 *
 * Tracks: Errors, API failures, Supabase errors, Payment failures,
 *         Communication failures, System health, Performance metrics.
 *
 * Architecture:
 *   1. In-memory ring buffer (immediate, zero latency)
 *   2. Supabase error_logs table (persistent, queryable)
 *   3. Sentry / Logtail / OpenTelemetry hooks (future — stubs wired in)
 *
 * Usage:
 *   import { monitor } from './monitoring.js';
 *   monitor.error('payments', 'Capture failed', { orderId, razorpayPaymentId });
 *   monitor.info('auth', 'Login success', { plateId });
 *   const health = await monitor.healthCheck();
 */

import { supabase } from './supabase.js';

// ─── RING BUFFER CONFIG ───────────────────────────────────────────────────────
const RING_BUFFER_SIZE = 200;        // Last N events kept in memory
const FLUSH_INTERVAL_MS = 30_000;    // Batch-flush to DB every 30s
const ALERT_THRESHOLDS = {
  payment_failure:       { count: 3,  windowSecs: 300  },  // 3 in 5 min → alert
  communication_failure: { count: 5,  windowSecs: 300  },  // 5 in 5 min → alert
  auth_failure:          { count: 10, windowSecs: 60   },  // 10 in 1 min → alert
  api_error:             { count: 20, windowSecs: 60   },  // 20 in 1 min → alert
  supabase_error:        { count: 5,  windowSecs: 60   },
};

// ─── LEVELS ───────────────────────────────────────────────────────────────────
export const Level = Object.freeze({
  DEBUG:   'debug',
  INFO:    'info',
  WARN:    'warn',
  ERROR:   'error',
  FATAL:   'fatal',
});

// ─── CATEGORIES ───────────────────────────────────────────────────────────────
export const Category = Object.freeze({
  AUTH:          'auth',
  PAYMENT:       'payment',
  COMMUNICATION: 'communication',
  SUPABASE:      'supabase',
  STORAGE:       'storage',
  REALTIME:      'realtime',
  QR:            'qr',
  API:           'api',
  PERFORMANCE:   'performance',
  SECURITY:      'security',
  SYSTEM:        'system',
});

// ─── INTERNAL STATE ───────────────────────────────────────────────────────────
const _ring = [];               // In-memory ring buffer
const _pending = [];            // Rows waiting for DB flush
const _alertCounts = {};        // { 'category:level': [timestamps...] }
let _flushTimer = null;
let _initialized = false;

// External providers (stubs — wire real SDKs when ready)
const _providers = {
  sentry:    null,   // Sentry.captureException
  logtail:   null,   // logger.error(message, { ...meta })
  otel:      null,   // opentelemetry span/event
};

// ─── INIT ─────────────────────────────────────────────────────────────────────
/**
 * Call once at app startup.
 * @param {object} opts
 * @param {object} [opts.sentry]   Sentry SDK instance
 * @param {object} [opts.logtail]  Logtail logger instance
 * @param {object} [opts.otel]     OpenTelemetry tracer
 */
export function initMonitoring({ sentry, logtail, otel } = {}) {
  if (_initialized) return;
  if (sentry)  _providers.sentry  = sentry;
  if (logtail) _providers.logtail = logtail;
  if (otel)    _providers.otel    = otel;

  // Start periodic flush
  _flushTimer = setInterval(_flushToDB, FLUSH_INTERVAL_MS);

  // Global error handler
  window.addEventListener('error', (evt) => {
    _log(Level.ERROR, Category.SYSTEM, 'Uncaught JS error', {
      message: evt.message,
      filename: evt.filename,
      lineno: evt.lineno,
      colno: evt.colno,
    });
  });

  window.addEventListener('unhandledrejection', (evt) => {
    _log(Level.ERROR, Category.SYSTEM, 'Unhandled Promise rejection', {
      reason: String(evt.reason),
    });
  });

  _initialized = true;
  _log(Level.INFO, Category.SYSTEM, 'Monitoring initialized', {
    providers: Object.entries(_providers)
      .filter(([, v]) => v !== null)
      .map(([k]) => k),
  });
}

// ─── PUBLIC API ───────────────────────────────────────────────────────────────
export const monitor = {
  debug:   (cat, msg, meta = {}) => _log(Level.DEBUG,   cat, msg, meta),
  info:    (cat, msg, meta = {}) => _log(Level.INFO,    cat, msg, meta),
  warn:    (cat, msg, meta = {}) => _log(Level.WARN,    cat, msg, meta),
  error:   (cat, msg, meta = {}) => _log(Level.ERROR,   cat, msg, meta),
  fatal:   (cat, msg, meta = {}) => _log(Level.FATAL,   cat, msg, meta),

  // Convenience shorthands
  paymentError:   (msg, meta = {}) => _log(Level.ERROR, Category.PAYMENT,       msg, meta),
  commsError:     (msg, meta = {}) => _log(Level.ERROR, Category.COMMUNICATION, msg, meta),
  authError:      (msg, meta = {}) => _log(Level.ERROR, Category.AUTH,          msg, meta),
  supabaseError:  (msg, meta = {}) => _log(Level.ERROR, Category.SUPABASE,      msg, meta),
  storageError:   (msg, meta = {}) => _log(Level.ERROR, Category.STORAGE,       msg, meta),
  apiError:       (msg, meta = {}) => _log(Level.ERROR, Category.API,           msg, meta),
  securityWarn:   (msg, meta = {}) => _log(Level.WARN,  Category.SECURITY,      msg, meta),

  // Performance timing
  perf: (label, durationMs, meta = {}) => {
    _log(Level.INFO, Category.PERFORMANCE, label, { durationMs, ...meta });
    if (durationMs > 3000) {
      _log(Level.WARN, Category.PERFORMANCE, `Slow operation: ${label}`, { durationMs, ...meta });
    }
  },

  // Wrap an async call with timing + error capture
  async wrap(category, label, fn) {
    const t0 = performance.now();
    try {
      const result = await fn();
      monitor.perf(label, Math.round(performance.now() - t0), { category });
      return result;
    } catch (err) {
      _log(Level.ERROR, category, `${label} failed`, {
        error: err?.message || String(err),
        durationMs: Math.round(performance.now() - t0),
      });
      throw err;
    }
  },

  // Health check
  healthCheck,

  // Drain pending events immediately (useful before page unload)
  flush: _flushToDB,

  // Read the ring buffer (last N events)
  getRecent: (n = 50) => _ring.slice(-n),

  // Get alert status
  getAlerts: () => _checkAlerts(),
};

// ─── CORE LOG FUNCTION ────────────────────────────────────────────────────────
function _log(level, category, message, meta = {}) {
  const entry = {
    ts:        new Date().toISOString(),
    level,
    category,
    message,
    meta,
    sessionId: _getSessionId(),
    userAgent:  navigator?.userAgent?.slice(0, 200) || null,
    url:        window?.location?.pathname || null,
  };

  // 1. Console output
  const style = {
    [Level.DEBUG]: 'color:#9CA3AF',
    [Level.INFO]:  'color:#22C55E',
    [Level.WARN]:  'color:#F59E0B',
    [Level.ERROR]: 'color:#EF4444;font-weight:bold',
    [Level.FATAL]: 'color:#DC2626;font-weight:bold;background:#FEF2F2',
  };
  console.log(`%c[${level.toUpperCase()}][${category}] ${message}`, style[level] || '', meta);

  // 2. Ring buffer
  _ring.push(entry);
  if (_ring.length > RING_BUFFER_SIZE) _ring.shift();

  // 3. Queue for DB (errors and above only)
  if ([Level.WARN, Level.ERROR, Level.FATAL].includes(level)) {
    _pending.push(entry);
  }

  // 4. External providers
  if ([Level.ERROR, Level.FATAL].includes(level)) {
    _providers.sentry?.captureException?.(new Error(message), { extra: meta });
    _providers.logtail?.error?.(message, { category, ...meta });
    _providers.otel?.addEvent?.(message, { level, category, ...meta });
  }

  // 5. Alert threshold check
  _trackForAlerts(category, level, entry);

  // 6. Fatal → immediate flush
  if (level === Level.FATAL) {
    _flushToDB();
  }
}

// ─── ALERT TRACKER ────────────────────────────────────────────────────────────
function _trackForAlerts(category, level, entry) {
  if (level !== Level.ERROR && level !== Level.FATAL) return;

  const alertKey = `${category}_failure`;
  const threshold = ALERT_THRESHOLDS[alertKey];
  if (!threshold) return;

  const now = Date.now();
  const windowMs = threshold.windowSecs * 1000;

  if (!_alertCounts[alertKey]) _alertCounts[alertKey] = [];
  _alertCounts[alertKey].push(now);
  // Prune old entries
  _alertCounts[alertKey] = _alertCounts[alertKey].filter(ts => now - ts < windowMs);

  if (_alertCounts[alertKey].length >= threshold.count) {
    _triggerAlert(alertKey, _alertCounts[alertKey].length, threshold, entry);
    // Reset to avoid spam-alerting on every subsequent error
    _alertCounts[alertKey] = [];
  }
}

function _checkAlerts() {
  const now = Date.now();
  const active = [];
  for (const [key, timestamps] of Object.entries(_alertCounts)) {
    const threshold = ALERT_THRESHOLDS[key];
    if (!threshold) continue;
    const windowMs = threshold.windowSecs * 1000;
    const recent = (timestamps || []).filter(ts => now - ts < windowMs);
    if (recent.length > 0) {
      active.push({
        key,
        count: recent.length,
        threshold: threshold.count,
        windowSecs: threshold.windowSecs,
        ratio: recent.length / threshold.count,
      });
    }
  }
  return active;
}

function _triggerAlert(key, count, threshold, lastEntry) {
  const msg = `🚨 Alert: ${key} — ${count} errors in ${threshold.windowSecs}s`;
  console.error(msg, lastEntry);
  // TODO: Wire to admin notification (Supabase Edge Function / PushNotification)
  // Example: fetch('/api/alert', { method: 'POST', body: JSON.stringify({ key, count, lastEntry }) })
}

// ─── DB FLUSH ─────────────────────────────────────────────────────────────────
async function _flushToDB() {
  if (_pending.length === 0) return;

  const batch = _pending.splice(0, 50); // Max 50 per flush
  try {
    await supabase.from('error_logs').insert(
      batch.map(e => ({
        level:       e.level,
        category:    e.category,
        message:     e.message,
        meta:        e.meta,
        session_id:  e.sessionId,
        user_agent:  e.userAgent,
        url:         e.url,
        created_at:  e.ts,
      }))
    );
  } catch (err) {
    // Can't log to DB → put back and try next cycle (but cap re-queues)
    if (_pending.length < 100) {
      _pending.unshift(...batch.slice(0, 20));
    }
    console.error('[Monitoring] DB flush failed:', err);
  }
}

// ─── HEALTH CHECK ─────────────────────────────────────────────────────────────
/**
 * Run all health checks and return a status object.
 * Call this from a diagnostics page or scheduled health endpoint.
 */
export async function healthCheck() {
  const results = {};
  const t0 = Date.now();

  // 1. Database
  results.database = await _check('database', async () => {
    const { error } = await supabase.from('users').select('id').limit(1);
    if (error) throw new Error(error.message);
    return 'ok';
  });

  // 2. Supabase Auth
  results.auth = await _check('auth', async () => {
    const { error } = await supabase.auth.getSession();
    if (error) throw new Error(error.message);
    return 'ok';
  });

  // 3. Realtime
  results.realtime = await _check('realtime', async () => {
    return new Promise((resolve, reject) => {
      const testCh = supabase.channel('health_ping_' + Date.now());
      const timer = setTimeout(() => {
        supabase.removeChannel(testCh);
        reject(new Error('Realtime subscribe timeout (5s)'));
      }, 5000);
      testCh.subscribe((status) => {
        clearTimeout(timer);
        supabase.removeChannel(testCh);
        if (status === 'SUBSCRIBED') resolve('ok');
        else reject(new Error(`Realtime status: ${status}`));
      });
    });
  });

  // 4. Storage
  results.storage = await _check('storage', async () => {
    const { error } = await supabase.storage.listBuckets();
    if (error) throw new Error(error.message);
    return 'ok';
  });

  // 5. Razorpay SDK availability
  results.payments = await _check('payments', async () => {
    if (!window.__SD_CONFIG__?.razorpayKeyId) throw new Error('razorpayKeyId not configured');
    return 'configured';
  });

  // 6. Config validation
  results.config = await _check('config', async () => {
    const required = ['supabaseUrl', 'supabaseAnon', 'razorpayKeyId'];
    const missing = required.filter(k => !window.__SD_CONFIG__?.[k]);
    if (missing.length > 0) throw new Error(`Missing config: ${missing.join(', ')}`);
    return 'ok';
  });

  const allOk = Object.values(results).every(r => r.status === 'ok' || r.status === 'configured');
  const totalMs = Date.now() - t0;

  return {
    ok: allOk,
    timestamp: new Date().toISOString(),
    durationMs: totalMs,
    checks: results,
    alerts: _checkAlerts(),
  };
}

async function _check(name, fn) {
  const t0 = performance.now();
  try {
    const status = await fn();
    return { status, latencyMs: Math.round(performance.now() - t0) };
  } catch (err) {
    monitor.warn(Category.SYSTEM, `Health check failed: ${name}`, { error: err.message });
    return { status: 'error', error: err.message, latencyMs: Math.round(performance.now() - t0) };
  }
}

// ─── SESSION ID ───────────────────────────────────────────────────────────────
function _getSessionId() {
  const KEY = 'sd_monitor_session';
  let id = sessionStorage.getItem(KEY);
  if (!id) {
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    const randomPart = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
    id = 'sess_' + randomPart + Date.now().toString(36);
    sessionStorage.setItem(KEY, id);
  }
  return id;
}

// ─── PAGE UNLOAD — FLUSH ──────────────────────────────────────────────────────
window.addEventListener('beforeunload', () => {
  if (_pending.length > 0) {
    // Use sendBeacon for reliability on page exit
    const payload = JSON.stringify({ events: _pending });
    navigator.sendBeacon?.('/api/log-drain', payload); // optional drain endpoint
  }
  clearInterval(_flushTimer);
});

export default monitor;
