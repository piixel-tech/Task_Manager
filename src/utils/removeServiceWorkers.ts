type BadgeNavigator = Navigator & { clearAppBadge?: () => Promise<void> };

/**
 * The app used to be installable, with a service worker at /sw.js and a dot on the app icon while a timer ran. That is gone.
 * People who installed it still have the old worker (and maybe a leftover dot), so on every start this unregisters every
 * service worker of this site, deletes any cache one may have made and clears the icon badge. Does nothing, and never throws,
 * where there is nothing to remove or the browser lacks the feature.
 */
export async function removeLegacyServiceWorkers(): Promise<void> {
  try {
    if ('serviceWorker' in navigator) {
      const registrations = await navigator.serviceWorker.getRegistrations();
      await Promise.all(registrations.map((r) => r.unregister()));
    }
    if (typeof caches !== 'undefined') {
      await Promise.all((await caches.keys()).map((key) => caches.delete(key)));
    }
    await (navigator as BadgeNavigator).clearAppBadge?.();
  } catch {
    /* nothing to remove, or not allowed: the app works the same */
  }
}
