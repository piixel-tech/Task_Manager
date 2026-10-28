import { api, getErrorMessage } from '../api';

async function call(fn: () => Promise<{ data: { focus_until: string | null } }>, fallback: string): Promise<string | null> {
  try {
    return (await fn()).data.focus_until;
  } catch (err) {
    throw new Error(getErrorMessage(err, fallback));
  }
}

export const focusApi = {
  /** Quiet for a number of minutes, or until a given moment. Resolves to when Focus ends. */
  start: (when: { minutes: number } | { until: string }) => call(() => api.put('/focus', when), 'Could not start Focus mode'),
  end: () => call(() => api.delete('/focus'), 'Could not end Focus mode')
};
