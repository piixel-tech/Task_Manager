import { api, getErrorMessage } from '../api';
import type { UserBrief } from './projectApi';
import type { Asset } from './taskApi';

export type RequirementBadge = 'client' | 'head' | 'admin' | 'member';

export interface SubfolderTag {
  id: string;
  name: string;
}

export interface Requirement {
  id: string;
  project_id: string;
  subfolder: SubfolderTag | null;
  title: string;
  details: string;
  attachments: Asset[];
  author: UserBrief | null;
  author_badge: RequirementBadge;
  created_at: string;
  updated_at: string;
  /** Has earlier versions. */
  edited: boolean;
  version_count: number;
  /** The author. */
  can_edit: boolean;
  /** Admins. */
  can_delete: boolean;
}

export interface RequirementVersion {
  /** 1 = the original. */
  number: number;
  current: boolean;
  title: string;
  details: string;
  attachments: Asset[];
  subfolder: SubfolderTag | null;
  edited_by: UserBrief | null;
  edited_at: string;
}

export interface RequirementDetail extends Requirement {
  /** Newest first, the current version on top. */
  versions: RequirementVersion[];
}

export interface RequirementList {
  total: number;
  can_add: boolean;
  items: Requirement[];
}

export interface RequirementInput {
  title: string;
  details: string;
  attachment_ids: string[];
  subfolder_id: string | null;
}

async function call<T>(fn: () => Promise<{ data: T }>, fallback: string): Promise<T> {
  try {
    return (await fn()).data;
  } catch (err) {
    throw new Error(getErrorMessage(err, fallback));
  }
}

export const requirementApi = {
  list: (projectId: string, params: { q?: string; subfolder_id?: string; skip?: number; limit?: number }) =>
    call<RequirementList>(
      () => api.get(`/projects/${projectId}/requirements`, { params: { ...params, q: params.q?.trim() || undefined, subfolder_id: params.subfolder_id || undefined } }),
      'Could not load the requirements'
    ),
  get: (id: string) => call<RequirementDetail>(() => api.get(`/requirements/${id}`), 'Could not load the requirement'),
  add: (projectId: string, input: RequirementInput) =>
    call<RequirementDetail>(() => api.post(`/projects/${projectId}/requirements`, input), 'Could not add the requirement'),
  edit: (id: string, input: Partial<RequirementInput>) =>
    call<RequirementDetail>(() => api.patch(`/requirements/${id}`, input), 'Could not save the requirement'),
  remove: (id: string) => call<void>(() => api.delete(`/requirements/${id}`), 'Could not delete the requirement')
};
