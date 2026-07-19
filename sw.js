// Smart Door Service Worker v2.0 — PWA Polish
// v2.0: Premium PWA notifications — high priority, rich actions, badge count,
//       louder doorbell sound trigger, strong vibration.
const CACHE_NAME = 'smartdoor-v9'; // bumped: Phase 6 — production hardening (badge count reliability, fetch timeouts, diagnostic log gating)
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/app.html',
  '/visitor.html',
  '/css/styles.css',
  '/js/app.js',
  '/js/groq.js',
  '/js/dashboard.js',
  '/manifest.json'
];

// ── Firebase Cloud Messaging (Phase 4c — true background push) ──
// No Firebase SDK is loaded in this file on purpose. firebase.messaging()
// on the CLIENT (services/push.js) needs a registration with a 'push'
// listener to mint a token via getToken({serviceWorkerRegistration}) — it
// does NOT require the Firebase SW library itself. The existing 'push'
// handler below already reads the exact flat {id, type, title, body, url,
// conversationId, requireInteraction} shape supabase/functions/send-push
// sends as a data-only FCM message, so loading firebase-messaging-compat's
// own onBackgroundMessage() here would just attach a SECOND 'push' listener
// racing the one below — real risk of a doorbell/SOS alert showing twice.
// One code path, reused, per "don't create duplicate services".

// Routes that must NEVER fall back to the owner dashboard.
function isVisitorRoute(url) {
  const path = url.pathname;
  return path.startsWith('/p/') || path.startsWith('/pass/') || path === '/visitor.html';
}

// ── Install ──
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS.filter(u => !u.includes('undefined')));
    }).catch(() => {})
  );
  self.skipWaiting();
});

// ── Activate ──
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((names) =>
      Promise.all(names.filter(n => n !== CACHE_NAME).map(n => caches.delete(n)))
    )
  );
  self.clients.claim();
});

// ── Fetch — network-first, cache fallback ──
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  let host = '';
  try { host = new URL(event.request.url).hostname; } catch (_) {}
  if (host === 'api.anthropic.com' || host === 'api.groq.com') return;
  // SECURITY (Phase 9): never cache Supabase REST/Edge Function responses —
  // these can carry per-session, per-owner, or admin data. Only static
  // site assets should ever land in Cache Storage.
  const path = (() => { try { return new URL(event.request.url).pathname; } catch (_) { return ''; } })();
  if (host.endsWith('.supabase.co') || path.startsWith('/functions/') || path.startsWith('/rest/') || path.startsWith('/auth/')) {
    return;
  }

  event.respondWith(
    fetch(event.request).then((response) => {
      const isNav = event.request.mode === 'navigate';
      const isHtml = (event.request.headers.get('accept') || '').includes('text/html');
      if (response.status === 200 && !isNav && !isHtml) {
        const clone = response.clone();
        caches.open(CACHE_NAME).then(c => c.put(event.request, clone));
      }
      return response;
    }).catch(() =>
      caches.match(event.request).then((cached) => {
        if (cached) return cached;
        if (event.request.mode === 'navigate') {
          const url = new URL(event.request.url);
          return caches.match(isVisitorRoute(url) ? '/visitor.html' : '/app.html');
        }
        return new Response('Offline', { status: 503 });
      })
    )
  );
});

// ── Badge counter ──
// PRODUCTION FIX (Service Worker reliability): this was `let badgeCount = 0`
// incremented in memory. A service worker is routinely terminated by the
// browser/OS after ~30s of idle (especially on mobile, exactly this app's
// primary platform) and restarted fresh on the next event — so this
// counter silently reset to 0 on almost every push, making the OS app
// badge wrong (usually stuck at 1, or under-counting) for real users far
// more often than it was ever correct.
//
// Fix: derive the badge count from something that actually survives a SW
// restart — the browser's own persisted notification tray — instead of an
// in-memory variable. self.registration.getNotifications() reflects every
// currently-shown notification for this origin regardless of whether this
// SW instance is the one that created it, so the count is correct even
// right after a cold SW restart.
async function _recalculateBadge() {
  try {
    const active = await self.registration.getNotifications();
    const count = active.length;
    if ('setAppBadge' in self.navigator) {
      if (count > 0) await self.navigator.setAppBadge(count);
      else await self.navigator.clearAppBadge();
    }
    return count;
  } catch (_) {
    return 0;
  }
}

