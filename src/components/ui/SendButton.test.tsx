import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { SendButton, SENT_PILL_MS } from './SendButton';
import { ConfirmDialog } from './ConfirmDialog';

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('SendButton', () => {
  it('sends on click, reads Sending… while it works, then Sent! and back to normal after 1.5 s', () => {
    vi.useFakeTimers();
    const onClick = vi.fn();
    const { rerender } = render(<SendButton status="idle" label="Submit" onClick={onClick} />);
    fireEvent.click(screen.getByRole('button', { name: 'Submit' }));
    expect(onClick).toHaveBeenCalledTimes(1);

    rerender(<SendButton status="sending" label="Submit" onClick={onClick} />);
    expect(screen.getByRole('button').getAttribute('data-status')).toBe('sending');
    expect(screen.getByRole('button').hasAttribute('disabled')).toBe(true);
    expect(screen.getByText('Sending…')).toBeTruthy();

    rerender(<SendButton status="sent" label="Submit" onClick={onClick} />);
    expect(screen.getByText('Sent!')).toBeTruthy();
    act(() => void vi.advanceTimersByTime(SENT_PILL_MS - 100));
    expect(screen.getByRole('button').getAttribute('data-status')).toBe('sent');
    act(() => void vi.advanceTimersByTime(200));
    expect(screen.getByRole('button').getAttribute('data-status')).toBe('idle');
  });

  it('shakes and says Failed · Retry, and a click retries', () => {
    const onClick = vi.fn();
    render(<SendButton status="error" onClick={onClick} />);
    const btn = screen.getByRole('button');
    expect(btn.textContent).toContain('Failed · Retry');
    expect(btn.className).toContain('tm-shake');
    fireEvent.click(btn);
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});

describe('ConfirmDialog with send', () => {
  const dialog = (over: Partial<React.ComponentProps<typeof ConfirmDialog>>) =>
    render(<ConfirmDialog isOpen title="Send it?" confirmLabel="Send request" send onConfirm={vi.fn()} onCancel={vi.fn()} {...over} />);

  it('uses the Send button for its confirm', () => {
    const onConfirm = vi.fn();
    dialog({ onConfirm });
    fireEvent.click(screen.getByRole('button', { name: 'Send request' }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('shows Sent! when the action is done and Failed · Retry when it failed', () => {
    dialog({ sent: true });
    expect(screen.getByText('Sent!')).toBeTruthy();
    cleanup();
    dialog({ error: 'Nope' });
    expect(screen.getByText('Failed · Retry')).toBeTruthy();
  });
});
