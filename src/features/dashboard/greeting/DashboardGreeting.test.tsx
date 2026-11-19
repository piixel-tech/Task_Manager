import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { TodayCelebrations } from '../../../services/http/celebrationApi';
import { DEFAULT_SETTINGS } from '../../../services/http/accountApi';
import { useAuthStore } from '../../../store/authStore';
import { useCelebrationsStore } from '../../../store/useCelebrationsStore';
import { useSettingsStore } from '../../../store/useSettingsStore';
import type { User } from '../../../types';

// Animations finish at once in jsdom, so the burst would be gone before it can be looked at: draw motion elements as plain ones.
vi.mock('motion/react', async (importOriginal) => {
  const real = await importOriginal<typeof import('motion/react')>();
  const plain = new Proxy({}, {
    get: (_t, tag: string) =>
      React.forwardRef<HTMLElement, Record<string, unknown>>(function Plain(props, ref) {
        const { initial: _i, animate: _a, exit: _e, transition: _t2, variants: _v, whileHover: _h, whileTap: _w, layout: _l, onAnimationComplete: _c, ...rest } = props;
        return React.createElement(tag, { ...rest, ref });
      })
  });
  return { ...real, motion: plain };
});

let today: TodayCelebrations = { people: [], festivals: [] };
vi.mock('../../../services/http/celebrationApi', () => ({ celebrationApi: { today: () => Promise.resolve(today) } }));
const groups = vi.fn();
const createGroup = vi.fn();
vi.mock('../../../services/http/chatApi', () => ({ chatApi: { groups: () => groups(), createGroup: (...a: unknown[]) => createGroup(...a) } }));
vi.mock('../../../services/http/taskApi', () => ({ taskApi: { list: () => Promise.resolve([]) } }));
vi.mock('../../../services/http/leaveApi', () => ({ leaveApi: { mine: () => Promise.resolve([]) } }));

import { GreetingSubtitle, GreetingTitle } from './DashboardGreeting';

let testDay = 0;
const me = { id: 'me', name: 'Kanisha Prithiani', role: 'employee' } as User;
const celebration = (over: Record<string, unknown>) => ({
  user_id: 'u1',
  name: 'Sam Lee',
  avatar_url: null,
  kind: 'birthday',
  label: 'Birthday',
  months: null,
  duration: null,
  company: 'Piixel',
  ...over
});

/** Pieces of the burst are portalled to the body, fixed over the whole screen. */
const burstPieces = () => document.body.querySelectorAll('div.fixed.inset-0 > span').length;

const show = async (data: TodayCelebrations) => {
  today = data;
  useCelebrationsStore.setState({ today: data, loaded: true }); // seeded: the store only reloads once a minute
  const view = render(
    <MemoryRouter>
      <GreetingTitle defaultName="Kanisha" />
    </MemoryRouter>
  );
  return view;
};

beforeEach(() => {
  localStorage.clear();
  vi.stubGlobal('matchMedia', (q: string) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, onchange: null, dispatchEvent: () => false }));
  useAuthStore.setState({ user: me });
  useSettingsStore.setState({ settings: DEFAULT_SETTINGS });
  // the once-a-day memory lives in the module; a new day key per test keeps tests apart
  vi.setSystemTime(new Date(2026, 0, ++testDay, 9, 0, 0)); // a day of its own for every test
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.useRealTimers();
  groups.mockReset();
  createGroup.mockReset();
});

