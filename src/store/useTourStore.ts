import { create } from 'zustand';

interface TourState {
  open: boolean;
  step: number;
  /** Start from the first step (the first-login tour, or "Replay the tour" in Help). */
  start: () => void;
  go: (to: number) => void;
  close: () => void;
}

export const useTourStore = create<TourState>((set) => ({
  open: false,
  step: 0,
  start: () => set({ open: true, step: 0 }),
  go: (to) => set({ step: Math.max(0, to) }),
  close: () => set({ open: false })
}));
