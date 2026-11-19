import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { InfoTip } from './InfoTip';
import { useAuthStore } from '../../store/authStore';
import type { User } from '../../types';

const navigate = vi.fn();
vi.mock('react-router-dom', async (importOriginal) => ({ ...(await importOriginal<typeof import('react-router-dom')>()), useNavigate: () => navigate }));

const as = (role: string) => useAuthStore.setState({ user: { id: 'me', role } as unknown as User });
const show = (topic = 'sub-structure') =>
  render(
    <MemoryRouter>
      <InfoTip topic={topic}>A head looks after one subfolder.</InfoTip>
    </MemoryRouter>
  );

beforeEach(() => as('employee'));
afterEach(() => {
  cleanup();
  navigate.mockReset();
});

describe('the "i" icon', () => {
  it('opens a short explanation, and closes with Esc or a click outside', () => {
    show();
    expect(screen.queryByRole('dialog')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'What is this?' }));
    expect(screen.getByRole('dialog').textContent).toContain('A head looks after one subfolder.');
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'What is this?' }));
    fireEvent.mouseDown(document.body);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('opens the matching Help answer from "Learn more"', () => {
    show('sub-structure');
    fireEvent.click(screen.getByRole('button', { name: 'What is this?' }));
    fireEvent.click(screen.getByRole('button', { name: 'Learn more' }));
    expect(navigate).toHaveBeenCalledWith('/app/settings/help?article=sub-structure');
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('sends admins and clients to their own panel', () => {
    as('admin');
    show('sub-structure');
    fireEvent.click(screen.getByRole('button', { name: 'What is this?' }));
    fireEvent.click(screen.getByRole('button', { name: 'Learn more' }));
    expect(navigate).toHaveBeenCalledWith('/admin/settings/help?article=sub-structure');
  });

  it('offers no "Learn more" when that answer is not for this person', () => {
    as('client');
    show('leave-decide'); // an admin-only answer
    fireEvent.click(screen.getByRole('button', { name: 'What is this?' }));
    expect(screen.getByRole('dialog')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Learn more' })).toBeNull();
  });
});
