import { describe, expect, it } from 'vitest';
import { groupByDay } from './notificationVisuals';
import type { AppNotification } from '../../types';

const mk = (id: string, iso: string): AppNotification =>
  ({ id, userId: 'u', type: 'task_due', title: id, message: '', link: '', createdAt: iso, read: false }) as AppNotification;

describe('groupByDay', () => {
  it('groups by day: Today, Yesterday, weekday this week, then date, newest first', () => {
    const now = new Date(2026, 9, 29, 12); // Thursday
    const g = groupByDay(
      [
        mk('c', new Date(2026, 9, 1).toISOString()),
        mk('w', new Date(2026, 9, 26, 10).toISOString()),
        mk('b', new Date(2026, 9, 28, 20).toISOString()),
        mk('a', new Date(2026, 9, 29, 9).toISOString())
      ],
      now
    );
    expect(g.map((x) => [x.label, x.items.map((i) => i.id)])).toEqual([
      ['Today · 29 Oct', ['a']],
      ['Yesterday · 28 Oct', ['b']],
      ['Monday · 26 Oct', ['w']],
      ['1 Oct', ['c']]
    ]);
    expect(groupByDay([], now)).toEqual([]);
  });
});
