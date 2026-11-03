import { api, getErrorMessage } from '../api';
import type { DayStatus } from '../../features/status/statusMeta';

export interface MyToday {
  date: string;
  status: DayStatus | null;
}

export interface TodayRow {
  user_id: string;
  name: string;
  avatar_url: string | null;
  company_id: string | null;
  role: string;
  /** Job title from their profile (may be empty). */
  title?: string;
  status: DayStatus | null;
  is_head: boolean;
}

export interface StatusEntry {
  user_id: string;
  date: string;
  status: DayStatus;
}

export interface Booking {
  id: string;
  host_user_id: string;
  booked_by: string;
  start: string;
  end: string;
  title: string;
  note: string;
  /** The Google Meet link, once Google has made one. Empty for people who are not in the meeting. */
  meet_url?: string;
  /** Guests invited through Google besides the host and the booker (only for people in the meeting). */
  attendees?: { email: string; name: string; user_id: string | null }[];
}

export interface BookingInput {
  host_user_id: string;
  start: string;
  end: string;
  title: string;
  note: string;
  /** Teammates by id, anyone else by email. Google emails each an invitation with the Meet link. */
  attendees?: ({ user_id: string } | { email: string })[];
}

/** Run a request and surface the backend's message (e.g. "That slot overlaps...") as an Error. */
async function call<T>(fn: () => Promise<{ data: T }>, fallback: string): Promise<T> {
  try {
    return (await fn()).data;
  } catch (err) {
    throw new Error(getErrorMessage(err, fallback));
  }
}

export const statusApi = {
  myToday: () => call<MyToday>(() => api.get('/daily-status/me/today'), 'Could not load your status'),
  setToday: (status: DayStatus) =>
    call<StatusEntry>(() => api.put('/daily-status/today', { status }), 'Could not save your status'),
  overview: (date?: string) =>
    call<TodayRow[]>(() => api.get('/daily-status', { params: { date } }), 'Could not load the team status'),
  /** Everyone's statuses in a date range (the calendar's team view and day popover). */
  team: (from: string, to: string) =>
    call<StatusEntry[]>(() => api.get('/daily-status/team', { params: { from, to } }), 'Could not load the team calendar'),
  range: (userId: string, from: string, to: string) =>
    call<StatusEntry[]>(
      () => api.get(`/daily-status/users/${userId}`, { params: { from, to } }),
      'Could not load statuses'
    )
};

export const bookingApi = {
  list: (hostUserId: string, from: string, to: string) =>
    call<Booking[]>(
      () => api.get('/bookings', { params: { host_user_id: hostUserId, from, to } }),
      'Could not load bookings'
    ),
  create: (input: BookingInput) => call<Booking>(() => api.post('/bookings', input), 'Could not book the slot'),
  cancel: (id: string) => call<void>(() => api.delete(`/bookings/${id}`), 'Could not cancel the booking')
};
