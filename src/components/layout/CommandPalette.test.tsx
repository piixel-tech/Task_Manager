import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useAuthStore } from '../../store/authStore';
import { projectApi } from '../../services/http/projectApi';
import { taskApi, type ApiTask } from '../../services/http/taskApi';
import { officeApi } from '../../services/http/officeApi';
import { CommandPalette } from './CommandPalette';
import { capPerKind, matchesQuery, normalize, searchResults, type Result } from './paletteSearch';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const r = (over: Partial<Result>): Result => ({ id: 'x', kind: 'task', title: 'T', path: '/p', haystack: '', ...over });

describe('matching', () => {
  it('ignores case and accents, and finds any part of a word', () => {
    expect(normalize('  Café   MENÜ ')).toBe('cafe menu');
    expect(matchesQuery('Homepage redesign', 'ho')).toBe(true);
    expect(matchesQuery('Homepage redesign', 'PAGE')).toBe(true);
    expect(matchesQuery('Homepage redesign', 'x')).toBe(false);
    expect(matchesQuery('Cafe', 'café')).toBe(true);
  });

  it('needs every word, in any order, and an empty query matches everything', () => {
    expect(matchesQuery('Redesign the homepage hero', 'hero redesign')).toBe(true);
    expect(matchesQuery('Redesign the homepage hero', 'hero footer')).toBe(false);
    expect(matchesQuery('anything', '   ')).toBe(true);
  });

  it('finds things by their details, not just the title, and ranks title matches first', () => {
    const all = [
      r({ id: 'a', title: 'Fix login', haystack: 'Needs the new logo' }),
      r({ id: 'b', title: 'Logo refresh', haystack: '' }),
      r({ id: 'c', title: 'Update footer', subtitle: 'Acme › Web', haystack: 'assigned to Eva' })
    ];
    expect(searchResults(all, 'logo').map((x) => x.id)).toEqual(['b', 'a']);
    expect(searchResults(all, 'eva acme').map((x) => x.id)).toEqual(['c']);
  });

  it('caps each kind separately', () => {
    const many = [...Array(5)].map((_, i) => r({ id: `t${i}`, kind: 'task' })).concat([...Array(5)].map((_, i) => r({ id: `p${i}`, kind: 'project' })));
    expect(capPerKind(many, 2).map((x) => x.id)).toEqual(['t0', 't1', 'p0', 'p1']);
  });
});

describe('the header search', () => {
  const task = (id: string, title: string, extra: Partial<ApiTask> = {}) =>
    ({ id, title, description_text: '', project_name: 'Acme', subfolder_name: 'Design', status: 'todo', priority: 'high', due_date: null, assignee: { id: 'e1', name: 'Eva' }, created_by: null, ...extra }) as unknown as ApiTask;

  it('finds tasks by a letter, by words in the description, by project and by assignee; also people, posts and pages', async () => {
    useAuthStore.setState({ user: { id: 'e1', role: 'employee', name: 'Eva' } as never });
    vi.spyOn(taskApi, 'list').mockResolvedValue([task('t1', 'Homepage redesign', { description_text: 'Hero banner needs a bigger photo' }), task('t2', 'Newsletter')]);
    vi.spyOn(projectApi, 'list').mockResolvedValue([{ id: 'p1', name: 'Acme website', description: 'Rebuild' } as never]);
    vi.spyOn(projectApi, 'directory').mockResolvedValue([{ id: 'u2', name: 'Hal Head', role: 'employee', avatar_url: null, company_id: null }]);
    vi.spyOn(officeApi, 'list').mockResolvedValue({ total: 1, unseen_count: 0, items: [{ id: 'o1', text: 'The AC is too cold', author: { id: 'a', name: 'Ann' }, category_label: 'AC/Facilities', resolved: false }] as never });
    render(
      <MemoryRouter>
        <CommandPalette isOpen onClose={() => undefined} />
      </MemoryRouter>
    );
    const box = screen.getByPlaceholderText(/Search tasks/);
    await waitFor(() => expect(screen.getByText('Newsletter')).toBeTruthy());

    fireEvent.change(box, { target: { value: 'p' } }); // one letter
    expect(screen.getByText('Homepage redesign')).toBeTruthy();
    expect(screen.queryByText('Newsletter')).toBeNull();

    fireEvent.change(box, { target: { value: 'ha' } }); // part of a name
    expect(screen.getByText('Hal Head')).toBeTruthy();

    fireEvent.change(box, { target: { value: 'bigger photo' } }); // words from the description
    expect(screen.getByText('Homepage redesign')).toBeTruthy();

    fireEvent.change(box, { target: { value: 'eva newsl' } }); // assignee + part of a title
    expect(screen.getByText('Newsletter')).toBeTruthy();
    expect(screen.queryByText('Homepage redesign')).toBeNull();

    fireEvent.change(box, { target: { value: 'cold' } }); // an office post
    expect(screen.getByText('The AC is too cold')).toBeTruthy();

    fireEvent.change(box, { target: { value: 'vacation' } }); // a page, by what it is for
    expect(screen.getByText('Leave')).toBeTruthy();

    fireEvent.change(box, { target: { value: 'zzzz' } });
    expect(screen.getByText(/Nothing matches/)).toBeTruthy();
  });

  it('still shows what loaded when one source fails', async () => {
    useAuthStore.setState({ user: { id: 'e1', role: 'employee', name: 'Eva' } as never });
    vi.spyOn(taskApi, 'list').mockRejectedValue(new Error('boom'));
    vi.spyOn(projectApi, 'list').mockResolvedValue([{ id: 'p1', name: 'Acme website', description: '' } as never]);
    vi.spyOn(projectApi, 'directory').mockResolvedValue([]);
    vi.spyOn(officeApi, 'list').mockRejectedValue(new Error('boom'));
    render(
      <MemoryRouter>
        <CommandPalette isOpen onClose={() => undefined} />
      </MemoryRouter>
    );
    await waitFor(() => expect(screen.getByText('Acme website')).toBeTruthy());
  });
});
