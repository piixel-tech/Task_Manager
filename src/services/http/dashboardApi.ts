import { api, getErrorMessage } from '../api';
import type { UserBrief } from './projectApi';
import type { ApprovalItem } from './chatApi';
import type { Booking } from './calendarApi';

export interface TaskCounts {
  overdue: number;
  due_today: number;
  in_review: number;
  running: number;
  open: number;
  total: number;
}

export interface ProjectHealth {
  id: string;
  name: string;
  open: number;
  overdue: number;
  in_review: number;
  changes_requested: number;
  total: number;
  progress: number;
}

export interface WorkloadRow {
  user: UserBrief;
  open: number;
  overdue: number;
}

export interface ActivityRow {
  id: string;
  kind: string;
  text: string;
  author: UserBrief | null;
  task_id: string | null;
  task_title: string | null;
  project_id: string;
  subfolder_id: string;
  created_at: string;
}

export interface AdminDashboard {
  tasks: TaskCounts;
  projects: ProjectHealth[];
  /** Oldest first, only chat groups the admin is a member of. */
  approvals: ApprovalItem[];
  workload: WorkloadRow[];
  meetings: Booking[];
  activity: ActivityRow[];
}

async function call<T>(fn: () => Promise<{ data: T }>, fallback: string): Promise<T> {
  try {
    return (await fn()).data;
  } catch (err) {
    throw new Error(getErrorMessage(err, fallback));
  }
}

export const dashboardApi = {
  admin: () => call<AdminDashboard>(() => api.get('/dashboard/admin'), 'Could not load the dashboard'),
  /** Meetings I host or booked that have not ended yet. */
  myMeetings: () => call<Booking[]>(() => api.get('/bookings/mine'), 'Could not load your meetings')
};
