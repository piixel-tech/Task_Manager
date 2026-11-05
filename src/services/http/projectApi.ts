import { api, getErrorMessage } from '../api';

export interface UserBrief {
  id: string;
  name: string;
  avatar_url: string | null;
  role: string;
  company_id: string | null;
  /** Set while they are in Focus mode (ISO time they are quiet until). */
  focus_until?: string | null;
}

/** Who beyond its own members can see a subfolder: nobody, everyone in the project's company (read only), or everyone there (as members). */
export type Visibility = 'private' | 'view_only' | 'open';

export interface Subfolder {
  id: string;
  project_id: string;
  name: string;
  heads: UserBrief[];
  /** Includes the heads. */
  members: UserBrief[];
  created_by: string;
  created_at: string;
  /** Only heads of this subfolder (and admins) can edit it. */
  can_edit: boolean;
  viewer_is_head: boolean;
  visibility: Visibility;
  /** Admins and the heads of this subfolder. */
  can_set_visibility: boolean;
  /** False when the person can only read it (view only). */
  can_work: boolean;
}

export interface Project {
  id: string;
  name: string;
  company_id: string;
  /** Every company the project belongs to (the main one first). */
  company_ids: string[];
  /** YYYY-MM-DD, optional. */
  start_date: string | null;
  /** Short description, up to 200 characters. */
  description: string;
  client_ids: string[];
  created_by: string;
  created_at: string;
  subfolder_count: number;
  can_edit: boolean;
  can_create_subfolder: boolean;
}

export interface ProjectDetail extends Project {
  clients: UserBrief[];
  subfolders: Subfolder[];
}

export interface SubfolderInput {
  name: string;
  head_ids: string[];
  member_ids: string[];
}

export interface ProjectInput {
  name: string;
  company_id: string;
  company_ids?: string[];
  start_date?: string | null;
  description?: string;
  client_ids: string[];
  first_subfolder: SubfolderInput;
}

async function call<T>(fn: () => Promise<{ data: T }>, fallback: string): Promise<T> {
  try {
    return (await fn()).data;
  } catch (err) {
    throw new Error(getErrorMessage(err, fallback));
  }
}

export const projectApi = {
  list: () => call<Project[]>(() => api.get('/projects'), 'Could not load projects'),
  get: (id: string) => call<ProjectDetail>(() => api.get(`/projects/${id}`), 'Could not load the project'),
  create: (input: ProjectInput) =>
    call<ProjectDetail>(() => api.post('/projects', input), 'Could not create the project'),
  update: (id: string, input: Partial<Pick<ProjectInput, 'name' | 'company_id' | 'company_ids' | 'start_date' | 'description' | 'client_ids'>>) =>
    call<ProjectDetail>(() => api.patch(`/projects/${id}`, input), 'Could not save the project'),
  remove: (id: string) => call<void>(() => api.delete(`/projects/${id}`), 'Could not delete the project'),

  createSubfolder: (projectId: string, input: SubfolderInput) =>
    call<Subfolder>(() => api.post(`/projects/${projectId}/subfolders`, input), 'Could not create the subfolder'),
  getSubfolder: (id: string) => call<Subfolder>(() => api.get(`/subfolders/${id}`), 'Could not load the subfolder'),
  updateSubfolder: (id: string, input: Partial<SubfolderInput>) =>
    call<Subfolder>(() => api.patch(`/subfolders/${id}`, input), 'Could not save the subfolder'),

  setVisibility: (id: string, visibility: Visibility) =>
    call<Subfolder>(() => api.patch(`/subfolders/${id}/visibility`, { visibility }), 'Could not change who can see the subfolder'),

  deleteSubfolder: (id: string) => call<void>(() => api.delete(`/subfolders/${id}`), 'Could not delete the subfolder'),

  /** Active team members, for the head / member pickers. */
  directory: () => call<UserBrief[]>(() => api.get('/users/directory'), 'Could not load the team')
};
