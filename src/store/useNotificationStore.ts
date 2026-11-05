import { create } from 'zustand';
import type { AppNotification } from '../types';
import { notificationApi } from '../services/http/notificationApi';

interface NotificationState {
  notifications: AppNotification[];
  unreadCount: number;
  isLoading: boolean;

  /** Loads the newest notifications and the unread badge from the backend. */
  fetchNotifications: () => Promise<void>;
  /** A notification pushed over the WebSocket. */
  addLive: (notification: AppNotification) => void;
  markAsRead: (id: string) => Promise<void>;
  /** "Remind me in 1h". */
  snooze: (id: string, minutes?: number) => Promise<void>;
  markAllAsRead: () => Promise<void>;
  clear: () => void;
}

export const useNotificationStore = create<NotificationState>((set, get) => ({
  notifications: [],
  unreadCount: 0,
  isLoading: false,

  fetchNotifications: async () => {
    set({ isLoading: true });
    try {
      const [notifications, unreadCount] = await Promise.all([
        notificationApi.list(),
        notificationApi.unreadCount()
      ]);
      set({ notifications, unreadCount, isLoading: false });
    } catch (err) {
      console.error('Failed to load notifications', err);
      set({ isLoading: false });
    }
  },

  addLive: (notification) =>
    set((state) => {
      if (state.notifications.some((n) => n.id === notification.id)) return state;
      return {
        notifications: [notification, ...state.notifications],
        unreadCount: state.unreadCount + (notification.read ? 0 : 1)
      };
    }),

  markAsRead: async (id) => {
    const target = get().notifications.find((n) => n.id === id);
    if (!target || target.read) return;
    // Optimistic: the badge should not flash back.
    set((state) => ({
      notifications: state.notifications.map((n) => (n.id === id ? { ...n, read: true } : n)),
      unreadCount: Math.max(0, state.unreadCount - 1)
    }));
    await notificationApi.markRead([id]).catch(() => get().fetchNotifications());
  },

  snooze: async (id, minutes = 60) => {
    await get().markAsRead(id); // it leaves the unread count now and returns as new later
    await notificationApi.snooze(id, minutes).catch(() => undefined);
  },

  markAllAsRead: async () => {
    set((state) => ({
      notifications: state.notifications.map((n) => ({ ...n, read: true })),
      unreadCount: 0
    }));
    await notificationApi.markAllRead().catch(() => get().fetchNotifications());
  },

  clear: () => set({ notifications: [], unreadCount: 0 })
}));
