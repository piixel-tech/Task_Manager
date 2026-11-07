import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { addDays } from 'date-fns';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useAuthStore } from '../../store/authStore';
import { leaveApi, type LeaveRequest } from '../../services/http/leaveApi';
import type { UserBrief } from '../../services/http/projectApi';
import { LeaveCalendar } from './components/LeaveCalendar';
import { LeaveDecisionHost, unseenDecisions } from './components/LeaveDecisionHost';
import { MyLeaveRequests } from './components/MyLeaveRequests';
import { LeaveRequestsPage } from './pages/LeaveRequestsPage';
import { datesText, isTaken, iso, marksByDay, nextSelection, type Selection } from './leaveUtils';

vi.mock('../../hooks/useConfirm', () => ({
  useConfirm: () => async (o: { action: () => Promise<void> }) => {
    await o.action();
    return true;
  }
}));

afterEach(() => {
  cleanup();
  localStorage.clear();
});

const admin: UserBrief = { id: 'a1', name: 'Ada Admin', avatar_url: null, role: 'admin', company_id: 'c1' };
const me: UserBrief = { id: 'e1', name: 'Eva Employee', avatar_url: null, role: 'employee', company_id: 'c1' };
const day = (n: number) => iso(addDays(new Date(), n));

const req = (over: Partial<LeaveRequest> = {}): LeaveRequest => ({
  id: 'r1', user: me, company_id: 'c1', company_name: 'Piixel', type: 'leave', start_date: day(3), end_date: day(3), duration: 'full', reason: 'Family event',
  admin, status: 'pending', reject_reason: null, created_at: new Date().toISOString(), decided_at: null, decided_by: null, ...over
});

describe('picking days', () => {
  it('click start, click end, click again to start over; an earlier day becomes the new start', () => {
    let s: Selection = { start: null, end: null };
    s = nextSelection(s, '2026-11-20');
    expect(s).toEqual({ start: '2026-11-20', end: null });
    expect(nextSelection(s, '2026-11-22')).toEqual({ start: '2026-11-20', end: '2026-11-22' });
    expect(nextSelection(s, '2026-11-18')).toEqual({ start: '2026-11-18', end: null });
    expect(nextSelection({ start: '2026-11-20', end: '2026-11-22' }, '2026-11-25')).toEqual({ start: '2026-11-25', end: null });
  });

  it('a day is taken when a full day is asked for, or both halves are', () => {
    const m = (duration: LeaveRequest['duration']) => marksByDay([req({ duration })]).get(day(3));
    expect(isTaken(m('full'))).toBe(true);
    expect(isTaken(m('first_half'))).toBe(false); // the other half is still free
    expect(isTaken(marksByDay([req({ duration: 'first_half' }), req({ id: 'r2', duration: 'second_half' })]).get(day(3)))).toBe(true);
    expect(marksByDay([req({ status: 'rejected' })]).size).toBe(0); // a rejected request frees its days
  });

  it('writes dates in short words', () => {
    expect(datesText({ start_date: '2026-11-20', end_date: '2026-11-20', duration: 'full' })).toBe('20 Nov');
    expect(datesText({ start_date: '2026-11-20', end_date: '2026-11-20', duration: 'first_half' })).toBe('20 Nov · First half');
    expect(datesText({ start_date: '2026-11-20', end_date: '2026-11-22', duration: 'full' })).toBe('20 Nov – 22 Nov');
  });
});

