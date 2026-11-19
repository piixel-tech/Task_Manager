import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { Briefcase, Calendar, CheckSquare, Home, MessagesSquare, Megaphone, Settings } from 'lucide-react';
import { PhoneTabBar } from './PhoneTabBar';

vi.mock('./navItems', () => ({
  WithNavItems: ({ children }: { children: (n: unknown) => React.ReactNode }) =>
    children({
      main: [
        { label: 'Home', icon: Home, path: '/app/dashboard' },
        { label: 'Projects', icon: Briefcase, path: '/app/projects' },
        { label: 'My Tasks', icon: CheckSquare, path: '/app/tasks', count: 3 },
        { label: 'Chats', icon: MessagesSquare, path: '/app/chat' },
        { label: 'Office board', icon: Megaphone, path: '/app/office', count: 2 }
      ],
      more: [
        { label: 'Calendar', icon: Calendar, path: '/app/calendar' },
        { label: 'Settings', icon: Settings, path: '/app/settings/profile' }
      ]
    })
}));

afterEach(cleanup);
const view = (path = '/app/dashboard') =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <PhoneTabBar />
    </MemoryRouter>
  );

describe('phone tab bar', () => {
  it('shows four places and More, only visible on phones', () => {
    view();
    const bar = screen.getByRole('navigation', { name: 'Main' });
    expect(bar.className).toContain('md:hidden');
    expect(bar.className).toContain('tm-sidebar'); // the dark floating pill // phones only: tablets and desktop never see it
    expect(within(bar).getAllByRole('link').map((a) => a.textContent?.replace(/\d/g, ''))).toEqual(['Home', 'My Tasks', 'Projects', 'Chats']);
    expect(within(bar).getByRole('button', { name: /More/ })).toBeTruthy();
  });

  it('keeps badges, and More adds up the ones inside it', () => {
    view();
    const bar = screen.getByRole('navigation', { name: 'Main' });
    expect(within(bar).getByRole('link', { name: /My Tasks/ }).textContent).toContain('3');
    expect(within(bar).getByRole('button', { name: /More/ }).textContent).toContain('2'); // Office board has 2
  });

  it('opens a sheet with every other place, and closes it when one is chosen', () => {
    view();
    fireEvent.click(screen.getByRole('button', { name: /More/ }));
    const sheet = screen.getByRole('dialog', { name: 'More' });
    expect(within(sheet).getAllByRole('link').map((a) => a.textContent?.replace(/\d/g, ''))).toEqual(['Office board', 'Calendar', 'Settings']);
    fireEvent.click(within(sheet).getByRole('link', { name: 'Calendar' }));
    expect(screen.queryByRole('dialog', { name: 'More' })).toBeNull();
  });

  it('closes the sheet with Esc', () => {
    view();
    fireEvent.click(screen.getByRole('button', { name: /More/ }));
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByRole('dialog', { name: 'More' })).toBeNull();
  });
});
