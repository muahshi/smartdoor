/**
 * My Smart Door — Partner Onboarding Service
 * services/partnerOnboarding.js
 *
 * PHASE 8C (PART 1): Thin client wrapper around the public
 * `partner-application` Edge Function. Unlike services/adminData.js,
 * this needs no admin session — it's used by partner-apply.html, the
 * public dealer/franchise/distributor application form.
 */

import { fetchWithTimeout } from './httpClient.js';

function _edgeBase() { return `${window.__SD_CONFIG__?.supabaseUrl || ''}/functions/v1`; }

async function _call(type, extra = {}) {
  try {
    const res = await fetchWithTimeout(`${_edgeBase()}/partner-application`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type, ...extra }),
    }, 15000);

    const data = await res.json();
    if (!data?.success) {
      return { success: false, error: data?.message || 'Request failed.' };
    }
    return data;
  } catch (err) {
    console.error('[partnerOnboarding]', type, 'error:', err);
    return {
      success: false,
      error: err?.isTimeout ? 'Request timed out. Please check your connection and try again.' : 'Connection error. Please try again.',
    };
  }
}

export async function submitPartnerApplication(fields) {
  return _call('submit', fields);
}

export async function uploadPartnerDocument({ applicationNumber, contactPhone, docType, fileBase64, mimeType }) {
  return _call('upload_document', {
    application_number: applicationNumber,
    contact_phone: contactPhone,
    doc_type: docType,
    file_base64: fileBase64,
    mime_type: mimeType,
  });
}

export async function getPartnerApplicationStatus({ applicationNumber, contactPhone }) {
  return _call('status', { application_number: applicationNumber, contact_phone: contactPhone });
}

export async function reapplyPartnerApplication({ applicationNumber, contactPhone, ...updates }) {
  return _call('reapply', { application_number: applicationNumber, contact_phone: contactPhone, ...updates });
}

/** Reads a File/Blob into a base64 string (strips the data: URL prefix) for upload. */
export function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(',')[1] || '');
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
