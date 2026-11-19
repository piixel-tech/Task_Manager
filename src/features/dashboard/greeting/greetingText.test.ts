import { describe, expect, it } from 'vitest';
import { DEFAULT_GREETING } from '../../../services/http/accountApi';
import { dashboardHeading, dashboardTitle, greetingSubtitle, headingScale, greetingTitle, isFirstDayBack, previousWorkday, ROTATING_OPENERS, timeOpener } from './greetingText';

const at = (iso: string) => new Date(iso);

describe('greetingTitle', () => {
  it('follows the time of day, with a late-night line after 9 pm', () => {
    expect(timeOpener(9).text).toBe('Good morning');
    expect(timeOpener(14).text).toBe('Good afternoon');
    expect(timeOpener(19).text).toBe('Good evening');
    expect(timeOpener(21).lateNight).toBe(true);
    expect(timeOpener(2).lateNight).toBe(true);
  });
  it('greets by name for the time of day', () => {
    expect(greetingTitle({ defaultName: 'Kanisha', prefs: DEFAULT_GREETING, now: at('2026-11-18T09:00:00') })).toBe('Good morning, Kanisha');
    expect(greetingTitle({ defaultName: 'Kanisha', prefs: DEFAULT_GREETING, now: at('2026-11-18T14:00:00') })).toBe('Good afternoon, Kanisha');
  });
  it('rotates one opener per day and keeps the late-night line', () => {
    const day = at('2026-11-18T10:00:00');
    const t = greetingTitle({ defaultName: 'K', prefs: { ...DEFAULT_GREETING, rotate: true }, now: day });
    expect(ROTATING_OPENERS.some((o) => t.startsWith(`${o}, `))).toBe(true);
    expect(greetingTitle({ defaultName: 'K', prefs: { ...DEFAULT_GREETING, rotate: true }, now: at('2026-11-18T10:59:00') })).toBe(t);
    expect(greetingTitle({ defaultName: 'K', prefs: { ...DEFAULT_GREETING, rotate: true }, now: at('2026-11-18T23:00:00') })).toBe('Burning the midnight oil, K');
  });
});

describe('greetingSubtitle', () => {
  const wed = at('2026-11-18T09:00:00');
  it('picks the most pressing line', () => {
    expect(greetingSubtitle({ overdue: 0, dueToday: 0, backFromLeave: true, now: wed })).toMatch(/leave/);
    expect(greetingSubtitle({ overdue: 2, dueToday: 1, backFromLeave: false, now: wed })).toMatch(/2 tasks are overdue, and 1 due today/);
    expect(greetingSubtitle({ overdue: 0, dueToday: 1, backFromLeave: false, now: wed })).toBe('1 task is due today.');
    expect(greetingSubtitle({ overdue: 0, dueToday: 0, backFromLeave: false, now: wed })).toMatch(/Nothing due/);
  });
  it('mentions Friday and Monday when nothing is due', () => {
    expect(greetingSubtitle({ overdue: 0, dueToday: 0, backFromLeave: false, now: at('2026-11-20T09:00:00') })).toMatch(/Friday/);
    expect(greetingSubtitle({ overdue: 0, dueToday: 0, backFromLeave: false, now: at('2026-11-16T09:00:00') })).toMatch(/week/);
  });
});

describe('first day back from leave', () => {
  const leave = (start: string, end: string) => ({ type: 'leave', status: 'approved', start_date: start, end_date: end });
  it('skips weekends', () => {
    expect(previousWorkday('2026-11-16')).toBe('2026-11-13');
  });
  it('is true the working day after leave ended, false after that or while away', () => {
    expect(isFirstDayBack([leave('2026-11-12', '2026-11-13')], '2026-11-16')).toBe(true);
    expect(isFirstDayBack([leave('2026-11-12', '2026-11-13')], '2026-11-17')).toBe(false);
    expect(isFirstDayBack([leave('2026-11-12', '2026-11-18')], '2026-11-17')).toBe(false);
    expect(isFirstDayBack([{ ...leave('2026-11-12', '2026-11-13'), status: 'pending' }], '2026-11-16')).toBe(false);
  });
});

