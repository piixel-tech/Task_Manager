import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { projectApi, type Subfolder, type UserBrief } from '../../../services/http/projectApi';
import { ViewOnlyBadge, VisibilityIcon } from './VisibilityIcon';
import { VisibilityMenu } from './VisibilityMenu';

vi.mock('../../../hooks/useConfirm', () => ({
  useConfirm: () => async (o: { action: () => Promise<void> }) => {
    await o.action();
    return true;
  }
}));

afterEach(cleanup);

const person = (id: string, name: string): UserBrief => ({ id, name, avatar_url: null, role: 'employee' } as UserBrief);
const sub = (over: Partial<Subfolder> = {}): Subfolder => ({
  id: 's1', project_id: 'p1', name: 'Web mat', heads: [], members: [], created_by: 'u1', created_at: '2026-11-01T00:00:00Z',
  can_edit: true, viewer_is_head: true, visibility: 'hidden', viewers: [], can_set_visibility: true, can_work: true, ...over
});

describe('subfolder visibility in the UI', () => {
  it('shows a crossed eye for hidden, an eye for everyone and a person with a tick for selected people', () => {
    render(
      <>
        <VisibilityIcon visibility="hidden" />
        <VisibilityIcon visibility="everyone" />
        <VisibilityIcon visibility="selected" />
      </>
    );
    expect(screen.getAllByRole('img').map((e) => e.getAttribute('aria-label'))).toEqual(['Hidden', 'Visible to everyone', 'Visible to selected people']);
    expect(document.querySelector('svg.lucide-eye-off')).toBeTruthy();
    expect(document.querySelector('svg.lucide-eye')).toBeTruthy();
    expect(document.querySelector('svg.lucide-user-check')).toBeTruthy();
  });

  it('has a small View only badge', () => {
    render(<ViewOnlyBadge />);
    expect(screen.getByText('View only')).toBeTruthy();
  });
});

describe('the dropdown on the subfolder title', () => {
  it('is a plain icon with a tooltip for anyone who cannot change it', () => {
    render(<VisibilityMenu subfolder={sub({ can_set_visibility: false, visibility: 'selected' })} onChanged={() => undefined} />);
    expect(screen.queryByRole('button')).toBeNull();
    expect(screen.getByRole('img', { name: 'Visible to selected people' }).getAttribute('title')).toContain('Only members can make changes');
  });

  it('opens on <body> with the three options, ticks the current one and saves a simple change', async () => {
    const saved = sub({ visibility: 'everyone' });
    const set = vi.spyOn(projectApi, 'setVisibility').mockResolvedValue(saved);
    const onChanged = vi.fn();
    render(<VisibilityMenu subfolder={sub()} onChanged={onChanged} />);
    fireEvent.click(screen.getByRole('button', { name: /change who can see/ }));
    const items = screen.getAllByRole('menuitemradio');
    expect(items.map((i) => i.textContent)).toEqual([
      'HiddenOnly members of this subfolder can see it.',
      'Visible to everyoneEveryone in the company can view. Only members can make changes.',
      'Visible to selected peopleOnly the people you pick can view. Only members can make changes.'
    ]);
    expect(screen.getByRole('menu').parentElement).toBe(document.body); // out of the page, so nothing shows through it
    expect(items[0].getAttribute('aria-checked')).toBe('true');
    expect(items[0].querySelector('svg.lucide-check')).toBeTruthy();
    expect(items[1].querySelector('svg.lucide-check')).toBeNull();
    fireEvent.click(items[1]);
    await waitFor(() => expect(onChanged).toHaveBeenCalledWith(saved));
    expect(set).toHaveBeenCalledWith('s1', 'everyone', []);
  });

  it('choosing selected people opens a searchable list and saves who was ticked', async () => {
    vi.spyOn(projectApi, 'viewerCandidates').mockResolvedValue([person('u2', 'Pat Piixel'), person('u3', 'Vic Video')]);
    const saved = sub({ visibility: 'selected', viewers: [person('u3', 'Vic Video')] });
    const set = vi.spyOn(projectApi, 'setVisibility').mockResolvedValue(saved);
    const onChanged = vi.fn();
    render(<VisibilityMenu subfolder={sub()} onChanged={onChanged} />);
    fireEvent.click(screen.getByRole('button', { name: /change who can see/ }));
    fireEvent.click(screen.getAllByRole('menuitemradio')[2]);
    await screen.findByText('Pat Piixel');
    fireEvent.change(screen.getByPlaceholderText('Search people'), { target: { value: 'vic' } });
    expect(screen.queryByText('Pat Piixel')).toBeNull();
    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(onChanged).toHaveBeenCalledWith(saved));
    expect(set).toHaveBeenCalledWith('s1', 'selected', ['u3']);
  });

  it('under the selected option shows who was picked, with an Edit people link', () => {
    const viewers = [person('u2', 'Pat Piixel'), person('u3', 'Vic Video')];
    render(<VisibilityMenu subfolder={sub({ visibility: 'selected', viewers })} onChanged={() => undefined} />);
    fireEvent.click(screen.getByRole('button', { name: /change who can see/ }));
    const menu = screen.getByRole('menu');
    expect(within(menu).getByLabelText('2 people can view')).toBeTruthy();
    expect(within(menu).getByRole('button', { name: 'Edit people' })).toBeTruthy();
  });
});

describe('the people picker for "Visible to selected people"', () => {
  const open = async (candidates: UserBrief[]) => {
    vi.spyOn(projectApi, 'viewerCandidates').mockResolvedValue(candidates);
    render(<VisibilityMenu subfolder={sub()} onChanged={() => undefined} />);
    fireEvent.click(screen.getByRole('button', { name: /change who can see/ }));
    fireEvent.click(screen.getAllByRole('menuitemradio')[2]);
  };
  const withEmail = (id: string, name: string, email: string): UserBrief => ({ ...person(id, name), email });

  it('lists every candidate before typing, then matches name or email, any case, partly', async () => {
    await open([withEmail('u1', 'Sankalp Rao', 'sankalp@piixelco.com'), withEmail('u2', 'Pat Piixel', 'pat@unwork.in')]);
    await screen.findByText('Sankalp Rao');
    expect(screen.getByText('Pat Piixel')).toBeTruthy(); // all shown before typing
    const box = screen.getByPlaceholderText('Search people');
    fireEvent.change(box, { target: { value: 'SAN' } }); // partial, case-insensitive name
    expect(screen.getByText('Sankalp Rao')).toBeTruthy();
    expect(screen.queryByText('Pat Piixel')).toBeNull();
    fireEvent.change(box, { target: { value: '@UnWork' } }); // email
    expect(screen.getByText('Pat Piixel')).toBeTruthy();
    expect(screen.queryByText('Sankalp Rao')).toBeNull();
  });

  it('says so when nobody matches', async () => {
    await open([withEmail('u1', 'Sankalp Rao', 'sankalp@piixelco.com')]);
    await screen.findByText('Sankalp Rao');
    fireEvent.change(screen.getByPlaceholderText('Search people'), { target: { value: 'zzz' } });
    expect(screen.getByText('No employees match "zzz".')).toBeTruthy();
  });

  it('explains when everyone in the company is already a member', async () => {
    await open([]);
    expect(await screen.findByText('Everyone in the company is already a member of this subfolder.')).toBeTruthy();
  });
});
