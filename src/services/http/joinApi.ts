import { api, getErrorMessage } from '../api';

export interface InvitePreview {
  group_name: string;
  invited_by: string | null;
  project_name: string | null;
  expires_at: string;
}

async function call<T>(fn: () => Promise<{ data: T }>, fallback: string): Promise<T> {
  try {
    return (await fn()).data;
  } catch (err) {
    throw new Error(getErrorMessage(err, fallback));
  }
}

/** The /join/<token> page: public preview, client sign-up and joining. */
export const joinApi = {
  preview: (token: string) => call<InvitePreview>(() => api.get(`/invites/${encodeURIComponent(token)}`), 'This invite link is not valid'),
  /** Creates the client account and joins the group. The caller then logs in with the same details. */
  signup: (token: string, body: { name: string; email: string; password: string }) =>
    call<{ group_id: string }>(() => api.post(`/invites/${encodeURIComponent(token)}/signup`, body), 'Could not create your account'),
  join: (token: string) => call<{ group_id: string }>(() => api.post(`/invites/${encodeURIComponent(token)}/join`), 'Could not join the group')
};
