import React, { useEffect, useState } from 'react';
import { Clock, ShieldCheck, Download } from 'lucide-react';
import { attendanceService, userService } from '../../../services';
import type { AttendanceDay, User } from '../../../types';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../../../components/ui/Card';
import { Badge } from '../../../components/ui/Badge';
import { Button } from '../../../components/ui/Button';
import { UserName } from '../../../components/ui/UserName';
import { formatDate, formatTime } from '../../../utils/time';
import { formatHours } from '../../../utils/format';
import { useAppStore } from '../../../store/useAppStore';

export const AdminAttendancePage: React.FC = () => {
  const { companyFilter } = useAppStore();
  const [attendanceLogs, setAttendanceLogs] = useState<AttendanceDay[]>([]);
  const [users, setUsers] = useState<User[]>([]);

  useEffect(() => {
    Promise.all([attendanceService.getAttendance(), userService.getUsers()]).then(
      ([logs, allUsers]) => {
        setAttendanceLogs(logs);
        setUsers(allUsers);
      }
    );
  }, []);

  const userMap = new Map(users.map((u) => [u.id, u]));

  const filteredLogs = attendanceLogs.filter((log) => {
    if (companyFilter === 'all') return true;
    const u = userMap.get(log.userId);
    return u?.company === companyFilter;
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-[var(--tm-primary)]" />
            <h1 className="text-[27px] font-extrabold leading-tight tracking-[-0.03em] text-[var(--tm-ink)]">
              Company-wide Attendance Audit
            </h1>
          </div>
          <p className="text-[14px] leading-relaxed text-[var(--tm-ink-muted)] mt-1.5">
            Real-time shift records, breaks, and logged work hours across Piixel and Unwork.
          </p>
        </div>
        <Button variant="outline" size="sm" leftIcon={<Download className="w-4 h-4" />}>
          Export CSV Report
        </Button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="bg-gradient-to-br from-white to-[var(--tm-primary-softer)]">
          <CardContent className="p-5 flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-[var(--tm-primary-soft)] text-[var(--tm-primary)] flex items-center justify-center font-bold">
              <Clock className="w-6 h-6" />
            </div>
            <div>
              <div className="text-xs font-semibold text-[var(--tm-ink-muted)] uppercase">Total Shift Days</div>
              <div className="text-2xl font-bold text-[var(--tm-ink)] mt-0.5">{filteredLogs.length}</div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-white to-[var(--tm-success-bg)]">
          <CardContent className="p-5 flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-[var(--tm-success-bg)] text-[var(--tm-success)] flex items-center justify-center font-bold">
              ✓
            </div>
            <div>
              <div className="text-xs font-semibold text-[var(--tm-ink-muted)] uppercase">Active Present Today</div>
              <div className="text-2xl font-bold text-[var(--tm-ink)] mt-0.5">
                {filteredLogs.filter((l) => l.status === 'present').length}
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-white to-[var(--tm-primary-softer)]">
          <CardContent className="p-5 flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-[var(--tm-primary-soft)] text-[var(--tm-primary)] flex items-center justify-center font-bold">
              ∑
            </div>
            <div>
              <div className="text-xs font-semibold text-[var(--tm-ink-muted)] uppercase">Total Hours Logged</div>
              <div className="text-2xl font-bold text-[var(--tm-ink)] mt-0.5">
                {formatHours(filteredLogs.reduce((acc, l) => acc + l.totalHours, 0))}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Attendance Audit Logs</CardTitle>
              <CardDescription>Filtered by company: <span className="font-semibold text-[var(--tm-ink-soft)] capitalize">{companyFilter}</span></CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-[var(--tm-card-muted)] border-b border-[var(--tm-border)] text-xs font-semibold text-[var(--tm-ink-muted)] uppercase tracking-wider">
                <tr>
                  <th className="px-6 py-3">Team Member</th>
                  <th className="px-6 py-3">Date</th>
                  <th className="px-6 py-3">Status</th>
                  <th className="px-6 py-3">Punch In</th>
                  <th className="px-6 py-3">Punch Out</th>
                  <th className="px-6 py-3">Hours</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--tm-border)]">
                {filteredLogs.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-6 py-8 text-center text-[var(--tm-ink-muted)]">
                      No attendance audit records matching current filter.
                    </td>
                  </tr>
                ) : (
                  filteredLogs.map((log) => {
                    const u = userMap.get(log.userId);
                    const firstSession = log.punchSessions[0];
                    const lastSession = log.punchSessions[log.punchSessions.length - 1];

                    return (
                      <tr key={log.id} className="hover:bg-[var(--tm-card-muted)] transition-colors">
                        <td className="px-6 py-4">
                          <UserName user={u} userId={log.userId} size="sm" showBadge={true} />
                        </td>
                        <td className="px-6 py-4 text-[var(--tm-ink-soft)] font-medium">
                          {formatDate(log.date)}
                        </td>
                        <td className="px-6 py-4">
                          <Badge variant={log.status === 'present' ? 'success' : 'warning'} size="sm">
                            {log.status}
                          </Badge>
                        </td>
                        <td className="px-6 py-4 text-[var(--tm-ink-soft)]">
                          {formatTime(firstSession?.punchIn)}
                        </td>
                        <td className="px-6 py-4 text-[var(--tm-ink-soft)]">
                          {formatTime(lastSession?.punchOut)}
                        </td>
                        <td className="px-6 py-4 font-bold text-[var(--tm-primary)]">
                          {formatHours(log.totalHours)}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
