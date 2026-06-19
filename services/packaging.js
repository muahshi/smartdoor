/**
 * Smart Door — Packaging System
 * services/packaging.js
 *
 * Phase 11 — Real World Operations
 *
 * Generates the four printable documents that go out with every shipment:
 *   1. Packing Slip          — order contents + shipping address
 *   2. Box Label             — plate ID + AWB + destination, large print
 *   3. QR Verification Sheet — QC sign-off + QR preview for warehouse staff
 *   4. Customer Card         — welcome card with activation instructions
 *
 * Mirrors the print-sheet pattern already used by
 * services/manufacturing.js#generateProductionSheetHTML — additive,
 * does not modify that file.
 */

import { supabase } from './supabase.js';
import { getQrUrl } from './qr.js';

const BRAND_STYLES = `
  body { font-family: Arial, sans-serif; color:#1a1a1a; margin:0; }
  .doc { max-width: 720px; margin: 0 auto; padding: 28px; }
  h1 { font-size: 20px; margin: 0 0 4px; }
  .meta { color:#666; font-size: 11px; margin-bottom: 18px; }
  table { width:100%; border-collapse: collapse; margin-top: 10px; }
  th, td { border: 1px solid #ddd; padding: 8px 10px; text-align: left; font-size: 12px; }
  th { background:#f3f4f6; font-weight:600; }
  .qr-box { width:120px;height:120px;background:#f3f4f6;display:flex;align-items:center;justify-content:center;font-size:10px;color:#6b7280;border:1px dashed #ccc; }
  @media print { button { display:none; } }
  .print-btn { margin-top:20px;padding:10px 18px;background:#1a1a1a;color:#fff;border:none;border-radius:6px;cursor:pointer; }
`;

function _wrap(title, body) {
  return `<!DOCTYPE html><html><head><title>${title}</title><style>${BRAND_STYLES}</style></head>
  <body><div class="doc">${body}<button class="print-btn" onclick="window.print()">🖨️ Print</button></div></body></html>`;
}

// ────────── 1. PACKING SLIP ──────────
export function generatePackingSlipHTML(order, manufacturing) {
  const addr = order.shipping_address || {};
  const body = `
    <h1>📦 Smart Door — Packing Slip</h1>
    <div class="meta">Order ${order.order_number} · ${new Date().toLocaleString('en-IN')}</div>
    <table>
      <tr><th>Customer</th><td>${order.customer_name || '—'}</td></tr>
      <tr><th>Phone</th><td>${order.customer_phone || '—'}</td></tr>
      <tr><th>Email</th><td>${order.customer_email || '—'}</td></tr>
      <tr><th>Shipping Address</th><td>${[addr.line1, addr.city, addr.state, addr.pincode, addr.country].filter(Boolean).join(', ') || '—'}</td></tr>
      <tr><th>Plate ID</th><td><strong>${manufacturing.plate_id}</strong></td></tr>
      <tr><th>Product Type</th><td>${manufacturing.product_type}</td></tr>
      <tr><th>House No. / Name</th><td>${manufacturing.house_number || '—'} · ${manufacturing.plate_name || '—'}</td></tr>
      <tr><th>Order Total</th><td>₹${order.total_amount}</td></tr>
    </table>
  `;
  return _wrap('Packing Slip', body);
}

// ────────── 2. BOX LABEL ──────────
export function generateBoxLabelHTML(manufacturing, shipment = {}) {
  const body = `
    <div style="text-align:center;border:3px solid #1a1a1a;padding:24px;border-radius:8px;">
      <div style="font-size:11px;letter-spacing:2px;color:#666;">SMART DOOR</div>
      <div style="font-size:32px;font-weight:800;margin:10px 0;">${manufacturing.plate_id}</div>
      <div style="font-size:13px;margin-bottom:6px;">AWB: ${shipment.awbNumber || 'PENDING'}</div>
      <div style="font-size:13px;color:#444;">${manufacturing.house_number || ''} ${manufacturing.plate_name || ''}</div>
      <div style="margin-top:16px;font-size:10px;color:#999;">HANDLE WITH CARE · FRAGILE</div>
    </div>
  `;
  return _wrap('Box Label', body);
}

