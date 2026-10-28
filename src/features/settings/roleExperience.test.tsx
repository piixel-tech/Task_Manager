import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { AuthGuard } from '../../app/AuthGuard';
import { AdminGuard } from '../../app/AdminGuard';
import { homeForRole } from '../../app/roleHome';
import { AccountMenu } from '../../components/layout/AccountMenu';
import { PersonLink } from '../../components/ui/PersonLink';
import { useAuthStore } from '../../store/authStore';
import type { User, UserRole } from '../../types';
import { SettingsPage } from './SettingsPage';
import { ADMIN_ITEMS, ME_ITEMS, basePath, profilePath, settingsGroupsFor } from './settingsMenu';

// The real sections talk to the API; here only which sections a role gets is under test.
vi.mock('./sections/ProfileSection', () => ({ ProfileSection: () => <p>profile-body</p> }));
vi.mock('./sections/ConnectedAppsSection', () => ({ ConnectedAppsSection: () => <p>connected-apps-body</p> }));
vi.mock('./sections/PreferenceSections', () => ({
  AppearanceSection: () => <p>appearance-body</p>,
  FocusSection: () => <p>focus-body</p>,
  HelpSection: () => <p>help-body</p>,
  NotificationsSection: () => <p>notifications-body</p>,
  PasswordSection: () => <p>password-body</p>,
  ShortcutsSection: () => <p>shortcuts-body</p>
}));
vi.mock('./sections/AdminSections', () => ({
  CompaniesSection: () => <p>companies-body</p>,
  ExportSection: () => <p>export-body</p>,
  PeopleSection: () => <p>people-body</p>,
  SecuritySection: () => <p>security-body</p>,
  TrashSection: () => <p>trash-body</p>,
  WorkspaceSection: () => <p>workspace-body</p>
}));

const ME_TEAM = ['My profile', 'Change password', 'Notifications', 'Focus mode', 'Appearance', 'Connected apps', 'Keyboard shortcuts', 'Help'];
const ME_CLIENT = ['My profile', 'Change password', 'Notifications', 'Appearance', 'Help'];
const ADMIN_ONLY = ['People', 'Companies', 'Workspace settings', 'Trash', 'Export', 'Security'];

const person = (role: UserRole, id = `${role}-1`): User =>
  ({ id, name: `${role} person`, jobTitle: 'Tester', company: 'piixel', role, loginId: `${role}@x.com`, active: true }) as User;

const signIn = (role: UserRole) => useAuthStore.setState({ user: person(role), initialized: true, isLoading: false });

afterEach(() => {
  cleanup();
  useAuthStore.setState({ user: null, initialized: false, isLoading: false });
});

const labels = (items: { label: string }[]) => items.map((i) => i.label);

describe('what each role gets', () => {
  it('admins and employees get the identical "Me" list; only admins get "Admin"', () => {
    const admin = settingsGroupsFor('admin');
    const employee = settingsGroupsFor('employee');
    expect(admin.map((g) => g.title)).toEqual(['Me', 'Admin']);
    expect(employee.map((g) => g.title)).toEqual(['Me']);
    expect(labels(admin[0].items)).toEqual(ME_TEAM);
    expect(labels(employee[0].items)).toEqual(ME_TEAM);
    expect(labels(admin[1].items)).toEqual(ADMIN_ONLY);
  });

  it('clients get a shorter list: no Focus mode, no Connected apps, no Admin', () => {
    const client = settingsGroupsFor('client');
    expect(client.map((g) => g.title)).toEqual(['Me']);
    expect(labels(client[0].items)).toEqual(ME_CLIENT);
  });

  it('every admin item is admin-only, and nothing is available to someone without a role', () => {
    expect(ADMIN_ITEMS.every((i) => i.roles.length === 1 && i.roles[0] === 'admin')).toBe(true);
    expect(ME_ITEMS.every((i) => i.roles.includes('admin'))).toBe(true);
    expect(settingsGroupsFor(undefined)).toEqual([]);
  });

  it('each role has its own part of the app, and profiles open inside it', () => {
    expect([basePath('admin'), basePath('employee'), basePath('client')]).toEqual(['/admin', '/app', '/client']);
    expect(profilePath('client', 'u9')).toBe('/client/people/u9');
  });
});

const Where: React.FC = () => <p data-testid="where">{useLocation().pathname}</p>;

const settingsAt = (role: UserRole, path: string) => {
  signIn(role);
  render(
    <MemoryRouter initialEntries={[path]}>
      <Where />
      <Routes>
        <Route path={`${basePath(role)}/settings/:section?`} element={<SettingsPage />} />
      </Routes>
    </MemoryRouter>
  );
};

const sidebar = () => within(screen.getByRole('navigation', { name: 'Settings sections' }));
const where = () => screen.getByTestId('where').textContent;

