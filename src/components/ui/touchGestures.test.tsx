import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useLongPress } from '../../hooks/useLongPress';
import { PullToRefresh } from './PullToRefresh';

const Pressable: React.FC<{ onLong: () => void; onTap: () => void }> = ({ onLong, onTap }) => {
  const press = useLongPress(onLong);
  return (
    <button type="button" {...press} onClick={onTap}>
      Task
    </button>
  );
};

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  vi.useRealTimers();
  cleanup();
});

describe('long press', () => {
  it('opens the menu after half a second of holding, and swallows the tap that ends it', () => {
    const long = vi.fn();
    const tap = vi.fn();
    render(<Pressable onLong={long} onTap={tap} />);
    const b = screen.getByRole('button', { name: 'Task' });
    fireEvent.touchStart(b, { touches: [{ clientX: 10, clientY: 10 }] });
    act(() => void vi.advanceTimersByTime(520));
    expect(long).toHaveBeenCalledTimes(1);
    fireEvent.touchEnd(b);
    fireEvent.click(b);
    expect(tap).not.toHaveBeenCalled(); // did not also open the item
  });

  it('does nothing for a quick tap or when the finger moves', () => {
    const long = vi.fn();
    const tap = vi.fn();
    render(<Pressable onLong={long} onTap={tap} />);
    const b = screen.getByRole('button', { name: 'Task' });
    fireEvent.touchStart(b, { touches: [{ clientX: 10, clientY: 10 }] });
    fireEvent.touchEnd(b);
    act(() => void vi.advanceTimersByTime(600));
    fireEvent.click(b);
    expect(long).not.toHaveBeenCalled();
    expect(tap).toHaveBeenCalledTimes(1);

    fireEvent.touchStart(b, { touches: [{ clientX: 10, clientY: 10 }] });
    fireEvent.touchMove(b, { touches: [{ clientX: 10, clientY: 60 }] }); // scrolling
    act(() => void vi.advanceTimersByTime(600));
    expect(long).not.toHaveBeenCalled();
  });

  it('leaves a mouse click alone', () => {
    const long = vi.fn();
    const tap = vi.fn();
    render(<Pressable onLong={long} onTap={tap} />);
    fireEvent.click(screen.getByRole('button', { name: 'Task' }));
    expect(tap).toHaveBeenCalledTimes(1);
  });
});

describe('pull to refresh', () => {
  const pull = (el: HTMLElement, from: number, to: number) => {
    fireEvent.touchStart(el, { touches: [{ clientX: 0, clientY: from }] });
    fireEvent.touchMove(el, { touches: [{ clientX: 0, clientY: to }] });
    fireEvent.touchEnd(el);
  };

  it('reloads when pulled far enough from the top', async () => {
    vi.useRealTimers();
    const refresh = vi.fn().mockResolvedValue(undefined);
    const { container } = render(
      <PullToRefresh onRefresh={refresh}>
        <p>list</p>
      </PullToRefresh>
    );
    pull(container.firstElementChild as HTMLElement, 0, 200);
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it('ignores a short pull', () => {
    vi.useRealTimers();
    const refresh = vi.fn();
    const { container } = render(
      <PullToRefresh onRefresh={refresh}>
        <p>list</p>
      </PullToRefresh>
    );
    pull(container.firstElementChild as HTMLElement, 0, 40);
    expect(refresh).not.toHaveBeenCalled();
  });
});
