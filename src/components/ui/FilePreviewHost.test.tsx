import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { FilePreviewHost } from './FilePreviewHost';
import { usePreviewStore, type PreviewFile } from '../../store/usePreviewStore';
import { api } from '../../services/api';
import { assetApi } from '../../services/http/taskApi';

const file = (over: Partial<PreviewFile> & { id: string; name: string }): PreviewFile => ({
  mime: 'text/plain',
  size: 2048,
  url: `/api/v1/files/${over.id}/download`,
  created_at: '2026-11-03T09:30:00Z',
  owner: { name: 'Mia Member' },
  ...over
});

const bytes: Record<string, string> = {};
const show = (files: PreviewFile[], index = 0) => act(() => usePreviewStore.getState().show(files, index));

beforeEach(() => {
  vi.spyOn(api, 'get').mockImplementation((async (url: string) => {
    if (url.includes('broken')) throw new Error('Not found');
    const id = url.split('/')[2];
    return { data: new Blob([bytes[id] ?? ''], { type: 'text/plain' }) };
  }) as never);
  vi.spyOn(assetApi, 'download').mockResolvedValue();
  URL.createObjectURL = vi.fn(() => 'blob:preview');
  URL.revokeObjectURL = vi.fn();
  usePreviewStore.setState({ files: [], index: 0, isOpen: false });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('file preview', () => {
  it('shows a text file with its name, size, uploader and date, and does not download it', async () => {
    bytes.t1 = 'Hello from the brief';
    render(<FilePreviewHost />);
    show([file({ id: 't1', name: 'brief.txt' })]);
    expect(await screen.findByText('Hello from the brief')).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'brief.txt' })).toBeTruthy();
    expect(screen.getByText(/2 KB · Uploaded by Mia Member/)).toBeTruthy();
    expect(assetApi.download).not.toHaveBeenCalled(); // opening is not downloading
  });

  it('downloads only from the Download button', async () => {
    bytes.t1 = 'x';
    render(<FilePreviewHost />);
    show([file({ id: 't1', name: 'brief.txt' })]);
    await screen.findByText('x');
    fireEvent.click(screen.getByRole('button', { name: 'Download' }));
    await waitFor(() => expect(assetApi.download).toHaveBeenCalledTimes(1));
    expect(vi.mocked(assetApi.download).mock.calls[0][0].name).toBe('brief.txt');
  });

  it('steps through several files with the buttons and the arrow keys', async () => {
    bytes.a = 'first file';
    bytes.b = 'second file';
    render(<FilePreviewHost />);
    show([file({ id: 'a', name: 'a.txt' }), file({ id: 'b', name: 'b.txt' })]);
    expect(await screen.findByText('first file')).toBeTruthy();
    expect(screen.getByText('1 / 2')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Next file' }));
    expect(await screen.findByText('second file')).toBeTruthy();
    expect(screen.getByText('2 / 2')).toBeTruthy();
    fireEvent.keyDown(window, { key: 'ArrowLeft' });
    expect(await screen.findByText('first file')).toBeTruthy();
  });

  it('shows no arrows for a single file', async () => {
    bytes.a = 'only';
    render(<FilePreviewHost />);
    show([file({ id: 'a', name: 'a.txt' })]);
    await screen.findByText('only');
    expect(screen.queryByRole('button', { name: 'Next file' })).toBeNull();
  });

  it('closes with Esc, with the X and with a click outside', async () => {
    bytes.a = 'text';
    render(<FilePreviewHost />);
    const ways = [
      () => fireEvent.keyDown(window, { key: 'Escape' }),
      () => fireEvent.click(screen.getByRole('button', { name: 'Close' })),
      () => fireEvent.click(screen.getByRole('button', { name: 'Close preview' }))
    ];
    for (const close of ways) {
      show([file({ id: 'a', name: 'a.txt' })]);
      await screen.findByText('text');
      close();
      await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
      expect(usePreviewStore.getState().isOpen).toBe(false);
    }
  });

  it('shows a CSV as a table', async () => {
    bytes.c = 'name,qty\nPens,12\nInk,3';
    render(<FilePreviewHost />);
    show([file({ id: 'c', name: 'stock.csv', mime: 'text/csv' })]);
    expect(await screen.findByText('Pens')).toBeTruthy();
    expect(screen.getByText('qty').tagName).toBe('TH');
    expect(screen.getByText('12').tagName).toBe('TD');
  });

  it('zooms an image', async () => {
    render(<FilePreviewHost />);
    show([file({ id: 'i', name: 'logo.png', mime: 'image/png' })]);
    const img = await screen.findByAltText('logo.png');
    expect(screen.getByRole('button', { name: 'Reset zoom' }).textContent).toBe('100%');
    fireEvent.click(screen.getByRole('button', { name: 'Zoom in' }));
    expect(screen.getByRole('button', { name: 'Reset zoom' }).textContent).toBe('150%');
    expect((img as HTMLImageElement).style.width).toBe('150%');
    fireEvent.click(screen.getByRole('button', { name: 'Reset zoom' }));
    expect(screen.getByRole('button', { name: 'Reset zoom' }).textContent).toBe('100%');
  });

  it('offers Open in new tab only for what the browser shows by itself', async () => {
    render(<FilePreviewHost />);
    show([file({ id: 'p', name: 'brief.pdf', mime: 'application/pdf' })]);
    expect(await screen.findByRole('button', { name: /Open in new tab/ })).toBeTruthy();
    expect(document.querySelector('iframe')).toBeTruthy(); // the scrollable PDF viewer
    bytes.c = 'a,b';
    show([file({ id: 'c', name: 'stock.csv', mime: 'text/csv' })]);
    await screen.findByText('a');
    expect(screen.queryByRole('button', { name: /Open in new tab/ })).toBeNull();
  });

  it('gives a clean card with Download for a file it cannot preview', async () => {
    render(<FilePreviewHost />);
    show([file({ id: 'd', name: 'deck.pptx', mime: 'application/vnd.openxmlformats-officedocument.presentationml.presentation' })]);
    expect(await screen.findByText('This kind of file can’t be previewed here.')).toBeTruthy();
    expect(screen.getAllByRole('button', { name: 'Download' }).length).toBeGreaterThan(0);
    expect(assetApi.download).not.toHaveBeenCalled();
  });

  it('says so, and still offers Download, when the file cannot be fetched', async () => {
    render(<FilePreviewHost />);
    show([file({ id: 'x', name: 'gone.txt', url: '/api/v1/files/broken/download' })]);
    expect(await screen.findByText(/Not found\. You can still download it\./)).toBeTruthy();
  });
});

describe('opening a file from a screen', () => {
  it('opens uploads in the preview with their neighbours, and links in a new tab', async () => {
    const a = { ...file({ id: 'a', name: 'a.txt' }), owner_id: 'u', kind: 'upload' as const, created_at: '2026-11-03T09:30:00Z' };
    const b = { ...file({ id: 'b', name: 'b.txt' }), owner_id: 'u', kind: 'upload' as const, created_at: '2026-11-03T09:30:00Z' };
    const link = { ...file({ id: 'l', name: 'site' }), owner_id: 'u', kind: 'link' as const, url: 'https://example.com', created_at: '2026-11-03T09:30:00Z' };
    const open = vi.spyOn(window, 'open').mockReturnValue(null);
    await assetApi.open(b, [a, link, b]);
    expect(usePreviewStore.getState().files.map((f) => f.id)).toEqual(['a', 'b']); // links are not previewed
    expect(usePreviewStore.getState().index).toBe(1);
    expect(open).not.toHaveBeenCalled();
    await assetApi.open(link);
    expect(open).toHaveBeenCalledWith('https://example.com', '_blank', 'noopener,noreferrer');
  });
});
