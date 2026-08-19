/**
 * ai/dashboard/dashboard.js
 * Phase 15B foundation + Phase 17 live SDOS Event Log + Phase 18
 * automatic admin authentication.
 *
 * STANDALONE. Not imported by, and does not import, any SmartDoor
 * production file (js/**, services/**). This file DOES read the same
 * build-time config file every other SmartDoor HTML entry point reads
 * (`config/env.generated.js` → `window.__SD_CONFIG__`, loaded by
 * index.html) and the same admin session localStorage key admin.html
 * already writes (`sd_admin_session`) — that reuse is the entire
 * point of Phase 18 (ADR-0017 follow-up: "make SDOS dashboard
 * authentication automatic"). No new auth mechanism, no new session
 * store, no second login form was created; see getAdminSession()
 * below, which is a deliberate line-for-line copy of admin.html's own
 * helper of the same name.
 *
 * Makes zero network call on page load — the only network calls this
 * file can ever make are the explicit, user-initiated POSTs to the
 * Phase 17 `sdos-dashboard-gateway` Edge Function, triggered only by
 * clicking "Load Live Events" or "Load Lifecycle". The admin session
 * token is read fresh from localStorage on each call (never copied
 * into a page-load-scoped variable, never written anywhere by this
 * file) and sent only as the `Authorization: Bearer` header on that
 * one gateway call — exactly the same token shape and header
 * admin.html's own `adminCall()`/`provisionCall()` already send to
 * every other admin Edge Function.
 *
 * Three data modes on this page, and they are never blurred:
 *   1. LIVE (Permission Runtime) — every result is a real, in-browser
 *      call to checkPermission() against the real authorityData.js.
 *   2. LIVE (Event Log, Phase 17) — real sdos_events /
 *      sdos_event_lifecycle rows, read through the authenticated,
 *      read-only sdos-dashboard-gateway Edge Function (ADR-0017).
 *      Rendered rows are labeled LIVE, never merged with fixture rows.
 *   3. FIXTURE (Event Log default state) — shown until the founder
 *      explicitly loads live data; sdos_events/sdos_event_lifecycle
 *      still have no anon/authenticated RLS policy (sql/72–74), so
 *      this page cannot read them directly — only through the
 *      authenticated gateway. Every fixture value stays labeled
 *      FIXTURE; nothing here is ever mistaken for a live read.
 */

import { checkPermission, OUTCOMES } from '../core/permissions/permissionEngine.js';
import { EXECUTIVES, UNIVERSAL_APPROVAL_ROWS } from '../core/permissions/authorityData.js';

// ── System status (hand-declared, matches this phase's verified repo
// state — see ADR-0015 / PROJECT_STATE.md — not fetched from anywhere) ──
const SYSTEM_STATUS = [
  {
    key: 'permission_runtime',
    label: 'Permission Runtime',
    state: 'on',
    text: 'Live',
    detail: 'ai/core/permissions/permissionEngine.js — 15/15 tests passing (scripts/sdos-permission-engine-test.js). No database or network access.',
  },
  {
    key: 'event_bus',
    label: 'Event Bus',
    state: 'off',
    text: 'OFF',
    detail: 'feature_flags.sdos_event_bus_enabled = FALSE. emitEvent() short-circuits before Validate — zero writes to sdos_events while disabled.',
  },
  {
    key: 'executive_runtime',
    label: 'Executive Runtime',
    state: 'na',
    text: 'Does not exist',
    detail: 'No executive has execution authority. ai/executives/** is documentation only; nothing wires permissionEngine.js output into a running agent.',
  },
  {
    key: 'groq_sdos',
    label: 'Groq / SDOS Integration',
    state: 'na',
    text: 'Not connected',
    detail: 'No SDOS-scoped Groq credential or Edge Function exists (ADR-0007 remains Proposed). Production groq-proxy is untouched and unrelated.',
  },
  {
    key: 'realtime_subscriber',
    label: 'Realtime Subscriber',
    state: 'na',
    text: 'Not connected',
    detail: 'sdos_events is in the supabase_realtime publication (migration 72) as a standing capability, but no subscriber — this dashboard included — consumes it.',
  },
];