describe('the settings page', () => {
  it.each([
    ['admin', ME_TEAM.concat(ADMIN_ONLY)],
    ['employee', ME_TEAM],
    ['client', ME_CLIENT]
  ] as const)('%s sees exactly their sections', (role, expected) => {
    settingsAt(role, `${basePath(role)}/settings/profile`);
    const seen = sidebar()
      .getAllByRole('link')
      .map((a) => a.textContent);
    expect(seen).toEqual(expected);
    expect(screen.getByText('profile-body')).toBeTruthy();
  });

  it('an employee opening an admin section is sent back to their profile', () => {
    for (const id of ['people', 'companies', 'workspace', 'trash', 'export', 'security']) {
      cleanup();
      settingsAt('employee', `/app/settings/${id}`);
      expect(where()).toBe('/app/settings/profile');
      expect(screen.queryByText(`${id}-body`)).toBeNull();
    }
  });

  it('a client cannot open Connected apps, Focus mode or Keyboard shortcuts, or any admin section', () => {
    for (const id of ['connected-apps', 'focus', 'shortcuts', 'people', 'security']) {
      cleanup();
      settingsAt('client', `/client/settings/${id}`);
      expect(where()).toBe('/client/settings/profile');
      expect(screen.queryByText(`${id}-body`)).toBeNull();
    }
  });

  it('an employee does get Connected apps and Focus mode, like an admin', () => {
    settingsAt('employee', '/app/settings/connected-apps');
    expect(screen.getByText('connected-apps-body')).toBeTruthy();
    cleanup();
    settingsAt('employee', '/app/settings/focus');
    expect(screen.getByText('focus-body')).toBeTruthy();
  });

  it('settings with no section open the profile', () => {
    settingsAt('client', '/client/settings');
    expect(where()).toBe('/client/settings/profile');
  });
});

describe('route guards', () => {
  const app = (path: string, role: UserRole) => {
    signIn(role);
    render(
      <MemoryRouter initialEntries={[path]}>
        <Where />
        <Routes>
          <Route
            path="/admin/*"
            element={
              <AuthGuard>
                <AdminGuard>
                  <p>admin-area</p>
                </AdminGuard>
              </AuthGuard>
            }
          />
          <Route
            path="/app/*"
            element={
              <AuthGuard roles={['employee']}>
                <p>employee-area</p>
              </AuthGuard>
            }
          />
          <Route
            path="/client/*"
            element={
              <AuthGuard roles={['client']}>
                <p>client-area</p>
              </AuthGuard>
            }
          />
          <Route path="*" element={<p>elsewhere</p>} />
        </Routes>
      </MemoryRouter>
    );
  };

  it.each(['employee', 'client'] as const)('%s can never open admin settings pages', (role) => {
    for (const id of ['people', 'companies', 'workspace', 'trash', 'export', 'security']) {
      cleanup();
      app(`/admin/settings/${id}`, role);
      expect(screen.queryByText('admin-area')).toBeNull();
      expect(where()).toBe(homeForRole(role));
    }
  });

  it('a client cannot open the employee area and an employee cannot open the client area', () => {
    app('/app/settings/profile', 'client');
    expect(screen.queryByText('employee-area')).toBeNull();
    expect(where()).toBe('/client/portal');
    cleanup();
    app('/client/settings/profile', 'employee');
    expect(screen.queryByText('client-area')).toBeNull();
    expect(where()).toBe('/app/dashboard');
  });

  it('an admin can open the admin area', () => {
    app('/admin/settings/people', 'admin');
    expect(screen.getByText('admin-area')).toBeTruthy();
  });
});

describe('the avatar menu', () => {
  const open = (role: UserRole) => {
    signIn(role);
    render(
      <MemoryRouter>
        <AccountMenu />
      </MemoryRouter>
    );
    fireEvent.click(screen.getByRole('button', { name: 'Account menu' }));
    return screen.getAllByRole('menuitem').map((m) => m.textContent?.trim());
  };

  it('lists the same items as the settings page, plus Log out', () => {
    expect(open('employee')).toEqual([...ME_TEAM, 'Log out']);
  });

  it('adds the Admin section for admins only', () => {
    expect(open('admin')).toEqual([...ME_TEAM, ...ADMIN_ONLY, 'Log out']);
  });

  it('gives clients the short list', () => {
    expect(open('client')).toEqual([...ME_CLIENT, 'Log out']);
  });

  it('links into the role\'s own settings and its own profile view', () => {
    open('client');
    const hrefs = screen.getAllByRole('menuitem').map((m) => m.getAttribute('href'));
    expect(hrefs.slice(0, 5)).toEqual(['profile', 'password', 'notifications', 'appearance', 'help'].map((id) => `/client/settings/${id}`));
    expect(screen.getAllByRole('link').some((a) => a.getAttribute('href') === '/client/people/client-1')).toBe(true);
  });
});

describe('opening a profile', () => {
  it.each([
    ['admin', '/admin/people/u7'],
    ['employee', '/app/people/u7'],
    ['client', '/client/people/u7']
  ] as const)('a name or avatar links to the profile inside the %s area', (role, href) => {
    signIn(role);
    render(
      <MemoryRouter>
        <PersonLink userId="u7">Pat</PersonLink>
      </MemoryRouter>
    );
    expect(screen.getByRole('link', { name: 'Pat' }).getAttribute('href')).toBe(href);
  });

  it('is plain text when there is no person to open', () => {
    signIn('employee');
    render(
      <MemoryRouter>
        <PersonLink userId={null}>Former member</PersonLink>
      </MemoryRouter>
    );
    expect(screen.queryByRole('link')).toBeNull();
    expect(screen.getByText('Former member')).toBeTruthy();
  });
});
