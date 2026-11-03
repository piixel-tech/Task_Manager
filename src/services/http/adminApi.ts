import { api, getErrorMessage } from '../api';
import type { UserBrief } from './projectApi';

async function call<T>(fn: () => Promise<{ data: T }>, fallback: string): Promise<T> {
  try {
    return (await fn()).data;
  } catch (err) {
    throw new Error(getErrorMessage(err, fallback));
  }
}

// --- Workspace ----------------------------------------------------------------------------------------
export interface Holiday {
  id: string;
  /** First day (YYYY-MM-DD). */
  date: string;
  /** Last day of a range; null for a single day. */
  end_date: string | null;
  name: string;
  type: 'national' | 'company' | 'optional';
  /** Companies it applies to; empty means every company. */
  company_ids: string[];
}

export interface Workspace {
  name: string;
  logo_url: string | null;
  work_start: string;
  work_end: string;
  holidays: Holiday[];
  /** Weekdays off every week, Monday = 0 .. Sunday = 6. */
  weekly_off: number[];
}

export const workspaceApi = {
  get: () => call<Workspace>(() => api.get('/workspace'), 'Could not load the workspace settings'),
  update: (input: { name?: string; work_start?: string; work_end?: string; logo_file_id?: string; remove_logo?: boolean; weekly_off?: number[] }) =>
    call<Workspace>(() => api.put('/workspace', input), 'Could not save the workspace settings'),
  addHoliday: (input: { dates?: string[]; ranges?: { start: string; end: string }[]; name: string; type: Holiday['type']; company_ids: string[] }) =>
    call<Workspace>(() => api.post('/workspace/holidays', input), 'Could not add the holiday'),
  editHoliday: (id: string, input: { name?: string; type?: Holiday['type']; company_ids?: string[]; date?: string; end_date?: string }) =>
    call<Workspace>(() => api.patch(`/workspace/holidays/${id}`, input), 'Could not save the holiday'),
  removeHoliday: (id: string) => call<Workspace>(() => api.delete(`/workspace/holidays/${id}`), 'Could not remove the holiday')
};

// --- Companies -------------------------------------------------------------------------------------------
export interface CompanyRow {
  id: string;
  name: string;
}

export const companyApi = {
  list: () => call<CompanyRow[]>(() => api.get('/companies'), 'Could not load companies'),
  create: (name: string) => call<CompanyRow>(() => api.post('/companies', { name }), 'Could not add the company'),
  rename: (id: string, name: string) => call<CompanyRow>(() => api.patch(`/companies/${id}`, { name }), 'Could not rename the company'),
  remove: (id: string) => call<void>(() => api.delete(`/companies/${id}`), 'Could not delete the company')
};

// --- Security ---------------------------------------------------------------------------------------------
export interface SessionRow {
  id: string;
  user: UserBrief | null;
  user_agent: string;
  ip: string;
  created_at: string;
  last_seen_at: string;
}

export const securityApi = {
  sessions: (userId?: string) => call<SessionRow[]>(() => api.get('/security/sessions', { params: { user_id: userId } }), 'Could not load sign-ins'),
  signOut: (sessionId: string) => call<{ signed_out: number }>(() => api.delete(`/security/sessions/${sessionId}`), 'Could not end that sign-in'),
  signOutEverywhere: (userId: string) =>
    call<{ signed_out: number }>(() => api.post(`/security/users/${userId}/logout`), 'Could not sign that person out')
};

// --- Trash --------------------------------------------------------------------------------------------------
export type TrashKind = 'task' | 'subfolder' | 'project' | 'message';

export interface TrashRow {
  id: string;
  kind: TrashKind;
  title: string;
  context: string;
  deleted_by: UserBrief | null;
  deleted_at: string;
  expires_at: string;
  days_left: number;
}

export const trashApi = {
  list: (kind?: TrashKind) => call<{ items: TrashRow[]; total: number }>(() => api.get('/trash', { params: { kind, limit: 100 } }), 'Could not load the trash'),
  restore: (id: string) => call<{ restored: TrashKind }>(() => api.post(`/trash/${id}/restore`), 'Could not restore that'),
  deleteForever: (id: string) => call<void>(() => api.delete(`/trash/${id}`), 'Could not delete that')
};

// --- Export -----------------------------------------------------------------------------------------------------
export type ExportKind = 'tasks' | 'status' | 'deliverables';

/** Fetch a CSV (with the login token) and hand it to the browser as a download. */
export async function downloadExport(
  kind: ExportKind,
  params: Record<string, string | undefined>,
  onProgress?: (percent: number | null) => void
): Promise<void> {
  try {
    const clean = Object.fromEntries(Object.entries(params).filter(([, v]) => v));
    const res = await api.get<Blob>(`/export/${kind}.csv`, {
      params: clean,
      responseType: 'blob',
      onDownloadProgress: onProgress ? (e) => onProgress(e.total ? (100 * e.loaded) / e.total : null) : undefined
    });
    const name = /filename="?([^";]+)"?/.exec(res.headers['content-disposition'] ?? '')?.[1] ?? `${kind}.csv`;
    const href = URL.createObjectURL(res.data);
    const a = document.createElement('a');
    a.href = href;
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(href), 10_000);
  } catch (err) {
    // An error body arrives as a blob, so it has to be read as text before it can be shown.
    const data = (err as { response?: { data?: unknown } }).response?.data;
    let detail: string | undefined;
    if (data instanceof Blob) {
      try {
        detail = JSON.parse(await data.text()).detail;
      } catch {
        /* not JSON: fall back to the generic message */
      }
    }
    throw new Error(detail ?? getErrorMessage(err, 'Could not export'));
  }
}