// ────────── 3. QR VERIFICATION SHEET ──────────
export function generateQRVerificationSheetHTML(manufacturing, qc = {}) {
  const url = getQrUrl(manufacturing.plate_id);
  const row = (label, ok) => `<tr><td>${label}</td><td>${ok ? '✅ Verified' : '❌ Not Verified'}</td></tr>`;
  const body = `
    <h1>🔍 QR Verification Sheet</h1>
    <div class="meta">Plate ${manufacturing.plate_id} · ${new Date().toLocaleString('en-IN')}</div>
    <div style="display:flex;gap:20px;align-items:flex-start;">
      <div class="qr-box">QR: ${manufacturing.plate_id}</div>
      <table style="flex:1;">
        <tr><th>Encoded URL</th><td>${url}</td></tr>
        ${row('QR Verified', qc.qr_verified)}
        ${row('Text Verified', qc.text_verified)}
        ${row('Material Verified', qc.material_verified)}
        ${row('Packaging Verified', qc.packaging_verified)}
        <tr><th>Approved By</th><td>${qc.approved_by || '—'}</td></tr>
        <tr><th>Approved At</th><td>${qc.approved_at ? new Date(qc.approved_at).toLocaleString('en-IN') : '—'}</td></tr>
      </table>
    </div>
  `;
  return _wrap('QR Verification Sheet', body);
}

// ────────── 4. CUSTOMER CARD ──────────
export function generateCustomerCardHTML(manufacturing) {
  const url = getQrUrl(manufacturing.plate_id);
  const body = `
    <div style="border:1px solid #ddd;border-radius:12px;padding:24px;text-align:center;background:#fafafa;">
      <div style="font-size:14px;font-weight:700;margin-bottom:8px;">🏠 Welcome to Smart Door</div>
      <div style="font-size:12px;color:#555;margin-bottom:16px;">Your Plate ID</div>
      <div style="font-size:22px;font-weight:800;letter-spacing:1px;margin-bottom:16px;">${manufacturing.plate_id}</div>
      <div class="qr-box" style="margin:0 auto 16px;">QR Code</div>
      <div style="font-size:11px;color:#666;">Scan or visit:</div>
      <div style="font-size:12px;color:#1a1a1a;font-weight:600;">${url}</div>
      <div style="font-size:11px;color:#666;margin-top:14px;">Login at smartdoor.in/login with your Plate ID + PIN to finish setup.</div>
    </div>
  `;
  return _wrap('Customer Card', body);
}

// ────────── RECORD GENERATION ──────────
/**
 * @param {string} manufacturingId
 * @param {string|null} orderId
 * @param {{ packingSlip?, boxLabel?, qrVerification?, customerCard? }} docs - booleans for which were generated
 * @param {string} generatedBy
 */
export async function recordPackagingGenerated(manufacturingId, orderId, docs = {}, generatedBy = 'admin') {
  try {
    const { data: existing } = await supabase
      .from('packaging_records')
      .select('id')
      .eq('manufacturing_id', manufacturingId)
      .maybeSingle();

    const payload = {
      manufacturing_id: manufacturingId,
      order_id: orderId || null,
      packing_slip_generated:    !!docs.packingSlip,
      box_label_generated:       !!docs.boxLabel,
      qr_verification_generated: !!docs.qrVerification,
      customer_card_generated:   !!docs.customerCard,
      generated_by: generatedBy,
      generated_at: new Date().toISOString(),
    };

    const result = existing
      ? await supabase.from('packaging_records').update(payload).eq('id', existing.id).select().single()
      : await supabase.from('packaging_records').insert(payload).select().single();

    if (result.error) return { success: false, error: result.error.message };
    return { success: true, record: result.data };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

export async function getPackagingStatus(manufacturingId) {
  try {
    const { data, error } = await supabase
      .from('packaging_records')
      .select('*')
      .eq('manufacturing_id', manufacturingId)
      .maybeSingle();

    if (error) return { success: false, error: error.message };
    return { success: true, record: data || null };
  } catch (err) {
    return { success: false, error: err.message };
  }
}
