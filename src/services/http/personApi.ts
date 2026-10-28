import { api, getErrorMessage } from '../api';

/** What anyone may see of a person: no email, phone or settings. */
export interface PersonProfile {
  id: string;
  name: string;
  role: 'admin' | 'employee' | 'client';
  avatar_url: string | null;
  title: string;
  bio: string;
  company: string | null;
  /** Today's daily status, if they are on the team and have set one. */
  status: 'present' | 'wfh' | 'half_day' | 'leave' | null;
  in_focus: boolean;
}

export const personApi = {
  profile: async (userId: string): Promise<PersonProfile> => {
    try {
      return (await api.get<PersonProfile>(`/users/${userId}/profile`)).data;
    } catch (err) {
      throw new Error(getErrorMessage(err, 'Could not load this profile'));
    }
  }
};
