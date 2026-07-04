/**
 * Smart Door — Background Push Notification Edge Function (FCM)
 * supabase/functions/send-push/index.ts
 *
 * Sends a real Firebase Cloud Messaging push to every device the owner has
 * subscribed on push_subscriptions — this is what makes a notification
 * arrive even when the owner's dashboard/PWA is fully closed (screen off,
 * tab killed), which services/notificationDispatcher.js's foreground-only
 * showNotification() path documents itself as unable to do.
 *
 * Called from visitor.html right after a visitor event is logged
 * (qr_scan / bell_ring / sos_triggered / voice / text), from the AI
 * receptionist turn handler when it needs the owner's personal attention
 * (ai_escalation), and from the renewal engine (status_reminder) — every
 * caller is either the VISITOR's browser (guaranteed active at that
 * moment even if the owner's isn't) or a trusted server context, so
 * triggering from the write-site is sufficient (no DB trigger / pg_net
 * needed, no new Postgres extension).
 *
 * Body: { ownerId, plateId, type, rowId, conversationId?, daysLeft?, expired? }
 *   type: 'qr_scan' | 'bell_ring' | 'voice' | 'text' | 'sos' | 'ai_escalation' | 'status_reminder'
 *   rowId: the visitor_logs/messages/subscriptions row's own uuid — reused
 *          as the OS notification tag's uniqueness key. EXCEPTION: for the
 *          "collapsible" types (bell_ring, qr_scan) the tag is keyed on
 *          plateId instead of rowId on purpose — see COLLAPSIBLE_TYPES
 *          below — so repeated bell presses / rapid re-scans REPLACE the
 *          previous OS notification instead of stacking N separate ones.
 *          renotify:true (set client-side in sw.js) still re-alerts
 *          (sound/vibrate) on every replace.
 *   plateId: optional for 'status_reminder' (subscriptions aren't tied to
 *            a single plate) — required and ownership-verified for every
 *            other type.
 *   daysLeft / expired: status_reminder only — plain numbers/booleans used
 *          to compute the body text server-side (see SECURITY note below).
 *
 * SECURITY: title/body are NEVER taken from the client as free text — only
 * `type` (+ numeric daysLeft/expired for status_reminder) is, mapped
 * through a fixed allow-list below. This stops an anon visitor from using
 * this endpoint to push arbitrary text to an owner's phone. plateId (when
 * supplied) is verified to actually belong to ownerId before sending;
 * ownerId itself is always verified to be a real user. qr_scan and
 * status_reminder are additionally throttled per-owner (see _recentEvents)
 * since they're the two types with no client-side rate limit upstream.
 *
 * Uses Firebase's HTTP v1 send API directly (fetch + a hand-signed OAuth2
 * service-account JWT via Web Crypto) instead of the firebase-admin SDK —
 * keeps this dependency-free like the rest of this repo's Edge Functions
 * (see admin-login's bcryptjs comment for why heavy SDKs are avoided here).
 *
 * Deploy with: supabase functions deploy send-push --no-verify-jwt
 * Required secrets (Supabase Dashboard → Edge Functions → Secrets):
 *   FIREBASE_PROJECT_ID
 *   FIREBASE_CLIENT_EMAIL
 *   FIREBASE_PRIVATE_KEY     (paste the full PEM, including BEGIN/END lines;
 *                             literal \n in the pasted value is handled below)
 * These are the SAME three fields inside the Firebase service-account JSON
 * you download from Firebase Console → Project Settings → Service Accounts
 * → Generate new private key. Do NOT set these as VITE_/client vars —
 * they must only exist as Edge Function secrets (server-side).
 */

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';

