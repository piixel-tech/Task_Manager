import { api, getErrorMessage } from '../api';
import type { Visibility } from './projectApi';

export interface SubfolderNode {
  id: string;
  name: string;
  /** Tasks assigned to me that are still open. */
  open_tasks: number;
  is_head: boolean;
  can_add_task: boolean;
  can_add_checklist: boolean;
  can_edit_deliverables: boolean;
  can_chat: boolean;
  can_rename: boolean;
  can_delete: boolean;
  visibility: Visibility;
  /** False when the person can only read it (view only). */
  can_work: boolean;
}

export interface ProjectNode {
  id: string;
  name: string;
  open_tasks: number;
  can_rename: boolean;
  can_delete: boolean;
  can_add_subfolder: boolean;
  can_add_requirement: boolean;
  subfolders: SubfolderNode[];
}

export interface SidebarTree {
  projects: ProjectNode[];
  can_create_project: boolean;
}

export interface SidebarState {
  /** Ids of expanded nodes: "projects", "p:<id>". */
  open: string[];
  /** Parent id -> children ids in the order this person arranged. */
  order: Record<string, string[]>;
}

async function call<T>(fn: () => Promise<{ data: T }>, fallback: string): Promise<T> {
  try {
    return (await fn()).data;
  } catch (err) {
    throw new Error(getErrorMessage(err, fallback));
  }
}

export const sidebarApi = {
  tree: () => call<SidebarTree>(() => api.get('/sidebar/tree'), 'Could not load the sidebar'),
  saveState: (state: SidebarState) => call<SidebarState>(() => api.put('/sidebar/state', state), 'Could not save the sidebar layout')
};
