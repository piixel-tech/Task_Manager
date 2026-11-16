import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useAuthStore } from '../../store/authStore';
import { reviewApi, type Review } from '../../services/http/reviewApi';
import { taskApi, type ApiTask } from '../../services/http/taskApi';
import { ReviewsPage } from './pages/ReviewsPage';
import { decidedThisWeek, groupPending, latestRounds, submissionStats, toReviewStats } from './reviewData';

vi.mock('../../hooks/useConfirm', () => ({
  useConfirm: () => async (o: { action: () => Promise<void> }) => {
    await o.action();
    return true;
  }
}));

const NOW = new Date(2026, 10, 18, 12); // Wed 18 Nov 2026
const days = (n: number) => new Date(NOW.getTime() - n * 86_400_000).toISOString();
const person = (id: string, name: string) => ({ id, name, avatar_url: null, role: 'employee', company_id: 'c1' });
const eva = person('e1', 'Eva');
const hal = person('h1', 'Hal Head');

const review = (over: Partial<Review> = {}): Review => ({
  id: 'r1', task_id: 't1', task_title: 'Homepage', project_id: 'p1', project_name: 'Acme', subfolder_name: 'Design', round: 1, submitted_by: eva, approver: hal, note: 'Done, please check',
  files: [], decision: 'pending', comments: null, decided_by: null, decided_at: null, created_at: days(1), can_decide: true, ...over
});

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('review numbers', () => {
  it('splits pending into "Waiting 2+ days" and "New", oldest first', () => {
    const a = review({ id: 'a', created_at: days(5) });
    const b = review({ id: 'b', created_at: days(0.5) });
    const c = review({ id: 'c', created_at: days(2) });
    const g = groupPending([b, c, a], NOW);
    expect(g.late.map((r) => r.id)).toEqual(['a', 'c']);
    expect(g.fresh.map((r) => r.id)).toEqual(['b']);
  });

  it('counts the four To review stats', () => {
    const rs = [
      review({ id: 'a', created_at: days(3) }),
      review({ id: 'b', round: 2 }),
      review({ id: 'c', can_decide: false }),
      review({ id: 'd', decision: 'approved', decided_at: days(1) }),
      review({ id: 'e', decision: 'changes_requested', decided_at: days(9) })
    ];
    expect(toReviewStats(rs, NOW)).toEqual({ waiting: 2, late: 1, resubmissions: 1, decidedWeek: 1 });
    expect(decidedThisWeek(rs, NOW).map((r) => r.id)).toEqual(['d']);
  });

  it('keeps the newest round of each task and counts my submission stats', () => {
    const r1 = review({ id: 'r1', round: 1, decision: 'changes_requested', created_at: days(20), decided_at: days(19) });
    const r2 = review({ id: 'r2', round: 2, created_at: days(1) });
    const o1 = review({ id: 'o1', task_id: 't2', decision: 'approved', created_at: days(3), decided_at: days(2) });
    const latest = latestRounds([[r1, r2], [o1], []]);
    expect(latest.map((r) => r.id)).toEqual(['r2', 'o1']);
    expect(submissionStats(latest, [r1, r2, o1], NOW)).toEqual({ changes: 0, waiting: 1, submitted: 2, approvedMonth: 1 });
  });
});

describe('the Reviews page', () => {
  const task = { id: 't1', assignee: eva, review_rounds: 2, project_name: 'Acme', subfolder_name: 'Design', title: 'Homepage' } as unknown as ApiTask;
  const open = () =>
    render(
      <MemoryRouter>
        <ReviewsPage />
      </MemoryRouter>
    );

  it('lands an employee on My submissions, with sent-back work and Fix & resubmit', async () => {
    useAuthStore.setState({ user: { id: 'e1', role: 'employee', name: 'Eva' } as never });
    vi.spyOn(reviewApi, 'list').mockResolvedValue([]);
    vi.spyOn(taskApi, 'list').mockResolvedValue([task]);
    vi.spyOn(reviewApi, 'rounds').mockResolvedValue([
      review({ id: 'r1', round: 1, decision: 'changes_requested', comments: 'First try', decided_by: hal, decided_at: days(2), created_at: days(3), can_decide: false }),
      review({ id: 'r2', round: 2, decision: 'changes_requested', comments: 'Logo is off-centre', decided_by: hal, decided_at: days(1), created_at: days(2), can_decide: false })
    ]);
    open();
    expect(await screen.findByText('Logo is off-centre')).toBeTruthy();
    expect(screen.queryByText('First try')).toBeNull(); // only the newest round of a task
    expect(screen.queryByRole('tab', { name: /To review/ })).toBeNull(); // not a head
    expect(screen.getByRole('tab', { name: 'My submissions' }).getAttribute('aria-selected')).toBe('true');
    expect(screen.getByRole('button', { name: 'Fix & resubmit' })).toBeTruthy();
  });

  it('shows a head the To review list in groups and approves the selected ones', async () => {
    useAuthStore.setState({ user: { id: 'h1', role: 'admin', name: 'Hal' } as never });
    const approve = vi.spyOn(reviewApi, 'approve').mockResolvedValue(review());
    vi.spyOn(reviewApi, 'list').mockResolvedValue([review({ id: 'a', task_title: 'Old one', created_at: days(4) }), review({ id: 'b', task_title: 'Fresh one', created_at: days(0.2) })]);
    vi.spyOn(taskApi, 'list').mockResolvedValue([]);
    open();
    expect(await screen.findByText('Old one')).toBeTruthy();
    expect(screen.getByRole('tab', { name: /To review/ }).textContent).toContain('2');
    expect(screen.getAllByText(/Waiting 2\+ days/).length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole('checkbox', { name: 'Select Old one' }));
    fireEvent.click(screen.getByRole('button', { name: /Approve selected/ }));
    await waitFor(() => expect(approve).toHaveBeenCalledWith('a'));
    expect(approve).toHaveBeenCalledTimes(1);
  });

  it('says so when there is nothing to review or nothing waiting on anyone', async () => {
    useAuthStore.setState({ user: { id: 'h1', role: 'admin', name: 'Hal' } as never });
    vi.spyOn(reviewApi, 'list').mockResolvedValue([]);
    vi.spyOn(taskApi, 'list').mockResolvedValue([]);
    open();
    expect(await screen.findByText("You're all caught up")).toBeTruthy();
    fireEvent.click(screen.getByRole('tab', { name: 'My submissions' }));
    const empty = await screen.findByText('Nothing waiting on anyone');
    expect(within(empty.closest('div')!).getByRole('button', { name: 'Go to My tasks' })).toBeTruthy();
  });
});