describe('the calendar', () => {
  const cell = (container: HTMLElement, d: string) => container.querySelector(`[data-day="${d}"]`) as HTMLButtonElement | null;

  it('highlights the range, disables past days and shows pending and approved days', () => {
    const onChange = vi.fn();
    // far enough ahead that all of these days are in the visible month, whatever today is
    const { container } = render(
      <LeaveCalendar
        requests={[req({ start_date: day(2), end_date: day(2), status: 'approved' }), req({ id: 'r2', start_date: day(4), end_date: day(4) })]}
        value={{ start: day(0), end: day(1) }}
        onChange={onChange}
      />
    );
    const today = cell(container, day(0));
    if (today) expect(today.getAttribute('data-selected')).toBe('true');
    const past = cell(container, day(-1));
    if (past) expect((past as HTMLButtonElement).disabled).toBe(true);
    const approved = cell(container, day(2));
    if (approved) {
      expect(approved.getAttribute('data-mark')).toBe('approved');
      expect(approved.disabled).toBe(true); // already asked for
    }
    const pending = cell(container, day(4));
    if (pending) expect(pending.getAttribute('data-mark')).toBe('pending');
    expect(screen.getByText('Approved')).toBeTruthy();
    expect(screen.getByText('Pending')).toBeTruthy();
  });

  it('reports the clicked day', () => {
    const onChange = vi.fn();
    const { container } = render(<LeaveCalendar requests={[]} value={{ start: null, end: null }} onChange={onChange} />);
    const free = container.querySelector('button[data-day]:not([disabled])') as HTMLButtonElement;
    fireEvent.click(free);
    expect(onChange).toHaveBeenCalledWith({ start: free.dataset.day, end: null });
  });
});

describe('My requests', () => {
  it('shows status badges, the reason when rejected, and Cancel only on pending ones', async () => {
    const cancel = vi.spyOn(leaveApi, 'cancel').mockResolvedValue();
    const onChanged = vi.fn();
    render(
      <MyLeaveRequests
        loading={false}
        onChanged={onChanged}
        requests={[
          req({ id: 'p', status: 'pending' }),
          req({ id: 'a', status: 'approved', type: 'wfh', start_date: day(8), end_date: day(8) }),
          req({ id: 'x', status: 'rejected', start_date: day(12), end_date: day(12), reject_reason: 'Release week' })
        ]}
      />
    );
    expect(screen.getByText('Pending')).toBeTruthy();
    expect(screen.getByText('Approved')).toBeTruthy();
    expect(screen.getByText('Rejected')).toBeTruthy();
    expect(screen.getByText('Release week')).toBeTruthy();
    expect(screen.getAllByRole('button', { name: /^Cancel/ })).toHaveLength(1);
    fireEvent.click(screen.getByRole('button', { name: /^Cancel/ }));
    await waitFor(() => expect(cancel).toHaveBeenCalledWith('p'));
    await waitFor(() => expect(onChanged).toHaveBeenCalled());
  });

  it('has an empty state', () => {
    render(<MyLeaveRequests loading={false} onChanged={() => undefined} requests={[]} />);
    expect(screen.getByText(/No requests yet/)).toBeTruthy();
  });
});

