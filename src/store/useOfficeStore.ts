import { create } from 'zustand';

/** How many office posts the signed-in person hasn't seen: drives the nav and dashboard badges. */
interface OfficeState {
  unseen: number;
  setUnseen: (n: number) => void;
}

export const useOfficeStore = create<OfficeState>((set) => ({
  unseen: 0,
  setUnseen: (unseen) => set({ unseen })
}));
