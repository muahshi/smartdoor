// Smart Door Service Worker v1.0
const CACHE_NAME = 'smartdoor-v1';
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/app.html',
  '/css/styles.css',
  '/js/app.js',
  '/js/groq.js',
  '/js/dashboard.js',
  '/manifest.json'
];

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
  if (event.request.url.includes('api.anthropic.com') || 
      event.request.url.includes('api.groq.com')) {
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
          // Return offline page for navigation requests
          if (event.request.mode === 'navigate') {
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
