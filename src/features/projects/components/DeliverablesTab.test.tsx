import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { DeliverablesTab } from './DeliverablesTab';
import { deliverableApi, type Deliverables } from '../../../services/http/deliverableApi';

vi.mock('../../../services/socket', () => ({ socket: { on: () => () => undefined } }));
vi.mock('../../../services/http/deliverableApi', async (orig) => ({
  ...(await orig<typeof import('../../../services/http/deliverableApi')>()),
  deliverableApi: { get: vi.fn(), setStages: vi.fn(), stagesUsage: vi.fn() }
}));

const data = (over: Partial<Deliverables> = {}): Deliverables => ({
  subfolder_id: 's1',
  month: '2026-11',
  stages: ['shooted', 'editing', 'reel', 'posted'],
  stage_labels: { shooted: 'Shooted', editing: 'Editing', reel: 'Reel', posted: 'Posted' },
  total: 4,
  done: 1,
  remaining: 3,
  progress: 40,
  by_stage: { shooted: 1, editing: 2, reel: 0, posted: 1 },
  types: [{ type: 'Reels', total: 4, by_stage: { shooted: 1, editing: 2, reel: 0, posted: 1 }, done: 1, remaining: 3, progress: 40 }],
  items: [1, 2, 3, 4].map((n) => ({
    id: `i${n}`,
    type: 'Reels',
    number: n,
    title: `Reels ${n}`,
    stage: ['shooted', 'editing', 'editing', 'posted'][n - 1],
    updated_by: null,
    updated_at: '2026-11-01T10:00:00Z'
  })),
  can_set_counts: true,
  can_set_stage: true,
  ...over
});

beforeEach(() => {
  localStorage.clear();
  vi.mocked(deliverableApi.get).mockResolvedValue(data());
  vi.mocked(deliverableApi.stagesUsage).mockResolvedValue({ editing: 2, posted: 1, shooted: 1 });
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.clearAllMocks();
});

const head = (n: number) => screen.findByRole('button', { name: new RegExp(`Reels ${n}`) });
const section = () => screen.findByRole('button', { name: /^Reels\s*· 1 done \/ 3 remaining/ });
/** Opens the Reels type dropdown (every type starts collapsed). */
const openSection = async () => {
  fireEvent.click(await section());
  await head(1);
};

