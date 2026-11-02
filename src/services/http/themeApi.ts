import { api, getErrorMessage } from '../api';
import type { PaletteColors } from './festivalApi';

export interface CustomTheme {
  id: string;
  name: string;
  primary: string;
  accent: string;
  bg: string;
  shared: boolean;
  light: PaletteColors;
  dark: PaletteColors;
  owner_id: string;
  owner_name: string;
  /** Built by me (editable), as opposed to shared with me. */
  mine: boolean;
}

export interface ThemeList {
  mine: CustomTheme[];
  team: CustomTheme[];
  max: number;
}

export interface ThemeInput {
  name: string;
  primary: string;
  accent: string;
  bg: string;
  shared: boolean;
}

export interface ThemePreview {
  light: PaletteColors;
  dark: PaletteColors;
  /** What was adjusted to keep text readable. */
  warnings: string[];
}

async function call<T>(fn: () => Promise<{ data: T }>, fallback: string): Promise<T> {
  try {
    return (await fn()).data;
  } catch (err) {
    throw new Error(getErrorMessage(err, fallback));
  }
}

export const themeApi = {
  list: () => call<ThemeList>(() => api.get('/themes'), 'Could not load your themes'),
  preview: (c: Pick<ThemeInput, 'primary' | 'accent' | 'bg'>) => call<ThemePreview>(() => api.post('/themes/preview', c), 'Could not check those colours'),
  create: (input: ThemeInput) => call<CustomTheme>(() => api.post('/themes', input), 'Could not save the theme'),
  update: (id: string, input: ThemeInput) => call<CustomTheme>(() => api.put(`/themes/${id}`, input), 'Could not save the theme'),
  remove: async (id: string): Promise<void> => {
    try {
      await api.delete(`/themes/${id}`);
    } catch (err) {
      throw new Error(getErrorMessage(err, 'Could not delete the theme'));
    }
  }
};
