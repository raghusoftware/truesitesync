/* True Site Sync — push-only service worker.
 * Deliberately has NO fetch handler, so it never caches or intercepts network
 * requests (won't interfere with the app). It only shows push notifications and
 * focuses the app when one is clicked. */

self.addEventListener('push', (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch { data = { title: 'True Site Sync', body: (event.data && event.data.text()) || '' }; }
  const title = data.title || 'True Site Sync';
  const options = {
    body: data.body || '',
    icon: '/assets/icon.png',
    badge: '/assets/favicon-32.png',
    data: data.data || {},
    tag: data.tag || undefined,
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || '/app.html';
  event.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const client of all) {
      if (client.url.includes('/app.html') && 'focus' in client) return client.focus();
    }
    if (self.clients.openWindow) return self.clients.openWindow(url);
  })());
});

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));
