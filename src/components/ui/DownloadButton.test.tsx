import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { DownloadButton } from './DownloadButton';

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const btn = () => screen.getByRole('button');
const flush = () => act(() => Promise.resolve());

describe('DownloadButton', () => {
  it('morphs to a progress ring with the real percent, then a check, then back after 2 seconds', async () => {
    vi.useFakeTimers();
    let report!: (p: number | null) => void;
    let finish!: () => void;
    render(
      <DownloadButton
        label="Download report.pdf"
        onDownload={(progress) => {
          report = progress;
          return new Promise<void>((r) => (finish = r));
        }}
      />
    );
    expect(btn().getAttribute('data-phase')).toBe('idle');
    fireEvent.click(btn());
    expect(btn().getAttribute('data-phase')).toBe('loading');
    act(() => report(42.4));
    expect(btn().getAttribute('aria-label')).toBe('Downloading 42%');
    act(() => report(null)); // size unknown: spinning ring
    expect(btn().getAttribute('aria-label')).toBe('Downloading');

    finish();
    await flush();
    expect(btn().getAttribute('data-phase')).toBe('done');
    act(() => void vi.advanceTimersByTime(1900));
    expect(btn().getAttribute('data-phase')).toBe('done');
    act(() => void vi.advanceTimersByTime(200));
    expect(btn().getAttribute('data-phase')).toBe('idle');
    expect(btn().getAttribute('aria-label')).toBe('Download report.pdf');
  });

  it('ignores clicks while downloading', async () => {
    const onDownload = vi.fn(() => new Promise<void>(() => undefined));
    render(<DownloadButton onDownload={onDownload} />);
    fireEvent.click(btn());
    fireEvent.click(btn());
    expect(onDownload).toHaveBeenCalledTimes(1);
  });

  it('shows a red ! on failure, reports it, and a click retries', async () => {
    const onError = vi.fn();
    let calls = 0;
    render(
      <DownloadButton
        onError={onError}
        onDownload={async () => {
          if (++calls === 1) throw new Error('boom');
        }}
      />
    );
    fireEvent.click(btn());
    await flush();
    expect(btn().getAttribute('data-phase')).toBe('error');
    expect(btn().textContent).toContain('!');
    expect(onError).toHaveBeenCalledWith(expect.objectContaining({ message: 'boom' }));
    fireEvent.click(btn());
    await flush();
    expect(calls).toBe(2);
    expect(btn().getAttribute('data-phase')).toBe('done');
  });
});
