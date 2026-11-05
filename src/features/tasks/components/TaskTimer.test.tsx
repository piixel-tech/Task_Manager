import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ApiTask } from '../../../services/http/taskApi';
import type { TimerCurrent, TimerTask } from '../../../services/http/timerApi';

const api = vi.hoisted(() => ({ current: vi.fn(), start: vi.fn(), pause: vi.fn(), resume: vi.fn() }));
vi.mock('../../../services/http/timerApi', () => ({ timerApi: api }));

import { useAuthStore } from '../../../store/authStore';
import { useTimerStore } from '../../../store/useTimerStore';
import { useToastStore } from '../../../store/useToastStore';
import { TaskLiveTime, TaskTimerButton } from './TaskTimer';

const tt = (id: string, title: string, total = 0): TimerTask => ({ id, title, subfolder_id: 's1', progress: 0, total_seconds: total });
const answer = (state: TimerCurrent['state'], task: TimerTask | null, stopped: TimerTask | null = null): TimerCurrent => ({
  server_now: '2026-01-01T10:00:00Z',
  state,
  task,
  started_at: state === 'running' ? '2026-01-01T09:59:00Z' : null,
  stopped_task: stopped
});

const task = (id: string, title: string, extra: Partial<ApiTask> = {}) =>
  ({ id, title, assignee: { id: 'me' }, can_work: true, timer_running: false, total_seconds: 0, ...extra }) as unknown as ApiTask;

const toasts = () => useToastStore.getState().toasts.map((t) => t.title);

beforeEach(() => {
  Object.values(api).forEach((f) => f.mockReset());
  api.current.mockResolvedValue(answer('idle', null));
  useAuthStore.setState({ user: { id: 'me' } as never });
  useTimerStore.setState({ current: null, receivedAt: 0, rev: 0, busy: false });
  useToastStore.setState({ toasts: [] });
});
afterEach(cleanup);

describe('task timer button', () => {
  it('plays a task and says so', async () => {
    api.start.mockResolvedValue(answer('running', tt('a', 'Write copy')));
    render(<TaskTimerButton task={task('a', 'Write copy')} />);
    fireEvent.click(screen.getByRole('button', { name: 'Start timer on Write copy' }));
    await waitFor(() => expect(api.start).toHaveBeenCalledWith('a'));
    await waitFor(() => expect(toasts()).toContain('Started Write copy'));
    expect(screen.getByRole('button', { name: 'Pause timer on Write copy' }).getAttribute('aria-pressed')).toBe('true');
  });

  it('playing another task pauses the first and the toast names both', async () => {
    useTimerStore.setState({ current: answer('running', tt('a', 'Design')), receivedAt: Date.now() });
    api.start.mockResolvedValue(answer('running', tt('b', 'Reels'), tt('a', 'Design')));
    render(
      <>
        <TaskTimerButton task={task('a', 'Design', { timer_running: true })} />
        <TaskTimerButton task={task('b', 'Reels')} />
      </>
    );
    expect(screen.getByRole('button', { name: 'Pause timer on Design' })).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Start timer on Reels' }));
    await waitFor(() => expect(toasts()).toContain('Paused Design, started Reels'));
    // The cards follow the one answer from the server: only Reels is running now.
    expect(screen.getByRole('button', { name: 'Start timer on Design' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Pause timer on Reels' })).toBeTruthy();
  });

  it('pauses the running task, then resumes it', async () => {
    useTimerStore.setState({ current: answer('running', tt('a', 'Design')), receivedAt: Date.now() });
    api.pause.mockResolvedValue(answer('paused', tt('a', 'Design', 90)));
    api.resume.mockResolvedValue(answer('running', tt('a', 'Design', 90)));
    render(<TaskTimerButton task={task('a', 'Design', { timer_running: true })} />);

    fireEvent.click(screen.getByRole('button', { name: 'Pause timer on Design' }));
    await waitFor(() => expect(toasts()).toContain('Paused Design'));
    fireEvent.click(await screen.findByRole('button', { name: 'Start timer on Design' }));
    await waitFor(() => expect(api.resume).toHaveBeenCalled());
    expect(api.start).not.toHaveBeenCalled();
  });

  it('is not shown on a task you cannot work on, and a click does not reach the card around it', () => {
    const { rerender } = render(<TaskTimerButton task={task('a', 'Design', { can_work: false })} />);
    expect(screen.queryByRole('button')).toBeNull();

    const open = vi.fn();
    api.start.mockResolvedValue(answer('running', tt('a', 'Design')));
    rerender(
      <div onClick={open}>
        <TaskTimerButton task={task('a', 'Design')} />
      </div>
    );
    fireEvent.click(screen.getByRole('button'));
    expect(open).not.toHaveBeenCalled();
  });

  it('shows an error toast and re-reads the server when starting fails', async () => {
    api.start.mockRejectedValue(new Error('This task is submitted'));
    render(<TaskTimerButton task={task('a', 'Design')} />);
    fireEvent.click(screen.getByRole('button'));
    await waitFor(() => expect(toasts()).toContain('This task is submitted'));
    expect(api.current).toHaveBeenCalled();
  });
});

describe('live time', () => {
  it('counts up from the server total while running and is hidden when not', () => {
    vi.useFakeTimers();
    useTimerStore.setState({ current: answer('running', tt('a', 'Design', 60)), receivedAt: Date.now() });
    render(<TaskLiveTime task={task('a', 'Design', { timer_running: true, total_seconds: 60 })} />);
    expect(screen.getByText('1m 00s')).toBeTruthy();
    act(() => void vi.advanceTimersByTime(5000));
    expect(screen.getByText('1m 05s')).toBeTruthy();
    vi.useRealTimers();

    cleanup();
    useTimerStore.setState({ current: answer('idle', null), receivedAt: Date.now() });
    const { container } = render(<TaskLiveTime task={task('a', 'Design')} />);
    expect(container.textContent).toBe('');
  });
});