describe('Deliverable dropdowns', () => {
  it('type sections start collapsed, with counts and progress in the header, and several can be open at once', async () => {
    vi.mocked(deliverableApi.get).mockResolvedValue(
      data({
        types: [
          { type: 'Reels', total: 4, by_stage: { shooted: 1, editing: 2, reel: 0, posted: 1 }, done: 1, remaining: 3, progress: 40 },
          { type: 'Creatives', total: 1, by_stage: { shooted: 0, editing: 0, reel: 0, posted: 1 }, done: 1, remaining: 0, progress: 100 }
        ],
        items: [
          ...data().items,
          { id: 'c1', type: 'Creatives', number: 1, title: 'Creatives 1', stage: 'posted', updated_by: null, updated_at: '2026-11-01T10:00:00Z' }
        ]
      })
    );
    render(<DeliverablesTab subfolderId="s1" />);
    const reels = await section();
    const creatives = await screen.findByRole('button', { name: /^Creatives\s*· 1 done \/ 0 remaining/ });
    expect(reels.getAttribute('aria-expanded')).toBe('false');
    expect(reels.textContent).toContain('1 of 4 done');
    expect(within(reels).getByRole('progressbar')).toBeTruthy();
    expect(screen.getAllByRole('button', { name: 'Add more' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Reels 1/ })).toBeNull();
    fireEvent.click(reels);
    fireEvent.click(creatives);
    expect(await head(1)).toBeTruthy();
    expect(await screen.findByRole('button', { name: /Creatives 1/ })).toBeTruthy();
  });

  it('shows the section without any outer dropdown, every deliverable collapsed', async () => {
    render(<DeliverablesTab subfolderId="s1" />);
    await openSection();
    const first = await head(1);
    expect(screen.queryByRole('button', { name: /^Deliverables/ })).toBeNull();
    for (const n of [1, 2, 3, 4]) expect((await head(n)).getAttribute('aria-expanded')).toBe('false');
    // collapsed: number, name, current stage, a small progress bar
    expect(first.textContent).toContain('01');
    expect(first.textContent).toContain('Shooted');
    expect(within(first).getByRole('progressbar')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Delete Reels 1' })).toBeNull();
  });

  it('opens one at a time or several at once, and closes again', async () => {
    render(<DeliverablesTab subfolderId="s1" />);
    await openSection();
    const one = await head(1);
    const three = await head(3);
    fireEvent.click(one);
    fireEvent.click(three);
    expect(one.getAttribute('aria-expanded')).toBe('true');
    expect(three.getAttribute('aria-expanded')).toBe('true');
    expect((await head(2)).getAttribute('aria-expanded')).toBe('false');
    expect(await screen.findByRole('button', { name: 'Delete Reels 1' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Delete Reels 3' })).toBeTruthy();
    expect(screen.getAllByRole('button', { name: 'Edit stages' })).toHaveLength(2);
    fireEvent.click(one);
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Delete Reels 1' })).toBeNull());
    expect(screen.getByRole('button', { name: 'Delete Reels 3' })).toBeTruthy();
  });

  it('only heads and admins get Edit stages and delete', async () => {
    vi.mocked(deliverableApi.get).mockResolvedValue(data({ can_set_counts: false }));
    render(<DeliverablesTab subfolderId="s1" />);
    await openSection();
    fireEvent.click(await head(1));
    expect(await screen.findByLabelText('Stage of Reels 1')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Edit stages' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Delete Reels 1' })).toBeNull();
  });
});

describe('Edit stages', () => {
  const openEditor = async () => {
    render(<DeliverablesTab subfolderId="s1" />);
    await openSection();
    fireEvent.click(await head(1));
    fireEvent.click(await screen.findByRole('button', { name: 'Edit stages' }));
    return screen.findByRole('dialog', { name: 'Edit stages' });
  };

  it('lists the stages in order and warns on a stage that has deliverables on it', async () => {
    const dialog = await openEditor();
    await waitFor(() => expect(within(dialog).getAllByRole('textbox')).toHaveLength(4));
    expect(within(dialog).getAllByRole('textbox').map((i) => (i as HTMLInputElement).value)).toEqual(['Shooted', 'Editing', 'Reel', 'Posted']);
    expect(await within(dialog).findByText(/2 deliverables are on this stage/)).toBeTruthy();
    expect(within(dialog).getByRole('button', { name: 'Save stages' }).hasAttribute('disabled')).toBe(true); // nothing changed yet
  });

  it('renames and adds stages, which enables Save', async () => {
    const dialog = await openEditor();
    const inputs = await waitFor(() => {
      const found = within(dialog).getAllByRole('textbox');
      expect(found).toHaveLength(4);
      return found;
    });
    fireEvent.change(inputs[0], { target: { value: 'Filmed' } });
    fireEvent.click(within(dialog).getByRole('button', { name: /Add stage/ }));
    expect(within(dialog).getAllByRole('textbox')).toHaveLength(5);
    expect(within(dialog).getByRole('button', { name: 'Save stages' }).hasAttribute('disabled')).toBe(false);
  });

  it('deleting a stage takes holding the button, and lists it as to be deleted with an Undo', async () => {
    const dialog = await openEditor();
    await waitFor(() => expect(within(dialog).getAllByRole('textbox')).toHaveLength(4));
    vi.useFakeTimers();
    const hold = within(dialog).getAllByRole('button', { name: 'Hold to Delete' })[1]; // Editing
    fireEvent.click(hold);
    expect(within(dialog).getAllByRole('textbox')).toHaveLength(4); // a plain click does nothing
    fireEvent.pointerDown(hold, { button: 0 });
    act(() => void vi.advanceTimersByTime(1700));
    expect(within(dialog).getAllByRole('textbox')).toHaveLength(3);
    expect(within(dialog).getByText('Will be deleted when you save')).toBeTruthy();
    expect(within(dialog).getByText('(2 move)')).toBeTruthy();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Undo' }));
    expect(within(dialog).getAllByRole('textbox')).toHaveLength(4);
  });
});
