import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { TooltipHost } from './TooltipHost';
import { MAX_WORDS, tooltipFor } from './tooltipText';

describe('tooltip wording', () => {
  it('starts with a verb', () => {
    expect(tooltipFor('Previous month').text).toBe('Show previous month');
    expect(tooltipFor('Emoji').text).toBe('Add emoji');
    expect(tooltipFor('Notifications').text).toBe('Open notifications');
    expect(tooltipFor('Back').text).toBe('Go back');
    expect(tooltipFor('Delete post').text).toBe('Delete post');
    expect(tooltipFor('New group').text).toBe('Create new group');
    expect(tooltipFor('Calendar').text).toBe('Open calendar');
  });

  it('is never longer than four words', () => {
    const long = tooltipFor('Attach files, Drive files or create a Google Doc or Sheet').text;
    expect(long.split(' ').length).toBeLessThanOrEqual(MAX_WORDS);
    expect(tooltipFor('Remove the selected person from the list now please').text.split(' ').length).toBeLessThanOrEqual(MAX_WORDS);
  });

  it('adds the keyboard shortcut where there is one', () => {
    expect(tooltipFor('Bold').shortcut).toBe('Ctrl B');
    expect(tooltipFor('Send').shortcut).toBe('Enter');
    expect(tooltipFor('Close').shortcut).toBe('Esc');
    expect(tooltipFor('Search').shortcut).toBe('Ctrl K');
    expect(tooltipFor('Delete post').shortcut).toBe('');
    expect(tooltipFor('Whatever', 'Ctrl Y').shortcut).toBe('Ctrl Y');
  });
});

describe('the tooltip', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
    cleanup();
  });

  const Page = () => (
    <>
      <TooltipHost />
      <button type="button" aria-label="Previous month" title="Previous month">
        <svg />
      </button>
      <button type="button" aria-label="Save changes">
        Save changes
      </button>
      <button type="button" aria-label="Send" data-shortcut="Enter">
        <svg />
      </button>
    </>
  );

  it('appears after a short delay on an icon-only button, and says what it does', () => {
    render(<Page />);
    const btn = screen.getByRole('button', { name: 'Previous month' });
    fireEvent.pointerOver(btn);
    expect(screen.queryByRole('tooltip')).toBeNull(); // not at once
    act(() => {
      vi.advanceTimersByTime(399);
    });
    expect(screen.queryByRole('tooltip')).toBeNull();
    act(() => {
      vi.advanceTimersByTime(2);
    });
    expect(screen.getByRole('tooltip').textContent).toBe('Show previous month');
    expect(btn.getAttribute('aria-describedby')).toBe('tm-tooltip');
  });

  it('replaces the browser’s own tooltip instead of doubling it', () => {
    render(<Page />);
    const btn = screen.getByRole('button', { name: 'Previous month' });
    fireEvent.pointerOver(btn);
    expect(btn.hasAttribute('title')).toBe(false);
  });

  it('shows the shortcut beside the name', () => {
    render(<Page />);
    fireEvent.pointerOver(screen.getByRole('button', { name: 'Send' }));
    act(() => {
      vi.advanceTimersByTime(450);
    });
    expect(screen.getByRole('tooltip').textContent).toContain('Send message');
    expect(screen.getByRole('tooltip').textContent).toContain('Enter');
  });

  it('stays away from a button that already shows its name', () => {
    render(<Page />);
    fireEvent.pointerOver(screen.getByText('Save changes'));
    act(() => {
      vi.advanceTimersByTime(600);
    });
    expect(screen.queryByRole('tooltip')).toBeNull();
  });

  it('goes when the pointer leaves, or Esc is pressed', () => {
    render(<Page />);
    const btn = screen.getByRole('button', { name: 'Previous month' });
    fireEvent.pointerOver(btn);
    act(() => {
      vi.advanceTimersByTime(450);
    });
    fireEvent.pointerOut(btn, { relatedTarget: document.body });
    expect(screen.queryByRole('tooltip')).toBeNull();
    fireEvent.pointerOver(btn);
    act(() => {
      vi.advanceTimersByTime(450);
    });
    expect(screen.getByRole('tooltip')).toBeTruthy();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('tooltip')).toBeNull();
  });

  it('works from the keyboard: tabbing to a control shows it, a mouse click does not', () => {
    render(<Page />);
    const btn = screen.getByRole('button', { name: 'Previous month' });
    fireEvent.keyDown(document, { key: 'Tab' });
    fireEvent.focusIn(btn);
    act(() => {
      vi.advanceTimersByTime(200);
    });
    expect(screen.getByRole('tooltip').textContent).toBe('Show previous month');
    fireEvent.focusOut(btn);
    expect(screen.queryByRole('tooltip')).toBeNull();
    fireEvent.pointerDown(btn); // a click focuses too, but is not keyboard use
    fireEvent.focusIn(btn);
    act(() => {
      vi.advanceTimersByTime(600);
    });
    expect(screen.queryByRole('tooltip')).toBeNull();
  });
});
