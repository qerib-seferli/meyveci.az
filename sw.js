// ============================================================
// MEYVƏÇİ.AZ - ADVANCED PWA SERVICE WORKER
// Offline cache, push notification, notification click və badge.
// Fayl root-da qalmalıdır: /sw.js
// ============================================================

const CACHE_NAME = 'meyveci-pwa-v1';

const APP_SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
  './assets/css/style.css',
  './assets/js/supabase.js',
  './assets/js/core.js',
  './assets/js/layout.js',
  './assets/js/shop.js',
  './assets/js/pwa-install.js',
  './assets/js/push-notifications.js',
  './assets/img/logo/Cilek-logo.png',
  './assets/img/logo/Meyveci-logo.png',
  './assets/sounds/notify.mp3'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) =>
        Promise.all(keys.map((key) => key !== CACHE_NAME ? caches.delete(key) : null))
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;

  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  // Supabase API sorğularını cache-ləmirik ki, realtime/data qarışmasın.
  if (url.hostname.includes('supabase.co')) return;

  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;

      return fetch(request)
        .then((response) => {
          const copy = response.clone();

          if (response.ok && url.origin === location.origin) {
            caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
          }

          return response;
        })
        .catch(() => caches.match('./index.html'));
    })
  );
});

self.addEventListener('push', (event) => {
  let data = {};

  try {
    data = event.data ? event.data.json() : {};
  } catch (_) {
    data = {
      title: 'Meyvəçi',
      body: event.data ? event.data.text() : 'Yeni bildiriş gəldi.'
    };
  }

  const title = data.title || 'Meyvəçi';
  const unreadCount = Number(data.badge_count || data.unread_count || 1);

  const options = {
    body: data.body || 'Yeni bildiriş gəldi.',
    icon: './assets/img/logo/Cilek-logo.png',
    badge: './assets/img/logo/Cilek-logo.png',
    image: data.image || undefined,
    vibrate: [120, 70, 120],
    tag: data.tag || 'meyveci-notification',
    renotify: true,
    data: {
      url: data.url || data.link_url || './messages.html',
      badge_count: unreadCount
    }
  };

  event.waitUntil((async () => {
    if ('setAppBadge' in navigator && unreadCount > 0) {
      try {
        await navigator.setAppBadge(unreadCount);
      } catch (_) {}
    }

    await self.registration.showNotification(title, options);
  })());
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const urlToOpen = event.notification?.data?.url || './index.html';

  event.waitUntil((async () => {
    const allClients = await clients.matchAll({
      type: 'window',
      includeUncontrolled: true
    });

    for (const client of allClients) {
      if ('focus' in client) {
        client.focus();
        client.navigate(urlToOpen);
        return;
      }
    }

    if (clients.openWindow) {
      await clients.openWindow(urlToOpen);
    }
  })());
});
