import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ReportView, weekdaysIn } from './ReportView';
import type { MonthlyReport } from '../../../services/http/reportApi';

const report: MonthlyReport = {
  person: { id: 'u1', name: 'Mia Member', company: 'Piixel', role: 'employee' },
  month: '2026-10',
  state: 'final',
  generated_at: '2026-11-01T00:30:00Z',
  attendance: { present: 7, wfh: 2, leave: 1, half_day: 1, avg_login: '13:17', earliest_login: '12:50', latest_login: '13:40', scheduled_days: 11, off_dates: ['2026-10-03'], days: [{ date: '2026-10-01', status: 'present', login_time: '09:11' }] },
  tasks: { assigned: 3, completed: 2, early: 1, on_time: 0, late: 1, pending: 1 },
  time: { total_seconds: 28800, avg_seconds_per_day: 2618, working_days: 11 },
  changes_requested: 3,
  summary: 'In October, Mia was present 10 of 11 working days.',
  previous: { days_worked: 8, avg_login: '13:00', completed: 1, total_seconds: 3600 },
  time_spent: [{ task_id: 't1', title: 'Homepage redesign', seconds: 19800 }, { task_id: 'x9', title: 'Untracked extra', seconds: 8000 }],
  top_tasks: [{ task_id: 't1', title: 'Homepage redesign', seconds: 19800 }],
  rows: [
    {
      task_id: 't1', title: 'Homepage redesign', description: 'Hero section', project: 'Acme', subfolder: 'Design', start: '2026-10-01', due: '2026-10-08', completed: '2026-10-07',
      result: 'Early', late_days: 0, seconds: 19800, changes: 2, last_change_resolved: '2026-10-06',
      files: [{ name: 'Prototype', kind: 'link', url: 'https://example.com/p' }, { name: 'homepage.fig', kind: 'upload', url: null }]
    },
    { task_id: 't2', title: 'Launch reel', description: '', project: 'Acme', subfolder: 'Video', start: '2026-10-05', due: '2026-10-10', completed: '2026-10-13', result: 'Late', late_days: 3, seconds: 0, changes: 0, last_change_resolved: null, files: [] }
  ]
};

afterEach(cleanup);

describe('Monthly report view', () => {
  it('counts working days as the weekdays so far, or the whole month once it is over', () => {
    expect(weekdaysIn('2026-11', new Date(2026, 10, 4))).toBe(3); // Mon 2, Tue 3, Wed 4 (the 1st is a Sunday)
    expect(weekdaysIn('2026-10', new Date(2026, 10, 5))).toBe(22); // a finished month
    expect(weekdaysIn('2026-12', new Date(2026, 10, 5))).toBe(0);
  });

  it('has no KPI cards and no charts other than hours per day', () => {
    render(<ReportView report={{ ...report, time_by_day: [{ date: '2026-10-01', seconds: 3600 }] }} />);
    expect(screen.queryByText('10/22')).toBeNull();
    expect(screen.queryByText(/vs last month/)).toBeNull();
    expect(screen.queryByText('Task status')).toBeNull();
    expect(screen.queryByText('Time by project')).toBeNull();
    expect(screen.getAllByRole('img').map((e) => e.getAttribute('aria-label'))).toEqual(['Hours tracked each day']);
  });

  it('shows the attendance chips and a tinted calendar day with status and login time', () => {
    render(<ReportView report={report} />);
    for (const label of ['WFH', 'Half day']) expect(screen.getByText(label)).toBeTruthy();
    expect(screen.getByLabelText('1: Present · 9:11 AM')).toBeTruthy();
  });

  it('logs each day: date, status and login time, with a dash on leave days, and the usual login on the right', () => {
    const days = [...report.attendance.days, { date: '2026-10-02', status: 'leave' as const, login_time: '10:00' }];
    render(<ReportView report={{ ...report, attendance: { ...report.attendance, days } }} />);
    expect(screen.getByText('Usual 1:15 PM')).toBeTruthy();
    const rows = within(screen.getByLabelText('Login by day')).getAllByRole('row');
    expect(rows[0].textContent).toBe('Thu 1 OctPresent9:11 AM');
    expect(rows[1].textContent).toBe('Fri 2 OctLeave—');
  });

  it('shows the total, hours per day and each task with its time', () => {
    const open = vi.fn();
    render(<ReportView report={report} onOpenTask={open} />);
    expect(screen.getAllByText('8h').length).toBeGreaterThan(0); // 28800 s, never seconds
    expect(screen.getAllByText('5h 30m').length).toBeGreaterThan(0);
    fireEvent.click(screen.getAllByText('Homepage redesign')[0]);
    expect(open).toHaveBeenCalledWith('t1');
  });

  it('lists tasks with a status pill each (overdue first), and opens one on click', () => {
    const open = vi.fn();
    const rows = [
      { ...report.rows[0], early_days: 2 },
      report.rows[1],
      { ...report.rows[1], task_id: 't3', title: 'Old brief', result: 'Overdue' as const, overdue_days: 4, completed: null, late_days: 0 }
    ];
    render(<ReportView report={{ ...report, rows }} onOpenTask={open} />);
    const titles = screen.getAllByRole('row').map((r) => r.textContent ?? '').filter((t) => /Early by|Late by|Overdue \d/.test(t));
    expect(titles[0]).toContain('Old brief'); // overdue first, then late, then done
    expect(titles[0]).toContain('Overdue 4d');
    expect(titles[1]).toContain('Late by 3d');
    expect(titles[2]).toContain('Early by 2d');
    fireEvent.click(screen.getByText('Launch reel'));
    expect(open).toHaveBeenCalledWith('t2');
  });

  it('shows changes and files as count chips that expand, and nothing when they are zero', () => {
    render(<ReportView report={report} />);
    const row = (t: string) => within(screen.getAllByText(t).map((e) => e.closest('tr')).find(Boolean)!);
    expect(row('Launch reel').queryAllByRole('button')).toHaveLength(0);
    fireEvent.click(row('Homepage redesign').getByRole('button', { name: '2 changes' }));
    expect(screen.getByText(/last resolved 6 Oct/)).toBeTruthy();
    expect(screen.queryByRole('link', { name: 'Prototype' })).toBeNull();
    fireEvent.click(row('Homepage redesign').getByRole('button', { name: '2 files' }));
    expect(screen.getByRole('link', { name: 'Prototype' }).getAttribute('href')).toBe('https://example.com/p');
    expect(screen.queryByRole('link', { name: 'homepage.fig' })).toBeNull();
  });

  it('adds the header card and summary chips for admins only', () => {
    const { rerender } = render(<ReportView report={report} />);
    expect(screen.queryByText('Avg delay')).toBeNull();
    rerender(<ReportView report={report} admin />);
    expect(screen.getByText('Mia Member')).toBeTruthy();
    expect(screen.getByText(/22 working days/)).toBeTruthy();
    expect(screen.getByText('Avg delay').parentElement?.textContent).toContain('3d');
  });

  it('says so when there are no tasks or time', () => {
    render(<ReportView report={{ ...report, rows: [], time: { ...report.time, total_seconds: 0 } }} />);
    expect(screen.getByText('No tasks this month.')).toBeTruthy();
    expect(screen.getByText('No time tracked this month.')).toBeTruthy();
  });
});
