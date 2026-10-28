import { create } from 'zustand';
import { accountApi, DEFAULT_SETTINGS, type NotifPrefs, type UserSettings } from '../services/http/accountApi';
import { setSoundPreference } from '../features/tasks/components/TaskCompletionCelebration';
import { useAuthStore } from './authStore';
import { toast } from './useToastStore';

interface SettingsStore {
  settings: UserSettings;
  /** Take what the server remembered for this person (on sign-in). */
  init: (saved?: UserSettings) => void;
  /** Change settings: applied at once, saved on the account, put back if saving fails. */
  update: (patch: Partial<Omit<UserSettings, 'notif_prefs'>> & { notif_prefs?: Partial<NotifPrefs> }) => Promise<void>;
  reset: () => void;
}

const MODE_KEY = 'tm.mode';
const DENSITY_KEY = 'tm.density';

const remember = (key: string, value: string) => {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* storage unavailable: it still applies for this visit */
  }
};

const darkQuery = () => window.matchMedia?.('(prefers-color-scheme: dark)');

/** Light or dark on the page, and compact or comfortable spacing. "System" follows the device. */
export function applyAppearance(s: Pick<UserSettings, 'theme' | 'density'>): void {
  const dark = s.theme === 'dark' || (s.theme === 'system' && !!darkQuery()?.matches);
  const root = document.documentElement;
  root.setAttribute('data-theme', dark ? 'dark' : 'light');
  root.setAttribute('data-density', s.density);
  remember(MODE_KEY, s.theme);
  remember(DENSITY_KEY, s.density);
}

export const useSettingsStore = create<SettingsStore>((set, get) => ({
  settings: DEFAULT_SETTINGS,

  init: (saved) => {
    const settings = saved ? { ...DEFAULT_SETTINGS, ...saved, notif_prefs: { ...DEFAULT_SETTINGS.notif_prefs, ...saved.notif_prefs } } : DEFAULT_SETTINGS;
    applyAppearance(settings);
    setSoundPreference(settings.sound); // the existing sound code reads this local copy
    set({ settings });
  },

  update: async (patch) => {
    const before = get().settings;
    const next: UserSettings = { ...before, ...patch, notif_prefs: { ...before.notif_prefs, ...patch.notif_prefs } };
    applyAppearance(next);
    setSoundPreference(next.sound);
    set({ settings: next });
    try {
      await accountApi.saveSettings(next);
      useAuthStore.setState((s) => (s.user ? { user: { ...s.user, settings: next } } : s));
    } catch (err) {
      applyAppearance(before);
      setSoundPreference(before.sound);
      set({ settings: before });
      toast.error('Could not save that setting', err instanceof Error ? err.message : undefined);
    }
  },

  reset: () => {
    applyAppearance(DEFAULT_SETTINGS);
    set({ settings: DEFAULT_SETTINGS });
  }
}));

// "System" follows the device when it switches between light and dark.
darkQuery()?.addEventListener?.('change', () => applyAppearance(useSettingsStore.getState().settings));

/** Does this person want this kind of popup? (The server already skips notifications they switched off; this covers chat popups, which are not notifications.) */
export const wantsPopup = (kind: keyof NotifPrefs) => useSettingsStore.getState().settings.notif_prefs[kind];