describe('dashboard greeting on celebration days', () => {
  it('shows the normal greeting with the real name, and no pencil or editor to change it', async () => {
    await show({ people: [], festivals: [] });
    expect(screen.getByText(/^Good (morning|afternoon|evening), Kanisha$|^Burning the midnight oil, Kanisha$/)).toBeTruthy();
    expect(screen.queryByLabelText('Personalise your greeting')).toBeNull();
  });

  it('shows my own birthday as the big heading, over a festival and everyone else', async () => {
    await show({ people: [celebration({ user_id: 'me', name: 'Kanisha Prithiani' }), celebration({})] as never, festivals: [{ id: 'f', name: 'Diwali', date: 'x', message: 'Happy Diwali, team!' }] });
    expect(screen.getByText('Happy birthday, Kanisha!')).toBeTruthy();
    expect(screen.queryByLabelText('Personalise your greeting')).toBeNull();
    expect(screen.queryByText('Send wishes')).toBeNull();
  });

  it('words my own work anniversary with the company', async () => {
    await show({ people: [celebration({ user_id: 'me', kind: 'milestone', months: 12, duration: '1 year', label: '1 year with Piixel' })] as never, festivals: [] });
    expect(screen.getByText('Happy 1 year at Piixel, Kanisha!')).toBeTruthy();
  });

  it("shows someone else's birthday with their avatar and Send wishes, and opens the chat", async () => {
    groups.mockResolvedValue([{ id: 'g1', members: [{ id: 'me' }, { id: 'u1' }] }]);
    await show({ people: [celebration({})] as never, festivals: [{ id: 'f', name: 'Diwali', date: 'x', message: 'Happy Diwali, team!' }] });
    expect(screen.getByText("Today is Sam's birthday")).toBeTruthy();
    expect(screen.queryByText('Happy Diwali, team!')).toBeNull(); // they come before a festival
    const send = screen.getByRole('button', { name: 'Send wishes' });
    fireEvent.click(send);
    await waitFor(() => expect(groups).toHaveBeenCalled());
    expect(createGroup).not.toHaveBeenCalled(); // the chat with them already exists
  });

  it('puts several people in one heading and lets me pick who to wish', async () => {
    await show({
      people: [celebration({}), celebration({ user_id: 'u2', name: 'Ann Bell' }), celebration({ user_id: 'u3', name: 'Lee Wong', kind: 'milestone', months: 12, duration: '1 year', label: '1 year with Piixel' })] as never,
      festivals: []
    });
    expect(screen.getByText("Today is Sam's and Ann's birthdays · Lee completes 1 year at Piixel today")).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Send wishes' }));
    expect(screen.getAllByRole('menuitem').map((m) => m.textContent)).toEqual([expect.stringContaining('Sam Lee'), expect.stringContaining('Ann Bell'), expect.stringContaining('Lee Wong')]);
  });

  it('shows a festival greeting when nobody has a celebration', async () => {
    await show({ people: [], festivals: [{ id: 'f', name: 'Diwali', date: 'x', message: 'Happy Diwali, team!' }] });
    expect(screen.getByText('Happy Diwali, team!')).toBeTruthy();
  });

  it('plays the animation once per day: not again when the dashboard is opened a second time', async () => {
    const data = { people: [celebration({ user_id: 'me', name: 'Kanisha Prithiani' })] as never, festivals: [] };
    const first = await show(data);
    await waitFor(() => expect(burstPieces()).toBeGreaterThan(0));
    first.unmount();
    await show(data);
    expect(burstPieces()).toBe(0);
  });

  it('shrinks a long celebration heading instead of cutting it off', async () => {
    await show({
      people: [celebration({}), celebration({ user_id: 'u2', name: 'Ann Bell' }), celebration({ user_id: 'u3', name: 'Lee Wong', kind: 'milestone', months: 12, duration: '1 year', label: '1 year with Piixel' })] as never,
      festivals: []
    });
    const text = screen.getByText("Today is Sam's and Ann's birthdays · Lee completes 1 year at Piixel today");
    expect(text.style.fontSize).toBe('0.62em');
    expect(text.className).toContain('line-clamp-2'); // wraps (two lines, three on phones); never one cut-off line
    expect(text.className).not.toContain('truncate');
  });
});

describe('subtitle under the greeting', () => {
  const sub = async (data: TodayCelebrations) => {
    today = data;
    useCelebrationsStore.setState({ today: data, loaded: true });
    return render(
      <MemoryRouter>
        <p data-testid="p">
          <GreetingSubtitle />
        </p>
      </MemoryRouter>
    );
  };
  const DAY_LINE = /Nothing due today|Happy Friday|calm start/;

  it('is plain text in the header paragraph, so it keeps the header subtitle style', async () => {
    await sub({ people: [], festivals: [] });
    const p = screen.getByTestId('p');
    expect(p.children.length).toBe(0); // no extra wrapper element
    expect(p.textContent).toMatch(DAY_LINE);
  });

  it('is the line about my day on normal, celebration and festival days alike', async () => {
    await sub({ people: [celebration({ user_id: 'me', name: 'Kanisha Prithiani' })] as never, festivals: [] });
    expect(screen.getByTestId('p').textContent).toMatch(DAY_LINE);
    cleanup();
    await sub({ people: [], festivals: [{ id: 'f', name: 'Diwali', date: 'x', message: 'Happy Diwali, team!' }] });
    expect(screen.getByTestId('p').textContent).toMatch(DAY_LINE);
  });
});
