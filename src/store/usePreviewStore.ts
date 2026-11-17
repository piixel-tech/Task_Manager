import { create } from 'zustand';

/** What the preview needs to know about a file. Every `Asset` fits; the rest is optional. */
export interface PreviewFile {
  id: string;
  name: string;
  mime: string;
  size: number;
  /** An upload's path on the API (it needs the login token, so the preview fetches it itself). */
  url: string;
  created_at?: string;
  /** Who uploaded it, when the screen knows. */
  owner?: { name: string } | null;
}

interface PreviewState {
  files: PreviewFile[];
  index: number;
  isOpen: boolean;
  /** Open the preview on `files[index]`; with several files the person can step through them. */
  show: (files: PreviewFile[], index?: number) => void;
  go: (delta: number) => void;
  close: () => void;
}

export const usePreviewStore = create<PreviewState>((set, get) => ({
  files: [],
  index: 0,
  isOpen: false,
  show: (files, index = 0) => {
    if (files.length === 0) return;
    set({ files, index: Math.min(Math.max(index, 0), files.length - 1), isOpen: true });
  },
  go: (delta) => {
    const { files, index } = get();
    if (files.length < 2) return;
    set({ index: (index + delta + files.length) % files.length });
  },
  close: () => set({ isOpen: false })
}));
