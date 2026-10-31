import { api, getErrorMessage } from '../api';
import type { UserBrief } from './projectApi';
import type { ApprovalItem } from './chatApi';
import type { Deliverables } from './deliverableApi';
import type { Requirement } from './requirementApi';

export interface Ref {
  id: string;
  name: string;
}

export interface PortalProject {
  id: string;
  name: string;
  company_id: string;
  subfolders: Ref[];
  /** The team a client can book meetings with. */
  team: { user: UserBrief; is_head: boolean }[];
}

export interface PortalSummary {
  month: string;
  pending_approvals: number;
  approvals: ApprovalItem[];
  deliverables: { total: number; done: number; remaining: number; progress: number };
  latest_requirements: Requirement[];
  /** Deliverables per stage across all of the client's projects. */
  stages: Record<string, number>;
  projects: { id: string; name: string; total: number; done: number; progress: number }[];
}

export interface PortalDeliverables {
  project: Ref;
  subfolder: Ref;
  deliverables: Deliverables;
}

export interface Slot {
  start: string;
  end: string;
}

export interface Availability {
  host_user_id: string;
  date: string;
  minutes: number;
  slots: Slot[];
  /** Why there are no slots, when that is the case. */
  note: string | null;
}

async function call<T>(fn: () => Promise<{ data: T }>, fallback: string): Promise<T> {
  try {
    return (await fn()).data;
  } catch (err) {
    throw new Error(getErrorMessage(err, fallback));
  }
}

export const portalApi = {
  projects: () => call<PortalProject[]>(() => api.get('/portal/projects'), 'Could not load your projects'),
  summary: () => call<PortalSummary>(() => api.get('/portal/summary'), 'Could not load your summary'),
  deliverables: (month: string) =>
    call<PortalDeliverables[]>(() => api.get('/portal/deliverables', { params: { month } }), 'Could not load the deliverables'),
  availability: (hostUserId: string, date: string, minutes: number) =>
    call<Availability>(
      () => api.get('/bookings/availability', { params: { host_user_id: hostUserId, date, minutes } }),
      'Could not load free times'
    )
};
