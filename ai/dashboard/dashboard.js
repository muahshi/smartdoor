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
    renderAuthStatus();
    throw new Error('Your admin session has expired. Please sign in again.');
  }

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${session.token}`,
    },
    body: JSON.stringify({ capability, ...params }),
  });

  if (res.status === 401) {
    localStorage.removeItem(ADMIN_SESSION_KEY);
    renderAuthStatus();
    throw new Error('Your admin session has expired. Please sign in again.');
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
      liveStatus(`No sdos_events rows found (source: ${result.source}, fetched_at: ${result.fetched_at}).`, 'inactive');
      return;
    }
    if (result.outcome === 'INTEGRATION_ERROR') {
      liveStatus('Could not load live events. Please try again.', 'denied');
      return;
    }
    renderLiveEventRows(result.data || []);
    liveStatus(`${(result.data || []).length} live row(s) loaded (source: ${result.source}, fetched_at: ${result.fetched_at}).`, 'allowed');
  } catch (err) {
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
      box.appendChild(el('div', {}, [el('span', { class: 'badge denied' }, 'ERROR'), ' Could not load lifecycle. Please try again.']));
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
