import { api, getErrorMessage } from '../api';

/** One person in the team picker. */
export interface TeamMember {
  id: string;
  name: string;
  avatar_url: string | null;
  role: string;
  /** Job title from their profile (may be empty). */
  title: string;
  company_id: string | null;
  company_name: string;
}

export const directoryApi = {
  /** Every active admin and employee of every company except you (no paging), ordered by company then name. */
  team: async (): Promise<TeamMember[]> => {
    try {
      return (await api.get<TeamMember[]>('/users/team')).data;
    } catch (err) {
      throw new Error(getErrorMessage(err, 'Could not load the team'));
    }
  }
};
