import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { BookingConfirmedModal, googleCalendarDayUrl } from './BookingConfirmedModal';
import type { Booking } from '../../../services/http/calendarApi';

afterEach(cleanup);

const booking: Booking = {
  id: 'b1',
  host_user_id: 'h',
  booked_by: 'me',
  start: new Date(2026, 10, 3, 14, 0).toISOString(),
  end: new Date(2026, 10, 3, 14, 30).toISOString(),
  title: 'Sync',
  note: '',
  meet_url: 'https://meet.google.com/abc-defg-hij',
  attendees: []
};

describe('BookingConfirmedModal', () => {
  it('shows the date, time, length, guests and the Meet link, with the three buttons', () => {
    render(<BookingConfirmedModal booking={booking} host={{ name: 'Hana Host' }} guests={[{ name: 'Gus Guest' }]} onClose={vi.fn()} />);
    expect(screen.getByRole('dialog', { name: 'Booking confirmed' })).toBeTruthy();
    expect(screen.getByText('3')).toBeTruthy();
    expect(screen.getByText('14:00 – 14:30')).toBeTruthy();
    expect(screen.getByText('30 min')).toBeTruthy();
    expect(screen.getByText('Hana Host, Gus Guest')).toBeTruthy();
    expect(screen.getByText('meet.google.com/abc-defg-hij')).toBeTruthy();
    expect(screen.getByRole('link', { name: /Open in Google Calendar/ }).getAttribute('href')).toBe('https://calendar.google.com/calendar/u/0/r/day/2026/11/3');
    expect(screen.getByRole('link', { name: /Join Meet/ }).getAttribute('href')).toBe(booking.meet_url);
    expect(screen.getByRole('button', { name: 'Done' })).toBeTruthy();
  });

  it('copies the Meet link', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    render(<BookingConfirmedModal booking={booking} host={null} guests={[]} onClose={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Copy Meet link' }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(booking.meet_url));
  });

  it('leaves out Join Meet and the link when Google has not made one, and Done / Escape close it', () => {
    const onClose = vi.fn();
    render(<BookingConfirmedModal booking={{ ...booking, meet_url: '' }} host={null} guests={[]} onClose={onClose} />);
    expect(screen.queryByRole('link', { name: /Join Meet/ })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Copy Meet link' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Done' }));
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it('renders nothing without a booking', () => {
    render(<BookingConfirmedModal booking={null} host={null} guests={[]} onClose={vi.fn()} />);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('builds the Google Calendar day link', () => {
    expect(googleCalendarDayUrl(new Date(2026, 0, 9))).toBe('https://calendar.google.com/calendar/u/0/r/day/2026/1/9');
  });
});
