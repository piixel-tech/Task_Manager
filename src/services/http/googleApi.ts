import axios from 'axios';
import { api, getErrorMessage } from '../api';
import type { Asset } from './taskApi';
import type { ChatMessage } from './chatApi';

export type DriveKind = 'document' | 'spreadsheet' | 'presentation' | 'pdf' | 'image' | 'video' | 'folder' | 'other';

/** What we keep about a Google Drive file. Only the link and these facts are stored, never the file. */
export interface DriveMeta {
  file_id: string;
  /** Google's own mime type. */
  mime: string;
  kind: DriveKind;
  icon_url: string | null;
  modified_at: string | null;
}

/** One entry of the Drive file browser. */
export interface DriveItem {
  id: string;
  name: string;
  mime: string;
  kind: DriveKind;
  is_folder: boolean;
  icon_url: string | null;
  thumbnail_url: string | null;
  modified_at: string | null;
  size: number;
  starred: boolean;
}

export interface DriveListing {
  items: DriveItem[];
  next_page_token: string | null;
}

export type DriveView = 'my' | 'shared' | 'recent' | 'starred';
export type DriveFilter = 'any' | 'document' | 'spreadsheet';

export type GoogleProblem = 'not_connected' | 'reconnect' | 'missing_scope';

/** Google is not usable for this action yet: not connected, the login stopped working, or the service was never allowed. */
export class GoogleAccessError extends Error {
  readonly code: GoogleProblem;
  readonly service: string;

  constructor(message: string, code: GoogleProblem, service: string) {
    super(message);
    this.name = 'GoogleAccessError';
    this.code = code;
    this.service = service;
  }
}

async function call<T>(fn: () => Promise<{ data: T }>, fallback: string): Promise<T> {
  try {
    return (await fn()).data;
  } catch (err) {
    if (axios.isAxiosError(err)) {
      const d = err.response?.data?.detail;
      if (d && typeof d === 'object' && typeof d.code === 'string' && typeof d.message === 'string') {
        throw new GoogleAccessError(d.message, d.code as GoogleProblem, String(d.service ?? ''));
      }
    }
    throw new Error(getErrorMessage(err, fallback));
  }
}

export const googleApi = {
  /** One page of the person's Drive for our own file browser. */
  browse: (opts: { view: DriveView; parent?: string | null; q?: string; kind?: DriveFilter; pageToken?: string | null }) =>
    call<DriveListing>(
      () =>
        api.get('/integrations/google/drive/files', {
          params: { view: opts.view, parent: opts.parent || undefined, q: opts.q || undefined, kind: opts.kind ?? 'any', page_token: opts.pageToken || undefined }
        }),
      'Could not load Google Drive'
    ),
  /** Keep the link and details of a file picked in Drive. The result is attached like any other file. */
  attachDrive: (driveId: string) =>
    call<Asset>(() => api.post('/integrations/google/drive/attach', { drive_id: driveId }), 'Could not add that Drive file'),
  /** A new empty Google Doc or Sheet in the person's Drive. */
  createFile: (kind: 'document' | 'spreadsheet', title: string) =>
    call<Asset>(() => api.post('/integrations/google/drive/create', { kind, title }), 'Could not create the file in Google Drive'),
  startMeet: (groupId: string) =>
    call<ChatMessage>(() => api.post(`/chat/groups/${groupId}/meet`), 'Could not start a Google Meet')
};

export interface SubfolderFiles {
  can_write: boolean;
  files: Asset[];
}

export const subfolderFileApi = {
  list: (subfolderId: string) =>
    call<SubfolderFiles>(() => api.get(`/subfolders/${subfolderId}/files`), 'Could not load the Google files'),
  link: (subfolderId: string, fileId: string) =>
    call<SubfolderFiles>(() => api.post(`/subfolders/${subfolderId}/files`, { file_id: fileId }), 'Could not add the file'),
  unlink: (subfolderId: string, fileId: string) =>
    call<SubfolderFiles>(() => api.delete(`/subfolders/${subfolderId}/files/${fileId}`), 'Could not remove the file')
};
