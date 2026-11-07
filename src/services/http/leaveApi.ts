import { api, getErrorMessage } from '../api';
import type { UserBrief } from './projectApi';

export type LeaveType = 'leave' | 'wfh';
export type LeaveDuration = 'full' | 'first_half' | 'second_half';
export type LeaveStatus = 'pending' | 'approved' | 'rejected';

export interface LeaveRequest {
  id: string;
  user: UserBrief;
  company_id: string;
  company_name: string;
  type: LeaveType;
  /** YYYY-MM-DD */
  start_date: string;
  /** YYYY-MM-DD, never before start_date. */
  end_date: string;
  /** A half day only when start_date === end_date. */
  duration: LeaveDuration;
  reason: string;
  /** The admin it was sent to. */
  admin: UserBrief;
  status: LeaveStatus;
  reject_reason: string | null;
  created_at: string;
  decided_at: string | null;
  decided_by: UserBrief | null;
}

export interface LeaveRequestInput {
  type: LeaveType;
  start_date: string;
  end_date: string;
  duration: LeaveDuration;
  reason: string;
  admin_id: string;
}

async function call<T>(fn: () => Promise<{ data: T }>, fallback: string): Promise<T> {
  try {
    return (await fn()).data;
  } catch (err) {
    throw new Error(getErrorMessage(err, fallback));
  }
}

export const leaveApi = {
  /** The active admins of my own company: the "send to" choices. */
  admins: () => call<UserBrief[]>(() => api.get('/leave-requests/admins'), 'Could not load the admins'),
  create: (input: LeaveRequestInput) => call<LeaveRequest>(() => api.post('/leave-requests', input), 'Could not send the request'),
  /** My requests, newest first. */
  mine: () => call<LeaveRequest[]>(() => api.get('/leave-requests/mine'), 'Could not load your requests'),
  /** Admin: the requests sent to me, newest first. */
  inbox: (filter: { status?: LeaveStatus; companyId?: string } = {}) =>
    call<LeaveRequest[]>(
      () => api.get('/leave-requests', { params: { status: filter.status, company_id: filter.companyId } }),
      'Could not load the leave requests'
    ),
  /** Admin: only the admin it was sent to, only while pending. */
  approve: (id: string) => call<LeaveRequest>(() => api.post(`/leave-requests/${id}/approve`), 'Could not approve the request'),
  /** Admin: the reason is required and goes to the employee. */
  reject: (id: string, reason: string) => call<LeaveRequest>(() => api.post(`/leave-requests/${id}/reject`, { reason }), 'Could not reject the request'),
  /** Only while it is pending. */
  cancel: async (id: string): Promise<void> => {
    await call(() => api.delete(`/leave-requests/${id}`), 'Could not cancel the request');
  }
};
