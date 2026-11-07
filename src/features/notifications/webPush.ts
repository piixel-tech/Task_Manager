import { api } from '../../services/api';

/**
 * Web Push: system notifications that arrive even when Task Manager is closed.
 * The service worker (public/sw.js) shows them; this file asks permission, subscribes the browser and tells the server.
 * Everything here is best effort: if anything is unsupported or refused, the in-app notifications keep working.
 */

export const pushSupported = (): boolean =>
  typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;

function urlBase64ToBytes(base64: string): Uint8Array<ArrayBuffer> {
  const padded = (base64 + '='.repeat((4 - (base64.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(padded);
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

let registration: Promise<ServiceWorkerRegistration> | null = null;
const register = () => (registration ??= navigator.serviceWorker.register('/sw.js', { scope: '/' }));

/** A click on a push notification while the app is open arrives here, so the app can route to the page without a reload. */
export function listenForPushNavigation(navigate: (url: string) => void): () => void {
  if (!pushSupported()) return () => undefined;
  const onMessage = (event: MessageEvent) => {
    const msg = event.data as { type?: string; url?: string } | undefined;
    if (msg?.type === 'tm:navigate' && typeof msg.url === 'string' && msg.url.startsWith('/')) navigate(msg.url);
  };
  navigator.serviceWorker.addEventListener('message', onMessage);
  return () => navigator.serviceWorker.removeEventListener('message', onMessage);
}

async function subscribe(): Promise<void> {
  const { data } = await api.get<{ enabled: boolean; public_key: string | null }>('/push/public-key');
  if (!data.enabled || !data.public_key) return; // the server has no VAPID keys yet
  const reg = await register();
  await navigator.serviceWorker.ready;
  const key = urlBase64ToBytes(data.public_key);
  let sub = await reg.pushManager.getSubscription();
  try {
    sub ??= await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key });
  } catch {
    // An old subscription made with different server keys: start over.
    await sub?.unsubscribe();
    sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key });
  }
  // Always tell the server: the same browser may now belong to a different person.
  await api.post('/push/subscribe', sub.toJSON());
}

let askedThisSession = false;

/**
 * After login: ask for notification permission once (never again if the person said no), then subscribe and save it for them.
 * Browsers that refuse a prompt without a click get it on the first click instead.
 */
export async function enablePush(): Promise<void> {
  if (!pushSupported() || Notification.permission === 'denied') return;
  try {
    if (Notification.permission === 'granted') return await subscribe();
    if (askedThisSession) return;
    askedThisSession = true;
    let permission = await Notification.requestPermission();
    if (permission === 'default') {
      // The browser wanted a user gesture: try again on the first click.
      permission = await new Promise<NotificationPermission>((resolve) =>
        document.addEventListener('click', () => void Notification.requestPermission().then(resolve, () => resolve('default')), { once: true })
      );
    }
    if (permission === 'granted') await subscribe();
  } catch {
    /* unsupported, offline or refused: the bell and toasts still work */
  }
}

/** On sign-out: this browser stops receiving the previous person's notifications. Call it before the token is dropped. */
export async function disablePush(): Promise<void> {
  if (!pushSupported()) return;
  try {
    const reg = await navigator.serviceWorker.getRegistration('/');
    const sub = await reg?.pushManager.getSubscription();
    if (!sub) return;
    await api.post('/push/unsubscribe', { endpoint: sub.endpoint }).catch(() => undefined);
    await sub.unsubscribe();
  } catch {
    /* nothing to undo */
  }
}
