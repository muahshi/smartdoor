/**
 * Smart Door — send-push Edge Function (Unified Notification Service, server leg)
 * supabase/functions/send-push/index.ts
 *
 * THE ONLY PLACE that ever talks to a push provider. Nothing else in the
 * codebase should call FCM or a Web Push endpoint directly — this keeps the
 * "one Notification Service abstraction" guarantee from splitting into
 * multiple ad-hoc senders over time.
 *
 * CALLED BY TWO PATHS:
 *   1. Postgres triggers (sql/33_push_notifications.sql) — fired the instant
 *      a row lands in `notifications`, `visitor_logs` (qr_scan) or
 *      `messages` (visitor/ai). Authenticated via X-Push-Secret header
 *      (shared secret, NOT the service role key — see system_config).
 *   2. Authenticated owner session (future "send test notification" button
 *      in Owner Settings) — Authorization: Bearer <owner JWT>.
 *
 * DELIVERY PRIORITY (per device, independent per row):
 *   1. FCM        — used automatically once FCM_SERVICE_ACCOUNT_JSON secret
 *                    is set. Until then, FCM devices are skipped gracefully
 *                    ('not_configured') — never an error.
 *   2. Web Push    — VAPID, active as soon as VAPID_PUBLIC_KEY /
 *                    VAPID_PRIVATE_KEY secrets are set. This is the
 *                    zero-Firebase-project delivery path and works today.
 *   3. (Local Notification + catch-up sync are the client-side fallback
 *      tiers 3–4 — see services/notificationDispatcher.js. Nothing to do
 *      here; they run automatically whenever the tab/PWA is alive.)
 *
 * Required Supabase Secrets:
 *   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY   (present by default)
 *   PUSH_WEBHOOK_SECRET       — shared secret, must match system_config.push_webhook_secret
 *   VAPID_PUBLIC_KEY          — Web Push (generate: npx web-push generate-vapid-keys)
 *   VAPID_PRIVATE_KEY
 *   VAPID_SUBJECT             — e.g. mailto:support@mysmartdoor.in
 *   FCM_SERVICE_ACCOUNT_JSON  — optional. Full Firebase service-account JSON as one string.
 *                                Leave unset until a Firebase project exists — FCM
 *                                devices are simply skipped until then.
 *
 * Deploy: supabase functions deploy send-push --no-verify-jwt
 * (no-verify-jwt because the Postgres-trigger caller has no user JWT — auth
 *  is via X-Push-Secret instead, checked explicitly below)
 */

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import webpush from 'npm:web-push@3.6.7';
import { corsHeaders } from '../_shared/cors.ts';

// ────────── EVENT → NOTIFICATION COPY (single source of truth) ──────────
// Mirrors js/../services/notificationDispatcher.js's EVENT_CONFIG so owner
// gets the same title/body/urgency whether the tab is open (client path)
// or closed (this server path). Keep both in sync if either changes.
type PushContent = { title: string; body: string; priority: 'normal' | 'high' | 'critical'; requireInteraction: boolean };

function contentForNotificationsRow(row: Record<string, unknown>): PushContent | null {
  // notifications table rows already carry a human title/body — reuse them
  // verbatim so status_change / bell / sos / call copy never drifts from
  // what services/notifications.js wrote to the in-app feed.
  const title = (row.title as string) || 'SmartDoor Alert';
  const body = (row.body as string) || '';
  const priority = (row.priority as string) === 'critical' ? 'critical' : (row.priority as string) === 'high' ? 'high' : 'normal';
  return { title, body, priority, requireInteraction: priority !== 'normal' };
}

function contentForVisitorLogsRow(row: Record<string, unknown>): PushContent | null {
  if (row.event_type !== 'qr_scan') return null;
  return { title: '📲 Someone scanned your QR', body: 'A visitor opened your Smart Door page.', priority: 'normal', requireInteraction: false };
}

