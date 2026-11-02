import { create } from 'zustand';
import { PALETTE_KEYS, type PaletteColors } from '../services/http/festivalApi';
import { themeApi, type CustomTheme } from '../services/http/themeApi';

const CSS_KEY = 'tm.customcss'; // lets index.html paint a custom theme before first paint
const STYLE_ID = 'tm-custom-themes-css';

const block = (selector: string, colors: PaletteColors) => `${selector}{${PALETTE_KEYS.map((k) => `--${k}:${colors[k]};`).join('')}}`;

/** The value of <html data-theme> for a saved palette: built-in names as they are, "custom:<id>" as "custom-<id>". */
export const themeAttr = (palette: string): string => (palette.startsWith('custom:') ? `custom-${palette.slice(7)}` : palette);

/** The two palette blocks for each theme, in the same shape as src/styles/palettes.css. */
export const customThemesCss = (themes: Pick<CustomTheme, 'id' | 'light' | 'dark'>[]): string =>
  themes.map((t) => block(`[data-theme='custom-${t.id}']`, t.light) + block(`[data-theme='custom-${t.id}'][data-mode='dark']`, t.dark)).join('');

function inject(css: string) {
  let el = document.getElementById(STYLE_ID);
  if (!el) {
    el = document.createElement('style');
    el.id = STYLE_ID;
    document.head.appendChild(el);
  }
  el.textContent = css;
  try {
    localStorage.setItem(CSS_KEY, css);
  } catch {
    /* storage unavailable */
  }
}

interface CustomThemesState {
  mine: CustomTheme[];
  team: CustomTheme[];
  max: number;
  /** Loaded from the server at least once (before that, a saved custom theme is trusted as it is). */
  loaded: boolean;
  load: () => Promise<void>;
  reset: () => void;
}

export const useCustomThemesStore = create<CustomThemesState>((set) => ({
  mine: [],
  team: [],
  max: 5,
  loaded: false,
  load: async () => {
    try {
      const r = await themeApi.list();
      inject(customThemesCss([...r.mine, ...r.team]));
      set({ mine: r.mine, team: r.team, max: r.max, loaded: true });
    } catch {
      /* offline or signed out: keep what we have */
    }
  },
  reset: () => {
    document.getElementById(STYLE_ID)?.remove();
    try {
      localStorage.removeItem(CSS_KEY);
    } catch {
      /* storage unavailable */
    }
    set({ mine: [], team: [], loaded: false });
  }
}));

/** Can this saved palette be shown? Built-in ones always; a custom one only while it is mine or shared with me. */
export const isAvailablePalette = (palette: string): boolean => {
  if (!palette.startsWith('custom:')) return true;
  const s = useCustomThemesStore.getState();
  if (!s.loaded) return true;
  const id = palette.slice(7);
  return [...s.mine, ...s.team].some((t) => t.id === id);
};
