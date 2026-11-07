import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { addDays } from 'date-fns';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { companyApi } from '../../../services/http/adminApi';
import { leaveApi, type LeaveRequest } from '../../../services/http/leaveApi';
import type { UserBrief } from '../../../services/http/projectApi';
import { socket } from '../../../services/socket';
import { useLeaveInboxStore } from '../../../store/useLeaveInboxStore';
import { iso } from '../leaveUtils';
import { AdminLeaveRequestsPage } from './AdminLeaveRequestsPage';
import { LeaveRequestsCard } from './LeaveRequestsCard';
import { LeaveReviewList } from './LeaveReviewList';

vi.mock('../../../hooks/useConfirm', () => ({
  useConfirm: () => async (o: { action: () => Promise<void> }) => {
    await o.action();
    return true;
  }
}));

const admin: UserBrief = { id: 'a1', name: 'Ada Admin', avatar_url: null, role: 'admin', company_id: 'c1' };
const eva: UserBrief = { id: 'e1', name: 'Eva Employee', avatar_url: null, role: 'employee', company_id: 'c1' };
const req = (over: Partial<LeaveRequest> = {}): LeaveRequest => ({
  id: 'r1', user: eva, company_id: 'c1', company_name: 'Piixel', type: 'leave', start_date: iso(addDays(new Date(), 3)), end_date: iso(addDays(new Date(), 3)),
  duration: 'first_half', reason: 'Family event', admin, status: 'pending', reject_reason: null, created_at: new Date().toISOString(), decided_at: null, decided_by: null, ...over
});

/** Catches what the app registers on the socket, so a test can send the event itself. */
const handlers: Record<string, (data: unknown) => void> = {};

beforeEach(() => {
  useLeaveInboxStore.setState({ pending: [], loaded: false, error: null });
  vi.spyOn(socket, 'on').mockImplementation((event: string, handler: (d: unknown) => void) => {
    handlers[event] = handler;
    return () => undefined;
  });
  vi.spyOn(companyApi, 'list').mockResolvedValue([{ id: 'c1', name: 'Piixel' }, { id: 'c2', name: 'Unwork' }]);
});
afterEach(cleanup);

