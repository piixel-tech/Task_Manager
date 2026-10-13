import type { INotificationService } from '../interfaces';
import type { AppNotification, NotificationInput } from '../../types';

/** Placeholder for backend push notifications. */
export class SupabaseNotificationService implements INotificationService {
  async addNotification(_employeeId: string, _input: NotificationInput): Promise<AppNotification | null> {
    throw new Error('Supabase integration not configured.');
  }
  async addNotificationOnceToday(
    _employeeId: string,
    _dedupeKey: string,
    _input: NotificationInput
  ): Promise<AppNotification | null> {
    throw new Error('Supabase integration not configured.');
  }
  async getNotifications(_userId: string): Promise<AppNotification[]> {
    throw new Error('Supabase integration not configured.');
  }
  async getUnreadCount(_userId: string): Promise<number> {
    throw new Error('Supabase integration not configured.');
  }
  async markAsRead(_id: string): Promise<void> {
    throw new Error('Supabase integration not configured.');
  }
  async markAllAsRead(_userId: string): Promise<void> {
    throw new Error('Supabase integration not configured.');
  }
  subscribe(_callback: () => void): () => void {
    throw new Error('Supabase integration not configured.');
  }
}

export const supabaseNotificationService = new SupabaseNotificationService();
