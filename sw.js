// Smart Door Service Worker v1.1
// v1.1: fixed a bug where a failed navigation to ANY route (including a
// visitor's /p/:slug QR link) fell back to the cached owner dashboard
// (app.html). A visitor must never see app.html, even offline.
const CACHE_NAME = 'smartdoor-v2';
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

// Install event - cache static assets
self.addEventListener('install', (event) => {
  console.log('[SW] Installing Smart Door Service Worker...');
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[SW] Caching static assets');
      return cache.addAll(STATIC_ASSETS.filter(url => !url.includes('undefined')));
    }).catch(err => {
      console.log('[SW] Cache install failed (dev mode):', err);
    })
  );
  self.skipWaiting();
});

// Activate event - clean old caches
self.addEventListener('activate', (event) => {
  console.log('[SW] Activating Smart Door Service Worker...');
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter(name => name !== CACHE_NAME)
          .map(name => {
            console.log('[SW] Deleting old cache:', name);
            return caches.delete(name);
          })
      );
    })
  );
  self.clients.claim();
});

// Fetch event - network-first with cache fallback
self.addEventListener('fetch', (event) => {
  // Skip non-GET requests
  if (event.request.method !== 'GET') return;
  
  // Skip API calls - always go to network
  let requestHost = '';
  try {
    requestHost = new URL(event.request.url).hostname;
  } catch (e) {
    requestHost = '';
  }
  if (requestHost === 'api.anthropic.com' || requestHost === 'api.groq.com') {
    return;
  }

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        // Cache successful responses
        if (response.status === 200) {
          const responseClone = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseClone);
          });
        }
        return response;
      })
      .catch(() => {
        // Fallback to cache when offline
        return caches.match(event.request).then((cachedResponse) => {
          if (cachedResponse) {
            return cachedResponse;
          }
          // Navigation fell through with nothing cached for this exact URL.
          // Visitor routes (QR scans) must NEVER fall back to the owner
          // dashboard — fall back to visitor.html instead, or a plain
          // offline response for the owner app itself.
          if (event.request.mode === 'navigate') {
            const url = new URL(event.request.url);
            if (isVisitorRoute(url)) {
              return caches.match('/visitor.html');
            }
            return caches.match('/app.html');
          }
          return new Response('Offline - Smart Door', {
            status: 503,
            statusText: 'Service Unavailable'
          });
        });
      })
  );
});

// Push notification handler
self.addEventListener('push', (event) => {
  const data = event.data ? event.data.json() : {};
  const options = {
    body: data.body || 'Someone is at your door!',
    icon: '/icons/icon-192.png',
    badge: '/icons/badge.png',
    vibrate: [200, 100, 200],
    data: { url: data.url || '/app.html' },
    actions: [
      { action: 'call', title: '📞 Answer' },
      { action: 'dismiss', title: '❌ Dismiss' }
    ]
  };

  event.waitUntil(
    self.registration.showNotification(data.title || '🔔 Smart Door Alert', options)
  );
});

// Notification click handler
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  if (event.action === 'call') {
    event.waitUntil(clients.openWindow('/app.html?action=call'));
  } else {
    event.waitUntil(clients.openWindow('/app.html'));
  }
});

console.log('[SW] Smart Door Service Worker loaded');