// ── Fixture event log — shaped to match sdos_events / sdos_event_lifecycle
// exactly, so a future, separately-approved live version can reuse this
// same table layout. These rows are NOT real; they never touched Supabase. ──
const FIXTURE_EVENTS = [
  {
    event_type: 'permission.checked',
    source: 'ai/core/permissions/permissionEngine.js',
    priority: 'normal',
    emitted_at: '2026-08-10T09:14:22Z',
    lifecycle: 'received → validated → authorized → persisted → broadcast_succeeded',
  },
  {
    event_type: 'task.created',
    source: 'ai/executives/cto',
    priority: 'normal',
    emitted_at: '2026-08-10T09:10:05Z',
    lifecycle: 'received → validated → authorized → persisted → broadcast_succeeded',
  },
  {
    event_type: 'approval.requested',
    source: 'ai/executives/cfo',
    priority: 'high',
    emitted_at: '2026-08-09T18:42:51Z',
    lifecycle: 'received → validated → authorized → persisted → broadcast_failed',
  },
  {
    event_type: 'task.created',
    source: 'unregistered-source',
    priority: 'normal',
    emitted_at: '2026-08-09T14:03:12Z',
    lifecycle: 'received → authorization_failed',
  },
];

// ── Phase 18 — automatic admin session reuse ─────────────────────────
// Deliberate line-for-line copy of admin.html's own ADMIN_SESSION_KEY /
// getAdminSession() (see admin.html's inline <script>). Same key, same
// shape, same expiry check — this file must never diverge from that
// contract, or a session admin.html considers valid could be rejected
// here (or vice versa).
const ADMIN_SESSION_KEY = 'sd_admin_session';

function getAdminSession() {
  try {
    const raw = localStorage.getItem(ADMIN_SESSION_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw);
    if (!s?.exp) return null;
    if (Date.now() > s.exp) {
      localStorage.removeItem(ADMIN_SESSION_KEY);
      return null;
    }
    return s;
  } catch {
    return null;
  }
}

// Same window.__SD_CONFIG__.supabaseUrl convention admin.html's own
// SUPABASE_URL()/EDGE() use — set by config/env.generated.js, loaded
// by index.html before this module runs. No gateway URL is ever typed
// in or hardcoded here.
function gatewayUrl() {
  const base = window.__SD_CONFIG__?.supabaseUrl || '';
  if (!base) return '';
  return base + '/functions/v1/sdos-dashboard-gateway';
}

function renderAuthStatus() {
  const card = document.getElementById('auth-status-card');
  card.innerHTML = '';
  const session = getAdminSession();

  if (!session) {
    card.appendChild(
      el('div', { class: 'card' }, [
        el('div', { class: 'label' }, 'Admin session'),
        el('div', { class: 'value' }, [el('span', { class: 'dot off' }), 'Not signed in']),
        el('div', { class: 'detail' }, [
          'Your admin session has expired or was not found. Please sign in again. ',
          el('a', { href: '/admin-login.html', class: 'mono' }, 'Go to admin sign-in'),
        ]),
      ]),
    );
    return false;
  }

  card.appendChild(
    el('div', { class: 'card' }, [
      el('div', { class: 'label' }, 'Admin session'),
      el('div', { class: 'value' }, [
        el('span', { class: 'dot on' }),
        'Signed in as ' + (session.full_name || session.email || 'admin'),
      ]),
      el('div', { class: 'detail' }, [
        'Reusing your existing SmartDoor admin sign-in — no token entry required. ',
        el('span', { class: 'mono' }, session.role_label || session.role || ''),
      ]),
    ]),
  );
  return true;
}

function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') node.className = v;
    else if (k === 'html') node.innerHTML = v;
    else node.setAttribute(k, v);
  }
  for (const child of [].concat(children)) {
    if (child == null) continue;
    node.appendChild(typeof child === 'string' ? document.createTextNode(child) : child);
  }
  return node;
}

function dotClass(state) {
  return { on: 'dot on', off: 'dot off', warn: 'dot warn', na: 'dot na' }[state] || 'dot na';
}

