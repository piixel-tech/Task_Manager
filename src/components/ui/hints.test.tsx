import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { CardDescription } from './Card';
import { InfoTip } from './InfoTip';
import { EmptyState } from './EmptyState';
import { PageHeader } from './PageHeader';
import { applyAppearance, useSettingsStore } from '../../store/useSettingsStore';
import { DEFAULT_SETTINGS } from '../../services/http/accountApi';

afterEach(() => {
  cleanup();
  useSettingsStore.getState().init(undefined);
});

describe('hints', () => {
  it('marks the lines under headings and the "i" icons as hints, so one switch can hide them', () => {
    render(
      <MemoryRouter>
        <PageHeader title="Tasks" description="Open a task for its files." />
        <CardDescription>What this card is for.</CardDescription>
        <InfoTip topic="sub-structure">A head looks after one subfolder.</InfoTip>
      </MemoryRouter>
    );
    expect(screen.getByText('Open a task for its files.').hasAttribute('data-hint')).toBe(true);
    expect(screen.getByText('What this card is for.').hasAttribute('data-hint')).toBe(true);
    expect(screen.getByRole('button', { name: 'What is this?' }).hasAttribute('data-hint')).toBe(true);
  });

  it('does not mark tooltips or buttons: they stay when hints are off', () => {
    render(
      <MemoryRouter>
        <PageHeader backTo="/app/tasks" title="Tasks" actions={<button type="button">New task</button>} />
      </MemoryRouter>
    );
    expect(screen.getByRole('button', { name: 'New task' }).hasAttribute('data-hint')).toBe(false);
    expect(screen.getByRole('button', { name: 'Go back' }).hasAttribute('data-hint')).toBe(false);
  });

  it('turns the switch on <html> from the saved setting', () => {
    applyAppearance({ density: 'comfortable', hints: false });
    expect(document.documentElement.getAttribute('data-hints')).toBe('off');
    applyAppearance({ density: 'comfortable', hints: true });
    expect(document.documentElement.getAttribute('data-hints')).toBe('on');
    useSettingsStore.getState().init({ ...DEFAULT_SETTINGS, hints: false });
    expect(document.documentElement.getAttribute('data-hints')).toBe('off');
    useSettingsStore.getState().init(undefined); // a person with nothing saved gets hints
    expect(document.documentElement.getAttribute('data-hints')).toBe('on');
  });

  it('is on by default', () => {
    expect(DEFAULT_SETTINGS.hints).toBe(true);
    expect(DEFAULT_SETTINGS.tour).toBeNull();
  });
});

describe('the compact empty state', () => {
  it('has a headline, one line of purpose and the main action', () => {
    const act = vi.fn();
    render(<EmptyState size="compact" title="No tasks yet" description="Tasks you create show up here." actionLabel="New task" onAction={act} />);
    expect(screen.getByRole('heading', { name: 'No tasks yet' })).toBeTruthy();
    expect(screen.getByText('Tasks you create show up here.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'New task' }));
    expect(act).toHaveBeenCalledTimes(1);
  });

  it('shows no button when there is nothing to do about it', () => {
    render(<EmptyState size="compact" title="Nothing overdue" description="Late tasks show up here." />);
    expect(screen.queryByRole('button')).toBeNull();
  });
});
