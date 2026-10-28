import { create } from 'zustand';
import { workspaceApi, type Workspace } from '../services/http/adminApi';

interface WorkspaceStore {
  workspace: Workspace | null;
  load: () => Promise<void>;
  set: (w: Workspace) => void;
}

/** The workspace's name, logo, working hours and holidays: read by everyone, changed by admins. */
export const useWorkspaceStore = create<WorkspaceStore>((set) => ({
  workspace: null,
  load: async () => {
    try {
      set({ workspace: await workspaceApi.get() });
    } catch {
      /* the app works without it: the sidebar falls back to its default name */
    }
  },
  set: (workspace) => set({ workspace })
}));
