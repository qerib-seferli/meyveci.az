// ============================================================
// MEYVƏÇİ.AZ - ADVANCED PWA SERVICE WORKER
// Offline cache, push notification, notification click və badge.
// Fayl root-da qalmalıdır: /sw.js
// ============================================================

const CACHE_NAME = 'meyveci-pwa-v6';

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('push', (event) => {
  let data = {};

  try {
    data = event.data ? event.data.json() : {};
  } catch (_) {
    data = {};
  }

  const title = data.title || 'Meyvəçi';
  const body = data.body || 'Yeni bildiriş gəldi.';

  const options = {
    body,
    icon: './assets/img/logo/Cilek-logo.png',
    badge: './assets/img/logo/Cilek-logo.png',
    vibrate: [180, 90, 180],
    tag: data.tag || `meyveci-${Date.now()}`,
    renotify: true,
    requireInteraction: false,
    data: {
      url: data.url || './messages.html',
      badge_count: Number(data.badge_count || 1)
    }
  };

  event.waitUntil(
    self.registration.showNotification(title, options)
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const targetUrl = event.notification?.data?.url || './index.html';

  event.waitUntil((async () => {
    const windowClients = await clients.matchAll({
      type: 'window',
      includeUncontrolled: true
    });

    for (const client of windowClients) {
      if ('focus' in client) {
        await client.focus();
        client.navigate(targetUrl);
        return;
      }
    }

    await clients.openWindow(targetUrl);
  })());
});
