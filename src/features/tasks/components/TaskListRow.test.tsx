import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ApiTask } from '../../../services/http/taskApi';
import { TaskListRow } from './TaskListRow';

afterEach(cleanup);

const sentBack = {
  id: 't1', title: 'Homepage', project_name: 'Acme', subfolder_name: 'Design', priority: 'high', status: 'changes_requested', review_rounds: 2,
  due_date: '2026-11-20', can_work: true, timer_running: false
} as unknown as ApiTask;

describe('a sent-back task in the list', () => {
  it('shows round, reviewer and feedback, and Fix & resubmit instead of play', () => {
    const fix = vi.fn();
    const select = vi.fn();
    render(<TaskListRow task={sentBack} selected={false} heat={null} onSelect={select} onFix={fix} feedback={{ reviewer: 'Hal Head', comments: 'Logo is off-centre' }} />);
    expect(screen.getByText(/Acme › Design · round 2/)).toBeTruthy();
    expect(screen.getByText('Hal Head:')).toBeTruthy();
    expect(screen.getByText(/Logo is off-centre/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Start timer/ })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Fix & resubmit' }));
    expect(fix).toHaveBeenCalled();
    expect(select).not.toHaveBeenCalled();
    fireEvent.click(screen.getByText('Homepage'));
    expect(select).toHaveBeenCalled();
  });
});
