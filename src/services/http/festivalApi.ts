import { api, getErrorMessage } from '../api';

/** The eight shared colour variables, without the leading `--` (see src/styles/palettes.css). */
export const PALETTE_KEYS = ['bg', 'surface', 'primary', 'primary-soft', 'text', 'text-muted', 'border', 'accent'] as const;
export type PaletteColors = Record<(typeof PALETTE_KEYS)[number], string>;

export const PALETTE_KEY_LABELS: Record<(typeof PALETTE_KEYS)[number], string> = {
  bg: 'Page background',
  surface: 'Cards',
  primary: 'Links & icons',
  'primary-soft': 'Soft tint',
  text: 'Text',
  'text-muted': 'Muted text',
  border: 'Borders',
  accent: 'Accent'
};

export interface Festival {
  id: string;
  name: string;
  emoji: string;
  greeting: string;
  preset: string | null;
  start_date: string;
  end_date: string;
  light: PaletteColors;
  dark: PaletteColors;
}

export interface FestivalPreset {
  key: string;
  name: string;
  emoji: string;
  greeting: string;
  light: PaletteColors;
  dark: PaletteColors;
}

export interface FestivalAdminState {
  festival: Festival | null;
  state: 'scheduled' | 'live' | 'ended' | null;
}

export interface FestivalInput {
  name: string;
  emoji: string;
  greeting: string;
  preset: string | null;
  start_date: string;
  end_date: string;
  light: PaletteColors;
}

async function call<T>(fn: () => Promise<{ data: T }>, fallback: string): Promise<T> {
  try {
    return (await fn()).data;
  } catch (err) {
    throw new Error(getErrorMessage(err, fallback));
  }
}

export const festivalApi = {
  active: () => call<Festival | null>(() => api.get('/festival/active'), 'Could not load the festival theme'),
  current: () => call<FestivalAdminState>(() => api.get('/festival'), 'Could not load the festival theme'),
  presets: () => call<FestivalPreset[]>(() => api.get('/festival/presets'), 'Could not load the festival presets'),
  preview: (light: PaletteColors) =>
    call<{ light: PaletteColors; dark: PaletteColors }>(() => api.post('/festival/preview', { light }), 'Could not check those colours'),
  publish: (input: FestivalInput) => call<FestivalAdminState>(() => api.put('/festival', input), 'Could not publish the festival theme'),
  end: () => call<FestivalAdminState>(() => api.delete('/festival'), 'Could not end the festival theme')
};