const EVENT_CONFIG: Record<string, { title: string; body: string; requireInteraction: boolean }> = {
  bell_ring:       { title: '🔔 Someone is at your door', body: 'A visitor rang the digital bell.', requireInteraction: true },
  qr_scan:         { title: '📲 Someone scanned your QR', body: 'A visitor opened your Smart Door page.', requireInteraction: false },
  voice:           { title: '🎤 New voice message', body: 'A visitor left a voice message.', requireInteraction: true },
  text:            { title: '💬 New message from a visitor', body: 'A visitor sent you a text message.', requireInteraction: false },
  sos:             { title: '🚨 EMERGENCY — SOS Triggered', body: 'A visitor pressed the SOS button. Respond immediately.', requireInteraction: true },
  ai_escalation:   { title: '🙋 Visitor needs your attention', body: "Priya (AI) couldn't fully help this visitor — your personal reply may be needed.", requireInteraction: true },
  // status_reminder's body is recomputed from daysLeft/expired below —
  // this default is only the fallback if those fields are ever missing.
  status_reminder: { title: '⏰ Subscription Reminder', body: 'Your Smart Door subscription needs your attention.', requireInteraction: false },
};

// Event types whose OS notification should REPLACE the previous one for the
// same plate rather than stack up as separate notifications — e.g. a
// visitor mashing the doorbell five times shows ONE updated notification,
// not five. Tag is keyed on plateId instead of the row's own uuid for
// these types only (see _buildTag below). Every other type keeps a
// per-row unique tag so distinct messages/emergencies are never merged.
const COLLAPSIBLE_TYPES = new Set(['bell_ring', 'qr_scan']);

function _buildTag(type: string, plateId: string | null, rowId: string): string {
  if (COLLAPSIBLE_TYPES.has(type) && plateId) return `smartdoor-${type}-${plateId}`;
  return `smartdoor-${type}-${rowId}`;
}

// Best-effort throttle for event types with no client-side rate limit
// upstream: qr_scan (see services/rateLimiter.js — bell/voice/text/sos are
// already gated before this is ever called) and status_reminder (guards
// against an owner_id being replayed to spam reminder pushes).
// In-memory only — resets on cold start, which is fine for a soft throttle.
const _recentEvents = new Map<string, number>();
const THROTTLE_MS: Record<string, number> = {
  qr_scan: 15_000,
  status_reminder: 60 * 60 * 1000, // 1 reminder push per owner per hour, max
};

// PHASE 3 (premium notification content): renders the exact wall-clock
// moment of the event in the owner's local timezone (Bhopal/IST) so the
// notification body itself shows "Plate SD-ABX9K7 · 4 Jul, 9:42 PM"
// instead of a bare generic sentence. Server-computed only — never taken
// from client free text (see SECURITY note above this file's header).
function _formatIST(ts: number): string {
  try {
    return new Intl.DateTimeFormat('en-IN', {
      timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hour12: true,
    }).format(new Date(ts));
  } catch (_) {
    return new Date(ts).toISOString();
  }
}

