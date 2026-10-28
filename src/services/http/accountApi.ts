import { api, getErrorMessage } from '../api';

export interface NotifPrefs {
  tasks: boolean;
  reviews: boolean;
  chat: boolean;
  mentions: boolean;
  office: boolean;
  bookings: boolean;
}

export interface UserSettings {
  theme: 'light' | 'dark' | 'system';
  density: 'comfortable' | 'compact';
  /** Sound effects (celebrations and the like). */
  sound: boolean;
  /** Kinds of notification this person wants. Off means nothing is saved or shown for that kind. */
  notif_prefs: NotifPrefs;
}

export const DEFAULT_SETTINGS: UserSettings = {
  theme: 'system',
  density: 'comfortable',
  sound: true,
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
