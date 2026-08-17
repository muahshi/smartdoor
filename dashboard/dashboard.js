/**
 * SDOS Dashboard — Read-Only Foundation (Phase 15)
 * ai/dashboard/dashboard.js
 *
 * Pure client-side rendering. No fetch(), no Supabase client, no
 * credential, no write path anywhere in this file. Two panels:
 *
 *   1. Permission Engine — imports the REAL permissionEngine.js and
 *      runs it (client-side, in-browser, no network) against a small,
 *      fixed set of sample PermissionCheck requests defined below.
 *      The outcomes are genuinely computed, not hand-typed — but the
 *      *inputs* are static fixtures for this page, not live SDOS
 *      activity (there is no live SDOS activity yet; the Event Bus is
 *      disabled).
 *   2. SDOS Event Log — static, hand-authored fixture rows shaped
 *      like sdos_events + sdos_event_lifecycle
 *      (sql/72_sdos_event_bus_foundation.sql), for layout purposes
 *      only. Clearly not live data.
 */

import { checkPermission } from '../core/permissions/permissionEngine.js';

// ── Panel 1: Permission Engine sample requests ───────────────────────
// A small, representative set: one universal founder-approval row, one
// role-specific founder-approval row, one phase-gated unilateral row,
// one uncategorized action, and one unknown-executive request — the
// same shapes scripts/sdos-permission-engine-test.js exercises.
const SAMPLE_PERMISSION_REQUESTS = [
  { executive: 'cto', action: 'Add a nullable column to the visitors table', action_category: 'schema_change' },
  { executive: 'cfo', action: 'Update the registered GSTIN', action_category: 'cfo_gst_settings_change' },
  { executive: 'cto', action: "Flag a newly reported bug's severity", action_category: 'cto_flag_bug_severity' },
  { executive: 'coo', action: 'Reclassify a support ticket', action_category: 'coo_classify_ticket_severity' },
  { executive: 'cpo', action: 'Try something no matrix documents yet', action_category: 'uncategorized' },
  { executive: 'unregistered-role', action: 'Attempt any action', action_category: 'schema_change' },
];

function outcomeBadgeClass(outcome) {
  if (outcome === 'ALLOWED') return 'sdos-badge sdos-badge-allowed';
  if (outcome === 'DENIED') return 'sdos-badge sdos-badge-denied';
  return 'sdos-badge sdos-badge-awaiting';
}

function renderPermissionsTable() {
  const container = document.getElementById('permissions-table-container');
  const rows = SAMPLE_PERMISSION_REQUESTS.map((req) => {
    let resultRow;
    try {
      resultRow = checkPermission(req);
    } catch (err) {
      resultRow = { outcome: 'ERROR', rule_cited: '\u2014', reason: err.message };
    }
    return { request: req, result: resultRow };
  });

  const table = document.createElement('table');
  table.className = 'sdos-table';
  table.innerHTML = `
    <thead>
      <tr>
        <th>Executive</th>
        <th>Action</th>
        <th>Category</th>
        <th>Outcome</th>
        <th>Rule Cited</th>
        <th>Reason</th>
      </tr>
    </thead>
    <tbody></tbody>
  `;
  const tbody = table.querySelector('tbody');
  for (const { request, result } of rows) {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${escapeHtml(request.executive)}</td>
      <td>${escapeHtml(request.action)}</td>
      <td><code>${escapeHtml(request.action_category)}</code></td>
      <td><span class="${outcomeBadgeClass(result.outcome)}">${escapeHtml(result.outcome)}</span></td>
      <td class="sdos-cite">${escapeHtml(result.rule_cited)}</td>
      <td>${escapeHtml(result.reason)}</td>
    `;
    tbody.appendChild(tr);
  }

  container.innerHTML = '';
  container.appendChild(table);
}

// ── Panel 2: SDOS Event Log fixture rows ──────────────────────────────
// Static fixtures only. Shape matches sql/72_sdos_event_bus_foundation.sql
// (sdos_events: event_id, event_type, source, correlation_id, priority;
// sdos_event_lifecycle stage enum: received, validated,
// validation_failed, authorized, authorization_failed, persisted,
// persistence_failed, duplicate_detected, broadcast_attempted,
// broadcast_succeeded, broadcast_failed).
const FIXTURE_EVENTS = [
  {
    event_id: 'fixture-0001-aaaa',
    event_type: 'permission.checked',
    source: 'permissions',
    priority: 'normal',
    correlation_id: 'fixture-corr-0001',
    timestamp: '2026-08-17T09:00:00Z',
    lifecycle: ['received', 'validated', 'authorized', 'persisted', 'broadcast_succeeded'],
    outcome: 'persisted',
  },
  {
    event_id: 'fixture-0002-bbbb',
    event_type: 'approval.requested',
    source: 'permissions',
    priority: 'high',
    correlation_id: 'fixture-corr-0002',
    timestamp: '2026-08-17T09:00:05Z',
    lifecycle: ['received', 'validated', 'authorized', 'persisted', 'broadcast_succeeded'],
    outcome: 'persisted',
  },
  {
    event_id: 'fixture-0003-cccc',
    event_type: 'lifecycle.transition',
    source: 'runtime',
    priority: 'normal',
    correlation_id: null,
    timestamp: '2026-08-17T09:00:11Z',
    lifecycle: ['received', 'validation_failed'],
    outcome: 'validation_failed',
  },
];

function renderEventsTable() {
  const container = document.getElementById('events-table-container');
  const table = document.createElement('table');
  table.className = 'sdos-table';
  table.innerHTML = `
    <thead>
      <tr>
        <th>Event ID</th>
        <th>Event Type</th>
        <th>Source</th>
        <th>Priority</th>
        <th>Correlation ID</th>
        <th>Timestamp</th>
        <th>Lifecycle Stages</th>
        <th>Outcome / Status</th>
      </tr>
    </thead>
    <tbody></tbody>
  `;
  const tbody = table.querySelector('tbody');
  for (const ev of FIXTURE_EVENTS) {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><code>${escapeHtml(ev.event_id)}</code></td>
      <td>${escapeHtml(ev.event_type)}</td>
      <td>${escapeHtml(ev.source)}</td>
      <td>${escapeHtml(ev.priority)}</td>
      <td>${escapeHtml(ev.correlation_id || '\u2014')}</td>
      <td>${escapeHtml(ev.timestamp)}</td>
      <td>${escapeHtml(ev.lifecycle.join(' \u2192 '))}</td>
      <td>${escapeHtml(ev.outcome)}</td>
    `;
    tbody.appendChild(tr);
  }
  container.innerHTML = '';
  container.appendChild(table);

  const caption = document.createElement('p');
  caption.className = 'sdos-fixture-caption';
  caption.textContent = 'Fixture data — not a live feed. The SDOS Event Bus is currently disabled in production.';
  container.appendChild(caption);
}

function escapeHtml(value) {
  const div = document.createElement('div');
  div.textContent = String(value);
  return div.innerHTML;
}

renderPermissionsTable();
renderEventsTable();