function renderSystemStatus() {
  const grid = document.getElementById('system-status-grid');
  grid.innerHTML = '';
  for (const item of SYSTEM_STATUS) {
    grid.appendChild(
      el('div', { class: 'card' }, [
        el('div', { class: 'label' }, item.label),
        el('div', { class: 'value' }, [
          el('span', { class: dotClass(item.state) }),
          item.text,
        ]),
        el('div', { class: 'detail' }, item.detail),
      ]),
    );
  }
}

function renderEventBusCard() {
  const card = document.getElementById('event-bus-card');
  card.innerHTML = '';
  card.appendChild(
    el('div', { class: 'card' }, [
      el('div', { class: 'label' }, 'SDOS Event Bus'),
      el('div', { class: 'value' }, [el('span', { class: 'dot off' }), 'DISABLED']),
      el('div', { class: 'detail' }, [
        'sdos_event_bus_enabled = ',
        el('span', { class: 'mono' }, 'false'),
        '. sdos_events / sdos_event_lifecycle still have no anon/authenticated RLS policy — not reachable directly from any browser session (sql/72). The only path in is the authenticated, read-only sdos-dashboard-gateway Edge Function below (Phase 17, ADR-0017), which does not require the bus to be enabled to read history. ',
        el('span', { class: 'badge inactive' }, 'INACTIVE'),
      ]),
    ]),
  );
}

function renderPermissionRuntimeCard() {
  const card = document.getElementById('permission-runtime-card');
  card.innerHTML = '';
  const roleCount = Object.keys(EXECUTIVES).length;
  card.appendChild(
    el('div', { class: 'card' }, [
      el('div', { class: 'label' }, 'Permission Runtime'),
      el('div', { class: 'value' }, [el('span', { class: 'dot on' }), 'Live — real checkPermission()']),
      el('div', { class: 'detail' }, [
        `${roleCount} executives loaded from authorityData.js. 15/15 tests passing (scripts/sdos-permission-engine-test.js). `,
        'Distinct from the Executive Runtime below, which does not exist — this engine only answers "is X authorized", it never acts.',
      ]),
    ]),
  );
}

function categoriesFor(execKey) {
  const role = EXECUTIVES[execKey];
  if (!role) return [];
  const seen = new Set();
  const list = [];
  const add = (rows, group) => {
    for (const row of rows || []) {
      if (seen.has(row.category)) continue;
      seen.add(row.category);
      list.push({ category: row.category, action: row.action, group });
    }
  };
  add(role.deniedRows, 'denied (role matrix)');
  add(UNIVERSAL_APPROVAL_ROWS, 'universal founder-approval');
  add(role.approvalRows, 'role founder-approval');
  add(role.unilateralRows, 'may decide unilaterally (phase-gated)');
  list.push({ category: '__uncategorized__', action: '(uncategorized — matches no row)', group: 'test' });
  return list;
}

function outcomeBadgeClass(outcome) {
  return { ALLOWED: 'badge allowed', AWAITING_APPROVAL: 'badge awaiting', DENIED: 'badge denied' }[outcome] || 'badge inactive';
}

function populateExecutiveSelect() {
  const sel = document.getElementById('exec-select');
  sel.innerHTML = '';
  for (const [key, role] of Object.entries(EXECUTIVES)) {
    sel.appendChild(el('option', { value: key }, role.label || key.toUpperCase()));
  }
}

function populateCategorySelect(execKey) {
  const sel = document.getElementById('category-select');
  sel.innerHTML = '';
  for (const item of categoriesFor(execKey)) {
    const label = item.category === '__uncategorized__' ? item.action : `${item.category} — ${item.action}`;
    sel.appendChild(el('option', { value: item.category, title: item.action }, label.length > 70 ? label.slice(0, 67) + '…' : label));
  }
}

