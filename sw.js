// Smart Door Service Worker v2.0 — PWA Polish
// v2.0: Premium PWA notifications — high priority, rich actions, badge count,
//       louder doorbell sound trigger, strong vibration.
const CACHE_NAME = 'smartdoor-v6'; // bumped: notification pipeline fix (unique tags, push broadcast)
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

// ── Badge counter (persisted across SW restarts) ──
let badgeCount = 0;

async function incrementBadge() {
  badgeCount++;
  if ('setAppBadge' in self.navigator) {
    try { await self.navigator.setAppBadge(badgeCount); } catch (_) {}
  }
}

async function clearBadge() {
  badgeCount = 0;
  if ('clearAppBadge' in self.navigator) {
    try { await self.navigator.clearAppBadge(); } catch (_) {}
  }
}

// ── Push — premium doorbell notification ──
self.addEventListener('push', (event) => {
  const data  = event.data ? event.data.json() : {};
  const type  = data.type || 'bell_ring';
  const isDoorbell = ['bell_ring', 'visitor_scan', 'sos'].includes(type);
  const isSOS = type === 'sos';

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
  // followed by a QR scan) shared one tag. renotify:true is supposed to
  // still re-alert on a repeat with the same tag, but relying on that
  // per-OS/per-browser behavior is fragile — the safe, spec-guaranteed way
  // to "never reuse previous notification" is to make the tag unique per
  // event. Prefer an id the caller supplied (data.id — e.g. the DB row
  // uuid); fall back to a timestamp+random suffix so it's still unique even
  // if no id was sent.
  const eventId = data.id || `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  const options = {
    body:      data.body || 'Someone is at your door!',
    icon:      '/images/favicon-192x192.png',
    badge:     '/images/favicon-192x192.png',
    vibrate,
    tag:       `smartdoor-${type}-${eventId}`, // unique per event — never collides, never gets silently merged
    renotify:  true,             // belt-and-braces, kept even though tag is already unique
    requireInteraction: isDoorbell, // keeps notification on screen until acted on
    silent:    false,
    data:      { id: eventId, url: data.url || '/app.html', type, conversationId: data.conversationId || null, timestamp: Date.now() },
    actions: isSOS
      ? [
          { action: 'open',    title: '🚨 Open App' },
          { action: 'dismiss', title: '✕ Dismiss'  },
        ]
      : [
          { action: 'open',    title: '📲 Open Dashboard' },
          { action: 'call',    title: '📞 Call Visitor'   },
          { action: 'dismiss', title: '✕ Dismiss'         },
        ],
  };

  event.waitUntil(
    (async () => {
      await incrementBadge();
      try {
        await self.registration.showNotification(title, options);
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

  if (event.action === 'call')    targetUrl = '/app.html?action=call';
  if (event.action === 'dismiss') { clearBadge(); return; }

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
  if (event.data?.type === 'CLEAR_BADGE') clearBadge();
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
});

console.log('[SW] Smart Door v2.0 loaded');