function _pemToArrayBuffer(pem: string): ArrayBuffer {
  const cleaned = pem
    .replace(/\\n/g, '\n')                    // env vars often arrive with literal \n
    .replace(/-----BEGIN PRIVATE KEY-----/, '')
    .replace(/-----END PRIVATE KEY-----/, '')
    .replace(/\s/g, '');
  const binary = atob(cleaned);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

function _b64url(bytes: ArrayBuffer | string): string {
  const bin = typeof bytes === 'string' ? bytes : String.fromCharCode(...new Uint8Array(bytes));
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** Exchanges the Firebase service-account key for a short-lived Google OAuth2 access token. */
async function getGoogleAccessToken(clientEmail: string, privateKeyPem: string): Promise<string> {
  const header = { alg: 'RS256', typ: 'JWT' };
  const now = Math.floor(Date.now() / 1000);
  const claims = {
    iss: clientEmail,
    scope: 'https://www.googleapis.com/auth/firebase.messaging',
    aud: 'https://oauth2.googleapis.com/token',
    exp: now + 3600,
    iat: now,
  };
  const unsigned = `${_b64url(JSON.stringify(header))}.${_b64url(JSON.stringify(claims))}`;

  const cryptoKey = await crypto.subtle.importKey(
    'pkcs8',
    _pemToArrayBuffer(privateKeyPem),
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const signature = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', cryptoKey, new TextEncoder().encode(unsigned));
  const jwt = `${unsigned}.${_b64url(signature)}`;

  const resp = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=${encodeURIComponent('urn:ietf:params:oauth:grant-type:jwt-bearer')}&assertion=${jwt}`,
  });
  const data = await resp.json();
  if (!resp.ok) throw new Error(`Google OAuth token error: ${JSON.stringify(data)}`);
  return data.access_token;
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ success: false, error: 'Method not allowed' }), { status: 405, headers: corsHeaders });
  }

  try {
    const projectId   = Deno.env.get('FIREBASE_PROJECT_ID');
    const clientEmail = Deno.env.get('FIREBASE_CLIENT_EMAIL');
    const privateKey  = Deno.env.get('FIREBASE_PRIVATE_KEY');
    if (!projectId || !clientEmail || !privateKey) {
      return new Response(JSON.stringify({ success: false, error: 'Push not configured on server (missing FIREBASE_* secrets).' }), { status: 500, headers: corsHeaders });
    }

    const { ownerId, plateId = null, type, rowId, conversationId = null, daysLeft = null, expired = false, imageUrl = null } = await req.json();
    const cfg = EVENT_CONFIG[type];
    // plateId is required for every type EXCEPT status_reminder (a
    // subscription isn't tied to one specific plate — see header comment).
    const plateRequired = type !== 'status_reminder';
    if (!ownerId || !rowId || !cfg || (plateRequired && !plateId)) {
      return new Response(JSON.stringify({ success: false, error: 'Missing or invalid fields.' }), { status: 400, headers: corsHeaders });
    }

    const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

    if (plateId) {
      // Verify plateId really belongs to ownerId — stops an anon caller
      // from pushing to an arbitrary owner by guessing/enumerating ids.
      const { data: plate } = await supabase.from('plates').select('id').eq('plate_id', plateId).eq('owner_id', ownerId).maybeSingle();
      if (!plate) {
        return new Response(JSON.stringify({ success: false, error: 'plateId does not belong to ownerId.' }), { status: 403, headers: corsHeaders });
      }
    } else {
      // status_reminder with no plateId — still verify ownerId is a real
      // user so this can't be used to probe/spam arbitrary uuids.
      const { data: owner } = await supabase.from('users').select('id').eq('id', ownerId).maybeSingle();
      if (!owner) {
        return new Response(JSON.stringify({ success: false, error: 'ownerId not found.' }), { status: 403, headers: corsHeaders });
      }
    }

    const throttleMs = THROTTLE_MS[type];
    if (throttleMs) {
      const key = `${ownerId}:${plateId || '-'}:${type}`;
      const last = _recentEvents.get(key) || 0;
      if (Date.now() - last < throttleMs) {
        return new Response(JSON.stringify({ success: true, skipped: 'throttled' }), { status: 200, headers: corsHeaders });
      }
      _recentEvents.set(key, Date.now());
    }

    const { data: subs, error: subsErr } = await supabase
      .from('push_subscriptions')
      .select('id, fcm_token')
      .eq('owner_id', ownerId);

    if (subsErr) throw subsErr;
    if (!subs || !subs.length) {
      return new Response(JSON.stringify({ success: true, sent: 0, reason: 'no_subscriptions' }), { status: 200, headers: corsHeaders });
    }

    const accessToken = await getGoogleAccessToken(clientEmail, privateKey);

    // status_reminder body is computed from the numeric daysLeft/expired
    // fields only (never free text) — see header SECURITY note.
    let title = cfg.title;
    let body = cfg.body;
    if (type === 'status_reminder') {
      const left = Number.isFinite(daysLeft) ? Number(daysLeft) : null;
      if (expired || (left !== null && left <= 0)) {
        title = '⚠️ Subscription Expired';
        body = 'Your Smart Door subscription has expired. Renew now to restore full features.';
      } else if (left !== null) {
        title = `⏰ Renewal reminder — ${left} day${left === 1 ? '' : 's'} left`;
        body = 'Renew now to avoid any interruption to your Smart Door.';
      }
    }

    const tag = _buildTag(type, plateId, String(rowId));

    // PHASE 3 (premium notification content): append the QR plate + exact
    // IST time to the body for every type except status_reminder (which
    // already has its own fully custom, days-left-driven copy above).
    // NOTE: this doorbell flow's visitor_logs/message_logs rows are
    // intentionally anonymous — there is no visitor_name or category
    // column anywhere in this pipeline (that only exists in the separate
    // society/property_management visitor-pass module, a different
    // feature entirely) — so "visitor name"/"category" are NOT fabricated
    // here. plateId is the one real, already-verified identifier available
    // at this point (ownership-checked above), so it's safe to interpolate.
    const eventTs = Date.now();
    if (type !== 'status_reminder' && plateId) {
      body = `${body} · Plate ${plateId} · ${_formatIST(eventTs)}`;
    }

    // Optional visitor photo (e.g. a future camera-capture feature) — pure
    // pass-through, ignored today since nothing currently sends imageUrl.
    // Restricted to https:// to avoid a data:/javascript: URL ever landing
    // in a notification's `image` field.
    const safeImageUrl = typeof imageUrl === 'string' && /^https:\/\//i.test(imageUrl) ? imageUrl : '';

    // Data-only message (no top-level `notification` key) — sw.js reads
    // this flat shape directly off the raw 'push' event (see sw.js header
    // comment for why no separate firebase-messaging-sw.js/
    // onBackgroundMessage() is used) and builds the notification with the
    // SAME tag scheme the foreground realtime path
    // (services/notificationDispatcher.js) uses, so a device that's both
    // subscribed AND has an open tab never shows this twice.
    const dataPayload: Record<string, string> = {
      id: String(rowId),
      type: String(type),
      title,
      body,
      url: type === 'ai_escalation' || type === 'text' || type === 'voice' ? '/app.html?tab=inbox' : '/app.html',
      requireInteraction: String(cfg.requireInteraction),
      conversationId: conversationId ? String(conversationId) : '',
      plateId: plateId ? String(plateId) : '',
      tag,
      // Real event time (not "whenever the SW got around to processing the
      // push"), so the OS tray's relative time ("2m ago") is accurate.
      timestamp: String(eventTs),
      image: safeImageUrl,
    };

    let sent = 0;
    const stale: string[] = [];

    await Promise.all(subs.map(async (s: any) => {
      const resp = await fetch(`https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({
          message: {
            token: s.fcm_token,
            data: dataPayload,
            // Urgency:high is the Web Push equivalent of an Android "high
            // importance" channel for a browser-delivered PWA notification
            // — Chrome/Android route this to wake the device and bypass
            // Doze batching. android.priority is included too in case this
            // project is ever wrapped as a TWA/native shell, where FCM's
            // native Android channel_id/priority applies directly; it's a
            // harmless no-op for plain browser delivery.
            webpush: { headers: { Urgency: 'high' } },
            android: { priority: 'high' },
          },
        }),
      });
      if (resp.ok) {
        sent++;
      } else {
        const errBody = await resp.json().catch(() => ({}));
        const errStatus = errBody?.error?.details?.[0]?.errorCode || errBody?.error?.status;
        // UNREGISTERED = token expired/app uninstalled on that device — clean it up.
        if (errStatus === 'UNREGISTERED' || resp.status === 404) stale.push(s.id);
        else console.error('[send-push] FCM delivery failed:', resp.status, JSON.stringify(errBody));
      }
    }));

    if (stale.length) {
      await supabase.from('push_subscriptions').delete().in('id', stale);
    }

    return new Response(JSON.stringify({ success: true, sent, total: subs.length, cleaned: stale.length }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('[send-push] Unexpected error:', err);
    return new Response(JSON.stringify({ success: false, error: 'Internal server error.' }), { status: 500, headers: corsHeaders });
  }
});