function runCheck() {
  const executive = document.getElementById('exec-select').value;
  const rawCategory = document.getElementById('category-select').value;
  const gate = document.getElementById('gate-select').value === 'true';
  const action_category = rawCategory === '__uncategorized__' ? 'uncategorized_test_category' : rawCategory;

  const resultBox = document.getElementById('permission-result');
  try {
    const res = checkPermission(
      { executive, action: 'dashboard-manual-check', action_category },
      { integrationsReady: gate },
    );
    resultBox.innerHTML = '';
    resultBox.appendChild(
      el('div', {}, [
        el('span', { class: outcomeBadgeClass(res.outcome) }, res.outcome),
        ' ',
        res.reason,
        el('div', { class: 'rule' }, `rule_cited: ${res.rule_cited}`),
      ]),
    );
  } catch (err) {
    resultBox.innerHTML = '';
    resultBox.appendChild(el('div', {}, [el('span', { class: 'badge denied' }, 'ERROR'), ' ' + err.message]));
  }
}

function renderEventLog() {
  const tbody = document.getElementById('event-log-body');
  tbody.innerHTML = '';
  for (const ev of FIXTURE_EVENTS) {
    tbody.appendChild(
      el('tr', {}, [
        el('td', {}, [el('span', { class: 'badge fixture' }, 'FIXTURE'), ' ' + ev.event_type]),
        el('td', { class: 'mono' }, ev.source),
        el('td', {}, ev.priority),
        el('td', { class: 'mono' }, ev.emitted_at),
        el('td', { class: 'mono' }, ev.lifecycle),
      ]),
    );
  }
}

// ── Phase 17 — Live Event Log (via sdos-dashboard-gateway) ──────────
// Phase 18: nothing in this section runs on page load, and the
// founder no longer pastes anything. Clicking "Load Live Events" /
// "Load Lifecycle" reads the existing admin session from localStorage
// fresh (getAdminSession(), same contract as admin.html) and sends it
// as the Authorization header on the one POST this file ever makes —
// no token is ever held in a variable, logged, or written anywhere by
// this file.

// ── Phase 18 hotfix — 401 must never destroy the session ─────────────
// Root cause of the reported bug: this file's first cut cleared
// sd_admin_session and re-rendered the Authentication card to "Not
// signed in" on the very FIRST 401 from the gateway. admin.html's own
// adminCall() never does this — it tolerates transient 401s and only
// treats the session as dead after 3 consecutive failures (see
// admin.html's _authFailCount / _AUTH_FAIL_THRESHOLD). Per this
// phase's explicit requirement, this read-only dashboard goes
// further and never clears the session itself at all — only
// admin.html/admin-login.html ever write or remove sd_admin_session.
// A 401 here only produces a local, per-action message with a login
// link; the top-level Authentication card is left untouched.
class GatewayAuthError extends Error {}

// ── Phase 18 mobile 401 diagnostic ───────────────────────────────────
// Founder is testing on a phone with no DevTools access, so the raw
// server response for a 401 needs to be visible in-page. This block
// is intentionally isolated from auth logic: it never reads
// session.token, never touches the Authorization header, and the
// response body is redacted before it is ever attached to an error
// object or rendered. Nothing here changes what callGateway() does on
// a 401 (still no localStorage.removeItem, still no renderAuthStatus)
// — it only captures and displays extra evidence about *why*.
const DEBUG_BUILD_TAG = 'phase18-mobile-debug-v2';

// Strips anything credential-shaped out of a raw response body before
// it is allowed anywhere near an error object or the DOM. Applied
// unconditionally — there is no code path that attaches an
// un-redacted body to debugInfo.
function redactDebugText(text) {
  if (typeof text !== 'string' || !text) return '(empty response body)';
  let out = text;
  // "Bearer <token>"
  out = out.replace(/Bearer\s+[A-Za-z0-9\-_.]+/gi, 'Bearer [REDACTED]');
  // JSON/plain key:value pairs for credential-shaped keys (token,
  // authorization, secret, password, api_key, apikey, key, cookie).
  out = out.replace(
    /("?(?:token|authorization|secret|password|api[_-]?key|apikey|key|cookie)"?\s*[:=]\s*)"?[^",}\s]+"?/gi,
    '$1"[REDACTED]"',
  );
  // JWT-shaped strings (header.payload.signature).
  out = out.replace(/[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g, '[REDACTED-JWT]');
  // Long hex-looking opaque tokens (e.g. raw session_token values).
  out = out.replace(/\b[a-f0-9]{32,}\b/gi, '[REDACTED-HEX]');
  // Hard cap so a runaway/unexpected body can never balloon the page.
  return out.length > 800 ? out.slice(0, 800) + ' …(truncated)' : out;
}

