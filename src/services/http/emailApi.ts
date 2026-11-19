import { api, getErrorMessage } from '../api';

export interface EmailSender {
  address: string;
  status: 'connected' | 'needs_reconnect';
  connected_at: string;
}

export interface EmailStatus {
  configured: boolean;
  setup_problem: string | null;
  redirect_uri: string;
  sender: EmailSender | null;
}

export interface EmailLogRow {
  id: string;
  to: string;
  type: string;
  subject: string;
  status: 'queued' | 'sent' | 'failed';
  error: string | null;
  attempts: number;
  created_at: string;
  sent_at: string | null;
}

async function call<T>(fn: () => Promise<{ data: T }>, fallback: string): Promise<T> {
  try {
    return (await fn()).data;
  } catch (err) {
    throw new Error(getErrorMessage(err, fallback));
  }
}

export const emailApi = {
  status: () => call<EmailStatus>(() => api.get('/email'), 'Could not load the email settings'),
  /** Where to send the browser for Google's consent screen. */
  connect: async () => (await call<{ auth_url: string }>(() => api.post('/email/connect'), 'Could not start the Google sign-in')).auth_url,
  disconnect: async (): Promise<void> => {
    await call(() => api.delete('/email'), 'Could not disconnect the mailbox');
  },
  sendTest: () => call<EmailLogRow>(() => api.post('/email/test'), 'Could not send the test email'),
  log: () => call<{ items: EmailLogRow[]; total: number }>(() => api.get('/email/log', { params: { limit: 50 } }), 'Could not load the email log')
};
