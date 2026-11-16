import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ReportView } from './ReportView';
import { buildSheet, versusUsual } from '../sheet';
import type { MonthlyReport } from '../../../services/http/reportApi';

const report: MonthlyReport = {
  person: { id: 'u1', name: 'Mia Member', company: 'Piixel', role: 'employee', title: 'Jr developer' },
  month: '2026-10',
  state: 'final',
  generated_at: '2026-11-01T00:30:00Z',
  attendance: {
    present: 7, wfh: 2, leave: 1, half_day: 1, avg_login: '10:00', earliest_login: '09:00', latest_login: '10:30', scheduled_days: 26, off_dates: ['2026-10-03'],
    days: [
      { date: '2026-10-01', status: 'present', login_time: '09:11' },
      { date: '2026-10-02', status: 'wfh', login_time: '10:30' },
      { date: '2026-10-05', status: 'present', login_time: '10:02' },
      { date: '2026-10-06', status: 'leave', login_time: '10:00' }
    ]
  },
  tasks: { assigned: 3, completed: 2, early: 1, on_time: 0, late: 1, pending: 1 },
  time: { total_seconds: 28800, avg_seconds_per_day: 2618, working_days: 11 },
  time_by_day: [{ date: '2026-10-01', seconds: 19800 }],
  changes_requested: 3,
  summary: 'In October, Mia was present 10 of 11 working days.',
  previous: null,
  time_spent: [],
  top_tasks: [],
  rows: [
    {
      task_id: 't1', title: 'Homepage redesign', description: 'Hero section', project: 'Acme', subfolder: 'Design', start: '2026-10-01', due: '2026-10-08', completed: '2026-10-07',
      result: 'Early', early_days: 1, late_days: 0, seconds: 19800, changes: 2, last_change_resolved: '2026-10-06',
      files: [{ name: 'Prototype', kind: 'link', url: 'https://example.com/p' }, { name: 'homepage.fig', kind: 'upload', url: null }]
    },
    { task_id: 't2', title: 'Launch reel', description: '', project: 'Acme', subfolder: 'Video', start: '2026-10-05', due: '2026-10-10', completed: '2026-10-13', result: 'Late', late_days: 3, seconds: 0, changes: 0, last_change_resolved: null, files: [] },
    { task_id: 't3', title: 'Old brief', description: 'x'.repeat(130), project: 'Acme', subfolder: 'Copy', start: '2026-10-01', due: '2026-10-20', completed: null, result: 'Overdue', overdue_days: 4, late_days: 0, seconds: 0, changes: 0, last_change_resolved: null, files: [] },
    { task_id: 't4', title: 'Newsletter', description: '', project: 'Acme', subfolder: 'Copy', start: '2026-10-01', due: '2026-10-30', completed: null, result: 'Pending', late_days: 0, seconds: 0, changes: 0, last_change_resolved: null, files: [] }
  ]
};

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(2026, 10, 5));
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('the sheet sums', () => {
  it('compares a login with the usual one: within 5 minutes is on time', () => {
    expect(versusUsual('10:04', '10:00')).toEqual({ text: 'On time', tone: 'ontime' });
    expect(versusUsual('09:55', '10:00').tone).toBe('early'); // 5 minutes is already early
    expect(versusUsual('10:30', '10:00')).toEqual({ text: '30m late', tone: 'late' });
    expect(versusUsual('08:55', '10:00')).toEqual({ text: '1h 5m early', tone: 'early' });
  });

  it('counts working days (not Sundays or off days), no status, and what remains', () => {
    const s = buildSheet(report, new Date(2026, 10, 5));
    expect(s.summary).toMatchObject({ working: 26, present: 7, wfh: 2, halfDay: 1, leave: 1, noStatus: 22, remaining: 0 });
    const mid = buildSheet(report, new Date(2026, 9, 8)); // Thu 8 Oct: 26 working days, 6 of them so far
    expect(mid.summary.remaining).toBe(26 - 6);
    expect(mid.days).toHaveLength(8);
  });

  it('marks Sundays "Weekly off", other off dates "Day off", and a late login', () => {
    const s = buildSheet(report, new Date(2026, 10, 5));
    const by = (d: string) => s.days.find((x) => x.date === d)!;
    expect(by('2026-10-04').off).toBe('Weekly off');
    expect(by('2026-10-03').off).toBe('Day off');
    expect(by('2026-10-02').vs).toEqual({ text: '30m late', tone: 'late' });
    expect(by('2026-10-06').vs).toBeNull(); // leave: no login
    expect(s.totals).toMatchObject({ worked: 10, late: 1, early: 1, seconds: 28800 });
  });

  it('splits tasks into done / overdue / remaining', () => {
    const s = buildSheet(report);
    expect(s.tasks.done.map((r) => r.task_id)).toEqual(['t1', 't2']);
    expect(s.tasks.overdue.map((r) => r.task_id)).toEqual(['t3']);
    expect(s.tasks.remaining.map((r) => r.task_id)).toEqual(['t4']);
  });
});