function contentForMessagesRow(row: Record<string, unknown>): PushContent | null {
  const senderType = row.sender_type as string;
  if (senderType !== 'visitor' && senderType !== 'ai') return null;

  const meta = (row.metadata as Record<string, unknown>) || {};
  const intent = String(meta.intent || '').toLowerCase();
  const isEmergency = intent === 'emergency' || intent === 'sos';
  const messageType = row.message_type as string;

  if (isEmergency) {
    return { title: '🚨 EMERGENCY — AI Escalation', body: 'The AI receptionist escalated this visitor as an emergency.', priority: 'critical', requireInteraction: true };
  }
  if (messageType === 'voice') {
    return { title: '🎤 New voice message', body: row.voice_duration_secs ? `${row.voice_duration_secs}s message waiting` : 'A visitor left a voice message.', priority: 'high', requireInteraction: true };
  }
  return { title: '💬 New message from a visitor', body: row.text ? String(row.text).slice(0, 120) : 'A visitor sent you a message.', priority: 'normal', requireInteraction: false };
}

function buildContent(table: string, row: Record<string, unknown>): PushContent | null {
  if (table === 'notifications') return contentForNotificationsRow(row);
  if (table === 'visitor_logs') return contentForVisitorLogsRow(row);
  if (table === 'messages') return contentForMessagesRow(row);
  return null;
}

function ownerIdFromRow(row: Record<string, unknown>): string | null {
  return (row.owner_id as string) || null;
}

// ────────── FCM (HTTP v1, only active once a service account is configured) ──────────
let _fcmAccessTokenCache: { token: string; expiresAt: number } | null = null;

async function getFcmAccessToken(serviceAccountJson: string): Promise<string> {
  if (_fcmAccessTokenCache && _fcmAccessTokenCache.expiresAt > Date.now() + 60_000) {
    return _fcmAccessTokenCache.token;
  }
  const sa = JSON.parse(serviceAccountJson);
  const { default: googleAuth } = await import('npm:google-auth-library@9');
  const auth = new googleAuth.GoogleAuth({
    credentials: sa,
    scopes: ['https://www.googleapis.com/auth/firebase.messaging'],
  });
  const client = await auth.getClient();
  const tokenResp = await client.getAccessToken();
  const token = typeof tokenResp === 'string' ? tokenResp : tokenResp.token;
  _fcmAccessTokenCache = { token: token as string, expiresAt: Date.now() + 55 * 60 * 1000 };
  return token as string;
}

