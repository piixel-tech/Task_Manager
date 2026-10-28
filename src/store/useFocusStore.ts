import { create } from 'zustand';
import { useAuthStore } from './authStore';

interface FocusState {
  /** When my own Focus mode ends (ISO), if I am in it. */
  mine: string | null;
  /** What colleagues' Focus looks like right now, from live events (overrides the value the API gave). */
  others: Record<string, string | null>;
  /** Re-read every half minute so a moon disappears by itself when Focus ends. */
  now: number;
  setMine: (until: string | null) => void;
  setOther: (userId: string, until: string | null) => void;
  tick: () => void;
  reset: () => void;
}

export const useFocusStore = create<FocusState>((set) => ({
  mine: null,
  others: {},
  now: Date.now(),
  setMine: (mine) => set({ mine }),
  setOther: (userId, until) => set((s) => ({ others: { ...s.others, [userId]: until } })),
  tick: () => set({ now: Date.now() }),
  reset: () => set({ mine: null, others: {}, now: Date.now() })
}));

export const isActive = (until: string | null | undefined, now = Date.now()): until is string => !!until && new Date(until).getTime() > now;

/** Am I in Focus mode right now? Non-hook, for sockets and stores. */
export const amFocused = () => isActive(useFocusStore.getState().mine);

/** When this person's Focus ends, or null if they aren't in it. Re-renders when it starts or ends. */
export function useFocusOf(user: { id: string; focus_until?: string | null } | null | undefined): string | null {
  const live = useFocusStore((s) => (user ? s.others[user.id] : undefined));
  const mine = useFocusStore((s) => s.mine);
  const now = useFocusStore((s) => s.now);
  const myId = useAuthStore((s) => s.user?.id);
  if (!user) return null;
  const until = user.id === myId ? mine : live !== undefined ? live : (user.focus_until ?? null);
  return isActive(until, now) ? until : null;
}

/** "3:30 PM", or "tomorrow 9:00 AM" when it ends on another day. */
export function focusEndLabel(until: string): string {
  const d = new Date(until);
  const time = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  if (d.toDateString() === new Date().toDateString()) return time;
  const tomorrow = new Date(Date.now() + 86_400_000);
  return d.toDateString() === tomorrow.toDateString() ? `tomorrow ${time}` : `${d.toLocaleDateString([], { weekday: 'short' })} ${time}`;
}
