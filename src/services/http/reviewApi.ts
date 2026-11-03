import { api, getErrorMessage } from '../api';
import { runJob } from '../jobs';
import type { UserBrief } from './projectApi';
import type { Asset } from './taskApi';

export type ReviewDecision = 'pending' | 'approved' | 'changes_requested';

/** One submission round of a task. */
export interface Review {
  id: string;
  task_id: string;
  task_title: string;
  project_id: string | null;
  project_name: string;
  subfolder_name: string;
  round: number;
  submitted_by: UserBrief | null;
  approver: UserBrief | null;
  note: string;
  files: Asset[];
  decision: ReviewDecision;
  comments: string | null;
  decided_by: UserBrief | null;
  decided_at: string | null;
  created_at: string;
  /** Pending, and the viewer is the picked approver (or an admin). */
  can_decide: boolean;
}

export interface SubmitInput {
  note: string;
  approver_id: string;
  file_ids: string[];
}

async function call<T>(fn: () => Promise<{ data: T }>, fallback: string): Promise<T> {
  try {
    return (await fn()).data;
  } catch (err) {
    throw new Error(getErrorMessage(err, fallback));
  }
}

/** Tells the nav badges to recount after this person decides a review. */
const changed = <T,>(p: Promise<T>) => p.then((r) => (window.dispatchEvent(new Event('tm:nav-counts')), r));

export const reviewApi = {
  approvers: (taskId: string) =>
    call<UserBrief[]>(() => api.get(`/tasks/${taskId}/approvers`), 'Could not load the approvers'),
  submit: (taskId: string, input: SubmitInput) =>
    runJob({ title: 'Submitting task', run: () => call<Review>(() => api.post(`/tasks/${taskId}/submit`, input), 'Could not submit the task') }),
  rounds: (taskId: string) => call<Review[]>(() => api.get(`/tasks/${taskId}/reviews`), 'Could not load the review history'),

  list: (decision?: ReviewDecision) =>
    call<Review[]>(() => api.get('/reviews', { params: { decision } }), 'Could not load reviews'),
  pendingCount: async () => (await call<{ count: number }>(() => api.get('/reviews/pending-count'), 'Could not load')).count,
  approve: (id: string, comments?: string) =>
    changed(call<Review>(() => api.post(`/reviews/${id}/approve`, { comments: comments || null }), 'Could not approve the task')),
  requestChanges: (id: string, comments: string) =>
    changed(call<Review>(() => api.post(`/reviews/${id}/request-changes`, { comments }), 'Could not request changes'))
};