async function sendFcm(projectId: string, accessToken: string, fcmToken: string, content: PushContent, data: Record<string, string>) {
  const resp = await fetch(`https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message: {
        token: fcmToken,
        notification: { title: content.title, body: content.body },
        data,
        webpush: {
          headers: { Urgency: content.priority === 'critical' ? 'high' : content.priority === 'high' ? 'high' : 'normal' },
          notification: { requireInteraction: content.requireInteraction, icon: '/images/favicon-192x192.png' },
        },
      },
    }),
  });
  if (resp.ok) return { ok: true };
  const errBody = await resp.text();
  const invalid = resp.status === 404 || /UNREGISTERED|NOT_FOUND|INVALID_ARGUMENT/.test(errBody);
  return { ok: false, invalid, error: errBody };
}

// ────────── Web Push (VAPID) ──────────
async function sendWebPush(publicKey: string, privateKey: string, subject: string, device: Record<string, unknown>, content: PushContent, data: Record<string, string>) {
  webpush.setVapidDetails(subject, publicKey, privateKey);
  const subscription = {
    endpoint: device.endpoint as string,
    keys: { p256dh: device.p256dh as string, auth: device.auth_key as string },
  };
  const payload = JSON.stringify({ title: content.title, body: content.body, ...data, requireInteraction: content.requireInteraction });
  try {
    await webpush.sendNotification(subscription, payload, {
      urgency: content.priority === 'critical' ? 'high' : content.priority === 'high' ? 'high' : 'normal',
    });
    return { ok: true };
  } catch (err) {
    const status = err?.statusCode;
    const invalid = status === 404 || status === 410;
    return { ok: false, invalid, error: String(err?.body || err?.message || err) };
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const pushSecret = Deno.env.get('PUSH_WEBHOOK_SECRET') || '';
  const authHeader = req.headers.get('Authorization') || '';
  const secretHeader = req.headers.get('X-Push-Secret') || '';

  const isTrigger = !!pushSecret && secretHeader === pushSecret;
  const isOwnerSession = authHeader.startsWith('Bearer ') && !isTrigger;

  if (!isTrigger && !isOwnerSession) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }

  const supabase = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '');

  try {
    const body = await req.json();

    // Path 1: DB-trigger payload → { table, record }
    // Path 2: manual/test payload → { ownerId, title, body, priority }
    let ownerId: string | null;
    let content: PushContent | null;
    let data: Record<string, string> = {};

    if (body.table && body.record) {
      ownerId = ownerIdFromRow(body.record);
      content = buildContent(body.table, body.record);
      data = { type: String(body.table), rowId: String(body.record.id || ''), conversationId: String(body.record.conversation_id || ''), url: '/app.html' };
    } else {
      ownerId = body.ownerId || null;
      content = body.title ? { title: body.title, body: body.body || '', priority: body.priority || 'normal', requireInteraction: false } : null;
      data = { type: 'manual', url: '/app.html' };
    }

    if (!ownerId || !content) {
      // Not a push-eligible event (e.g. status_change notification we don't
      // want to duplicate-buzz for, or an unrecognized table) — not an error.
      return new Response(JSON.stringify({ success: true, skipped: true }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const { data: devices, error: devErr } = await supabase
      .from('owner_devices')
      .select('*')
      .eq('owner_id', ownerId)
      .eq('is_active', true);

    if (devErr) throw devErr;
    if (!devices || devices.length === 0) {
      return new Response(JSON.stringify({ success: true, delivered: 0, reason: 'no_registered_devices' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const fcmServiceAccount = Deno.env.get('FCM_SERVICE_ACCOUNT_JSON') || '';
    const vapidPublic = Deno.env.get('VAPID_PUBLIC_KEY') || '';
    const vapidPrivate = Deno.env.get('VAPID_PRIVATE_KEY') || '';
    const vapidSubject = Deno.env.get('VAPID_SUBJECT') || 'mailto:support@mysmartdoor.in';

    let fcmAccessToken: string | null = null;
    let fcmProjectId: string | null = null;
    if (fcmServiceAccount) {
      try {
        fcmProjectId = JSON.parse(fcmServiceAccount).project_id;
        fcmAccessToken = await getFcmAccessToken(fcmServiceAccount);
      } catch (e) {
        console.error('[send-push] FCM service account invalid, skipping FCM devices:', e);
      }
    }

    const results = await Promise.allSettled(
      devices.map(async (device) => {
        // Priority: FCM first if this device is FCM-registered AND FCM is
        // configured; otherwise Web Push (VAPID). A device only ever has
        // one provider's credentials (see owner_devices_has_target_chk), so
        // this is really "use whichever channel this device supports".
        if (device.push_provider === 'fcm') {
          if (!fcmAccessToken || !fcmProjectId) return { deviceId: device.id, status: 'not_configured', provider: 'fcm' };
          const r = await sendFcm(fcmProjectId, fcmAccessToken, device.fcm_token, content!, data);
          if (!r.ok && r.invalid) await supabase.from('owner_devices').update({ is_active: false }).eq('id', device.id);
          return { deviceId: device.id, status: r.ok ? 'sent' : 'failed', provider: 'fcm', error: r.ok ? undefined : r.error };
        }

        if (device.push_provider === 'webpush') {
          if (!vapidPublic || !vapidPrivate) return { deviceId: device.id, status: 'not_configured', provider: 'webpush' };
          const r = await sendWebPush(vapidPublic, vapidPrivate, vapidSubject, device, content!, data);
          if (!r.ok && r.invalid) await supabase.from('owner_devices').update({ is_active: false }).eq('id', device.id);
          return { deviceId: device.id, status: r.ok ? 'sent' : 'failed', provider: 'webpush', error: r.ok ? undefined : r.error };
        }

        return { deviceId: device.id, status: 'unknown_provider' };
      })
    );

    // Best-effort last_active_at bump for devices we successfully reached.
    const sentDeviceIds = results
      .filter((r) => r.status === 'fulfilled' && (r.value as any).status === 'sent')
      .map((r) => (r as any).value.deviceId);
    if (sentDeviceIds.length > 0) {
      supabase.from('owner_devices').update({ last_active_at: new Date().toISOString() }).in('id', sentDeviceIds).then(() => {}).catch(() => {});
    }

    return new Response(
      JSON.stringify({ success: true, delivered: sentDeviceIds.length, totalDevices: devices.length, results: results.map((r) => (r.status === 'fulfilled' ? r.value : { status: 'error', error: String(r.reason) })) }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (err) {
    console.error('[send-push] error:', err);
    return new Response(JSON.stringify({ success: false, error: String(err?.message || err) }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
