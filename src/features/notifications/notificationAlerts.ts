import { ALERT_SOUNDS, type AlertSound } from '../../services/http/accountApi';
import { useSettingsStore } from '../../store/useSettingsStore';

export const SOUND_LABELS: Record<AlertSound, string> = {
  chime: 'Chime',
  ding: 'Ding',
  pop: 'Pop',
  bell: 'Bell',
  drop: 'Drop',
  soft: 'Soft rise'
};

export const SOUND_OPTIONS = ALERT_SOUNDS.map((id) => ({ id, label: SOUND_LABELS[id] }));

let player: HTMLAudioElement | null = null;

/** Plays one of the files in /public/sounds. Browsers may refuse before the first click; that is fine. */
export function playAlertSound(id: AlertSound, volumePercent: number): void {
  try {
    player?.pause();
    player = new Audio(`/sounds/${id}.wav`);
    player.volume = Math.min(1, Math.max(0, volumePercent / 100));
    void player.play().catch(() => undefined);
  } catch {
    /* no audio available */
  }
}

/**
 * The sound for a new notification, using this person's saved choice. Normal ones are silent when muted (or at volume 0);
 * important ones (mentions, approvals, overdue tasks) have their own sound and always play, at an audible level at least.
 */
export function playNotificationSound(priority: 'normal' | 'important' = 'normal'): void {
  const s = useSettingsStore.getState().settings;
  if (priority === 'important') return playAlertSound(s.alert_sound_important, Math.max(s.alert_volume, 40));
  if (!s.alert_muted && s.alert_volume > 0) playAlertSound(s.alert_sound, s.alert_volume);
}

export const desktopSupported = (): boolean => typeof window !== 'undefined' && 'Notification' in window;

/** Asks the browser for permission. Call it from a click in Settings, never on page load. */
export async function requestDesktopPermission(): Promise<NotificationPermission> {
  if (!desktopSupported()) return 'denied';
  if (Notification.permission !== 'default') return Notification.permission;
  try {
    return await Notification.requestPermission();
  } catch {
    return 'denied';
  }
}

/** What this browser allows: "unsupported" where there is no Notifications API. Permission is per browser, not per account. */
export const desktopPermission = (): NotificationPermission | 'unsupported' => (desktopSupported() ? Notification.permission : 'unsupported');

const CLAIM_PREFIX = 'tm.os-notified.';
const CLAIM_TTL_MS = 60_000;

/**
 * Only one open tab may show the system notification for a given id. Every tab of the app receives the same websocket push, so
 * without this a person with two tabs would get two popups. The first tab to ask wins; claims expire after a minute.
 */
function claim(id: string): boolean {
  try {
    const now = Date.now();
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const key = localStorage.key(i);
      if (key?.startsWith(CLAIM_PREFIX) && now - Number(localStorage.getItem(key)) > CLAIM_TTL_MS) localStorage.removeItem(key);
    }
    if (localStorage.getItem(CLAIM_PREFIX + id)) return false;
    localStorage.setItem(CLAIM_PREFIX + id, String(now));
  } catch {
    /* storage unavailable: show it (the tag below still replaces a repeat in the same browser) */
  }
  return true;
}

const shown = new Set<string>();

/**
 * A system (Windows / macOS) notification, when this person turned desktop popups on, the browser allowed it, and they are not
 * looking at the app: the tab is hidden or minimised, or the browser window is behind another app. Clicking it brings the app
 * forward and runs `onOpen` (which opens the task). `id` stops repeats: the same notification never shows twice, in this tab or
 * in another open tab.
 */
export function showDesktopNotification(title: string, body: string | undefined, onOpen?: () => void, id?: string): void {
  if (!desktopSupported() || Notification.permission !== 'granted') return;
  if (!useSettingsStore.getState().settings.desktop_popups) return;
  if (document.visibilityState === 'visible' && document.hasFocus()) return; // they are looking at the app: the toast is enough
  if (id) {
    if (shown.has(id) || !claim(id)) return;
    shown.add(id);
  }
  open(title, body, onOpen, id ? `tm-${id}` : `tm-${title}-${body ?? ''}`);
}

function open(title: string, body: string | undefined, onOpen: (() => void) | undefined, tag: string): void {
  try {
    const n = new Notification(title, { body, icon: '/favicon.svg', tag });
    n.onclick = () => {
      window.focus();
      onOpen?.();
      n.close();
    };
  } catch {
    /* the browser refused (some only allow notifications from a service worker): the in-app toast is still there */
  }
}

/** The "Send a test" button: shows one now, whatever the tab is doing. Returns false if the browser would not allow it. */
export function sendTestNotification(): boolean {
  if (!desktopSupported() || Notification.permission !== 'granted') return false;
  open('Task Manager', 'System notifications are on. Click this to open the app.', undefined, 'tm-test');
  return true;
}
