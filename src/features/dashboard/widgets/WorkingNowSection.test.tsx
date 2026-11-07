import { act, cleanup, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { timerApi, type ActiveTimers } from '../../../services/http/timerApi';
import { WorkingNowSection } from './WorkingNowSection';

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const NOW = '2026-11-07T10:00:00Z';
// `total` is what the server says was tracked on the task as of NOW (earlier sessions plus the running one)
const item = (name: string, company: string, started: string, total = 12130, title = 'Logo') => ({
  user: { id: `u-${name}`, name, avatar_url: null, role: 'employee', company_id: company },
  company_id: company,
  started_at: started,
  task: {
    id: `t-${name}`, title, description: 'Make it blue', due_date: '2026-11-09', priority: 'high' as const, status: 'in_progress', total_seconds: total,
    project_id: 'p1', project_name: 'Acme', subfolder_id: 's1', subfolder_name: 'Web mat'
  }
});
const data = (items: ActiveTimers['items']): ActiveTimers => ({
  server_now: NOW,
  companies: [{ id: 'c1', name: 'Piixel' }, { id: 'c2', name: 'Unwork' }],
  items
});

const show = async (d: ActiveTimers) => {
  vi.spyOn(timerApi, 'active').mockResolvedValue(d);
  render(
    <MemoryRouter>
      <WorkingNowSection />
    </MemoryRouter>
  );
  await screen.findByText('Piixel');
};

describe('Working now', () => {
  beforeEach(() => vi.spyOn(Date, 'now').mockReturnValue(Date.parse(NOW)));

  it('groups people by company with a count, and shows the empty state for a company with nobody', async () => {
    await show(data([item('Mia Member', 'c1', '2026-11-07T09:00:00Z')]));
    const piixel = screen.getByRole('region', { name: 'Piixel: 1 working' });
    expect(within(piixel).getByText('Mia Member')).toBeTruthy();
    expect(within(piixel).getByText('Logo')).toBeTruthy();
    expect(within(piixel).getByText('Make it blue')).toBeTruthy();
    expect(within(piixel).getByText('Web mat')).toBeTruthy();
    expect(within(piixel).getByText('3:22:10')).toBeTruthy(); // the TOTAL on the task, not just this session
    expect(within(piixel).getByText(/this session 1:00 · since/)).toBeTruthy(); // the running session, an hour so far
    expect(within(piixel).getByRole('button', { name: 'View Logo' })).toBeTruthy();
    const unwork = screen.getByRole('region', { name: 'Unwork: 0 working' });
    expect(within(unwork).getByText('No one is working on a task right now.')).toBeTruthy();
  });

  it('ticks every second', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'setTimeout', 'clearTimeout'] });
    vi.spyOn(timerApi, 'active').mockResolvedValue(data([item('Mia Member', 'c1', '2026-11-07T09:59:50Z', 3600)]));
    render(
      <MemoryRouter>
        <WorkingNowSection />
      </MemoryRouter>
    );
    await act(async () => {
      await Promise.resolve();
    });
    expect(screen.getByText('1:00:00')).toBeTruthy(); // 1h on the task already, counting from the server's answer
    vi.spyOn(Date, 'now').mockReturnValue(Date.parse(NOW) + 3000);
    await act(async () => {
      vi.advanceTimersByTime(1000);
    });
    expect(screen.getByText('1:00:03')).toBeTruthy(); // still ticking every second
  });
});
