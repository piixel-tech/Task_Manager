import type { AppNotification, NotificationType } from '../../types';
import { api } from '../api';

export interface ApiNotification {
  id: string;
  user_id: string;
  type: string;
  title: string;
  body: string;
  link: string | null;
  read: boolean;
  priority?: 'normal' | 'important';
  created_at: string;
  actor?: { id: string; name: string; avatar_url: string | null } | null;
}

/** Backend timestamps can come back without a zone; they are always UTC. */
const asUtc = (iso: string) => (/(Z|[+-]\d\d:?\d\d)$/.test(iso) ? iso : `${iso}Z`);

export function toNotification(n: ApiNotification): AppNotification {
  return {
    id: n.id,
    userId: n.user_id,
    type: n.type as NotificationType,
    title: n.title,
    message: n.body,
    link: n.link ?? '',
    createdAt: asUtc(n.created_at),
    read: n.read,
    priority: n.priority === 'important' ? 'important' : 'normal',
    actor: n.actor ? { id: n.actor.id, name: n.actor.name, avatarUrl: n.actor.avatar_url } : undefined
  };
}

export const notificationApi = {
  async list(limit = 20): Promise<AppNotification[]> {
    const { data } = await api.get<{ items: ApiNotification[] }>('/notifications', {
      params: { limit }
    });
    return data.items.map(toNotification);
  },
  /** A page of the activity list, newest first. */
  async page(opts: { unreadOnly?: boolean; limit?: number; skip?: number } = {}): Promise<{ items: AppNotification[]; total: number }> {
    const { data } = await api.get<{ items: ApiNotification[]; total: number }>('/notifications', {
      params: { unread_only: opts.unreadOnly || undefined, limit: opts.limit ?? 30, skip: opts.skip ?? 0 }
    });
    return { items: data.items.map(toNotification), total: data.total };
  },
  async unreadCount(): Promise<number> {
    const { data } = await api.get<{ count: number }>('/notifications/unread-count');
    return data.count;
  },
  async markRead(ids: string[]): Promise<void> {
    await api.post('/notifications/read', { ids });
  },
  async markAllRead(): Promise<void> {
    await api.post('/notifications/read', { all: true });
  },
  /** "Remind me in 1h": it is read now and comes back as new when the time is up. */
  async snooze(id: string, minutes = 60): Promise<void> {
    await api.post(`/notifications/${id}/snooze`, { minutes });
  },
  async mutes(): Promise<Record<string, string>> {
    return (await api.get<Record<string, string>>('/me/mutes')).data;
  },
  async setMute(key: string, duration: '8h' | '1w' | 'always' | 'off'): Promise<Record<string, string>> {
    return (await api.put<Record<string, string>>('/me/mutes', { key, duration })).data;
  }
};
