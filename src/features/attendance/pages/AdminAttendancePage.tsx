import React, { useEffect, useMemo, useState } from 'react';
import {
  Calendar as CalendarIcon,
  ChevronLeft,
  ChevronRight,
  Download,
  ShieldCheck
} from 'lucide-react';
import { addDays, format, parseISO, subDays } from 'date-fns';
import { attendanceService, userService } from '../../../services';
import type { AttendanceDay, LiveEmployeeStatus, User } from '../../../types';
import { Card, CardContent, CardHeader, CardTitle } from '../../../components/ui/Card';
import { Badge } from '../../../components/ui/Badge';
import { Button } from '../../../components/ui/Button';
import { UserName } from '../../../components/ui/UserName';
import { UserAvatar } from '../../../components/ui/UserAvatar';
import { useAppStore } from '../../../store/useAppStore';
import {
  calculateDurationMinutes,
  formatDate,
  formatTime,
  getNowISO,
  getTodayDateString
} from '../../../utils/time';

function formatMinsToHoursMins(mins: number): string {
  if (mins <= 0) return '0h 0m';
  const h = Math.floor(mins / 60);
  const m = Math.floor(mins % 60);
  return `${h}h ${m}m`;
}

function formatLiveSeconds(totalSeconds: number): string {
  if (totalSeconds <= 0) return '0h 00m 00s';
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = Math.floor(totalSeconds % 60);
  return `${h}h ${m < 10 ? '0' : ''}${m}m ${s < 10 ? '0' : ''}${s}s`;
}

