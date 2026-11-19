/*
 * Task Manager notifications worker. It does exactly one thing: show Web Push notifications (also when the app is closed)
 * and open the right page when one is clicked. No install prompt, no manifest, no caching, no fetch handling.
 */

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

const sameOrigin = (w) => {
  try {
    return new URL(w.url).origin === self.location.origin;
  } catch (e) {
    return false;
  }
};

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
    // The same notification never shows twice; a new one with the same tag replaces the old one (and sounds again).
    tag: data.id ? 'tm-' + data.id : undefined,
    renotify: Boolean(data.id),
    silent: false, // the system plays its notification sound
    vibrate: [120, 60, 120],
    requireInteraction: data.priority === 'important',
    data: { url: data.url || '/' }
  };

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windows) => {
      // Someone is looking at the app right now: its own toast and sound already told them. (A test always shows.)
      const looking = windows.some((w) => sameOrigin(w) && w.visibilityState === 'visible' && w.focused);
      if (looking && !data.force) return undefined;
      return self.registration.showNotification(title, options);
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = new URL((event.notification.data && event.notification.data.url) || '/', self.location.origin);
  // Only ever open our own pages, whatever the payload says.
  const path = target.origin === self.location.origin ? target.pathname + target.search + target.hash : '/';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(async (windows) => {
      const open = windows.find(sameOrigin);
      if (open) {
        await open.focus();
        open.postMessage({ type: 'tm:navigate', url: path }); // the app routes there without reloading
        return;
      }
      await self.clients.openWindow(path);
    })
  );
});

// The browser replaced an expired subscription. A worker cannot sign in on its own, so it asks any open page to save the new one;
// otherwise the page does it the next time the app is opened.
self.addEventListener('pushsubscriptionchange', (event) => {
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windows) => {
      windows.filter(sameOrigin).forEach((w) => w.postMessage({ type: 'tm:resubscribe' }));
    })
  );
});
