import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { HoldToDelete } from './HoldToDelete';
import { ConfirmDialog } from './ConfirmDialog';

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const pill = () => screen.getByRole('button', { name: 'Hold to Delete' });
const advance = (ms: number) => act(() => void vi.advanceTimersByTime(ms));

describe('HoldToDelete', () => {
  it('does nothing on a quick click or a hold that is let go early', () => {
    const onConfirm = vi.fn();
    render(<HoldToDelete onConfirm={onConfirm} />);
    fireEvent.click(pill());
    fireEvent.pointerDown(pill(), { button: 0 });
    advance(600);
    expect(pill().getAttribute('data-phase')).toBe('holding');
    fireEvent.pointerUp(pill());
    expect(pill().getAttribute('data-phase')).toBe('idle');
    advance(2000);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('shakes when the hold completes, then confirms', () => {
    const onConfirm = vi.fn();
    render(<HoldToDelete onConfirm={onConfirm} />);
    fireEvent.pointerDown(pill(), { button: 0 });
    advance(1199);
    expect(onConfirm).not.toHaveBeenCalled();
    advance(2);
    expect(pill().getAttribute('data-phase')).toBe('shaking');
    expect(onConfirm).not.toHaveBeenCalled();
    advance(400);
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(pill().getAttribute('data-phase')).toBe('idle');
  });

  it('holding Enter or Space works, and letting go cancels', () => {
    const onConfirm = vi.fn();
    render(<HoldToDelete onConfirm={onConfirm} />);
    fireEvent.keyDown(pill(), { key: 'Enter' });
    advance(500);
    fireEvent.keyUp(pill(), { key: 'Enter' });
    advance(2000);
    expect(onConfirm).not.toHaveBeenCalled();

    fireEvent.keyDown(pill(), { key: ' ' });
    fireEvent.keyDown(pill(), { key: ' ', repeat: true }); // key auto-repeat must not restart the hold
    advance(1200 + 400);
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('is inert while loading', () => {
    const onConfirm = vi.fn();
    render(<HoldToDelete onConfirm={onConfirm} isLoading />);
    fireEvent.pointerDown(pill(), { button: 0 });
    advance(3000);
    expect(onConfirm).not.toHaveBeenCalled();
  });
});

describe('ConfirmDialog', () => {
  const dialog = (over: Partial<React.ComponentProps<typeof ConfirmDialog>>) =>
    render(<ConfirmDialog isOpen title="Delete this?" danger confirmLabel="Delete item" onConfirm={over.onConfirm ?? vi.fn()} onCancel={vi.fn()} {...over} />);

  it('asks to hold for deletes, and the hold confirms', () => {
    const onConfirm = vi.fn();
    dialog({ onConfirm });
    const hold = screen.getByRole('button', { name: 'Hold to Delete item' });
    fireEvent.click(hold);
    expect(onConfirm).not.toHaveBeenCalled();
    fireEvent.pointerDown(hold, { button: 0 });
    advance(1600);
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('keeps a plain button for other dangerous actions and for ordinary confirms', () => {
    const onConfirm = vi.fn();
    dialog({ onConfirm, title: 'Sign out?', confirmLabel: 'Sign out' });
    fireEvent.click(screen.getByRole('button', { name: 'Sign out' }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    cleanup();
    dialog({ onConfirm, danger: false, title: 'Delete note?', confirmLabel: 'Save' });
    expect(screen.queryByText(/Hold to/)).toBeNull();
  });
});
