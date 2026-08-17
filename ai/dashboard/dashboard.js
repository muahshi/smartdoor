/**
 * ai/dashboard/dashboard.js
 * Phase 15B — Read-Only SDOS Dashboard Foundation
 *
 * STANDALONE. Not imported by, and does not import, any SmartDoor
 * production file (js/**, services/**). Its only import is the real
 * ai/core/permissions/permissionEngine.js + authorityData.js — no
 * database client, no network call, no credential of any kind.
 *
 * Two data modes on this page, and they are never blurred:
 *   1. LIVE  — the Permission Runtime panel. Every result shown there
 *      is a real, in-browser call to checkPermission() against the
 *      real authorityData.js. Nothing here is scripted or faked.
 *   2. FIXTURE — the Event Bus / Event Log panels. sdos_events and
 *      sdos_event_lifecycle have no anon/authenticated RLS policy
 *      (sql/72–74) and no ai/integrations/ read client exists yet
 *      (READONLY_INTEGRATION_POLICY.md gates that behind its own,
 *      separately-approved phase). So this page cannot safely read
 *      real rows from the browser — see ADR-0014 "Why the Dashboard
 *      Is Fixture/Read-Only" and ADR-0015. Every fixture value is
 *      labeled FIXTURE in the UI; nothing here should be mistaken for
 *      a live production read.
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
        '. sdos_events / sdos_event_lifecycle have no anon/authenticated RLS policy — not reachable from this browser session at all (sql/72). ',
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

function init() {
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

  runCheck();
}

document.addEventListener('DOMContentLoaded', init);
