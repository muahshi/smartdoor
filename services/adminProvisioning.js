/**
 * Smart Door — Admin Provisioning Service
 * services/adminProvisioning.js
 *
 * Client-side facade for the Internal Admin Portal's provisioning
 * workflows. Every method here is a thin wrapper around a service_role
 * Edge Function (supabase/functions/admin-*) — this file NEVER touches
 * `users`, `plates`, `admin_audit_logs`, etc. directly with the anon key,
 * because RLS (sql/10_security_hardening.sql, sql/08_admin_schema.sql)
 * blocks anon/authenticated writes to all of those tables. The Edge
 * Functions are the only place these writes can actually succeed.
 *
 * Architecture (per the brief — Razorpay automation prep):
 *   createCustomer()      → admin-provision-customer
 *   generatePlateId()     → local preview only (server re-generates +
 *                            guarantees uniqueness inside createCustomer;
 *                            this is just for the UI to show *a* plate id
 *                            before submit, e.g. on the QR preview card)
 *   generateQRCode()      → local preview (services/qr.js), real upload
 *                            happens server-side as part of createCustomer
 *   createPlate()         → alias of createCustomer() (plate is always
 *                            created together with its owner — the schema
 *                            has no concept of an ownerless plate)
 *   resetPin()            → admin-reset-pin
 *   transferOwnership()   → admin-transfer-ownership
 *   suspendPlate() /
 *   reactivatePlate()     → admin-plate-status
 *   resendActivation()    → re-sends the delivery/activation email + WhatsApp
 *                            via the existing send-email / send-whatsapp
 *                            functions (no new backend needed for this one)
 *
 * Razorpay webhook automation is intentionally NOT wired here yet — see
 * the `prepareForRazorpayWebhook()` stub at the bottom. Do not connect it
 * until product/payments sign off, per the brief.
 */

import { supabase } from './supabase.js';
import { getAdminSession, adminAuditLog } from './admin.js';
import { generatePlateId as previewPlateId, getQrUrl } from './plates.js';
import { generateQrDataUrl, generateQrSvg } from './qr.js';
import { sendEmail, EMAIL_TEMPLATES } from './email.js';
import { sendWhatsApp } from './whatsapp.js';

// ────────── INTERNAL: AUTHENTICATED EDGE FUNCTION CALL ──────────
/**
 * All admin-* Edge Functions verify the session token server-side
 * (supabase/functions/_shared/adminAuth.ts) via this Authorization header —
 * NOT via the Supabase anon/auth session, since admin login is a separate,
 * custom session system (see services/admin.js).
 */
async function callAdminFunction(name, body) {
  const session = getAdminSession();
  if (!session?.token) {
    return { success: false, error: 'Your admin session has expired. Please sign in again.' };
  }

  try {
    const { data, error } = await supabase.functions.invoke(name, {
      body,
      headers: { Authorization: `Bearer ${session.token}` },
    });

    if (error) {
      return { success: false, error: error.message || 'Request failed.' };
    }
    if (!data?.success) {
      return { success: false, error: data?.message || 'Request failed.' };
    }
    return data;
  } catch (err) {
    console.error(`[adminProvisioning] ${name} error:`, err);
    return { success: false, error: 'Connection error. Please try again.' };
  }
}

// ────────── PLATE ID (client-side preview only) ──────────
export function generatePlateId() {
  return previewPlateId();
}

// ────────── QR CODE (client-side preview only) ──────────
/**
 * Renders a preview QR (PNG data URL) for the Create Customer form,
 * before the customer actually exists. The real QR that gets uploaded
 * to Storage and saved on the plate row is generated server-side inside
 * admin-provision-customer, against the *final* unique plate id.
 */
