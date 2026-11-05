import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { projectApi, type Subfolder } from '../../../services/http/projectApi';
import { SubfolderFormModal } from './SubfolderFormModal';
import { ViewOnlyBadge, VisibilityIcon } from './VisibilityIcon';

afterEach(cleanup);

const sub = (over: Partial<Subfolder> = {}): Subfolder => ({
  id: 's1', project_id: 'p1', name: 'Design', heads: [], members: [], created_by: 'u1', created_at: '2026-11-01T00:00:00Z',
  can_edit: true, viewer_is_head: true, visibility: 'private', can_set_visibility: true, can_work: true, ...over
});

describe('subfolder visibility in the UI', () => {
  it('shows a lock for private, an eye for view only and a globe for open', () => {
    render(
      <>
        <VisibilityIcon visibility="private" />
        <VisibilityIcon visibility="view_only" />
        <VisibilityIcon visibility="open" />
      </>
    );
    expect(screen.getAllByRole('img').map((e) => e.getAttribute('aria-label'))).toEqual(['Private', 'View only', 'Open']);
    expect(document.querySelector('svg.lucide-lock')).toBeTruthy();
    expect(document.querySelector('svg.lucide-eye')).toBeTruthy();
    expect(document.querySelector('svg.lucide-globe')).toBeTruthy();
  });

  it('has a small View only badge', () => {
    render(<ViewOnlyBadge />);
    expect(screen.getByText('View only')).toBeTruthy();
  });
});

describe('the Visibility selector in subfolder settings', () => {
  beforeEach(() => {
    vi.spyOn(projectApi, 'directory').mockResolvedValue([]);
  });

  it('offers the three options with a one-line explanation each, to admins and heads', () => {
    render(<SubfolderFormModal isOpen onClose={() => undefined} projectId="p1" subfolder={sub({ visibility: 'view_only' })} onSaved={() => undefined} />);
    const group = screen.getByRole('radiogroup', { name: 'Visibility' });
    const radios = group.querySelectorAll('input[type=radio]');
    expect(radios).toHaveLength(3);
    expect((radios[1] as HTMLInputElement).checked).toBe(true); // the current one
    expect(group.textContent).toContain('Only its members, heads and admins can see it.');
    expect(group.textContent).toContain("Everyone in the project's company can read it");
    expect(group.textContent).toContain('work in it like a member');
  });

  it('is not shown to anyone who cannot change it, nor when creating a subfolder', () => {
    const { rerender } = render(<SubfolderFormModal isOpen onClose={() => undefined} projectId="p1" subfolder={sub({ can_set_visibility: false })} onSaved={() => undefined} />);
    expect(screen.queryByRole('radiogroup', { name: 'Visibility' })).toBeNull();
    rerender(<SubfolderFormModal isOpen onClose={() => undefined} projectId="p1" subfolder={null} onSaved={() => undefined} />);
    expect(screen.queryByRole('radiogroup', { name: 'Visibility' })).toBeNull();
  });
});
