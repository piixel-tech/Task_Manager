import type { INotificationService } from '../interfaces';
import type { AppNotification, NotificationInput, User } from '../../types';
import { getStoredData, setStoredData, KEYS } from './storage';
import { generateId } from '../../utils/ids';
import { getNowISO, getTodayDateString } from '../../utils/time';

const UPDATE_EVENT = 'tm_notifications_update';

/**
 * Local (localStorage) notification store.
 *
 * Everything else in the app talks to this through INotificationService, so
 * swapping it for backend push later only means writing a second implementation
 * and changing the export in `services/index.ts`.
 */
export class MockNotificationService implements INotificationService {
  /** Notifications only go to active employees. */
  private isNotifiableEmployee(userId: string): boolean {
    const users = getStoredData<User[]>(KEYS.USERS);
    const user = users.find((u) => u.id === userId);
    return !!user && user.role === 'employee' && user.active;
  }

  private emitUpdate(): void {
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new Event(UPDATE_EVENT));
    }
  }

  async addNotification(employeeId: string, input: NotificationInput): Promise<AppNotification | null> {
    if (!employeeId || !this.isNotifiableEmployee(employeeId)) return null;

    const list = getStoredData<AppNotification[]>(KEYS.NOTIFICATIONS);
    const notification: AppNotification = {
      id: generateId('ntf'),
      userId: employeeId,
      type: input.type,
      title: input.title,
      message: input.message,
      link: input.link,
      createdAt: input.createdAt || getNowISO(),
      read: input.read ?? false
    };

    list.push(notification);
    setStoredData(KEYS.NOTIFICATIONS, list);
    this.emitUpdate();
    return notification;
  }

  async addNotificationOnceToday(
    employeeId: string,
    dedupeKey: string,
    input: NotificationInput
  ): Promise<AppNotification | null> {
    const today = getTodayDateString();
    const sentKeys = getStoredData<Record<string, string>>(KEYS.NOTIFICATION_KEYS) || {};
    const fullKey = `${employeeId}:${dedupeKey}`;

    if (sentKeys[fullKey] === today) return null;

    const created = await this.addNotification(employeeId, input);
    if (!created) return null;

    // Keep only today's keys so the map does not grow forever.
    const pruned: Record<string, string> = { [fullKey]: today };
    for (const [key, date] of Object.entries(sentKeys)) {
      if (date === today) pruned[key] = date;
    }
    setStoredData(KEYS.NOTIFICATION_KEYS, pruned);
    return created;
  }

  async getNotifications(userId: string): Promise<AppNotification[]> {
    const list = getStoredData<AppNotification[]>(KEYS.NOTIFICATIONS);
    return list
      .filter((n) => n.userId === userId)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  async getUnreadCount(userId: string): Promise<number> {
    const list = await this.getNotifications(userId);
    return list.filter((n) => !n.read).length;
  }

  async markAsRead(id: string): Promise<void> {
    const list = getStoredData<AppNotification[]>(KEYS.NOTIFICATIONS);
    const target = list.find((n) => n.id === id);
    if (!target || target.read) return;
    target.read = true;
    setStoredData(KEYS.NOTIFICATIONS, list);
    this.emitUpdate();
  }

  async markAllAsRead(userId: string): Promise<void> {
    const list = getStoredData<AppNotification[]>(KEYS.NOTIFICATIONS);
    let changed = false;
    for (const n of list) {
      if (n.userId === userId && !n.read) {
        n.read = true;
        changed = true;
      }
    }
    if (!changed) return;
    setStoredData(KEYS.NOTIFICATIONS, list);
    this.emitUpdate();
  }

  subscribe(callback: () => void): () => void {
    if (typeof window === 'undefined') return () => {};
    const handler = () => callback();
    window.addEventListener(UPDATE_EVENT, handler);
    // Another tab writing to localStorage counts as an update too.
    const storageHandler = (e: StorageEvent) => {
      if (e.key === KEYS.NOTIFICATIONS) callback();
    };
    window.addEventListener('storage', storageHandler);
    return () => {
      window.removeEventListener(UPDATE_EVENT, handler);
      window.removeEventListener('storage', storageHandler);
    };
  }
}

export const mockNotificationService = new MockNotificationService();
