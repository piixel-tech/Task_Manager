/* Task Manager service worker: shows Web Push notifications while the app is closed, and opens the right page on click. */

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (e) {
    data = { title: 'Task Manager', body: event.data ? event.data.text() : '' };
  }
  const title = data.title || 'Task Manager';
  const options = {
    body: data.body || '',
    icon: '/favicon.svg',
    badge: '/favicon.svg',
    // The same notification never shows twice; a new one with the same tag replaces the old.
    tag: data.id ? 'tm-' + data.id : undefined,
    requireInteraction: data.priority === 'important',
    data: { url: data.url || '/' }
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = new URL((event.notification.data && event.notification.data.url) || '/', self.location.origin);
  // Only ever open our own pages, whatever the payload says.
  const path = target.origin === self.location.origin ? target.pathname + target.search + target.hash : '/';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(async (windows) => {
      const open = windows.find((w) => new URL(w.url).origin === self.location.origin);
      if (open) {
        await open.focus();
        open.postMessage({ type: 'tm:navigate', url: path }); // the app routes there without reloading
        return;
      }
      await self.clients.openWindow(path);
    })
  );
});
