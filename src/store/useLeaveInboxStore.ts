import { useEffect } from 'react';
import { create } from 'zustand';
import { socket } from '../services/socket';
import { leaveApi, type LeaveRequest } from '../services/http/leaveApi';

interface LeaveInboxState {
  /** The requests waiting for this admin, newest first. */
  pending: LeaveRequest[];
  loaded: boolean;
  error: string | null;
  load: () => Promise<void>;
}

/** One shared list for the sidebar badge, the dashboard card and the page, so they always agree. */
export const useLeaveInboxStore = create<LeaveInboxState>((set) => ({
  pending: [],
  loaded: false,
  error: null,
  load: async () => {
    try {
      set({ pending: await leaveApi.inbox({ status: 'pending' }), loaded: true, error: null });
    } catch (err) {
      set({ loaded: true, error: err instanceof Error ? err.message : 'Could not load the leave requests' });
    }
  }
}));

let watchers = 0;
let stop: (() => void) | null = null;

/**
 * Keeps the shared list live for an admin: loads it, and refreshes it whenever a request is made, cancelled or decided
 * (websocket), and when the tab comes back into view. Any number of components can call it; the listeners exist once.
 */
export function useLeaveInbox(enabled: boolean): LeaveInboxState {
  const state = useLeaveInboxStore();
  useEffect(() => {
    if (!enabled) return;
    const { load } = useLeaveInboxStore.getState();
    if (watchers++ === 0) {
      void load();
      const offs = [
        socket.on('leave_requests', () => void load()),
        socket.on('notification', (n: { type?: string }) => n?.type === 'leave_request' && void load())
      ];
      const onVisible = () => document.visibilityState === 'visible' && void load();
      document.addEventListener('visibilitychange', onVisible);
      stop = () => {
        offs.forEach((off) => off());
        document.removeEventListener('visibilitychange', onVisible);
      };
    }
    return () => {
      if (--watchers === 0) {
        stop?.();
        stop = null;
      }
    };
  }, [enabled]);
  return state;
}