export async function generateQRCode(plateId) {
  try {
    const [dataUrl, svg] = await Promise.all([
      generateQrDataUrl(plateId),
      generateQrSvg(plateId),
    ]);
    return { success: true, dataUrl, svg, url: getQrUrl(plateId) };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

// ────────── CREATE CUSTOMER (full provisioning flow) ──────────
/**
 * @param {object} input
 * @param {string} input.fullName
 * @param {string} input.phone
 * @param {string} [input.email]
 * @param {string} [input.address]
 * @param {'acrylic'|'stainless'|'teakwood'} input.productType
 * @param {string} input.initialPin   - 4 digits
 * @param {'starter'|'standard'|'scale'} [input.subscriptionPlan]
 */
export async function createCustomer({
  fullName, phone, email, address, productType, initialPin, subscriptionPlan,
}) {
  const result = await callAdminFunction('admin-provision-customer', {
    full_name: fullName,
    phone,
    email: email || null,
    address: address || null,
    product_type: productType,
    initial_pin: initialPin,
    subscription_plan: subscriptionPlan || null,
  });

  if (!result.success) return result;
  return { success: true, customer: result.customer };
}

// createPlate() is an alias — see file header. Kept as a separate export
// so callers/UI code can express intent clearly even though, under this
// schema, a plate can't exist without its owner being created at the
// same time.
export const createPlate = createCustomer;

// ────────── PIN RESET ──────────
export async function resetPin(ownerId, newPin) {
  const result = await callAdminFunction('admin-reset-pin', { owner_id: ownerId, new_pin: newPin });
  return result;
}

// ────────── SUSPEND / REACTIVATE PLATE ──────────
export async function suspendPlate(plateId, reason) {
  return callAdminFunction('admin-plate-status', { plate_id: plateId, action: 'suspend', reason });
}

export async function reactivatePlate(plateId) {
  return callAdminFunction('admin-plate-status', { plate_id: plateId, action: 'reactivate' });
}

/** For legacy/order-provisioned plates whose plates.qr_image_url/qr_svg_url is still null. */
export async function regenerateQr(plateId) {
  return callAdminFunction('admin-plate-status', { plate_id: plateId, action: 'regenerate_qr' });
}

// ────────── TRANSFER OWNERSHIP ──────────
/**
 * @param {object} input
 * @param {string} input.plateId
 * @param {'house_sold'|'tenant_changed'|'new_owner'} input.reason
 * @param {string} input.newOwnerName
 * @param {string} input.newOwnerPhone
 * @param {string} [input.newOwnerEmail]
 * @param {string} input.newOwnerPin   - 4 digits
 * @param {string} [input.notes]
 */
export async function transferOwnership({
  plateId, reason, newOwnerName, newOwnerPhone, newOwnerEmail, newOwnerPin, notes,
}) {
  return callAdminFunction('admin-transfer-ownership', {
    plate_id: plateId,
    reason,
    new_owner_name: newOwnerName,
    new_owner_phone: newOwnerPhone,
    new_owner_email: newOwnerEmail || null,
    new_owner_pin: newOwnerPin,
    notes: notes || null,
  });
}

// ────────── RESEND ACTIVATION ──────────
/**
 * "support" role gets this even without general customer-write access.
 * Reuses the already-implemented delivery_confirmation email template +
 * WhatsApp send — no new Edge Function needed, send-email/send-whatsapp
 * are safe to call directly with the anon key (no DB writes).
 */
export async function resendActivation({ ownerId, fullName, email, phone, plateId }) {
  const appUrl = window.__SD_CONFIG__?.baseUrl || 'https://mysmartdoor.in';
  const results = { email: null, whatsapp: null };

  if (email) {
    results.email = await sendEmail(EMAIL_TEMPLATES.DELIVERY_CONFIRMATION, email, fullName, {
      plate_id: plateId,
      app_url: `${appUrl}/login.html?plate_id=${encodeURIComponent(plateId)}`,
    });
  }

  if (phone) {
    results.whatsapp = await sendWhatsApp({
      ownerId,
      toPhone: phone,
      templateName: 'delivery_confirmation',
      templateVars: { plate_id: plateId, login_url: `${appUrl}/login.html` },
    });
  }

  // Audit (best-effort — see services/admin.js note on admin_audit_logs RLS
  // for why this may not persist until that table also gets a service-role
  // write path; logged anyway so nothing here silently disappears from the UI).
  await adminAuditLog('activation_resent', 'customers', ownerId, {}, {}, `Resent to ${email || ''} ${phone || ''}`.trim());

  return { success: true, results };
}

// ────────── RAZORPAY AUTOMATION (architecture only — NOT connected) ──────────
/**
 * Placeholder for the future webhook → auto-provision flow:
 *   Razorpay payment.captured webhook → verify signature →
 *   createCustomer({...from order...}) → email/WhatsApp the QR package.
 * Intentionally unimplemented per the brief ("Do NOT connect Razorpay yet").
 */
export function prepareForRazorpayWebhook() {
  throw new Error('Razorpay provisioning automation is not connected yet — architecture only.');
}
