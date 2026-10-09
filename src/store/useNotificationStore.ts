import { create } from 'zustand';

export interface NotificationItem {
  id: string;
  title: string;
  body: string;
  timeAgo: string;
  read: boolean;
  to: string;
  tone: 'bad' | 'warn' | 'info' | 'ok';
}

interface NotificationState {
  notifications: NotificationItem[];
  setNotifications: (items: NotificationItem[]) => void;
  markAsRead: (id: string) => void;
  markAllAsRead: () => void;
}

const INITIAL_NOTIFICATIONS: NotificationItem[] = [
  {
    id: 'n-1',
    title: 'Overdue task reminder',
    body: 'Project setup task is past due date',
    timeAgo: '10m ago',
    read: false,
    to: '/app/tasks',
    tone: 'bad'
  },
  {
    id: 'n-2',
    title: 'Shift active',
    body: 'Time tracker is running for today shift',
    timeAgo: '1h ago',
    read: false,
    to: '/app/attendance',
    tone: 'info'
  },
  {
    id: 'n-3',
    title: 'Team announcement',
    body: 'Weekly sprint planning at 4:00 PM',
    timeAgo: '2h ago',
    read: true,
    to: '/app/calendar',
    tone: 'warn'
  }
];

export const useNotificationStore = create<NotificationState>((set) => ({
  notifications: INITIAL_NOTIFICATIONS,

  setNotifications: (items) => set({ notifications: items }),

  markAsRead: (id) =>
    set((state) => ({
      notifications: state.notifications.map((n) =>
        n.id === id ? { ...n, read: true } : n
      )
    })),

  markAllAsRead: () =>
    set((state) => ({
      notifications: state.notifications.map((n) => ({ ...n, read: true }))
    }))
}));