describe('a request row', () => {
  it('shows who, what, when, why and when it was sent, with Approve and Reject', () => {
    render(<LeaveReviewList requests={[req()]} onChanged={() => undefined} />);
    expect(screen.getByText('Eva Employee')).toBeTruthy();
    expect(screen.getByText('Piixel')).toBeTruthy();
    expect(screen.getByText(/Leave/)).toBeTruthy();
    expect(screen.getByText(/First half/)).toBeTruthy();
    expect(screen.getByText('Family event')).toBeTruthy();
    expect(screen.getByText(/Sent .*ago/)).toBeTruthy();
    expect(screen.getByRole('button', { name: /Approve Eva/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Reject Eva/ })).toBeTruthy();
  });

  it('approving confirms, calls the API and refreshes', async () => {
    const approve = vi.spyOn(leaveApi, 'approve').mockResolvedValue(req({ status: 'approved' }));
    const onChanged = vi.fn();
    render(<LeaveReviewList requests={[req()]} onChanged={onChanged} />);
    fireEvent.click(screen.getByRole('button', { name: /Approve Eva/ }));
    await waitFor(() => expect(approve).toHaveBeenCalledWith('r1'));
    await waitFor(() => expect(onChanged).toHaveBeenCalled());
  });

  it('rejecting asks "Why are you rejecting this?" and needs a reason', async () => {
    const reject = vi.spyOn(leaveApi, 'reject').mockResolvedValue(req({ status: 'rejected' }));
    const onChanged = vi.fn();
    render(<LeaveReviewList requests={[req()]} onChanged={onChanged} />);
    fireEvent.click(screen.getByRole('button', { name: /Reject Eva/ }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('Why are you rejecting this?')).toBeTruthy();
    fireEvent.change(within(dialog).getByLabelText('Reason'), { target: { value: '   ' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Reject' }));
    expect(await within(dialog).findByRole('alert')).toBeTruthy();
    expect(reject).not.toHaveBeenCalled();
    fireEvent.change(within(dialog).getByLabelText('Reason'), { target: { value: 'Release week' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Reject' }));
    await waitFor(() => expect(reject).toHaveBeenCalledWith('r1', 'Release week'));
    await waitFor(() => expect(onChanged).toHaveBeenCalled());
  });

  it('decided requests show who decided and the reason, and have no buttons', () => {
    const decided = { decided_at: new Date().toISOString(), decided_by: admin };
    render(<LeaveReviewList requests={[req({ id: 'x', status: 'rejected', reject_reason: 'Release week', ...decided })]} onChanged={() => undefined} />);
    expect(screen.getByText('Rejected')).toBeTruthy();
    expect(screen.getByText('Release week')).toBeTruthy();
    expect(screen.getByText(/Rejected by Ada Admin/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Approve/ })).toBeNull();
  });
});

describe('the dashboard card', () => {
  const card = () =>
    render(
      <MemoryRouter>
        <LeaveRequestsCard />
      </MemoryRouter>
    );

  it('lists what is waiting, and says so when nothing is', async () => {
    vi.spyOn(leaveApi, 'inbox').mockResolvedValue([req()]);
    card();
    expect(await screen.findByText('Eva Employee')).toBeTruthy();
    expect(screen.getByText('Leave requests')).toBeTruthy();
    cleanup();
    useLeaveInboxStore.setState({ pending: [], loaded: false });
    vi.spyOn(leaveApi, 'inbox').mockResolvedValue([]);
    card();
    expect(await screen.findByText(/No leave or work-from-home requests are waiting/)).toBeTruthy();
  });

  it('updates live: a new request appears, and one that was dealt with disappears', async () => {
    const inbox = vi.spyOn(leaveApi, 'inbox').mockResolvedValue([]);
    card();
    await screen.findByText(/No leave or work-from-home requests/);
    inbox.mockResolvedValue([req({ id: 'n1' })]);
    await act(async () => handlers['leave_requests']?.({ id: 'n1', state: 'created' }));
    expect(await screen.findByText('Eva Employee')).toBeTruthy();
    inbox.mockResolvedValue([]);
    await act(async () => handlers['leave_requests']?.({ id: 'n1', state: 'cancelled' }));
    expect(await screen.findByText(/No leave or work-from-home requests/)).toBeTruthy();
  });
});

describe('the full page', () => {
  const page = () =>
    render(
      <MemoryRouter>
        <AdminLeaveRequestsPage />
      </MemoryRouter>
    );

  it('has Pending / Approved / Rejected tabs and loads each one', async () => {
    const inbox = vi.spyOn(leaveApi, 'inbox').mockImplementation(async (f) => (f?.status === 'approved' ? [req({ id: 'a', status: 'approved', decided_by: admin, decided_at: new Date().toISOString() })] : [req()]));
    page();
    expect(await screen.findByText('Eva Employee')).toBeTruthy();
    expect(inbox).toHaveBeenCalledWith({ status: 'pending', companyId: undefined });
    fireEvent.click(screen.getByRole('tab', { name: /Approved/ }));
    await waitFor(() => expect(inbox).toHaveBeenCalledWith({ status: 'approved', companyId: undefined }));
    expect(await screen.findByText(/Approved by Ada Admin/)).toBeTruthy();
    fireEvent.click(screen.getByRole('tab', { name: /Rejected/ }));
    await waitFor(() => expect(inbox).toHaveBeenCalledWith({ status: 'rejected', companyId: undefined }));
  });

  it('filters by company', async () => {
    const inbox = vi.spyOn(leaveApi, 'inbox').mockResolvedValue([]);
    page();
    await screen.findByText('No requests are waiting for you.');
    await screen.findByRole('option', { name: 'Unwork' });
    fireEvent.change(screen.getByLabelText('Company'), { target: { value: 'c2' } });
    await waitFor(() => expect(inbox).toHaveBeenCalledWith({ status: 'pending', companyId: 'c2' }));
  });

  it('a request leaves Pending right after it is approved', async () => {
    let waiting = [req()];
    vi.spyOn(leaveApi, 'inbox').mockImplementation(async () => waiting);
    vi.spyOn(leaveApi, 'approve').mockImplementation(async () => {
      waiting = [];
      return req({ status: 'approved' });
    });
    page();
    await screen.findByText('Eva Employee');
    fireEvent.click(screen.getByRole('button', { name: /Approve Eva/ }));
    await waitFor(() => expect(screen.queryByText('Eva Employee')).toBeNull());
    expect(screen.getByText('No requests are waiting for you.')).toBeTruthy();
  });
});
