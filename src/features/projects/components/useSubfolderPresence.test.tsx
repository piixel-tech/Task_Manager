import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { PresenceEvent, TimerCurrent } from '../../../services/http/timerApi';

const h = vi.hoisted(() => {
  const handlers = new Map<string, Set<(d: any) => void>>();
  return {
    handlers,
    emit: (event: string, data?: unknown) => handlers.get(event)?.forEach((fn) => fn(data)),
    api: { current: vi.fn(), start: vi.fn(), pause: vi.fn(), resume: vi.fn(), working: vi.fn() }
  };
});
vi.mock('../../../services/http/timerApi', () => ({ timerApi: h.api }));
vi.mock('../../../services/socket', () => ({
  socket: {
    on: (event: string, fn: (d: any) => void) => {
      if (!h.handlers.has(event)) h.handlers.set(event, new Set());
      h.handlers.get(event)!.add(fn);
      return () => h.handlers.get(event)!.delete(fn);
    }
  }
}));

import { useAuthStore } from '../../../store/authStore';
import { useTimerStore } from '../../../store/useTimerStore';
import { useSubfolderPresence } from './useSubfolderPresence';
import { useTimerTitle } from '../../tasks/components/useTimerTitle';
import { PersonChip } from './PersonChip';
import { WorkingAvatars } from './WorkingAvatars';

const mia = { id: 'u-mia', name: 'Mia Member', role: 'employee' };
const max = { id: 'u-max', name: 'Max Member', role: 'employee' };
const event = (user: typeof mia, running: boolean, task = 't1', sub = 's1'): PresenceEvent =>
  ({ subfolder_id: sub, task_id: task, running, started_at: running ? '2026-01-01T10:00:00Z' : null, user }) as PresenceEvent;

const Probe: React.FC<{ sub: string }> = ({ sub }) => {
  const { workersOn, activeIds } = useSubfolderPresence(sub);
  return (
    <div>
      <p data-testid="t1">{workersOn('t1').map((u) => u.name).join(',')}</p>
      <p data-testid="t2">{workersOn('t2').map((u) => u.name).join(',')}</p>
      <p data-testid="active">{[...activeIds].join(',')}</p>
    </div>
  );
};

beforeEach(() => {
  h.handlers.clear();
  Object.values(h.api).forEach((f) => f.mockReset());
  h.api.working.mockResolvedValue([]);
  useAuthStore.setState({ user: { id: 'me' } as never });
  useTimerStore.setState({ current: null, receivedAt: 0, rev: 0, busy: false });
});
afterEach(cleanup);

describe('working now in a subfolder', () => {
  it('starts from the server list and follows live presence messages', async () => {
    h.api.working.mockResolvedValue([{ task_id: 't1', started_at: '2026-01-01T09:00:00Z', user: mia }]);
    render(<Probe sub="s1" />);
    await waitFor(() => expect(screen.getByTestId('t1').textContent).toBe('Mia Member'));
    expect(screen.getByTestId('active').textContent).toBe('u-mia');

    act(() => h.emit('presence', event(max, true, 't1')));
    expect(screen.getByTestId('t1').textContent).toBe('Mia Member,Max Member');

    // Mia switches to another task: she leaves t1 and appears on t2.
    act(() => h.emit('presence', event(mia, false, 't1')));
    act(() => h.emit('presence', event(mia, true, 't2')));
    expect(screen.getByTestId('t1').textContent).toBe('Max Member');
    expect(screen.getByTestId('t2').textContent).toBe('Mia Member');

    act(() => h.emit('presence', event(max, false, 't1')));
    expect(screen.getByTestId('active').textContent).toBe('u-mia');
  });

  it('ignores other subfolders and asks again when the socket reconnects', async () => {
    render(<Probe sub="s1" />);
    await waitFor(() => expect(h.api.working).toHaveBeenCalledTimes(1));
    act(() => h.emit('presence', event(mia, true, 't1', 'other')));
    expect(screen.getByTestId('t1').textContent).toBe('');

    h.api.working.mockResolvedValue([{ task_id: 't1', started_at: '2026-01-01T09:00:00Z', user: max }]);
    act(() => h.emit('connected'));
    await waitFor(() => expect(screen.getByTestId('t1').textContent).toBe('Max Member'));
  });

  it('marks people in the member list and shows nothing for an idle task', () => {
    const chip = (active: boolean) => (
      <MemoryRouter>
        <PersonChip person={mia as never} active={active} />
      </MemoryRouter>
    );
    const { rerender } = render(chip(true));
    expect(screen.getByText('Working now')).toBeTruthy();
    rerender(chip(false));
    expect(screen.queryByText('Working now')).toBeNull();
    cleanup();
    expect(render(<WorkingAvatars people={[]} />).container.textContent).toBe('');
  });
});

describe('timer sync across tabs', () => {
  const pushed = (state: TimerCurrent['state'], id = 'a'): TimerCurrent => ({
    server_now: '2026-01-01T10:00:00Z',
    state,
    task: { id, title: 'Design', subfolder_id: 's1', progress: 40, total_seconds: 120 },
    started_at: state === 'running' ? '2026-01-01T09:58:00Z' : null,
    stopped_task: null
  });

  it('applies a timer pushed by the server, and tells lists to refresh only when it really moved', async () => {
    h.api.current.mockResolvedValue({ ...pushed('idle'), task: null });
    await useTimerStore.getState().load();
    const before = useTimerStore.getState().rev;

    act(() => h.emit('timer', pushed('running')));
    expect(useTimerStore.getState().current?.state).toBe('running');
    expect(useTimerStore.getState().rev).toBe(before + 1);

    act(() => h.emit('timer', pushed('running'))); // the echo of my own click: same state
    expect(useTimerStore.getState().rev).toBe(before + 1);

    act(() => h.emit('timer', pushed('paused')));
    expect(useTimerStore.getState().current?.state).toBe('paused');
  });

  it('forgets the timer when another person signs in', () => {
    useTimerStore.setState({ current: pushed('running'), receivedAt: 1, rev: 3, busy: false });
    act(() => useAuthStore.setState({ user: { id: 'someone-else' } as never }));
    expect(useTimerStore.getState().current).toBeNull();
  });
});

describe('browser tab title', () => {
  const Title: React.FC = () => {
    useTimerTitle();
    return null;
  };

  it('shows ▶ clock · task while running and restores the normal title when it stops', () => {
    vi.useFakeTimers();
    document.title = 'Task Manager';
    const running: TimerCurrent = {
      server_now: 'x',
      state: 'running',
      task: { id: 'a', title: 'Write copy', subfolder_id: 's1', progress: 0, total_seconds: 2538 },
      started_at: 'x',
      stopped_task: null
    };
    useTimerStore.setState({ current: running, receivedAt: Date.now(), rev: 1 });
    render(<Title />);
    expect(document.title).toBe('▶ 42:18 · Write copy');
    act(() => void vi.advanceTimersByTime(3000));
    expect(document.title).toBe('▶ 42:21 · Write copy');

    act(() => useTimerStore.setState({ current: { ...running, state: 'paused', started_at: null } }));
    expect(document.title).toBe('Task Manager');
    vi.useRealTimers();
  });
});
