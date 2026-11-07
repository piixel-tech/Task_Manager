import { api, getErrorMessage } from '../api';

export interface NotifPrefs {
  tasks: boolean;
  reviews: boolean;
  chat: boolean;
  mentions: boolean;
  office: boolean;
  bookings: boolean;
}

export const PALETTES = ['purple', 'indigo', 'blue', 'sky', 'teal', 'green', 'red', 'coral', 'pink', 'orange', 'gold', 'brown', 'olive', 'grey', 'monochrome'] as const;
/** Themes in the Appearance picker, in groups. */
export const PALETTE_GROUPS: { title: string; items: BuiltInPalette[] }[] = [
  { title: 'Cool', items: ['purple', 'indigo', 'blue', 'sky', 'teal', 'green'] },
  { title: 'Warm', items: ['red', 'coral', 'pink', 'orange', 'gold', 'brown'] },
  { title: 'Earthy & Neutral', items: ['olive', 'grey', 'monochrome'] }
];
/** A saved theme that no longer exists falls back to purple. */
export type BuiltInPalette = (typeof PALETTES)[number];
/** A built-in theme, or "custom:<id>" for one somebody built (see Settings > Appearance). */
export type Palette = BuiltInPalette | `custom:${string}`;
export const coercePalette = (p: unknown): Palette =>
  (PALETTES as readonly unknown[]).includes(p) || (typeof p === 'string' && /^custom:[0-9a-f]{12,32}$/.test(p)) ? (p as Palette) : 'purple';

export const ALERT_SOUNDS = ['chime', 'ding', 'pop', 'bell', 'drop', 'soft'] as const;
export type AlertSound = (typeof ALERT_SOUNDS)[number];

export interface UserSettings {
  /** Light or dark mode ("system" follows the device). */
  theme: 'light' | 'dark' | 'system';
  /** Colour theme, set on <html data-theme>. */
  palette: Palette;
  density: 'comfortable' | 'compact';
  /** Sound effects (celebrations and the like). */
  sound: boolean;
  /** Notification alerts: sound file, volume 0-100, muted, and OS popups while the tab is hidden. */
  alert_sound: AlertSound;
  alert_sound_important: AlertSound;
  alert_volume: number;
  alert_muted: boolean;
  desktop_popups: boolean;
  /** Kinds of notification this person wants. Off means nothing is saved or shown for that kind. */
  notif_prefs: NotifPrefs;
}

export const DEFAULT_SETTINGS: UserSettings = {
  theme: 'light',
  palette: 'purple',
  density: 'comfortable',
  sound: true,
  alert_sound: 'chime',
  alert_sound_important: 'bell',
  alert_volume: 70,
  alert_muted: false,
  desktop_popups: false,
  notif_prefs: { tasks: true, reviews: true, chat: true, mentions: true, office: true, bookings: true }
};

export interface ProfileInput {
  name?: string;
  title?: string;
  phone?: string;
  bio?: string;
  /** A preset (emoji:/icon:/initials:), an uploaded photo's download path, or "" to clear. */
  avatar_url?: string;
}

async function call<T>(fn: () => Promise<{ data: T }>, fallback: string): Promise<T> {
  try {
    return (await fn()).data;
  } catch (err) {
    throw new Error(getErrorMessage(err, fallback));
  }
}

export const accountApi = {
  updateProfile: (input: ProfileInput) => call<unknown>(() => api.patch('/me/profile', input), 'Could not save your profile'),
  saveSettings: (settings: UserSettings) => call<UserSettings>(() => api.put('/me/settings', settings), 'Could not save your settings'),
  changePassword: async (current_password: string, new_password: string): Promise<void> => {
    try {
      await api.post('/me/password', { current_password, new_password });
    } catch (err) {
      throw new Error(getErrorMessage(err, 'Could not change your password'));
    }
  }
};
