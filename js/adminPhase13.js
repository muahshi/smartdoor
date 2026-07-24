/**
 * My Smart Door — Admin Phase 13 Panel Extension
 * js/adminPhase13.js
 *
 * Adds to existing admin.html:
 *   1. Bulk Provisioning UI (CSV upload → bulk import → results CSV download)
 *   2. Print Pack Generator (select plates → PDF download)
 *   3. Fulfillment Status Update UI
 *   4. Analytics Dashboard (7 KPIs + charts)
 *
 * Drop-in: script tag at end of admin.html body.
 * Does NOT modify existing admin.html markup — injects new sections.
 */

import { getAdminSession, hasPermission, PERMISSIONS } from '../services/admin.js';
import { fetchWithTimeout } from '../services/httpClient.js';

function getEdgeBase() { return `${window.__SD_CONFIG__?.supabaseUrl || ''}/functions/v1`; }

async function callAdmin(fn, body) {
  const raw = localStorage.getItem('sd_admin_session');
  if (!raw) return { success: false, error: 'Session expired' };
  let session;
  try { session = JSON.parse(raw); } catch { return { success: false, error: 'Session expired' }; }
  const token = session?.token;
  if (!token) return { success: false, error: 'Session expired' };
  try {
    // PRODUCTION HARDENING (API timeout consistency) — see services/httpClient.js.
    // 25s: bulk CSV provisioning / print-pack PDF generation can legitimately
    // take longer than a typical admin call.
    const res = await fetchWithTimeout(`${getEdgeBase()}/${fn}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify(body),
    }, 25000);
    return await res.json();
  } catch (err) {
    return {
      success: false,
      error: err?.isTimeout ? 'Request timed out. Please check your connection and try again.' : (err.message || 'Connection error'),
    };
  }
}

// ────────────────────────────────────────────────
// SECTION INJECTOR — appends new nav items + panels to existing admin structure
// ────────────────────────────────────────────────
function injectPhase13UI() {
  // Only inject once
  if (document.getElementById('phase13-injected')) return;
  document.body.insertAdjacentHTML('beforeend', '<span id="phase13-injected" hidden></span>');

  // ── Inject nav links into existing sidebar ──
  const navList = document.querySelector('.admin-nav ul, #adminNav, nav ul');
  if (navList) {
    navList.insertAdjacentHTML('beforeend', `
      <li><a href="#" onclick="Phase13.showSection('analytics')" class="nav-link">📊 Analytics</a></li>
      <li><a href="#" onclick="Phase13.showSection('bulk-provision')" class="nav-link">📋 Bulk Provision</a></li>
      <li><a href="#" onclick="Phase13.showSection('print-pack')" class="nav-link">🖨️ Print Pack</a></li>
      <li><a href="#" onclick="Phase13.showSection('fulfillment')" class="nav-link">📦 Fulfillment</a></li>
    `);
  }

  // ── Inject panels ──
  document.body.insertAdjacentHTML('beforeend', `
    <!-- ════ ANALYTICS PANEL ════ -->
    <div id="section-analytics" class="admin-section" style="display:none;padding:24px">
      <h2>📊 Analytics Dashboard</h2>
      <div id="analytics-kpis" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:16px;margin:20px 0">
        <div class="kpi-card" id="kpi-activations-today"><div class="kpi-value">—</div><div class="kpi-label">Activations Today</div></div>
        <div class="kpi-card" id="kpi-activations-month"><div class="kpi-value">—</div><div class="kpi-label">Activations This Month</div></div>
        <div class="kpi-card" id="kpi-messages-today"><div class="kpi-value">—</div><div class="kpi-label">Messages Today</div></div>
        <div class="kpi-card" id="kpi-voicenotes-today"><div class="kpi-value">—</div><div class="kpi-label">Voice Notes Today</div></div>
        <div class="kpi-card" id="kpi-active-plates"><div class="kpi-value">—</div><div class="kpi-label">Active Plates</div></div>
        <div class="kpi-card" id="kpi-suspended-plates"><div class="kpi-value" style="color:#ef4444">—</div><div class="kpi-label">Suspended Plates</div></div>
        <div class="kpi-card" id="kpi-renewal-due"><div class="kpi-value" style="color:#f59e0b">—</div><div class="kpi-label">Renewal Due (30d)</div></div>
      </div>
      <button onclick="Phase13.loadAnalytics()" class="btn btn-secondary" style="margin-bottom:16px">🔄 Refresh</button>
      <div id="analytics-error" style="color:#ef4444;display:none"></div>
      <div id="fulfillment-pipeline" style="margin-top:24px">
        <h3>Fulfillment Pipeline</h3>
        <div id="pipeline-bars"></div>
      </div>
    </div>

    <!-- ════ BULK PROVISION PANEL ════ -->
    <div id="section-bulk-provision" class="admin-section" style="display:none;padding:24px">
      <h2>📋 Bulk Create Plates</h2>
      <div style="background:#1f2937;padding:16px;border-radius:8px;margin-bottom:20px">
        <p style="margin:0 0 8px">Upload a CSV with columns: <code>name,phone,email,product_type,pin</code></p>
        <p style="margin:0;font-size:13px;color:#9ca3af">Optional columns: <code>subscription_plan</code> (hardware_only/smartdoor_care)</p>
        <a href="#" onclick="Phase13.downloadSampleCsv()" style="font-size:13px;color:#60a5fa">⬇️ Download sample CSV</a>
      </div>
      <div style="margin-bottom:16px">
        <label class="form-label">CSV File</label>
        <input type="file" id="bulk-csv-file" accept=".csv" class="form-input" />
      </div>
      <div id="bulk-preview" style="display:none;margin-bottom:16px">
        <p id="bulk-preview-count" style="color:#10b981"></p>
        <div id="bulk-preview-errors" style="color:#ef4444;font-size:13px"></div>
      </div>
      <button onclick="Phase13.startBulkImport()" class="btn btn-primary" id="bulk-import-btn">🚀 Start Bulk Import</button>
      <div id="bulk-progress" style="display:none;margin-top:16px">
        <div class="progress-bar-outer"><div id="bulk-progress-bar" class="progress-bar-inner" style="width:0%"></div></div>
        <p id="bulk-progress-text" style="margin-top:8px;color:#9ca3af"></p>
      </div>
      <div id="bulk-results" style="display:none;margin-top:20px">
        <h3>Import Results</h3>
        <p id="bulk-results-summary"></p>
        <button onclick="Phase13.downloadBulkResults()" class="btn btn-secondary">⬇️ Download Results CSV</button>
        <div id="bulk-results-table" style="margin-top:12px;max-height:400px;overflow-y:auto"></div>
      </div>
    </div>

    <!-- ════ PRINT PACK PANEL ════ -->
    <div id="section-print-pack" class="admin-section" style="display:none;padding:24px">
      <h2>🖨️ Print Pack Generator</h2>
      <div style="margin-bottom:16px">
        <label class="form-label">Plate IDs (one per line, or comma-separated)</label>
        <textarea id="print-plate-ids" rows="6" class="form-input" placeholder="SD-ABC123&#10;SD-XYZ456&#10;SD-DEF789"></textarea>
      </div>
      <div style="margin-bottom:16px">
        <label class="form-label">PINs (optional — paste plate_id:pin pairs, one per line)</label>
        <textarea id="print-pins" rows="4" class="form-input" placeholder="SD-ABC123:1234&#10;SD-XYZ456:5678"></textarea>
        <p style="font-size:12px;color:#6b7280;margin:4px 0 0">Leave blank to show **** for PIN (owner must be told separately).</p>
      </div>
      <button onclick="Phase13.generatePrintPack()" class="btn btn-primary" id="print-pack-btn">🖨️ Generate PDF Print Pack</button>
      <div id="print-pack-status" style="margin-top:12px"></div>
    </div>

    <!-- ════ FULFILLMENT PANEL ════ -->
    <div id="section-fulfillment" class="admin-section" style="display:none;padding:24px">
      <h2>📦 Order Fulfillment</h2>
      <div style="background:#1f2937;padding:16px;border-radius:8px;margin-bottom:20px;font-size:13px;color:#9ca3af">
        Lifecycle: <strong>created → manufacturing → printed → packed → shipped → delivered → activated</strong>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:16px">
        <div>
          <label class="form-label">Plate ID</label>
          <input type="text" id="ff-plate-id" class="form-input" placeholder="SD-XXXXXX" />
        </div>
        <div>
          <label class="form-label">New Status</label>
          <select id="ff-status" class="form-input">
            <option value="">— Select —</option>
            <option value="manufacturing">Manufacturing</option>
            <option value="printed">Printed</option>
            <option value="packed">Packed</option>
            <option value="shipped">Shipped</option>
            <option value="delivered">Delivered</option>
            <option value="activated">Activated</option>
          </select>
        </div>
        <div>
          <label class="form-label">Tracking Number (optional, for shipped)</label>
          <input type="text" id="ff-tracking" class="form-input" placeholder="FedEx / DTDC / etc." />
        </div>
        <div>
          <label class="form-label">Notes (optional)</label>
          <input type="text" id="ff-notes" class="form-input" placeholder="Any notes for the audit log" />
        </div>
      </div>
      <button onclick="Phase13.updateFulfillment()" class="btn btn-primary">📦 Update Status</button>
      <div id="ff-result" style="margin-top:12px"></div>

      <div style="margin-top:32px">
        <h3>Bulk Fulfillment Update</h3>
        <p style="font-size:13px;color:#9ca3af">CSV: <code>plate_id,status,tracking_number,notes</code></p>
        <input type="file" id="ff-bulk-csv" accept=".csv" class="form-input" style="margin-bottom:12px" />
        <button onclick="Phase13.bulkUpdateFulfillment()" class="btn btn-secondary">📤 Process Bulk CSV</button>
        <div id="ff-bulk-result" style="margin-top:12px"></div>
      </div>
    </div>

    <style>
      .kpi-card {
        background: #1f2937;
        border-radius: 8px;
        padding: 20px 16px;
        text-align: center;
        border: 1px solid #374151;
      }
      .kpi-value { font-size: 2rem; font-weight: bold; color: #f9fafb; }
      .kpi-label { font-size: 12px; color: #9ca3af; margin-top: 4px; }
      .progress-bar-outer { background: #374151; border-radius: 4px; height: 8px; }
      .progress-bar-inner { background: #3b82f6; height: 100%; border-radius: 4px; transition: width 0.3s; }
      .pipeline-bar { display: flex; align-items: center; gap: 12px; margin: 6px 0; }
      .pipeline-bar-label { width: 120px; font-size: 13px; color: #9ca3af; text-align: right; }
      .pipeline-bar-track { flex: 1; background: #374151; border-radius: 4px; height: 20px; overflow: hidden; }
      .pipeline-bar-fill { background: #3b82f6; height: 100%; border-radius: 4px; transition: width 0.5s; }
      .pipeline-bar-count { width: 40px; font-size: 13px; font-weight: bold; color: #f9fafb; }
    </style>
  `);
}

// ────────────────────────────────────────────────
// STATE
// ────────────────────────────────────────────────
let _bulkRows = [];
let _bulkResults = [];

// ────────────────────────────────────────────────
// SECTION SWITCHER
// ────────────────────────────────────────────────
function showSection(id) {
  document.querySelectorAll('.admin-section').forEach(el => el.style.display = 'none');
  const target = document.getElementById(`section-${id}`);
  if (target) target.style.display = 'block';
  if (id === 'analytics') loadAnalytics();
}

// ────────────────────────────────────────────────
// ANALYTICS
// ────────────────────────────────────────────────
async function loadAnalytics() {
  document.getElementById('analytics-error').style.display = 'none';

  const [metricsRes, pipelineRes] = await Promise.all([
    callAdmin('admin-analytics', { type: 'dashboard_metrics' }),
    callAdmin('admin-analytics', { type: 'fulfillment_pipeline' }),
  ]);

  if (metricsRes.success && metricsRes.metrics) {
    const m = metricsRes.metrics;
    document.querySelector('#kpi-activations-today .kpi-value').textContent = m.activations_today;
    document.querySelector('#kpi-activations-month .kpi-value').textContent = m.activations_month;
    document.querySelector('#kpi-messages-today .kpi-value').textContent = m.messages_today;
    document.querySelector('#kpi-voicenotes-today .kpi-value').textContent = m.voice_notes_today;
    document.querySelector('#kpi-active-plates .kpi-value').textContent = m.active_plates;
    document.querySelector('#kpi-suspended-plates .kpi-value').textContent = m.suspended_plates;
    document.querySelector('#kpi-renewal-due .kpi-value').textContent = m.renewal_due_soon;
  } else {
    const err = document.getElementById('analytics-error');
    err.textContent = metricsRes.error || 'Failed to load metrics';
    err.style.display = 'block';
  }

  if (pipelineRes.success && pipelineRes.pipeline) {
    const stages = ['created','manufacturing','printed','packed','shipped','delivered','activated'];
    const max = Math.max(1, ...stages.map(s => pipelineRes.pipeline[s] || 0));
    const container = document.getElementById('pipeline-bars');
    container.innerHTML = stages.map(s => {
      const count = pipelineRes.pipeline[s] || 0;
      const pct = Math.round((count / max) * 100);
      return `<div class="pipeline-bar">
        <div class="pipeline-bar-label">${s}</div>
        <div class="pipeline-bar-track"><div class="pipeline-bar-fill" style="width:${pct}%"></div></div>
        <div class="pipeline-bar-count">${count}</div>
      </div>`;
    }).join('');
  }
}

// ────────────────────────────────────────────────
// BULK PROVISIONING
// ────────────────────────────────────────────────
function downloadSampleCsv() {
  const csv = 'name,phone,email,product_type,pin,subscription_plan\nRajesh Kumar,9876543210,rajesh@email.com,acrylic,1234,hardware_only\nPreeti Sharma,9123456789,,stainless,5678,smartdoor_care';
  const a = document.createElement('a');
  a.href = 'data:text/csv;charset=utf-8,' + encodeURIComponent(csv);
  a.download = 'smartdoor-bulk-import-sample.csv';
  a.click();
}

document.getElementById('bulk-csv-file')?.addEventListener('change', function(e) {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (ev) => {
    const text = ev.target.result;
    const lines = text.trim().split('\n');
    if (lines.length < 2) {
      document.getElementById('bulk-preview-errors').textContent = 'CSV has no data rows.';
      return;
    }
    const header = lines[0].toLowerCase().replace(/\r/g, '').split(',').map(h => h.trim());
    const required = ['name', 'phone', 'pin'];
    const missing = required.filter(r => !header.includes(r));
    if (missing.length) {
      document.getElementById('bulk-preview-errors').textContent = `Missing required columns: ${missing.join(', ')}`;
      document.getElementById('bulk-preview').style.display = 'block';
      return;
    }

    _bulkRows = [];
    const errors = [];
    for (let i = 1; i < lines.length; i++) {
      const vals = lines[i].replace(/\r/g, '').split(',').map(v => v.trim().replace(/^"|"$/g, ''));
      const row = {};
      header.forEach((h, idx) => row[h] = vals[idx] || '');
      _bulkRows.push(row);
      if (!row.name) errors.push(`Row ${i}: missing name`);
      if (!/^\d{10}$/.test(row.phone?.replace(/\D/g, '').slice(-10))) errors.push(`Row ${i}: invalid phone`);
      if (!/^\d{4}$/.test(row.pin)) errors.push(`Row ${i}: pin must be 4 digits`);
    }

    document.getElementById('bulk-preview-count').textContent = `✅ ${_bulkRows.length} rows parsed.${errors.length ? ' ⚠️ ' + errors.length + ' validation warning(s) — see below.' : ''}`;
    document.getElementById('bulk-preview-errors').textContent = errors.slice(0, 10).join('\n');
    document.getElementById('bulk-preview').style.display = 'block';
  };
  reader.readAsText(file);
});

async function startBulkImport() {
  if (!_bulkRows.length) {
    alert('Please upload a CSV file first.');
    return;
  }
  if (!confirm(`Import ${_bulkRows.length} customers? This cannot be undone.`)) return;

  document.getElementById('bulk-import-btn').disabled = true;
  document.getElementById('bulk-progress').style.display = 'block';
  document.getElementById('bulk-results').style.display = 'none';

  const BATCH = 50;
  _bulkResults = [];
  let processed = 0;

  for (let i = 0; i < _bulkRows.length; i += BATCH) {
    const batch = _bulkRows.slice(i, i + BATCH);
    document.getElementById('bulk-progress-text').textContent = `Processing rows ${i + 1}–${Math.min(i + BATCH, _bulkRows.length)} of ${_bulkRows.length}…`;

    const res = await callAdmin('admin-bulk-provision', { rows: batch });
    if (res.success && res.results) {
      _bulkResults.push(...res.results.map(r => ({ ...r, row: r.row + i })));
    } else {
      // Mark entire batch as failed
      batch.forEach((_, bi) => _bulkResults.push({
        row: i + bi + 1, status: 'failed', name: batch[bi].name, error: res.error || 'Batch failed'
      }));
    }

    processed += batch.length;
    document.getElementById('bulk-progress-bar').style.width = `${Math.round(processed / _bulkRows.length * 100)}%`;
  }

  // Show results
  const success = _bulkResults.filter(r => r.status === 'success').length;
  const failed = _bulkResults.filter(r => r.status === 'failed').length;
  document.getElementById('bulk-results-summary').innerHTML =
    `<strong style="color:#10b981">✅ ${success} created</strong> &nbsp; <strong style="color:#ef4444">❌ ${failed} failed</strong>`;

  const tableHtml = `<table style="width:100%;border-collapse:collapse;font-size:13px">
    <tr style="background:#374151"><th>#</th><th>Status</th><th>Name</th><th>Plate ID</th><th>Error</th></tr>
    ${_bulkResults.map(r => `<tr style="border-bottom:1px solid #374151">
      <td style="padding:6px">${r.row}</td>
      <td style="color:${r.status === 'success' ? '#10b981' : '#ef4444'}">${r.status}</td>
      <td>${r.name || ''}</td>
      <td>${r.plate_id || ''}</td>
      <td style="color:#ef4444">${r.error || ''}</td>
    </tr>`).join('')}
  </table>`;
  document.getElementById('bulk-results-table').innerHTML = tableHtml;
  document.getElementById('bulk-results').style.display = 'block';
  document.getElementById('bulk-import-btn').disabled = false;
}

function downloadBulkResults() {
  const header = 'row,status,plate_id,name,phone,qr_url,error';
  const rows = _bulkResults.map(r =>
    [r.row, r.status, r.plate_id || '', r.name || '', r.phone || '', r.qr_url || '', r.error || '']
      .map(v => `"${String(v).replace(/"/g, '""')}"`)
      .join(',')
  );
  const csv = [header, ...rows].join('\n');
  const a = document.createElement('a');
  a.href = 'data:text/csv;charset=utf-8,' + encodeURIComponent(csv);
  a.download = `bulk-import-results-${new Date().toISOString().slice(0,10)}.csv`;
  a.click();
}

// ────────────────────────────────────────────────
// PRINT PACK
// ────────────────────────────────────────────────
async function generatePrintPack() {
  const rawIds = document.getElementById('print-plate-ids').value.trim();
  if (!rawIds) { alert('Enter at least one Plate ID.'); return; }

  const plate_ids = rawIds.split(/[\n,]+/).map(s => s.trim().toUpperCase()).filter(Boolean);
  if (!plate_ids.length) { alert('No valid Plate IDs found.'); return; }

  // Parse optional PIN map
  const rawPins = document.getElementById('print-pins').value.trim();
  const pins = {};
  if (rawPins) {
    rawPins.split('\n').forEach(line => {
      const [pid, pin] = line.split(':').map(s => s.trim());
      if (pid && pin) pins[pid.toUpperCase()] = pin;
    });
  }

  const btn = document.getElementById('print-pack-btn');
  const status = document.getElementById('print-pack-status');
  btn.disabled = true;
  status.textContent = `⏳ Generating print pack for ${plate_ids.length} label(s)…`;

  const res = await callAdmin('admin-print-pack', { plate_ids, pins });

  if (res.success && res.pdf_base64) {
    // Download PDF
    const binary = atob(res.pdf_base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    const blob = new Blob([bytes], { type: 'application/pdf' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = res.filename || 'smartdoor-print-pack.pdf';
    a.click();
    status.innerHTML = `<span style="color:#10b981">✅ Print pack downloaded — ${res.label_count} label(s).</span>`;
  } else {
    status.innerHTML = `<span style="color:#ef4444">❌ ${res.error || res.message || 'Failed to generate print pack.'}</span>`;
  }
  btn.disabled = false;
}

// ────────────────────────────────────────────────
// FULFILLMENT STATUS
// ────────────────────────────────────────────────
async function updateFulfillment() {
  const plate_id = document.getElementById('ff-plate-id').value.trim().toUpperCase();
  const status = document.getElementById('ff-status').value;
  const tracking_number = document.getElementById('ff-tracking').value.trim() || undefined;
  const notes = document.getElementById('ff-notes').value.trim() || undefined;
  const result = document.getElementById('ff-result');

  if (!plate_id || !status) { result.innerHTML = '<span style="color:#ef4444">Plate ID and status are required.</span>'; return; }

  result.textContent = '⏳ Updating…';
  const res = await callAdmin('admin-fulfillment-status', { plate_id, status, tracking_number, notes });

  if (res.success) {
    result.innerHTML = `<span style="color:#10b981">✅ ${res.message}</span>`;
  } else {
    result.innerHTML = `<span style="color:#ef4444">❌ ${res.message || res.error}</span>`;
  }
}

async function bulkUpdateFulfillment() {
  const file = document.getElementById('ff-bulk-csv').files[0];
  if (!file) { alert('Select a CSV file first.'); return; }
  const text = await file.text();
  const lines = text.trim().split('\n');
  if (lines.length < 2) return;
  const header = lines[0].toLowerCase().replace(/\r/g,'').split(',').map(h => h.trim());
  const result = document.getElementById('ff-bulk-result');
  result.textContent = `⏳ Processing ${lines.length - 1} rows…`;

  let success = 0, failed = 0;
  for (let i = 1; i < lines.length; i++) {
    const vals = lines[i].replace(/\r/g,'').split(',');
    const row = {};
    header.forEach((h, idx) => row[h] = vals[idx]?.trim() || '');
    if (!row.plate_id || !row.status) { failed++; continue; }
    const res = await callAdmin('admin-fulfillment-status', {
      plate_id: row.plate_id,
      status: row.status,
      tracking_number: row.tracking_number || undefined,
      notes: row.notes || undefined,
    });
    res.success ? success++ : failed++;
  }
  result.innerHTML = `<span style="color:#10b981">✅ ${success} updated</span> &nbsp; <span style="color:#ef4444">❌ ${failed} failed</span>`;
}

// ────────────────────────────────────────────────
// EXPOSE GLOBALLY + INIT
// ────────────────────────────────────────────────
window.Phase13 = {
  showSection,
  loadAnalytics,
  downloadSampleCsv,
  startBulkImport,
  downloadBulkResults,
  generatePrintPack,
  updateFulfillment,
  bulkUpdateFulfillment,
};

// Wire up file input listeners after DOM ready
document.addEventListener('DOMContentLoaded', () => {
  injectPhase13UI();
});

// If DOM already loaded
if (document.readyState !== 'loading') {
  injectPhase13UI();
}
