import { api, getErrorMessage } from '../api';
import type { UserBrief } from './projectApi';
import type { Asset } from './taskApi';

/** An attachment on a checklist item; `owner` is whoever attached it. */
export interface ChecklistFile extends Asset {
  owner: UserBrief | null;
}

export interface ChecklistItem {
  id: string;
  subfolder_id: string;
  text: string;
  created_by: UserBrief | null;
  created_at: string;
  /** Set once the text has been edited. */
  updated_at: string | null;
  attachments: ChecklistFile[];
  /** Only the person who added it. */
  can_edit: boolean;
  can_delete: boolean;
}

export interface Checklist {
  can_write: boolean;
  can_manage: boolean;
  items: ChecklistItem[];
}

async function call<T>(fn: () => Promise<{ data: T }>, fallback: string): Promise<T> {
  try {
    return (await fn()).data;
  } catch (err) {
    throw new Error(getErrorMessage(err, fallback));
  }
}

export const checklistApi = {
  list: (subfolderId: string) =>
    call<Checklist>(() => api.get(`/subfolders/${subfolderId}/checklist`), 'Could not load the checklist'),
  add: (subfolderId: string, text: string, attachment_ids: string[]) =>
    call<ChecklistItem>(() => api.post(`/subfolders/${subfolderId}/checklist`, { text, attachment_ids }), 'Could not add the item'),
  edit: (id: string, text: string) =>
    call<ChecklistItem>(() => api.patch(`/checklist/${id}`, { text }), 'Could not update the item'),
  attach: (id: string, file_ids: string[]) =>
    call<ChecklistItem>(() => api.post(`/checklist/${id}/attachments`, { file_ids }), 'Could not attach the files'),
  detach: (id: string, fileId: string) =>
    call<ChecklistItem>(() => api.delete(`/checklist/${id}/attachments/${fileId}`), 'Could not remove the attachment'),
  remove: (id: string) => call<void>(() => api.delete(`/checklist/${id}`), 'Could not delete the item')
};
