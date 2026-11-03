import { api, getErrorMessage } from '../api';

export interface CalendarChoice {
  id: string;
  name: string;
  color: string | null;
  primary: boolean;
  /** Task Manager may add events to it. */
  writable: boolean;
  selected: boolean;
}

export interface GoogleConfig {
  /** Services the stored login cannot use yet (a connection made before Drive/Docs/Sheets, or boxes left unticked). One reconnect fixes it. */
  missing: string[];
  calendars: CalendarChoice[];
  write_calendar: string | null;
  push_active: boolean;
  push_error: string | null;
}

export interface Connection {
  status: 'connected' | 'needs_reconnect';
  account: string;
  connected_at: string;
  last_sync_at: string | null;
  last_error: string | null;
  last_error_at: string | null;
  /** Provider-specific; for Google see GoogleConfig. */
  config: GoogleConfig;
}

export interface ConnectedApp {
  key: string;
  name: string;
  description: string;
  /** False when the server has no credentials for this person's company yet (.env). */
  configured: boolean;
  /** Why, e.g. "Google not configured for Piixel". */
  setup_problem: string | null;
  extras: { push_available?: boolean };
  connection: Connection | null;
}

/** The keys of the signed-in person's own company. The client secret is never sent. */
export interface ClientConfig {
  configured: boolean;
  company: string | null;
  client_id: string | null;
  api_key: string | null;
  message: string | null;
}

export interface ExternalEvent {
  id: string;
  provider: string;
  title: string;
  start: string;
  end: string;
  all_day: boolean;
  location: string;
  html_link: string;
  busy: boolean;
  /** Someone else's calendar: only "Busy" is shown. */
  private: boolean;
}

async function call<T>(fn: () => Promise<{ data: T }>, fallback: string): Promise<T> {
  try {
    return (await fn()).data;
  } catch (err) {
    throw new Error(getErrorMessage(err, fallback));
  }
}

export const integrationApi = {
  clientConfig: (key: string) =>
    call<ClientConfig>(() => api.get(`/integrations/${key}/client-config`), 'Could not load the app settings'),
  list: () => call<ConnectedApp[]>(() => api.get('/integrations'), 'Could not load your connected apps'),
  /** The address to send the browser to so the person can approve access. */
  connect: (key: string) =>
    call<{ auth_url: string }>(() => api.post(`/integrations/${key}/connect`), 'Could not start the connection').then((r) => r.auth_url),
  disconnect: (key: string) => call<{ revoked: boolean }>(() => api.delete(`/integrations/${key}`), 'Could not disconnect'),
  syncNow: (key: string) => call<Connection>(() => api.post(`/integrations/${key}/sync`), 'Sync failed'),
  saveConfig: (key: string, config: { selected?: string[]; write_calendar?: string }) =>
    call<Connection>(() => api.put(`/integrations/${key}/config`, config), 'Could not save your choices')
};

export const externalEventApi = {
  list: (hostUserId: string, from: string, to: string) =>
    call<ExternalEvent[]>(
      () => api.get('/external-events', { params: { host_user_id: hostUserId, from, to } }),
      'Could not load connected calendars'
    )
};
