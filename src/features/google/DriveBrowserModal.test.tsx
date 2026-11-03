import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { DriveBrowserModal } from './DriveBrowserModal';
import { AttachMenu } from './AttachMenu';
import { googleApi, type DriveItem } from '../../services/http/googleApi';
import { useAuthStore } from '../../store/authStore';
import type { User } from '../../types';

vi.mock('../../services/http/googleApi', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../services/http/googleApi')>()),
  googleApi: { browse: vi.fn(), attachDrive: vi.fn(), createFile: vi.fn() }
}));

const item = (over: Partial<DriveItem>): DriveItem => ({
  id: 'f1',
  name: 'Brief',
  mime: 'application/vnd.google-apps.document',
  kind: 'document',
  is_folder: false,
  icon_url: null,
  thumbnail_url: null,
  modified_at: '2026-10-01T09:30:00Z',
  size: 0,
  starred: false,
  ...over
});

const FOLDER = item({ id: 'folder1', name: 'Clients', kind: 'folder', is_folder: true, mime: 'application/vnd.google-apps.folder' });
const DOC = item({ id: 'doc1', name: 'Brief' });
const SHEET = item({ id: 'sheet1', name: 'Budget', kind: 'spreadsheet', mime: 'application/vnd.google-apps.spreadsheet' });

beforeEach(() => {
  vi.mocked(googleApi.browse).mockResolvedValue({ items: [FOLDER, DOC, SHEET], next_page_token: null });
  vi.mocked(googleApi.attachDrive).mockImplementation(async (id) => ({ id: `asset-${id}`, name: id, drive: null }) as never);
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const last = () => vi.mocked(googleApi.browse).mock.calls.at(-1)![0];

describe('DriveBrowserModal', () => {
  it('opens on My Drive and switches between Shared with me, Recent and Starred', async () => {
    render(<DriveBrowserModal isOpen onClose={() => {}} onAttached={() => {}} />);
    await screen.findByText('Brief');
    expect(last()).toMatchObject({ view: 'my', kind: 'any' });
    for (const [label, view] of [['Shared with me', 'shared'], ['Recent', 'recent'], ['Starred', 'starred']] as const) {
      fireEvent.click(screen.getByRole('button', { name: label }));
      await waitFor(() => expect(last().view).toBe(view));
    }
  });

  it('opens folders with breadcrumbs that lead back', async () => {
    render(<DriveBrowserModal isOpen onClose={() => {}} onAttached={() => {}} />);
    fireEvent.click(await screen.findByText('Clients'));
    await waitFor(() => expect(last().parent).toBe('folder1'));
    const crumbs = screen.getByRole('navigation', { name: 'Folder path' });
    expect(crumbs.textContent).toContain('My Drive');
    expect(crumbs.textContent).toContain('Clients');
    fireEvent.click(within(crumbs).getByRole('button', { name: 'My Drive' }));
    await waitFor(() => expect(last().parent).toBeNull());
  });

  it('filters to the type it was opened for', async () => {
    render(<DriveBrowserModal isOpen onClose={() => {}} filter="spreadsheet" onAttached={() => {}} />);
    await screen.findByText('Brief');
    expect(last().kind).toBe('spreadsheet');
    expect(screen.getByRole('dialog', { name: 'Google Sheets' })).toBeTruthy();
  });

  it('searches after a pause and shows that it is searching', async () => {
    render(<DriveBrowserModal isOpen onClose={() => {}} onAttached={() => {}} />);
    await screen.findByText('Brief');
    fireEvent.change(screen.getByLabelText('Search Drive'), { target: { value: 'budget' } });
    await waitFor(() => expect(last().q).toBe('budget'));
    expect(screen.getByText(/Results for/)).toBeTruthy();
  });

  it('multi-selects files (not folders), keeps the choice across the list/grid toggle and attaches them all', async () => {
    const attached = vi.fn();
    const onClose = vi.fn();
    render(<DriveBrowserModal isOpen onClose={onClose} onAttached={attached} />);
    fireEvent.click(await screen.findByText('Brief'));
    fireEvent.click(screen.getByText('Budget'));
    fireEvent.click(screen.getByRole('button', { name: 'List view' }));
    expect(screen.getByText('2 selected')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Add 2 files' }));
    await waitFor(() => expect(attached).toHaveBeenCalled());
    expect(vi.mocked(googleApi.attachDrive).mock.calls.map((c) => c[0])).toEqual(['doc1', 'sheet1']);
    expect(attached.mock.calls[0][0]).toHaveLength(2);
    expect(onClose).toHaveBeenCalled();
  });

  it('cannot add until something is selected, and a second click un-selects', async () => {
    render(<DriveBrowserModal isOpen onClose={() => {}} onAttached={() => {}} />);
    fireEvent.click(await screen.findByText('Brief'));
    fireEvent.click(screen.getByText('Brief'));
    expect((screen.getByRole('button', { name: 'Add file' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('loads the next page on request', async () => {
    vi.mocked(googleApi.browse).mockResolvedValueOnce({ items: [DOC], next_page_token: 'p2' }).mockResolvedValueOnce({ items: [SHEET], next_page_token: null });
    render(<DriveBrowserModal isOpen onClose={() => {}} onAttached={() => {}} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Load more' }));
    await screen.findByText('Budget');
    expect(last().pageToken).toBe('p2');
    expect(screen.getByText('Brief')).toBeTruthy(); // the first page stays
  });
});

describe('AttachMenu', () => {
  const as = (role: string) => useAuthStore.setState({ user: { id: 'me', role } as unknown as User });

  it('lists every way to attach for team members', () => {
    as('employee');
    render(<AttachMenu onUpload={() => {}} onAdded={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: /Attach/ }));
    expect(screen.getAllByRole('menuitem').map((m) => m.textContent)).toEqual([
      'Upload from device',
      'Google Drive',
      'Google Doc',
      'Google Sheet',
      'New Google Doc',
      'New Google Sheet'
    ]);
  });

  it('opens the browser already filtered to Docs or Sheets', async () => {
    as('admin');
    render(<AttachMenu onUpload={() => {}} onAdded={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: /Attach/ }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Google Sheet' }));
    await waitFor(() => expect(last().kind).toBe('spreadsheet'));
  });

  it('creates a new Doc in Drive and hands it back', async () => {
    as('employee');
    const created = { id: 'asset-new', name: 'Plan' };
    vi.mocked(googleApi.createFile).mockResolvedValue(created as never);
    const added = vi.fn();
    render(<AttachMenu onAdded={added} />);
    fireEvent.click(screen.getByRole('button', { name: /Attach/ }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'New Google Doc' }));
    fireEvent.change(await screen.findByLabelText('Name'), { target: { value: ' Plan ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create' }));
    await waitFor(() => expect(added).toHaveBeenCalledWith([created]));
    expect(googleApi.createFile).toHaveBeenCalledWith('document', 'Plan');
  });

  it('gives clients only the upload, with no Google entries', () => {
    as('client');
    render(<AttachMenu onUpload={() => {}} onAdded={() => {}} />);
    expect(screen.queryByRole('menuitem')).toBeNull();
    expect(screen.getByRole('button', { name: /Attach/ }).getAttribute('aria-haspopup')).toBeNull();
  });
});
