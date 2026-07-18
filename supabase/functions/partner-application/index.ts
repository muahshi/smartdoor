/**
 * Smart Door — Edge Function: partner-application
 * supabase/functions/partner-application/index.ts
 *
 * PHASE 8C (PART 1): Public, unauthenticated endpoint for prospective
 * dealers/franchises/distributors to apply, upload KYC documents, check
 * their status, and reapply after rejection.
 *
 * Mirrors the existing public-function conventions in this codebase:
 *   - service_role client (RLS on partner_applications/partner_kyc_documents
 *     is "no_public_access" — this function is the only writer)
 *   - restrictedCors (POST-only, origin-restricted)
 *   - allowEdgeRequest per-IP rate limiting (same in-memory sliding window
 *     used by send-sms/send-whatsapp/send-email)
 *   - base64-in document upload → storage.upload via service_role, same
 *     pattern as admin-data's installation_job_photo_add
 *
 * POST body: { type: string, ...params }
 *
 * Types:
 *   submit            — create a new application
 *   upload_document    — attach a KYC document to an application
 *   status              — check status (ownership proven via app number + phone)
 *   reapply             — new application linked to a previously rejected one
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { restrictedCors } from '../_shared/cors.ts';
import { getServiceClient } from '../_shared/adminAuth.ts';
import { allowEdgeRequest, callerIp } from '../_shared/edgeRateLimit.ts';

const PER_IP_WINDOW_MS = 60 * 60_000; // 1 hour
const PER_IP_MAX = 20;                 // generous — a real applicant needs submit + a few doc uploads + status checks

const PARTNER_TYPES = ['dealer', 'franchise', 'distributor'];
const DOC_TYPES = ['gst_certificate', 'pan_card', 'address_proof', 'bank_proof', 'other'];

// GSTIN: 2 digits state code, 10-char PAN, 1 digit entity code, 'Z', 1 checksum char
const GSTIN_RE = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;
// PAN: 5 letters, 4 digits, 1 letter
const PAN_RE = /^[A-Z]{5}[0-9]{4}[A-Z]{1}$/;
const PHONE_RE = /^[6-9]\d{9}$/; // Indian mobile, matches convention used elsewhere in this repo

function badRequest(headers: Record<string, string>, message: string) {
  return Response.json({ success: false, message }, { status: 400, headers });
}

serve(async (req) => {
  const headers = restrictedCors(req.headers.get('origin'));
  if (req.method === 'OPTIONS') return new Response('ok', { headers });
  if (req.method !== 'POST') {
    return Response.json({ success: false, message: 'Method not allowed' }, { status: 405, headers });
  }

  const ip = callerIp(req);
  if (!allowEdgeRequest(`partner-application:ip:${ip}`, PER_IP_WINDOW_MS, PER_IP_MAX)) {
    return Response.json({ success: false, message: 'Too many requests. Please try again later.' }, { status: 429, headers: { ...headers, 'Retry-After': '3600' } });
  }

  const db = getServiceClient();

  let body: Record<string, unknown>;
  try { body = await req.json(); }
  catch { return badRequest(headers, 'Invalid JSON body'); }

  const { type } = body as { type?: string };

  try {
    // ── SUBMIT ────────────────────────────────────────────────────────
    if (type === 'submit') {
      const {
        partner_type, business_name, business_type,
        gst_number, pan_number,
        bank_account_name, bank_account_number, bank_ifsc, bank_name,
        contact_name, contact_phone, contact_email,
        address, requested_territory,
      } = body as any;

      if (!PARTNER_TYPES.includes(partner_type)) return badRequest(headers, `partner_type must be one of: ${PARTNER_TYPES.join(', ')}`);
      if (!business_name || String(business_name).trim().length < 2) return badRequest(headers, 'business_name is required');
      if (!contact_name || String(contact_name).trim().length < 2) return badRequest(headers, 'contact_name is required');
      if (!PHONE_RE.test(String(contact_phone || ''))) return badRequest(headers, 'contact_phone must be a valid 10-digit Indian mobile number');
      if (gst_number && !GSTIN_RE.test(String(gst_number).toUpperCase())) return badRequest(headers, 'gst_number format is invalid');
      if (pan_number && !PAN_RE.test(String(pan_number).toUpperCase())) return badRequest(headers, 'pan_number format is invalid');

      // Same-phone spam guard: block a brand-new submission if this phone
      // already has an application that isn't rejected (use `reapply` instead).
      const { data: existing } = await db
        .from('partner_applications')
        .select('id, status')
        .eq('contact_phone', contact_phone)
        .not('status', 'eq', 'rejected')
        .limit(1)
        .maybeSingle();
      if (existing) {
        return badRequest(headers, 'An application from this phone number is already in progress. Use the status check instead.');
      }

      const { data: numData, error: numErr } = await db.rpc('generate_partner_application_number');
      if (numErr) return Response.json({ success: false, message: numErr.message }, { status: 500, headers });

      const { data, error } = await db.from('partner_applications').insert({
        application_number: numData,
        partner_type,
        business_name: String(business_name).trim(),
        business_type: business_type || null,
        gst_number: gst_number ? String(gst_number).toUpperCase() : null,
        pan_number: pan_number ? String(pan_number).toUpperCase() : null,
        bank_account_name: bank_account_name || null,
        bank_account_number: bank_account_number || null,
        bank_ifsc: bank_ifsc || null,
        bank_name: bank_name || null,
        contact_name: String(contact_name).trim(),
        contact_phone,
        contact_email: contact_email || null,
        address: address || {},
        requested_territory: requested_territory || null,
      }).select('id, application_number, status').maybeSingle();

      if (error) return Response.json({ success: false, message: error.message }, { status: 400, headers });
      return Response.json({ success: true, application: data }, { headers });
    }

    // ── UPLOAD DOCUMENT ──────────────────────────────────────────────
    if (type === 'upload_document') {
      const { application_number, contact_phone, doc_type, file_base64, mime_type } = body as any;
      if (!application_number || !contact_phone) return badRequest(headers, 'application_number and contact_phone required');
      if (!DOC_TYPES.includes(doc_type)) return badRequest(headers, `doc_type must be one of: ${DOC_TYPES.join(', ')}`);
      if (!file_base64) return badRequest(headers, 'file_base64 required');

      // Ownership proof: application_number + contact_phone must match together
      // (no login exists for applicants pre-approval — same lightweight pattern
      // as other unauthenticated flows in this codebase).
      const { data: app } = await db.from('partner_applications')
        .select('id, status')
        .eq('application_number', application_number)
        .eq('contact_phone', contact_phone)
        .maybeSingle();
      if (!app) return Response.json({ success: false, message: 'Application not found' }, { status: 404, headers });
      if (app.status === 'approved' || app.status === 'rejected') {
        return badRequest(headers, `Cannot upload documents — application is already ${app.status}.`);
      }

      const mime = mime_type || 'image/jpeg';
      const ext = mime.includes('png') ? 'png' : mime.includes('webp') ? 'webp' : mime.includes('pdf') ? 'pdf' : 'jpg';
      const path = `${app.id}/${doc_type}-${crypto.randomUUID()}.${ext}`;

      let bytes: Uint8Array;
      try { bytes = Uint8Array.from(atob(file_base64), (c) => c.charCodeAt(0)); }
      catch { return badRequest(headers, 'file_base64 is not valid base64'); }
      if (bytes.byteLength > 10 * 1024 * 1024) return badRequest(headers, 'File too large (10MB max)');

      const { error: upErr } = await db.storage.from('partner-documents').upload(path, bytes, { contentType: mime });
      if (upErr) return Response.json({ success: false, message: upErr.message }, { status: 400, headers });

      const { data: signed } = await db.storage.from('partner-documents').createSignedUrl(path, 60 * 60 * 24 * 30);

      const { data: docRow, error: docErr } = await db.from('partner_kyc_documents').insert({
        application_id: app.id,
        doc_type,
        file_url: signed?.signedUrl || path,
      }).select('id, doc_type, status, created_at').maybeSingle();

      if (docErr) return Response.json({ success: false, message: docErr.message }, { status: 400, headers });

      // Move a fresh 'submitted' application into 'under_review' once the
      // applicant starts uploading documents — purely informational status,
      // doesn't gate anything.
      if (app.status === 'submitted') {
        await db.from('partner_applications').update({ status: 'under_review' }).eq('id', app.id);
      }

      return Response.json({ success: true, document: docRow }, { headers });
    }

    // ── STATUS ───────────────────────────────────────────────────────
    if (type === 'status') {
      const { application_number, contact_phone } = body as any;
      if (!application_number || !contact_phone) return badRequest(headers, 'application_number and contact_phone required');

      const { data: app, error } = await db.from('partner_applications')
        .select('application_number, partner_type, business_name, status, rejection_reason, created_at, reviewed_at')
        .eq('application_number', application_number)
        .eq('contact_phone', contact_phone)
        .maybeSingle();
      if (error) return Response.json({ success: false, message: error.message }, { status: 400, headers });
      if (!app) return Response.json({ success: false, message: 'Application not found' }, { status: 404, headers });

      const { data: docs } = await db.from('partner_kyc_documents')
        .select('doc_type, status, created_at')
        .eq('application_id', (await db.from('partner_applications').select('id').eq('application_number', application_number).maybeSingle()).data?.id);

      return Response.json({ success: true, application: app, documents: docs || [] }, { headers });
    }

    // ── REAPPLY ──────────────────────────────────────────────────────
    if (type === 'reapply') {
      const { application_number, contact_phone, ...updates } = body as any;
      if (!application_number || !contact_phone) return badRequest(headers, 'application_number and contact_phone required');

      const { data: prev } = await db.from('partner_applications')
        .select('*')
        .eq('application_number', application_number)
        .eq('contact_phone', contact_phone)
        .maybeSingle();
      if (!prev) return Response.json({ success: false, message: 'Application not found' }, { status: 404, headers });
      if (prev.status !== 'rejected') return badRequest(headers, 'Only a rejected application can be reapplied.');

      const merged = { ...prev, ...updates };
      if (merged.gst_number && !GSTIN_RE.test(String(merged.gst_number).toUpperCase())) return badRequest(headers, 'gst_number format is invalid');
      if (merged.pan_number && !PAN_RE.test(String(merged.pan_number).toUpperCase())) return badRequest(headers, 'pan_number format is invalid');

      const { data: numData, error: numErr } = await db.rpc('generate_partner_application_number');
      if (numErr) return Response.json({ success: false, message: numErr.message }, { status: 500, headers });

      const { data, error } = await db.from('partner_applications').insert({
        application_number: numData,
        partner_type: merged.partner_type,
        business_name: merged.business_name,
        business_type: merged.business_type,
        gst_number: merged.gst_number ? String(merged.gst_number).toUpperCase() : null,
        pan_number: merged.pan_number ? String(merged.pan_number).toUpperCase() : null,
        bank_account_name: merged.bank_account_name,
        bank_account_number: merged.bank_account_number,
        bank_ifsc: merged.bank_ifsc,
        bank_name: merged.bank_name,
        contact_name: merged.contact_name,
        contact_phone: merged.contact_phone,
        contact_email: merged.contact_email,
        address: merged.address || {},
        requested_territory: merged.requested_territory,
        previous_application_id: prev.id,
      }).select('id, application_number, status').maybeSingle();

      if (error) return Response.json({ success: false, message: error.message }, { status: 400, headers });
      return Response.json({ success: true, application: data }, { headers });
    }

    return badRequest(headers, `Unknown type: ${type}`);
  } catch (err) {
    console.error('[partner-application] Unhandled error:', err);
    return Response.json({ success: false, message: 'Internal error' }, { status: 500, headers });
  }
});
