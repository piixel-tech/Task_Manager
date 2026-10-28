import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { useAuthStore } from '../../store/authStore';
import type { User, UserRole } from '../../types';
import { personApi, type PersonProfile } from '../../services/http/personApi';
import { PersonProfilePage } from './PersonProfilePage';

const pat: PersonProfile = {
  id: 'u7',
  name: 'Pat Doe',
  role: 'employee',
  avatar_url: null,
  title: 'Designer',
  bio: 'Loves type.',
  company: 'Piixel',
  status: 'wfh',
  in_focus: false
};

const viewAs = async (role: UserRole, profile: PersonProfile = pat) => {
  vi.spyOn(personApi, 'profile').mockResolvedValue(profile);
  useAuthStore.setState({ user: { id: 'me', name: 'Me', jobTitle: 'x', company: 'piixel', role, loginId: 'm', active: true } as User, initialized: true });
  const base = role === 'admin' ? 'admin' : role === 'client' ? 'client' : 'app';
  render(
    <MemoryRouter initialEntries={[`/${base}/people/${profile.id}`]}>
      <Routes>
        <Route path={`/${base}/people/:userId`} element={<PersonProfilePage />} />
      </Routes>
    </MemoryRouter>
  );
  await screen.findByRole('heading', { level: 2, name: profile.name });
};

afterEach(() => {
  cleanup();
  useAuthStore.setState({ user: null, initialized: false });
});

describe('a person\'s profile view', () => {
  it.each(['admin', 'employee', 'client'] as const)('shows the same details to a %s', async (role) => {
    await viewAs(role);
    expect(screen.getByText('Designer · Piixel')).toBeTruthy(); // job title + company, under the page title
    expect(screen.getByText('Loves type.')).toBeTruthy(); // about
    expect(screen.getByText('Work from home')).toBeTruthy(); // today's status
    expect(screen.getByRole('heading', { name: 'Calendar' })).toBeTruthy();
  });

  it('staff open their calendar, clients are sent to booking a meeting', async () => {
    await viewAs('employee');
    expect(screen.getByRole('link', { name: /open calendar/i }).getAttribute('href')).toBe('/app/calendar/u7');
    cleanup();
    await viewAs('client');
    expect(screen.getByRole('link', { name: /book a meeting/i }).getAttribute('href')).toBe('/client/meetings');
  });

  it('a client profile has no status or calendar', async () => {
    await viewAs('employee', { ...pat, id: 'c1', name: 'Cleo Client', role: 'client', status: null, title: '' });
    expect(screen.queryByRole('heading', { name: 'Calendar' })).toBeNull();
    expect(screen.getByText('Clients do not set a daily status.')).toBeTruthy();
  });

  it('only your own profile offers editing', async () => {
    await viewAs('employee', { ...pat, id: 'me', name: 'Me' });
    expect(screen.getByRole('link', { name: /edit my profile/i }).getAttribute('href')).toBe('/app/settings/profile');
    cleanup();
    await viewAs('employee');
    expect(screen.queryByRole('link', { name: /edit my profile/i })).toBeNull();
  });

  it('says so when the person cannot be shown', async () => {
    vi.spyOn(personApi, 'profile').mockRejectedValue(new Error('User not found'));
    useAuthStore.setState({ user: { id: 'me', role: 'client' } as User, initialized: true });
    render(
      <MemoryRouter initialEntries={['/client/people/zz']}>
        <Routes>
          <Route path="/client/people/:userId" element={<PersonProfilePage />} />
        </Routes>
      </MemoryRouter>
    );
    await waitFor(() => expect(screen.getByText('User not found')).toBeTruthy());
  });
});
