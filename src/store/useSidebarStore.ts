import { create } from 'zustand';
import { sidebarApi, type SidebarState, type SidebarTree } from '../services/http/sidebarApi';
import { useAuthStore } from './authStore';
import { toast } from './useToastStore';

interface SidebarStore extends SidebarState {
  tree: SidebarTree | null;
  error: string | null;

  load: () => Promise<void>;
  /** Take what the server remembered for this person (on sign-in). */
  init: (saved?: SidebarState) => void;
  toggle: (id: string) => void;
  /** Make sure a node is open (e.g. after adding something inside it). */
  expand: (id: string) => void;
  /** Move `id` one step up or down among its siblings (`siblings` is the current order on screen). */
  move: (parentId: string, siblings: string[], id: string, dir: -1 | 1) => void;
  reset: () => void;
}

const SAVE_DELAY_MS = 600;
let timer: ReturnType<typeof setTimeout> | undefined;

/** Before anything was saved the Projects section starts open. */
const DEFAULT: SidebarState = { open: ['projects'], order: {} };

export const useSidebarStore = create<SidebarStore>((set, get) => {
  const persist = () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      const { open, order } = get();
      // Keep the signed-in user's copy current, so a remount of the sidebar doesn't bring back an old layout.
      useAuthStore.setState((st) => (st.user ? { user: { ...st.user, sidebarState: { open, order } } } : st));
      sidebarApi.saveState({ open, order }).catch((err) => toast.error('Could not save the sidebar layout', err.message));
    }, SAVE_DELAY_MS);
  };

  return {
    ...DEFAULT,
    tree: null,
    error: null,

    load: async () => {
      try {
        set({ tree: await sidebarApi.tree(), error: null });
      } catch (err) {
        set({ error: err instanceof Error ? err.message : 'Could not load the sidebar' });
      }
    },

    init: (saved) => set({ open: saved?.open ?? DEFAULT.open, order: saved?.order ?? {} }),

    toggle: (id) => {
      set((s) => ({ open: s.open.includes(id) ? s.open.filter((x) => x !== id) : [...s.open, id] }));
      persist();
    },

    expand: (id) => {
      if (get().open.includes(id)) return;
      set((s) => ({ open: [...s.open, id] }));
      persist();
    },

    move: (parentId, siblings, id, dir) => {
      const at = siblings.indexOf(id);
      const to = at + dir;
      if (at < 0 || to < 0 || to >= siblings.length) return;
      const next = [...siblings];
      [next[at], next[to]] = [next[to], next[at]];
      set((s) => ({ order: { ...s.order, [parentId]: next } }));
      persist();
    },

    reset: () => {
      clearTimeout(timer);
      set({ ...DEFAULT, tree: null, error: null });
    }
  };
});

/** Children in the order this person chose; anything new (not yet in their saved order) follows in the server's order. */
export function inOrder<T extends { id: string }>(items: T[], saved: string[] | undefined): T[] {
  if (!saved?.length) return items;
  const rank = new Map(saved.map((id, i) => [id, i]));
  return [...items].sort((a, b) => (rank.get(a.id) ?? Number.MAX_SAFE_INTEGER) - (rank.get(b.id) ?? Number.MAX_SAFE_INTEGER));
}

/** Read the saved layout off the signed-in user once they are known. */
export const savedLayoutOf = () => useAuthStore.getState().user?.sidebarState;