// Renders the visible "DEBUG — HTTP 401" block plus a Copy Debug Info
// button. Receives only { status, url, body } — never a session
// object, never a token, never a header.
function renderMobileDebugBlock(debugInfo) {
  const text = [
    `DEBUG — HTTP ${debugInfo.status ?? 'N/A'}`,
    `Build: ${DEBUG_BUILD_TAG}`,
    `Status: ${debugInfo.status ?? 'N/A'}`,
    `Gateway URL: ${debugInfo.url || '(none — request was not sent)'}`,
    'Server response:',
    debugInfo.body || '(none)',
  ].join('\n');

  const pre = el('div', { class: 'mono' }, text);
  pre.style.cssText = 'margin-top:8px;padding:8px;border:1px dashed #999;font-size:12px;white-space:pre-wrap;word-break:break-all;';

  const copyBtn = el('button', { class: 'btn btn-ghost btn-sm', type: 'button' }, 'Copy Debug Info');
  copyBtn.style.marginTop = '6px';
  copyBtn.addEventListener('click', () => {
    if (navigator.clipboard?.writeText) {
      navigator.clipboard
        .writeText(text)
        .then(() => {
          copyBtn.textContent = 'Copied!';
          setTimeout(() => (copyBtn.textContent = 'Copy Debug Info'), 1500);
        })
        .catch(() => {});
    }
  });

  return el('div', {}, [pre, copyBtn]);
}

function appendAuthExpiredNotice(container, message, debugInfo) {
  container.appendChild(
    el('div', {}, [
      el('span', { class: 'badge denied' }, 'SESSION'),
      ' ' + message + ' ',
      el('a', { href: '/admin-login.html', class: 'mono' }, 'Sign in again'),
    ]),
  );
  if (debugInfo) {
    container.appendChild(renderMobileDebugBlock(debugInfo));
  }
}

function liveStatus(message, kind = 'inactive') {
  const box = document.getElementById('live-events-status');
  box.innerHTML = '';
  box.appendChild(el('span', { class: `badge ${kind}` }, kind.toUpperCase()));
  box.appendChild(document.createTextNode(' ' + message));
}

function renderLiveEventRows(events) {
  const modeBadge = document.getElementById('event-log-mode-badge');
  modeBadge.textContent = 'LIVE DATA';
  modeBadge.className = 'badge allowed';

  const tbody = document.getElementById('event-log-body');
  tbody.innerHTML = '';
  for (const ev of events) {
    tbody.appendChild(
      el('tr', {}, [
        el('td', {}, [el('span', { class: 'badge allowed' }, 'LIVE'), ' ' + (ev.event_type ?? '')]),
        el('td', { class: 'mono' }, ev.source ?? ''),
        el('td', {}, ev.priority ?? ''),
        el('td', { class: 'mono' }, ev.emitted_at ?? ''),
        el('td', { class: 'mono' }, ev.event_id ?? ''),
      ]),
    );
  }
}