describe('the request page', () => {
  beforeEach(() => {
    vi.spyOn(leaveApi, 'mine').mockResolvedValue([]);
    vi.spyOn(leaveApi, 'admins').mockResolvedValue([admin]);
  });

  const open = async () => {
    const view = render(
      <MemoryRouter>
        <LeaveRequestsPage />
      </MemoryRouter>
    );
    await screen.findByText(/No requests yet/);
    return view;
  };
  const free = (c: HTMLElement) => Array.from(c.querySelectorAll<HTMLButtonElement>('button[data-day]:not([disabled])'));

  it('asks for dates first, then Continue opens the form and sending creates the request', async () => {
    const create = vi.spyOn(leaveApi, 'create').mockResolvedValue(req());
    const { container } = await open();
    expect(screen.queryByRole('button', { name: 'Continue' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Request leave' }));
    expect(screen.getByRole('alert').textContent).toContain('Pick your dates');

    const [first] = free(container);
    fireEvent.click(first); // one day
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));

    // one day: duration is offered; the only admin is preselected
    const dialog = await screen.findByRole('dialog');
    await within(dialog).findByRole('option', { name: 'Ada Admin' });
    expect(within(dialog).getByLabelText('Duration')).toBeTruthy();
    fireEvent.change(within(dialog).getByLabelText('Type'), { target: { value: 'wfh' } });
    fireEvent.change(within(dialog).getByLabelText('Duration'), { target: { value: 'first_half' } });
    // the reason is required
    fireEvent.click(within(dialog).getByRole('button', { name: 'Send for approval' }));
    expect(create).not.toHaveBeenCalled();
    fireEvent.change(within(dialog).getByLabelText('Reason'), { target: { value: 'Plumber visit' } });
    await waitFor(() => expect((within(dialog).getByLabelText('Send to') as HTMLSelectElement).value).toBe('a1'));
    fireEvent.click(within(dialog).getByRole('button', { name: 'Send for approval' }));
    await waitFor(() =>
      expect(create).toHaveBeenCalledWith({ type: 'wfh', start_date: first.dataset.day, end_date: first.dataset.day, duration: 'first_half', reason: 'Plumber visit', admin_id: 'a1' })
    );
  });

  it('a range is always full days: no duration choice', async () => {
    const { container } = await open();
    const days = free(container);
    fireEvent.click(days[0]);
    fireEvent.click(days[1]);
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).queryByLabelText('Duration')).toBeNull();
    expect(within(dialog).getByLabelText('Type')).toBeTruthy();
  });
});

describe('telling the employee about a decision', () => {
  const decided = (over: Partial<LeaveRequest>) => req({ decided_at: new Date().toISOString(), decided_by: admin, ...over });

  beforeEach(() => {
    useAuthStore.setState({ user: { id: 'e1', role: 'employee', name: 'Eva' } as never });
  });

  const show = async (list: LeaveRequest[]) => {
    vi.spyOn(leaveApi, 'mine').mockResolvedValue(list);
    render(<LeaveDecisionHost />);
  };

  it('celebrates an approved leave with the dates', async () => {
    await show([decided({ id: 'a', status: 'approved', start_date: '2026-11-20', end_date: '2026-11-22' })]);
    expect(await screen.findByText('Yay! Your leave is approved 🎉')).toBeTruthy();
    expect(screen.getByText(/20 Nov – 22 Nov/)).toBeTruthy();
    expect(screen.getByText('Approved by Ada Admin')).toBeTruthy();
  });

  it('says Work from home approved for a work-from-home request', async () => {
    await show([decided({ id: 'w', status: 'approved', type: 'wfh' })]);
    expect(await screen.findByText('Work from home approved 🎉')).toBeTruthy();
  });

  it('shows a rejection with the admin reason', async () => {
    await show([decided({ id: 'x', status: 'rejected', reject_reason: 'Release week, please move it' })]);
    expect(await screen.findByText('Your request was rejected')).toBeTruthy();
    expect(screen.getByText('Release week, please move it')).toBeTruthy();
    expect(screen.getByText(/Reason from Ada Admin/)).toBeTruthy();
  });

  it('shows each decision once, one after the other', async () => {
    await show([decided({ id: 'a', status: 'approved' }), decided({ id: 'x', status: 'rejected', reject_reason: 'No' })]);
    await screen.findByText(/approved/);
    fireEvent.click(screen.getByRole('button', { name: 'Thanks!' }));
    expect(await screen.findByText('Your request was rejected')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Got it' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    cleanup();
    await show([decided({ id: 'a', status: 'approved' }), decided({ id: 'x', status: 'rejected', reject_reason: 'No' })]);
    await act(async () => {
      await Promise.resolve();
    });
    expect(screen.queryByRole('dialog')).toBeNull(); // already seen: not shown again
  });

  it('ignores pending ones and decisions older than a week', () => {
    const old = decided({ id: 'o', status: 'approved', decided_at: new Date(Date.now() - 9 * 86_400_000).toISOString() });
    expect(unseenDecisions([req({ id: 'p' }), old], [])).toEqual([]);
  });
});
