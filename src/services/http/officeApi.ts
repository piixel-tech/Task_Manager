import { api, getErrorMessage } from '../api';
import type { UserBrief } from './projectApi';
import type { Asset } from './taskApi';

export type OfficeCategory = 'pantry' | 'electricity' | 'facilities' | 'it' | 'general';
export type OfficeStatus = 'open' | 'resolved' | 'all';

export interface OfficeReaction {
  emoji: string;
  count: number;
  mine: boolean;
  users: UserBrief[];
}

export interface OfficePost {
  id: string;
  author: UserBrief | null;
  text: string;
  category: OfficeCategory;
  category_label: string;
  emoji: string;
  photo: Asset | null;
  reactions: OfficeReaction[];
  seen_by: UserBrief[];
  seen_count: number;
  /** Not yours and you haven't viewed it yet. */
  is_new: boolean;
  resolved: boolean;
  resolved_by: UserBrief | null;
  resolved_at: string | null;
  /** The author or an admin. */
  can_resolve: boolean;
  created_at: string;
}

export interface OfficeList {
  total: number;
  unseen_count: number;
  items: OfficePost[];
}

export interface OfficeSummary {
  unseen_count: number;
  open_count: number;
  latest: OfficePost[];
}

export interface OfficeQuery {
  status: OfficeStatus;
  category: OfficeCategory | null;
  q: string;
  skip?: number;
  limit?: number;
}

async function call<T>(fn: () => Promise<{ data: T }>, fallback: string): Promise<T> {
  try {
    return (await fn()).data;
  } catch (err) {
    throw new Error(getErrorMessage(err, fallback));
  }
}

export const officeApi = {
  list: ({ status, category, q, skip = 0, limit = 20 }: OfficeQuery) =>
    call<OfficeList>(
      () => api.get('/office/posts', { params: { status, category: category ?? undefined, q: q.trim() || undefined, skip, limit } }),
      'Could not load the office board'
    ),
  summary: () => call<OfficeSummary>(() => api.get('/office/summary'), 'Could not load the office board'),
  create: (text: string, category: OfficeCategory, photoId: string | null) =>
    call<OfficePost>(() => api.post('/office/posts', { text, category, photo_id: photoId }), 'Could not post'),
  markSeen: (ids: string[]) => call<{ unseen_count: number }>(() => api.post('/office/seen', { ids }), 'Could not mark as seen'),
  react: (id: string, emoji: string) =>
    call<OfficePost>(() => api.put(`/office/posts/${id}/reactions`, { emoji }), 'Could not react'),
  setResolved: (id: string, resolved: boolean) =>
    call<OfficePost>(() => api.patch(`/office/posts/${id}`, { resolved }), 'Could not update the post')
};