describe('Monthly report sheet', () => {
  it('has the header, three numbered sections and the footer, and no charts', () => {
    render(<ReportView report={report} />);
    expect(screen.getByRole('heading', { level: 1, name: 'October 2026' })).toBeTruthy();
    expect(screen.getByText('Monthly report')).toBeTruthy();
    // the job title, not "Employee"; the whole month as the period; final months say nothing about progress
    expect(screen.getByText('Jr developer')).toBeTruthy();
    expect(screen.getByText('1 – 31 Oct 2026')).toBeTruthy();
    expect(screen.getByText('1 November 2026')).toBeTruthy();
    for (const name of ['Attendance summary', 'Daily login record', 'Task report']) expect(screen.getByRole('heading', { name })).toBeTruthy();
    expect(screen.getByText('Task Manager · Piixel')).toBeTruthy();
    expect(screen.getByText('Mia Member · October 2026')).toBeTruthy();
    expect(screen.getByText('In October, Mia was present 10 of 11 working days.')).toBeTruthy();
    expect(screen.queryAllByRole('img')).toHaveLength(0);
  });

  it('lists each day with its status, login, vs usual (late in red) and a month total row', () => {
    render(<ReportView report={report} />);
    const table = within(screen.getByLabelText('Login by day'));
    const rows = table.getAllByRole('row');
    expect(rows[1].textContent).toBe('1 OctThuPresent9:11 AM49m early');
    const late = table.getByText('30m late');
    expect(late.className).toContain('--tm-danger');
    expect(table.getAllByText('Weekly off').length).toBe(4);
    expect(table.getByText('Day off')).toBeTruthy();
    expect(table.getByText(/^Month to date · 7 present · 1 late$/)).toBeTruthy();
    expect(table.queryByText('Time tracked')).toBeNull(); // no time column, and none in the footer
    expect(table.queryByText(/tracked/)).toBeNull();
    expect(table.queryByText(/working days? remaining/)).toBeNull(); // the month is over
  });

  it('says it is in progress, and how many working days are still to come', () => {
    vi.setSystemTime(new Date(2026, 9, 8)); // Thu 8 Oct
    render(<ReportView report={{ ...report, state: 'in_progress' }} />);
    expect(screen.getByText('1 November 2026 · in progress')).toBeTruthy();
    expect(screen.getByText('9 – 31 Oct · 20 working days remaining')).toBeTruthy();
  });

  it('shows the section links and the totals in the left column', () => {
    render(<ReportView report={report} controls={<div>controls here</div>} />);
    expect(screen.getByText('controls here')).toBeTruthy();
    const nav = within(screen.getByRole('navigation', { name: 'In this report' }));
    expect(nav.getByRole('button', { name: /Overdue/ }).textContent).toContain('1');
    expect(nav.getByRole('button', { name: 'Attendance summary' }).textContent).toBe('1Attendance summary'); // numbered like the sections
    fireEvent.click(nav.getByRole('button', { name: /Daily login record/ })); // scrolls; nothing to throw
    const glance = within(screen.getByLabelText('At a glance'));
    expect(glance.getByText('Tasks done').nextSibling?.textContent).toBe('2 / 3');
  });

  it('has the task counts and three tables with a short description and a status pill', () => {
    const open = vi.fn();
    render(<ReportView report={report} onOpenTask={open} />);
    fireEvent.click(within(document.getElementById('report-tasks')!).getByRole('button', { name: /^Remaining/ })); // starts folded
    for (const label of ['Total', 'Done', 'Overdue', 'Remaining']) expect(screen.getAllByText(label).length).toBeGreaterThan(0);
    expect(screen.getByText('Early by 1d')).toBeTruthy();
    expect(screen.getByText('Late by 3d')).toBeTruthy();
    expect(screen.getByText('Overdue 4d')).toBeTruthy();
    expect(screen.getByText('Pending')).toBeTruthy();
    expect(screen.getByText(`${'x'.repeat(99)}…`)).toBeTruthy(); // ~100 characters
    expect(screen.getAllByText(/Acme › Copy/).length).toBe(2);
    fireEvent.click(screen.getByText('Launch reel'));
    expect(open).toHaveBeenCalledWith('t2');
  });

  it('shows changes and files as count chips that expand, and nothing when they are zero', () => {
    render(<ReportView report={report} />);
    const row = (t: string) => within(screen.getAllByText(t).map((e) => e.closest('tr')).find(Boolean)!);
    expect(row('Launch reel').queryAllByRole('button')).toHaveLength(0);
    fireEvent.click(row('Homepage redesign').getByRole('button', { name: '2 changes' }));
    expect(screen.getByText(/last resolved 6 Oct/)).toBeTruthy();
    fireEvent.click(row('Homepage redesign').getByRole('button', { name: '2 files' }));
    expect(screen.getByRole('link', { name: 'Prototype' }).getAttribute('href')).toBe('https://example.com/p');
    expect(screen.queryByRole('link', { name: 'homepage.fig' })).toBeNull();
  });

  it('adds the avg delay and changes to the totals for admins only', () => {
    const { rerender } = render(<ReportView report={report} />);
    expect(screen.queryByText('Avg delay')).toBeNull();
    rerender(<ReportView report={report} admin />);
    expect(screen.getByText('Avg delay').nextSibling?.textContent).toBe('3d');
    expect(screen.getByText('Changes').nextSibling?.textContent).toBe('3');
  });

  it('puts each section in its own card with a number, a subtitle and a summary chip', () => {
    render(<ReportView report={report} />);
    const card = (id: string) => within(document.getElementById(id)!);
    expect(card('report-attendance').getByText('01')).toBeTruthy();
    expect(card('report-attendance').getByText('7 / 26 present')).toBeTruthy();
    expect(card('report-login').getByText('02')).toBeTruthy();
    expect(card('report-login').getByText('Usual login 10:00 AM')).toBeTruthy();
    expect(card('report-tasks').getByText('03')).toBeTruthy();
    expect(card('report-tasks').getByText('2 / 4 done')).toBeTruthy();
  });

  it('folds the task report and each group; Done and Overdue start open, Remaining closed', () => {
    render(<ReportView report={report} />);
    expect(screen.getByText('Homepage redesign')).toBeTruthy(); // Done: open
    expect(screen.getByText('Old brief')).toBeTruthy(); // Overdue: open
    expect(screen.queryByText('Newsletter')).toBeNull(); // Remaining: closed
    const tasks = within(document.getElementById('report-tasks')!);
    fireEvent.click(tasks.getByRole('button', { name: /^Remaining/ }));
    expect(screen.getByText('Newsletter')).toBeTruthy();
    fireEvent.click(tasks.getByRole('button', { name: /^Done/ }));
    expect(screen.queryByText('Homepage redesign')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Collapse Task report' }));
    expect(screen.queryByText('Old brief')).toBeNull();
    expect(screen.queryByText('Newsletter')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Expand Task report' }));
    expect(screen.getByText('Old brief')).toBeTruthy();
  });

  it('opens a folded group when its link in "In this report" is used', () => {
    vi.useFakeTimers({ toFake: ['Date', 'setTimeout'] });
    vi.setSystemTime(new Date(2026, 10, 5));
    render(<ReportView report={report} />);
    expect(screen.queryByText('Newsletter')).toBeNull();
    fireEvent.click(within(screen.getByRole('navigation', { name: 'In this report' })).getByRole('button', { name: /Remaining/ }));
    expect(screen.getByText('Newsletter')).toBeTruthy();
  });

  it('says so when there are no tasks', () => {
    render(<ReportView report={{ ...report, rows: [] }} />);
    expect(screen.getByText('No tasks this month.')).toBeTruthy();
  });
});
