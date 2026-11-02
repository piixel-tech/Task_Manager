import { describe, expect, it } from 'vitest';
import { Home } from 'lucide-react';
import { fitRail } from './SideNav';

const entry = (label: string, group: number) => ({ item: { label, icon: Home, path: `/${label}` }, group });

// The admin rail, in display order.
const admin = [
  entry('Home', 0),
  entry('Projects', 0),
  entry('Task Hub', 0),
  entry('Chats', 0),
  entry('Activity', 0),
  entry('Calendar', 0),
  entry('Reviews', 1),
  entry('Office board', 1),
  entry('Team Members', 1),
  entry('Settings', 2)
];

describe('rail fitting', () => {
  it('shows everything, at normal spacing, when there is room', () => {
    expect(fitRail(admin, 900)).toEqual({ dense: false, hidden: [] });
  });

  it('tightens the spacing before it moves anything into More', () => {
    // Normal spacing needs 710px for these 10 items, the dense rail 624px.
    expect(fitRail(admin, 720)).toEqual({ dense: false, hidden: [] });
    expect(fitRail(admin, 680)).toEqual({ dense: true, hidden: [] });
  });

  it('moves Board first, then Reviews, then Activity, and never Calendar or Home', () => {
    expect(fitRail(admin, 620).hidden).toEqual(['Office board', 'Reviews']); // one cut would not leave room for the More button
    expect(fitRail(admin, 575).hidden).toEqual(['Office board', 'Reviews', 'Activity']);
    for (const h of [620, 575, 500, 400, 200]) {
      const hidden = fitRail(admin, h).hidden;
      expect(hidden).not.toContain('Calendar');
      expect(hidden).not.toContain('Home');
    }
  });

  it('works for a rail without Calendar (clients)', () => {
    const client = [entry('Home', 0), entry('Chats', 0), entry('Approvals', 0), entry('Deliverables', 0), entry('Requirements', 0), entry('Book a meeting', 1)];
    expect(fitRail(client, 900).hidden).toEqual([]);
    expect(fitRail(client, 400).hidden).not.toContain('Home');
  });
});
