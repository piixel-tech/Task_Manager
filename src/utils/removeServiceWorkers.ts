type BadgeNavigator = Navigator & { clearAppBadge?: () => Promise<void> };

/** The one worker the app keeps: it only shows push notifications (no install, no offline cache). */
export const NOTIFICATION_WORKER = '/sw.js';

const isNotificationWorker = (r: ServiceWorkerRegistration): boolean => {
  const url = (r.active ?? r.waiting ?? r.installing)?.scriptURL;
  if (!url) return false;
  try {
    return new URL(url).pathname === NOTIFICATION_WORKER;
  } catch {
    return false;
  }
};

/**
 * The app used to be installable, with an offline-caching service worker and a dot on the app icon while a timer ran. That is
 * gone. On every start this removes any OTHER service worker of this site, deletes the caches they made and clears the icon
 * badge. The notifications-only worker at /sw.js is left alone (unregistering it would also delete the push subscription).
 * Never throws, and does nothing where there is nothing to remove or the browser lacks the feature.
 */
export async function removeLegacyServiceWorkers(): Promise<void> {
  try {
    if ('serviceWorker' in navigator) {
      const registrations = await navigator.serviceWorker.getRegistrations();
      await Promise.all(registrations.filter((r) => !isNotificationWorker(r)).map((r) => r.unregister()));
    }
    if (typeof caches !== 'undefined') {
      await Promise.all((await caches.keys()).map((key) => caches.delete(key)));
    }
    await (navigator as BadgeNavigator).clearAppBadge?.();
  } catch {
    /* nothing to remove, or not allowed: the app works the same */
  }
}