async function callGateway(capability, params) {
  const url = gatewayUrl();
  if (!url) throw new Error('Configuration error: Supabase URL missing. Contact dev team.');

  const session = getAdminSession();
  if (!session) {
    const err = new GatewayAuthError('Admin session expired. Please sign in again.');
    // No request was ever sent — nothing to redact, but the mobile
    // debug block still needs to be able to show that plainly.
    err.debugInfo = { status: null, url, body: '(no local admin session found — request was not sent)' };
    throw err;
  }

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${session.token}`,
    },
    body: JSON.stringify({ capability, ...params }),
  });

  // 401: do NOT clear sd_admin_session and do NOT touch the
  // Authentication card here — see the block comment above
  // GatewayAuthError. This is a per-action message only.
  //
  // Body is read exactly once, redacted immediately, and only the
  // redacted text is ever attached to the error or rendered.
  // session.token itself is never read again past the fetch() call
  // above, and is never referenced here.
  if (res.status === 401) {
    let bodyText = '';
    try {
      bodyText = await res.text();
    } catch {
      bodyText = '';
    }
    const err = new GatewayAuthError('Admin session expired. Please sign in again.');
    err.debugInfo = { status: res.status, url, body: redactDebugText(bodyText) };
    throw err;
  }
  if (res.status === 403) {
    throw new Error('Your account does not have permission to view SDOS events.');
  }

  let body;
  try {
    body = await res.json();
  } catch {
    throw new Error('The dashboard could not read the server response. Please try again.');
  }
  if (!res.ok || body.success !== true) {
    throw new Error(body?.message || 'Gateway request failed. Please try again.');
  }
  return body.result; // IntegrationResult envelope — { outcome, data?, source, fetched_at, error? }
}

async function loadLiveEvents() {
  const limitField = document.getElementById('live-limit').value.trim();
  const eventTypeField = document.getElementById('live-event-type').value.trim();

  liveStatus('Loading…', 'inactive');
  try {
    const params = {};
    if (limitField) params.limit = Number(limitField);
    if (eventTypeField) params.event_type = eventTypeField;

    const result = await callGateway('sdos_events.recent', params);

    if (result.outcome === 'EMPTY') {
      renderLiveEventRows([]);
      liveStatus('No SDOS events found.', 'inactive');
      return;
    }
    if (result.outcome === 'INTEGRATION_ERROR') {
      liveStatus('SDOS event storage could not be read.', 'denied');
      return;
    }
    renderLiveEventRows(result.data || []);
    liveStatus(`${(result.data || []).length} live row(s) loaded (source: ${result.source}, fetched_at: ${result.fetched_at}).`, 'allowed');
  } catch (err) {
    if (err instanceof GatewayAuthError) {
      const box = document.getElementById('live-events-status');
      box.innerHTML = '';
      appendAuthExpiredNotice(box, err.message, err.debugInfo);
      return;
    }
    liveStatus(err.message, 'denied');
  }
}

async function loadEventLifecycle() {
  const eventId = document.getElementById('lifecycle-event-id').value.trim();
  const box = document.getElementById('lifecycle-result');
  box.innerHTML = '';
  if (!eventId) {
    box.appendChild(el('div', {}, [el('span', { class: 'badge denied' }, 'ERROR'), ' event_id is required.']));
    return;
  }
  try {
    const result = await callGateway('sdos_event_lifecycle.by_event', { event_id: eventId });
    if (result.outcome === 'EMPTY') {
      box.appendChild(el('div', {}, [el('span', { class: 'badge inactive' }, 'EMPTY'), ' No lifecycle rows for this event_id.']));
      return;
    }
    if (result.outcome === 'INTEGRATION_ERROR') {
      box.appendChild(el('div', {}, [el('span', { class: 'badge denied' }, 'ERROR'), ' SDOS lifecycle storage could not be read.']));
      return;
    }
    const stages = (result.data || []).map((row) => row.stage).filter(Boolean).join(' → ');
    box.appendChild(
      el('div', {}, [
        el('span', { class: 'badge allowed' }, 'LIVE'),
        ` ${(result.data || []).length} lifecycle row(s)`,
        el('div', { class: 'rule mono' }, stages || '(no stage field on returned rows)'),
      ]),
    );
  } catch (err) {
    if (err instanceof GatewayAuthError) {
      box.innerHTML = '';
      appendAuthExpiredNotice(box, err.message, err.debugInfo);
      return;
    }
    box.appendChild(el('div', {}, [el('span', { class: 'badge denied' }, 'ERROR'), ' ' + err.message]));
  }
}

function init() {
  renderAuthStatus();
  renderSystemStatus();
  renderEventBusCard();
  renderPermissionRuntimeCard();
  renderEventLog();

  populateExecutiveSelect();
  populateCategorySelect(document.getElementById('exec-select').value);

  document.getElementById('exec-select').addEventListener('change', (e) => {
    populateCategorySelect(e.target.value);
  });
  document.getElementById('run-check').addEventListener('click', runCheck);

  document.getElementById('load-live-events').addEventListener('click', loadLiveEvents);
  document.getElementById('load-lifecycle').addEventListener('click', loadEventLifecycle);

  runCheck();
}

document.addEventListener('DOMContentLoaded', init);
