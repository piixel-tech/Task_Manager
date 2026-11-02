import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { groupByDay, NotificationIcon, stripEmoji, typeVisual } from './notificationVisuals';
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

describe('notification icons', () => {
  it('maps each kind to its icon tone: status colours for approved, rejected, due soon and overdue', () => {
    expect(typeVisual('task_assigned').tone).toBe('primary');
    expect(typeVisual('mention').tone).toBe('primary');
    expect(typeVisual('review_approved').tone).toBe('success');
    expect(typeVisual('approval_answered', 'Approved: Is the logo OK?').tone).toBe('success');
    expect(typeVisual('approval_answered', '\u2705 Approved: old title with an emoji').tone).toBe('success');
    expect(typeVisual('approval_answered', 'Rejected: Is the logo OK?').tone).toBe('danger');
    expect(typeVisual('review_changes_requested').tone).toBe('danger');
    expect(typeVisual('task_due')).toMatchObject({ tone: 'warning', system: true });
    expect(typeVisual('task_overdue')).toMatchObject({ tone: 'danger', system: true });
    expect(typeVisual('festival_started')).toMatchObject({ system: true });
    expect(typeVisual('something_new').system).toBe(false); // unknown kinds still get an icon
  });

  it('strips emoji from notification text, old and new', () => {
    expect(stripEmoji('\u2705 Approved: Logo \u{1F389}')).toBe('Approved: Logo');
    expect(stripEmoji('Today is Sam\u2019s birthday \u{1F382}')).toBe('Today is Sam\u2019s birthday');
    expect(stripEmoji('Plain text 12:30 #5')).toBe('Plain text 12:30 #5');
  });

  it('shows the person with a type badge when someone triggered it, and a tile for system notifications', () => {
    const { container, rerender } = render(<NotificationIcon n={{ type: 'mention', title: 'Sam mentioned you', actor: { id: 'u1', name: 'Sam Rivera', avatarUrl: null } }} />);
    expect(screen.getByText('SR')).toBeTruthy(); // initials fallback
    expect(container.querySelectorAll('svg').length).toBe(1); // the type badge
    rerender(<NotificationIcon n={{ type: 'task_due', title: 'Due soon', actor: { id: 'u1', name: 'Sam Rivera', avatarUrl: null } }} />);
    expect(screen.queryByText('SR')).toBeNull(); // system types never show a person
    expect(container.querySelector('[class*="rounded-[10px]"]')).toBeTruthy();
  });
});
