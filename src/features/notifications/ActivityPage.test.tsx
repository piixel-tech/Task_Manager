import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { notificationApi } from '../../services/http/notificationApi';
import type { AppNotification } from '../../types';
import { ActivityPage } from './pages/ActivityPage';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const mk = (id: string, type: string): AppNotification =>
  ({ id, userId: 'u', type, title: `Note ${id}`, message: '', link: '', createdAt: new Date().toISOString(), read: true }) as AppNotification;

describe('Activity: Mentions and Approvals', () => {
  it('load more pages by themselves when the first page holds none, with no "Show more" click', async () => {
    const first = Array.from({ length: 30 }, (_, i) => mk(`t${i}`, 'task_assigned'));
    const second = [mk('m1', 'mention'), mk('m2', 'mention'), ...Array.from({ length: 28 }, (_, i) => mk(`u${i}`, 'task_assigned'))];
    const page = vi.spyOn(notificationApi, 'page').mockImplementation(async ({ skip = 0 } = {}) => ({ items: skip === 0 ? first : second, total: 60 }));
    render(
      <MemoryRouter>
        <ActivityPage />
      </MemoryRouter>
    );
    await screen.findByText('Note t0');
    fireEvent.click(screen.getAllByRole('tab').find((t) => t.textContent?.startsWith('Mentions'))!);
    expect(await screen.findByText('Note m1')).toBeTruthy();
    expect(screen.getByText('Note m2')).toBeTruthy();
    await waitFor(() => expect(page).toHaveBeenCalledWith(expect.objectContaining({ skip: 30 })));
  });

  it('shows "Nothing here yet" once everything is loaded and nothing matches', async () => {
    vi.spyOn(notificationApi, 'page').mockResolvedValue({ items: [mk('a', 'task_assigned')], total: 1 });
    render(
      <MemoryRouter>
        <ActivityPage />
      </MemoryRouter>
    );
    await screen.findByText('Note a');
    fireEvent.click(screen.getAllByRole('tab').find((t) => t.textContent?.startsWith('Approvals'))!);
    expect(await screen.findByText('Nothing here yet')).toBeTruthy();
  });
});
