import { api, getErrorMessage } from '../api';

export interface Celebration {
  user_id: string;
  name: string;
  avatar_url: string | null;
  kind: 'birthday' | 'milestone';
  /** "Birthday", or "1 month with Piixel" / "2 years with Unwork". */
  label: string;
  months: number | null;
  /** Milestones: "1 year", "3 months". */
  duration: string | null;
  /** Their company's name. */
  company: string | null;
}

export interface FestivalGreeting {
  id: string;
  name: string;
  /** YYYY-MM-DD */
  date: string;
  message: string;
}

export type FestivalGreetingInput = Omit<FestivalGreeting, 'id'>;

export interface TodayCelebrations {
  people: Celebration[];
  festivals: FestivalGreeting[];
}

async function call<T>(fn: () => Promise<{ data: T }>, fallback: string): Promise<T> {
  try {
    return (await fn()).data;
  } catch (err) {
    throw new Error(getErrorMessage(err, fallback));
  }
}

export const celebrationApi = {
  today: () => call<TodayCelebrations>(() => api.get('/celebrations/today'), 'Could not load today’s celebrations'),
  festivals: () => call<FestivalGreeting[]>(() => api.get('/celebrations/festivals'), 'Could not load the festival greetings'),
  addFestival: (input: FestivalGreetingInput) => call<FestivalGreeting>(() => api.post('/celebrations/festivals', input), 'Could not add the festival greeting'),
  editFestival: (id: string, input: FestivalGreetingInput) =>
    call<FestivalGreeting>(() => api.patch(`/celebrations/festivals/${id}`, input), 'Could not save the festival greeting'),
  removeFestival: async (id: string): Promise<void> => {
    await call(() => api.delete(`/celebrations/festivals/${id}`), 'Could not remove the festival greeting');
  }
};
