import { create } from 'zustand';
import { celebrationApi, type TodayCelebrations } from '../services/http/celebrationApi';

interface CelebrationsStore {
  today: TodayCelebrations;
  loaded: boolean;
  /** Fetch today's celebrations (at most once a minute, however many parts of the dashboard ask; `force` skips that wait). */
  load: (force?: boolean) => Promise<void>;
}

let lastLoad = 0;

export const useCelebrationsStore = create<CelebrationsStore>((set) => ({
  today: { people: [], festivals: [] },
  loaded: false,
  load: async (force = false) => {
    if (!force && Date.now() - lastLoad < 60_000) return;
    lastLoad = Date.now();
    try {
      set({ today: await celebrationApi.today(), loaded: true });
    } catch {
      lastLoad = 0; // quiet: the dashboard simply shows no celebrations
    }
  }
}));
