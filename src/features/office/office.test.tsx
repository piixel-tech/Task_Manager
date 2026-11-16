import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useAuthStore } from '../../store/authStore';
import { officeApi, type OfficeList, type OfficePost } from '../../services/http/officeApi';
import { OfficePage, solvedLine } from './pages/OfficePage';
import { daysBetween } from './components/PinNote';

vi.mock('../../hooks/useConfirm', () => ({
  useConfirm: () => async (o: { action: () => Promise<void> }) => {
    await o.action();
    return true;
  }
}));

const NOW = new Date(2026, 10, 18, 12);
const ago = (d: number) => new Date(NOW.getTime() - d * 86_400_000).toISOString();
const user = (id: string, name: string) => ({ id, name, avatar_url: null, role: 'employee', company_id: 'c1' });

const post = (over: Partial<OfficePost> = {}): OfficePost => ({
  id: 'p1', author: user('e1', 'Eva'), text: 'The AC is too cold', category: 'facilities', category_label: 'AC/Facilities', emoji: '❄️', photo: null, reactions: [{ emoji: '👍', count: 2, mine: false, users: [user('a', 'A'), user('b', 'B')] }],
  seen_by: [user('a', 'A')], seen_count: 1, is_new: false, resolved: false, resolved_by: null, resolved_at: null, can_resolve: true, created_at: ago(3), ...over
});
const list = (items: OfficePost[], total = items.length): OfficeList => ({ items, total, unseen_count: 0 });

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
  useAuthStore.setState({ user: { id: 'e1', role: 'employee', name: 'Eva' } as never });
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

const solved = post({ id: 'p2', text: 'Printer jam', resolved: true, resolved_by: user('h1', 'Hal'), resolved_at: ago(1), created_at: ago(3) });

describe('the history line', () => {
  it('says who solved it, in how many days, and when', () => {
    expect(daysBetween(ago(3), ago(1))).toBe(2);
    expect(solvedLine(solved)).toBe('Solved by Hal in 2 days · 17 Nov');
    expect(solvedLine({ ...solved, resolved_at: solved.created_at })).toContain('Solved by Hal the same day');
  });
});

describe('the Office board', () => {
  const open = () =>
    render(
      <MemoryRouter>
        <OfficePage />
      </MemoryRouter>
    );
  const mockList = () =>
    vi.spyOn(officeApi, 'list').mockImplementation(async ({ status, limit }) => {
      if (status === 'resolved') return list(limit === 1 ? [] : [solved], 4);
      if (status === 'open') return list(limit === 1 ? [] : [post()], 7);
      return list([post(), solved], 11);
    });

  it('has the tabs with counts, a pinned note with only reacted emojis, and no "active" counter', async () => {
    mockList();
    open();
    expect(await screen.findByText('The AC is too cold')).toBeTruthy();
    expect(screen.queryByText(/active/)).toBeNull();
    await waitFor(() => expect(screen.getByRole('tab', { name: /Open/ }).textContent).toContain('7'));
    expect(screen.getByRole('tab', { name: /All/ }).textContent).toContain('11');
    expect(screen.getByText('Open for 3 days')).toBeTruthy();
    const note = within(screen.getByRole('article'));
    expect(note.getByText('👍')).toBeTruthy();
    expect(note.queryByText('❤️')).toBeNull(); // only reactions that have counts
    expect(note.getByText('Seen by 1')).toBeTruthy();
    expect(note.getByRole('button', { name: 'Resolved' })).toBeTruthy();
  });

  it('adds a reaction from the + picker and marks a post resolved', async () => {
    mockList();
    const react = vi.spyOn(officeApi, 'react').mockResolvedValue(post());
    const setResolved = vi.spyOn(officeApi, 'setResolved').mockResolvedValue(solved);
    open();
    await screen.findByText('The AC is too cold');
    fireEvent.click(screen.getByRole('button', { name: 'Add a reaction' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'React 🎉' }));
    await waitFor(() => expect(react).toHaveBeenCalledWith('p1', '🎉'));
    fireEvent.click(screen.getByRole('button', { name: 'Resolved' }));
    await waitFor(() => expect(setResolved).toHaveBeenCalledWith('p1', true));
  });

  it('opens the new post form from the last tile, and shows the Solved tray with a link to the Resolved tab', async () => {
    mockList();
    open();
    await screen.findByText('The AC is too cold');
    const tray = within(screen.getByLabelText('Solved history'));
    await waitFor(() => expect(tray.getByText('Printer jam')).toBeTruthy());
    expect(tray.getByText('Solved by Hal in 2 days · 17 Nov')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Pin something for the office/ }));
    expect(await screen.findByRole('dialog')).toBeTruthy();
  });

  it('shows resolved posts struck through with a green pin on the Resolved tab', async () => {
    mockList();
    open();
    await screen.findByText('The AC is too cold');
    fireEvent.click(tabByName('Resolved'));
    await waitFor(() => expect(document.querySelector('[data-resolved="true"]')).toBeTruthy());
    expect(within(document.querySelector('[data-resolved="true"]') as HTMLElement).getByRole('button', { name: 'Reopen' })).toBeTruthy();
  });
});

function tabByName(name: string) {
  return screen.getAllByRole('tab').find((t) => t.textContent?.startsWith(name))!;
}
