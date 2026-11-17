import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { HelpCenter } from './HelpCenter';
import { useAuthStore } from '../../store/authStore';
import { sidebarApi } from '../../services/http/sidebarApi';
import type { User } from '../../types';

const navigate = vi.fn();
vi.mock('react-router-dom', async (importOriginal) => ({ ...(await importOriginal<typeof import('react-router-dom')>()), useNavigate: () => navigate }));

const as = (role: string) => useAuthStore.setState({ user: { id: 'me', role } as unknown as User });
const tree = (isHead: boolean) =>
  vi.spyOn(sidebarApi, 'tree').mockResolvedValue({ projects: [{ id: 'p', name: 'P', subfolders: [{ id: 's', name: 'S', is_head: isHead }] }] } as never);
const show = () =>
  render(
    <MemoryRouter>
      <HelpCenter />
    </MemoryRouter>
  );

beforeEach(() => {
  localStorage.clear();
  tree(false);
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  navigate.mockReset();
});

describe('Help centre', () => {
  it('shows the employee answers to an employee, and no admin tools', () => {
    as('employee');
    show();
    expect(screen.getByText('How do I find my way around?')).toBeTruthy();
    expect(screen.queryByText('How do I add or manage team members?')).toBeNull();
    expect(screen.queryByRole('tab', { name: 'Admin tools' })).toBeNull();
  });

  it('adds the head topics for someone who heads a subfolder', async () => {
    as('employee');
    tree(true);
    show();
    await screen.findByText('How do I choose who can see a subfolder?');
  });

  it('shows the admin answers to an admin', () => {
    as('admin');
    show();
    expect(screen.getByText('How do I add or manage team members?')).toBeTruthy();
    expect(screen.getByText('Where are all the tasks?')).toBeTruthy();
    expect(screen.getByRole('tab', { name: 'Admin tools' })).toBeTruthy();
  });

  it('searches, opens an answer, and takes the person to the page', () => {
    as('employee');
    show();
    fireEvent.change(screen.getByLabelText('Search the help'), { target: { value: 'browser timer' } });
    expect(screen.queryByText('How do I find my way around?')).toBeNull();
    fireEvent.click(screen.getByText('What happens if I close the browser with a timer running?'));
    expect(screen.getByText(/the server, not by your browser/)).toBeTruthy();
    fireEvent.click(screen.getAllByRole('button', { name: /Take me there/ })[0]);
    expect(navigate).toHaveBeenCalledWith('/app/tasks');
    // a second click on the question folds it again
    fireEvent.click(screen.getByText('What happens if I close the browser with a timer running?'));
    expect(screen.queryByText(/the server, not by your browser/)).toBeNull();
  });

  it('opens a related question even when a search had hidden it', () => {
    as('employee');
    show();
    fireEvent.change(screen.getByLabelText('Search the help'), { target: { value: 'close the browser' } });
    fireEvent.click(screen.getByText('What happens if I close the browser with a timer running?'));
    fireEvent.click(screen.getByRole('button', { name: 'How do I track time on a task?' }));
    expect((screen.getByLabelText('Search the help') as HTMLInputElement).value).toBe('');
    expect(screen.getByText(/Press the round play button/)).toBeTruthy();
  });

  it('opens the answer named in the link, as "Learn more" on an info icon does', () => {
    as('employee');
    render(
      <MemoryRouter initialEntries={['/app/settings/help?article=tasks-timer-close']}>
        <HelpCenter />
      </MemoryRouter>
    );
    expect(screen.getByText(/the server, not by your browser/)).toBeTruthy();
    expect(screen.getByRole('button', { name: /What happens if I close the browser/ }).getAttribute('aria-expanded')).toBe('true');
  });

  it('says so when nothing matches', () => {
    as('employee');
    show();
    fireEvent.change(screen.getByLabelText('Search the help'), { target: { value: 'zzzzzz' } });
    expect(screen.getByText('Nothing matches that')).toBeTruthy();
  });

  it('remembers "Was this helpful?" in this browser', async () => {
    as('employee');
    show();
    fireEvent.click(screen.getByText('How do I find my way around?'));
    fireEvent.click(screen.getByRole('button', { name: 'Yes, this helped' }));
    expect(screen.getByText('Thanks for letting us know.')).toBeTruthy();
    expect(JSON.parse(localStorage.getItem('tm-help-feedback') ?? '{}')).toEqual({ 'start-navigate': 'yes' });
    await waitFor(() => expect(sidebarApi.tree).toHaveBeenCalled());
  });
});
