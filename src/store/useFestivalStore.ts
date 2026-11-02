import { create } from 'zustand';
import { festivalApi, PALETTE_KEYS, type Festival, type PaletteColors } from '../services/http/festivalApi';

const CACHE_KEY = 'tm.festival'; // {id, end, css}: lets index.html apply it before first paint
const OFF_KEY = 'tm.festival.off'; // id of the festival this browser switched away from
const STYLE_ID = 'tm-festival-css';

const read = (key: string): string | null => {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
};
const write = (key: string, value: string | null) => {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    /* storage unavailable: it still applies for this visit */
  }
};

const block = (selector: string, colors: PaletteColors) => `${selector}{${PALETTE_KEYS.map((k) => `--${k}:${colors[k]};`).join('')}}`;

/** The two palette blocks for a festival, in the same shape as src/styles/palettes.css. */
export const festivalCss = (f: Pick<Festival, 'light' | 'dark'>): string =>
  block("[data-theme='festival']", f.light) + block("[data-theme='festival'][data-mode='dark']", f.dark);

function injectCss(css: string | null) {
  document.getElementById(STYLE_ID)?.remove();
  if (!css) return;
  const el = document.createElement('style');
  el.id = STYLE_ID;
  el.textContent = css;
  document.head.appendChild(el);
}

const todayLocal = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

interface FestivalState {
  /** The festival running today, if any. */
  active: Festival | null;
  /** This browser chose its own theme over the festival one (for this festival only). */
  optedOutId: string | null;
  load: () => Promise<void>;
  /** Re-check the dates without asking the server (a festival ends by itself). */
  expireIfOver: () => void;
  useOwnTheme: () => void;
  useFestivalTheme: () => void;
}

/** Is the festival theme what the page shows right now? */
export const isFestivalApplied = (s: Pick<FestivalState, 'active' | 'optedOutId'>): boolean => !!s.active && s.optedOutId !== s.active.id;

export const useFestivalStore = create<FestivalState>((set, get) => ({
  active: null,
  optedOutId: read(OFF_KEY),

  load: async () => {
    let f: Festival | null = null;
    try {
      f = await festivalApi.active();
    } catch {
      return; // offline or signed out: keep what we have
    }
    if (f) {
      const css = festivalCss(f);
      injectCss(css);
      write(CACHE_KEY, JSON.stringify({ id: f.id, end: f.end_date, css }));
    } else {
      injectCss(null);
      write(CACHE_KEY, null);
      write(OFF_KEY, null);
    }
    set({ active: f, optedOutId: f ? get().optedOutId : null });
  },

  expireIfOver: () => {
    const f = get().active;
    if (f && todayLocal() > f.end_date) {
      injectCss(null);
      write(CACHE_KEY, null);
      set({ active: null });
    }
  },

  useOwnTheme: () => {
    const f = get().active;
    if (!f) return;
    write(OFF_KEY, f.id);
    set({ optedOutId: f.id });
  },

  useFestivalTheme: () => {
    write(OFF_KEY, null);
    set({ optedOutId: null });
  }
}));
