import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { ProgressToastHost } from './ProgressToastHost';
import { runJob } from '../../services/jobs';
import { useJobsStore } from '../../store/useJobsStore';

const flush = () => act(() => new Promise<void>((r) => setTimeout(r, 0)));

beforeEach(() => useJobsStore.setState({ jobs: [] }));
afterEach(() => {
  cleanup();
  useJobsStore.setState({ jobs: [] });
});

async function startUpload(over: { stop?: boolean } = {}) {
  let release!: () => void;
  const gate = new Promise<void>((r) => (release = r));
  const settled = runJob({
    title: 'Uploading 3 files',
    items: [{ name: 'a.png', size: 100 }, { name: 'b.png', size: 100 }, { name: 'c.png', size: 100 }],
    pausable: true,
    run: async (ctl) => {
      ctl.finish(0);
      ctl.finish(1);
      ctl.progress(2, 50);
      if (!over.stop) await gate;
    }
  });
  settled.catch(() => undefined);
  await flush();
  return { release: () => act(async () => release()), settled };
}

describe('ProgressToastHost', () => {
  it('shows the title, the percent and the thin bar', async () => {
    render(<ProgressToastHost />);
    await startUpload();
    const card = screen.getByRole('group', { name: 'Uploading 3 files' });
    expect(within(card).getByText('Uploading 3 files')).toBeTruthy();
    expect(within(card).getByText(/^83% · /)).toBeTruthy();
    const bar = within(card).getByRole('progressbar');
    expect(bar.getAttribute('aria-valuenow')).toBe('83');
  });

  it('has pause, cancel, expand and a ⋮ menu', async () => {
    render(<ProgressToastHost />);
    await startUpload();
    for (const name of ['Pause', 'Cancel', 'Expand details', 'More']) expect(screen.getByRole('button', { name })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'More' }));
    expect(screen.getAllByRole('menuitem').map((m) => m.textContent)).toEqual(['Cancel', 'Copy details']);
  });

  it('pauses and resumes', async () => {
    render(<ProgressToastHost />);
    await startUpload();
    fireEvent.click(screen.getByRole('button', { name: 'Pause' }));
    await flush();
    expect(screen.getByText(/Paused/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Resume' }));
    await flush();
    expect(screen.queryByText(/Paused/)).toBeNull();
  });

  it('expands to a per-file list and collapses again', async () => {
    render(<ProgressToastHost />);
    await startUpload();
    fireEvent.click(screen.getByRole('button', { name: 'Expand details' }));
    const list = await screen.findByRole('list', { name: 'Details' });
    expect(within(list).getAllByRole('listitem').map((li) => li.textContent)).toEqual([
      expect.stringContaining('a.png'),
      expect.stringContaining('b.png'),
      expect.stringContaining('c.png')
    ]);
    expect(within(list).getByText('50%')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Collapse details' }));
    await flush();
  });

  it('cancelling removes the card', async () => {
    render(<ProgressToastHost />);
    await startUpload();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByRole('group')).toBeNull());
  });

  it('stacks several jobs', async () => {
    render(<ProgressToastHost />);
    void runJob({ title: 'Assigning task', run: () => new Promise(() => undefined) });
    void runJob({ title: 'Creating task', run: () => new Promise(() => undefined) });
    await flush();
    expect(screen.getAllByRole('group').map((g) => g.getAttribute('aria-label'))).toEqual(['Assigning task', 'Creating task']);
    expect(screen.getAllByText('Working…')).toHaveLength(2);
    expect(screen.queryByRole('button', { name: 'Pause' })).toBeNull(); // single actions can't pause
  });

  it('finishing shows a tick and hides itself after 3 seconds', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'], shouldAdvanceTime: true });
    try {
      render(<ProgressToastHost />);
      await act(async () => {
        await runJob({ title: 'Assigning task', run: async () => 'ok' });
      });
      expect(screen.getByText('Done')).toBeTruthy();
      expect(screen.queryByRole('button', { name: 'Cancel' })).toBeNull();
      await act(async () => {
        vi.advanceTimersByTime(3100);
      });
      expect(useJobsStore.getState().jobs).toHaveLength(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it('a failure shows the error with Retry, and Retry tries again', async () => {
    render(<ProgressToastHost />);
    let calls = 0;
    const p = runJob({
      title: 'Submitting task',
      run: async () => {
        if (++calls === 1) throw new Error('Could not submit the task');
      }
    });
    await flush();
    expect(screen.getByText('Could not submit the task')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Retry/ }));
    await act(async () => {
      await p;
    });
    expect(calls).toBe(2);
    expect(screen.getByText('Done')).toBeTruthy();
  });
});
