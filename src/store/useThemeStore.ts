import { create } from 'zustand';

export type Accent = 'forest' | 'ocean' | 'plum' | 'ember';

export const ACCENTS: { id: Accent; label: string; swatch: string; note: string }[] = [
  { id: 'forest', label: 'Forest', swatch: '#1f5f3f', note: 'Deep green — the default' },
  { id: 'ocean', label: 'Ocean', swatch: '#1b5a78', note: 'Cool slate blue' },
  { id: 'plum', label: 'Plum', swatch: '#5a2a62', note: 'Muted violet' },
  { id: 'ember', label: 'Ember', swatch: '#8a3a1c', note: 'Warm terracotta' }
];

const STORAGE_KEY = 'tm.accent';

const isAccent = (v: unknown): v is Accent =>
  typeof v === 'string' && ACCENTS.some((a) => a.id === v);

const readStored = (): Accent => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (isAccent(raw)) return raw;
  } catch {
    /* storage unavailable — fall through to the default */
  }
  return 'forest';
};

const apply = (accent: Accent) => {
  document.documentElement.setAttribute('data-accent', accent);
};

interface ThemeState {
  accent: Accent;
  setAccent: (accent: Accent) => void;
}

/**
 * Accent theme switcher. Swaps the `--tm-primary*` CSS variables by setting
 * `data-accent` on <html>; the choice is remembered in localStorage and
 * re-applied before first paint by a small inline script in index.html.
 */
export const useThemeStore = create<ThemeState>((set) => {
  const initial = readStored();
  apply(initial);

  return {
    accent: initial,
    setAccent: (accent) => {
      apply(accent);
      try {
        localStorage.setItem(STORAGE_KEY, accent);
      } catch {
        /* non-persistent session — the accent still applies for this visit */
      }
      set({ accent });
    }
  };
});
