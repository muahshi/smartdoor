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
 * (qr_scan / bell_ring / sos_triggered / voice / text) — the VISITOR's
 * browser is guaranteed to be active at that moment, even if the OWNER's
 * isn't, so triggering from there is sufficient (no DB trigger / pg_net
 * needed, no new Postgres extension).
 *
 * Body: { ownerId, plateId, type, rowId, conversationId? }
 *   type: 'qr_scan' | 'bell_ring' | 'voice' | 'text' | 'sos'
 *   rowId: the visitor_logs/messages row's own uuid — reused as the OS
 *          notification tag (`smartdoor-{type}-{rowId}`) so this never
 *          double-shows alongside the foreground realtime path in
 *          services/notificationDispatcher.js (same tag scheme, see sw.js).
 *
 * SECURITY: title/body are NEVER taken from the client — only `type` is,
 * mapped through a fixed allow-list below. This stops an anon visitor from
 * using this endpoint to push arbitrary text to an owner's phone. plateId
 * is verified to actually belong to ownerId before sending.
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
  bell_ring: { title: '🔔 Someone is at your door', body: 'A visitor rang the digital bell.', requireInteraction: true },
  qr_scan:   { title: '📲 Someone scanned your QR', body: 'A visitor opened your Smart Door page.', requireInteraction: false },
  voice:     { title: '🎤 New voice message', body: 'A visitor left a voice message.', requireInteraction: true },
  text:      { title: '💬 New message from a visitor', body: 'A visitor sent you a text message.', requireInteraction: false },
  sos:       { title: '🚨 EMERGENCY — SOS Triggered', body: 'A visitor pressed the SOS button. Respond immediately.', requireInteraction: true },
};

// Best-effort throttle for qr_scan only — bell/voice/text/sos are already
// rate-limited client-side before this is ever called (see
// services/rateLimiter.js#gate, invoked from communication.js/voiceNotes.js/
// messaging.js). qr_scan has no such gate today, so guard it here.
// In-memory only — resets on cold start, which is fine for a soft throttle.
const _recentScans = new Map<string, number>();

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

    const { ownerId, plateId, type, rowId, conversationId = null } = await req.json();
    const cfg = EVENT_CONFIG[type];
    if (!ownerId || !plateId || !rowId || !cfg) {
      return new Response(JSON.stringify({ success: false, error: 'Missing or invalid fields.' }), { status: 400, headers: corsHeaders });
    }

    const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

    // Verify plateId really belongs to ownerId — stops an anon caller from
    // pushing to an arbitrary owner by guessing/enumerating ids.
    const { data: plate } = await supabase.from('plates').select('id').eq('plate_id', plateId).eq('owner_id', ownerId).maybeSingle();
    if (!plate) {
      return new Response(JSON.stringify({ success: false, error: 'plateId does not belong to ownerId.' }), { status: 403, headers: corsHeaders });
    }

    if (type === 'qr_scan') {
      const key = `${ownerId}:${plateId}`;
      const last = _recentScans.get(key) || 0;
      if (Date.now() - last < 15000) {
        return new Response(JSON.stringify({ success: true, skipped: 'throttled' }), { status: 200, headers: corsHeaders });
      }
      _recentScans.set(key, Date.now());
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

    // Data-only message (no top-level `notification` key) — sw.js's
    // firebase.onBackgroundMessage() builds the notification manually with
    // the same tag scheme the foreground realtime path uses, so a device
    // that's both subscribed AND has an open tab never shows this twice.
    const dataPayload: Record<string, string> = {
      id: String(rowId),
      type: String(type),
      title: cfg.title,
      body: cfg.body,
      url: '/app.html',
      requireInteraction: String(cfg.requireInteraction),
      conversationId: conversationId ? String(conversationId) : '',
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
            webpush: { headers: { Urgency: 'high' } },
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
