import { api, getErrorMessage } from '../api';
import type { UserBrief } from './projectApi';

export type ApiTaskStatus = 'todo' | 'in_progress' | 'submitted' | 'changes_requested' | 'approved';
export type ApiPriority = 'low' | 'medium' | 'high' | 'urgent';

export interface Asset {
  id: string;
  owner_id: string;
  name: string;
  mime: string;
  size: number;
  kind: 'upload' | 'link';
  /** Uploads: a path on the API (needs auth to download). Links: the external address. */
  url: string;
  created_at: string;
}

export interface ApiTask {
  id: string;
  project_id: string;
  project_name: string;
  subfolder_id: string;
  subfolder_name: string;
  title: string;
  /** HTML from the rich editor when `description_html`, otherwise plain text. */
  description: string;
  description_html: boolean;
  /** Always plain. */
  description_text: string;
  /** The chat message it was created from (only when you are in that chat). */
  source: { group_id: string; group_name: string; message_id: string } | null;
  /** Open mid-way changes: the badge on task cards. */
  unresolved_changes: number;
  assignee: UserBrief | null;
  created_by: UserBrief | null;
  due_date: string | null;
  priority: ApiPriority;
  status: ApiTaskStatus;
  progress: number;
  assets: Asset[];
  /** Includes a session that is running right now. */
  total_seconds: number;
  timer_running: boolean;
  timer_started_at: string | null;
  created_at: string;
  can_edit: boolean;
  can_work: boolean;
  /** The submission awaiting a decision, and whether the viewer may decide it. */
  pending_review_id: string | null;
  can_review: boolean;
  review_rounds: number;
}

export interface TaskInput {
  subfolder_id: string;
  title: string;
  description: string;
  /** `description` is HTML from the rich editor. */
  html?: boolean;
  assignee_id: string;
  due_date: string | null;
  priority: ApiPriority;
  asset_ids: string[];
  /** Turn this chat message into the task (its file is attached as a copy). */
  from_message_id?: string;
}

export interface TaskFilters {
  project_id?: string;
  subfolder_id?: string;
  assignee_id?: string;
  status?: ApiTaskStatus;
  mine?: boolean;
}

async function call<T>(fn: () => Promise<{ data: T }>, fallback: string): Promise<T> {
  try {
    return (await fn()).data;
  } catch (err) {
    throw new Error(getErrorMessage(err, fallback));
  }
}

export const taskApi = {
  list: (filters: TaskFilters = {}) => call<ApiTask[]>(() => api.get('/tasks', { params: filters }), 'Could not load tasks'),
  get: (id: string) => call<ApiTask>(() => api.get(`/tasks/${id}`), 'Could not load the task'),
  create: (input: TaskInput) => call<ApiTask>(() => api.post('/tasks', input), 'Could not create the task'),
  update: (id: string, input: Partial<Omit<TaskInput, 'subfolder_id'>>) =>
    call<ApiTask>(() => api.patch(`/tasks/${id}`, input), 'Could not save the task'),
  remove: (id: string) => call<void>(() => api.delete(`/tasks/${id}`), 'Could not delete the task'),

  setProgress: (id: string, progress: number) =>
    call<ApiTask>(() => api.patch(`/tasks/${id}/progress`, { progress }), 'Could not save the progress'),
  startTimer: (id: string) =>
    call<{ task: ApiTask; stopped_task_id: string | null }>(() => api.post(`/tasks/${id}/timer/start`), 'Could not start the timer'),
  stopTimer: (id: string) => call<ApiTask>(() => api.post(`/tasks/${id}/timer/stop`), 'Could not stop the timer')
};

// --- Attachments (the shared file service) -----------------------------------------------------------
export const assetApi = {
  upload: async (files: File[]): Promise<Asset[]> => {
    const form = new FormData();
    files.forEach((f) => form.append('files', f));
    return call<Asset[]>(() => api.post('/files', form), 'Could not upload the file');
  },
  addLink: (title: string, url: string) =>
    call<Asset>(() => api.post('/files/link', { title, url }), 'Could not add the link'),
  remove: (id: string) => call<void>(() => api.delete(`/files/${id}`), 'Could not remove the attachment'),

  /** Open an attachment: links in a new tab, uploads fetched with the login token and then opened/saved. */
  open: async (asset: Asset): Promise<void> => {
    if (asset.kind === 'link') {
      window.open(asset.url, '_blank', 'noopener,noreferrer');
      return;
    }
    const { data } = await api.get<Blob>(asset.url.replace(/^\/api\/v1/, ''), { responseType: 'blob' });
    const href = URL.createObjectURL(data);
    const a = document.createElement('a');
    a.href = href;
    a.download = asset.name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(href), 10_000);
  }
};
