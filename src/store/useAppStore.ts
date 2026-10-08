import { create } from 'zustand';

interface AppState {
  sidebarOpen: boolean;
  toggleSidebar: () => void;
  closeSidebar: () => void;
  companyFilter: 'all' | 'piixel' | 'unwork';
  setCompanyFilter: (filter: 'all' | 'piixel' | 'unwork') => void;
  toastMessage: string | null;
  showToast: (msg: string) => void;
  clearToast: () => void;
}

export const useAppStore = create<AppState>((set) => ({
  sidebarOpen: false,
  toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),
  closeSidebar: () => set({ sidebarOpen: false }),
  companyFilter: 'all',
  setCompanyFilter: (filter) => set({ companyFilter: filter }),
  toastMessage: null,
  showToast: (msg) => {
    set({ toastMessage: msg });
    setTimeout(() => {
      set({ toastMessage: null });
    }, 3000);
  },
  clearToast: () => set({ toastMessage: null })
}));
