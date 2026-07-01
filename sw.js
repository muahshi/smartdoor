// Smart Door Service Worker v2.0 — PWA Polish
// v2.0: Premium PWA notifications — high priority, rich actions, badge count,
//       louder doorbell sound trigger, strong vibration.
const CACHE_NAME = 'smartdoor-v5';
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

  const options = {
    body:      data.body || 'Someone is at your door!',
    icon:      '/images/favicon-192x192.png',
    badge:     '/images/favicon-192x192.png',
    vibrate,
    tag:       isDoorbell ? 'smartdoor-doorbell' : `smartdoor-${type}`,
    renotify:  true,             // ring again even if same tag
    requireInteraction: isDoorbell, // keeps notification on screen until acted on
    silent:    false,
    data:      { url: data.url || '/app.html', type, timestamp: Date.now() },
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
      await self.registration.showNotification(title, options);
    })()
  );
});

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
