import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ConnectedAppsSection } from './ConnectedAppsSection';
import { integrationApi, type ConnectedApp } from '../../../services/http/integrationApi';

// The confirm dialog host is mounted elsewhere in the app: here it just runs the action straight away.
vi.mock('../../../hooks/useConfirm', () => ({
  useConfirm: () => async (options: { action?: () => Promise<void> }) => {
    await options.action?.();
    return true;
  }
}));
vi.mock('../../../services/http/integrationApi', () => ({
  integrationApi: { list: vi.fn(), connect: vi.fn(), syncNow: vi.fn(), saveConfig: vi.fn(), disconnect: vi.fn() }
}));

function app(opts: { status?: 'connected' | 'needs_reconnect'; missing?: string[]; connected?: boolean }): ConnectedApp {
  return {
    key: 'google',
    name: 'Google',
    description: 'Calendar, Meet, Drive, Docs and Sheets.',
    configured: true,
    setup_problem: null,
    extras: { push_available: false },
    connection:
      opts.connected === false
        ? null
        : {
            status: opts.status ?? 'connected',
            account: 'ann@example.com',
            connected_at: '2026-11-01T00:00:00Z',
            last_sync_at: null,
            last_error: null,
            last_error_at: null,
            config: { calendars: [], write_calendar: null, push_active: false, push_error: null, missing: opts.missing ?? [] }
          }
  };
}

const show = async (a: ConnectedApp, ready: RegExp | string) => {
  vi.mocked(integrationApi.list).mockResolvedValue([a]);
  render(
    <MemoryRouter>
      <ConnectedAppsSection />
    </MemoryRouter>
  );
  await screen.findByText(ready);
};

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('Connected apps: one Google connection', () => {
  it('offers a single Connect to Google button that asks for everything at once', async () => {
    vi.mocked(integrationApi.connect).mockResolvedValue(''); // no address: the test must not navigate away
    await show(app({ connected: false }), /Connect to Google/);
    expect(screen.getAllByRole('button', { name: /connect/i })).toHaveLength(1);
    fireEvent.click(screen.getByRole('button', { name: /Connect to Google/ }));
    await waitFor(() => expect(integrationApi.connect).toHaveBeenCalledWith('google'));
  });

  it('shows one status and no per-service switches once connected', async () => {
    await show(app({}), 'ann@example.com');
    expect(screen.getAllByText('Connected')).toHaveLength(1);
    expect(screen.queryByText('Google services')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Allow' })).toBeNull();
    expect(screen.queryByText(/Reconnect to Google once/)).toBeNull();
  });

  it('gives an older connection one reconnect prompt naming what it will turn on', async () => {
    vi.mocked(integrationApi.connect).mockResolvedValue('');
    await show(app({ missing: ['Drive', 'Docs & Sheets'] }), /Reconnect to Google once/);
    expect(screen.getByText(/Drive, Docs & Sheets/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Reconnect to Google' }));
    await waitFor(() => expect(integrationApi.connect).toHaveBeenCalledWith('google'));
  });

  it('a revoked login shows Needs reconnecting and a Reconnect Google button', async () => {
    vi.mocked(integrationApi.connect).mockResolvedValue('');
    await show(app({ status: 'needs_reconnect' }), 'Needs reconnecting');
    expect(screen.queryByText(/Reconnect to Google once/)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Reconnect Google' }));
    await waitFor(() => expect(integrationApi.connect).toHaveBeenCalledWith('google'));
  });
});
