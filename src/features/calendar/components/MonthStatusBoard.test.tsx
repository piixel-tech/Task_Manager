import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { eachDayOfInterval } from 'date-fns';
import { MonthStatusBoard } from './MonthStatusBoard';
import type { StatusEntry } from '../../../services/http/calendarApi';
import type { DayStatus } from '../../status/statusMeta';
import type { DayOff } from '../../workspace/dayOff';

const month = new Date(2026, 4, 1); // May 2026
const days = eachDayOfInterval({ start: new Date(2026, 3, 27), end: new Date(2026, 5, 7) });
const people = new Map([
  ['a', { name: 'Ana Admin', avatar_url: null }],
  ['b', { name: 'Ben Builder', avatar_url: null }],
  ['c', { name: 'Cleo Coder', avatar_url: null }]
]);
const team: StatusEntry[] = [
  { user_id: 'a', date: '2026-05-12', status: 'wfh' },
  { user_id: 'b', date: '2026-05-12', status: 'wfh' },
  { user_id: 'c', date: '2026-05-12', status: 'leave' }
];
const hostStatuses = new Map<string, DayStatus>([
  ['2026-05-12', 'wfh'],
  ['2026-05-13', 'half_day']
]);
const dayOff = (d: Date): DayOff | null =>
  d.getDate() === 14 && d.getMonth() === 4
    ? { kind: 'holiday', name: 'Founders Day', holiday: { id: 'h', date: '2026-05-14', end_date: null, name: 'Founders Day', type: 'company', company_ids: [] } }
    : d.getDay() === 0
      ? { kind: 'weekoff', name: 'Week off' }
      : null;

const board = () =>
  render(
    <MonthStatusBoard
      month={month}
      days={days}
      selected={new Date(2026, 4, 12)}
      onSelect={vi.fn()}
      onMonth={vi.fn()}
      hostName="My status"
      hostStatuses={hostStatuses}
      team={team}
      people={people}
      dayOff={dayOff}
    />
  );

describe('MonthStatusBoard', () => {
  afterEach(cleanup);

  it('has a legend of every status, each with a label', () => {
    board();
    const legend = screen.getByRole('group', { name: 'Filter by status' });
    for (const label of ['Office', 'WFH', 'Half day', 'Leave', 'Holiday', 'Weekend']) expect(within(legend).getByRole('button', { name: label })).toBeTruthy();
  });

  it('shows the personal status as an icon + label pill, and the holiday name in its cell', () => {
    board();
    const cell = screen.getByRole('button', { name: /Tuesday 12 May, Working from home/ });
    expect(within(cell).getByText('WFH')).toBeTruthy();
    expect(cell.querySelector('svg')).toBeTruthy();
    expect(screen.getByRole('button', { name: /14 May, Founders Day/ })).toBeTruthy();
    expect(screen.getAllByText('Founders Day').length).toBeGreaterThan(0);
  });

  it('filters by status from the legend, and clears', () => {
    board();
    const wfh = within(screen.getByRole('group', { name: 'Filter by status' })).getByRole('button', { name: 'WFH' });
    expect(wfh.getAttribute('aria-pressed')).toBe('false');
    fireEvent.click(wfh);
    expect(wfh.getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(screen.getByRole('button', { name: 'Clear' }));
    expect(wfh.getAttribute('aria-pressed')).toBe('false');
  });

  it('lists who is where when a day is hovered', () => {
    board();
    const cell = screen.getByRole('button', { name: /Tuesday 12 May/ });
    fireEvent.mouseEnter(cell.parentElement as HTMLElement);
    const tip = screen.getByRole('tooltip');
    expect(within(tip).getByText(/WFH 2/)).toBeTruthy();
    expect(within(tip).getByText('Ana Admin, Ben Builder')).toBeTruthy();
    expect(within(tip).getByText(/Leave 1/)).toBeTruthy();
    expect(within(tip).getByText('Cleo Coder')).toBeTruthy();
  });

  it('team view shows a count per status', () => {
    board();
    fireEvent.click(screen.getByRole('tab', { name: 'Team' }));
    const cell = screen.getByRole('button', { name: /Tuesday 12 May/ });
    expect(within(cell).getByText('2')).toBeTruthy(); // WFH 2
    expect(within(cell).getByText('1')).toBeTruthy(); // Leave 1
  });
});
