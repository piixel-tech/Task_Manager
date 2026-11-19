import { create } from 'zustand';
import { accountApi, coercePalette, DEFAULT_SETTINGS, type NotifPrefs, type UserSettings } from '../services/http/accountApi';
import { setSoundPreference } from '../features/tasks/components/TaskCompletionCelebration';
import { useAuthStore } from './authStore';
import { isFestivalApplied, useFestivalStore } from './useFestivalStore';
import { isAvailablePalette, themeAttr } from './useCustomThemesStore';
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
const PALETTE_KEY = 'tm.palette';
const DENSITY_KEY = 'tm.density';

const remember = (key: string, value: string) => {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* storage unavailable: it still applies for this visit */
  }
};

/** The page is always light; this sets the colour theme and the compact or comfortable spacing. */
export function applyAppearance(s: Pick<UserSettings, 'density'> & { palette?: UserSettings['palette']; hints?: boolean }): void {
  const root = document.documentElement;
  root.setAttribute('data-hints', s.hints === false ? 'off' : 'on'); // off hides every [data-hint] line and "i" icon
  root.setAttribute('data-mode', 'light');
  // A live festival theme takes over unless this browser switched back to the person's own theme.
  root.setAttribute('data-theme', isFestivalApplied(useFestivalStore.getState()) ? 'festival' : themeAttr(isAvailablePalette(s.palette ?? 'purple') ? (s.palette ?? 'purple') : 'purple'));
  root.setAttribute('data-density', s.density);
  remember(MODE_KEY, 'light');
  remember(PALETTE_KEY, s.palette ?? 'purple');
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', getComputedStyle(root).getPropertyValue('--bg').trim() || '#f3f1f6');
  remember(DENSITY_KEY, s.density);
}

export const useSettingsStore = create<SettingsStore>((set, get) => ({
  settings: DEFAULT_SETTINGS,

  init: (saved) => {
    const settings = saved ? { ...DEFAULT_SETTINGS, ...saved, theme: 'light' as const, palette: coercePalette(saved.palette), notif_prefs: { ...DEFAULT_SETTINGS.notif_prefs, ...saved.notif_prefs }, greeting: { ...DEFAULT_SETTINGS.greeting, ...saved.greeting } } : DEFAULT_SETTINGS;
    applyAppearance(settings);
    setSoundPreference(settings.sound); // the existing sound code reads this local copy
    set({ settings });
  },

  update: async (patch) => {
    const before = get().settings;
    if (patch.palette && patch.palette !== before.palette) useFestivalStore.getState().useOwnTheme(); // picking a theme means "use mine"
    const next: UserSettings = { ...before, ...patch, theme: 'light', notif_prefs: { ...before.notif_prefs, ...patch.notif_prefs }, greeting: patch.greeting ?? before.greeting };
    applyAppearance(next);
    setSoundPreference(next.sound);
    set({ settings: next });
    try {
      // What the server answers is what was saved: take that, not our own copy, so nothing can look saved when it was not.
      const saved = await accountApi.saveSettings(next);
      const confirmed: UserSettings = {
        ...next,
        ...saved,
        theme: 'light',
        notif_prefs: { ...next.notif_prefs, ...saved.notif_prefs },
        greeting: { ...DEFAULT_SETTINGS.greeting, ...saved.greeting }
      };
      set({ settings: confirmed });
      useAuthStore.setState((s) => (s.user ? { user: { ...s.user, settings: confirmed } } : s));
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

/** Does this person want this kind of popup? (The server already skips notifications they switched off; this covers chat popups, which are not notifications.) */
export const wantsPopup = (kind: keyof NotifPrefs) => useSettingsStore.getState().settings.notif_prefs[kind];
