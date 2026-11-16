import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ApiTask } from '../../../services/http/taskApi';
import { dueText } from './TaskListRow';
import { reviewStep, TaskDetailPanel } from './TaskDetailPanel';

const me = { id: 'e1', name: 'Eva', avatar_url: null, role: 'employee', company_id: 'c1' };
const head = { ...me, id: 'h1', name: 'Hal Head' };
const task = {
  id: 't1', project_name: 'Acme', subfolder_name: 'Design', title: 'Homepage', priority: 'high', status: 'in_progress', progress: 40, total_seconds: 53 * 3600,
  timer_running: false, can_work: true, unresolved_changes: 0, assignee: me, created_by: head, due_date: '2026-11-10'
} as unknown as ApiTask;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(2026, 10, 12));
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('due text in the list', () => {
  it('is relative for open tasks and plain for the rest', () => {
    expect(dueText({ due_date: '2026-11-10', status: 'todo' })).toBe('2d late');
    expect(dueText({ due_date: '2026-11-12', status: 'todo' })).toBe('Today');
    expect(dueText({ due_date: '2026-11-19', status: 'todo' })).toBe('19 Nov'); // a week away
    expect(dueText({ due_date: '2026-11-14', status: 'in_progress' })).toBe('Sat 14');
    expect(dueText({ due_date: '2026-11-10', status: 'approved' })).toBe('10 Nov');
    expect(dueText({ due_date: null, status: 'todo' })).toBe('No date');
  });
});

describe('the detail panel', () => {
  it('maps the status onto the 3-step review path', () => {
    expect([reviewStep('todo'), reviewStep('changes_requested'), reviewStep('submitted'), reviewStep('approved')]).toEqual([1, 1, 2, 3]);
  });

  it('shows breadcrumb, chips, the overdue banner, the review path and the timer card', () => {
    const toggle = vi.fn();
    const submit = vi.fn();
    render(
      <MemoryRouter>
        <TaskDetailPanel task={task} meId="e1" busy={false} tick={0} onToggleTimer={toggle} onSubmit={submit} onOpen={() => undefined} />
      </MemoryRouter>
    );
    expect(screen.getByText('Acme › Design')).toBeTruthy();
    expect(screen.getAllByText('High').length).toBeGreaterThan(0);
    expect(screen.getByText('Overdue')).toBeTruthy();
    expect(screen.getByText('Assigned to me by Hal Head')).toBeTruthy();
    expect(screen.getByRole('alert').textContent).toBe('Overdue by 2d — was due Tue 10 Nov. Finish and submit for review.');
    expect(screen.getByText('In progress', { selector: 'li span' }).closest('li')?.getAttribute('aria-current')).toBe('step');
    expect(screen.getByRole('img', { name: '40% done' }).textContent).toBe('40%'); // the number sits inside the ring
    expect(screen.getByText('53h 00m')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Start timer' }));
    expect(toggle).toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Submit for review' }));
    expect(submit).toHaveBeenCalled();
  });

  it('has no banner and no timer buttons when it is not overdue or not yours to work on', () => {
    render(
      <MemoryRouter>
        <TaskDetailPanel task={{ ...task, due_date: '2026-11-20', can_work: false, status: 'submitted' }} meId="e1" busy={false} tick={0} onToggleTimer={() => undefined} onSubmit={() => undefined} onOpen={() => undefined} />
      </MemoryRouter>
    );
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Start timer' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Submit for review' })).toBeNull();
  });
});