export const AdminAttendancePage: React.FC = () => {
  const { companyFilter, showToast } = useAppStore();
  const [users, setUsers] = useState<User[]>([]);
  const [attendanceLogs, setAttendanceLogs] = useState<AttendanceDay[]>([]);
  const [selectedDate, setSelectedDate] = useState<string>(getTodayDateString());
  const [nowISO, setNowISO] = useState(getNowISO());
  const [csvMenuOpen, setCsvMenuOpen] = useState(false);

  const todayStr = getTodayDateString();
  const isTodaySelected = selectedDate === todayStr;

  const loadData = async () => {
    const [allLogs, allUsers] = await Promise.all([
      attendanceService.getAttendance(),
      userService.getUsers()
    ]);
    setAttendanceLogs(allLogs);
    setUsers(allUsers.filter((u) => u.role !== 'admin'));
  };

  useEffect(() => {
    loadData();
    const interval = setInterval(() => {
      setNowISO(getNowISO());
      // Re-read attendance so status changes (End Day / Resume Day) show up live
      attendanceService.getAttendance().then(setAttendanceLogs).catch(() => {});
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  const filteredEmployees = useMemo(() => {
    const seen = new Set<string>();
    const result: User[] = [];

    for (const emp of users) {
      if (emp.role === 'admin') continue;
      if (!emp.active) continue;
      if (companyFilter !== 'all' && emp.company !== companyFilter) continue;
      if (seen.has(emp.id)) continue;

      seen.add(emp.id);
      result.push(emp);
    }
    return result;
  }, [users, companyFilter]);

  const logsForSelectedDate = useMemo(() => {
    return attendanceLogs.filter((l) => l.date === selectedDate);
  }, [attendanceLogs, selectedDate]);

  const handlePrevDay = () => {
    const parsed = parseISO(selectedDate);
    const prev = subDays(parsed, 1);
    setSelectedDate(format(prev, 'yyyy-MM-dd'));
  };

  const handleNextDay = () => {
    const parsed = parseISO(selectedDate);
    const next = addDays(parsed, 1);
    setSelectedDate(format(next, 'yyyy-MM-dd'));
  };

  // CSV Export Handler
  const exportCSV = (mode: 'day' | 'month') => {
    let recordsToExport: Array<{
      date: string;
      userId: string;
      user?: User;
      log?: AttendanceDay;
    }> = [];

    const selectedMonth = selectedDate.slice(0, 7); // e.g. "2026-10"

    if (mode === 'day') {
      recordsToExport = filteredEmployees.map((emp) => {
        const log = attendanceLogs.find((l) => l.userId === emp.id && l.date === selectedDate);
        return { date: selectedDate, userId: emp.id, user: emp, log };
      });
    } else {
      // Month export for all days in selected month with attendance records
      const logsInMonth = attendanceLogs.filter(
        (l) => l.date.startsWith(selectedMonth)
      );
      // Get all unique dates in the month logs
      const monthDates = Array.from(new Set(logsInMonth.map((l) => l.date))).sort();
      if (monthDates.length === 0) monthDates.push(selectedDate);

      monthDates.forEach((d) => {
        filteredEmployees.forEach((emp) => {
          const log = attendanceLogs.find((l) => l.userId === emp.id && l.date === d);
          if (log) {
            recordsToExport.push({ date: d, userId: emp.id, user: emp, log });
          }
        });
      });
    }

    const headers = [
      'Date',
      'Employee Name',
      'Job Title',
      'Status',
      'Punch In',
      'Punch Out',
      'Total Break',
      'Hours Worked'
    ];

    const rows = recordsToExport.map(({ date, user: emp, log }) => {
      const empName = emp?.name || 'Unknown';
      const jobTitle = emp?.jobTitle || 'Employee';

      if (!log) {
        return [
          `"${date}"`,
          `"${empName.replace(/"/g, '""')}"`,
          `"${jobTitle.replace(/"/g, '""')}"`,
          '"Not marked"',
          '"-"',
          '"-"',
          '"0m"',
          '"0h 0m"'
        ].join(',');
      }

      const firstSession = log.punchSessions[0];
      const lastSession = log.punchSessions[log.punchSessions.length - 1];
      const punchInStr = firstSession?.punchIn ? formatTime(firstSession.punchIn) : '-';
      const punchOutStr = lastSession?.punchOut ? formatTime(lastSession.punchOut) : '-';

      let totalBreakMins = 0;
      let totalWorkedMins = 0;

      for (const s of log.punchSessions) {
        const sessMins = calculateDurationMinutes(
          s.punchIn,
          s.punchOut || (log.date === todayStr ? nowISO : s.punchIn)
        );
        let bMins = 0;
        for (const b of s.breaks) {
          if (b.breakStart) {
            bMins += calculateDurationMinutes(
              b.breakStart,
              b.breakEnd || (s.punchOut ? s.punchOut : nowISO)
            );
          }
        }
        totalBreakMins += bMins;
        totalWorkedMins += Math.max(0, sessMins - bMins);
      }

      return [
        `"${date}"`,
        `"${empName.replace(/"/g, '""')}"`,
        `"${jobTitle.replace(/"/g, '""')}"`,
        `"${log.status}"`,
        `"${punchInStr}"`,
        `"${punchOutStr}"`,
        `"${formatMinsToHoursMins(totalBreakMins)}"`,
        `"${formatMinsToHoursMins(totalWorkedMins)}"`
      ].join(',');
    });

    const csvContent = [headers.join(','), ...rows].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');

    const filename =
      mode === 'day'
        ? `attendance-${selectedDate}.csv`
        : `attendance-${selectedMonth}.csv`;

    link.setAttribute('href', url);
    link.setAttribute('download', filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    setCsvMenuOpen(false);
    showToast(`Downloaded ${filename}`);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-[var(--tm-primary)]" />
            <h1 className="text-[27px] font-extrabold leading-tight tracking-[-0.03em] text-[var(--tm-ink)]">
              Attendance
            </h1>
          </div>
          <p className="text-[14px] leading-relaxed text-[var(--tm-ink-muted)] mt-1.5">
            Real-time employee monitoring, live status cards, and historical attendance logs.
          </p>
        </div>

        {/* Export CSV Dropdown */}
        <div className="relative">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setCsvMenuOpen((o) => !o)}
            leftIcon={<Download className="w-4 h-4" />}
          >
            Export CSV
          </Button>

          {csvMenuOpen && (
            <div className="absolute right-0 top-full mt-2 w-56 rounded-xl border border-[var(--tm-border)] bg-[var(--tm-card)] p-1.5 shadow-soft-lg z-50">
              <button
                onClick={() => exportCSV('day')}
                className="w-full text-left px-3 py-2 text-xs font-semibold text-[var(--tm-ink)] hover:bg-[var(--tm-bg-sunken)] rounded-lg transition-colors"
              >
                Export Date ({selectedDate})
              </button>
              <button
                onClick={() => exportCSV('month')}
                className="w-full text-left px-3 py-2 text-xs font-semibold text-[var(--tm-ink)] hover:bg-[var(--tm-bg-sunken)] rounded-lg transition-colors"
              >
                Export Month ({selectedDate.slice(0, 7)})
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Date Navigation Bar */}
      <Card>
        <CardContent className="p-4 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <button
              onClick={handlePrevDay}
              aria-label="Previous day"
              className="grid h-9 w-9 place-items-center rounded-lg border border-[var(--tm-border)] bg-[var(--tm-card)] text-[var(--tm-ink-soft)] hover:bg-[var(--tm-bg-sunken)] hover:text-[var(--tm-ink)] transition-colors"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>

            <div className="flex items-center gap-2 rounded-lg border border-[var(--tm-border)] bg-[var(--tm-card)] px-3 py-1.5">
              <CalendarIcon className="h-4 w-4 text-[var(--tm-primary)]" />
              <input
                type="date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                className="bg-transparent text-sm font-bold text-[var(--tm-ink)] focus:outline-none"
              />
            </div>

            <button
              onClick={handleNextDay}
              aria-label="Next day"
              className="grid h-9 w-9 place-items-center rounded-lg border border-[var(--tm-border)] bg-[var(--tm-card)] text-[var(--tm-ink-soft)] hover:bg-[var(--tm-bg-sunken)] hover:text-[var(--tm-ink)] transition-colors"
            >
              <ChevronRight className="h-4 w-4" />
            </button>

            {!isTodaySelected && (
              <Button size="sm" variant="ghost" onClick={() => setSelectedDate(todayStr)}>
                Today
              </Button>
            )}
          </div>

          <div className="text-sm font-bold text-[var(--tm-ink)]">
            {formatDate(selectedDate)}{' '}
            {isTodaySelected && (
              <span className="ml-2 inline-flex items-center gap-1.5 rounded-full bg-[var(--tm-success-bg)] px-2.5 py-0.5 text-[11px] font-extrabold text-[var(--tm-success)]">
                <span className="h-1.5 w-1.5 rounded-full bg-[var(--tm-success)] animate-pulse" />
                Today
              </span>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Live Employee Cards — ONLY shown if selected date is Today */}
      {isTodaySelected && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-extrabold text-[var(--tm-ink)] flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-full bg-[var(--tm-success)] animate-ping" />
              Live Status Today
            </h2>
            <span className="text-xs font-semibold text-[var(--tm-ink-muted)]">
              {filteredEmployees.length} employees
            </span>
          </div>

          {filteredEmployees.length === 0 ? (
            <Card>
              <CardContent className="p-8 text-center text-xs text-[var(--tm-ink-muted)]">
                No employees registered yet. Add team members in Team Directory.
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredEmployees.map((emp) => {
              const empAttendance = attendanceLogs.find(
                (a) => a.userId === emp.id && a.date === todayStr
              );

              let status: LiveEmployeeStatus = 'Not marked';
              let punchInTime: string | undefined = undefined;

              if (empAttendance) {
                if (empAttendance.status === 'on_leave') {
                  status = 'On leave';
                } else if (empAttendance.punchSessions.length > 0) {
                  punchInTime = empAttendance.punchSessions[0].punchIn;
                  const activeSession = empAttendance.punchSessions.find(
                    (s) => !s.punchOut
                  );
                  if (activeSession) {
                    const activeBreak = activeSession.breaks.find((b) => !b.breakEnd);
                    if (activeBreak) {
                      status = 'On break';
                    } else {
                      status = 'Working';
                    }
                  } else if (empAttendance.dayEndedAt) {
                    status = 'Done for the day';
                  } else {
                    status = 'Punched out';
                  }
                }
              }

              let workedSeconds = 0;
              if (empAttendance) {
                for (const s of empAttendance.punchSessions) {
                  if (s.punchIn) {
                    const sessMins = calculateDurationMinutes(s.punchIn, s.punchOut || nowISO);
                    let breakMins = 0;
                    for (const b of s.breaks) {
                      if (b.breakStart) {
                        breakMins += calculateDurationMinutes(
                          b.breakStart,
                          b.breakEnd || (s.punchOut ? s.punchOut : nowISO)
                        );
                      }
                    }
                    workedSeconds += Math.max(0, sessMins * 60 - breakMins * 60);
                  }
                }
              }

              const badgeVariants: Record<
                LiveEmployeeStatus,
                'success' | 'warning' | 'primary' | 'danger' | 'default'
              > = {
                Working: 'success',
                'On break': 'warning',
                'Done for the day': 'default',
                'Punched out': 'primary',
                'On leave': 'danger',
                'Not marked': 'default'
              };

              return (
                <Card key={emp.id} className="hover:border-[var(--tm-primary-soft)] transition-all">
                  <CardContent className="p-4 space-y-3">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <UserAvatar userId={emp.id} size="md" />
                        <div className="min-w-0">
                          <UserName user={emp} size="sm" showAvatar={false} showTitle={false} showBadge={false} />
                          <p className="text-[11.5px] text-[var(--tm-ink-muted)] truncate">
                            {emp.jobTitle}
                          </p>
                        </div>
                      </div>
                      <Badge variant={badgeVariants[status]} size="sm">
                        {status === 'Working' && (
                          <span className="w-1.5 h-1.5 rounded-full bg-[var(--tm-success)] animate-ping mr-1" />
                        )}
                        {status}
                      </Badge>
                    </div>

                    <div className="grid grid-cols-2 gap-2 pt-2 border-t border-[var(--tm-border)] text-xs">
                      <div className="bg-[var(--tm-card-muted)] p-2 rounded-lg border border-[var(--tm-border)]">
                        <div className="text-[10px] text-[var(--tm-ink-muted)] font-semibold uppercase">
                          Punch In
                        </div>
                        <div className="font-bold text-[var(--tm-ink)] mt-0.5">
                          {formatTime(punchInTime)}
                        </div>
                      </div>

                      <div className="bg-[var(--tm-primary-softer)] p-2 rounded-lg border border-[var(--tm-primary-soft)]">
                        <div className="text-[10px] text-[var(--tm-primary)] font-semibold uppercase">
                          Hours Today
                        </div>
                        <div className="font-bold text-[var(--tm-primary)] mt-0.5 tabular-nums">
                          {formatLiveSeconds(workedSeconds)}
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    )}

      {/* Logs Table for the Selected Date */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base font-extrabold">
            Attendance Logs for {formatDate(selectedDate)}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-[var(--tm-card-muted)] border-b border-[var(--tm-border)] text-xs font-semibold text-[var(--tm-ink-muted)] uppercase tracking-wider">
                <tr>
                  <th className="px-6 py-3">Employee</th>
                  <th className="px-6 py-3">Punch In</th>
                  <th className="px-6 py-3">Punch Out</th>
                  <th className="px-6 py-3">Each Break (start–end, duration)</th>
                  <th className="px-6 py-3">Total Break</th>
                  <th className="px-6 py-3">Total Hours</th>
                  <th className="px-6 py-3">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--tm-border)]">
                {filteredEmployees.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-6 py-8 text-center text-xs text-[var(--tm-ink-muted)]">
                      No employees registered yet. Add team members in Team Directory.
                    </td>
                  </tr>
                ) : (
                  filteredEmployees.map((emp) => {
                  const log = logsForSelectedDate.find((l) => l.userId === emp.id);

                  if (!log) {
                    return (
                      <tr key={emp.id} className="hover:bg-[var(--tm-card-muted)] transition-colors">
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-2.5">
                            <UserAvatar userId={emp.id} size="sm" />
                            <div>
                              <div className="font-bold text-[var(--tm-ink)] text-xs">
                                {emp.name}
                              </div>
                              <div className="text-[11px] text-[var(--tm-ink-muted)]">
                                {emp.jobTitle}
                              </div>
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4 text-[var(--tm-ink-muted)]">-</td>
                        <td className="px-6 py-4 text-[var(--tm-ink-muted)]">-</td>
                        <td className="px-6 py-4 text-[var(--tm-ink-muted)]">-</td>
                        <td className="px-6 py-4 text-[var(--tm-ink-muted)]">0m</td>
                        <td className="px-6 py-4 text-[var(--tm-ink-muted)] font-medium">0h 0m</td>
                        <td className="px-6 py-4">
                          <Badge variant="default" size="sm">
                            Not marked
                          </Badge>
                        </td>
                      </tr>
                    );
                  }

                  const firstSession = log.punchSessions[0];
                  const lastSession = log.punchSessions[log.punchSessions.length - 1];

                  // Detailed break list
                  const breakItems: string[] = [];
                  let totalBreakMins = 0;
                  let totalWorkedMins = 0;

                  for (const s of log.punchSessions) {
                    const sessMins = calculateDurationMinutes(
                      s.punchIn,
                      s.punchOut || (isTodaySelected ? nowISO : s.punchIn)
                    );
                    let sessBreakMins = 0;

                    for (const b of s.breaks) {
                      if (b.breakStart) {
                        const bEnd = b.breakEnd || (s.punchOut ? s.punchOut : nowISO);
                        const dur = calculateDurationMinutes(b.breakStart, bEnd);
                        sessBreakMins += dur;
                        breakItems.push(
                          `${formatTime(b.breakStart)} – ${
                            b.breakEnd ? formatTime(b.breakEnd) : 'Ongoing'
                          } (${dur}m)`
                        );
                      }
                    }
                    totalBreakMins += sessBreakMins;
                    totalWorkedMins += Math.max(0, sessMins - sessBreakMins);
                  }

                  return (
                    <tr key={emp.id} className="hover:bg-[var(--tm-card-muted)] transition-colors">
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2.5">
                          <UserAvatar userId={emp.id} size="sm" />
                          <div>
                            <div className="font-bold text-[var(--tm-ink)] text-xs">
                              {emp.name}
                            </div>
                            <div className="text-[11px] text-[var(--tm-ink-muted)]">
                              {emp.jobTitle}
                            </div>
                          </div>
                        </div>
                      </td>

                      <td className="px-6 py-4 text-[var(--tm-ink-soft)] font-medium">
                        {firstSession?.punchIn ? formatTime(firstSession.punchIn) : '-'}
                      </td>

                      <td className="px-6 py-4 text-[var(--tm-ink-soft)] font-medium">
                        {lastSession?.punchOut ? (
                          formatTime(lastSession.punchOut)
                        ) : firstSession ? (
                          <span className="text-[var(--tm-success)] font-bold">Working</span>
                        ) : (
                          '-'
                        )}
                      </td>

                      <td className="px-6 py-4 text-xs text-[var(--tm-ink-soft)]">
                        {breakItems.length === 0 ? (
                          '-'
                        ) : (
                          <div className="space-y-0.5">
                            {breakItems.map((bi, idx) => (
                              <div key={idx} className="font-mono text-[11.5px]">
                                {bi}
                              </div>
                            ))}
                          </div>
                        )}
                      </td>

                      <td className="px-6 py-4 font-semibold text-[var(--tm-ink-soft)]">
                        {formatMinsToHoursMins(totalBreakMins)}
                      </td>

                      <td className="px-6 py-4 font-bold text-[var(--tm-primary)]">
                        {formatMinsToHoursMins(totalWorkedMins)}
                      </td>

                      <td className="px-6 py-4">
                        <Badge
                          variant={
                            log.status === 'present'
                              ? 'success'
                              : log.status === 'on_leave'
                              ? 'danger'
                              : 'warning'
                          }
                          size="sm"
                        >
                          {log.status}
                        </Badge>
                      </td>
                    </tr>
                  );
                }))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
