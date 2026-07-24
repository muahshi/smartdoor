// Phase 2A Production Persistence Fix
/**
 * Smart Door — Admin Manufacturing Service
 * services/manufacturing.js
 *
 * Production queue management, QR operations, PDF sheet generation.
 */

import { supabase } from './supabase.js';
import { adminAuditLog } from './admin.js';
import { escapeHtml } from './sanitize.js';

// ────────── STATUS CONSTANTS ──────────

export const PRODUCTION_STAGES = [
  { key: 'queued',        label: 'Pending Production', icon: '🕐', color: '#F59E0B' },
  { key: 'printing',      label: 'In Production',      icon: '🖨️', color: '#3B82F6' },
  { key: 'quality_check', label: 'Quality Check',      icon: '🔍', color: '#8B5CF6' },
  { key: 'packed',        label: 'Packed',             icon: '📦', color: '#10B981' },
  { key: 'ready',         label: 'Ready to Ship',      icon: '✅', color: '#22C55E' },
];

// ────────── GET MANUFACTURING QUEUE ──────────

export async function getManufacturingQueue(status = null) {
  try {
    let qb = supabase
      .from('manufacturing')
      .select(`
        *,
        orders!inner(
          order_number, customer_name, customer_phone,
          customer_email, shipping_address, payment_status,
          product_type, total_amount, created_at
        )
      `)
      .order('created_at', { ascending: true });

    if (status) {
      qb = qb.eq('production_status', status);
    }

    const { data, error } = await qb;
    if (error) return { success: false, error: error.message };

    return { success: true, queue: data || [] };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

// ────────── GET QUEUE COUNTS BY STAGE ──────────

export async function getQueueCounts() {
  try {
    const { data, error } = await supabase
      .from('manufacturing')
      .select('production_status', { count: 'exact', head: false });

    if (error) return { success: false, error: error.message };

    const counts = {};
    PRODUCTION_STAGES.forEach(s => { counts[s.key] = 0; });
    (data || []).forEach(row => {
      if (counts[row.production_status] !== undefined) {
        counts[row.production_status]++;
      }
    });

    return { success: true, counts };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

// ────────── UPDATE PRODUCTION STATUS ──────────

export async function updateProductionStatus(mfgId, newStatus, notes = '') {
  try {
    const { data: before } = await supabase.from('manufacturing').select('*').eq('id', mfgId).single();

    const { data, error } = await supabase
      .from('manufacturing')
      .update({
        production_status: newStatus,
        updated_at: new Date().toISOString(),
        ...(newStatus === 'packed' ? { packed_at: new Date().toISOString() } : {}),
        ...(newStatus === 'ready' ? { completed_at: new Date().toISOString() } : {}),
      })
      .eq('id', mfgId)
      .select()
      .single();

    if (error) return { success: false, error: error.message };

    // Also update order manufacturing_status
    if (before?.order_id) {
      const orderStatusMap = {
        queued: 'queued',
        printing: 'in_production',
        quality_check: 'in_production',
        packed: 'packed',
        ready: 'packed',
      };
      await supabase
        .from('orders')
        .update({ manufacturing_status: orderStatusMap[newStatus] || 'in_production' })
        .eq('id', before.order_id);
    }

    await adminAuditLog(
      'production_status_update', 'manufacturing', mfgId,
      { status: before?.production_status },
      { status: newStatus },
      notes || `Status changed to ${newStatus}`
    );

    return { success: true, item: data };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

// ────────── QR MANAGEMENT ──────────

export async function searchQRByPlateId(plateId) {
  try {
    const { data, error } = await supabase
      .from('manufacturing')
      .select(`
        *,
        orders!inner(order_number, customer_name, customer_phone, payment_status)
      `)
      .ilike('plate_id', `%${plateId}%`)
      .limit(10);

    if (error) return { success: false, error: error.message };
    return { success: true, results: data || [] };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

export async function deactivateQR(plateId, reason = '') {
  try {
    const { data: before } = await supabase.from('plates').select('*').eq('plate_id', plateId).single();

    const { data, error } = await supabase
      .from('plates')
      .update({ status: 'inactive', updated_at: new Date().toISOString() })
      .eq('plate_id', plateId)
      .select()
      .single();

    if (error) return { success: false, error: error.message };

    await adminAuditLog('qr_deactivate', 'qr', plateId, { status: before?.status }, { status: 'inactive' }, reason);
    return { success: true, plate: data };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

export async function reactivateQR(plateId) {
  try {
    const { data, error } = await supabase
      .from('plates')
      .update({ status: 'active', updated_at: new Date().toISOString() })
      .eq('plate_id', plateId)
      .select()
      .single();

    if (error) return { success: false, error: error.message };

    await adminAuditLog('qr_reactivate', 'qr', plateId, { status: 'inactive' }, { status: 'active' });
    return { success: true, plate: data };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

export async function getQRAuditHistory(plateId) {
  try {
    const { data, error } = await supabase
      .from('admin_audit_logs')
      .select('*')
      .eq('resource', 'qr')
      .eq('resource_id', plateId)
      .order('created_at', { ascending: false });

    if (error) return { success: false, error: error.message };
    return { success: true, history: data || [] };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

// ────────── PRODUCTION SHEET PDF GENERATOR ──────────
// Generates printable production sheet HTML (use window.print() or html2pdf)

export function generateProductionSheetHTML(items) {
  // Phase 2A — Finish, Plate Size, Symbol, QR Style and Logo File are now
  // persisted end-to-end (see manufacturing.finish/plate_size/symbol/
  // qr_style/logo_file_name) and are surfaced here so the production floor
  // sees exactly what the customer configured, not just name + house number.
  //
  // Hardening: every value below originates from customer input (directly,
  // like plate_name/house_number/logo_file_name — the last being a raw
  // browser filename with no format constraint — or indirectly via
  // configurator presets) and is escaped before being placed in this HTML,
  // which is later rendered/printed in an admin/production-staff context.
  const rows = items.map((item, i) => `
    <tr>
      <td>${i + 1}</td>
      <td><strong>${escapeHtml(item.plate_id)}</strong></td>
      <td>${escapeHtml(item.plate_name) || '—'}</td>
      <td>${escapeHtml(item.house_number) || '—'}</td>
      <td>${escapeHtml(item.product_type)}</td>
      <td>${escapeHtml(item.font_style) || 'modern'}</td>
      <td>${escapeHtml(item.plate_size) || '—'}</td>
      <td>${escapeHtml(item.finish) || '—'}</td>
      <td>${escapeHtml(item.symbol) || '—'}</td>
      <td>${escapeHtml(item.qr_style) || '—'}</td>
      <td>${escapeHtml(item.logo_file_name) || '—'}</td>
      <td>${escapeHtml(item.orders?.customer_name) || '—'}</td>
      <td>${escapeHtml(item.orders?.customer_phone) || '—'}</td>
      <td>${escapeHtml(item.production_status)}</td>
      <td>
        <div style="width:60px;height:60px;background:#f3f4f6;display:flex;align-items:center;justify-content:center;font-size:10px;color:#6b7280">
          QR: ${escapeHtml(item.plate_id)}
        </div>
      </td>
    </tr>
  `).join('');

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <title>Smart Door — Production Sheet</title>
      <style>
        body { font-family: Arial, sans-serif; font-size: 12px; color: #1a1a1a; }
        h1 { font-size: 18px; margin-bottom: 4px; }
        .meta { color: #666; font-size: 11px; margin-bottom: 16px; }
        table { width: 100%; border-collapse: collapse; }
        th, td { border: 1px solid #ddd; padding: 6px 8px; text-align: left; }
        th { background: #f3f4f6; font-weight: 600; }
        tr:nth-child(even) { background: #fafafa; }
        @media print { button { display: none; } }
      </style>
    </head>
    <body>
      <h1>🏭 Smart Door — Production Sheet</h1>
      <div class="meta">Generated: ${new Date().toLocaleString('en-IN')} · Total Items: ${items.length}</div>
      <table>
        <thead>
          <tr>
            <th>#</th><th>Plate ID</th><th>Name</th><th>House No.</th>
            <th>Type</th><th>Font</th><th>Size</th><th>Finish</th><th>Symbol</th>
            <th>QR Style</th><th>Logo File</th><th>Customer</th><th>Phone</th>
            <th>Status</th><th>QR Preview</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
      <button onclick="window.print()" style="margin-top:16px;padding:8px 16px;background:#1a1a1a;color:#fff;border:none;border-radius:6px;cursor:pointer">
        🖨️ Print Sheet
      </button>
    </body>
    </html>
  `;
}
