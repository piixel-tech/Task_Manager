import { api, getErrorMessage } from '../api';
import type { UserBrief } from './projectApi';
import type { Asset } from './taskApi';

export type ActivityKind = 'change_request' | 'comment' | 'log';

export interface ActivityEntry {
  id: string;
  task_id: string | null;
  subfolder_id: string;
  kind: ActivityKind;
  /** HTML for mid-way changes and comments; plain text for log lines. */
  body: string;
  text: string;
  files: Asset[];
  author: UserBrief | null;
  mentions: string[];
  assigned_to: UserBrief | null;
  resolved: boolean;
  resolved_by: UserBrief | null;
  resolved_at: string | null;
  reactions: { emoji: string; user_ids: string[] }[];
  /** Replies point at their top-level entry. */
  parent_id: string | null;
  created_at: string;
  can_resolve: boolean;
  can_delete: boolean;
}

export interface ActivityList {
  items: ActivityEntry[];
  unresolved: number;
}

export interface ActivityInput {
  kind: 'change_request' | 'comment';
  body: string;
  file_ids: string[];
  parent_id?: string;
  assigned_to?: string;
}

async function call<T>(fn: () => Promise<{ data: T }>, fallback: string): Promise<T> {
  try {
    return (await fn()).data;
  } catch (err) {
    throw new Error(getErrorMessage(err, fallback));
  }
}

export const activityApi = {
  task: (taskId: string) => call<ActivityList>(() => api.get(`/tasks/${taskId}/activity`), 'Could not load the activity'),
  postTask: (taskId: string, input: ActivityInput) =>
    call<ActivityEntry>(() => api.post(`/tasks/${taskId}/activity`, input), 'Could not post that'),
  subfolder: (subfolderId: string) => call<ActivityList>(() => api.get(`/subfolders/${subfolderId}/changes`), 'Could not load the mid-way changes'),
  postSubfolder: (subfolderId: string, input: ActivityInput) =>
    call<ActivityEntry>(() => api.post(`/subfolders/${subfolderId}/changes`, input), 'Could not post that'),
  resolve: (id: string, resolved: boolean) =>
    call<ActivityEntry>(() => api.put(`/activity/${id}/resolved`, { resolved }), 'Could not update that'),
  react: (id: string, emoji: string) => call<ActivityEntry>(() => api.put(`/activity/${id}/reactions`, { emoji }), 'Could not react'),
  remove: (id: string) => call<void>(() => api.delete(`/activity/${id}`), 'Could not delete that')
};
