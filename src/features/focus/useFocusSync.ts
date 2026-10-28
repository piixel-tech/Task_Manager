import { useEffect } from 'react';
import { useAuthStore } from '../../store/authStore';
import { useChatStore } from '../../store/useChatStore';
import { useFocusStore, isActive } from '../../store/useFocusStore';
import { useNotificationStore } from '../../store/useNotificationStore';
import { socket } from '../../services/socket';

const TICK_MS = 30_000;

/**
 * Keeps Focus mode in step for the signed-in person: loads my own end time, follows colleagues' changes over the
 * WebSocket, and, when my Focus ends by itself, catches up on what arrived quietly (bell and unread badges).
 */
export function useFocusSync(): void {
  const userId = useAuthStore((s) => s.user?.id);
  const initial = useAuthStore((s) => s.user?.focusUntil);
  const mine = useFocusStore((s) => s.mine);

  useEffect(() => {
    const store = useFocusStore;
    if (!userId) {
      store.getState().reset();
      return;
    }
    store.getState().setMine(isActive(initial) ? initial : null);
    const off = socket.on('focus:changed', (e: { user_id: string; focus_until: string | null }) => {
      if (e.user_id === userId) store.getState().setMine(isActive(e.focus_until) ? e.focus_until : null);
      else store.getState().setOther(e.user_id, e.focus_until);
    });
    const timer = setInterval(() => store.getState().tick(), TICK_MS);
    return () => {
      off();
      clearInterval(timer);
    };
  }, [userId, initial]);

  // When my Focus runs out, fetch what was held back.
  useEffect(() => {
    if (!mine) return;
    const wait = new Date(mine).getTime() - Date.now();
    if (wait <= 0) return;
    const t = setTimeout(() => {
      if (useFocusStore.getState().mine === mine) {
        useFocusStore.getState().setMine(null);
        void useNotificationStore.getState().fetchNotifications();
        void useChatStore.getState().loadGroups();
      }
    }, wait + 500);
    return () => clearTimeout(t);
  }, [mine]);
}