describe('dashboardTitle priority', () => {
  const now = at('2026-11-18T09:00:00');
  const base = { defaultName: 'Kanisha', prefs: DEFAULT_GREETING, now };
  const birthday = { kind: 'birthday' as const, label: 'Birthday', months: null };
  const year = { kind: 'milestone' as const, label: '1 year with Piixel', months: 12, duration: '1 year', company: 'Piixel' };
  const month = { kind: 'milestone' as const, label: '1 month with Piixel', months: 1, duration: '1 month', company: 'Piixel' };
  const sam = { kind: 'birthday' as const, label: 'Birthday', months: null, name: 'Sam Lee' };
  const lee = { kind: 'milestone' as const, label: '1 year with Piixel', months: 12, duration: '1 year', company: 'Piixel', name: 'Lee Wong' };
  const festivals = [{ name: 'Diwali', message: 'Happy Diwali, team!' }];

  it('my own celebration comes first, over everyone else and any festival', () => {
    expect(dashboardTitle({ ...base, mine: [birthday], others: [sam], festivals })).toBe('Happy birthday, Kanisha!');
    expect(dashboardHeading({ ...base, mine: [birthday], others: [sam], festivals }).kind).toBe('own');
  });
  it('words a work anniversary with the duration and company, using the biggest one', () => {
    expect(dashboardTitle({ ...base, mine: [month, year] })).toBe('Happy 1 year at Piixel, Kanisha!');
    expect(dashboardTitle({ ...base, mine: [month] })).toBe('Happy 1 month at Piixel, Kanisha!');
    expect(dashboardTitle({ ...base, mine: [{ ...year, company: null }] })).toBe('Happy 1 year on the team, Kanisha!');
  });
  it('then somebody else\'s celebration, over a festival', () => {
    const h = dashboardHeading({ ...base, mine: [], others: [sam], festivals });
    expect(h.text).toBe("Today is Sam's birthday");
    expect(h.kind).toBe('others');
    expect(h.people).toEqual([sam]);
  });
  it('puts several people in one line', () => {
    expect(dashboardTitle({ ...base, others: [sam, { ...sam, name: 'Ann Bell' }] })).toBe("Today is Sam's and Ann's birthdays");
    expect(dashboardTitle({ ...base, others: [lee] })).toBe('Lee completes 1 year at Piixel today');
    expect(dashboardTitle({ ...base, others: [lee, { ...lee, name: 'Mia Fox' }] })).toBe('Lee and Mia complete 1 year at Piixel today');
    expect(dashboardTitle({ ...base, others: [sam, lee] })).toBe("Today is Sam's birthday \u00b7 Lee completes 1 year at Piixel today");
  });
  it('then a festival, over the normal greeting', () => {
    const h = dashboardHeading({ ...base, mine: [], others: [], festivals });
    expect(h.text).toBe('Happy Diwali, team!');
    expect(h.kind).toBe('festival');
    expect(h.festival).toBe('Diwali');
  });
  it('falls back to the normal greeting', () => {
    expect(dashboardHeading({ ...base, mine: [], others: [], festivals: [] })).toMatchObject({ text: 'Good morning, Kanisha', kind: 'normal' });
  });
});

describe('headingScale', () => {
  it('keeps short headings full size and shrinks long ones in steps', () => {
    expect(headingScale('Good morning, Kanisha')).toBe(1);
    expect(headingScale('Happy 1 month at Piixel, Kanisha!')).toBe(0.86);
    expect(headingScale("Today is Sam's and Ann's birthdays today yes")).toBe(0.72);
    expect(headingScale("Today is Sam's and Ann's birthdays · Lee completes 1 year at Piixel today")).toBe(0.62);
  });
});