async function incrementBadge() {
  // Notification is already shown by the time this is called (see the
  // push handler below), so the tray already reflects the new count.
  await _recalculateBadge();
}

async function clearBadge() {
  if ('clearAppBadge' in self.navigator) {
    try { await self.navigator.clearAppBadge(); } catch (_) {}
  }
}

// ── Push — premium doorbell notification ──
//
// NOTE on Android "notification channels": a plain browser-installed PWA
// (no TWA/native wrapper) cannot create or configure OS-level Android
// notification channels itself — Chrome owns a single "Site notifications"
// channel per origin and the OS's Settings > App > Notifications page is
// where the PERSON sets that channel's importance/sound, not the site. The
// closest a web app can get to "high importance + custom sound + strong
// vibration" is exactly what's implemented here: Urgency:high on the FCM
// message (supabase/functions/send-push), requireInteraction to keep it
// on-screen, a strong custom vibration PATTERN (below), and a synthesized
// doorbell chime played by the page itself (js/dashboard.js
// playBellSound/playSosSound) for the foreground case — actual custom
// *sound* on a background/OS-delivered notification is not exposed by the
// Web Notifications spec on any browser as of this writing.
self.addEventListener('push', (event) => {
  const data  = event.data ? event.data.json() : {};
  const type  = data.type || 'bell_ring';
  const isDoorbell = ['bell_ring', 'visitor_scan', 'sos'].includes(type);
  const isSOS = type === 'sos';
  const isConversational = ['voice', 'text', 'ai_escalation'].includes(type);

  // Strong vibration for doorbell, critical pattern for SOS
  const vibrate = isSOS
    ? [400, 100, 400, 100, 400]
    : isDoorbell
      ? [300, 100, 300]
      : [200];

  const title = data.title || (isSOS ? '🚨 SOS EMERGENCY!' : '🔔 Smart Door Alert');

  // FIX (notification pipeline audit): this used to tag every doorbell-type
  // push ('bell_ring', 'visitor_scan', 'sos') with the SAME fixed string
  // ('smartdoor-doorbell'), so two different real events (e.g. a bell ring
  // followed by a QR scan) shared one tag. That fix made every tag unique
  // per event (per DB row) so nothing was ever silently merged.
  //
  // UPDATE (this pass): unique-per-row is still correct for messages/SOS —
  // each is distinct content worth its own line in the tray — but for
  // repeated DOORBELL PRESSES specifically it meant 5 rapid rings produced
  // 5 stacked notifications. supabase/functions/send-push now computes and
  // sends a stable `data.tag` for the collapsible types (bell_ring,
  // qr_scan), keyed on the plate rather than the individual press, so a
  // second ring REPLACES the first instead of stacking — renotify:true
  // below still re-alerts (sound/vibrate) on every replace. Every other
  // type keeps a per-row unique fallback tag exactly as before.
  const eventId = data.id || `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const tag = data.tag || `smartdoor-${type}-${eventId}`;

  // PHASE 3: use the ACTUAL event time supabase/functions/send-push
  // computed (when it built the FCM message), not the moment this SW
  // finished waking up and processing the push — those can legitimately
  // differ by several seconds under Doze/battery-saver, and the OS tray's
  // relative time ("2m ago") reads off whichever one we hand it here.
  const eventTimestamp = Number(data.timestamp) || Date.now();

  const options = {
    body:      data.body || 'Someone is at your door!',
    icon:      '/images/favicon-192x192.png',
    badge:     '/images/favicon-192x192.png',
    // Visitor photo, if the caller ever sends one (supabase/functions/
    // send-push's optional imageUrl) — no photo-capture feature exists in
    // the doorbell flow today, so this is a harmless no-op until one does.
    image:     data.image || undefined,
    vibrate,
    tag,
    renotify:  true,             // re-alert (sound/vibrate) even when the tag is reused (collapsible types)
    requireInteraction: data.requireInteraction === 'true' || data.requireInteraction === true || isDoorbell,
    silent:    false,
    timestamp: eventTimestamp,
    data:      { id: eventId, url: data.url || '/app.html', type, plateId: data.plateId || null, conversationId: data.conversationId || null, timestamp: eventTimestamp },
    // Actions (Req: Open, Reply, Dismiss where supported — the Notification
    // Actions API itself is only supported by Chromium browsers; Safari/iOS
    // silently ignores `actions` and just falls back to tap-to-open, which
    // is the graceful degradation for that platform).
    actions: isSOS
      ? [
          { action: 'open',    title: '🚨 Open App' },
          { action: 'dismiss', title: '✕ Dismiss'  },
        ]
      : isConversational
        ? [
            { action: 'open',    title: '📲 Open' },
            { action: 'reply',   title: '↩️ Reply' },
            { action: 'dismiss', title: '✕ Dismiss' },
          ]
        : isDoorbell
          ? [
              { action: 'open',    title: '📲 Open Dashboard' },
              { action: 'call',    title: '📞 Call Visitor'   },
              { action: 'dismiss', title: '✕ Dismiss'         },
            ]
          : [
              { action: 'open',    title: '📲 Open' },
              { action: 'dismiss', title: '✕ Dismiss' },
            ],
  };

  event.waitUntil(
    (async () => {
      try {
        await self.registration.showNotification(title, options);
        // Recalculate from the live tray AFTER showing, so a collapsible
        // (renotify) type correctly doesn't inflate the count, and a new
        // distinct notification correctly does.
        await incrementBadge();
        await _broadcast({ type: 'push_delivered', notifData: options.data });
      } catch (err) {
        await _broadcast({ type: 'push_failed', notifData: options.data, error: String(err) });
      }
    })()
  );
});

// Tell any open/foreground clients what happened, so the page-level
// notification dispatch log (services/notificationDispatcher.js) can record
// push-originated deliveries too, not just page-triggered ones.
async function _broadcast(message) {
  const clientList = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
  clientList.forEach((c) => c.postMessage(message));
}

// ── Notification click ──
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const notifData = event.notification.data || {};
  let targetUrl   = notifData.url || '/app.html';

  if (event.action === 'call')  targetUrl = '/app.html?action=call';
  // 'reply' opens straight into the Inbox thread (same deep link the
  // default 'open'/body-tap action uses when a conversationId is present)
  // — the focused window's message listener (js/dashboard.js) is what
  // actually focuses the reply textbox once the thread is open, driven off
  // the `action:'reply'` it receives below.
  if (event.action === 'reply') targetUrl = notifData.conversationId ? '/app.html?tab=inbox' : targetUrl;
  if (event.action === 'dismiss') {
    // PRODUCTION FIX: was clearBadge() (hard reset to 0) fired-and-forgotten
    // outside event.waitUntil — under-counted if other notifications were
    // still pending, and could be killed mid-write since nothing held the
    // event alive for it. Recalculate from the tray (already one shorter,
    // since event.notification.close() above already ran) and keep the
    // event alive until that finishes.
    event.waitUntil(_recalculateBadge());
    return;
  }

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      // Focus existing window if open
      const appWindow = list.find(c => c.url.includes('/app.html') || c.url === '/');
      if (appWindow) {
        appWindow.focus();
        appWindow.postMessage({ type: 'notification_click', action: event.action, notifData });
        return;
      }
      return clients.openWindow(targetUrl);
    })
  );
});

// ── Message from page ──
self.addEventListener('message', (event) => {
  if (event.data?.type === 'CLEAR_BADGE') {
    // Explicit "mark everything read" signal from the dashboard (see
    // js/dashboard.js) — genuinely clear to 0, not a tray recalculation.
    // PRODUCTION FIX: previously fired-and-forgotten (not awaited via
    // waitUntil), so the SW could be terminated before the async
    // clearAppBadge() call completed on a background/backgrounding tab.
    if (event.waitUntil) event.waitUntil(clearBadge());
    else clearBadge();
  }
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
});

console.log('[SW] Smart Door v2.0 loaded');
