import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { TourHost } from './TourHost';
import { TOUR_ID, tourFor, tourIdFor } from './tourSteps';
import { useAuthStore } from '../../store/authStore';
import { useDailyStatusStore } from '../../store/useDailyStatusStore';
import { useSettingsStore } from '../../store/useSettingsStore';
import { useTourStore } from '../../store/useTourStore';
import { DEFAULT_SETTINGS } from '../../services/http/accountApi';
import type { User } from '../../types';

describe('tour content', () => {
  it('has six steps, worded separately for the admin and employee panels', () => {
    const admin = tourFor('admin')!;
    const employee = tourFor('employee')!;
    expect(admin).toHaveLength(6);
    expect(employee).toHaveLength(6);
    expect(admin.map((s) => s.id)).toEqual(['rail', 'timer', 'tasks', 'chat', 'status', 'account']); // the same places…
    expect(admin.find((s) => s.id === 'tasks')!.title).toBe('Task Hub'); // …told for each panel
    expect(employee.find((s) => s.id === 'tasks')!.title).toBe('My Tasks');
    expect(admin.find((s) => s.id === 'account')!.text).toMatch(/Trash/);
    expect(employee.find((s) => s.id === 'account')!.text).not.toMatch(/Trash/);
  });

  it('is saved under a different id for each panel, and clients have none', () => {
    expect(TOUR_ID.admin).not.toBe(TOUR_ID.employee);
    expect(tourIdFor('client')).toBeNull();
    expect(tourFor('client')).toBeNull();
  });
});

const signIn = (role: 'admin' | 'employee' | 'client', tour: string | null = null) =>
  useAuthStore.setState({ user: { id: 'me', name: 'Me', role, companyId: 'c1', settings: { ...DEFAULT_SETTINGS, tour } } as unknown as User });
const statusSet = (status: string | null) => useDailyStatusStore.setState({ mineLoaded: true, today: { status } as never });

let update: ReturnType<typeof vi.fn>;
beforeEach(() => {
  update = vi.fn().mockResolvedValue(undefined);
  useSettingsStore.setState({ settings: { ...DEFAULT_SETTINGS }, update: update as never });
  useTourStore.setState({ open: false, step: 0 });
  useDailyStatusStore.setState({ mineLoaded: false, today: null });
});
afterEach(cleanup);

describe('the first-login tour', () => {
  it('starts for a new employee once their status for today is set', () => {
    signIn('employee');
    statusSet('present');
    render(<TourHost />);
    expect(screen.getByRole('dialog', { name: 'Quick tour' })).toBeTruthy();
    expect(screen.getByText('Step 1 of 6')).toBeTruthy();
  });

  it('waits while the daily status question is still open', () => {
    signIn('employee');
    statusSet(null);
    render(<TourHost />);
    expect(screen.queryByRole('dialog', { name: 'Quick tour' })).toBeNull();
    act(() => statusSet('wfh'));
    expect(screen.getByRole('dialog', { name: 'Quick tour' })).toBeTruthy();
  });

  it('shows the admin tour to an admin, and nothing to a client', () => {
    signIn('admin');
    statusSet('present');
    const { unmount } = render(<TourHost />);
    expect(screen.getByText('Your shortcuts')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(screen.getByText('Task Hub')).toBeTruthy();
    unmount();
    useTourStore.setState({ open: false, step: 0 });
    signIn('client');
    render(<TourHost />);
    expect(screen.queryByRole('dialog', { name: 'Quick tour' })).toBeNull();
  });

  it('steps forward and back, and the last step says Done', () => {
    signIn('employee');
    statusSet('present');
    render(<TourHost />);
    expect(screen.queryByRole('button', { name: 'Back' })).toBeNull(); // nothing before step one
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(screen.getByText('Step 2 of 6')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    expect(screen.getByText('Step 1 of 6')).toBeTruthy();
    for (let i = 0; i < 5; i += 1) fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(screen.getByText('Step 6 of 6')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Next' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Done' }));
    expect(screen.queryByRole('dialog', { name: 'Quick tour' })).toBeNull();
    expect(update).toHaveBeenCalledWith({ tour: TOUR_ID.employee });
  });

  it('can be skipped, with the button or Esc, and is remembered on the account', () => {
    signIn('employee');
    statusSet('present');
    render(<TourHost />);
    fireEvent.click(screen.getAllByRole('button', { name: /Skip tour/ })[0]);
    expect(screen.queryByRole('dialog', { name: 'Quick tour' })).toBeNull();
    expect(update).toHaveBeenCalledWith({ tour: TOUR_ID.employee });
    act(() => useTourStore.getState().start());
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByRole('dialog', { name: 'Quick tour' })).toBeNull();
  });

  it('does not start again once it has been finished, but can be replayed', () => {
    signIn('employee', TOUR_ID.employee);
    statusSet('present');
    render(<TourHost />);
    expect(screen.queryByRole('dialog', { name: 'Quick tour' })).toBeNull();
    act(() => useTourStore.getState().start()); // "Replay the tour" in Help
    expect(screen.getByText('Step 1 of 6')).toBeTruthy();
  });

  it('shows a step in the middle of the screen when what it points at is not there', () => {
    signIn('employee');
    statusSet('present');
    render(<TourHost />);
    const card = screen.getByRole('dialog', { name: 'Quick tour' });
    expect(card.querySelector('.ring-2')).toBeNull(); // no ring: the page here has no left bar
    expect(screen.getByText('Your shortcuts')).toBeTruthy();
  });
});
