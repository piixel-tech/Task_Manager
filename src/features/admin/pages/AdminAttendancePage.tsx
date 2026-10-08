import React, { useEffect, useState } from 'react';
import { ShieldCheck, Download, Table, Users } from 'lucide-react';
import { attendanceService, userService } from '../../../services';
import type { AttendanceDay, User } from '../../../types';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../../../components/ui/Card';
import { Badge } from '../../../components/ui/Badge';
import { Button } from '../../../components/ui/Button';
import { Tabs } from '../../../components/ui/Tabs';
import { UserName } from '../../../components/ui/UserName';
import { formatDate, formatTime } from '../../../utils/time';
import { formatHours } from '../../../utils/format';
import { useAppStore } from '../../../store/useAppStore';

export const AdminAttendancePage: React.FC = () => {
  const { companyFilter, showToast } = useAppStore();
  const [attendanceLogs, setAttendanceLogs] = useState<AttendanceDay[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [activeTab, setActiveTab] = useState<'daily' | 'monthly'>('daily');

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

  const filteredUsers = users.filter((u) => {
    if (u.role === 'admin') return false;
    if (companyFilter === 'all') return true;
    return u.company === companyFilter;
  });

  const handleExportCSV = () => {
    try {
      const headers = ['Employee Name', 'Company', 'Job Title', 'Date', 'Status', 'First Punch In', 'Last Punch Out', 'Hours Worked'];
      const rows = filteredLogs.map((log) => {
        const u = userMap.get(log.userId);
        const firstSession = log.punchSessions[0];
        const lastSession = log.punchSessions[log.punchSessions.length - 1];
        return [
          `"${u?.name || log.userId}"`,
          `"${u?.company || ''}"`,
          `"${u?.jobTitle || ''}"`,
          `"${log.date}"`,
          `"${log.status}"`,
          `"${formatTime(firstSession?.punchIn)}"`,
          `"${formatTime(lastSession?.punchOut)}"`,
          `"${log.totalHours}"`
        ].join(',');
      });

      const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows].join('\n');
      const encodedUri = encodeURI(csvContent);
      const link = document.createElement('a');
      link.setAttribute('href', encodedUri);
      link.setAttribute('download', `attendance_report_${companyFilter}_2026.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      showToast('Attendance report exported as CSV!');
    } catch {
      showToast('Failed to export CSV report');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-[var(--tm-primary)]" />
            <h1 className="text-[27px] font-extrabold leading-tight tracking-[-0.03em] text-[var(--tm-ink)]">
              Attendance Reports & Audit Logs
            </h1>
          </div>
          <p className="text-[14px] leading-relaxed text-[var(--tm-ink-muted)] mt-1.5">
            Company-wide shift audits, monthly employee aggregations, and CSV exports.
          </p>
        </div>

        <Button
          variant="primary"
          size="sm"
          onClick={handleExportCSV}
          leftIcon={<Download className="w-4 h-4" />}
          className="bg-[var(--tm-success)] hover:bg-[var(--tm-success)]"
        >
          Export CSV Report
        </Button>
      </div>

      <Tabs
        activeTab={activeTab}
        onChange={(id) => setActiveTab(id as any)}
        tabs={[
          { id: 'daily', label: 'Daily Shift Audit Logs', icon: <Table className="w-4 h-4" /> },
          { id: 'monthly', label: 'Monthly Employee Totals', icon: <Users className="w-4 h-4" /> }
        ]}
      />

      {activeTab === 'daily' ? (
        <Card>
          <CardHeader>
            <CardTitle>Daily Attendance Table</CardTitle>
            <CardDescription>Filtered by company: <span className="font-bold text-[var(--tm-ink-soft)] capitalize">{companyFilter}</span></CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-[var(--tm-card-muted)] border-b border-[var(--tm-border)] text-xs font-semibold text-[var(--tm-ink-muted)] uppercase tracking-wider">
                  <tr>
                    <th className="px-6 py-3">Team Member</th>
                    <th className="px-6 py-3">Date</th>
                    <th className="px-6 py-3">Status</th>
                    <th className="px-6 py-3">First Punch In</th>
                    <th className="px-6 py-3">Last Punch Out</th>
                    <th className="px-6 py-3 text-right">Worked Hours</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--tm-border)]">
                  {filteredLogs.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-6 py-8 text-center text-[var(--tm-ink-muted)]">
                        No audit logs found for current filter.
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
                          <td className="px-6 py-4 text-right font-bold text-[var(--tm-primary)]">
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
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>Monthly Totals per Employee</CardTitle>
            <CardDescription>Aggregated present days, leaves, and hours worked</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-[var(--tm-card-muted)] border-b border-[var(--tm-border)] text-xs font-semibold text-[var(--tm-ink-muted)] uppercase tracking-wider">
                  <tr>
                    <th className="px-6 py-3">Employee</th>
                    <th className="px-6 py-3">Company</th>
                    <th className="px-6 py-3">Present Days</th>
                    <th className="px-6 py-3">Leave Days</th>
                    <th className="px-6 py-3 text-right">Total Hours Logged</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--tm-border)]">
                  {filteredUsers.map((emp) => {
                    const empLogs = attendanceLogs.filter((l) => l.userId === emp.id);
                    const presentDays = empLogs.filter((l) => l.status === 'present').length;
                    const leaveDays = empLogs.filter((l) => l.status === 'on_leave').length;
                    const totalHours = empLogs.reduce((acc, l) => acc + l.totalHours, 0);

                    return (
                      <tr key={emp.id} className="hover:bg-[var(--tm-card-muted)] transition-colors">
                        <td className="px-6 py-4">
                          <UserName user={emp} size="sm" showBadge={false} />
                        </td>
                        <td className="px-6 py-4">
                          <Badge variant={emp.company === 'piixel' ? 'piixel' : 'unwork'} size="sm">
                            {emp.company}
                          </Badge>
                        </td>
                        <td className="px-6 py-4 font-bold text-[var(--tm-success)]">
                          {presentDays} days
                        </td>
                        <td className="px-6 py-4 font-bold text-[var(--tm-danger)]">
                          {leaveDays} days
                        </td>
                        <td className="px-6 py-4 text-right font-black text-[var(--tm-primary)] text-base">
                          {formatHours(totalHours)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};
