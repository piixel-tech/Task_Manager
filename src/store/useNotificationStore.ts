import { create } from 'zustand';
import type { AppNotification } from '../types';
import { notificationService } from '../services';

interface NotificationState {
  notifications: AppNotification[];
  isLoading: boolean;

  /** Loads the signed-in employee's notifications, newest first. */
  fetchNotifications: (userId: string) => Promise<void>;
  markAsRead: (id: string) => Promise<void>;
  markAllAsRead: (userId: string) => Promise<void>;
  clear: () => void;
}

export const useNotificationStore = create<NotificationState>((set, get) => ({
  notifications: [],
  isLoading: false,

  fetchNotifications: async (userId: string) => {
    if (!userId) return;
    set({ isLoading: true });
    try {
      const list = await notificationService.getNotifications(userId);
      set({ notifications: list, isLoading: false });
    } catch (err) {
      console.error('Failed to load notifications', err);
      set({ isLoading: false });
    }
  },

  markAsRead: async (id: string) => {
    // Optimistic: the bell should not flash back to unread.
    set((state) => ({
      notifications: state.notifications.map((n) => (n.id === id ? { ...n, read: true } : n))
    }));
    await notificationService.markAsRead(id).catch(console.error);
  },

  markAllAsRead: async (userId: string) => {
    set((state) => ({
      notifications: state.notifications.map((n) =>
        n.userId === userId ? { ...n, read: true } : n
      )
    }));
    await notificationService.markAllAsRead(userId).catch(console.error);
  },

  clear: () => {
    if (get().notifications.length > 0) set({ notifications: [] });
  }
}));
